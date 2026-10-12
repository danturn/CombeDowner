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
from buildings import classify

ROOF_RISE_TOP = 0.6   # how much of the roof counts as solid for bullets and collision
cand = []
for g, p in L("building"):
    for poly in polys(g):
        poly = poly.simplify(0.25)
        if poly.area < 6 or poly.geom_type != "Polygon": continue
        cand.append((poly, p))
info = classify([c[0] for c in cand], [c[1] for c in cand], rnd)
blds, footprints = [], []
for (poly, p), b in zip(cand, info):
    ring = [[r1(a), r1(c)] for a, c in list(poly.exterior.coords)[:-1]]
    holes = [[[r1(a), r1(c)] for a, c in list(r.coords)[:-1]] for r in poly.interiors]
    ground = min(gelev(x, y) for x, y in ring)
    top = max(gelev(x, y) for x, y in ring)
    out = dict(r=[ring, *holes], h=round(b["eaves"], 1), g=r1(ground), c=b["kind"], n=name(p),
               m={"stone": "s", "brick": "k", "buff": "y", "render": "r"}[b["wall"]], rc=b["cover"][0], w=1 if b["windows"] else 0, dz=r1(top - ground))
    if b["roof"]:
        out["rr"] = [[r1(x), r1(y)] for x, y in b["roof"]["rect"]]
        out["rp"] = round(b["roof"]["rise"], 1)
        out["hp"] = [round(v, 1) for v in b["roof"]["hips"]]
    if b["chim"]:
        out["ch"] = [[r1(x), r1(y)] for x, y in b["chim"]]
    blds.append(out)
    footprints.append(poly)

# ---- gardens: plot boundaries, gates and drives ---------------------------------
from gardens import plots
KERBED = {"primary", "secondary", "tertiary", "residential", "unclassified"}
corridor = [shapely.LineString([(a, b) for a, b, _ in r["p"]]).buffer(
    RW.get(r["c"], 4) / 2 + (1.7 if r["c"] in KERBED else 0.3), cap_style=2)
    for r in roads if len(r["p"]) > 1]
OPEN = {"park", "recreation_ground", "pitch", "playground", "grass", "cemetery", "village_green", "common", "meadow"}
open_land = [poly for g, p in L("land_use") if p.get("class") in OPEN for poly in polys(g)]
front, side, gates = plots([c[0] for c in cand], info, corridor, BM.bounds, rnd, open_land)
garden_br = []
for style, line in front + side:
    n = max(1, int(math.ceil(line.length / 2.5)))
    pts = [line.interpolate(k / n, normalized=True) for k in range(n + 1)]
    garden_br.append(dict(c=style, p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in pts]))
gate_list = [[r1(x0), r1(y0), r1(x1), r1(y1), r1(gelev((x0 + x1) / 2, (y0 + y1) / 2)), st] for x0, y0, x1, y1, st in gates]

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

# ---- trees ----------------------------------------------------------------------
# Real tree positions and heights from the canopy height map where it is available; otherwise
# woods are scattered with trees and gardens lightly.
canopy = None
try:
    from canopy import Canopy
    canopy = Canopy(os.path.join(src_dir, "canopy"), BBOX, (lon0, lat0, kx, ky))
except Exception as e:
    print("no canopy data:", e)
trees = []
if canopy is not None:
    on_road = [shapely.LineString([(a, b) for a, b, _ in r["p"]]).buffer(RW.get(r["c"], 3) / 2 + 0.3)
               for r in roads if len(r["p"]) > 1 and r["c"] not in PATHS]
    solid = shapely.STRtree([f.buffer(0.6) for f in footprints] + on_road)
    tops = canopy.tree_tops(min_height=3.5, radius_m=4.2)
    xs = np.array([t[0] for t in tops]); ys = np.array([t[1] for t in tops])
    for (x, y, h) in tops:
        if not inside(x, y): continue
        if len(solid.query(shapely.Point(x, y), predicate="intersects")): continue
        # the tree model is about 7.5 x its scale tall
        trees.append([r1(x), r1(y), r1(gelev(x, y)), round(min(2.6, max(0.35, h / 7.5)), 2)])
else:
    blocked = unary_union([f.buffer(2.5) for f in footprints] +
                          [shapely.LineString([(a, b) for a, b, _ in r["p"]]).buffer(RW.get(r["c"], 3) / 2 + 1.5)
                           for r in roads if len(r["p"]) > 1])
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

# ---- street furniture, signs, lamps, markings and parked cars --------------------
from streets import street_furniture
fx, marks = street_furniture(roads, L("infrastructure"), gate_list, RW, gelev, proj, inside, rnd)

# ---- shop signs and landmarks ----------------------------------------------------
from shops import shop_signs, landmarks
signs, pubs = shop_signs(L("place"), [c[0] for c in cand], info, roads, RW, gelev, proj, FIELD)
for bi in pubs:
    # pubs here are mid-19th-century ashlar with low hipped slate roofs (the Hadley Arms)
    b = blds[bi]
    b.update(m="s", rc="s")
    if "rr" in b:
        d = math.dist(b["rr"][1], b["rr"][2])
        b["hp"] = [round(d / 2, 1), round(d / 2, 1)]
        b["rp"] = round(b["rp"] * 0.75, 1)
marks_lm = landmarks([c[0] for c in cand], [c[1] for c in cand], info, gelev)

# ---- gaps where streets and paths cross walls, fences and hedges -------------------
gap_parts = [c.buffer(0.4) for c in corridor]
gap_tree = shapely.STRtree(gap_parts)
barriers = []
for b in br + garden_br:
    line = shapely.LineString([(x, y) for x, y, _ in b["p"]])
    if line.length < 0.5: continue
    near = [gap_parts[int(k)] for k in gap_tree.query(line)]
    rest = line.difference(unary_union(near)) if near else line
    for piece in getattr(rest, "geoms", [rest]):
        if piece.geom_type != "LineString" or piece.length < 0.8: continue
        n = max(1, int(math.ceil(piece.length / 2.5)))
        pts = [piece.interpolate(k / n, normalized=True) for k in range(n + 1)]
        barriers.append(dict(c=b["c"], p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in pts]))

# ---- hedges: garden boundaries with a low band of growth along them in the canopy map ----
if canopy is not None:
    FRONT = {"garden_wall", "brick_wall_low", "railing", "hedge_low"}
    hedged = 0
    for b in barriers:
        if b["c"] in ("wall", "fence", "hedge", "retaining_wall") or len(b["p"]) < 2: continue
        line = shapely.LineString([(x, y) for x, y, _ in b["p"]])
        hs = [canopy.at(*line.interpolate(k, normalized=False).coords[0]) for k in np.arange(0, line.length, 1.0)]
        if len(hs) < 2: continue
        green = sum(1 for h in hs if 1.0 <= h <= 4.5) / len(hs)
        if green > 0.6:
            b["c"] = "hedge_low" if b["c"] in FRONT else "hedge"
            hedged += 1
    print(f"canopy: {len(trees)} trees, {hedged} garden boundaries are hedges")

# ---- spawn area: Firs Field, the green between North Road, The Firs and The Avenue --------
spawn = None
for g, p in L("land_use"):
    if name(p) == "Firs Field":
        for poly in polys(g):
            spawn = [[r1(x), r1(y)] for x, y in list(poly.simplify(0.5).exterior.coords)[:-1]]

out = dict(
    release=RELEASE, centre=CENTRE, field=FIELD, b=[r1(X0), r1(Y0), r1(X1), r1(Y1)],
    t=dict(nx=nx, ny=ny, x0=r1(X0), y0=r1(Y0), dx=round(dx, 4), dy=round(dy, 4), z0=z0,
           h=[int(round((v - z0) * 10)) for v in grid.ravel()],   # decimetres above z0, rows south -> north
           k="".join(str(int(v)) for v in GT.ravel())),
    bl=blds, rd=roads, wp=wp, wl=wl, br=barriers, gt=gate_list, tr=trees, spawn=spawn, fx=fx, mk=marks, sh=signs, lm=marks_lm,
)
json.dump(out, open(out_path, "w"), separators=(",", ":"))
print(f"terrain {nx}x{ny} @ {STEP} m, {grid.min():.1f}-{grid.max():.1f} m; {len(blds)} buildings "
      f"({sum('rr' in b for b in blds)} gabled), {len(roads)} road runs, {len(wp)} ponds, {len(wl)} streams, "
      f"{len(barriers)} wall/fence/hedge runs ({len(br)} mapped + {len(garden_br)} gardens, before path gaps), {len(gate_list)} gates, {len(fx)} street items, {len(signs)} shop signs, {len(marks)} markings, {len(trees)} trees; {os.path.getsize(out_path) / 1e6:.1f} MB")
