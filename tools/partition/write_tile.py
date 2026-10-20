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

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union
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
# Metres a boundary is kept clear of a road surface. A run cut exactly on the road's edge comes back
# collinear with it, and the carriageway check then reads a graze as a wall down the road: nine runs
# appeared to cross by 0.7-1.8 m that way. A metre of clearance is wider than the graze and narrower
# than any gap the player would notice at the end of a front wall.
ROAD_CLEAR = 1.0
# Metres of clearance kept between copied decoration and a barrier. A tree or a bin standing in a wall
# is the same kind of wrong as one standing in a road, and the plank says both are placed later.
DECOR_CLEAR = 0.5


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
            if not r.get("path") and (sec[1] or sec[2]):
                rec["pv"] = [round(float(sec[1]), 2), round(float(sec[2]), 2)]
            out.append(rec)
    return out


def _outside_roads(line, road_area, gap=ROAD_CLEAR):
    """The parts of a line that are **not** inside a road surface, as LineStrings of at least a metre.

    Returns (kept pieces, metres dropped for lying wholly inside the roads)."""
    if road_area is None or road_area.is_empty:
        return ([line] if line.length >= 1.0 else []), (0.0 if line.length >= 1.0 else line.length)
    try:
        rest = line.difference(road_area.buffer(gap))
    except Exception:
        return [line], 0.0
    keep = [g for g in getattr(rest, "geoms", [rest])
            if g.geom_type == "LineString" and g.length >= 1.0]
    return keep, max(0.0, line.length - sum(g.length for g in keep))


def barriers_from_edges(edges, sq, ground, road_area=None):
    """`br`: every drawn edge whose class is a barrier, from the merged runs.

    A boundary is written wherever the player could see a wall standing. The one thing that must not
    happen is a wall **down the middle of a road**, so each run is cut against the road surface and
    only the part outside it is written.

    This began as a rule on the edge's labels: anything with a `corridor` face on either side was
    dropped whole, on the reading that such an edge *is* the street's own edge. The reading is right
    about the premise and wrong about the consequence - a `corridor` face is a pavement or a path as
    well as a carriageway, and the line where a pavement meets a plot is exactly where a front garden
    wall runs. On square 0,3 the rule dropped 930 runs / 25,293 m, of which 650 runs / 13,024 m were
    not in a road at all; every `garden_wall`, `railing`, `hedge_low` and `brick_wall_low` in the tile
    came from that set, so the tile had no front boundary anywhere in it. Cutting the run instead
    keeps them, and the carriageway check stays at zero crossings over 0.5 m.

    Returns (runs, metres dropped for lying wholly inside a road)."""
    out = []
    x0, y0, x1, y1 = sq
    in_road = 0.0
    for e in edges:
        if e["kind"] == "none" or e["kind"] not in BARRIER:
            continue
        style = BARRIER[e["kind"]]
        pieces, dropped = _outside_roads(LineString(e["xy"]), road_area)
        in_road += dropped
        for line in pieces:
            # The game's `br` points are [x, y, z], and a wall's foot follows the ground. Only the
            # points inside the square are written: the tile's terrain grid ends at its edge, so a
            # point off it has no height and the game would place it at zero (measured: 3,686 of
            # 28,716 barrier points at z=0 before this clip).
            run = []
            for p in line.coords:
                if not (x0 <= p[0] <= x1 and y0 <= p[1] <= y1):
                    if len(run) >= 2:
                        out.append(dict(c=style, p=run, h=HEIGHT.get(style, 1.2)))
                    run = []
                    continue
                z = ground(p[0], p[1])
                if z is None:
                    if len(run) >= 2:
                        out.append(dict(c=style, p=run, h=HEIGHT.get(style, 1.2)))
                    run = []
                    continue
                run.append([round(p[0], 1), round(p[1], 1), round(z, 1)])
            if len(run) >= 2:
                out.append(dict(c=style, p=run, h=HEIGHT.get(style, 1.2)))
    return out, in_road


def gates_from_openings(part, br_lines, ground):
    """`gt`: an opening goes in only if it cuts a barrier.

    The game's `gt` is a *gap* - [x0, y0, x1, y1, ground, style] - the two points either side of the
    break. So for each opening on a merged run that is a barrier, the points at `t ± width/2` along
    that run, at the ground height, with the run's style. An opening with no barrier at that point is
    not a gap in anything and writes nothing."""
    edge_by_id = {i: e for i, e in enumerate(part["edges"])}
    walls = STRtree(br_lines) if br_lines else None
    wall_list = list(br_lines)

    def on_a_wall(p, tol=0.6):
        if walls is None:
            return False
        return any(wall_list[int(k)].distance(p) <= tol
                   for k in np.atleast_1d(walls.query(p.buffer(tol))))

    out = []
    for o in part["openings"]:
        e = edge_by_id.get(o.get("edge"))
        if e is None or e["kind"] == "none" or e["kind"] not in BARRIER:
            continue
        if o.get("kind") not in ("gate", "drive"):
            continue                        # an open or path opening cuts no barrier
        line = LineString(e["xy"])
        style = BARRIER[e["kind"]]
        half = o["width"] / 2.0
        a = line.interpolate(max(0.0, o["t"] - half))
        b = line.interpolate(min(line.length, o["t"] + half))
        # The gap has to be in a wall that is really there. `br` is the authority on what was
        # written: a run lying inside a road is cut out, and a run is also cut short where it meets
        # one, so both ends of the gap must lie along a written run. Testing the edge's labels
        # instead is what hid 200 gates on square 0,3 behind walls that were never drawn.
        if not (on_a_wall(a) and on_a_wall(b)):
            continue
        z = ground(a.x, a.y)
        zb = ground(b.x, b.y)
        if z is None or zb is None:
            continue
        out.append([round(a.x, 1), round(a.y, 1), round(b.x, 1), round(b.y, 1),
                    round((z + zb) / 2, 1), style])
    return out


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


def main(argv):
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
        rec = dict(cls=e["cls"], name=e.get("name", ""), path=e["path"],
                   line=e["line"], sections=e["sections"])
        roads.append(rec)

    # the ground every point in the tile is placed on: the terrain grid the tile carries
    T = tile["t"]

    def ground(x, y):
        return ground_at(T, x, y)

    rd = roads_from_corridors(roads, sq, ground)
    # The road surface a boundary may not be drawn on. `carriageway` faces only: a wall on the line
    # where a pavement meets a plot is a front garden wall, which is where most of them belong.
    road_faces = [Polygon(f["xy"]) for f in part["faces"]
                  if f["cls"] == "carriageway" and len(f["xy"]) > 2]
    road_area = unary_union(road_faces) if road_faces else None
    br, br_in_road = barriers_from_edges(part["edges"], sq, ground, road_area)
    gt = gates_from_openings(part, [LineString([(p[0], p[1]) for p in r["p"]]) for r in br], ground)

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
    print(f"wrote {out}")
    print(f"  rd {len(rd)} records (one per corridor stretch), br {len(br)} runs, "
          f"gt {len(gt)} gaps, fp {len(fp)}, dv {len(dv)}")
    if br_in_road:
        print(f"  barriers cut at the road: {br_in_road:.0f} m dropped for lying wholly inside a "
              f"carriageway")
    if fp_dropped:
        print(f"  front paths dropped: {fp_dropped} (the straight line left under 1 m inside the "
              f"gate's plot, so no path is better than one across open ground)")
    print(f"  copied: t, bl ({len(tile.get('bl') or [])}), and every decoration field")
    if any(gone.values()):
        print(f"  decoration dropped where the new layout contradicts it: "
              + ", ".join(f"{k} {v}" for k, v in gone.items() if v))
    return tile


if __name__ == "__main__":
    main(sys.argv[1:])
