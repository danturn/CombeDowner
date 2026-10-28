"""Tunnels you can walk through: the bored part of any road or path the map data flags as a tunnel.

Overture marks a stretch of a segment as a tunnel (road_flags is_tunnel, level -1). prep_map.py
carries its floor in a straight line between the road at either end. The ground over a tunnel is
just ground: the survey's, unbroken over the bore, with whatever is on it laid on it as anywhere
else. The bore is cut beneath it, from where the road meets the hill face (the ground a whole arch
over the floor) to where it comes out; the ends of the data's stretch outside that, out in the open
or in a cutting, stay roads (the terrain is cut down to them), and the game builds the bore as an
arched tube with a stone headwall at each portal (web/src/tunnels.ts). Short
underpasses with little ground over them never get deep enough and stay ordinary roads, and nor
does one under bridges: the survey keeps the decks of the ways crossing over it as ground, but a
deck is not cover (`rebore`). A lane or path crossing over a tunnel that the data does not call a
bridge is on the ground over its roof, which is cover, so the tunnel keeps its bore and they stay
on the ground.

A bore is as wide as the way it carries, as the game lays that way where it goes in (`bore_half`):
a road's carriageway with its pavements, a footway in a road tunnel staying a footway, or a little
floor beside a carriageway with none; a path's width with room to pass at each side. The width
follows the way's from one portal to the other, and everything that knows where a bore is (the
game, the writer's clearances, the clash check) reads it from the tunnel's own `hw` (`half_at`).
A bore is as high as what it carries needs (`crown`, as web/src/map.ts boreCrown draws it): a lorry's
headroom under a road, a train's under a railway, a walker's under a path. It starts where the hill
stands FACE_COVER over that arch, so the headwall is a modest band of stone over a path's low arch,
not the same height of wall as a road's with a little arch at its foot.
"""
import math

from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

HALF = 2.4      # half the floor width of a tunnel whose way's width isn't known
ROAD_EDGE = 0.5  # metres of floor each side of a carriageway that has no pavement
PATH_EDGE = 1.0  # metres of floor each side of a path, to pass someone coming the other way
FACE_PAST = 4.0  # metres a headwall reaches past each side of its bore (web/src/tunnels.ts)
CROWN = 5.2     # floor to the top of a road's bore
COVER = 1.0     # ground over a road's arch somewhere along it for there to be a tunnel at all
FACE_COVER = 0.8  # hill over the arch where the bore starts: the headwall stands 1.2 m over the arch
                  # and 0.4 m over the hill at its face (web/src/tunnels.ts), so it just covers it
MOTOR = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service"}
RAIL = {"rail", "railway", "standard_gauge", "narrow_gauge", "light_rail", "subway", "tram"}
MIN_BORE = 15   # metres: anything shorter stays a road
CUT = 3.0       # the cutting's floor reaches this far past each tunnel wall, as wide as the portal
INTO = 5.0      # the cutting carries on this far into the bore, behind the portal, so the
                # terrain's slope up onto the hill falls inside the tube, where the game hides it;
                # further in, the ground over the bore is left whole (prep_map.py)
OVER = 5.0      # metres across from a tunnel's centre line that a way above it counts as passing over
ABOVE = 2.5     # a bridge this far over the floor passes over it rather than meeting it: less than
                # a deck's headroom, as a floor carried straight under a junction can sit metres high
FILL = 1.0      # ground between two decks no more than this above them is the junction's own fill


def crown(c):
    """Floor to the top of the bore of a way of class c (web/src/map.ts boreCrown)."""
    if c.removesuffix("_link") in MOTOR: return CROWN
    return 6.0 if c in RAIL else 3.6


def bores(run, z, ranges, elev, c, decks=()):
    """Index ranges [i0, i1] of run (points [x, y, t]) that are bored: within a tunnel stretch with
    at least CROWN + COVER of hill over the floor z somewhere (and enough for the face of a way of
    class c), from the first point where the ground stands its arch and FACE_COVER over the floor
    (the hill face) to the last. `decks` are the points with
    another way's deck over them, which is not hill (`decked`). Stretches that meet end to end (the
    data's tunnel split where a way joins over it) are one tunnel."""
    out = []
    for inside in _joined(run, ranges):
        on_deck = decked(run, inside, decks, elev)
        hill = [i for i in inside if i not in on_deck]
        start = crown(c) + FACE_COVER
        if not any(elev(*run[i][:2]) - z[i] >= max(CROWN + COVER, start) for i in hill):
            continue
        face = [i for i in hill if elev(*run[i][:2]) - z[i] >= start]
        i0, i1 = face[0], face[-1]
        if math.dist(run[i0][:2], run[i1][:2]) >= MIN_BORE:
            out.append((i0, i1))
    return out


def faces(run, z, bored, elev, c):
    """For each bored range, where its two portals truly stand: the run is a point every 4 m, so on
    a steep hill face the first point with the hill high enough over it can be metres into the
    hill, under a tall headwall. Each end is moved out towards the point before it, to where the
    hill stands just its arch and FACE_COVER over the floor there (or left where it is). Gives
    [(start, end)], each None or (x, y, floor)."""
    start = crown(c) + FACE_COVER
    out = []
    for i0, i1 in bored:
        ends = []
        for i, j in ((i0, i0 - 1), (i1, i1 + 1)):
            if not 0 <= j < len(run):
                ends.append(None)
                continue
            a, b, za, zb = run[i], run[j], z[i], z[j]
            def over(f):
                return elev(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f) - (za + (zb - za) * f)
            if over(1.0) >= start:
                ends.append(None)
                continue
            lo, hi = 0.0, 1.0       # (the hill is high enough at lo, not at hi)
            for _ in range(8):
                f = (lo + hi) / 2
                lo, hi = (f, hi) if over(f) >= start else (lo, f)
            ends.append(None if lo < 0.05 else (a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo, za + (zb - za) * lo))
        out.append(tuple(ends))
    return out


def _joined(run, ranges):
    """The run's points in each tunnel stretch (as index lists), stretches that touch made one."""
    groups = []
    for a, b in sorted(ranges):
        inside = [i for i, (_, _, t) in enumerate(run) if a <= t <= b]
        if not inside:
            continue
        if groups and inside[0] <= groups[-1][-1] + 1:
            groups[-1] = sorted(set(groups[-1]) | set(inside))
        else:
            groups.append(inside)
    return groups


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
    taken as decks rather than hill. An underpass under bridges stays a road in a cutting; a tunnel
    with ground over it keeps its bore, however near its roof the ways crossing it run."""
    for k, decks in decks_over(pending).items():
        r = pending[k]
        r["bored"] = bores(r["run"], r["z"], r["tunnel_ranges"], elev, r["c"], decks)


def decks_over(pending):
    """{run index: the points of its tunnel stretches with a bridge in the data passing over them}.
    Only the data's bridges count: a way crossing a tunnel a few metres over its floor is just as
    often on the ground over a shallow roof, and digging that out would open the tunnel up."""
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
                    if up >= ABOVE and n in o["span"]:
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


def bore_half(w, pv, path):
    """Half a bore's inside width for a way `w` wide with pavements `pv` wide (0 for none)."""
    return w / 2 + (PATH_EDGE if path else pv if pv > 0 else ROAD_EDGE)


def half_at(t, k):
    """Half the bore's width at the tunnel's point k."""
    hw = t.get("hw")
    return hw[k] if hw and k < len(hw) else HALF


def widen(t, ends):
    """Set the tunnel's `hw` (and `pv` where it has pavements) at each point, from (half width,
    pavement) at its first and last points, changing evenly along it."""
    p = t["p"]
    along = [0.0]
    for a, b in zip(p, p[1:]):
        along.append(along[-1] + math.dist(a[:2], b[:2]))
    total = along[-1] or 1.0
    (h0, v0), (h1, v1) = ends
    t["hw"] = [round(h0 + (h1 - h0) * s / total, 2) for s in along]
    if v0 > 0 or v1 > 0:
        t["pv"] = [round(v0 + (v1 - v0) * s / total, 2) for s in along]
    else:
        t.pop("pv", None)


def outline(t, extra=0.0):
    """The ground a bore takes, its walls `extra` further out each side, square at its ends."""
    from shapely.geometry import Polygon
    p, n = t["p"], len(t["p"])
    left, right = [], []
    for k in range(n):
        a, b = p[max(0, k - 1)], p[min(n - 1, k + 1)]
        l = math.dist(a[:2], b[:2]) or 1.0
        nx, ny = -(b[1] - a[1]) / l, (b[0] - a[0]) / l
        h = half_at(t, k) + extra
        left.append((p[k][0] + nx * h, p[k][1] + ny * h))
        right.append((p[k][0] - nx * h, p[k][1] - ny * h))
    return Polygon(left + right[::-1]).buffer(0)
