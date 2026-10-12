"""Landmarks out in the rest of Bath (the full-detail squares round Combe Down, built by
tools/prep_tiles.py), placed by where they really are.

Eric's oak: on Bathampton Down an oak was planted in memory of our friend Eric Benjamin Holmes
(1978-2022), with a plaque on a post at its foot. The photo of the plaque was taken at
51.38174 N, 2.33426 W (to about 4 m), looking north-north-east (26 degrees), with the young
tree in its cage just behind and to the right of the plaque. In the game it has grown into a
mighty oak.
"""
import math

PHOTO = (-2.334264, 51.381736)     # lon, lat where the photo of the plaque was taken
FACING = 26.0                      # degrees east of north the camera looked


def place(ctx):
    x, y = ctx.proj(*PHOTO)
    b = math.radians(FACING)
    ux, uy = math.sin(b), math.cos(b)          # the way the camera looked, east and north
    # the tree stands a few metres on from the camera, the plaque between them facing back at it
    tx, ty = x + ux * 4.5, y + uy * 4.5
    # the builder's front (+z) faces the way of the angle turned about the vertical: turn it back
    # towards the camera
    angle = math.pi - (b + math.pi)
    return [["oak", round(tx, 2), round(ty, 2), round(ctx.gelev(tx, ty), 2), round(angle, 3)]]
