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

from shapely.geometry import LineString, Point, Polygon, box

from partition.write_tile import (BARRIER_WIDTH, MIN_PIECE, ROAD_INSET, _outside_roads, drop_paths_on_the_railway,
                                  level_footbridges, offset_from_corridor, road_clearance, walls_and_gates, blocked_ground)

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


class OpenFrontAndPathTest(unittest.TestCase):
    def test_an_open_front_and_a_path_are_gaps_without_a_gate(self):
        for kind in ("open", "path"):
            br, gt, _ = walls_and_gates(part([edge([(10, 0), (10, 20)])], [gate(0, 10.0, 2.0, kind)]), SQ, FLAT)
            self.assertEqual(gt, [], kind)
            self.assertEqual(len(br), 2, kind)


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
    """A gate right at the end of a wall, so only one side of wall survives: with no wall at its
    other side it is only a gap, and is not written as a gate."""

    def test_a_gate_at_the_end_leaves_one_run_and_no_gate(self):
        br, gt, _ = walls_and_gates(part([edge([(10, 0), (10, 20)])], [gate(0, 0.5)]), SQ, FLAT)
        self.assertEqual(gt, [])
        self.assertEqual(len(br), 1, "one side has no wall to keep")

    def test_a_gate_wider_than_its_edge_writes_neither_wall_nor_gate(self):
        br, gt, _ = walls_and_gates(part([edge([(10, 0), (10, 2)])], [gate(0, 1.0, width=4.0)]),
                                    SQ, FLAT)
        self.assertEqual(br, [], "the whole edge is the gap")
        self.assertEqual(gt, [])


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
    """The clip is the road's **interior**, not its boundary.

    A front garden wall stands on the line where the pavement's back edge is, which is the
    carriageway's boundary line where no pavement is drawn. `intersection` counts a shared line as
    intersect, so testing against the road surface itself deletes every such wall - measured on square
    0,3, 7,367.8 m of it, none of it inside the road's interior. The clip is therefore against the
    surface shrunk by a few centimetres, which removes only what is genuinely in the road.
    """

    ROAD = box(90, 0, 110, 200)      # the carriageway, x 90..110

    def walls(self, edges, road=None):
        return walls_and_gates(part(edges, []), SQ, FLAT,
                               road_clearance(self.ROAD if road is None else road))

    def test_a_wall_on_the_boundary_is_kept(self):
        # x=90 is the road's own edge: a wall standing there is a front wall, and it stays
        br, _, in_road = self.walls([edge([(90, 20), (90, 80)])])
        self.assertEqual(len(br), 1, "a wall on the carriageway's boundary is a front wall")
        self.assertEqual(in_road, 0, "and none of it is inside the road")

    def test_a_wall_crossing_the_interior_is_cut(self):
        br, _, in_road = self.walls([edge([(60, 50), (140, 50)])])
        self.assertEqual(len(br), 2, "the wall survives either side of the road")
        self.assertGreater(in_road, 15, "the part in the road is removed and counted")
        for run in runs_of(br):
            self.assertLess(run.intersection(self.ROAD.buffer(-ROAD_INSET)).length, 0.01,
                            "no written wall is inside the road's interior")

    def test_a_wall_wholly_inside_the_road_is_dropped(self):
        br, _, in_road = self.walls([edge([(100, 20), (100, 80)])])
        self.assertEqual(br, [])
        self.assertGreater(in_road, 50)

    def test_a_wall_away_from_the_road_is_untouched(self):
        br, _, in_road = self.walls([edge([(86, 20), (86, 80)])])
        self.assertEqual(len(br), 1)
        self.assertEqual(in_road, 0)


class WallOnTheStreetBoundaryTest(unittest.TestCase):
    """`map.ts` draws a barrier **centred** on its line (`t = spec.t / 2`, the cross-section built
    either side), so a hedge on a pavement's back edge puts 0.45 m of hedge over the pavement. The
    partition puts the boundary on that line because that is where the boundary is; the drawing moves
    the run out by half its thickness, towards the side the labels say is not the street."""

    def corridor_right(self):
        return Polygon([(0, -1), (5, -1), (5, 11), (0, 11)])

    def corridor_left(self):
        return Polygon([(-5, -1), (0, -1), (0, 11), (-5, 11)])

    def test_a_wall_beside_the_street_moves_away_from_it(self):
        line = LineString([(0, 0), (0, 10)])
        moved = offset_from_corridor(line, [["corridor"], ["plot", 1]], self.corridor_right(),
                                     "hedge")
        self.assertAlmostEqual(moved.coords[0][0], -BARRIER_WIDTH["hedge"] / 2, places=3,
                               msg="half a hedge's thickness, out of the street")

    def test_it_moves_the_other_way_when_the_street_is_on_the_other_side(self):
        line = LineString([(0, 0), (0, 10)])
        moved = offset_from_corridor(line, [["corridor"], ["plot", 1]], self.corridor_left(),
                                     "hedge")
        self.assertAlmostEqual(moved.coords[0][0], BARRIER_WIDTH["hedge"] / 2, places=3)

    def test_a_reversed_run_still_moves_away_from_the_street(self):
        # the same wall drawn south-to-north and north-to-south must move the same way: the side comes
        # from the corridor face, not from the run's direction
        down = LineString([(0, 0), (0, 10)])
        up = LineString([(0, 10), (0, 0)])
        a = offset_from_corridor(down, [["corridor"], ["plot", 1]], self.corridor_right(), "hedge")
        b = offset_from_corridor(up, [["corridor"], ["plot", 1]], self.corridor_right(), "hedge")
        self.assertAlmostEqual(a.coords[0][0], b.coords[0][0], places=3)
        self.assertAlmostEqual(a.coords[0][0], -BARRIER_WIDTH["hedge"] / 2, places=3,
                               msg="out of the street whichever way the run is drawn")

    def test_a_wall_between_two_plots_is_not_moved(self):
        line = LineString([(0, 0), (0, 10)])
        out = offset_from_corridor(line, [["plot", 1], ["plot", 2]], self.corridor_right(), "hedge")
        self.assertEqual([tuple(c) for c in out.coords], [tuple(c) for c in line.coords],
                         "no street beside it, so nothing to move away from")


class GateInAFrontWallTest(unittest.TestCase):
    """A gate in a front wall is walled on both sides: that is what makes it passable."""

    def test_the_gate_is_walled_on_both_sides(self):
        # a 20 m front wall along the back of a pavement, gate in the middle
        br, gt, _ = walls_and_gates(part([edge([(10, 0), (10, 20)])], [gate(0, 10.0)]), SQ, FLAT)
        self.assertEqual(len(gt), 1)
        self.assertEqual(len(br), 2, "one run each side of the gate")
        ends = {round(c[1], 3) for run in runs_of(br) for c in (run.coords[0], run.coords[-1])}
        self.assertIn(round(gt[0][1], 3), ends, "the gate's first end is a wall's end")
        self.assertIn(round(gt[0][3], 3), ends, "and so is its second")

    def test_nothing_crosses_the_gap(self):
        br, gt, _ = walls_and_gates(part([edge([(10, 0), (10, 20)])], [gate(0, 10.0)]), SQ, FLAT)
        gap = LineString([(gt[0][0], gt[0][1]), (gt[0][2], gt[0][3])])
        for run in runs_of(br):
            self.assertFalse(run.crosses(gap))


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


class FootbridgeTests(unittest.TestCase):
    """A footbridge over a stream is level with its banks, not raised to the hill behind it."""

    seg = [(x, 0.0) for x in range(0, 50, 10)]
    ground = [10.0] * 5
    stream = [LineString([(15, -5), (15, 5)])]

    def level(self, zs, crossings):
        zs = list(zs)
        level_footbridges(self.seg, zs, self.ground, {1, 2, 3}, crossings)
        return zs

    def test_a_bridge_over_water_comes_down_to_its_banks(self):
        zs = self.level([12.0] * 5, (self.stream, []))
        self.assertTrue(all(z <= 10.5 for z in zs))

    def test_a_bridge_over_a_railway_keeps_its_height(self):
        zs = self.level([12.0] * 5, (self.stream, [LineString([(25, -5), (25, 5)])]))
        self.assertEqual(zs[2], 12.0)

    def test_a_bridge_over_nothing_is_left_alone(self):
        zs = self.level([12.0] * 5, ([], []))
        self.assertEqual(zs, [12.0] * 5)


if __name__ == "__main__":
    unittest.main()


class PathsAtTheRailway(unittest.TestCase):
    RAIL = [dict(p=[[0, 0, 10.0, 0], [0, 50, 10.0, 0], [0, 100, 10.0, 0]])]

    def path(self, z, marks=()):
        return dict(c="footway", n="", w=1.6, p=[[x, 50, z] + ([1] if x in marks else []) for x in range(-30, 31, 4)])

    def test_a_path_level_with_the_track_is_cut_either_side_of_it(self):
        out, cut = drop_paths_on_the_railway([self.path(10.0)], self.RAIL)
        self.assertEqual(cut, 1)
        self.assertEqual(len(out), 2)
        for piece in out:
            self.assertTrue(all(abs(q[0]) >= 5.0 for q in piece["p"]))

    def test_a_path_well_above_or_below_the_track_is_left(self):
        for z in (14.0, 6.0):
            out, cut = drop_paths_on_the_railway([self.path(z)], self.RAIL)
            self.assertEqual((cut, len(out)), (0, 1))

    def test_a_bridge_over_the_track_and_a_street_are_left(self):
        out, cut = drop_paths_on_the_railway([self.path(10.0, marks={-2, 2})], self.RAIL)
        self.assertEqual(cut, 0)
        street = dict(self.path(10.0), c="residential")
        self.assertEqual(drop_paths_on_the_railway([street], self.RAIL)[1], 0)

    def test_a_track_the_path_passes_over_is_left(self):
        rail = [dict(p=[[0, 0, 10.0, 2], [0, 50, 10.0, 2], [0, 100, 10.0, 2]])]
        self.assertEqual(drop_paths_on_the_railway([self.path(10.0)], rail)[1], 0)


class BlockedGroundTest(unittest.TestCase):
    """Walls are cut off the drawn road strip, the railway and the water, as the old build did."""

    def walls(self, edges, blocked):
        return walls_and_gates(part(edges, []), SQ, FLAT, blocked=blocked)[0]

    def test_a_wall_along_a_drawn_road_is_cut_away(self):
        rd = [dict(c="service", p=[[100, 0, 10.0], [100, 100, 10.0]], w=3.0)]
        blocked = blocked_ground(rd, {}, [], None, SQ)
        br = self.walls([edge([(100.5, 10), (100.5, 90)]), edge([(80, 10), (80, 90)])], blocked)
        self.assertEqual(len(br), 1, "the wall on the strip goes, the one clear of it stays")
        self.assertEqual(br[0]["p"][0][0], 80)

    def test_a_wall_beyond_the_road_end_stays(self):
        rd = [dict(c="service", p=[[100, 0, 10.0], [100, 50, 10.0]], w=3.0)]
        blocked = blocked_ground(rd, {}, [], None, SQ)
        self.assertEqual(len(self.walls([edge([(100.5, 52), (100.5, 90)])], blocked)), 1)

    def test_a_wall_in_the_water_is_cut_and_its_lone_stub_goes(self):
        pond = dict(r=[[[60, 40], [140, 40], [140, 60], [60, 60]]])
        blocked = blocked_ground([], dict(wp=[pond]), [], None, SQ)
        br = self.walls([edge([(100, 20), (100, 80)])], blocked)
        self.assertEqual(len(br), 2)
        for run in runs_of(br):
            self.assertLess(run.intersection(Polygon(pond["r"][0])).length, 0.01)
        br = self.walls([edge([(100, 37.9), (100, 60)])], blocked)
        self.assertEqual(br, [], "a bit under 1.5 m left on its own is not a wall")

    def test_the_railway_is_blocked_either_side_of_the_track(self):
        rail = [dict(p=[[0, 100, 10.0, 0], [200, 100, 10.0, 0]])]
        blocked = blocked_ground([], {}, rail, None, SQ)
        br = self.walls([edge([(100, 20), (100, 180)])], blocked)
        self.assertEqual(len(br), 2)

    def test_a_wall_on_a_pavement_is_cut_but_one_at_its_back_edge_stays(self):
        rd = [dict(c="residential", p=[[100, 0, 10.0], [100, 100, 10.0]], w=6.0, pv=[2.0, 2.0])]
        blocked = blocked_ground(rd, {}, [], None, SQ)
        br = self.walls([edge([(104.5, 10), (104.5, 90)]), edge([(105.0, 10), (105.0, 90)])], blocked)
        self.assertEqual([b["p"][0][0] for b in br], [105.0])


if __name__ == "__main__":
    unittest.main()
