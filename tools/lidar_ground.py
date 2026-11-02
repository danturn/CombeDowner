"""The terrain tiles' heights replaced by a survey's ground, wherever it covers them.

Usage: python3 -I tools/lidar_ground.py <map> [<dir with the wide layers>]

The ground of every map is the Mapzen terrarium tiles (zoom 15 for the full-detail squares, 14 for the
wide map round them), kept in <dir>/terrain15/ and <dir>/terrain/: they are every map's ground
layer, whichever survey measured it. Over most of England Mapzen took those heights from the
Environment Agency's lidar, but over whole districts it fell back to a far coarser survey: in
Bath the ground stood up to 5 m off the lidar's over square 2_2, Lansdown and the city's west and east
edges, in rectangles where one survey stopped and the other began, and the buildings measured on the
lidar's ground stood that far off theirs. So each pixel of each tile takes the mean of a better
survey's ground over its own footprint wherever that covers it all, and keeps Mapzen's height where
it doesn't. Run as it is, this takes the lidar in <dir>/lidar/dtm/ (Environment Agency, Open
Government Licence); tools/cct.py brings the City of Cape Town's contours the same way. Run once
after the tiles are fetched, before `tools/mapdata.py pack`: the packed tiles then carry the
survey's ground, and a build without the survey stands on it all the same.
"""
import glob, math, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

FOLDERS = {15: "terrain15", 14: "terrain"}


def pixel_lonlat(z, tx, ty, fx, fy):
    """Lon/lat at fractional pixel (fx, fy) of tile (tx, ty) at zoom z (Web Mercator)."""
    n = 256 * 2 ** z
    px, py = tx * 256 + fx, ty * 256 + fy
    lon = px / n * 360 - 180
    lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * py / n))))
    return lon, lat


def tile_heights(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.int64)
    return ((a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]) / 256.0 - 32768


class Tiles:
    """The zoom-15 tiles' ground as it stands, at model points (nearest pixel; NaN with no tile)."""

    def __init__(self, raw, A, z=15):
        self.z, self.tiles, self.A = z, {}, A
        for f in glob.glob(os.path.join(raw, FOLDERS[z], f"{z}_*_*.png")):
            _, tx, ty = os.path.basename(f)[:-4].split("_")
            self.tiles[int(tx), int(ty)] = f

    def ground(self, xs, ys):
        lon0, lat0 = self.A.centre
        kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
        lon, lat = np.asarray(xs) / kx + lon0, np.asarray(ys) / ky + lat0
        n = 256 * 2 ** self.z
        px = (lon + 180) / 360 * n
        py = (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n
        tx, ty = (px // 256).astype(np.int64), (py // 256).astype(np.int64)
        out = np.full(px.shape, np.nan)
        for key in set(zip(tx.tolist(), ty.tolist())):
            if key not in self.tiles: continue
            h = tile_heights(self.tiles[key])
            sel = (tx == key[0]) & (ty == key[1])
            out[sel] = h[(py[sel] - key[1] * 256).astype(np.int64), (px[sel] - key[0] * 256).astype(np.int64)]
        return out


def overlay(A, raw, ground, name="the lidar's"):
    """ground(xs, ys) in model metres, NaN where the survey doesn't reach, into every tile."""
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    for z, folder in FOLDERS.items():
        files = sorted(glob.glob(os.path.join(raw, folder, f"{z}_*_*.png")))
        changed = 0
        for f in files:
            _, tx, ty = os.path.basename(f)[:-4].split("_")
            tx, ty = int(tx), int(ty)
            fy, fx = np.mgrid[0:256, 0:256] + 0.5
            lon, lat = pixel_lonlat(z, tx, ty, fx.ravel(), fy.ravel())
            x, y = (lon - lon0) * kx, (lat - lat0) * ky
            # the pixel's footprint, sampled every metre or so across it
            size = 40075016.7 * math.cos(math.radians(lat0)) / (256 * 2 ** z)
            k = max(1, int(round(size)))
            offs = (np.arange(k) - (k - 1) / 2) * (size / k)
            samples = np.stack([ground(x + ox, y + oy) for ox in offs for oy in offs])
            full = ~np.isnan(samples).any(axis=0)
            if not full.any():
                continue
            h = samples.mean(axis=0)
            a = np.asarray(Image.open(f).convert("RGB")).astype(np.int64)
            v = ((a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]).ravel()
            v[full] = np.round((h[full] + 32768) * 256).astype(np.int64)
            v = v.reshape(256, 256)
            rgb = np.stack([(v >> 16) & 255, (v >> 8) & 255, v & 255], axis=-1).astype(np.uint8)
            Image.fromarray(rgb, "RGB").save(f)
            changed += 1
        print(f"zoom {z}: {changed} of {len(files)} tiles given {name} ground")


def main(map_id, raw):
    from lidar import Lidar
    A = area(map_id)
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    overlay(A, raw, Lidar(os.path.join(raw, "lidar"), (lon0, lat0, kx, ky)).ground)


if __name__ == "__main__":
    if len(sys.argv) < 2: raise SystemExit(__doc__)
    map_id = sys.argv[1]
    raw = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw", map_id, "wide")
    main(map_id, raw)
