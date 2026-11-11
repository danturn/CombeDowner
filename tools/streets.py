"""Street furniture and markings.

From the map data: bus stops (with their real names, and a shelter where the map says there is one),
benches, bins, post boxes (pillar, wall or lamp boxes, as mapped), red telephone boxes, bollards and
information boards, each moved onto the pavement and turned to face the street.

Generated: street name signs where streets meet, lamp posts, white centre lines, give-way lines
where a side street meets another, and cars parked along residential streets.

Every item is [type, x, y, ground, angle, ...]. The angle turns the item's local +x axis along
the street; its front (local +z) faces the carriageway.

keyed (always set by tools/prep_map.py): the random choices along each street
come from the street itself, not the order of the lists or Python's per-run string hashing, so two
tiles that both build a street near their shared edge put the same things on it.
"""
import math, random, zlib
import shapely
from shapely.geometry import LineString, Point

KERBED = {"primary", "secondary", "tertiary", "residential", "unclassified"}
RANK = {"primary": 5, "secondary": 4, "tertiary": 3, "unclassified": 2, "residential": 2, "living_street": 1}   # which gives way to which
PAVE = 1.7
CAR_COLOURS = 10   # the renderer picks from this many paints


# Royal Mail's boxes as the game draws them: a pillar box (and any the map doesn't say), a box set in
# a wall, and a small box on a post
POST_BOX = {"wall": 1, "lamp": 2}
def pv_at(r, s):
    """A street's pavements [left, right] at `s` metres along its points. `pv` is the widest they get
    and holds wherever `pw` says nothing: `pw` lists [s, left, right] where the room between the kerb
    and a building is less, the width running straight from one to the next (web/src/map.ts pvAt)."""
    pv = r.get("pv") or [PAVE, PAVE]
    pw = r.get("pw")
    if not pw or s < pw[0][0] or s > pw[-1][0]:
        return list(pv)
    for a, b in zip(pw, pw[1:]):
        if a[0] <= s <= b[0]:
            f = (s - a[0]) / ((b[0] - a[0]) or 1)
            return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
    return [pw[-1][1], pw[-1][2]]


def pave_band(r, i, w, line=None):
    """The pavement on side `i` (0 left, 1 right, looking along the points) of a street `w` wide, as
    the strip between its kerb and its edge, narrowed where its `pw` says."""
    pv = (r.get("pv") or [PAVE, PAVE])[i]
    if pv <= 0:
        return None
    L = line if line is not None else LineString([q[:2] for q in r["p"]])
    side = (1, -1)[i]
    band = L.buffer(side * (w / 2 + pv), cap_style=2, single_sided=True).difference(L.buffer(w / 2, cap_style=2))
    pw = r.get("pw")
    if not pw:
        return band
    cuts = []
    for a, b in zip(pw, pw[1:]):
        if a[1 + i] >= pv - 1e-6 and b[1 + i] >= pv - 1e-6:
            continue
        n = max(2, int((b[0] - a[0]) / 0.25) + 1)
        inner, outer = [], []
        for k in range(n + 1):
            s = a[0] + (b[0] - a[0]) * k / n
            c, d0, d1 = L.interpolate(s), L.interpolate(max(0.0, s - 0.3)), L.interpolate(min(L.length, s + 0.3))
            dl = math.hypot(d1.x - d0.x, d1.y - d0.y) or 1.0
            nx, ny = -(d1.y - d0.y) / dl * side, (d1.x - d0.x) / dl * side
            v = pv_at(r, s)[i]
            inner.append((c.x + nx * (w / 2 + v), c.y + ny * (w / 2 + v)))
            outer.append((c.x + nx * (w / 2 + pv + 1.0), c.y + ny * (w / 2 + pv + 1.0)))
        cut = shapely.Polygon(inner + outer[::-1]).buffer(0)
        if not cut.is_empty:
            cuts.append(cut)
    return band.difference(shapely.union_all(cuts)) if cuts else band


ROOM_STEP = 0.5      # metres between the points a pavement's room is measured at
ROOM_SPARE = 0.1     # metres kept between a pavement's edge and the building it stops at
ROOM_GIVE = 0.1      # metres narrower than `pv` before a stretch is written into `pw`


def pavement_room(rd, houses, width_of, kerbed=KERBED):
    """Each kerbed street's pavements narrowed, stretch by stretch, to the room between its kerb and
    the buildings beside it, down to nothing where a building stands at the kerb: written as the
    street's `pw`. The carriageway keeps its width and the buildings stay where they were measured;
    the pavement gives way. A street with room all along keeps only its `pv`."""
    houses = [h for h in houses if not h.is_empty]
    if not houses:
        return 0
    tree = shapely.STRtree(houses)
    count = 0
    for r in rd:
        r.pop("pw", None)
        pv = r.get("pv")
        # (a bridge's deck is drawn to its own sides, which nothing stands on)
        if r["c"] not in kerbed or len(r["p"]) < 2 or not pv or max(pv) <= 0 or any(len(q) > 3 and q[3] for q in r["p"]):
            continue
        L = LineString([q[:2] for q in r["p"]])
        if L.length < 0.5:
            continue
        w = width_of(r)
        near = tree.query(L.buffer(w / 2 + max(pv) + 0.5))
        if not len(near):
            continue
        near = [houses[int(k)] for k in near]
        n = max(2, int(math.ceil(L.length / ROOM_STEP)))
        at = [L.length * k / n for k in range(n + 1)]
        rows = []
        for s in at:
            c, d0, d1 = L.interpolate(s), L.interpolate(max(0.0, s - 0.3)), L.interpolate(min(L.length, s + 0.3))
            dl = math.hypot(d1.x - d0.x, d1.y - d0.y) or 1.0
            nx, ny = -(d1.y - d0.y) / dl, (d1.x - d0.x) / dl
            row = []
            for i, side in enumerate((1, -1)):
                if pv[i] <= 0:
                    row.append(0.0)
                    continue
                kerb = Point(c.x + nx * side * w / 2, c.y + ny * side * w / 2)
                ray = LineString([kerb.coords[0], (c.x + nx * side * (w / 2 + pv[i] + 0.3), c.y + ny * side * (w / 2 + pv[i] + 0.3))])
                room = pv[i]
                for h in near:
                    if h.contains(kerb):
                        room = 0.0
                        break
                    if h.intersects(ray):
                        room = min(room, kerb.distance(h.intersection(ray)) - ROOM_SPARE)
                row.append(max(0.0, min(pv[i], room)))
            rows.append(row)
        # (between two points, the narrower of them: a corner standing between them is still seen)
        rows = [[min(rows[j][i] for j in range(max(0, k - 1), min(len(rows), k + 2))) for i in (0, 1)] for k in range(len(rows))]
        tight = [any(pv[i] - row[i] > ROOM_GIVE for i in (0, 1)) for row in rows]
        if not any(tight):
            continue
        keep = sorted({j for k, t in enumerate(tight) if t for j in (k - 1, k, k + 1) if 0 <= j < len(rows)})
        pts = [[round(at[k], 2)] + [round(pv[i] if pv[i] - rows[k][i] <= ROOM_GIVE else rows[k][i], 2) for i in (0, 1)] for k in keep]
        # (a point the straight run between its neighbours gives anyway is left out)
        out = [pts[0]]
        for k in range(1, len(pts) - 1):
            a, b, c = out[-1], pts[k], pts[k + 1]
            f = (b[0] - a[0]) / ((c[0] - a[0]) or 1)
            if all(abs(a[i] + (c[i] - a[i]) * f - b[i]) < 0.05 for i in (1, 2)):
                continue
            out.append(b)
        if len(pts) > 1:
            out.append(pts[-1])
        r["pw"] = out
        count += 1
    return count


# The red kiosks; the modern KX booths aren't drawn
RED_BOOTHS = ("K2", "K6", "K8")


def phone_boxes(osm):
    """The red telephone boxes in OpenStreetMap's features (osm.geojson), as infrastructure-like
    points. A kiosk kept as a book swap or a defibrillator's case still stands."""
    out = []
    for g, p in osm:
        if p.get("booth") in RED_BOOTHS:
            out.append((g if g.geom_type == "Point" else g.representative_point(), {"class": "telephone_box"}))
    return out


def tags_of(p):
    return dict(t for t in p.get("source_tags") or [] if len(t) == 2)


def street_furniture(roads, infra, gates, RW, gelev, proj, inside, rnd: random.Random, keyed=False):
    vehicle = [r for r in roads if r["c"] in KERBED or r["c"] in ("service", "unknown", "living_street")]
    lines = [LineString([(a, b) for a, b, *_ in r["p"]]) for r in vehicle]
    tree = shapely.STRtree(lines)
    half = lambda r: (r.get("w") or RW.get(r["c"], 4)) / 2     # (a pedestrianised street has its own width)

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
        off = half(r) + max(0.3, extra_off - (PAVE - r.get("pv", [PAVE, PAVE])[0 if side > 0 else 1]))     # (the pavement on that side may be narrower, or none)
        px, py = c.x - dy * off * side, c.y + dx * off * side
        ang = math.atan2(dy, dx) + (0 if side > 0 else math.pi)
        return px, py, ang

    items = []
    r1 = lambda v: round(float(v), 2)
    # the game draws a kerbed street's pavement 0.2 m and its carriageway 0.07 m above the ground
    # (web/src/world.ts), and stands each item at the height stored here
    # (one standing well away from any street, in a park or out on a hill, stands on the ground itself)
    paved_by = [(LineString([(a, b) for a, b, *_ in r["p"]]), r) for r in roads
                if len(r["p"]) > 1 and r["c"] not in ("footway", "steps", "cycleway", "path", "track", "bridleway")]
    ptree = shapely.STRtree([ln for ln, _ in paved_by])

    def paved(x, y):
        pt = Point(x, y)
        for i in ptree.query(pt.buffer(25)):
            ln, r = paved_by[int(i)]
            if ln.distance(pt) < half(r) + max(r.get("pv", [PAVE, PAVE])) + 3.0: return True
        return False
    add = lambda kind, x, y, ang, *extra: items.append([kind, r1(x), r1(y), r1(gelev(x, y) + (0.07 if kind == "car" else 0.2 if paved(x, y) else 0.0)), r1(ang), *extra])

    # ---- mapped furniture --------------------------------------------------------
    stops = []
    for g, p in infra:
        if g.geom_type != "Point": continue
        x, y = proj(g.x, g.y)
        if not inside(x, y): continue
        c = p.get("class")
        kind = {"bus_stop": "bus", "bench": "bench", "waste_basket": "bin", "post_box": "postbox",
                "bollard": "bollard", "information": "info", "telephone_box": "phone", "street_lamp": "lamp"}.get(c)
        if not kind: continue
        near = nearest_street(x, y)
        if kind == "bus" and near and near[0] < 25:
            px, py, ang = place(x, y, near[1], 0.9)
            name = (p.get("names") or {}).get("primary") or "Bus stop"
            said = tags_of(p).get("shelter")
            if said in ("yes", "no"):
                shelter = 1 if said == "yes" else 0
            else:
                shelter = 1 if (random.Random(zlib.crc32(f"{x:.1f},{y:.1f}".encode())) if keyed else rnd).random() < 0.5 else 0
            add("bus", px, py, ang, name, shelter)
            stops.append((px, py))
        elif kind in ("postbox", "bin", "phone") and near and near[0] < 12:
            box = POST_BOX.get(tags_of(p).get("post_box:type"), 0) if kind == "postbox" else 0
            # a wall box is set in the wall at the back of the pavement, its slot facing the people
            # walking along it; the others stand out on the pavement
            back = 0.25 if box == 1 else 0.7 if kind == "phone" else 0.4
            px, py, ang = place(x, y, near[1], PAVE - back)
            if kind == "postbox":
                add(kind, px, py, ang, box)
            else:
                add(kind, px, py, ang)
        else:
            if near and near[0] < 30:
                dx, dy = _dir(lines[near[1]], x, y)
                ang = math.atan2(dy, dx)
                if kind == "lamp":
                    # its head hangs over the street, as the lamps placed below do
                    c = lines[near[1]].interpolate(lines[near[1]].project(Point(x, y)))
                    if (x - c.x) * -dy + (y - c.y) * dx < 0: ang += math.pi
                elif kind == "bench":
                    # a bench looks out at the street, not away from it (tools/prep_map.py then
                    # turns one near a wall to sit with its back to that)
                    c = lines[near[1]].interpolate(lines[near[1]].project(Point(x, y)))
                    if (x - c.x) * -dy + (y - c.y) * dx < 0: ang += math.pi
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
        # along the kerb at the back of the pavement, like a name plate on its posts, read from
        # the street it names and from the junction as you turn in
        add("sign", px, py, ang, r["n"])

    # ---- lamp posts: every 32 m along a kerbed street, where none is mapped near ---------
    mapped_lamps = [(q[1], q[2]) for q in items if q[0] == "lamp"]
    lamp_tree = shapely.STRtree([Point(q) for q in mapped_lamps]) if mapped_lamps else None
    for line, r in zip(lines, vehicle):
        if r["c"] not in KERBED: continue
        n = int(line.length // 32)
        for i in range(n):
            side = 1 if i % 2 else -1
            off = half(r) + 0.45
            # (a mapped bin or post box already standing on the spot: the lamp goes a step along from it)
            for step in (0, 1.2, -1.2):
                s = 16 + i * 32 + step
                c = line.interpolate(s)
                p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
                dx, dy = p1.x - p0.x, p1.y - p0.y
                l = math.hypot(dx, dy) or 1
                px, py = c.x - dy / l * off * side, c.y + dx / l * off * side
                if not any(abs(q[1] - px) < 0.6 and abs(q[2] - py) < 0.6 for q in items): break
            if near_junction(px, py, 5): continue
            if lamp_tree is not None and len(lamp_tree.query(Point(px, py).buffer(15))): continue
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
    def carries_on(k, x, y):
        """Whether street k runs on past this end of it, under the same name (the map splits a
        street into pieces wherever another one joins it)."""
        n, pt = vehicle[k].get("n"), Point(x, y)
        return bool(n) and any(m != k and vehicle[m].get("n") == n and min(Point(lines[m].coords[0]).distance(pt), Point(lines[m].coords[-1]).distance(pt)) < 2.5
                               for m in (int(i) for i in tree.query(pt.buffer(3))))
    for x, y, k, j, end in junctions:
        line, r = lines[k], vehicle[k]
        if r["c"] not in KERBED: continue
        major = vehicle[j]
        # a street running on past a side road gives way to it only if it's the lesser road
        # (Broad Street doesn't stop for Green Street; a lane crossing a main road does)
        if carries_on(k, x, y) and RANK.get(major["c"], 0) <= RANK.get(r["c"], 0): continue
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
    stop_pts = [Point(s) for s in stops]
    for px, py, ang, colour in parked_cars(lines, vehicle, half, near_junction, gate_pts, stop_pts,
                                           keyed, lambda r: "none" if 2 * half(r) < 5 else "one"):
        add("car", px, py, ang, colour)
    return items, marks


def parked_cars(lines, vehicle, half, near_junction, gate_pts, stop_pts, keyed, sides_for):
    """Cars parked along residential streets: (x, y, angle, paint) for each.

    `sides_for(street)` says how many kerbs get cars: "none", "one" (chosen per street) or "both",
    each kerb with its own run of random choices."""
    gtree = shapely.STRtree(gate_pts) if gate_pts else None
    cars = []
    for line, r in zip(lines, vehicle):
        if r["c"] not in ("residential", "unclassified", "living_street"): continue
        rule = sides_for(r)
        if rule == "none": continue
        seed = (zlib.crc32((r.get("n") or "").encode()) if keyed else hash(r.get("n") or "")) % 100000 + int(line.length)
        if rule == "one":
            runs = [(random.Random(seed), None)]
        else:
            runs = [(random.Random(seed * 2 + 1), 1), (random.Random(seed * 2 + 2), -1)]
        for rr, fixed in runs:
            side = fixed if fixed else (1 if rr.random() < 0.5 else -1)
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
                    cars.append((px, py, math.atan2(dy, dx) + (0 if rr.random() < 0.8 else math.pi), rr.randrange(CAR_COLOURS)))
                    s += 6.2 + rr.random() * 1.5
                else:
                    s += 4.0
    return cars


def _dir(line, x, y):
    s = line.project(Point(x, y))
    p0, p1 = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
    dx, dy = p1.x - p0.x, p1.y - p0.y
    l = math.hypot(dx, dy) or 1
    return dx / l, dy / l
