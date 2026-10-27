"""Tunnels you can walk through: the bored part of any road or path the map data flags as a tunnel.

Overture marks a stretch of a segment as a tunnel (road_flags is_tunnel, level -1). prep_map.py
carries its floor in a straight line between the ground at either end. Here each tunnel stretch is
split where the hill gets deep enough over it to need a bore: the ends, out in the open or in a
cutting, stay roads (the terrain is cut down to them), and the bored middle becomes a tunnel the
game builds as an arched tube with a stone portal at each end (web/src/tunnels.ts). Short
underpasses with little ground over them never get deep enough and stay ordinary roads, and nor
does one under a junction: the survey keeps the decks of the ways crossing over it as ground, but
only hill counts as cover (`rebore`).

The game's cross-section (web/src/map.ts, TUNNEL) is a 4.8 m wide floor with an arch 5.2 m high,
about the size of the old single-track railway tunnels on the Two Tunnels Greenway.
"""
import math

from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

HALF = 2.4      # half the floor width
CROWN = 5.2     # floor to the top of the arch
COVER = 1.0     # ground over the arch where the bore starts
MIN_BORE = 15   # metres: anything shorter stays a road
CUT = 3.0       # the cutting's floor reaches this far past each tunnel wall, as wide as the portal
INTO = 5.0      # the cutting carries on this far into the bore, behind the portal, so the
                # terrain's slope up onto the hill falls inside the tube, where the game hides it
OVER = 5.0      # metres across from a tunnel's centre line that a way above it counts as passing over
ABOVE = 2.5     # a way this far over the floor passes over it rather than meeting it: less than a
                # deck's headroom, as a floor carried straight under a junction can sit metres high
DECK = 10.0     # a way up to this far over the floor may stand on a deck; a hill's streets stand higher
FILL = 1.0      # ground between two decks no more than this above them is the junction's own fill


def bores(run, z, ranges, elev, decks=()):
    """Index ranges [i0, i1] of run (points [x, y, t]) that are bored: within a tunnel stretch and
    with at least CROWN + COVER of hill over the floor z, from the first such point to the last.
    `decks` are the points with another way's deck over them, which is not hill (`decked`)."""
    out = []
    for a, b in ranges:
        inside = [i for i, (_, _, t) in enumerate(run) if a <= t <= b]
        on_deck = decked(run, inside, decks, elev)
        deep = [i for i in inside if i not in on_deck and elev(*run[i][:2]) - z[i] >= CROWN + COVER]
        if not deep: continue
        i0, i1 = deep[0], deep[-1]
        if math.dist(run[i0][:2], run[i1][:2]) >= MIN_BORE:
            out.append((i0, i1))
    return out


def decked(run, inside, decks, elev):
    """The points of one tunnel stretch whose ground is a deck: those under another way's deck, and
    those between two such points where the ground stands no higher than the decks either side. Two
    roads crossing over a cutting close together (a junction above an underpass) have their decks
    and the fill between them surveyed as one block of ground, which is not a hill to bore through."""
    under = [i for i in inside if i in decks]
    out = set(under)
    for i, j in zip(under, under[1:]):
        top = max(elev(*run[i][:2]), elev(*run[j][:2])) + FILL
        if all(elev(*run[n][:2]) <= top for n in range(i + 1, j)):
            out |= set(range(i + 1, j))
    return out


def rebore(pending, elev):
    """Bore each tunnel stretch in `pending` again (the runs of every way, each a dict with its run,
    floor z, span, tunnel_ranges and bored) now that every way is known, with the decks over it
    taken as decks rather than hill. A short underpass under a junction stays a road in a cutting;
    a tunnel through a hill, with its streets far over it, keeps its bore."""
    for k, decks in decks_over(pending).items():
        r = pending[k]
        r["bored"] = bores(r["run"], r["z"], r["tunnel_ranges"], elev, decks)


def decks_over(pending):
    """{run index: the points of its tunnel stretches with another way passing over at deck height}:
    a bridge in the data, or any way between ABOVE and DECK over the floor."""
    tunnelled = [k for k, r in enumerate(pending) if r.get("tunnel_ranges") and len(r["run"]) > 1]
    if not tunnelled:
        return {}
    lines = [LineString([q[:2] for q in r["run"]]) if len(r["run"]) > 1 else Point(r["run"][0][:2]) for r in pending]
    tree = STRtree(lines)
    out = {}
    for k in tunnelled:
        r = pending[k]
        inside = set().union(*({i for i, q in enumerate(r["run"]) if a <= q[2] <= b} for a, b in r["tunnel_ranges"]))
        decks = set()
        for j in tree.query(lines[k].buffer(OVER)):
            j = int(j)
            if j == k:
                continue
            o = pending[j]
            for i in inside - decks:
                x, y = r["run"][i][:2]
                for n, q in enumerate(o["run"]):
                    if abs(q[0] - x) > OVER or abs(q[1] - y) > OVER or math.dist(q[:2], (x, y)) > OVER:
                        continue
                    up = o["z"][n] - r["z"][i]
                    if up >= ABOVE and (up <= DECK or n in o["span"]):
                        decks.add(i)
                        break
        out[k] = decks
    return out


def cuttings(run, ranges, bored):
    """Indexes of run points where the terrain is cut down to the floor: the tunnel stretch outside
    the bore (approach cuttings), and INTO metres inside each end of the bore."""
    cut = set()
    for a, b in ranges:
        cut |= {i for i, (_, _, t) in enumerate(run) if a <= t <= b}
    for i0, i1 in bored:
        inner = set(range(i0, i1 + 1))
        keep = {i for i in inner if math.dist(run[i][:2], run[i0][:2]) <= INTO or math.dist(run[i][:2], run[i1][:2]) <= INTO}
        cut -= inner - keep
    return cut


def split(run, bored):
    """The open-air pieces of run, each including the portal point it ends at."""
    pieces, start = [], 0
    for i0, i1 in bored:
        if i0 > start: pieces.append((start, i0))
        start = i1
    if start < len(run) - 1: pieces.append((start, len(run) - 1))
    return pieces


TOP = HALF + 1.0    # metres from a road's centre line inside which another way lies on top of it
ALONG = 8.0         # a way lying on top of a road in a tunnel this far, running along it, is moved off it
MINOR = {"footway", "steps", "cycleway", "path", "bridleway", "track", "service"}


def beside_tunnels(ways, tunnels, width, blocked=lambda g: False):
    """The lines of `ways` ([(LineString, class)]) with every stretch that runs along on top of a
    road's tunnel (`tunnels`: [(LineString, class)], the road's stretch under the ground) laid on the
    bank beside it instead, as [LineString] in the same order.

    The data draws a lane or a path over a tunnel's lid right on the line of the road in it. Where
    the tunnel is too shallow to bore it is opened as a cutting, and such a way would hang in the
    air the length of it (or, laid on the ground, run down the road), so it goes along the top of
    the bank, clear of the cutting, on the side it was on. Where a building or another way stands
    there on both sides it stays where it is, for the bridge rules to drop it. A minor way that
    ended on the moved stretch goes with it; where the moved way met a street that stays, it meets
    it where its new line crosses it. `width(class)` is a way's width."""
    if not tunnels:
        return [l for l, _ in ways]
    ttree = STRtree([t for t, _ in tunnels])
    lines = [l for l, _ in ways]
    ltree = STRtree(lines)
    key = lambda q: (round(q[0], 3), round(q[1], 3))
    at = {}
    for n, l in enumerate(lines):
        for v, q in enumerate(l.coords):
            at.setdefault(key(q), []).append((n, v))
    moves, drags, inserts = {}, {}, {}
    for n, (line, c) in enumerate(ways):
        for j in ttree.query(line.buffer(TOP)):
            t, tc = tunnels[int(j)]
            if c.replace("_link", "") == tc.replace("_link", ""):
                continue
            cut = max(HALF + CUT, width(tc) / 2 + 2.5)
            dist = cut + width(c) / 2 + 0.5
            for s0, s1 in _along_on_top(line, t, cut + width(c) / 2):
                plan = _off_the_lid(n, line, t, s0, s1, dist, tunnels, lines, ltree, at, ways, width, blocked)
                if plan is None:
                    continue
                coords, moved, ins = plan
                moves[n] = coords
                drags.update(moved)
                inserts.update(ins)
                line = LineString(coords)
    out = []
    for n, l in enumerate(lines):
        cs = moves.get(n, list(l.coords))
        if n not in moves:
            for e in (0, -1):
                if key(cs[e]) in drags:
                    pt, t, dist = drags[key(cs[e])]
                    # (and its points over the cutting between there and the bank go)
                    rest = cs[1:] if e == 0 else cs[-2::-1]
                    while len(rest) > 1 and t.distance(Point(rest[0])) < dist - 0.5:
                        rest = rest[1:]
                    cs = [pt] + rest if e == 0 else rest[::-1] + [pt]
        for after, p in sorted(((a, p) for (m, a), p in inserts.items() if m == n and n not in moves), reverse=True):
            cs = cs[:after + 1] + [p] + cs[after + 1:]
        out.append(LineString(cs))
    return out


def _along_on_top(line, t, reach, step=1.0):
    """The stretches [s0, s1] (metres along line) that run along on top of t for ALONG metres or
    more, grown out to where line is `reach` from t: the edge of the cutting it would be opened as."""
    n = max(1, int(math.ceil(line.length / step)))
    ss = [line.length * k / n for k in range(n + 1)]
    on = []
    for s in ss:
        p = line.interpolate(s)
        if t.distance(p) > TOP:
            on.append(False)
            continue
        a, b = line.interpolate(max(0.0, s - 1.0)), line.interpolate(min(line.length, s + 1.0))
        u = t.project(p)
        c, d = t.interpolate(max(0.0, u - 1.0)), t.interpolate(min(t.length, u + 1.0))
        ux, uy, vx, vy = b.x - a.x, b.y - a.y, d.x - c.x, d.y - c.y
        nu, nv = math.hypot(ux, uy), math.hypot(vx, vy)
        on.append(nu > 0 and nv > 0 and abs(ux * vx + uy * vy) / (nu * nv) >= 0.85)
    out, k = [], 0
    while k <= n:
        if not on[k]:
            k += 1
            continue
        e = k
        while e + 1 <= n and on[e + 1]:
            e += 1
        if ss[e] - ss[k] >= ALONG:
            a, b = k, e
            while a > 0 and t.distance(line.interpolate(ss[a - 1])) < reach:
                a -= 1
            while b < n and t.distance(line.interpolate(ss[b + 1])) < reach:
                b += 1
            out.append((ss[a], ss[b]))
        k = e + 1
    return out


def _extended(t, by=30.0):
    cs = list(t.coords)
    (ax, ay), (bx, by_) = cs[0], cs[1]
    (cx, cy), (dx, dy) = cs[-2], cs[-1]
    la, lb = math.hypot(bx - ax, by_ - ay) or 1, math.hypot(dx - cx, dy - cy) or 1
    return LineString([(ax - (bx - ax) / la * by, ay - (by_ - ay) / la * by)] + cs + [(dx + (dx - cx) / lb * by, dy + (dy - cy) / lb * by)])


def _beside(t, q, dist):
    """Point q moved square off line t to `dist` from it (dist > 0 on t's left)."""
    u = t.project(Point(q))
    p = t.interpolate(u)
    c, d = t.interpolate(max(0.0, u - 1.0)), t.interpolate(min(t.length, u + 1.0))
    tx, ty = d.x - c.x, d.y - c.y
    l = math.hypot(tx, ty) or 1
    return (p.x - ty / l * dist, p.y + tx / l * dist)


def _off_the_lid(n, line, t, s0, s1, dist, tunnels, lines, ltree, at, ways, width, blocked):
    """How way n's stretch [s0, s1] along on top of tunnel t is laid on the bank: (its new coords,
    {end of another way: where it goes}, {(way, vertex): point inserted after it}), or None where
    there's no room either side."""
    key = lambda q: (round(q[0], 3), round(q[1], 3))
    te = _extended(t)
    cs = list(line.coords)
    cum = [0.0]
    for a, b in zip(cs, cs[1:]):
        cum.append(cum[-1] + math.dist(a, b))
    inside = [v for v in range(len(cs)) if s0 - 0.01 <= cum[v] <= s1 + 0.01]
    # (a vertex is moved from itself, so the ends that go with it land on exactly the same point)
    marks = {round(cum[v], 6): cs[v] for v in inside}
    for k in range(int((s1 - s0) // 2.0) + 1):
        s = round(s0 + k * 2.0, 6)
        if all(abs(s - m) > 0.5 for m in marks):
            marks[s] = line.interpolate(s).coords[0]
    if all(abs(s1 - m) > 0.5 for m in marks):
        marks[round(s1, 6)] = line.interpolate(s1).coords[0]
    samples = sorted(marks.items())
    mid = line.interpolate((s0 + s1) / 2)
    u = te.project(mid)
    c, d = te.interpolate(max(0.0, u - 1.0)), te.interpolate(min(te.length, u + 1.0))
    p = te.interpolate(u)
    left = (d.x - c.x) * (mid.y - p.y) - (d.y - c.y) * (mid.x - p.x) >= 0
    near = {m for q in cs for m, _ in at.get(key(q), ())}
    is_end = lambda m, w: w in (0, len(lines[m].coords) - 1)
    for side in ((1, -1) if left else (-1, 1)):
        pts = [(s, _beside(te, q, side * dist)) for s, q in samples]
        new = LineString([q for _, q in pts])
        if new.length < 2.0:
            continue
        test = new.buffer(width(ways[n][1]) / 2 + 0.3)
        if blocked(test):
            continue
        if any(o.buffer(max(HALF + CUT, width(oc) / 2 + 2.5)).intersects(new) for o, oc in tunnels if o.distance(new) < 20):
            continue
        # (another way crossing it is a junction; one it would run along is in the way)
        if any(int(m) not in near and lines[int(m)].intersection(test).length > width(ways[n][1]) + width(ways[int(m)][1]) + 4.0
               for m in ltree.query(test)):
            continue
        moved, ins = {}, {}
        head, tail = [q for q, s in zip(cs, cum) if s < s0 - 0.01], [q for q, s in zip(cs, cum) if s > s1 + 0.01]
        # the minor ways that ended on the stretch go with it
        for v in inside:
            if any(m != n and is_end(m, w) and ways[m][1] in MINOR for m, w in at.get(key(cs[v]), ())):
                moved[key(cs[v])] = (dict(pts)[round(cum[v], 6)], t, dist)
        # an end of its own on a street that stays meets that street where the new line crosses it
        reach = LineString([_beside(te, te.interpolate(k).coords[0], side * dist) for k in range(0, int(te.length) + 1, 2)])
        dirn = 1 if te.project(line.interpolate(s1)) >= te.project(line.interpolate(s0)) else -1
        for end, first in ((0, True), (len(cs) - 1, False)):
            if end not in inside:
                continue
            others = [(m, w) for m, w in at.get(key(cs[end]), ()) if m != n]
            if all(is_end(m, w) and ways[m][1] in MINOR for m, w in others):
                continue
            moved.pop(key(cs[end]), None)
            best = None
            for m, _ in others:
                x = reach.intersection(lines[m])
                for g in (getattr(x, "geoms", None) or [x]):
                    if g.geom_type == "Point" and math.dist(g.coords[0], cs[end]) < 30 and (best is None or math.dist(g.coords[0], cs[end]) < best[0]):
                        best = (math.dist(g.coords[0], cs[end]), m, (g.x, g.y))
            if best is None:
                # (none: it keeps its end, and runs from it to the bank)
                pts = [(-1.0, cs[end])] + pts if first else pts + [(math.inf, cs[end])]
                continue
            _, m, pt = best
            om = list(lines[m].coords)
            ins[(m, min(range(len(om) - 1), key=lambda i: LineString(om[i:i + 2]).distance(Point(pt))))] = pt
            ut = te.project(Point(pt))
            pts = [(s, q) for s, q in pts if (te.project(Point(q)) - ut) * dirn * (1 if first else -1) > 0.5]
            pts = [(-1.0, pt)] + pts if first else pts + [(math.inf, pt)]
        coords = head + [q for _, q in pts] + tail
        coords = [q for i, q in enumerate(coords) if i == 0 or math.dist(q, coords[i - 1]) > 0.05]
        return coords, moved, ins
    return None


def across(run, idx, line, mid, reach):
    """The points of `idx` (a way's, its run on `line`) within `reach` of where it crosses `mid`."""
    if not line.crosses(mid):
        return set()
    x = line.intersection(mid)
    at = [g for g in getattr(x, "geoms", [x]) if g.geom_type == "Point"]
    return {i for i in idx if any(math.dist(run[i][:2], (g.x, g.y)) <= reach for g in at)}


def along(run, st, line):
    """Does the stretch st of a run head the same way as `line` (the road under it)?"""
    a, b = run[st[0]][:2], run[st[-1]][:2]
    u = line.project(Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
    c, d = line.interpolate(max(0.0, u - 2.0)), line.interpolate(min(line.length, u + 2.0))
    ux, uy, vx, vy = b[0] - a[0], b[1] - a[1], d.x - c.x, d.y - c.y
    nu, nv = math.hypot(ux, uy), math.hypot(vx, vy)
    return nu > 0 and nv > 0 and abs(ux * vx + uy * vy) / (nu * nv) >= 0.85
