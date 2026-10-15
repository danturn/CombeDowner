"""Plots: the blocks between the corridors divided between their buildings.

Every point of a block is one face of one partition. Every cut that shapes a plot is a line of the
one polygonize — the division lines square to the houses, the bisectors between detached houses,
the evidence lines, the shared back lines between two rows and each garden cap — so the block is
cut once, before any face is assigned to a building. A plot is then a union of faces of that one
partition and nothing else: the region growing assigns whole faces and never cuts them, so two
neighbours share their boundary exactly and a plot edge cannot end in mid-air. (The proof of
concept cut plots in two places — cuts in the polygonize, then a per-house `buffer(GARDEN)` clip
afterwards — so two neighbours were cut independently and their versions of a shared boundary did
not coincide.)

Each face goes to the building it is nearest to by path, crossing an evidence line costing CROSS
metres. A face is a plot's if the growing reached it within reach GARDEN of that building; the rest
is open land.

The drawn boundaries come from that same noded network, not from pairs of plot polygons: every
segment of the network has a label either side (a plot, open land, a corridor, a building or the
worked area's edge), and the segments are grouped by the pair of labels and merged, so a boundary
between two neighbours is one line. A building or the worked area's edge is not a boundary and is
not drawn. Whether a boundary is on evidence or inferred is whether it lies on an evidence line.

Stage 1 divides a block by division lines square to its houses instead of a dense-point Voronoi:
a line from each shared wall between two houses (and each free side wall of a detached or end
house) running square to the house's front, back to the block's far side, and between houses that
do not share a wall the perpendicular bisector of the gap turned to the nearer house's axis. The
Voronoi stays only as the fallback for a block with buildings and no usable walls.
"""
import collections
import heapq
import math

import numpy as np
import shapely
from shapely.geometry import LineString, MultiPoint, Point, Polygon
from shapely.ops import linemerge, polygonize, unary_union
from shapely.strtree import STRtree

GARDEN = 30.0           # metres from a building beyond which land is open, not a plot
CROSS = 15.0            # metres an evidence line costs the region growing to cross
SUPPORT = 0.4           # share of a plot edge the evidence must cover to be a boundary on its own
REACH_GROW = 2 * GARDEN  # metres: how far the growing cost may run before a face is open land
FACE_PAD = 0.5          # metres: a plot reaches its building's GARDEN reach grown by this
SEED_REACH = 0.5        # metres: a face this close to a building is one of its seeds
PROBE = 0.15            # metres: how far either side of a segment to look for its face
CAP_OVERHANG = 6.0      # metres: a garden cap reaches this far past its house's corners
BACK_ROWS = 8.0         # metres: two rows closer than this back on to each other
JOIN_ANGLE = 10.0       # degrees: evidence runs this close to collinear join into one line
JOIN_GAP = 8.0          # metres: and within this of each other
EXTEND = 3.0            # metres an evidence line is carried on past each end so it closes faces
OPEN_KINDS = {"farmland", "meadow", "grass", "grassland", "park", "pitch", "recreation_ground",
              "cemetery", "grave_yard", "allotments", "forest", "wood", "golf_course", "fairway",
              "playground", "orchard", "nature_reserve", "scrub"}
FRONT = {"village": "garden_wall", "bath": "garden_wall", "georgian": "railing", "victorian": "garden_wall",
         "foxhill": "hedge_low", "mulberry": "railing", "suburb": "hedge_low", "riverside": "brick_wall_low"}


def building_axes(polys):
    """Each building's axis: the unit direction of the long side of its minimum rotated rectangle.
    A terrace house's axis is the same thing (its long side runs along the row)."""
    out = []
    for p in polys:
        rect = p.minimum_rotated_rectangle
        c = list(rect.exterior.coords)
        e1 = math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1])
        e2 = math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1])
        if e1 >= e2:
            a = np.array([c[1][0] - c[0][0], c[1][1] - c[0][1]])
        else:
            a = np.array([c[2][0] - c[1][0], c[2][1] - c[1][1]])
        n = np.hypot(*a)
        out.append(a / n if n else np.array([1.0, 0.0]))
    return out


def front_normals(geoms, axes, roads_tree, roads):
    """The outward direction each house faces: towards the nearest street. Falls back to square to
    the house's axis where no street is near."""
    out = {}
    for i, g in enumerate(geoms):
        f = None
        if roads_tree is not None and roads:
            c = g.centroid
            near = [roads[k] for k in roads_tree.query(c.buffer(50))]
            if near:
                road = min(near, key=lambda l: l.distance(c))
                p = g.representative_point()
                q = road.interpolate(road.project(p))
                v = np.array([q.x - p.x, q.y - p.y])
                if np.hypot(*v):
                    f = v / np.hypot(*v)
        if f is None:
            a = axes[i]
            f = np.array([-a[1], a[0]])
        out[i] = f
    return out


def join_evidence(lines, ang_tol=JOIN_ANGLE, gap=JOIN_GAP):
    """Join evidence runs that are collinear within ang_tol and within gap of each other into one
    line: a joined line only ever becomes a plot edge if it closes a face, so the partition can
    afford to join more freely than walls.py does."""
    segs = [np.asarray(l.coords, float) for l in lines if l.geom_type == "LineString" and l.length > 1]
    if not segs:
        return []
    cos_tol = math.cos(math.radians(180 - ang_tol))
    used = [False] * len(segs)
    out = []
    for i in range(len(segs)):
        if used[i]:
            continue
        used[i] = True
        pts = list(segs[i])
        changed = True
        while changed:
            changed = False
            a, b = pts[0], pts[-1]
            d = b - a; d = d / (np.hypot(*d) or 1)
            for j in range(len(segs)):
                if used[j]:
                    continue
                c, e = segs[j][0], segs[j][-1]
                for (p, q) in ((c, e), (e, c)):
                    if np.hypot(*(p - b)) <= gap and (np.hypot(*q) and np.dot(q - p, d) / (np.hypot(*(q - p)) or 1) > cos_tol):
                        pts += [q]; used[j] = True; changed = True; break
                    if np.hypot(*(a - p)) <= gap and (np.hypot(*q) and np.dot(p - q, -d) / (np.hypot(*(p - q)) or 1) > cos_tol):
                        pts = [q] + pts; used[j] = True; changed = True; break
                if changed:
                    break
        out.append(LineString(pts))
    return out


def side_wall_lines(geoms, fbt):
    """A division line from each shared wall between two houses, and from each free side wall of a
    detached or end house: the side wall continued square to the house's front, back through the
    block. A party wall between neighbours is emitted once, not once per house. Returns [(point,
    direction)]."""
    tree = STRtree(geoms)
    walls = []          # (house i, midpoint, back direction along the wall)
    for i, g in enumerate(geoms):
        f = fbt[i]                       # points to the street (the front)
        c = list(g.minimum_rotated_rectangle.exterior.coords)
        for k in range(4):
            a, b = np.array(c[k]), np.array(c[(k + 1) % 4])
            d = b - a
            L = np.hypot(*d)
            if L < 1.0:
                continue
            d = d / L
            if abs(np.dot(d, f)) < 0.3:      # a side wall runs front-to-back, square to the front
                back = d if np.dot(d, f) <= 0 else -d
                walls.append((i, (a + b) / 2, back))
    out = []
    for i, m, back in walls:
        seg = LineString([tuple(m - back * 2), tuple(m + back * 2)])
        shared = None
        for j in tree.query(seg.buffer(0.6)):
            if j == i or geoms[j].distance(Point(m)) > 0.6:
                continue
            shared = j
            break
        # back is already oriented away from the front; the division runs on the way the wall runs
        if shared is None or i < shared:        # free side wall, or one line for the shared wall
            # the min-rectangle midpoint can sit a little off a rotated footprint's wall; put the
            # start on the wall itself so the division begins on the building and not in mid-air
            g = geoms[i]
            m2 = np.array(g.boundary.interpolate(g.boundary.project(Point(m))).coords[0])
            out.append((i, m2, back, shared is not None))
    return out


def house_divisions(block, geoms, fbt):
    """Candidate division lines for a block. From each shared wall between two houses, and from each
    free side wall of a detached or end house, a line square to the house's front running back from
    the wall to the block's far side. Between houses that do not share a wall, the perpendicular
    bisector of the gap, turned to the nearer house's axis. Returns [LineString]."""
    tree = STRtree(geoms)
    lines = []
    for i, m, back, shared in side_wall_lines(geoms, fbt):
        line = _back(block, m, back)
        if not line.is_empty:
            lines.append(line)
    for i, g in enumerate(geoms):
        c = np.array([g.centroid.x, g.centroid.y])
        for j in tree.query(g.buffer(BACK_ROWS)):
            if j <= i:
                continue
            h = geoms[j]
            if g.distance(h) <= 1.0:
                continue                     # shares a wall: the side-wall lines already divide it
            other = np.array([h.centroid.x, h.centroid.y])
            m = (c + other) / 2
            gap = other - c; gap = gap / (np.hypot(*gap) or 1)
            near = j if np.hypot(*(other - m)) < np.hypot(*(c - m)) else i
            f = fbt[near]
            b = f if abs(np.dot(gap, f)) < 0.7 else np.array([-f[1], f[0]])
            lines.append(_through(block, m, b, geoms))
    return [l for l in lines if not l.is_empty and l.length > 1]


def _half_plane(line, pt, size=4000.0):
    """A large polygon on pt's side of line."""
    if line.geom_type == "MultiLineString":
        line = max(line.geoms, key=lambda g: g.length)
    c = list(line.coords)
    a, b = np.array(c[0]), np.array(c[-1])
    d = b - a; n = np.hypot(*d)
    if n == 0:
        return Polygon()
    nrm = np.array([-d[1], d[0]]) / n
    if np.dot(np.array([pt.x, pt.y]) - a, nrm) < 0:
        nrm = -nrm
    return Polygon([tuple(a - nrm * size), tuple(b - nrm * size),
                    tuple(b + nrm * size), tuple(a + nrm * size)])


def mid_point(p):
    return Point(p[0], p[1])


def _long(block):
    return max(block.bounds[2] - block.bounds[0], block.bounds[3] - block.bounds[1]) * 2 + 10


def _back(block, p, d):
    """The line from p (on a wall) in the wall's front-to-back direction, to the block's far side."""
    ln = LineString([tuple(p), tuple(p + d * _long(block))])
    cut = ln.intersection(block)
    pieces = [cut] if cut.geom_type == "LineString" else \
        [g for g in getattr(cut, "geoms", []) if g.geom_type == "LineString" and len(g.coords) > 1]
    pieces = [g for g in pieces if len(g.coords) > 1]
    return min(pieces, key=lambda g: Point(g.coords[0]).distance(Point(p))) if pieces else LineString()


def _through(block, p, d, geoms):
    """The line through p in direction d, dropped where it meets a building, so a division between
    the houses starts on a wall rather than crossing the gap in mid-air. Both ways are taken."""
    walls = unary_union([g.boundary for g in geoms])
    out = []
    for sgn in (1, -1):
        ln = LineString([tuple(p), tuple(p + d * _long(block) * sgn)])
        cut = ln.intersection(block).difference(walls.buffer(-0.05))
        pieces = [cut] if cut.geom_type == "LineString" else \
            [g for g in getattr(cut, "geoms", []) if g.geom_type == "LineString" and len(g.coords) > 1]
        pieces = [g for g in pieces if len(g.coords) > 1]
        if pieces:
            out.append(min(pieces, key=lambda g: Point(g.coords[0]).distance(Point(p))))
    return unary_union(out) if len(out) > 1 else (out[0] if out else LineString())


def back_lines(block, inside, fbt, evidence_lines, ev_tree, reach=2 * GARDEN):
    """One line for the back of a yard where two rows of houses back on to each other: the evidence
    line if one runs along the gap, else the line midway between the two rows, parallel to the
    longer row. A pair of houses back on to each other when each one's front points away from the
    other. `inside` is [(building index, polygon)]; returns {building index: LineString} so either
    house of a pair finds the same back line."""
    geoms = [b for _, b in inside]
    tree = STRtree(geoms)
    out = {}
    for i, g in enumerate(geoms):
        c = np.array([g.centroid.x, g.centroid.y])
        for j in tree.query(g.buffer(reach)):
            j = int(j)
            if j <= i:
                continue
            h = geoms[j]
            other = np.array([h.centroid.x, h.centroid.y])
            v = other - c; d = np.hypot(*v)
            if d < 2.0 or d > reach:
                continue
            v = v / d
            # each house's front points away from the other: they face opposite streets
            if np.dot(v, fbt[i]) > -0.3 or np.dot(v, fbt[j]) < 0.3:
                continue
            # and nothing stands in the gap: two houses back on to each other across open ground,
            # not across a third building
            gap = LineString([tuple(c + v * 1.0), tuple(other - v * 1.0)])
            if any(g2.intersects(gap) for g2 in geoms if g2 is not g and g2 is not h):
                continue
            mid = (c + other) / 2
            # the back line runs along the gap, square to the two fronts (parallel to the rows), so
            # the longer house's own long side decides its direction
            li = g.minimum_rotated_rectangle.length
            lj = h.minimum_rotated_rectangle.length
            nrm = fbt[i] if li >= lj else fbt[j]
            axis = np.array([-nrm[1], nrm[0]])
            line = LineString([tuple(mid - axis * 200), tuple(mid + axis * 200)])
            if ev_tree is not None:
                near = [evidence_lines[k] for k in ev_tree.query(mid_point(mid).buffer(4.0))]
                best = None
                for e in near:
                    if e.geom_type == "LineString" and e.distance(LineString([tuple(mid), tuple(c)])) < 3.0:
                        dd = e.distance(mid_point(mid))
                        if best is None or dd < best[0]:
                            best = (dd, e)
                if best:
                    line = best[1]
            # clipped to the block, so its ends land on the block's far side (a building or a
            # corridor) and never in open land: the growth cap below keeps it only the yard's back
            line = line.intersection(block.buffer(1.0))
            if line.is_empty or line.length < 1:
                continue
            if line.geom_type == "MultiLineString":
                line = max(line.geoms, key=lambda g: g.length)
            if line.geom_type != "LineString":
                continue
            out[inside[i][0]] = line
            out[inside[j][0]] = line
    return out


def garden_caps(block, geoms, gidx, fbt, backs):
    """The back edge of each house's garden cap, as a line: the side of its mitred GARDEN reach
    away from the street. A house that has a shared back line (backs) does not get one. The line is
    the reach's back edge only, CAP_OVERHANG metres past the house's corners either way, so the
    part beyond the division lines either side is a dangle that polygonize discards. It is a cut of
    the block like any other, so where a plot backing on to open land ends, it ends on a face
    boundary and two neighbours agree on it."""
    out = []
    for i, g in enumerate(geoms):
        if gidx[i] in backs:
            continue
        f = np.asarray(fbt[i], float)
        a = np.array([-f[1], f[0]])
        c = np.array([g.centroid.x, g.centroid.y])
        vs = [np.array(p) for p in g.exterior.coords]
        depth = max(float(np.dot(v - c, -f)) for v in vs)
        half = max(abs(float(np.dot(v - c, a))) for v in vs) + CAP_OVERHANG
        m = c - f * (depth + GARDEN)
        seg = LineString([tuple(m - a * half), tuple(m + a * half)]).intersection(block.buffer(0.5))
        parts = [seg] if seg.geom_type == "LineString" else \
            [x for x in getattr(seg, "geoms", []) if x.geom_type == "LineString"]
        for x in parts:
            if x.length > 1:
                out.append(x)
    return out


def _label_outside(q, bunion, B):
    """What lies beyond a block boundary at a probe point: a building, or the worked area's edge if
    the probe is outside B. Anything else that is not a building is a corridor: a sliver of ground
    between a corridor and a house is in no block (the blocks drop pieces under 5 m²), so a front
    along it would otherwise be labelled the worked area's edge and never drawn."""
    if bunion is not None and bunion.intersects(q):
        return ("building",)
    if B is not None and not B.intersects(q):
        return ("edge",)
    return ("corridor",)


def _probe_face(sg, mpt, nrm, off, face_at):
    """The faces either side of a segment, probing at `off` metres along the normal each way. A face
    can be thinner than the first offset, so a small offset is retried before giving up."""
    for o in (off, 0.05, 0.01):
        q1 = Point(mpt.x + nrm[0] * o, mpt.y + nrm[1] * o)
        q2 = Point(mpt.x - nrm[0] * o, mpt.y - nrm[1] * o)
        k1, k2 = face_at(q1), face_at(q2)
        if k1 is not None and k2 is not None and k1 != k2:
            return k1, q1, k2, q2
    return k1, q1, k2, q2


def make_plots(block, buildings, evidence_lines, ev_tree, zone, axes, fronts, bunion, B, log=print):
    """Divide one block between the buildings in it. Every cut goes into one polygonize; each face
    then goes to the building it is nearest to by path, and is a plot's if the growing reached it
    within reach GARDEN of it (otherwise open land). Returns (plots, edges): plots as
    [(polygon, 'plot' or 'open', building index or None)], and edges as every segment of the noded
    network with a label either side, [(LineString, label, label)]."""
    shapely.prepare(block)
    btree0 = STRtree([b for _, b in buildings])
    inside = [buildings[k] for k in btree0.query(block.buffer(0.5)) if buildings[k][1].distance(block) < 0.5]

    # evidence runs near the block, carried EXTEND past each end so they close faces
    ev = []
    for k in ev_tree.query(block.buffer(EXTEND)):
        l = evidence_lines[k]
        if l.geom_type != "LineString" or l.length < 1:
            continue
        c = list(l.coords); a, b2 = np.array(c[0]), np.array(c[1]); d = a - b2; d /= np.hypot(*d)
        y, z = np.array(c[-1]), np.array(c[-2]); e = y - z; e /= np.hypot(*e)
        ev.append(LineString([tuple(a + d * EXTEND)] + c + [tuple(y + e * EXTEND)]))

    geoms = [b for _, b in inside]
    gidx = [i for i, _ in inside]
    if axes is None:
        axes = {i: a for (i, _), a in zip(inside, building_axes(geoms))}
    if fronts is None:
        fronts = {i: np.array([-axes[i][1], axes[i][0]]) for i, _ in inside}
    fbt = [fronts[i] for i in gidx]

    cuts, back_cuts, caps = [], [], []
    if inside:
        cuts = house_divisions(block, geoms, fbt)
        if not cuts:
            pts = []
            for b in geoms:
                bd = b.exterior
                n = max(4, int(bd.length / 3))
                for k in range(n):
                    p = bd.interpolate(k / n, normalized=True); pts.append((p.x, p.y))
            vedges = shapely.voronoi_polygons(MultiPoint(pts), extend_to=block.buffer(5), only_edges=True)
            cuts = [vedges.intersection(block.buffer(1))]
        backs = back_lines(block, inside, fbt, evidence_lines, ev_tree)
        back_cuts = list({(round(b.bounds[0], 2), round(b.bounds[1], 2),
                          round(b.bounds[2], 2), round(b.bounds[3], 2)): b for b in backs.values()}.values())
        caps = garden_caps(block, geoms, gidx, fbt, backs)
    else:
        backs = {}

    # ONE polygonize: every cut is a line, and nothing is cut after this point
    lines = unary_union([block.boundary] + list(cuts) + ev + list(back_cuts) + caps)
    faces = [f for f in polygonize(lines) if block.contains(f.representative_point())]
    if not faces:
        faces = [block]
    log(f"   block: {len(inside)} buildings, {len(cuts)} division lines, {len(ev)} evidence lines, "
        f"{len(back_cuts)} back lines, {len(caps)} caps, {len(faces)} faces")

    # every segment of the noded network, with the face either side of it (or None), and whether it
    # lies on an evidence line
    evtree = STRtree(ev) if ev else None
    ftree = STRtree(faces)
    for f in faces:
        shapely.prepare(f)

    def face_at(q):
        return next((k for k in ftree.query(q) if faces[k].contains(q)), None)

    seg_info, adj = [], collections.defaultdict(list)
    segs = list(lines.geoms) if hasattr(lines, "geoms") else [lines]
    for sg in segs:
        if getattr(sg, "geom_type", None) not in ("LineString", "LinearRing") or sg.length < 0.05:
            continue
        c0 = np.array(sg.coords[0]); c1 = np.array(sg.coords[-1])
        d = c1 - c0; L = np.hypot(*d)
        if L == 0:
            continue
        d = d / L; nrm = np.array([-d[1], d[0]])
        off = min(PROBE, sg.length / 4.0)
        mpt = Point(sg.interpolate(0.5, normalized=True).coords[0])
        k1, q1, k2, q2 = _probe_face(sg, mpt, nrm, off, face_at)
        on_ev = evtree is not None and any(ev[e].distance(mpt) < 0.3 for e in evtree.query(mpt.buffer(0.3)))
        seg_info.append((sg, (k1, q1), (k2, q2), on_ev))
        if k1 is not None and k2 is not None and k1 != k2:
            adj[k1].append((k2, on_ev)); adj[k2].append((k1, on_ev))
    log(f"      {len(seg_info)} segments, {sum(len(v) for v in adj.values()) // 2} adjacency links")

    # region growing: seeds are the faces a building stands in, then Dijkstra over face-centroid
    # distances, crossing an evidence line costing CROSS metres more
    btree = STRtree(geoms)
    dist = [math.inf] * len(faces); own = [None] * len(faces); heap = []
    for i, f in enumerate(faces):
        for k in btree.query(f.buffer(SEED_REACH)):
            d = geoms[k].distance(f)
            if d < SEED_REACH and d < dist[i]:
                dist[i] = d; own[i] = gidx[k]
        if own[i] is not None:
            heapq.heappush(heap, (dist[i], i))
    cents = [f.centroid for f in faces]
    while heap:
        d, i = heapq.heappop(heap)
        if d > dist[i]:
            continue
        for j, on_ev in adj[i]:
            nd = d + cents[i].distance(cents[j]) + (CROSS if on_ev else 0.0)
            if nd < dist[j]:
                dist[j] = nd; own[j] = own[i]; heapq.heappush(heap, (nd, j))
    log("      grown")

    # label each face: a plot's if the growing reached it and it is inside that house's reach
    bld_of = dict(inside)
    reach = {}
    for k, g in inside:
        r = g.buffer(GARDEN + FACE_PAD, join_style="mitre")
        if k in backs:
            r = r.intersection(_half_plane(backs[k], g.centroid))
        reach[k] = r
    face_label = []
    for i, f in enumerate(faces):
        k = own[i]
        if k is not None and dist[i] <= REACH_GROW and reach[k].contains(f.representative_point()):
            face_label.append(("plot", k))
        else:
            face_label.append(("open",))

    # plots: each distinct label's faces unioned
    groups = collections.OrderedDict()
    for i, lab in enumerate(face_label):
        groups.setdefault(lab, []).append(faces[i])
    plots = []
    for lab, fs in groups.items():
        try:
            g = shapely.coverage_union_all(fs)
        except Exception:
            g = unary_union([f.buffer(0) for f in fs])
        if not g.is_valid:
            g = g.buffer(0)
        kind = "plot" if lab[0] == "plot" else "open"
        bi = lab[1] if lab[0] == "plot" else None
        for part in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            if part.area >= 1 and part.geom_type == "Polygon":
                plots.append((part, kind, bi))
    log(f"      {len(plots)} pieces")

    # edges: each segment's two labels (a face's label, or what lies beyond a missing face)
    edges = []
    probe_fail = 0
    for sg, (k1, q1), (k2, q2), on_ev in seg_info:
        if k1 is None and k2 is None:
            probe_fail += 1
        la = face_label[k1] if k1 is not None else _label_outside(q1, bunion, B)
        lb = face_label[k2] if k2 is not None else _label_outside(q2, bunion, B)
        if la == lb:
            continue
        edges.append((sg, la, lb))
    log(f"      {probe_fail} segments with no face on either side")
    return plots, edges


def classify_edges(raw_edges, evidence, ev_tree, zone_at):
    """The drawn boundaries, from the labelled segments of the blocks' networks. Segments along a
    building or the worked area's edge are dropped (kind 'none'), and the rest are grouped by their
    pair of labels and merged, so a boundary between two neighbours is one line. Returns
    [(LineString, kind, support, source)]."""
    def support(seg):
        if seg.length < 0.5:
            return 0.0, None
        kinds = collections.Counter(); covered = 0.0
        n = max(2, int(seg.length / 2.0))
        for k in range(n + 1):
            p = seg.interpolate(k / n, normalized=True)
            best = None
            for e in ev_tree.query(p.buffer(1.5)):
                d = evidence[e][0].distance(p)
                if d < 1.5 and (best is None or d < best[0]):
                    best = (d, evidence[e][1])
            if best:
                covered += 1; kinds[best[1]] += 1
        return covered / (n + 1), (kinds.most_common(1)[0][0] if kinds else None)

    groups = collections.defaultdict(list)
    for sg, la, lb in raw_edges:
        if ("building",) in (la, lb) or ("edge",) in (la, lb):
            continue                       # a house, or the worked area's edge: not drawn
        if la == lb:
            continue
        groups[tuple(sorted((la, lb), key=str))].append(sg)

    edges = []
    for key, segs in groups.items():
        merged = linemerge(unary_union(segs)) if len(segs) > 1 else segs[0]
        parts = [merged] if merged.geom_type == "LineString" else \
            [g for g in getattr(merged, "geoms", []) if g.geom_type == "LineString"]
        sides = {key[0][0], key[1][0]}
        for s in parts:
            if s.length < 0.1:
                continue
            sup, ek = support(s)
            m = s.interpolate(0.5, normalized=True)
            if sides == {"open"}:
                edges.append((s, "none", sup, "open-open")); continue
            if "corridor" in sides:
                if sides == {"corridor", "open"}:
                    kind = ek if (sup >= SUPPORT and ek) else "none"
                else:
                    kind = ek if (sup >= SUPPORT and ek) else FRONT.get(zone_at(m.x, m.y), "hedge_low")
                edges.append((s, kind, sup, "front")); continue
            # a plot against a plot, or a plot against open land
            if sup >= SUPPORT:
                edges.append((s, ek or "fence", sup, "evidence"))
            else:
                edges.append((s, "fence" if sides == {"plot"} else "hedge", sup, "inferred"))
    kinds = collections.Counter(k for _, k, _, src in edges if src == "evidence")
    common = kinds.most_common(1)[0][0] if kinds else "fence"
    edges = [(s, common if src == "inferred" else k, sup, src) for s, k, sup, src in edges]
    return edges
