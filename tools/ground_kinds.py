"""The minimap's ground for the whole of Bath at full detail: what each 4 m patch of ground is (grass,
wood, field, garden, paving and so on), taken from every square's own ground, in one small file the
game loads at the start (web/public/maps/<map>-ground.json). The whole-city map's ground (prep_wide.py)
is 12 m to the patch, which looks blocky on the minimap, and the squares themselves only come in near
the player; this lets the minimap draw the sharp ground anywhere, before any square has loaded.

Each square's ground is kept as it comes, one digit per patch, row by row from the south, without the
row and column it shares with its neighbours to the north and east. The digits repeat a great deal, so
the file shrinks to a few hundred kilobytes once the server compresses it.

Usage: python3 -I tools/ground_kinds.py <map> [web/public/maps]
Run it after the squares are built (tools/prep_tiles.py). It needs only Python itself.
"""
import json
import os
import sys

TOOLS = os.path.dirname(os.path.abspath(__file__))


def main():
    args = sys.argv[1:]
    if not args: sys.exit(__doc__)
    map_id = args[0]
    maps = args[1] if len(args) > 1 else os.path.join(TOOLS, "..", "web", "public", "maps")
    sq_dir = os.path.join(maps, map_id)
    index = json.load(open(os.path.join(sq_dir, "tiles.json")))
    n = index["cells"]
    sq = {}
    for ti, tj in index["tiles"]:
        T = json.load(open(os.path.join(sq_dir, f"{ti}_{tj}.json")))["t"]
        k = T["k"]
        sq[f"{ti}_{tj}"] = "".join(k[j * T["nx"]: j * T["nx"] + n] for j in range(n))
    # a village still stitched into the map's own file (an older build): its nine squares from that
    head = json.load(open(os.path.join(maps, f"{map_id}.json")))
    T = head.get("t")
    if T and T.get("k"):
        for ti in range(3):
            for tj in range(3):
                if f"{ti}_{tj}" in sq: continue
                sq[f"{ti}_{tj}"] = "".join(T["k"][(tj * n + j) * T["nx"] + ti * n: (tj * n + j) * T["nx"] + ti * n + n] for j in range(n))
    out = dict(x0=index["x0"], y0=index["y0"], dx=index["dx"], cells=n, sq=sq)
    path = os.path.join(maps, f"{map_id}-ground.json")
    json.dump(out, open(path, "w"), separators=(",", ":"))
    print(f"{map_id}: the ground of {len(sq)} squares at {index['dx']:.1f} m in {path}, {os.path.getsize(path) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
