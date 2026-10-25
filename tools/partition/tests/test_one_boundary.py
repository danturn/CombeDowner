"""One fence, one boundary.

The street's edge, the walls the lidar sees, the registered parcels and the guessed divisions each
describe the same fences in their own way. Where two of them trace one fence a little apart, or
leave one corner at a shallow angle, the weaker gives way and its ends are carried on to the
stronger, so the fence is drawn once.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString

from partition.plots import TWIN, _one_boundary


def _lines(ranked, ways=()):
    return [g for t in _one_boundary(ranked, ways=ways) for g in t[1]]


def length_near(lines, other, d=0.6):
    return sum(l.intersection(other.buffer(d)).length for l in lines)


class OneBoundaryTest(unittest.TestCase):

    def test_a_parcel_line_alongside_the_street_gives_way(self):
        street = LineString([(0, 0), (50, 0)])
        parcel = LineString([(10, 0.4), (40, 0.4)])
        out = _lines([[street], [parcel]])
        self.assertLess(length_near(out, LineString([(12, 0.4), (38, 0.4)]), 0.1), 0.5,
                        "the parcel's copy of the street's edge is not drawn")

    def test_a_line_crossing_at_a_right_angle_is_kept_whole(self):
        street = LineString([(0, 0), (50, 0)])
        side = LineString([(20, 0), (20, 30)])
        out = _lines([[street], [side]])
        self.assertAlmostEqual(sum(l.length for l in out), 30.0, places=3)

    def test_a_wedge_at_a_shared_corner_closes(self):
        # two fences leave the corner 10 degrees apart: for the first few metres they are one fence
        held = LineString([(0, 0), (30, 0)])
        wedge = LineString([(0, 0), (30, 5.3)])
        out = _lines([[held], [wedge]])
        self.assertTrue(out, "the part beyond the shared stretch stands")
        start = min(min(l.coords[0][0], l.coords[-1][0]) for l in out)
        self.assertGreater(start, 4.0, "the shared stretch from the corner is gone")
        self.assertLess(min(l.distance(held) for l in out), 0.1, "the rest still meets the fence")

    def test_two_fences_further_apart_both_stand(self):
        a = LineString([(0, 0), (30, 0)])
        b = LineString([(0, TWIN + 0.5), (30, TWIN + 0.5)])
        out = _lines([[a], [b]])
        self.assertAlmostEqual(sum(l.length for l in out), 30.0, places=3)

    def test_a_mapped_passage_between_two_fences_keeps_both(self):
        a = LineString([(0, 0), (30, 0)])
        b = LineString([(0, 1.0), (30, 1.0)])
        alley = LineString([(0, 0.5), (30, 0.5)])
        out = _lines([[a], [b]], ways=[alley])
        self.assertAlmostEqual(sum(l.length for l in out), 30.0, places=3)

    def test_within_a_rank_the_first_line_holds(self):
        a = LineString([(0, 0), (30, 0)])
        b = LineString([(0, 0.3), (30, 0.3)])
        out = _lines([[], [a, b]])
        self.assertAlmostEqual(max(l.length for l in out), 30.0, places=3)
        self.assertLess(length_near(out, LineString([(1, 0.3), (29, 0.3)]), 0.1), 0.5,
                        "the second copy is gone")


if __name__ == "__main__":
    unittest.main()
