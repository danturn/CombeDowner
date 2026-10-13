"""Lay out a map's cable car for the game: its two stations and the towers between them.

Usage: python3 -I tools/cableway.py <map> <out.json>

e.g. python3 -I tools/cableway.py combe-down web/public/maps/combe-down-cable.json

A cable car here is a jig-back aerial tramway, as Curo proposed for Bath in 2017: two big cabins on
a straight line between two stations, one going up as the other comes down. The proposal never
got as far as publishing a route, so the line is laid out by hand (in CABLEWAYS below) to run
over open ground at both ends and clear every building on the way.

Writes {"n": name, "st": [[name, x, y], [name, x, y]], "tw": [[distance from the first station, height], ...]},
positions in metres east (x) and north (y) of the map centre. The game (web/src/cableway.ts) puts
everything on the ground, hangs the ropes between the stations and the tops of the towers, and
clears the trees out of the way.
"""
import json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

CABLEWAYS = {
    "combe-down": dict(
        name="Bath Cable Car",
        stations=[
            # the top: on the green at the north end of Mulberry Park, on the edge of the drop
            # to Lyncombe Vale
            ("Mulberry Park", -2.354953, 51.364189),
            # the bottom: on the open ground by the river at the west end of Bath Spa, across
            # Churchill Bridge from Southgate and the bus station
            ("Bath Spa", -2.359056, 51.376654),
        ],
        # from Mulberry Park it crosses Lyncombe Vale in one long span to a tower on Beechen Cliff
        # by Alexandra Park, then a second tower on the way down holds it clear of the houses in
        # Holloway and Widcombe
        towers=[(1095, 40), (1215, 38)],
    ),
}

if __name__ == "__main__":
    if len(sys.argv) != 3: raise SystemExit(__doc__)
    A = area(sys.argv[1])
    if A.id not in CABLEWAYS: raise SystemExit(f"map {A.id!r} has no cable car")
    c = CABLEWAYS[A.id]
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    st = [[n, round((lon - lon0) * kx, 1), round((lat - lat0) * ky, 1)] for n, lon, lat in c["stations"]]
    length = math.hypot(st[1][1] - st[0][1], st[1][2] - st[0][2])
    if any(not 0 < s < length for s, _ in c["towers"]): raise SystemExit("a tower is off the line")
    json.dump({"n": c["name"], "st": st, "tw": [list(t) for t in c["towers"]]}, open(sys.argv[2], "w"))
    print(f"{c['name']}: {st[0][0]} to {st[1][0]}, {length:.0f} m, {len(c['towers'])} towers")
