"""Roofs from the lidar as a roofer would draw them: plain roofs on the rectangles of each house.

Usage: python3 -I tools/roofs/shapes.py <ti,tj> ... [--map combe-down] [--drawn <drawn.mjs>]

Today's roofs (tools/lidar.py) are one flat, gabled or hipped roof per building, no more than 5 m
from eaves to ridge. Here each footprint is cut into a few rectangles lined up on its own walls
(its main body and its wings; notches and bits sticking out under a metre are ignored), and each
rectangle gets a plain roof: flat, gabled, hipped, mansard (steep sides, flat top) or a lean-to.
The lidar only chooses between those and sizes them: which way the ridge runs, how high the eaves
and the ridge are, fitted so that chimneys, dormers and trees over the edge don't move them.
So the roofs are tidy whatever the survey shows:
- where a wing's ridge runs into the side of the main roof it carries on until it meets that
  roof's slope, as a cross gable does, so the two join in valleys;
- houses sharing party walls along a row (terraces, semis) are decided together: one kind of roof
  along the row, the ridge running along it, and one height until the survey shows a step of
  more than a metre, so both halves of a semi match and a terrace steps only where it really does;
- the survey is lined up on each group of touching footprints first (common.register): the open
  data's outlines are often a metre or two off it.
A building keeps today's roof where the lidar can't see it (trees, or newer than the survey), and
a row keeps today's roofs where the new ones don't fit the survey clearly better, taken together.

The roofs are kept as faces (tools/roofs/mesh.py), in data/<map>/measured/faces/, which the map
build reads.
"""
import json, math, os, sys, tempfile

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon, Point
from shapely.ops import polygonize, unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import open_lidar, square, footprint, Patch, register, PARTY, MIN_ABOVE, THROUGH, ROOT, PX   # noqa: E402
import mesh as M     # noqa: E402

CELL = 0.25                 # metres: the grid a footprint is cut into rectangles on
JOG = 1.0                   # metres: notches and bits sticking out narrower than this are ignored
WING_SIDE = 2.5             # metres: the narrowest rectangle with a roof of its own
MIN_PART = 6.0              # square metres: the smallest
MOST_PARTS = 5
LEFT = 0.06                 # share of the footprint that may be left to its neighbours' roofs
STEEPEST = math.tan(math.radians(62))
GENTLEST = 20                # degrees: a pitched roof's least slope; gentler, and it reads as flat
TALLEST = 14.0              # metres from eaves to ridge
STEP = 1.0                  # metres between neighbours' ridges that make a step along a row
SNAP_E, SNAP_R = 0.7, 0.6   # metres: a wing's eaves and ridge this close to its main roof's are the same
FLATTEST = 0.6              # metres: a roof rising less than this is flat
SLOPED = 1.2                # metres between the survey's low and high tenths over a roof that isn't flat
ACROSS = 0.08               # metres: how much better a ridge across a rectangle must fit than along it
ENOUGH = 12                 # samples: fewer, and a rectangle takes its heights from its neighbours
PENALTY = {"flat": 0.0, "gable": 0.0, "hip": 0.02, "mansard": 0.06, "shed": 0.04}
MANSARD_RUN = (1.2, 2.0, 3.0)
ACCEPT, GAIN, WORST = 0.8, 0.12, 1.0    # share of today's miss left, metres gained, the worst miss kept
LEAFY, LUMPY = 0.3, 0.25


# ---- cutting a footprint into rectangles ----------------------------------------------------------

def frame(poly):
    """The direction (radians, 0 to 90 degrees) most of the footprint's walls run in, or square to."""
    ring = np.array(poly.exterior.coords)
    d = np.diff(ring, axis=0)
    L = np.hypot(d[:, 0], d[:, 1])
    a = np.degrees(np.arctan2(d[:, 1], d[:, 0])) % 90
    hist = np.zeros(90)
    for ai, li in zip(a, L):
        for k in (-1, 0, 1):
            hist[int(round(ai + k)) % 90] += li * (1.0 if k == 0 else 0.5)
    peak = int(np.argmax(hist))
    near = np.abs(((a - peak + 45) % 90) - 45) <= 4
    off = ((a[near] - peak + 45) % 90) - 45
    return math.radians(peak + (float(np.sum(off * L[near]) / np.sum(L[near])) if near.any() else 0.0))


def largest(mask, least):
    """The biggest rectangle of set cells with both sides at least `least` cells: (cells, r0, r1, c0, c1)."""
    ny, nx = mask.shape
    h = np.zeros(nx, int)
    best = (0, 0, 0, 0, 0)
    for r in range(ny):
        h = np.where(mask[r], h + 1, 0)
        stack = []
        for c in range(nx + 1):
            cur = h[c] if c < nx else 0
            start = c
            while stack and stack[-1][1] >= cur:
                s, hh = stack.pop()
                w = c - s
                if hh >= least and w >= least and hh * w > best[0]: best = (hh * w, r - hh + 1, r + 1, s, c)
                start = s
            stack.append((start, cur))
    return best


class Part:
    """A rectangle of a footprint: centre c, unit axis a (b square to it), half sizes ha, hb."""
    def __init__(self, c, a, ha, hb):
        self.c, self.a, self.ha, self.hb = np.array(c, float), np.array(a, float), ha, hb
        self.b = np.array([-a[1], a[0]])
        self.poly = Polygon([self.c + self.a * s * ha + self.b * t * hb for s, t in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        self.shared = [None] * 4    # per side (a-, a+, b-, b+): (building, part, side) it's shared with
        self.joined = [None] * 4    # per side: the part of the same building it meets
        self.axis = None            # 0: ridge along a, 1: along b
        self.free = True            # whether the lidar may choose the axis
        self.model = None
        self.n = 0

    def side(self, k):
        u, s = (self.a, self.ha) if k < 2 else (self.b, self.hb)
        w, t = (self.b, self.hb) if k < 2 else (self.a, self.ha)
        m = self.c + u * s * (1 if k % 2 else -1)
        return LineString([m - w * t, m + w * t])

    def ridge_frame(self, axis=None):
        """Along the ridge (d, half length), across it (n, half width), and the sides at its ends."""
        ax = self.axis if axis is None else axis
        return (self.a, self.ha, self.b, self.hb, (0, 1)) if ax == 0 else (self.b, self.hb, self.a, self.ha, (2, 3))


def parts(poly):
    ang = frame(poly)
    a = np.array([math.cos(ang), math.sin(ang)]); b = np.array([-a[1], a[0]])
    ring = np.array(poly.exterior.coords)
    s, t = ring @ a, ring @ b
    s0, s1, t0, t1 = s.min(), s.max(), t.min(), t.max()
    cell = max(CELL, max(s1 - s0, t1 - t0) / 400)
    ns, nt = max(1, int(math.ceil((s1 - s0) / cell))), max(1, int(math.ceil((t1 - t0) / cell)))
    S, T = np.meshgrid(s0 + (np.arange(ns) + 0.5) * cell, t0 + (np.arange(nt) + 0.5) * cell)
    X, Y = S * a[0] + T * b[0], S * a[1] + T * b[1]
    inside = shapely.contains_xy(poly, X, Y)
    from scipy.ndimage import binary_closing, binary_opening
    k = max(1, int(round(JOG / cell)))
    pad = np.pad(inside, k + 1)
    clean = binary_opening(binary_closing(pad, np.ones((k, k))), np.ones((k, k)))[k + 1:-k - 1, k + 1:-k - 1]
    total = inside.sum()
    out = []
    least = int(math.ceil(WING_SIDE / cell))
    left = clean.copy()
    while len(out) < MOST_PARTS and left.sum() > LEFT * total:
        n, r0, r1, c0, c1 = largest(left, least)
        if n * cell * cell < max(MIN_PART, 0.06 * total * cell * cell): break
        left[r0:r1, c0:c1] = False
        ss0, ss1, tt0, tt1 = s0 + c0 * cell, s0 + c1 * cell, t0 + r0 * cell, t0 + r1 * cell
        c = a * (ss0 + ss1) / 2 + b * (tt0 + tt1) / 2
        out.append(Part(c, a, (ss1 - ss0) / 2, (tt1 - tt0) / 2))
    return out


# ---- the plain roofs --------------------------------------------------------------------------------

class Model:
    """A roof over a part: kind, which way its ridge runs, its eaves e and ridge R, the run k of a
    mansard's sides, which ends are hipped, and which way a lean-to rises."""
    def __init__(self, kind, axis, hips=(False, False), k=None, sign=1):
        self.kind, self.axis, self.hips, self.k, self.sign = kind, axis, tuple(hips), k, sign
        self.e = self.R = None

    def forms(self, p):
        """The roof's faces over part p as (alpha, beta): f = alpha + beta . (x - c), the roof's
        height being e + (R - e) min(f) over them."""
        d, hl, n, hw, _ = p.ridge_frame(self.axis)
        z = np.zeros(2)
        if self.kind == "flat": return [(1.0, z)]
        if self.kind == "shed": return [(0.5, self.sign * n / (2 * hw))]
        k = hw if self.kind in ("gable", "hip") else self.k
        f = [(hw / k, -n / k), (hw / k, n / k)]
        if self.kind == "mansard": f.append((1.0, z))
        if self.kind in ("hip", "mansard"):
            if self.hips[0]: f.append((hl / k, d / k))
            if self.hips[1]: f.append((hl / k, -d / k))
        return f

    def shape(self, p, xy):
        f = np.full(len(xy), np.inf)
        for al, be in self.forms(p): f = np.minimum(f, al + (xy - p.c) @ be)
        return f

    def planes(self, p):
        """The faces' planes, z = A x + B y + C, the eaves' first."""
        r = self.R - self.e
        out = [np.array([0.0, 0.0, self.e])]
        for al, be in self.forms(p):
            g = r * be
            out.append(np.array([g[0], g[1], self.e + r * al - g @ p.c]))
        return out

    def most(self, p):
        d, hl, n, hw, _ = p.ridge_frame(self.axis)
        if self.kind == "flat": return 0.0
        if self.kind == "shed": return 2 * hw * math.tan(math.radians(45))
        if self.kind == "mansard": return self.k * math.tan(math.radians(75))
        return min(TALLEST, hw * STEEPEST)

    def least(self, p):
        if self.kind not in ("gable", "hip"): return 0.0
        return p.ridge_frame(self.axis)[3] * math.tan(math.radians(GENTLEST))

    def copy(self):
        m = Model(self.kind, self.axis, self.hips, self.k, self.sign); m.e, m.R = self.e, self.R
        return m


def robust(cols, z):
    """Least squares of z on the columns, refitted without the samples far off it (chimneys,
    dormers, a branch): the coefficients and the mean miss (each sample's capped at a metre)."""
    A = np.column_stack(cols)
    keep = np.ones(len(z), bool)
    for _ in range(4):
        if keep.sum() < A.shape[1] + 2: keep[:] = True
        p, *_ = np.linalg.lstsq(A[keep], z[keep], rcond=None)
        res = z - A @ p
        mad = float(np.median(np.abs(res[keep])))
        keep = np.abs(res) < max(0.3, 3 * 1.4826 * mad)
        if keep.sum() < 0.5 * len(z): keep = np.abs(res) <= np.percentile(np.abs(res), 50)
    return p, float(np.mean(np.minimum(np.abs(res), 1.0)))


def fit(jobs, model_of):
    """One eaves and one ridge height for several parts at once (a row, or one part), each with its
    own shape: jobs [(part, xy, z)]. Sets them on each part's model (model_of(part)); the miss."""
    f = np.concatenate([np.clip(model_of(p).shape(p, xy), 0, 1) for p, xy, z in jobs])
    z = np.concatenate([z for _, _, z in jobs])
    if len(z) < 3: return None
    flat = model_of(jobs[0][0]).kind == "flat"
    if flat:
        (e,), cost = robust([np.ones_like(z)], z)
        R = e
    else:
        (e, R), cost = robust([1 - f, f], z)
        if R < e: R = e
        most = min(model_of(p).most(p) for p, _, _ in jobs)
        least = max(model_of(p).least(p) for p, _, _ in jobs)
        for bound in (most, least):
            if (bound == most and R - e > most) or (bound == least and R - e < least):
                # the eaves again, under the steepest (or gentlest) slope a roof of this kind has
                e = float(np.median(z - bound * f))
                R = e + bound
        res = z - (e + (R - e) * f)
        cost = float(np.mean(np.minimum(np.abs(res), 1.0)))
    for p, _, _ in jobs:
        m = model_of(p); m.e, m.R = float(e), float(R)
    return cost


def kinds(p, axis, hippable):
    """The roofs a part could have with its ridge that way."""
    out = [Model("flat", axis), Model("gable", axis)]
    if any(hippable): out.append(Model("hip", axis, hippable))
    _, _, _, hw, _ = p.ridge_frame(axis)
    for k in MANSARD_RUN:
        if k < 0.7 * hw: out.append(Model("mansard", axis, hippable, k))
    return out


def hippable(p, axis):
    _, _, _, _, ends = p.ridge_frame(axis)
    return tuple(p.shared[k] is None and p.joined[k] is None for k in ends)


# ---- sides shared between parts -----------------------------------------------------------------------

def overlap(l1, l2):
    """How far two near-parallel sides run alongside each other."""
    a1, b1 = np.array(l1.coords)
    u = (b1 - a1) / max(1e-9, np.linalg.norm(b1 - a1))
    a2, b2 = np.array(l2.coords)
    s = sorted([0, float((b1 - a1) @ u)]); q = sorted([float((a2 - a1) @ u), float((b2 - a1) @ u)])
    return max(0.0, min(s[1], q[1]) - max(s[0], q[0]))


def parallel(l1, l2, most=20):
    d1 = np.diff(np.array(l1.coords), axis=0)[0]; d2 = np.diff(np.array(l2.coords), axis=0)[0]
    c = abs(d1 @ d2) / (np.linalg.norm(d1) * np.linalg.norm(d2) + 1e-9)
    return c >= math.cos(math.radians(most))


def connect(houses, polys):
    """Mark each part's sides shared with a neighbour's part (a party wall) or joined to another
    part of its own building."""
    allparts = [(i, j, q) for i, ps in houses.items() for j, q in enumerate(ps)]
    tree = shapely.STRtree([q.poly for _, _, q in allparts])
    for i, ps in houses.items():
        for j, p in enumerate(ps):
            for k in range(4):
                sd = p.side(k)
                L = sd.length
                for x in tree.query(sd.buffer(PARTY + 0.3)):
                    i2, j2, q = allparts[x]
                    if i2 == i and j2 == j: continue
                    for k2 in range(4):
                        s2 = q.side(k2)
                        if not parallel(sd, s2) or sd.distance(s2) > (0.3 if i2 == i else PARTY + 0.3): continue
                        o = overlap(sd, s2)
                        if i2 == i:
                            if o >= 1.0 and p.joined[k] is None: p.joined[k] = j2
                        elif o >= min(2.0, 0.5 * min(L, s2.length)):
                            # a party wall says which way the ridge runs only between houses of a size
                            big = 0.4 <= polys[i2].area / max(1e-9, polys[i].area) <= 2.5
                            if p.shared[k] is None or big: p.shared[k] = (i2, j2, k2, big)


def forced_axis(p):
    big = [k for k in range(4) if p.shared[k] is not None and p.shared[k][3]]
    on_a, on_b = any(k < 2 for k in big), any(k >= 2 for k in big)
    if on_a and not on_b: return 0
    if on_b and not on_a: return 1
    return None


# ---- the roof over a footprint, as faces ------------------------------------------------------------

def line_across(pl, ql, bounds):
    """Where two planes cross, as a line across bounds, or None if they don't."""
    A, B, C = pl - ql
    if math.hypot(A, B) < 1e-6: return None
    x0, y0, x1, y1 = bounds
    R = math.hypot(x1 - x0, y1 - y0) + 2
    n = np.array([A, B]) / math.hypot(A, B)
    c = -C / math.hypot(A, B) * n
    mid = np.array([(x0 + x1) / 2, (y0 + y1) / 2])
    u = np.array([-n[1], n[0]])
    c = c + u * float((mid - c) @ u)
    return LineString([c - u * R, c + u * R])


def envelope(poly, prims):
    """The roof over a footprint: the highest of the prims over each point, each prim (domain,
    planes) being its eaves' plane or the lowest of its faces' planes, whichever is higher.
    Returns faces [(plane index, polygon)] and the planes."""
    planes, prim_ids = [], []
    for dom, pls in prims:
        ids = []
        for pl in pls:
            for k, q in enumerate(planes):
                if np.allclose(q, pl, atol=1e-4): ids.append(k); break
            else: ids.append(len(planes)); planes.append(pl)
        prim_ids.append(ids)
    lines = [poly.boundary]
    box = poly.buffer(0.5)
    for (dom, _), ids in zip(prims, prim_ids):
        lines.append(dom.boundary.intersection(box))
        for x in range(len(ids)):
            for y in range(x + 1, len(ids)):
                l = line_across(planes[ids[x]], planes[ids[y]], dom.bounds)
                if l is not None: lines.append(l.intersection(dom.buffer(0.01)))
    for a in range(len(prims)):
        for b in range(a + 1, len(prims)):
            both = prims[a][0].intersection(prims[b][0])
            if both.area < 1e-3: continue
            for x in prim_ids[a]:
                for y in prim_ids[b]:
                    if x == y: continue
                    l = line_across(planes[x], planes[y], both.bounds)
                    if l is not None: lines.append(l.intersection(both.buffer(0.01)))
    edges = unary_union([l for l in lines if not l.is_empty])
    cells = [c for c in polygonize(edges) if c.area > 1e-4]
    by = {}
    for c in cells:
        pt = c.representative_point()
        if not poly.contains(pt): continue
        best, bz = None, -np.inf
        for (dom, _), ids in zip(prims, prim_ids):
            if not dom.buffer(1e-6).contains(pt): continue
            zs = [float(planes[k] @ (pt.x, pt.y, 1)) for k in ids]
            zmin = min(zs[1:]) if len(zs) > 1 else zs[0]
            k = ids[1 + int(np.argmin(zs[1:]))] if len(zs) > 1 else ids[0]
            if zs[0] > zmin: k, zmin = ids[0], zs[0]
            if zmin > bz + 1e-6: best, bz = k, zmin
        if best is not None: by.setdefault(best, []).append(c)
    faces = []
    for k, cs in by.items():
        u = unary_union(cs).buffer(0)
        for g in getattr(u, "geoms", [u]):
            g = shapely.set_precision(g.simplify(0.02), 0.01)
            if g.is_empty or g.area < 1e-3: continue
            for gg in getattr(g, "geoms", [g]):
                if gg.geom_type == "Polygon" and gg.area > 1e-3: faces.append((k, gg))
    return faces, planes


def prims_of(poly, ps):
    """Each part's roof, the wings run on into the roofs they meet, and what's left of the footprint
    under the roof of the part it borders most."""
    prims = []
    for j, p in enumerate(ps):
        m = p.model
        d, hl, n, hw, ends = p.ridge_frame(m.axis)
        lo, hi = -hl, hl
        for e_i, k in enumerate(ends):
            q = p.joined[k]
            if q is None or m.kind not in ("gable", "hip", "mansard"): continue
            o = ps[q]
            om = o.model
            if om.kind not in ("gable", "hip", "mansard") or om.R < m.R - 0.05: continue
            od, ohl, on, ohw, oends = o.ridge_frame(om.axis)
            if abs(od @ d) > 0.5: continue      # in line with it, not across
            # to the other roof's ridge, where its own ridge has gone into that roof's slope
            if e_i == 0: lo -= ohw
            else: hi += ohw
        dom = Polygon([p.c + d * s + n * t for s, t in ((lo, -hw), (hi, -hw), (hi, hw), (lo, hw))])
        prims.append((dom, m.planes(p)))
    rest = poly.difference(unary_union([p.poly for p in ps]).buffer(0.01))
    for g in getattr(rest, "geoms", [rest]):
        if g.is_empty or g.area < 0.05 or g.geom_type != "Polygon": continue
        j = max(range(len(ps)), key=lambda j: g.buffer(0.05).intersection(ps[j].poly.buffer(0.05)).area + 0.01 * (-g.distance(ps[j].poly)))
        prims.append((g.buffer(0.02), ps[j].model.planes(ps[j])))
    return prims


def heights(poly, prims, xy):
    """The roof's height at points: the highest prim over each."""
    z = np.full(len(xy), -np.inf)
    X = np.column_stack([xy, np.ones(len(xy))])
    for dom, pls in prims:
        inn = shapely.contains_xy(dom, xy[:, 0], xy[:, 1])
        if not inn.any(): continue
        v = X[inn] @ np.array(pls).T
        h = np.maximum(v[:, 0], v[:, 1:].min(axis=1)) if v.shape[1] > 1 else v[:, 0]
        z[inn] = np.maximum(z[inn], h)
    return z


# ---- one square -----------------------------------------------------------------------------------

def towers_here(map_id, lidar):
    import towers
    from area import area
    A = area(map_id, wide=True)
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    out = []
    for t in towers.load(map_id):
        x, y = (t["lon"] - lon0) * kx, (t["lat"] - lat0) * ky
        out.append(towers._box(x, y, t["a"], t["w"], t["d"]).buffer(1.0))
    return out


def samples(lidar, poly, dx, dy, P, keep_out):
    """The survey over a footprint (lined up by dx, dy), half a metre apart, a little inside its
    walls: points, heights, and whether the survey sees the roof there at all (under trees: None)."""
    x0, y0, x1, y1 = poly.bounds
    xs = np.arange(x0 + PX / 2, x1, PX); ys = np.arange(y0 + PX / 2, y1, PX)
    x, y = np.meshgrid(xs, ys)
    inner = shapely.contains_xy(poly.buffer(-0.4), x, y)
    z = P.at(np.nan_to_num(P.dsm, nan=-999), x + dx, y + dy)
    g = P.at(np.nan_to_num(P.dtm, nan=-999), x + dx, y + dy)
    ok = inner & (z > -500) & (g > -500) & (z - g >= MIN_ABOVE)
    leafy = False
    if P.last is not None:
        last = P.at(np.nan_to_num(P.last, nan=-999), x + dx, y + dy)
        g2 = np.where(ok, z, np.nan)
        with np.errstate(invalid="ignore"):
            bumps = np.concatenate([np.abs(g2[:, :-2] - 2 * g2[:, 1:-1] + g2[:, 2:]).ravel(), np.abs(g2[:-2] - 2 * g2[1:-1] + g2[2:]).ravel()])
        bumps = bumps[~np.isnan(bumps)]
        through = ok & (z - last > THROUGH)
        if ok.any() and np.mean(through[ok]) > LEAFY and len(bumps) and np.median(bumps) > LUMPY: leafy = True
        ok &= ~through
    for t in keep_out:
        ok &= ~shapely.contains_xy(t, x, y)
    seen = inner.sum() >= 12 and ok.sum() >= 0.5 * inner.sum() and not leafy
    ring = np.array(poly.exterior.coords)
    gr = P.at(np.nan_to_num(P.dtm, nan=9999), ring[:, 0] + dx, ring[:, 1] + dy)
    return np.column_stack([x[ok], y[ok]]), z[ok], seen, float(gr.min()), int(inner.sum())


def plain_miss(ps, xy, z, inner):
    """How well plain roofs fit the survey read this way: each part's best of a flat roof, a gable
    either way or a hip, and a metre's miss wherever the survey has no building."""
    tot, n = 0.0, 0
    for p in ps:
        m = in_part(p, xy)
        if m.sum() < ENOUGH: continue
        best = min(fit([(p, xy[m], z[m])], lambda _q, mod=mod: mod) for mod in
                   (Model("flat", 0), Model("gable", 0), Model("gable", 1), Model("hip", 0, (True, True)), Model("hip", 1, (True, True))))
        tot += best * m.sum(); n += m.sum()
    return tot + (inner - len(z)) * 1.0


def in_part(p, xy, grow=0.05):
    rel = xy - p.c
    return (np.abs(rel @ p.a) <= p.ha + grow) & (np.abs(rel @ p.b) <= p.hb + grow)


def solve(houses, polys, data):
    """Each part's roof: the ridge's way, the kind of roof along each row, and the heights."""
    jobs = {}
    for i, ps in houses.items():
        xy, z = data[i][0], data[i][1]
        for j, p in enumerate(ps):
            m = in_part(p, xy)
            jobs[(i, j)] = (p, xy[m], z[m])
            p.n = int(m.sum())
    # which way each ridge runs: along the row where the part has party walls on two ends (or one),
    # else along its longer side unless the survey clearly says across
    for (i, j), (p, xy, z) in jobs.items():
        ax = forced_axis(p)
        if ax is not None: p.axis, p.free = ax, False; continue
        longer = 0 if p.ha >= p.hb else 1
        p.axis = longer
        if p.n < ENOUGH or max(p.ha, p.hb) / max(1e-9, min(p.ha, p.hb)) < 1.0: continue
        best = {}
        for axis in (0, 1):
            cs = []
            for m in kinds(p, axis, hippable(p, axis)):
                if m.kind == "flat": continue
                c = fit([(p, xy, z)], lambda _p, m=m: m)
                if c is not None: cs.append(c + PENALTY[m.kind])
            best[axis] = min(cs) if cs else np.inf
        square_ = max(p.ha, p.hb) / min(p.ha, p.hb) < 1.2
        other = 1 - longer
        if best[other] < best[longer] - (0 if square_ else ACROSS) and best[other] < 0.85 * best[longer]: p.axis = other
    # rows: parts linked through party walls at the ends of both their ridges
    parent = {k: k for k in jobs}
    def root(k):
        while parent[k] != k: parent[k] = parent[parent[k]]; k = parent[k]
        return k
    links = []
    for (i, j), (p, _, _) in jobs.items():
        _, _, _, _, ends = p.ridge_frame()
        for k in ends:
            s = p.shared[k]
            if s is None or not s[3]: continue
            i2, j2, k2, _ = s
            if i2 not in houses or (i2, j2) not in jobs: continue
            q = houses[i2][j2]
            if k2 not in q.ridge_frame()[4]: continue
            links.append(((i, j), (i2, j2)))
            parent[root((i, j))] = root((i2, j2))
    rows = {}
    for k in jobs: rows.setdefault(root(k), []).append(k)
    for members in rows.values():
        # one kind of roof along the row, the one that fits the row best
        row_jobs = [jobs[k] for k in members]
        free_ends = {k: hippable(jobs[k][0], jobs[k][0].axis) for k in members}
        seen = [jb for jb in row_jobs if jb[0].n >= ENOUGH]
        cands = [("flat", None), ("gable", None), ("hip", None)] + [("mansard", k) for k in MANSARD_RUN]
        if len(members) == 1: cands += [("shed", 1), ("shed", -1)]
        best, bc = ("gable", None), np.inf
        # a survey rising more than a storey's worth of roof across the row is no flat roof, however
        # well a flat one splits the difference
        spread = np.concatenate([jobs[m][2] - np.median(jobs[m][2]) for m in members if jobs[m][0].n >= ENOUGH] or [np.zeros(1)])
        sloped = np.percentile(spread, 90) - np.percentile(spread, 10) > SLOPED
        for kind, k in cands:
            if kind == "flat" and sloped: continue
            if kind == "hip" and not any(any(h) for h in free_ends.values()): continue
            if kind == "mansard" and any(k >= 0.7 * jobs[m][0].ridge_frame()[3] for m in members): continue
            if kind == "shed" and jobs[members[0]][0].joined == [None] * 4 and jobs[members[0]][0].shared == [None] * 4: continue
            total, n = 0.0, 0
            for m in members:
                p, xy, z = jobs[m]
                if p.n < ENOUGH: continue
                p.model = Model(kind, p.axis, free_ends[m], k if kind == "mansard" else None, k if kind == "shed" else 1)
                c = fit([(p, xy, z)], lambda q: q.model)
                if c is None: continue
                total += c * len(z); n += len(z)
            if not n: continue
            c = total / n + PENALTY[kind]
            if c < bc: best, bc = (kind, k), c
        kind, k = best
        for m in members:
            p = jobs[m][0]
            p.model = Model(kind, p.axis, free_ends[m] if kind in ("hip", "mansard") else (False, False), k if kind == "mansard" else None, k if kind == "shed" else 1)
        if not seen:
            for m in members: jobs[m][0].model = None
            continue
        # one height along the row until it steps: neighbours merged while they differ by less than STEP
        group = {m: m for m in members}
        def g_of(m):
            while group[m] != m: m = group[m]
            return m
        mem = {m: [m] for m in members}
        val = {}
        for m in members:
            p, xy, z = jobs[m]
            if p.n >= ENOUGH:
                fit([(p, xy, z)], lambda q: q.model); val[m] = (p.model.e, p.model.R)
        row_links = [(a, b) for a, b in links if a in group and b in group]
        while True:
            cand = []
            for a, b in row_links:
                ga, gb = g_of(a), g_of(b)
                if ga == gb or ga not in val or gb not in val: continue
                # the ridge line is what reads along a row; the eaves follow it
                diff = abs(val[ga][1] - val[gb][1])
                if diff < STEP: cand.append((diff, ga, gb))
            if not cand: break
            _, ga, gb = min(cand)
            group[gb] = ga; mem[ga] += mem.pop(gb); val.pop(gb)
            js = [jobs[m] for m in mem[ga] if jobs[m][0].n >= ENOUGH]
            fit(js, lambda q: q.model)
            p0 = js[0][0]; val[ga] = (p0.model.e, p0.model.R)
        # parts the survey can't see take the heights of a neighbour along the row
        for _ in range(len(members)):
            for a, b in row_links:
                for x, y in ((a, b), (b, a)):
                    gx, gy = g_of(x), g_of(y)
                    if gx not in val and gy in val:
                        group[gx] = gy; mem[gy] += mem.pop(gx)
        for gk, ms in mem.items():
            if gk not in val:
                for m in ms: jobs[m][0].model = None
                continue
            e, R = val[gk]
            for m in ms:
                jobs[m][0].model.e, jobs[m][0].model.R = e, R
                jobs[m][0].model.row = len(members)
    # a wing as high as its main roof, near enough, is as high; a wing nobody can see, too
    for i, ps in houses.items():
        if not ps: continue
        main = max(range(len(ps)), key=lambda j: ps[j].ha * ps[j].hb)
        mm = ps[main].model
        for j, p in enumerate(ps):
            if j == main or mm is None: continue
            if p.model is None or p.model.e is None:
                p.model = Model("flat" if mm.kind == "flat" else "gable", p.axis if p.axis is not None else 0)
                p.model.e, p.model.R = mm.e, mm.e if mm.kind == "flat" else min(mm.R, mm.e + p.model.most(p))
                continue
            if getattr(p.model, "row", 1) > 1: continue
            if abs(p.model.e - mm.e) < SNAP_E: p.model.e = mm.e
            if p.model.kind != "flat" and abs(p.model.R - mm.R) < SNAP_R: p.model.R = mm.R
            if p.model.R < p.model.e + FLATTEST and p.model.kind != "flat": p.model.kind, p.model.R = "flat", p.model.e
    for (i, j), (p, _, _) in jobs.items():
        m = p.model
        if m is not None and m.kind not in ("flat",) and m.R - m.e < FLATTEST:
            m.kind, m.R = "flat", m.e


def main():
    args = sys.argv[1:]
    map_id, drawn = "combe-down", None
    if "--map" in args: k = args.index("--map"); map_id = args[k + 1]; del args[k:k + 2]
    if "--drawn" in args: k = args.index("--drawn"); drawn = args[k + 1]; del args[k:k + 2]
    near = None
    if "--near" in args: k = args.index("--near"); near = [float(v) for v in args[k + 1].split(",")]; del args[k:k + 2]
    if drawn is None:
        from errors import bundle
        drawn = bundle(os.path.join(tempfile.mkdtemp(), "drawn.mjs"))
    lidar = open_lidar(map_id)
    keep_out = towers_here(map_id, lidar)
    ttree = shapely.STRtree(keep_out) if keep_out else None
    out_dir = os.path.join(ROOT, "data", map_id, "measured", "faces")
    os.makedirs(out_dir, exist_ok=True)
    log_dir = os.path.join(ROOT, "out", "shapes")
    os.makedirs(log_dir, exist_ok=True)
    for sq in [s.replace(",", "_") for s in args]:
        d = square(map_id, sq)
        blds = d["bl"]
        polys = [footprint(b) for b in blds]
        use = [i for i, p in enumerate(polys) if not p.is_empty and p.area >= 8 and p.geom_type == "Polygon"]
        if near is not None: use = [i for i in use if polys[i].distance(Point(near[0], near[1])) <= near[2]]
        houses = {}
        for i in use:
            try: houses[i] = parts(polys[i])
            except Exception: houses[i] = []
        connect(houses, polys)
        # the survey lined up on each group of touching footprints at once
        ptree = shapely.STRtree([polys[i] for i in use])
        parent = {i: i for i in use}
        def root(i):
            while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
            return i
        for a, i in enumerate(use):
            for x in ptree.query(polys[i].buffer(PARTY)):
                j = use[int(x)]
                if j != i and polys[i].distance(polys[j]) <= PARTY: parent[root(i)] = root(j)
        groups = {}
        for i in use: groups.setdefault(root(i), []).append(i)
        data = {}
        for members in groups.values():
            u = unary_union([polys[i] for i in members]).buffer(0.35).buffer(-0.35)
            u = max(getattr(u, "geoms", [u]), key=lambda g: g.area)
            try:
                if len(members) == 1: dx, dy, P = register(lidar, polys[members[0]], [])
                else:
                    dx, dy, _ = register(lidar, u, [])
                    P = None
            except Exception:
                dx, dy, P = 0.0, 0.0, None
            patches = {i: P if (P is not None and len(members) == 1) else Patch(lidar, polys[i]) for i in members}
            towers_on = {i: [keep_out[int(k)] for k in ttree.query(polys[i])] if ttree is not None else [] for i in members}
            # then nudged to where plain roofs fit it best: a symmetric roof is far less forgiving
            # of an outline a little off the survey than free faces were
            def read(dx, dy):
                return {i: samples(lidar, polys[i], dx, dy, patches[i], towers_on[i]) for i in members}
            def miss_at(dx, dy):
                got = read(dx, dy)
                return sum(plain_miss(houses[i], g[0], g[1], g[4]) for i, g in got.items())
            best = (miss_at(dx, dy), dx, dy)
            for step in (1.0, 0.5):
                cx, cy = best[1], best[2]
                for ox in (-step, 0, step):
                    for oy in (-step, 0, step):
                        if (ox or oy) and math.hypot(cx + ox - dx, cy + oy - dy) <= 1.5:
                            best = min(best, (miss_at(cx + ox, cy + oy), cx + ox, cy + oy))
            _, dx, dy = best
            for i, (xy, z, seen, base, _) in read(dx, dy).items():
                data[i] = (xy, z, seen, base, dx, dy)
        # where the survey can't see a house, it takes no part in deciding its row
        for i in use:
            if not data[i][2]: data[i] = (data[i][0][:0], data[i][1][:0]) + data[i][2:]
        solve(houses, polys, data)
        # each row is taken or left as a whole: its buildings
        unit = {i: i for i in use}
        def uroot(i):
            while unit[i] != i: unit[i] = unit[unit[i]]; i = unit[i]
            return i
        for i, ps in houses.items():
            for p in ps:
                for s in p.shared:
                    if s is not None and s[3] and s[0] in unit: unit[uroot(i)] = uroot(s[0])
        built, why = {}, {}
        for i in use:
            ps = houses[i]
            if not ps or any(p.model is None or p.model.e is None for p in ps):
                why["no roof"] = why.get("no roof", 0) + 1; continue
            if not data[i][2]: why["survey can't see it"] = why.get("survey can't see it", 0) + 1; continue
            try:
                prims = prims_of(polys[i], ps)
                faces, planes = envelope(polys[i], prims)
                if not faces or sum(g.area for _, g in faces) < 0.99 * polys[i].area: why["faces leave gaps"] = why.get("faces leave gaps", 0) + 1; continue
                xy, z = data[i][0], data[i][1]
                base = data[i][3]
                floor = base + MIN_ABOVE
                top = max(float(np.max([pp.model.R for pp in ps])), floor) + 0.3
                V, T, Wl, rings, tops = M.mesh(polys[i], faces, planes, floor, top)
                zh = np.clip(heights(polys[i], prims, xy), floor, top) if len(xy) else np.zeros(0)
                e = z - zh
                built[i] = dict(V=V, T=T, W=Wl, rings=rings, tops=tops, base=base, err=M.miss(e) if len(e) >= 12 else None,
                                samples=(xy[:, 0], xy[:, 1], z), parts=[(pp.model.kind, pp.model.axis) for pp in ps])
            except Exception as ex:
                why[f"failed: {type(ex).__name__}"] = why.get(f"failed: {type(ex).__name__}", 0) + 1
        old = M.today_miss(drawn, os.path.join(ROOT, "web", "public", "maps", map_id, f"{sq}.json"),
                           {i: g["samples"] for i, g in built.items() if g["err"] is not None})
        units = {}
        for i in built: units.setdefault(uroot(i), []).append(i)
        kept, stats = {}, []
        for u, members in units.items():
            new = [(built[i]["err"][0], len(built[i]["samples"][2])) for i in members if built[i]["err"] is not None and i in old]
            was = [(old[i][0], len(built[i]["samples"][2])) for i in members if built[i]["err"] is not None and i in old]
            if not new: continue
            n = sum(w for _, w in new)
            nm, wm = sum(a * w for a, w in new) / n, sum(a * w for a, w in was) / n
            ok = nm <= WORST and nm <= ACCEPT * wm and wm - nm >= GAIN
            for i in members:
                g = built[i]
                stats.append((i, old.get(i, (np.nan,))[0], g["err"][0] if g["err"] else np.nan, len(members), ok, g["parts"]))
                if not ok: continue
                kept[M.ring_key(blds[i])] = dict(v=[[M.r2(a) for a in p] for p in g["V"]], t=g["T"],
                                                 w=[[M.r2(a) for a in q] for q in g["W"]],
                                                 r=[[[M.r2(a) for a in p] for p in ring] for ring in g["rings"]],
                                                 z=[[[M.r2(a) for a in q] for q in ring] for ring in g["tops"]],
                                                 base=M.r2(g["base"]))
        if near is not None:
            for i in use:
                print(i, blds[i].get("c"), round(polys[i].area), "seen" if data[i][2] else "unseen", len(data[i][1]), "today", old.get(i), "new", built.get(i, {}).get("err"))
                for p in houses[i]:
                    m = p.model
                    print("   part", np.round(p.c, 1), round(2 * p.ha, 1), round(2 * p.hb, 1), "n", p.n, "axis", p.axis, "free", p.free,
                          "shared", [s and s[:3] for s in p.shared], "joined", p.joined,
                          m and (m.kind, m.hips, m.k, m.sign, m.e and round(m.e, 2), m.R and round(m.R, 2)))
            continue
        with open(os.path.join(out_dir, f"{sq}.json"), "w") as f:
            json.dump(kept, f, separators=(",", ":"), sort_keys=True)
        s = np.array([(w, n, u) for _, w, n, _, u, _ in stats]) if stats else np.zeros((0, 3))
        print(f"{sq}: {len(blds)} buildings, roofs for {len(built)} ({', '.join(f'{v} {k}' for k, v in why.items())}); "
              f"used for {len(kept)}; median miss today {np.nanmedian(s[:, 0]) if len(s) else 0:.2f} m, "
              f"new {np.nanmedian(s[:, 1]) if len(s) else 0:.2f} m", flush=True)
        with open(os.path.join(log_dir, f"{sq}.log"), "w") as f:
            for i, w, n, rows, u, pk in sorted(stats, key=lambda t: (t[1] - t[2]) if not np.isnan(t[1] - t[2]) else 0, reverse=True):
                f.write(f"{i}\t{blds[i].get('n','')}\t{blds[i].get('c','')}\t{w:.2f}\t{n:.2f}\trow {rows}\t{pk}\t{'used' if u else ''}\n")


if __name__ == "__main__":
    main()
