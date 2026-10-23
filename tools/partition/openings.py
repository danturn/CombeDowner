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
import numpy as np
from shapely.geometry import Point
from shapely.strtree import STRtree

GATE = 1.0              # metres wide
DRIVE = 2.8             # metres wide
EDGE_STUB = 0.9         # metres: the wall left each side of an opening
REACH = 0.5             # metres: how close open ground must be to a corridor to reach it


def front_edges(plots, pedges, corridors=None, preferred=None):
    """For each building index, the plot edge that faces its house: the front, evidence or registered
    parcel edge of its own plot nearest the house. Returns {building index: [edge id]}.

    'parcel' counts as a front source: after stage 2 a plot's street edge is very often a registered
    boundary, so a front read off only the classified 'front' and 'evidence' pieces misses most
    houses in the city - and the gate check below would report them all as having no way in.

    So does an edge whose far side is open ground that itself reaches a corridor: a title often stops
    at the back of a verge, leaving a strip of open land between a front garden and the pavement, and
    the plot is still reached from the street across it. Without this the gate check would ask those
    houses to have a way in through a boundary it never gave them a gate for."""
    out, party = {}, {}
    ctree = STRtree(list(corridors)) if corridors else None
    ptree = STRtree([p for p, _, _ in plots])
    for eid, pe in enumerate(pedges):
        edge, kind = pe[0], pe[1]
        if kind == "none":
            continue
        for pi, (poly, pkind, bidx) in enumerate(plots):
            if pkind != "plot" or bidx is None:
                continue
            if poly.boundary.distance(edge) > 0.5:
                continue
            if pe[3] == "front" or _open_beyond(poly, edge, plots, ptree, ctree, corridors):
                out.setdefault(bidx, []).append(eid)
                if preferred is not None:
                    preferred.add((bidx, eid))
            elif pe[3] in ("evidence", "parcel"):
                # A registered or seen line with a garden beyond is the fence between neighbours. It
                # touches the house, so as a front it won the gate and the path ran along it: in
                # Oldfield Park 953 of 2,174 gates stood in a party fence.
                beyond = _far_sides(poly, edge, plots, ptree)
                (party if any(qk == "plot" for _q, qk in beyond) else out).setdefault(bidx, []).append(eid)
    for bidx, eids in party.items():
        out.setdefault(bidx, eids)
    return out


def _far_sides(poly, edge, plots, ptree):
    """The faces on the far side of a plot edge, sampled just either side of its midpoint."""
    m = edge.interpolate(0.5, normalized=True)
    c = list(edge.coords)
    a, b = np.array(c[0], float), np.array(c[-1], float)
    d = b - a
    L = np.hypot(*d)
    if L == 0:
        return []
    nrm = np.array([-d[1], d[0]]) / L
    out = []
    for sgn in (1.0, -1.0):
        p = Point(m.x + nrm[0] * sgn * 0.6, m.y + nrm[1] * sgn * 0.6)
        if poly.distance(p) <= 0.05:
            continue
        for k in np.atleast_1d(ptree.query(p)):
            q, qk, _qb = plots[int(k)]
            if q.contains(p):
                out.append((q, qk))
    return out


def _open_beyond(poly, edge, plots, ptree, ctree, corridors):
    """Whether the ground on the far side of a plot edge is open land reaching a corridor. Such an
    edge is a front in every way that matters - the plot is reached from the street across the open
    ground - so it gets the same gate in its boundary as a plot fronting the street directly."""
    if ctree is None:
        return False
    for q, qk in _far_sides(poly, edge, plots, ptree):
        if qk != "open":
            continue
        idx = np.atleast_1d(ctree.query(q.buffer(REACH)))
        if len(idx) and min(corridors[int(i)].distance(q) for i in idx) <= REACH:
            return True
    return False


def find_openings(plots, pedges, houses, paths=(), corridors=None):
    """plots: [(polygon, kind, building index)]; pedges: [(line, kind, support, source)];
    houses: {building index: polygon}; paths: [(line, width, class)].

    Returns [(edge id, position along the edge in metres, width, kind)]."""
    out = []
    preferred = set()
    for bidx, eids in front_edges(plots, pedges, corridors, preferred).items():
        house = houses.get(bidx)
        if house is None:
            continue
        # The gate goes in the front the house actually gets out through. A house with a front onto a
        # strip of open ground that reaches the street (a title often stops at the back of the verge)
        # gets out that way, so an edge whose far side is that open ground is preferred over one
        # merely nearest the house: gating the nearest instead left the way out walled off (measured:
        # 910 of 913 such crossings on the village square were fronts and still had no gate, and
        # 1058 of 1176 verge hedges had no opening).
        # ties broken by the edge id, not by the order the fronts were collected in
        eid = min(eids, key=lambda e: ((bidx, e) not in preferred, pedges[e][0].distance(house), e))
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
        for eid, pe in enumerate(pedges):
            edge, kind = pe[0], pe[1]
            if kind == "none" or not line.crosses(edge):
                continue
            t = edge.project(line.intersection(edge).representative_point())
            L = edge.length
            if t < EDGE_STUB or L - EDGE_STUB < t:
                continue
            if L <= width:
                out.append(dict(edge=eid, t=L / 2, width=L, kind="path"))
                continue
            # slid along to fit the edge; it still spans the crossing, which is at least a stub in
            t = min(max(t, width / 2), L - width / 2)
            out.append(dict(edge=eid, t=t, width=width, kind="path"))
    return out
