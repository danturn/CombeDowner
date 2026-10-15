"""The partition's own checks, run with `python3 -m unittest discover -s tools/partition/tests`.

The loose-end metric is the one that decides whether a stage may be judged on it, and it once had a
bug that made it always pass: it measured the free end against the square as a *polygon*, whose
distance is zero for every point inside it, so the "inside" count could never be anything but zero.
These tests hold it to a point in the middle of a square (a real loose end) and a point on its
boundary (not one), so the bug cannot come back unseen.

Stage 2's registered parcels are checked the same way, on synthetic geometry rather than the map
data: a plot may not leave the parcel its house stands in, the parcel boundary is the evidence the
plot edge lies on, and a house outside every parcel is divided by the rules exactly as before.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString, Point, Polygon, box
from shapely.strtree import STRtree

from partition.plots import Parcels, make_plots, on_line
from partition.render import loose_ends


class LooseEndsTest(unittest.TestCase):
    def test_line_ending_in_the_middle_is_a_loose_end(self):
        square = box(0, 0, 100, 100)
        # one line stopping at the centre; its near end is held by a small obstacle, so the only
        # free end is the one in the middle
        others = box(29, 29, 31, 31)
        on_edge, inside, pts = loose_ends([LineString([(30, 30), (50, 50)])], others, square)
        self.assertEqual((on_edge, inside), (0, 1))

    def test_line_ending_on_the_boundary_is_not_a_loose_end(self):
        square = box(0, 0, 100, 100)
        # one line on to the square's boundary, its near end held, so its only free end is the edge
        others = box(49, 49, 51, 51)
        on_edge, inside, pts = loose_ends([LineString([(50, 50), (100, 50)])], others, square)
        self.assertEqual((on_edge, inside), (1, 0))

    def test_two_lines_meeting_are_not_loose(self):
        square = box(0, 0, 100, 100)
        lines = [LineString([(0, 50), (50, 50)]), LineString([(50, 50), (50, 100)])]
        on_edge, inside, pts = loose_ends(lines, None, square)
        # both far ends are on the boundary, the meeting point touches the other line
        self.assertEqual((on_edge, inside), (2, 0))

    def test_a_closed_ring_has_no_free_end(self):
        square = box(0, 0, 100, 100)
        ring = LineString([(40, 40), (60, 40), (60, 60), (40, 60), (40, 40)])
        on_edge, inside, pts = loose_ends([ring], None, square)
        # a boundary drawn as a loop has no end, so it is not a loose end
        self.assertEqual((on_edge, inside), (0, 0))


class ParcelsTest(unittest.TestCase):
    def test_index_of_says_which_parcel_a_house_stands_in(self):
        west, east = box(0, 0, 30, 100), box(30, 0, 60, 100)
        p = Parcels([west, east])
        self.assertEqual(p.index_of(box(5, 5, 15, 15)), 0)
        self.assertEqual(p.index_of(box(35, 5, 45, 15)), 1)
        # a house in no title at all is divided by the rules, so it must not be given a parcel
        self.assertIsNone(p.index_of(box(100, 100, 110, 110)))

    def test_a_parcel_boundary_is_its_own_evidence(self):
        p = Parcels([box(0, 0, 30, 100)])
        tree, lines = p.ltree, p.lines
        self.assertTrue(on_line(tree, lines, Point(0, 50), 0.1))
        self.assertFalse(on_line(tree, lines, Point(15, 50), 0.1))

    def test_a_plot_may_not_leave_the_parcel_its_house_stands_in(self):
        # one block, two houses well apart with a registered boundary between them that is *not*
        # where the rules would divide them: the bisector of the gap runs at 30, the title at 25.
        # The plot must stop at the title, which is the whole point of reading the parcels.
        block = box(0, 0, 60, 60)
        a, b = box(5, 10, 15, 25), box(45, 10, 55, 25)
        parcels = Parcels([box(0, 0, 25, 60), box(25, 0, 60, 60)])
        plots, _ = make_plots(block, list(enumerate([a, b])), [], STRtree([]), "suburb",
                              None, None, None, None, parcels=parcels, log=lambda *_: None)
        west = [g for g, kind, bi in plots if kind == "plot" and bi == 0]
        east = [g for g, kind, bi in plots if kind == "plot" and bi == 1]
        self.assertTrue(west and east, "both houses keep a plot")
        self.assertLessEqual(max(g.bounds[2] for g in west), 25.5)
        self.assertGreaterEqual(min(g.bounds[0] for g in east), 24.5)


if __name__ == "__main__":
    unittest.main()
