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
import subprocess
import sys
import tempfile
import textwrap
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))
RAW = os.path.join(ROOT, "data", "raw", "combe-down", "wide")
GRAPH = os.path.join(ROOT, "out", "once-p1")

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
