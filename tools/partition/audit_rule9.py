"""Are the two rule-9 findings about gates and paths real, or is the checker measuring the old build?

Usage: python3 -I tools/partition/audit_rule9.py <tiles dir> [--city dir] [--squares 0,3 1,4] [--n 6]

`check_map.py` judges two things by asking whether a wall comes within 0.3 m of a gate or a path:

  - "9 gate without a wall each side": a gate whose two ends are not both near a wall;
  - "9 front path through a wall": an `fp` that crosses a wall more than 1 m from a gate's midpoint.

Both were written for a build where a gate was a *mark on* a continuous wall. In this build a gate is
a hole: the wall stops either side of it. So the same geometry can be read two ways, and the question
is which way each finding is actually falling.

For every finding this says where it is, and what is there:

  END_ON_WALL      a gate end that does sit on a wall (the old reader expects the wall to *pass*
                   through; a hole cannot satisfy that, so this is the checker, not the tile)
  END_NO_WALL      a gate end with no wall at all: a hole in nothing, which is a real defect
  PATH_AT_GATE     a path/wall crossing within a metre of a gate: expected, the path leaves through
                   the hole
  PATH_ELSEWHERE   a path crossing a wall away from any gate: the straight line from gate to house
                   ran through a side wall, which the player sees as a path through a fence
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import shapely
from shapely.geometry import LineString, Point

WALL_TOUCH = 0.3        # check_map.py's own tolerance for "a wall is at this gate"
GATE_NEAR = 1.0         # and for "this crossing is at a gate"


def audit(path, city, sq):
    t = json.load(open(path))
    bars = [b for b in t.get("br") or [] if len(b["p"]) > 1]
    lines = [LineString([(q[0], q[1]) for q in b["p"]]) for b in bars]
    tree = shapely.STRtree(lines) if lines else None
    gates = [g for g in t.get("gt") or [] if g[5] != "open"]
    rows = []

    def walls_near(p, r):
        if tree is None:
            return []
        return [lines[int(k)] for k in tree.query(p.buffer(r)) if lines[int(k)].distance(p) < r]

    # --- the gate rule, end by end
    for g in gates:
        for side, (x, y) in (("a", (g[0], g[1])), ("b", (g[2], g[3]))):
            p = Point(x, y)
            near = walls_near(p, WALL_TOUCH)
            if not near:
                rows.append(dict(rule="gate", cat="END_NO_WALL", x=round(x, 1), y=round(y, 1),
                                 sq=sq, style=g[5]))
            else:
                rows.append(dict(rule="gate", cat="END_ON_WALL", x=round(x, 1), y=round(y, 1),
                                 sq=sq, style=g[5]))

    # --- the path rule, crossing by crossing
    gate_pts = [Point((g[0] + g[2]) / 2, (g[1] + g[3]) / 2) for g in t.get("gt") or []]
    gtree = shapely.STRtree(gate_pts) if gate_pts else None
    for q in t.get("fp") or []:
        p = LineString([(q[0], q[1]), (q[2], q[3])])
        if tree is None:
            break
        for k in tree.query(p):
            x = lines[int(k)].intersection(p)
            for h in getattr(x, "geoms", [x]):
                if h.is_empty or h.geom_type not in ("Point", "LineString"):
                    continue
                if h.geom_type == "LineString" and h.length < 0.01:
                    continue
                near_gate = False
                if gtree is not None:
                    near_gate = any(gate_pts[int(j)].distance(h) < GATE_NEAR
                                    for j in gtree.query(h.buffer(GATE_NEAR)))
                if not near_gate:
                    rows.append(dict(rule="path", cat="PATH_ELSEWHERE",
                                     x=round(h.centroid.x, 1), y=round(h.centroid.y, 1),
                                     sq=sq, style=bars[int(k)]["c"]))
    return rows


def main(argv):
    tiles = argv[0]
    city = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__)))), "out", "city-tile")
    squares = ["0_3"]
    for flag in ("--city", "--squares"):
        if flag in argv:
            v = argv[argv.index(flag) + 1]
            if flag == "--city":
                city = v
            else:
                squares = argv[argv.index(flag) + 1:argv.index(flag) + 1 + 4]
    rows = []
    for sq in squares:
        rows.extend(audit(os.path.join(tiles, f"{sq}.json"), city, sq))
    import collections
    c = collections.Counter((r["rule"], r["cat"]) for r in rows)
    print(f"{', '.join(squares)}")
    for k in sorted(c):
        print(f"  {k[0]:5s} {k[1]:14s} {c[k]:6d}")
    print()
    for cat in ("END_NO_WALL", "PATH_ELSEWHERE"):
        ex = [r for r in rows if r["cat"] == cat][:4]
        if ex:
            print(f"  {cat} examples: " + ", ".join(f"({r['x']}, {r['y']}) {r['style']}"
                                                     for r in ex))
    return rows


if __name__ == "__main__":
    main(sys.argv[1:])
