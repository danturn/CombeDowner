"""Front paths run from a gate to the door it leads to, and a door whose only boundary is on the
wrong side of its house gets a gate on the side it faces."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import box

from partition.write_tile import gates_for_doors, paths_from_openings

HOUSE = box(0, 0, 8, 6)
FRONT = dict(kind="fence", support=1.0, source="front", sides=[], xy=[(-6, -8), (14, -8)])
BACK = dict(kind="fence", support=1.0, source="parcel", sides=[], xy=[(-6, 12), (14, 12)])
DOOR_SOUTH = [4.0, -0.1, 0.0, 0.0, 0, 0]


class FrontPaths(unittest.TestCase):
    def test_gate_leads_to_the_door(self):
        part = dict(edges=[FRONT], openings=[dict(edge=0, t=10.0, width=1.0, kind="gate")])
        fp, _ = paths_from_openings(part, [HOUSE], [DOOR_SOUTH])
        self.assertEqual(len(fp), 1)
        self.assertAlmostEqual(fp[0][2], 4.0, 1)

    def test_open_front_gets_a_path(self):
        part = dict(edges=[FRONT], openings=[dict(edge=0, t=10.0, width=20.0, kind="open")])
        fp, _ = paths_from_openings(part, [HOUSE], [DOOR_SOUTH])
        self.assertEqual(len(fp), 1)

    def test_gate_behind_the_house_leads_nowhere(self):
        part = dict(edges=[BACK], openings=[dict(edge=0, t=10.0, width=1.0, kind="gate")])
        fp, dropped = paths_from_openings(part, [HOUSE], [DOOR_SOUTH])
        self.assertEqual((fp, dropped), ([], 1))

    def test_door_gets_a_gate_on_the_side_it_faces(self):
        part = dict(edges=[FRONT, BACK], openings=[dict(edge=1, t=10.0, width=1.0, kind="gate")])
        new, replaced = gates_for_doors(part, [HOUSE], [DOOR_SOUTH])
        self.assertEqual([(o["edge"], o["kind"]) for o in new], [(0, "gate")])
        self.assertEqual(replaced, [part["openings"][0]])


if __name__ == "__main__":
    unittest.main()
