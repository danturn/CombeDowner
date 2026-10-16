"""The checks that point at the data rather than at the code.

The partition is fitted to whatever the data says, so when the data is wrong the partition comes out
wrong in a way no rule can fix: a centre line drawn through a building, a footprint that is really a
shed and a garage as one, a plot with no way in from any street. Those are the build's way of
finding bad data, and each is written as a line with its square and its position, as
`tools/check_map.py` does, so Dan can go and look at it in the game.

Four checks, all of them computed from what the square's build already has:
- **corridor narrower than its class**: a fitted carriageway narrower than the class's own minimum,
  which usually means a centre line or a footprint beside it is wrong;
- **building the corridor cuts**: a footprint the carriageway and its pavements run through, which
  usually means the centre line is wrong;
- **plot with no front on any street**: a building whose plot reaches no street at all, which
  usually means a missing path or drive;
- **plot edge through a building**: a drawn plot edge crossing a footprint, which means the block
  was cut with a line the footprint should have stopped.

The fifth, `edges_agree`, is about the code rather than the data: neighbouring squares each work
their own 40 m margin, so along the edge they share their partitions must meet exactly. If they do
not, the margin or the noding is wrong and every shared edge in the city is suspect.

Nothing here changes the partition; the checks only report.
"""
import collections
import math

import numpy as np
from shapely.geometry import box
from shapely.ops import unary_union
from shapely.strtree import STRtree

# metres: the narrowest carriageway each class can sensibly be. Below it the centre line or the
# footprints beside it are wrong, not the fit. (check_map.py's MINW holds the same floors.)
CLASS_MIN = {
    "trunk": 5.5, "primary": 5.0, "secondary": 5.0, "tertiary": 4.5, "residential": 3.5,
    "unclassified": 3.0, "living_street": 3.0, "service": 2.0, "pedestrian": 2.5,
}
AGREE_TOL = 0.01        # metres: how close neighbouring squares' edges must meet, from the plan


def narrow_corridors(ti, tj, streets):
    """Street edges whose fitted carriageway is narrower than their class allows, with the narrowest
    sample's position. A street squeezed below its minimum means something beside it is wrong."""
    out = []
    for e in streets:
        f = CLASS_MIN.get(e["cls"])
        if f is None or not len(e.get("sections", [])):
            continue
        w = np.array([sec[0] for t0, t1, sec in e["sections"]])
        k = int(np.argmin(w))
        if w[k] < f:
            t0, t1, _ = e["sections"][k]
            p = e["line"].interpolate((t0 + t1) / 2)
            out.append(dict(square=[ti, tj], x=round(p.x, 1), y=round(p.y, 1), rule="narrow_corridor",
                            what=f"{e['cls']} {e.get('name') or ''} fitted {w[k]:.1f} m, "
                                 f"class minimum {f} m".strip()))
    return out


def buildings_cut(ti, tj, bpolys, corridors):
    """Footprints a carriageway or pavement runs through. A centre line through a building, or a
    footprint that really is two buildings, comes out this way."""
    if not bpolys:
        return []
    carved = [g for _, car, pl, pr in corridors for g in (car, pl, pr) if not g.is_empty]
    if not carved:
        return []
    tree = STRtree(carved)
    out = []
    for b in bpolys:
        c = b.representative_point()
        for k in np.atleast_1d(tree.query(c.buffer(max(2.0, math.sqrt(b.area) / 2)))):
            inter = b.intersection(carved[int(k)])
            if inter.area > 0.5 * b.area:
                out.append(dict(square=[ti, tj], x=round(c.x, 1), y=round(c.y, 1),
                                rule="building_cut", what=f"corridor covers {inter.area / b.area:.0%} "
                                                          f"of a footprint of {b.area:.0f} m2"))
                break
    return out


REACH = 0.5             # metres: how close a plot or a house must be to the street network to be
                        # reached from it. The plan's own figure.
MIN_PLOT = 5.0          # m2 a plot must be before "nobody can get to it" is worth saying: below it
                        # it is sliver noise, not a garden the build got wrong


def unreachable_plots(ti, tj, plots, houses, corridors, pedges, openings, square):
    """Plots nobody can get to: a data finding, and usually a path or a drive missing from the source.

    A house is reached when a walk from its footprint over the faces gets to a corridor. The walk may
    cross:
    - footprint to plot, and plot or footprint to open ground, freely: they are the same private
      ground, and whether it is called a plot or open land is the build's own labelling;
    - open ground to open ground only across an edge that is not drawn, or that carries an opening;
    - anything to a corridor within REACH.

    So open ground *is* a way in, and a hedge drawn between a front garden and a verge is not - unless
    it has a gate, which is what `front_edges` gives it by counting an edge whose far side is open
    ground reaching a corridor as a front.

    Two simpler tests were tried and both are wrong. "Does the plot's boundary reach a corridor" flags
    a mid-terrace house, whose plot is its back garden and never touches the street, which is the
    ordinary case (measured: 398 of them on the village square, all fine). "Does the house or its plot
    reach a corridor" flags an ordinary house whose front garden is open land in another title,
    because the title stops at the back of the verge (measured: 193, of which Dan traced 119 to
    exactly this). Only the walk gets both right.

    This extends stage 1's opening check rather than adding a separate idea: that check says a
    building whose plot faces a street must have a gate or drive, and this says a building the walk
    cannot get out of has no way in at all. Reported with the *house's* position, since the missing
    path or drive is what to go and find. Only houses whose plot is inside the square are reported:
    the 40 m margin is worked so the square's own edges come out right."""
    ways = [g for _, car, pl, pr in corridors for g in (car, pl, pr) if not g.is_empty]
    if not ways:
        return []
    tree = STRtree(ways)
    inside = box(*square)
    # a gate counts as a way through, as do a drive and a path: the walk may cross an edge that
    # carries any of them. Leaving "gate" out made every gated garden hedge a solid wall, which is
    # the largest single group of the village square's findings (measured: house 833's 54.7 m hedge
    # 0.53 m from the corridor carries a gate, and was still read as holding the walk shut).
    opened = {o["edge"] for o in openings if o["kind"] in ("gate", "drive", "path", "open")}

    def reached(g):
        # the query is padded by REACH: STRtree.query takes the geometries whose *envelope* meets the
        # one asked for, so a corridor that lies within REACH of g but does not overlap its envelope
        # is missed and g reads as further from the street than it is (measured: two houses on the
        # village square at 0.73 m and 1.10 m by the plain query, 0.39 m and 0.36 m in truth - both
        # well inside REACH, and both wrongly reported as having no way in).
        idx = np.atleast_1d(tree.query(g.buffer(REACH)))
        return bool(len(idx)) and min(ways[int(k)].distance(g) for k in idx) <= REACH

    faces = [p for p, _, _ in plots]
    ftree = STRtree(faces) if faces else None
    drawn = [(line, eid in opened) for eid, (line, kind, sup, src) in enumerate(pedges)
             if kind != "none"]
    dtree = STRtree([l for l, _ in drawn]) if drawn else None

    def may_cross(i, j):
        """Whether the walk may pass between two touching faces: unless a drawn boundary without an
        opening lies along their shared edge. A hedge between a front garden and a verge stops the
        walk; the same hedge with a gate in it does not.

        A boundary blocks only where it *runs along* the shared edge, not merely where it touches it:
        two faces' shared edge is met at its corners by all the boundaries of the edges either side of
        it, so a piece that overlaps the shared edge by a metre out of its 20 m is a neighbour's
        boundary meeting this one at a corner, and the crossing is open. Matching on distance alone
        (measured: 3123 of 3137 pairs blocked) or on any overlap (a 21 m piece overlapping by 1.3 m
        still blocked) leaves the walk unable to move, and almost every house reads as unreachable."""
        if dtree is None:
            return True
        shared = faces[i].boundary.intersection(faces[j].boundary.buffer(REACH))
        if shared.is_empty or shared.length < 0.1:
            return True
        for k in np.atleast_1d(dtree.query(shared.buffer(REACH))):
            line, has_opening = drawn[int(k)]
            if has_opening:
                continue
            along = line.intersection(shared.buffer(0.05))
            # a boundary blocks only where it holds the crossing shut: it runs along most of the
            # shared edge. A half-metre sliver at one end of a 23 m crossing is the junction where the
            # two faces' other boundaries meet, not a wall across the gap, and treating it as one
            # leaves the walk unable to move (measured: 192 houses read as unreachable on the village
            # square, of which Dan traced 168 to open ground that is really reachable this way).
            if along.length >= 0.5 * shared.length:
                return False
        return True

    def reaches_corridor(bi):
        # the walk starts from the house's *footprint*, which is what joins its front garden to its
        # back garden: the two are separate faces of the block with the house between them, so a walk
        # that began at the plots alone would have to get out of its front garden as its only way,
        # and an ordinary house whose front garden is open land in another title would read as sealed
        # in. The footprint is a node of the walk and the crossing to any plot is free ("footprint to
        # plot, any edge").
        start = {i for i, (p, k, b) in enumerate(plots)
                 if b == bi and k in ("plot", "open") and p.area >= MIN_PLOT}
        if not start:
            start = {i for i, (p, k, b) in enumerate(plots) if b == bi}
        foot = houses[bi]
        if foot.area >= MIN_PLOT:
            for i in np.atleast_1d(ftree.query(foot.buffer(REACH))):
                i = int(i)
                # only the house's own ground or open ground may join the start: a face belonging to
                # another house is next door's plot, and a terrace house's footprint touches its
                # neighbour's garden along the party wall, so adding it let a sealed plot read as
                # reachable through next door. Open ground (owner None) is nobody's and is a way out.
                if plots[i][2] is not None and plots[i][2] != bi:
                    continue
                if foot.boundary.distance(faces[i].boundary) <= REACH or foot.intersects(faces[i]):
                    start.add(i)
        if reached(houses[bi]) or any(reached(faces[i]) for i in start):
            return True
        # a drive or a path recorded on one of the plot's own edges is a way in in its own right: the
        # opening is what stage 4 cuts through the boundary, so the boundary is not a wall there
        mine_boundary = unary_union([faces[i].boundary for i in start])
        if any(eid in opened for eid, (line, kind, sup, src) in enumerate(pedges)
               if kind != "none" and line.distance(mine_boundary) <= REACH):
            return True
        seen = set(start)
        stack = list(start)
        while stack:
            i = stack.pop()
            for j in np.atleast_1d(ftree.query(faces[i].buffer(REACH))):
                j = int(j)
                if j in seen or faces[i].boundary.distance(faces[j].boundary) > REACH:
                    continue
                if not may_cross(i, j):
                    continue
                if reached(faces[j]):
                    return True
                seen.add(j)
                stack.append(j)
        return False

    out = []
    for bi in sorted({b for _, _, b in plots if b is not None}):
        house = houses.get(bi)
        if house is None:
            continue
        mine = [p for p, k, b in plots if b == bi and p.area >= MIN_PLOT]
        if not mine:
            continue
        c = max(mine, key=lambda p: p.area).representative_point()
        if not inside.contains(c) or reaches_corridor(bi):
            continue
        h = house.representative_point()
        out.append(dict(square=[ti, tj], x=round(h.x, 1), y=round(h.y, 1), rule="plot_unreachable",
                        what=f"house of {house.area:.0f} m2 in a plot of {sum(p.area for p in mine):.0f}"
                             f" m2 cannot be reached from any street"))
    return out


def edges_through_buildings(ti, tj, edges, bpolys):
    """Drawn plot edges that run through a footprint: the block was cut by a line the building
    should have stopped, so the two neighbours' gardens are joined through a house."""
    if not bpolys or not edges:
        return []
    tree = STRtree(bpolys)
    out = []
    for s, kind, sup, src in edges:
        if kind == "none" or s.length < 2:
            continue
        m = s.interpolate(0.5, normalized=True)
        for k in np.atleast_1d(tree.query(s.buffer(0.5))):
            if bpolys[int(k)].contains(m):
                out.append(dict(square=[ti, tj], x=round(m.x, 1), y=round(m.y, 1),
                                rule="edge_through_building",
                                what=f"a {kind} boundary runs through a footprint"))
                break
    return out


def edges_agree(ti, tj, faces_a, faces_b, edge):
    """Where two neighbouring squares' faces meet the edge they share: the positions along it, from
    each side, paired up. `edge` is (x0, y0, x1, y1) of the shared line, and each face set is the
    square's faces clipped to a narrow band either side of it.

    The squares each work their own 40 m margin, so both see the same ground either side of the
    edge and must cut it the same way; a mismatch means the margin or the noding is wrong. Returns
    (worst mismatch in metres, how many positions had no partner within AGREE_TOL)."""
    x0, y0, x1, y1 = edge
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy, ux
    # the edge, grown a little across so a face whose boundary runs along it is caught either way
    band = box(min(x0, x1) - 0.5, min(y0, y1) - 0.5, max(x0, x1) + 0.5, max(y0, y1) + 0.5)

    def crossings(faces):
        out = []
        for f in faces:
            cut = f.boundary.intersection(band)
            pieces = [cut] if cut.geom_type == "LineString" else \
                [g for g in getattr(cut, "geoms", []) if g.geom_type == "LineString"]
            for b in pieces:
                for p in (b.interpolate(0.0), b.interpolate(b.length)):
                    t = (p.x - x0) * ux + (p.y - y0) * uy
                    if 0 <= t <= L and abs((p.x - x0) * nx + (p.y - y0) * ny) < 0.1:
                        out.append(round(t, 4))
        return sorted(set(out))

    a, b = crossings(faces_a), crossings(faces_b)
    worst, missing = 0.0, 0
    for t in a:
        d = min((abs(t - s) for s in b), default=None)
        if d is None or d > AGREE_TOL:
            missing += 1
            if d is not None:
                worst = max(worst, d)
    for t in b:
        d = min((abs(t - s) for s in a), default=None)
        if d is None or d > AGREE_TOL:
            missing += 1
            if d is not None:
                worst = max(worst, d)
    return worst, missing
