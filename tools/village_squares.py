"""The village as nine ordinary squares, for the game to load like the rest of Bath: copies the nine
that tools/prep_tiles.py keeps in data/raw/<map>/wide/core/ in with the other squares, lists them in
tiles.json, and cuts web/public/maps/<map>.json down to what belongs to the map as a whole (its name,
centre, force field, spawn and so on: no ground or scenery of its own).

Usage: python3 -I tools/village_squares.py <map> [data/raw/<map>/wide] [web/public/maps]

Nothing is rebuilt: the squares are byte for byte the ones the village file was stitched from, so a
map probe (tools/probe_map.mjs) before and after shows what loading them as squares changes.
"""
import json
import os
import shutil
import sys

TOOLS = os.path.dirname(os.path.abspath(__file__))


def main():
    args = sys.argv[1:]
    if not args: sys.exit(__doc__)
    map_id = args[0]
    src = args[1] if len(args) > 1 else os.path.join(TOOLS, "..", "data", "raw", map_id, "wide")
    maps = args[2] if len(args) > 2 else os.path.join(TOOLS, "..", "web", "public", "maps")
    core_dir, out_dir, core_path = os.path.join(src, "core"), os.path.join(maps, map_id), os.path.join(maps, f"{map_id}.json")
    nine = [(ti, tj) for ti in range(3) for tj in range(3)]
    missing = [t for t in nine if not os.path.exists(os.path.join(core_dir, f"{t[0]}_{t[1]}.json"))]
    if missing: sys.exit(f"not in {core_dir}: {' '.join(f'{a}_{b}' for a, b in missing)} (run tools/prep_tiles.py first)")
    for ti, tj in nine:
        shutil.copyfile(os.path.join(core_dir, f"{ti}_{tj}.json"), os.path.join(out_dir, f"{ti}_{tj}.json"))
    index_path = os.path.join(out_dir, "tiles.json")
    index = json.load(open(index_path))
    have = {tuple(t) for t in index["tiles"]}
    index["tiles"] = sorted([list(t) for t in have | set(nine)])
    json.dump(index, open(index_path, "w"), separators=(",", ":"))
    # the map as a whole: what isn't any one square's
    d = json.load(open(core_path))
    keep = {k: d[k] for k in ("id", "name", "release", "centre", "field", "fc", "bk", "v", "spawn") if d.get(k) is not None}
    keep["z0"] = d["t"]["z0"] if "t" in d else d["z0"]
    json.dump(keep, open(core_path, "w"), separators=(",", ":"))
    print(f"{map_id}: the village's nine squares are in {out_dir} with the rest ({len(index['tiles'])} in all), "
          f"and {core_path} is down to {os.path.getsize(core_path)} bytes")


if __name__ == "__main__":
    main()
