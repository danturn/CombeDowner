"""Pack the wider circle round a detailed map (its "wide" settings in area.py) into a second, much
lighter JSON file that the game streams in around the player.

Usage: python3 -I tools/prep_wide.py <map> <dir with the wide .geojson layers> <out.json>

The dir is filled by tools/download.py with "wide" on the end, plus a canopy/ folder holding the
Meta / WRI canopy tile (see docs/new-area.md). The detailed map (web/public/maps/<map>.json) must
be built first: everything inside its data box is left to it, and the terrain here is stitched to
its edges.

What it keeps, and how simply:
- terrain: a 12 m grid (three of the detailed map's cells), from the same Mapzen terrain tiles,
  lined up with the detailed map's grid so the two meet without a gap, with ground types for
  colouring (fields, woods, pitches, hard standing);
- buildings: every Overture footprint, guessed at by the same rules as the detailed map
  (buildings.classify and the zones in area.py), without lidar or energy certificates;
- roads and paths, water, and named places, cut into squares (chunks) so the game can stream them;
- trees: every crown in the canopy map, as position and size only.
There are no gardens, walls, street furniture, doors or shop signs out here (yet).

Everything is packed into flat lists of whole numbers (decimetres) to keep the file small; the
layout of each list is described in web/src/wide.ts, which reads it.
"""
import base64, io, json, math, os, random, sys, urllib.request
import numpy as np
import shapely
from PIL import Image
from shapely.geometry import shape, box, Point
from shapely.ops import transform, unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import RELEASE, area
from buildings import classify, wings

A, src_dir, out_path = area(sys.argv[1], wide=True), sys.argv[2], sys.argv[3]
core = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "maps", f"{A.id}.json")))
lon0, lat0 = A.centre
kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
proj = lambda x, y, z=None: ((x - lon0) * kx, (y - lat0) * ky)
rnd = random.Random(1622)
dm = lambda v: int(round(float(v) * 10))      # metres to whole decimetres

# ---- the grid, lined up with the detailed map's -------------------------------------
CT = core["t"]
STEP = 3                         # detailed cells per wide cell
CS = 32                          # wide cells per chunk side
dx = round(CT["dx"] * STEP, 4)
fcx, fcy = A.field_centre
R = A.half                       # data out to this far from the field's centre
kx0 = math.ceil((CT["x0"] - (fcx - R)) / dx)
ky0 = math.ceil((CT["y0"] - (fcy - R)) / dx)
X0, Y0 = CT["x0"] - kx0 * dx, CT["y0"] - ky0 * dx
nx = kx0 + math.ceil(((fcx + R) - CT["x0"]) / dx) + 1
ny = ky0 + math.ceil(((fcy + R) - CT["y0"]) / dx) + 1
# whole chunks
nx = math.ceil((nx - 1) / CS) * CS + 1
ny = math.ceil((ny - 1) / CS) * CS + 1
X1, Y1 = X0 + (nx - 1) * dx, Y0 + (ny - 1) * dx
CORE = box(*core["b"])
circle = Point(fcx, fcy).buffer(R, 64)
region = circle.difference(CORE)            # what this file covers
print(f"grid {nx}x{ny} @ {dx} m, {X0:.1f},{Y0:.1f} to {X1:.1f},{Y1:.1f}; detailed map at cells {kx0},{ky0}")

# ---- terrain ------------------------------------------------------------------------
Z = 14
NPX = 256 * 2 ** Z
gpx = lambda lon: (lon + 180) / 360 * NPX
gpy = lambda lat: (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * NPX
W, S, E, N = X0 / kx + lon0, Y0 / ky + lat0, X1 / kx + lon0, Y1 / ky + lat0
m = 0.003
tx0, tx1 = int(gpx(W - m) // 256), int(gpx(E + m) // 256)
ty0, ty1 = int(gpy(N + m) // 256), int(gpy(S - m) // 256)
os.makedirs(os.path.join(src_dir, "terrain"), exist_ok=True)
rows = []
for ty in range(ty0, ty1 + 1):
    row = []
    for tx in range(tx0, tx1 + 1):
        cache = os.path.join(src_dir, "terrain", f"{Z}_{tx}_{ty}.png")
        if not os.path.exists(cache):
            url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png"
            open(cache, "wb").write(urllib.request.urlopen(url, timeout=30).read())
        a = np.asarray(Image.open(cache).convert("RGB")).astype(float)
        row.append(a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768)
    rows.append(np.hstack(row))
DEM = np.vstack(rows)


def elev(x, y):
    """Bilinear terrain height at model metres (arrays of x east, y north)."""
    lon, lat = np.asarray(x) / kx + lon0, np.asarray(y) / ky + lat0
    u, v = gpx(lon) - tx0 * 256 - 0.5, gpy(lat) - ty0 * 256 - 0.5
    i, j = np.floor(u).astype(int), np.floor(v).astype(int)
    fu, fv = u - i, v - j
    q = lambda a, b: DEM[j + a, i + b]
    return (q(0, 0) * (1 - fu) + q(0, 1) * fu) * (1 - fv) + (q(1, 0) * (1 - fu) + q(1, 1) * fu) * fv


GX, GY = np.meshgrid(X0 + np.arange(nx) * dx, Y0 + np.arange(ny) * dx)
grid = elev(GX, GY)
# inside the detailed map, and along its edge, the heights are the detailed map's own
ch = np.asarray(CT["h"], dtype=float).reshape(CT["ny"], CT["nx"]) / 10 + CT["z0"]
sub = ch[::STEP, ::STEP]
grid[ky0:ky0 + sub.shape[0], kx0:kx0 + sub.shape[1]] = sub


def gelev(x, y):
    """Bilinear height of the wide grid, as the game sees it (scalars)."""
    fi, fj = (x - X0) / dx, (y - Y0) / dx
    i, j = min(nx - 2, max(0, int(fi))), min(ny - 2, max(0, int(fj)))
    u, v = fi - i, fj - j
    return (grid[j, i] * (1 - u) + grid[j, i + 1] * u) * (1 - v) + (grid[j + 1, i] * (1 - u) + grid[j + 1, i + 1] * u) * v


# ---- helpers ------------------------------------------------------------------------
L = lambda f: [(shape(x["geometry"]), x["properties"]) for x in json.load(open(f"{src_dir}/{f}.geojson"))["features"]]
name = lambda p: (p.get("names") or {}).get("primary") or ""


def polys(g, within=region):
    """Projected polygons of a lon/lat geometry, cut to within."""
    c = transform(proj, g)
    if not c.intersects(within): return []
    c = c.intersection(within)
    return [p for p in getattr(c, "geoms", [c]) if p.geom_type == "Polygon" and p.area > 0]


def chunk_boxes(geom):
    """The chunk squares a projected geometry touches: (ci, cj, box)."""
    x0, y0, x1, y1 = geom.bounds
    size = CS * dx
    for ci in range(int((x0 - X0) // size), int((x1 - X0) // size) + 1):
        for cj in range(int((y0 - Y0) // size), int((y1 - Y0) // size) + 1):
            yield ci, cj, box(X0 + ci * size, Y0 + cj * size, X0 + (ci + 1) * size, Y0 + (cj + 1) * size)


def flat_line(pts):
    """[x0, y0, dx1, dy1, ...] in decimetres, each point after the first relative to the last."""
    out, px, py = [], 0, 0
    for k, (x, y) in enumerate(pts):
        X, Y = dm(x), dm(y)
        if k and X == px and Y == py: continue
        out += [X, Y] if not k else [X - px, Y - py]
        px, py = X, Y
    return out


def flat_ring(pts):
    f = flat_line(pts)
    return [len(f) // 2] + f


# ---- ground types per vertex ----------------------------------------------------------
# as in prep_map.py: 0 grass, 1 pitch, 2 wood floor, 3 farmland/meadow, 4 cemetery,
# 5 hard standing, 6 flowerbed, 7 playground
GT = np.zeros(grid.shape, dtype=np.uint8)
layers = []
for g, p in L("land_use"):
    t = {"pitch": 1, "green": 1, "tee": 1, "fairway": 1, "farmland": 3, "meadow": 3, "grass": 3, "cemetery": 4, "retail": 5,
         "pedestrian": 5, "industrial": 5, "flowerbed": 6, "playground": 7}.get(p.get("class"))
    if t is not None: layers.append((t, g))
for g, p in L("infrastructure"):
    if p.get("class") == "parking" and g.geom_type.endswith("Polygon"): layers.append((5, g))
for g, p in L("land"):
    if p.get("subtype") == "forest" and g.geom_type.endswith("Polygon"): layers.append((2, g))
# open country that nothing maps is farmland: the satellite land cover says where it's crops or grass
for g, p in L("land_cover"):
    if p.get("subtype") in ("crop", "grass") and g.geom_type.endswith("Polygon"): layers.insert(0, (3, g))
everywhere = box(X0, Y0, X1, Y1)
for t, g in layers:
    for poly in polys(g, everywhere):
        x0, y0, x1, y1 = poly.bounds
        i0, i1 = max(0, int((x0 - X0) / dx)), min(nx - 1, int((x1 - X0) / dx) + 1)
        j0, j1 = max(0, int((y0 - Y0) / dx)), min(ny - 1, int((y1 - Y0) / dx) + 1)
        win = shapely.contains_xy(poly, GX[j0:j1 + 1, i0:i1 + 1], GY[j0:j1 + 1, i0:i1 + 1])
        GT[j0:j1 + 1, i0:i1 + 1][win] = t

# ---- buildings ----------------------------------------------------------------------
cand = []
for g, p in L("building"):
    for poly in polys(g):
        poly = poly.simplify(0.4)
        if poly.area < 6 or poly.geom_type != "Polygon": continue
        parts = wings(poly) if poly.area > 400 and p.get("class") not in ("church", "chapel") else [poly]
        for w in parts:
            if w.geom_type == "Polygon" and w.area >= 6:
                cand.append((w, dict(p, _whole=poly.area) if len(parts) > 1 else p))
print(f"buildings: {len(cand)} footprints")
info = classify([c[0] for c in cand], [c[1] for c in cand], rnd, A.zones, A.default_zone)
KINDS = ["detached", "semi", "terrace", "outbuilding", "shop", "institution", "flats", "church"]
WALLS = {"stone": 0, "brick": 1, "buff": 2, "render": 3}
COVERS = {"slate": 0, "pantile": 1, "concrete": 2, "grey": 3}
blds = []
for (poly, p), b in zip(cand, info):
    rings = [list(poly.exterior.coords)[:-1]] + [list(r.coords)[:-1] for r in poly.interiors]
    hs = [gelev(x, y) for x, y in rings[0]]
    out = [dm(min(hs)), dm(b["eaves"]), dm(max(hs) - min(hs)), KINDS.index(b["kind"]), WALLS[b["wall"]], COVERS[b["cover"]],
           1 if b["windows"] else 0, dm(b["parapet"]), b["storeys"] or 0, len(rings)]
    for ring in rings: out += flat_ring(ring)
    if b["roof"]:
        q = b["roof"]["rect"]
        ux, uy = q[1][0] - q[0][0], q[1][1] - q[0][1]
        out += [1, dm(b["roof"]["rise"]), dm(b["roof"]["hips"][0]), dm(b["roof"]["hips"][1]),
                dm((q[0][0] + q[2][0]) / 2), dm((q[0][1] + q[2][1]) / 2), int(round(math.atan2(uy, ux) * 1000)),
                dm(math.hypot(ux, uy)), dm(math.dist(q[0], q[3]))]
    else:
        out.append(0)
    out.append(len(b["chim"]))
    for x, y in b["chim"]: out += [dm(x), dm(y)]
    blds.append(out)

# ---- roads ----------------------------------------------------------------------------
# the game knows these classes (web/src/world.ts); trunk roads are drawn as primaries
CLASS = {"motorway": "primary", "trunk": "primary"}
names, name_ix = [""], {"": 0}
classes, class_ix = [], {}
def ix(table, index, v):
    if v not in index: index[v] = len(table); table.append(v)
    return index[v]
roads = []
for g, p in L("segment"):
    if p.get("subtype") != "road": continue
    c = CLASS.get(p.get("class") or "unknown", p.get("class") or "unknown")
    flags = [(tuple(f.get("between") or (0.0, 1.0)), set(f.get("values") or [])) for f in p.get("road_flags") or []]
    if any("is_tunnel" in v for _, v in flags): continue   # (the Combe Down and Devonshire tunnels are in the detailed map)
    bridges = [r for r, v in flags if "is_bridge" in v]
    line = transform(proj, g)
    if line.geom_type != "LineString" or not line.intersects(region): continue
    # a bridge is carried straight across between the ground at its ends
    spans = []
    for a, b in bridges:
        pa, pb = line.interpolate(a, normalized=True), line.interpolate(b, normalized=True)
        spans.append((a, b, gelev(pa.x, pa.y), gelev(pb.x, pb.y)))
    def deck(x, y):
        t = line.project(Point(x, y), normalized=True)
        for a, b, za, zb in spans:
            if a - 1e-6 <= t <= b + 1e-6: return za + (zb - za) * (t - a) / ((b - a) or 1), True
        return gelev(x, y), False
    for ci, cj, cb in chunk_boxes(line):
        piece = line.intersection(cb).intersection(region)
        for seg in getattr(piece, "geoms", [piece]):
            if seg.geom_type != "LineString" or seg.length < 1: continue
            head = [ix(classes, class_ix, c), ix(names, name_ix, name(p))]
            zs = [deck(x, y) for x, y in seg.coords] if spans else []
            if any(on for _, on in zs):
                # on a bridge: every point carries its height too, [x, y, z, dx, dy, dz, ...]
                pts, prev = [], None
                for (x, y), (z, _) in zip(seg.coords, zs):
                    q = (dm(x), dm(y), dm(z))
                    if prev and q[:2] == prev[:2]: continue
                    pts += list(q) if prev is None else [q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]]
                    prev = q
                roads.append(head + [1] + pts)
            else:
                roads.append(head + [0] + flat_line(seg.coords))
print(f"roads: {len(roads)} pieces")

# ---- water ----------------------------------------------------------------------------
ponds, streams = [], []
for g, p in L("water"):
    if p.get("class") == "sea": continue
    if g.geom_type.endswith("Polygon"):
        for poly in polys(g):
            for ci, cj, cb in chunk_boxes(poly):
                piece = poly.intersection(cb)
                for part in getattr(piece, "geoms", [piece]):
                    if part.geom_type != "Polygon" or part.area < 4: continue
                    part = part.simplify(0.5)
                    ring = list(part.exterior.coords)[:-1]
                    if len(ring) < 3: continue
                    # dense samples round the edge for the level: the lowest bank in this square
                    edge = [part.exterior.interpolate(t, normalized=True) for t in np.linspace(0, 1, 40, endpoint=False)]
                    wz = min(gelev(q.x, q.y) for q in edge) + 0.1
                    out = [dm(wz), 1 + len(part.interiors)]
                    for r in [ring] + [list(h.coords)[:-1] for h in part.interiors]: out += flat_ring(r)
                    ponds.append(out)
                    # the lidar over water is noisy and rarely below the banks: give the water a bed
                    x0, y0, x1, y1 = part.bounds
                    i0, i1 = max(0, int((x0 - X0) / dx) - 1), min(nx - 1, int((x1 - X0) / dx) + 2)
                    j0, j1 = max(0, int((y0 - Y0) / dx) - 1), min(ny - 1, int((y1 - Y0) / dx) + 2)
                    sx, sy = GX[j0:j1 + 1, i0:i1 + 1], GY[j0:j1 + 1, i0:i1 + 1]
                    wet = shapely.contains_xy(part.buffer(dx * 0.5), sx, sy)
                    # not along the detailed map's edge, which must keep its own heights
                    wet &= ~((sx >= core["b"][0] - 1) & (sx <= core["b"][2] + 1) & (sy >= core["b"][1] - 1) & (sy <= core["b"][3] + 1))
                    blk = grid[j0:j1 + 1, i0:i1 + 1]
                    blk[wet] = np.minimum(blk[wet], wz - 0.8)
    elif g.geom_type.endswith("LineString"):
        line = transform(proj, g)
        if not line.intersects(region): continue
        for ci, cj, cb in chunk_boxes(line):
            piece = line.intersection(cb).intersection(region)
            for seg in getattr(piece, "geoms", [piece]):
                if seg.geom_type == "LineString" and seg.length >= 1: streams.append(flat_line(seg.coords))
print(f"water: {len(ponds)} pieces of ponds and rivers, {len(streams)} pieces of streams")

# ---- named places -----------------------------------------------------------------------
WIDE = {"protected_landscape_seascape", "wilderness_area", "species_management_area"}
places = []
for f in ("land_use", "water"):
    for g, p in L(f):
        n = name(p)
        if not n or p.get("class") in WIDE or not g.geom_type.endswith("Polygon"): continue
        for poly in polys(g, circle):
            if not 300 < poly.area < 2000000: continue
            ring = list(poly.simplify(4.0).exterior.coords)[:-1]
            if len(ring) >= 3: places.append((poly.area, dict(n=n, r=[[round(x), round(y)] for x, y in ring])))
places = [p for _, p in sorted(places, key=lambda t: t[0])]

# ---- trees --------------------------------------------------------------------------------
from canopy import Canopy
footprints = shapely.STRtree([c[0].buffer(0.6) for c in cand])
road_lines = []
for r in roads:
    c = classes[r[0]]
    if c in ("footway", "path", "steps", "cycleway", "bridleway", "track"): continue
    pts, x, y, n = [], 0, 0, 3 if r[2] else 2
    for k in range(3, len(r), n):
        x, y = (r[k], r[k + 1]) if k == 3 else (x + r[k], y + r[k + 1])
        pts.append((x / 10, y / 10))
    if len(pts) > 1: road_lines.append(shapely.LineString(pts).buffer(4.5))
road_tree = shapely.STRtree(road_lines)
trees = []
TILE = 2000.0
bx0, by0, bx1, by1 = region.bounds
for tx in np.arange(bx0, bx1, TILE):
    for ty in np.arange(by0, by1, TILE):
        tile = box(tx, ty, tx + TILE, ty + TILE)
        if not tile.intersects(region): continue
        pad = 20
        bb = ((tx - pad) / kx + lon0, (ty - pad) / ky + lat0, (tx + TILE + pad) / kx + lon0, (ty + TILE + pad) / ky + lat0)
        cano = Canopy(os.path.join(src_dir, "canopy"), bb, (lon0, lat0, kx, ky))
        tops = [(x, y, h) for x, y, h in cano.tree_tops(min_height=4.0, radius_m=3.2) if tx <= x < tx + TILE and ty <= y < ty + TILE]
        if not tops: continue
        xs, ys = np.array([t[0] for t in tops]), np.array([t[1] for t in tops])
        keep = shapely.contains_xy(region, xs, ys)
        for (x, y, h), k in zip(tops, keep):
            if not k: continue
            pt = Point(x, y)
            if len(footprints.query(pt, predicate="intersects")) or len(road_tree.query(pt, predicate="intersects")): continue
            # the tree model is about 7.5 x its scale tall
            trees.append((x, y, min(2.6, max(0.5, h / 7.5))))
        print(f"trees: {len(trees)} so far")
tr = np.array([[round(x * 2), round(y * 2), round(s * 100)] for x, y, s in trees], dtype="<i2")

# ---- out --------------------------------------------------------------------------------
z0 = CT["z0"]
hq = np.round((grid - z0) * 10).astype(np.int32)
# each row as differences along it, which pack much smaller once the server compresses them
dq = hq.copy()
dq[:, 1:] = hq[:, 1:] - hq[:, :-1]
assert np.abs(dq).max() < 32768
b64 = lambda a: base64.b64encode(a.tobytes()).decode()
out = dict(
    id=A.id, release=RELEASE, field=A.field, fc=list(A.field_centre), r=R, core=core["b"],
    t=dict(nx=nx, ny=ny, x0=round(X0, 4), y0=round(Y0, 4), dx=dx, z0=z0, cs=CS, ci=[kx0, ky0, STEP],
           h=b64(dq.astype("<i2")), k=b64(GT)),
    cl=classes, nm=names, bl=blds, rd=roads, wp=ponds, wl=streams, tr=b64(tr), pl=places,
)
json.dump(out, open(out_path, "w"), separators=(",", ":"))
print(f"{len(blds)} buildings ({sum(1 for b in info if b['roof'])} pitched), {len(roads)} road pieces, {len(ponds)} water pieces, "
      f"{len(streams)} streams, {len(trees)} trees, {len(places)} places; {os.path.getsize(out_path) / 1e6:.1f} MB")
