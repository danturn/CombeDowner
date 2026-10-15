"""Openings: where a plot's boundary is broken for a gate, a drive or a path.

A plot edge is only ever drawn where the boundary really continues, so every break in it is
recorded here as (edge id, position along the edge in metres, width, kind) and stage 4 cuts the
line there:

- a gate stands in a plot's front, in front of the house, a metre wide: the point of the front
  edge nearest the house, which is where the front door faces (the game's own door pass is the
  authority on the door's exact place; stage 4 centres the gate on it once the partition writes
  the file);
- a drive stands where a service way or a track crosses the front, 2.8 m wide;
- an opening is made wherever a path crosses a plot edge, the path's own width.

A gate is only recorded where the edge continues on both sides of it, so it never leaves a stub of
wall; the checks in metrics.py hold to that.
"""

GATE = 1.0              # metres wide
DRIVE = 2.8             # metres wide
EDGE_STUB = 0.9         # metres: the wall left each side of an opening


def front_edges(plots, pedges):
    """For each building index, the plot edge that faces its house: the front, evidence or registered
    parcel edge of its own plot nearest the house. Returns {building index: [edge id]}.

    'parcel' counts as a front source: after stage 2 a plot's street edge is very often a registered
    boundary, so a front read off only the classified 'front' and 'evidence' pieces misses most
    houses in the city - and the gate check below would report them all as having no way in."""
    out = {}
    for eid, (edge, kind, sup, src) in enumerate(pedges):
        if kind == "none" or src not in ("front", "evidence", "parcel"):
            continue
        for pi, (poly, pkind, bidx) in enumerate(plots):
            if pkind != "plot" or bidx is None:
                continue
            if poly.boundary.distance(edge) > 0.5:
                continue
            out.setdefault(bidx, []).append(eid)
    return out


def find_openings(plots, pedges, houses, paths=()):
    """plots: [(polygon, kind, building index)]; pedges: [(line, kind, support, source)];
    houses: {building index: polygon}; paths: [(line, width, class)].

    Returns [(edge id, position along the edge in metres, width, kind)]."""
    out = []
    for bidx, eids in front_edges(plots, pedges).items():
        house = houses.get(bidx)
        if house is None:
            continue
        eid = min(eids, key=lambda e: pedges[e][0].distance(house))
        edge = pedges[eid][0]
        L = edge.length
        if L < 2 * EDGE_STUB + GATE:
            # a front too short for a gate and a stub of wall either side is left open, as the
            # current build does (gardens.py): a break the width of the whole front, nothing drawn
            out.append(dict(edge=eid, t=L / 2, width=L, kind="open"))
            continue
        t = edge.project(house.centroid)
        t = min(max(t, EDGE_STUB + GATE / 2), L - EDGE_STUB - GATE / 2)
        out.append(dict(edge=eid, t=t, width=GATE, kind="gate"))
    for line, width, cls in paths:
        for eid, (edge, kind, sup, src) in enumerate(pedges):
            if kind == "none" or not line.crosses(edge):
                continue
            t = edge.project(line.intersection(edge).representative_point())
            if t < EDGE_STUB or edge.length - EDGE_STUB < t:
                continue
            out.append(dict(edge=eid, t=t, width=width, kind="path"))
    return out
