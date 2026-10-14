"""The village's nine squares (0-2 each way) stitched into one map file, in the same form as a square:
for the single-file build (tools/build_single.py), which carries one map inline with no squares round
it. The game itself loads the nine like every other square of Bath (tools/prep_tiles.py).

Usage: python3 -I tools/stitch.py <map> <squares dir, e.g. web/public/maps/combe-down> <out.json>
"""
import base64, json, os, sys
import numpy as np
import shapely

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area


def stitch(A, G, parts, path):
    """The detailed area's nine squares as one map file, in the same form as a square, for the game
    to load first: what each square keeps is its own, so the lists just run on, and the terrain and
    the wood canopy are laid into one grid (neighbouring squares share their edge vertices)."""
    n = 3 * G.cells
    h = np.zeros((n + 1, n + 1), dtype=np.int64)
    k = np.zeros((n + 1, n + 1), dtype=np.uint8)
    cn = np.zeros((n, n), dtype=np.uint8)
    d = dict(id=A.id, name=A.name, release=parts[0]["release"], centre=A.centre, field=A.field, fc=list(A.field_centre),
             b=[round(G.x0, 1), round(G.y0, 1), round(G.x0 + n * G.dx, 1), round(G.y0 + n * G.dx, 1)], bk=parts[0]["bk"],
             v=list(A.view) if getattr(A, "view", None) else None,
             t=dict(nx=n + 1, ny=n + 1, x0=G.x0, y0=G.y0, dx=G.dx, dy=G.dx, z0=G.z0), spawn=None)
    for p in parts:
        ti, tj = p["tile"]
        T, i0, j0 = p["t"], ti * G.cells, tj * G.cells
        h[j0:j0 + T["ny"], i0:i0 + T["nx"]] = np.array(T["h"]).reshape(T["ny"], T["nx"])
        k[j0:j0 + T["ny"], i0:i0 + T["nx"]] = (np.frombuffer(T["k"].encode(), dtype=np.uint8) - 48).reshape(T["ny"], T["nx"])
        C = p.get("cn")
        if C:
            ci, cj = round((C["x0"] - G.x0) / G.dx - 0.5), round((C["y0"] - G.y0) / G.dx - 0.5)
            cn[cj:cj + C["ny"], ci:ci + C["nx"]] = np.frombuffer(base64.b64decode(C["h"]), dtype=np.uint8).reshape(C["ny"], C["nx"])
        d["spawn"] = d["spawn"] or p.get("spawn")
        for key, v in p.items():
            if isinstance(v, list) and key not in ("centre", "fc", "b", "tile", "spawn"): d.setdefault(key, []).extend(v)
    # a shrub one square planted where its neighbour's gate or front path comes in, at the seam
    # between them, goes: the way through stays clear across the seams too
    ways = ([shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(1.0) for q in d.get("gt", [])]
            + [shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(0.9) for q in d.get("fp", [])]
            + [shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(1.5) for q in d.get("dv", [])])
    if ways and d.get("sb"):
        wt = shapely.STRtree(ways)
        d["sb"] = [q for q in d["sb"] if not len(wt.query(shapely.Point(q[0], q[1]), predicate="within"))]
    d["t"].update(h=h.ravel().tolist(), k="".join(map(str, k.ravel().tolist())))
    d["cn"] = dict(x0=G.x0 + G.dx / 2, y0=G.y0 + G.dx / 2, step=G.dx, nx=n, ny=n, h=base64.b64encode(cn.tobytes()).decode()) if cn.any() else None
    tmp = path + ".tmp"
    json.dump(d, open(tmp, "w"), separators=(",", ":"))
    os.replace(tmp, path)
    print(f"{A.id}: the detailed area stitched from its nine squares, {os.path.getsize(path) / 1e6:.1f} MB")


if __name__ == "__main__":
    if len(sys.argv) < 4: sys.exit(__doc__)
    A = area(sys.argv[1], wide=True)
    nine = [json.load(open(os.path.join(sys.argv[2], f"{ti}_{tj}.json"))) for ti in range(3) for tj in range(3)]
    stitch(A, A.squares, nine, sys.argv[3])
