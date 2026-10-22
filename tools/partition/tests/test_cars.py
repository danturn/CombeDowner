"""How many kerbs of a street have parked cars depends on how wide the carriageway is."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from partition.write_tile import car_sides


class CarSidesTest(unittest.TestCase):
    def test_a_lane_too_narrow_to_park_in_has_no_cars(self):
        self.assertEqual(car_sides(3.0), "none")
        self.assertEqual(car_sides(4.79), "none")

    def test_an_ordinary_street_has_cars_along_one_kerb(self):
        self.assertEqual(car_sides(4.8), "one")
        self.assertEqual(car_sides(6.5), "one")

    def test_a_wide_street_has_cars_along_both(self):
        self.assertEqual(car_sides(6.6), "both")


if __name__ == "__main__":
    unittest.main()
