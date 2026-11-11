"""Download everything a map with a wide area (the whole of Bath) is built from, from the public
sources, into the raw dir the builds read: the start of rebuilding the repository's copy of the
map data from scratch (tools/mapdata.py). For an ordinary rebuild none of this is needed:
tools/mapdata.py unpack gives the same data from the repository.

Usage: python3 -I tools/fetch.py <map> [<raw dir>] [--only overture,lidar,canopy,osm,fsa,census,conservation,listed,parcels,epc,city,footprints]

The raw dir is data/raw/<map>/wide unless given. In turn:
- overture: the Overture layers for the wide circle, at the release in area.py (tools/download.py);
- lidar: the Environment Agency's 1 m LIDAR Composite DTM, First Return DSM and Last Return DSM
  for every OS 5 km square the full-detail squares stand on (each a plain download of about 75 MB,
  unzipped into lidar/dtm/, lidar/dsm/ and lidar/last/; about 3 GB in all), and in Wales the Welsh
  Government's 1 m DTM and DSM (2020-23), 1 km tiles of about 3 MB each listed by DataMapWales's
  tile catalogue, into the same folders. A map on the border gets both; the EA has no Welsh squares
  and Wales no last returns (they are optional). In Scotland, the Scottish Public Sector LiDAR's
  DTM and DSM (50 cm where phases 3 to 6 or the national programme have flown, 1 m from phases 1
  and 2), read from the Scottish Remote Sensing Portal's open bucket over just the map's box and
  saved as 1 km tiles (scotland_lidar), with no last returns either; much of Scotland has none;
- canopy: the Meta / WRI canopy height tile over the map's centre (about 290 MB);
- osm, fsa: OpenStreetMap's businesses (and its streets' widths and pavements) and the Food Standards Agency's hygiene ratings
  (tools/osm.py, tools/fsa.py). These are the live data, so they will have changed since the copy
  in the repository was made;
- census, conservation (Great Britain, and England and Scotland): the census's accommodation types
  for each output area (2021 in England and Wales, 2022 in Scotland), and the conservation areas
  (tools/census.py, tools/conservation.py), which say what the houses are where the map data
  doesn't (buildings.priors). All open, no account;
- listed, parcels, epc (Scotland only, where all three are open downloads): Historic Environment
  Scotland's listed buildings that name railings or walls (tools/listed.py), Registers of
  Scotland's cadastral parcels (tools/parcels.py ros) and the domestic energy certificates with OS
  Open UPRN (tools/epc.py scotland). The national downloads behind the last two are kept once in
  data/raw/ for every map;
- city (a map inside the City of Cape Town): the City's 2 m contours, measured roof heights and
  tree crowns (tools/cct.py), turned into the heights layer and the crowns beside the canopy map.
  The contours' ground goes into the terrain tiles once a build has fetched them (cct.py ground);
- footprints: the buildings the buildings layer leaves out, from the sources the map lists
  (tools/footprints.py; Google's need duckdb), after the city's heights. A map listing none gets
  an empty layer.
The HM Land Registry parcels (INSPIRE Index Polygons) have to be fetched by hand, one zip per local
authority: `tools/parcels.py` converts the download to `parcels.geojson` in the wide dir (see
docs/new-area.md). They are optional: without them the partition build divides blocks by rule.
Files already there are left alone. The Mapzen terrain tiles are fetched by the builds as they
need them, and outside Scotland the energy certificates have to be downloaded by hand (it needs an
account): see docs/new-area.md, and put them in <raw dir>/epc/.

Then, to measure and pack it all (tools/mapdata.py):
  python3 -I tools/canal.py <map> <raw dir> web/public/maps/<map>-canal.json   (and railway.py)
  python3 -I tools/prep_tiles.py <map> <raw dir> web/public/maps/<map> --force --measure
  python3 -I tools/prep_wide.py <map> <raw dir> web/public/maps/<map>-wide.json --measure
  python3 -I tools/mapdata.py pack <map> <raw dir>
"""
import collections, json, math, os, subprocess, sys, threading, time, urllib.error, urllib.request, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

TOOLS = os.path.dirname(os.path.abspath(__file__))
LAYERS = ["building", "segment", "water", "land_use", "land", "land_cover", "place", "infrastructure"]
LIDAR = "https://environment.data.gov.uk/tiles/collections/survey/{kind}/2022/1/{square}"
KINDS = {"dtm": "lidar_composite_dtm", "dsm": "lidar_composite_first_return_dsm", "last": "lidar_composite_last_return_dsm"}
WALES = ("https://datamap.gov.wales/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature"
         "&typeNames=geonode:welsh_government_lidar_tile_catalogue_2020_2023&outputFormat=application/json"
         "&count=10000&bbox={e0},{n0},{e1},{n1},urn:ogc:def:crs:EPSG::27700")
SCOTLAND = "https://srsp-open-data.s3.eu-west-2.amazonaws.com"
# the Scottish Public Sector LiDAR's surveys, newest first: where a newer one has a gap an older one fills it
SCOTTISH_PHASES = ("national-lidar-programme", "phase-6", "phase-5", "phase-4", "phase-3", "phase-2", "phase-1")
CANOPY = "https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/{q}.tif"
SCOTLAND_SOUTH = 525000     # British National Grid northing: no part of Scotland lies south of it
UA = {"User-Agent": "CombeDowner map builder (https://combedowner.com)"}
REACH = 250         # metres past the full-detail squares that the lidar is fetched for (they measure 210 m past their edges)


def os_square(e, n):
    """The OS 5 km square holding British National Grid metres (e, n), as the EA names it by its
    south-west corner (ST75NE is ST7555)."""
    e100, n100 = int(e // 100000), int(n // 100000)
    l1 = (19 - n100) - (19 - n100) % 5 + (e100 + 10) // 5
    l2 = (19 - n100) * 5 % 25 + e100 % 5
    letter = lambda v: chr(ord("A") + v + (1 if v > 7 else 0))      # (there is no I)
    return f"{letter(l1)}{letter(l2)}{int(e % 100000) // 5000 * 5:02d}{int(n % 100000) // 5000 * 5:02d}"


def lidar_box(A):
    """The British National Grid box (e0, n0, e1, n1) the lidar is fetched over: the full-detail
    squares and REACH round them, as lidar_squares works it out."""
    return lidar_squares(A, box_only=True)


def lidar_squares(A, box_only=False):
    """Every OS 5 km square under the full-detail squares (tools/prep_tiles.py) or within REACH
    of them: what their buildings and trees are measured over."""
    from shapely.geometry import Point, box
    from lidar import bng_transformer
    from prep_tiles import CELLS
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    G, size = A.squares, CELLS * A.squares.dx
    (fcx, fcy), R = A.field_centre, A.half
    circle = Point(fcx, fcy).buffer(R, 256)
    xs, ys = [], []
    for ti in range(math.floor((fcx - R - G.x0) / size), math.floor((fcx + R - G.x0) / size) + 1):
        for tj in range(math.floor((fcy - R - G.y0) / size), math.floor((fcy + R - G.y0) / size) + 1):
            x0, y0 = G.x0 + ti * size, G.y0 + tj * size
            if not box(x0, y0, x0 + size, y0 + size).intersects(circle): continue
            for k in range(41):
                f = k / 40 * (size + 2 * REACH) - REACH
                for x, y in ((x0 + f, y0 - REACH), (x0 + f, y0 + size + REACH), (x0 - REACH, y0 + f), (x0 + size + REACH, y0 + f)):
                    xs.append(x / kx + lon0); ys.append(y / ky + lat0)
    e, n = bng_transformer().transform(xs, ys)
    if box_only: return min(e), min(n), max(e), max(n)
    return sorted({os_square(a, b) for a, b in zip(e, n)})


def wales_lidar(A, raw):
    """The Welsh Government's 1 m DTM and DSM tiles over the lidar's box, into lidar/dtm/ and lidar/dsm/.
    Returns how many tiles Wales has there (none for a map wholly in England)."""
    e0, n0, e1, n1 = lidar_box(A)
    with urllib.request.urlopen(WALES.format(e0=int(e0), n0=int(n0), e1=int(e1) + 1, n1=int(n1) + 1), timeout=120) as r:
        tiles = json.load(r)["features"]
    if tiles: print(f"lidar: {len(tiles)} Welsh 1 km tiles")
    for t in tiles:
        for kind in ("dtm", "dsm"):
            link = t["properties"].get(f"{kind}_link")
            if not link: continue
            folder = os.path.join(raw, "lidar", kind)
            os.makedirs(folder, exist_ok=True)
            path = os.path.join(folder, "wales-" + os.path.basename(link))
            if not os.path.exists(path): fetch("https://" + link.removeprefix("https://"), path)
    return len(tiles)


def grid_square(e, n):
    """The OS 10 km square holding (e, n), as its letters and the two digits of its south-west
    corner (NT27): the start of every Scottish lidar tile's name."""
    sq = os_square(e, n)
    return sq[:2], int(e % 100000) // 10000, int(n % 100000) // 10000


def scottish_tile_box(name):
    """The British National Grid box a Scottish lidar tile's name says it covers: a 10 km square
    (NT27_1M_DSM_PHASE1), a quarter of one (NT27SE_50CM_DSM_PHASE5) or 1 km (NT2573_50cm_DSM_...)."""
    import re
    m = re.match(r"([A-Z]{2})(\d)(\d)(NE|NW|SE|SW)?_", name) or re.match(r"([A-Z]{2})(\d\d)(\d\d)_", name)
    if not m: return None
    letters = m.group(1)
    l1, l2 = (ord(c) - ord("A") - (1 if c > "I" else 0) for c in letters)
    e100 = (l1 % 5) * 5 + l2 % 5 - 10
    n100 = 19 - (l1 // 5) * 5 - l2 // 5
    if len(m.group(2)) == 2:
        e, n, size = e100 * 100000 + int(m.group(2)) * 1000, n100 * 100000 + int(m.group(3)) * 1000, 1000
    else:
        e, n, size = e100 * 100000 + int(m.group(2)) * 10000, n100 * 100000 + int(m.group(3)) * 10000, 10000
        quarter = m.groups()[3] if len(m.groups()) > 3 else None
        if quarter:
            size = 5000
            e += 5000 if quarter[1] == "E" else 0
            n += 5000 if quarter[0] == "N" else 0
    return e, n, e + size, n + size


def s3_keys(prefix):
    import re
    keys, token = [], None
    while True:
        q = {"list-type": "2", "prefix": prefix, **({"continuation-token": token} if token else {})}
        import urllib.parse
        with urllib.request.urlopen(urllib.request.Request(SCOTLAND + "/?" + urllib.parse.urlencode(q), headers=UA), timeout=60) as r:
            text = r.read().decode()
        keys += re.findall(r"<Key>([^<]+)</Key>", text)
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", text)
        if not m: return keys
        token = m.group(1)


def scotland_lidar(A, raw):
    """The Scottish Public Sector LiDAR's DTM and DSM over the lidar's box, into lidar/dtm/ and
    lidar/dsm/ as one 1 km GeoTIFF per kind for each kilometre square, at the finest resolution
    surveyed there (50 cm from phase 3 on, 1 m before). The surveys are cloud-optimised GeoTIFFs
    on the Scottish Remote Sensing Portal's open bucket, so only the box is read from them, never
    the 5 or 10 km tiles whole. Each kilometre takes the newest survey, and an older one fills its
    gaps. Once any kilometre has a survey, every kilometre of the box gets a file (empty over the
    sea or where no survey has flown), so the squares see the survey as fetched. Returns how many
    kilometres have a survey (none for a map wholly outside Scotland's coverage)."""
    import numpy as np
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import from_origin
    from rasterio.windows import from_bounds
    from concurrent.futures import ThreadPoolExecutor
    os.environ.update(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                      GDAL_HTTP_USERAGENT=UA["User-Agent"], GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="5")
    e0, n0, e1, n1 = lidar_box(A)
    cells = [(e, n) for e in range(int(e0 // 1000), int(e1 // 1000) + 1) for n in range(int(n0 // 1000), int(n1 // 1000) + 1)]
    folders = {k: os.path.join(raw, "lidar", k) for k in ("dtm", "dsm")}
    name = lambda e, n: "scotland-{}{:02d}{:02d}.tif".format(os_square(e * 1000, n * 1000)[:2], e % 100, n % 100)
    done = os.path.join(raw, "lidar", ".scotland")
    if os.path.exists(done):
        if open(done).read(): print(f"lidar: survey phases (for the credits): {open(done).read()}")
        return sum(os.path.exists(os.path.join(folders["dsm"], name(e, n))) for e, n in cells)
    squares = sorted({grid_square(e * 1000 + 500, n * 1000 + 500) for e, n in cells})
    tiles = {k: [] for k in folders}      # kind -> [(rank, box, url)], newest survey first
    for rank, phase in enumerate(SCOTTISH_PHASES):
        for kind in folders:
            for letters, de, dn in squares:
                for key in s3_keys(f"lidar/{phase}/{kind}/27700/gridded/{letters}{de}{dn}"):
                    b = scottish_tile_box(os.path.basename(key))
                    if b and key.lower().endswith(".tif"): tiles[kind].append((rank, b, f"/vsicurl/{SCOTLAND}/{key}"))
    if not tiles["dsm"] or not tiles["dtm"]: return 0
    print(f"lidar: {len(tiles['dsm'])} Scottish surface and {len(tiles['dtm'])} ground tiles over the box")

    # the credit a map needs depends on which phases its kilometres came from
    phases, lock = collections.defaultdict(set), threading.Lock()

    def merged(kind, e, n):
        """The kilometre's heights from every survey over it, newest first, and its pixel size."""
        x0, y0 = e * 1000, n * 1000
        over = sorted(t for t in tiles[kind] if t[1][0] < x0 + 1000 and t[1][2] > x0 and t[1][1] < y0 + 1000 and t[1][3] > y0)
        out, px = None, None
        for rank, _box, url in over:
            with rasterio.open(url) as src:
                if px is None:
                    px = abs(src.transform.a)
                    side = int(round(1000 / px))
                    out = np.full((side, side), np.nan, np.float32)
                if not np.isnan(out).any(): break
                a = src.read(1, window=from_bounds(x0, y0, x0 + 1000, y0 + 1000, src.transform), out_shape=out.shape,
                             boundless=True, fill_value=src.nodata if src.nodata is not None else -9999,
                             resampling=Resampling.nearest).astype(np.float32)
            a[(a < -100) | (a > 2000)] = np.nan
            gap = np.isnan(out)
            if (gap & ~np.isnan(a)).any():
                with lock: phases[(SCOTTISH_PHASES[rank], kind)].add((e, n))
            out[gap] = a[gap]
        return out, px

    def one(cell):
        e, n = cell
        got = {}
        for kind in folders:
            path = os.path.join(folders[kind], name(e, n))
            if os.path.exists(path): got[kind] = True; continue
            a, px = merged(kind, e, n)
            got[kind] = (a, px)
        return cell, got

    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(one, cells))
    surveyed = sum(1 for _, got in results if any(v is True or (v[0] is not None and not np.isnan(v[0]).all()) for v in got.values()))
    if not surveyed: return 0
    for f in folders.values(): os.makedirs(f, exist_ok=True)
    for (e, n), got in results:
        for kind, v in got.items():
            if v is True: continue
            a, px = v
            if a is None:
                px = 1.0
                a = np.full((1000, 1000), np.nan, np.float32)
            path = os.path.join(folders[kind], name(e, n))
            with rasterio.open(path + ".part", "w", driver="GTiff", width=a.shape[1], height=a.shape[0], count=1, dtype="float32",
                               crs="EPSG:27700", transform=from_origin(e * 1000, n * 1000 + 1000, px, px), nodata=-9999,
                               compress="deflate", predictor=3, tiled=True) as dst:
                dst.write(np.where(np.isnan(a), -9999, a).astype(np.float32), 1)
            os.replace(path + ".part", path)
    said = "; ".join(f"{p} {k} {len(c)} km2" for (p, k), c in sorted(phases.items()))
    open(done, "w").write(said)
    print(f"lidar: {surveyed} of {len(cells)} Scottish kilometre squares surveyed")
    print(f"lidar: survey phases (for the credits): {said or 'none new this run'}")
    return surveyed


def quadkey(lon, lat, z=9):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return "".join(str(((x >> i) & 1) + 2 * ((y >> i) & 1)) for i in range(z - 1, -1, -1))


def fetch(url, path, tries=4):
    tmp = path + ".part"
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
                while True:
                    b = r.read(1 << 20)
                    if not b: break
                    f.write(b)
            break
        except OSError:
            # the EA's tile service now and then answers a square it has with "not found"
            if k == tries - 1: raise
            time.sleep(5 * 2 ** k)
    os.replace(tmp, path)


def main():
    args = sys.argv[1:]
    only = None
    if "--only" in args:
        k = args.index("--only"); only = set(args[k + 1].split(",")); del args[k:k + 2]
    map_id = args[0]
    raw = args[1] if len(args) > 1 else os.path.join(TOOLS, "..", "data", "raw", map_id, "wide")
    want = lambda s: only is None or s in only
    A = area(map_id, wide=True)
    os.makedirs(raw, exist_ok=True)
    def run(script, map_id, kind, path, *more):
        """A tool that writes path, run to a temporary name and renamed when it finishes, so a download
        that dies half way is never mistaken for a finished one."""
        part = path + ".part"
        subprocess.run([sys.executable, "-I", script, map_id, *([kind] if kind else []), part, *more], check=True)
        os.replace(part, path)
    if want("overture"):
        for t in LAYERS:
            path = os.path.join(raw, f"{t}.geojson")
            if not os.path.exists(path): run(os.path.join(TOOLS, "download.py"), map_id, t, path, "wide")
    region = getattr(A, "region", "GB-ENG")
    if want("lidar") and region in ("GB-ENG", "GB-WLS", "GB-SCT"):
        # the Welsh and Scottish tiles first: where the EA's squares are missing, those are let go
        welsh = wales_lidar(A, raw) if region != "GB-SCT" else 0
        welsh += scotland_lidar(A, raw) if region == "GB-SCT" or (region == "GB-ENG" and lidar_box(A)[3] > SCOTLAND_SOUTH) else 0
        if region == "GB-SCT" and not welsh: print("lidar: no Scottish survey over the map")
        squares = lidar_squares(A)
        print(f"lidar: {len(squares)} squares: {' '.join(squares)}")
        for sq in squares:
            for kind, name in KINDS.items():
                folder = os.path.join(raw, "lidar", kind)
                os.makedirs(folder, exist_ok=True)
                done = os.path.join(folder, f".{sq}")
                if os.path.exists(done): continue
                z = os.path.join(raw, "lidar", f"{sq}-{kind}.zip")
                if not os.path.exists(z):
                    try:
                        # in Wales a "not found" is a Welsh square, not the EA's service stumbling
                        fetch(LIDAR.format(kind=name, square=sq), z, tries=1 if welsh or region == "GB-SCT" else 4)
                    except urllib.error.HTTPError as e:
                        if e.code != 404 or not (welsh or region == "GB-SCT"): raise
                        print(f"lidar: {sq} {kind} is not in the EA's survey (in Wales or Scotland: their own tiles cover it)")
                        open(done, "w").close()
                        continue
                with zipfile.ZipFile(z) as f:
                    tifs = [n for n in f.namelist() if n.lower().endswith(".tif")]
                    for n in tifs:
                        with open(os.path.join(folder, os.path.basename(n)), "wb") as out: out.write(f.read(n))
                os.remove(z)
                open(done, "w").close()
                # north of the border the EA's service answers with an empty zip rather than "not found"
                print(f"lidar: {sq} {kind}" if tifs else f"lidar: {sq} {kind} is not in the EA's survey (an empty zip)")
    if want("canopy"):
        # every zoom-9 tile the map's box reaches into, not just the centre's (about 49 km across at 51°N)
        W, S, E, N = A.bbox
        os.makedirs(os.path.join(raw, "canopy"), exist_ok=True)
        for q in sorted({quadkey(lon, lat) for lon in (W, E) for lat in (S, N)}):
            path = os.path.join(raw, "canopy", f"{q}.tif")
            if not os.path.exists(path): fetch(CANOPY.format(q=q), path); print(f"canopy: {q}")
    if want("osm") and not os.path.exists(os.path.join(raw, "osm.geojson")):
        run(os.path.join(TOOLS, "osm.py"), map_id, None, os.path.join(raw, "osm.geojson"), "wide")
    if want("osm") and not os.path.exists(os.path.join(raw, "osm-roads.geojson")):
        # the streets' widths, lanes and pavements, for fitting the streets (tools/roadwidth.py)
        run(os.path.join(TOOLS, "osm.py"), map_id, None, os.path.join(raw, "osm-roads.geojson"), "wide", "roads")
    if want("osm") and not os.path.exists(os.path.join(raw, "osm-detail.geojson")):
        # paths' surfaces, service roads' kinds, steps' handrails and the crash barriers (the partition)
        run(os.path.join(TOOLS, "osm.py"), map_id, None, os.path.join(raw, "osm-detail.geojson"), "wide", "detail")
    if want("osm") and not os.path.exists(os.path.join(raw, "osm-rail.geojson")):
        # the railway's kinds (a miniature railway is left out) and its level crossings (tools/railway.py, prep_map.py)
        run(os.path.join(TOOLS, "osm.py"), map_id, None, os.path.join(raw, "osm-rail.geojson"), "wide", "rail")
    if want("fsa") and not os.path.exists(os.path.join(raw, "fsa.geojson")):
        run(os.path.join(TOOLS, "fsa.py"), map_id, None, os.path.join(raw, "fsa.geojson"), "wide")
    # the census's output areas cover Great Britain, the conservation areas England and Scotland, and
    # Scotland's listed buildings and registered parcels are open downloads too (England's are by hand)
    for name, regions in (("census", ("GB-ENG", "GB-WLS", "GB-SCT")), ("conservation", ("GB-ENG", "GB-SCT")),
                          ("listed", ("GB-SCT",)), ("parcels", ("GB-SCT",))):
        if want(name) and region in regions and not os.path.exists(os.path.join(raw, f"{name}.geojson")):
            run(os.path.join(TOOLS, f"{name}.py"), map_id, "ros" if name == "parcels" else None, os.path.join(raw, f"{name}.geojson"), "wide")
    if want("epc") and region == "GB-SCT" and not os.path.exists(os.path.join(raw, "epc", "certificates.csv")):
        subprocess.run([sys.executable, "-I", os.path.join(TOOLS, "epc.py"), map_id, "scotland", raw], check=True)
    import cct
    if want("city") and cct.covers(A):
        cct.fetch(A, raw)
        cct.heights(A, raw)
        cct.crowns(A, raw)
        print("city: once a build has fetched the terrain tiles, lay the contours' ground over them: "
              f"python3 -I tools/cct.py {map_id} ground {raw}")
    if want("footprints"):
        if "google" in getattr(A, "footprints", ()):
            subprocess.run([sys.executable, os.path.join(TOOLS, "footprints.py"), map_id, "fetch", raw], check=True)
        subprocess.run([sys.executable, "-I", os.path.join(TOOLS, "footprints.py"), map_id, "merge", raw], check=True)
    if region != "GB-SCT" and not os.path.exists(os.path.join(raw, "epc", "certificates.csv")):
        print(f"epc: download the energy certificates and OS Open UPRN by hand into {os.path.join(raw, 'epc')} (see docs/new-area.md)")


if __name__ == "__main__":
    main()
