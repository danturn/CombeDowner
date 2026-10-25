"""Put every gate end of one written tile into exactly one category, so the counts add up.

Usage: python3 -I tools/partition/classify_gate_ends.py <tile.json> <ti> <tj> [--city dir]

A gate is written as a gap is cut in a wall, so each of its two ends should land on the end of a
written `br` run. This says where each end actually landed, and why - which is what decides whether
the tile is right. It exists because the first rule-1 check asked that both ends lie on the *same*
run, which a correctly cut gate can never satisfy, so it passed broken tiles and failed good ones.

Every end goes into exactly one category, in this order, and the counts are asserted to add up:

  a. on a wall end within 1 cm - the tile is right                      (`OK_WALL_END`)
  b. the wall there was removed by the road clip                        (`ROAD_CLIP`)
  c. the wall there was clipped at the square's edge                    (`SQUARE_EDGE`)
  d. the partition draws no barrier on that side of the gate            (`NO_BARRIER`)
  e. the merged run was long enough but the written run is not, so the  (`TRIMMED`)
     piece was dropped by the 1 m filter
  f. a wall is there but the end is not its end: the gate sits along a  (`MID_WALL`)
     run rather than at the end of one - a gate that blocks itself
  g. none of the above                                                  (`UNEXPLAINED`)

`MID_WALL` is the one that matters: it is a gate the player cannot walk through.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import substring, unary_union
from shapely.strtree import STRtree
import numpy as np

BARRIER = {
    "garden_wall", "stone_wall", "brick_wall_low", "hedge", "hedge_low", "fence", "wall",
    "railing", "retaining_wall", "brick_wall",
}
END_TOL = 0.01          # metres: "within 1 cm", the tolerance in the rule
WALL_TOL = 0.35         # metres: how far off a run a point may sit and still be on it
MIN_PIECE = 1.0         # the writer's own floor for a written run
ROAD_CLEAR = 1.0        # the writer's clearance from a road surface
MIN_WALL = 0.3          # the writer's floor inside an interval


def tile_square(T):
    x0, y0, dx, nx, ny = T["x0"], T["y0"], T["dx"], T["nx"], T["ny"]
    dy = T.get("dy", dx)
    return x0, y0, x0 + dx * nx, y0 + dy * ny


def classify(tile, part):
    br = [LineString([(p[0], p[1]) for p in b["p"]]) for b in tile.get("br") or []]
    bt = STRtree(br) if br else None
    x0, y0, x1, y1 = tile_square(tile["t"])

    road = [Polygon(f["xy"]) for f in part["faces"]
            if f["cls"] == "carriageway" and len(f["xy"]) > 2]
    road_area = unary_union(road).buffer(ROAD_CLEAR) if road else None

    edge_by_id = {i: e for i, e in enumerate(part["edges"])}

    def on_wall_end(p):
        if bt is None:
            return False
        for k in bt.query(p.buffer(WALL_TOL)):
            run = br[int(k)]
            if run.distance(p) > WALL_TOL:
                continue
            if min(run.distance(Point(run.coords[0])), run.distance(Point(run.coords[-1]))) <= END_TOL:
                return True
        return False

    def on_a_wall(p):
        if bt is None:
            return False
        return any(br[int(k)].distance(p) <= WALL_TOL for k in bt.query(p.buffer(WALL_TOL)))

    rows = []
    for gi, g in enumerate(tile.get("gt") or []):
        for side, p in (("a", Point(g[0], g[1])), ("b", Point(g[2], g[3]))):
            cat = None
            if on_wall_end(p):
                cat = "OK_WALL_END"
            elif road_area is not None and road_area.contains(p):
                cat = "ROAD_CLIP"
            elif not (x0 <= p.x <= x1 and y0 <= p.y <= y1):
                cat = "SQUARE_EDGE"
            elif on_a_wall(p):
                cat = "MID_WALL"
            else:
                cat = None       # decided below, from the partition's own edges
            rows.append(dict(gate=gi, side=side, x=round(p.x, 1), y=round(p.y, 1), cat=cat))

    # d / e: what the partition draws on that side of the gate. A gate's end lies on its own edge at
    # t +/- width/2, so "the edge on that side" is the piece of that edge beyond the gap.
    by_gate = {}
    for r in rows:
        by_gate.setdefault(r["gate"], []).append(r)
    for oi, o in enumerate(tile.get("gt") or []):
        pass
    # pair each written gate back to the partition's opening by position, because `gt` carries no edge
    openings = []
    for o in part.get("openings") or []:
        if o.get("kind") not in ("gate", "drive"):
            continue
        e = edge_by_id.get(o.get("edge"))
        if e is None or e["kind"] not in BARRIER:
            continue
        line = LineString(e["xy"])
        a = line.interpolate(max(0.0, o["t"] - o["width"] / 2.0))
        b = line.interpolate(min(line.length, o["t"] + o["width"] / 2.0))
        openings.append(((a.x, a.y), (b.x, b.y), e, line, o))
    otree = STRtree([Point(*a) for a, _, _, _, _ in openings]) if openings else None

    for r in rows:
        if r["cat"] is not None:
            continue
        p = Point(r["x"], r["y"])
        cand = None
        if otree is not None:
            for k in np.atleast_1d(otree.query(p.buffer(0.6))):
                a, b, e, line, o = openings[int(k)]
                if min(math.dist(a, (p.x, p.y)), math.dist(b, (p.x, p.y))) <= 0.6:
                    cand = (a, b, e, line, o)
                    break
        if cand is None:
            r["cat"] = "UNEXPLAINED"
            continue
        a, b, e, line, o = cand
        # which side of the gap is this end on, and what does the partition draw there?
        L = line.length
        ga = max(0.0, o["t"] - o["width"] / 2.0)
        gb = min(L, o["t"] + o["width"] / 2.0)
        on_a_side = math.dist(a, (p.x, p.y)) < math.dist(b, (p.x, p.y))
        beyond = ga if on_a_side else (L - gb)
        if beyond < MIN_WALL:
            r["cat"] = "NO_BARRIER"      # the edge itself ends at the gate: a fence end, correctly
            continue
        # The writer drops a piece when it is under a metre **after** the road clip. So ask the two
        # questions in the order it asks them: was the side long enough on paper, and then did the
        # road take it? Asking about the road first made 306 road-clipped ends look unexplained,
        # because the end point sits outside the clearance while the wall behind it is inside it.
        if beyond < MIN_PIECE:
            r["cat"] = "SHORT_PIECE"     # short before any road: a stub either side of the gate
            continue
        sub = substring(line, 0.0 if on_a_side else gb, ga if on_a_side else L)
        pieces = [sub]
        if road_area is not None and not sub.is_empty:
            rest = sub.difference(road_area)
            pieces = list(getattr(rest, "geoms", [rest]))
        survived = max((g_.length for g_ in pieces if g_.geom_type == "LineString"), default=0.0)
        r["cat"] = "ROAD_CLIP" if survived < MIN_PIECE else "TRIMMED"
    return rows


def main(argv):
    path, ti, tj = argv[0], int(argv[1]), int(argv[2])
    city = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__)))), "out", "city-tile")
    if "--city" in argv:
        city = argv[argv.index("--city") + 1]
    tile = json.load(open(path))
    part = json.load(open(os.path.join(city, f"{ti}_{tj}", "partition.json")))
    rows = classify(tile, part)

    order = ["OK_WALL_END", "ROAD_CLIP", "SHORT_PIECE", "SQUARE_EDGE", "NO_BARRIER",
             "TRIMMED", "MID_WALL", "UNEXPLAINED"]
    counts = {k: 0 for k in order}
    for r in rows:
        counts[r["cat"]] += 1
    print(f"{path}: {len(tile.get('gt') or [])} gates, {len(rows)} ends")
    print()
    for k in order:
        print(f"  {k:14s} {counts[k]:5d}")
    print(f"  {'TOTAL':14s} {sum(counts.values()):5d}")
    assert sum(counts.values()) == len(rows), "every end must land in exactly one category"
    print()
    for k in order:
        ex = [r for r in rows if r["cat"] == k][:3]
        if ex:
            print(f"  {k}: " + ", ".join(f"({r['x']}, {r['y']})" for r in ex))
    return counts


if __name__ == "__main__":
    main(sys.argv[1:])
