"""The two rules pass 3 assembles by, tested on synthetic geometry.

Both are rules the neighbour check found rather than the three reference squares, and both are the
kind that passes a sample of one and fails the city, so each is pinned here rather than left to the
measurement:

- **A division between two plots reads as plot-against-plot, and keeps its parcel source** (`relabel`
  and `classify_edges`). It needs the faces noded over the *worked area* rather than the square, so
  the neighbour's plot is present as a face, and it needs each plot face to carry its building index:
  give them all `None` and both sides label the same, so the pair cannot be named and the division
  falls back to pass 2's guess. The second failure is the one that looked like the first until they
  were separated, so the test covers both. The source stays geometric either way - the faces decide
  the kind, never the source.

- **A row whose piece outline misses the worked area is still gathered** (`blocks_for`). A worked
  piece writes the whole parent-block open face whose representative point lies inside it, and that
  face is not bounded by the piece: gating the row on the piece drops the face from one square and
  not its neighbour, which is exactly the disagreement the neighbour check exists to find.

Both are synthetic - no map data, no pass output - so they run everywhere and in a second.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from partition import assemble
from partition.once import _poly_json
from partition.plots import SUPPORT, classify_edges
from partition.surface import partition


class PlotAgainstPlotTest(unittest.TestCase):
    """A division between two plots of two different pieces is plot-against-plot, and is a parcel.

    Two worked pieces sit either side of a division, with the division's line registered as a parcel
    boundary. Each piece has its own plot face, as pass 2 writes it, so the square assembling them
    has a plot on both sides of the division.
    """

    SQ = (0.0, 0.0, 100.0, 100.0)
    BB = (-40.0, -40.0, 140.0, 140.0)

    def scene(self):
        """Two worked pieces either side of x=50, with a corridor north and south of them and a
        house in each plot.

        The division runs from the south corridor to the north one, which is how a real one is held:
        a drawn boundary must not stop in mid-air, so its ends land on something that is there
        (`_drop_dangling`), and for a plot division that is the street at the front and the block's
        far side at the back. The houses matter for the same kind of reason: a registered boundary
        is drawn only where something really is along it - the lidar, a mapped barrier, or a garden
        edge - because a title line runs across a lawn or two fields of one farm with nothing
        standing on it. Two houses either side make the division a garden edge."""
        left = box(10, 10, 50, 90)
        right = box(50, 10, 90, 90)
        corridors = [box(0, 0, 100, 10), box(0, 90, 100, 100)]
        division = LineString([(50, 10), (50, 90)])
        houses = [box(20, 40, 40, 60), box(60, 40, 80, 60)]
        return left, right, corridors, division, houses

    def faces(self, plot_data):
        """The assembled faces of the two pieces, with `plot_data` as each plot face's building
        index - the real one, or None as the first version of `relabel` wrote them."""
        left, right, _corridors, _division, _houses = self.scene()
        return partition([(left, "plot", plot_data(1)), (right, "plot", plot_data(2))],
                         box(*self.BB))

    def raw(self):
        """The division as pass 2 wrote it, with its own guess wrong on one side.

        Pass 2 divided the piece knowing only that piece's buildings, evidence and parcels, and never
        saw a corridor: its guess at the far side of a division is the thing `relabel` exists to
        correct. So the fixture's guess is the one the faces must overturn - `("plot", 1)` against
        `("open",)` - and a correct answer is `("plot", 1)` against `("plot", 2)`.

        (This is why the test does not use a fixture whose guess is already right: with the guess
        right, a `relabel` that cannot name the pair falls back to it and looks like it worked.)"""
        return [(LineString([(50, 10), (50, 90)]), ("plot", 1), ("open",))]

    def classify(self, raw):
        """Run the classification as pass 3 does, over the division's registered line."""
        _left, _right, corridors, division, houses = self.scene()
        return classify_edges(raw, [], STRtree([]), lambda *_: "suburb",
                              [division], STRtree([division]),
                              houses=houses,
                              others=unary_union(corridors).boundary, B=box(*self.BB))

    def test_both_sides_of_a_division_are_read_as_their_own_plot(self):
        faces = self.faces(lambda i: i)
        plots = sorted(assemble.face_label(f) for f in faces if f[1] == "plot")
        self.assertEqual(plots, [("plot", 1), ("plot", 2)],
                         "each plot face must label as its own plot")
        out = assemble.relabel(self.raw(), faces, box(*self.BB))
        self.assertEqual({*out[0][1:]}, {("plot", 1), ("plot", 2)},
                         f"the division came out {out[0][1]} / {out[0][2]}")
        edges, _share = self.classify(out)
        self.assertEqual(len(edges), 1, "and it should be drawn as one boundary")

    def test_without_a_building_index_the_division_cannot_be_named(self):
        # the failure that looked like the face set's, and is not: `face_label` returns
        # ("plot", None) for *both* sides, so the two are equal, `relabel` sees one label rather than
        # two, and cannot name the pair as plot-against-plot at all. Every plot-against-plot division
        # in the square goes that way (measured on the village square: parcel 3,173 -> 1,008 over the
        # worked area, 1,450 with the faces clipped to the square).
        faces = self.faces(lambda _i: None)
        plots = [assemble.face_label(f) for f in faces if f[1] == "plot"]
        self.assertEqual(set(plots), {("plot", None)},
                         "with no index both plot faces label the same")
        out = assemble.relabel(self.raw(), faces, box(*self.BB))
        self.assertNotIn(("plot", 2), out[0][1:],
                         "so the far plot is never named: the division is not read as two plots")
        self.assertIn(("open",), out[0][1:],
                      "and the side the faces cannot name keeps pass 2's guess")
        named = assemble.relabel(self.raw(), self.faces(lambda i: i), box(*self.BB))
        self.assertEqual({*named[0][1:]}, {("plot", 1), ("plot", 2)},
                         "with the index the faces overturn the guess")
        # and the boundary itself changes with it: a plot against open land is a hedge, and the
        # registered division that should be drawn as one is not drawn as plot-against-plot at all
        self.assertNotEqual(out[0][1:], named[0][1:],
                            "the index is what the rule turns on, so the two must differ")

    def test_a_division_between_two_plots_keeps_its_parcel_source(self):
        # the source is geometric, from the line the boundary lies on: the faces decide the *kind*
        # (division, front, fence) and nothing else, so a division between two plots stays a parcel
        # however it was read
        out = assemble.relabel(self.raw(), self.faces(lambda i: i), box(*self.BB))
        edges, share = self.classify(out)
        self.assertEqual(len(edges), 1, "the division should be drawn")
        _s, kind, sup, src = edges[0][:4]
        self.assertEqual(src, "parcel", "a division on a registered boundary is a parcel")
        self.assertEqual(kind, "fence", "two gardens meeting are a fence, not a hedge")
        self.assertGreaterEqual(sup, SUPPORT, "the parcel counts as evidence")
        self.assertGreater(share, 0.0, "and towards the square's parcel share")

    def test_the_source_does_not_change_when_the_labels_do(self):
        # the same division, read from the faces with an index and from pass 2's own labels: the kind
        # differs (a division against a hedge) and the source must not, because it is the line the
        # boundary lies on that decides the source, never the faces
        named = self.classify(assemble.relabel(self.raw(), self.faces(lambda i: i), box(*self.BB)))
        guessed = self.classify(assemble.relabel(self.raw(), self.faces(lambda _i: None),
                                                box(*self.BB)))
        self.assertEqual([e[3] for e in named[0]], [e[3] for e in guessed[0]],
                         "the source must not depend on which faces the kind was read from")
        self.assertNotEqual([e[1] for e in named[0]], [e[1] for e in guessed[0]],
                            "the kind does depend on the faces, which is the point of reading them")


class RowGateTest(unittest.TestCase):
    """A gathered row is kept because its *faces* reach the worked area, not because its piece does.

    A worked piece is `block ∩ buffer(buildings, REACH_GROW)`: a short one ends 60 m from its house,
    while the open face it writes is the rest of the parent block and can run hundreds of metres. The
    row's piece outline and its open face therefore have very different extents, and it is the face
    that has to be gathered - the piece outline is not a boundary in the ground at all.
    """

    def row(self):
        """A short piece at x=-60..-30, and an open face running from it out to x=200.

        The piece is well left of the square and the face runs from it across the square: the piece
        misses the worked area and the face covers it, which is the pair the gate has to tell apart.
        (Measured on the map: a 36 m piece carrying a 1,901 m2 open face.)"""
        piece = box(-60, 10, -30, 30)
        face = box(-60, 10, 200, 30)
        return dict(n=1, key=list(piece.bounds), xy=_poly_json(piece),
                    plots=[dict(kind="open", bi=None, xy=_poly_json(face))], edges=[])

    def test_a_face_reaching_the_worked_area_is_gathered_when_the_piece_misses_it(self):
        row = self.row()
        sq = (50.0, -40.0, 150.0, 140.0)
        self.assertFalse(assemble._poly_from(row["xy"]).intersects(box(*sq).buffer(0.5)),
                         "the piece must miss the worked area for this to test anything")
        plots, _edges = assemble.blocks_for([row], sq)
        self.assertEqual(len(plots), 1, "the face reaches the worked area and must be gathered")
        self.assertGreater(plots[0][0].area, 0, "and it should carry ground")

    def test_the_same_row_over_a_worked_area_it_does_not_reach_is_dropped(self):
        # the guard still bites: an area neither the piece nor the face reaches keeps nothing, so
        # "gather everything always" is not what the fix does
        plots, _edges = assemble.blocks_for([self.row()], (300.0, -40.0, 400.0, 140.0))
        self.assertEqual(plots, [], "a row that reaches nothing must still be dropped")


if __name__ == "__main__":
    unittest.main()
