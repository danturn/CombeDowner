"""Proof of concept: build one square of the map as a partition of the ground.

Usage: python3 -I tools/partition_poc.py <ti> <tj> <out dir> [--raw <dir with the .geojson layers>]
                                          [--terrain <dir of terrarium PNGs>]

This is a design experiment, not part of the build. It takes the data the build already has (the
Overture layers, OpenStreetMap's streets with their tags, the lidar wall runs kept in
data/combe-down/measured, the terrain tiles) and, instead of drawing each record where it is,
fits one partition of the ground to all of it:

  1. buildings, cleaned as a set (sliver gaps between neighbours closed);
  2. a street graph: the centre lines noded and merged into edges between junctions, every
     piece's tags kept as observations positioned along the edge;
  3. corridors: for each edge, the space between what stands either side (building fronts, lidar
     ridges, mapped barriers), then one cross-section per stretch fitted into it (carriageway and
     pavements), changing only at junctions or where the corridor changes, with tapers;
  4. plots: the blocks between the corridors divided between their buildings, every plot edge
     snapped to the lidar and barrier evidence and scored by how much of it the evidence supports,
     then classified (wall, fence, hedge, open) from the evidence or, failing that, from the plots
     around it;
  5. one surface: every face of the partition triangulated together and given heights per class
     (a smooth road profile, pavements a kerb above it, plots clamped to the pavement at their
     fronts), and checked for holes.

It writes <out>/partition.json (the faces, with class and height), <out>/render.svg (top down),
<out>/current.svg (the same square from the current build, drawn the same way, to compare) and
<out>/metrics.json. Nothing here touches the real build.
"""
import glob, json, lzma, math, os, sys, zipfile, collections, statistics
import numpy as np
from PIL import Image
from shapely.geometry import (LineString, MultiLineString, Point, Polygon, MultiPolygon, box, shape,
                              GeometryCollection)
from shapely.ops import unary_union, polygonize, linemerge, nearest_points, snap
from shapely.strtree import STRtree
import shapely

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from area import area, MAPS

MAP = "combe-down"
A = area(MAP, wide=True)
Q = A.squares
LON0, LAT0 = A.centre
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110574
MARGIN = 40.0                       # metres worked beyond the square so edges come out the same
import time
T0 = time.time()
def lap(msg): print(f"  [{time.time() - T0:5.0f}s] {msg}", flush=True)

# ---- priors: what a street of each class is normally like (metres). Carriageway (ideal, minimum),
# pavement (ideal, minimum). Manual for Streets numbers, roughly.
PRIOR = {
    "trunk": (7.3, 6.0), "primary": (7.3, 5.5), "secondary": (6.5, 5.5), "tertiary": (6.0, 5.0),
    "residential": (5.5, 3.5), "unclassified": (5.0, 3.5), "living_street": (4.8, 3.5),
    "service": (3.0, 2.5), "pedestrian": (4.0, 3.0),
}
PAVE = (2.0, 1.2)
PATHS = {"footway", "path", "cycleway", "bridleway", "steps", "track"}
PATHW = {"footway": 1.8, "path": 1.5, "cycleway": 2.5, "bridleway": 2.5, "steps": 1.8, "track": 3.0}
REACH = 14.0            # metres looked out from a centre line for what stands beside the street
KERB = 0.12
LANE = 3.25
GARDEN = 30.0           # metres from a building beyond which land is open, not a plot
OPEN_LAND, OPEN_TREE = [], None   # land use polygons that are never plots (fields, parks, pitches)
OPEN_KINDS = {"farmland", "meadow", "grass", "grassland", "park", "pitch", "recreation_ground", "cemetery", "grave_yard",
              "allotments", "forest", "wood", "golf_course", "fairway", "playground", "orchard", "nature_reserve", "scrub"}
SUPPORT = 0.4           # share of a plot edge the evidence must cover to be a boundary on its own


def proj(lon, lat): return ((lon - LON0) * KX, (lat - LAT0) * KY)


def to_m(geom):
    return shapely.transform(geom, lambda a: np.c_[(a[:, 0] - LON0) * KX, (a[:, 1] - LAT0) * KY])


def load_layer(raw, name, bbox):
    """Overture features of one layer that touch bbox, in map metres."""
    path = os.path.join(raw, name + ".geojson")
    if not os.path.exists(path):
        xz = os.path.join(ROOT, "data", MAP, name + ".geojson.xz")
        feats = json.load(lzma.open(xz))["features"]
    else:
        feats = json.load(open(path))["features"]
    out = []
    B = box(*bbox)
    for f in feats:
        try: g = to_m(shape(f["geometry"]))
        except Exception: continue
        if not g.is_valid: g = g.buffer(0)
        if g.is_empty or not g.intersects(B): continue
        out.append((g, f["properties"]))
    return out


class Terrain:
    def __init__(self, folder):
        self.folder, self.tiles = folder, {}
    def tile(self, tx, ty):
        t = self.tiles.get((tx, ty))
        if t is None:
            a = np.asarray(Image.open(os.path.join(self.folder, f"15_{tx}_{ty}.png")).convert("RGB")).astype(float)
            t = self.tiles[(tx, ty)] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        return t
    def pixel(self, i, j): return self.tile(i // 256, j // 256)[j % 256, i % 256]
    def elev(self, x, y):
        lon, lat = x / KX + LON0, y / KY + LAT0
        n = 256 * 2 ** 15
        u = (lon + 180) / 360 * n - 0.5
        v = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n - 0.5
        i, j = int(math.floor(u)), int(math.floor(v)); fu, fv = u - i, v - j
        return ((self.pixel(i, j) * (1 - fu) + self.pixel(i + 1, j) * fu) * (1 - fv)
                + (self.pixel(i, j + 1) * (1 - fu) + self.pixel(i + 1, j + 1) * fu) * fv)


# ---------------------------------------------------------------- 1. buildings
def clean_buildings(polys):
    """Footprints as a set: neighbours within 0.6 m are snapped to share a wall, overlaps removed."""
    polys = [p if p.is_valid else p.buffer(0) for p in polys]
    polys = [p for p in polys if not p.is_empty and p.area > 4]
    tree = STRtree(polys)
    out = list(polys)
    closed = 0
    for i, p in enumerate(polys):
        for j in tree.query(p.buffer(0.6)):
            if j == i: continue
            q = polys[j]
            d = p.distance(q)
            if 0 < d < 0.6:
                out[i] = snap(out[i], q, 0.6)
                closed += 1
    # remove overlaps created by snapping (later footprints give way to earlier ones)
    res = []
    tree = STRtree(out)
    for i, p in enumerate(out):
        for j in tree.query(p):
            if j < i and out[j].intersects(p) and out[j].intersection(p).area > 0.05:
                p = p.difference(out[j])
        if p.geom_type == "MultiPolygon": p = max(p.geoms, key=lambda g: g.area)
        if p.is_valid and not p.is_empty and p.area > 4: res.append(p)
    return res, closed // 2


# ---------------------------------------------------------------- 2. street graph
def street_graph(roads, bbox):
    """roads: [(LineString, tags)]. Returns edges: dict with 'line' (LineString between junctions),
    'cls', 'name', 'obs' (list of (t0, t1, tags) along it, metres), and the noded pieces."""
    lines = [l for l, _ in roads]
    noded = unary_union(lines)
    pieces = list(noded.geoms) if hasattr(noded, "geoms") else [noded]
    src = STRtree(lines)
    piece_tags = []
    for pc in pieces:
        mid = pc.interpolate(0.5, normalized=True)
        k = min(src.query(mid.buffer(0.5)), key=lambda k: lines[k].distance(mid), default=None)
        piece_tags.append(roads[k][1] if k is not None else {})
    # degree of each node, counting streets and paths separately: a path joining a street does
    # not break the street into two edges
    deg = collections.Counter(); pdeg = collections.Counter()
    for i, pc in enumerate(pieces):
        c = pc.coords
        d = pdeg if piece_tags[i].get("highway") in PATHS else deg
        d[tuple(round(v, 3) for v in c[0])] += 1; d[tuple(round(v, 3) for v in c[-1])] += 1
    # chain pieces through degree-2 nodes of the same highway class
    used = [False] * len(pieces)
    at = collections.defaultdict(list)
    for i, pc in enumerate(pieces):
        c = pc.coords
        at[tuple(round(v, 3) for v in c[0])].append(i); at[tuple(round(v, 3) for v in c[-1])].append(i)
    edges = []
    print(f"     noded into {len(pieces)} pieces; nodes by degree {sorted(collections.Counter(deg.values()).items())}")
    def walk(i, end):
        """Follow from piece i out of node `end` while the node has degree 2 and the class matches."""
        chain = []
        while True:
            ispath = piece_tags[i].get("highway") in PATHS
            d = pdeg if ispath else deg
            nxt = [j for j in at[end] if j != i and not used[j] and (piece_tags[j].get("highway") in PATHS) == ispath]
            if d[end] != 2 or len(nxt) != 1: return chain
            j = nxt[0]
            if piece_tags[j].get("highway") != piece_tags[i].get("highway"): return chain
            used[j] = True
            c = list(pieces[j].coords)
            if tuple(round(v, 3) for v in c[0]) != end: c.reverse()
            chain.append((j, c)); i, end = j, tuple(round(v, 3) for v in c[-1])
    for i, pc in enumerate(pieces):
        if used[i]: continue
        used[i] = True
        c = list(pc.coords)
        fwd = walk(i, tuple(round(v, 3) for v in c[-1]))
        bwd = walk(i, tuple(round(v, 3) for v in c[0]))
        coords, obs = [], []
        for j, cc in reversed(bwd): coords += list(reversed(cc))[:-1]; obs.append(j)
        coords += c; obs.append(i)
        for j, cc in fwd: coords += cc[1:]; obs.append(j)
        line = LineString(coords)
        if line.length < 0.5: continue
        # observations along the merged line, in order
        t, o = 0.0, []
        for j in obs:
            L = pieces[j].length
            o.append((t, t + L, piece_tags[j])); t += L
        cls = piece_tags[i].get("highway", "unknown")
        edges.append(dict(line=line, cls=cls, name=piece_tags[i].get("name", ""), obs=o))
    return edges


# ---------------------------------------------------------------- 3. corridors
def side_reach(line, obstacles_tree, obstacles, step=2.0):
    """For each sample along line: distance to the first obstacle looked at square to it, each side
    (left, right), or None. Median-filtered over 12 m."""
    n = max(2, int(line.length / step) + 1)
    ts = np.linspace(0, line.length, n)
    out = []
    for t in ts:
        p = line.interpolate(t)
        a = line.interpolate(max(0, t - 1)); b = line.interpolate(min(line.length, t + 1))
        d = np.array([b.x - a.x, b.y - a.y]); L = np.hypot(*d)
        if L == 0: out.append((None, None)); continue
        d /= L; nrm = np.array([-d[1], d[0]])
        res = []
        for s in (1, -1):
            ray = LineString([(p.x + nrm[0] * s * 0.3, p.y + nrm[1] * s * 0.3), (p.x + nrm[0] * s * REACH, p.y + nrm[1] * s * REACH)])
            best = None
            for k in obstacles_tree.query(ray):
                g = obstacles[k]
                if not g.intersects(ray): continue
                x = g.intersection(ray)
                dist = x.distance(p)
                if best is None or dist < best: best = dist
            res.append(best)
        out.append(tuple(res))
    # median filter
    def medf(vals):
        r = []
        for i in range(len(vals)):
            w = [v for v in vals[max(0, i - 3):i + 4] if v is not None]
            r.append(statistics.median(w) if len(w) >= 3 else None)
        return r
    L = medf([o[0] for o in out]); R = medf([o[1] for o in out])
    return ts, L, R


def fit_cross_section(edge, ts, L, R, hold_out=False):
    """One cross-section per stretch: carriageway width w and pavements (pl, pr), fitted into the
    corridor (L, R: what stands either side). Tags are observations; hold_out ignores width tags."""
    cls = edge["cls"]
    ideal, minimum = PRIOR.get(cls, (5.0, 3.5))
    # tag observations along the edge
    def obs_at(t, key):
        for t0, t1, tags in edge["obs"]:
            if t0 - 0.01 <= t <= t1 + 0.01 and key in tags: return tags[key]
        return None
    want_w, want_pl, want_pr = [], [], []
    for t in ts:
        w = ideal
        lanes = obs_at(t, "lanes"); width = None if hold_out else obs_at(t, "width")
        try:
            if lanes: w = max(minimum, float(lanes) * LANE)
            if width: w = float(width)
        except ValueError: pass
        pl = pr = PAVE[0]
        sw = obs_at(t, "sidewalk")
        if sw == "left": pr = 0
        elif sw == "right": pl = 0
        elif sw in ("no", "none"): pl = pr = 0
        swl, swr = obs_at(t, "sidewalk:left"), obs_at(t, "sidewalk:right")
        if swl == "no": pl = 0
        if swr == "no": pr = 0
        if cls in ("service", "track"): pl = pr = 0
        want_w.append(w); want_pl.append(pl); want_pr.append(pr)
    # squeeze each sample into its corridor
    fit = []
    for i, t in enumerate(ts):
        w, pl, pr = want_w[i], want_pl[i], want_pr[i]
        l, r = L[i], R[i]
        hl = l - 0.4 if l is not None else None      # keep 0.4 m clear of what stands there
        hr = r - 0.4 if r is not None else None
        for _ in range(6):
            tl, tr = w / 2 + pl, w / 2 + pr
            over_l = hl is not None and tl > hl; over_r = hr is not None and tr > hr
            if not over_l and not over_r: break
            if w > ideal: w = ideal; continue               # 1. a tagged extra width goes first
            if over_l and pl > PAVE[1]: pl = max(PAVE[1], hl - w / 2); continue
            if over_r and pr > PAVE[1]: pr = max(PAVE[1], hr - w / 2); continue
            if over_l and pl > 0: pl = 0; continue          # 3. the pavement on the tighter side goes
            if over_r and pr > 0: pr = 0; continue
            if w > minimum:                                  # 4. the carriageway narrows to its minimum
                w = max(minimum, 2 * min(x for x in (hl, hr) if x is not None)); continue
            break
        fit.append([w, pl, pr])
    fit = np.array(fit)
    # stretches: a cross-section changes only where the fitted values differ by more than 0.5 m
    # for more than 25 m; otherwise the stretch keeps its median
    out = []; i = 0; n = len(ts)
    while i < n:
        j = i
        while j + 1 < n and np.all(np.abs(fit[j + 1] - fit[i]) < 0.5): j += 1
        out.append([ts[i], ts[j], fit[i:j + 1]]); i = j + 1
    # merge stretches shorter than 25 m into their longer neighbour
    merged = []
    for s in out:
        if merged and (s[1] - s[0] < 25 or merged[-1][1] - merged[-1][0] < 25):
            merged[-1] = [merged[-1][0], s[1], np.vstack([merged[-1][2], s[2]])]
        else: merged.append(s)
    stretches = [(t0, t1, np.median(v, axis=0).tolist()) for t0, t1, v in merged]
    # per-sample section with 8 m tapers between stretches
    sec = np.zeros((n, 3))
    for k, (t0, t1, v) in enumerate(stretches):
        for i, t in enumerate(ts):
            if t0 <= t <= t1: sec[i] = v
    for k in range(1, len(stretches)):
        tb = stretches[k][0]; a = np.array(stretches[k - 1][2]); b = np.array(stretches[k][2])
        for i, t in enumerate(ts):
            if tb - 4 <= t <= tb + 4:
                f = (t - (tb - 4)) / 8.0; sec[i] = a * (1 - f) + b * f
    return stretches, sec


def offset_poly(line, ts, left, right):
    """The polygon between the left and right offsets of line at the samples ts (metres)."""
    lp, rp = [], []
    for i, t in enumerate(ts):
        p = line.interpolate(t)
        a = line.interpolate(max(0, t - 1)); b = line.interpolate(min(line.length, t + 1))
        d = np.array([b.x - a.x, b.y - a.y]); L = np.hypot(*d)
        if L == 0: continue
        d /= L; nrm = np.array([-d[1], d[0]])
        lp.append((p.x + nrm[0] * left[i], p.y + nrm[1] * left[i]))
        rp.append((p.x - nrm[0] * right[i], p.y - nrm[1] * right[i]))
    if len(lp) < 2: return Polygon()
    pg = Polygon(lp + rp[::-1])
    return pg if pg.is_valid else pg.buffer(0)


# ---------------------------------------------------------------- 4. plots
def make_plots(block, buildings, evidence_lines, ev_tree, zone):
    """Divide one block between the buildings in it. The block is cut into faces by the Voronoi
    edges between the buildings' outlines and by the evidence lines (lidar ridges, mapped
    barriers, each run carried on 3 m past its ends so it closes faces). Each face then goes to
    the building it is nearest to, where crossing an evidence line counts as 15 m further, so a
    plot follows the fences that were seen and the Voronoi split where none were. Faces further
    than GARDEN from every building are open land. Returns [(polygon, kind, building index)]."""
    shapely.prepare(block)
    btree0 = STRtree([b for _, b in buildings])
    inside = [buildings[k] for k in btree0.query(block.buffer(0.5)) if buildings[k][1].distance(block) < 0.5]
    if not inside:
        return [(block, "open", None)]
    pts, owner = [], []
    for i, b in inside:
        bd = b.exterior
        n = max(4, int(bd.length / 3))
        for k in range(n):
            p = bd.interpolate(k / n, normalized=True); pts.append((p.x, p.y)); owner.append(i)
    vedges = shapely.voronoi_polygons(shapely.MultiPoint(pts), extend_to=block.buffer(5), only_edges=True)
    ev = []
    for k in ev_tree.query(block.buffer(3)):
        l = evidence_lines[k]
        if l.geom_type != "LineString" or l.length < 1: continue
        c = list(l.coords); a, b2 = np.array(c[0]), np.array(c[1]); d = a - b2; d /= np.hypot(*d)
        y, z = np.array(c[-1]), np.array(c[-2]); e = y - z; e /= np.hypot(*e)
        ev.append(LineString([tuple(a + d * 3)] + c + [tuple(y + e * 3)]))
    lines = unary_union([block.boundary, vedges.intersection(block.buffer(1))] + ev)
    faces = [f for f in polygonize(lines) if block.contains(f.representative_point())]
    lap(f"   block: {len(inside)} buildings, {len(pts)} seeds, {len(ev)} evidence lines, {len(faces)} faces")
    if not faces: return [(block, "open", None)]
    evtree = STRtree(ev) if ev else None
    # adjacency between faces: each noded line segment has a face either side
    ftree = STRtree(faces)
    for f in faces: shapely.prepare(f)
    adj = collections.defaultdict(list)
    segs = list(lines.geoms) if hasattr(lines, "geoms") else [lines]
    for sg in segs:
        if sg.length < 0.05: continue
        m = sg.interpolate(0.5, normalized=True)
        a = sg.interpolate(max(0, sg.length / 2 - 0.5)); b2 = sg.interpolate(min(sg.length, sg.length / 2 + 0.5))
        d = np.array([b2.x - a.x, b2.y - a.y]); L = np.hypot(*d)
        if L == 0: continue
        d /= L; nrm = np.array([-d[1], d[0]]) * 0.15
        sides = []
        for sgn in (1, -1):
            q = Point(m.x + nrm[0] * sgn, m.y + nrm[1] * sgn)
            k = next((k for k in ftree.query(q) if faces[k].contains(q)), None)
            sides.append(k)
        if sides[0] is None or sides[1] is None or sides[0] == sides[1]: continue
        on_ev = evtree is not None and any(ev[k].distance(m) < 0.3 for k in evtree.query(m.buffer(0.3)))
        adj[sides[0]].append((sides[1], on_ev)); adj[sides[1]].append((sides[0], on_ev))
    lap(f"      adjacency {sum(len(v) for v in adj.values()) // 2} links from {len(segs)} segments")
    # region growing from each building
    import heapq
    btree = STRtree([b for _, b in inside])
    dist = [math.inf] * len(faces); own = [None] * len(faces); heap = []
    for i, f in enumerate(faces):
        rp = f.representative_point()
        for k in btree.query(f.buffer(0.5)):
            d = inside[k][1].distance(f)
            if d < 0.5:
                d0 = d
                if d0 < dist[i]: dist[i] = d0; own[i] = inside[k][0]
        if own[i] is not None: heapq.heappush(heap, (dist[i], i))
    cents = [f.centroid for f in faces]
    while heap:
        d, i = heapq.heappop(heap)
        if d > dist[i]: continue
        for j, on_ev in adj[i]:
            nd = d + cents[i].distance(cents[j]) + (15.0 if on_ev else 0.0)
            if nd < dist[j]: dist[j] = nd; own[j] = own[i]; heapq.heappush(heap, (nd, j))
    lap("      grown")
    groups = collections.defaultdict(list)
    for i, f in enumerate(faces):
        k = own[i] if dist[i] <= GARDEN else None
        if k is not None and OPEN_TREE is not None:
            rp = f.representative_point()
            if any(OPEN_LAND[j].contains(rp) for j in OPEN_TREE.query(rp)): k = None
        groups[k].append(f)
    res = []
    bld_of = dict(inside)
    leftover = []
    for k, fs in groups.items():
        try: g = shapely.coverage_union_all(fs)
        except Exception: g = unary_union([f.buffer(0) for f in fs])
        if not g.is_valid: g = g.buffer(0)
        if k is not None:
            # a plot reaches at most GARDEN from its house; the rest of its faces are open land
            reach = bld_of[k].buffer(GARDEN)
            far = g.difference(reach); g = g.intersection(reach)
            if not far.is_empty: leftover.append(far)
        for part in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            if part.area < 1 or part.geom_type != "Polygon": continue
            res.append((part, "plot" if k is not None else "open", k))
    if leftover:
        g = unary_union(leftover)
        for part in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            if part.area >= 1 and part.geom_type == "Polygon": res.append((part, "open", None))
    lap("      unioned")
    return res


def tidy_plots(plots, fixed, tol=0.8):
    """Straighten the plot network: every shared boundary is simplified as one line set (so
    neighbours stay joined), except where it runs along a building or a corridor, which stay
    exact. The faces are then handed back to the plots they came from."""
    net = unary_union([g.boundary for g, _, _ in plots])
    segs = list(net.geoms) if hasattr(net, "geoms") else [net]
    fb = fixed.boundary
    keep, simp = [], []
    for sg in segs:
        (keep if fb.distance(sg.interpolate(0.5, normalized=True)) < 0.3 else simp).append(sg)
    simp = [shapely.simplify(sg, tol, preserve_topology=True) for sg in simp]
    faces = [f for f in polygonize(unary_union(keep + simp)) if f.area > 0.5]
    tree = STRtree([g for g, _, _ in plots])
    out = collections.defaultdict(list)
    for f in faces:
        rp = f.representative_point()
        k = next((k for k in tree.query(rp) if plots[k][0].contains(rp)), None)
        if k is None:
            k = min(tree.query(f.buffer(2)), key=lambda k: plots[k][0].distance(rp), default=None)
        if k is None: continue
        out[k].append(f)
    res = []
    for k, fs in out.items():
        try: g = shapely.coverage_union_all(fs)
        except Exception: g = unary_union([f.buffer(0) for f in fs])
        for part in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            if part.area > 1: res.append((part, plots[k][1], plots[k][2]))
    return res


def classify_edges(plots, corridors_union, evidence, ev_tree, zone_at):
    """Every shared edge between two plots, or a plot and a corridor: its support by the evidence
    and its kind. Returns [(LineString, kind, support, source)]."""
    FRONT = {"village": "garden_wall", "bath": "garden_wall", "georgian": "railing", "victorian": "garden_wall",
             "foxhill": "hedge_low", "mulberry": "railing", "suburb": "hedge_low", "riverside": "brick_wall_low"}
    geoms = [p for p, _, _ in plots]
    tree = STRtree(geoms)
    done = set(); edges = []
    def support(seg):
        if seg.length < 0.5: return 0.0, None
        kinds = collections.Counter(); covered = 0.0
        n = max(2, int(seg.length / 2.0))
        for k in range(n + 1):
            p = seg.interpolate(k / n, normalized=True)
            best = None
            for e in ev_tree.query(p.buffer(1.5)):
                d = evidence[e][0].distance(p)
                if d < 1.5 and (best is None or d < best[0]): best = (d, evidence[e][1])
            if best: covered += 1; kinds[best[1]] += 1
        return covered / (n + 1), (kinds.most_common(1)[0][0] if kinds else None)
    for i, (p, kind, bi) in enumerate(plots):
        for j in tree.query(p):
            if j <= i: continue
            q, kind2, bj = plots[j]
            shared = p.boundary.intersection(q.boundary)
            if shared.is_empty or shared.length < 0.5: continue
            shared = linemerge(shared) if shared.geom_type == "MultiLineString" else shared
            segs = [shared] if shared.geom_type == "LineString" else [g for g in getattr(shared, "geoms", []) if g.geom_type == "LineString"]
            for s in segs:
                sup, ek = support(s)
                if kind == "open" and kind2 == "open": edges.append((s, "none", sup, "open-open")); continue
                if sup >= SUPPORT: edges.append((s, ek or "fence", sup, "evidence"))
                else: edges.append((s, "fence" if (kind == "plot" and kind2 == "plot") else "hedge", sup, "inferred"))
        # fronts: where the plot meets a corridor
        front = p.boundary.intersection(corridors_union.boundary) if corridors_union is not None else None
        if front is not None and not front.is_empty:
            front = linemerge(front) if front.geom_type == "MultiLineString" else front
            segs = [front] if front.geom_type == "LineString" else [g for g in getattr(front, "geoms", []) if g.geom_type == "LineString"]
            for s in segs:
                if s.length < 0.5: continue
                sup, ek = support(s)
                if kind == "open": edges.append((s, ek if sup >= SUPPORT else "none", sup, "front")); continue
                m = s.interpolate(0.5, normalized=True)
                edges.append((s, ek if sup >= SUPPORT and ek else FRONT.get(zone_at(m.x, m.y), "hedge_low"), sup, "front"))
    # propagation: an inferred edge between two plots in a block where most evidence edges are
    # fences becomes a fence; where they are hedges, a hedge; where walls, a wall
    kinds = collections.Counter(k for _, k, s, src in edges if src == "evidence")
    common = kinds.most_common(1)[0][0] if kinds else "fence"
    edges = [(s, common if src == "inferred" else k, sup, src) for s, k, sup, src in edges]
    return edges


# ---------------------------------------------------------------- 5. one surface
PRIORITY = {"building": 0, "carriageway": 1, "pavement": 2, "path": 3, "plot": 4, "open": 5}


def partition(layers, SQ):
    """The layers' polygons noded together into one set of faces with no overlaps and no gaps:
    every face takes the class of the highest-priority layer polygon over it, and land nothing
    covers is open."""
    bounds = unary_union([g.boundary for g, _, _ in layers] + [SQ.boundary])
    faces = [f for f in polygonize(bounds) if f.area > 0.01 and f.representative_point().within(SQ)]
    tree = STRtree([g for g, _, _ in layers])
    out = []
    for f in faces:
        rp = f.representative_point()
        best = None
        for k in tree.query(rp):
            g, c, d = layers[k]
            if g.contains(rp) and (best is None or PRIORITY[c] < PRIORITY[best[1]]): best = (g, c, d)
        out.append((f, best[1], best[2]) if best else (f, "open", None))
    return out


def surface(faces, T, roads_profile):
    """faces: [(polygon, cls, data)]. Triangulate each face and give every vertex a height by its
    class. Returns triangles [(cls, [(x,y,z)...])] and the check results."""
    tris, bad = [], 0
    for pg, cls, data in faces:
        if pg.is_empty or pg.area < 0.01: continue
        try: tri = shapely.constrained_delaunay_triangles(pg)
        except Exception: bad += 1; continue
        for t in tri.geoms:
            pts = []
            for x, y in list(t.exterior.coords)[:3]:
                pts.append((x, y, height_at(x, y, cls, data, T, roads_profile)))
            tris.append((cls, pts))
    return tris, bad


def height_at(x, y, cls, data, T, prof):
    if cls in ("carriageway", "pavement", "path"):
        edge, ts, zs = prof[data]
        t = edge["line"].project(Point(x, y))
        z = float(np.interp(t, ts, zs))
        return z + (KERB if cls == "pavement" else 0.0)
    if cls == "building": return data
    return T.elev(x, y)


def road_profile(edge, T):
    """Smooth height profile along a street: the terrain sampled every 4 m, then smoothed so the
    grade changes gently."""
    n = max(2, int(edge["line"].length / 4) + 1)
    ts = np.linspace(0, edge["line"].length, n)
    zs = np.array([T.elev(p.x, p.y) for p in (edge["line"].interpolate(t) for t in ts)])
    k = min(5, n)
    if n > 2:
        pad = np.pad(zs, (k // 2, k // 2), mode="edge")
        zs = np.convolve(pad, np.ones(k) / k, mode="valid")[:n]
    return edge, ts, zs


# ---------------------------------------------------------------- render
def svg_path(g):
    parts = []
    polys = g.geoms if g.geom_type == "MultiPolygon" else [g]
    for p in polys:
        if p.is_empty: continue
        rings = [p.exterior] + list(p.interiors)
        for r in rings:
            cs = list(r.coords)
            parts.append("M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in cs) + " Z")
    return " ".join(parts)


def svg_line(g):
    parts = []
    ls = g.geoms if hasattr(g, "geoms") else [g]
    for l in ls:
        cs = list(l.coords)
        if len(cs) > 1: parts.append("M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in cs))
    return " ".join(parts)


STYLE = """<style>
.open{fill:#cfd9bd}.plot{fill:#e4dfd0}.carriageway{fill:#6f6e6a}.pavement{fill:#c9c6bf}.path{fill:#d8d0b8}
.building{fill:#a99a86}.garden_wall,.stone_wall,.brick_wall,.brick_wall_low,.retaining_wall{stroke:#5a4634;stroke-width:1.1;fill:none}
.wall{stroke:#5a4634;stroke-width:1.1;fill:none}.inferred{fill:none}
.fence{stroke:#8a5a2a;stroke-width:0.9;fill:none}.hedge,.hedge_low{stroke:#3f7a3a;stroke-width:1.3;fill:none}.railing{stroke:#333;stroke-width:0.8;fill:none}
.inferred{stroke-dasharray:2 1.5}.none{stroke:none}.centre{stroke:#000;stroke-width:0.3;fill:none;opacity:.35}
.ridge{stroke:#d33;stroke-width:0.7;fill:none;opacity:.8}.free{fill:#d33}
text{font:11px sans-serif;fill:#222}
</style>"""


def render(path, bbox, layers, title):
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    S = 2.0
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w * S:.0f} {h * S + 30:.0f}" width="{w * S:.0f}" height="{h * S + 30:.0f}">',
           STYLE, f'<rect width="100%" height="100%" fill="#f4f1ea"/><text x="8" y="20">{title}</text>',
           f'<g transform="translate(0,30) scale({S}) translate({-x0},{y1}) scale(1,-1)">']
    for kind, items in layers:
        for g, cls in items:
            if g.is_empty: continue
            if kind == "poly": out.append(f'<path class="{cls}" d="{svg_path(g)}"/>')
            elif kind == "line": out.append(f'<path class="{cls}" d="{svg_line(g)}"/>')
            elif kind == "dot": out.append(f'<circle class="{cls}" cx="{g.x:.1f}" cy="{g.y:.1f}" r="1.6"/>')
    out.append("</g></svg>")
    open(path, "w").write("\n".join(out))


def free_ends(lines, others_union, tol=1.0):
    """How many of the lines have an end that touches nothing (no other line, no building)."""
    n = 0; pts = []
    tree = STRtree(lines)
    for i, l in enumerate(lines):
        for p in (Point(l.coords[0]), Point(l.coords[-1])):
            if others_union is not None and others_union.distance(p) < tol: continue
            if any(j != i and lines[j].distance(p) < tol for j in tree.query(p.buffer(tol))): continue
            n += 1; pts.append(p)
    return n, pts


# ---------------------------------------------------------------- main
def main():
    ti, tj, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    raw = os.path.join(ROOT, "data", "raw", MAP, "wide")
    terrain = os.path.join(raw, "terrain15")
    if "--raw" in sys.argv: raw = sys.argv[sys.argv.index("--raw") + 1]
    if "--terrain" in sys.argv: terrain = sys.argv[sys.argv.index("--terrain") + 1]
    os.makedirs(out, exist_ok=True)
    side = Q.dx * Q.cells
    sq = (Q.x0 + ti * side, Q.y0 + tj * side, Q.x0 + (ti + 1) * side, Q.y0 + (tj + 1) * side)
    bb = (sq[0] - MARGIN, sq[1] - MARGIN, sq[2] + MARGIN, sq[3] + MARGIN)
    B, SQ = box(*bb), box(*sq)
    zones = MAPS[MAP]["zones"]
    def zone_at(x, y):
        for name, cx, cy, r in zones:
            if math.hypot(x - cx, y - cy) < r: return name
        return MAPS[MAP]["default_zone"]
    T = Terrain(terrain)
    print(f"square {ti},{tj}: {sq}")

    # ---- data
    bld = [(g, p) for g, p in load_layer(raw, "building", bb) if g.geom_type in ("Polygon", "MultiPolygon")]
    bpolys = []
    for g, p in bld:
        for pg in (g.geoms if g.geom_type == "MultiPolygon" else [g]): bpolys.append(pg)
    roads_raw = load_layer(raw, "osm-roads", bb)
    roads = []
    for g, p in roads_raw:
        if g.geom_type != "LineString": continue
        g = g.intersection(B)
        for l in (g.geoms if hasattr(g, "geoms") else [g]):
            if l.geom_type == "LineString" and l.length > 0.5: roads.append((l, p))
    barriers = [(g, p["class"]) for g, p in load_layer(raw, "infrastructure", bb)
                if p.get("subtype") == "barrier" and p.get("class") in ("fence", "wall", "hedge", "retaining_wall") and g.geom_type in ("LineString", "MultiLineString")]
    landuse = [(g, p.get("class")) for g, p in load_layer(raw, "land_use", bb) if g.geom_type in ("Polygon", "MultiPolygon")]
    ridges = []
    mz = os.path.join(ROOT, "data", MAP, "measured", f"{ti}_{tj}.zip")
    if os.path.exists(mz):
        with zipfile.ZipFile(mz) as z:
            if "walls.json.xz" in z.namelist():
                for w in json.loads(lzma.decompress(z.read("walls.json.xz"))):
                    ridges.append((LineString(w["p"]), w["c"], w["h"]))
    print(f"  buildings {len(bpolys)}, road pieces {len(roads)}, mapped barriers {len(barriers)}, lidar ridge runs {len(ridges)}, land use {len(landuse)}")

    # ---- 1. buildings
    bpolys, closed = clean_buildings(bpolys)
    bunion = unary_union(bpolys)
    lap("buildings"); print(f"  1. buildings cleaned: {len(bpolys)}, sliver gaps closed {closed}")

    # ---- 2. street graph
    edges = street_graph(roads, bb)
    streets = [e for e in edges if e["cls"] not in PATHS]
    paths = [e for e in edges if e["cls"] in PATHS]
    lap("graph"); print(f"  2. street graph: {len(streets)} street edges, {len(paths)} path edges, from {len(roads)} ways")

    # ---- 3. corridors
    evidence = [(g, "wall" if k in ("wall", "retaining_wall") else k) for g, k in barriers]
    evidence += [(g, {"fence": "fence", "hedge": "hedge"}.get(c, "wall")) for g, c, h in ridges]
    obstacles = [g for g, _ in evidence] + bpolys
    otree = STRtree(obstacles)
    corridors, sections, held = [], [], []
    for e in streets:
        ts, L, R = side_reach(e["line"], otree, obstacles)
        stretches, sec = fit_cross_section(e, ts, L, R)
        e["sections"] = stretches
        car = offset_poly(e["line"], ts, sec[:, 0] / 2, sec[:, 0] / 2)
        pl = offset_poly(e["line"], ts, sec[:, 0] / 2 + sec[:, 1], -sec[:, 0] / 2)
        pr = offset_poly(e["line"], ts, -sec[:, 0] / 2, sec[:, 0] / 2 + sec[:, 2])
        corridors.append((e, car, pl, pr))
        # held-out width test: where the edge carries a width tag, fit without it
        tagged = [(t0, t1, tags) for t0, t1, tags in e["obs"] if "width" in tags]
        if tagged:
            _, sec2 = fit_cross_section(e, ts, L, R, hold_out=True)
            for t0, t1, tags in tagged:
                try: wt = float(tags["width"])
                except ValueError: continue
                m = (ts >= t0) & (ts <= t1)
                if m.sum(): held.append((e["name"], wt, float(np.median(sec2[m, 0])), float(np.median(sec[m, 0]))))
    for e in paths:
        w = PATHW.get(e["cls"], 1.8)
        ts = np.linspace(0, e["line"].length, max(2, int(e["line"].length / 2) + 1))
        corridors.append((e, offset_poly(e["line"], ts, np.full(len(ts), w / 2), np.full(len(ts), w / 2)), Polygon(), Polygon()))
    lap("corridors"); print(f"  3. corridors fitted: {len(corridors)}; width tags held out {len(held)}")

    # ---- 4. plots
    cor_union = unary_union([g for _, car, pl, pr in corridors for g in (car, pl, pr) if not g.is_empty])
    land = B.difference(cor_union).difference(bunion)
    blocks = [g for g in (land.geoms if hasattr(land, "geoms") else [land]) if g.area > 5]
    buildings = list(enumerate(bpolys))
    global OPEN_LAND, OPEN_TREE
    OPEN_LAND = [g for g, k in landuse if k in OPEN_KINDS]
    for g in OPEN_LAND: shapely.prepare(g)
    OPEN_TREE = STRtree(OPEN_LAND) if OPEN_LAND else None
    ev_lines = [g for g, _ in evidence]
    ev_tree = STRtree(ev_lines)
    plots = []
    lap(f"blocks {len(blocks)}")
    for blk in blocks:
        cx, cy = blk.representative_point().x, blk.representative_point().y
        plots += make_plots(blk, buildings, ev_lines, ev_tree, zone_at(cx, cy))
    # open land kinds from land use
    lu_tree = STRtree([g for g, _ in landuse])
    plots2 = []
    for g, kind, bi in plots:
        if kind == "open":
            rp = g.representative_point()
            ks = [landuse[k][1] for k in lu_tree.query(rp) if landuse[k][0].contains(rp)]
            kind = "open"
        plots2.append((g, kind, bi))
    plots = plots2
    plots = tidy_plots(plots, bunion.union(cor_union))
    lap(f"plots {len(plots)}")
    zone0 = zone_at((sq[0] + sq[2]) / 2, (sq[1] + sq[3]) / 2)
    ev_tree2 = STRtree([g for g, _ in evidence])
    pedges = classify_edges(plots, cor_union, evidence, ev_tree2, zone_at)
    lap("edges"); print(f"  4. plots: {sum(1 for _, k, _ in plots if k == 'plot')} plots, {sum(1 for _, k, _ in plots if k == 'open')} open pieces, {len(pedges)} edges")

    # ---- 5. surface
    prof = {}
    faces = []
    for k, (e, car, pl, pr) in enumerate(corridors):
        prof[k] = road_profile(e, T)
        if not car.is_empty: faces.append((car.intersection(SQ), "carriageway" if e["cls"] not in PATHS else "path", k))
        for g in (pl, pr):
            if not g.is_empty: faces.append((g.intersection(SQ), "pavement", k))
    for g, kind, bi in plots:
        faces.append((g.intersection(SQ), kind, None))
    for b in bpolys:
        z = min(T.elev(x, y) for x, y in b.exterior.coords[::max(1, len(b.exterior.coords) // 8)])
        faces.append((b.intersection(SQ), "building", z))
    faces = [(g, c, d) for g, c, d in faces if not g.is_empty]
    lap("noding"); faces = partition(faces, SQ)
    lap("triangulating"); tris, bad = surface(faces, T, prof)
    covered = unary_union([g for g, _, _ in faces])
    holes = SQ.difference(covered)
    hole_area = holes.area
    overlap = sum(g.area for g, _, _ in faces) - covered.area
    lap("surface"); print(f"  5. surface: {len(tris)} triangles, faces failed {bad}, uncovered {hole_area:.1f} m2 of {SQ.area:.0f}, overlap {overlap:.1f} m2")

    # ---- metrics
    # barrier runs with a free end: the lidar runs as the current build draws them, against the plot edges
    drawn = [s for s, k, sup, src in pedges if k != "none"]
    n_free_new, pts_new = free_ends(drawn, bunion.union(cor_union.boundary))
    n_free_old, pts_old = free_ends([g for g, _, _ in ridges], bunion)
    held_err = [abs(f - w) for _, w, f, _ in held]
    metrics = dict(
        square=[ti, tj], buildings=len(bpolys), sliver_gaps_closed=closed,
        street_edges=len(streets), path_edges=len(paths), road_pieces=len(roads),
        lidar_runs=len(ridges), lidar_runs_free_ends=n_free_old,
        plot_edges=len(drawn), plot_edges_free_ends=n_free_new,
        plot_edges_by_source=dict(collections.Counter(src for _, _, _, src in pedges)),
        plot_edge_support_mean=float(np.mean([sup for _, _, sup, _ in pedges])) if pedges else None,
        held_out_widths=len(held), held_out_within_1m=sum(1 for e in held_err if e <= 1.0),
        held_out_median_error=float(statistics.median(held_err)) if held_err else None,
        held_out=[dict(name=n, tagged=w, fitted=f) for n, w, f, _ in held],
        surface_triangles=len(tris), surface_uncovered_m2=round(hole_area, 1), surface_overlap_m2=round(overlap, 1),
        cross_section_changes=sum(len(e.get("sections", [])) - 1 for e in streets),
    )
    json.dump(metrics, open(os.path.join(out, "metrics.json"), "w"), indent=1)
    json.dump(dict(square=[ti, tj], faces=[dict(cls=c, xy=list(map(list, (g.exterior.coords if g.geom_type == "Polygon" else [])))) for g, c, _ in faces][:20000],
                   edges=[dict(kind=k, support=round(sup, 2), source=src, xy=list(map(list, s.coords))) for s, k, sup, src in pedges]),
              open(os.path.join(out, "partition.json"), "w"))

    lap("metrics")
    # ---- renders
    layers = [("poly", [(g, c) for g, c, _ in faces if c in ("open", "plot")]),
              ("poly", [(g, c) for g, c, _ in faces if c in ("pavement", "path")]),
              ("poly", [(g, c) for g, c, _ in faces if c == "carriageway"]),
              ("poly", [(g, c) for g, c, _ in faces if c == "building"]),
              ("line", [(s, k + (" inferred" if src == "inferred" else "")) for s, k, sup, src in pedges if k != "none"]),
              ("dot", [(p, "free") for p in pts_new])]
    render(os.path.join(out, "render.svg"), sq, layers, f"partition: square {ti},{tj}")
    layers_ev = [("poly", [(g, c) for g, c, _ in faces if c in ("open", "plot", "pavement", "path", "carriageway", "building")]),
                 ("line", [(g, "ridge") for g, _, _ in ridges]), ("line", [(g, "railing") for g, _ in barriers]),
                 ("dot", [(p, "free") for p in pts_old])]
    render(os.path.join(out, "evidence.svg"), sq, layers_ev, f"evidence: lidar ridge runs (red) and mapped barriers, square {ti},{tj}")
    # the current build, drawn the same way
    cur = current_build(ti, tj, sq)
    if cur:
        bl, rd, br = cur
        rl = []
        for r in rd:
            line = LineString([(x, y) for x, y, *_ in r["p"]])
            if line.length < 1: continue
            w, pv = r.get("w", PRIOR.get(r["c"], (5, 3.5))[0]), r.get("pv", [1.7, 1.7])
            ts = np.linspace(0, line.length, max(2, int(line.length / 2) + 1))
            rl.append((offset_poly(line, ts, np.full(len(ts), w / 2 + pv[0]), np.full(len(ts), w / 2 + pv[1])), "pavement"))
            rl.append((offset_poly(line, ts, np.full(len(ts), w / 2), np.full(len(ts), w / 2)), "carriageway"))
        brl = [LineString([(x, y) for x, y, *_ in b["p"]]) for b in br if len(b["p"]) > 1]
        n_free_cur, pts_cur = free_ends(brl, unary_union([Polygon(b["r"][0]) for b in bl if len(b["r"][0]) > 3]))
        metrics["current_build"] = dict(barriers=len(brl), barriers_free_ends=n_free_cur, road_pieces=len(rd),
                                        pavement_steps=pavement_steps(rd))
        json.dump(metrics, open(os.path.join(out, "metrics.json"), "w"), indent=1)
        render(os.path.join(out, "current.svg"), sq,
               [("poly", [(SQ, "open")]), ("poly", [g for g in rl if g[1] == "pavement"]), ("poly", [g for g in rl if g[1] == "carriageway"]),
                ("poly", [(Polygon(b["r"][0]), "building") for b in bl if len(b["r"][0]) > 3]),
                ("line", [(l, b["c"]) for l, b in zip(brl, [b for b in br if len(b["p"]) > 1])]),
                ("dot", [(p, "free") for p in pts_cur])], f"current build: square {ti},{tj}")
    print(json.dumps({k: v for k, v in metrics.items() if k != "held_out"}, indent=1))


def current_build(ti, tj, sq):
    """The square from the built map: buildings, roads and barriers inside sq."""
    f = os.path.join(ROOT, "web", "public", "maps", MAP, f"{ti}_{tj}.json")
    if not os.path.exists(f): f = os.path.join(ROOT, "web", "public", "maps", MAP + ".json")
    if not os.path.exists(f): return None
    d = json.load(open(f))
    SQ = box(*sq)
    bl = [b for b in d["bl"] if b.get("r") and SQ.intersects(Point(b["r"][0][0]))]
    rd = [r for r in d["rd"] if SQ.intersects(LineString([(x, y) for x, y, *_ in r["p"]]))]
    br = [b for b in d["br"] if len(b["p"]) > 1 and SQ.intersects(LineString([(x, y) for x, y, *_ in b["p"]]))]
    return bl, rd, br


def pavement_steps(rd):
    """Joins between two road pieces (at a node no third piece uses) where the carriageway width or
    a pavement width differs: a step in the pavement."""
    ends = collections.defaultdict(list)
    for r in rd:
        for p in (r["p"][0], r["p"][-1]): ends[(round(p[0], 1), round(p[1], 1))].append(r)
    n = 0
    for k, rs in ends.items():
        if len(rs) != 2: continue
        a, b = rs
        if a.get("w") != b.get("w") or a.get("pv", [1.7, 1.7]) != b.get("pv", [1.7, 1.7]): n += 1
    return n


if __name__ == "__main__":
    main()
