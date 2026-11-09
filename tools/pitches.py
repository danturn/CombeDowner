"""Sports pitches (football pitches, rugby pitches and cricket fields) and running tracks.

Mapped pitches (land_use class "pitch") are marked out for the sport OpenStreetMap says they're
for (its sport tag): football pitches for soccer, rugby pitches for rugby, cricket fields for
cricket. One mapped with no sport, or as for several, goes by its shape: a rectangle becomes a
rugby pitch and an oval a cricket field. Courts and pitches for anything else (tennis, hockey,
riding arenas and the like) are left alone, as are pitches too small to mark out and ones that
overlap a cricket field or a bigger pitch.

Running tracks (land_use class "track", for running or athletics) mapped as a ring of lanes round
an infield are drawn as a red track with its lanes marked out (tracks()): a stadium fitted to the
infield, two straights and two bends. Nothing is guessed for a track mapped only as a line or a
filled shape (a sprint straight, a grass track painted on a field), nor for horse racing, gallops
and the like. An infield with nothing mapped in it (no pitch, no throwing circle, no jumps) is
grass for a game all the same, as most are: it is marked out as a rugby pitch along the track, as
big as fits inside the inner kerb (a pitch mapped there is marked out as mapped instead).

prep_map.py calls pitches() and tracks(); to redo them on a map that is already built, without
rebuilding it:

    python3 -I tools/pitches.py <map> <dir with land_use.geojson> <map.json>

or on the full-detail squares round it (tools/prep_tiles.py), from the wide land_use layer:

    python3 -I tools/pitches.py <map> <dir with the wide land_use.geojson> <tiles dir> --tiles [ti,tj ...]

(naming squares redoes only those). The map's own data/<map>/land_use.geojson.xz, unpacked, will do
for the land_use layer.
"""
import math
from shapely.geometry import LineString

ROUND = 0.85          # circularity (4 pi area / perimeter^2) above which a pitch is an oval
RUGBY_MIN = (30, 55)  # smallest rectangle (width, length) in metres that takes rugby markings
FOOTBALL_MIN = (25, 40)   # and football markings (a five-a-side cage is smaller)
ROPE_INSET = 3.0      # boundary rope, metres in from the edge of a cricket field
SCREEN_OUT = 1.8      # sightscreens, metres out past the rope behind each end of the wicket
LANE = 1.22           # a running track's lane width, metres
INFIELD_GAP = 2.0     # how far an infield pitch's corners keep in from the track's inner kerb, metres

r1 = lambda v: round(float(v), 1)


def pitches(land_use, polys):
    """land_use: (geometry, properties) pairs; polys: projects and clips a geometry to polygons.

    Returns ["f", x, y, length, width, angle] for football pitches, ["r", x, y, length, width,
    angle] for rugby pitches and ["c", x, y, angle, rope ring, sightscreens [[x, y], ...]] for
    cricket fields, in model metres; angle is the long axis (the wicket, for cricket), radians
    anticlockwise from east.
    """
    ovals, rects, mapped = [], [], []
    for g, p in land_use:
        if p.get("class") in ("pitch", "track"): mapped += polys(g)
        if p.get("class") != "pitch": continue
        game = sport(p)
        for poly in polys(g):
            r = poly.minimum_rotated_rectangle
            (ax, ay), (bx, by), (cx, cy) = list(r.exterior.coords)[:3]
            e1, e2 = math.hypot(bx - ax, by - ay), math.hypot(cx - bx, cy - by)
            angle = math.atan2(by - ay, bx - ax) if e1 >= e2 else math.atan2(cy - by, cx - bx)
            length, width = max(e1, e2), min(e1, e2)
            oval = 4 * math.pi * poly.area / poly.length ** 2 >= ROUND
            square = poly.area / r.area > 0.9
            if game == "c" or (game is None and oval):
                if oval: ovals.append((poly, angle))
            elif game == "f":
                if square and width >= FOOTBALL_MIN[0] and length >= FOOTBALL_MIN[1]: rects.append((r, length, width, angle, "f"))
            elif game in ("r", None) and square and width >= RUGBY_MIN[0] and length >= RUGBY_MIN[1]:
                rects.append((r, length, width, angle, "r"))
    out = []
    for poly, angle in ovals:
        rope = poly.buffer(-ROPE_INSET).simplify(0.5)
        if rope.geom_type != "Polygon" or rope.is_empty: continue
        c = poly.centroid
        ux, uy = math.cos(angle), math.sin(angle)
        screens = []
        for sgn in (1, -1):
            # where the line of the wicket crosses the rope, then a little further out
            ray = LineString([(c.x, c.y), (c.x + sgn * ux * 500, c.y + sgn * uy * 500)]).intersection(rope.exterior)
            if ray.is_empty: continue
            d = min(math.hypot(q.x - c.x, q.y - c.y) for q in getattr(ray, "geoms", [ray])) + SCREEN_OUT
            screens.append([r1(c.x + sgn * ux * d), r1(c.y + sgn * uy * d)])
        out.append(["c", r1(c.x), r1(c.y), round(angle % math.pi, 3), [[r1(x), r1(y)] for x, y in list(rope.exterior.coords)[:-1]], screens])
    rects.sort(key=lambda q: -q[0].area)
    kept = []
    for r, length, width, angle, kind in rects:
        if any(r.intersection(o).area > 0.1 * r.area for o, _ in ovals): continue
        if any(r.intersection(k).area > 0.1 * r.area for k in kept): continue
        kept.append(r)
        c = r.centroid
        out.append([kind, r1(c.x), r1(c.y), r1(length), r1(width), round(angle % math.pi, 3)])
    # a running track's infield with nothing mapped in it is a rugby pitch, along the track
    for (x, y, angle, straight, radius, _, _), infield in _tracks(land_use, polys):
        if any(q.intersection(infield).area > 20 for q in mapped if not _ring_round(q, infield)): continue
        # the widest pitch whose corners clear the bends, but no squatter than a rugby pitch
        reach, best = radius - INFIELD_GAP, None
        for w in range(min(70, int(2 * reach) - 1), RUGBY_MIN[0] - 1, -1):
            length = min(144.0, straight + 2 * math.sqrt(reach * reach - (w / 2) ** 2))
            if length < RUGBY_MIN[1]: continue
            best = (length, w)
            if length >= 1.7 * w: break
        if best: out.append(["r", x, y, r1(best[0]), r1(best[1]), angle])
    return out


def tracks(land_use, polys):
    """land_use, polys: as for pitches(). Returns [x, y, angle, straight, radius, lanes, lane width]
    for each running track: its middle, its long axis (radians anticlockwise from east, as a
    pitch's), the length of each straight and the radius of the bends along the inner kerb, in
    metres, and how many lanes it has and how wide each is."""
    return [t for t, _ in _tracks(land_use, polys)]


KERB = 0.5     # the red surface's margin out past the outside lane, metres (as web/src/pitches.ts draws it)


def _spine(t):
    """How far (x, y) is from a track's spine (the line between the bends' centres), and which way."""
    x0, y0, angle, straight = t[:4]
    ux, uy = math.cos(angle), math.sin(angle)
    def at(x, y):
        s, n = (x - x0) * ux + (y - y0) * uy, -(x - x0) * uy + (y - y0) * ux
        cs = max(-straight / 2, min(straight / 2, s))
        bx, by = x0 + ux * cs, y0 + uy * cs
        return math.hypot(x - bx, y - by), bx, by
    return at


def track_surface(t):
    """The ground a running track covers, its lanes and their margins, as a polygon (a ring)."""
    from shapely.geometry import LineString as Line
    x0, y0, angle, straight, radius, lanes, lane = t
    ux, uy = math.cos(angle), math.sin(angle)
    spine = Line([(x0 - ux * straight / 2, y0 - uy * straight / 2), (x0 + ux * straight / 2, y0 + uy * straight / 2)])
    return spine.buffer(radius + lanes * lane + KERB, 32).difference(spine.buffer(radius - 0.3, 32))


def off_track(tracks, x, y, gap=0.8):
    """Where a tree whose trunk would stand on a running track stands instead: just outside it,
    straight out from the infield, as a street tree stands on the verge. Anywhere else, where it is."""
    for t in tracks:
        d, bx, by = _spine(t)(x, y)
        inner, outer = t[4] - 0.3, t[4] + t[5] * t[6] + KERB
        if inner < d < outer + gap:
            return bx + (x - bx) / d * (outer + gap), by + (y - by) / d * (outer + gap)
    return x, y


def _tracks(land_use, polys):
    """Each running track mapped as a ring of lanes, with its infield (the hole in the ring)."""
    from shapely.geometry import Polygon
    out = []
    for g, p in land_use:
        if p.get("class") != "track": continue
        tags = dict(p.get("source_tags") or [])
        games = {q.strip() for q in (tags.get("sport") or "").split(";")}
        if not games & {"running", "athletics"} and tags.get("pitch") != "athletics": continue
        if tags.get("athletics", "track") != "track": continue   # a run-up to a jump or a throw
        for poly in polys(g):
            for hole in poly.interiors:
                infield = Polygon(hole)
                if infield.area < 1500 or infield.area < poly.area: continue   # a gap in the surface, not an infield
                r = infield.minimum_rotated_rectangle
                (ax, ay), (bx, by), (cx, cy) = list(r.exterior.coords)[:3]
                e1, e2 = math.hypot(bx - ax, by - ay), math.hypot(cx - bx, cy - by)
                angle = math.atan2(by - ay, bx - ax) if e1 >= e2 else math.atan2(cy - by, cx - bx)
                length, width = max(e1, e2), min(e1, e2)
                stadium = (length - width) * width + math.pi * (width / 2) ** 2
                if width < 30 or not 0.85 < infield.area / stadium < 1.15: continue   # not an oval track's infield
                # lanes: as mapped, or as many as fit in the ring round the infield
                try: lanes = int(tags.get("lanes") or 0)
                except ValueError: lanes = 0
                if not 2 <= lanes <= 10:
                    o = Polygon(poly.exterior).minimum_rotated_rectangle
                    (ax, ay), (bx, by), (cx, cy) = list(o.exterior.coords)[:3]
                    across = (min(math.hypot(bx - ax, by - ay), math.hypot(cx - bx, cy - by)) - width) / 2
                    lanes = max(4, min(8, int(round((across - 0.5) / LANE))))
                c = r.centroid
                out.append(([r1(c.x), r1(c.y), round(angle % math.pi, 3), r1(length - width), r1(width / 2), lanes, LANE], infield))
    return out


def _ring_round(q, infield):
    """Whether a mapped shape is a track's own ring round this infield."""
    return any(abs(h.area - infield.area) < 1 for h in (type(infield)(i) for i in getattr(q, "interiors", [])))


def sport(p):
    """What a pitch is mapped for: "f" football, "r" rugby, "c" cricket, None for no sport or
    several, or "" for something else."""
    tags = dict(p.get("source_tags") or [])
    games = [g.strip() for g in (tags.get("sport") or "").split(";") if g.strip()]
    if not games or games == ["multi"] or len(set(games)) > 1: return None
    g = games[0]
    return "f" if g == "soccer" else "r" if g.startswith("rugby") else "c" if g == "cricket" else ""


if __name__ == "__main__":
    import json, os, sys
    from shapely.geometry import box, shape
    from shapely.ops import transform
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from area import area

    A, src_dir, out_path = area(sys.argv[1]), sys.argv[2], sys.argv[3]
    W, S, E, N = A.bbox
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    proj = lambda x, y, z=None: ((x - lon0) * kx, (y - lat0) * ky)
    BM = box(*proj(W, S), *proj(E, N))

    def polys(g):
        c = transform(proj, g).intersection(BM)
        return [p for p in getattr(c, "geoms", [c]) if p.geom_type == "Polygon" and p.area > 0]

    def whole_polys(g):
        c = transform(proj, g)
        return [p for p in getattr(c, "geoms", [c]) if p.geom_type == "Polygon" and p.area > 0]

    def count(pi):
        return f"{sum(p[0] == 'f' for p in pi)} football pitches, {sum(p[0] == 'r' for p in pi)} rugby pitches, {sum(p[0] == 'c' for p in pi)} cricket fields"

    def put(d, pi, rt):
        """Writes a map's pitches and running tracks into it; whether anything changed."""
        if pi == d.get("pi", []) and rt == d.get("rt", []): return False
        d["pi"] = pi
        if rt: d["rt"] = rt
        else: d.pop("rt", None)
        return True

    def clear(d, rt):
        """Keeps a built map's trees and shrubs off its running tracks' lanes, as prep_map.py now
        places them: a tree there stands just outside the track (on the map's own ground there),
        a shrub there goes. Whether anything moved."""
        if not rt: return False
        from shapely.geometry import Point
        from shapely.ops import unary_union
        hard = unary_union([track_surface(t) for t in rt])
        T = d["t"]
        def ground(x, y):
            fi = min(max((x - T["x0"]) / T["dx"], 0), T["nx"] - 1.001)
            fj = min(max((y - T["y0"]) / T["dy"], 0), T["ny"] - 1.001)
            i, j = int(fi), int(fj); u, v = fi - i, fj - j
            h = lambda a, b: T["h"][b * T["nx"] + a]
            dm = (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v
            return r1(T["z0"] + dm / 10)
        moved = False
        for q in d.get("tr") or []:
            x, y = off_track(rt, q[0], q[1])
            if (x, y) != (q[0], q[1]): q[0], q[1], q[2], moved = r1(x), r1(y), ground(x, y), True
        if d.get("sb"):
            keep = [q for q in d["sb"] if not hard.contains(Point(q[0], q[1]))]
            moved |= len(keep) < len(d["sb"])
            d["sb"] = keep
        return moved

    land_use = [(shape(f["geometry"]), f["properties"]) for f in json.load(open(f"{src_dir}/land_use.geojson"))["features"]]
    if sys.argv[4:5] == ["--tiles"]:
        # each square keeps the pitches and tracks whose middle is in it, worked out from the whole of
        # each (as prep_map.py does); squares named after --tiles ("ti,tj") are the only ones redone
        every, every_rt = pitches(land_use, whole_polys), tracks(land_use, whole_polys)
        only = {tuple(int(v) for v in a.split(",")) for a in sys.argv[5:]}
        index = json.load(open(os.path.join(out_path, "tiles.json")))
        for ti, tj in index["tiles"]:
            path = os.path.join(out_path, f"{ti}_{tj}.json")
            if not os.path.exists(path) or (only and (ti, tj) not in only): continue
            d = json.load(open(path))
            x0, y0, x1, y1 = d["b"]
            pi = [p for p in every if x0 <= p[1] < x1 and y0 <= p[2] < y1]
            rt = [t for t in every_rt if x0 <= t[0] < x1 and y0 <= t[1] < y1]
            near = [t for t in every_rt if x0 - 60 <= t[0] < x1 + 60 and y0 - 60 <= t[1] < y1 + 60]   # a track's lanes reach over the edge
            if not put(d, pi, rt) | clear(d, near): continue
            json.dump(d, open(path, "w"), separators=(",", ":"))
            print(f"{ti}_{tj}: {count(pi)}, {len(rt)} running tracks")
    else:
        d = json.load(open(out_path))
        put(d, pitches(land_use, polys), tracks(land_use, polys))
        clear(d, d.get("rt", []))
        json.dump(d, open(out_path, "w"), separators=(",", ":"))
        print(f"{count(d['pi'])}, {len(d.get('rt', []))} running tracks")
