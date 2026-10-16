"""The build-once passes' own tests, run with `python3 -m unittest discover -s tools/partition/tests`.

Stage 3b's whole claim is that a thing built once has no second version to disagree with. Three
properties carry it, and these test all three:

- a street edge's fit is a pure function of the edge and what stands beside it, so fitting it from
  one window and from a larger one gives the same answer;
- a worked block reaches no further than REACH_GROW from a building, so a window sized to the piece
  holds every building that can shape it - which is what lets a square divide its own pieces and
  still agree with its neighbours;
- the ground beyond a *worked piece* is the rest of its parent block, which is open land, and only
  beyond the parent block is it a street. Labelling it a street turned a plot against open land into
  a `front` ending where the piece outline turned away from any real street.

If any failed, neighbouring squares would disagree again and the design would be back where stage 3
left it. The first two need the real map data, so they skip unless `data/raw/combe-down/wide` is
unpacked (`python3 -I tools/mapdata.py unpack combe-down`) and a pass 1 and pass 2 run exist in
`out/once-p1`.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import numpy as np
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from partition import ROOT, once
from partition.corridors import PATHS
from partition.data import Data
from partition.plots import REACH_GROW, building_axes, front_normals, make_plots
from partition.render import loose_ends

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
    """Pass 2: a worked block's outline, and the labelling of the ground beyond it.

    The outline claim is what makes two squares agree about a block: it is a function of the whole
    building and corridor sets (pass 2 computes it once and writes it), not of the window a square
    happens to be dividing. The labelling claim is Dan's: beyond a *piece* is the rest of the parent
    block, which is open land."""

    def test_every_worked_block_is_within_reach_grow_of_a_building(self):
        # This is the invariant that makes a window sized to the piece sufficient, and so the reason
        # a square can divide its own pieces and still agree with its neighbours. A worked block is
        # `block ∩ buffer(all buildings, REACH_GROW)`, so every point of one is within REACH_GROW of
        # a building; a window grown by REACH_GROW round a piece therefore holds every building that
        # can reach it, and the piece computed from that window alone is the city-wide piece.
        pieces = [once._poly_from(r["xy"]) for r in json.load(open(os.path.join(GRAPH, "blocks.json")))]
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
        pieces = [once._poly_from(r["xy"]) for r in json.load(open(os.path.join(GRAPH, "blocks.json")))]
        for piece in pieces[::300]:
            with self.subTest(bounds=tuple(round(v, 1) for v in piece.bounds)):
                self.assertEqual(piece.geom_type, "Polygon", "a worked block is one piece")


class PieceOutlineLabelTest(unittest.TestCase):
    """The ground beyond a worked piece is the rest of its parent block - open land - not a street.

    A block holding one house near one edge and a field running 200 m the other way. The worked piece
    ends REACH_GROW (60 m) from the house, so most of the piece's outline is deep inside the field.
    Giving `make_plots` the parent block labels that ground open, so the plot's edge along the outline
    is a plain plot-against-open boundary - a fence - and it closes on itself. Without the parent it
    was labelled a street, making the edge a `front` with the zone's material, ending where the piece
    outline turned away from any real street."""

    def field(self, with_parent):
        block = box(0, 0, 300, 200)
        house = box(140, 8, 160, 24)                     # one house, at the south edge
        street = LineString([(-50, -12), (350, -12)])    # the street it fronts
        piece = block.intersection(house.buffer(REACH_GROW))
        if piece.geom_type != "Polygon":
            piece = max(piece.geoms, key=lambda g: g.area)
        axes = {0: building_axes([house])[0]}
        fronts = front_normals([house], [axes[0]], STRtree([street]), [street])
        plots, edges = make_plots(piece, [(0, house)], [], STRtree([]), "suburb", axes, fronts,
                                  unary_union([house]), box(-40, -40, 340, 240),
                                  parent=block if with_parent else None, log=lambda *_: None)
        return plots, edges, piece, block

    def test_the_field_beyond_the_piece_is_not_labelled_a_street(self):
        _plots, edges, piece, _block = self.field(with_parent=True)
        along = [(g, la, lb) for g, la, lb in edges
                 if g.intersection(piece.boundary.buffer(0.05)).length > 0.5 * g.length]
        self.assertTrue(along, "the piece outline should carry a boundary")
        # the piece's outline away from the block's own south edge must not be a street or a front
        crossings = [(la, lb) for g, la, lb in along
                     if ("corridor",) in (la, lb) or la[0] == "front" or lb[0] == "front"]
        # exactly one may be: the piece's south edge lies on the block's south edge, where the
        # ground beyond really is the street the house fronts
        self.assertLessEqual(len(crossings), 1,
                             f"the field beyond the piece is labelled a street: {crossings}")

    def test_without_the_parent_the_same_outline_is_labelled_a_street(self):
        # the test above fails on the old code, and this is the difference it fixes, so the guard is
        # shown to bite rather than assumed to
        _plots, edges, piece, _block = self.field(with_parent=False)
        along = [(g, la, lb) for g, la, lb in edges
                 if g.intersection(piece.boundary.buffer(0.05)).length > 0.5 * g.length]
        crossings = [(la, lb) for g, la, lb in along
                     if ("corridor",) in (la, lb) or la[0] == "front" or lb[0] == "front"]
        self.assertGreater(len(crossings), 1,
                           "without the parent block the outline should be labelled a street")

    def test_the_piece_outline_leaves_no_loose_end(self):
        _plots, edges, _piece, block = self.field(with_parent=True)
        drawn = [g for g, la, lb in edges if la != lb]
        _on, inside, pts = loose_ends(drawn, unary_union([block]), box(-40, -40, 340, 240))
        self.assertEqual(inside, 0, f"the piece outline leaves loose ends: "
                                    f"{[(round(p.x), round(p.y)) for p in pts]}")


if __name__ == "__main__":
    unittest.main()
