"""The village file cuts back into its nine squares: everything goes to exactly one square, and the
terrain of neighbouring squares shares its edge."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from partition import Q
from partition.village import NINE, cut


def village():
    n = 3 * Q.cells + 1
    size = Q.dx * Q.cells
    h = [j * n + i for j in range(n) for i in range(n)]
    trees = [[Q.x0 + (ti + 0.5) * size, Q.y0 + (tj + 0.5) * size, 0.0, 2.0] for ti, tj in NINE]
    wall = dict(c="fence", p=[[Q.x0 + 10, Q.y0 + 10, 0.0], [Q.x0 + size + 10, Q.y0 + 10, 0.0]])
    return dict(id="v", centre=[0, 0], b=[0, 0, 0, 0], spawn=[[1.0, 2.0]], bk=1,
                t=dict(nx=n, ny=n, x0=Q.x0, y0=Q.y0, dx=Q.dx, dy=Q.dx, z0=0, h=h, k="0" * (n * n)),
                tr=trees, br=[wall], fx=[["lamp", Q.x0 + 1, Q.y0 + 1, 0.0, 0.0]])


class CutTest(unittest.TestCase):
    def test_each_thing_goes_to_one_square(self):
        parts = cut(village())
        self.assertEqual(sorted(parts), sorted(NINE))
        self.assertTrue(all(len(p["tr"]) == 1 for p in parts.values()))
        self.assertEqual(sum(len(p["br"]) for p in parts.values()), 1)
        self.assertEqual(len(parts[(0, 0)]["br"]), 1)
        self.assertEqual(parts[(0, 0)]["fx"][0][0], "lamp")

    def test_the_spawn_is_kept_whole(self):
        parts = cut(village())
        self.assertTrue(all(p["spawn"] == [[1.0, 2.0]] for p in parts.values()))

    def test_neighbouring_terrain_shares_its_edge(self):
        parts = cut(village())
        a, b = parts[(0, 0)]["t"], parts[(1, 0)]["t"]
        n = Q.cells + 1
        self.assertEqual(a["nx"], n)
        self.assertEqual([a["h"][j * n + n - 1] for j in range(n)], [b["h"][j * n] for j in range(n)])
        self.assertAlmostEqual(b["x0"], Q.x0 + Q.dx * Q.cells)


if __name__ == "__main__":
    unittest.main()
