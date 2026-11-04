"""What the land is like where a map lies, from the ecoregion it's in: what grows wild on its heath,
how green its grass stays, and what its trees are.

Every map's data carries one small record, data/<map>/region.json, in the same shape wherever the map
is: the ecoregion, biome and biogeographic realm its ground lies in, looked up in RESOLVE's
Ecoregions 2017 (846 ecoregions in 14 biomes over all the world's land; CC BY 4.0), and where that
came from, for the credits. A map the lookup finds no land under still gets a record, saying so,
and the plain look below. From the biome (and for a few looks the realm too), never the place, come
  - whether open shrubland is the land's own wild ground there (fynbos, maquis, desert scrub,
    moorland above the trees, tundra) or, in a land that would be forest, mostly grazing and
    hedges that the satellite land cover can't tell from scrub, so its "shrub" is drawn as meadow
    there and only the mapped heath and scrub are heath (tools/wild.py);
  - the look the game reads, web/public/maps/<map>-region.json: the heath's greens, how much of it
    is in flower and the flowers' colours (web/src/grass.ts); how far the grass, the meadows and
    the bare ground are browned off by a dry summer, and the meadows' flowers (grass.ts, world.ts);
    and how many of the trees are conifers and the tints of their leaves, the garden shrubs' and the
    woods' canopy (web/src/trees.ts, world.ts).

Usage:
  python3 -I tools/region.py <map> fetch   look the map up (downloads the ecoregions once into
                                           data/raw/ecoregions/, 150 MB) and write data/<map>/region.json
  python3 -I tools/region.py <map>         write web/public/maps/<map>-region.json from it
"""
import copy, json, os, struct, sys, urllib.request, zipfile
from collections import Counter

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(TOOLS, "..")
SOURCE = dict(name="RESOLVE Ecoregions 2017", licence="CC BY 4.0, RESOLVE (Dinerstein et al. 2017)",
              url="https://ecoregions.appspot.com/")
URL = "https://storage.googleapis.com/teow2016/Ecoregions2017.zip"
RAW = os.path.join(ROOT, "data", "raw", "ecoregions", "Ecoregions2017.zip")

# Each biome's look. open: the satellite's shrubland is wild heath. heath: the shrubs' greens, their
# flowers, the share in flower and the share browned off. grass: how far a dry season browns the
# grass and meadows (0 never), and the meadows' two flowers. trees: the share that are conifers, and
# tints over the leaf texture for the broadleaves, the conifers, garden shrubs and woods seen from above.
# The temperate broadleaf look is the game's own from before there was a table, so a map in such a
# land looks as it always has.
TEMPERATE_TREES = dict(
    conifer=0.08,
    # mostly fresh greens, some darker, some yellower, the odd copper beech
    leaf=[[0.8, 0.8, 0.78], [0.7, 0.76, 0.7], [0.88, 0.84, 0.62], [0.62, 0.7, 0.6], [0.76, 0.8, 0.72], [0.92, 0.8, 0.56], [0.7, 0.5, 0.48]],
    conifer_leaf=[0.5, 0.6, 0.58],
    shrub=[[0.74, 0.78, 0.7], [0.66, 0.74, 0.62], [0.82, 0.78, 0.58], [0.62, 0.66, 0.58], [0.72, 0.82, 0.68]],
    canopy=[[0.36, 0.5, 0.24], [0.32, 0.46, 0.22], [0.4, 0.53, 0.26], [0.34, 0.44, 0.2]])
GREEN_GRASS = dict(dry=0.0, flowers=["#ffea61", "#fffff9"])   # buttercups and daisies, the colours the meadows always had
TEMPERATE = dict(open=False, grass=GREEN_GRASS, trees=TEMPERATE_TREES,
                 heath=dict(leaf=["#3f5230", "#4c5a33", "#55603a"], flowers=0.12, dry=0.2,
                            bloom=["#e8c22a", "#e8c22a", "#8f4fa0", "#a8659f", "#eee6e8"]))   # gorse, heather, ling, bramble
NEEDLES = dict(TEMPERATE_TREES, conifer=0.55, conifer_leaf=[0.46, 0.58, 0.54],
               leaf=[[0.8, 0.8, 0.78], [0.7, 0.76, 0.7], [0.62, 0.7, 0.6], [0.76, 0.8, 0.72], [0.88, 0.84, 0.62]],
               canopy=[[0.28, 0.42, 0.26], [0.26, 0.4, 0.24], [0.32, 0.45, 0.28], [0.3, 0.4, 0.24]])
LUSH = dict(conifer=0.0, conifer_leaf=[0.5, 0.62, 0.52],
            leaf=[[0.66, 0.8, 0.6], [0.58, 0.74, 0.52], [0.72, 0.84, 0.6], [0.6, 0.7, 0.5], [0.7, 0.78, 0.56]],
            shrub=[[0.66, 0.8, 0.6], [0.6, 0.74, 0.54], [0.72, 0.82, 0.6]],
            canopy=[[0.26, 0.46, 0.2], [0.3, 0.5, 0.22], [0.24, 0.42, 0.2], [0.28, 0.48, 0.24]])
# olive, grey and leathery leaves that keep through a dry summer
DRYLEAF = dict(conifer=0.05, conifer_leaf=[0.5, 0.58, 0.5],
               leaf=[[0.78, 0.8, 0.64], [0.7, 0.74, 0.6], [0.84, 0.82, 0.6], [0.72, 0.74, 0.7], [0.66, 0.68, 0.56]],
               shrub=[[0.76, 0.78, 0.64], [0.68, 0.72, 0.6], [0.8, 0.8, 0.66]],
               canopy=[[0.34, 0.42, 0.26], [0.36, 0.42, 0.3], [0.32, 0.4, 0.25], [0.38, 0.44, 0.3]])
TROPICAL_HEATH = dict(leaf=["#3b5a2c", "#46622f"], flowers=0.2, dry=0.15, bloom=["#d8433a", "#e0913a", "#e3c23a", "#f0ece0", "#c0559a"])
TROPICAL = dict(open=False, grass=dict(dry=0.05, flowers=["#ffea61", "#fffff9"]), trees=LUSH, heath=TROPICAL_HEATH)
SAVANNA_HEATH = dict(leaf=["#55602f", "#626838"], flowers=0.2, dry=0.4, bloom=["#e3c23a", "#f0ece0", "#9a5fae", "#e0913a"])
BIOMES = {
    1: TROPICAL, 14: TROPICAL,
    2: dict(TROPICAL, grass=dict(dry=0.4, flowers=["#ffea61", "#fffff9"]), trees=dict(DRYLEAF, conifer=0.0)),
    3: dict(TROPICAL, trees=dict(LUSH, conifer=0.5)),
    4: TEMPERATE,
    5: dict(TEMPERATE, grass=dict(GREEN_GRASS, dry=0.1), trees=NEEDLES),
    6: dict(TEMPERATE, grass=dict(GREEN_GRASS, dry=0.05), trees=dict(NEEDLES, conifer=0.75, conifer_leaf=[0.42, 0.54, 0.5],
                                                                        leaf=[[0.88, 0.88, 0.7], [0.8, 0.84, 0.66], [0.74, 0.8, 0.68]])),   # spruce and birch
    7: dict(open=True, grass=dict(dry=0.6, flowers=["#f2c12e", "#fffff9"]), trees=dict(DRYLEAF, conifer=0.0), heath=SAVANNA_HEATH),
    8: dict(open=True, grass=dict(dry=0.4, flowers=["#ffea61", "#fffff9"]), trees=dict(TEMPERATE_TREES, conifer=0.05, leaf=TEMPERATE_TREES["leaf"][:6]),
            heath=dict(SAVANNA_HEATH, bloom=["#e3c23a", "#f0ece0", "#9a5fae"])),
    9: dict(open=False, grass=dict(dry=0.1, flowers=["#ffea61", "#fffff9"]), trees=dict(LUSH, conifer=0.0),
            heath=dict(leaf=["#46602f"], flowers=0.15, dry=0.2, bloom=["#f0ece0", "#e3c23a", "#b0559a"])),
    10: dict(open=True, grass=dict(dry=0.3, flowers=["#ffea61", "#fffff9"]), trees=dict(NEEDLES, conifer=0.4),
             heath=dict(leaf=["#4f5a34", "#5a5a3a"], flowers=0.3, dry=0.3, bloom=["#8f4fa0", "#b0559a", "#e3c23a", "#f0ece0"])),
    11: dict(open=True, grass=dict(dry=0.25, flowers=["#fffff9", "#ffea61"]), trees=dict(NEEDLES, conifer=0.6),
             heath=dict(leaf=["#545a38", "#6a5e3e"], flowers=0.2, dry=0.3, bloom=["#f0ece0", "#d87fae", "#8f4fa0"])),
    # fynbos, maquis, chaparral: in flower all over, in drifts of purples, pinks, yellows and whites;
    # grass and meadows straw by summer, and pines among the olive-leaved trees
    12: dict(open=True, grass=dict(dry=0.5, flowers=["#f2b51f", "#fffff9"]), trees=dict(DRYLEAF, conifer=0.25),
             heath=dict(leaf=["#4c5a33"], flowers=0.5, dry=0.3, bloom=["#8f4fa0", "#b0559a", "#d87fae", "#e3c23a", "#f0ece0", "#e0913a"])),
    13: dict(open=True, grass=dict(dry=0.7, flowers=["#f2c12e", "#fffff9"]), trees=DRYLEAF,
             heath=dict(leaf=["#6b6f4a", "#7a7652"], flowers=0.15, dry=0.5, bloom=["#e8c83a", "#f0ece0", "#e0913a", "#c06a9a"])),
}
# where the realm changes the look within a biome: the Mediterranean's maquis and garrigue flower in
# cistus pinks and whites, broom yellow and lavender, without the Cape's and Australia's oranges
REALMS = {
    (12, "Palearctic"): dict(heath=dict(bloom=["#8f4fa0", "#b07fc0", "#d87fae", "#e3c23a", "#f0ece0"])),
}
# no ecoregion found: the game's long-standing look, with plain scrub, a few in flower
FALLBACK = dict(TEMPERATE, open=True, heath=dict(leaf=["#4c5a33"], flowers=0.15, dry=0.3, bloom=["#e3c23a", "#f0ece0", "#8f4fa0"]))


def record(map_id):
    path = os.path.join(ROOT, "data", map_id, "region.json")
    return json.load(open(path)) if os.path.exists(path) else None


def look(map_id):
    """The map's look: its biome's (BIOMES), changed where its realm says (REALMS), or FALLBACK."""
    r = record(map_id)
    if not r or r.get("biome") not in BIOMES: return FALLBACK
    out = copy.deepcopy(BIOMES[r["biome"]])
    for part, change in REALMS.get((r["biome"], r.get("realm")), {}).items(): out[part] = {**out[part], **change}
    return out


def open_shrub(map_id):
    """Whether the satellite land cover's shrubland is wild heath on this map (tools/wild.py)."""
    return look(map_id)["open"]


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


def write_record(map_id, out):
    path = os.path.join(ROOT, "data", map_id, "region.json")
    json.dump(out, open(path, "w"), indent=1)
    open(path, "a").write("\n")
    return path


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
    if not hits:
        path = write_record(map_id, dict(source=dict(SOURCE, note="no ecoregion under the map: the plain look"),
                                         ecoregion=None, eco_id=None, biome=None, biome_name=None, realm=None))
        print(f"{map_id}: no ecoregion under the map, the plain look, in {path}")
        return
    biome = Counter(int(float(h["BIOME_NUM"])) for h in hits).most_common(1)[0][0]
    eco = Counter(h["ECO_NAME"] for h in hits if int(float(h["BIOME_NUM"])) == biome).most_common(1)[0][0]
    h = next(h for h in hits if h["ECO_NAME"] == eco)
    path = write_record(map_id, dict(source=SOURCE, ecoregion=eco, eco_id=int(float(h["ECO_ID"])), biome=biome,
                                     biome_name=h["BIOME_NAME"], realm=h["REALM"]))
    print(f"{map_id}: {eco} ({h['BIOME_NAME']}, {h['REALM']}), {len(hits)} of {len(pts)} points on land, in {path}")


def write_game(map_id):
    r, f = record(map_id), look(map_id)
    src = (r or {}).get("source") or dict(SOURCE, note="no record: the plain look")
    out = dict(source=f"{src['name']} ({src['licence']})" + (f": {src['note']}" if src.get("note") else ""),
               eco=(r or {}).get("ecoregion"), biome=(r or {}).get("biome_name"), realm=(r or {}).get("realm"),
               heath=f["heath"], grass=f["grass"], trees=f["trees"])
    path = os.path.join(ROOT, "web", "public", "maps", f"{map_id}-region.json")
    json.dump(out, open(path, "w"), separators=(",", ":"))
    print(f"{map_id}: {out['eco'] or 'no ecoregion'}: {round(f['heath']['flowers'] * 100)}% of the heath in flower, "
          f"grass {round(f['grass']['dry'] * 100)}% browned off, {round(f['trees']['conifer'] * 100)}% of trees conifers, in {path}")


if __name__ == "__main__":
    sys.path.insert(0, TOOLS)
    if len(sys.argv) < 2: sys.exit(__doc__)
    if sys.argv[2:] == ["fetch"]: fetch(sys.argv[1])
    else: write_game(sys.argv[1])
