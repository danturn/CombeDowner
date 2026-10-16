"""Lay out a map's railways for the game: the track, with its bridges and tunnels, the station
platforms, and the routes the trains run.

Usage: python3 -I tools/railway.py <map> <dir with the wide .geojson layers> <out.json>

e.g. python3 -I tools/railway.py combe-down data/raw/combe-down/wide web/public/maps/combe-down-rail.json

Reads the railway lines from Overture's segment layer (segment.geojson), keeping the working lines
(not the old ones that are footpaths now, nor the disused sidings), cut to the wide area's circle,
and the stations and platforms from its infrastructure layer (infrastructure.geojson). Heights
come from the same terrain tiles as the map (tools/terrain.py): the track follows the ground,
smoothed a little, and runs level from end to end of each bridge and tunnel Overture marks.

Trains run along routes: a route is the track followed from one edge of the circle to another,
going straight on at each set of points. Trains in Britain keep left, so where there are two
tracks side by side each route's trains go the way that keeps the other track on their right; a
single line has trains both ways.

Writes {"tracks", "routes", "platforms", "portals"}, positions in metres east (x) and north (y) of
the map centre and heights in metres above sea level:
- tracks: [{"n": line name, "p": [[x, y, z, 0 on the ground / 1 on a bridge / 2 in a tunnel, and on a
  bridge the ground under it], ...]}], points about 6 m apart.
- routes: [{"n": name, "t": [[track, 1 forwards or -1 backwards], ...], "st": [[distance along, station], ...],
  "both": 1 if trains run both ways}].
- platforms: [{"n": station, "r": [[x, y], ...] the edge, "z": the platform's top}].
- portals: [[x, y, z, angle]] tunnel mouths, the angle pointing into the hill (east is 0, north a quarter turn).
"""
import json, math, os, sys
import numpy as np
import shapely
from shapely.geometry import shape, Point, LineString
from shapely.ops import nearest_points

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area
from terrain import Terrain

STEP = 6.0           # metres between points along the track
SMOOTH = 3           # points each side averaged for the track's height

# Journeys between two maps, which neither map's own track shows: the train from Bath Spa runs on
# into Bradford-on-Avon's map. Each link names the two maps, the station at each end, the line the
# two ends belong to, and the real distance in metres: the ride takes that at V_LINK, which allows
# for slowing for the two stops on the way (Freshford and Avoncliff), so about ten minutes.
V_LINK = 26.0        # m/s, the local train's average over the valley line
LINKS = [
    # Bath Spa to Bradford-on-Avon: down the Wessex Main Line through Freshford and Avoncliff
    ("combe-down", "Bath Spa", "bradford-on-avon", "Bradford-on-Avon", "Wessex Main Line", 15500),
]

# The services to run, when the plain edge-to-edge search finds too many ways through a junction (it
# makes loops round the Bathampton loop and back, and the odd route that turns at Bath Spa). Each is
# a dict: `stops` in order, `line` to call the service, `kind` (1 the long-distance HSTs, 0 the local
# two-car units), and `lines` (the named lines the route runs on, which tells services apart that
# share their stops). The Wessex trains run down the Wessex line to Bradford-on-Avon but share the
# main line through Bath Spa and Oldfield Park, so the London and Bradford trains have the same stops
# and only the lines they run on tell them apart. Any route the search finds that matches a service
# is kept and named by it; routes matching none are dropped, so the timetable only ever shows trains
# that really run. A map with no entry keeps every route the search finds (for a map with no junction
# to make a mess of).
SERVICES = {
    "combe-down": [
        # the London trains: edge to edge along the Great Western Main Line alone, through Oldfield
        # Park and Bath Spa, run each way
        dict(stops=["Oldfield Park", "Bath Spa"], line="Great Western Main Line", kind=1, lines={"Great Western Main Line"}),
        dict(stops=["Bath Spa", "Oldfield Park"], line="Great Western Main Line", kind=1, lines={"Great Western Main Line"}),
        # the Wessex line down the valley to Bradford-on-Avon, each way: it runs along both the
        # Wessex line and the main line, which tells it from the London trains
        dict(stops=["Oldfield Park", "Bath Spa"], line="Wessex Main Line", kind=0, lines={"Great Western Main Line", "Wessex Main Line"}),
        dict(stops=["Bath Spa", "Oldfield Park"], line="Wessex Main Line", kind=0, lines={"Great Western Main Line", "Wessex Main Line"}),
    ],
    # Bradford-on-Avon: its two routes already run edge to edge through its one station
}
EDGE = 60            # a track end this near the circle's edge is where trains come and go
SHORT_TUNNEL = 50    # metres: a tunnel shorter than this is something going over the line, and has no mouths
r1 = lambda v: round(float(v), 1)


def main():
    map_id, src, out = sys.argv[1:4]
    A = area(map_id, wide=True)
    T = Terrain(A.centre, os.path.join(src, "terrain15"))
    proj = lambda g: shapely.transform(g, lambda a: np.column_stack(T.proj(a[:, 0], a[:, 1])))
    cx, cy = A.field_centre
    R = A.half
    circle = Point(cx, cy).buffer(R, 256)

    # ---- the working lines ---------------------------------------------------------------------
    tracks = []
    for f in json.load(open(os.path.join(src, "segment.geojson")))["features"]:
        p = f["properties"]
        if p.get("subtype") != "rail" or p.get("class") not in ("standard_gauge", "unknown"): continue
        flags = p.get("rail_flags") or []
        if any(v in ("is_abandoned", "is_disused") for rf in flags for v in rf["values"]): continue
        whole = proj(shape(f["geometry"]))
        if whole.geom_type != "LineString" or not whole.intersects(circle): continue
        L = whole.length
        ranges = lambda what: [(rf.get("between") or [0, 1]) for rf in flags if what in rf["values"]]
        bridges, tunnels = [(a * L, b * L) for a, b in ranges("is_bridge")], [(a * L, b * L) for a, b in ranges("is_tunnel")]
        name = ((p.get("names") or {}).get("primary")) or ""
        # cut to the circle, keeping each piece's distance along the whole line for its flags
        cut = whole.intersection(circle)
        for piece in getattr(cut, "geoms", [cut]):
            if piece.geom_type != "LineString" or piece.length < 2: continue
            s0 = whole.project(Point(piece.coords[0]))
            n = max(1, int(math.ceil(piece.length / STEP)))
            pts = []
            for k in range(n + 1):
                d = piece.length * k / n
                q = piece.interpolate(d)
                s = s0 + d
                f_ = 2 if any(a <= s <= b for a, b in tunnels) else 1 if any(a <= s <= b for a, b in bridges) else 0
                pts.append([q.x, q.y, T.elev(q.x, q.y), f_])
            tracks.append(dict(n=name, p=pts))
    print(f"railways: {len(tracks)} pieces of track, {sum(LineString([q[:2] for q in t['p']]).length for t in tracks) / 1000:.1f} km")

    # ---- heights: smoothed, and level across bridges and through tunnels ------------------------
    for t in tracks:
        p = t["p"]
        ground = [q[2] for q in p]
        k = 0
        while k < len(p):
            if not p[k][3]: k += 1; continue
            j = k
            while j + 1 < len(p) and p[j + 1][3]: j += 1
            za = ground[k - 1] if k > 0 else ground[min(len(p) - 1, j + 1)]
            zb = ground[j + 1] if j + 1 < len(p) else za
            for i in range(k, j + 1):
                p[i][2] = za + (zb - za) * (i - k + 1) / (j - k + 2)
                if p[i][3] == 1: p[i][2] = max(p[i][2], ground[i] + 0.05)     # a deck never dips into the ground
            # a short "tunnel" is a bridge or an aqueduct going over: the track is in the open under it
            if p[k][3] == 2 and (j - k + 1) * STEP < SHORT_TUNNEL:
                for i in range(k, j + 1): p[i][3] = 0; ground[i] = p[i][2]
            k = j + 1
        z = [q[2] for q in p]
        for i, q in enumerate(p):
            if q[3]: continue
            w = [z[m] for m in range(max(0, i - SMOOTH), min(len(p), i + SMOOTH + 1)) if not p[m][3]]
            q[2] = max(sum(w) / len(w), ground[i] + 0.05)

    # ---- routes: edge to edge, straight on at the points --------------------------------------
    key = lambda x, y: (round(x), round(y))
    at = {}
    for i, t in enumerate(tracks):
        for end, (x, y) in ((0, t["p"][0][:2]), (1, t["p"][-1][:2])): at.setdefault(key(x, y), []).append((i, end))
    def heading(i, fwd, start):
        p = tracks[i]["p"] if fwd > 0 else tracks[i]["p"][::-1]
        a, b = (p[0], p[min(3, len(p) - 1)]) if start else (p[max(0, len(p) - 4)], p[-1])
        l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        return (b[0] - a[0]) / l, (b[1] - a[1]) / l
    def at_edge(x, y): return math.hypot(x - cx, y - cy) > R - EDGE
    # Routes run from one edge of the data to another. At each set of points the train carries on by
    # every line that doesn't turn it sharper than the 0.6 heading test (about 53°), not just the one
    # that goes straightest: at Bath Spa the Wessex line to Bradford-on-Avon branches off the main
    # line to Box, and before this it was never taken (all eastbound trains went to Box). Every
    # edge-to-edge path is kept, de-duplicated; a loop back onto track already used is refused.
    JOIN = 0.6       # the least the two headings' dot product may be to carry on
    routes, seen = [], set()
    for i, t in enumerate(tracks):
        for end in (0, 1):
            x, y = t["p"][-end][:2]
            if not at_edge(x, y) or len(at.get(key(x, y), [])) > 1: continue
            first = (i, 1 if end == 0 else -1)
            # depth-first over every allowed continuation; a path ends when it reaches an edge or a
            # set of points it can't go straight on through
            stack = [(first, [first])]
            while stack:
                (cur, fwd), path = stack.pop()
                p = tracks[cur]["p"]
                ex, ey = (p[-1] if fwd > 0 else p[0])[:2]
                if len(path) > 1 and at_edge(ex, ey):
                    sig = frozenset(path)
                    if sig not in seen:
                        seen.add(sig)
                        routes.append([[j, f] for j, f in path])
                    continue
                hx, hy = heading(cur, fwd, False)
                used = {j for j, _ in path}
                for j, e in at.get(key(ex, ey), []):
                    if j in used: continue
                    jf = 1 if e == 0 else -1
                    nx, ny = heading(j, jf, True)
                    if nx * hx + ny * hy > JOIN: stack.append(((j, jf), path + [(j, jf)]))

    def line_of(route):
        pts = []
        for j, f_ in route:
            p = tracks[j]["p"] if f_ > 0 else tracks[j]["p"][::-1]
            pts += p[1:] if pts else p
        return pts
    others = lambda route: shapely.unary_union([LineString([q[:2] for q in tracks[j]["p"]]) for j in range(len(tracks))
                                                if j not in {r[0] for r in route}])
    stations = []
    infra = json.load(open(os.path.join(src, "infrastructure.geojson")))["features"]
    for f in infra:
        p = f["properties"]
        if p.get("class") == "railway_station" and (p.get("names") or {}).get("primary"):
            g = proj(shape(f["geometry"]))
            if g.within(circle): stations.append((p["names"]["primary"], g.centroid))
    # Whether to keep every route the search finds (a map with no junction to make a mess of) or
    # only those matching a named service (SERVICES), wanted by the stops they call at.
    want = SERVICES.get(map_id)
    out_routes, kept = [], set()
    for route in routes:
        pts = line_of(route)
        line = LineString([q[:2] for q in pts])
        if line.length < 2000: continue
        # keep left first, so the route is the way its trains run before its stops are measured:
        # turning it round after measuring would leave the stops distances against the other way
        rest = others(route)
        left = right = 0
        for d in np.arange(50, line.length - 50, 150):
            q, q2 = line.interpolate(d), line.interpolate(d + 5)
            near = rest.distance(q)
            if not 2.5 < near < 8: continue
            o = nearest_points(q, rest)[1]
            side = (q2.x - q.x) * (o.y - q.y) - (q2.y - q.y) * (o.x - q.x)
            if side > 0: left += 1
            else: right += 1
        both = left + right < 3
        if left > right: route = [[j, -f_] for j, f_ in route[::-1]]; pts = line_of(route); line = LineString([q[:2] for q in pts])
        st = sorted([[r1(line.project(c)), n] for n, c in stations if line.distance(c) < 40])
        stops = [n for _, n in st]
        # the lines this route runs along, for telling services apart by more than their stops
        ran = {tracks[j]["n"] for j, _ in route}
        if want is not None:
            # keep this route only if it matches a service not yet taken: its stops in order, and
            # the lines it runs on (the London and Bradford trains share their stops and are told
            # apart by the Wessex line, which only the Bradford trains use)
            si = next((k for k, s in enumerate(want) if k not in kept and s["stops"] == stops
                       and ran == s["lines"]), None)
            if si is None: continue
            kept.add(si)
            name, kind = want[si]["line"], want[si]["kind"]
        else:
            names = {}
            for j, _ in route: names[tracks[j]["n"]] = names.get(tracks[j]["n"], 0) + LineString([q[:2] for q in tracks[j]["p"]]).length
            name = max((n for n in names if n), key=lambda n: names[n], default="")
            kind = 1 if name and "great western" in name.lower() and line.length > 15000 else 0
        out_routes.append(dict(n=name, t=route, st=st, both=1 if both else 0, k=kind))
        print(f"  route {name or '(unnamed)'}: {line.length / 1000:.1f} km, {'both ways' if both else f'keeps left ({left}/{right})'}, {'HST' if kind else 'local'}, stops {stops}")

    # ---- platforms and tunnel mouths ----------------------------------------------------------
    all_track = shapely.unary_union([LineString([q[:2] for q in t["p"]]) for t in tracks])
    def track_z(x, y):
        best, bz = 1e9, None
        for t in tracks:
            for q in t["p"]:
                d = (q[0] - x) ** 2 + (q[1] - y) ** 2
                if d < best: best, bz = d, q[2]
        return bz
    platforms = []
    for f in infra:
        p = f["properties"]
        if p.get("class") != "platform": continue
        g = proj(shape(f["geometry"]))
        if not g.geom_type.endswith("Polygon") or not g.within(circle) or g.distance(all_track) > 8: continue
        for poly in getattr(g, "geoms", [g]):
            c = poly.centroid
            st = min(stations, key=lambda s: s[1].distance(c), default=None)
            ring = list(poly.simplify(0.5).exterior.coords)[:-1]
            platforms.append(dict(n=st[0] if st and st[1].distance(c) < 300 else "", r=[[r1(x), r1(y)] for x, y in ring],
                                  z=r1(track_z(c.x, c.y) + 0.9)))
    portals = []
    for t in tracks:
        p = t["p"]
        for k in range(len(p)):
            if p[k][3] != 2: continue
            for o in (-1, 1):
                m = k + o
                if 0 <= m < len(p) and p[m][3] != 2:
                    # the mouth faces out of the hill, from the tunnel's end toward the open track
                    ang = math.atan2(p[k][1] - p[m][1], p[k][0] - p[m][0])
                    portals.append([r1((p[k][0] + p[m][0]) / 2), r1((p[k][1] + p[m][1]) / 2), r1((p[k][2] + p[m][2]) / 2), round(ang, 3)])

    out_d = dict(
        tracks=[dict(n=t["n"], p=[[r1(q[0]), r1(q[1]), round(q[2], 2), q[3]] + ([r1(T.elev(q[0], q[1]))] if q[3] == 1 else []) for q in t["p"]])
                for t in tracks],
        routes=out_routes, platforms=platforms, portals=portals,
    )
    # the journeys on to another map: which lines carry on, the station at each end, and how long
    # the ride takes (the real distance at the local train's speed, plus a stop at each station on
    # the way; the game starts the two maps' trains on the same clock so the same service is at
    # Bath Spa and at Bradford-on-Avon a journey apart, see web/src/railway.ts)
    # both ends of a journey get the link, each naming the map and station at the other end, so the
    # two maps' trains run to the same clock (web/src/railway.ts): one waits at its station for the
    # service whose numbers make it the same train
    links = []
    for map_a, st_a, map_b, st_b, line, dist in LINKS:
        if map_id == map_a: links.append(dict(line=line, station=st_a, to=map_b, to_station=st_b, secs=round(dist / V_LINK)))
        elif map_id == map_b: links.append(dict(line=line, station=st_b, to=map_a, to_station=st_a, secs=round(dist / V_LINK)))
    if links: out_d["links"] = links
    json.dump(out_d, open(out, "w"), separators=(",", ":"))
    print(f"{len(tracks)} tracks, {len(out_routes)} routes, {len(platforms)} platforms, {len(portals)} tunnel mouths -> {out} ({os.path.getsize(out) // 1024} KB)")


main()
