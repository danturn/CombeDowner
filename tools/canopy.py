"""Tree canopy heights from Meta / WRI's global canopy height map (about 1.2 m per pixel).

Data: s3://dataforgood-fb-data/forests/v1/alsgedi_global_v6_float/chm/<quadkey>.tif, one
zoom-9 quadkey tile per file, Web Mercator, heights in whole metres. Download the tile covering
the map into data/raw/canopy/ (see README).

Used for: tree positions and heights (every local maximum of the canopy becomes a tree) and for
spotting hedges along garden boundaries.
"""
import glob, math, os
import numpy as np

R = 6378137.0


class Canopy:
    def __init__(self, folder, bbox_lonlat, to_model):
        import rasterio
        from rasterio.windows import from_bounds
        files = glob.glob(os.path.join(folder, "*.tif"))
        if not files: raise FileNotFoundError("no canopy tile in " + folder)
        W, S, E, N = bbox_lonlat
        mx = lambda lon: math.radians(lon) * R
        my = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R
        with rasterio.open(files[0]) as src:
            win = from_bounds(mx(W), my(S), mx(E), my(N), src.transform).round_offsets().round_lengths()
            self.h = src.read(1, window=win).astype(np.float32)
            t = src.window_transform(win)
        self.x0, self.dx, self.y0, self.dy = t.c, t.a, t.f, t.e       # mercator origin and pixel size (dy < 0)
        self.to_model = to_model
        # model metres -> mercator: invert via lon/lat
        self.lon0, self.lat0, self.kx, self.ky = to_model
        self.merc = lambda x, y: (mx(x / self.kx + self.lon0), my(y / self.ky + self.lat0))
        # pixel size in model metres (mercator is stretched by 1 / cos(lat))
        self.px = abs(self.dx) * math.cos(math.radians(self.lat0))

    def at(self, x, y):
        """Canopy height (m) at model point (x, y), 0 outside the tile."""
        X, Y = self.merc(x, y)
        i, j = int((X - self.x0) / self.dx), int((Y - self.y0) / self.dy)
        if 0 <= j < self.h.shape[0] and 0 <= i < self.h.shape[1]: return float(self.h[j, i])
        return 0.0

    def tree_tops(self, min_height=3.0, radius_m=2.6):
        """Local maxima of the canopy: (x, y, height) in model metres."""
        h = self.h
        r = max(1, int(round(radius_m / self.px)))
        # max filter by repeated shifts (no scipy needed)
        m = h.copy()
        pad = np.pad(h, r, mode="constant")
        for dj in range(-r, r + 1):
            for di in range(-r, r + 1):
                if di * di + dj * dj > r * r: continue
                m = np.maximum(m, pad[r + dj:r + dj + h.shape[0], r + di:r + di + h.shape[1]])
        js, is_ = np.nonzero((h >= min_height) & (h >= m))
        out, seen = [], set()
        for j, i in zip(js, is_):
            k = (j // r, i // r)              # flat tops give several equal maxima: keep one
            if k in seen: continue
            seen.add(k)
            X, Y = self.x0 + (i + 0.5) * self.dx, self.y0 + (j + 0.5) * self.dy
            lon = math.degrees(X / R)
            lat = math.degrees(2 * math.atan(math.exp(Y / R)) - math.pi / 2)
            out.append(((lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky, float(h[j, i])))
        return out
