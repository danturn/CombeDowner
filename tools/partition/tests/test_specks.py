"""Hairline faces left by noding two layers are joined to a neighbour, not dropped as holes."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import box

from partition.surface import _without_specks


class SpeckTest(unittest.TestCase):

    def test_a_hairline_face_joins_its_neighbour(self):
        a, b = box(0, 0, 10, 10), box(10, 0, 20, 10)
        speck = box(10, 10, 10.05, 10.1)
        out = _without_specks([a, b, speck])
        self.assertEqual(len(out), 2)
        self.assertAlmostEqual(sum(f.area for f in out), 200.005, places=3)

    def test_big_faces_are_untouched(self):
        faces = [box(0, 0, 1, 1), box(1, 0, 2, 1)]
        self.assertEqual(_without_specks(faces), faces)


if __name__ == "__main__":
    unittest.main()
