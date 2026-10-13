"""The ground the map is built on, from the Environment Agency's 1 m lidar where there is any.

Usage: python3 -I tools/ground.py <raw dir>

The builds read ground heights from zoom-15 terrarium tiles (about 3 m pixels): tools/prep_map.py
for the squares, and tools/canal.py and tools/railway.py through tools/terrain.py. The Mapzen
tiles they start from are a mix of sources, and over Bath they stray from the survey by a few
tenths of a metre as a rule and by two to four metres in places (river banks, steep streets),
which shows in the game as lumpy banks and ground poking through the roads.

This writes the same tiles again into <raw dir>/ground15/, one for each Mapzen tile in
<raw dir>/terrain15/, with each pixel the mean of the lidar ground (<raw dir>/lidar/dtm/, the
LIDAR Composite DTM, see tools/fetch.py) over the pixel's own patch of ground, so the game's
4 m grid stands on the survey's average there rather than on any one noisy metre. Where the survey
has nothing (past the lidar squares the build has, or a hole in them) the Mapzen height is kept,
and within FADE metres of such a place the two are blended, so there's no step where they meet.
The builds read a tile from ground15/ when there is one there, and from terrain15/ when not.

Every tile is worked out from the same survey and the same Mapzen tile wherever it's asked for, so
neighbouring squares, the canal and the railway all get the same ground.
"""
import glob, math, os, sys
import numpy as np
from PIL import Image

Z = 15
NPX = 256 * 2 ** Z
FADE = 20.0     # metres over which the lidar gives way to the Mapzen tiles where the survey stops


def decode(a):
    a = a.astype(float)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def encode(h):
    v = np.clip(np.round((h + 32768) * 256), 0, 2 ** 24 - 1).astype(np.int64)
    return np.stack([(v >> 16) & 255, (v >> 8) & 255, v & 255], axis=-1).astype(np.uint8)


class Survey:
    """The lidar DTM tiles in a folder, read a window at a time."""

    def __init__(self, folder):
        import rasterio
        self.files = []
        for f in sorted(glob.glob(os.path.join(folder, "*.tif")) + glob.glob(os.path.join(folder, "*.asc"))):
            with rasterio.open(f) as src:
                t = src.transform
                self.files.append((f, t.c, t.f, t.a, src.width, src.height))

    def window(self, e0, n0, e1, n1):
        """The survey's 1 m heights over the box (British National Grid metres, whole metres), as
        an array of rows north to south, NaN where there's none; and the box's west and north edges."""
        import rasterio
        from rasterio.windows import Window
        e0, n0, e1, n1 = math.floor(e0), math.floor(n0), math.ceil(e1), math.ceil(n1)
        out = np.full((n1 - n0, e1 - e0), np.nan, dtype=np.float32)
        for f, c, top, a, w, h in self.files:
            # (the EA tiles are whole metres, north up)
            fe0, fn1 = c, top
            fe1, fn0 = c + w * a, top - h * a
            ie0, ie1, in0, in1 = max(e0, fe0), min(e1, fe1), max(n0, fn0), min(n1, fn1)
            if ie0 >= ie1 or in0 >= in1: continue
            col, row = int(round(ie0 - fe0)), int(round(fn1 - in1))
            with rasterio.open(f) as src:
                a_ = src.read(1, window=Window(col, row, int(ie1 - ie0), int(in1 - in0))).astype(np.float32)
            a_[(a_ < -100) | (a_ > 2000)] = np.nan       # nodata (the EA tiles use -3.4e38)
            out[int(n1 - in1):int(n1 - in0), int(ie0 - e0):int(ie1 - e0)] = a_
        return out, e0, n1


def box_mean(a, r):
    """Mean of the valid values in the (2r + 1)-wide square round each cell, and the share of the
    square that has a value."""
    ok = np.isfinite(a)
    v = np.where(ok, a, 0).astype(np.float64)
    def box(x):
        s = np.pad(x, ((r + 1, r), (r + 1, r))).cumsum(0).cumsum(1)
        return s[2 * r + 1:, 2 * r + 1:] - s[:-2 * r - 1, 2 * r + 1:] - s[2 * r + 1:, :-2 * r - 1] + s[:-2 * r - 1, :-2 * r - 1]
    n = box(ok.astype(np.float64))
    with np.errstate(invalid="ignore", divide="ignore"):
        return box(v) / n, n / (2 * r + 1) ** 2


def tile(survey, tx, ty, mapzen):
    """One ground tile: the survey's mean over each pixel, blended into the Mapzen heights where
    the survey runs out. None if the survey doesn't reach the tile at all."""
    from rasterio.warp import transform
    jj, ii = np.mgrid[0:256, 0:256]
    lon = (tx * 256 + ii + 0.5) / NPX * 360 - 180
    lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * (ty * 256 + jj + 0.5) / NPX))))
    e, n = transform("EPSG:4326", "EPSG:27700", lon.ravel().tolist(), lat.ravel().tolist())
    e, n = np.array(e).reshape(256, 256), np.array(n).reshape(256, 256)
    pad = FADE + 4
    a, w0, n1 = survey.window(e.min() - pad, n.min() - pad, e.max() + pad, n.max() + pad)
    if not np.isfinite(a).any(): return None
    px = 2 ** (-Z) * 40075016.686 * math.cos(math.radians(float(lat.mean()))) / 256    # a pixel's width on the ground
    mean, _ = box_mean(a, max(1, int(round(px / 2))))
    _, cover = box_mean(a, int(FADE / 2))
    col, row = np.clip((e - w0).astype(int), 0, a.shape[1] - 1), np.clip((n1 - n).astype(int), 0, a.shape[0] - 1)
    m, c = mean[row, col], cover[row, col]
    k = np.where(np.isfinite(m), np.clip(c, 0, 1), 0)
    k = k * k * (3 - 2 * k)
    return np.where(k > 0, np.nan_to_num(m) * k + mapzen * (1 - k), mapzen)


def main(raw):
    src, dst = os.path.join(raw, "terrain15"), os.path.join(raw, "ground15")
    survey = Survey(os.path.join(raw, "lidar", "dtm"))
    if not survey.files: raise SystemExit(f"no lidar DTM tiles in {os.path.join(raw, 'lidar', 'dtm')}: see tools/fetch.py")
    os.makedirs(dst, exist_ok=True)
    done = kept = 0
    for f in sorted(glob.glob(os.path.join(src, f"{Z}_*_*.png"))):
        _, tx, ty = os.path.basename(f)[:-4].split("_")
        mapzen = decode(np.asarray(Image.open(f).convert("RGB")))
        h = tile(survey, int(tx), int(ty), mapzen)
        out = os.path.join(dst, os.path.basename(f))
        if h is None:
            if os.path.exists(out): os.remove(out)
            kept += 1; continue
        Image.fromarray(encode(h), "RGB").save(out)
        done += 1
    print(f"ground: {done} tiles from the lidar into {dst}, {kept} left to the Mapzen tiles (no survey there)")


if __name__ == "__main__":
    if len(sys.argv) != 2: raise SystemExit(__doc__)
    main(sys.argv[1])
