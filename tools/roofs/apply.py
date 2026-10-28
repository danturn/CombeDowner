"""Put the kept roof faces straight into built squares, for a quick look without a map build.

Usage: python3 -I tools/roofs/apply.py <ti,tj> ... [--map combe-down]

Each building whose outline has faces kept (tools/roofs/faces.py) gets them, lifted into the map's
frame by the two grounds' offset round it, as prep_map.py lifts the survey's eaves. The map build
does this itself (prep_map.py); this only rewrites the square files in web/public/maps, so put
them back (git checkout) before building the map.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import open_lidar, square, footprint, ground_offsets, ROOT     # noqa: E402
import faces     # noqa: E402


def main():
    args = sys.argv[1:]
    map_id = "combe-down"
    if "--map" in args: k = args.index("--map"); map_id = args[k + 1]; del args[k:k + 2]
    lidar = open_lidar(map_id)
    for sq in [s.replace(",", "_") for s in args]:
        d = square(map_id, sq)
        kept = faces.load(map_id, sq)
        polys = [footprint(b) for b in d["bl"]]
        shift, _ = ground_offsets(lidar, d["bl"], polys)
        n = 0
        for i, b in enumerate(d["bl"]):
            k = faces.ring_key(b)
            if k not in kept: continue
            rings, rm = faces.for_game(kept[k], -shift[i])
            b["r"], b["rm"] = rings, rm
            n += 1
        with open(os.path.join(ROOT, "web", "public", "maps", map_id, f"{sq}.json"), "w") as f:
            json.dump(d, f, separators=(",", ":"))
        print(f"{sq}: {n} roofs from the lidar")


if __name__ == "__main__":
    main()
