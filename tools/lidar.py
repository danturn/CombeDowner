"""Real building heights and roof shapes from Environment Agency lidar (1 m, British National Grid).

Data: the EA's 1 m LIDAR Composite DTM (bare ground) and First Return DSM (ground plus buildings
and trees), open data under the Open Government Licence. Put the GeoTIFFs for the map in
<raw dir>/lidar/dtm/ and <raw dir>/lidar/dsm/ (see README). Several tiles in each are merged.

For each building footprint the roof is sampled every half metre, a little inside the walls:
- eaves and ridge are low and high percentiles of the surface (roofs are level even when the
  ground slopes, so absolute heights are used), measured from the lowest ground at the walls;
- a roof is flat when the ridge is less than a metre above the eaves;
- the ridge runs along whichever axis of the footprint the roof height does not fall away along,
  and a roof is hipped when it also falls away towards both ends of the ridge.
Footprints with no raised surface under them (the building is newer than the survey, or gone)
get no measurement, and keep the rule-based guess from buildings.py.
"""
import glob, math, os
import numpy as np
import shapely

PX = 0.5            # sample spacing inside a footprint, metres
INSET = 0.4         # keep samples this far inside the walls, clear of gutters and overhangs
MIN_ABOVE = 1.8     # median height above ground below which there is no building in the survey


class Lidar:
    def __init__(self, folder, to_model):
        from rasterio.merge import merge
        import rasterio
        self.lon0, self.lat0, self.kx, self.ky = to_model
        self.grids = {}
        for kind in ("dtm", "dsm"):
            files = sorted(glob.glob(os.path.join(folder, kind, "*.tif")) + glob.glob(os.path.join(folder, kind, "*.asc")))
            if not files: raise FileNotFoundError(f"no {kind} tiles in {os.path.join(folder, kind)}")
            srcs = [rasterio.open(f) for f in files]
            nodata = srcs[0].nodata
            arr, t = merge(srcs)
            for s in srcs: s.close()
            a = arr[0].astype(np.float32)
            if nodata is not None: a[a == nodata] = np.nan
            a[(a < -100) | (a > 2000)] = np.nan
            self.grids[kind] = (a, t)

    def _bng(self, xs, ys):
        from rasterio.warp import transform
        lon = np.asarray(xs) / self.kx + self.lon0
        lat = np.asarray(ys) / self.ky + self.lat0
        e, n = transform("EPSG:4326", "EPSG:27700", lon.tolist(), lat.tolist())
        return np.array(e), np.array(n)

    def _sample(self, kind, e, n):
        a, t = self.grids[kind]
        col = np.floor((e - t.c) / t.a).astype(int)
        row = np.floor((n - t.f) / t.e).astype(int)
        ok = (row >= 0) & (row < a.shape[0]) & (col >= 0) & (col < a.shape[1])
        out = np.full(len(e), np.nan, dtype=np.float32)
        out[ok] = a[row[ok], col[ok]]
        return out

    def measure(self, poly):
        """Eaves and ridge (metres above the lowest ground at the walls), and the roof's shape,
        for one footprint in model metres; None if the survey shows no building there."""
        inner = poly.buffer(-INSET)
        if inner.is_empty or inner.area < 4: return None
        x0, y0, x1, y1 = inner.bounds
        gx, gy = np.meshgrid(np.arange(x0 + PX / 2, x1, PX), np.arange(y0 + PX / 2, y1, PX))
        gx, gy = gx.ravel(), gy.ravel()
        keep = shapely.contains_xy(inner, gx, gy)
        gx, gy = gx[keep], gy[keep]
        if len(gx) < 12: return None
        ring = np.array(poly.exterior.coords)
        e, n = self._bng(np.concatenate([gx, ring[:, 0]]), np.concatenate([gy, ring[:, 1]]))
        dsm = self._sample("dsm", e[:len(gx)], n[:len(gx)])
        dtm = self._sample("dtm", e[:len(gx)], n[:len(gx)])
        wall_ground = self._sample("dtm", e[len(gx):], n[len(gx):])
        ok = ~np.isnan(dsm) & ~np.isnan(dtm)
        if ok.sum() < 12 or np.all(np.isnan(wall_ground)): return None
        if np.median(dsm[ok] - dtm[ok]) < MIN_ABOVE: return None
        gx, gy, z = gx[ok], gy[ok], dsm[ok]
        base = float(np.nanmin(wall_ground))
        eaves, ridge = float(np.percentile(z, 5)) - base, float(np.percentile(z, 95)) - base

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
        return dict(eaves=eaves, ridge=ridge, flat=flat, u=ridge_dir, hipped=hipped)
