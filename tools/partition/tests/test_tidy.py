"""Doubled walls and poking ends are tidied: the better wall stays, and gates keep a wall."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

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


if __name__ == "__main__":
    unittest.main()
