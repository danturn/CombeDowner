"""The open strip between two plots, and when it must survive.

The block division cuts each plot from its own house outwards, and where two plots nearly meet it
leaves a strip of open ground a few centimetres wide. Both plots then draw their own boundary along
their own side, which `check_map` reports as "walls doubled" and the player sees as two hedges an
unwalkable gap apart.

A strip is merged only when it is under a metre at its widest, bounded by plots on both long sides,
and has no source way inside it. The three tests below are the three cases: a sliver (merged), an
alley (kept), and a narrow strip with a mapped footway through it (kept).

`_absorb_plot_slivers` works on the faces and labels `make_plots` has just built, so these tests build
those two lists directly - no map data, no pass output.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

from partition.plots import SLIVER_WIDTH, _absorb_plot_slivers, _inscribed_width, _recut


def scene(strip_width, strip_y=0.0):
    """Two 20 x 20 gardens either side of a strip of the given width, spanning y 0..20.

    Faces and labels as `make_plots` has them: every face written, plots labelled (plot, index),
    open ones ("open",)."""
    left = box(0, 0, 20, 20)
    right = box(20 + strip_width, 0, 40 + strip_width, 20)
    strip = box(20, strip_y, 20 + strip_width, 20 + strip_y)
    faces = [left, strip, right]
    labels = [("plot", 1), ("open",), ("plot", 2)]
    return faces, labels, [0, 1, 2]


class SliverBetweenPlotsTest(unittest.TestCase):

    def absorb(self, width, ways=()):
        faces, labels, written = scene(width)
        block = box(-5, -5, 50, 25)
        logs = []
        labels, faces = _absorb_plot_slivers(faces, labels, written, block, ways,
                                             log=lambda m: logs.append(m))
        return faces, labels, logs

    def test_a_sliver_between_two_plots_is_merged(self):
        faces, labels, logs = self.absorb(0.3)
        self.assertTrue(any("merged" in m for m in logs),
                        "a 30 cm strip between two gardens is a division artefact")
        self.assertEqual(sum(1 for lab in labels if lab[0] == "open"), 0,
                         "no open face is left between the two plots")
        self.assertEqual(len(faces), 3, "the strip's ground went to a neighbour, not into the air")

    def test_a_one_and_a_half_metre_alley_is_kept(self):
        faces, labels, logs = self.absorb(1.5)
        self.assertFalse(any("merged" in m for m in logs),
                         "a 1.5 m gap between gardens is a passage, and stays one")

    def test_a_narrow_strip_with_a_mapped_footway_is_kept(self):
        way = LineString([(20.15, 5), (20.15, 15)])       # inside the 30 cm strip
        faces, labels, logs = self.absorb(0.3, ways=[way])
        self.assertFalse(any("merged" in m for m in logs),
                         "the map says there is a way here, so it is an alley whatever its width")

    def test_the_width_measure_sees_a_long_thin_strip(self):
        # 0.4 m wide and 30 m long has an area of 12 m2 and a length of 30 m: any length or area
        # threshold lets it through, which is why the measure is the inscribed circle
        long_strip = box(0, 0, 0.4, 30)
        self.assertLess(_inscribed_width(long_strip), SLIVER_WIDTH)
        self.assertGreater(long_strip.area, 10)


class HairlineSlitTest(unittest.TestCase):
    def test_a_slit_overlapping_nothing_takes_the_ground_it_lies_in(self):
        region = box(0, 0, 10, 10)
        slit = Polygon([(6, 0), (6, 5), (6.0001, 0)])
        faces = [box(0, 0, 4, 10), box(4, 0, 10, 10).difference(slit)]
        labels = [("plot", 1), ("plot", 2)]
        lines = unary_union([region.boundary, LineString([(4, 0), (4, 10)]), slit.exterior])
        recut, got = _recut(region, lines, faces, labels)
        thin = [lab for f, lab in zip(recut, got) if f.area < 1e-2]
        self.assertEqual(thin, [("plot", 2)], "left open, it was drawn as a hedge through a house")


if __name__ == "__main__":
    unittest.main()
