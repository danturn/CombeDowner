"""The build-once passes' own tests, run with `python3 -m unittest discover -s tools/partition/tests`.

Stage 3b's whole claim is that a thing built once has no second version to disagree with, which
rests on each pass being a **pure function of the thing and the data around it**: fitting the same
street edge from two different windows must give the same fit, and computing a worked block's
outline from two different windows must give the same outline. If either depended on its window,
squares would disagree again and the design would be back where stage 3 left it.

These use the real map data (the layers are small enough to read, and the point is the real
geometry), so they need `data/raw/combe-down/wide` unpacked: `python3 -I tools/mapdata.py unpack
combe-down`.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from partition import ROOT
from partition.corridors import PATHS
from partition.data import Data
from partition import once

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


if __name__ == "__main__":
    unittest.main()
