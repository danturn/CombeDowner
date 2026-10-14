"""Which full-detail square of the map a spot is in, for rebuilding just the squares you're looking at.

Usage: python3 -I tools/square_at.py <?at= value, or a link with one> [--map combe-down] [--near 150]

e.g. python3 -I tools/square_at.py "-951,1950,0,-20,60"

Working on one part of Bath doesn't need the whole map rebuilt (131 squares): rebuild the square
the view is in, and any it's within --near metres of (a view near an edge looks over into the next
one), then take the view's screenshot (tools/shoot.mjs). This prints those squares and the
commands to do it. The village's nine squares are stitched into one file, so a spot in the village
rebuilds all nine.
"""
import math, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area


def main():
    args = sys.argv[1:]
    map_id, near = "combe-down", 150.0
    if "--map" in args:
        k = args.index("--map"); map_id = args[k + 1]; del args[k:k + 2]
    if "--near" in args:
        k = args.index("--near"); near = float(args[k + 1]); del args[k:k + 2]
    if not args:
        sys.exit(__doc__)
    at = args[0]
    m = re.search(r"[?&]at=([^&#]+)", at)
    if m: at = m.group(1).replace("%2C", ",")
    east, north = (float(v) for v in at.split(",")[:2])
    G = area(map_id, wide=True).squares
    size = G.cells * G.dx
    square = lambda x, y: (math.floor((x - G.x0) / size), math.floor((y - G.y0) / size))
    found = sorted({square(east + dx, north + dy) for dx in (-near, 0, near) for dy in (-near, 0, near)})
    if any(0 <= ti <= 2 and 0 <= tj <= 2 for ti, tj in found):
        found = sorted(set(found) | {(i, j) for i in range(3) for j in range(3)})
    here = square(east, north)
    only = " ".join(f"{ti},{tj}" for ti, tj in found)
    print(f"{east:.0f}, {north:.0f} is in square {here[0]},{here[1]}; with anything within {near:.0f} m: {only}")
    print()
    print("rebuild them (after `python3 -I tools/mapdata.py unpack " + map_id + "` once):")
    print(f"  python3 -I tools/prep_tiles.py {map_id} data/raw/{map_id}/wide web/public/maps/{map_id} --only {only}")
    print("then shoot the view:")
    print(f'  cd web && npm run shoot -- "{at}"')


if __name__ == "__main__":
    main()
