"""The stage's own checks on a written tile, before Dan looks at it.

Three things must hold in the tile the writer produced, and each is a way the game would be visibly
wrong:

  - **every `gt` gap lies on a `br` run, or at its end.** A gate that is not a gap in a wall is a hole
    standing on its own: the player walks through nothing, and the wall beside it has no break;
  - **no `br` line crosses a carriageway.** A wall across a street is the doubled-fence failure the
    clash check exists for, and it is what a boundary drawn from a plot edge into a corridor looks
    like;
  - **every `fp` ends inside its plot.** A front path that runs past its garden ends in a hedge or the
    road, and the player is led to a door that is not there.

Usage: python3 -I tools/partition/check_tile.py <tile.json> <ti> <tj> [--city dir]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree

from partition import Q

TOL_GATE = 0.35     # metres: a gate's point this close to a run's end is at the run's end
TOL_PLOT = 0.5      # metres: an fp's end this far inside a plot counts as inside


def main(argv):
    path, ti, tj = argv[0], int(argv[1]), int(argv[2])
    city = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__)))), "out", "city")
    if "--city" in argv:
        city = argv[argv.index("--city") + 1]
    tile = json.load(open(path))

    br = [LineString([(p[0], p[1]) for p in b["p"]]) for b in tile.get("br") or []]
    bt = STRtree(br) if br else None

    # 1. every gt gap lies on a br run, or at its end
    off_run = 0
    examples = []
    for g in tile.get("gt") or []:
        a, b = Point(g[0], g[1]), Point(g[2], g[3])
        ok = False
        if bt is not None:
            for k in bt.query(LineString([a, b]).buffer(TOL_GATE)):
                run = br[int(k)]
                if run.distance(a) <= TOL_GATE and run.distance(b) <= TOL_GATE:
                    ok = True
                    break
        if not ok:
            off_run += 1
            if len(examples) < 5:
                examples.append([g[0], g[1], g[2], g[3], g[5]])
    print(f"gt gaps: {len(tile.get('gt') or [])}, of which NOT on a br run or its end: {off_run}")
    for e in examples:
        print(f"   at ({e[0]}, {e[1]}) - ({e[2]}, {e[3]}), {e[4]}")

    # 2. no br line crosses a carriageway
    part = json.load(open(os.path.join(city, f"{ti}_{tj}", "partition.json")))
    from partition.once import _poly_from
    car = [Polygon(f["xy"]) for f in part["faces"] if f["cls"] == "carriageway" and len(f["xy"]) > 2]
    ct = STRtree(car) if car else None
    crossing = 0
    cex = []
    for i, run in enumerate(br):
        if ct is None:
            break
        length = 0.0
        for k in np.atleast_1d(ct.query(run.buffer(0.2))):
            try:
                length += run.intersection(car[int(k)]).length
            except Exception:
                pass
        if length > 0.5:
            crossing += 1
            if len(cex) < 5:
                cex.append([round(run.length, 1), round(length, 1),
                            [round(v, 1) for v in run.bounds]])
    print(f"br runs: {len(br)}, of which crossing a carriageway (over 0.5 m): {crossing}")
    for e in cex:
        print(f"   run {e[0]} m, {e[1]} m of it in a carriageway, bounds {e[2]}")

    # 3. every fp ends inside its plot
    plots = [Polygon(f["xy"]) for f in part["faces"] if f["cls"] == "plot" and len(f["xy"]) > 2]
    pt_ = STRtree(plots) if plots else None
    outside = 0
    pex = []
    for row in tile.get("fp") or []:
        end = Point(row[2], row[3])
        ok = False
        if pt_ is not None:
            ok = any(plots[int(k)].buffer(TOL_PLOT).contains(end)
                     for k in np.atleast_1d(pt_.query(end.buffer(TOL_PLOT))))
        if not ok:
            outside += 1
            if len(pex) < 5:
                pex.append([row[0], row[1], row[2], row[3]])
    print(f"fp paths: {len(tile.get('fp') or [])}, of which ending OUTSIDE any plot: {outside}")
    for e in pex:
        print(f"   from ({e[0]}, {e[1]}) to ({e[2]}, {e[3]})")


if __name__ == "__main__":
    main(sys.argv[1:])
