"""Bath's hand-made landmarks, for every square of the map (built by tools/prep_tiles.py, the
village in the middle included), each placed by where it really is.

Holy Trinity's spire, Prior Park's porticos and the Palladian Bridge, on Combe Down.

Twerton Park: Bath City's ground, on the High Street in Twerton, built round the football pitch
mapped there (web/src/landmarks/twerton.ts draws it). Its stands take the place of the plain
blocks they'd otherwise be drawn as, and the garden walls, hedges and trees the build would put
round those blocks are cleared from inside the ground.

Eric's oak: on Bathampton Down an oak was planted in memory of our friend Eric Benjamin Holmes
(1978-2022), with a plaque on a post at its foot. The photo of the plaque was taken at
51.38174 N, 2.33426 W (to about 4 m), looking north-north-east (26 degrees), with the young
tree in its cage just behind and to the right of the plaque. In the game it has grown into a
mighty oak.
"""
import math
import shapely
from shapely.geometry import Point, Polygon
from landmarks import named

# shop signs (tools/shops.py): names as written over the door, where the data spells them otherwise
SIGN_NAMES = {"King William IV": "The King William", "King William": "The King William",
              "The Hadley Arms Public House": "The Hadley Arms", "Forester And Flower": "The Forester & Flower",
              "The Forester and Flower": "The Forester & Flower"}
COMBE_DOWN = 1500       # metres from the map's centre (the Hadley Arms) that Combe Down's landmarks are looked for in

PHOTO = (-2.334264, 51.381736)     # lon, lat where the photo of the plaque was taken
FACING = 26.0                      # degrees east of north the camera looked


# Twerton Park's outline (OpenStreetMap's leisure=stadium, way 291442380), lon, lat
TWERTON = [(-2.396028, 51.379167), (-2.396192, 51.378747), (-2.396206, 51.378591), (-2.396164, 51.378486),
           (-2.39592, 51.378469), (-2.394452, 51.378339), (-2.394264, 51.37833), (-2.394178, 51.378325),
           (-2.394185, 51.378951), (-2.394166, 51.379289), (-2.394159, 51.379509), (-2.394559, 51.379567),
           (-2.395002, 51.379667), (-2.395516, 51.379807), (-2.396023, 51.379534), (-2.396056, 51.37949),
           (-2.396087, 51.379433), (-2.396084, 51.379372), (-2.39606, 51.379321), (-2.39602, 51.379253)]
# the ground heights sent with it: as GRID in web/src/landmarks/twerton.ts
GRID = dict(ns=13, nt=11, s=90, t=75)
# how far the stands reach in the pitch's frame (s along towards the Bristol End, t across towards
# the Popular Side), and so what's cleared from under them
STANDS = (-59, 76, -58, 49)
# the middle of Prior Park's mansion, lon, lat
MANSION = (-2.342954, 51.364532)


def replaces(ctx):
    ctx.porticos, gone = prior_park(ctx)
    return gone + twerton_stands(ctx)


def place(ctx):
    return holy_trinity(ctx) + getattr(ctx, "porticos", []) + palladian_bridge(ctx) + oak(ctx) + twerton(ctx)


def twerton_stands(ctx):
    """The stands: every unnamed building inside the ground (the clubhouse, Randall's Bar, stays)."""
    ground = Polygon([ctx.proj(x, y) for x, y in TWERTON])
    return [i for i, b in enumerate(ctx.buildings) if not b["name"] and ground.contains(b["whole"].centroid)]


def twerton(ctx):
    """["twerton", x, y, ground, angle, pitch length, pitch width, ground heights...] on the
    football pitch inside the ground, turned so the angle points along it to the Bristol (west) end."""
    ground = Polygon([ctx.proj(x, y) for x, y in TWERTON])
    c = ground.centroid
    near = [p for p in getattr(ctx, "pitches", []) if p[0] == "f" and math.hypot(p[1] - c.x, p[2] - c.y) < 60]
    if not near: return []
    _, x, y, length, width, a = min(near, key=lambda p: math.hypot(p[1] - c.x, p[2] - c.y))
    if math.cos(a) > 0: a += math.pi
    ux, uy = math.cos(a), math.sin(a)
    at = lambda s, t: (x + ux * s - uy * t, y + uy * s + ux * t)
    z = ctx.gelev(x, y)
    hs = []
    for j in range(GRID["nt"]):
        t = -GRID["t"] + 2 * GRID["t"] * j / (GRID["nt"] - 1)
        for i in range(GRID["ns"]):
            s = -GRID["s"] + 2 * GRID["s"] * i / (GRID["ns"] - 1)
            hs.append(int(round((ctx.gelev(*at(s, t)) - z) * 10)))
    s0, s1, t0, t1 = STANDS
    under = Polygon([at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)]).intersection(ground)
    ctx.clear = getattr(ctx, "clear", []) + [under]
    return [["twerton", round(x, 2), round(y, 2), round(z, 2), round(a % (2 * math.pi), 3), length, width, *hs]]


def oak(ctx):
    x, y = ctx.proj(*PHOTO)
    b = math.radians(FACING)
    ux, uy = math.sin(b), math.cos(b)          # the way the camera looked, east and north
    # the tree stands a few metres on from the camera, the plaque between them facing back at it
    tx, ty = x + ux * 4.5, y + uy * 4.5
    # the builder's front (+z) faces the way of the angle turned about the vertical: turn it back
    # towards the camera
    angle = math.pi - (b + math.pi)
    return [["oak", round(tx, 2), round(ty, 2), round(ctx.gelev(tx, ty), 2), round(angle, 3)]]


def holy_trinity(ctx):
    """A square west tower with an octagonal spire, at the west end of the church."""
    for b in ctx.buildings:
        if b["name"] != "Holy Trinity" or b["whole"].centroid.distance(Point(0, 0)) > COMBE_DOWN: continue
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
    part of the college's long range standing at MANSION, between its curved links and wings (not
    the taller block in the east wing, nor wherever a place called "Prior Park College" is: one in
    town has that name too). Where the lidar shows a
    portico as a part of the building standing out from the front, no higher than the mansion,
    the portico takes its place and its size; otherwise it goes in the middle of the front.
    Returns the porticos and the parts they replace."""
    if not ctx.buildings: return [], []
    here = Point(ctx.proj(*MANSION))
    whole = min((b["whole"] for b in ctx.buildings), key=lambda w: w.distance(here))
    if whole.distance(here) > 40: return [], []
    parts = [i for i, b in enumerate(ctx.buildings) if b["whole"] is whole]
    top = min(parts, key=lambda i: ctx.buildings[i]["poly"].distance(here))
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
            if (c.x - m.x) * nx + (c.y - m.y) * ny < L * 0.8 or (b["eaves"] or 0) > (ctx.buildings[top]["eaves"] or 0) + 0.1: continue
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
    for w in getattr(ctx, "water", []):
        for ring in w["r"][:1]:
            d = min(math.hypot(px - x, py - y) for px, py in ring)
            if best is None or d < best[0]: best = (d, w["z"])
    if best and best[0] < 60: z = best[1]
    return [["bridge", round(x, 2), round(y, 2), round(z, 2), 0.0]]
