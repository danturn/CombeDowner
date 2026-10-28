"""A way written into a square keeps its own corners, and is still sampled evenly between them.

Sampled only every SEGMENT metres, a dog-leg path between two gardens folded into a diagonal through
both. Synthetic: no map data, so it runs everywhere in milliseconds.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString, Point

from partition.corridors import line_corners
from partition.write_tile import CORNER_GAP, SEGMENT, stretch_samples


class PathCornerTest(unittest.TestCase):
    def test_dog_leg_keeps_both_corners(self):
        line = LineString([(0, 0), (10, 0), (10, 3), (20, 3)])
        corners = line_corners(line, "footway")
        self.assertEqual(corners, [10.0, 13.0])
        ts = stretch_samples(0.0, line.length, corners)
        drawn = LineString([line.interpolate(t).coords[0] for t in ts])
        for c in line.coords:
            self.assertLess(drawn.distance(Point(c)), 1e-6)
        self.assertTrue(all(b - a <= SEGMENT + 1e-9 for a, b in zip(ts, ts[1:])))
        self.assertTrue(all(b - a >= CORNER_GAP - 1e-9 for a, b in zip(ts, ts[1:])))

    def test_gentle_bend_is_sampled_as_before(self):
        line = LineString([(0, 0), (10, 0), (20, 0.5)])
        self.assertEqual(line_corners(line, "footway"), [])
        ts = stretch_samples(0.0, line.length, [])
        self.assertEqual(len(ts), int(line.length / SEGMENT) + 2)

    def test_steps_keep_every_landing(self):
        line = LineString([(0, 0), (2, 0), (4, 0.1)])
        self.assertEqual(len(line_corners(line, "steps")), 1)


if __name__ == "__main__":
    unittest.main()
