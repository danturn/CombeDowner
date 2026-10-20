"""One piece, built twice in fresh processes: the same piece must come out.

Stage 3b's promise is that each piece is computed once, and that is only worth something if computing
it again gives the same piece. Two whole-city runs and a single-worker run were compared by hand and
came out identical - but a hand-run comparison catches nothing later. This is the cheap version that
runs in the suite: one real piece, divided in two **separate processes**, compared on its plots and
its edge network.

Separate processes matter. A pool starts workers by spawn, so each one re-imports the module and has
its own hash seed, its own caches and its own iteration order. Two runs in one process would share all
three and could agree while the pool disagrees - which is the failure this is for.

Fresh processes are also why the work is a *script* run by subprocess rather than a function call: the
child needs an entry point it can import, and `python3 -c` re-imports the module exactly as a pool
worker does.

Skips unless the map data is unpacked and a pass 2 run exists in `out/once-p1`.
"""
import hashlib
import json
import os
import random
import subprocess
import sys
import tempfile
import textwrap
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
RAW = os.path.join(ROOT, "data", "raw", "combe-down", "wide")
GRAPH = os.path.join(ROOT, "out", "once-p1")

from shapely.geometry import box
from shapely.strtree import STRtree

from partition import once, zone_at
from partition.plots import make_plots

CHILD = textwrap.dedent('''
    import hashlib, json, os, sys
    sys.path.insert(0, os.path.join({root!r}, "tools"))
    from partition import MARGIN, once, zone_at
    from partition.plots import make_plots
    from shapely.geometry import box

    graph, raw, index = {graph!r}, {raw!r}, {index}

    parents = once.read_parents(graph)
    corridors = once.read_corridors(graph)
    piece = once._poly_from(json.load(open(os.path.join(graph, "blocks.json")))[index]["xy"])
    win = once.block_window_for([piece], parents)
    env = once.window_inputs(graph, raw, once.map_bbox(), win, corridors)
    parent = once.parent_for(piece, parents)
    cx, cy = piece.representative_point().x, piece.representative_point().y
    p, e = make_plots(piece, env["buildings"], env["ev_lines"], env["ev_tree"], zone_at(cx, cy),
                      env["axes"], env["fronts"], env["bunion"], box(*once.map_bbox()),
                      parcels=env["parcels"], parent=parent, log=lambda *_: None)
    h = hashlib.sha256()
    for g, k, b in sorted(p, key=lambda t: (-t[0].area, t[1], -1 if t[2] is None else t[2])):
        h.update(json.dumps([k, b, round(g.area, 6),
                             [[round(x, 6), round(y, 6)] for x, y in g.exterior.coords]]).encode())
    for s, a, b in sorted(e, key=lambda t: (-t[0].length, str(t[1]), str(t[2]))):
        h.update(json.dumps([list(a), list(b), round(s.length, 6),
                             [[round(x, 6), round(y, 6)] for x, y in s.coords]]).encode())
    print(h.hexdigest())
''')


def have_data():
    return os.path.exists(os.path.join(RAW, "building.geojson"))


def have_pass2():
    return os.path.exists(os.path.join(GRAPH, "blocks.json"))


@unittest.skipUnless(have_data(), "needs data/raw/combe-down/wide (tools/mapdata.py unpack)")
@unittest.skipUnless(have_pass2(), "needs a pass 2 run in out/once-p1")
class PieceIsRepeatableTest(unittest.TestCase):
    """A piece divided twice, in two processes that share nothing, is the same piece."""

    def digest_in_a_fresh_process(self, index):
        """The piece's plots and edges, digested, from a process that has built nothing else.

        `PYTHONHASHSEED` is left to the interpreter on purpose: each child gets its own random hash
        seed, which is what a pool worker gets. Setting it would hide exactly the class of bug this
        is looking for (iteration over a set or dict of strings).
        """
        env = dict(os.environ)
        env.pop("PYTHONHASHSEED", None)
        code = CHILD.format(root=ROOT, graph=GRAPH, raw=RAW, index=index)
        r = subprocess.run([sys.executable, "-I", "-c", code], capture_output=True, text=True,
                           env=env, timeout=900)
        self.assertEqual(r.returncode, 0, f"the child failed:\n{r.stderr[-2000:]}")
        return r.stdout.strip().splitlines()[-1]

    def test_one_piece_is_the_same_from_two_fresh_processes(self):
        pieces = json.load(open(os.path.join(GRAPH, "blocks.json")))
        # a spread rather than one: a boundary piece, a big one and a middling one behave differently
        for index in (3, len(pieces) // 3, len(pieces) // 2, len(pieces) - 4):
            with self.subTest(piece=index):
                a = self.digest_in_a_fresh_process(index)
                b = self.digest_in_a_fresh_process(index)
                self.assertEqual(a, b,
                                 f"piece {index} differs between two fresh processes: {a} vs {b}")

    def test_two_different_pieces_do_not_collide(self):
        # a guard on the test itself: if the digest ignored the piece, the test above would pass for
        # any two runs. Two different pieces must digest differently.
        a = self.digest_in_a_fresh_process(3)
        b = self.digest_in_a_fresh_process(len(json.load(open(os.path.join(GRAPH, "blocks.json")))) - 4)
        self.assertNotEqual(a, b, "the digest does not depend on the piece, so it proves nothing")


if __name__ == "__main__":
    unittest.main()


@unittest.skipUnless(have_data(), "needs data/raw/combe-down/wide (tools/mapdata.py unpack)")
@unittest.skipUnless(have_pass2(), "needs a pass 2 run in out/once-p1")
class InputOrderTest(unittest.TestCase):
    """A piece divided from its inputs in a different order is the same piece.

    The bug this is for: `make_plots` took its building list straight from an `STRtree.query`, whose
    order depends on how many items went into the index - so a slightly bigger window returned the
    same buildings in a different order, the side-wall lines came out differently, and one piece was
    cut into 47 plots instead of 45 with the total area identical. The trigger was a cut line moving
    by a centimetre.

    Sorting every order-sensitive list fixed that case. This tests the property itself, so a new
    ordering bug anywhere in the list reaches it: build the piece once as it is, then again with its
    building and evidence lists shuffled by a fixed seed, and require the plots, the labels and the
    network to be identical.
    """

    def build(self, piece, env, parent, order_seed=None):
        """make_plots for one piece, optionally with its input lists shuffled by a fixed seed."""
        buildings = list(env['buildings'])
        ev_lines = list(env['ev_lines'])
        if order_seed is not None:
            random.Random(order_seed).shuffle(buildings)
            random.Random(order_seed + 1).shuffle(ev_lines)
            # the tree is built from the shuffled list, which is the point: the index's own order then
            # differs, exactly as a different window makes it differ
            ev_tree = STRtree(ev_lines)
        else:
            ev_tree = env['ev_tree']
        cx, cy = piece.representative_point().x, piece.representative_point().y
        return make_plots(piece, buildings, ev_lines, ev_tree, zone_at(cx, cy),
                          env['axes'], env['fronts'], env['bunion'], box(*once.map_bbox()),
                          parcels=env['parcels'], parent=parent, log=lambda *_: None)

    def digest(self, plots, edges):
        """A digest of the piece as *geometry and labels*, not of its coordinates.

        Comparing raw coordinate lists was the first version and it was wrong: `unary_union` can
        return the same polygon with a repeated vertex or a different starting point, so two identical
        faces digested differently and the test failed on correct code. What must be identical is the
        ground, the labels and the length of the network - so that is what is digested.
        """
        h = hashlib.sha256()
        for g, kind, bi in sorted(plots, key=lambda t: (-t[0].area, t[1], -1 if t[2] is None else t[2])):
            h.update(json.dumps([kind, bi, round(g.area, 6),
                                 round(g.length, 6), len(g.interiors)]).encode())
        for s, a, b in sorted(edges, key=lambda t: (-t[0].length, str(t[1]), str(t[2]))):
            h.update(json.dumps([list(a), list(b), round(s.length, 6)]).encode())
        return h.hexdigest()

    def test_a_shuffled_input_gives_the_same_piece(self):
        parents = once.read_parents(GRAPH)
        corridors = once.read_corridors(GRAPH)
        pieces = [once._poly_from(r['xy']) for r in json.load(open(os.path.join(GRAPH, 'blocks.json')))]
        # The pieces measured as order-sensitive: with the pre-fix code, each of these came out cut
        # differently from a window 200 m larger - the same buildings in a different order. A piece
        # chosen at random is usually *insensitive*, which is why the first version of this test
        # passed on the broken code; these do not.
        keys = [(-2668.429, -537.801, -2611.811, -259.434),
                (-2665.723, -714.388, -2547.584, -578.552),
                (-2634.719, -1235.284, -2302.091, -1016.843),
                (-2612.459, -508.083, -2517.923, -267.013)]
        byk = {tuple(round(v, 3) for v in once._geom_key(p)): p for p in pieces}
        spread = [byk[k] for k in keys if k in byk]
        self.assertTrue(spread, "none of the known order-sensitive pieces is in this pass 2 run")
        for piece in spread:
            with self.subTest(bounds=tuple(round(v, 1) for v in piece.bounds)):
                win = once.block_window_for([piece], parents)
                env = once.window_inputs(GRAPH, RAW, once.map_bbox(), win, corridors)
                parent = once.parent_for(piece, parents)
                self.assertIsNotNone(parent, "every piece is a fragment of a parent")
                base = self.digest(*self.build(piece, env, parent))
                shuffled = self.digest(*self.build(piece, env, parent, order_seed=1234))
                self.assertEqual(base, shuffled,
                                 "a shuffled input list gave a different piece")
