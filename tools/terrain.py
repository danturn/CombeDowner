"""Ground heights from the Mapzen terrain tiles (or the lidar's ground, tools/ground.py, where there is any), for the tools that lay things along the ground
after the map is built (tools/canal.py, tools/railway.py).

Heights are worked out exactly as tools/prep_map.py works them out for the full-detail squares:
bilinear between pixels of the zoom-15 terrarium tiles, on the whole world's pixel grid, so a
height here matches the ground the game draws (bar the roads flattened into it). Tiles are fetched
as they're needed and kept in the cache folder, which is the one prep_tiles.py uses.
"""
import math, os, urllib.request
import numpy as np
from PIL import Image

Z = 15
NPX = 256 * 2 ** Z


class Terrain:
    def __init__(self, centre, cache):
        self.lon0, self.lat0 = centre
        self.kx, self.ky = 111320 * math.cos(math.radians(self.lat0)), 110574
        self.cache = cache
        self.tiles = {}

    def tile(self, tx, ty):
        t = self.tiles.get((tx, ty))
        if t is None:
            # the ground from the lidar where tools/ground.py has made it (beside the cache), the Mapzen tile where not
            path = os.path.join(os.path.dirname(os.path.abspath(self.cache)), "ground15", f"{Z}_{tx}_{ty}.png")
            if not os.path.exists(path): path = os.path.join(self.cache, f"{Z}_{tx}_{ty}.png")
            if not os.path.exists(path):
                url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png"
                data = urllib.request.urlopen(url, timeout=30).read()
                os.makedirs(self.cache, exist_ok=True)
                tmp = f"{path}.{os.getpid()}"
                open(tmp, "wb").write(data)
                os.replace(tmp, path)
            a = np.asarray(Image.open(path).convert("RGB")).astype(float)
            t = self.tiles[(tx, ty)] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        return t

    def pixel(self, i, j):
        return self.tile(i // 256, j // 256)[j % 256, i % 256]

    def lonlat(self, x, y):
        return x / self.kx + self.lon0, y / self.ky + self.lat0

    def proj(self, lon, lat):
        return (lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky

    def elev(self, x, y):
        """Height above sea level at model metres (x east, y north of the map centre)."""
        lon, lat = self.lonlat(x, y)
        u = (lon + 180) / 360 * NPX - 0.5
        v = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * NPX - 0.5
        i, j = int(math.floor(u)), int(math.floor(v))
        fu, fv = u - i, v - j
        q00, q01, q10, q11 = self.pixel(i, j), self.pixel(i + 1, j), self.pixel(i, j + 1), self.pixel(i + 1, j + 1)
        return (q00 * (1 - fu) + q01 * fu) * (1 - fv) + (q10 * (1 - fu) + q11 * fu) * fv
