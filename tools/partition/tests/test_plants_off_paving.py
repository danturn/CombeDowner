"""A tree or shrub on a pavement or path goes back into the garden behind it; a tree that can't stays as
a street tree, and a shrub that can't goes."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from partition.write_tile import drop_clashes


def face(cls, x0, y0, x1, y1):
    return dict(cls=cls, xy=[[x0, y0], [x1, y0], [x1, y1], [x0, y1]])


ROAD = dict(c="residential", n="", w=6.0, pv=[2.0, 2.0], p=[[0.0, 0.0, 10.0], [100.0, 0.0, 10.0]])
PART = dict(faces=[face("carriageway", 0, -3, 100, 3), face("pavement", 0, 3, 100, 5),
                   face("plot", 0, 5, 100, 30), face("path", 50, 5, 52, 30)])


def run(tile, part=PART, br=()):
    tile = dict(dict(tr=[], sb=[], fx=[], bl=[]), **tile)
    drop_clashes(tile, part, list(br), rd=[ROAD], ground=lambda x, y: 10.0)
    return tile


class PlantsOffPavingTest(unittest.TestCase):
    def test_a_tree_on_the_pavement_goes_back_into_the_garden(self):
        t = run(dict(tr=[[20.0, 4.5, 10.0, 5.0]]))
        self.assertEqual(len(t["tr"]), 1)
        self.assertGreater(t["tr"][0][1], 5.0)

    def test_a_tree_that_cannot_move_stays_as_a_street_tree(self):
        part = dict(faces=PART["faces"][:2])
        t = run(dict(tr=[[20.0, 4.0, 10.0, 5.0]]), dict(part, faces=part["faces"] + [face("pavement", 0, 5, 100, 9)]))
        self.assertEqual(t["tr"], [[20.0, 4.0, 10.0, 5.0]])

    def test_a_shrub_that_cannot_move_goes(self):
        part = dict(faces=PART["faces"][:2] + [face("pavement", 0, 5, 100, 9)])
        self.assertEqual(run(dict(sb=[[20.0, 4.0, 10.0, 1.0]]), part)["sb"], [])

    def test_a_tree_on_a_path_leaves_it(self):
        t = run(dict(tr=[[51.0, 20.0, 10.0, 5.0]]))
        self.assertTrue(all(not (50 <= r[0] <= 52) for r in t["tr"]))

    def test_a_plant_nudged_off_a_wall_does_not_land_on_a_path(self):
        wall = dict(c="fence", p=[[52.5, 6.0, 10.0], [52.5, 29.0, 10.0]])
        t = run(dict(tr=[[52.2, 20.0, 10.0, 5.0]]), br=[wall])
        self.assertTrue(all(not (50 <= r[0] <= 52) for r in t["tr"]))


if __name__ == "__main__":
    unittest.main()
