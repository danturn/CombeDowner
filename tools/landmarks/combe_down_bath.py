"""Landmarks out in the rest of Bath (the full-detail squares round Combe Down, built by
tools/prep_tiles.py), placed by where they really are.

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
from shapely.geometry import Polygon

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


def replaces(ctx):
    """The stands: every unnamed building inside the ground (the clubhouse, Randall's Bar, stays)."""
    ground = Polygon([ctx.proj(x, y) for x, y in TWERTON])
    return [i for i, b in enumerate(ctx.buildings) if not b["name"] and ground.contains(b["whole"].centroid)]


def place(ctx):
    return oak(ctx) + twerton(ctx)


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
