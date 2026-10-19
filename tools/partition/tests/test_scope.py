"""The scope rule and the fragment rules: which ground a square judges, and which it defers.

A square gathers its neighbours' worked pieces, so the plot ground it holds is clipped to the *worked
area* - the square plus its 40 m margin - and part of that ground is outside the square. The square
does not ship the margin ground: it clips every face to the square before writing its partition, and
the neighbouring square that owns it ships it, with the house and the gate. Judging it here reported
thousands of plots as having no way in when their gate was next door (measured: all 257 failing
fragments across nine squares had no ground inside the square at all).

So the rules are:

- **scope**: a plot or plot part lying entirely in the margin is not judged by this square. Its owner
  square judges it. Every piece of shipped ground is still judged exactly once;
- **deferral**: a fragment *inside* the square whose house is in another square is deferred to that
  square, and resolved city-wide - the holder must have gated the plot, or it is a finding;
- **walkability**: a deferred fragment must meet the shared edge with the holder's square along at
  least `FRAG_RUN`, or it is a finding, because the player cannot walk to it from the rest of its plot.

The fixtures use the real square (0,0) and its east neighbour (1,0), so the square box and the square
index agree - which is exactly the thing that went wrong once (`shared_edge` compared an index against
a coordinate and returned None for every pair, silently disabling the walkability test).
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString, Polygon, box

from partition import Q
from partition.checks import (FRAG_RUN, deferred_fragments, in_square, resolve_fragments,
                             shared_edge, square_index)

SIDE = Q.dx * Q.cells
X0, Y0 = Q.x0, Q.y0                       # south-west corner of square (0,0)
SQ = (X0, Y0, X0 + SIDE, Y0 + SIDE)       # square (0,0)
EAST = (1, 0)


def holder_east(_bidx):
    """Every building's house is in the square to the east, for these tests."""
    return EAST


def at(dx, dy, w, h):
    """A box offset from square (0,0)'s own origin, so the fixtures are readable."""
    return box(X0 + dx, Y0 + dy, X0 + dx + w, Y0 + dy + h)


class SquareIndexTest(unittest.TestCase):
    def test_the_box_and_the_index_agree(self):
        # the trap that cost a square its deferral: these two must be the same square
        self.assertEqual(square_index(SQ), (0, 0))
        self.assertEqual(square_index((X0 + SIDE, Y0, X0 + 2 * SIDE, Y0 + SIDE)), (1, 0))


class ScopeTest(unittest.TestCase):
    """A plot part entirely in the margin is not judged by this square."""

    def test_a_plot_entirely_in_the_margin_is_not_judged(self):
        margin_plot = (at(SIDE + 20, 10, 20, 20), "plot", 7)   # past the square's east edge
        mine, theirs = in_square([margin_plot], SQ)
        self.assertEqual(mine, [], "a plot entirely in the margin is not this square's to judge")
        self.assertEqual(len(theirs), 1, "and it is the margin ground")

    def test_a_plot_inside_the_square_is_judged(self):
        mine, theirs = in_square([(at(10, 10, 20, 20), "plot", 8)], SQ)
        self.assertEqual(len(mine), 1, "ground inside the square is judged here")
        self.assertEqual(theirs, [])

    def test_a_plot_straddling_the_edge_is_judged_on_the_part_inside(self):
        mine, theirs = in_square([(at(SIDE - 20, 10, 40, 20), "plot", 9)], SQ)
        self.assertEqual(len(mine), 1, "the part inside the square is judged here")
        self.assertAlmostEqual(mine[0][0].area, 20 * 20, places=3)
        self.assertEqual(theirs, [])

    def test_a_margin_plot_gets_no_finding_and_is_not_counted_as_judged(self):
        judged, deferred, in_margin = deferred_fragments(
            SQ, [(at(SIDE + 20, 10, 20, 20), "plot", 7)], {}, [7], holder_east)
        self.assertEqual(judged, [], "not judged")
        self.assertEqual(deferred, [], "not deferred either: its owner square judges it")
        self.assertEqual(in_margin, [7], "it is counted as margin ground")


class DeferralTest(unittest.TestCase):
    """An in-square fragment whose house is next door is deferred, and resolved city-wide."""

    def fragment(self):
        """A plot part inside the square, running 5 m along the east edge: the plot continues into
        the square to the east, where its house is."""
        return (at(SIDE - 10, 10, 10, 5), "plot", 11)

    def test_an_in_square_fragment_whose_house_is_next_door_is_deferred(self):
        judged, deferred, in_margin = deferred_fragments(SQ, [self.fragment()], {}, [11],
                                                        holder_east)
        self.assertEqual(judged, [], "the square must not judge it: it has no house here")
        self.assertEqual(deferred, [(11, EAST)], "it is deferred to the square holding the house")
        self.assertEqual(in_margin, [], "it is inside the square, so not margin ground")

    def test_the_holder_gating_the_plot_leaves_no_finding(self):
        self.assertEqual(resolve_fragments([((0, 0), 11, EAST)], holders={11}, gated={11}), [],
                         "the holder gated the plot, so there is nothing to report")

    def test_the_holder_not_gating_the_plot_is_a_finding(self):
        findings = resolve_fragments([((0, 0), 11, EAST)], holders=set(), gated=set())
        self.assertEqual(len(findings), 1, "no opening anywhere: the plot has no way in")
        self.assertEqual(findings[0]["rule"], "front_without_opening")
        self.assertEqual(findings[0]["square"], [0, 0], "reported on the fragment's square")

    def test_no_square_holding_the_house_is_a_finding(self):
        findings = resolve_fragments([((0, 0), 11, None)], holders=set(), gated=set())
        self.assertEqual(len(findings), 1, "nobody holds the house, so nobody can gate the plot")

    def test_a_fragment_touching_the_shared_edge_at_a_point_is_a_finding(self):
        # a wedge whose contact with the east edge is a single point: the player cannot walk through
        wedge = Polygon([(X0 + SIDE - 20, Y0 + 10), (X0 + SIDE, Y0 + 12), (X0 + SIDE - 20, Y0 + 14)])
        east_edge = LineString([(X0 + SIDE, Y0), (X0 + SIDE, Y0 + SIDE)])
        self.assertAlmostEqual(wedge.intersection(east_edge).length, 0.0, places=9)
        judged, deferred, _m = deferred_fragments(SQ, [(wedge, "plot", 12)], {}, [12], holder_east)
        self.assertEqual(deferred, [], "a point touch is not walkable, so it is not deferred")
        self.assertEqual(judged, [12], "it is judged here, and reported")

    def test_a_fragment_with_a_run_shorter_than_the_minimum_is_a_finding(self):
        thin = at(SIDE - 0.4, 10, 0.4, 0.4)          # 0.4 m of contact, under FRAG_RUN
        judged, deferred, _m = deferred_fragments(SQ, [(thin, "plot", 13)], {}, [13], holder_east)
        self.assertEqual(deferred, [], f"under {FRAG_RUN} m is not walkable")
        self.assertEqual(judged, [13])

    def test_a_fragment_with_a_long_enough_run_is_deferred(self):
        good = at(SIDE - 2, 10, 2, 3)                # 3 m of contact
        judged, deferred, _m = deferred_fragments(SQ, [(good, "plot", 14)], {}, [14], holder_east)
        self.assertEqual(judged, [], "walkable, so deferred")
        self.assertEqual(deferred, [(14, EAST)])


class SharedEdgeTest(unittest.TestCase):
    """The shared edge is the line a plot crosses to continue into the neighbouring square."""

    def test_the_shared_edge_with_the_east_neighbour(self):
        e = shared_edge((0, 0), (1, 0), SQ)
        self.assertAlmostEqual(e.length, SIDE, places=3)
        self.assertAlmostEqual(list(e.coords)[0][0], X0 + SIDE, places=3)

    def test_the_shared_edge_with_the_north_neighbour(self):
        e = shared_edge((0, 0), (0, 1), SQ)
        self.assertAlmostEqual(e.length, SIDE, places=3)
        self.assertAlmostEqual(list(e.coords)[0][1], Y0 + SIDE, places=3)

    def test_a_diagonal_neighbour_shares_no_edge(self):
        self.assertIsNone(shared_edge((0, 0), (1, 1), SQ), "a corner touch shares no edge")

    def test_the_edge_is_between_the_two_squares(self):
        # the east neighbour's shared edge is the same line, seen from its own side
        a = shared_edge((0, 0), (1, 0), SQ)
        b = shared_edge((1, 0), (0, 0), (X0 + SIDE, Y0, X0 + 2 * SIDE, Y0 + SIDE))
        self.assertAlmostEqual(a.distance(b), 0.0, places=6)


if __name__ == "__main__":
    unittest.main()
