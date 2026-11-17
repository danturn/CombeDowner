"""The buildings' outlines lined up with the lidar, before anything else is laid out round them.

Usage: python3 -I tools/register.py <map> [<raw dir>] [--only ti,tj ...] [--jobs n]
       measure afresh into data/<map>/measured/registered.json (with --only, just the buildings
       of those squares, the rest kept as they were)

The open data's outlines are often a metre or more off where the buildings really stand: in the
middle of Bath whole terraces are 2 m or so to one side of the survey, which leaves one pavement
twice the width of the other, and the survey's own building front standing out in the street,
where the canopy map takes it for a row of trees. The streets, paths and walls are the survey's
own frame (OpenStreetMap's street lines run down the middle of the survey's gaps between
buildings), so it is the buildings that move to the survey, by translation only:
- buildings that touch (within a party wall's width) are one block, and move together, so the
  walls they share stay shared;
- each block's fit is roofs.common.fit, as the roofs are read: the survey's drops to the ground on
  its outer walls and its raised surface filling it, for every shift up to REACH metres each way;
- a block moves on its own evidence where the best shift is at least LEAST metres and beats
  standing still by GAIN; but nearby blocks are mostly off by the same amount, so where the
  blocks round it (within FIELD metres) agree on a shift, a block takes theirs whenever it fits it
  about as well as its own (within TIE), and one whose own fit says little takes the area's shift
  if it fits that no worse than standing still. So a block with poor evidence doesn't jump on its
  own, and one that disagrees with its neighbours does so only on clear evidence.
- no block is moved onto more of a mapped street than it stood on (each street as wide as its tags
  or its kind make it, as the build starts it), beyond a strip ON_ROAD_DEPTH wide along its street
  fronts, and no two blocks a slit apart are moved so the
  slit opens into a way through.

What's kept is each moved building's shift (dx, dy, metres east and north), by its Overture id;
apply() moves the buildings layer by it wherever a tool reads it (prep_map.py, prep_wide.py, the
partition, the canal and the railway), and each moved building carries its shift as "shift", so
what was measured on its old outline (the roofs' faces) can follow it. Nothing here is decided
over the network.
"""
import hashlib, json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

REACH = 5.0         # metres: the furthest a block is moved
LEAST = 0.75        # metres: a smaller shift isn't worth making
GAIN = 0.5          # how much better than standing still a block's own fit must be to move it alone
STRONG = 2.5        # a fit this good (of 7: drops of up to 4 m at its walls, and 3 for raised surface all over it) is a clear sighting
OWN_AREA = 60.0     # square metres: a smaller block is too small to say where it is on its own
NEAR = 0.3          # fits this close to a block's best are as good as it
OWN_MARGIN = 0.5    # how much better a block's own shift must fit than its area's to go its own way
TIE = 0.15          # how much worse than standing still a block's area's shift may fit it and still be taken
FIELD = 150.0       # metres round a block whose blocks make the area's shift
FIELD_MIN = 4       # blocks the survey clearly shows that make an area's shift
PARTY = 0.6         # metres: buildings this close share a wall (roofs.common.PARTY)
EDGE = 0.03         # how much cleaner a block's own walls must sit on the survey's than its area's shift puts them, to go its own way
CLOSED = 1.5        # metres: a slit narrower than this between two blocks is no way through
OPEN_MOST = 2.0     # square metres of such a slit a shift may open into a way through
ON_ROAD = 1.0       # square metres more of a mapped street a shift may put a block on...
ON_ROAD_DEPTH = 0.3    # ...or this many metres in along the length of its street fronts, as a street's
                       # width is guessed to, but no corner a metre in: counted over its whole outline,
                       # a big block with yards inside it was let half a metre into a street
FRONT = 1.0         # metres: a block's outline this close to a mapped street is a street front
# a street's own width, where its record gives none (prep_map.py RW)
STREET_WIDTH = {"motorway": 14, "trunk": 12, "primary": 8.5, "secondary": 8, "tertiary": 7, "residential": 6,
                "unclassified": 5.5, "living_street": 5, "service": 3.5, "pedestrian": 4}
NOT_ROADS = {"footway", "steps", "track", "cycleway", "bridleway", "path", "elevator", "construction", "raceway", "escape"}


def street_width(q):
    """A mapped street's width as the build starts it, before anything stands beside it
    (roadwidth.py): its tag's, else its lanes', no wider than its kind's; else its kind's."""
    from roadwidth import _num
    kind = STREET_WIDTH.get((q.get("highway") or "").removesuffix("_link"), 4.0)
    w = _num(q.get("width")) or _num(q.get("est_width"))
    if w is None and _num(q.get("lanes")): w = 3.25 * _num(q["lanes"])
    return min(w, kind) if w and w > 1.0 else kind


def path(map_id):
    from mapdata import measured_dir
    return os.path.join(measured_dir(map_id), "registered.json")


def feature_key(f):
    """A building's key: its Overture id, or for a footprint without one its outline."""
    return f.get("id") or (f.get("properties") or {}).get("id") or \
        hashlib.sha1(json.dumps(f["geometry"], sort_keys=True).encode()).hexdigest()[:20]


_kept = {}


def shifts(map_id):
    """{building key: (dx, dy)} as measured, or {} where nothing is."""
    if map_id not in _kept:
        p = path(map_id)
        _kept[map_id] = {k: tuple(v) for k, v in json.load(open(p))["moved"].items()} if os.path.exists(p) else {}
    return _kept[map_id]


def digest(map_id):
    """What the shifts are, for a build to know when they've changed."""
    p = path(map_id)
    return hashlib.sha1(open(p, "rb").read()).hexdigest() if os.path.exists(p) else ""


def _moved(coords, ox, oy):
    if coords and isinstance(coords[0], (int, float)):
        return [coords[0] + ox, coords[1] + oy] + list(coords[2:])
    return [_moved(c, ox, oy) for c in coords]


def apply(map_id, feats):
    """The buildings layer's GeoJSON features (lon/lat) with each measured building moved."""
    got = shifts(map_id)
    if not got: return feats
    from area import area
    lon0, lat0 = area(map_id).centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    out = []
    for f in feats:
        s = got.get(feature_key(f))
        if s is None: out.append(f); continue
        g = dict(f["geometry"], coordinates=_moved(f["geometry"]["coordinates"], s[0] / kx, s[1] / ky))
        out.append(dict(f, geometry=g, properties=dict(f.get("properties") or {}, shift=[s[0], s[1]])))
    return out


# ---- measuring --------------------------------------------------------------------------------

def blocks(polys):
    """The buildings in groups that touch: lists of indices."""
    import shapely
    tree = shapely.STRtree(polys)
    parent = list(range(len(polys)))
    def root(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for i, p in enumerate(polys):
        for j in tree.query(p.buffer(PARTY)):
            j = int(j)
            if j > i and p.distance(polys[j]) <= PARTY: parent[root(i)] = root(j)
    out = {}
    for i in range(len(polys)): out.setdefault(root(i), []).append(i)
    return list(out.values())


_job = {}


def _fit_one(k):
    """A block's fit, and for each shift how cleanly its walls sit on the survey's and how much of
    a mapped street it would stand on."""
    from roofs.common import fit
    lidar, outline = _job["lidar"], _job["outlines"][k]
    try:
        scores, _ = fit(lidar, outline, (), reach=REACH)
        if scores is None: return None
        edges, onroad = _sides(lidar, outline, _job.get("roads"))
        return scores, edges, onroad
    except Exception:
        return None


def _sides(lidar, outline, roads):
    """For each shift (on the fit's half-metre grid): the share of the survey's solid raised surface
    in a band just outside the walls plus the share of open ground in a band just inside them (0 is
    walls exactly on the survey's), and the square metres of mapped street under the block."""
    import numpy as np
    import shapely
    px, n = 0.5, int(round(REACH / 0.5))
    x0, y0, x1, y1 = outline.bounds
    xs = np.arange(x0 - 3, x1 + 3, px); ys = np.arange(y0 - 3, y1 + 3, px)
    X, Y = np.meshgrid(xs, ys)
    out = shapely.contains_xy(outline.buffer(2.0).difference(outline), X, Y)
    inn = shapely.contains_xy(outline.difference(outline.buffer(-1.5)), X, Y)
    body = shapely.contains_xy(outline, X, Y)
    bx = np.arange(xs[0] - n * px, xs[-1] + n * px + px / 2, px)[:len(xs) + 2 * n]
    by = np.arange(ys[0] - n * px, ys[-1] + n * px + px / 2, px)[:len(ys) + 2 * n]
    BX, BY = np.meshgrid(bx, by)
    e, nn = lidar._bng(BX.ravel(), BY.ravel())
    f, g, l = (lidar._sample(w, e, nn).reshape(BX.shape) for w in ("dsm", "dtm", "last"))
    solid = ((f - g) > 2.5) & ((f - l) < 0.5)
    road = np.zeros(BX.shape, bool)
    if roads is not None:
        tree, geoms = roads
        near = [geoms[int(i)] for i in tree.query(shapely.box(bx[0], by[0], bx[-1], by[-1]))]
        if near: road = shapely.contains_xy(shapely.union_all(near), BX, BY)
    no, ni = max(1, out.sum()), max(1, inn.sum())
    edges, onroad = {}, {}
    for j in range(-n, n + 1):
        for i in range(-n, n + 1):
            win = (slice(n + j, n + j + len(ys)), slice(n + i, n + i + len(xs)))
            sw = solid[win]
            edges[(i * px, j * px)] = float((sw & out).sum() / no + (~sw & inn).sum() / ni)
            onroad[(i * px, j * px)] = float((road[win] & body).sum() * px * px)
    return edges, onroad


def roads_of(map_id, raw):
    """The mapped streets near the buildings, each as wide as it is (pedestrian streets too), as areas
    (an STRtree and its geometries): a block moved so its corner stood in one pinched its pavement to a point."""
    import numpy as np
    import shapely
    from shapely.geometry import shape
    from area import area
    p = os.path.join(raw, "osm-roads.geojson")
    if not os.path.exists(p): return None
    lon0, lat0 = area(map_id).centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    geoms = []
    for f in json.load(open(p))["features"]:
        q = f.get("properties") or {}
        h = q.get("highway")
        # (a road under a building, through its passage or in a tunnel, is no reason to keep it off)
        if h in NOT_ROADS or q.get("tunnel") or q.get("covered") or q.get("layer", "0") not in ("0", 0): continue
        try: g = shape(f["geometry"])
        except Exception: continue
        g = shapely.transform(g, lambda a: np.c_[(a[:, 0] - lon0) * kx, (a[:, 1] - lat0) * ky])
        geoms.append(g.buffer(street_width(q) / 2, cap_style="flat"))
    return (shapely.STRtree(geoms), geoms) if geoms else None


def street_front(outline, roads):
    """Metres of the block's outline along a mapped street."""
    import shapely
    if roads is None: return 0.0
    tree, geoms = roads
    near = [geoms[int(i)] for i in tree.query(outline.buffer(FRONT))]
    return float(outline.exterior.intersection(shapely.union_all(near).buffer(FRONT)).length) if near else 0.0


def opens(blk, shift, others):
    """How much of the slits narrower than CLOSED between this block and the others round it moving
    it by shift would open wider (m2): a courtyard behind Milsom Street, shut off by such slits,
    was joined to Broad Street through one and laid out as the street."""
    import shapely, shapely.affinity
    moved = shapely.affinity.translate(blk, *shift)
    near = [o for o in others if o.distance(blk) < CLOSED]
    if not near: return 0.0
    rest = shapely.union_all(near)
    slit = blk.buffer(CLOSED / 2).intersection(rest.buffer(CLOSED / 2)).difference(moved.buffer(CLOSED / 2))
    return slit.difference(blk).difference(rest).area


def keep_slits(todo, picked, fits, outlines, sizes, fronts):
    """The shifts with no slit opened into a way through between two blocks moved
    differently: of the two, the smaller takes the larger's shift where that fits it no worse than
    standing still (and puts it on no street), else stays, and the larger stays if that still opens it."""
    import shapely, shapely.affinity
    out = [list(p) for p in picked]
    at = {k: i for i, k in enumerate(todo)}
    otree = shapely.STRtree([outlines[k] for k in todo])
    zero = (0.0, 0.0)

    def fits_ok(i, s):
        f = fits[i]
        if f is None or s not in f[0]: return False
        room = max(ON_ROAD, ON_ROAD_DEPTH * fronts[i])
        return f[0][s] >= f[0][zero] - TIE and f[2][s] <= f[2][zero] + room

    def opened(i, j):
        si, sj = tuple(out[i][:2]), tuple(out[j][:2])
        if si == sj: return False
        a = shapely.affinity.translate(outlines[todo[i]], *sj)
        b = shapely.affinity.translate(outlines[todo[j]], *sj)
        rel = (si[0] - sj[0], si[1] - sj[1])
        return opens(a, rel, [b]) > OPEN_MOST
    for _ in range(3):
        changed = 0
        for i in sorted(range(len(todo)), key=lambda i: sizes[todo[i]]):
            for j in otree.query(outlines[todo[i]].buffer(CLOSED)).tolist():
                if j == i or not opened(i, j): continue
                small, big = (i, j) if sizes[todo[i]] <= sizes[todo[j]] else (j, i)
                want = tuple(out[big][:2])
                if fits_ok(small, want) and want != tuple(out[small][:2]):
                    out[small] = [want[0], want[1], "slit"]
                elif tuple(out[small][:2]) != zero:
                    out[small] = [0.0, 0.0, "slit"]
                if opened(i, j) and tuple(out[big][:2]) != zero:
                    out[big] = [0.0, 0.0, "slit"]
                changed += 1
        if not changed: break
    return [tuple(o) for o in out]


def decide(fits, centres, sizes, fronts=None):
    """Each block's shift from its own fit and its area's: [(dx, dy, why)]."""
    import numpy as np
    import shapely
    zero = (0.0, 0.0)
    # a block isn't moved further than REACH, nor onto a mapped street it wasn't on
    edges = [None if f is None else f[1] for f in fits]
    room = [max(ON_ROAD, ON_ROAD_DEPTH * (fronts[k] if fronts else 0.0)) for k in range(len(fits))]
    fits = [None if f is None else {s: v for s, v in f[0].items() if math.hypot(*s) <= REACH + 1e-9 and f[2][s] <= f[2][zero] + room[k]}
            for k, f in enumerate(fits)]
    top = [None if sc is None else max(sc.values()) for sc in fits]

    def choose(k, prior):
        # of the shifts that fit about as well as the best, the nearest the prior: along a terrace
        # the fit hardly changes, and it's the area that says how far along it the outline is off
        return min((s for s, v in fits[k].items() if v >= top[k] - NEAR), key=lambda s: (math.dist(s, prior), math.hypot(*s)))

    # blocks the survey clearly shows, big enough to say where they are: moved or not, each says
    # where the outlines round it are
    sure = [k for k, sc in enumerate(fits) if sc is not None and sizes[k] >= OWN_AREA and top[k] >= STRONG]
    pts = np.array(centres, float).reshape(-1, 2)
    tree = shapely.STRtree(shapely.points(pts[sure])) if sure else None
    near = [[] for _ in fits]
    if tree is not None:
        for k in range(len(fits)):
            near[k] = [sure[int(i)] for i in tree.query(shapely.Point(pts[k]).buffer(FIELD)) if sure[int(i)] != k]
    w = {k: math.sqrt(sizes[k]) for k in sure}

    def area_of(k, own):
        if len(near[k]) < FIELD_MIN: return None
        ws = np.array([w[c] for c in near[k]])
        def wmed(v):
            order = np.argsort(v); cw = np.cumsum(ws[order])
            return float(v[order][np.searchsorted(cw, cw[-1] / 2)])
        a = (round(wmed(np.array([own[c][0] for c in near[k]])) * 2) / 2, round(wmed(np.array([own[c][1] for c in near[k]])) * 2) / 2)
        return a if a in fits[k] else None

    # each sure block's shift, then again nearest its area's, so the terraces settle along their length
    own = {k: choose(k, zero) for k in sure}
    for _ in range(2):
        own = {k: choose(k, area_of(k, own) or zero) for k in sure}
    out = []
    for k, sc in enumerate(fits):
        if sc is None: out.append((0.0, 0.0, "unseen")); continue
        area = area_of(k, own)
        best = choose(k, area or zero)
        alone = sizes[k] >= OWN_AREA and top[k] >= STRONG and sc[best] - sc[zero] >= GAIN
        # of the shifts that fit about as well as its best, the one that sits its walls cleanest on the survey's
        walls = min((s for s, v in sc.items() if v >= top[k] - NEAR), key=edges[k].get)
        if alone and area is not None and walls != area and edges[k][area] - edges[k][walls] >= EDGE:
            # its walls sit plainly cleaner on the survey's at its own shift than at its area's:
            # a long terrace whose fronts the area's shift would leave standing in the street
            pick, why = walls, "own"
        elif area is not None and sc[area] >= top[k] - NEAR:
            pick, why = area, "area"
        elif alone and (area is None or sc[best] - sc[area] >= OWN_MARGIN):
            pick, why = best, "own"
        elif area is not None and sc[area] >= sc[zero] - TIE:
            pick, why = area, "area"
        else:
            pick, why = zero, "weak"
        if math.hypot(*pick) < LEAST: pick = zero
        out.append((pick[0], pick[1], why))
    return out


def load(map_id, raw):
    """The buildings layer (and the footprints beside it) in map metres, in blocks: (keys, polys,
    groups, outlines, centres, sizes), a block's outline being its buildings' as one."""
    import numpy as np
    import shapely
    from shapely.geometry import shape
    from area import area
    lon0, lat0 = area(map_id).centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    feats = []
    for name in ("building", "footprints"):
        p = os.path.join(raw, name + ".geojson")
        if os.path.exists(p): feats += json.load(open(p))["features"]
    keys, polys = [], []
    for f in feats:
        try: g = shape(f["geometry"])
        except Exception: continue
        if g.geom_type not in ("Polygon", "MultiPolygon"): continue
        g = shapely.transform(g, lambda a: np.c_[(a[:, 0] - lon0) * kx, (a[:, 1] - lat0) * ky]).buffer(0)
        if g.is_empty: continue
        keys.append(feature_key(f)); polys.append(g)
    groups = blocks(polys)
    outlines, centres, sizes = [], [], []
    for members in groups:
        u = shapely.union_all([polys[i] for i in members]).buffer(0.35).buffer(-0.35)
        u = max(getattr(u, "geoms", [u]), key=lambda g: g.area) if not u.is_empty else polys[members[0]]
        outlines.append(u); centres.append(u.centroid.coords[0]); sizes.append(u.area)
    return keys, polys, groups, outlines, centres, sizes


def fit_all(lidar, outlines, todo, jobs, roads=None):
    """Each listed block's fit (({shift: score}, {shift: edges}, {shift: street m2}), or None),
    spread over jobs processes."""
    import multiprocessing
    _job.update(lidar=lidar, outlines=outlines, roads=roads)
    if jobs > 1 and len(todo) > 50:
        with multiprocessing.get_context("fork").Pool(jobs) as pool:
            return pool.map(_fit_one, todo, chunksize=8)
    return [_fit_one(k) for k in todo]


def main():
    import shapely
    from roofs.common import open_lidar
    args = sys.argv[1:]
    jobs = os.cpu_count() or 1
    if "--jobs" in args: k = args.index("--jobs"); jobs = int(args[k + 1]); del args[k:k + 2]
    only = None
    if "--only" in args:
        k = args.index("--only"); only = [tuple(int(v) for v in a.split(",")) for a in args[k + 1:]]; del args[k:]
    map_id = args[0]
    raw = args[1] if len(args) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw", map_id, "wide")
    keys, polys, groups, outlines, centres, sizes = load(map_id, raw)
    owned = list(range(len(groups)))
    if only:
        root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
        grid = json.load(open(os.path.join(root, "web", "public", "maps", map_id, "tiles.json")))
        size = grid["dx"] * grid["cells"]
        square_of = lambda x, y: (int((x - grid["x0"]) // size), int((y - grid["y0"]) // size))
        owned = [k for k in owned if square_of(*centres[k]) in only]
        # (and the blocks round them, which make their areas' shifts)
        reach = shapely.union_all([shapely.Point(centres[k]).buffer(FIELD + 50) for k in owned]) if owned else None
        todo = [k for k in range(len(groups)) if reach is not None and reach.contains(shapely.Point(centres[k]))]
    else:
        todo = owned
    print(f"register: {len(polys)} buildings in {len(groups)} blocks; fitting {len(todo)} blocks")
    roads = roads_of(map_id, raw)
    got = fit_all(open_lidar(map_id, raw), outlines, todo, jobs, roads)
    fronts = [street_front(outlines[k], roads) for k in todo]
    picked = decide(got, [centres[k] for k in todo], [sizes[k] for k in todo], fronts)
    by_block = dict(zip(todo, keep_slits(todo, picked, got, outlines, sizes, fronts)))
    p = path(map_id)
    kept = json.load(open(p)) if only and os.path.exists(p) else {"moved": {}}
    mine = {keys[i] for k in owned for i in groups[k]}
    moved = {k: v for k, v in kept["moved"].items() if k not in mine}
    tally = {}
    for k in owned:
        dx, dy, why = by_block.get(k, (0.0, 0.0, "unseen"))
        tally[why if (dx or dy) else "stays"] = tally.get(why if (dx or dy) else "stays", 0) + 1
        if dx or dy:
            for i in groups[k]: moved[keys[i]] = [dx, dy]
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump({"moved": dict(sorted(moved.items()))}, f, separators=(",", ":"))
        f.write("\n")
    print(f"register: of {len(owned)} blocks, " + ", ".join(f"{v} {k}" for k, v in sorted(tally.items())) +
          f"; {len(moved)} buildings moved in all -> {p}")


if __name__ == "__main__":
    main()
