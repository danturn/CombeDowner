"""Real building heights and roof shapes from Environment Agency lidar (1 m, British National Grid).

Data: the EA's 1 m LIDAR Composite DTM (bare ground) and First Return DSM (ground plus buildings
and trees), open data under the Open Government Licence. Put the GeoTIFFs for the map in
<raw dir>/lidar/dtm/ and <raw dir>/lidar/dsm/ (see README). Any number of tiles in each.

For each building footprint the roof is sampled every half metre, a little inside the walls:
- eaves and ridge are low and high percentiles of the roof surface (roofs are level even when the
  ground slopes, so absolute heights are used), measured from the lowest ground at the walls,
  and mid is the median, for buildings drawn as a flat-topped block;
- a roof is flat when the ridge is less than a metre above the eaves;
- the ridge runs along whichever axis of the footprint the roof height does not fall away along,
  and a roof is hipped when it also falls away towards both ends of the ridge.
Footprints with no raised surface under them (the building is newer than the survey, or gone),
roofs mostly under trees, and small buildings measuring implausibly tall get no measurement, and
keep the rule-based guess from buildings.py.
"""
import glob, math, os
import numpy as np
import shapely

PX = 0.5            # sample spacing inside a footprint, metres
INSET = 0.4         # keep samples this far inside the walls, clear of gutters and overhangs
MIN_ABOVE = 1.8     # median height above ground below which there is no building in the survey
MAX_RISE = 5.0      # tallest roof, eaves to ridge
TREE_COVER = 0.3    # share of a roof under tree canopy beyond which the survey can't see it


class Lidar:
    def __init__(self, folder, to_model):
        import rasterio
        self.lon0, self.lat0, self.kx, self.ky = to_model
        self.grids = {}
        for kind in ("dtm", "dsm"):
            files = sorted(glob.glob(os.path.join(folder, kind, "*.tif")) + glob.glob(os.path.join(folder, kind, "*.asc")))
            if not files: raise FileNotFoundError(f"no {kind} tiles in {os.path.join(folder, kind)}")
            self.grids[kind] = []
            for f in files:
                with rasterio.open(f) as src:
                    a = src.read(1).astype(np.float32)
                    t = src.transform
                a[(a < -100) | (a > 2000)] = np.nan      # nodata (the EA tiles use -3.4e38)
                self.grids[kind].append((a, t))

    def _bng(self, xs, ys):
        from rasterio.warp import transform
        lon = np.asarray(xs) / self.kx + self.lon0
        lat = np.asarray(ys) / self.ky + self.lat0
        e, n = transform("EPSG:4326", "EPSG:27700", lon.tolist(), lat.tolist())
        return np.array(e), np.array(n)

    def _sample(self, kind, e, n):
        out = np.full(len(e), np.nan, dtype=np.float32)
        for a, t in self.grids[kind]:
            col = np.floor((e - t.c) / t.a).astype(int)
            row = np.floor((n - t.f) / t.e).astype(int)
            ok = (row >= 0) & (row < a.shape[0]) & (col >= 0) & (col < a.shape[1])
            out[ok] = a[row[ok], col[ok]]
        return out

    def surface(self, xs, ys):
        """Surveyed surface height (metres above sea level) at model points: roofs, over buildings."""
        e, n = self._bng(xs, ys)
        return self._sample("dsm", e, n)

    def ground(self, xs, ys):
        """Bare ground height (metres above sea level) at model points, under buildings too."""
        e, n = self._bng(xs, ys)
        return self._sample("dtm", e, n)

    def measure(self, poly, trees=None):
        """Eaves and ridge (metres above the lowest ground at the walls), and the roof's shape,
        for one footprint in model metres; None if the survey shows no building there, or the
        roof can't be told apart from trees over it. trees(x, y), if given, is the tree canopy
        height at a point."""
        inner = poly.buffer(-INSET)
        if inner.is_empty or inner.area < 4: return None
        x0, y0, x1, y1 = inner.bounds
        gx, gy = np.meshgrid(np.arange(x0 + PX / 2, x1, PX), np.arange(y0 + PX / 2, y1, PX))
        gx, gy = gx.ravel(), gy.ravel()
        keep = shapely.contains_xy(inner, gx, gy)
        gx, gy = gx[keep], gy[keep]
        if len(gx) < 12: return None
        if trees is not None and np.mean([trees(x, y) > 3 for x, y in zip(gx, gy)]) > TREE_COVER: return None
        ring = np.array(poly.exterior.coords)
        e, n = self._bng(np.concatenate([gx, ring[:, 0]]), np.concatenate([gy, ring[:, 1]]))
        dsm = self._sample("dsm", e[:len(gx)], n[:len(gx)])
        dtm = self._sample("dtm", e[:len(gx)], n[:len(gx)])
        wall_ground = self._sample("dtm", e[len(gx):], n[len(gx):])
        ok = ~np.isnan(dsm) & ~np.isnan(dtm)
        if ok.sum() < 12 or np.all(np.isnan(wall_ground)): return None
        above = dsm - dtm
        if np.median(above[ok]) < MIN_ABOVE: return None
        # keep only the roof: footprints and the survey don't line up exactly, so the edges of a
        # footprint often catch the garden or the pavement
        ok &= above >= max(MIN_ABOVE, 0.4 * float(np.percentile(above[ok], 95)))
        if ok.sum() < 12: return None
        gx, gy, z = gx[ok], gy[ok], dsm[ok]
        base = float(np.nanmin(wall_ground))
        eaves, ridge = float(np.percentile(z, 12)) - base, float(np.percentile(z, 95)) - base
        # low back extensions and porches inside the footprint drag the eaves down: no roof here
        # rises more than MAX_RISE above its eaves
        eaves = max(eaves, ridge - MAX_RISE)
        mid = float(np.percentile(z, 50)) - base
        if eaves > 4 + poly.area / 10: return None     # far too tall for its size: a tree or a mast over it

        # the footprint's axes: u along the longer side of its bounding rectangle, v across it
        q = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
        e0, e1 = math.dist(q[0], q[1]), math.dist(q[1], q[2])
        (ax, ay), (bx, by) = (q[0], q[1]) if e0 >= e1 else (q[1], q[2])
        l = math.hypot(bx - ax, by - ay) or 1
        ux, uy = (bx - ax) / l, (by - ay) / l
        cx, cy = poly.minimum_rotated_rectangle.centroid.coords[0]
        s = np.abs((gx - cx) * ux + (gy - cy) * uy)       # distance from the middle, along u
        t = np.abs((gx - cx) * -uy + (gy - cy) * ux)      # and across

        def corr(a, b):
            if a.std() < 1e-3 or b.std() < 1e-3: return 0.0
            return float(np.corrcoef(a, b)[0, 1])

        flat = ridge - eaves < 1.0
        cs, ct = corr(z, s), corr(z, t)
        # the highest tenth of the roof is the ridge: if it forms a line, that is the ridge's direction
        top = z >= np.percentile(z, 90)
        along_u = ct <= cs              # otherwise: a ridge along u means the roof falls away across it
        if top.sum() >= 4:
            w, vec = np.linalg.eigh(np.cov(np.vstack([gx[top], gy[top]])))
            if w[1] > 2.5 * max(w[0], 1e-6):
                along_u = abs(vec[0, 1] * ux + vec[1, 1] * uy) >= math.sqrt(0.5)
        ridge_dir, end_fall = ((ux, uy), cs) if along_u else ((-uy, ux), ct)
        # and it is hipped if the roof also falls away towards both ends of the ridge
        hipped = not flat and end_fall < -0.25
        out = dict(eaves=eaves, ridge=ridge, mid=mid, flat=flat, u=ridge_dir, hipped=hipped)
        fit = fit_roof(poly, gx, gy, z, ux, uy)
        if fit is not None:
            # the fitted roof planes, where they explain the survey well: the ridge's direction,
            # which ends are hipped, and the pitch
            out.update(u=fit["u"], hips=fit["hips"], hipped=any(fit["hips"]), flat=fit["flat"])
            if not fit["flat"]:
                out["ridge"] = eaves + fit["rise"]
        return out


FIT_RMS = 0.6       # metres: a fitted roof that misses the survey by more than this isn't used
SIMPLER = 0.08      # a more complicated roof must fit this much better (share of the error) to win


def fit_roof(poly, gx, gy, z, ux, uy):
    """Fit the roofs the game can draw to the surveyed roof points (gx, gy, z): flat, or pitched
    with its ridge along either axis of the footprint (u, or v across it) and each end of the
    ridge gabled or hipped, every slope at the same pitch. Each candidate is z = eaves + k * f,
    with f the height-giving distance (to the nearest eaves line), solved by least squares twice,
    the second time without the points the first missed by most (chimneys, dormers, an overhanging
    branch). Returns the best, preferring simpler roofs that fit nearly as well, or None if no
    candidate fits."""
    if len(z) < 30: return None
    cx, cy = poly.minimum_rotated_rectangle.centroid.coords[0]
    pts = np.array(poly.exterior.coords)
    best = []
    for ax, ay in ((ux, uy), (-uy, ux)):
        bx, by = -ay, ax
        S, T = (gx - cx) * ax + (gy - cy) * ay, (gx - cx) * bx + (gy - cy) * by
        ps, pt = (pts[:, 0] - cx) * ax + (pts[:, 1] - cy) * ay, (pts[:, 0] - cx) * bx + (pts[:, 1] - cy) * by
        s0, s1, t0, t1 = ps.min(), ps.max(), pt.min(), pt.max()
        tm, half = (t0 + t1) / 2, (t1 - t0) / 2
        across = half - np.abs(T - tm)
        for h0 in (False, True):
            for h1 in (False, True):
                if (h0 or h1) and (s1 - s0) < 2 * half * 0.6: continue    # too short to hip that way
                f = across.copy()
                if h0: f = np.minimum(f, S - s0)
                if h1: f = np.minimum(f, s1 - S)
                f = np.clip(f, 0, None)
                best.append((1 + h0 + h1, (ax, ay), (h0, h1), half, f))
    def solve(f):
        A = np.vstack([np.ones_like(f), f]).T
        keep = np.ones(len(z), bool)
        for _ in range(2):
            (e, k), *_ = np.linalg.lstsq(A[keep], z[keep], rcond=None)
            r = np.abs(z - (e + k * f))
            keep = r <= max(0.3, np.percentile(r, 85))
        return e, k, float(np.sqrt(np.mean(r[keep] ** 2)))
    flat_rms = float(np.sqrt(np.mean((z - np.median(z)) ** 2)))
    fits = []
    for parts, u, hips, half, f in best:
        e, k, rms = solve(f)
        if k <= 0.1: continue                           # no slope: flat is simpler
        fits.append((rms, parts, u, hips, k * half))
    if not fits: return dict(u=(ux, uy), hips=(False, False), flat=True, rise=0.0) if flat_rms < FIT_RMS else None
    low = min(f[0] for f in fits)
    if flat_rms <= low * (1 + 2 * SIMPLER) + 0.05:
        return dict(u=(ux, uy), hips=(False, False), flat=True, rise=0.0) if flat_rms < FIT_RMS else None
    rms, _, u, hips, rise = min((f for f in fits if f[0] <= low * (1 + SIMPLER) + 0.02), key=lambda f: (f[1], f[0]))
    if rms > FIT_RMS or rise < 0.8: return None
    return dict(u=u, hips=hips, flat=False, rise=float(min(rise, MAX_RISE + 1)))
