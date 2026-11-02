"""The City of Cape Town's open data, for any map inside the City's boundary: its ground from the
2019 lidar's 2 m contours, its buildings' measured heights and its tree canopy, each turned into
the layer every map has (see the end of docs/new-area.md), so the build never asks where they
came from.

Usage: python3 -I tools/cct.py <map> fetch [<raw dir> [layers]]  download the three layers (cached in <raw dir>/../cct/)
       python3 -I tools/cct.py <map> heights [<raw dir>]  the footprints' heights -> <raw dir>/heights.geojson
       python3 -I tools/cct.py <map> crowns [<raw dir>]   the crowns' outlines -> <raw dir>/canopy/crowns.geojson
       python3 -I tools/cct.py <map> ground [<raw dir>]   the contours' ground -> the terrain tiles in <raw dir>
Then measure the squares and the wide file (the canopy goes into measured/) and pack (tools/fetch.py says how).

Sources, all from the City's ArcGIS feature services, free under its Open Data Policy (credit
"City of Cape Town"):
- Ground Level Map 2 m contours (GLM 2019), from the 2018-19 lidar by way of a 5 m ground model,
  heights above the SA Land Levelling Datum (mean sea level), good to about a metre;
- 2D Building Footprints, each roof's outline with BLD_HGT: its highest point above the ground in
  metres, measured photogrammetrically 2013-23 (Portside's roof is 133 m, the Civic Centre's 101);
  0 where not measured;
- Tree Canopies: the outline of every crown over 2.75 m, from the 2018 near infra-red imagery.
Each service is asked for its features in degrees (outSR 4326), whatever grid it keeps them in, and
paged through politely.
"""
import glob, json, math, os, sys, time, urllib.parse, urllib.request
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

# the City's boundary, as its footprints' metadata gives it (lon, lat)
COVER = (18.158, -34.379, 18.907, -33.466)
SERVICES = {
    "contours": "https://services6.arcgis.com/nyYfO9SxHU2ChQd9/arcgis/rest/services/GLM_2m/FeatureServer/1",
    "footprints": "https://esapqa.capetown.gov.za/agsext/rest/services/Theme_Based/ODP_SPLIT_6/FeatureServer/2",
    "canopy": "https://services6.arcgis.com/nyYfO9SxHU2ChQd9/arcgis/rest/services/Tree_Canopies/FeatureServer/1",
}
FIELDS = {"contours": "OBJECTID,ELVT", "footprints": "OBJECTID,BLD_HGT,ACQS_PRD", "canopy": "OBJECTID"}
PAGE = {"contours": 20, "footprints": 2000, "canopy": 2000}     # a contour can run right across the City
# degrees: the contours' points thinned to within half a metre (they are good to a metre or so)
THIN = {"contours": 0.000005}
REACH = 7600          # metres round the map's centre fetched: past the furthest a map's wide circle reaches


def covers(A):
    """Whether the map's wide box reaches into the City."""
    W, S, E, N = A.bbox
    return W < COVER[2] and E > COVER[0] and S < COVER[3] and N > COVER[1]


def reach_box(A):
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    return lon0 - REACH / kx, lat0 - REACH / ky, lon0 + REACH / kx, lat0 + REACH / ky


def cache_dir(raw, layer):
    return os.path.join(os.path.dirname(os.path.abspath(raw)), "cct", layer)


def get(url, tries=5):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180) as r: return json.load(r)
        except Exception as e:
            if k == tries - 1: raise
            print(f"  {e}, again in {5 * (k + 1)} s"); time.sleep(5 * (k + 1))


def fetch(A, raw, layers=None):
    W, S, E, N = reach_box(A)
    for layer, url in SERVICES.items():
        if layers and layer not in layers: continue
        out = cache_dir(raw, layer)
        os.makedirs(out, exist_ok=True)
        q = dict(where="1=1", geometry=f"{W},{S},{E},{N}", geometryType="esriGeometryEnvelope", inSR=4326,
                 spatialRel="esriSpatialRelIntersects", outSR=4326, outFields=FIELDS[layer], orderByFields="OBJECTID",
                 returnGeometry="true", resultRecordCount=PAGE[layer], geometryPrecision=7, f="json")
        if layer in THIN: q["maxAllowableOffset"] = THIN[layer]
        total = get(url + "/query?" + urllib.parse.urlencode(dict(q, returnCountOnly="true", outFields="", orderByFields="", resultRecordCount="")))["count"]
        t0, n = time.time(), 0
        for offset in range(0, total, PAGE[layer]):
            path = os.path.join(out, f"{offset // PAGE[layer]:05d}.json")
            if os.path.exists(path): continue
            d = get(url + "/query?" + urllib.parse.urlencode(dict(q, resultOffset=offset)))
            if "features" not in d: raise SystemExit(f"{layer}: {str(d)[:300]}")
            if d.get("spatialReference", {}).get("wkid") != 4326: raise SystemExit(f"{layer}: not given in degrees: {d.get('spatialReference')}")
            with open(path + ".part", "w") as f: json.dump(d["features"], f, separators=(",", ":"))
            os.replace(path + ".part", path)
            n += 1
            time.sleep(1.0)
        size = sum(os.path.getsize(p) for p in glob.glob(os.path.join(out, "*.json")))
        print(f"{layer}: {total} features, {n} pages fetched in {time.time() - t0:.0f} s, {size / 1e6:.1f} MB cached")


def features(raw, layer):
    for path in sorted(glob.glob(os.path.join(cache_dir(raw, layer), "*.json"))):
        yield from json.load(open(path))


def polygon(rings):
    """An Esri polygon (clockwise outer rings, anticlockwise holes) as shapely geometry."""
    import shapely
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    outer, holes = [], []
    for r in rings:
        if len(r) < 4: continue
        p = Polygon(r)
        (holes if p.exterior.is_ccw else outer).append(shapely.make_valid(p))
    if not outer: return None
    g = unary_union(outer) if len(outer) > 1 else outer[0]
    if holes: g = g.difference(unary_union(holes))
    parts = [q for q in getattr(g, "geoms", [g]) if q.geom_type == "Polygon" and not q.is_empty]
    return None if not parts else parts[0] if len(parts) == 1 else shapely.MultiPolygon(parts)


def heights(A, raw):
    """The footprints with a measured height, as the common heights layer: each outline in degrees
    with "height", its highest point above the ground in metres."""
    from shapely.geometry import mapping
    seen, out = set(), []
    for f in features(raw, "footprints"):
        a = f["attributes"]
        h = a.get("BLD_HGT")
        if not h or h < 2.0 or f["attributes"]["OBJECTID"] in seen or not f.get("geometry"): continue
        seen.add(a["OBJECTID"])
        g = polygon(f["geometry"]["rings"])
        if g is None or g.is_empty: continue
        m = mapping(g.simplify(0.000003))
        m = json.loads(json.dumps(m), parse_float=lambda s: round(float(s), 6))
        out.append(dict(type="Feature", properties=dict(height=round(h, 1), src="cct"), geometry=m))
    out.sort(key=lambda f: json.dumps(f["geometry"]))
    path = os.path.join(raw, "heights.geojson")
    with open(path, "w") as f:
        f.write('{"type":"FeatureCollection","features":[' + ",\n".join(json.dumps(x, separators=(",", ":")) for x in out) + "]}\n")
    print(f"heights: {len(out)} footprints with a measured height -> {path}")


LOW = 2.7            # metres: the survey left out growth below 2.75 m (lawns, bushes)
LEAST = 4.0          # metres: the least a crown it outlined is taken to stand


def crowns(A, raw):
    """The crowns' outlines as the common crowns layer (canopy/crowns.geojson, which canopy.py
    reads beside the height map): the box they were fetched over, and the heights the survey
    draws its line at."""
    from shapely.geometry import mapping
    W, S, E, N = reach_box(A)
    box_ = (max(W, COVER[0]), max(S, COVER[1]), min(E, COVER[2]), min(N, COVER[3]))
    seen, out = set(), []
    for f in features(raw, "canopy"):
        i = f["attributes"]["OBJECTID"]
        if i in seen or not f.get("geometry"): continue
        seen.add(i)
        g = polygon(f["geometry"]["rings"])
        if g is None or g.is_empty: continue
        m = json.loads(json.dumps(mapping(g.simplify(0.000003))), parse_float=lambda s: round(float(s), 6))
        out.append(dict(type="Feature", bbox=[round(v, 6) for v in g.bounds], properties={}, geometry=m))
    out.sort(key=lambda f: json.dumps(f["geometry"]))
    os.makedirs(os.path.join(raw, "canopy"), exist_ok=True)
    path = os.path.join(raw, "canopy", "crowns.geojson")
    with open(path, "w") as f:
        f.write(json.dumps(dict(type="FeatureCollection", bbox=[round(v, 6) for v in box_], low=LOW, least=LEAST,
                                source="City of Cape Town, Tree Canopies (2018)"))[:-1]
                + ',"features":[' + ",\n".join(json.dumps(x, separators=(",", ":")) for x in out) + "]}\n")
    print(f"crowns: {len(out)} outlines -> {path}")


class Contours:
    """The ground between the contours, on a 2 m grid over the reach in model metres: the contours
    hold their heights, and between them the ground runs smoothly from one to the next (a harmonic
    fill, which never rises above or falls below the contours round it). Past the contours' reach
    (out at sea, and outside the City) and on the map's water the fill is held to the ground the map
    had (fallback), so it meets it smoothly at the edge.

    ground(xs, ys) gives the grid's heights, NaN outside it."""
    STEP = 2.0
    OUT = 600.0       # metres from the nearest contour past which the fallback's ground holds (the flats between two contours can be 1 km across)
    EDGE = 100.0      # and round the grid's edge, so it meets the ground past it

    def __init__(self, A, raw, fallback):
        from PIL import Image, ImageDraw
        lon0, lat0 = A.centre
        self.kx, self.ky = 111320 * math.cos(math.radians(lat0)), 110574
        self.lon0, self.lat0 = lon0, lat0
        n = int(2 * REACH / self.STEP) + 1
        self.x0 = self.y0 = -REACH
        self.n = n
        # the contours burnt in, lowest first, so where two meet in a cell (a cliff) the upper wins
        lines = []
        for f in features(raw, "contours"):
            z = f["attributes"].get("ELVT")
            if z is None or not f.get("geometry"): continue
            for p in f["geometry"]["paths"]:
                a = np.asarray(p, dtype=np.float64)
                lines.append((float(z), np.stack([((a[:, 0] - lon0) * self.kx - self.x0) / self.STEP,
                                                 ((a[:, 1] - lat0) * self.ky - self.y0) / self.STEP], axis=1)))
        lines.sort(key=lambda t: t[0])
        img = Image.new("F", (n, n), float("nan"))
        d = ImageDraw.Draw(img)
        for z, c in lines:
            d.line([tuple(q) for q in c], fill=z, width=1)
        fixed = np.asarray(img, dtype=np.float32).copy()       # rows are y (north) upwards
        self.count = len(lines)
        held = ~np.isnan(fixed)
        from scipy import ndimage
        far = ndimage.distance_transform_edt(~held) * self.STEP > self.OUT
        edge = np.zeros_like(far); b = int(self.EDGE / self.STEP)
        edge[:b] = edge[-b:] = True; edge[:, :b] = edge[:, -b:] = True
        far |= edge
        # the contours survey the land: the sea and its harbour's basins keep the ground they had
        far |= self.water(raw) & ~held
        ys, xs = np.mgrid[0:n, 0:n]
        fb = fallback(self.x0 + xs[far] * self.STEP, self.y0 + ys[far] * self.STEP)
        fixed[far] = fb
        self.covered = (~far).mean()
        self.h = harmonic(fixed)
        self.cover = ~far

    def water(self, raw):
        from PIL import Image, ImageDraw
        img = Image.new("1", (self.n, self.n), 0)
        d = ImageDraw.Draw(img)
        path = os.path.join(raw, "water.geojson")
        for g in sea_water(json.load(open(path))["features"] if os.path.exists(path) else []):
            for poly in ([g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]):
                for k, ring in enumerate(poly):
                    pts = [(((lon - self.lon0) * self.kx - self.x0) / self.STEP, ((lat - self.lat0) * self.ky - self.y0) / self.STEP) for lon, lat in ring]
                    if len(pts) >= 3: d.polygon(pts, fill=1 if k == 0 else 0)
        return np.asarray(img, dtype=bool)

    def ground(self, xs, ys):
        xs, ys = np.asarray(xs, dtype=np.float64), np.asarray(ys, dtype=np.float64)
        fx, fy = (xs - self.x0) / self.STEP, (ys - self.y0) / self.STEP
        i, j = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
        ok = (i >= 0) & (j >= 0) & (i < self.n - 1) & (j < self.n - 1)
        out = np.full(xs.shape, np.nan)
        i, j, u, v = i[ok], j[ok], (fx - np.floor(fx))[ok], (fy - np.floor(fy))[ok]
        h = self.h
        z = (h[j, i] * (1 - u) * (1 - v) + h[j, i + 1] * u * (1 - v) + h[j + 1, i] * (1 - u) * v + h[j + 1, i + 1] * u * v)
        # past the contours' reach the tiles keep their own ground, not this grid's copy of it
        z[~self.cover[j, i]] = np.nan
        out[ok] = z
        return out


def sea_water(features):
    """The sea and the water opening off it (a harbour's basins), as GeoJSON geometries: a lake, a
    reservoir or a pool inland lies at its own level, which the contours give."""
    from shapely.geometry import mapping, shape
    polys = [(shape(f["geometry"]), f["properties"]) for f in features if f["geometry"]["type"] in ("Polygon", "MultiPolygon")]
    sea = [g for g, p in polys if p.get("subtype") == "ocean"]
    rest = [g for g, p in polys if p.get("subtype") != "ocean" and p.get("class") not in ("swimming_pool", "reservoir", "pond")]
    grown = True
    while grown and sea:
        near = [g for g in rest if any(g.distance(s_) < 0.0003 for s_ in sea)]
        rest = [g for g in rest if not any(g is n for n in near)]
        sea += near
        grown = bool(near)
    return [mapping(g) for g in sea]


def harmonic(fixed, sweeps=60):
    """Fill the NaNs of fixed so each is the mean of its four neighbours, solved coarse to fine."""
    held = ~np.isnan(fixed)
    if fixed.shape[0] > 64:
        # the next level down: each 2 x 2 block's held cells' mean
        n2 = (fixed.shape[0] + 1) // 2
        p = np.full((2 * n2, 2 * n2), np.nan, dtype=np.float64); p[:fixed.shape[0], :fixed.shape[1]] = fixed
        blocks = p.reshape(n2, 2, n2, 2)
        with np.errstate(invalid="ignore"):
            coarse = _nanmean_blocks(blocks)
        start = np.repeat(np.repeat(harmonic(coarse, sweeps), 2, axis=0), 2, axis=1)[:fixed.shape[0], :fixed.shape[1]]
    else:
        start = np.where(held, fixed, np.nanmean(fixed))
        sweeps = 2000
    h = np.where(held, fixed, start).astype(np.float32)
    fv = np.where(held, fixed, 0).astype(np.float32)
    for _ in range(sweeps):
        p = np.pad(h, 1, mode="edge")
        avg = 0.25 * (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:])
        h = np.where(held, fv, avg)
    return h


def _nanmean_blocks(blocks):
    s = np.nansum(blocks, axis=(1, 3)); c = (~np.isnan(blocks)).sum(axis=(1, 3))
    out = np.full(s.shape, np.nan); out[c > 0] = s[c > 0] / c[c > 0]
    return out


def ground(A, raw):
    """The contours' ground into the map's terrain tiles (as tools/lidar_ground.py does with the
    lidar), so the packed tiles carry it and the build reads its ground as for any map."""
    import lidar_ground
    t0 = time.time()
    C = Contours(A, raw, lidar_ground.Tiles(raw, A).ground)
    print(f"ground: {C.count} contour lines, {C.covered:.0%} of the reach covered, solved in {time.time() - t0:.0f} s")
    lidar_ground.overlay(A, raw, C.ground, "the contours'")


if __name__ == "__main__":
    if len(sys.argv) < 3: raise SystemExit(__doc__)
    map_id, cmd = sys.argv[1], sys.argv[2]
    raw = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw", map_id, "wide")
    A = area(map_id, wide=True)
    if not covers(A): raise SystemExit(f"{map_id} is outside the City of Cape Town's data")
    if cmd == "fetch": fetch(A, raw, sys.argv[4:])
    else: dict(heights=heights, crowns=crowns, ground=ground)[cmd](A, raw)
