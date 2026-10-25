"""How many kerbs of a street have parked cars depends on how wide the carriageway is."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from partition.write_tile import car_level, car_sides, wires_on_poles


class CarSidesTest(unittest.TestCase):
    def test_a_lane_too_narrow_to_park_in_has_no_cars(self):
        self.assertEqual(car_sides(3.0), "none")
        self.assertEqual(car_sides(4.79), "none")

    def test_an_ordinary_street_has_cars_along_one_kerb(self):
        self.assertEqual(car_sides(4.8), "one")
        self.assertEqual(car_sides(7.0), "one")

    def test_a_wide_street_has_cars_along_both(self):
        self.assertEqual(car_sides(7.1), "both")


class CarLevelTest(unittest.TestCase):
    def test_off_the_grid_is_not_level(self):
        edge = lambda x, y: None if x > 10 else 5.0
        self.assertTrue(car_level(0.0, 0.0, 0.0, edge))
        self.assertFalse(car_level(10.0, 0.0, 0.0, edge))


class WiresTest(unittest.TestCase):
    def test_a_wire_follows_its_moved_pole_and_goes_with_a_removed_one(self):
        poles = {(1.0, 1.0, 10.0): ["pole", 2.0, 1.0, 10.5, 0.0], (5.0, 5.0, 10.0): None}
        wires = [[1.0, 1.0, 17.3, 9.0, 9.0, 12.0], [5.0, 5.0, 17.6, 9.0, 9.0, 12.0]]
        self.assertEqual(wires_on_poles(wires, poles), [[2.0, 1.0, 17.8, 9.0, 9.0, 12.0]])


if __name__ == "__main__":
    unittest.main()
