"""Build each street edge and each worked block exactly once, so neighbouring squares agree.

Stage 3 showed that a 40 m margin cannot make two squares agree: a block crossing a square's edge is
cut at edge+40 m in one square and edge-40 m in the other, and everything that looks across the
whole block (the region growing, the back lines, the caps, the sliver absorption) then runs on two
different blocks. Measured on the village square and its eastern neighbour: 36 unmatched boundaries
at 40 m, 7 at 80 m, 10 at 160 m. No margin fixes it, because the thing being compared is itself
built twice.

So a thing is built once. **Every street edge and every worked block is owned by exactly one square
and built there, with a data window sized to the thing rather than to the square.** A square's
partition is then assembled from pieces its neighbours also hold, and a shared edge agrees because
it is the same geometry, not because two builds happened to match.

Three passes, run in order, each a process pool over the squares, with small JSON files between
them in `<out>/<ti>_<tj>/`:

1. `pass_streets` - the street graph is built once for the whole map (one `street_graph` call over
   every way, so no way is split at a square's edge), each edge is owned by the square holding its
   midpoint, and the owner fits it on its full length and writes `corridors.json`.
2. `pass_blocks` - the worked block is a connected piece of `block ∩ buffer(all buildings,
   REACH_GROW)`, the only ground where a plot can exist; open land beyond it is open. It is owned by
   the square holding its representative point, divided by `make_plots` as it is now, and written to
   `blocks.json`.
3. `pass_assemble` - the square gathers the corridors and worked blocks overlapping it from its own
   folder and its eight neighbours', takes the rest as open land cut by evidence, clips to the
   square, and runs the surface, openings, metrics and checks unchanged.

Ownership is by geometry only (midpoint, representative point), never by order of discovery, and
every list written is sorted by a geometric key, so the result does not depend on how many processes
ran or in what order.
"""
import collections
import glob
import json
import os
import time

import numpy as np
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from . import MARGIN, Q, lap, zone_at
from .buildings import clean_buildings
from .corridors import PATHS, PATHW, REACH, fit_cross_section, offset_poly, side_reach
from .data import Data, box_of, neighbours, owner_of, squares_over
from .graph import street_graph
from .plots import (EXTEND, GARDEN, OPEN_KINDS, REACH_GROW, Parcels, building_axes,
                    classify_edges, front_normals, join_evidence, make_plots)

FILTER_SPAN = 12.0      # metres: the corridor fit's median filter reaches this far along an edge,
                        # so a window for an edge is grown by it as well as by REACH


def map_bbox():
    """The whole map's data box (W, S, E, N in map metres), a little wider than the field's circle
    so the outermost square's margin is covered."""
    from . import A

    (fcx, fcy), R = A.field_centre, A.half
    return (fcx - R - MARGIN, fcy - R - MARGIN, fcx + R + MARGIN, fcy + R + MARGIN)


def _line_json(line, dec=3):
    return [[round(x, dec), round(y, dec)] for x, y in line.coords]


def _poly_json(g, dec=3):
    if g.is_empty or g.geom_type != "Polygon":
        return None
    return [[round(x, dec), round(y, dec)] for x, y in g.exterior.coords]


def _poly_json_valid(g, dec=3):
    """A polygon's exterior rounded to the file's precision, *and* made valid at that precision.

    Both steps are needed and in this order. Rounding the coordinates of a thin or nearly-closed ring
    can make it self-intersect, and a self-intersecting outline fails GEOS later with "side location
    conflict" wherever it is used (measured: 4 of 6,702 worked blocks broke after rounding, having
    been valid before it). `buffer(0)` repairs the ring at the precision that is actually written, so
    what is read back is what was measured."""
    a = _poly_json(g, dec)
    if a is None:
        return None
    q = Polygon(a)
    if q.is_valid:
        return a
    q = q.buffer(0)
    best = max((q.geoms if hasattr(q, "geoms") else [q]), key=lambda p: p.area)
    return _poly_json(best, dec) if best.geom_type == "Polygon" else a


def _poly_from(a):
    return Polygon(a) if a else Polygon()


def _label_json(lab):
    """A face label as JSON: ("plot", 12) -> ["plot", 12], ("open",) -> ["open"].

    The labels are tuples (a kind and, for a plot, its building index) and the assemble pass has to
    read them back exactly, so they are written as they are rather than as their repr."""
    return list(lab)


def _label_from(a):
    return tuple(a)


def _geom_key(g, dec=3):
    """A geometry's sort key: its bounding box, rounded. Every list a pass writes is sorted by a key
    like this, so the result does not depend on how many processes ran or in what order."""
    x0, y0, x1, y1 = g.bounds
    return [round(x0, dec), round(y0, dec), round(x1, dec), round(y1, dec)]


def square_of_point(p):
    """Which square holds a point, by geometry only."""
    from . import Q
    size = Q.dx * Q.cells
    return int((p.x - Q.x0) // size), int((p.y - Q.y0) // size)


def blocks_path(out):
    return os.path.join(out, "blocks.json")


def cleaned_path(out):
    return os.path.join(out, "cleaned-buildings.json")


def write_cleaned(out, buildings):
    """The cleaned footprints of the whole map, written once.

    `clean_buildings` is a set operation - it snaps footprints within CLOSE (0.6 m) of each other and
    removes the overlaps that creates, later footprints giving way to earlier ones - so a building's
    answer can depend on which other buildings are in the set. Cleaning it once for the whole map and
    handing the result to every worker is therefore the only way two squares are certain to see the
    same footprint. (Measured, it happens not to matter for the one window tried: 0 of 3,603
    buildings cleaned differently when the window grew by 30 m. It is cheap to be exact - 1.0 s for
    the whole map - and the design should not rest on a sample of one.)"""
    cleaned, closed = clean_buildings(buildings)
    cleaned.sort(key=_geom_key)
    json.dump([dict(b=_geom_key(g), xy=_poly_json(g)) for g in cleaned], open(cleaned_path(out), "w"))
    return cleaned, closed


def read_cleaned(out, win=None):
    """The cleaned footprints, all of them or only those touching a window.

    Returned with the index each footprint has in the whole written list, which is its **global**
    building index - the same number in every process and every square. A plot carries one of these
    (pass 2 writes it, pass 3 reads it), and a house has to be the same house wherever it is read, so
    the index is into the file rather than into whatever window happens to be in hand."""
    rows = json.load(open(cleaned_path(out)))
    if win is None:
        return [(i, Polygon(r["xy"])) for i, r in enumerate(rows)]
    x0, y0, x1, y1 = win
    return [(i, Polygon(r["xy"])) for i, r in enumerate(rows)
            if r["b"][2] >= x0 and r["b"][0] <= x1 and r["b"][3] >= y0 and r["b"][1] <= y1]


# ---- pass 1: streets, once ----------------------------------------------------------------------

def graph_path(out):
    return os.path.join(out, "graph.json")


def build_graph(out, raw, log=print):
    """The street graph, built once for the whole map and written to `<out>/graph.json`.

    Built once, serially, because it is a single object: noded and chained over every way in the
    map, so no way is split where two squares meet. It is written to a file rather than kept in a
    module global because this Mac starts pool workers by **spawn**, which re-imports the module, so
    a global set in the parent would be empty in every worker. A file is also what the plan asks for:
    a pass reads the files of the pass before it, not another process's memory."""
    bb = map_bbox()
    D = Data(raw, bb, log=log)
    roads = []
    for g, p in D.lines_near(bb, "osm-roads"):
        g = g.intersection(box(*bb))
        for l in (g.geoms if hasattr(g, "geoms") else [g]):
            if l.geom_type == "LineString" and l.length > 0.5:
                roads.append((l, p))
    log(f"  {len(roads)} road pieces over the whole map")
    edges = street_graph(roads, bb, log=log)
    # a stable id and order: sorted by the line's own bounding box, a geometric key, so the same
    # edge keeps the same id however the ways were read and however many processes ran
    edges.sort(key=lambda e: (round(e["line"].bounds[0], 3), round(e["line"].bounds[1], 3),
                              round(e["line"].bounds[2], 3), round(e["line"].bounds[3], 3),
                              e["cls"], e.get("name", "")))
    # the id is the edge's place in that sorted order, and the same ids go to the file and back to
    # the caller, so the owner and the other passes agree on what "edge 18729" is
    for i, e in enumerate(edges):
        e["id"] = i
    json.dump([dict(id=e["id"], cls=e["cls"], name=e.get("name", ""), line=_line_json(e["line"]),
                    obs=[[float(t0), float(t1), tags] for t0, t1, tags in e["obs"]])
               for e in edges],
              open(graph_path(out), "w"))
    log(f"  {len(edges)} street graph edges -> {os.path.basename(graph_path(out))}")
    return edges


def read_graph(out):
    """The street graph one of the passes reads back, as the same dicts `street_graph` returns."""
    return [dict(id=r["id"], cls=r["cls"], name=r["name"], line=LineString(r["line"]),
                 obs=[(t0, t1, tags) for t0, t1, tags in r["obs"]])
            for r in json.load(open(graph_path(out)))]


def pass_streets(out, raw, jobs=4, log=print):
    """Fit each street edge once, in the square that owns its midpoint, and write
    `<out>/<ti>_<tj>/corridors.json`.

    The graph is built once (`build_graph`); the fitting is the expensive part and runs in a pool,
    one task per owning square, each reading the raw data for the bbox of the edges it owns. Nothing
    about an edge's fit depends on which square built it - that is what
    `test_an_edges_fit_is_the_same_from_two_windows` holds."""
    edges = build_graph(out, raw, log=log)
    bb = map_bbox()
    owned = collections.defaultdict(list)
    for e in edges:
        owned[owner_of(e["line"].bounds)].append(e["id"])
    tasks = [(ti, tj, sorted(ids), out, raw, bb) for (ti, tj), ids in sorted(owned.items())]
    log(f"  pass 1: {len(tasks)} squares own edges")
    return _run_pool(_fit_square_edges, tasks, jobs, log, "pass 1")


def edge_window(lines):
    """The window to fit a set of edges from: their combined bounding box grown by everything the fit
    looks out by - REACH for what stands beside the street, and FILTER_SPAN for the median filter
    that runs along it. Sized to the things, not to the square, so a long street loads more and a
    short one less, and nothing depends on which square is asking."""
    bounds = unary_union(lines).bounds
    return (bounds[0] - REACH - FILTER_SPAN, bounds[1] - REACH - FILTER_SPAN,
            bounds[2] + REACH + FILTER_SPAN, bounds[3] + REACH + FILTER_SPAN)


def obstacles_for(D, win):
    """The things the corridor fit measures against in a window: every building, and the evidence
    lines (mapped barriers and lidar wall runs) joined as the fit and the plots join them.

    Read from the window's own data and nothing else, so fitting the same edge from two windows that
    both contain it gives the same answer - which is the pass's test."""
    bpolys, _closed = clean_buildings([g for g, p in D.polys_near(win, "building")])
    barriers = [(g, p["class"]) for g, p in D.lines_near(win, "infrastructure")
                if p.get("subtype") == "barrier"
                and p.get("class") in ("fence", "wall", "hedge", "retaining_wall")]
    ridges = D.ridges_near(win)
    evidence = [(g, "wall" if k in ("wall", "retaining_wall") else k) for g, k in barriers]
    evidence += [(g, {"fence": "fence", "hedge": "hedge"}.get(c, "wall")) for g, c, h in ridges]
    by_kind = collections.defaultdict(list)
    for g, k in evidence:
        by_kind[k].append(g)
    evidence = [(l, k) for k, gs in by_kind.items() for l in join_evidence(gs)]
    obstacles = [g for g, _ in evidence] + bpolys
    return bpolys, evidence, obstacles, STRtree(obstacles)


def fit_edge(e, otree, obstacles):
    """One street or path edge fitted on its full length: its cross-sections and the three polygons
    (carriageway, left pavement, right pavement). A pure function of the edge and what stands beside
    it, so the same edge fitted from any window that contains it gives the same result."""
    if e["cls"] in PATHS:
        w = PATHW.get(e["cls"], 1.8)
        ts = np.linspace(0, e["line"].length, max(2, int(e["line"].length / 2) + 1))
        car = offset_poly(e["line"], ts, np.full(len(ts), w / 2), np.full(len(ts), w / 2))
        return dict(id=e["id"], cls=e["cls"], name=e.get("name", ""), path=True,
                    line=_line_json(e["line"]),
                    sections=[[0.0, float(e["line"].length), [float(w), 0.0, 0.0]]],
                    obs=[[float(t0), float(t1), tags] for t0, t1, tags in e["obs"]],
                    car=_poly_json(car), pl=None, pr=None)
    ts, L, R = side_reach(e["line"], otree, obstacles)
    stretches, sec = fit_cross_section(e, ts, L, R)
    car = offset_poly(e["line"], ts, sec[:, 0] / 2, sec[:, 0] / 2)
    pl = offset_poly(e["line"], ts, sec[:, 0] / 2 + sec[:, 1], -sec[:, 0] / 2)
    pr = offset_poly(e["line"], ts, -sec[:, 0] / 2, sec[:, 0] / 2 + sec[:, 2])
    return dict(id=e["id"], cls=e["cls"], name=e.get("name", ""), path=False,
                line=_line_json(e["line"]),
                sections=[[float(t0), float(t1), [float(v) for v in vs]] for t0, t1, vs in stretches],
                obs=[[float(t0), float(t1), tags] for t0, t1, tags in e["obs"]],
                car=_poly_json(car), pl=_poly_json(pl), pr=_poly_json(pr))


def _fit_square_edges(ti, tj, ids, out, raw, bb):
    """Fit the edges this square owns. One task of pass 1."""
    edges = read_graph(out)
    win = edge_window([edges[i]["line"] for i in ids])
    D = Data(raw, bb, log=lambda *_: None)
    _bpolys, _evidence, obstacles, otree = obstacles_for(D, win)

    out_dir = os.path.join(out, f"{ti}_{tj}")
    os.makedirs(out_dir, exist_ok=True)
    rows = [fit_edge(edges[i], otree, obstacles) for i in ids]
    json.dump(rows, open(os.path.join(out_dir, "corridors.json"), "w"))
    return ti, tj, len(rows)


# ---- pass 2: blocks, once ------------------------------------------------------------------------

BLOCK_CAP = 2000.0      # metres across: a worked block bigger than this is reported (plan, stage 3b)
MIN_BLOCK = 5.0         # m^2: the plan's own floor for ground worth calling a worked block, the
                        # same threshold the build uses for a block (`build`: "area > 5")


def read_corridors(out):
    """Every square's corridors.json, as (edge dict, carriageway, pl, pr) for the whole map.

    A pass may read the files of the pass before it, which is what this is: pass 2 needs every
    corridor to know where the blocks are, and pass 3 reads them the same way. The polygons are
    made valid on the way in (a handful of offset polygons are not), because an invalid one makes the
    union of them all fail with a topology error."""
    rows = []
    for f in sorted(glob.glob(os.path.join(out, "*", "corridors.json"))):
        for r in json.load(open(f)):
            e = dict(id=r["id"], cls=r["cls"], name=r["name"], path=r["path"],
                     line=LineString(r["line"]),
                     sections=[(t0, t1, vs) for t0, t1, vs in r["sections"]],
                     obs=[(t0, t1, tags) for t0, t1, tags in r["obs"]])
            polys = []
            for key in ("car", "pl", "pr"):
                a = r.get(key)
                if not a:
                    polys.append(Polygon())
                    continue
                g = Polygon(a)
                if not g.is_valid:
                    g = g.buffer(0)
                polys.append(g if g.geom_type == "Polygon" else unary_union(g))
            rows.append((e, polys[0], polys[1], polys[2]))
    return rows


def _parts(g):
    """A geometry's polygon parts, or itself if it is already one."""
    if g.is_empty:
        return []
    return list(g.geoms) if hasattr(g, "geoms") else [g]


def worked_pieces(corridors, buildings, bb, cap=BLOCK_CAP, log=print):
    """The worked blocks of the whole map: the connected pieces of
    `block ∩ buffer(all buildings, REACH_GROW)`, where block is the complement of the corridors and
    the buildings. Returns [(piece, over_cap)] with `over_cap` set where a piece is wider than cap,
    sorted by a geometric key.

    The definition is the plan's, used as written, and the cost is kept down by working one block at
    a time: a building more than REACH_GROW from a block cannot reach any point of that block with
    its buffer, so buffering only the buildings within REACH_GROW of each block gives the same
    pieces. Buffering all 46,780 buildings at once peaked at 6.8 GB, which is 7 GB for one step of a
    city run; per block it is 1.3 GB. Clustering the buildings first, the obvious alternative,
    barely helped, because Bath's buildings are one cluster of 38,798: it is the *block* that
    fragments the city, so the block is what the work is scoped by.

    The `block ∩` term is load-bearing. Without it every piece of ground is produced once per block
    whose buildings reach it, and the city comes out with 30 times the worked blocks it has
    (measured: 195,471 pieces and 420 km² against 6,725 and 39.9 km²). The blocks themselves come
    from one union of the corridors and one of the buildings, neither of which is the expensive part
    (752 MB and 782 MB)."""
    corner = [g for _e, car, pl, pr in corridors for g in (car, pl, pr) if not g.is_empty]
    cor_union = unary_union(corner)
    bld_union = unary_union(buildings)
    W0 = box(*bb).difference(cor_union).difference(bld_union)
    blocks = [p for p in _parts(W0) if p.area > MIN_BLOCK]
    log(f"  pass 2: {len(blocks)} blocks")

    btree = STRtree(buildings)
    ctree = STRtree(corner)
    out = []
    for blk in blocks:
        # only the buildings that can reach this block, and the corridors that can carve it
        near = blk.buffer(REACH_GROW)
        nb = [buildings[int(k)] for k in np.atleast_1d(btree.query(near))]
        if not nb:
            continue                            # no building near: no worked block, just open land
        # The plan's definition, kept exactly: `block ∩ buffer(buildings, REACH_GROW)`, then the
        # corridors and buildings taken out. The intersection with the block is the term that keeps
        # each piece in its own block - without it every piece of ground is produced once per block
        # whose buildings reach it, and the city comes out with 30 times the worked blocks it has
        # (measured: 195,471 pieces and 420 km2 against 6,691 and 39.98 km2).
        bunion = unary_union(nb)
        grown = bunion.buffer(REACH_GROW).intersection(blk)
        nc = [corner[int(k)] for k in np.atleast_1d(ctree.query(grown))]
        W = grown.difference(unary_union(nc) if nc else Polygon()).difference(bunion)
        pieces = [p for p in _parts(W) if p.area > MIN_BLOCK]
        for p in pieces:
            # A worked block's outline must be a valid polygon before it is divided or written:
            # GEOS's `difference` can leave a piece whose ring self-intersects, and rounding its
            # coordinates to the file's precision can do the same (measured: 51 of 6,736 pieces,
            # which failed 19 squares with "side location conflict"). `buffer(0)` is the repair GEOS
            # itself recommends; it fixes the ring without moving the ground.
            if not p.is_valid:
                p = p.buffer(0)
            for q in _parts(p):
                if q.geom_type != "Polygon" or q.is_empty or q.area <= MIN_BLOCK:
                    continue
                span = max(q.bounds[2] - q.bounds[0], q.bounds[3] - q.bounds[1])
                out.append((q, span > cap))
    n_over = sum(1 for _p, over in out if over)
    if n_over:
        log(f"  pass 2: {n_over} worked blocks are over the {cap:.0f} m cap and are still built")
    return sorted(out, key=lambda t: (round(t[0].bounds[0], 3), round(t[0].bounds[1], 3),
                                      round(t[0].bounds[2], 3), round(t[0].bounds[3], 3)))


def block_window(piece, margin=0.0):
    """The window to divide one worked block from: the piece's own bounding box grown by REACH_GROW
    and the margin.

    Sized to the *piece*, not to the parent block, which is what keeps a block in open country free
    and a city block bounded. It is enough because no plot can reach the piece's outer edge: that
    edge is REACH_GROW (60 m) from every building, and a plot's faces lie within GARDEN + FACE_PAD
    (30.5 m) of their house, so cutting there changes no plot. The window covers everything
    `make_plots` looks at - the buildings within SEED_REACH of the piece, the streets front_normals
    searches (50 m), the evidence, the parcels and the land use near it."""
    x0, y0, x1, y1 = piece.bounds
    pad = REACH_GROW + margin
    return (x0 - pad, y0 - pad, x1 + pad, y1 + pad)


def pass_blocks(out, raw, jobs=4, log=print):
    """Divide each worked block once, in the square owning its representative point, and write
    `<out>/<ti>_<tj>/blocks.json`.

    The worked pieces themselves are computed once for the whole map (`worked_pieces`) from pass 1's
    corridors and the whole building set, so the outline is the same whichever square divides it -
    which is what `test_a_worked_blocks_outline_is_the_same_from_two_windows` holds. What is pooled
    is the dividing, one task per owning square, each with a window sized to its own pieces."""
    corridors = read_corridors(out)
    bb = map_bbox()
    D = Data(raw, bb, log=lambda *_: None)
    bld_all = [g for g, p in D.polys_near(bb, "building")]
    # cleaned once for the whole map, so every square divides its blocks with the same footprints
    cleaned, closed = write_cleaned(out, bld_all)
    log(f"  pass 2: {len(cleaned)} cleaned footprints ({closed} sliver gaps closed)")
    del D
    t = time.time()
    pieces = worked_pieces(corridors, cleaned, bb, log=log)
    log(f"  pass 2: {len(pieces)} worked blocks in {time.time() - t:.0f}s")

    # the worked pieces themselves are written once, so a task re-reads the outline it divides rather
    # than recomputing it, and so the "same outline from two windows" test has a file to read
    # the outline is made valid at the file's precision as it is written, because it is read back
    # and divided: a self-intersecting ring there fails GEOS wherever it is used
    json.dump([dict(key=_geom_key(p), over=over, xy=_poly_json_valid(p))
               for p, over in pieces],
              open(blocks_path(out), "w"))

    # Ownership by the piece's representative point, as the plan says. Not its bounding box's
    # midpoint: an L-shaped worked block's midpoint can fall in the notch, in another piece or even
    # outside the block, so the two are not interchangeable.
    owned = collections.defaultdict(list)
    for n, (p, over) in enumerate(pieces):
        owned[square_of_point(p.representative_point())].append(n)
    tasks = [(ti, tj, sorted(ids), out, raw, bb) for (ti, tj), ids in sorted(owned.items())]
    log(f"  pass 2: {len(tasks)} squares own worked blocks")
    return _run_pool(_fit_square_blocks, tasks, jobs, log, "pass 2")


def _fit_square_blocks(ti, tj, ids, out, raw, bb):
    """Divide the worked blocks this square owns. One task of pass 2."""
    whole = [Polygon(r["xy"]) for r in json.load(open(blocks_path(out)))]
    mypieces = [whole[i] for i in ids]
    corridors = read_corridors(out)
    pieces_by_edge = {(e["id"]): (e, car, pl, pr) for e, car, pl, pr in corridors}

    # the window: the pieces' own bounding box grown by REACH_GROW and the margin. The parent block
    # is never loaded - the worked piece is passed to make_plots as the block, which is sound because
    # no plot can reach the piece's outer edge: that edge is REACH_GROW from every building and a
    # plot's faces lie within GARDEN + FACE_PAD of their house.
    x0 = min(p.bounds[0] for p in mypieces) - REACH_GROW - MARGIN
    y0 = min(p.bounds[1] for p in mypieces) - REACH_GROW - MARGIN
    x1 = max(p.bounds[2] for p in mypieces) + REACH_GROW + MARGIN
    y1 = max(p.bounds[3] for p in mypieces) + REACH_GROW + MARGIN
    win = (x0, y0, x1, y1)

    D = Data(raw, bb, log=lambda *_: None)
    # the cleaned footprints of the whole map, filtered to this window: the same set every square
    # divides with, so a footprint near a window's edge cannot be cleaned differently here. The
    # cleaning itself is done once, in `pass_blocks`, and its count reported there.
    cleaned_in_window = read_cleaned(out, win)
    bpolys = [g for _i, g in cleaned_in_window]
    bunion = unary_union(bpolys)
    barriers = [(g, p["class"]) for g, p in D.lines_near(win, "infrastructure")
                if p.get("subtype") == "barrier"
                and p.get("class") in ("fence", "wall", "hedge", "retaining_wall")]
    ridges = D.ridges_near(win)
    evidence = [(g, "wall" if k in ("wall", "retaining_wall") else k) for g, k in barriers]
    evidence += [(g, {"fence": "fence", "hedge": "hedge"}.get(c, "wall")) for g, c, h in ridges]
    by_kind = collections.defaultdict(list)
    for g, k in evidence:
        by_kind[k].append(g)
    evidence = [(l, k) for k, gs in by_kind.items() for l in join_evidence(gs)]
    ev_lines = [g for g, _ in evidence]
    ev_tree = STRtree(ev_lines)
    landuse = [(g, p.get("class")) for g, p in D.polys_near(win, "land_use")]
    parcels = Parcels([g for g, p in D.polys_near(win, "parcels")])

    # what make_plots looks at beyond its own block: the streets it faces houses to, the axes and
    # fronts it divides by, the parcels it caps plots to
    street_lines = [e["line"] for e, car, pl, pr in corridors if not e["path"]]
    street_tree = STRtree(street_lines) if street_lines else None
    # The global index of each footprint, so a plot's building index means the same house in every
    # square and every process. `make_plots` is handed buildings as (index, polygon) and takes its
    # indices from those, not from their place in this window's list.
    buildings = list(cleaned_in_window)
    geoms = [g for _i, g in buildings]
    axes = {i: a for (i, _g), a in zip(buildings, building_axes(geoms))}
    fronts = front_normals(geoms, [axes[i] for i, _g in buildings], street_tree, street_lines)
    # `make_plots` indexes buildings, their axes and their fronts by the *building index it was
    # given*, which here is the global one. `front_normals` numbers its answer from 0 over the list
    # it was handed, so its keys are translated to the global indices rather than left as they came.
    fronts = {i: fronts[n] for n, (i, _g) in enumerate(buildings)}

    out_dir = os.path.join(out, f"{ti}_{tj}")
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    for n, piece in zip(ids, mypieces):
        cx, cy = piece.representative_point().x, piece.representative_point().y
        p, e = make_plots(piece, buildings, ev_lines, ev_tree, zone_at(cx, cy), axes, fronts,
                          bunion, box(*bb), parcels=parcels, log=lambda *_: None)
        rows.append(dict(
            n=n, key=_geom_key(piece), xy=_poly_json(piece),
            plots=[dict(kind=k, bi=b, xy=_poly_json(g)) for g, k, b in p],
            edges=[dict(a=_geom_key(s), xy=_line_json(s), la=_label_json(a1), lb=_label_json(b1))
                   for s, a1, b1 in e]))
    json.dump(rows, open(os.path.join(out_dir, "blocks.json"), "w"))
    return ti, tj, len(rows)


def _run_pool(fn, tasks, jobs, log, what):
    """Run the pass's tasks in a process pool, printing each as it lands. A task that fails is
    reported and the pass carries on: one bad square should not lose the other 130.

    `fn` must be a module-level function: this Mac starts workers by **spawn**, which re-runs
    `__main__` in the child and pickles the function by name, so a closure or a lambda would not
    start at all (and running a pass from `python3 -` fails outright, because the child tries to
    re-run `<stdin>`, which does not exist). Both are why a pass is launched from a real file."""
    from concurrent.futures import ProcessPoolExecutor
    done, failed = [], []
    with ProcessPoolExecutor(jobs) as pool:
        futures = [pool.submit(fn, *t) for t in tasks]
        for f, t in zip(futures, tasks):
            try:
                done.append(f.result())
            except Exception as exc:            # a failed task is reported, not fatal
                failed.append((t[0], t[1], exc))
                log(f"  {what}: {t[0]}_{t[1]} FAILED ({type(exc).__name__}: {exc})")
    log(f"  {what}: {len(done)} tasks done, {len(failed)} failed")
    return done, failed
