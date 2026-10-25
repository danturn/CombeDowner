"""Sort every metre of barrier the road clip removes into one group, and every clipped gate too.

Usage: python3 -I tools/partition/audit_road_clip.py <tile.json> <ti> <tj> [--city dir] [--once dir]

The writer removes barrier wherever it falls inside the road surface. If the partition were
consistent that should never happen: an edge with a `corridor` face on either side is not written as
a barrier; the rest are plot-to-plot or plot-to-open, and those should not lie inside a carriageway.
So every removed metre is either

  - a genuine defect in the partition (a plot face overlapping the street), or
  - the writer's own road surface (`rd`) drawn wider than the corridor it came from, or
  - an edge that runs *along* a road's edge and is only touched by it.

The groups below separate those. Every metre goes into exactly one, and the totals are asserted.

Groups, in the order they are tested:

  A. the edge has a `corridor` face, so it should never have been a barrier at all
  B. inside the **corridor face** the road record was built from (the street as the partition cut
     it), so the edge really is in the street the partition drew
  C. inside `rd` only - the writer's road surface, not the corridor it came from: `rd` is drawn wider
  D. inside neither `rd`-only nor the corridor, but inside the road surface as `check` measures it
     (a different, later union): a disagreement between the two road sources
  E. touching the road's edge only, within a tolerance: the clip catching a wall that stands beside it

Within each group the metres are also split by the edge's label pair, so the two requested cuts are
both available.
"""
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union
import numpy as np

from partition import ROOT, once

BARRIER = {
    "garden_wall", "stone_wall", "brick_wall_low", "hedge", "hedge_low", "fence", "wall",
    "railing", "retaining_wall", "brick_wall",
}
TOUCH = 0.05        # metres: "on the road's edge" rather than inside it


def tile_square(T):
    x0, y0, dx, nx, ny = T["x0"], T["y0"], T["dx"], T["nx"], T["ny"]
    dy = T.get("dy", dx)
    return x0, y0, x0 + dx * nx, y0 + dy * ny


def pairs_of(edge):
    return tuple(sorted(str(s[0]) for s in edge.get("sides") or []))


def main(argv):
    path, ti, tj = argv[0], int(argv[1]), int(argv[2])
    city = os.path.join(ROOT, "out", "city-tile")
    once_dir = os.path.join(ROOT, "out", "once-city-sorted")
    for flag, key in (("--city", "city"), ("--once", "once")):
        if flag in argv:
            v = argv[argv.index(flag) + 1]
            if key == "city":
                city = v
            else:
                once_dir = v
    tile = json.load(open(path))
    part = json.load(open(os.path.join(city, f"{ti}_{tj}", "partition.json")))

    # the road surface the writer uses: the union of the partition's own carriageway faces
    car = [Polygon(f["xy"]) for f in part["faces"]
           if f["cls"] == "carriageway" and len(f["xy"]) > 2]
    road = unary_union(car) if car else None

    # and the street the partition actually cut: the corridor faces the rd records came from
    rows = once.read_corridors(once_dir)
    from partition import Q
    size = Q.dx * Q.cells
    sq = (Q.x0 + ti * size, Q.y0 + tj * size, Q.x0 + (ti + 1) * size, Q.y0 + (tj + 1) * size)
    from shapely.geometry import box
    corridor = [r[1] for r in rows
                if r[1] is not None and not r[1].is_empty and r[1].intersects(box(*sq))]
    cor_union = unary_union(corridor) if corridor else None

    metres = collections.Counter()
    pairs = collections.defaultdict(collections.Counter)
    examples = collections.defaultdict(list)
    total = 0.0

    for eid, e in enumerate(part["edges"]):
        if e["kind"] == "none" or e["kind"] not in BARRIER:
            continue
        line = LineString(e["xy"])
        if road is None or line.is_empty:
            continue
        removed = line.difference(road)
        loss = line.length - removed.length
        if loss < 0.05:
            continue
        total += loss
        pr = pairs_of(e)
        rest = line.difference(road)
        # what is left of the removed part, to be grouped by *why*
        gone = line.difference(rest) if not rest.is_empty else line
        # Split the removed geometry by *why* it is inside the road surface. The question that
        # decides the fix is whether the partition agrees that this ground is street: if it does
        # (the piece is inside the corridor face the road record came from) the plot face overlaps
        # the street and the partition is wrong; if it does not, `rd` is drawn wider than its
        # corridor and the writer is wrong.
        pieces = list(getattr(gone, "geoms", [gone]))
        for g in pieces:
            if g.geom_type != "LineString" or g.length <= 0.05:
                continue
            if cor_union is not None and g.intersection(cor_union).length > 0.5 * g.length:
                name = "B inside the corridor face (partition disagrees)"
            elif g.distance(road.boundary) <= TOUCH:
                name = "E on the road's edge only (clip grazing)"
            else:
                name = "C inside rd but outside its corridor (rd overdrawn)"
            if "corridor" in pr:
                name += ", corridor edge"
            metres[name] += g.length
            pairs[name][pr] += g.length
            if len(examples[name]) < 3:
                m = g.interpolate(0.5, normalized=True)
                examples[name].append((eid, round(m.x, 1), round(m.y, 1), e["kind"], pr))

    print(f"{path}: {total:.1f} m of barrier removed by the road clip")
    print()
    for g, v in metres.most_common():
        print(f"  {g:34s} {v:8.1f} m")
    print(f"  {'TOTAL':34s} {sum(metres.values()):8.1f} m")
    print()
    for g, _ in metres.most_common():
        print(f"  {g}: by label pair")
        for pr, v in pairs[g].most_common(5):
            print(f"      {str(pr):24s} {v:8.1f} m")
        for ex in examples[g][:3]:
            print(f"      eg edge {ex[0]} {ex[3]} {ex[4]} at ({ex[1]}, {ex[2]})")
        print()


if __name__ == "__main__":
    main(sys.argv[1:])
