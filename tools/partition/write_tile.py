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
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import substring, unary_union
from shapely.strtree import STRtree

from partition import MAP, ROOT, once
from structures import drop_empty_spans, follow_ground, grow_marks

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


def ground_at(T, x, y):
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
    return ((H(i, j) * (1 - fu) + H(i + 1, j) * fu) * (1 - fv)
            + (H(i, j + 1) * (1 - fu) + H(i + 1, j + 1) * fu) * fv)


def read_partition(city, ti, tj):
    p = os.path.join(city, f"{ti}_{tj}", "partition.json")
    if not os.path.exists(p):
        raise SystemExit(f"no partition for {ti},{tj} in {city}: run the city first")
    return json.load(open(p))


def roads_from_corridors(rows, sq, ground, profiles=None):
    """`rd`: one record per corridor stretch, with its width and pavements.

    Pass 1 wrote each street's cross-section as *stretches* - (t0, t1, [w, pl, pr]) along the whole
    line - because a street's width changes along it and one record per street cannot say so. One
    record per stretch is what the plan asks for and what the game reads: `w` and `pv` are per record.

    A street that runs past the square is written only where it is inside, because the tile's terrain
    grid ends at the square's edge: a point off the grid has no ground height, and the game would
    place it at zero. (Measured before this clip: 1,075 of 16,962 road points came out at z=0, a few
    metres outside the square.)

    `profiles` is pass 1's `structures.json`: each street's heights with its bridges and tunnels, so
    a road rises and falls like a road and a bridge stays a span instead of dropping into the gap.
    A street without a profile lies on the ground.
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
            pts, spans, decks, deep = [], set(), set(), set()
            prof = (profiles or {}).get(r.get("id"))
            n = max(2, int((t1 - t0) / SEGMENT) + 1)
            for k in range(n + 1):
                t = t0 + (t1 - t0) * k / n
                p = whole.interpolate(t)
                if not (x0 <= p.x <= x1 and y0 <= p.y <= y1):
                    continue
                gz = ground(p.x, p.y)
                if gz is None:
                    continue
                z = gz
                if prof:
                    f = t / (whole.length or 1) * (len(prof["z"]) - 1)
                    lo = min(len(prof["z"]) - 2, int(f))
                    z = prof["z"][lo] + (prof["z"][lo + 1] - prof["z"][lo]) * (f - lo)
                    near = int(round(f))
                    if near in prof["span"]:
                        spans.add(len(pts))
                    elif near in prof["deck"]:
                        decks.add(len(pts))
                    if any(i0 < near < i1 for i0, i1 in prof["bored"]):
                        deep.add(len(pts))
                pts.append([round(p.x, 1), round(p.y, 1), round(z, 1), gz])
            if prof:
                zs, gs = [q[2] for q in pts], [q[3] for q in pts]
                grow_marks(zs, gs, spans, decks)
                for q, v in zip(pts, follow_ground(zs, gs, spans, decks)):
                    q[2] = round(v, 1)
            marked = [q[:3] + ([1] if i in spans else [2] if i in decks else []) for i, q in enumerate(pts)]
            for piece in _surface_pieces(marked, deep):
                rec = dict(c=r["cls"], n=r.get("name", ""), p=piece, w=round(float(sec[0]), 2))
                if not r.get("path") and (sec[1] or sec[2]):
                    rec["pv"] = [round(float(sec[1]), 2), round(float(sec[2]), 2)]
                out.append(rec)
    return out


def _surface_pieces(pts, deep):
    """The open-air pieces of a stretch's points, with the bored points (by index) taken out: a
    tunnel's bore is built by the game from the tile's tunnel list, so no road lies over it. Each
    piece keeps the portal point it ends at and has at least two points."""
    pieces, cur = [], []
    for i, q in enumerate(pts):
        if i in deep:
            if cur:
                cur.append(q)
                pieces.append(cur)
                cur = []
            continue
        if not cur and i - 1 in deep:
            cur.append(pts[i - 1])
        cur.append(q)
    if cur:
        pieces.append(cur)
    return [c for c in pieces if len(c) >= 2]


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


def offset_from_corridor(line, sides, corridor_faces, style, road_faces=None):
    """The line moved half a barrier's thickness away from the street, if it stands on the street's
    boundary.

    `map.ts` draws a barrier **centred** on its line (`t = spec.t / 2`, the cross-section built either
    side of the run), so a hedge on a pavement's back edge puts 0.45 m of hedge over the pavement. The
    partition puts the boundary on that line because that is where the boundary is; the drawing has to
    move a half-width out to leave the pavement walkable.

    The side is worked out **at each vertex**, not once for the whole run. A front wall that bends
    round a corner has the street on one side of one stretch and the other side of the next, and a
    single probe taken at the middle pushed half of every curved wall *into* the road: measured, 1,108
    written runs crossing a carriageway across the city, where before the offset there were none. A
    vertex whose two probes disagree (both sides, or neither) is not moved, which is what a wall with
    the street on neither side wants anyway."""
    half = BARRIER_WIDTH.get(style, 0.0) / 2.0
    if half <= 0.0 or corridor_faces is None or corridor_faces.is_empty:
        return line
    labels = [s[0] for s in sides or []]
    if labels.count("corridor") != 1:
        return line
    coords = list(line.coords)
    if len(coords) < 2:
        return line
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
        out.append((x + nx * half * side, y + ny * half * side))
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


def _outside_roads(line, road_area):
    """The parts of a line that are **not** inside a road surface, as LineStrings of at least a metre.

    Returns (kept pieces, metres dropped for lying wholly inside the roads).

    `road_area` is the road's **interior** (see `road_clearance`), computed once per square. Buffering
    it here, per call, cost 554 of one square's 566 seconds: it is the whole square's road surface and
    it was being rebuilt for all 5,120 wall pieces."""
    if road_area is None or road_area.is_empty:
        return ([line] if line.length >= MIN_PIECE else []), (0.0 if line.length >= MIN_PIECE else line.length)
    try:
        rest = line.difference(road_area)
    except Exception:
        return [line], 0.0
    keep = [g for g in getattr(rest, "geoms", [rest])
            if g.geom_type == "LineString" and g.length >= MIN_PIECE]
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
    in_road = 0.0
    open_by_edge = {}
    for o in part.get("openings") or []:
        if o.get("kind") in ("gate", "drive"):
            open_by_edge.setdefault(o.get("edge"), []).append(o)

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
                                    style, road_faces=road_surface)
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
            kept, gone = _outside_roads(sub, road_area)
            in_road += gone
            for piece in kept:
                run = []
                for px, py in piece.coords:
                    # only points inside the square are written: the terrain grid ends at its edge,
                    # so a point off it has no height and the game would place it at zero
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


def paths_from_openings(part, houses, road_area=None):
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
        a, b = best.coords[0], best.coords[-1]
        fp.append([round(a[0], 1), round(a[1], 1), round(b[0], 1), round(b[1], 1)])
    return fp, dv, dropped


def drop_clashes(tile, part, br, clearance=DECOR_CLEAR):
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

    gone = collections.Counter()

    # trees and shrubs: [x, y, ground, size]. A tree in a wall is a tree inside a hedge, which the
    # game draws solid, so it is invisible at best and a canopy in the middle of a wall at worst.
    for field in ("tr", "sb"):
        rows = tile.get(field) or []
        keep = [r for r in rows
                if not in_road(float(r[0]), float(r[1]))
                and not near_wall(float(r[0]), float(r[1]), clearance)]
        gone[field] = len(rows) - len(keep)
        tile[field] = keep

    # street items: [kind, x, y, ground, angle, ...]. `fx` may also hold the odd string in its first
    # slot, which is a kind like any other, so the coordinates are read by position, not by type.
    rows = tile.get("fx") or []
    keep = [r for r in rows
            if not in_road(float(r[1]), float(r[2]))
            and not near_wall(float(r[1]), float(r[2]), clearance)]
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

    from shapely.geometry import box
    from partition import Q
    size = Q.dx * Q.cells
    sq = (Q.x0 + ti * size, Q.y0 + tj * size, Q.x0 + (ti + 1) * size, Q.y0 + (tj + 1) * size)

    # the corridors pass 1 fitted, and this square's own share of them
    rows = once.read_corridors(once_dir)
    own = [r for r in rows if LineString(r[0]["line"]).intersects(box(*sq))]
    roads = []
    for e, car, pl, pr in own:
        rec = dict(id=e["id"], cls=e["cls"], name=e.get("name", ""), path=e["path"],
                   line=e["line"], sections=e["sections"])
        roads.append(rec)

    # the ground every point in the tile is placed on: the terrain grid the tile carries
    T = tile["t"]

    def ground(x, y):
        return ground_at(T, x, y)

    rd = roads_from_corridors(roads, sq, ground, once.read_structures(once_dir))
    rail = tile_base(ti, tj)[1]["rail"]
    drop_empty_spans(
        rd, ground,
        [Polygon(w["r"][0], [h for h in w["r"][1:] if len(h) >= 3]) for w in tile["wp"] if len(w["r"][0]) >= 3],
        [LineString([q[:2] for q in t["p"]]) for t in (json.load(open(rail))["tracks"] if os.path.exists(rail) else [])
         if len(t["p"]) > 1])
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
    fp, dv, fp_dropped = paths_from_openings(part, houses, road_area)

    tile["rd"] = rd
    tile["br"] = br
    tile["gt"] = gt
    tile["fp"] = fp
    tile["dv"] = dv
    gone = drop_clashes(tile, part, br)
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
