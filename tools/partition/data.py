"""The raw layers, read once and indexed, so a pass can ask what is near a box.

Stage 3b builds each *thing* once - a street edge, a worked block - with a window sized to the
thing rather than to the square. A pass therefore asks for the buildings, barriers, parcels, land
use and lidar wall runs near an arbitrary box many times per square, and `load_layer` re-reads a
whole layer file on every call, which is fine once per square and hopeless once per edge. So the
layers are read once here, converted to map metres, and indexed; a pass asks `near(bbox, layer)`
and gets back only what it needs.

The lidar wall runs are per square (`data/<map>/measured/<ti>_<tj>.zip`), so a window that crosses
squares needs the runs of every square it touches: `ridges_near` gathers them and drops the ones
outside the window's own margin, so a window sees exactly the runs it covers.
"""
import json
import lzma
import os
import zipfile

import shapely
from shapely.geometry import LineString, box
from shapely.strtree import STRtree

from . import MAP, Q, ROOT, load_layer
from .corridors import REACH

SIZE = Q.dx * Q.cells


def owner_of(bounds):
    """Which square owns a thing, by geometry only: the square holding its midpoint, the midpoint
    being the centre of its bounding box. Never by order of discovery, so the same thing is owned
    by the same square however many processes ran and in whatever order."""
    x0, y0, x1, y1 = bounds
    ti = int((((x0 + x1) / 2 - Q.x0) // SIZE))
    tj = int((((y0 + y1) / 2 - Q.y0) // SIZE))
    return ti, tj


def box_of(ti, tj):
    return (Q.x0 + ti * SIZE, Q.y0 + tj * SIZE, Q.x0 + (ti + 1) * SIZE, Q.y0 + (tj + 1) * SIZE)


def squares_over(bounds, pad=0.0):
    """Every square a box touches (grown by pad), as (ti, tj) in a fixed order."""
    x0, y0, x1, y1 = bounds
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    a, b = int((x0 - Q.x0) // SIZE), int((y0 - Q.y0) // SIZE)
    c, d = int((x1 - Q.x0) // SIZE), int((y1 - Q.y0) // SIZE)
    return [(ti, tj) for ti in range(a, c + 1) for tj in range(b, d + 1)]


def neighbours(ti, tj):
    """The square and the eight round it, in a fixed order."""
    return [(ti + i, tj + j) for i in (-1, 0, 1) for j in (-1, 0, 1)]


def load_ridges(raw, ti, tj):
    """The lidar wall runs the build kept for one square (data/<map>/measured/<ti>_<tj>.zip)."""
    ridges = []
    mz = os.path.join(ROOT, "data", MAP, "measured", f"{ti}_{tj}.zip")
    if os.path.exists(mz):
        with zipfile.ZipFile(mz) as z:
            if "walls.json.xz" in z.namelist():
                for w in json.loads(lzma.decompress(z.read("walls.json.xz"))):
                    ridges.append((LineString(w["p"]), w["c"], w["h"]))
    return ridges


class Data:
    """The layers a pass reads, in map metres, indexed once.

    `near(bbox, what)` returns the items of one layer that touch bbox. The layers are the Overture
    and OpenStreetMap files for the whole wide area, so they are read once for a whole pass rather
    than once per query. `ridges_near` is the exception: the lidar wall runs are per square, so it
    reads the squares a window touches and caches them."""

    LAYERS = ("building", "osm-roads", "infrastructure", "land_use", "parcels")

    def __init__(self, raw, bbox, log=print):
        self.raw = raw
        self.items = {}
        for name in self.LAYERS:
            got = load_layer(raw, name, bbox)
            self.items[name] = got
            log(f"  data: {name} {len(got)}")
        self.trees = {n: STRtree([g for g, _ in got]) for n, got in self.items.items()}
        self._ridges = {}

    def near(self, bbox, what):
        """The items of one layer touching bbox."""
        got = self.items[what]
        tree = self.trees[what]
        B = box(*bbox)
        return [got[int(k)] for k in tree.query(B) if got[int(k)][0].intersects(B)]

    def lines_near(self, bbox, what):
        """Only the linear items of a layer touching bbox (the layers hold mixed geometry)."""
        return [(g, p) for g, p in self.near(bbox, what) if g.geom_type in ("LineString", "MultiLineString")]

    def polys_near(self, bbox, what):
        return [(g, p) for g, p in self.near(bbox, what) if g.geom_type in ("Polygon", "MultiPolygon")]

    def ridges_near(self, bbox):
        """The lidar wall runs within bbox: the runs of every square the box touches, from the
        measurement files, cached per square so a pass reads each square's file once."""
        x0, y0, x1, y1 = bbox
        out = []
        for ti, tj in squares_over(bbox, pad=REACH):
            if (ti, tj) not in self._ridges:
                self._ridges[(ti, tj)] = load_ridges(self.raw, ti, tj)
            for g, c, h in self._ridges[(ti, tj)]:
                if g.intersects(box(x0 - REACH, y0 - REACH, x1 + REACH, y1 + REACH)):
                    out.append((g, c, h))
        return out
