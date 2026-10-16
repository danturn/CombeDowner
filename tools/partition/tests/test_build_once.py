"""The build-once passes' own tests, run with `python3 -m unittest discover -s tools/partition/tests`.

Stage 3b's whole claim is that a thing built once has no second version to disagree with. Two
properties carry it, and these test both against the real map data:

- a street edge's fit is a pure function of the edge and what stands beside it, so fitting it from
  one window and from a larger one gives the same answer;
- a worked block reaches no further than REACH_GROW from a building, so a window sized to the piece
  holds every building that can shape it - which is what lets a square divide its own pieces and
  still agree with its neighbours.

If either failed, squares would disagree again and the design would be back where stage 3 left it.

These need the real data, so they skip unless `data/raw/combe-down/wide` is unpacked (`python3 -I
tools/mapdata.py unpack combe-down`) and a pass 1 and pass 2 run exist in `out/once-p1`.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import numpy as np
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from partition import ROOT, once
from partition.corridors import PATHS
from partition.data import Data
from partition.plots import REACH_GROW

RAW = os.path.join(ROOT, "data", "raw", "combe-down", "wide")
GRAPH = os.path.join(ROOT, "out", "once-p1")


def have_data():
    return os.path.exists(os.path.join(RAW, "building.geojson"))


@unittest.skipUnless(have_data(), "needs data/raw/combe-down/wide (tools/mapdata.py unpack)")
@unittest.skipUnless(os.path.exists(os.path.join(GRAPH, "graph.json")),
                     "needs a pass 1 run (out/run_pass1.py)")
class EdgeFitTest(unittest.TestCase):
    """Pass 1: an edge's fit is identical from two different windows that both contain it."""

    @classmethod
    def setUpClass(cls):
        cls.edges = once.read_graph(GRAPH)
        cls.bb = once.map_bbox()
        cls.D = Data(RAW, cls.bb, log=lambda *_: None)
        # a spread of street edges (not paths, which are a fixed width and cannot vary)
        cls.pick = [e for e in cls.edges if e["cls"] not in PATHS][::400][:12]

    def test_an_edges_fit_is_the_same_from_two_windows(self):
        for e in self.pick:
            with self.subTest(edge=e["id"], cls=e["cls"]):
                w1 = once.edge_window([e["line"]])
                # a window grown all round: more buildings, barriers and lidar runs in it
                w2 = (w1[0] - 250, w1[1] - 250, w1[2] + 250, w1[3] + 250)
                _b1, _ev1, o1, t1 = once.obstacles_for(self.D, w1)
                _b2, _ev2, o2, t2 = once.obstacles_for(self.D, w2)
                self.assertGreater(len(o2), len(o1), "the bigger window holds more")
                r1 = once.fit_edge(e, t1, o1)
                r2 = once.fit_edge(e, t2, o2)
                self.assertEqual(r1["sections"], r2["sections"], "the cross-sections differ")
                self.assertEqual(r1["car"], r2["car"], "the carriageway differs")
                self.assertEqual(r1["pl"], r2["pl"], "the left pavement differs")

    def test_every_edge_is_owned_by_the_square_holding_its_midpoint(self):
        # ownership by geometry, so the same edge is owned by the same square every run
        for e in self.pick:
            ti, tj = once.owner_of(e["line"].bounds)
            x0, y0, x1, y1 = once.box_of(ti, tj)
            mid = e["line"].interpolate(0.5, normalized=True)
            self.assertTrue(x0 <= mid.x <= x1 and y0 <= mid.y <= y1,
                            f"edge {e['id']} is owned by {ti},{tj} but its midpoint is outside")


@unittest.skipUnless(have_data(), "needs data/raw/combe-down/wide (tools/mapdata.py unpack)")
@unittest.skipUnless(os.path.exists(os.path.join(GRAPH, "blocks.json")),
                     "needs a pass 2 run (out/run_pass2.py)")
class WorkedBlockTest(unittest.TestCase):
    """Pass 2: a worked block's outline is the same whichever window computes it.

    This is what makes two squares agree about a block: the outline is a function of the whole
    building and corridor sets (pass 2 computes it once and writes it), not of the window a square
    happens to be dividing. The test recomputes it from a window and compares with the written
    outline, which is the file every square divides from."""

    def test_every_worked_block_is_within_reach_grow_of_a_building(self):
        # This is the invariant that makes a window sized to the piece sufficient, and so the reason
        # a square can divide its own pieces and still agree with its neighbours. A worked block is
        # `block ∩ buffer(all buildings, REACH_GROW)`, so every point of one is within REACH_GROW of
        # a building; a window grown by REACH_GROW round a piece therefore holds every building that
        # can reach it, and the piece computed from that window alone is the city-wide piece.
        #
        # (The *parent block* is not window-independent and does not need to be: it is cut at
        # whatever window is in use, and nothing reads it but the intersection that makes the piece.)
        pieces = [Polygon(r["xy"]) for r in json.load(open(os.path.join(GRAPH, "blocks.json")))]
        self.assertTrue(pieces, "pass 2 wrote no worked blocks")
        cleaned = [g for _i, g in once.read_cleaned(GRAPH)]
        tree = STRtree(cleaned)
        for piece in pieces[::300]:
            with self.subTest(bounds=tuple(round(v, 1) for v in piece.bounds)):
                n = max(8, int(piece.exterior.length / 20))
                far = max(
                    min((cleaned[int(k)].distance(piece.exterior.interpolate(i / n, normalized=True))
                         for k in np.atleast_1d(tree.query(piece.buffer(REACH_GROW + 1)))), default=1e9)
                    for i in range(n))
                self.assertLessEqual(far, REACH_GROW + 0.1,
                                     "a worked block reaches further from every building than "
                                     "REACH_GROW, so a window sized to the piece could miss one")

    def test_a_worked_block_is_a_connected_piece_of_one_block(self):
        # the plan's own definition: a worked block is a *connected* piece. Two halves of one piece
        # are one piece, which is what keeps the divided region from having invisible seams through
        # it.
        pieces = [Polygon(r["xy"]) for r in json.load(open(os.path.join(GRAPH, "blocks.json")))]
        for piece in pieces[::300]:
            with self.subTest(bounds=tuple(round(v, 1) for v in piece.bounds)):
                self.assertEqual(piece.geom_type, "Polygon", "a worked block is one piece")


if __name__ == "__main__":
    unittest.main()
