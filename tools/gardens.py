"""Garden plots and their boundaries: front walls with gates, and fences, walls or hedges
between neighbouring gardens.

Overture has almost no plot data, so plots are inferred: the land is split between buildings
(a Voronoi diagram of points along every footprint), each house keeps the part within a
garden's depth of it, and streets and paths are cut out. Plot edges that face a street become
the front boundary (with a gate opposite the house, and sometimes a driveway); edges between
two plots, or facing open land, become side and back boundaries.

The boundary style follows the area: Bath stone walls in the old village, low walls or hedges
at the front and close-board fences behind in the suburbs, and so on (see STYLE).
"""
import math, random
from collections import defaultdict
import shapely
from shapely.geometry import LineString, MultiLineString, MultiPoint, Point
from shapely.ops import substring, unary_union, voronoi_diagram

HOUSES = {"detached", "semi", "terrace"}
DEPTH = {"detached": 22, "semi": 20, "terrace": 16}   # how far a garden reaches from the house
# front boundary, side and back boundary, per zone; each is a list of (style, weight)
STYLE = {
    "village": ([("garden_wall", 0.75), ("railing", 0.1), ("hedge_low", 0.15)], [("stone_wall", 0.6), ("fence", 0.25), ("hedge", 0.15)]),
    "suburb": ([("garden_wall", 0.35), ("brick_wall_low", 0.2), ("hedge_low", 0.45)], [("fence", 0.75), ("hedge", 0.25)]),
    "foxhill": ([("hedge_low", 0.5), ("brick_wall_low", 0.3), ("railing", 0.2)], [("fence", 0.85), ("hedge", 0.15)]),
    "mulberry": ([("railing", 0.4), ("hedge_low", 0.4), ("brick_wall_low", 0.2)], [("brick_wall", 0.5), ("fence", 0.5)]),
}


def pick(options, r):
    acc = 0
    for name, w in options:
        acc += w
        if r < acc: return name
    return options[-1][0]


def densify(line, step):
    n = max(1, int(math.ceil(line.length / step)))
    return [line.interpolate(i / n, normalized=True).coords[0] for i in range(n + 1)]


def plots(polys, info, corridor_parts, bounds, rnd: random.Random, open_land=(), keys=None, fronts=None):
    """Return front and side boundaries as lists of (style, LineString), and gates as
    (x0, y0, x1, y1, style). corridor_parts are the street and path areas, one polygon each.
    keys (see buildings.classify): each garden's styles come from its house's key instead of
    its place in the list, so a garden comes out the same in every tile that builds it."""
    # Voronoi seeds: points every 2 m around every footprint, tagged with their building
    seeds, owner, seen = [], [], set()
    for i, p in enumerate(polys):
        for x, y in densify(p.exterior, 2.0)[:-1]:
            k = (round(x * 4), round(y * 4))     # shared walls give coincident points: keep one
            if k in seen: continue
            seen.add(k); seeds.append((k[0] / 4, k[1] / 4)); owner.append(i)
    try:
        vor = voronoi_diagram(MultiPoint(seeds), envelope=shapely.box(*bounds), tolerance=0.05)
    except ValueError:      # GEOS now and then trips over its own snapping: try it without
        vor = voronoi_diagram(MultiPoint(seeds), envelope=shapely.box(*bounds))
    tree = shapely.STRtree([Point(s) for s in seeds])
    cells = defaultdict(list)
    for cell in vor.geoms:
        hits = tree.query(cell, predicate="contains")
        if len(hits): cells[owner[int(hits[0])]].append(cell)

    # streets as separate pieces (and grown by 1.2 m, for finding plot edges that face them),
    # so each plot only deals with the ones near it
    # public open space (greens, parks, pitches) is never part of anyone's garden
    # (the streets are grown by 0.15 m, so a front wall stands just inside the pavement's edge, clear of it)
    # Only a street the house faces (fronts[k], a road rather than a footpath) makes a front: a
    # garden's edge along a footpath or open land is a side or back boundary.
    facing = [c.buffer(0.15, join_style=2) for k, c in enumerate(corridor_parts) if fronts is None or fronts[k]]
    corridor_parts = [c.buffer(0.15, join_style=2) for c in corridor_parts] + list(open_land)
    grown = [c.buffer(1.2, quad_segs=2) for c in facing] or [shapely.Point(bounds[0] - 1e6, bounds[1] - 1e6).buffer(1)]
    edges_of = [c.exterior for c in facing] or [shapely.LineString([(bounds[0] - 1e6, 0), (bounds[0] - 1e6 + 1, 0)])]
    ctree, gtree, btree = shapely.STRtree(corridor_parts), shapely.STRtree(grown), shapely.STRtree(polys)
    etree = shapely.STRtree(edges_of)
    near = lambda g, parts, t: unary_union([parts[int(k)] for k in t.query(g)])
    front, side, gates, drives = [], [], [], []
    plot_of, street_of = {}, {}
    for i, p in enumerate(polys):
        b = info[i]
        if b["kind"] not in HOUSES or i not in cells: continue
        plot = unary_union(cells[i]).intersection(p.buffer(DEPTH[b["kind"]], join_style=2))
        streets = near(plot, corridor_parts, ctree)
        if not streets.is_empty: plot = plot.difference(streets)
        others = [polys[int(k)] for k in btree.query(plot) if int(k) != i]
        if others: plot = plot.difference(unary_union(others))
        if plot.is_empty: continue
        if plot.geom_type != "Polygon":
            plot = max(getattr(plot, "geoms", [plot]), key=lambda g: g.area if g.geom_type == "Polygon" else 0)
            if plot.geom_type != "Polygon": continue
        plot_of[i] = plot
        street_of[i] = near(plot, grown, gtree)

    rng_for = lambda i: random.Random((keys[i] if keys is not None else i) * 104729 + 7)
    sides_all, gate_grid = [], defaultdict(list)
    for i, plot in plot_of.items():
        b, r = info[i], rng_for(i)
        fstyle, sstyle = STYLE.get(b["zone"], STYLE["suburb"])
        edge = plot.exterior.difference(polys[i].buffer(0.4, join_style=2))
        street_side = street_of[i]
        f = edge.intersection(street_side)
        s = edge.difference(street_side)
        # a front runs along the street: a stretch of the plot's edge near the street that turns
        # away from it (a corner, the side of a narrow plot) is a side boundary instead
        f, turned = _along_street(f, edges_of, etree)
        if turned: s = unary_union([s] + turned)
        style_front = pick(fstyle, r.random())
        for piece in getattr(f, "geoms", [f]):
            if piece.geom_type != "LineString" or piece.length < 1.5: continue
            # a gate opposite the house; detached and semi-detached suburban houses may have a drive
            c = polys[i].centroid
            # the gate is kept a metre and a quarter or more from each end, so it's never squeezed
            # narrow and never leaves a stub of wall; a front too short for that is left open, with
            # an "open" gate in its middle for the front path to start from (nothing is drawn there)
            if piece.length < 3.6:
                q0, q1 = piece.interpolate(piece.length / 2 - 0.55), piece.interpolate(piece.length / 2 + 0.55)
                if not _gate_near(gate_grid, q0.x, q0.y, q1.x, q1.y):
                    _gate_add(gate_grid, gates, (q0.x, q0.y, q1.x, q1.y, "open"))
                continue
            at = min(max(piece.project(c), 1.8), piece.length - 1.8)
            gaps = [(at, 1.1, "gate")]
            if b["kind"] != "terrace" and b["zone"] != "village" and r.random() < 0.55 and piece.length > 9:
                d = at + 3.2 if at + 5 < piece.length else at - 3.2
                gaps = [(d, 3.0, "drive"), (at if abs(at - d) > 2.2 else at + (2.2 if at > d else -2.2), 1.1, "gate")]
            cuts = sorted((max(0, a - w / 2), min(piece.length, a + w / 2), kind) for a, w, kind in gaps)
            pos = 0.0
            for a, z, kind in cuts:
                if a - pos > 1.0: front.append((style_front, substring(piece, pos, a)))
                if kind == "drive" and z - a > 2:
                    q = piece.interpolate((a + z) / 2)
                    drives.append((q.x, q.y, i))
                if kind == "gate" and z - a > 0.9:
                    p0, p1 = piece.interpolate(a), piece.interpolate(z)
                    # (two plots sharing a front would each put a gate in the same place)
                    if not _gate_near(gate_grid, p0.x, p0.y, p1.x, p1.y):
                        _gate_add(gate_grid, gates, (p0.x, p0.y, p1.x, p1.y, style_front))
                pos = max(pos, z)
            if piece.length - pos > 1.0: front.append((style_front, substring(piece, pos, piece.length)))
        style_side = pick(sstyle, r.random())
        for piece in getattr(s, "geoms", [s]):
            if piece.geom_type == "LineString" and piece.length > 1.0:
                sides_all.append((style_side, piece))

    # A boundary between two plots comes out once from each of them, and nearly the same line
    # from a plot's back edge and its neighbour's side: the boundaries are laid down one at a
    # time, longest first, each keeping only what isn't already near one laid before it (half a
    # metre for fronts; 1.2 m between gardens, where two plots' guesses at their shared boundary
    # can stand a metre apart, and two fences that close together would only be a doubled fence).
    # A piece that stops just short of another boundary is run on to meet it, so the fences join
    # at their corners; then each is straightened (corners kept).
    front = _network(front, shortest=1.0)
    side = _network(sorted(sides_all, key=lambda sp: -sp[1].length), taken=[g for _, g in front], near=1.2)
    return front, side, gates, drives


def _network(lines, taken=(), near=0.5, shortest=1.5):
    """Lay (style, LineString) boundaries down one at a time, dropping what runs within `near` of one
    already down (or of `taken`), joining ends that stop just short of one, and straightening each."""
    laid, geoms = [], list(taken)
    zones = {}      # each boundary's strip of `near` either side, worked out once, the first time it's needed
    zone = lambda k: zones[k] if k in zones else zones.setdefault(k, geoms[k].buffer(near, cap_style=2))
    tree_of = lambda: (shapely.STRtree(geoms) if geoms else None)
    tree, since = tree_of(), 0
    for style, line in lines:
        if since > 40: tree, since = tree_of(), 0       # (the tree is rebuilt now and then; the newest are checked one by one)
        idx = [int(k) for k in tree.query(line.buffer(near))] if tree is not None else []
        idx += list(range(len(geoms) - since, len(geoms))) if since else []
        close = [geoms[k] for k in idx]
        # only the strips this line actually reaches are cut out of it (the same cut, with less to join up)
        hit = [zone(k) for k in idx]
        hit = [z for z, y in zip(hit, shapely.intersects(hit, line)) if y]
        rest = line.difference(unary_union(hit)) if hit else line
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type != "LineString" or piece.length < shortest: continue
            pts = list(piece.coords)
            for end in (0, -1):
                q = Point(pts[end])
                best = min(close, key=lambda g: g.distance(q), default=None)
                if best is not None and best.distance(q) < near + 0.2:
                    on = best.interpolate(best.project(q)).coords[0]
                    if _ahead(pts, end, on):
                        if end == 0: pts.insert(0, on)
                        else: pts.append(on)
            piece = LineString(pts).simplify(0.3)
            laid.append((style, piece)); geoms.append(piece); since += 1
    return laid


def _ahead(pts, end, on):
    """Whether point `on` lies onward from the line's end (end 0 or -1), so running the line on to it
    doesn't fold it back on itself."""
    a, b = (pts[1], pts[0]) if end == 0 else (pts[-2], pts[-1])
    ux, uy, vx, vy = b[0] - a[0], b[1] - a[1], on[0] - b[0], on[1] - b[1]
    L = math.hypot(vx, vy)
    return L > 0.05 and (ux * vx + uy * vy) > 0.5 * math.hypot(ux, uy) * L


def _along_street(f, edges_of, etree, within=35):
    """Split front lines f into the stretches that run along the nearest street edge (within
    `within` degrees of it), and the ones that turn away from it."""
    keep, turned = [], []
    cos_ = math.cos(math.radians(within))
    for piece in getattr(f, "geoms", [f]):
        if piece.geom_type != "LineString" or piece.is_empty: continue
        pts = list(piece.simplify(0.3).coords)
        run, run_ok = [pts[0]], None
        for a, b in zip(pts, pts[1:]):
            m = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            e = edges_of[int(etree.nearest(m))]
            t = e.project(m)
            p0, p1 = e.interpolate(max(0, t - 0.5)), e.interpolate(min(e.length, t + 0.5))
            ex, ey, sx, sy = p1.x - p0.x, p1.y - p0.y, b[0] - a[0], b[1] - a[1]
            ok = abs(ex * sx + ey * sy) >= cos_ * (math.hypot(ex, ey) * math.hypot(sx, sy) or 1)
            if run_ok is None or ok == run_ok: run.append(b); run_ok = ok
            else:
                (keep if run_ok else turned).append(LineString(run))
                run, run_ok = [a, b], ok
        if len(run) > 1: (keep if run_ok else turned).append(LineString(run))
    return MultiLineString(keep) if keep else LineString(), turned


def _gate_near(grid, ax, ay, bx, by):
    """Whether a gate already laid has its middle within a metre of the middle of a gate from
    (ax, ay) to (bx, by): only the gates in the square metres round it are looked at."""
    cx, cy = math.floor((ax + bx) / 2), math.floor((ay + by) / 2)
    return any(math.hypot((g[0] + g[2] - ax - bx) / 2, (g[1] + g[3] - ay - by) / 2) < 1.0
               for i in (cx - 1, cx, cx + 1) for j in (cy - 1, cy, cy + 1) for g in grid.get((i, j), ()))


def _gate_add(grid, gates, g):
    """Lay gate g, filed under the square metre its middle is in."""
    gates.append(g); grid[(math.floor((g[0] + g[2]) / 2), math.floor((g[1] + g[3]) / 2))].append(g)
