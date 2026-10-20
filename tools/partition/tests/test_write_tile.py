"""The writer's rule about a wall and a road, tested on synthetic geometry.

A boundary goes in `br` unless it lies **inside a road surface**, and the part that does is cut out
rather than the whole run dropped. That distinction is the whole point of these tests, because the
first version of the writer had it the other way round: it dropped every edge with a `corridor` face
on either side, on the reading that such an edge *is* the street's own edge. The reading is right
about the premise - the line where a pavement meets a plot is a street's edge - and wrong about the
consequence, because that line is also exactly where a front garden wall stands. Measured on square
0,3 of the real map: 930 runs / 25,293 m dropped, of which 650 runs / 13,024 m were not in a road at
all, and every `garden_wall`, `railing`, `hedge_low` and `brick_wall_low` in the tile came from that
set. The tile came out with no front boundary anywhere in it.

The scene below is one street's cross-section: a carriageway from x=90 to 110, pavements 86-90 and
110-114, and plots beyond the pavements. A front garden wall stands on the **pavement's outer edge**
(x=86), which is where one really stands and which is the line the pale rule was throwing away; a
wall at x=90 would be in the road.

The other half is the gate: a gap is only written where a wall was really written, so a gate in a
front wall that had been dropped was a gap in nothing (200 of them on square 0,3).

Synthetic - no map data, no pass output - so it runs everywhere and in seconds.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString, box

from partition.write_tile import (ROAD_CLEAR, barriers_from_edges, drop_clashes,
                                  gates_from_openings)

SQ = (0.0, 0.0, 200.0, 200.0)
FLAT = lambda x, y: 10.0
NO_ROAD = "no road surface at all"


def edge(x0, y0, x1, y1, kind="garden_wall", sides=(("corridor",), ("plot", 7))):
    return dict(kind=kind, source="front", support=1.0,
                sides=[list(s) for s in sides], xy=[[x0, y0], [x1, y1]])


class WallAndRoadTest(unittest.TestCase):
    """A carriageway from x=90 to 110. It is the only `carriageway` face: the pavements are part of
    the corridor too, but they are not road surface, so a wall on them is not a wall in the road."""

    ROAD = box(90, 0, 110, 200)

    def runs(self, edges, road=ROAD):
        return barriers_from_edges(edges, SQ, FLAT, None if road is NO_ROAD else road)

    def test_a_front_wall_on_the_pavement_edge_is_written(self):
        # the failure that started this: this edge has a `corridor` face and was dropped whole
        out, in_road = self.runs([edge(86, 20, 86, 80)])
        self.assertEqual(len(out), 1, "a front wall on the pavement's edge is a wall the player sees")
        self.assertEqual(out[0]["c"], "garden_wall")
        self.assertGreater(LineString([p[:2] for p in out[0]["p"]]).length, 55)
        self.assertEqual(in_road, 0, "it is nowhere near the road surface")

    def test_a_wall_across_the_road_is_cut_at_the_road_not_dropped(self):
        out, in_road = self.runs([edge(60, 50, 140, 50)])
        self.assertGreater(in_road, 0, "the part in the road is counted, so it can be reported")
        self.assertEqual(len(out), 2, "the wall survives on both sides of the road")
        for run in out:
            got = LineString([p[:2] for p in run["p"]])
            self.assertFalse(got.intersects(self.ROAD), "no written wall lies in the road")

    def test_a_wall_wholly_inside_the_road_is_dropped_and_counted(self):
        out, in_road = self.runs([edge(100, 20, 100, 80)])
        self.assertEqual(out, [], "a wall down the middle of a road is not written")
        self.assertAlmostEqual(in_road, 60, delta=1)

    def test_the_clearance_is_kept_off_the_road_edge(self):
        # a run cut exactly on the road's edge comes back collinear with it, and the carriageway
        # check then reads a graze as a wall down the road: nine runs read that way at first
        out, _ = self.runs([edge(60, 50, 140, 50)])
        for run in out:
            got = LineString([p[:2] for p in run["p"]])
            self.assertGreater(got.distance(self.ROAD), ROAD_CLEAR - 0.01)

    def test_a_wall_with_no_road_surface_at_all_is_still_written(self):
        out, in_road = self.runs([edge(86, 20, 86, 80)], road=NO_ROAD)
        self.assertEqual(in_road, 0)
        self.assertEqual(len(out), 1)


class GateNeedsAWallTest(unittest.TestCase):
    """`gt` is a gap, so it needs a wall to be a gap in. The gate is 3 m wide, 30 m along a 60 m run
    from (86, 20), which puts its ends at y=48.5 and y=51.5."""

    PART = dict(edges=[edge(86, 20, 86, 80, kind="garden_wall")],
                openings=[dict(edge=0, kind="gate", t=30.0, width=3.0)])

    def gates(self, with_wall):
        walls = [LineString([(86, 20), (86, 80)])] if with_wall else []
        return json.loads(json.dumps(gates_from_openings(self.PART, walls, FLAT)))

    def test_a_gate_in_a_written_wall_is_a_gap(self):
        got = self.gates(with_wall=True)
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0][5], "garden_wall", "the gap carries the wall's own style")
        self.assertAlmostEqual(got[0][0], 86.0, delta=0.2)
        self.assertAlmostEqual(got[0][1], 48.5, delta=0.2)
        self.assertAlmostEqual(got[0][3], 51.5, delta=0.2)

    def test_a_gate_where_no_wall_was_written_is_not_a_gap(self):
        self.assertEqual(self.gates(with_wall=False), [],
                         "a gap in a wall that was dropped is a gap in nothing")


class CopiedDecorationTest(unittest.TestCase):
    """Trees, shrubs and street items are copied from the old tile until placing them becomes its own
    step, so anything the new layout contradicts is dropped rather than moved.

    Measured on square 0,3 before this: 750 of 2,047 street items were in a carriageway and 636
    plants were inside a barrier, because the old roads and the partition's roads are not the same
    roads. A bin in the road reads as a mistake; a bare square reads as unfinished, which is the
    smaller wrong."""

    ROAD = box(90, 0, 110, 200)
    WALL = dict(c="hedge", p=[[86, 20, 10], [86, 80, 10]], h=1.3)
    PART = dict(faces=[dict(cls="carriageway", xy=[[90, 0], [110, 0], [110, 200], [90, 200]])])

    def tile(self):
        return dict(
            tr=[[100, 100, 10, 1.0],   # in the carriageway
                [86, 50, 10, 1.0],     # in the hedge
                [70, 50, 10, 1.0]],    # clear of both
            sb=[[95, 20, 10, 0.4],
                [86.2, 30, 10, 0.4],
                [72, 30, 10, 0.4]],
            fx=[["bin", 100, 150, 10, 0.0],
                ["bench", 86, 60, 10, 0.0],
                ["lamp", 74, 60, 10, 0.0]])

    def test_decoration_the_new_layout_contradicts_is_dropped(self):
        t = self.tile()
        gone = drop_clashes(t, self.PART, [self.WALL])
        self.assertEqual(gone["tr"], 2, "the tree in the road and the one in the hedge both go")
        self.assertEqual(t["tr"], [[70, 50, 10, 1.0]])
        self.assertEqual(len(t["sb"]), 1)
        self.assertEqual(len(t["fx"]), 1)

    def test_a_string_in_the_kind_slot_does_not_break_the_read(self):
        # `fx` rows lead with a kind, which is a string; reading it as a coordinate would throw
        t = self.tile()
        drop_clashes(t, self.PART, [self.WALL])
        self.assertEqual(t["fx"][0][0], "lamp", "the row that survives is the clear one, intact")

    def test_doors_are_left_alone(self):
        # a door is cut into its building, and the buildings are copied and did not move
        t = self.tile()
        t["dr"] = [[100, 150, 10, 1.0, 3, 2]]
        drop_clashes(t, self.PART, [self.WALL])
        self.assertEqual(len(t["dr"]), 1)


if __name__ == "__main__":
    unittest.main()
