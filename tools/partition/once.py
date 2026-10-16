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
import json
import os

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


def _poly_from(a):
    return Polygon(a) if a else Polygon()


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


# shared between the pool and the workers: the graph an owner fits from. Set by pass_streets before
# the pool starts, and by each worker from what the parent passes it, so a worker never rebuilds it.
EDGES = []


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
