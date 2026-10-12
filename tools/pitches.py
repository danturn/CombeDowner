"""Sports pitches: football pitches, rugby pitches and cricket fields.

Mapped pitches (land_use class "pitch") are marked out for the sport OpenStreetMap says they're
for (its sport tag): football pitches for soccer, rugby pitches for rugby, cricket fields for
cricket. One mapped with no sport, or as for several, goes by its shape: a rectangle becomes a
rugby pitch and an oval a cricket field. Courts and pitches for anything else (tennis, hockey,
riding arenas and the like) are left alone, as are pitches too small to mark out and ones that
overlap a cricket field or a bigger pitch.

prep_map.py calls pitches(); to redo them on a map that is already built, without rebuilding it:

    python3 -I tools/pitches.py <map> <dir with land_use.geojson> <map.json>

or on the full-detail squares round it (tools/prep_tiles.py), from the wide land_use layer:

    python3 -I tools/pitches.py <map> <dir with the wide land_use.geojson> <tiles dir> --tiles
"""
import math
from shapely.geometry import LineString

ROUND = 0.85          # circularity (4 pi area / perimeter^2) above which a pitch is an oval
RUGBY_MIN = (30, 55)  # smallest rectangle (width, length) in metres that takes rugby markings
FOOTBALL_MIN = (25, 40)   # and football markings (a five-a-side cage is smaller)
ROPE_INSET = 3.0      # boundary rope, metres in from the edge of a cricket field
SCREEN_OUT = 1.8      # sightscreens, metres out past the rope behind each end of the wicket

r1 = lambda v: round(float(v), 1)


def pitches(land_use, polys):
    """land_use: (geometry, properties) pairs; polys: projects and clips a geometry to polygons.

    Returns ["f", x, y, length, width, angle] for football pitches, ["r", x, y, length, width,
    angle] for rugby pitches and ["c", x, y, angle, rope ring, sightscreens [[x, y], ...]] for
    cricket fields, in model metres; angle is the long axis (the wicket, for cricket), radians
    anticlockwise from east.
    """
    ovals, rects = [], []
    for g, p in land_use:
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
    return out


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

    land_use = [(shape(f["geometry"]), f["properties"]) for f in json.load(open(f"{src_dir}/land_use.geojson"))["features"]]
    if sys.argv[4:] == ["--tiles"]:
        # each square keeps the pitches whose middle is in it, worked out from the whole pitch (as prep_map.py does)
        every = pitches(land_use, whole_polys)
        index = json.load(open(os.path.join(out_path, "tiles.json")))
        for ti, tj in index["tiles"]:
            path = os.path.join(out_path, f"{ti}_{tj}.json")
            if not os.path.exists(path): continue
            d = json.load(open(path))
            x0, y0, x1, y1 = d["b"]
            pi = [p for p in every if x0 <= p[1] < x1 and y0 <= p[2] < y1]
            if pi == d.get("pi", []): continue
            d["pi"] = pi
            json.dump(d, open(path, "w"), separators=(",", ":"))
            print(f"{ti}_{tj}: {count(pi)}")
    else:
        d = json.load(open(out_path))
        d["pi"] = pitches(land_use, polys)
        json.dump(d, open(out_path, "w"), separators=(",", ":"))
        print(count(d["pi"]))
