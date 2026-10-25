"""The edge_through_building check: an edge *along* a wall is not through it.

The check reports a drawn plot edge that runs through a footprint, which is a defect the player sees -
a block cut with a line the building should have stopped. Its first form tested the edge's *midpoint*
with `footprint.contains(m)`, and a plot edge against its own house runs along the wall, so every
point of it is on the footprint's boundary and the test was a coin toss on the last bit of a float.
Measured on the city: 104 findings, **all 104** at 0.000 m inside the footprint, and stage 3's own
23 had 21 the same way. The check was reporting walls as crossings.

The rule now: the edge's interior enters the footprint, tested as more than `ETB_MIN` of the edge
inside the footprint **shrunk by `ETB_SHRINK`**. These tests hold both halves of that - a real
crossing is still reported, and a wall is not - because a refinement that reports nothing would also
pass a test that only checked the wall case.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString, Polygon

from partition.checks import ETB_MIN, ETB_SHRINK, edges_through_buildings


class EdgeThroughBuildingTest(unittest.TestCase):
    """One 10 x 10 footprint, and edges in the four positions that matter."""

    HOUSE = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])

    def check(self, edge, kind="fence"):
        return edges_through_buildings(0, 0, [(edge, kind, 1.0, "parcel")], [self.HOUSE])

    def test_an_edge_straight_through_the_middle_is_reported(self):
        got = self.check(LineString([(-5, 5), (15, 5)]))
        self.assertEqual(len(got), 1, "a boundary through a house is the defect the check is for")
        self.assertEqual(got[0]["rule"], "edge_through_building")

    def test_an_edge_along_the_wall_is_not_reported(self):
        # the plot edge against its own house: every point of it is on the footprint's boundary
        self.assertEqual(self.check(LineString([(-5, 0), (15, 0)])), [],
                         "an edge along a wall is not through it")

    def test_the_old_midpoint_rule_turned_on_a_nanometre(self):
        # Why this needed changing rather than tightening, stated as a test: the wall at y=0 is not
        # inside the footprint, the same wall at y=+1e-9 is, and the old rule tested exactly that.
        # So a boundary sharing a line with a footprint - which is what a plot edge against its own
        # house *is* - was reported or not by the last bit of a float (measured on the city: 104
        # findings, all 104 at 0.000 m inside the footprint).
        from shapely.geometry import Point
        house = self.HOUSE
        self.assertFalse(house.contains(Point(5, 0.0)), "the wall itself is not inside")
        self.assertTrue(house.contains(Point(5, 1e-9)), "one nanometre in, it is")
        # and the refined rule reports neither, because both are the wall
        self.assertEqual(self.check(LineString([(-5, 0.0), (15, 0.0)])), [])
        self.assertEqual(self.check(LineString([(-5, 1e-9), (15, 1e-9)])), [])

    def test_an_edge_just_outside_the_wall_is_not_reported(self):
        self.assertEqual(self.check(LineString([(-5, -0.02), (15, -0.02)])), [])

    def test_an_edge_just_inside_the_wall_is_not_reported(self):
        # 1 cm inside is within the shrink, so it is still the wall, not a crossing
        self.assertEqual(self.check(LineString([(-5, 0.01), (15, 0.01)])), [],
                         f"an edge within {ETB_SHRINK} m of the wall is not through it")

    def test_a_grazing_edge_crossing_the_corner_by_under_the_floor_is_not_reported(self):
        # a corner clip: it enters the shrunk footprint by less than ETB_MIN
        edge = LineString([(-1, -1), (0.02, 0.02)])
        got = self.check(edge)
        self.assertEqual(got, [], f"a crossing of under {ETB_MIN} m is not one the player sees")

    def test_a_short_but_real_crossing_is_reported(self):
        # 30 cm through the shrunk footprint, on an edge long enough to be worth testing (the check
        # skips an edge under 2 m, as a plot edge that short is a sliver rather than a boundary)
        edge = LineString([(5, -1), (5, 1.5)])
        got = self.check(edge)
        self.assertEqual(len(got), 1, "a real crossing is reported however short")

    def test_a_footprint_thinner_than_the_shrink_reports_nothing(self):
        # a footprint 8 cm thick has no interior once shrunk by 5 cm: nothing can be inside it, and
        # the check must not fail on the empty geometry that leaves
        sliver = Polygon([(0, 0), (10, 0), (10, 0.08), (0, 0.08)])
        got = edges_through_buildings(0, 0, [(LineString([(-5, 0.04), (15, 0.04)]), "fence", 1.0,
                                             "parcel")], [sliver])
        self.assertEqual(got, [], "a footprint thinner than the shrink has no interior to cross")

    def test_a_segment_kind_none_is_never_reported(self):
        # `none` is a segment `classify_edges` drops: it is not drawn, so it cannot be a defect
        got = edges_through_buildings(0, 0, [(LineString([(-5, 5), (15, 5)]), "none", 1.0, "parcel")],
                                      [self.HOUSE])
        self.assertEqual(got, [])


if __name__ == "__main__":
    unittest.main()
