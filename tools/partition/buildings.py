"""The buildings the partition is fitted to first.

Buildings are what everything else gives way to, so they are cleaned as a set before anything is
fitted around them: footprints within CLOSE of one another are snapped to share a wall (a party
wall between neighbours reads as two footprints a hand's width apart in the data), and overlaps
the snapping creates are removed, later footprints giving way to earlier ones. This is the first
thing the surface and the plots agree on, so it is done once, here.
"""
from shapely.geometry import MultiPolygon  # noqa
from shapely.ops import snap
from shapely.strtree import STRtree

CLOSE = 0.6         # metres: neighbours within this are snapped to share a wall
MIN_AREA = 4.0      # m^2: smaller than this is a shed, a bay or noise, not a building


def clean_buildings(polys):
    """Footprints as a set: neighbours within CLOSE are snapped to share a wall, overlaps removed."""
    polys = [p if p.is_valid else p.buffer(0) for p in polys]
    polys = [p for p in polys if not p.is_empty and p.area > MIN_AREA]
    tree = STRtree(polys)
    out = list(polys)
    closed = 0
    # Sorted by index in both passes: the second pass makes a later footprint yield to an earlier one
    # it overlaps, so the order here decides who gives way - and an STRtree's query order depends on
    # how the index was built, which would make the cleaning depend on the input order rather than on
    # the footprints.
    for i, p in enumerate(polys):
        for j in sorted(int(j) for j in tree.query(p.buffer(CLOSE))):
            if j == i:
                continue
            q = polys[j]
            d = p.distance(q)
            if 0 < d < CLOSE:
                out[i] = snap(out[i], q, CLOSE)
                closed += 1
    res = []
    tree = STRtree(out)
    for i, p in enumerate(out):
        for j in sorted(int(j) for j in tree.query(p)):
            if j < i and out[j].intersects(p) and out[j].intersection(p).area > 0.05:
                p = p.difference(out[j])
        if p.geom_type == "MultiPolygon":
            p = max(p.geoms, key=lambda g: g.area)
        if p.is_valid and not p.is_empty and p.area > MIN_AREA:
            res.append(p)
    return res, closed // 2
