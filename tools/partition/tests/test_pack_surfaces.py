"""The street faces come back from their packed form exactly as they were written, to the centimetre."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from partition.write_tile import pack_surfaces, unpack_surfaces


SF = dict(v=[-1949.35, 1890.78, 22.9, -1948.63, 1890.58, 22.91, -1950.0, 1885.65, 23.05, -1924.66, 1881.48, 22.92],
          road=[0, 1, 2], pave=[1, 3, 2], service=[], path=[2, 3, 0],
          e=[dict(c="road", i=[0, 1, 2, 0]), dict(c="pave", i=[1, 3, 2, 1])])


class PackSurfacesTest(unittest.TestCase):
    def test_round_trip(self):
        self.assertEqual(unpack_surfaces(pack_surfaces(SF, -1975.0, 1785.0)), {**SF, "l": 1})

    def test_no_faces_stay_none(self):
        self.assertIsNone(pack_surfaces(None, 0.0, 0.0))

    def test_unpacked_faces_pass_through(self):
        self.assertIs(unpack_surfaces(SF), SF)


if __name__ == "__main__":
    unittest.main()
