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
CLEAR = 4.6     # the least headroom under a deck carrying a road over another
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
    a bridge in the data, or any way between CLEAR and DECK above the floor."""
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
                    if up >= CLEAR and (up <= DECK or n in o["span"]):
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
