"""The village's nine squares, written from the partition like every other square.

The old build keeps the village as one stitched file (`combe-down.json`) and throws its nine square
files away, so the writer has no copy of each square to start from. This cuts that file back into its
nine squares (each thing goes to the square its first point is in, as no square kept anything twice),
writes each one from the partition, and stitches them together again with the old build's own
`stitch`, so the game loads the village exactly as before.
"""
import json
import os
import sys

import numpy as np

from partition import MAP, ROOT, Q

sys.path.insert(0, os.path.join(ROOT, "tools"))

NINE = [(ti, tj) for ti in range(3) for tj in range(3)]
# what the stitch keeps once, rather than running each square's lists on
WHOLE = ("centre", "fc", "b", "tile", "spawn")


def _first_xy(v):
    if isinstance(v, dict):
        v = v.get("p") or v.get("r")
    while isinstance(v, list) and v and isinstance(v[0], list):
        v = v[0]
    if not isinstance(v, list):
        return None
    nums = [a for a in v if isinstance(a, (int, float)) and not isinstance(a, bool)]
    return tuple(nums[:2]) if len(nums) >= 2 else None


def _square_of(xy):
    size = Q.dx * Q.cells
    ti = int(np.floor((xy[0] - Q.x0) / size))
    tj = int(np.floor((xy[1] - Q.y0) / size))
    return min(max(ti, 0), 2), min(max(tj, 0), 2)


def cut(village):
    """The village file as nine square files, in the form the old build wrote them."""
    size = Q.dx * Q.cells
    n = Q.cells + 1
    T = village["t"]
    h = np.array(T["h"]).reshape(T["ny"], T["nx"])
    k = np.frombuffer(T["k"].encode(), dtype=np.uint8).reshape(T["ny"], T["nx"])
    out = {}
    for ti, tj in NINE:
        i0, j0 = ti * Q.cells, tj * Q.cells
        x0, y0 = Q.x0 + ti * size, Q.y0 + tj * size
        sq = {key: v for key, v in village.items() if not isinstance(v, list) or key in WHOLE}
        sq.update(tile=[ti, tj], b=[round(x0, 1), round(y0, 1), round(x0 + size, 1), round(y0 + size, 1)],
                  t=dict(T, nx=n, ny=n, x0=x0, y0=y0, h=h[j0:j0 + n, i0:i0 + n].ravel().tolist(),
                         k=k[j0:j0 + n, i0:i0 + n].tobytes().decode()))
        out[(ti, tj)] = sq
    for key, v in village.items():
        if not isinstance(v, list) or key in WHOLE:
            continue
        for sq in out.values():
            sq[key] = []
        for item in v:
            xy = _first_xy(item)
            out[_square_of(xy) if xy else (1, 1)][key].append(item)
    return out


def write_village(core, once_dir, city, village_path, dest):
    """Cut the old village into its nine squares, write each from the partition into `core`, and
    stitch them into `dest`."""
    from partition.write_tile import build_tile
    from area import area
    from prep_tiles import stitch

    os.makedirs(core, exist_ok=True)
    bases = cut(json.load(open(village_path)))
    parts = []
    for (ti, tj), sq in bases.items():
        base = os.path.join(core, f"{ti}_{tj}.base.json")
        with open(base, "w") as f:
            json.dump(sq, f, separators=(",", ":"))
        out = os.path.join(core, f"{ti}_{tj}.json")
        build_tile(ti, tj, out, once_dir, city, base, verbose=False)
        os.remove(base)
        parts.append(json.load(open(out)))
    stitch(area(MAP), Q, parts, dest)
    return parts
