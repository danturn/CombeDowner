"""What tools/roofs/ shares: the lidar and the map's squares, opened the way prep_map.py opens them.

Each building of a built square (web/public/maps/<map>/<ti>_<tj>.json) is taken as the game has it,
outline and all, so the survey is read under exactly the roof the game draws.
"""
import json, math, os, sys

import numpy as np
import shapely

TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, TOOLS)
ROOT = os.path.join(TOOLS, "..")

from area import area          # noqa: E402
from lidar import Lidar, INSET, PX, MIN_ABOVE, THROUGH      # noqa: E402

OFFSET_REACH, OFFSET_MIN = 150.0, 5     # as prep_map.py: the two grounds' offset is taken round each building


def open_lidar(map_id, raw=None):
    A = area(map_id, wide=True)
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    raw = raw or os.path.join(ROOT, "data", "raw", map_id, "wide")
    return Lidar(os.path.join(raw, "lidar"), (lon0, lat0, kx, ky))


def square(map_id, sq):
    with open(os.path.join(ROOT, "web", "public", "maps", map_id, f"{sq}.json")) as f:
        return json.load(f)


def footprint(b):
    rings = b["r"]
    return shapely.Polygon(rings[0], [h for h in rings[1:] if len(h) >= 3]).buffer(0)


def grid_in(poly, inset=INSET, px=PX):
    """Sample points every px metres, inset metres inside the walls."""
    inner = poly.buffer(-inset)
    if inner.is_empty: return np.zeros(0), np.zeros(0)
    x0, y0, x1, y1 = inner.bounds
    gx, gy = np.meshgrid(np.arange(x0 + px / 2, x1, px), np.arange(y0 + px / 2, y1, px))
    gx, gy = gx.ravel(), gy.ravel()
    keep = shapely.contains_xy(inner, gx, gy)
    return gx[keep], gy[keep]


def wall_ground(lidar, poly):
    ring = np.array(poly.exterior.coords)
    g = lidar.ground(ring[:, 0], ring[:, 1])
    return float(np.nanmin(g)) if not np.all(np.isnan(g)) else None


def ground_offsets(lidar, blds, polys):
    """For each building, the survey's ground less the map's round it (prep_map.ground_offset),
    and the survey's lowest ground at its own walls."""
    bases = [wall_ground(lidar, p) if not p.is_empty else None for p in polys]
    have = [i for i, v in enumerate(bases) if v is not None]
    lift = np.array([bases[i] - blds[i]["g"] for i in have])
    tree = shapely.STRtree(shapely.points([polys[i].centroid.coords[0] for i in have])) if have else None
    out = []
    for p in polys:
        if tree is None or p.is_empty: out.append(0.0); continue
        near = tree.query(p.centroid.buffer(OFFSET_REACH))
        out.append(float(np.median(lift[near])) if len(near) >= OFFSET_MIN else 0.0)
    return out, bases


REACH = 3.0         # metres: the furthest a footprint is taken to be off the survey's building
RAISED = 2.0        # metres over the bare ground that is building
PARTY = 0.6         # metres: a wall this close to another footprint is shared with it


class Patch:
    """The survey round one footprint, on a half-metre grid lined up with the map, so it can be
    read anywhere in it (bilinear) without going back to the National Grid each time."""

    def __init__(self, lidar, poly, margin=REACH + 2.5):
        x0, y0, x1, y1 = poly.bounds
        self.x0, self.y0 = x0 - margin, y0 - margin
        xs = np.arange(self.x0, x1 + margin + PX, PX)
        ys = np.arange(self.y0, y1 + margin + PX, PX)
        gx, gy = np.meshgrid(xs, ys)
        dsm, dtm = lidar.surface_and_ground(gx.ravel(), gy.ravel())
        self.shape = gx.shape
        self.dsm, self.dtm = dsm.reshape(gx.shape), dtm.reshape(gx.shape)
        self.last = None
        if "last" in lidar.grids:
            e, n = lidar._bng(gx.ravel(), gy.ravel())
            self.last = lidar._sample("last", e, n).reshape(gx.shape)

    def at(self, grid, x, y, order=1):
        from scipy.ndimage import map_coordinates
        return map_coordinates(grid, [(np.asarray(y) - self.y0) / PX, (np.asarray(x) - self.x0) / PX], order=order, mode="nearest", cval=np.nan)


def free_edges(poly, others, step=0.5):
    """Points along the footprint's walls that no other footprint stands against, each with its
    outward normal: where the survey's roof must drop to the ground."""
    pts, nrm = [], []
    near = shapely.union_all(others).buffer(PARTY) if others else None
    ring = np.array(poly.exterior.coords)
    sign = 1 if shapely.Polygon(ring).exterior.is_ccw else -1
    for a, b in zip(ring[:-1], ring[1:]):
        L = math.dist(a, b)
        if L < 0.5: continue
        ux, uy = (b - a) / L
        nx, ny = uy * sign, -ux * sign
        for t in np.arange(step / 2, L, step):
            x, y = a[0] + ux * t, a[1] + uy * t
            if near is not None and near.contains(shapely.Point(x, y)): continue
            pts.append((x, y)); nrm.append((nx, ny))
    return np.array(pts).reshape(-1, 2), np.array(nrm).reshape(-1, 2)


def register(lidar, poly, others=(), patch=None):
    """How far the survey's building lies from its footprint (dx, dy, metres), so the roof can be
    read off the survey where it really is and laid on the walls as drawn. The open data's
    outlines are often a metre or two off the lidar, which reads a ridge as a slope. The shift
    taken is the one that puts the survey's drops to the ground on the footprint's free walls
    (those not shared with a neighbour) and fills the footprint with raised surface; along a
    terrace only its front and back say anything, and the nearest of the near-best shifts is kept."""
    P = patch or Patch(lidar, poly)
    ep, en = free_edges(poly, list(others))
    gx, gy = grid_in(poly, inset=0.5)
    if len(gx) < 8: return 0.0, 0.0, P
    above = P.dsm - P.dtm
    if np.isnan(above).mean() > 0.2: return 0.0, 0.0, P
    above = np.nan_to_num(above)
    dsm = np.nan_to_num(P.dsm, nan=float(np.nanmin(P.dsm)) if not np.all(np.isnan(P.dsm)) else 0.0)
    n = int(round(REACH / PX))
    scores = []
    for j in range(-n, n + 1):
        for i in range(-n, n + 1):
            dx, dy = i * PX, j * PX
            fill = float(np.mean(P.at(above, gx + dx, gy + dy) > RAISED))
            drop = 0.0
            if len(ep):
                inn = P.at(dsm, ep[:, 0] - en[:, 0] * 0.75 + dx, ep[:, 1] - en[:, 1] * 0.75 + dy)
                out = P.at(dsm, ep[:, 0] + en[:, 0] * 0.75 + dx, ep[:, 1] + en[:, 1] * 0.75 + dy)
                drop = float(np.mean(np.clip(inn - out, 0, 4)))
            scores.append((drop + 3 * fill, math.hypot(dx, dy), dx, dy))
    top = max(s[0] for s in scores)
    _, _, dx, dy = min((s for s in scores if s[0] >= top - 0.1), key=lambda s: s[1])
    return dx, dy, P
