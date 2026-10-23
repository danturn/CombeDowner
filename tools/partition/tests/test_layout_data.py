"""Building cleaning and the lon/lat window test."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import box

from partition.buildings import clean_buildings
from partition.data import _lonlat_bounds


class BuildingsTest(unittest.TestCase):
    def test_a_dropped_footprint_takes_nothing_from_its_neighbour(self):
        # the small one is cut to nothing by the big one before it, so it must not cut the big one's
        # neighbour in turn
        big = box(0, 0, 10, 10)
        tiny = box(8, 0, 12, 2)                 # all but 4 m2 of it lies in big, so it is dropped
        later = box(11, 0, 20, 10)              # overlaps only the part of tiny that is dropped
        res, _ = clean_buildings([big, tiny, later])
        self.assertAlmostEqual(sum(p.area for p in res), 190, delta=0.5)

    def test_a_snapped_bow_tie_does_not_stop_the_cleaning(self):
        from shapely.geometry import Polygon
        bow = Polygon([(0, 0), (10, 10), (10, 0), (0, 10)])
        res, _ = clean_buildings([bow, box(10.3, 0, 20, 10)])
        self.assertTrue(all(p.is_valid for p in res))


class WindowBoundsTest(unittest.TestCase):
    def test_a_collection_has_its_real_envelope(self):
        g = {"type": "GeometryCollection", "geometries": [
            {"type": "Point", "coordinates": [-2.35, 51.38]},
            {"type": "LineString", "coordinates": [[-2.36, 51.37], [-2.34, 51.39]]}]}
        self.assertEqual(_lonlat_bounds(g), (-2.36, 51.37, -2.34, 51.39))

    def test_a_polygon_is_walked_as_before(self):
        g = {"type": "Polygon", "coordinates": [[[0, 0], [2, 0], [2, 3], [0, 0]]]}
        self.assertEqual(_lonlat_bounds(g), (0, 0, 2, 3))


if __name__ == "__main__":
    unittest.main()
