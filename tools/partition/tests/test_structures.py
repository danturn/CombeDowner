"""Bridges and road heights (`tools/structures.py`): the pure parts, on small invented streets."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString

import partition  # noqa: F401  (puts tools/ on the path)
from structures import (chain_edges, drop_empty_spans, follow_ground, grow_marks, level_structures,
                        match_structures, split_back)


def edge(i, pts, cls="residential"):
    return dict(id=i, cls=cls, line=LineString(pts), struct={})


class Structures(unittest.TestCase):
    def test_a_bridge_flag_lands_on_the_edge_it_runs_along(self):
        edges = [edge(0, [(0, 0), (100, 0)]), edge(1, [(0, 10), (100, 10)])]
        seg = LineString([(0, 0.5), (100, 0.5)])
        out = match_structures(edges, [(seg, {"class": "residential",
                                              "road_flags": [{"values": ["is_bridge"], "between": [0.4, 0.6]}]})])
        self.assertEqual(list(out), [0])
        (a, b), = out[0]["bridge"]
        self.assertAlmostEqual(a, 40, delta=1.5)
        self.assertAlmostEqual(b, 60, delta=1.5)

    def test_a_footway_bridge_does_not_mark_the_street_beside_it(self):
        edges = [edge(0, [(0, 0), (100, 0)])]
        seg = LineString([(0, 1), (100, 1)])
        out = match_structures(edges, [(seg, {"class": "footway",
                                              "road_flags": [{"values": ["is_bridge"], "between": [0.0, 1.0]}]})])
        self.assertEqual(out, {})

    def test_the_approach_is_held_level_to_the_highest_point_back_from_a_bridge(self):
        run = [[i * 4.0, 0, i / 20] for i in range(21)]
        z = [10.0 - abs(i - 4) * 0.2 for i in range(21)]
        z = level_structures(run, z, [(0.4, 0.6)])
        self.assertEqual(z[4], z[7])

    def test_two_edges_that_carry_straight_on_are_one_road_but_a_side_street_is_not(self):
        edges = [edge(0, [(0, 0), (50, 0)]), edge(1, [(50, 0), (100, 0)]), edge(2, [(50, 0), (50, 40)])]
        roads = chain_edges(edges)
        self.assertEqual(sorted(sorted(e["id"] for e, _ in c) for c in roads), [[0, 1], [2]])

    def test_a_span_that_meets_the_ground_runs_out_to_it_by_a_few_points_only(self):
        span = {5}
        grow_marks([10.0] * 12, [0.0] * 12, span, set())
        self.assertEqual(span, {2, 3, 4, 5, 6, 7, 8})

    def test_a_road_off_a_span_stays_within_reach_of_the_ground(self):
        z = follow_ground([5.0, 5.0, 5.0], [0.0, 4.8, 9.0], {0}, set())    # (point 0 is a span; point 2 is 4 m low)
        self.assertEqual(z[:2], [5.0, 5.0])
        self.assertAlmostEqual(z[2], 8.6)

    def test_a_bridge_with_nothing_under_it_is_cleared(self):
        road = dict(p=[[0, 0, 5.0], [4, 0, 5.0, 1], [8, 0, 5.0, 1], [12, 0, 5.0]])
        n = drop_empty_spans([road], lambda x, y: 5.0, [LineString([(0, 50), (1, 50), (1, 51)]).buffer(1)],
                             [LineString([(0, 30), (10, 30)])])
        self.assertEqual(n, 1)
        self.assertTrue(all(len(q) == 3 for q in road["p"]))

    def test_each_edge_gets_its_own_back_from_a_through_road(self):
        r = dict(parts=[(7, False, 0, 2), (9, True, 2, 4)], z=[1, 2, 3, 4, 5], span={3}, deck=set(), bored=[])
        out = split_back(r)
        self.assertEqual(out[7]["z"], [1, 2, 3])
        self.assertEqual(out[9]["z"], [5, 4, 3])
        self.assertEqual(out[9]["span"], [1])


if __name__ == "__main__":
    unittest.main()
