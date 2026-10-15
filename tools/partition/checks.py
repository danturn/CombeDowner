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

    A plot is unreachable when *all three* hold:
    - its house's footprint is more than REACH from every corridor (carriageway, pavement, verge,
      parking or path);
    - its own boundary is more than REACH from every corridor;
    - no drive or path opening is recorded on any of its edges.

    Asking only about the plot's boundary gets this wrong: a mid-terrace house's footprint fronts the
    pavement, so the house is reached through its front door and its plot never touches the street at
    all, which is the ordinary case and not a finding (measured: 398 of them on the village square,
    all of them fine). Asking only about the house gets it wrong the other way: a plot reached by a
    drive whose house stands back from the road is reached too.

    This extends stage 1's opening check rather than adding a separate idea: that check says a
    building whose plot faces a street must have a gate or drive, and this says a building with
    neither that nor any street within reach has no way in at all. Reported with the *house's*
    position, since the missing path or drive is what Dan has to go and find. Only houses whose plot
    is inside the square are reported: the 40 m margin is worked so the square's own edges come out
    right, and a block cut off at the margin says nothing about the data."""
    ways = [g for _, car, pl, pr in corridors for g in (car, pl, pr) if not g.is_empty]
    if not ways:
        return []
    tree = STRtree(ways)
    inside = box(*square)
    # the plot edges an opening is recorded on, so a plot reached by a drive or a path counts as
    # reached even when neither its house nor its boundary comes near a corridor
    opened = set()
    for o in openings:
        if o["kind"] in ("drive", "path", "open"):
            opened.add(o["edge"])

    def reached(g):
        idx = np.atleast_1d(tree.query(g))
        return len(idx) and min(ways[int(k)].distance(g) for k in idx) <= REACH

    # a house's plot can be several pieces of a block (its front garden and its back garden are two
    # faces with its own footprint between them), so the pieces are gathered per house first: the
    # question is whether the house has a way in at all, and one piece reaching the street answers it
    by_house = collections.defaultdict(list)
    for poly, kind, bi in plots:
        if kind == "plot" and bi is not None and poly.area >= MIN_PLOT:
            by_house[bi].append(poly)

    out = []
    for bi, pieces in by_house.items():
        house = houses.get(bi)
        if house is None:
            continue
        c = max(pieces, key=lambda p: p.area).representative_point()
        if not inside.contains(c) or reached(house):
            continue
        if any(reached(p) for p in pieces):
            continue
        has_opening = False
        for eid, (line, *_) in enumerate(pedges):
            if eid in opened and any(p.boundary.distance(line) <= REACH for p in pieces):
                has_opening = True
                break
        if has_opening:
            continue
        h = house.representative_point()
        area = sum(p.area for p in pieces)
        out.append(dict(square=[ti, tj], x=round(h.x, 1), y=round(h.y, 1), rule="plot_unreachable",
                        what=f"house of {house.area:.0f} m2 in a plot of {area:.0f} m2 reaches "
                             f"no street, and has no drive or path"))
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
