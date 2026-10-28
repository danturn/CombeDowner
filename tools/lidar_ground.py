"""The terrain tiles' heights replaced by the Environment Agency's lidar ground, wherever it covers them.

Usage: python3 -I tools/lidar_ground.py <map> [<dir with the wide layers>]

The ground of every map is the Mapzen terrarium tiles (zoom 15 for the full-detail squares, 14 for the
wide map round them), kept in <dir>/terrain15/ and <dir>/terrain/. Over most of England Mapzen took
those heights from the same lidar, but over whole districts it fell back to a far coarser survey: in
Bath the ground stood up to 5 m off the lidar's over square 2_2, Lansdown and the city's west and east
edges, in rectangles where one survey stopped and the other began, and the buildings measured on the
lidar's ground stood that far off theirs. So each pixel of each tile takes the mean of the lidar's
1 m ground over its own footprint wherever the lidar covers it all, and keeps Mapzen's height where
it doesn't. Run once after the tiles are fetched and the lidar is in <dir>/lidar/dtm/, before
`tools/mapdata.py pack`: the packed tiles then carry the lidar's ground, and a build without the lidar
stands on it all the same. Data: Environment Agency, Open Government Licence.
"""
import glob, math, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area
from lidar import Lidar

FOLDERS = {15: "terrain15", 14: "terrain"}


def pixel_lonlat(z, tx, ty, fx, fy):
    """Lon/lat at fractional pixel (fx, fy) of tile (tx, ty) at zoom z (Web Mercator)."""
    n = 256 * 2 ** z
    px, py = tx * 256 + fx, ty * 256 + fy
    lon = px / n * 360 - 180
    lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * py / n))))
    return lon, lat


def main(map_id, raw):
    A = area(map_id)
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    L = Lidar(os.path.join(raw, "lidar"), (lon0, lat0, kx, ky))
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
            samples = np.stack([L.ground(x + ox, y + oy) for ox in offs for oy in offs])
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
        print(f"zoom {z}: {changed} of {len(files)} tiles given the lidar's ground")


if __name__ == "__main__":
    if len(sys.argv) < 2: raise SystemExit(__doc__)
    map_id = sys.argv[1]
    raw = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw", map_id, "wide")
    main(map_id, raw)
