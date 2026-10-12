"""Combe Down's landmarks: Holy Trinity's spire, Prior Park's porticos and the Palladian Bridge."""
import math
import shapely
from shapely.geometry import Point
from landmarks import named


def replaces(ctx):
    ctx.porticos, gone = prior_park(ctx)
    return gone


def place(ctx):
    return holy_trinity(ctx) + ctx.porticos + palladian_bridge(ctx)


def holy_trinity(ctx):
    """A square west tower with an octagonal spire, at the west end of the church."""
    for b in ctx.buildings:
        if b["name"] != "Holy Trinity": continue
        poly = b["whole"]          # the church may be split into nave, aisles and tower
        q = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
        e0, e1 = math.dist(q[0], q[1]), math.dist(q[1], q[2])
        a, c = (q[0], q[1]) if e0 >= e1 else (q[1], q[2])
        L = max(e0, e1)
        ux, uy = (c[0] - a[0]) / L, (c[1] - a[1]) / L
        m = poly.centroid
        # the west end: whichever end of the long axis lies further west
        if ux > 0: ux, uy = -ux, -uy
        tx, ty = m.x + ux * (L / 2 - 2.6), m.y + uy * (L / 2 - 2.6)
        return [["spire", round(tx, 2), round(ty, 2), round(ctx.gelev(tx, ty), 2), round(math.atan2(uy, ux), 3), 5.2, 17.0, 13.0]]
    return []


def prior_park(ctx):
    """The mansion's porticos (John Wood the Elder, 1740s): six giant columns and a pediment on its
    north front, looking down the valley to Bath, and on its south front. The mansion is the
    tallest part of the building at Prior Park College. Where the lidar shows a portico as a low
    part of the building standing out from the front, the portico takes its place and its size;
    otherwise it goes in the middle of the front. Returns the porticos and the parts they replace."""
    at = named(ctx, "Prior Park College")
    if at is None: return [], []
    here = Point(at)
    whole = min((b["whole"] for b in ctx.buildings), key=lambda w: w.distance(here))
    if whole.distance(here) > 40: return [], []
    parts = [i for i, b in enumerate(ctx.buildings) if b["whole"] is whole]
    top = max(parts, key=lambda i: ctx.buildings[i]["eaves"] or 0)
    mansion = ctx.buildings[top]["poly"]
    m = mansion.centroid
    # the side of the mansion that faces most nearly north, and the one opposite
    ring = list(mansion.minimum_rotated_rectangle.exterior.coords)[:4]
    sides = []
    for a, c in zip(ring, ring[1:] + ring[:1]):
        mx, my = (a[0] + c[0]) / 2, (a[1] + c[1]) / 2
        L = math.hypot(mx - m.x, my - m.y) or 1
        sides.append(((mx - m.x) / L, (my - m.y) / L, L))
    north = max(sides, key=lambda s: s[1])
    out, gone = [], []
    for nx, ny, L in (north, (-north[0], -north[1], north[2])):
        tx, ty = -ny, nx
        width, height, along = 15.0, 11.0, 0.0
        # a small, lower part against this front
        for i in parts:
            b = ctx.buildings[i]
            c = b["poly"].centroid
            if i == top or b["poly"].area > 400 or b["poly"].distance(mansion) > 0.5: continue
            if (c.x - m.x) * nx + (c.y - m.y) * ny < L * 0.8 or (b["eaves"] or 0) >= ctx.buildings[top]["eaves"]: continue
            s = [(x - m.x) * tx + (y - m.y) * ty for x, y in b["poly"].exterior.coords]
            width, height, along = round(max(s) - min(s), 1), round(max(6.0, b["eaves"]), 1), (max(s) + min(s)) / 2
            gone.append(i)
            break
        # out from the mansion's middle (or the middle of the part replaced) to its wall
        ox, oy = m.x + tx * along, m.y + ty * along
        d = 0.0
        while d < L + 10 and mansion.contains(Point(ox + nx * (d + 0.5), oy + ny * (d + 0.5))): d += 0.5
        x, y = ox + nx * d, oy + ny * d
        # square it to the wall it stands against, which needn't be parallel to the mansion's
        # bounding rectangle, and centre it on that wall unless it stands in a part's place
        coords = list(mansion.exterior.coords)
        a, c = min(zip(coords, coords[1:]), key=lambda e: shapely.LineString(e).distance(Point(x, y)))
        wl = math.dist(a, c)
        if wl > 2:
            wx, wy = (c[0] - a[0]) / wl, (c[1] - a[1]) / wl
            fx, fy = (wy, -wx) if wy * nx - wx * ny > 0 else (-wy, wx)
            nx, ny = fx, fy
            if along == 0.0 and wl >= width * 0.8:
                x, y = (a[0] + c[0]) / 2, (a[1] + c[1]) / 2
        # the portico's front faces +z in its own frame, which is (sin a, -cos a) here
        ang = math.atan2(nx, -ny)
        out.append(["portico", round(x, 2), round(y, 2), round(ctx.gelev(x, y), 2), round(ang, 3), width, height])
    return out, gone


def palladian_bridge(ctx):
    """The Palladian Bridge (1755), at the water level of the lake it crosses."""
    at = named(ctx, "Palladian Bridge")
    if at is None: return []
    x, y = at
    z = ctx.gelev(x, y)
    best = None
    for w in ctx.water:
        for ring in w["r"][:1]:
            d = min(math.hypot(px - x, py - y) for px, py in ring)
            if best is None or d < best[0]: best = (d, w["z"])
    if best and best[0] < 60: z = best[1]
    return [["bridge", round(x, 2), round(y, 2), round(z, 2), 0.0]]
