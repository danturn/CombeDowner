"""Pack the Overture layers plus lidar terrain into one JSON file for the game.

Usage: python3 -I tools/prep_map.py <map> <dir with raw .geojson layers> <out.json> [--tile ti tj]

Adapted from the Bath prototype (Train-Game, Tools/overture-poc/prep_3d.py). Terrain comes from
AWS Terrain Tiles (Mapzen "terrarium" PNGs, zoom 15, about 3 m per pixel here), which in England
are built from Environment Agency lidar. Model coordinates are metres east/north of the map
centre; elevations are metres above sea level.

Changes for first person:
- the terrain is flattened under vehicle roads, so roads sit flush and need no lift;
- each vertex of the terrain grid gets a ground type (grass, pitch, wood...) for colouring;
- small rectangular buildings get a gabled roof, given as an oriented rectangle;
- woods are scattered with trees, and walls, fences and hedges are kept as barrier lines.

With --tile ti tj it builds one square of the whole of Bath round the detailed map instead, at the
same level of detail, from the map's wide data (tools/prep_tiles.py builds them all; see
docs/new-area.md). The squares carry on the detailed map's terrain grid: each is 261 x 261 of its
cells, square (0, 0) starting at the detailed map's south-west corner, so the detailed map is
squares 0-2 each way and is left out. A tile is worked out over a margin of 15 cells round itself
(roads further), so roads, gardens and river beds near an edge come out the same from both sides,
then it keeps only what is its own:
- terrain: its 262 x 262 vertices, the edges shared exactly with its neighbours, and with the
  detailed map's own heights where it meets it;
- buildings: whole, in the tile holding the middle of the footprint (the part of one inside the
  detailed map is left to that), with the wide zones in area.py for their character;
- doors, signs, trees, furniture and the like: those standing inside the tile; short pieces
  (markings, wires, gates, paths, drives) by their middle;
- roads, walls, streams and tunnels: cut at the tile's edge; water and named places cut to it.
Shop names come from Overture's places (there is no OpenStreetMap here), the landmarks from the
pack for the wide area (tools/landmarks/<map>_bath.py) if there is one, and there is no spawn.
"""
import io, json, math, os, random, sys, urllib.request, zlib
import numpy as np
import shapely
from PIL import Image
from shapely.geometry import shape, box, Point
from shapely.ops import transform, unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import RELEASE, area

args = sys.argv[1:]
TILE = None
if "--tile" in args:
    k = args.index("--tile")
    TILE = (int(args[k + 1]), int(args[k + 2]))
    del args[k:k + 3]
A, src_dir, out_path = area(args[0], wide=TILE is not None), args[1], args[2]
lon0, lat0 = A.centre
kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
proj = lambda x, y, z=None: ((x - lon0) * kx, (y - lat0) * ky)
if TILE is None:
    W, S, E, N = A.bbox
    B = box(W, S, E, N)
    X0, Y0 = proj(W, S)
    X1, Y1 = proj(E, N)
    ROAD_BOX = None          # roads are cut at the edge of the data like everything else
else:
    # ---- the tile: a square of the detailed map's grid, worked out over a margin round it ----
    core = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "maps", f"{A.id}.json")))
    CB, CT = core["b"], core["t"]
    D = (CB[2] - CB[0]) / (CT["nx"] - 1)       # the grid spacing, 3130 / 783 m
    CELLS, MARGIN = 261, 15
    ti, tj = TILE
    lat_x = lambda i: CB[0] + i * D              # the grid's vertex i east, j north, in metres
    lat_y = lambda j: CB[1] + j * D
    TX0, TY0, TX1, TY1 = lat_x(ti * CELLS), lat_y(tj * CELLS), lat_x((ti + 1) * CELLS), lat_y((tj + 1) * CELLS)
    gi0, gj0 = ti * CELLS - MARGIN, tj * CELLS - MARGIN
    X0, Y0, X1, Y1 = lat_x(gi0), lat_y(gj0), lat_x(gi0 + CELLS + 2 * MARGIN), lat_y(gj0 + CELLS + 2 * MARGIN)
    W, S, E, N = X0 / kx + lon0, Y0 / ky + lat0, X1 / kx + lon0, Y1 / ky + lat0
    # roads are taken whole for 500 m past the margin, so a street's lamps, cars and bridges are
    # laid out from the same start in every tile that has it
    ROAD_BOX = (X0 - 500, Y0 - 500, X1 + 500, Y1 + 500)
    CORE = box(*CB)
    TBOX = box(TX0, TY0, TX1, TY1)
    own = lambda x, y: TX0 <= x < TX1 and TY0 <= y < TY1     # the tile's own (each point is in one tile)
BM = box(X0, Y0, X1, Y1)
r1 = lambda v: round(float(v), 1)
rnd = random.Random(1622)

# ---- terrain ------------------------------------------------------------------
Z = 15
NPX = 256 * 2 ** Z
gpx = lambda lon: (lon + 180) / 360 * NPX
gpy = lambda lat: (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * NPX
m = 0.002
if TILE is None:
    tx0, tx1 = int(gpx(W - m) // 256), int(gpx(E + m) // 256)
    ty0, ty1 = int(gpy(N + m) // 256), int(gpy(S - m) // 256)
else:
    # a tile needs the ground 1250 m round itself, for the water levels of its neighbours' rivers
    g = 1250
    tx0, tx1 = int(gpx((TX0 - g) / kx + lon0) // 256), int(gpx((TX1 + g) / kx + lon0) // 256)
    ty0, ty1 = int(gpy((TY1 + g) / ky + lat0) // 256), int(gpy((TY0 - g) / ky + lat0) // 256)
cache = os.path.join(src_dir, "terrain15")     # downloaded tiles are kept here for the next build


def terrain_tile(tx, ty):
    path = os.path.join(cache, f"{Z}_{tx}_{ty}.png")
    if not os.path.exists(path):
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png"
        data = urllib.request.urlopen(url, timeout=30).read()
        os.makedirs(cache, exist_ok=True)
        tmp = f"{path}.{os.getpid()}"
        open(tmp, "wb").write(data)
        os.replace(tmp, path)      # several builds may fetch the same tile at once
    return Image.open(path)


rows = []
for ty in range(ty0, ty1 + 1):
    row = []
    for tx in range(tx0, tx1 + 1):
        a = np.asarray(terrain_tile(tx, ty).convert("RGB")).astype(float)
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


if TILE is not None:
    def elev(x, y):
        """As above, but worked out from the whole world's pixel grid, so every tile gets exactly
        the same height at the same point whichever terrain tiles it has loaded."""
        lon, lat = x / kx + lon0, y / ky + lat0
        u, v = gpx(lon) - 0.5, gpy(lat) - 0.5
        i, j = int(math.floor(u)), int(math.floor(v))
        fu, fv = u - i, v - j
        q = DEM[j - ty0 * 256:j - ty0 * 256 + 2, i - tx0 * 256:i - tx0 * 256 + 2]
        return (q[0, 0] * (1 - fu) + q[0, 1] * fu) * (1 - fv) + (q[1, 0] * (1 - fu) + q[1, 1] * fu) * fv


def low(x, y, r):
    """Lowest ground within r metres: used for water surfaces, which sit below their banks."""
    return min([elev(x, y)] + [elev(x + r * math.cos(a), y + r * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 8, endpoint=False)])


STEP = 4.0
BANK = 10.0     # metres back from the water's edge over which the ground slopes down to it
if TILE is None:
    nx, ny = int(math.ceil((X1 - X0) / STEP)) + 1, int(math.ceil((Y1 - Y0) / STEP)) + 1
    dx, dy = (X1 - X0) / (nx - 1), (Y1 - Y0) / (ny - 1)
    grid = np.array([[elev(X0 + i * dx, Y0 + j * dy) for i in range(nx)] for j in range(ny)])  # rows south -> north
    GX, GY = np.meshgrid(X0 + np.arange(nx) * dx, Y0 + np.arange(ny) * dy)
else:
    # the vertices of the detailed map's grid, numbered from its corner, so neighbouring tiles share them exactly
    nx = ny = CELLS + 2 * MARGIN + 1
    dx = dy = D
    xs, ys = [lat_x(gi0 + i) for i in range(nx)], [lat_y(gj0 + j) for j in range(ny)]
    grid = np.array([[elev(x, y) for x in xs] for y in ys])
    GX, GY = np.meshgrid(np.array(xs), np.array(ys))

# ---- helpers ------------------------------------------------------------------
L = lambda f: [(shape(x["geometry"]), x["properties"]) for x in json.load(open(f"{src_dir}/{f}.geojson"))["features"]]
inside = lambda x, y: X0 <= x <= X1 and Y0 <= y <= Y1
name = lambda p: (p.get("names") or {}).get("primary") or ""


def densify_runs(coords, step, within=None):
    """Walk a full (unclipped) lon/lat line; return runs of in-bbox points as [x, y, t], t = fraction along the line.
    within: another box (x0, y0, x1, y1, model metres) to keep the points in, instead of the data's."""
    W, S, E, N = globals()["W"], globals()["S"], globals()["E"], globals()["N"]
    ins = inside
    if within is not None:
        W, S, E, N = within[0] / kx + lon0, within[1] / ky + lat0, within[2] / kx + lon0, within[3] / ky + lat0
        ins = lambda x, y: within[0] <= x <= within[2] and within[1] <= y <= within[3]
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
            if ins(x, y):
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


APPROACH = 10   # points (40 m) back from a bridge's end over which the survey may have the road dropping into the gap


def level_structures(run, z, ranges):
    """Carry bridges and tunnels straight between the road at either end. The survey's ground
    drops away into the gap over the last few dozen metres before a bridge (the bridge taken out
    of it and the bank put in), where the road doesn't: so each end is taken from the highest
    point of the road within APPROACH points of it, and the approach from there is held level."""
    ts = [p[2] for p in run]
    for a, b in ranges:
        idx = [i for i, t in enumerate(ts) if a <= t <= b]
        if not idx: continue
        i0, i1 = max(0, idx[0] - 1), min(len(run) - 1, idx[-1] + 1)
        ia = max(range(max(0, i0 - APPROACH), i0 + 1), key=lambda i: z[i])
        ib = max(range(i1, min(len(run), i1 + APPROACH + 1)), key=lambda i: z[i])
        za, zb, ta, tb = z[ia], z[ib], ts[i0], ts[i1]
        for i in range(ia, i0 + 1): z[i] = za
        for i in range(i1, ib + 1): z[i] = zb
        for i in range(i0 + 1, i1):
            z[i] = za + (zb - za) * ((ts[i] - ta) / ((tb - ta) or 1))
    return z


def in_ranges(run, ranges):
    """Which points of run (by index) fall in the stretches ranges, as fractions along the line."""
    return {i for i, (_, _, t) in enumerate(run) if any(a <= t <= b for a, b in ranges)}


SMOOTH = 3      # points (of 4 m) each side averaged into a road's height, so it rises and falls like a road, not like the survey's pixels


def smooth_profile(run, z, keep):
    """A road's heights, smoothed along its length, apart from the points in keep (bridges and
    tunnels, which are carried straight already) and the two ends (where it meets other roads,
    which must agree on the height there). In a tile, it eases back to the plain survey near the
    detailed map, whose roads were built without smoothing, so the two meet."""
    n = len(z)
    if n < 3: return z
    out = list(z)
    for i in range(1, n - 1):
        if i in keep: continue
        lo, hi = max(0, i - SMOOTH), min(n - 1, i + SMOOTH)
        js = [j for j in range(lo, hi + 1) if j not in keep]     # (not the ground under a bridge: that's the river)
        if len(js) < 2: continue
        avg = sum(z[j] for j in js) / len(js)
        w = min(1.0, i / SMOOTH, (n - 1 - i) / SMOOTH)        # pinned at the ends
        if TILE is not None:
            x, y = run[i][0], run[i][1]
            d = max(0.0, CB[0] - x, x - CB[2], CB[1] - y, y - CB[3])
            w *= min(1.0, d / 40)
        out[i] = z[i] + (avg - z[i]) * w
    return out


def line_coords(g):
    return [list(l.coords) for l in getattr(g, "geoms", [g]) if l.geom_type == "LineString"]


def polys(g):
    """Projected, clipped polygons of a lon/lat geometry."""
    c = transform(proj, g).intersection(BM)
    return [p for p in getattr(c, "geoms", [c]) if p.geom_type == "Polygon" and p.area > 0]


def whole_polys(g, within=BM):
    """Projected polygons of a lon/lat geometry that reach into within, whole (not cut to it)."""
    c = transform(proj, g)
    if not c.intersects(within): return []
    return [p for p in getattr(c, "geoms", [c]) if p.geom_type == "Polygon" and p.area > 0]


def cover_xy(poly, edge=False):
    """The grid vertices inside poly (and on its edge, with edge), as a window of the grid and a
    mask over it: only the vertices round the polygon are tested."""
    x0, y0, x1, y1 = poly.bounds
    i0, i1 = max(0, int((x0 - X0) / dx)), min(nx - 1, int((x1 - X0) / dx) + 1)
    j0, j1 = max(0, int((y0 - Y0) / dy)), min(ny - 1, int((y1 - Y0) / dy) + 1)
    win = (slice(j0, max(j0, j1 + 1)), slice(i0, max(i0, i1 + 1)))
    test = shapely.intersects_xy if edge else shapely.contains_xy
    return win, test(poly, GX[win], GY[win])


# ---- roads (also flatten the terrain under them) ------------------------------
# classes the game has no drawing for are mapped to the nearest one it does (as prep_wide.py does)
CLASS = {"motorway": "primary", "trunk": "primary", "living_street": "residential"}
RW = {"motorway": 14, "trunk": 12, "primary": 9, "secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 6,
      "living_street": 5, "service": 3.5, "unknown": 4, "pedestrian": 4, "footway": 1.6, "steps": 1.8, "cycleway": 2,
      "path": 1.5, "track": 3, "bridleway": 2}
PATHS = {"footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"}
import tunnels as TN
roads, tunnel_list = [], []
flat_w = np.full(grid.shape, np.inf)   # distance from each grid vertex to the nearest road it is flattened to
flat_z = grid.copy()
flat_in = np.zeros(grid.shape, dtype=bool)   # the vertex is inside a road's carriageway (not just its easing)
flat_f = np.zeros(grid.shape)          # how far out from that road's centre line the ground is flat (the verge's edge)
SLOPE = 1.5                            # the ground eases from a road's level to its own over this many metres per metre of difference
EASE = 12.0                            # and over this far at most


PROTECT = None                         # grid vertices under a bridge's span: no road flattens them


def flatten(run, z, reach, only=None):
    """Flatten the terrain under the line run (heights z) out to reach, and ease it back to its
    own level beyond that, over a distance that depends on how far it has to go (a cutting or
    an embankment gets a slope, not a step); only: the indexes of the points whose segments
    count. The ground under a bridge (PROTECT) is left to the bridge."""
    for k, ((ax, ay, *_), (bx, by, *_), za, zb) in enumerate(zip(run, run[1:], z, z[1:])):
        if only is not None and not (k in only and k + 1 in only): continue
        far = reach + EASE
        i0, i1 = max(0, int((min(ax, bx) - far - X0) / dx)), min(nx - 1, int((max(ax, bx) + far - X0) / dx) + 1)
        j0, j1 = max(0, int((min(ay, by) - far - Y0) / dy)), min(ny - 1, int((max(ay, by) + far - Y0) / dy) + 1)
        if i1 < i0 or j1 < j0: continue          # off the grid (a tile's roads reach past it)
        px, py = GX[j0:j1 + 1, i0:i1 + 1], GY[j0:j1 + 1, i0:i1 + 1]
        vx, vy = bx - ax, by - ay
        t = np.clip(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy or 1), 0, 1)
        d = np.hypot(px - (ax + t * vx), py - (ay + t * vy))
        zz = za + (zb - za) * t
        W = (slice(j0, j1 + 1), slice(i0, i1 + 1))
        inside = d < reach
        # the nearest road wins, but a carriageway beats another road's easing (one road passing
        # under another is seen to separately: the one under is dipped and the ground cut with it)
        win = (d < far) & np.where(inside, ~flat_in[W] | (d < flat_w[W]), ~flat_in[W] & (d < flat_w[W]))
        if PROTECT is not None: win &= ~PROTECT[W]
        flat_w[W][win] = d[win]
        flat_z[W][win] = zz[win]
        flat_f[W][win] = reach
        flat_in[W] |= win & inside


# every road run first, with its heights and what's marked on it; then the underpasses, so the
# roads over them are spans; then the roads are written out and the ground flattened under them
pending = []
for g, p in L("segment"):
    if p["subtype"] != "road": continue
    c = CLASS.get(p.get("class") or "unknown", p.get("class") or "unknown")
    # a street closed to motor vehicles (the pedestrianised streets in town, some only in the
    # daytime) is a pedestrian street here: drawn, but with no traffic, no parked cars and no
    # centre lines; and a one-way street says which way (1 with its points, -1 against them)
    one_way = 0
    for ar in p.get("access_restrictions") or []:
        if ar.get("access_type") != "denied": continue
        w = ar.get("when") or {}
        if w.get("heading") == "backward" and not w.get("mode"): one_way = 1
        elif w.get("heading") == "forward" and not w.get("mode"): one_way = -1
        elif not w.get("heading") and not w.get("using") and not w.get("recognized") and (w.get("mode") is None or "motor_vehicle" in w["mode"]) and c not in PATHS:
            c = "pedestrian"
    ranges = flag_ranges(p, "road_flags")
    tunnel_ranges = [tuple(f.get("between") or (0.0, 1.0)) for f in p.get("road_flags") or [] if "is_tunnel" in (f.get("values") or [])]
    bridge_ranges = [tuple(f.get("between") or (0.0, 1.0)) for f in p.get("road_flags") or [] if "is_bridge" in (f.get("values") or [])]
    for coords in line_coords(g):
        for run in densify_runs(coords, 4.0, ROAD_BOX):
            # smoothed first (a road; a path lies on the ground as it is), then the structures
            # carried straight between the smoothed road at their ends
            z = [elev(x, y) for x, y, _ in run]
            if c not in PATHS: z = smooth_profile(run, z, in_ranges(run, ranges))
            z = level_structures(run, z, ranges)
            bored = TN.bores(run, z, tunnel_ranges, elev)
            pending.append(dict(c=c, n=name(p), run=run, z=z, span=in_ranges(run, bridge_ranges), bored=bored, tunnel_ranges=tunnel_ranges, ow=one_way))
# an underpass: a tunnel stretch too shallow to bore, which stays a road in a cutting. Whatever
# crosses over it is carried over as a bridge (Overture seldom marks the road on top), with the
# cutting as wide as the road in it
underpasses = []
for k, r in enumerate(pending):
    if not r["tunnel_ranges"]: continue
    shallow = in_ranges(r["run"], r["tunnel_ranges"]) - {i for i0, i1 in r["bored"] for i in range(i0, i1 + 1)}
    pts = [r["run"][i][:2] for i in sorted(shallow)]
    if len(pts) >= 2: underpasses.append((k, shapely.LineString(pts).buffer(max(TN.HALF + TN.CUT, RW.get(r["c"], 4) / 2 + 2.5) + 1.0)))
under_tree = shapely.STRtree([u for _, u in underpasses])
carried = 0
for k, r in enumerate(pending):
    if not underpasses: break
    line = shapely.LineString([q[:2] for q in r["run"]])
    for j in under_tree.query(line):
        if underpasses[int(j)][0] == k: continue
        poly = underpasses[int(j)][1]
        over = {i for i, q in enumerate(r["run"]) if poly.contains(shapely.Point(q[:2]))}
        carried += len(over - r["span"])
        r["span"] |= over
if underpasses: print(f"underpasses: {len(underpasses)}, with {carried} points of other roads carried over them as bridges")
# ---- bridges: what's really a bridge, what rides on one, what passes under one ---------------
# Overture marks odd little "bridges" (a street over a vault, a few metres of a path) with nothing
# to cross, maps a bridge's pavements as footways of their own, and the survey's ground under a
# bridge is often the deck itself (the bridge taken out and the gap filled in), so the road
# crossing under comes out at the deck's height. In order:
# 1. a path running along a road's span, within its deck, rides on the deck (a fourth value of 2:
#    at the road's height, with nothing built of its own);
# 2. a marked stretch is a bridge only if it crosses water, the railway or another road it
#    doesn't join (roads that meet are a junction, never one over the other), or the ground drops
#    well away under it; otherwise it's flattened into the ground like the rest of the road;
# 3. a road crossing under a road's bridge, without joining it, is dipped to leave headroom,
#    easing in and out over a few dozen metres, and its own flattening cuts the ground with it.
rail_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "maps", f"{A.id}-rail.json")
rail_tracks = json.load(open(rail_file))["tracks"] if os.path.exists(rail_file) else []
water_polys = [transform(proj, g) for g, p in L("water") if p.get("class") != "sea" and g.geom_type.endswith("Polygon")]
water_tree = shapely.STRtree(water_polys)
rail_lines = [shapely.LineString([q[:2] for q in t["p"]]) for t in rail_tracks if len(t["p"]) > 1]
rail_tree = shapely.STRtree(rail_lines)
road_lines = [shapely.LineString([q[:2] for q in r["run"]]) for r in pending]
road_tree = shapely.STRtree(road_lines)
KERBED_RD = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street"}


def stretches(idx):
    """Runs of consecutive indexes in the set idx, each as a sorted list."""
    out, cur = [], []
    for i in sorted(idx):
        if cur and i != cur[-1] + 1: out.append(cur); cur = []
        cur.append(i)
    if cur: out.append(cur)
    return out


def joined(k, j):
    """Do roads k and j meet (an end of one on the other)? Then they're a junction, not a crossing."""
    for a, b in ((k, j), (j, k)):
        run = pending[a]["run"]
        for q in (run[0], run[-1]):
            if road_lines[b].distance(shapely.Point(q[:2])) < 2.5: return True
    return False


def crossing(k, j, line):
    """Where road j crosses the stretch line of road k, well inside it: the point, or None."""
    if j == k or joined(k, j) or not road_lines[j].crosses(line): return None
    x = road_lines[j].intersection(line)
    x = x.geoms[0] if hasattr(x, "geoms") else x
    if x.geom_type != "Point": return None
    t = line.project(x)
    return x if 1 < t < line.length - 1 else None


def span_line(r, st):
    a, b = max(0, st[0] - 1), min(len(r["run"]) - 1, st[-1] + 1)
    return a, b, shapely.LineString([r["run"][i][:2] for i in range(a, b + 1)])


# 1. paths along a road's marked span ride on its deck
decks = []
for k, r in enumerate(pending):
    if r["c"] in PATHS or not r["span"]: continue
    for st in stretches(r["span"]):
        a, b, line = span_line(r, st)
        decks.append((k, line.buffer(RW.get(r["c"], 4) / 2 + (1.7 if r["c"] in KERBED_RD else 0.3) + 1.5, cap_style=2), line, [r["z"][i] for i in range(a, b + 1)]))
deck_tree = shapely.STRtree([d[1] for d in decks])
ridden = 0
for r in pending:
    r["deck"] = set()
    if r["c"] not in PATHS: continue
    pl = shapely.LineString([q[:2] for q in r["run"]])
    for j in deck_tree.query(pl):
        k, poly, line, zs = decks[int(j)]
        # along the road, not across it
        if pl.length > 6 and pl.intersection(poly).length < 0.6 * min(pl.length, line.length) and road_lines[k].crosses(pl): continue
        for i, q in enumerate(r["run"]):
            if not poly.contains(shapely.Point(q[:2])): continue
            t = line.project(shapely.Point(q[:2])) / (line.length or 1) * (len(zs) - 1)
            lo = min(len(zs) - 2, int(t)); f = t - lo
            r["z"][i] = zs[lo] + (zs[lo + 1] - zs[lo]) * f
            r["deck"].add(i); r["span"].discard(i); ridden += 1
if ridden: print(f"bridges: {ridden} path points ride on a road's deck beside it")

# 2. which marked spans are real bridges
kept = dropped = 0
for k, r in enumerate(pending):
    if not r["span"]: continue
    run, z, keep = r["run"], r["z"], set()
    for st in stretches(r["span"]):
        a, b, line = span_line(r, st)
        real = any(water_polys[int(j)].intersects(line) for j in water_tree.query(line)) \
            or any(rail_lines[int(j)].intersects(line) for j in rail_tree.query(line)) \
            or any(z[i] - elev(run[i][0], run[i][1]) > 2.5 for i in st)
        solid = real
        if not real:
            for j in road_tree.query(line):
                j = int(j)
                x = crossing(k, j, line)
                if x is None or pending[j]["deck"]: continue
                # over another road: the data has the deck well above it (a footbridge, a flyover),
                # or it's a road long enough to be a bridge over a road, and the survey has merely
                # filled the gap (a path crossing a street at grade is a crossing, not a bridge)
                i = min(range(len(pending[j]["run"])), key=lambda i: math.dist(pending[j]["run"][i][:2], (x.x, x.y)))
                if z[st[0]] - pending[j]["z"][i] >= 3.5 or (r["c"] not in PATHS and pending[j]["c"] not in PATHS and line.length >= 20):
                    real = True; break
        if real: keep |= set(st); kept += 1
        else: dropped += 1
        if real and solid: r.setdefault("solid", set()).update(st)
    r["span"] = keep
if kept or dropped: print(f"bridges: {kept} marked spans with something under them, {dropped} with nothing under them flattened as road")

# 2b. a path's span crossing a street at the street's level is a pedestrian crossing there,
# not a bridge over it: the street wins and the span stops either side of it
VIADUCT = 40    # metres: a path's span this long is a viaduct, and what crosses under it goes under
for k, r in enumerate(pending):
    if r["c"] not in PATHS or not r["span"]: continue
    run, z = r["run"], r["z"]
    for st in stretches(set(r["span"])):
        a, b, line = span_line(r, st)
        if line.length >= VIADUCT: continue
        for j in road_tree.query(line):
            j = int(j)
            if pending[j]["c"] in PATHS: continue
            x = crossing(k, j, line)
            if x is None: continue
            o = pending[j]
            i = min(range(len(o["run"])), key=lambda i: math.dist(o["run"][i][:2], (x.x, x.y)))
            if abs(z[min(range(len(run)), key=lambda i: math.dist(run[i][:2], (x.x, x.y)))] - o["z"][i]) < 1.0:
                reach = RW.get(o["c"], 4) / 2 + 2.0
                for i2 in st:
                    if math.dist(run[i2][:2], (x.x, x.y)) < reach + 2: r["span"].discard(i2)

# 2c. a road marked as a bridge where it crosses under the railway (the data has it the wrong
# way up) is no bridge: it passes under
for k, r in enumerate(pending):
    if not r["span"] or not rail_lines: continue
    for st in stretches(set(r["span"])):
        a, b, line = span_line(r, st)
        for t in rail_tree.query(line):
            rl = rail_lines[int(t)]
            if not rl.crosses(line): continue
            x = rl.intersection(line); x = x.geoms[0] if hasattr(x, "geoms") else x
            if x.geom_type != "Point": continue
            tp = rail_tracks[int(t)]["p"]
            kk = min(range(len(tp)), key=lambda kk: math.dist(tp[kk][:2], (x.x, x.y)))
            zr = r["z"][min(range(len(r["run"])), key=lambda i: math.dist(r["run"][i][:2], (x.x, x.y)))]
            if zr < tp[kk][2] - 1.0:
                for i2 in st: r["span"].discard(i2)

CLEAR_ROAD, CLEAR_PATH, DIP = 4.6, 2.8, 35.0     # headroom under a bridge for a road, for a path; metres over which a road eases down to it


def ease_roads(x, y, head, skip, down=True, reach=None, own=None):
    """Bring every road's points within DIP of (x, y) down to head (or up, with down False),
    easing in and out, so roads meeting there stay joined; skip: road indexes left alone (the
    bridge itself), and any road's points on a span or a deck are left alone too (except road
    own's, the one being carried over the canal), as is any road that is itself a bridge there."""
    n = 0
    for j in road_tree.query(shapely.Point(x, y).buffer(reach or DIP)):
        j = int(j)
        if j in skip: continue
        o = pending[j]
        if j != own and any(math.dist(o["run"][i][:2], (x, y)) < DIP + 10 for i in o["span"]): continue
        for i, q in enumerate(o["run"]):
            if j != own and (i in o["span"] or i in o["deck"]): continue
            d = math.dist(q[:2], (x, y))
            if d >= DIP: continue
            e = d / DIP; e = e * e * (3 - 2 * e)
            want = head + (o["z"][i] - head) * e
            if (want < o["z"][i]) if down else (want > o["z"][i]): o["z"][i] = want; n += 1
    return n


# 2d. a road or path crossing the canal is a bridge over it (Overture rarely marks them), with
# headroom for a boat; unless the canal is in a tunnel there (it passes under the road)
CANAL_HEAD = 2.6     # metres of air over the water under a canal bridge
canal_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "maps", f"{A.id}-canal.json")
canal_runs = []
if os.path.exists(canal_file):
    for run in json.load(open(canal_file))["runs"]:
        pts = run["p"]
        for i in range(len(pts) - 1):
            if (pts[i][6] | pts[i + 1][6]) & 1: continue
            canal_runs.append((shapely.LineString([pts[i][:2], pts[i + 1][:2]]), run["lv"], max(pts[i][2], pts[i + 1][2])))
canal_tree = shapely.STRtree([c[0] for c in canal_runs])
over_canal = 0
for k, r in enumerate(pending):
    run, z = r["run"], r["z"]
    for j in canal_tree.query(road_lines[k]):
        seg, lv, half = canal_runs[int(j)]
        if not road_lines[k].crosses(seg): continue
        x = road_lines[k].intersection(seg); x = x.geoms[0] if hasattr(x, "geoms") else x
        if x.geom_type != "Point": continue
        deck = lv + CANAL_HEAD + 0.6
        reach = half + 6.0      # the water and the towpath either side
        # the road, and the roads joining it on the approaches, rise to the deck; then the span
        ease_roads(x.x, x.y, deck, set(), down=False, own=k)
        for i, q in enumerate(run):
            if math.dist(q[:2], (x.x, x.y)) < reach: r["span"].add(i); r.setdefault("solid", set()).add(i); over_canal += 1
if over_canal: print(f"bridges: {over_canal} road points carried over the canal")

# 3. what passes under a road's bridge passes under it
dipped = 0
dips = []     # (road index, crossing point): the roads dipped under a bridge, for the ground to follow them
for k, r in enumerate(pending):
    if not r["span"]: continue
    run, z = r["run"], r["z"]
    for st in stretches(r["span"]):
        a, b, line = span_line(r, st)
        solid = st[0] in r.get("solid", set()) or line.length >= 20
        if r["c"] in PATHS: solid = line.length >= VIADUCT
        if not solid: continue
        for j in road_tree.query(line):
            j = int(j)
            x = crossing(k, j, line)
            if x is None: continue
            o = pending[j]
            # a bridge or a deck itself here: leave it be
            if any(math.dist(o["run"][i][:2], (x.x, x.y)) < 10 for i in o["span"] | o["deck"]): continue
            # a path meeting a road's short span at its level crosses on the deck, it doesn't go under
            if o["c"] in PATHS and line.length < VIADUCT and st[0] not in r.get("solid", set()): continue
            dips.append((j, x))
            t = line.project(x) / (line.length or 1) * (b - a)
            lo = a + min(b - a - 1, int(t)); f = t - (lo - a)
            deck = z[lo] + (z[lo + 1] - z[lo]) * f
            head = deck - (CLEAR_PATH if o["c"] in PATHS else CLEAR_ROAD)
            # the road under, and the roads joining it there, dip together
            dipped += ease_roads(x.x, x.y, head, {k})
# 3b. and under the railway's bridges and viaducts (tools/railway.py marks them)
for t, track in enumerate(rail_tracks):
    tp = track["p"]
    k = 0
    while k < len(tp):
        if tp[k][3] != 1: k += 1; continue
        e = k
        while e + 1 < len(tp) and tp[e + 1][3] == 1: e += 1
        if e > k:
            seg = shapely.LineString([q[:2] for q in tp[k:e + 1]])
            for j in road_tree.query(seg):
                j = int(j); o = pending[j]
                if not road_lines[j].crosses(seg): continue
                x = road_lines[j].intersection(seg); x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point": continue
                if any(math.dist(o["run"][i][:2], (x.x, x.y)) < 10 for i in o["span"] | o["deck"]): continue
                kk = min(range(k, e + 1), key=lambda kk: math.dist(tp[kk][:2], (x.x, x.y)))
                head = tp[kk][2] - 0.9 - (CLEAR_PATH if o["c"] in PATHS else CLEAR_ROAD)
                dipped += ease_roads(x.x, x.y, head, set())
                dips.append((j, x))
        k = e + 1
if dipped: print(f"bridges: {dipped} road points dipped to pass under a bridge")

# 4. a path through the water (the data has no bridge) is a footbridge: its points well inside a
# pond or river are a span, just above the water
afloat = 0
for r in pending:
    if r["c"] not in PATHS: continue
    pl = shapely.LineString([q[:2] for q in r["run"]])
    for w in water_tree.query(pl):
        poly = water_polys[int(w)]
        if not poly.intersects(pl): continue
        near = poly.intersection(BM.buffer(200))     # (a river's polygon runs far past the terrain loaded here)
        ring = max(getattr(near, "geoms", [near]), key=lambda g: g.area if g.geom_type == "Polygon" else 0, default=None)
        if ring is None or ring.geom_type != "Polygon": continue
        wz = min(elev(x, y) for x, y in ring.exterior.coords[::max(1, len(ring.exterior.coords) // 40)]) + 0.1
        for i, q in enumerate(r["run"]):
            pt = shapely.Point(q[:2])
            if poly.contains(pt) and poly.exterior.distance(pt) > 1.5 and i not in r["deck"]:
                r["span"].add(i); r["z"][i] = max(r["z"][i], wz + 0.8); afloat += 1
if afloat: print(f"bridges: {afloat} path points over water carried as footbridges")

# the ground under every span is nobody's to flatten, except where a road dips under it; and
# where the survey has a hump under a span (the bridge filled in), it's cut down below the deck
PROTECT = np.zeros(grid.shape, dtype=bool)
for r in pending:
    if not r["span"]: continue
    half = RW.get(r["c"], 4) / 2 + (1.7 if r["c"] in KERBED_RD else 0.3) + 1.0
    for st in stretches(r["span"]):
        if len(st) < 4: continue
        inner = st[1:-1]
        line = shapely.LineString([r["run"][i][:2] for i in inner])
        poly = line.buffer(half, cap_style=2)
        win, inn = cover_xy(poly)
        PROTECT[win][inn] = True
        zs = [r["z"][i] for i in inner]
        px, py = GX[win][inn], GY[win][inn]
        if len(px):
            tt = np.array([line.project(shapely.Point(x, y)) for x, y in zip(px, py)]) / (line.length or 1) * (len(zs) - 1)
            lo = np.clip(tt.astype(int), 0, len(zs) - 2); fr = tt - lo
            deck = np.array(zs)[lo] + (np.array(zs)[lo + 1] - np.array(zs)[lo]) * fr
            blk = grid[win]; blk[inn] = np.minimum(blk[inn], deck - 0.6); grid[win] = blk
# (but every road at grade keeps its own ground, under a bridge or beside its abutments)
for o in pending:
    pts = [q[:2] for i, q in enumerate(o["run"]) if i not in o["span"] and i not in o["deck"]]
    if len(pts) < 2: continue
    for st in stretches({i for i in range(len(o["run"])) if i not in o["span"] and i not in o["deck"]}):
        if len(st) < 2: continue
        poly = shapely.LineString([o["run"][i][:2] for i in st]).buffer(RW.get(o["c"], 4) / 2 + 2.5, cap_style=2)
        win, inn = cover_xy(poly)
        PROTECT[win][inn] = False

for r in pending:
    c, run, z, span, bored, tunnel_ranges = r["c"], r["run"], r["z"], r["span"], r["bored"], r["tunnel_ranges"]
    deck = r.get("deck", set())
    if bored or tunnel_ranges:
        flatten(run, z, TN.HALF + TN.CUT if bored else max(TN.HALF + TN.CUT, RW.get(c, 4) / 2 + 2.5), TN.cuttings(run, tunnel_ranges, bored))
    if c in PATHS: continue
    # the ground is flattened under the road, but not under a bridge's span: what it
    # crosses (the river, the railway, another road) keeps its own ground, and the game
    # builds the deck, its parapets and its abutments at the road's own height
    open_pts = {i for i in range(len(run)) if i not in span and i not in deck}
    if bored: open_pts &= {i for i0, i1 in TN.split(run, bored) for i in range(i0, i1 + 1)}
    flatten(run, z, RW.get(c, 4) / 2 + 2.5, None if len(open_pts) == len(run) else open_pts)
# the railway (tools/railway.py, <map>-rail.json): the ground is flattened under the track where it
# runs on the ground, as under a road, so it sits in its cuttings and on its embankments rather
# than through the hillside; not under its bridges and viaducts, nor over its tunnels
RAIL_HALF = 4.5
rail_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "maps", f"{A.id}-rail.json")
if os.path.exists(rail_file):
    rail_runs = 0
    for t in json.load(open(rail_file))["tracks"]:
        run, z = [], []
        def rail_flush():
            global rail_runs
            if len(run) > 1: flatten(run, z, RAIL_HALF); rail_runs += 1
        for q in t["p"]:
            if q[3] == 0 and X0 - 60 <= q[0] <= X1 + 60 and Y0 - 60 <= q[1] <= Y1 + 60:
                run.append([q[0], q[1], 0]); z.append(q[2])
            else:
                rail_flush(); run, z = [], []
        rail_flush()
    if rail_runs: print(f"railway: the ground flattened under {rail_runs} stretches of track")
if tunnel_list:
    print("tunnels: " + ", ".join(f"{t['n'] or t['c']} {sum(math.dist(a[:2], b[:2]) for a, b in zip(t['p'], t['p'][1:])):.0f} m"
                                  for t in tunnel_list))
# blend: fully flat on the carriageway and its verge, then easing back to the natural ground
# over a distance that grows with the drop or rise, so a road in a cutting or on an embankment
# gets a slope beside it rather than a step
ease = np.clip(np.abs(grid - flat_z) * SLOPE, 2.5, EASE)
k = np.clip((flat_w - flat_f) / ease, 0, 1)
k = k * k * (3 - 2 * k)
k[np.isinf(flat_w)] = 1
grid = flat_z * (1 - k) + grid * k


def gelev0(x, y):
    fi, fj = (x - X0) / dx, (y - Y0) / dy
    i, j = min(nx - 2, max(0, int(fi))), min(ny - 2, max(0, int(fj)))
    u, v = min(1, max(0, fi - i)), min(1, max(0, fj - j))
    return (grid[j, i] * (1 - u) + grid[j, i + 1] * u) * (1 - v) + (grid[j + 1, i] * (1 - u) + grid[j + 1, i + 1] * u) * v


# a span's marks run to where the deck meets the ground as it now is, so the game's deck reaches
# the banks rather than stopping short with a step down; then the roads are written out
grown = 0
for r in pending:
    if not r["span"]: continue
    run, z, n = r["run"], r["z"], len(r["run"])
    for st in stretches(set(r["span"])):
        a, b = st[0], st[-1]
        while a > 0 and a - 1 not in r["deck"] and z[a - 1] - gelev0(run[a - 1][0], run[a - 1][1]) > 0.3: a -= 1; r["span"].add(a); grown += 1
        while b < n - 1 and b + 1 not in r["deck"] and z[b + 1] - gelev0(run[b + 1][0], run[b + 1][1]) > 0.3: b += 1; r["span"].add(b); grown += 1
for r in pending:
    if not r["deck"]: continue
    run, z, n = r["run"], r["z"], len(r["run"])
    for st in stretches(set(r["deck"])):
        a, b = st[0], st[-1]
        while a > 0 and a - 1 not in r["span"] and z[a - 1] - gelev0(run[a - 1][0], run[a - 1][1]) > 0.3: a -= 1; r["deck"].add(a); grown += 1
        while b < n - 1 and b + 1 not in r["span"] and z[b + 1] - gelev0(run[b + 1][0], run[b + 1][1]) > 0.3: b += 1; r["deck"].add(b); grown += 1
if grown: print(f"bridges: spans run {grown} points further to where their decks meet the ground")
for r in pending:
    c, run, z, span, bored, deck = r["c"], r["run"], r["z"], r["span"], r["bored"], r.get("deck", set())
    # a bridge's points carry a fourth value: 1 on a span the game builds the bridge for, 2 on
    # a deck beside a road's span (a path along a bridge), at the road's height, with nothing built
    pts = [[r1(a), r1(b), r1(h)] + ([1] if i in span else [2] if i in deck else []) for i, ((a, b, _), h) in enumerate(zip(run, z))]
    for i0, i1 in TN.split(run, bored):
        roads.append(dict(c=c, n=r["n"], p=pts[i0:i1 + 1], **({"ow": r["ow"]} if r["ow"] else {})))
    for i0, i1 in bored:
        tunnel_list.append(dict(c=c, n=r["n"], p=pts[i0:i1 + 1]))
del pending
z0 = math.floor(grid.min()) if TILE is None else CT["z0"]     # tiles share the detailed map's z0


def gelev(x, y):
    """Bilinear height of the (road-flattened) terrain grid, as the game sees it."""
    fi, fj = (x - X0) / dx, (y - Y0) / dy
    i, j = min(nx - 2, max(0, int(fi))), min(ny - 2, max(0, int(fj)))
    u, v = fi - i, fj - j
    return (grid[j, i] * (1 - u) + grid[j, i + 1] * u) * (1 - v) + (grid[j + 1, i] * (1 - u) + grid[j + 1, i + 1] * u) * v


def dense_ring(pts):
    """A ring's corners, with points added every 4 m or so along each side."""
    dense = []
    for (a, b), (cc, d) in zip(pts, pts[1:] + pts[:1]):
        n = max(1, int(math.hypot(cc - a, d - b) // 4))
        dense += [(a + (cc - a) * s / n, b + (d - b) * s / n) for s in range(n)]
    return dense


if TILE is not None:
    # ---- a tile's water: cut into the tile and its eight neighbours -------------------------
    # Each piece lies at the lowest ground round its own edge and the ground under it is dug out
    # below that. Every tile works out the same pieces round its edges, so a river bed meets its
    # neighbour's exactly; only this tile's own pieces are written to the map.
    def tile_box(a, b):
        return box(lat_x(a * CELLS), lat_y(b * CELLS), lat_x((a + 1) * CELLS), lat_y((b + 1) * CELLS))
    near_boxes = [((a, b), tile_box(a, b)) for a in (ti - 1, ti, ti + 1) for b in (tj - 1, tj, tj + 1)
                  if not (0 <= a <= 2 and 0 <= b <= 2)]          # the detailed map has its own
    wp, water_all, banks = [], [], []
    # the canal's water is at the levels tools/canal.py worked out (the map's own canal pieces are
    # left out by the game, which draws the canal from that file), so its bed and banks are dug
    # and sloped to those, not to the lowest bank of a piece that might run through a flight of locks
    canal_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "maps", f"{A.id}-canal.json")
    canal_lv = None
    if os.path.exists(canal_file):
        cpts, clv = [], []
        for run in json.load(open(canal_file))["runs"]:
            for q in run["p"]: cpts.append((q[0], q[1])); clv.append(run["lv"])
        if cpts:
            ctree, clv = shapely.STRtree(shapely.points(np.array(cpts))), np.array(clv)
            canal_lv = lambda xs, ys: clv[ctree.nearest(shapely.points(np.column_stack([np.ravel(xs), np.ravel(ys)])))].reshape(np.shape(xs))
            cin = np.array([bool(f & 1) for run in json.load(open(canal_file))["runs"] for f in (q[6] for q in run["p"])])
            canal_in_tunnel = lambda xs, ys: cin[ctree.nearest(shapely.points(np.column_stack([np.ravel(xs), np.ravel(ys)])))].reshape(np.shape(xs))
            chalf = np.array([q[2] for run in json.load(open(canal_file))["runs"] for q in run["p"]])
            cxy = np.array(cpts)
            def canal_bed(xs, ys):
                """Is each point within the canal's own water (the run's half width, which canal.ts draws)?"""
                pts = shapely.points(np.column_stack([np.ravel(xs), np.ravel(ys)]))
                near = ctree.nearest(pts)
                d = np.hypot(np.ravel(xs) - cxy[near, 0], np.ravel(ys) - cxy[near, 1])
                return (d <= chalf[near] + 0.8).reshape(np.shape(xs))
    for g, p in L("water"):
        if p.get("class") == "sea" or not g.geom_type.endswith("Polygon"): continue
        is_canal = p.get("class") == "canal" and canal_lv is not None
        whole = transform(proj, g)
        if not whole.intersects(BM): continue
        if not whole.is_valid: whole = shapely.make_valid(whole)
        for at, q in near_boxes:
            if not whole.intersects(q): continue
            piece = whole.intersection(q)
            for poly in getattr(piece, "geoms", [piece]):
                if poly.geom_type != "Polygon" or poly.area <= 0: continue
                rings = [dense_ring(list(ring.coords)[:-1]) for ring in [poly.exterior, *poly.interiors]]
                wz = min(elev(x, y) for x, y in rings[0]) + 0.1
                entry = dict(r=[[[r1(x), r1(y)] for x, y in ring] for ring in rings], z=r1(wz), **({"c": "canal"} if is_canal else {}))
                water_all.append(entry)
                if at == TILE: wp.append(entry)
                if poly.intersects(BM):
                    # lidar over water is noisy and rarely below the banks: give the water a bed so it shows
                    win, wet = cover_xy(poly, edge=True)
                    wet &= ~flat_in[win]       # (never under a road at grade, or the railway: only under a bridge's span)
                    if is_canal:
                        # the bed, only as wide as the canal's own water: the rest of the piece is bank
                        lv = canal_lv(GX[win][wet], GY[win][wet])
                        bed = canal_bed(GX[win][wet], GY[win][wet]) & ~canal_in_tunnel(GX[win][wet], GY[win][wet])
                        blk = grid[win]; blk[wet] = np.where(bed, np.minimum(blk[wet], lv - 1.0), np.maximum(blk[wet], lv + 0.3)); grid[win] = blk
                    else:
                        grid[win][wet] = np.minimum(grid[win][wet], wz - 0.6)
                    banks.append((poly, None if is_canal else wz))
    # the banks: the ground within BANK metres of the water's edge slopes down to just above it,
    # instead of standing where the survey (which is noisy by water) left it, a cliff's drop
    # above; a road's flattened ground is left alone, so a road along the river stays up
    for poly, wz in banks:
        edge = poly.exterior
        x0, y0, x1, y1 = poly.bounds
        i0, i1 = max(0, int((x0 - BANK - X0) / dx)), min(nx - 1, int((x1 + BANK - X0) / dx) + 1)
        j0, j1 = max(0, int((y0 - BANK - Y0) / dy)), min(ny - 1, int((y1 + BANK - Y0) / dy) + 1)
        if i1 < i0 or j1 < j0: continue
        win = (slice(j0, j1 + 1), slice(i0, i1 + 1))
        px, py = GX[win], GY[win]
        near = ~shapely.contains_xy(poly, px, py) & (flat_w[win] > flat_f[win] + 0.5)     # (not a road's flattened ground)
        if not near.any(): continue
        d = shapely.distance(edge, shapely.points(px[near], py[near]))
        s = np.clip(d / BANK, 0, 1); s = s * s * (3 - 2 * s)
        lip = (canal_lv(px[near], py[near]) if wz is None else wz) + 0.3
        want = lip + (grid[win][near] - lip) * s
        blk = grid[win]
        blk[near] = np.minimum(blk[near], want)
        grid[win] = blk
    # where the tile meets the detailed map, the ground is the detailed map's own
    core_h = np.asarray(CT["h"], dtype=float).reshape(CT["ny"], CT["nx"]) / 10 + CT["z0"]
    core_k = (np.frombuffer(CT["k"].encode(), dtype=np.uint8) - 48).reshape(CT["ny"], CT["nx"])
    ii, jj = np.arange(gi0, gi0 + nx), np.arange(gj0, gj0 + ny)
    ci, cj = (ii >= 0) & (ii < CT["nx"]), (jj >= 0) & (jj < CT["ny"])
    on_core = ci.any() and cj.any()
    if on_core:
        grid[np.ix_(cj, ci)] = core_h[np.ix_(jj[cj], ii[ci])]
    # from here on only the roads near the tile count (the rest were for the terrain)
    reach = box(X0 - 100, Y0 - 100, X1 + 100, Y1 + 100)
    roads = [r for r in roads if len(r["p"]) > 1 and shapely.LineString([q[:2] for q in r["p"]]).intersects(reach)]


# ---- ground types per terrain vertex ------------------------------------------
# 0 garden/grass, 1 pitch (and golf greens), 2 wood floor, 3 farmland/meadow, 4 cemetery,
# 5 hard standing (school, parking, retail), 6 flowerbed, 7 playground
GT = np.zeros(grid.shape, dtype=np.int8)
layers = []
for g, p in L("land_use"):
    c = p.get("class")
    t = {"pitch": 1, "green": 1, "tee": 1, "farmland": 3, "meadow": 3, "cemetery": 4, "retail": 5, "pedestrian": 5,
         "flowerbed": 6, "playground": 7}.get(c)
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
        win, inn = cover_xy(poly)
        GT[win][inn] = t
if TILE is not None and on_core:
    GT[np.ix_(cj, ci)] = core_k[np.ix_(jj[cj], ii[ci])]

# ---- buildings ----------------------------------------------------------------
from buildings import classify

ROOF_RISE_TOP = 0.6   # how much of the roof counts as solid for bullets and collision
cand = []
if TILE is not None:
    # buildings this far past the margin are classed too, so a terrace that runs over the edge is
    # one terrace, the same from both sides; the part of a building inside the detailed map is its
    WORK = box(X0 - 150, Y0 - 150, X1 + 150, Y1 + 150)

    def building_polys(g):
        out = []
        for poly in whole_polys(g, WORK):
            if poly.intersects(CORE):
                rest = poly.difference(CORE)
                out += [q for q in getattr(rest, "geoms", [rest]) if q.geom_type == "Polygon" and q.area > 0]
            else:
                out.append(poly)
        return out
for g, p in L("building"):
    for poly in (polys(g) if TILE is None else building_polys(g)):
        if TILE is not None:
            c = poly.centroid
            if CORE.contains(c): c = poly.representative_point()    # (a piece wrapped round the detailed map's corner)
            p = dict(p, _own=own(c.x, c.y))      # whole, in the tile holding its middle
        poly = poly.simplify(0.25)
        if poly.area < 6 or poly.geom_type != "Polygon": continue
        cand.append((poly, p))
# buildings whose roofs stand at different levels in the lidar (a mansion between lower links
# and wings, a house with a single-storey extension) are split where the levels change, and big
# irregular buildings (Prior Park, the schools) become rectangular wings, each with a roof of its own
from buildings import roof_parts, wings
try:
    from lidar import Lidar
    lidar = Lidar(os.path.join(src_dir, "lidar"), (lon0, lat0, kx, ky))
except Exception as e:
    lidar = None
    print("no lidar data:", e)
split, levels = [], 0
for poly, p in cand:
    church = (p.get("class") in ("church", "chapel") or "Chapel" in name(p) or name(p) == "Holy Trinity")
    parts = [poly]
    if lidar is not None and poly.area > 80:
        parts = roof_parts(poly, lidar.surface, lidar.ground)
        levels += len(parts) - 1
    if not church:
        parts = [w for part in parts for w in (wings(part) if part.area > 400 else [part])]
    if len(parts) > 1:
        split += [(w, dict(p, _whole=poly.area, _whole_geom=poly)) for w in parts]
    else:
        split.append((poly, p))
print(f"split buildings: {levels} more parts where roof levels change")
print(f"split buildings: {len(split) - len(cand)} more footprints in all")
cand = split

# tree canopy heights (Meta / WRI), for trees, hedges and shrubs, and for spotting trees over roofs
canopy = None
canopy_grid = None
try:
    from canopy import Canopy
    canopy = Canopy(os.path.join(src_dir, "canopy"), A.bbox if TILE is None else (W - 0.0003, S - 0.0002, E + 0.0003, N + 0.0002),
                    (lon0, lat0, kx, ky))
    canopy.aligned = TILE is not None
except Exception as e:
    print("no canopy data:", e)

# real heights and roof shapes from Environment Agency lidar, where the tiles are present
measured = None
try:
    if lidar is None: raise FileNotFoundError("no lidar tiles")
    measured = [lidar.measure(c[0], canopy.at if canopy is not None else None) for c in cand]
    print(f"lidar: measured {sum(1 for x in measured if x)} of {len(cand)} buildings "
          f"({sum(1 for x in measured if x and x['flat'])} flat, {sum(1 for x in measured if x and x['hipped'])} hipped)")
except Exception as e:
    print("no lidar data:", e)
# wall materials from energy certificates, where the data is present (see tools/epc.py)
certs = None
try:
    import epc
    homes = epc.load(os.path.join(src_dir, "epc"), A.bbox, proj)
    certs = epc.per_building(homes, [c[0] for c in cand])
    print(f"epc: {len(homes)} addresses, {sum(1 for c in certs if c)} buildings, "
          f"{sum(1 for c in certs if c and c['wall'])} with a known wall, {sum(1 for c in certs if c and c['bungalow'])} bungalows")
except FileNotFoundError as e:
    print("no EPC data:", e)
# a tile's random choices come from where each building stands (see buildings.classify)
keys = None
if TILE is not None:
    keys = [(lambda c: zlib.crc32(f"{c.x:.1f},{c.y:.1f}".encode()))(poly.centroid) for poly, _ in cand]
info = classify([c[0] for c in cand], [c[1] for c in cand], rnd, A.zones, A.default_zone, measured, certs, keys)
if TILE is not None:
    # the buildings past the margin were only there to be classed
    near_m = [i for i, c in enumerate(cand) if c[0].intersects(BM)]
    cand, info, keys = [cand[i] for i in near_m], [info[i] for i in near_m], [keys[i] for i in near_m]
# tree heights from the lidar too, now the roofs under trees have been measured against the Meta map
if canopy is not None and lidar is not None:
    canopy.refine(lidar, [c[0] for c in cand])
    print("canopy: tree heights from lidar")
# hand-made landmarks from the map's own pack, if it has one (see tools/landmarks): it may stand a
# landmark in place of a building part (a portico the lidar shows as a low block on the front)
import landmarks
from types import SimpleNamespace
pack = landmarks.load(A.id if TILE is None else A.id + "-bath")   # never the detailed map's pack for a tile
ctx = SimpleNamespace(
    buildings=[dict(poly=c[0], whole=c[1].get("_whole_geom", c[0]), name=name(c[1]), props=c[1], eaves=b["eaves"], ridge=b["eaves"] + (b["roof"]["rise"] if b["roof"] else 0))
               for c, b in zip(cand, info)],
    places=L("place"), proj=proj, gelev=gelev)
gone = landmarks.replaced(pack, ctx)
if gone:
    cand = [c for i, c in enumerate(cand) if i not in gone]
    info = [b for i, b in enumerate(info) if i not in gone]
    if keys is not None: keys = [k for i, k in enumerate(keys) if i not in gone]
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
    if b["parapet"]:
        out["pp"] = b["parapet"]
    if b["storeys"]:
        out["st"] = b["storeys"]
    blds.append(out)
    footprints.append(poly)

# ---- gardens: plot boundaries, gates and drives ---------------------------------
from gardens import plots
KERBED = {"primary", "secondary", "tertiary", "residential", "unclassified"}
corridor = [shapely.LineString([(a, b) for a, b, *_ in r["p"]]).buffer(
    RW.get(r["c"], 4) / 2 + (1.7 if r["c"] in KERBED else 0.3), cap_style=2)
    for r in roads if len(r["p"]) > 1]
OPEN = {"park", "recreation_ground", "pitch", "playground", "grass", "cemetery", "village_green", "common", "meadow"}
open_land = [poly for g, p in L("land_use") if p.get("class") in OPEN for poly in polys(g)]
front, side, gates, drives = plots([c[0] for c in cand], info, corridor, BM.bounds, rnd, open_land, keys)
garden_br = []
for style, line in front + side:
    n = max(1, int(math.ceil(line.length / 2.5)))
    pts = [line.interpolate(k / n, normalized=True) for k in range(n + 1)]
    garden_br.append(dict(c=style, p=[[r1(q.x), r1(q.y), r1(gelev(q.x, q.y))] for q in pts]))
gate_list = [[r1(x0), r1(y0), r1(x1), r1(y1), r1(gelev((x0 + x1) / 2, (y0 + y1) / 2)), st] for x0, y0, x1, y1, st in gates]

# ---- sports pitches: football and rugby pitches and cricket fields ----------------------
from pitches import pitches
pitch_list = pitches(L("land_use"), polys if TILE is None else whole_polys)   # a tile's whole, by their middle

# ---- named places, for telling players where they are off the streets ------------------------
WIDE = {"protected_landscape_seascape", "wilderness_area", "species_management_area"}
places = []
for f in ("land_use", "water"):
    for g, p in L(f):
        n = name(p)
        if not n or p.get("class") in WIDE or p.get("class") == "sea" or not g.geom_type.endswith("Polygon"): continue
        for poly in polys(g):
            if not 300 < poly.area < 600000: continue
            ring = list(poly.simplify(2.0).exterior.coords)[:-1]
            if len(ring) >= 3: places.append((poly.area, dict(n=n, r=[[r1(x), r1(y)] for x, y in ring])))
if TILE is not None:
    # a tile's: judged by the whole place's size, then cut to the tile
    places = []
    for f in ("land_use", "water"):
        for g, p in L(f):
            n = name(p)
            if not n or p.get("class") in WIDE or p.get("class") == "sea" or not g.geom_type.endswith("Polygon"): continue
            for poly in whole_polys(g, TBOX):
                if not 300 < poly.area < 600000: continue
                cut = poly.intersection(TBOX)
                for piece in getattr(cut, "geoms", [cut]):
                    if piece.geom_type != "Polygon" or piece.area < 1: continue
                    ring = list(piece.simplify(2.0).exterior.coords)[:-1]
                    if len(ring) >= 3: places.append((poly.area, dict(n=n, r=[[r1(x), r1(y)] for x, y in ring])))
places = [p for _, p in sorted(places, key=lambda t: t[0])]   # smallest first, so the most specific wins

# ---- water --------------------------------------------------------------------
if TILE is None: wp = []     # (a tile's ponds and rivers were done with its terrain)
wl = []
for g, p in L("water"):
    if p.get("class") == "sea": continue
    if g.geom_type.endswith("Polygon"):
        if TILE is not None: continue
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
            # lidar over water is noisy and rarely below the banks: give the water a bed so it shows
            wet = shapely.contains_xy(poly, GX, GY)
            grid[wet] = np.minimum(grid[wet], wz - 0.6)
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
trees = []
if canopy is not None:
    # a street's hard surface: its carriageway, and its pavements where it has kerbs (as drawn in
    # web/src/world.ts)
    KERBED, PAVE = {"primary", "secondary", "tertiary", "residential", "unclassified"}, 1.7
    street_lines = [(shapely.LineString([(a, b) for a, b, *_ in r["p"]]), RW.get(r["c"], 3) / 2 + (PAVE if r["c"] in KERBED else 0))
                    for r in roads if len(r["p"]) > 1 and r["c"] not in PATHS]
    street_tree = shapely.STRtree([l.buffer(w + 0.3) for l, w in street_lines])
    houses = shapely.STRtree([f.buffer(0.6) for f in footprints])
    tops = canopy.tree_tops(min_height=3.5, radius_m=3.0)
    for (x, y, h) in tops:
        if not inside(x, y): continue
        # a street tree's crown hangs over the road: stand its trunk on the verge instead
        for k in street_tree.query(shapely.Point(x, y), predicate="intersects"):
            line, w = street_lines[int(k)]
            s = line.project(shapely.Point(x, y))
            c = line.interpolate(s)
            p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
            ex, ey = p1.x - p0.x, p1.y - p0.y      # not dx/dy: those are the terrain grid spacing
            l = math.hypot(ex, ey) or 1
            side = 1 if (x - c.x) * -ey + (y - c.y) * ex >= 0 else -1
            x, y = c.x - ey / l * (w + 0.8) * side, c.y + ex / l * (w + 0.8) * side
            break
        if len(houses.query(shapely.Point(x, y), predicate="intersects")): continue
        if len(street_tree.query(shapely.Point(x, y), predicate="intersects")): continue   # moved onto another street
        # the tree model is about 7.5 x its scale tall
        trees.append([r1(x), r1(y), r1(gelev(x, y)), round(min(2.6, max(0.35, h / 7.5)), 2)])
    # Woods are drawn as one continuous canopy with trunks underneath: a grid of canopy heights
    # over the woods (0 elsewhere), and trees inside woods are marked trunk-only.
    if woods:
        import base64
        wood_all = unary_union(woods).buffer(3)
        STEP_C = 4.0
        cx0, cy0, cx1, cy1 = wood_all.bounds
        cnx, cny = int((cx1 - cx0) / STEP_C) + 2, int((cy1 - cy0) / STEP_C) + 2
        GXc, GYc = np.meshgrid(cx0 + np.arange(cnx) * STEP_C, cy0 + np.arange(cny) * STEP_C)
        inw = shapely.contains_xy(wood_all, GXc, GYc)
        hc = np.zeros((cny, cnx), dtype=np.uint8)
        for j, i in zip(*np.nonzero(inw)):
            v = canopy.at(GXc[j, i], GYc[j, i])
            hc[j, i] = int(min(40, v)) if v >= 4 else 0
        canopy_grid = dict(x0=r1(cx0), y0=r1(cy0), step=STEP_C, nx=cnx, ny=cny,
                           h=base64.b64encode(hc.tobytes()).decode())
        if TILE is not None:
            # a tile's canopy cells are the terrain grid's cells, so its woods meet the next tile's
            # without a gap or an overlap: cell (i, j) of the tile is centred in terrain cell (i, j)
            canopy_grid = None
            wood_t = wood_all.intersection(TBOX)
            if not wood_t.is_empty:
                bx0, by0, bx1, by1 = wood_t.bounds
                ci0, cj0 = max(0, int((bx0 - TX0) / D)), max(0, int((by0 - TY0) / D))
                ci1, cj1 = min(CELLS - 1, int((bx1 - TX0) / D)), min(CELLS - 1, int((by1 - TY0) / D))
                cnx, cny = ci1 - ci0 + 1, cj1 - cj0 + 1
                cx = np.array([TX0 + (ci0 + i + 0.5) * D for i in range(cnx)])
                cy = np.array([TY0 + (cj0 + j + 0.5) * D for j in range(cny)])
                GXc, GYc = np.meshgrid(cx, cy)
                inw = shapely.contains_xy(wood_all, GXc, GYc)
                hc = np.zeros((cny, cnx), dtype=np.uint8)
                for j, i in zip(*np.nonzero(inw)):
                    v = canopy.at(GXc[j, i], GYc[j, i])
                    hc[j, i] = int(min(40, v)) if v >= 4 else 0
                if hc.any():
                    canopy_grid = dict(x0=float(cx[0]), y0=float(cy[0]), step=D, nx=cnx, ny=cny,
                                       h=base64.b64encode(hc.tobytes()).decode())
        in_wood = shapely.contains_xy(unary_union(woods), np.array([t[0] for t in trees]), np.array([t[1] for t in trees]))
        for t, w in zip(trees, in_wood):
            if w: t.append(1)
else:
    blocked = unary_union([f.buffer(2.5) for f in footprints] +
                          [shapely.LineString([(a, b) for a, b, *_ in r["p"]]).buffer(RW.get(r["c"], 3) / 2 + 1.5)
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
fx, marks = street_furniture(roads, L("infrastructure"), gate_list, RW, gelev, proj, inside, rnd, keyed=TILE is not None)

# ---- shop signs ----------------------------------------------------------------
from shops import businesses, shop_signs
found, shop_log = businesses(src_dir, A.bbox, proj, [c[0] for c in cand], info, L("place"), inside,
                             getattr(pack, "SIGN_NAMES", None), getattr(pack, "SIGN_SKIP", ()))
for line in shop_log: print("shops:", line)
src_count = {s: sum(1 for b in found if b["src"] == s) for s in ("osm", "fsa", "overture")}
print(f"shops: {len(found)} businesses ({', '.join(f'{n} {s}' for s, n in src_count.items() if n)})")
signs, pubs = shop_signs(found, [c[0] for c in cand], roads, gelev)
for bi in pubs:
    # pubs here are mid-19th-century ashlar with low hipped slate roofs (the Hadley Arms)
    b = blds[bi]
    b.update(m="s", rc="s")
    if "rr" in b:
        d = math.dist(b["rr"][1], b["rr"][2])
        b["hp"] = [round(d / 2, 1), round(d / 2, 1)]
        b["rp"] = round(b["rp"] * 0.75, 1)

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

# ---- front doors, garden shrubs, the Palladian Bridge -------------------------------
from landscape import front_doors, shrubs
bays = []
doors = front_doors([c[0] for c in cand], info, roads, gelev, rnd, bays, keys)
# (only round the middle of the detailed map, where everyone plays; a tile has them everywhere)
shrub_list = shrubs(canopy, footprints, roads, RW, inside, gelev, woods, reach=1060 if TILE is None else None)
ctx.water = wp if TILE is None else water_all
ctx.pitches = pitch_list
marks_lm = landmarks.place(pack, ctx)
from landscape import approaches
paths, drive_strips, extra_fx = approaches(gate_list, drives, doors, [c[0] for c in cand], gelev, rnd, keyed=TILE is not None)
fx += extra_fx
from landscape import telegraph
from buildings import zone_at
tpoles, twires = telegraph(roads, doors, lambda x, y: zone_at(A.zones, x, y, A.default_zone), gelev, rnd, keyed=TILE is not None)
fx += tpoles
# no parked car through a wall, a fence, a hedge or a building: a car the size the game draws it
# (web/src/map.ts) that touches one is left out
solid = shapely.STRtree([shapely.LineString([(x, y) for x, y, *_ in b["p"]]).buffer(0.15) for b in barriers if len(b["p"]) > 1]
                        + [shapely.Polygon(b["r"][0]) for b in blds])
def car_clear(f):
    x, y, a = f[1], f[2], f[4]
    ux, uy = math.cos(a), math.sin(a)
    box_ = shapely.Polygon([(x + ux * s_ * 2.05 - uy * t_ * 0.88, y + uy * s_ * 2.05 + ux * t_ * 0.88) for s_, t_ in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    return not len(solid.query(box_, predicate="intersects"))
n_fx = len(fx)
fx = [f for f in fx if f[0] != "car" or car_clear(f)]
print(f"cars: {n_fx - len(fx)} left out where they would stand in a wall or a building")

# ---- spawn area: a named green where everyone starts (Firs Field on Combe Down) ----------
spawn = None
for g, p in L("land_use"):
    if getattr(A, "spawn", None) and name(p) == A.spawn and TILE is None:
        for poly in polys(g):
            spawn = [[r1(x), r1(y)] for x, y in list(poly.simplify(0.5).exterior.coords)[:-1]]

out = dict(
    id=A.id, name=A.name, release=RELEASE, centre=A.centre, field=A.field, fc=list(A.field_centre), b=[r1(X0), r1(Y0), r1(X1), r1(Y1)],
    bk=1 if TILE is not None else 0,     # 1: the river banks slope down to the water already (a tile); the game does it otherwise
    v=list(A.view) if getattr(A, "view", None) else None,
    t=dict(nx=nx, ny=ny, x0=r1(X0), y0=r1(Y0), dx=round(dx, 4), dy=round(dy, 4), z0=z0,
           h=[int(round((v - z0) * 10)) for v in grid.ravel()],   # decimetres above z0, rows south -> north
           k="".join(str(int(v)) for v in GT.ravel())),
    bl=blds, rd=roads, wp=wp, wl=wl, br=barriers, gt=gate_list, tr=trees, spawn=spawn, fx=fx, mk=marks, sh=signs, lm=marks_lm, dr=doors, sb=shrub_list, cn=canopy_grid, pl=places, fp=paths, dv=drive_strips, by=bays, wr=twires, pi=pitch_list, tn=tunnel_list,
)
if TILE is not None:
    # ---- a tile keeps only what is its own -------------------------------------------------
    def clip_runs(pts, x0=TX0, y0=TY0, x1=TX1, y1=TY1):
        """The pieces of a line of [x, y, z] points inside the tile, cut where it crosses the edge."""
        out_, cur = [], []
        lerp = lambda a, b, t: [r1(a[k] + (b[k] - a[k]) * t) for k in range(3)] + ([a[3]] if len(a) > 3 and len(b) > 3 and a[3] == b[3] else [])
        for a, b in zip(pts, pts[1:]):
            t0, t1, ex, ey = 0.0, 1.0, b[0] - a[0], b[1] - a[1]
            for pp, qq in ((-ex, a[0] - x0), (ex, x1 - a[0]), (-ey, a[1] - y0), (ey, y1 - a[1])):
                if pp == 0:
                    if qq < 0: t0, t1 = 1.0, 0.0
                elif pp < 0: t0 = max(t0, qq / pp)
                else: t1 = min(t1, qq / pp)
            if t0 >= t1:
                if cur: out_.append(cur); cur = []
                continue
            pa, pb = (list(a) if t0 == 0 else lerp(a, b, t0)), (list(b) if t1 == 1 else lerp(a, b, t1))
            if cur and t0 == 0: cur.append(pb)
            else:
                if cur: out_.append(cur)
                cur = [pa, pb]
            if t1 < 1: out_.append(cur); cur = []
        if cur: out_.append(cur)
        return [q for q in out_ if len(q) > 1 and any(q[k][:2] != q[0][:2] for k in range(1, len(q)))]

    def cut_lines(lines):
        return [dict(ln, p=piece) for ln in lines for piece in clip_runs(ln["p"])]

    mid = lambda q, a, b: own((q[a] + q[b]) / 2, (q[a + 1] + q[b + 1]) / 2)    # a short piece, by its middle
    tbl = [(b, p) for b, (_, p) in zip(blds, cand)]
    blds = [b for b, p in tbl if p.get("_own")]
    out.update(
        b=[TX0, TY0, TX1, TY1], tile=[ti, tj], v=None, spawn=None,
        t=dict(nx=CELLS + 1, ny=CELLS + 1, x0=TX0, y0=TY0, dx=D, dy=D, z0=z0,
               h=[int(round((v - z0) * 10)) for v in grid[MARGIN:MARGIN + CELLS + 1, MARGIN:MARGIN + CELLS + 1].ravel()],
               k="".join(str(int(v)) for v in GT[MARGIN:MARGIN + CELLS + 1, MARGIN:MARGIN + CELLS + 1].ravel())),
        bl=blds, rd=cut_lines(roads), wp=wp, wl=cut_lines(wl), br=cut_lines(barriers), tn=cut_lines(tunnel_list),
        gt=[q for q in gate_list if mid(q, 0, 2)], mk=[q for q in marks if mid(q, 0, 2)], wr=[q for q in twires if mid(q, 0, 3)],
        fp=[q for q in paths if mid(q, 0, 2)], dv=[q for q in drive_strips if mid(q, 0, 2)],
        tr=[q for q in trees if own(q[0], q[1])], fx=[q for q in fx if own(q[1], q[2])], sh=[q for q in signs if own(q[0], q[1])],
        lm=[q for q in marks_lm if own(q[1], q[2])], dr=[q for q in doors if own(q[0], q[1])], sb=[q for q in shrub_list if own(q[0], q[1])],
        by=[q for q in bays if own(q[0], q[1])], pi=[q for q in pitch_list if own(q[1], q[2])],
        cn=canopy_grid, pl=places,
    )
    roads, wl, barriers, signs, doors, shrub_list, marks, trees, fx = (out[k] for k in ("rd", "wl", "br", "sh", "dr", "sb", "mk", "tr", "fx"))
    nx = ny = CELLS + 1
landmarks.clear(ctx, out)      # nothing growing or standing where a landmark stands
# ---- nothing grows or stands in the water ----------------------------------------------------
# (the canopy map sees trees overhanging a river or the canal as cover over the water)
wet_polys = [shapely.Polygon(w["r"][0], [tuple(map(tuple, h)) for h in w["r"][1:]]) for w in out["wp"] if len(w["r"][0]) >= 3]
if wet_polys:
    wet_tree = shapely.STRtree(wet_polys)
    def dry(x, y):
        pt = shapely.Point(x, y)
        return not any(wet_polys[int(k)].buffer(0.8).contains(pt) for k in wet_tree.query(pt.buffer(0.8)))
    before = (len(out["tr"]), len(out["sb"]), len(out["fx"]))
    out["tr"] = [q for q in out["tr"] if dry(q[0], q[1])]
    out["sb"] = [q for q in out["sb"] if dry(q[0], q[1])]
    out["fx"] = [q for q in out["fx"] if dry(q[1], q[2])]
    out["br"] = [b for b in out["br"] if len(b["p"]) > 1 and sum(1 for q in b["p"] if not dry(q[0], q[1])) < len(b["p"]) * 0.5]
    gone = (before[0] - len(out["tr"]), before[1] - len(out["sb"]), before[2] - len(out["fx"]))
    if any(gone): print(f"water: {gone[0]} trees, {gone[1]} shrubs and {gone[2]} street items taken out of the water")
json.dump(out, open(out_path, "w"), separators=(",", ":"))
print(f"terrain {nx}x{ny} @ {STEP} m, {grid.min():.1f}-{grid.max():.1f} m; {len(blds)} buildings "
      f"({sum('rr' in b for b in blds)} gabled), {len(roads)} road runs, {len(wp)} ponds, {len(wl)} streams, "
      f"{len(barriers)} wall/fence/hedge runs ({len(br)} mapped + {len(garden_br)} gardens, before path gaps), {len(gate_list)} gates, {len(fx)} street items, {len(signs)} shop signs, {len(doors)} doors, {len(shrub_list)} shrubs, {len(marks)} markings, {len(trees)} trees, {len(places)} places; {os.path.getsize(out_path) / 1e6:.1f} MB")
