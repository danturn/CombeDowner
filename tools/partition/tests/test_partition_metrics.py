"""The partition's own checks, run with `python3 -m unittest discover -s tools/partition/tests`.

The loose-end metric is the one that decides whether a stage may be judged on it, and it once had a
bug that made it always pass: it measured the free end against the square as a *polygon*, whose
distance is zero for every point inside it, so the "inside" count could never be anything but zero.
These tests hold it to a point in the middle of a square (a real loose end) and a point on its
boundary (not one), so the bug cannot come back unseen.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString, box

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


if __name__ == "__main__":
    unittest.main()
