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
    from roofs.common import fit
    lidar, outline = _job["lidar"], _job["outlines"][k]
    try:
        scores, _ = fit(lidar, outline, (), reach=REACH)
    except Exception:
        scores = None
    return scores


def decide(fits, centres, sizes):
    """Each block's shift from its own fit and its area's: [(dx, dy, why)]."""
    import numpy as np
    import shapely
    fits = [None if sc is None else {k: v for k, v in sc.items() if math.hypot(*k) <= REACH + 1e-9} for sc in fits]
    zero = (0.0, 0.0)
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
        if area is not None and sc[area] >= top[k] - NEAR:
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


def fit_all(lidar, outlines, todo, jobs):
    """Each listed block's fit ({shift: score}, or None), spread over jobs processes."""
    import multiprocessing
    _job.update(lidar=lidar, outlines=outlines)
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
    got = fit_all(open_lidar(map_id, raw), outlines, todo, jobs)
    by_block = dict(zip(todo, decide(got, [centres[k] for k in todo], [sizes[k] for k in todo])))
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
