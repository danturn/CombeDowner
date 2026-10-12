"""Street furniture and markings.

From the map data: bus stops (with their real names), benches, bins, post boxes, bollards and
information boards, each moved onto the pavement and turned to face the street.

Generated: street name signs where streets meet, lamp posts, white centre lines, give-way lines
where a side street meets another, and cars parked along residential streets.

Every item is [type, x, y, ground, angle, ...]. The angle turns the item's local +x axis along
the street; its front (local +z) faces the carriageway.

keyed (for a map built in tiles, see tools/prep_tiles.py): the random choices along each street
come from the street itself, not the order of the lists or Python's per-run string hashing, so two
tiles that both build a street near their shared edge put the same things on it.
"""
import math, random, zlib
import shapely
from shapely.geometry import LineString, Point

KERBED = {"primary", "secondary", "tertiary", "residential", "unclassified"}
PAVE = 1.7
CAR_COLOURS = 10   # the renderer picks from this many paints


def street_furniture(roads, infra, gates, RW, gelev, proj, inside, rnd: random.Random, keyed=False):
    vehicle = [r for r in roads if r["c"] in KERBED or r["c"] in ("service", "unknown", "living_street")]
    lines = [LineString([(a, b) for a, b, _ in r["p"]]) for r in vehicle]
    tree = shapely.STRtree(lines)
    half = lambda r: RW.get(r["c"], 4) / 2

    def nearest_street(x, y):
        best = None
        for k in tree.query(Point(x, y).buffer(30)):
            d = lines[int(k)].distance(Point(x, y))
            if best is None or d < best[0]: best = (d, int(k))
        return best

    def place(x, y, k, extra_off):
        """Snap (x, y) to the pavement of street k on the side it is on: position and facing angle."""
        line, r = lines[k], vehicle[k]
        s = line.project(Point(x, y))
        p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
        dx, dy = p1.x - p0.x, p1.y - p0.y
        l = math.hypot(dx, dy) or 1
        dx, dy = dx / l, dy / l
        c = line.interpolate(s)
        side = 1 if (x - c.x) * -dy + (y - c.y) * dx > 0 else -1
        off = half(r) + extra_off
        px, py = c.x - dy * off * side, c.y + dx * off * side
        ang = math.atan2(dy, dx) + (0 if side > 0 else math.pi)
        return px, py, ang

    items = []
    r1 = lambda v: round(float(v), 2)
    add = lambda kind, x, y, ang, *extra: items.append([kind, r1(x), r1(y), r1(gelev(x, y)), r1(ang), *extra])

    # ---- mapped furniture --------------------------------------------------------
    stops = []
    for g, p in infra:
        if g.geom_type != "Point": continue
        x, y = proj(g.x, g.y)
        if not inside(x, y): continue
        c = p.get("class")
        kind = {"bus_stop": "bus", "bench": "bench", "waste_basket": "bin", "post_box": "postbox",
                "bollard": "bollard", "information": "info"}.get(c)
        if not kind: continue
        near = nearest_street(x, y)
        if kind == "bus" and near and near[0] < 25:
            px, py, ang = place(x, y, near[1], 0.9)
            name = (p.get("names") or {}).get("primary") or "Bus stop"
            shelter = 1 if (random.Random(zlib.crc32(f"{x:.1f},{y:.1f}".encode())) if keyed else rnd).random() < 0.5 else 0
            add("bus", px, py, ang, name, shelter)
            stops.append((px, py))
        elif kind in ("postbox", "bin") and near and near[0] < 12:
            px, py, ang = place(x, y, near[1], PAVE - 0.4)
            add(kind, px, py, ang)
        else:
            if near and near[0] < 30:
                dx, dy = _dir(lines[near[1]], x, y)
                ang = math.atan2(dy, dx)
            else:
                ang = 0
            add(kind, x, y, ang)

    # ---- junctions: where a street's end meets another street --------------------
    junctions = []   # (x, y, street index, other street index, end)
    for k, (line, r) in enumerate(zip(lines, vehicle)):
        for end, pt in ((0, Point(line.coords[0])), (1, Point(line.coords[-1]))):
            cands = [int(j) for j in tree.query(pt.buffer(3))]
            if keyed: cands.sort(key=lambda j: lines[j].coords[0])
            for j in cands:
                if j == k or vehicle[j].get("n") == r.get("n") and r.get("n"): continue
                if lines[j].distance(pt) < 2.5:
                    junctions.append((pt.x, pt.y, k, j, end)); break
    jpts = [Point(x, y) for x, y, *_ in junctions]
    jtree = shapely.STRtree(jpts) if jpts else None
    near_junction = lambda x, y, d: jtree is not None and any(jpts[int(i)].distance(Point(x, y)) < d for i in jtree.query(Point(x, y).buffer(d)))

    # ---- street name signs: one at each named street's junction ends -------------
    signed = set()
    for x, y, k, j, end in junctions:
        r = vehicle[k]
        if not r.get("n") or r["c"] not in KERBED: continue
        key = (r["n"], round(x / 40), round(y / 40))
        if key in signed: continue
        signed.add(key)
        line = lines[k]
        s = 6 if end == 0 else line.length - 6
        if s < 0 or s > line.length: continue
        c = line.interpolate(s)
        px, py, ang = place(c.x + 0.01, c.y + 0.01, k, PAVE - 0.25)
        # face along the street, towards the junction, so you read it as you arrive
        add("sign", px, py, ang + math.pi / 2 * (1 if end == 0 else -1), r["n"])

    # ---- lamp posts --------------------------------------------------------------
    for line, r in zip(lines, vehicle):
        if r["c"] not in KERBED: continue
        n = int(line.length // 32)
        for i in range(n):
            s = 16 + i * 32
            c = line.interpolate(s)
            p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
            dx, dy = p1.x - p0.x, p1.y - p0.y
            l = math.hypot(dx, dy) or 1
            side = 1 if i % 2 else -1
            off = half(r) + 0.45
            px, py = c.x - dy / l * off * side, c.y + dx / l * off * side
            if near_junction(px, py, 5): continue
            add("lamp", px, py, math.atan2(dy, dx) + (0 if side > 0 else math.pi))

    # ---- markings: centre dashes and give-way lines ------------------------------
    marks = []
    for line, r in zip(lines, vehicle):
        if r["c"] not in KERBED or RW.get(r["c"], 4) < 5.5: continue
        s = 4.0
        while s + 3 < line.length:
            a, b = line.interpolate(s), line.interpolate(s + 3)
            if not near_junction(a.x, a.y, 10) and not near_junction(b.x, b.y, 10):
                marks.append([r1(a.x), r1(a.y), r1(b.x), r1(b.y), r1(gelev(a.x, a.y)), r1(gelev(b.x, b.y)), 0])
            s += 9
    for x, y, k, j, end in junctions:
        line, r = lines[k], vehicle[k]
        if r["c"] not in KERBED: continue
        major = vehicle[j]
        s = half(major) + 1.0
        s = s if end == 0 else line.length - s
        if not 0 < s < line.length: continue
        c = line.interpolate(s)
        d = _dir(line, c.x, c.y)
        nx, ny = -d[1], d[0]
        w = half(r) - 0.2
        # two dashed lines across the road
        for back in (0, 0.45):
            bx, by = c.x - d[0] * back * (1 if end == 0 else -1), c.y - d[1] * back * (1 if end == 0 else -1)
            t = -w
            while t < w:
                t2 = min(w, t + 0.6)
                ax_, ay_, bx_, by_ = bx + nx * t, by + ny * t, bx + nx * t2, by + ny * t2
                marks.append([r1(ax_), r1(ay_), r1(bx_), r1(by_), r1(gelev(ax_, ay_)), r1(gelev(bx_, by_)), 1])
                t += 1.2

    # ---- parked cars -------------------------------------------------------------
    gate_pts = [Point((g[0] + g[2]) / 2, (g[1] + g[3]) / 2) for g in gates]
    gtree = shapely.STRtree(gate_pts) if gate_pts else None
    stop_pts = [Point(s) for s in stops]
    for line, r in zip(lines, vehicle):
        if r["c"] not in ("residential", "unclassified", "living_street"): continue
        rr = random.Random((zlib.crc32((r.get("n") or "").encode()) if keyed else hash(r.get("n") or "")) % 100000 + int(line.length))
        side = 1 if rr.random() < 0.5 else -1
        s = 8.0
        while s < line.length - 8:
            c = line.interpolate(s)
            p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
            dx, dy = p1.x - p0.x, p1.y - p0.y
            l = math.hypot(dx, dy) or 1
            dx, dy = dx / l, dy / l
            off = half(r) - 1.05
            px, py = c.x - dy * off * side, c.y + dx * off * side
            ok = rr.random() < 0.5 and not near_junction(px, py, 12)
            if ok and gtree is not None:
                ok = not any(gate_pts[int(i)].distance(Point(px, py)) < 4.5 for i in gtree.query(Point(px, py).buffer(4.5)))
            if ok and any(sp.distance(Point(px, py)) < 14 for sp in stop_pts): ok = False
            if ok:
                add("car", px, py, math.atan2(dy, dx) + (0 if rr.random() < 0.8 else math.pi), rr.randrange(CAR_COLOURS))
                s += 6.2 + rr.random() * 1.5
            else:
                s += 4.0
    return items, marks


def _dir(line, x, y):
    s = line.project(Point(x, y))
    p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
    dx, dy = p1.x - p0.x, p1.y - p0.y
    l = math.hypot(dx, dy) or 1
    return dx / l, dy / l
