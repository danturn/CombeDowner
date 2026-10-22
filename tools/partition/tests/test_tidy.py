"""Doubled walls and poking ends are tidied: the better wall stays, and gates keep a wall."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString

from partition.tidy import reseat_gates, tidy_walls


def ground(x, y):
    return 0.0


def run(key, *pts, style="fence"):
    return dict(c=style, p=[[x, y, 0.0] for x, y in pts], h=1.2, _k=key)


def length(r):
    return sum(((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5 for a, b in zip(r["p"], r["p"][1:]))


class DoubledTest(unittest.TestCase):
    def test_a_run_that_turns_back_round_a_short_u_is_drawn_once(self):
        u = run((False, False, 9.0, 1), (0, 0), (4, 0), (4, 0.3), (0, 0.3), style="fence")
        out = tidy_walls([u], ground)
        self.assertLess(sum(length(r) for r in out), 5.0)

    def test_a_run_that_folds_back_along_itself_is_drawn_once(self):
        folded = run((False, False, 60.0, 1), (0, 0), (30, 0), (0, 0.3), style="hedge_low")
        out = tidy_walls([folded], ground)
        self.assertLess(sum(length(r) for r in out), 32.0)

    def test_the_real_wall_stays_and_the_guessed_one_beside_it_goes(self):
        real = run((True, False, 20.0, 1), (0, 0), (20, 0), style="wall")
        guess = run((False, False, 30.0, 2), (-5, 0.4), (25, 0.4))
        out = tidy_walls([real, guess], ground)
        self.assertEqual(sum(length(r) for r in out if r["c"] == "wall"), 20.0)
        self.assertLess(sum(length(r) for r in out if r["c"] == "fence"), 12.0)

    def test_a_short_run_along_a_bent_one_goes(self):
        # from Oldfield Park: the overlaps fall between the run's own points, and cutting by the
        # overlapping lines took nothing off
        real = run((True, True, 8.0, 1), (-3420.2, 834.5), (-3419.1, 835.4), (-3418.6, 835.7),
                   (-3417.0, 836.9), (-3416.0, 837.7), style="hedge")
        guess = run((False, False, 10.3, 2), (-3418.5, 835.8), (-3418.1, 835.4), (-3415.8, 837.1),
                    (-3416.0, 837.7), style="hedge")
        out = tidy_walls([real, guess], ground)
        self.assertEqual(len(out), 1)

    def test_a_front_beats_a_side(self):
        front = run((False, True, 10.0, 1), (0, 0), (10, 0), style="hedge")
        side = run((False, False, 40.0, 2), (0, 0.9), (10, 0.9))
        out = tidy_walls([front, side], ground)
        self.assertEqual([r["c"] for r in out], ["hedge"])

    def test_otherwise_the_longer_stays(self):
        long_ = run((False, False, 30.0, 1), (0, 0), (30, 0), style="hedge")
        short = run((False, False, 10.0, 2), (10, 1.0), (20, 1.0))
        out = tidy_walls([long_, short], ground)
        self.assertEqual([r["c"] for r in out], ["hedge"])

    def test_runs_that_cross_or_part_are_left_alone(self):
        a = run((False, False, 10.0, 1), (0, 0), (10, 0))
        b = run((False, False, 10.0, 2), (5, -5), (5, 5))
        c = run((False, False, 10.0, 3), (0, 3), (10, 3))
        self.assertEqual(len(tidy_walls([a, b, c], ground)), 3)

    def test_the_cut_end_is_joined_onto_the_wall_that_stays(self):
        keep = run((True, False, 20.0, 1), (0, 0), (20, 0), style="wall")
        lose = run((False, False, 30.0, 2), (10, 0.4), (20, 0.4), (30, 8))
        out = tidy_walls([keep, lose], ground)
        rest = [r for r in out if r["c"] == "fence"]
        self.assertEqual(len(rest), 1)
        self.assertAlmostEqual(rest[0]["p"][0][1], 0.0, delta=0.1)


class PokingTest(unittest.TestCase):
    def test_an_end_poking_a_little_past_another_run_is_cut_back_to_it(self):
        a = run((False, False, 10.0, 1), (0, 0), (10, 0))
        b = run((False, False, 10.0, 2), (5, -8), (5, 0.6))
        out = tidy_walls([a, b], ground)
        poker = [r for r in out if r["p"][0][0] == 5][0]
        self.assertAlmostEqual(poker["p"][-1][1], 0.0, delta=0.1)

    def test_an_end_well_past_is_a_crossing_and_stays(self):
        a = run((False, False, 10.0, 1), (0, 0), (10, 0))
        b = run((False, False, 10.0, 2), (5, -8), (5, 3))
        out = tidy_walls([a, b], ground)
        self.assertEqual(max(r["p"][-1][1] for r in out if r["p"][0][0] == 5), 3.0)

    def test_the_keys_are_not_written(self):
        a = run((False, False, 10.0, 1), (0, 0), (10, 0))
        b = run((False, False, 10.0, 2), (0, 5), (10, 5))
        self.assertTrue(all("_k" not in r for r in tidy_walls([a, b], ground)))


class GateTest(unittest.TestCase):
    def test_a_gate_with_a_wall_at_both_ends_stays(self):
        walls = [run(None, (0, 0), (4.5, 0)), run(None, (5.5, 0), (10, 0))]
        gate = [4.5, 0, 5.5, 0, 0.0, "fence"]
        _, gates = reseat_gates(walls, [gate], ground)
        self.assertEqual(gates, [gate])

    def test_a_gate_whose_wall_went_moves_onto_the_wall_beside_it(self):
        wall = run(None, (0, 0.8), (10, 0.8))
        gate = [4.5, 0, 5.5, 0, 0.0, "fence"]
        runs, gates = reseat_gates([wall], [gate], ground)
        self.assertEqual(len(gates), 1)
        self.assertAlmostEqual(gates[0][1], 0.8, delta=0.1)
        self.assertEqual(len(runs), 2)

    def test_a_gate_with_no_wall_near_is_dropped(self):
        wall = run(None, (0, 9), (10, 9))
        _, gates = reseat_gates([wall], [[4.5, 0, 5.5, 0, 0.0, "fence"]], ground)
        self.assertEqual(gates, [])


def lines_of(out):
    return [LineString([q[:2] for q in r["p"]]) for r in out if len(r["p"]) > 1]


def lying_along(a, b, within=0.6):
    """Metres of `a` within `within` of `b`."""
    return a.intersection(b.buffer(within)).length


def pokes(out):
    """Ends of a run that stand a little past another run they cross (the check's measure)."""
    found = []
    ls = lines_of(out)
    for i, a in enumerate(ls):
        if a.length < 2.5:
            continue
        for j, b in enumerate(ls):
            x = a.intersection(b) if i != j else None
            for h in getattr(x, "geoms", [x]):
                if h is None or h.is_empty or h.geom_type != "Point":
                    continue
                t = a.project(h)
                if 0.1 < t < 1.0 or a.length - 1.0 < t < a.length - 0.1:
                    found.append((i, j, round(t, 2)))
    return found


class StretchesTest(unittest.TestCase):
    def test_a_short_wall_along_the_side_of_a_longer_one_is_cut_whichever_run_is_measured(self):
        stone = run((True, False, 4.4, 1), (-479.3, 1889.1), (-481.9, 1892.7), style="stone_wall")
        fence = run((False, False, 6.6, 2), (-479.3, 1889.1), (-479.5, 1890.1), (-479.5, 1890.3),
                    (-479.8, 1890.9), (-480.4, 1891.9), (-480.7, 1892.2), (-478.1, 1893.9))
        out = tidy_walls([stone, fence], ground)
        a, b = lines_of([r for r in out if r["c"] == "stone_wall"])[0], lines_of([r for r in out if r["c"] == "fence"])
        self.assertLessEqual(max([lying_along(f, a) for f in b] or [0]), 1.0)

    def test_a_run_meeting_another_at_a_shallow_angle_stops_short_and_steps_across(self):
        wall = run((True, False, 60.0, 1), (0, 0), (0.7, 30), (1.4, 60), style="garden_wall")
        hedge = run((False, False, 50.0, 2), (-15.5, 46), (0.4, 0.0), style="hedge")
        out = tidy_walls([wall, hedge], ground)
        h = lines_of([r for r in out if r["c"] == "hedge"])[0]
        w = lines_of([r for r in out if r["c"] == "garden_wall"])[0]
        self.assertLessEqual(lying_along(h, w), 1.0)
        self.assertLess(h.distance(w), 0.05)

    def test_a_sliver_left_between_two_cuts_is_dropped_not_joined_into_a_hairpin(self):
        wall = run((False, True, 121.2, 1), (-627.4, 1890.4), (-627.0, 1891.8), (-626.3, 1893.7),
                   (-625.9, 1895.1), (-624.7, 1895.7), (-623.2, 1896.5), (-622.4, 1896.4),
                   (-621.7, 1896.4), (-619.7, 1896.4), (-617.7, 1896.3), (-615.7, 1896.3),
                   (-613.7, 1896.2), style="garden_wall")
        fence = run((False, False, 20.9, 2), (-617.9, 1895.3), (-621.7, 1895.4), (-621.9, 1895.4),
                    (-622.2, 1895.4), (-622.4, 1895.3), (-622.5, 1895.3), (-622.6, 1895.3),
                    (-623.1, 1895.1), (-623.5, 1894.9), (-623.7, 1894.7), (-624.3, 1894.2),
                    (-624.6, 1893.9), (-624.7, 1893.7), (-624.9, 1893.4), (-625.2, 1892.8),
                    (-625.3, 1892.6), (-625.4, 1892.5), (-625.6, 1891.5), (-625.6, 1890.9),
                    (-625.9, 1887.5), (-618.8, 1886.8))
        out = tidy_walls([wall, fence], ground)
        self.assertEqual([r for r in out if r["c"] == "fence" and length(r) < 3.0], [])

    def XXX_a_run_a_tenth_of_a_metre_past_a_junction_is_cut_back_once_rounded(self):
        short = run((False, False, 1.1, 1), (-3311.7, 577.5), (-3312.5, 576.7))
        fence = run((False, False, 4.4, 2), (-3312.4, 576.7), (-3313.2, 577.4), (-3315.5, 579.8))
        hedge = run((False, False, 8.5, 3), (-3312.7, 576.9), (-3312.8, 576.8), (-3314.2, 575.4),
                    (-3315.7, 573.9), (-3317.1, 572.5), (-3318.7, 570.9), style="hedge_low")
        self.assertEqual(pokes(tidy_walls([short, fence, hedge], ground)), [])


if __name__ == "__main__":
    unittest.main()


class GateCornerTest(unittest.TestCase):
    def test_a_gate_moved_onto_a_wall_keeps_clear_of_its_corner(self):
        wall = run((False,), (0, 0), (10, 0), (10, 10))
        runs, kept = reseat_gates([dict(wall)], [[9.0, 1.5, 10.0, 1.5, 0.0, "fence"]], ground)
        self.assertEqual(len(kept), 1)
        g = kept[0]
        for x, y in ((g[0], g[1]), (g[2], g[3])):
            self.assertGreaterEqual(round(((x - 10) ** 2 + y ** 2) ** 0.5, 1), 0.6)
