"""Thin arms between two neighbours.

A neck of open ground a metre wide that runs between two gardens has a boundary down each side, a
hand's width apart: the player sees two hedges where there should be one. The arm goes to the
neighbour it lies against for longer, and the two boundaries become one.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union

from partition.plots import ARM_WIDTH, _absorb_thin_arms, _thin_arms


def scene(arm_width=1.0, right_label=("plot", 2)):
    """An open yard with an arm running up between a wide garden on the left (x 0..20) and a
    narrower one on the right, both y 10..30. The yard is y 0..10 and the arm y 10..30."""
    left = box(0, 10, 20, 30)
    right = box(20 + arm_width, 10, 30 + arm_width, 30)
    yard = unary_union([box(0, 0, 30 + arm_width, 10), box(20, 10, 20 + arm_width, 30)])
    return [left, yard, right], [("plot", 1), ("open",), right_label]


class ThinArmTest(unittest.TestCase):

    def test_an_arm_between_two_gardens_is_found(self):
        faces, labels = scene(1.0)
        arms = _thin_arms(faces, labels, [])
        self.assertEqual(len(arms), 1)
        arm, target, _, _ = arms[0]
        self.assertAlmostEqual(arm.area, 20.0, delta=2.0)
        self.assertIn(target, (("plot", 1), ("plot", 2)))

    def test_a_wide_neck_is_ground_not_an_arm(self):
        faces, labels = scene(ARM_WIDTH + 1.0)
        self.assertEqual(_thin_arms(faces, labels, []), [])

    def test_a_mapped_way_along_it_keeps_it(self):
        faces, labels = scene(1.0)
        way = LineString([(20.5, 12), (20.5, 28)])
        self.assertEqual(_thin_arms(faces, labels, [way]), [])

    def test_an_arm_against_a_street_on_one_side_is_left(self):
        left = box(0, 10, 20, 30)
        yard = unary_union([box(0, 0, 30, 10), box(20, 10, 21, 30)])
        self.assertEqual(_thin_arms([left, yard], [("plot", 1), ("open",)], []), [],
                         "only one neighbour: the other side is the block's edge")

    def test_a_garden_is_not_left_with_nothing(self):
        left = box(0, 10, 20, 30)
        sliver_plot = box(20, 10, 21, 30)
        right = box(21, 10, 40, 30)
        self.assertEqual(_thin_arms([left, sliver_plot, right],
                                    [("plot", 1), ("plot", 3), ("plot", 2)], []), [],
                         "a plot that is only a strip keeps it")

    def test_giving_the_arm_away_leaves_one_shared_edge(self):
        faces, labels = scene(1.0)
        region = unary_union(faces)
        lines = unary_union([region.boundary] + [f.boundary for f in faces])
        _, new_faces, new_labels = _absorb_thin_arms(region, lines, faces, labels, [],
                                                     log=lambda *_: None)
        self.assertEqual(sum(1 for lab in new_labels if lab == ("open",)),
                         1, "only the yard stays open")
        self.assertAlmostEqual(sum(f.area for f in new_faces), region.area, delta=0.5)
        arm_probe = Point(20.5, 20)
        owner = [lab for f, lab in zip(new_faces, new_labels) if f.contains(arm_probe)]
        self.assertEqual(len(owner), 1)
        self.assertEqual(owner[0][0], "plot")


if __name__ == "__main__":
    unittest.main()
