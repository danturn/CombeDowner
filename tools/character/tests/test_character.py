"""The rules table's evaluator, and the area-railings rule on real Bath buildings.

Run from the repo root: python3 -m unittest discover -s tools/character/tests
The Bath tests read the map's kept data (data/combe-down/), so they need no downloads.
"""
import json
import lzma
import math
import os
import sys
import tempfile
import unittest
from unittest import mock

TOOLS = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, TOOLS)

from shapely.geometry import Point, shape          # noqa: E402
from shapely.ops import transform                  # noqa: E402

import character                                   # noqa: E402
from character import decide, holds                # noqa: E402
from character.measure import Survey, years        # noqa: E402

ROOT = os.path.dirname(TOOLS)


def town_house(**over):
    rec = dict(form="terrace", built=[1760, 1790], basement=None, listed="II", conservation="Bath")
    rec.update(over)
    return {"building": rec}


class EvaluatorTest(unittest.TestCase):

    def test_a_georgian_terrace_by_the_pavement_has_area_railings(self):
        got = decide("area_railings", {"front_gap": 2.0}, town_house())
        self.assertEqual(got, {"railings": "area", "rule": "town house area"})

    def test_a_house_known_to_have_no_basement_has_none(self):
        self.assertEqual(decide("area_railings", {"front_gap": 2.0}, town_house(basement=False))["railings"], "none")

    def test_listing_and_conservation_are_not_conditions(self):
        got = decide("area_railings", {"front_gap": 2.0}, town_house(listed=None, conservation=None))
        self.assertEqual(got["railings"], "area")

    def test_after_1914_or_undated_or_detached_or_set_back_has_none(self):
        for over, thing in ((dict(built=[1930, 1949]), {"front_gap": 2.0}), (dict(built=None), {"front_gap": 2.0}),
                            (dict(form="detached"), {"front_gap": 2.0}), ({}, {"front_gap": 9.0}), ({}, {})):
            self.assertEqual(decide("area_railings", thing, town_house(**over))["railings"], "none", (over, thing))

    def test_an_age_band_that_starts_before_1914_counts(self):
        self.assertEqual(decide("area_railings", {"front_gap": 2.0}, town_house(built=[1900, 1929]))["railings"], "area")

    def test_the_tests(self):
        ctx = {"a": 3, "b": None, "c": "x"}
        self.assertTrue(holds({"a": 3, "c": ["x", "y"]}, ctx))
        self.assertTrue(holds({"b": {"not": False}, "a": {"atmost": 3, "above": 2}}, ctx))
        self.assertFalse(holds({"b": {"atleast": 0}}, ctx))
        self.assertTrue(holds({"b": {"known": False}}, ctx))
        self.assertTrue(holds({"any": [{"a": 4}, {"c": "x"}]}, ctx))
        self.assertFalse(holds({"any": [{"a": 4}, {"c": "z"}]}, ctx))

    def test_dates_as_written(self):
        self.assertEqual(years("England and Wales: before 1900"), (0, 1899))
        self.assertEqual(years("England and Wales: 1930-1949"), (1930, 1949))
        self.assertEqual(years("England and Wales: 2012 onwards"), (2012, 2100))
        self.assertEqual(years("c.1820"), (1820, 1820))
        self.assertEqual(years("C18"), (1700, 1799))
        self.assertEqual(years("victorian", {"victorian": [1837, 1901]}), (1837, 1901))
        self.assertIsNone(years("NO DATA!"))

    def test_a_map_can_change_a_rule(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "maps"))
            with open(os.path.join(d, "rules.json"), "w") as f:
                json.dump(character.rules(), f)
            with open(os.path.join(d, "maps", "elsewhere.json"), "w") as f:
                json.dump({"decisions": {"area_railings": {"rules": [
                    {"name": "town house area", "when": {"building.form": "terrace"}, "then": {"railings": "spear"}}]}}}, f)
            with mock.patch.object(character, "HERE", d), mock.patch.dict(character._tables, clear=True):
                got = decide("area_railings", {}, town_house(built=None), map_id="elsewhere")
        self.assertEqual(got, {"railings": "spear", "rule": "town house area"})


def flight(osm_id):
    """An OpenStreetMap way from the kept streets layer, in Bath's map metres."""
    lon0, lat0 = -2.34517, 51.36238
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    for f in json.load(lzma.open(os.path.join(ROOT, "data", "combe-down", "osm-roads.geojson.xz")))["features"]:
        if f["properties"].get("osm") == osm_id:
            return transform(lambda x, y, z=None: ((x - lon0) * kx, (y - lat0) * ky), shape(f["geometry"]))
    raise LookupError(osm_id)


def at(osm_id):
    """The character of the building nearest a flight, the flight's own facts, and the answer."""
    g = flight(osm_id)
    x0, y0, x1, y1 = g.bounds
    rec, gap = Survey("combe-down", (x0 - 40, y0 - 40, x1 + 40, y1 + 40)).near(g)
    thing = {"kind": "steps", "front_gap": gap}
    return rec, thing, decide("area_railings", thing, {"building": rec, "zone": rec and rec["zone"]})


@unittest.skipUnless(os.path.exists(os.path.join(ROOT, "data", "combe-down", "heritage.geojson.xz")), "no kept heritage layer")
class BathTest(unittest.TestCase):
    """The flight's front_gap here is how far the flight is from the house, standing in for how far
    the pavement is: the partition knows the pavement, these tests do not."""

    def test_valley_view_road(self):
        rec, thing, got = at("way/124194673")          # 1_5, near (-134, 4351): sixteen steps up a bank
        self.assertEqual((rec["form"], rec["built"], rec["built_from"]), ("terrace", [1967, 1975], "epc"))
        self.assertGreater(thing["front_gap"], 4)
        self.assertEqual(got["railings"], "none")

    def test_catherine_way(self):
        rec, thing, got = at("way/1533733011")         # 3_6, near (1887, 5345)
        self.assertEqual((rec["form"], rec["built"], rec["built_from"]), ("end-terrace", [1950, 1966], "epc"))
        self.assertEqual(got["railings"], "none")

    def test_new_king_street_opposite_terrace(self):
        """Nos. 1-19 across the street: listed, one outline holding the row, its homes' certificates
        say mid-terrace, before 1900, with basement flats: a town house."""
        s = Survey("combe-down", (-1520, 2170, -1420, 2240))
        rec, gap = s.near(Point(-1469, 2203), reach=0.5)       # Historic England's point for Nos. 10 and 11
        self.assertEqual((rec["form"], rec["built"], rec["basement"], rec["listed"]), ("terrace", [0, 1899], True, "II*"))
        self.assertEqual(decide("area_railings", {"front_gap": 2.0}, {"building": rec})["railings"], "area")

    @unittest.expectedFailure
    def test_new_king_street(self):
        """0_3, near (-1448, 2212). The flight is beside OpenStreetMap's way/90942479, a building
        with a floor below ground that stands on its own in the outlines, holds no home with a
        certificate and that nothing else dates, so the rule cannot say it is an old town house.
        Kept failing until the data dates it (a start_date in OpenStreetMap) and joins it to a row."""
        rec, thing, got = at("way/1338872706")
        self.assertEqual(got["railings"], "area")


if __name__ == "__main__":
    unittest.main()
