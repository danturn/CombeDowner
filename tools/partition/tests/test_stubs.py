"""A short run of wall with nothing at either end is not written; one a gate or another run holds is."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import box

from partition.write_tile import _without_lone_stubs


class LoneStubTest(unittest.TestCase):
    square = box(0, 0, 100, 100)

    def run_of(self, *pts):
        return dict(c="hedge", p=[[x, y, 0.0] for x, y in pts], h=1.2)

    def test_a_short_run_with_nothing_at_either_end_goes(self):
        out = _without_lone_stubs([self.run_of((50, 50), (51, 50))], [], self.square)
        self.assertEqual(out, [])

    def test_a_short_run_beside_a_gate_stays(self):
        run = self.run_of((50, 50), (50.9, 50))
        gate = [51.0, 50.0, 52.0, 50.0, 0.0, "hedge"]
        self.assertEqual(len(_without_lone_stubs([run], [gate], self.square)), 1)

    def test_a_short_run_that_meets_another_stays(self):
        a = self.run_of((50, 50), (51, 50))
        b = self.run_of((51, 50), (51, 60))
        self.assertEqual(len(_without_lone_stubs([a, b], [], self.square)), 2)

    def test_a_short_run_on_the_squares_edge_stays(self):
        run = self.run_of((99.9, 50), (100, 50.8))
        self.assertEqual(len(_without_lone_stubs([run], [], self.square)), 1)

    def test_a_long_run_stays(self):
        run = self.run_of((50, 50), (55, 50))
        self.assertEqual(len(_without_lone_stubs([run], [], self.square)), 1)


if __name__ == "__main__":
    unittest.main()
