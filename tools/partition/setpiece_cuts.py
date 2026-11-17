"""Where a square's street faces are cut for the set pieces (web/src/landmarks/setpieces.ts,
setPieceCuts), so each meets the faces edge to edge, rather than the game taking out whole
triangles across its edge as the square loads and leaving a ragged strip of the map's verge or
pavement, or a hole, between them.

- A set piece marked `fills` draws everything inside its outline, out to the edge: the faces inside
  go. One that fits its outline to the street (the Royal Crescent's flags run out to the kerb) is
  fitted to the carriageway the square draws, as the game fits it to the faces when the square loads.
- Every other set piece's outline splits the faces along it (but the carriageways, which the game
  keeps through it), all kept: the game takes out those it lays its own floor, deck or paving over,
  and now finds each one wholly inside or outside.
- A set piece's own street (Pulteney Bridge's, on into Argyle Street) is drawn by the game over the
  square's roads as it lays them: the faces go exactly where it's drawn.

The outlines are read from the game's own table with its bundler, so the two never disagree; none
if that can't be run (the game still takes out what it lays its own ground over, as before, and
does the same for a set piece added or moved since the square was written).
"""
import functools
import json
import os
import subprocess
import sys
import tempfile

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

from .cache import ROOT, sha

WEB = os.path.join(ROOT, "web")
REACH = 30.0        # metres round the square that its carriageway is handed to the set pieces fitting to it

_ENTRY = """
import { setPieceCuts } from "%s/src/landmarks/setpieces";
let text = "";
process.stdin.on("data", (c) => (text += c));
process.stdin.on("end", () => {
  const { centre, box, road, rd } = JSON.parse(text);
  const inside = (x, y) => {
    let n = false;
    for (const ring of road) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n;
    }
    return n;
  };
  console.log(JSON.stringify(setPieceCuts(centre, box, inside, rd ?? undefined)));
});
"""


@functools.lru_cache(maxsize=1)
def bundle():
    """The game's set piece table bundled for Node, or None if the bundler can't be run."""
    try:
        return subprocess.run([os.path.join(WEB, "node_modules", ".bin", "esbuild"), "--bundle", "--platform=node",
                               "--format=esm", "--loader=ts", "--log-level=error",
                               "--banner:js=globalThis.location={search:''};globalThis.window=globalThis;"],
                              input=_ENTRY % WEB, capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        # (said aloud: a square written without the cut looks right until the set piece is beside it)
        print(f"setpiece_cuts: can't bundle the set pieces' table, so no square is cut for them ({e})", file=sys.stderr, flush=True)
        return None


@functools.lru_cache(maxsize=1)
def _script():
    js = bundle()
    if js is None:
        return None
    path = os.path.join(tempfile.gettempdir(), f"setpiece_cuts_{sha(js)[:16]}.mjs")
    if not os.path.exists(path):
        with open(path + ".part", "w") as f:
            f.write(js)
        os.replace(path + ".part", path)
    return path


def digest():
    """What the cut depends on besides the square: the set pieces' table and the code fitting them."""
    js = bundle()
    return sha(js) if js else "none"


def _rings(g):
    for p in getattr(g, "geoms", [g]):
        if p.geom_type == "Polygon" and not p.is_empty:
            yield [list(q) for q in p.exterior.coords]
            for h in p.interiors:
                yield [list(q) for q in h.coords]


ROADS_NEAR = 60.0    # metres round the square that its roads are handed to the set pieces laying their own street over them


def _shape(rings):
    polys = [Polygon(r).buffer(0) for r in rings if len(r) >= 3]
    polys = [p for p in polys if not p.is_empty]
    return unary_union(polys) if polys else None


def cuts(centre, sq, road, rd=None):
    """The cuts for the set pieces reaching square sq (x0, y0, x1, y1) of a map centred at centre, as
    shapes in data metres (each None if there's none): (taken out, split along). `road` is the
    carriageway the set pieces fitting to it are fitted to; rd the square's roads, for a set piece's
    own street laid over them (without them, the stretch it's laid along is taken out, for `key`)."""
    script = _script()
    if script is None or not centre:
        return None, None
    near = road.intersection(box(*sq).buffer(REACH)) if road is not None and not road.is_empty else Polygon()
    reach = box(*sq).buffer(ROADS_NEAR).bounds
    ways = None if rd is None else [{"n": r.get("n", ""), "c": r["c"], "w": r.get("w"), "pv": r.get("pv"), "p": [q[:4] for q in r["p"]]}
                                    for r in rd if len(r["p"]) > 1 and any(reach[0] < q[0] < reach[2] and reach[1] < q[1] < reach[3] for q in r["p"])]
    try:
        out = subprocess.run(["node", script], capture_output=True, text=True, check=True,
                             input=json.dumps({"centre": list(centre), "box": list(sq), "road": list(_rings(near)), "rd": ways})).stdout
        got = json.loads(out)
    except (OSError, subprocess.CalledProcessError, ValueError):
        return None, None
    fill, street = _shape(got["fill"]), _shape(got["street"])
    gone = unary_union([g for g in (fill, street) if g is not None]) if fill is not None or street is not None else None
    # (only where it reaches the square: the street's quads run the whole length of it)
    if gone is not None:
        gone = gone.intersection(box(*sq).buffer(REACH))
        gone = None if gone.is_empty else gone
    return gone, _shape(got["split"])


@functools.lru_cache(maxsize=4)
def _reach(centre):
    gone, split = cuts(centre, (-1e7, -1e7, 1e7, 1e7), None)
    return [g.buffer(REACH) for whole in (gone, split) if whole is not None for g in getattr(whole, "geoms", [whole])]


def key(centre, sq):
    """What square sq's cut depends on, for the writer's key: the set pieces' code if one reaches the
    square, else nothing, so a change to them rewrites only their squares."""
    return digest() if any(g.intersects(box(*sq)) for g in _reach(tuple(centre))) else ""
