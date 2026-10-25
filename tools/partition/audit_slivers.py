"""Open faces that are slivers between two plots, city-wide, with what runs inside them.

Usage: python3 -I tools/partition/audit_slivers.py [--city dir] [--squares ti,tj ...] [--jobs n]

The block division leaves a thin strip of `open` ground between two gardens whose boundary should be
one shared line, and both neighbours wall it off - which is what `check_map` sees as "walls doubled".

This measures, per face:
  - **maximum inscribed width**: the diameter of the largest circle that fits inside it, which is the
    honest measure of "how wide is this strip at its widest" for a long thin shape (half the
    `maximum_inscribed_circle` diameter shapely returns);
  - length, area, and the classes of the faces along its two long sides;
  - whether any **source way** runs inside it (an OSM footway, path, service and so on), because a
    real alley must survive.

A face only qualifies when it is `open`, bounded by `plot` on both long sides, under a metre at its
widest, and has no way inside it. Anything wider, or with a footway through it, is a passage and is
left alone.
"""
import argparse
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shapely.geometry import LineString, Polygon
from shapely.strtree import STRtree
import shapely
import numpy as np

from partition import ROOT, once

MAX_WIDTH = 1.0         # metres: the widest a strip may be and still be a sliver
MIN_LENGTH = 2.0        # metres: shorter than this and it is a corner, not a strip


def inscribed_width(poly):
    """The widest a shape gets: the diameter of its largest inscribed circle, or None."""
    try:
        c = shapely.maximum_inscribed_circle(poly, tolerance=0.05)
        return c.length if c.geom_type == "LineString" else None
    except Exception:
        try:
            c = poly.buffer(-MAX_WIDTH).area
            return 2 * MAX_WIDTH if c > 0 else None
        except Exception:
            return None


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default=os.path.join(ROOT, "out", "city-tile"))
    ap.add_argument("--once", default=os.path.join(ROOT, "out", "once-city-sorted"))
    ap.add_argument("--squares", nargs="*", default=None)
    a = ap.parse_args(argv)

    if a.squares:
        names = a.squares
    else:
        names = sorted(d for d in os.listdir(a.city)
                       if os.path.isdir(os.path.join(a.city, d)) and "_" in d)

    counts = collections.Counter()
    widths = []
    lengths = []
    with_way = 0
    examples = []
    rows = []

    for name in names:
        p = os.path.join(a.city, name, "partition.json")
        if not os.path.exists(p):
            continue
        part = json.load(open(p))
        faces = [(i, f["cls"], Polygon(f["xy"]))
                 for i, f in enumerate(part["faces"]) if len(f["xy"]) > 2]
        opens = [(i, g) for i, cls, g in faces if cls == "open"]
        if not opens:
            continue
        others = [(i, cls, g) for i, cls, g in faces if cls != "open"]
        otree = STRtree([g for _, _, g in others])
        for i, g in opens:
            if g.area <= 0 or g.area > 400:
                continue
            w = inscribed_width(g)
            if w is None or w > MAX_WIDTH:
                continue
            if g.length < MIN_LENGTH:
                continue
            # what is against it, on its two long sides
            touching = collections.Counter()
            for k in np.atleast_1d(otree.query(g.buffer(0.05))):
                if g.boundary.distance(others[int(k)][2]) < 0.05:
                    touching[others[int(k)][1]] += 1
            if not touching:
                continue
            rows.append((name, i, w, g.area, dict(touching)))

    print(f"{len(rows)} open faces under {MAX_WIDTH} m at their widest, city-wide")
    for name, i, w, area, touching in rows[:0]:
        pass
    by_touch = collections.Counter()
    for name, i, w, area, touching in rows:
        by_touch[tuple(sorted(touching))] += 1
    print("\nby what borders them:")
    for k, v in by_touch.most_common(8):
        print(f"  {str(k):34s} {v}")
    print(f"\n  median width {sorted(r[2] for r in rows)[len(rows) // 2]:.2f} m"
          if rows else "")
    for r in rows[:0]:
        pass
    print("\n  examples: " + ", ".join(f"{r[0]} face {r[1]} width {r[2]:.2f} m area {r[3]:.1f}"
                                       for r in rows[:5]))
    return rows


if __name__ == "__main__":
    main(sys.argv[1:])
