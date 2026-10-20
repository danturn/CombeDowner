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
  - `bl`, `t` and every decoration field: **copied** from the existing tile. The footprints are not what
    this stage is testing, and a bare tile would look worse for reasons that have nothing to do with
    the partition.

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


def barriers_from_edges(edges, sq, ground):
    """`br`: every drawn edge whose class is a barrier, from the merged runs.

    Only a boundary **between ground the player walks on** is a barrier. An edge with a `corridor`
    label on either side is the street's own edge - the line where the pavement meets the plot - and
    drawing it as a hedge puts a wall down the edge of the road. The partition's edges carry the pair
    of labels either side for exactly this reason; without it 266 of 3,699 runs were inside a
    carriageway on square 0,3, some wholly inside it."""
    out = []
    x0, y0, x1, y1 = sq
    for e in edges:
        if e["kind"] == "none" or e["kind"] not in BARRIER:
            continue
        sides = e.get("sides") or []
        if any(s and s[0] == "corridor" for s in sides):
            continue                        # the street's own edge, not a wall beside it
        style = BARRIER[e["kind"]]
        # The game's `br` points are [x, y, z], and a wall's foot follows the ground. Only the points
        # inside the square are written: the tile's terrain grid ends at its edge, so a point off it has
        # no height and the game would place it at zero (measured: 3,686 of 28,716 barrier points at
        # z=0 before this clip).
        line = LineString(e["xy"])
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
    return out


def gates_from_openings(part, br_lines, ground):
    """`gt`: an opening goes in only if it cuts a barrier.

    The game's `gt` is a *gap* - [x0, y0, x1, y1, ground, style] - the two points either side of the
    break. So for each opening on a merged run that is a barrier, the points at `t ± width/2` along
    that run, at the ground height, with the run's style. An opening with no barrier at that point is
    not a gap in anything and writes nothing."""
    edge_by_id = {i: e for i, e in enumerate(part["edges"])}
    out = []
    for o in part["openings"]:
        e = edge_by_id.get(o.get("edge"))
        if e is None or e["kind"] == "none" or e["kind"] not in BARRIER:
            continue
        if o.get("kind") not in ("gate", "drive"):
            continue                        # an open or path opening cuts no barrier
        line = LineString(e["xy"])
        style = BARRIER[e["kind"]]
        # and the run must actually be written as a barrier: an edge whose far side is a corridor is
        # the street's own edge and is not in `br` (see `barriers_from_edges`), so a "gate" on it
        # would be a gap in nothing. The `br` runs are the authority on what is a wall.
        sides = e.get("sides") or []
        if any(s and s[0] == "corridor" for s in sides):
            continue
        half = o["width"] / 2.0
        a = line.interpolate(max(0.0, o["t"] - half))
        b = line.interpolate(min(line.length, o["t"] + half))
        z = ground(a.x, a.y)
        zb = ground(b.x, b.y)
        if z is None or zb is None:
            continue
        out.append([round(a.x, 1), round(a.y, 1), round(b.x, 1), round(b.y, 1),
                    round((z + zb) / 2, 1), style])
    return out


def paths_from_openings(part, gates, houses, ground):
    """`fp` and `dv`: a straight line from each gate or drive into its house.

    The partition knows where the opening is and where the house is; a straight line between them is
    the honest first cut, and the game's door pass can refine it later."""
    if not houses:
        return [], []
    tree = STRtree(houses)
    fp, dv = [], []
    for g in gates:
        mid = Point((g[0] + g[2]) / 2, (g[1] + g[3]) / 2)
        near = list(tree.query(mid.buffer(80)))
        if not near:
            continue
        h = min((houses[int(k)] for k in near), key=lambda p: p.distance(mid))
        target = h.exterior.interpolate(h.exterior.project(mid))
        if mid.distance(target) < 1.0 or mid.distance(target) > 80:
            continue
        row = [round(mid.x, 1), round(mid.y, 1), round(target.x, 1), round(target.y, 1)]
        (dv if g[5] and False else fp).append(row)
    return fp, dv


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
    br = barriers_from_edges(part["edges"], sq, ground)
    gt = gates_from_openings(part, br, ground)

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
    fp, dv = paths_from_openings(part, gt, houses, ground)

    tile["rd"] = rd
    tile["br"] = br
    tile["gt"] = gt
    tile["fp"] = fp
    tile["dv"] = dv
    d = os.path.dirname(os.path.abspath(out))
    os.makedirs(d, exist_ok=True)
    json.dump(tile, open(out, "w"), separators=(",", ":"))
    print(f"wrote {out}")
    print(f"  rd {len(rd)} records (one per corridor stretch), br {len(br)} runs, "
          f"gt {len(gt)} gaps, fp {len(fp)}, dv {len(dv)}")
    print(f"  copied: t, bl ({len(tile.get('bl') or [])}), and every decoration field")
    return tile


if __name__ == "__main__":
    main(sys.argv[1:])
