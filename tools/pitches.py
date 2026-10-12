"""Sports pitches, turned into rugby pitches and cricket fields by their shape.

Mapped pitches (land_use class "pitch") come in two shapes here: rectangles, which become rugby
pitches, and ovals, which become cricket fields. Courts too small for rugby (tennis, netball,
basketball) are left alone, as are pitches that overlap a cricket field or a bigger pitch.

prep_map.py calls pitches(); to add them to a map that is already built, without rebuilding it:

    python3 -I tools/pitches.py <map> <dir with land_use.geojson> <map.json>
"""
import math
from shapely.geometry import LineString

ROUND = 0.85          # circularity (4 pi area / perimeter^2) above which a pitch is an oval
RUGBY_MIN = (30, 55)  # smallest rectangle (width, length) in metres that takes rugby markings
ROPE_INSET = 3.0      # boundary rope, metres in from the edge of a cricket field
SCREEN_OUT = 1.8      # sightscreens, metres out past the rope behind each end of the wicket

r1 = lambda v: round(float(v), 1)


def pitches(land_use, polys):
    """land_use: (geometry, properties) pairs; polys: projects and clips a geometry to polygons.

    Returns ["r", x, y, length, width, angle] for rugby pitches and ["c", x, y, angle, rope ring,
    sightscreens [[x, y], ...]] for cricket fields, in model metres; angle is the long axis (the
    wicket, for cricket), radians anticlockwise from east.
    """
    ovals, rects = [], []
    for g, p in land_use:
        if p.get("class") != "pitch": continue
        for poly in polys(g):
            r = poly.minimum_rotated_rectangle
            (ax, ay), (bx, by), (cx, cy) = list(r.exterior.coords)[:3]
            e1, e2 = math.hypot(bx - ax, by - ay), math.hypot(cx - bx, cy - by)
            angle = math.atan2(by - ay, bx - ax) if e1 >= e2 else math.atan2(cy - by, cx - bx)
            length, width = max(e1, e2), min(e1, e2)
            if 4 * math.pi * poly.area / poly.length ** 2 >= ROUND:
                ovals.append((poly, angle))
            elif poly.area / r.area > 0.9 and width >= RUGBY_MIN[0] and length >= RUGBY_MIN[1]:
                rects.append((r, length, width, angle))
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
    rects.sort(key=lambda t: -t[0].area)
    kept = []
    for r, length, width, angle in rects:
        if any(r.intersection(o).area > 0.1 * r.area for o, _ in ovals): continue
        if any(r.intersection(k).area > 0.1 * r.area for k in kept): continue
        kept.append(r)
        c = r.centroid
        out.append(["r", r1(c.x), r1(c.y), r1(length), r1(width), round(angle % math.pi, 3)])
    return out


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

    land_use = [(shape(f["geometry"]), f["properties"]) for f in json.load(open(f"{src_dir}/land_use.geojson"))["features"]]
    d = json.load(open(out_path))
    d["pi"] = pitches(land_use, polys)
    json.dump(d, open(out_path, "w"), separators=(",", ":"))
    print(f"{sum(p[0] == 'r' for p in d['pi'])} rugby pitches, {sum(p[0] == 'c' for p in d['pi'])} cricket fields")
