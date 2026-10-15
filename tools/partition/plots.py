"""Plots: the blocks between the corridors divided between their buildings.

Overture has almost no plot data, so each block is cut into faces and each face goes to the
building it is nearest to by path, where crossing an evidence line (a lidar ridge, a mapped
barrier, a parcel edge) counts as going a good deal further, so a plot follows the boundaries that
were really seen and the fallback split where none were. Faces further than GARDEN from every
building are open land. The plot network is then tidied (straightened where it wanders, sharing
each boundary once) and every shared edge is classified: on evidence it takes the evidence's kind,
otherwise it is inferred from the plots around it and the area's character.

Stage 1 divides a block by division lines square to its houses instead of a dense-point Voronoi:
a line from each shared wall between two houses (and each free side wall of a detached or end
house) running square to the house's front, back to the block's far side, and between houses that
do not share a wall the perpendicular bisector of the gap turned to the nearer house's axis. Where
two rows of houses back on to each other the back is one line for the whole yard. The Voronoi
stays only as the fallback for a block with buildings and no usable walls. The module decides the
shape of every plot and the kind of every boundary between them.
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
                # orient j to run on from the nearer end of the chain
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
            # the perpendicular bisector of the gap, turned to the nearer house's axis: side by
            # side the divide runs front-to-back, one behind the other it runs across
            gap = other - c; gap = gap / (np.hypot(*gap) or 1)
            near = j if np.hypot(*(other - m)) < np.hypot(*(c - m)) else i
            f = fbt[near]
            b = f if abs(np.dot(gap, f)) < 0.7 else np.array([-f[1], f[0]])
            # the gap's midpoint is on neither house, so the bisector is run through both ways and
            # dropped where it meets a building, so it starts on a wall rather than in mid-air
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


def back_lines(block, geoms, fbt, evidence_lines, ev_tree, reach=2 * GARDEN):
    """One line for the back of a yard where two rows of houses back on to each other, as the plan
    asks: the evidence line if one runs along the gap, else the line midway between the two rows,
    parallel to the longer row. A pair of houses back on to each other when each one's front points
    away from the other. Returns {house index: LineString} giving each backing house its back
    line, so its plot can run back to it rather than to the GARDEN cap."""
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
            # the back line runs along the gap, which is square to the two fronts (parallel to the
            # rows), so the longer house's own long side decides its direction
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
            out[i] = line
            out[j] = line
    return out


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


def make_plots(block, buildings, evidence_lines, ev_tree, zone, axes=None, fronts=None, log=print):
    """Divide one block between the buildings in it. The block is cut into faces by the division
    lines square to its houses (falling back on the Voronoi edges where there are buildings and no
    usable walls) and by the evidence lines (lidar ridges, mapped barriers, each run carried on past
    its ends so it closes faces). Each face then goes to the building it is nearest to, where
    crossing an evidence line counts as CROSS metres further. Faces further than GARDEN from every
    building are open land. Returns [(polygon, kind, building index)]."""
    shapely.prepare(block)
    btree0 = STRtree([b for _, b in buildings])
    inside = [buildings[k] for k in btree0.query(block.buffer(0.5)) if buildings[k][1].distance(block) < 0.5]
    if not inside:
        return [(block, "open", None)]

    ev = []
    for k in ev_tree.query(block.buffer(EXTEND)):
        l = evidence_lines[k]
        if l.geom_type != "LineString" or l.length < 1:
            continue
        c = list(l.coords); a, b2 = np.array(c[0]), np.array(c[1]); d = a - b2; d /= np.hypot(*d)
        y, z = np.array(c[-1]), np.array(c[-2]); e = y - z; e /= np.hypot(*e)
        ev.append(LineString([tuple(a + d * EXTEND)] + c + [tuple(y + e * EXTEND)]))

    geoms = [b for _, b in inside]
    # the house axes and fronts are kept on the building record (keyed by building index), so a
    # building's direction is decided once and every block that holds it agrees
    if axes is None:
        axes = {i: a for (i, _), a in zip(inside, building_axes(geoms))}
    if fronts is None:
        fronts = {i: np.array([-axes[i][1], axes[i][0]]) for i, _ in inside}
    fbt = [fronts[i] for i, _ in inside]
    cuts = house_divisions(block, geoms, fbt)
    # where two rows back on to each other, one line for the whole yard (the plan's "backs"): the
    # evidence line if one runs along the gap, else the line midway between the two rows. It cuts
    # the block and caps each backing plot, so a yard's back is one line, not one reach per house.
    backs = back_lines(block, geoms, fbt, evidence_lines, ev_tree)
    if not cuts:
        pts = []
        for _, b in inside:
            bd = b.exterior
            n = max(4, int(bd.length / 3))
            for k in range(n):
                p = bd.interpolate(k / n, normalized=True); pts.append((p.x, p.y))
        vedges = shapely.voronoi_polygons(MultiPoint(pts), extend_to=block.buffer(5), only_edges=True)
        cuts = [vedges.intersection(block.buffer(1))]
    lines = unary_union([block.boundary] + list(cuts) + ev)
    faces = [f for f in polygonize(lines) if block.contains(f.representative_point())]
    log(f"   block: {len(inside)} buildings, {len(cuts)} division lines, {len(ev)} evidence lines, {len(faces)} faces")
    if not faces:
        return [(block, "open", None)]
    evtree = STRtree(ev) if ev else None
    ftree = STRtree(faces)
    for f in faces:
        shapely.prepare(f)
    adj = collections.defaultdict(list)
    segs = list(lines.geoms) if hasattr(lines, "geoms") else [lines]
    for sg in segs:
        if getattr(sg, "geom_type", None) not in ("LineString", "LinearRing") or sg.length < 1.0:
            continue
        m = sg.interpolate(0.5, normalized=True)
        a = sg.interpolate(max(0.0, sg.length / 2 - 0.5))
        b2 = sg.interpolate(min(sg.length, sg.length / 2 + 0.5))
        if m is None or a is None or b2 is None:
            continue
        d = np.array([b2.x - a.x, b2.y - a.y]); L = np.hypot(*d)
        if L == 0:
            continue
        d /= L; nrm = np.array([-d[1], d[0]]) * 0.15
        sides = []
        for sgn in (1, -1):
            q = Point(m.x + nrm[0] * sgn, m.y + nrm[1] * sgn)
            k = next((k for k in ftree.query(q) if faces[k].contains(q)), None)
            sides.append(k)
        if sides[0] is None or sides[1] is None or sides[0] == sides[1]:
            continue
        on_ev = evtree is not None and any(ev[k].distance(m) < 0.3 for k in evtree.query(m.buffer(0.3)))
        adj[sides[0]].append((sides[1], on_ev)); adj[sides[1]].append((sides[0], on_ev))
    log(f"      adjacency {sum(len(v) for v in adj.values()) // 2} links from {len(segs)} segments")
    btree = STRtree([b for _, b in inside])
    dist = [math.inf] * len(faces); own = [None] * len(faces); heap = []
    for i, f in enumerate(faces):
        for k in btree.query(f.buffer(0.5)):
            d = inside[k][1].distance(f)
            if d < 0.5 and d < dist[i]:
                dist[i] = d; own[i] = inside[k][0]
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
    groups = collections.defaultdict(list)
    for i, f in enumerate(faces):
        k = own[i] if dist[i] <= GARDEN else None
        groups[k].append(f)
    res = []
    bld_of = dict(inside)
    leftover = []
    for k, fs in groups.items():
        try:
            g = shapely.coverage_union_all(fs)
        except Exception:
            g = unary_union([f.buffer(0) for f in fs])
        if not g.is_valid:
            g = g.buffer(0)
        if k is not None:
            # a plot reaches GARDEN from its house, but where two rows back on to each other the
            # yard's back is one line for the whole row pair (the plan's "backs"), so the plot is
            # capped there instead: it stops on that line rather than at its own GARDEN reach
            reach = bld_of[k].buffer(GARDEN, join_style="mitre")
            b = backs.get(k)
            if b is not None:
                reach = reach.intersection(_half_plane(b, bld_of[k].centroid))
            far = g.difference(reach); g = g.intersection(reach)
            if not far.is_empty:
                leftover.append(far)
        for part in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            if part.area < 1 or part.geom_type != "Polygon":
                continue
            res.append((part, "plot" if k is not None else "open", k))
    if leftover:
        g = unary_union(leftover)
        for part in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            if part.area >= 1 and part.geom_type == "Polygon":
                res.append((part, "open", None))
    log("      unioned")
    return res


def tidy_plots(plots, fixed, tol=3.0):
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
        if k is None:
            continue
        out[k].append(f)
    res = []
    for k, fs in out.items():
        try:
            g = shapely.coverage_union_all(fs)
        except Exception:
            g = unary_union([f.buffer(0) for f in fs])
        for part in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            if part.area > 1:
                res.append((part, plots[k][1], plots[k][2]))
    return res


def classify_edges(plots, corridors_union, evidence, ev_tree, zone_at):
    """Every shared edge between two plots, or a plot and a corridor: its support by the evidence
    and its kind. Returns [(LineString, kind, support, source)]."""
    geoms = [p for p, _, _ in plots]
    tree = STRtree(geoms)
    edges = []

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

    for i, (p, kind, bi) in enumerate(plots):
        for j in tree.query(p):
            if j <= i:
                continue
            q, kind2, bj = plots[j]
            shared = p.boundary.intersection(q.boundary)
            if shared.is_empty or shared.length < 0.5:
                continue
            shared = linemerge(shared) if shared.geom_type == "MultiLineString" else shared
            segs = [shared] if shared.geom_type == "LineString" else \
                [g for g in getattr(shared, "geoms", []) if g.geom_type == "LineString"]
            for s in segs:
                sup, ek = support(s)
                if kind == "open" and kind2 == "open":
                    edges.append((s, "none", sup, "open-open")); continue
                if sup >= SUPPORT:
                    edges.append((s, ek or "fence", sup, "evidence"))
                else:
                    edges.append((s, "fence" if (kind == "plot" and kind2 == "plot") else "hedge", sup, "inferred"))
        front = p.boundary.intersection(corridors_union.boundary) if corridors_union is not None else None
        if front is not None and not front.is_empty:
            front = linemerge(front) if front.geom_type == "MultiLineString" else front
            segs = [front] if front.geom_type == "LineString" else \
                [g for g in getattr(front, "geoms", []) if g.geom_type == "LineString"]
            for s in segs:
                if s.length < 0.5:
                    continue
                sup, ek = support(s)
                if kind == "open":
                    edges.append((s, ek if sup >= SUPPORT else "none", sup, "front")); continue
                m = s.interpolate(0.5, normalized=True)
                edges.append((s, ek if sup >= SUPPORT and ek else FRONT.get(zone_at(m.x, m.y), "hedge_low"),
                              sup, "front"))
    kinds = collections.Counter(k for _, k, s, src in edges if src == "evidence")
    common = kinds.most_common(1)[0][0] if kinds else "fence"
    edges = [(s, common if src == "inferred" else k, sup, src) for s, k, sup, src in edges]
    return edges


def drop_loose(edges, reach=1.2, min_len=6.0):
    """A loose bit that meets nothing goes (the current build's rule, prep_map's garden pass): a
    short edge with an end touching no other edge is a stub at a corner or a sliver against a
    corridor, not a boundary. Dropping one can leave its neighbour loose, so repeat until steady.
    Only the drawing is affected; the plots themselves are unchanged."""
    lines = [e for e, _, _, _ in edges]
    kept = list(range(len(edges)))
    changed = True
    while changed:
        changed = False
        live = [lines[i] for i in kept]
        tree = STRtree(live) if len(live) > 1 else None
        out = []
        for pos, i in enumerate(kept):
            l = lines[i]
            if l.length >= min_len:
                out.append(i)
                continue
            loose = False
            for p in (Point(l.coords[0]), Point(l.coords[-1])):
                if not any(j != pos and live[j].distance(p) < reach for j in tree.query(p.buffer(reach))):
                    loose = True
                    break
            if loose:
                changed = True
            else:
                out.append(i)
        kept = out
    return [edges[i] for i in kept]
