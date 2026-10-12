"""Pack the Overture layers plus lidar terrain into one JSON file for the game.

Usage: python3 -I tools/prep_map.py <dir with raw .geojson layers> <out.json>

Adapted from the Bath prototype (Train-Game, Tools/overture-poc/prep_3d.py). Terrain comes from
AWS Terrain Tiles (Mapzen "terrarium" PNGs, zoom 15, about 3 m per pixel here), which in England
are built from Environment Agency lidar. Model coordinates are metres east/north of the map
centre; elevations are metres above sea level.

Changes for first person:
- the terrain is flattened under vehicle roads, so roads sit flush and need no lift;
- each vertex of the terrain grid gets a ground type (grass, pitch, wood...) for colouring;
- small rectangular buildings get a gabled roof, given as an oriented rectangle;
- woods are scattered with trees, and walls, fences and hedges are kept as barrier lines.
"""
import io, json, math, os, random, sys, urllib.request
import numpy as np
import shapely
from PIL import Image
from shapely.geometry import shape, box, Point
from shapely.ops import transform, unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import BBOX, CENTRE, FIELD, RELEASE

src_dir, out_path = sys.argv[1], sys.argv[2]
W, S, E, N = BBOX
lon0, lat0 = CENTRE
kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
proj = lambda x, y, z=None: ((x - lon0) * kx, (y - lat0) * ky)
B = box(W, S, E, N)
X0, Y0 = proj(W, S)
X1, Y1 = proj(E, N)
BM = box(X0, Y0, X1, Y1)
r1 = lambda v: round(float(v), 1)
rnd = random.Random(1622)

# ---- terrain ------------------------------------------------------------------
Z = 15
NPX = 256 * 2 ** Z
gpx = lambda lon: (lon + 180) / 360 * NPX
gpy = lambda lat: (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * NPX
m = 0.002
tx0, tx1 = int(gpx(W - m) // 256), int(gpx(E + m) // 256)
ty0, ty1 = int(gpy(N + m) // 256), int(gpy(S - m) // 256)
rows = []
for ty in range(ty0, ty1 + 1):
    row = []
    for tx in range(tx0, tx1 + 1):
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png"
        a = np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=30).read())).convert("RGB")).astype(float)
        row.append(a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768)
    rows.append(np.hstack(row))
DEM = np.vstack(rows)


def elev(x, y):
    """Bilinear terrain height at model metres (x east, y north)."""
    lon, lat = x / kx + lon0, y / ky + lat0
    u, v = gpx(lon) - tx0 * 256 - 0.5, gpy(lat) - ty0 * 256 - 0.5
    i, j = int(math.floor(u)), int(math.floor(v))
    fu, fv = u - i, v - j
    q = DEM[j:j + 2, i:i + 2]
    return (q[0, 0] * (1 - fu) + q[0, 1] * fu) * (1 - fv) + (q[1, 0] * (1 - fu) + q[1, 1] * fu) * fv


def low(x, y, r):
    """Lowest ground within r metres: used for water surfaces, which sit below their banks."""
    return min([elev(x, y)] + [elev(x + r * math.cos(a), y + r * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 8, endpoint=False)])


STEP = 4.0
nx, ny = int(math.ceil((X1 - X0) / STEP)) + 1, int(math.ceil((Y1 - Y0) / STEP)) + 1
dx, dy = (X1 - X0) / (nx - 1), (Y1 - Y0) / (ny - 1)
grid = np.array([[elev(X0 + i * dx, Y0 + j * dy) for i in range(nx)] for j in range(ny)])  # rows south -> north
GX, GY = np.meshgrid(X0 + np.arange(nx) * dx, Y0 + np.arange(ny) * dy)

# ---- helpers ------------------------------------------------------------------
L = lambda f: [(shape(x["geometry"]), x["properties"]) for x in json.load(open(f"{src_dir}/{f}.geojson"))["features"]]
inside = lambda x, y: X0 <= x <= X1 and Y0 <= y <= Y1
name = lambda p: (p.get("names") or {}).get("primary") or ""


def densify_runs(coords, step):
    """Walk a full (unclipped) lon/lat line; return runs of in-bbox points as [x, y, t], t = fraction along the line."""
    seg_len = []
    for (a, b, *_), (c, d, *_) in zip(coords, coords[1:]):
        cl = math.cos(math.radians((b + d) / 2))
        seg_len.append(math.hypot((c - a) * 111320 * cl, (d - b) * 110574))
    total = sum(seg_len) or 1
    runs, cur, acc = [], [], 0.0
    for k, ((a, b, *_), (c, d, *_)) in enumerate(zip(coords, coords[1:])):
        lo_ln, hi_ln, lo_lt, hi_lt = min(a, c), max(a, c), min(b, d), max(b, d)
        if hi_ln < W or lo_ln > E or hi_lt < S or lo_lt > N:
            if cur: runs.append(cur); cur = []
            acc += seg_len[k]; continue
        pa, pb = proj(a, b), proj(c, d)
        n = max(1, int(math.ceil(seg_len[k] / step)))
        for s in range(n + (1 if k == len(seg_len) - 1 else 0)):
            f = s / n
            x, y = pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f
            if inside(x, y):
                cur.append([x, y, (acc + seg_len[k] * f) / total])
            elif cur:
                runs.append(cur); cur = []
        acc += seg_len[k]
    if cur: runs.append(cur)
    return [r for r in runs if len(r) > 1]


def flag_ranges(p, key):
    out = []
    for f in p.get(key) or []:
        if {"is_bridge", "is_tunnel"} & set(f.get("values") or []):
            out.append(tuple(f.get("between") or (0.0, 1.0)))
    return out


def level_structures(run, z, ranges):
    """Carry bridges and tunnels straight between the ground at either end."""
    ts = [p[2] for p in run]
    for a, b in ranges:
        idx = [i for i, t in enumerate(ts) if a <= t <= b]
        if not idx: continue
        i0, i1 = max(0, idx[0] - 1), min(len(run) - 1, idx[-1] + 1)
        za, zb, ta, tb = z[i0], z[i1], ts[i0], ts[i1]
        for i in range(i0 + 1, i1):
            z[i] = za + (zb - za) * ((ts[i] - ta) / ((tb - ta) or 1))
    return z


def line_coords(g):
    return [list(l.coords) for l in getattr(g, "geoms", [g]) if l.geom_type == "LineString"]


def polys(g):
    """Projected, clipped polygons of a lon/lat geometry."""
    c = transform(proj, g).intersection(BM)
    return [p for p in getattr(c, "geoms", [c]) if p.geom_type == "Polygon" and p.area > 0]


# ---- roads (also flatten the terrain under them) ------------------------------
RW = {"motorway": 14, "trunk": 12, "primary": 9, "secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 6,
      "living_street": 5, "service": 3.5, "unknown": 4, "pedestrian": 4, "footway": 1.6, "steps": 1.8, "cycleway": 2,
      "path": 1.5, "track": 3, "bridleway": 2}
PATHS = {"footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"}
roads = []
flat_w = np.full(grid.shape, np.inf)   # distance from each grid vertex to the nearest road it is flattened to
flat_z = grid.copy()
for g, p in L("segment"):
    if p["subtype"] != "road": continue
    c = p.get("class") or "unknown"
    ranges = flag_ranges(p, "road_flags")
    for coords in line_coords(g):
        for run in densify_runs(coords, 4.0):
            z = level_structures(run, [elev(x, y) for x, y, _ in run], ranges)
            roads.append(dict(c=c, n=name(p), p=[[r1(a), r1(b), r1(h)] for (a, b, _), h in zip(run, z)]))
            if c in PATHS: continue
            reach = RW.get(c, 4) / 2 + 2.5
            for (ax, ay, _), (bx, by, _), za, zb in zip(run, run[1:], z, z[1:]):
                i0, i1 = max(0, int((min(ax, bx) - reach - X0) / dx)), min(nx - 1, int((max(ax, bx) + reach - X0) / dx) + 1)
                j0, j1 = max(0, int((min(ay, by) - reach - Y0) / dy)), min(ny - 1, int((max(ay, by) + reach - Y0) / dy) + 1)
                px, py = GX[j0:j1 + 1, i0:i1 + 1], GY[j0:j1 + 1, i0:i1 + 1]
                vx, vy = bx - ax, by - ay
                t = np.clip(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy or 1), 0, 1)
                d = np.hypot(px - (ax + t * vx), py - (ay + t * vy))
                win = (d < reach) & (d < flat_w[j0:j1 + 1, i0:i1 + 1])
                flat_w[j0:j1 + 1, i0:i1 + 1][win] = d[win]
                flat_z[j0:j1 + 1, i0:i1 + 1][win] = (za + (zb - za) * t)[win]
# blend: fully flat on the carriageway, easing back to natural ground over the verge
k = np.clip((flat_w - 3.5) / 2.5, 0, 1)
k[np.isinf(flat_w)] = 1
grid = flat_z * (1 - k) + grid * k
z0 = math.floor(grid.min())


def gelev(x, y):
    """Bilinear height of the (road-flattened) terrain grid, as the game sees it."""
    fi, fj = (x - X0) / dx, (y - Y0) / dy
    i, j = min(nx - 2, max(0, int(fi))), min(ny - 2, max(0, int(fj)))
    u, v = fi - i, fj - j
    return (grid[j, i] * (1 - u) + grid[j, i + 1] * u) * (1 - v) + (grid[j + 1, i] * (1 - u) + grid[j + 1, i + 1] * u) * v


# ---- ground types per terrain vertex ------------------------------------------
# 0 garden/grass, 1 pitch, 2 wood floor, 3 farmland/meadow, 4 cemetery, 5 hard standing (school, parking, retail)
GT = np.zeros(grid.shape, dtype=np.int8)
layers = []
for g, p in L("land_use"):
    c = p.get("class")
    t = {"pitch": 1, "farmland": 3, "meadow": 3, "cemetery": 4, "retail": 5, "pedestrian": 5}.get(c)
    if t is not None: layers.append((t, g))
for g, p in L("infrastructure"):
    if p.get("class") == "parking" and g.geom_type.endswith("Polygon"): layers.append((5, g))
woods, cover = [], []   # mapped woods (OSM), and coarse satellite forest cover that also spans gardens
for g, p in L("land"):
    if p.get("subtype") == "forest" and g.geom_type.endswith("Polygon"):
        layers.append((2, g)); woods += polys(g)
for g, p in L("land_cover"):
    if p.get("subtype") == "forest": cover += polys(g)
for t, g in layers:
    for poly in polys(g):
        GT[shapely.contains_xy(poly, GX, GY)] = t

# ---- buildings ----------------------------------------------------------------
def hsrc(p):
    for s in p.get("sources") or []:
        if "height" in (s.get("property") or ""): return s.get("dataset")
    return next((s.get("dataset") for s in p.get("sources") or [] if not s.get("property")), None)


EST = {"house": 7.5, "semidetached_house": 7.5, "detached": 7.5, "terrace": 8.5, "residential": 9, "apartments": 11,
       "retail": 7, "commercial": 8, "office": 10, "church": 12, "chapel": 9, "school": 8, "kindergarten": 5,
       "garage": 2.8, "garages": 2.8, "shed": 2.4, "hut": 2.6, "roof": 3, "toilets": 3, "kiosk": 3}
blds, footprints = [], []
for g, p in L("building"):
    h, fl = p.get("height"), p.get("num_floors")
    cls = p.get("class") or p.get("subtype") or ""
    for poly in polys(g):
        poly = poly.simplify(0.25)
        if poly.area < 6: continue
        if h: src, hh = "ml" if "Microsoft" in (hsrc(p) or "") else "osm", h
        elif fl: src, hh = "floors", fl * 3.0
        elif cls in EST: src, hh = "est", EST[cls]
        else:
            # Unclassified in Overture: in Combe Down that is nearly always a house, a terrace or a shed.
            a = poly.area
            src, hh = "est", 2.6 if a < 25 else rnd.choice([5.6, 6.0, 6.4]) if a < 60 else rnd.choice([6.0, 6.4, 7.0, 8.2])
        ring = [[r1(a), r1(b)] for a, b in list(poly.exterior.coords)[:-1]]
        holes = [[[r1(a), r1(b)] for a, b in list(r.coords)[:-1]] for r in poly.interiors]
        ground = min(gelev(x, y) for x, y in ring)
        top = max(gelev(x, y) for x, y in ring)
        b = dict(r=[ring, *holes], h=round(hh, 1), g=r1(ground), c=cls, n=name(p))
        # Gabled roof when the footprint is close to its oriented rectangle and not too big.
        mrr = poly.minimum_rotated_rectangle
        if not holes and poly.area < 400 and poly.area / mrr.area > 0.86 and hh > 3:
            q = list(mrr.exterior.coords)[:4]
            e0 = math.dist(q[0], q[1]); e1 = math.dist(q[1], q[2])
            if e1 > e0: q = q[1:] + q[:1]   # first edge is the long side, so the ridge runs along it
            b["rr"] = [[r1(a), r1(c)] for a, c in q]
            b["rp"] = round(min(math.dist(q[1], q[2]) * 0.38, 4.0), 1)   # ridge height above the eaves
        b["dz"] = r1(top - ground)   # how far the uphill side climbs: walls are extended to cover it
        blds.append(b)
        footprints.append(poly)

# ---- water --------------------------------------------------------------------
wp, wl = [], []
for g, p in L("water"):
    if p.get("class") == "sea": continue
    if g.geom_type.endswith("Polygon"):
        for poly in polys(g):
            out = []
            for ring in [poly.exterior, *poly.interiors]:
                pts = list(ring.coords)[:-1]
                dense = []
                for (a, b), (cc, d) in zip(pts, pts[1:] + pts[:1]):
                    n = max(1, int(math.hypot(cc - a, d - b) // 4))
                    dense += [(a + (cc - a) * s / n, b + (d - b) * s / n) for s in range(n)]
                out.append([[r1(x), r1(y)] for x, y in dense])
            wz = min(gelev(x, y) for x, y in out[0]) + 0.1
            wp.append(dict(r=out, z=r1(wz)))
    elif g.geom_type.endswith("LineString"):
        for coords in line_coords(g):
            for run in densify_runs(coords, 4.0):
                wl.append(dict(c=p.get("class"), p=[[r1(x), r1(y), r1(gelev(x, y))] for x, y, _ in run]))

# ---- barriers: walls, fences, hedges --------------------------------------------
br = []
for g, p in L("infrastructure"):
    c = p.get("class")
    if p.get("subtype") != "barrier" or c not in ("wall", "fence", "hedge", "retaining_wall"): continue
    lines = [list(r.coords) for r in getattr(g, "geoms", [g]) for r in ([r.exterior] if r.geom_type == "Polygon" else [r])]
    for coords in lines:
        for run in densify_runs(coords, 3.0):
            br.append(dict(c=c, p=[[r1(x), r1(y), r1(gelev(x, y))] for x, y, _ in run]))

# ---- trees --------------------------------------------------------------------
blocked = unary_union([f.buffer(2.5) for f in footprints] +
                      [shapely.LineString([(a, b) for a, b, _ in r["p"]]).buffer(RW.get(r["c"], 3) / 2 + 1.5)
                       for r in roads if len(r["p"]) > 1])
trees = []
wood = unary_union(woods).difference(blocked) if woods else None
garden = unary_union(cover).difference(blocked).difference(unary_union(woods)) if cover else None


def scatter(area, SP):
    x_a, y_a, x_b, y_b = area.bounds
    ys = np.arange(y_a, y_b, SP)
    for jy, yy in enumerate(ys):
        xs = np.arange(x_a + (SP / 2 if jy % 2 else 0), x_b, SP)
        jx = xs + np.array([rnd.uniform(-2.4, 2.4) for _ in xs])
        jy_ = yy + np.array([rnd.uniform(-2.4, 2.4) for _ in xs])
        ok = shapely.contains_xy(area, jx, jy_)
        for x, y in zip(jx[ok], jy_[ok]):
            trees.append([r1(x), r1(y), r1(gelev(x, y)), round(rnd.uniform(0.75, 1.35), 2)])


if wood is not None and not wood.is_empty: scatter(wood, 7.5)
if garden is not None and not garden.is_empty: scatter(garden, 22.0)
for g, p in L("land"):
    if p.get("subtype") == "tree" and g.geom_type == "Point":
        x, y = proj(g.x, g.y)
        if inside(x, y): trees.append([r1(x), r1(y), r1(gelev(x, y)), 1.2])

out = dict(
    release=RELEASE, centre=CENTRE, field=FIELD, b=[r1(X0), r1(Y0), r1(X1), r1(Y1)],
    t=dict(nx=nx, ny=ny, x0=r1(X0), y0=r1(Y0), dx=round(dx, 4), dy=round(dy, 4), z0=z0,
           h=[int(round((v - z0) * 10)) for v in grid.ravel()],   # decimetres above z0, rows south -> north
           k="".join(str(int(v)) for v in GT.ravel())),
    bl=blds, rd=roads, wp=wp, wl=wl, br=br, tr=trees,
)
json.dump(out, open(out_path, "w"), separators=(",", ":"))
print(f"terrain {nx}x{ny} @ {STEP} m, {grid.min():.1f}-{grid.max():.1f} m; {len(blds)} buildings "
      f"({sum('rr' in b for b in blds)} gabled), {len(roads)} road runs, {len(wp)} ponds, {len(wl)} streams, "
      f"{len(br)} barrier runs, {len(trees)} trees; {os.path.getsize(out_path) / 1e6:.1f} MB")
