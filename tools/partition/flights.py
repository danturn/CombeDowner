"""Flights of steps as pieces of their own, settled once in the build so the game, the ground sheet
and the checks all read one answer from the record (write_tile.py runs these on a square's ways).

- A path, or a flight made from a steep path, mapped alongside a flight as a line of its own (the
  same climb drawn twice) is that flight: its stretch along it is left out (`settle_overlaps`). Two
  flights drawn side by side closer than their widths are narrowed to meet rather than overlap.
- Each flight's heights are baked into its points (`bake`): its line climbs over the ground it is
  laid on (at its uphill side, where it crosses a slope), never steeper than a stair and never back down, between its ends and any point another
  way shares with it, so no bank stands over a tread. Where it turns sharply, or meets another
  flight's end, it is level for a landing, so two runs of treads never lie over each other. `tb` 1
  says the heights are baked: the game lays the treads on them (furniture.ts stairLayout).

Nothing here is decided per square beyond the square's own ways: a point on the square's edge keeps
its height, which the next square's half of the flight shares.
"""
import math

import numpy as np
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import substring, unary_union
from shapely.strtree import STRtree

STAIR_PITCH = 0.7       # the steepest a flight's treads climb (furniture.ts)
ALONG = 3.0             # metres of a way lying along a flight before that stretch is taken for the flight
ALONG_SHARE = 0.7       # and it must run this much of its length along the flight, not across it
ON_FLIGHT = 0.2         # metres past a flight's side that a way's line still lies on it
NARROWEST = 0.9         # metres: a flight is never narrowed below this
SAMPLE = 0.5            # metres between the heights a flight's line is fitted at
KEEP_Z = 0.03           # metres a baked point may be left out by before it is kept
SHARP_TURN = 60.0       # degrees a flight's line turns at a point before it is a landing there
SHARED_END = 1.0        # metres between two flights' ends for them to share a landing
CHEEK = 0.2             # metres: a cheek wall's thickness (furniture.ts), the ground just past it is what the treads must clear


def _is_flight(r):
    return r["c"] == "steps" and len(r["p"]) > 1 and not any(len(q) > 3 and q[3] for q in r["p"])


def _flat(r):
    return LineString([q[:2] for q in r["p"]])


def _rank(r):
    """How much the map says about a flight: mapped over made from a steep path, then a tread count,
    handrails, its length."""
    return (not r.get("_made"), bool(r.get("sc")), bool(r.get("hr")), _flat(r).length)


def settle_overlaps(rd, paths, width):
    """A way lying along a flight it ranks below (a path, a made flight beside a mapped one, the
    lesser of two mapped flights) loses that stretch; what is left of it shorter than ALONG and still
    on the flight goes too. Then flights side by side closer than their widths are narrowed. `paths`
    are the classes that count as paths; `width(r)` a way's width. Returns the records, and how many
    stretches went."""
    flights = [r for r in rd if _is_flight(r)]
    if not flights:
        for r in rd:
            r.pop("_made", None)
        return rd, 0
    lines = [_flat(f) for f in flights]
    ranks = [_rank(f) for f in flights]
    tree = STRtree(lines)
    out, cut = [], 0
    for r in rd:
        walk = r["c"] in paths and r["c"] != "pedestrian" and len(r["p"]) > 1 and not any(len(q) > 3 and q[3] for q in r["p"])
        if not walk:
            out.append(r)
            continue
        line = LineString([q[:3] for q in r["p"]])
        mine = _rank(r) if r["c"] == "steps" else None
        drop, near = [], []
        for k in tree.query(line.buffer(width(r) / 2 + 2.0)):
            f = flights[int(k)]
            if f is r or (mine is not None and ranks[int(k)] <= mine):
                continue
            fl = lines[int(k)]
            on = fl.buffer(width(f) / 2 + ON_FLIGHT, cap_style="flat")
            inside = on.intersection(line)
            for part in getattr(inside, "geoms", [inside]):
                if part.geom_type != "LineString" or part.length < ALONG:
                    continue
                a, b = part.coords[0], part.coords[-1]
                if abs(fl.project(Point(b[:2])) - fl.project(Point(a[:2]))) >= ALONG_SHARE * part.length:
                    drop.append(part.buffer(0.05, cap_style="flat"))
            near.append(fl.buffer((width(f) + width(r)) / 2, cap_style="flat"))
        if not drop:
            out.append(r)
            continue
        rest = line.difference(unary_union(drop))
        beside = unary_union(near)
        pieces = [g for g in getattr(rest, "geoms", [rest]) if g.geom_type == "LineString" and g.length > 0.05]
        pieces = [g for g in pieces if g.length >= ALONG or not beside.contains(g)]
        cut += 1
        for g in pieces:
            out.append(dict(r, p=[[round(x, 1), round(y, 1), round(z, 2)] for x, y, z in g.coords]))
    flights = [r for r in out if _is_flight(r)]
    _narrow_side_by_side(flights, width)
    for r in out:
        r.pop("_made", None)
    return out, cut


def _narrow_side_by_side(flights, width):
    """Two flights running side by side closer than their widths (a pair of flights up one bank) are
    each narrowed to the gap between their lines, so their treads meet rather than overlap."""
    if len(flights) < 2:
        return
    lines = [_flat(f) for f in flights]
    bands = [l.buffer(width(f) / 2, cap_style="flat") for l, f in zip(lines, flights)]
    tree = STRtree(bands)
    for i, f in enumerate(flights):
        for j in tree.query(bands[i], predicate="intersects"):
            j = int(j)
            if j <= i:
                continue
            g = flights[j]
            a, b = lines[i], lines[j]
            ends = [Point(c) for c in (a.coords[0], a.coords[-1])], [Point(c) for c in (b.coords[0], b.coords[-1])]
            if any(p.distance(q) < SHARED_END for p in ends[0] for q in ends[1]):
                continue
            if bands[i].intersection(bands[j]).area < 0.3:
                continue
            short, other = (a, b) if a.length <= b.length else (b, a)
            n = max(2, int(short.length / 0.5))
            gaps = [other.distance(short.interpolate(t / n, normalized=True)) for t in range(n + 1)]
            gaps = [d for d in gaps if d < (width(f) + width(g)) / 2]
            if len(gaps) < 3:
                continue
            gap = float(np.median(gaps))
            if gap < NARROWEST:
                continue
            for r in (f, g):
                if width(r) > gap:
                    r["w"] = round(gap, 2)


def _turn(a, b, c):
    """Degrees a line turns at b, coming from a and going on to c."""
    u = (b[0] - a[0], b[1] - a[1])
    v = (c[0] - b[0], c[1] - b[1])
    lu, lv = math.hypot(*u), math.hypot(*v)
    if lu < 1e-6 or lv < 1e-6:
        return 0.0
    cos = max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / (lu * lv)))
    return math.degrees(math.acos(cos))


def _landing_reach(w, angle):
    """How far from where two runs of treads meet at `angle` degrees apart before their sides part."""
    s = math.sin(math.radians(max(angle, 1.0)) / 2)
    return min(w / 2 / max(s, 0.2), 1.5 * w)


def _leaving(line, end, reach=1.5):
    """The heading a line leaves one end along, over its first `reach` metres."""
    L = line.length
    a = line.interpolate(0 if end == 0 else L)
    b = line.interpolate(min(reach, L) if end == 0 else max(0.0, L - reach))
    d = math.hypot(b.x - a.x, b.y - a.y) or 1.0
    return (b.x - a.x) / d, (b.y - a.y) / d


def shared_ends(rd, width):
    """For each flight, the landing reach at each of its ends that it shares with another flight's
    end: {id(record): [reach at start, reach at end]}."""
    flights = [r for r in rd if _is_flight(r)]
    lines = [_flat(f) for f in flights]
    out = {}
    for i, (f, l) in enumerate(zip(flights, lines)):
        for e in (0, -1):
            pe = Point(l.coords[e])
            best = 0.0
            for j, (g, m) in enumerate(zip(flights, lines)):
                if j == i:
                    continue
                for h in (0, -1):
                    if Point(m.coords[h]).distance(pe) >= SHARED_END:
                        continue
                    u, v = _leaving(l, e), _leaving(m, h)
                    angle = math.degrees(math.acos(max(-1.0, min(1.0, u[0] * v[0] + u[1] * v[1]))))
                    best = max(best, _landing_reach(max(width(f), width(g)), angle))
            if best:
                out.setdefault(id(f), [0.0, 0.0])[0 if e == 0 else 1] = best
    return out


def _fit(g, z0, z1, step):
    """Heights at evenly spread points along a run, from the ground `g` there: never going back the
    other way between z0 and z1, no steeper than a stair over each `step` (0 on a landing), and
    meeting both ends. None if no stair can climb it."""
    n = len(g)
    up = z1 >= z0
    s = np.asarray(g, float) if up else -np.asarray(g, float)
    a, b = (z0, z1) if up else (-z0, -z1)
    # (the ground pooled into a line that never falls: the least-squares one, by pooling neighbours)
    vals, counts = [], []
    for x in s:
        vals.append(x)
        counts.append(1)
        while len(vals) > 1 and vals[-2] > vals[-1]:
            c = counts[-2] + counts[-1]
            vals[-2] = (vals[-2] * counts[-2] + vals[-1] * counts[-1]) / c
            counts[-2] = c
            vals.pop()
            counts.pop()
    h = np.repeat(vals, counts)
    most = STAIR_PITCH * np.asarray(step, float)
    reach_in = np.concatenate([[0.0], np.cumsum(most)])
    if reach_in[-1] + 1e-6 < b - a:
        return None
    reach_out = reach_in[-1] - reach_in
    h = np.clip(h, np.maximum(a, b - reach_out), np.minimum(b, a + reach_in))
    for i in range(1, n):
        h[i] = min(h[i], h[i - 1] + most[i - 1])
    for i in range(n - 2, -1, -1):
        h[i] = max(h[i], h[i + 1] - most[i])
    h[0], h[-1] = a, b
    return h if up else -h


def bake(rd, ground, sq, width, ends=None):
    """Lay each flight's heights on the ground it climbs and write them into its points (`tb` 1).
    Its ends, any point another way shares and any point on the square's edge keep their heights;
    between them the line follows `ground`, as `_fit` allows. Landings at sharp turns and at ends
    shared with other flights (`ends`, from `shared_ends`) are level. A run too steep for a stair
    stays straight. Returns how many flights were baked."""
    x0, y0, x1, y1 = sq
    on_edge = lambda q: min(q[0] - x0, x1 - q[0], q[1] - y0, y1 - q[1]) < 0.1
    shared = {}
    for r in rd:
        if len(r["p"]) < 2:
            continue
        for q in r["p"]:
            k = (round(q[0], 1), round(q[1], 1))
            shared.setdefault(k, set()).add(id(r))
    ends = ends or {}
    baked = 0
    for r in rd:
        if not _is_flight(r):
            continue
        p = [list(q) for q in r["p"]]
        # (points a hair apart, left by cutting the line back to what it meets, are one point)
        keep = [p[0]]
        for q in p[1:]:
            if math.dist(q[:2], keep[-1][:2]) >= 0.05:
                keep.append(q)
            elif q is p[-1]:
                keep[-1] = q
        p = keep
        if len(p) < 2:
            continue
        w = width(r)
        cum = [0.0]
        for a, b in zip(p, p[1:]):
            cum.append(cum[-1] + math.dist(a[:2], b[:2]))
        L = cum[-1]
        if L < 1.0:
            continue
        pins = [k for k, q in enumerate(p) if k in (0, len(p) - 1) or on_edge(q)
                or len(shared.get((round(q[0], 1), round(q[1], 1)), ())) > 1]
        # level stretches: round a sharp turn, and at an end another flight shares
        flats = []
        for k in range(1, len(p) - 1):
            t = _turn(p[k - 1], p[k], p[k + 1])
            if t > SHARP_TURN:
                reach = _landing_reach(w, 180.0 - t)
                flats.append((cum[k] - reach, cum[k] + reach))
        e0, e1 = ends.get(id(r), (0.0, 0.0))
        if e0:
            flats.append((0.0, e0))
        if e1:
            flats.append((L - e1, L))
        line = LineString([q[:2] for q in p])
        out = [p[0][:3]]
        for k0, k1 in zip(pins, pins[1:]):
            s0, s1 = cum[k0], cum[k1]
            z0, z1 = p[k0][2], p[k1][2]
            n = max(2, int(math.ceil((s1 - s0) / SAMPLE)))
            ss = np.linspace(s0, s1, n + 1)
            # (the line's own points among them, so its corners stay where they are)
            ss = np.unique(np.concatenate([ss, [cum[k] for k in range(k0 + 1, k1)]]))
            pts = [line.interpolate(s) for s in ss]
            g = [_highest(ground, line, s, w / 2 + CHEEK) for s in ss]
            straight = [z0 + (z1 - z0) * (s - s0) / ((s1 - s0) or 1) for s in ss]
            g = [straight[i] if v is None else v for i, v in enumerate(g)]
            mid = (ss[1:] + ss[:-1]) / 2
            step = np.diff(ss)
            level = np.zeros(len(step), bool)
            for f0, f1 in flats:
                level |= (mid >= f0) & (mid <= f1)
            h = _fit(g, z0, z1, np.where(level, 0.0, step))
            if h is None:
                h = _fit(g, z0, z1, step)
            if h is None:
                h = np.asarray(straight)
            corners = {round(cum[k], 6) for k in range(k0, k1 + 1)}
            seg = [(pts[i].x, pts[i].y, float(h[i]), round(float(ss[i]), 6) in corners) for i in range(len(ss))]
            out += _simplify(seg)[1:]
        r["p"] = [[round(q[0], 1), round(q[1], 1), round(q[2], 2)] for q in out]
        r["tb"] = 1
        baked += 1
    return baked


def _highest(ground, line, s, half):
    """The ground under a flight's line s metres along, or at either side of it if higher there: a
    flight across a slope is laid at its uphill side, so the bank never stands over its treads' ends."""
    p = line.interpolate(s)
    q = line.interpolate(min(line.length, s + 0.1)) if s + 0.1 <= line.length else line.interpolate(max(0.0, s - 0.1))
    dx, dy = (q.x - p.x, q.y - p.y) if s + 0.1 <= line.length else (p.x - q.x, p.y - q.y)
    d = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / d * half, dx / d * half
    zs = [z for z in (ground(p.x, p.y), ground(p.x + nx, p.y + ny), ground(p.x - nx, p.y - ny)) if z is not None]
    return max(zs) if zs else None


def _simplify(seg):
    """The points of a fitted run worth keeping: its own corners, and those its heights bend at by
    more than KEEP_Z off the line between their neighbours kept."""
    keep = [0]
    for i in range(1, len(seg) - 1):
        a = seg[keep[-1]]
        if seg[i][3]:
            keep.append(i)
            continue
        # (left out only if every point back to the last kept lies near the line on to the next)
        b = seg[i + 1]
        span = math.dist(a[:2], b[:2]) or 1.0
        ok = True
        for j in range(keep[-1] + 1, i + 1):
            t = math.dist(a[:2], seg[j][:2]) / span
            if abs(a[2] + (b[2] - a[2]) * t - seg[j][2]) > KEEP_Z:
                ok = False
                break
        if not ok:
            keep.append(i)
    keep.append(len(seg) - 1)
    return [list(seg[i][:3]) for i in keep]
