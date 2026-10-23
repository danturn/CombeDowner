"""Bridges, tunnels and road profiles for a street graph, worked out for the whole map at once.

The partition's roads used to lie on the raw ground, so a bridge was a hole in the road and a
dip under a bridge was missing. `prep_map.py` has the rules that make a road rise and fall like a
road, carry a bridge straight between its ends and dip what passes under it; they are copied here
(not shared, so the old build stays as it is) and run over the partition's street edges instead of
Overture's segments.

It has to be global: a dip under one bridge lowers every road that meets the road underneath, so
a square cannot decide it from its own roads. `solve` takes a list of runs like `prep_map.py`'s
`pending` (a road densified every 4 m, each point [x, y, t], with its heights) and gives back the
heights, which points are a bridge's span, which ride on a deck beside one, and which are bored.
Nothing here is decided over the network: it is all build-time.
"""
import math

import numpy as np
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import substring
from shapely.strtree import STRtree

import tunnels as TN

STEP = 4.0

# the same widths as prep_map.py, which keeps them in step with the game's
RW = {"motorway": 14, "trunk": 12, "primary": 8.5, "secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 5.5,
      "living_street": 5, "service": 3.5, "unknown": 4, "pedestrian": 4, "footway": 1.6, "steps": 1.8, "cycleway": 2,
      "path": 1.4, "track": 2.8, "bridleway": 2}
PATHS = {"footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"}
KERBED_RD = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street"}
NARROW = {"footway", "steps", "cycleway", "path"}
VIADUCT = 40
CLEAR_ROAD, CLEAR_PATH, DIP = 4.6, 2.8, 35.0
CANAL_HEAD = 2.6
LOCK_REACH, BESIDE = 15.0, 8.0
APPROACH = 10
SMOOTH = 3


# ---- which stretches of which street are structures --------------------------------------------

def overture_flags(props):
    """(kind, t0, t1) for each bridge or tunnel stretch an Overture segment marks, as fractions."""
    out = []
    for f in props.get("road_flags") or []:
        a, b = f.get("between") or (0.0, 1.0)
        vals = set(f.get("values") or [])
        if "is_bridge" in vals:
            out.append(("bridge", a, b))
        if "is_tunnel" in vals:
            out.append(("tunnel", a, b))
    return out


def match_structures(edges, segments, reach=3.0, step=1.0, merge=3.0):
    """{edge id: {"bridge": [[m0, m1], ...], "tunnel": [...]}} in metres along each edge.

    The street graph comes from OSM, which has no bridge or tunnel tags, so each stretch Overture
    marks is laid onto the edges it runs along: the points of an edge within `reach` of the stretch
    and heading the same way. A footway that happens to run beside a street does not mark the
    street, so a path only marks paths."""
    tree = STRtree([e["line"] for e in edges])
    found = {}
    for g, p in segments:
        flags = overture_flags(p)
        if not flags:
            continue
        is_path = (p.get("class") or "unknown") in PATHS
        for part in (g.geoms if hasattr(g, "geoms") else [g]):
            if part.geom_type != "LineString" or part.length < 0.5:
                continue
            for kind, a, b in flags:
                sub = substring(part, a * part.length, b * part.length)
                if sub.geom_type != "LineString" or sub.length < 0.3:
                    continue
                for j in tree.query(sub.buffer(reach)):
                    e = edges[int(j)]
                    if (e["cls"] in PATHS) != is_path:
                        continue
                    for m0, m1 in _covered(e["line"], sub, reach, step, merge):
                        found.setdefault(e["id"], {}).setdefault(kind, []).append([round(m0, 1), round(m1, 1)])
    return {i: {k: _merged(v, merge) for k, v in d.items()} for i, d in found.items()}


def _covered(line, sub, reach, step, merge):
    """The stretches (metres along line) that lie along sub: near it and running the same way."""
    n = max(1, int(math.ceil(line.length / step)))
    ts = [line.length * k / n for k in range(n + 1)]
    ok = []
    for t in ts:
        pt = line.interpolate(t)
        if sub.distance(pt) > reach:
            ok.append(False)
            continue
        a, b = line.interpolate(max(0.0, t - 1.0)), line.interpolate(min(line.length, t + 1.0))
        s = sub.project(pt)
        if (s < 0.01 or s > sub.length - 0.01) and sub.distance(pt) > 1.0:
            ok.append(False)      # beside the stretch's end, not along it
            continue
        c, d = sub.interpolate(max(0.0, s - 1.0)), sub.interpolate(min(sub.length, s + 1.0))
        ux, uy, vx, vy = b.x - a.x, b.y - a.y, d.x - c.x, d.y - c.y
        nu, nv = math.hypot(ux, uy), math.hypot(vx, vy)
        ok.append(nu > 0 and nv > 0 and abs(ux * vx + uy * vy) / (nu * nv) >= 0.7)
    out, k = [], 0
    while k <= n:
        if not ok[k]:
            k += 1
            continue
        e = k
        while e + 1 <= n and ok[e + 1]:
            e += 1
        out.append([max(0.0, ts[k] - step / 2), min(line.length, ts[e] + step / 2)])
        k = e + 1
    return _merged(out, merge)


def _merged(ranges, gap):
    out = []
    for a, b in sorted(ranges):
        if out and a <= out[-1][1] + gap:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


# ---- the profile rules, as prep_map.py has them -------------------------------------------------

def densify(line, step=STEP):
    """The edge as points [x, y, t] every `step` m or a little under, t the fraction along it."""
    n = max(1, int(math.ceil(line.length / step)))
    out = []
    for k in range(n + 1):
        p = line.interpolate(line.length * k / n)
        out.append([p.x, p.y, k / n])
    return out


def in_ranges(run, ranges):
    return {i for i, (_, _, t) in enumerate(run) if any(a <= t <= b for a, b in ranges)}


def level_structures(run, z, ranges):
    """Carry bridges and tunnels straight between the road at either end. The survey's ground
    drops away into the gap over the last few dozen metres before a bridge (the bridge taken out
    of it and the bank put in), where the road doesn't: so each end is taken from the highest
    point of the road within APPROACH points of it, and the approach from there is held level."""
    ts = [p[2] for p in run]
    for a, b in ranges:
        idx = [i for i, t in enumerate(ts) if a <= t <= b]
        if not idx:
            continue
        i0, i1 = max(0, idx[0] - 1), min(len(run) - 1, idx[-1] + 1)
        ia = max(range(max(0, i0 - APPROACH), i0 + 1), key=lambda i: z[i])
        ib = max(range(i1, min(len(run), i1 + APPROACH + 1)), key=lambda i: z[i])
        za, zb, ta, tb = z[ia], z[ib], ts[i0], ts[i1]
        for i in range(ia, i0 + 1):
            z[i] = za
        for i in range(i1, ib + 1):
            z[i] = zb
        for i in range(i0 + 1, i1):
            z[i] = za + (zb - za) * ((ts[i] - ta) / ((tb - ta) or 1))
    return z


def smooth_profile(run, z, keep):
    """A road's heights, smoothed along its length, apart from the points in keep (bridges and
    tunnels, which are carried straight already) and the two ends (where it meets other roads,
    which must agree on the height there)."""
    n = len(z)
    if n < 3:
        return z
    out = list(z)
    for i in range(1, n - 1):
        if i in keep:
            continue
        lo, hi = max(0, i - SMOOTH), min(n - 1, i + SMOOTH)
        js = [j for j in range(lo, hi + 1) if j not in keep]
        if len(js) < 2:
            continue
        avg = sum(z[j] for j in js) / len(js)
        w = min(1.0, i / SMOOTH, (n - 1 - i) / SMOOTH)
        out[i] = z[i] + (avg - z[i]) * w
    return out


def stretches(idx):
    """Runs of consecutive indexes in the set idx, each as a sorted list."""
    out, cur = [], []
    for i in sorted(idx):
        if cur and i != cur[-1] + 1:
            out.append(cur)
            cur = []
        cur.append(i)
    if cur:
        out.append(cur)
    return out


def chain_edges(edges, straight=40.0):
    """The edges joined into through-roads: [[(edge, reversed), ...], ...].

    Overture's bridges and approaches run on past a junction that OSM splits a street at, and the
    height of a road should carry on across such a junction instead of starting afresh from the
    raw ground, so at each node the ends of two edges of the same class that carry straight on
    (within `straight` degrees), each the other's best fit, are taken as one road."""
    ends = {}
    for k, e in enumerate(edges):
        cs = list(e["line"].coords)
        for end, (p, q) in enumerate(((cs[0], cs[1]), (cs[-1], cs[-2]))):
            ends.setdefault((round(p[0], 3), round(p[1], 3)), []).append((k, end, math.atan2(q[1] - p[1], q[0] - p[0])))
    cand = []
    for node, es in ends.items():
        for i in range(len(es)):
            for j in range(i + 1, len(es)):
                (k1, e1, a1), (k2, e2, a2) = es[i], es[j]
                if k1 == k2 or edges[k1]["cls"] != edges[k2]["cls"]:
                    continue
                turn = abs((a1 - a2 + math.pi) % (2 * math.pi) - math.pi)     # pi when dead straight
                bend = math.degrees(math.pi - turn)
                if bend <= straight:
                    cand.append((bend, k1, e1, k2, e2))
    used, nxt = set(), {}
    for bend, k1, e1, k2, e2 in sorted(cand):
        if (k1, e1) in used or (k2, e2) in used:
            continue
        used |= {(k1, e1), (k2, e2)}
        nxt[(k1, e1)] = (k2, e2)
        nxt[(k2, e2)] = (k1, e1)
    seen, out = set(), []
    for k in range(len(edges)):
        if k in seen:
            continue
        # walk to one end of the road, then along it
        start, end = k, 0
        while (start, end) in nxt and nxt[(start, end)][0] not in seen:
            k2, e2 = nxt[(start, end)]
            if k2 == k:
                break
            start, end = k2, 1 - e2
            if start == k:
                break
        chain, cur, enter = [], start, end
        while cur not in seen:
            seen.add(cur)
            chain.append((edges[cur], enter == 1))
            far = 1 - enter
            if (cur, far) not in nxt:
                break
            cur, enter = nxt[(cur, far)]
        out.append(chain)
    return out


def make_run(chain, elev):
    """One through-road as a `pending` record: its run (each edge walked every 4 m, in the road's
    direction), smoothed heights with the structures carried straight, and which points are a span
    or bored. `parts` says which points came from which edge, to give each edge its own back."""
    run, parts, bridge, tunnel, base = [], [], [], [], 0.0
    total = sum(e["line"].length for e, _ in chain) or 1.0
    for e, rev in chain:
        line = e["line"]
        pts = densify(LineString(list(line.coords)[::-1]) if rev else line)
        start = len(run) - 1 if run else 0
        for x, y, t in pts[1:] if run else pts:
            run.append([x, y, (base + t * line.length) / total])
        parts.append((e["id"], rev, start, len(run) - 1))
        L = line.length
        for kind, into in (("bridge", bridge), ("tunnel", tunnel)):
            for a, b in (e.get("struct") or {}).get(kind, []):
                a, b = (L - b, L - a) if rev else (a, b)
                into.append(((base + a) / total, (base + b) / total))
        base += L
    ranges = bridge + tunnel
    c = chain[0][0]["cls"]
    z = [elev(x, y) for x, y, _ in run]
    if c not in PATHS:
        z = smooth_profile(run, z, in_ranges(run, ranges))
    z = level_structures(run, z, ranges)
    bored = TN.bores(run, z, tunnel, elev)
    return dict(parts=parts, c=c, run=run, z=z, span=in_ranges(run, bridge), bored=bored,
                tunnel_ranges=tunnel)


def split_back(r):
    """{edge id: dict(z, span, deck, bored)} from a solved through-road, each in its edge's own direction."""
    out = {}
    for eid, rev, s, e in r["parts"]:
        idx = list(range(s, e + 1))
        if rev:
            idx.reverse()
        pos = {i: n for n, i in enumerate(idx)}
        last = len(idx) - 1
        bored = []
        for i0, i1 in r["bored"]:
            lo, hi = max(i0, s), min(i1, e)
            if lo > hi:
                continue
            pa = pos[lo] + ((1 if rev else -1) if i0 < s else 0)
            pb = pos[hi] + ((-1 if rev else 1) if i1 > e else 0)
            a, b = sorted((pa, pb))
            bored.append([a, b])
        out[eid] = dict(z=[round(r["z"][i], 2) for i in idx],
                        span=sorted(pos[i] for i in r["span"] if i in pos),
                        deck=sorted(pos[i] for i in r["deck"] if i in pos), bored=bored)
    return out


def solve(pending, water_polys, rail_tracks, canal, elev, bm):
    """Decide the structures over a set of runs, changing their heights, `span` and `deck` in place.

    In order: underpasses, paths riding a road's deck, which marked spans are real bridges, the
    canal's bridges, what dips under a bridge, and paths afloat. `canal` is the canal file's
    contents (or None), `bm` the map's box."""
    water_tree = STRtree(water_polys)
    rail_lines = [LineString([q[:2] for q in t["p"]]) for t in rail_tracks if len(t["p"]) > 1]
    rail_tracks = [t for t in rail_tracks if len(t["p"]) > 1]
    rail_tree = STRtree(rail_lines)
    road_lines = [LineString([q[:2] for q in r["run"]]) for r in pending]
    road_tree = STRtree(road_lines)
    for r in pending:
        r["deck"] = set()

    # an underpass: a tunnel stretch too shallow to bore, which stays a road in a cutting. Whatever
    # crosses over it is carried over as a bridge, with the cutting as wide as the road in it
    underpasses = []
    for k, r in enumerate(pending):
        if not r["tunnel_ranges"]:
            continue
        shallow = in_ranges(r["run"], r["tunnel_ranges"]) - {i for i0, i1 in r["bored"] for i in range(i0, i1 + 1)}
        pts = [r["run"][i][:2] for i in sorted(shallow)]
        if len(pts) >= 2:
            underpasses.append((k, LineString(pts).buffer(max(TN.HALF + TN.CUT, RW.get(r["c"], 4) / 2 + 2.5) + 1.0)))
    if underpasses:
        under_tree = STRtree([u for _, u in underpasses])
        for k, r in enumerate(pending):
            line = road_lines[k]
            for j in under_tree.query(line):
                if underpasses[int(j)][0] == k:
                    continue
                poly = underpasses[int(j)][1]
                r["span"] |= {i for i, q in enumerate(r["run"]) if poly.contains(Point(q[:2]))}

    def joined(k, j):
        """Do roads k and j meet: an end of one on the other, or a point of each at the same spot?
        Then they are a junction, never one over the other."""
        for a, b in ((k, j), (j, k)):
            run = pending[a]["run"]
            for q in (run[0], run[-1]):
                if road_lines[b].distance(Point(q[:2])) < 2.5:
                    return True
        if road_lines[k].crosses(road_lines[j]):
            x = road_lines[k].intersection(road_lines[j])
            x = x.geoms[0] if hasattr(x, "geoms") else x
            if x.geom_type == "Point" and all(any(math.dist(q[:2], (x.x, x.y)) < 0.7 for q in pending[i]["run"]) for i in (k, j)):
                return True
        return False

    def crossing(k, j, line):
        """Where road j crosses the stretch line of road k, well inside it: the point, or None."""
        if j == k or joined(k, j) or not road_lines[j].crosses(line):
            return None
        x = road_lines[j].intersection(line)
        x = x.geoms[0] if hasattr(x, "geoms") else x
        if x.geom_type != "Point":
            return None
        t = line.project(x)
        return x if 1 < t < line.length - 1 else None

    def span_line(r, st):
        a, b = max(0, st[0] - 1), min(len(r["run"]) - 1, st[-1] + 1)
        return a, b, LineString([r["run"][i][:2] for i in range(a, b + 1)])

    # 1. paths along a road's marked span ride on its deck
    decks = []
    for k, r in enumerate(pending):
        if r["c"] in PATHS or not r["span"]:
            continue
        for st in stretches(r["span"]):
            a, b, line = span_line(r, st)
            decks.append((k, line.buffer(RW.get(r["c"], 4) / 2 + (1.7 if r["c"] in KERBED_RD else 0.3) + 1.5, cap_style=2),
                          line, [r["z"][i] for i in range(a, b + 1)]))
    if decks:
        deck_tree = STRtree([d[1] for d in decks])
        for r in pending:
            if r["c"] not in NARROW:
                continue
            pl = LineString([q[:2] for q in r["run"]])
            for j in deck_tree.query(pl):
                k, poly, line, zs = decks[int(j)]
                if pl.length > 6 and pl.intersection(poly).length < 0.6 * min(pl.length, line.length) and road_lines[k].crosses(pl):
                    continue
                for i, q in enumerate(r["run"]):
                    if not poly.contains(Point(q[:2])):
                        continue
                    t = line.project(Point(q[:2])) / (line.length or 1) * (len(zs) - 1)
                    lo = min(len(zs) - 2, int(t))
                    f = t - lo
                    r["z"][i] = zs[lo] + (zs[lo + 1] - zs[lo]) * f
                    r["deck"].add(i)
                    r["span"].discard(i)

    # 2. which marked spans are real bridges
    for k, r in enumerate(pending):
        if not r["span"]:
            continue
        run, z, keep = r["run"], r["z"], set()
        for st in stretches(r["span"]):
            a, b, line = span_line(r, st)
            real = any(water_polys[int(j)].intersects(line) for j in water_tree.query(line)) \
                or any(rail_lines[int(j)].intersects(line) for j in rail_tree.query(line)) \
                or any(z[i] - elev(run[i][0], run[i][1]) > 2.5 for i in st)
            solid = real
            if not real:
                for j in road_tree.query(line):
                    j = int(j)
                    x = crossing(k, j, line)
                    if x is None or pending[j]["deck"]:
                        continue
                    i = min(range(len(pending[j]["run"])), key=lambda i: math.dist(pending[j]["run"][i][:2], (x.x, x.y)))
                    if z[st[0]] - pending[j]["z"][i] >= 3.5 or (r["c"] not in PATHS and pending[j]["c"] not in PATHS and line.length >= 20):
                        real = True
                        break
            if real:
                keep |= set(st)
            if real and solid:
                r.setdefault("solid", set()).update(st)
        r["span"] = keep

    # 2b. a path's span crossing a street at the street's level is a pedestrian crossing there,
    # not a bridge over it: the street wins and the span stops either side of it
    for k, r in enumerate(pending):
        if r["c"] not in PATHS or not r["span"]:
            continue
        run, z = r["run"], r["z"]
        for st in stretches(set(r["span"])):
            a, b, line = span_line(r, st)
            if line.length >= VIADUCT:
                continue
            for j in road_tree.query(line):
                j = int(j)
                if pending[j]["c"] in PATHS:
                    continue
                x = crossing(k, j, line)
                if x is None:
                    continue
                o = pending[j]
                i = min(range(len(o["run"])), key=lambda i: math.dist(o["run"][i][:2], (x.x, x.y)))
                if abs(z[min(range(len(run)), key=lambda i: math.dist(run[i][:2], (x.x, x.y)))] - o["z"][i]) < 1.0:
                    reach = RW.get(o["c"], 4) / 2 + 2.0
                    for i2 in st:
                        if math.dist(run[i2][:2], (x.x, x.y)) < reach + 2:
                            r["span"].discard(i2)

    # 2b'. and a path's span never runs across a street it meets at the street's level
    vehicle_idx = [j for j, o in enumerate(pending) if o["c"] not in PATHS]
    vehicle_tree = STRtree([road_lines[j] for j in vehicle_idx])
    for r in pending:
        if r["c"] not in PATHS or not r["span"]:
            continue
        for i in sorted(r["span"]):
            pt = Point(r["run"][i][:2])
            for jj in vehicle_tree.query(pt.buffer(8)):
                o = pending[vehicle_idx[int(jj)]]
                if road_lines[vehicle_idx[int(jj)]].distance(pt) > RW.get(o["c"], 4) / 2 + 1.5:
                    continue
                kk = min(range(len(o["run"])), key=lambda kk: math.dist(o["run"][kk][:2], r["run"][i][:2]))
                if abs(o["z"][kk] - r["z"][i]) < 1.0:
                    r["span"].discard(i)
                    break

    # 2c. a road marked as a bridge where it crosses under the railway (the data has it the wrong
    # way up) is no bridge: it passes under
    for k, r in enumerate(pending):
        if not r["span"] or not rail_lines:
            continue
        for st in stretches(set(r["span"])):
            a, b, line = span_line(r, st)
            for t in rail_tree.query(line):
                rl = rail_lines[int(t)]
                if not rl.crosses(line):
                    continue
                x = rl.intersection(line)
                x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point":
                    continue
                tp = rail_tracks[int(t)]["p"]
                kk = min(range(len(tp)), key=lambda kk: math.dist(tp[kk][:2], (x.x, x.y)))
                zr = r["z"][min(range(len(r["run"])), key=lambda i: math.dist(r["run"][i][:2], (x.x, x.y)))]
                if zr < tp[kk][2] - 1.0:
                    for i2 in st:
                        r["span"].discard(i2)

    def ease_roads(x, y, head, skip, down=True, reach=None, own=None):
        """Bring every road's points within DIP of (x, y) down to head (or up, with down False),
        easing in and out, so roads meeting there stay joined; skip: road indexes left alone (the
        bridge itself), and any road's points on a span or a deck are left alone too (except road
        own's, the one being carried over the canal), as is any road that is itself a bridge there."""
        n = 0
        for j in road_tree.query(Point(x, y).buffer(reach or DIP)):
            j = int(j)
            if j in skip:
                continue
            o = pending[j]
            if j != own and any(math.dist(o["run"][i][:2], (x, y)) < DIP + 10 for i in o["span"]):
                continue
            for i, q in enumerate(o["run"]):
                if j != own and (i in o["span"] or i in o["deck"]):
                    continue
                d = math.dist(q[:2], (x, y))
                if d >= DIP:
                    continue
                e = d / DIP
                e = e * e * (3 - 2 * e)
                want = head + (o["z"][i] - head) * e
                if (want < o["z"][i]) if down else (want > o["z"][i]):
                    o["z"][i] = want
                    n += 1
        return n

    # 2d. a road or path crossing the canal is a bridge over it, with headroom for a boat; unless
    # the canal is in a tunnel there (it passes under the road)
    canal_runs, gates, lock_levels = [], [], []
    if canal:
        for run in canal["runs"]:
            pts = run["p"]
            for i in range(len(pts) - 1):
                if (pts[i][6] | pts[i + 1][6]) & 1:
                    continue
                canal_runs.append((LineString([pts[i][:2], pts[i + 1][:2]]), run["lv"], max(pts[i][2], pts[i + 1][2])))
        gates = [Point(g) for lk in canal["locks"] for g in (lk["lo"], lk["hi"])]
        lock_levels = [(Point(lk["lo"]), Point(lk["hi"]), max(lk["zl"], lk["zh"])) for lk in canal["locks"]]
    canal_tree = STRtree([c[0] for c in canal_runs])
    canal_x = []
    for k, r in enumerate(pending):
        for j in canal_tree.query(road_lines[k]):
            seg, lv, half = canal_runs[int(j)]
            if not road_lines[k].crosses(seg):
                continue
            x = road_lines[k].intersection(seg)
            x = x.geoms[0] if hasattr(x, "geoms") else x
            if x.geom_type != "Point":
                continue
            if r["c"] in PATHS and any(g.distance(x) < LOCK_REACH for g in gates):
                continue
            for lo, hi, top in lock_levels:
                if lo.distance(x) < 25 or hi.distance(x) < 25:
                    lv = max(lv, top)
            canal_x.append((k, x, lv, half))
    road_x = [(x, lv) for k, x, lv, half in canal_x if pending[k]["c"] not in PATHS]
    for k, x, lv, half in canal_x:
        r, run = pending[k], pending[k]["run"]
        deck = lv + CANAL_HEAD + 0.6
        reach = half + 6.0
        beside = r["c"] in PATHS and any(x.distance(ox) < BESIDE for ox, _ in road_x)
        ease_roads(x.x, x.y, deck, set(), down=False, own=k)
        for i, q in enumerate(run):
            if math.dist(q[:2], (x.x, x.y)) < reach:
                if beside:
                    r["deck"].add(i)
                    r["span"].discard(i)
                else:
                    r["span"].add(i)
                    r.setdefault("solid", set()).add(i)

    # 3. what passes under a road's bridge passes under it
    for k, r in enumerate(pending):
        if not r["span"]:
            continue
        run, z = r["run"], r["z"]
        for st in stretches(r["span"]):
            a, b, line = span_line(r, st)
            solid = st[0] in r.get("solid", set()) or line.length >= 20
            if r["c"] in PATHS:
                solid = line.length >= VIADUCT
            if not solid:
                continue
            for j in road_tree.query(line):
                j = int(j)
                x = crossing(k, j, line)
                if x is None:
                    continue
                o = pending[j]
                if any(math.dist(o["run"][i][:2], (x.x, x.y)) < 10 for i in o["span"] | o["deck"]):
                    continue
                if o["c"] in PATHS and line.length < VIADUCT and st[0] not in r.get("solid", set()):
                    continue
                t = line.project(x) / (line.length or 1) * (b - a)
                lo = a + min(b - a - 1, int(t))
                f = t - (lo - a)
                deck = z[lo] + (z[lo + 1] - z[lo]) * f
                head = deck - (CLEAR_PATH if o["c"] in PATHS else CLEAR_ROAD)
                ease_roads(x.x, x.y, head, {k})
    # 3b. and under the railway's bridges and viaducts
    for track in rail_tracks:
        tp = track["p"]
        k = 0
        while k < len(tp):
            if tp[k][3] != 1:
                k += 1
                continue
            e = k
            while e + 1 < len(tp) and tp[e + 1][3] == 1:
                e += 1
            if e > k:
                seg = LineString([q[:2] for q in tp[k:e + 1]])
                for j in road_tree.query(seg):
                    j = int(j)
                    o = pending[j]
                    if not road_lines[j].crosses(seg):
                        continue
                    x = road_lines[j].intersection(seg)
                    x = x.geoms[0] if hasattr(x, "geoms") else x
                    if x.geom_type != "Point":
                        continue
                    if any(math.dist(o["run"][i][:2], (x.x, x.y)) < 10 for i in o["span"] | o["deck"]):
                        continue
                    kk = min(range(k, e + 1), key=lambda kk: math.dist(tp[kk][:2], (x.x, x.y)))
                    head = tp[kk][2] - 0.9 - (CLEAR_PATH if o["c"] in PATHS else CLEAR_ROAD)
                    ease_roads(x.x, x.y, head, set())
            k = e + 1

    # 4. a path through the water (the data has no bridge) is a footbridge: its points well
    # inside a pond or river are a span, just above the water
    for r in pending:
        if r["c"] not in PATHS:
            continue
        pl = LineString([q[:2] for q in r["run"]])
        for w in water_tree.query(pl):
            poly = water_polys[int(w)]
            if not poly.intersects(pl):
                continue
            near = poly.intersection(bm)
            ring = max(getattr(near, "geoms", [near]), key=lambda g: g.area if g.geom_type == "Polygon" else 0, default=None)
            if ring is None or ring.geom_type != "Polygon":
                continue
            coords = list(ring.exterior.coords)
            if len(coords) < 3:
                continue
            wz = min(elev(x, y) for x, y in coords[::max(1, len(coords) // 40)]) + 0.1
            for i, q in enumerate(r["run"]):
                pt = Point(q[:2])
                if poly.contains(pt) and poly.exterior.distance(pt) > 1.5 and i not in r["deck"]:
                    r["span"].add(i)
                    r["z"][i] = max(r["z"][i], wz + 0.8)
    return pending


def grow_marks(z, ground, span, deck, reach=3):
    """Run each span (and deck) out, by at most `reach` points, to where the road meets the ground
    as it is drawn, so the game's deck reaches the banks rather than stopping short with a step
    down. `ground` is the height of the drawn ground under each point, None off the grid."""
    n = len(z)

    def low(i):
        return ground[i] is not None and z[i] - ground[i] > 0.3
    for marks, other in ((span, deck), (deck, span)):
        for st in stretches(set(marks)):
            a, b = st[0], st[-1]
            for _ in range(reach):
                if a > 0 and a - 1 not in other and low(a - 1):
                    a -= 1
                    marks.add(a)
            for _ in range(reach):
                if b < n - 1 and b + 1 not in other and low(b + 1):
                    b += 1
                    marks.add(b)
    return span, deck


def follow_ground(z, ground, span, deck, tol=0.4):
    """The heights with every point that is not a span or a deck held within `tol` of the ground
    drawn under it. The tile's ground was cut for the old build's roads and bridges, and a road
    that wanders from it is buried or floats; only a bridge's deck is meant to leave it."""
    return [v if i in span or i in deck or ground[i] is None else min(max(v, ground[i] - tol), ground[i] + tol)
            for i, v in enumerate(z)]


def ease_bends(xy, z, ground, fixed, ends=(), tol=0.4, limit=0.2, rounds=60):
    """The heights with sharp changes of slope eased out, where the ground allows it. A road held
    to the drawn ground copies every dip and step the survey left in it, and the game's road reads
    those as kinks; each loose point moves towards the straight line between its neighbours, never
    more than `tol` from the ground, until no bend is sharper than `limit` (the checker's is 0.25).
    Points in `fixed` (bridges, decks, and the two ends, which neighbouring squares share) stay
    put. Points in `ends` are the last ones of a bridge's deck: they may come down towards the
    ground, so the deck reaches the bank on a slope instead of a step, but never rise or sink."""
    n = len(z)
    z = list(z)
    if n < 3:
        return z
    d = [math.dist(xy[i], xy[i + 1]) or 0.01 for i in range(n - 1)]
    bounds = {}
    for i in range(1, n - 1):
        if ground[i] is None:
            continue
        if i in ends:
            bounds[i] = (ground[i] - 0.25, z[i])
        elif i not in fixed:
            bounds[i] = (ground[i] - tol, ground[i] + tol)

    def bend(i):
        return abs((z[i + 1] - z[i]) / d[i] - (z[i] - z[i - 1]) / d[i - 1])
    for _ in range(rounds):
        sharp = {j for i in range(1, n - 1) if bend(i) > limit for j in (i - 1, i, i + 1)}
        moved = False
        for i, (lo, hi) in bounds.items():
            if i not in sharp:
                continue
            line = z[i - 1] + (z[i + 1] - z[i - 1]) * d[i - 1] / (d[i - 1] + d[i])
            new = min(max(z[i] + (line - z[i]) * 0.5, lo), hi)
            moved = moved or abs(new - z[i]) > 1e-4
            z[i] = new
        if not moved:
            break
    return z


def deck_ends(marks, reach=4):
    """The `reach` points at each end of every stretch of marked points."""
    out = set()
    for st in stretches(marks):
        out.update(st[:reach] + st[-reach:])
    return out


def drop_empty_spans(roads, ground, water, rails, reach=2.5):
    """Clear the span marks of a bridge with nothing under it, as the tile will draw it: no water,
    railway or road it does not join, and no drop of 2.5 m to the ground. A marked stretch that
    lost its crossing to the square's edge, or whose street the ground was never cut for, would
    otherwise be a deck over nothing; it lies on the ground instead. `roads` are `rd` records."""
    lines = [LineString([q[:2] for q in r["p"]]) for r in roads]
    tree = STRtree(lines)
    water_tree, rail_tree = STRtree(water), STRtree(rails)

    def joined(i, j):
        return any(lines[b].distance(Point(roads[a]["p"][e][:2])) < reach
                   for a, b in ((i, j), (j, i)) for e in (0, -1))
    dropped = 0
    for n, r in enumerate(roads):
        p = r["p"]
        k = 0
        while k < len(p):
            if len(p[k]) < 4 or p[k][3] != 1:
                k += 1
                continue
            e = k
            while e + 1 < len(p) and len(p[e + 1]) > 3 and p[e + 1][3] == 1:
                e += 1
            seg = LineString([q[:2] for q in p[max(0, k - 1):min(len(p) - 1, e + 1) + 1]])
            under = any(water[int(w)].intersects(seg) for w in water_tree.query(seg)) \
                or any(rails[int(t)].intersects(seg) for t in rail_tree.query(seg)) \
                or any(int(j) != n and lines[int(j)].crosses(seg) and not joined(n, int(j)) for j in tree.query(seg)) \
                or any(ground(q[0], q[1]) is not None and q[2] - ground(q[0], q[1]) > 2.5 for q in p[k:e + 1])
            if not under:
                for i in range(k, e + 1):
                    g = ground(p[i][0], p[i][1])
                    p[i] = [p[i][0], p[i][1], p[i][2] if g is None else round(min(max(p[i][2], g - 0.4), g + 0.4), 1)]
                dropped += 1
            k = e + 1
    return dropped
