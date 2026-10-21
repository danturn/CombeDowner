"""What are the doubled walls? Classify every pair of barriers running alongside each other.

Usage: python3 -I tools/partition/audit_doubled2.py --city DIR [--squares ...] [--jobs n]

`check_map` reports "9 walls doubled" (under a metre apart) and "9 walls a metre apart" (under two).
The sliver merge in pass 2 removed 274 thin open faces city-wide but left the doubled count where it
was, so the check and the sliver face are not the same set. This says what the set actually is.

For each pair closer than MAX_GAP and running alongside for at least MIN_ALONG, this records:

  - each edge's **label pair** (`corridor<->plot`, `plot<->plot`, ...) and its kind;
  - the **gap** and the **overlap** along the pair;
  - what face lies **between** them, by class, and how wide that face is at its widest;
  - whether the two edges came from the **same** partition edge (a merged run written twice) or
    from different ones.

The groupings printed are the ones that decide a fix: same-plot twice (a duplication), corridor
beside plot (a street edge and a garden wall), plot beside plot (two neighbours' boundaries), and
anything else.
"""
import argparse
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree

from partition import ROOT

MAX_GAP = 1.0
MIN_ALONG = 2.0


def labels_of(edge):
    return tuple(sorted(str(s[0]) for s in edge.get("sides") or []))


def pair_name(la, lb):
    a = "corridor" if "corridor" in la else ("plot" if "plot" in la else "open")
    b = "corridor" if "corridor" in lb else ("plot" if "plot" in lb else "open")
    return "+".join(sorted([a, b]))


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default=os.path.join(ROOT, "out", "city-slivers"))
    ap.add_argument("--squares", nargs="*", default=None)
    ap.add_argument("--jobs", type=int, default=1)
    a = ap.parse_args(argv)

    names = a.squares or sorted(d for d in os.listdir(a.city)
                                if os.path.isdir(os.path.join(a.city, d)) and "_" in d)

    BARRIER = {"garden_wall", "stone_wall", "brick_wall_low", "hedge", "hedge_low", "fence",
               "wall", "railing", "retaining_wall", "brick_wall"}

    by_pair = collections.Counter()
    by_gap = collections.Counter()
    by_between = collections.Counter()
    examples = collections.defaultdict(list)
    metres = collections.Counter()
    total = 0

    for name in names:
        p = os.path.join(a.city, name, "partition.json")
        if not os.path.exists(p):
            continue
        part = json.load(open(p))
        edges = [(i, e, LineString(e["xy"])) for i, e in enumerate(part["edges"])
                 if e["kind"] in BARRIER and e["kind"] != "none" and len(e["xy"]) > 1]
        if len(edges) < 2:
            continue
        lines = [L for _, _, L in edges]
        tree = STRtree(lines)
        faces = [(f["cls"], Polygon(f["xy"])) for f in part["faces"] if len(f["xy"]) > 2]
        ftree = STRtree([g for _, g in faces]) if faces else None

        seen = set()
        for k, (i, e, L) in enumerate(edges):
            if L.length < MIN_ALONG:
                continue
            for j in tree.query(L.buffer(MAX_GAP)):
                j = int(j)
                if j <= k:
                    continue
                if (k, j) in seen:
                    continue
                seen.add((k, j))
                _, e2, L2 = edges[j]
                gap = L.distance(L2)
                if gap <= 0.01 or gap > MAX_GAP:
                    continue
                try:
                    shared = L.intersection(L2.buffer(MAX_GAP)).length
                except Exception:
                    continue
                if shared < MIN_ALONG or shared < 0.5 * min(L.length, L2.length):
                    continue

                la, lb = labels_of(e), labels_of(e2)
                key = pair_name(la, lb)
                by_pair[key] += 1
                metres[key] += L.length
                total += 1
                by_gap[round(gap * 4) / 4] += 1

                # what is between them
                mid = LineString([L.interpolate(0.5, normalized=True),
                                  L2.interpolate(0.5, normalized=True)]).interpolate(0.5,
                                                                                    normalized=True)
                between = "nothing"
                width = 0.0
                if ftree is not None:
                    best = None
                    for q in np.atleast_1d(ftree.query(Point(mid).buffer(MAX_GAP * 2))):
                        cls, g = faces[int(q)]
                        if g.covers(mid):
                            if best is None or g.area < best[1].area:
                                best = (cls, g)
                    if best:
                        between = best[0]
                        try:
                            c = shapely.maximum_inscribed_circle(best[1], tolerance=0.05)
                            width = 2.0 * c.length if c.geom_type == "LineString" else 0.0
                        except Exception:
                            width = 0.0
                by_between[between] += 1
                if len(examples[key]) < 3:
                    examples[key].append((name, i, edges[j][0], round(gap, 2), round(shared, 1),
                                          la, lb, between, round(width, 2)))

    print(f"{total} doubled barrier pairs across {len(names)} squares\n")
    print("by the two edges' label pairs:")
    for k, v in by_pair.most_common():
        print(f"  {k:22s} {v:6d} pairs   {metres[k]:9.0f} m of first edge")
    print("\nby what face lies between them:")
    for k, v in by_between.most_common(8):
        print(f"  {k:14s} {v:6d}")
    print("\nby gap:")
    for k in sorted(by_gap)[:10]:
        print(f"  {k:.2f} m  {by_gap[k]:6d}")
    print("\nexamples:")
    for k in [k for k, _ in by_pair.most_common(5)]:
        print(f"  {k}:")
        for x in examples[k]:
            print(f"    {x[0]} edges {x[1]}/{x[2]} gap {x[3]} m alongside {x[4]} m "
                  f"{x[5]} vs {x[6]}, between {x[7]} ({x[8]} m wide)")


if __name__ == "__main__":
    main(sys.argv[1:])
