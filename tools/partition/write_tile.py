"""Write one square's game map file from the partition, for a first walk.

Usage: python3 -I tools/partition/write_tile.py <ti> <tj> <out.json> [--once dir] [--city dir]
                                                   [--base tile.json]

This is the first cut of stage 4's writer, and it is deliberately narrow: **one square, loaded in the
game, walked around**. The city-wide writer and the polish come after Dan has seen it.

It starts from a copy of the existing tile for the same square (`--base`) and replaces only the fields
the partition owns, so the only difference Dan sees is the partition's:

  - `rd`: one record per corridor stretch, from the corridors pass 1 fitted - so a street's width can
    change along it, and roads and pavements match the corridors the plots were cut against;
  - `br`: every drawn edge whose class is a barrier, from the **merged** runs `classify_edges` wrote
    (not the raw segments: how many pieces a boundary merges into depends on which junctions fall
    where, and a writer that took the segments as they came would emit a different number of wall
    records for the same wall);
  - `gt`: an opening goes in only if it cuts a barrier - a gate or a drive through a wall, fence, hedge
    or railing. An opening with no barrier at that point writes nothing, because there is no gap to
    cut;
  - `fp`, `dv`: a straight line from each gate and drive opening into its house. The copied ones point
    at the old build's gates, so they are replaced;
  - `bl`, `t` and the decoration fields: **copied** from the existing tile. The footprints are not what
    this stage is testing, and a bare tile would look worse for reasons that have nothing to do with
    the partition. Placing decoration against the new cross-sections is its own step, done after the
    layout works across the city; until then anything the new layout contradicts is **dropped**, not
    moved, because a bin standing in a new road reads as a mistake where a sparse square reads as
    unfinished (`drop_clashes`).

What is *not* done here, and is listed as findings instead: decoration that now stands on a new
barrier, in a new carriageway, or across a gate. That is reported, not fixed.
"""
import collections
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import substring, unary_union
from shapely.strtree import STRtree

from partition import MAP, ROOT, once

# The partition's edge classes, and the style name each becomes in the game. Every one of these is a
# key in `web/src/map.ts`'s BARRIER_HEIGHT, so no class needs a stand-in here.
BARRIER = {
    "garden_wall": "garden_wall", "stone_wall": "stone_wall", "brick_wall_low": "brick_wall_low",
    "hedge": "hedge", "hedge_low": "hedge_low", "fence": "fence", "wall": "wall",
    "railing": "railing", "retaining_wall": "retaining_wall", "brick_wall": "brick_wall",
}
# The game's own heights, from `web/src/map.ts` BARRIER_HEIGHT. A barrier with no measured height uses
# these, which is what the game would fall back to anyway - writing them makes the file explicit.
HEIGHT = {
    "wall": 0.9, "retaining_wall": 0.9, "fence": 1.2, "hedge": 1.3, "garden_wall": 0.9,
    "brick_wall_low": 0.75, "hedge_low": 1.0, "railing": 1.0, "stone_wall": 1.1, "brick_wall": 1.2,
}
SEGMENT = 4.0       # metres between points along a road's centre line
# Metres the road surface is shrunk before a barrier is tested against it: the road's interior, not
# its boundary. A wall standing on the boundary is a front wall, and must survive.
ROAD_INSET = 0.05
# Metres either side of a boundary used to ask which side the street is on.
PROBE = 0.25
# Metres the game draws each barrier across its line, from `web/src/map.ts` `BAR` (`t`). A barrier is
# drawn **centred** on its line, so half of it stands on whichever side the line falls: for a hedge
# 0.9 m across, 0.45 m juts into the pavement. A barrier on a corridor boundary is therefore shifted
# out of the corridor by half its own thickness, towards the side the edge's labels say is not
# corridor. A barrier with no corridor side is drawn where the partition put it.
BARRIER_WIDTH = {
    "wall": 0.45, "retaining_wall": 0.5, "stone_wall": 0.45, "garden_wall": 0.35,
    "brick_wall": 0.3, "brick_wall_low": 0.3, "fence": 0.08, "hedge": 0.9, "hedge_low": 0.7,
    "railing": 0.05,
}
# Metres of clearance kept between copied decoration and a barrier. A tree or a bin standing in a wall
# is the same kind of wrong as one standing in a road, and the plank says both are placed later.
DECOR_CLEAR = 0.5
# Metres a lamp may stand inside the carriageway's edge: they are placed on the kerb line itself.
KERB_LINE = 0.3
# Road classes the game draws as paths, with no carriageway (`PATHS` in `web/src/map.ts`).
KERBED = {"trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street"}
GAME_PATHS = {"footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"}
# Metres either side of a gate's line, and of a front path, kept clear of trees and shrubs.
GATEWAY_CLEAR = 0.9
PATH_CLEAR = 0.8
# Metres within which a front path is just lying along its own wall.
ALONG_EDGE = 0.35
# Metres: the shortest wall piece worth writing. It must sit **below** the wall the partition leaves
# each side of a gate (`openings.EDGE_STUB`, 0.9 m), or the writer deletes the very stub the gate was
# cut to leave. Measured: 319 of the 323 gate ends that missed their wall were exactly that - a 0.9 m
# stub dropped by a 1 m floor, so the gate ended in mid-air. The floor stops degenerate slivers; it is
# not there to second-guess the partition's own spacing.
MIN_PIECE = 0.5


def tile_base(ti, tj, extra=("canal", "rail", "cable", "pubs")):
    """The existing tile for a square, and the small files that go beside it."""
    d = os.path.join(ROOT, "web", "public", "maps", MAP)
    main = os.path.join(d, f"{ti}_{tj}.json")
    side = {e: os.path.join(d, f"{MAP}-{e}.json") for e in extra}
    return main, side


def ground_at(T, x, y, split=True):
    """The terrain height at a map point, from the game's own grid the tile carries.

    Two things about that grid are easy to get wrong and were both wrong here at first: `h` is in
    **decimetres** above `z0` (`prep_map.py` writes `int(round((v - z0) * 10))`), and its rows run
    **south to north** - row 0 is the south edge - so a point's row is `(y - y0) / dy` counted from
    the south, not from the north.
    """
    dx, dy, x0, y0, z0 = T["dx"], T["dy"], T["x0"], T["y0"], T["z0"]
    nx, ny, h = T["nx"], T["ny"], T["h"]
    u, v = (x - x0) / dx, (y - y0) / dy
    i, j = int(math.floor(u)), int(math.floor(v))
    if i < 0 or j < 0 or i + 1 >= nx or j + 1 >= ny:
        return None
    fu, fv = u - i, v - j

    def H(a, b):
        return h[b * nx + a] / 10.0 + z0
    # the game splits each cell into two triangles along one diagonal, not bilinearly, so a wall
    # stands on the surface the player walks on only if it reads the height the same way. Road
    # heights stay bilinear (`split=False`): `check_map.py` judges them against that surface.
    if not split:
        return ((H(i, j) * (1 - fu) + H(i + 1, j) * fu) * (1 - fv)
                + (H(i, j + 1) * (1 - fu) + H(i + 1, j + 1) * fu) * fv)
    if fu + fv <= 1:
        return H(i, j) + (H(i + 1, j) - H(i, j)) * fu + (H(i, j + 1) - H(i, j)) * fv
    return (H(i + 1, j + 1) + (H(i, j + 1) - H(i + 1, j + 1)) * (1 - fu)
            + (H(i + 1, j) - H(i + 1, j + 1)) * (1 - fv))


def read_partition(city, ti, tj):
    p = os.path.join(city, f"{ti}_{tj}", "partition.json")
    if not os.path.exists(p):
        raise SystemExit(f"no partition for {ti},{tj} in {city}: run the city first")
    return json.load(open(p))


def roads_from_corridors(rows, sq, ground):
    """`rd`: one record per corridor stretch, with its width and pavements.

    Pass 1 wrote each street's cross-section as *stretches* - (t0, t1, [w, pl, pr]) along the whole
    line - because a street's width changes along it and one record per street cannot say so. One
    record per stretch is what the plan asks for and what the game reads: `w` and `pv` are per record.

    A street that runs past the square is written only where it is inside, because the tile's terrain
    grid ends at the square's edge: a point off the grid has no ground height, and the game would
    place it at zero. (Measured before this clip: 1,075 of 16,962 road points came out at z=0, a few
    metres outside the square.)
    """
    out = []
    x0, y0, x1, y1 = sq
    frame = Polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
    for r in rows:
        whole = LineString(r["line"])
        if not whole.intersects(frame):
            continue
        for t0, t1, sec in r["sections"]:
            if t1 - t0 < 0.5:
                continue
            # the stretch, as the points along it that are inside the square. Sampling by length and
            # then dropping the outside points keeps the record's own geometry as the corridor's.
            pts, kept = [], []
            n = max(2, int((t1 - t0) / SEGMENT) + 1)
            for k in range(n + 1):
                p = whole.interpolate(t0 + (t1 - t0) * k / n)
                if not (x0 <= p.x <= x1 and y0 <= p.y <= y1):
                    continue
                z = ground(p.x, p.y)
                if z is None:
                    continue
                pts.append([round(p.x, 1), round(p.y, 1), round(z, 1)])
            if len(pts) < 2:
                continue
            rec = dict(c=r["cls"], n=r.get("name", ""), p=pts,
                       w=round(float(sec[0]), 2))
            if not r.get("path"):
                # always written: left out, the game gives a street 1.7 m of pavement each side
                rec["pv"] = [round(float(sec[1]), 2), round(float(sec[2]), 2)]
            out.append(rec)
    return out


def drop_paths_along_streets(rd):
    """A path mapped down the middle of a street (a pavement drawn as its centre line, a cycle lane)
    is the street: the stretch of it lying along a carriageway is left out. One crossing the street
    stays. Same rule, same thresholds as the old build's `_along_streets`."""
    cars = [(LineString([q[:2] for q in r["p"]]), r["w"]) for r in rd
            if r["c"] not in GAME_PATHS and len(r["p"]) > 1]
    if not cars:
        return rd, 0.0
    areas = [L.buffer(w / 2, cap_style=2) for L, w in cars]
    # a drawn pavement (and a metre beyond it) is the same thing as a path along it
    lines = [L for L, _ in cars]
    for r, (L, w) in zip([r for r in rd if r["c"] not in GAME_PATHS and len(r["p"]) > 1], cars):
        if r["c"] not in KERBED:
            continue
        for side, pv in zip((1, -1), r.get("pv", (0, 0))):
            if pv > 0:
                band = L.buffer(side * (w / 2 + pv + 1.0), cap_style=2, single_sided=True)
                areas.append(band.difference(L.buffer(w / 2, cap_style=2)))
                lines.append(L)
    cars = [(L, 0) for L in lines]
    tree = STRtree(areas)
    out, cut = [], 0.0
    for r in rd:
        if r["c"] not in GAME_PATHS or r["c"] == "pedestrian" or len(r["p"]) < 2:
            out.append(r)
            continue
        line = LineString([tuple(q[:3]) for q in r["p"]])
        drop = []
        for k in tree.query(line):
            inside = areas[int(k)].intersection(line)
            for part in getattr(inside, "geoms", [inside]):
                if part.geom_type != "LineString" or part.length < 3:
                    continue
                a, b = part.coords[0], part.coords[-1]
                road = cars[int(k)][0]
                if abs(road.project(Point(b[:2])) - road.project(Point(a[:2]))) > 0.8 * part.length:
                    drop.append(part.buffer(0.05, cap_style=2))
        if not drop:
            out.append(r)
            continue
        rest = line.difference(unary_union(drop))
        cut += line.length - rest.length
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type == "LineString" and piece.length >= 2:
                out.append(dict(r, p=[[round(x, 1), round(y, 1), round(z, 1)] for x, y, z in piece.coords]))
    return out, cut


def _corridor_side(line, sides, corridor_faces):
    """+1 if the corridor is on the line's left, -1 if on its right, 0 if neither or both.

    `sides` is the edge's pair of face labels. A boundary with `corridor` on one side only has the
    street on that side, and the wall belongs on the other, so this says which way is "away from the
    street". The test is geometric rather than label-order based: the corridor faces are unioned and
    sampled just either side of the line, because the label pair does not say which side is left."""
    labels = [s[0] for s in sides or []]
    if labels.count("corridor") != 1 or corridor_faces is None or corridor_faces.is_empty:
        return 0
    try:
        m = line.interpolate(0.5, normalized=True)
    except Exception:
        return 0
    # the line's normal, and a probe a little either side of it
    i = min(range(len(line.coords) - 1), key=lambda k: abs(line.project(Point(line.coords[k])) -
                                                           line.project(m)))
    a, b = line.coords[i], line.coords[min(i + 1, len(line.coords) - 1)]
    ex, ey = b[0] - a[0], b[1] - a[1]
    n = math.hypot(ex, ey)
    if n == 0:
        return 0
    nx, ny = -ey / n, ex / n          # left normal
    probe = 0.25
    left = corridor_faces.contains(Point(m.x + nx * probe, m.y + ny * probe))
    right = corridor_faces.contains(Point(m.x - nx * probe, m.y - ny * probe))
    if left and not right:
        return -1                      # corridor on the left, so move right
    if right and not left:
        return 1                       # corridor on the right, so move left
    return 0                           # both or neither: leave it where the partition put it


def _node_key(x, y):
    return (round(x, 3), round(y, 3))


def vertex_shifts(line, sides, corridor_faces, style):
    """How far each vertex of a barrier on the street's boundary moves, as (dx, dy), or None if the
    line has no corridor side to move away from.

    The side is worked out **at each vertex**, not once for the whole run. A front wall that bends
    round a corner has the street on one side of one stretch and the other side of the next, and a
    single probe taken at the middle pushed half of every curved wall *into* the road: measured, 1,108
    written runs crossing a carriageway across the city, where before the offset there were none. A
    vertex whose two probes disagree (both sides, or neither) is not moved, which is what a wall with
    the street on neither side wants anyway."""
    half = BARRIER_WIDTH.get(style, 0.0) / 2.0
    if half <= 0.0 or corridor_faces is None or corridor_faces.is_empty:
        return None
    if [s[0] for s in sides or []].count("corridor") != 1:
        return None
    coords = list(line.coords)
    if len(coords) < 2:
        return None
    out = []
    for k, (x, y) in enumerate(coords):
        if k == 0:
            ax, ay = coords[1]
            ex, ey = ax - x, ay - y
        elif k == len(coords) - 1:
            ax, ay = coords[k - 1]
            ex, ey = x - ax, y - ay
        else:
            ax, ay = coords[k - 1]
            bx, by = coords[k + 1]
            ex, ey = bx - ax, by - ay
        n = math.hypot(ex, ey) or 1.0
        nx, ny = -ey / n, ex / n
        p = Point(x + nx * PROBE, y + ny * PROBE)
        q = Point(x - nx * PROBE, y - ny * PROBE)
        left, right = corridor_faces.contains(p), corridor_faces.contains(q)
        side = -1 if (left and not right) else (1 if (right and not left) else 0)
        out.append((nx * half * side, ny * half * side))
    return out


def offset_from_corridor(line, sides, corridor_faces, style, road_faces=None, node_shift=None):
    """The line moved half a barrier's thickness away from the street, if it stands on the street's
    boundary.

    `map.ts` draws a barrier **centred** on its line (`t = spec.t / 2`, the cross-section built either
    side of the run), so a hedge on a pavement's back edge puts 0.45 m of hedge over the pavement. The
    partition puts the boundary on that line because that is where the boundary is; the drawing has to
    move a half-width out to leave the pavement walkable.

    `node_shift` gives each junction one displacement for every barrier that ends there: moved on
    their own, the ends of walls meeting at a corner each went a different way and poked 0.1 to 0.7 m
    past one another. Where a node has an entry, an end vertex takes it, whatever this line's own
    labels say."""
    shifts = vertex_shifts(line, sides, corridor_faces, style)
    coords = list(line.coords)
    if len(coords) < 2:
        return line
    if shifts is None:
        if not node_shift:
            return line
        shifts = [(0.0, 0.0)] * len(coords)
    out = []
    for k, (x, y) in enumerate(coords):
        dx, dy = shifts[k]
        if node_shift and k in (0, len(coords) - 1):
            dx, dy = node_shift.get(_node_key(x, y), (dx, dy))
        out.append((x + dx, y + dy))
    moved = LineString(out)
    # The move must never put the wall into a carriageway. At a corner a vertex-wise shift cuts the
    # chord of the turn, and where the street bends round that corner the chord clips the road even
    # though every vertex moved away from it - 78 runs on square 0,3 did. A run that ends up in the
    # road after moving keeps its original line: standing a half-width over a pavement is a small
    # wrong, standing in the carriageway is the wrong this was added to prevent.
    if road_faces is not None and not road_faces.is_empty:
        try:
            if moved.intersection(road_faces).length > 0.3:
                return line
        except Exception:
            return line
    return moved


def _outside_roads(line, road_area, floor=MIN_PIECE):
    """The parts of a line that are **not** inside a road surface, as LineStrings of at least `floor` metres.

    Returns (kept pieces, metres dropped for lying wholly inside the roads).

    `road_area` is the road's **interior** (see `road_clearance`), computed once per square. Buffering
    it here, per call, cost 554 of one square's 566 seconds: it is the whole square's road surface and
    it was being rebuilt for all 5,120 wall pieces."""
    if road_area is None or road_area.is_empty:
        return ([line] if line.length >= floor else []), (0.0 if line.length >= floor else line.length)
    try:
        rest = line.difference(road_area)
    except Exception:
        return [line], 0.0
    keep = [g for g in getattr(rest, "geoms", [rest])
            if g.geom_type == "LineString" and g.length >= floor]
    return keep, max(0.0, line.length - sum(g.length for g in keep))


def road_clearance(road_area, inset=ROAD_INSET):
    """The road surface **shrunk** by `inset`: its interior, without its boundary line.

    This used to grow the surface by a metre, and that was the wrong direction. A barrier standing on
    the carriageway's *boundary* - which is where a front garden wall belongs, along the back of the
    pavement or the kerb - intersects the surface along its whole length, because `intersection`
    counts a shared line. Growing the road then deleted it. Measured on square 0,3: of the 7,367.8 m
    the clip removed, **0.0 m was inside the road's interior** and all of it merely shared the
    boundary line, and the same held for 19 of the 20 gates that ended with no wall either side.

    Shrinking instead clips only what is genuinely in the road. On today's data that removes nothing,
    which is the right answer for a consistent partition - the clip becomes a guard against a plot
    overlapping the street rather than a rule that shapes the layout."""
    if road_area is None or road_area.is_empty:
        return None
    try:
        inner = road_area.buffer(-inset)
    except Exception:
        return road_area
    return None if inner.is_empty else inner


def junction_shifts(part, corridor_faces):
    """One displacement per junction, from the barriers that stand on the street's boundary.

    The edge on the corridor decides; where several do, the thickest barrier does, then the lowest
    edge number, so the choice never depends on the order squares are written in."""
    best = {}
    for eid, e in enumerate(part["edges"]):
        if e["kind"] == "none" or e["kind"] not in BARRIER:
            continue
        style = BARRIER[e["kind"]]
        line = LineString(e["xy"])
        shifts = vertex_shifts(line, e.get("sides"), corridor_faces, style)
        if shifts is None:
            continue
        coords = list(line.coords)
        for k in (0, len(coords) - 1):
            if shifts[k] == (0.0, 0.0):
                continue
            rank = (-BARRIER_WIDTH.get(style, 0.0), eid)
            key = _node_key(*coords[k])
            if key not in best or rank < best[key][0]:
                best[key] = (rank, shifts[k])
    return {k: v[1] for k, v in best.items()}


def walls_and_gates(part, sq, ground, road_area=None, corridor_faces=None, road_surface=None):
    """`br` and `gt` together, from one interval list per edge.

    The game builds a wall from the `br` points as one continuous run and never subtracts `gt` from it
    (`map.ts` walks `d.br[k].p` and adds a segment per pair). So a gate is a hole **only** if the wall
    stops and starts again either side of it. A run written straight through makes its gate
    decoration: the player walks at the gap and hits the wall. Measured before this on square 0,3,
    **648 of 802 gates had a wall through them**, against 2 of 658 in the old build, which cut its
    walls at every gate.

    So the two are one computation. For each drawn edge its openings become intervals along the edge's
    own arc length - `o["t"]` is already metres along that edge, because `find_openings` measured it
    there - and the wall is the edge minus those intervals, then minus the road surface. The gate's
    two ends are the surviving wall's ends at the same computed points, so they cannot drift.

    Nothing is searched for: the partition says which edge an opening is on, so an opening costs one
    interval and no geometry has to be found near any other.

    Returns (br runs, gt rows, metres dropped for lying wholly inside a road)."""
    out, gaps = [], []
    x0, y0, x1, y1 = sq
    square = box(x0, y0, x1, y1)
    in_road = 0.0
    open_by_edge = {}
    for o in part.get("openings") or []:
        if o.get("kind") in ("gate", "drive"):
            open_by_edge.setdefault(o.get("edge"), []).append(o)

    node_shift = junction_shifts(part, corridor_faces)

    for eid, e in enumerate(part["edges"]):
        if e["kind"] == "none" or e["kind"] not in BARRIER:
            continue
        style = BARRIER[e["kind"]]
        height = HEIGHT.get(style, 1.2)
        # `map.ts` draws a barrier centred on its line, so one standing on the street's boundary juts
        # half its thickness over the pavement. Shift it out by that half, towards the side the labels
        # say is not the street. The shift happens **before** the gates are cut, so the gaps and the
        # wall come off the same moved line and a gate's ends stay its wall's ends.
        line = offset_from_corridor(LineString(e["xy"]), e.get("sides"), corridor_faces,
                                    style, road_faces=road_surface, node_shift=node_shift)
        L = line.length

        # the gate intervals, clipped to the edge, longest first isn't needed: they do not overlap
        cuts = []
        for o in open_by_edge.get(eid, []):
            a = max(0.0, float(o["t"]) - o["width"] / 2.0)
            b = min(L, float(o["t"]) + o["width"] / 2.0)
            # a gate narrower than a few centimetres is not a hole: at 0 m its two ends coincide, so
            # the "no wall crosses the gap" test is inconclusive and the player cannot pass anyway
            if b - a >= 0.1:
                cuts.append((a, b, o))
        cuts.sort(key=lambda c: c[0])

        keep = []
        at = 0.0
        for a, b, _ in cuts:
            if a > at:
                keep.append((at, a))
            at = max(at, b)
        if at < L:
            keep.append((at, L))

        for a, b in keep:
            sub = substring(line, a, b)
            if sub.is_empty or sub.length < 0.1:
                continue
            # a stub beside a gate is the wall that makes it a gate, however short the offset left it
            beside_gate = a > 0.0 or b < L
            kept, gone = _outside_roads(sub, road_area, 0.1 if beside_gate else MIN_PIECE)
            in_road += gone
            pieces = []
            for piece in kept:
                inside = piece.intersection(square)
                pieces += [g for g in getattr(inside, "geoms", [inside])
                           if g.geom_type == "LineString" and g.length >= 0.1]
            for piece in pieces:
                run = []
                for px, py in piece.coords:
                    # a run is cut at the square's edge above, so its end sits on the seam and the
                    # next square draws on from there; this guards the grid's own edge
                    if not (x0 <= px <= x1 and y0 <= py <= y1):
                        if len(run) >= 2:
                            out.append(dict(c=style, p=run, h=height))
                        run = []
                        continue
                    z = ground(px, py)
                    if z is None:
                        if len(run) >= 2:
                            out.append(dict(c=style, p=run, h=height))
                        run = []
                        continue
                    run.append([round(px, 1), round(py, 1), round(z, 1)])
                if len(run) >= 2:
                    out.append(dict(c=style, p=run, h=height))

        # the gate rows, from the same interval ends the wall stopped at
        for a, b, o in cuts:
            pa, pb = line.interpolate(a), line.interpolate(b)
            if not (x0 <= pa.x <= x1 and y0 <= pa.y <= y1
                    and x0 <= pb.x <= x1 and y0 <= pb.y <= y1):
                continue                    # the gap is outside the square, and so is its wall
            za, zb = ground(pa.x, pa.y), ground(pb.x, pb.y)
            if za is None or zb is None:
                continue
            gaps.append([round(pa.x, 1), round(pa.y, 1), round(pb.x, 1), round(pb.y, 1),
                         round((za + zb) / 2, 1), style])
    return out, gaps, in_road


def paths_from_openings(part, houses, road_area=None, sq=None):
    """`fp`: a straight line from each gate to its house, clipped to the gate's own plot.

    A front path runs from a **gate** to the nearest point of its house. The partition knows where both
    are, and a straight line between them is the honest first cut - the game's own door pass refines it
    once it has a door to aim at.

    The line is **clipped to the plot the gate opens into**, and dropped if under a metre is left. A
    straight line from a gate to its house can cross open ground or a neighbour's garden, and a path
    lying across open ground reads as a mistake where no path at all reads as a plain frontage. The
    ones dropped are counted and reported, because they are the gates the door pass will have to draw.

    `dv` is empty for this walk: `find_openings` never produces a drive opening (`DRIVE` is defined and
    unused), so there is no drive to draw one from. That is a gap in the plan, not in this writer.

    Returns (fp rows, dv rows, how many were dropped for being too short after the clip)."""
    if not houses or not part.get("openings"):
        return [], [], 0
    edge_by_id = {i: e for i, e in enumerate(part["edges"])}
    plots = [Polygon(f["xy"]) for f in part["faces"]
             if f["cls"] == "plot" and len(f["xy"]) > 2]
    tree = STRtree(houses)
    ptree = STRtree(plots) if plots else None
    fp, dv, dropped = [], [], 0
    for o in part["openings"]:
        e = edge_by_id.get(o.get("edge"))
        if e is None or e["kind"] == "none" or e["kind"] not in BARRIER:
            continue
        if o.get("kind") != "gate":
            continue                    # a drive has no opening yet; an open front has no door
        line = LineString(e["xy"])
        mid = line.interpolate(min(max(o["t"], 0.0), line.length))
        if road_area is not None and not road_area.is_empty and road_area.contains(mid):
            continue                    # the gate is in a wall cut out of the road: nothing to open
        if sq is not None and not (sq[0] <= mid.x <= sq[2] and sq[1] <= mid.y <= sq[3]):
            continue                    # the square the gate is in draws its path
        # the plot this gate opens into: the one whose ground is on the far side of the gate
        inside = []
        if ptree is not None:
            # just past the gate, into the plot rather than out to the street: the barrier's normal
            # towards the house is the direction the path runs, so sample along it
            near_houses = list(tree.query(mid.buffer(80)))
            if not near_houses:
                continue
            h = min((houses[int(k)] for k in near_houses), key=lambda p: p.distance(mid))
            target = h.exterior.interpolate(h.exterior.project(mid))
            run = LineString([mid, target])
            for k in np.atleast_1d(ptree.query(run.buffer(0.5))):
                g = plots[int(k)]
                if g.intersects(run):
                    inside.append(g)
        if not inside:
            dropped += 1
            continue
        piece = unary_union(inside)
        d = mid.distance(target)
        if d < 1.0 or d > 80:
            dropped += 1
            continue
        clipped = LineString([mid, target]).intersection(piece)
        parts = [clipped] if clipped.geom_type == "LineString" else \
            [g for g in getattr(clipped, "geoms", []) if g.geom_type == "LineString"]
        if not parts:
            dropped += 1
            continue
        best = max(parts, key=lambda g: g.length)
        if best.length < 1.0:
            dropped += 1
            continue
        if max(line.distance(Point(c)) for c in best.coords) < ALONG_EDGE:
            dropped += 1
            continue                    # the house abuts the front: the "path" would run along the wall
        a, b = best.coords[0], best.coords[-1]
        fp.append([round(a[0], 1), round(a[1], 1), round(b[0], 1), round(b[1], 1)])
    return fp, dv, dropped


def drop_clashes(tile, part, br, clearance=DECOR_CLEAR, gt=None, fp=None, rd=None):
    """Remove decoration the new layout contradicts, and count what went.

    `tr`, `sb`, `fx` and `dr` are **copied** from the existing tile, because placing them is a later
    step - on the plan lamps stand on the kerb line, bins on the pavement's back edge and trees inside
    plots and verges, all relative to the new cross-sections. Until that step exists, copying them
    leaves things standing where the partition put a road or a wall: measured on square 0,3, 750 of
    2,047 street items were in a carriageway and 636 plants were inside a barrier.

    Removing them is the smaller wrong: a tile that is a little bare reads as an unfinished square,
    while a bin in the middle of the road reads as a mistake. Nothing is moved - anything dropped is
    reported by field, so the later step knows what it has to place.

    `dr` (doors) is **not** touched: a door is cut into its building, which did not move."""
    road_faces = [Polygon(f["xy"]) for f in part["faces"]
                  if f["cls"] == "carriageway" and len(f["xy"]) > 2]
    road = unary_union(road_faces) if road_faces else None
    walls = [LineString([(p[0], p[1]) for p in r["p"]]) for r in br]
    wt = STRtree(walls) if walls else None

    def in_road(x, y):
        return road is not None and not road.is_empty and road.contains(Point(x, y))

    def near_wall(x, y, tol):
        if wt is None:
            return False
        p = Point(x, y)
        return any(walls[int(k)].distance(p) <= tol
                   for k in np.atleast_1d(wt.query(p.buffer(tol))))

    # the carriageway as the game draws it from `rd`, which can differ from the partition's faces
    strips = [LineString([(q[0], q[1]) for q in r["p"]]).buffer(max(r["w"] / 2.0 - KERB_LINE, 0.0),
                                                                 cap_style="flat")
              for r in rd or [] if r["c"] not in GAME_PATHS and len(r["p"]) > 1]
    strip_tree = STRtree(strips) if strips else None

    def on_strip(x, y):
        return strip_tree is not None and len(strip_tree.query(Point(x, y), predicate="within")) > 0

    ways = ([LineString([(g[0], g[1]), (g[2], g[3])]).buffer(GATEWAY_CLEAR) for g in gt or []
             if g[5] != "open"]
            + [LineString([(q[0], q[1]), (q[2], q[3])]).buffer(PATH_CLEAR) for q in fp or []])
    way_tree = STRtree(ways) if ways else None

    def on_way(x, y):
        return way_tree is not None and len(way_tree.query(Point(x, y), predicate="within")) > 0

    gone = collections.Counter()

    # trees and shrubs: [x, y, ground, size]. A tree in a wall is a tree inside a hedge, which the
    # game draws solid, so it is invisible at best and a canopy in the middle of a wall at worst.
    for field in ("tr", "sb"):
        rows = tile.get(field) or []
        keep = [r for r in rows
                if not in_road(float(r[0]), float(r[1]))
                and not near_wall(float(r[0]), float(r[1]), clearance)
                and not on_way(float(r[0]), float(r[1]))
                and not on_strip(float(r[0]), float(r[1]))]
        gone[field] = len(rows) - len(keep)
        tile[field] = keep

    # street items: [kind, x, y, ground, angle, ...]. `fx` may also hold the odd string in its first
    # slot, which is a kind like any other, so the coordinates are read by position, not by type.
    rows = tile.get("fx") or []
    keep = [r for r in rows
            if not in_road(float(r[1]), float(r[2]))
            and not near_wall(float(r[1]), float(r[2]), clearance)
            and not on_strip(float(r[1]), float(r[2]))]
    gone["fx"] = len(rows) - len(keep)
    tile["fx"] = keep
    return gone


def build_tile(ti, tj, out, once_dir, city, base=None, verbose=True):
    """Write one square's tile to `out` and return it. Used by both the single square and the city."""
    base = base or tile_base(ti, tj)[0]
    if not os.path.exists(base):
        raise SystemExit(f"no existing tile at {base}: the writer starts from a copy of it")
    tile = json.load(open(base))
    part = read_partition(city, ti, tj)

    from partition import Q
    size = Q.dx * Q.cells
    sq = (Q.x0 + ti * size, Q.y0 + tj * size, Q.x0 + (ti + 1) * size, Q.y0 + (tj + 1) * size)

    # the corridors pass 1 fitted, and this square's own share of them
    rows = once.read_corridors(once_dir)
    own = [r for r in rows if LineString(r[0]["line"]).intersects(box(*sq))]
    roads = []
    for e, car, pl, pr in own:
        rec = dict(cls=e["cls"], name=e.get("name", ""), path=e["path"],
                   line=e["line"], sections=e["sections"])
        roads.append(rec)

    # the ground every point in the tile is placed on: the terrain grid the tile carries
    T = tile["t"]

    def ground(x, y):
        return ground_at(T, x, y)

    rd = roads_from_corridors(roads, sq, lambda x, y: ground_at(T, x, y, split=False))
    rd, _ = drop_paths_along_streets(rd)
    # The road surface a boundary may not be drawn on. `carriageway` faces only: a wall on the line
    # where a pavement meets a plot is a front garden wall, which is where most of them belong.
    road_faces = [Polygon(f["xy"]) for f in part["faces"]
                  if f["cls"] == "carriageway" and len(f["xy"]) > 2]
    road_area = unary_union(road_faces) if road_faces else None
    # the whole street: carriageway and pavement and path, for deciding which side of a boundary the
    # street is on. A wall is only moved if it stands on the corridor's own line.
    cor_faces = [Polygon(f["xy"]) for f in part["faces"]
                 if f["cls"] in ("carriageway", "pavement", "path") and len(f["xy"]) > 2]
    corridor_area = unary_union(cor_faces) if cor_faces else None
    br, gt, br_in_road = walls_and_gates(part, sq, ground, road_clearance(road_area),
                                         corridor_faces=corridor_area, road_surface=road_area)

    # the houses, from the copied buildings, as polygons in map metres
    houses = []
    for b in tile.get("bl") or []:
        rings = b.get("r") or []
        if not rings:
            continue
        try:
            g = Polygon(rings[0], rings[1:])
        except Exception:
            continue
        if not g.is_empty:
            houses.append(g)
    fp, dv, fp_dropped = paths_from_openings(part, houses, road_area, sq)

    tile["rd"] = rd
    tile["br"] = br
    tile["gt"] = gt
    tile["fp"] = fp
    tile["dv"] = dv
    gone = drop_clashes(tile, part, br, gt=gt, fp=fp, rd=rd)
    d = os.path.dirname(os.path.abspath(out))
    os.makedirs(d, exist_ok=True)
    json.dump(tile, open(out, "w"), separators=(",", ":"))
    if verbose:
        print(f"wrote {out}")
        print(f"  rd {len(rd)} records (one per corridor stretch), br {len(br)} runs, "
              f"gt {len(gt)} gaps, fp {len(fp)}, dv {len(dv)}")
        if br_in_road:
            print(f"  barriers cut at the road: {br_in_road:.0f} m dropped for lying wholly inside "
                  f"a carriageway")
        if fp_dropped:
            print(f"  front paths dropped: {fp_dropped} (the straight line left under 1 m inside the "
                  f"gate's plot, so no path is better than one across open ground)")
        print(f"  copied: t, bl ({len(tile.get('bl') or [])}), and every decoration field")
        if any(gone.values()):
            print(f"  decoration dropped where the new layout contradicts it: "
                  + ", ".join(f"{k} {v}" for k, v in gone.items() if v))
    tile["_gone"] = gone
    return tile


def write_one(job):
    """One square, for the city pool. Returns a summary row rather than raising, so one bad square
    does not lose the other 121."""
    ti, tj, out_dir, once_dir, city = job
    out = os.path.join(out_dir, f"{ti}_{tj}.json")
    try:
        tile = build_tile(ti, tj, out, once_dir, city, verbose=False)
    except SystemExit as e:
        return dict(square=[ti, tj], failed=str(e))
    except Exception as e:
        return dict(square=[ti, tj], failed=f"{type(e).__name__}: {e}")
    gone = tile.get("_gone") or {}
    return dict(square=[ti, tj], runs=len(tile.get("br") or []),
                gaps=len(tile.get("gt") or []), fp=len(tile.get("fp") or []),
                dropped_tr=gone.get("tr", 0), dropped_sb=gone.get("sb", 0),
                dropped_fx=gone.get("fx", 0))


def write_city(argv):
    """Write every square's tile into a directory, in parallel.

    Usage: python3 -I tools/partition/write_tile.py --all <out dir> [--once dir] [--city dir]
                                                     [--base dir] [--jobs n]

    The square list and the pool are `city.py`'s, for the same reasons: the build is pure Python plus
    shapely, so it needs processes rather than threads, and the squares must be the same set the
    partitions were built for.

    Each tile still starts from a **copy of the existing tile for its own square** (`--base`, the
    game's map directory by default), so the only fields that differ from the old build are the ones
    the partition owns. A square whose old tile is missing is reported and skipped, not invented: the
    nine squares of the detailed map have no tile, because the detailed map covers that ground."""
    from concurrent.futures import ProcessPoolExecutor
    from partition.city import squares

    out_dir = argv[argv.index("--all") + 1]
    once_dir = os.path.join(ROOT, "out", "once-p1")
    city = os.path.join(ROOT, "out", "city")
    base = None
    jobs = os.cpu_count() or 4
    for flag in ("--once", "--city", "--base", "--jobs"):
        if flag in argv:
            v = argv[argv.index(flag) + 1]
            if flag == "--once":
                once_dir = v
            elif flag == "--city":
                city = v
            elif flag == "--base":
                base = v
            else:
                jobs = int(v)
    os.makedirs(out_dir, exist_ok=True)
    wanted = squares()
    todo, missing = [], []
    for ti, tj in wanted:
        b = os.path.join(base, f"{ti}_{tj}.json") if base else tile_base(ti, tj)[0]
        if os.path.exists(b):
            todo.append((ti, tj, out_dir, once_dir, city))
        else:
            missing.append((ti, tj))
    print(f"{len(todo)} squares of {MAP} to write, {jobs} at a time, into {out_dir}", flush=True)
    if missing:
        print(f"  {len(missing)} skipped: no existing tile to start from "
              f"({', '.join(f'{a}_{b}' for a, b in missing[:5])}"
              f"{' ...' if len(missing) > 5 else ''})", flush=True)
    start = time.time()
    rows = []
    with ProcessPoolExecutor(jobs) as pool:
        for n, r in enumerate(pool.map(write_one, todo), 1):
            rows.append(r)
            ti, tj = r["square"]
            if "failed" in r:
                print(f"[{n}/{len(todo)}] {ti}_{tj} FAILED ({r['failed']})", flush=True)
            else:
                print(f"[{n}/{len(todo)}] {ti}_{tj} br {r['runs']} gt {r['gaps']} "
                      f"fp {r['fp']} (dropped {r['dropped_tr']}/{r['dropped_sb']}/{r['dropped_fx']})",
                      flush=True)
    ok = [r for r in rows if "failed" not in r]
    bad = [r for r in rows if "failed" in r]
    print(f"\n{len(ok)} written, {len(bad)} failed, {time.time() - start:.0f} s")
    if ok:
        for k in ("runs", "gaps", "fp", "dropped_tr", "dropped_sb", "dropped_fx"):
            print(f"  {k}: {sum(r[k] for r in ok):,}")
    summary = dict(squares=len(wanted), written=len(ok), failed=bad,
                   skipped_no_base=[list(m) for m in missing], rows=rows)
    with open(os.path.join(out_dir, "written.json"), "w") as f:
        json.dump(summary, f)
    return summary


def main(argv):
    if "--all" in argv:
        return write_city(argv)
    ti, tj, out = int(argv[0]), int(argv[1]), argv[2]
    once_dir = os.path.join(ROOT, "out", "once-p1")
    city = os.path.join(ROOT, "out", "city")
    base = None
    for flag in ("--once", "--city", "--base"):
        if flag in argv:
            v = argv[argv.index(flag) + 1]
            if flag == "--once":
                once_dir = v
            elif flag == "--city":
                city = v
            else:
                base = v
    return build_tile(ti, tj, out, once_dir, city, base)


if __name__ == "__main__":
    main(sys.argv[1:])
