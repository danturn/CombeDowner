"""One surface: every face of the partition triangulated together and given heights.

The partition's faces are noded against each other (so no two overlap and none leave a gap) and
each takes the class of the highest-priority layer over it. Every face is then triangulated and
each vertex given a height by its class: a street carriageway follows a smooth profile fitted to
the terrain along its centre line, a pavement sits a kerb above it, a path follows the ground, a
building sits at the lowest ground under its footprint, and open land is the terrain. The result
is checked: how much of the square no face covers (a hole) and how much faces overlap.

This is the layer the game walks on in stage 5; through stage 4 it is the check that the partition
really is one surface.
"""

import numpy as np
import shapely
from shapely.geometry import Point
from shapely.strtree import STRtree
from shapely.ops import polygonize, unary_union

KERB = 0.12
PRIORITY = {"building": 0, "carriageway": 1, "pavement": 2, "path": 3, "plot": 4, "open": 5}


def partition(layers, SQ):
    """The layers' polygons noded together into one set of faces with no overlaps and no gaps:
    every face takes the class of the highest-priority layer polygon over it, and land nothing
    covers is open."""
    bounds = unary_union([g.boundary for g, _, _ in layers] + [SQ.boundary])
    faces = [f for f in polygonize(bounds) if f.area > 0.01 and f.representative_point().within(SQ)]
    tree = STRtree([g for g, _, _ in layers])
    out = []
    for f in faces:
        rp = f.representative_point()
        best = None
        for k in tree.query(rp):
            g, c, d = layers[k]
            if g.contains(rp) and (best is None or PRIORITY[c] < PRIORITY[best[1]]):
                best = (g, c, d)
        out.append((f, best[1], best[2]) if best else (f, "open", None))
    return out


def height_at(x, y, cls, data, T, prof):
    if cls in ("carriageway", "pavement", "path"):
        edge, ts, zs = prof[data]
        t = edge["line"].project(Point(x, y))
        z = float(np.interp(t, ts, zs))
        return z + (KERB if cls == "pavement" else 0.0)
    if cls == "building":
        return data
    return T.elev(x, y)


def road_profile(edge, T):
    """Smooth height profile along a street: the terrain sampled every 4 m, then smoothed so the
    grade changes gently."""
    n = max(2, int(edge["line"].length / 4) + 1)
    ts = np.linspace(0, edge["line"].length, n)
    zs = np.array([T.elev(p.x, p.y) for p in (edge["line"].interpolate(t) for t in ts)])
    k = min(5, n)
    if n > 2:
        pad = np.pad(zs, (k // 2, k // 2), mode="edge")
        zs = np.convolve(pad, np.ones(k) / k, mode="valid")[:n]
    return edge, ts, zs


def surface(faces, T, prof):
    """faces: [(polygon, cls, data)]. Triangulate each face and give every vertex a height by its
    class. Returns triangles [(cls, [(x,y,z)...])] and the count of faces that failed."""
    tris, bad = [], 0
    for pg, cls, data in faces:
        if pg.is_empty or pg.area < 0.01:
            continue
        try:
            tri = shapely.constrained_delaunay_triangles(pg)
        except Exception:
            bad += 1; continue
        for t in tri.geoms:
            pts = []
            for x, y in list(t.exterior.coords)[:3]:
                pts.append((x, y, height_at(x, y, cls, data, T, prof)))
            tris.append((cls, pts))
    return tris, bad
