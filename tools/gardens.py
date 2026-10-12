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
from shapely.geometry import LineString, MultiPoint, Point
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


def plots(polys, info, corridor_parts, bounds, rnd: random.Random, open_land=(), keys=None):
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
    vor = voronoi_diagram(MultiPoint(seeds), envelope=shapely.box(*bounds), tolerance=0.05)
    tree = shapely.STRtree([Point(s) for s in seeds])
    cells = defaultdict(list)
    for cell in vor.geoms:
        hits = tree.query(cell, predicate="contains")
        if len(hits): cells[owner[int(hits[0])]].append(cell)

    # streets as separate pieces (and grown by 1.2 m, for finding plot edges that face them),
    # so each plot only deals with the ones near it
    # public open space (greens, parks, pitches) is never part of anyone's garden
    corridor_parts = list(corridor_parts) + list(open_land)
    grown = [c.buffer(1.2, quad_segs=2) for c in corridor_parts]
    ctree, gtree, btree = shapely.STRtree(corridor_parts), shapely.STRtree(grown), shapely.STRtree(polys)
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
    sides_all = []
    for i, plot in plot_of.items():
        b, r = info[i], rng_for(i)
        fstyle, sstyle = STYLE.get(b["zone"], STYLE["suburb"])
        edge = plot.exterior.difference(polys[i].buffer(0.4))
        street_side = street_of[i]
        f = edge.intersection(street_side)
        s = edge.difference(street_side)
        style_front = pick(fstyle, r.random())
        for piece in getattr(f, "geoms", [f]):
            if piece.geom_type != "LineString" or piece.length < 1.5: continue
            # a gate opposite the house; detached and semi-detached suburban houses may have a drive
            c = polys[i].centroid
            at = piece.project(c)
            gaps = [(at, 1.1, "gate")]
            if b["kind"] != "terrace" and b["zone"] != "village" and r.random() < 0.55 and piece.length > 9:
                d = at + 3.2 if at + 5 < piece.length else at - 3.2
                gaps = [(d, 3.0, "drive"), (at if abs(at - d) > 2.2 else at + (2.2 if at > d else -2.2), 1.1, "gate")]
            cuts = sorted((max(0, a - w / 2), min(piece.length, a + w / 2), kind) for a, w, kind in gaps)
            pos = 0.0
            for a, z, kind in cuts:
                if a - pos > 0.6: front.append((style_front, substring(piece, pos, a)))
                if kind == "drive" and z - a > 2:
                    q = piece.interpolate((a + z) / 2)
                    drives.append((q.x, q.y, i))
                if kind == "gate" and z - a > 0.5:
                    p0, p1 = piece.interpolate(a), piece.interpolate(z)
                    gates.append((p0.x, p0.y, p1.x, p1.y, style_front))
                pos = max(pos, z)
            if piece.length - pos > 0.6: front.append((style_front, substring(piece, pos, piece.length)))
        style_side = pick(sstyle, r.random())
        for piece in getattr(s, "geoms", [s]):
            if piece.geom_type == "LineString" and piece.length > 1.0:
                sides_all.append((style_side, piece))

    # boundaries shared by two plots come out twice: keep one of each
    seen = shapely.STRtree([g for _, g in sides_all]) if sides_all else None
    dropped = set()
    for k, (_, g) in enumerate(sides_all):
        if k in dropped: continue
        for j in seen.query(g.buffer(0.3)):
            j = int(j)
            if j <= k or j in dropped: continue
            other = sides_all[j][1]
            if other.buffer(0.35).contains(g) or g.buffer(0.35).contains(other) or \
               other.buffer(0.35).intersection(g).length > 0.8 * min(g.length, other.length):
                dropped.add(j)
    side = [sides_all[k] for k in range(len(sides_all)) if k not in dropped]
    return front, side, gates, drives
