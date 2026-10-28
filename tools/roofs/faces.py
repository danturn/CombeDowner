"""Roofs as the lidar shows them: each building's roof as a few flat faces, LoD2 style.

Usage: python3 -I tools/roofs/faces.py <ti,tj> ... [--map combe-down] [--drawn <drawn.mjs>]

Today's roofs (tools/lidar.py) pick the best of a few shapes (flat, gabled, hipped); a church, an
L-shaped house, a terrace stepping down a hill or a mansard comes out as the nearest of those. Here
the survey's surface over each footprint is read as the planes it is made of:
- the survey is lined up on the footprint first (common.register): the open data's outlines are
  often a metre or two off it;
- the slope at each half-metre sample is found from the samples round it, and samples are grown
  into regions that lie on one plane, from the flattest-lying seeds out;
- small regions (chimneys, dormers' cheeks, a branch) go to the neighbour that fits them best, and
  a building keeps only as many faces as its size warrants, merging the ones that matter least;
- where two faces meet at the same height (a ridge, a hip, a valley) the line between them is
  where their planes cross; where they don't (a tower, a lower extension, the next house down the
  hill) it is the straight line through their boundary, and a wall stands in the step;
- the faces are cut to the footprint, so the eaves sit on the walls as the game draws them.
A building keeps today's roof where the survey can't see it (trees, or newer than the survey),
and where the faces don't explain the survey clearly better than today's roof does, so a plain
semi stays as it is.

Each square's roofs are kept in data/<map>/measured/faces/<ti>_<tj>.json, by each building's
outline as built (tools/prep_map.py reads them), in metres above sea level in the survey's frame:
v the points (x, y, z), t the roof's triangles, w the walls in its steps, r the outline with the
points where faces meet it added, z the roof's height at each of those along each wall.
"""
import hashlib, json, math, os, subprocess, sys, tempfile

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon, Point
from shapely.ops import polygonize, unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import open_lidar, square, footprint, Patch, register, PARTY, MIN_ABOVE, THROUGH, ROOT, PX   # noqa: E402

ANGLE = math.radians(12)    # how far a sample's slope may turn from its region's and still be on it
NEAR = 0.3                  # metres off its region's plane a sample may lie
SEED = 0.12                 # metres: the flattest-lying samples, where regions start
MIN_FACE = 3.0              # square metres: a smaller region is a chimney, a dormer's cheek, noise
STEP = 0.5                  # metres between two faces' heights along their boundary that make a step
REACH_ON = 2.5              # metres a line between faces runs on past the boundary it was found from
ACCEPT = 0.75               # the faces must leave at most this share of today's roof's miss (see miss)...
GAIN = 0.15                 # ...and be at least this many metres closer to the survey
WORST = 1.0                 # metres: faces missing the survey by more than this on average aren't used
LEAFY = 0.3                 # share of the roof the laser went through: trees over it...
LUMPY = 0.25                # ...where it is this lumpy (metres, see roof_of)


def faces_allowed(area):
    return int(min(32, 4 + area / 30))


def local_planes(x, y, z, ok, half=2):
    """Plane through the samples in a (2 half + 1)-square window round each sample: slope (a, b),
    and how far the samples lie off it (RMS)."""
    from scipy.ndimage import uniform_filter
    w = ok.astype(np.float64)
    X, Y, Z = np.where(ok, x, 0), np.where(ok, y, 0), np.where(ok, z, 0)
    f = lambda v: uniform_filter(v, 2 * half + 1, mode="constant")
    n = f(w)
    with np.errstate(invalid="ignore", divide="ignore"):
        mx, my, mz = f(X) / n, f(Y) / n, f(Z) / n
        sxx = f(X * X) / n - mx * mx; syy = f(Y * Y) / n - my * my; sxy = f(X * Y) / n - mx * my
        sxz = f(X * Z) / n - mx * mz; syz = f(Y * Z) / n - my * mz; szz = f(Z * Z) / n - mz * mz
        det = sxx * syy - sxy * sxy
        a = (sxz * syy - syz * sxy) / det
        b = (syz * sxx - sxz * sxy) / det
        res = szz - a * sxz - b * syz
    res = np.sqrt(np.clip(res, 0, None))
    good = ok & (n * (2 * half + 1) ** 2 >= 9) & (det > 1e-6)
    return np.where(good, a, np.nan), np.where(good, b, np.nan), np.where(good, res, np.inf)


def fit_plane(x, y, z):
    """z = a x + b y + c by least squares, twice, the second time without the worst-fitting fifth."""
    A = np.column_stack([x, y, np.ones_like(x)])
    keep = np.ones(len(z), bool)
    for _ in range(2):
        p, *_ = np.linalg.lstsq(A[keep], z[keep], rcond=None)
        r = np.abs(A @ p - z)
        if keep.sum() > 10: keep = r <= max(0.15, np.percentile(r, 80))
    return p


def angle(p, q):
    n1 = np.array([-p[0], -p[1], 1.0]); n2 = np.array([-q[0], -q[1], 1.0])
    return math.acos(min(1.0, abs(n1 @ n2) / (np.linalg.norm(n1) * np.linalg.norm(n2))))


def grow(x, y, z, ok, a, b, res):
    """Regions of samples on one plane: labels (-1 for none) and each region's plane."""
    H, W = ok.shape
    lab = np.full((H, W), -1)
    order = np.argsort(np.where(ok & (res < SEED), res, np.inf), axis=None)
    planes = []
    for flat in order:
        j, i = divmod(int(flat), W)
        if not (ok[j, i] and res[j, i] < SEED) or lab[j, i] >= 0: continue
        k = len(planes)
        p = np.array([a[j, i], b[j, i], z[j, i] - a[j, i] * x[j, i] - b[j, i] * y[j, i]])
        lab[j, i] = k
        members, front, refit = [(j, i)], [(j, i)], 8
        while front:
            nxt = []
            for (jj, ii) in front:
                for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    v, u = jj + dj, ii + di
                    if not (0 <= v < H and 0 <= u < W) or lab[v, u] >= 0 or not ok[v, u]: continue
                    if abs(z[v, u] - (p[0] * x[v, u] + p[1] * y[v, u] + p[2])) > NEAR: continue
                    if np.isfinite(a[v, u]) and res[v, u] < 0.3 and angle(p, (a[v, u], b[v, u])) > ANGLE: continue
                    lab[v, u] = k
                    members.append((v, u)); nxt.append((v, u))
            front = nxt
            if len(members) >= refit:
                m = np.array(members)
                p = fit_plane(x[m[:, 0], m[:, 1]], y[m[:, 0], m[:, 1]], z[m[:, 0], m[:, 1]])
                refit = len(members) * 2
        m = np.array(members)
        planes.append(fit_plane(x[m[:, 0], m[:, 1]], y[m[:, 0], m[:, 1]], z[m[:, 0], m[:, 1]]) if len(m) >= 3 else p)
    return lab, planes


def height(p, x, y):
    return p[0] * x + p[1] * y + p[2]


def settle(x, y, z, ok, inside, lab, planes, area_px, allowed):
    """Small regions handed to the neighbours that fit them best, merging until the building has
    no more faces than allowed, then every sample in the footprint given a face (the nearest)."""
    from scipy.ndimage import distance_transform_edt, binary_dilation
    planes = [np.array(p) for p in planes]
    def neighbours(k):
        mine = lab == k
        return mine, set(lab[binary_dilation(mine, iterations=2) & ~mine & (lab >= 0)].tolist())
    def cost(k):
        """What handing region k to its best-fitting neighbour adds to the error: (cost, neighbour)."""
        mine, nbrs = neighbours(k)
        if not nbrs: return 0.0, None
        xs, ys, zs = x[mine], y[mine], z[mine]
        return min((float(np.sum((height(planes[q], xs, ys) - zs) ** 2)), q) for q in nbrs)
    while True:
        ids = [k for k in range(len(planes)) if (lab == k).any()]
        sizes = {k: int((lab == k).sum()) for k in ids}
        small = [k for k in ids if sizes[k] * area_px < MIN_FACE]
        if not small and len(ids) <= allowed: break
        # too small to be a face, the smallest; else the region whose loss costs least
        if small: k = min(small, key=lambda k: sizes[k]); c, best = cost(k)
        else: c, best, k = min(cost(k) + (k,) for k in ids)
        if best is None:
            lab[lab == k] = -1
            continue
        lab[lab == k] = best
        m = lab == best
        planes[best] = fit_plane(x[m], y[m], z[m])
    # the samples left over (edges, a chimney) and the footprint's edge: the plane of the nearest face
    if (lab >= 0).sum() == 0: return lab, planes
    idx = distance_transform_edt(lab < 0, return_distances=False, return_indices=True)
    # (outside the walls too, so a sliver of the footprint between grid points has a face)
    return lab[idx[0], idx[1]], planes


def straight_runs(pts, tol=0.4, least=4):
    """The straight lines through a boundary's points, longest first (sequential RANSAC)."""
    out, pts = [], np.asarray(pts)
    rng = np.random.default_rng(0)
    while len(pts) >= least:
        best = None
        for _ in range(60):
            i, j = rng.choice(len(pts), 2, replace=False)
            d = pts[j] - pts[i]
            L = np.hypot(*d)
            if L < 0.4: continue
            nrm = np.array([-d[1], d[0]]) / L
            inl = np.abs((pts - pts[i]) @ nrm) < tol
            if best is None or inl.sum() > best[0].sum(): best = (inl, pts[i], d / L)
        if best is None or best[0].sum() < least: break
        inl = best[0]
        q = pts[inl]
        c = q.mean(axis=0)
        u = np.linalg.svd(q - c)[2][0]
        out.append((c, u))
        pts = pts[~inl]
    return out


def boundary_lines(x, y, lab, planes, poly):
    """The lines faces meet along: where two planes cross, at a ridge, hip or valley; else the
    straight runs of their boundary, at a step. Each runs a little past the boundary it was found
    from (REACH_ON), enough to meet the walls or the next line, not so far as to cut other faces."""
    lines = []
    pairs = {}
    H, W = lab.shape
    for dj, di in ((0, 1), (1, 0)):
        A, B = lab[:H - dj, :W - di], lab[dj:, di:]
        m = (A >= 0) & (B >= 0) & (A != B)
        mx = (x[:H - dj, :W - di][m] + x[dj:, di:][m]) / 2
        my = (y[:H - dj, :W - di][m] + y[dj:, di:][m]) / 2
        for a, b, px, py in zip(A[m], B[m], mx, my):
            pairs.setdefault((min(a, b), max(a, b)), []).append((px, py))
    def along(c, u, pts):
        s = (pts - c) @ u
        return LineString([c + u * (s.min() - REACH_ON), c + u * (s.max() + REACH_ON)])
    for (a, b), pts in pairs.items():
        pts = np.array(pts)
        if len(pts) * PX < 1.0: continue
        pa, pb = planes[a], planes[b]
        gap = np.median(np.abs(height(pa, pts[:, 0], pts[:, 1]) - height(pb, pts[:, 0], pts[:, 1])))
        da, db = pa[0] - pb[0], pa[1] - pb[1]
        if gap < STEP and math.hypot(da, db) > 0.05:
            # where the planes cross: da x + db y + (ca - cb) = 0, near these points
            n = np.array([da, db]) / math.hypot(da, db)
            c = n * (-(pa[2] - pb[2]) / math.hypot(da, db))
            u = np.array([-n[1], n[0]])
            c = c + u * float((pts.mean(axis=0) - c) @ u)
            # the crossing has to run through the boundary, not off past it
            if np.median(np.abs((pts - c) @ n)) < 1.5:
                lines.append(along(c, u, pts))
                continue
        for c, u in straight_runs(pts):
            near = pts[np.abs((pts - c) @ np.array([-u[1], u[0]])) < 0.5]
            lines.append(along(c, u, near if len(near) else pts))
    return lines


def build(poly, x, y, lab, planes, floor, top):
    """The faces as polygons, each with its plane, cut from the footprint along the lines."""
    from scipy.ndimage import map_coordinates
    lines = boundary_lines(x, y, lab, planes, poly)
    edges = unary_union([poly.boundary] + [l.intersection(poly.buffer(0.01)) for l in lines])
    cells = [c for c in polygonize(edges) if c.area > 1e-4 and poly.buffer(0.05).contains(c.representative_point())]
    x0, y0 = x[0, 0], y[0, 0]
    labf = lab.astype(np.float64)
    def label_of(c):
        # the commonest face over the cell, read off the grid
        bx0, by0, bx1, by1 = c.bounds
        gx, gy = np.meshgrid(np.arange(bx0 + 0.125, bx1, 0.25), np.arange(by0 + 0.125, by1, 0.25))
        gx, gy = gx.ravel(), gy.ravel()
        inn = shapely.contains_xy(c, gx, gy)
        if not inn.any():
            p = c.representative_point(); gx, gy = np.array([p.x]), np.array([p.y])
        else: gx, gy = gx[inn], gy[inn]
        v = map_coordinates(labf, [(gy - y0) / PX, (gx - x0) / PX], order=0, mode="nearest").astype(int)
        v = v[v >= 0]
        return int(np.bincount(v).argmax()) if len(v) else -1
    by = {}
    for c in cells:
        k = label_of(c)
        if k >= 0: by.setdefault(k, []).append(c)
    faces = []
    for k, cs in by.items():
        u = unary_union(cs).buffer(0)
        for g in getattr(u, "geoms", [u]):
            # (the cut leaves points along straight edges, which only make more triangles)
            g = shapely.set_precision(g.simplify(0.02), 0.01)
            if g.is_empty: continue
            faces.append((k, g))
    return faces


def mesh(poly, faces, planes, floor, top):
    """Points, roof triangles, walls in the steps, and the outline's wall tops."""
    zf = lambda k, xx, yy: float(min(top, max(floor, height(planes[k], xx, yy))))
    V, T, Wl, index = [], [], [], {}
    def vid(xx, yy, zz):
        key_ = (round(xx, 2), round(yy, 2), round(zz, 2))
        if key_ not in index: index[key_] = len(V); V.append(key_)
        return index[key_]
    for k, g in faces:
        for tri in shapely.get_parts(shapely.constrained_delaunay_triangles(g)):
            c = list(tri.exterior.coords)[:3]
            # counter-clockwise from above
            if (c[1][0] - c[0][0]) * (c[2][1] - c[0][1]) - (c[1][1] - c[0][1]) * (c[2][0] - c[0][0]) < 0: c = [c[0], c[2], c[1]]
            T.append([vid(cx, cy, zf(k, cx, cy)) for cx, cy in c])
    tree = shapely.STRtree([g for _, g in faces])
    def face_at(px, py, skip):
        for i in tree.query(Point(px, py)):
            if i != skip and faces[i][1].buffer(1e-3).contains(Point(px, py)): return i
        return None
    # the steps: along every face edge, a wall from the face on the other side up to this one
    for fi, (k, g) in enumerate(faces):
        for ring in [g.exterior, *g.interiors]:
            cs = list(ring.coords)
            for (ax, ay), (bx, by) in zip(cs[:-1], cs[1:]):
                L = math.hypot(bx - ax, by - ay)
                if L < 0.05: continue
                mx, my = (ax + bx) / 2, (ay + by) / 2
                nx, ny = (by - ay) / L * 0.05, -(bx - ax) / L * 0.05
                other = None
                for s in (1, -1):
                    q = Point(mx + nx * s, my + ny * s)
                    if g.contains(q): continue
                    other = face_at(q.x, q.y, fi)
                    break
                if other is None: continue
                ok_ = faces[other][0]
                ha, hb = zf(k, ax, ay), zf(k, bx, by)
                la, lb = zf(ok_, ax, ay), zf(ok_, bx, by)
                if ha - la > 0.05 or hb - lb > 0.05:
                    if (ha - la) * (hb - lb) < 0:
                        t = (ha - la) / ((ha - la) - (hb - lb))
                        cx, cy = ax + (bx - ax) * t, ay + (by - ay) * t
                        cz = zf(k, cx, cy)
                        if ha > la: Wl.append([ax, ay, la, ha, cx, cy, cz, cz])
                        else: Wl.append([cx, cy, cz, cz, bx, by, lb, hb])
                    else:
                        Wl.append([ax, ay, la, ha, bx, by, lb, hb])
    # the outline, with every face corner that lies on it, and the roof's height there along each wall
    rings, tops = [], []
    corners = [Point(c) for _, g in faces for ring in [g.exterior, *g.interiors] for c in ring.coords]
    for ring in [poly.exterior, *poly.interiors]:
        line = LineString(ring.coords)
        ds = sorted({round(line.project(p), 3) for p in corners if line.distance(p) < 0.02} | {round(line.project(Point(c)), 3) for c in ring.coords[:-1]})
        pts = [line.interpolate(d) for d in ds]
        pts = [p for i, p in enumerate(pts) if i == 0 or p.distance(pts[i - 1]) > 0.05]
        if len(pts) > 1 and pts[-1].distance(pts[0]) < 0.05: pts = pts[:-1]
        zs = []
        for i, p in enumerate(pts):
            q = pts[(i + 1) % len(pts)]
            mx, my = (p.x + q.x) / 2, (p.y + q.y) / 2
            best, bd = None, 1e9
            for fi in tree.query(Point(mx, my).buffer(0.1)):
                d = faces[fi][1].distance(Point(mx, my))
                if d < bd: best, bd = fi, d
            if best is None: zs.append([floor, floor]); continue
            k = faces[best][0]
            zs.append([zf(k, p.x, p.y), zf(k, q.x, q.y)])
        rings.append([[p.x, p.y] for p in pts]); tops.append(zs)
    return V, T, Wl, rings, tops


def surface_errors(V, T, xs, ys, zs):
    """How far the survey's samples lie off the faces, each sample on the triangle over it."""
    tris = [Polygon([V[i][:2] for i in t]) for t in T]
    tree = shapely.STRtree(tris)
    errs = []
    for x, y, z in zip(xs, ys, zs):
        for ti in tree.query(Point(x, y)):
            t = T[ti]
            (x1, y1, z1), (x2, y2, z2), (x3, y3, z3) = (V[i] for i in t)
            d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
            if abs(d) < 1e-9: continue
            l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d
            l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d
            l3 = 1 - l1 - l2
            if min(l1, l2, l3) < -1e-3: continue
            errs.append(z - (l1 * z1 + l2 * z2 + l3 * z3))
            break
    return np.array(errs) if len(errs) >= 12 else None


def roof_of(lidar, poly, others):
    """One building's faces, or None (and why) where the survey can't give them."""
    dx, dy, P = register(lidar, poly, others)
    x0, y0, x1, y1 = poly.bounds
    xs = np.arange(x0 + PX / 2, x1, PX); ys = np.arange(y0 + PX / 2, y1, PX)
    if len(xs) < 3 or len(ys) < 3: return None, "too small"
    x, y = np.meshgrid(xs, ys)
    inside = shapely.contains_xy(poly, x, y)
    inner = shapely.contains_xy(poly.buffer(-0.4), x, y)
    z = P.at(np.nan_to_num(P.dsm, nan=-999), x + dx, y + dy)
    g = P.at(np.nan_to_num(P.dtm, nan=-999), x + dx, y + dy)
    ok = inner & (z > -500) & (g > -500) & (z - g >= MIN_ABOVE)
    if inner.sum() < 12 or ok.sum() < 0.5 * inner.sum(): return None, "not in survey"
    # under trees where the laser went through leaves over much of it and the surface is as lumpy
    # as a crown (steep roofs, spires and parapets split the returns too, but are smooth); the map
    # build also keeps today's roof wherever lidar.decide finds trees over it
    if P.last is not None:
        last = P.at(np.nan_to_num(P.last, nan=-999), x + dx, y + dy)
        g2 = np.where(ok, z, np.nan)
        bumps = np.concatenate([np.abs(g2[:, :-2] - 2 * g2[:, 1:-1] + g2[:, 2:]).ravel(), np.abs(g2[:-2] - 2 * g2[1:-1] + g2[2:]).ravel()])
        bumps = bumps[~np.isnan(bumps)]
        if np.mean((z - last)[ok] > THROUGH) > LEAFY and len(bumps) and np.median(bumps) > LUMPY: return None, "under trees"
    a, b, res = local_planes(x, y, z, ok)
    lab, planes = grow(x, y, z, ok, a, b, res)
    if not planes: return None, "no planes"
    lab, planes = settle(x, y, z, ok, inside, lab, planes, PX * PX, faces_allowed(poly.area))
    if (lab >= 0).sum() == 0: return None, "no planes"
    ring = np.array(poly.exterior.coords)
    gr = P.at(np.nan_to_num(P.dtm, nan=9999), ring[:, 0] + dx, ring[:, 1] + dy)
    base = float(gr.min())
    floor, top = base + MIN_ABOVE, float(np.nanpercentile(z[ok], 99.5)) + 0.3
    faces = build(poly, x, y, lab, planes, floor, top)
    if not faces or sum(g.area for _, g in faces) < 0.99 * poly.area: return None, "faces leave gaps"
    V, T, Wl, rings, tops = mesh(poly, faces, planes, floor, top)
    e = surface_errors(V, T, x[ok], y[ok], z[ok])
    if e is None: return None, "no faces"
    return dict(V=V, T=T, W=Wl, rings=rings, tops=tops, err=miss(e), base=base, dx=dx, dy=dy, faces=len(faces),
                samples=(x[ok], y[ok], z[ok])), None


def ring_key(b):
    """A building's key: its outline as built, to the decimetre (tools/prep_map.py makes the same)."""
    return hashlib.sha1(json.dumps(b["r"], separators=(",", ":")).encode()).hexdigest()[:20]


def miss(e):
    """How far a roof is from the survey: the mean distance, which a few samples straddling a step
    (where no plane fits) move less than they move the RMS; and the RMS."""
    return float(np.mean(np.abs(e))), float(np.sqrt(np.mean(e ** 2)))


def today_miss(drawn, sq_path, jobs):
    """How far today's roofs are from the survey, at the same samples, set in the survey's frame."""
    from errors import drawn_heights
    pts = {str(i): [[float(a), float(b)] for a, b in zip(s[0], s[1])] for i, s in jobs.items()}
    got = drawn_heights(drawn, sq_path, pts)
    out = {}
    for i, s in jobs.items():
        d = np.array(got[str(i)])
        z = s[2]
        # the drawn roof stands on the map's ground: compare shapes, not the frame offset
        e = z - d
        out[i] = miss(e - np.median(e))
    return out


def r2(v): return round(float(v), 2)


def main():
    args = sys.argv[1:]
    map_id, drawn = "combe-down", None
    if "--map" in args: k = args.index("--map"); map_id = args[k + 1]; del args[k:k + 2]
    if "--drawn" in args: k = args.index("--drawn"); drawn = args[k + 1]; del args[k:k + 2]
    if drawn is None:
        from errors import bundle
        drawn = bundle(os.path.join(tempfile.mkdtemp(), "drawn.mjs"))
    lidar = open_lidar(map_id)
    out_dir = os.path.join(ROOT, "data", map_id, "measured", "faces")
    os.makedirs(out_dir, exist_ok=True)
    for sq in [s.replace(",", "_") for s in args]:
        d = square(map_id, sq)
        blds = d["bl"]
        polys = [footprint(b) for b in blds]
        ptree = shapely.STRtree(polys)
        found, why = {}, {}
        for i, (b, p) in enumerate(zip(blds, polys)):
            if p.is_empty or p.area < 8 or p.geom_type != "Polygon": continue
            try:
                got, reason = roof_of(lidar, p, [polys[k] for k in ptree.query(p.buffer(PARTY)) if k != i])
            except Exception as e:      # a degenerate outline: today's roof stays
                got, reason = None, f"failed: {type(e).__name__}"
            if got is None: why[reason] = why.get(reason, 0) + 1; continue
            found[i] = got
        old = today_miss(drawn, os.path.join(ROOT, "web", "public", "maps", map_id, f"{sq}.json"), {i: g["samples"] for i, g in found.items()})
        kept, stats = {}, []
        for i, g in found.items():
            (new, new_rms), (was, was_rms) = g["err"], old.get(i, (float("inf"), float("inf")))
            use = new <= WORST and new <= ACCEPT * was and was - new >= GAIN
            stats.append((i, was, new, g["faces"], use, was_rms, new_rms))
            if not use: continue
            kept[ring_key(blds[i])] = dict(v=[[r2(a) for a in p] for p in g["V"]], t=g["T"],
                                         w=[[r2(a) for a in q] for q in g["W"]],
                                         r=[[[r2(a) for a in p] for p in ring] for ring in g["rings"]],
                                         z=[[[r2(a) for a in q] for q in ring] for ring in g["tops"]],
                                         base=r2(g["base"]))
        with open(os.path.join(out_dir, f"{sq}.json"), "w") as f:
            json.dump(kept, f, separators=(",", ":"), sort_keys=True)
        s = np.array([(w, n, fc, u) for _, w, n, fc, u, *_ in stats]) if stats else np.zeros((0, 4))
        print(f"{sq}: {len(blds)} buildings, faces for {len(found)} ({', '.join(f'{v} {k}' for k, v in why.items())}); "
              f"used for {int(s[:, 3].sum()) if len(s) else 0}; median miss today {np.median(s[:, 0]) if len(s) else 0:.2f} m, "
              f"faces {np.median(s[:, 1]) if len(s) else 0:.2f} m; median faces {np.median(s[:, 2]) if len(s) else 0:.0f}", flush=True)
        os.makedirs(os.path.join(ROOT, "out", "faces"), exist_ok=True)
        with open(os.path.join(ROOT, "out", "faces", f"{sq}.log"), "w") as f:
            for i, w, n, fc, u, wr, nr in sorted(stats, key=lambda t: t[1] - t[2], reverse=True):
                f.write(f"{i}\t{blds[i].get('n','')}\t{blds[i].get('c','')}\t{w:.2f}\t{n:.2f}\t{wr:.2f}\t{nr:.2f}\t{fc}\t{'used' if u else ''}\n")


if __name__ == "__main__":
    main()


def load(map_id, sq):
    """A square's kept roofs, by ring_key, or {}."""
    p = os.path.join(ROOT, "data", map_id, "measured", "faces", f"{sq}.json")
    if not os.path.exists(p): return {}
    with open(p) as f: return json.load(f)


def for_game(kept, lift):
    """A kept roof as the game reads it (map.ts RoofMesh), lifted by lift metres from the survey's
    frame into the map's: the outline with its added points, and the roof."""
    r1, r2_ = (lambda v: round(v, 1)), (lambda v: round(v, 2))
    v = [a for x, y, z in kept["v"] for a in (r1(x), r1(y), r2_(z + lift))]
    w = [r2_(a + (lift if k % 4 >= 2 else 0)) if k % 4 >= 2 else r1(a) for q in kept["w"] for k, a in enumerate(q)]
    z = [[r2_(a + lift) for pair in ring for a in pair] for ring in kept["z"]]
    rings = [[[r1(x), r1(y)] for x, y in ring] for ring in kept["r"]]
    return rings, dict(v=v, t=[i for tri in kept["t"] for i in tri], w=w, z=z)
