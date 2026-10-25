"""What is the thin face between two parallel boundaries under a metre apart?

Usage: python3 -I tools/partition/audit_doubled.py <ti> <tj> [--city dir] [--tiles dir]

`check_map` reports two barriers running along each other ("9 walls doubled", "9 walls a metre
apart"). Two parallel boundaries with a sliver between them means the partition made a face that thin,
so this finds, for each doubled barrier pair, the partition face that fills the gap and says what it
is: its class, its width, its area, and whether it is a face worth having at all.

The categories are the plan's own: a `plot` face is a real garden; `open` is ground of the block;
`path`, `pavement` and `carriageway` are corridor; `building` is a house; anything else is a fragment.
"""
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import shapely
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

MAX_GAP = 1.0       # metres between the two barriers, `check_map`'s own threshold
MIN_ALONG = 1.0     # metres they must run alongside to be a pair


def main(argv):
    ti, tj = int(argv[0]), int(argv[1])
    city = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__)))), "out", "city-tile")
    for flag in ("--city", "--tiles"):
        if flag in argv:
            v = argv[argv.index(flag) + 1]
            if flag == "--city":
                city = v
    part = json.load(open(os.path.join(city, f"{ti}_{tj}", "partition.json")))
    faces = [(f["cls"], Polygon(f["xy"])) for f in part["faces"] if len(f["xy"]) > 2]

    BARRIER = {"garden_wall", "stone_wall", "brick_wall_low", "hedge", "hedge_low", "fence", "wall",
               "railing", "retaining_wall", "brick_wall"}
    bars = [(i, LineString(e["xy"]), e)
            for i, e in enumerate(part["edges"])
            if e["kind"] in BARRIER and e["kind"] != "none"]
    tree = shapely.STRtree([b for _, b, _ in bars])

    pairs = []
    seen = set()
    for k, (i, L, e) in enumerate(bars):
        if L.length < MIN_ALONG:
            continue
        for j in tree.query(L.buffer(MAX_GAP)):
            j = int(j)
            if j <= k:
                continue
            Lj = bars[j][1]
            if Lj.length < MIN_ALONG:
                continue
            # Two boundaries that *meet* are a corner, not a doubling, and at gap 0 the first form of
            # this test matched every pair of edges sharing an endpoint - 1,946 "pairs" whose median
            # face was 55 m2, which is a garden, not a sliver. A doubling is two lines running
            # parallel with empty ground between them: they must not touch, they must be close, and
            # they must be parallel along most of their shared span.
            gap = L.distance(Lj)
            if gap <= 0.01 or gap > MAX_GAP:
                continue
            # parallel: the direction of one against the other, over the stretch that overlaps
            try:
                proj = Lj.project(L.interpolate(0.5, normalized=True))
                a = L.interpolate(0.5, normalized=True)
                b = Lj.interpolate(min(max(proj, 0.0), Lj.length))
                if a.distance(b) <= 0.01:
                    continue
                # along-length: how much of L stays within MAX_GAP of Lj
                shared = L.intersection(Lj.buffer(MAX_GAP)).length
            except Exception:
                continue
            if shared < MIN_ALONG or shared < 0.5 * min(L.length, Lj.length):
                continue
            key = (min(i, bars[j][0]), max(i, bars[j][0]))
            if key in seen:
                continue
            seen.add(key)
            pairs.append((i, bars[j][0], L, Lj, gap, shared))

    # what fills each gap: the face between the two lines, by area per metre of pair
    ftree = shapely.STRtree([g for _, g in faces])
    fills = collections.Counter()
    widths = collections.defaultdict(list)
    areas = collections.defaultdict(list)
    examples = collections.defaultdict(list)
    for i, j, L, Lj, gap, shared in pairs:
        mid = LineString([L.interpolate(0.5, normalized=True),
                          Lj.interpolate(0.5, normalized=True)]).interpolate(0.5, normalized=True)
        best = None
        for k in ftree.query(shapely.geometry.Point(mid).buffer(MAX_GAP * 2)):
            cls, g = faces[int(k)]
            if g.covers(mid):
                if best is None or g.area < best[1].area:
                    best = (cls, g)
        cls = best[0] if best else "no face covers the gap"
        fills[cls] += 1
        if best:
            widths[cls].append(gap)
            areas[cls].append(best[1].area)
        if len(examples[cls]) < 3:
            examples[cls].append((i, j, round(mid.x, 1), round(mid.y, 1), round(gap, 2),
                                  round(shared, 1),
                                  round(best[1].area, 2) if best else None))

    print(f"square {ti},{tj}: {len(pairs)} doubled barrier pairs (<{MAX_GAP} m apart)")
    print()
    for cls, n in fills.most_common():
        w = widths.get(cls) or [0]
        a = areas.get(cls) or [0]
        med_w = sorted(w)[len(w) // 2]
        med_a = sorted(a)[len(a) // 2]
        print(f"  {cls:28s} {n:5d} pairs   median gap {med_w:5.2f} m   median face area "
              f"{med_a:7.2f} m2")
        for ex in examples[cls]:
            print(f"      edges {ex[0]}/{ex[1]} at ({ex[2]}, {ex[3]}) gap {ex[4]} m, "
                  f"alongside {ex[5]} m, face {ex[6]} m2")
        print()


if __name__ == "__main__":
    main(sys.argv[1:])
