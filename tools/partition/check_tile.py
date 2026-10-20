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
from shapely.ops import substring
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree

from partition import Q

TOL_GATE = 0.35     # metres: a gate's point this close to a run's end is at the run's end
# Metres: how far a gate's end may sit from a wall's end and still be that wall's end. The tile rounds
# every coordinate to 0.1 m (`round(px, 1)` in the writer), so the two ends agree to that, not to a
# centimetre - a 1 cm tolerance could never be met and reported 854 good gates as broken.
END_MATCH = 0.11
TOL_PLOT = 0.5      # metres: an fp's end this far inside a plot counts as inside


def gate_findings(tile, br):
    """The gates that are not passable gaps: `[(x0, y0, x1, y1, style)]`.

    A gate passes when (a) no wall crosses its gap and (b) each of its ends meets a wall's end. This
    lives here and not in each caller because the first version was written three times and the three
    drifted: `check_city` was still asking the old question (both ends on the same run) long after this
    one had been corrected, and reported 25,144 findings where the truth was a few hundred.
    """
    bt = STRtree(br) if br else None
    out = []
    for g in tile.get("gt") or []:
        if bt is None:
            continue
        a, b = Point(g[0], g[1]), Point(g[2], g[3])
        gap = LineString([a, b])
        # (a) the gap must be open: no wall may **cross** it, meaning pass from one side to the other.
        #     A wall that merely ends at a gap's end touches it, and that is the design - but the first
        #     form asked `intersects`, so every correctly cut gate failed on its own wall's end. The
        #     test is on the gap's *interior*: shrunk at both ends by the end tolerance, nothing there.
        crossed = False
        if gap.length - 2 * END_MATCH > 0.05:
            mid = substring(gap, END_MATCH, gap.length - END_MATCH)
            crossed = any(br[int(k)].intersects(mid.buffer(0.01)) for k in bt.query(mid.buffer(0.01)))
        # (b) and each end must land on a wall's end, not in the middle of nothing
        ends_ok = True
        for p in (a, b):
            near = [br[int(k)] for k in bt.query(p.buffer(TOL_GATE))]
            if not any(_at_an_end(run, p, END_MATCH) for run in near):
                ends_ok = False
        if crossed or not ends_ok:
            out.append([g[0], g[1], g[2], g[3], g[5]])
    return out


def _at_an_end(run, p, tol):
    """True if `p` is within `tol` of either end of `run`."""
    return run.distance(Point(run.coords[0])) <= tol or run.distance(Point(run.coords[-1])) <= tol


def main(argv):
    path, ti, tj = argv[0], int(argv[1]), int(argv[2])
    city = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__)))), "out", "city")
    if "--city" in argv:
        city = argv[argv.index("--city") + 1]
    tile = json.load(open(path))

    br = [LineString([(p[0], p[1]) for p in b["p"]]) for b in tile.get("br") or []]
    bt = STRtree(br) if br else None

    # 1. a gate is a passable gap - see `gate_findings` for the rule and why it is worded that way
    examples = gate_findings(tile, br)
    off_run = len(examples)
    print(f"gt gaps: {len(tile.get('gt') or [])}, of which blocked by a wall or not ending "
          f"on one: {off_run}")
    examples = examples[:5]
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
