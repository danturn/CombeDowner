"""What grows wild on a map's heath and scrub, from the ecoregion it's in.

Every map's data carries one small record, data/<map>/flora.json: the ecoregion and biome its
ground lies in, looked up in RESOLVE's Ecoregions 2017 (846 ecoregions in 14 biomes, covering all
the world's land; CC BY 4.0). The record has the same shape for every map, wherever it is. From the
biome alone, never the place, come
  - whether open shrubland is the land's own wild ground there (fynbos, maquis, desert scrub,
    moorland above the trees, tundra) or, in a land that would be forest, mostly grazing and
    hedges that the satellite land cover can't tell from scrub, so its "shrub" is drawn as meadow
    there and only the mapped heath and scrub are heath (tools/wild.py);
  - what the heath and scrub look like in the game: the shrubs' greens, how many are in flower and
    the flowers' colours (web/public/maps/<map>-flora.json, read by web/src/grass.ts).

Usage:
  python3 -I tools/flora.py <map> fetch   look the map up (downloads the ecoregions once into
                                          data/raw/ecoregions/, 150 MB) and write data/<map>/flora.json
  python3 -I tools/flora.py <map>         write web/public/maps/<map>-flora.json from it
"""
import json, os, struct, sys, urllib.request, zipfile
from collections import Counter

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(TOOLS, "..")
SOURCE = "RESOLVE Ecoregions 2017"
URL = "https://storage.googleapis.com/teow2016/Ecoregions2017.zip"
RAW = os.path.join(ROOT, "data", "raw", "ecoregions", "Ecoregions2017.zip")

# open: the satellite's shrubland is wild heath and scrub; leaf: the shrubs' greens; bloom: their
# flowers; flowers: the share of shrubs in flower; dry: how many are browned off
TEMPERATE = dict(open=False, leaf=["#3f5230", "#4c5a33", "#55603a"], flowers=0.12, dry=0.2,
                 bloom=["#e8c22a", "#e8c22a", "#8f4fa0", "#a8659f", "#eee6e8"])   # gorse, heather, ling, bramble
TROPICAL = dict(open=False, leaf=["#3b5a2c", "#46622f"], flowers=0.2, dry=0.15,
                bloom=["#d8433a", "#e0913a", "#e3c23a", "#f0ece0", "#c0559a"])
BIOMES = {
    1: TROPICAL, 2: TROPICAL, 3: TROPICAL, 14: TROPICAL,
    4: TEMPERATE, 5: TEMPERATE, 6: TEMPERATE,
    7: dict(open=True, leaf=["#55602f", "#626838"], flowers=0.2, dry=0.4, bloom=["#e3c23a", "#f0ece0", "#9a5fae", "#e0913a"]),
    8: dict(open=True, leaf=["#55602f", "#626838"], flowers=0.2, dry=0.4, bloom=["#e3c23a", "#f0ece0", "#9a5fae"]),
    9: dict(open=False, leaf=["#46602f"], flowers=0.15, dry=0.2, bloom=["#f0ece0", "#e3c23a", "#b0559a"]),
    10: dict(open=True, leaf=["#4f5a34", "#5a5a3a"], flowers=0.3, dry=0.3, bloom=["#8f4fa0", "#b0559a", "#e3c23a", "#f0ece0"]),
    11: dict(open=True, leaf=["#545a38", "#6a5e3e"], flowers=0.2, dry=0.3, bloom=["#f0ece0", "#d87fae", "#8f4fa0"]),
    # fynbos, maquis, chaparral: in flower all over, in drifts of purples, pinks, yellows and whites
    12: dict(open=True, leaf=["#4c5a33"], flowers=0.5, dry=0.3, bloom=["#8f4fa0", "#b0559a", "#d87fae", "#e3c23a", "#f0ece0", "#e0913a"]),
    13: dict(open=True, leaf=["#6b6f4a", "#7a7652"], flowers=0.15, dry=0.5, bloom=["#e8c83a", "#f0ece0", "#e0913a", "#c06a9a"]),
}
# a map without a record keeps what the data says, and plain scrub with a few flowers
FALLBACK = dict(open=True, leaf=["#4c5a33"], flowers=0.15, dry=0.3, bloom=["#e3c23a", "#f0ece0", "#8f4fa0"])


def record(map_id):
    path = os.path.join(ROOT, "data", map_id, "flora.json")
    return json.load(open(path)) if os.path.exists(path) else None


def flora(map_id):
    """The biome's settings for a map (see BIOMES), or FALLBACK."""
    r = record(map_id)
    return BIOMES.get(r["biome"], FALLBACK) if r else FALLBACK


def open_shrub(map_id):
    """Whether the satellite land cover's shrubland is wild heath on this map (tools/wild.py)."""
    return flora(map_id)["open"]


# ---- the lookup ----------------------------------------------------------------------------------

def _dbf(b):
    n, hlen, rlen = struct.unpack("<IHH", b[4:12])
    fields, o = [], 32
    while b[o] != 0x0D:
        fields.append((b[o:o + 11].split(b"\0")[0].decode(), b[o + 16]))
        o += 32
    rows = []
    for k in range(n):
        r, o, row = b[hlen + k * rlen + 1: hlen + (k + 1) * rlen], 0, {}
        for name, length in fields:
            row[name] = r[o:o + length].decode("latin-1").strip()
            o += length
        rows.append(row)
    return rows


def _containing(shp, shx, points):
    """For each (lon, lat), the index of the shapefile's polygon it's in, or None (the sea)."""
    import numpy as np
    import shapely
    found = [None] * len(points)
    n = (len(shx) - 100) // 8
    for k in range(n):
        off = struct.unpack(">i", shx[100 + 8 * k: 104 + 8 * k])[0] * 2 + 8
        x0, y0, x1, y1 = struct.unpack("<4d", shp[off + 4: off + 36])
        near = [p for p, (x, y) in enumerate(points) if found[p] is None and x0 <= x <= x1 and y0 <= y <= y1]
        if not near: continue
        nparts, npts = struct.unpack("<2i", shp[off + 36: off + 44])
        parts = list(struct.unpack(f"<{nparts}i", shp[off + 44: off + 44 + 4 * nparts])) + [npts]
        xy = np.frombuffer(shp, dtype="<f8", count=2 * npts, offset=off + 44 + 4 * nparts).reshape(-1, 2)
        for p in near:
            # inside an odd number of rings: in the land, not in a hole of it
            inside = sum(bool(shapely.contains_xy(shapely.Polygon(xy[parts[r]:parts[r + 1]]), *points[p])) for r in range(nparts) if parts[r + 1] - parts[r] >= 4)
            if inside % 2: found[p] = k
    return found


def fetch(map_id):
    from area import area
    if not os.path.exists(RAW):
        os.makedirs(os.path.dirname(RAW), exist_ok=True)
        print(f"downloading {URL}")
        urllib.request.urlretrieve(URL, RAW + ".part")
        os.replace(RAW + ".part", RAW)
    z = zipfile.ZipFile(RAW)
    rows = _dbf(z.read("Ecoregions2017.dbf"))
    # nine points over the detailed map, so a centre on an ecoregion's edge or in the sea still finds its land
    w, s, e, n = area(map_id).bbox
    pts = [(w + (e - w) * a / 4, s + (n - s) * b / 4) for a in (1, 2, 3) for b in (1, 2, 3)]
    hits = [rows[k] for k in _containing(z.read("Ecoregions2017.shp"), z.read("Ecoregions2017.shx"), pts) if k is not None]
    if not hits: sys.exit(f"{map_id}: no ecoregion under the map")
    biome = Counter(int(float(h["BIOME_NUM"])) for h in hits).most_common(1)[0][0]
    eco = Counter(h["ECO_NAME"] for h in hits if int(float(h["BIOME_NUM"])) == biome).most_common(1)[0][0]
    h = next(h for h in hits if h["ECO_NAME"] == eco)
    out = dict(source=SOURCE, ecoregion=eco, eco_id=int(float(h["ECO_ID"])), biome=biome, biome_name=h["BIOME_NAME"], realm=h["REALM"])
    path = os.path.join(ROOT, "data", map_id, "flora.json")
    json.dump(out, open(path, "w"), indent=1)
    open(path, "a").write("\n")
    print(f"{map_id}: {eco} ({h['BIOME_NAME']}), {len(hits)} of {len(pts)} points on land, in {path}")


def write_game(map_id):
    r, f = record(map_id), flora(map_id)
    out = dict(eco=r["ecoregion"] if r else None, leaf=f["leaf"], bloom=f["bloom"], flowers=f["flowers"], dry=f["dry"])
    path = os.path.join(ROOT, "web", "public", "maps", f"{map_id}-flora.json")
    json.dump(out, open(path, "w"), separators=(",", ":"))
    print(f"{map_id}: {out['eco'] or 'no ecoregion'}, {round(f['flowers'] * 100)}% of the heath in flower, in {path}")


if __name__ == "__main__":
    sys.path.insert(0, TOOLS)
    if len(sys.argv) < 2: sys.exit(__doc__)
    if sys.argv[2:] == ["fetch"]: fetch(sys.argv[1])
    else: write_game(sys.argv[1])
