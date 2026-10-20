"""`walls_and_gates`: the gates and the walls are cut from one interval list, and the road rule.

A wall in the game is built from the `br` points as one continuous run, and `gt` is never subtracted
from it (`map.ts` walks `d.br[k].p` and adds a segment per pair). So a gate is a hole only if the wall
stops and starts again either side of it. The first version of this writer wrote each run straight
through and then added the gate rows beside it, which made 648 of 802 gates on square 0,3 decoration:
the player walks at the gap and hits the wall. Against 2 of 658 in the old build.

The tests below pin the four positions that decided the design - an opening in the middle of one edge,
one spanning two merged edges, one at a run's end, and a run drawn backwards - plus the road rules
that were already there.

Synthetic: no map data, no pass output, so it runs everywhere in milliseconds.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString, Point, box

from partition.write_tile import (MIN_PIECE, ROAD_CLEAR, _outside_roads, road_clearance,
                                  walls_and_gates)

SQ = (0.0, 0.0, 200.0, 200.0)
FLAT = lambda x, y: 10.0
STYLE = "garden_wall"


def edge(pts, kind=STYLE, sides=(("corridor",), ("plot", 7))):
    return dict(kind=kind, source="front", support=1.0,
                sides=[list(s) for s in sides], xy=[list(p) for p in pts])


def gate(eid, t, width=1.0, kind="gate"):
    return dict(edge=eid, t=t, width=width, kind=kind)


def part(edges, openings):
    return dict(edges=edges, openings=openings,
                faces=[dict(cls="carriageway", xy=[[300, 0], [400, 0], [400, 10], [300, 10]])])


def runs_of(br):
    return [LineString([(p[0], p[1]) for p in b["p"]]) for b in br]


class GateInOneEdgeTest(unittest.TestCase):
    """A 20 m wall with a gate in the middle of it."""

    def test_the_wall_stops_and_starts_at_the_gate(self):
        br, gt, _ = walls_and_gates(part([edge([(10, 0), (10, 20)])], [gate(0, 10.0)]),
                                    SQ, FLAT)
        self.assertEqual(len(gt), 1, "the gate is written")
        self.assertEqual(len(br), 2, "and the wall is two runs, either side of it")
        self.assertAlmostEqual(gt[0][1], 9.5, delta=0.01)
        self.assertAlmostEqual(gt[0][3], 10.5, delta=0.01)

    def test_no_wall_crosses_the_gate(self):
        br, gt, _ = walls_and_gates(part([edge([(10, 0), (10, 20)])], [gate(0, 10.0)]),
                                    SQ, FLAT)
        gap = LineString([(gt[0][0], gt[0][1]), (gt[0][2], gt[0][3])])
        for run in runs_of(br):
            self.assertFalse(run.crosses(gap), "a wall through its own gate is the defect itself")

    def test_the_gates_ends_are_the_walls_ends(self):
        br, gt, _ = walls_and_gates(part([edge([(10, 0), (10, 20)])], [gate(0, 10.0)]),
                                    SQ, FLAT)
        ends = {round(c[1], 3) for run in runs_of(br) for c in (run.coords[0], run.coords[-1])}
        self.assertIn(round(gt[0][1], 3), ends)
        self.assertIn(round(gt[0][3], 3), ends)


class GateAcrossTwoEdgesTest(unittest.TestCase):
    """A wall drawn as two edges meeting at (10, 10), with the gate straddling the join."""

    def test_a_gate_over_a_join_leaves_both_sides_standing(self):
        edges = [edge([(10, 0), (10, 10)]), edge([(10, 10), (10, 20)])]
        # t is along each edge, so the gate is near the far end of the first and the near end of the
        # second: 9.5..10 on one and 0..0.5 on the other is not reachable from one opening, so the
        # opening sits at the end of the second edge, which is the join
        br, gt, _ = walls_and_gates(part(edges, [gate(1, 0.5, width=1.0)]), SQ, FLAT)
        self.assertEqual(len(gt), 1)
        left = [r for r in runs_of(br) if r.bounds[1] < 9.6]
        self.assertTrue(left, "the first edge's wall is still written past the gap")


class GateAtARunEndTest(unittest.TestCase):
    """A gate right at the end of a wall, so only one side of wall survives."""

    def test_a_gate_at_the_end_leaves_one_run(self):
        br, gt, _ = walls_and_gates(part([edge([(10, 0), (10, 20)])], [gate(0, 0.5)]), SQ, FLAT)
        self.assertEqual(len(gt), 1)
        self.assertEqual(len(br), 1, "one side has no wall to keep")

    def test_a_gate_wider_than_its_edge_writes_no_wall_but_still_a_gate(self):
        br, gt, _ = walls_and_gates(part([edge([(10, 0), (10, 2)])], [gate(0, 1.0, width=4.0)]),
                                    SQ, FLAT)
        self.assertEqual(br, [], "the whole edge is the gap")
        self.assertEqual(len(gt), 1)


class ReversedRunTest(unittest.TestCase):
    """The same wall drawn the other way round gives the same result, mirrored."""

    def test_direction_does_not_change_the_answer(self):
        fwd, gtf, _ = walls_and_gates(part([edge([(10, 0), (10, 20)])], [gate(0, 10.0)]),
                                      SQ, FLAT)
        rev, gtr, _ = walls_and_gates(part([edge([(10, 20), (10, 0)])], [gate(0, 10.0)]),
                                      SQ, FLAT)
        self.assertEqual(len(fwd), len(rev))
        self.assertAlmostEqual(gtf[0][1] + gtr[0][1], 20.0, delta=0.05,
                               msg="the gate is the same distance from the far end either way")
        self.assertAlmostEqual(sum(r.length for r in runs_of(fwd)),
                               sum(r.length for r in runs_of(rev)), delta=0.05)


class RoadRuleTest(unittest.TestCase):
    """A wall must not run down the middle of a road. The road is x 300..400 in `part`, so these use
    their own scene."""

    ROAD = box(90, 0, 110, 200)

    def test_a_wall_on_the_pavement_edge_is_written(self):
        # a pavement sits between the carriageway and a front wall, so x=86 is not in the road
        br, gt, _ = walls_and_gates(part([edge([(86, 20), (86, 80)])], []), SQ, FLAT,
                                    road_clearance(self.ROAD))
        self.assertEqual(len(br), 1)
        self.assertEqual(br[0]["c"], STYLE)

    def test_a_wall_across_the_road_is_cut_and_survives_both_sides(self):
        br, _, in_road = walls_and_gates(part([edge([(60, 50), (140, 50)])], []), SQ, FLAT,
                                         road_clearance(self.ROAD))
        self.assertEqual(len(br), 2)
        self.assertGreater(in_road, 0)
        for run in runs_of(br):
            self.assertFalse(run.intersects(self.ROAD), "no written wall lies in the road")

    def test_a_wall_wholly_inside_the_road_is_dropped(self):
        br, _, in_road = walls_and_gates(part([edge([(100, 20), (100, 80)])], []), SQ, FLAT,
                                         road_clearance(self.ROAD))
        self.assertEqual(br, [])
        self.assertGreater(in_road, 50)

    def test_the_clearance_is_kept_off_the_road_edge(self):
        br, _, _ = walls_and_gates(part([edge([(60, 50), (140, 50)])], []), SQ, FLAT,
                                   road_clearance(self.ROAD))
        for run in runs_of(br):
            self.assertGreater(run.distance(self.ROAD), ROAD_CLEAR - 0.01)


class ShortStubTest(unittest.TestCase):
    """The stub the partition leaves each side of a gate must survive the writer's floor.

    `openings.EDGE_STUB` is 0.9 m, so a gate clamped to its edge's end leaves exactly that beside it.
    The writer's floor was 1 m and deleted every one: 319 of the 323 gate ends that missed their wall
    on square 0,3 were this. The floor has to sit below the stub."""

    def test_a_stub_shorter_than_a_metre_is_still_written(self):
        br, gt, _ = walls_and_gates(part([edge([(10, 0), (10, 10)])], [gate(0, 9.0, width=1.0)]),
                                    SQ, FLAT)
        self.assertEqual(len(gt), 1)
        # a 10 m edge, a 1 m gate at t=9 leaves 8.5 m before it and 0.5 m after. Both are walls, and
        # the 0.5 m one is the point: a 1 m floor deleted every stub like it
        self.assertEqual(len(br), 2, "both sides of the gate are wall, not sliver")
        lengths = sorted(r.length for r in runs_of(br))
        self.assertAlmostEqual(lengths[0], 0.5, delta=0.15)
        self.assertAlmostEqual(lengths[1], 8.5, delta=0.2)
        self.assertLess(MIN_PIECE, 0.9, "the floor must be below the partition's own stub")


if __name__ == "__main__":
    unittest.main()
