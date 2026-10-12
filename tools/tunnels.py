"""Tunnels you can walk through: the bored part of any road or path the map data flags as a tunnel.

Overture marks a stretch of a segment as a tunnel (road_flags is_tunnel, level -1). prep_map.py
carries its floor in a straight line between the ground at either end. Here each tunnel stretch is
split where the hill gets deep enough over it to need a bore: the ends, out in the open or in a
cutting, stay roads (the terrain is cut down to them), and the bored middle becomes a tunnel the
game builds as an arched tube with a stone portal at each end (web/src/tunnels.ts). Short
underpasses with little ground over them never get deep enough and stay ordinary roads.

The game's cross-section (web/src/map.ts, TUNNEL) is a 4.8 m wide floor with an arch 5.2 m high,
about the size of the old single-track railway tunnels on the Two Tunnels Greenway.
"""
import math

HALF = 2.4      # half the floor width
CROWN = 5.2     # floor to the top of the arch
COVER = 1.0     # ground over the arch where the bore starts
MIN_BORE = 15   # metres: anything shorter stays a road
CUT = 3.0       # the cutting's floor reaches this far past each tunnel wall, as wide as the portal
INTO = 5.0      # the cutting carries on this far into the bore, behind the portal, so the
                # terrain's slope up onto the hill falls inside the tube, where the game hides it


def bores(run, z, ranges, elev):
    """Index ranges [i0, i1] of run (points [x, y, t]) that are bored: within a tunnel stretch and
    with at least CROWN + COVER of ground over the floor z, from the first such point to the last."""
    out = []
    for a, b in ranges:
        deep = [i for i, (x, y, t) in enumerate(run) if a <= t <= b and elev(x, y) - z[i] >= CROWN + COVER]
        if not deep: continue
        i0, i1 = deep[0], deep[-1]
        if math.dist(run[i0][:2], run[i1][:2]) >= MIN_BORE:
            out.append((i0, i1))
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
