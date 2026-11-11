"""The ends of bridges and tunnels in one square, as records of their own (`se`).

Which ends a structure has is decided once for the whole map, from the whole structure
(`structures.structure_ends`, in the city stage): so a bridge crossing a square's edge has one pair of
ends wherever the edge cuts it. Each square's writer lays its ways first and then settles each end
where the way's span now stops, keeping the kind the city gave it. The game reads them to know
where an abutment stands and where a deck lands (world.ts bridgeStructures, map.ts deckTop), and the
clash check reads them as the game does.

An end is [kind, x, y, z, half width, id, held]: kind `abutment` (on the bank), `joint` (running on into
another deck in the air), `open` (a span the data stops in the air, with nothing going on), `seam`
(cut by the square's edge, carrying on into the next square) or `portal` (a bored tunnel's mouth).
`held` is 1 where a flight of steps lands at an abutment: its treads are baked to their own heights, so
the deck and every other way there land at the flight's. On every other abutment it is 2: the deck
lands at its way's own height there, which the street or path beyond is drawn at, not on the
survey's grid (squares written before have it left off, and land on the grid).
"""
import math

MATCH = 8.0      # metres a way's span end may lie from where the city put its structure's end
MEET = 0.75      # metres from an end that another way's end shares its height
EASE = 5.0       # metres along a way over which a shared height is eased into its own
SEAM = 0.6       # metres from the square's edge that a span's end is the edge cutting it
HANG = 1.0       # metres a deck's last point may stand over its abutment before the abutment comes up to it
RAMP = 0.25      # the steepest a way meeting a raised abutment climbs to it


def _flag(q):
    return q[3] if len(q) > 3 else 0


def city_ends(profiles, ids):
    """The city's ends on the given edges, each once."""
    out = {}
    for i in ids:
        for e in (profiles.get(i) or {}).get("ends") or ():
            out[e[5]] = e
    return list(out.values())


def _span_ends(r):
    """(index of the end, index just on the span) for each end of each run of span points in a way."""
    p, out, i = r["p"], [], 0
    on = [_flag(q) == 1 for q in p]
    while i < len(p):
        if not on[i]:
            i += 1
            continue
        j = i
        while j + 1 < len(p) and on[j + 1]:
            j += 1
        out.append((max(0, i - 1), i))
        out.append((min(len(p) - 1, j + 1), j))
        i = j + 1
    return out


def settle(rd, city, sq):
    """The square's end records, with every way meeting an abutment at its height. `city` is the
    city's ends near the square, `sq` the square's box."""
    x0, y0, x1, y1 = sq
    inside = lambda x, y: x0 <= x < x1 and y0 <= y < y1
    on_edge = lambda x, y: min(abs(x - x0), abs(x - x1), abs(y - y0), abs(y - y1)) < SEAM
    decks = [(r, q) for r in rd for q in r["p"] if _flag(q) in (1, 2)]
    used, out = set(), []
    for r in rd:
        for end, inner in _span_ends(r):
            q = r["p"][end]
            if not inside(q[0], q[1]):
                continue
            near = min(((math.dist(q[:2], e[1:3]), e) for e in city if e[0] != "portal" and e[5] not in used),
                       default=(math.inf, None), key=lambda t: t[0])
            on_span = end == inner
            if on_span and on_edge(q[0], q[1]):
                kind, eid = "seam", None
            elif on_span and any(o is not r and math.dist(o2[:2], q[:2]) < 1.0 and abs(o2[2] - q[2]) < 1.0 for o, o2 in decks):
                kind, eid = "joint", None
            elif near[0] < MATCH:
                kind, eid = near[1][0], near[1][5]
                used.add(eid)
                # (a span the writer has run on to the end of its way, past where it touched down, is
                # still in the air there)
                if on_span and kind == "abutment":
                    kind = "open"
            else:
                kind, eid = ("open" if on_span else "abutment"), None
            if eid is None:
                from structures import end_id
                eid = end_id(kind, q[0], q[1])
            if kind in ("abutment", "open") and not on_span:
                deck = r["p"][inner][2]
                if deck - q[2] > max(HANG, math.dist(q[:2], r["p"][inner][:2])):
                    lift(rd, q, deck)
                    kind = "abutment"
            out.append([kind, round(q[0], 2), round(q[1], 2), round(q[2], 2), round(r.get("w", 2.0) / 2, 2), eid])
    # the tunnels' mouths, as the city put them
    out += [list(e) for e in city if e[0] == "portal" and inside(e[1], e[2])]
    for e in out:
        if e[0] == "abutment":
            share(rd, e)
            # (elsewhere the deck lands where its way is drawn: the street or path beyond is laid at
            # the way's own height there, and the survey's grid under it can stand a metre off it)
            if len(e) < 7:
                e.append(2)
    return out


def lift(rd, at, z):
    """A deck the city raised clear of what it crosses (the railway's headroom) stands higher than its
    abutment's ground: the abutment comes up level with it, and every way meeting it there climbs to
    it, a flight by its treads (baked again after) and a path or street eased up over its last
    metres, no steeper than RAMP."""
    x, y, z0 = at[0], at[1], at[2]
    for r in rd:
        if len(r["p"]) < 2:
            continue
        for first in (True, False):
            q = r["p"][0] if first else r["p"][-1]
            if _flag(q) or math.dist(q[:2], (x, y)) > MEET or abs(q[2] - z0) > 1.0:
                continue
            p = r["p"] if first else r["p"][::-1]
            dz = z - p[0][2]
            if r["c"] == "steps":
                p[0][2] = round(z, 2)
                r["_rebake"] = 1
                continue
            reach, s = max(EASE, abs(dz) / RAMP), 0.0
            for k, a in enumerate(p):
                if k:
                    s += math.dist(a[:2], p[k - 1][:2])
                if s >= reach or _flag(a):
                    break
                a[2] = round(a[2] + dz * (1 - s / reach), 2)
    for r in rd:
        for a in r["p"]:
            if not _flag(a) and math.dist(a[:2], (x, y)) < 0.05:
                a[2] = round(z, 2)


def share(rd, end):
    """Where a flight of steps lands at an abutment, every way that comes to it, off the bridge, takes
    the flight's end height, eased back into its own over EASE metres, and the end is held there.
    Elsewhere the end is left to settle (held at its way's own height)."""
    _, x, y, z = end[:4]
    meeting = []
    for r in rd:
        if len(r["p"]) < 2:
            continue
        for first in (True, False):
            q = r["p"][0] if first else r["p"][-1]
            # (one a metre or more off it passes by, under or over)
            if not _flag(q) and math.dist(q[:2], (x, y)) <= MEET and abs(q[2] - z) < 1.0:
                meeting.append((r, first))
    flights = [r["p"][0 if first else -1][2] for r, first in meeting if r["c"] == "steps"]
    if not flights:
        return
    z = min(flights, key=lambda h: abs(h - z))
    end[3] = round(z, 2)
    end.append(1)
    # (the bridge's own point there, wherever it lies along its way)
    for r in rd:
        for a in r["p"]:
            if not _flag(a) and math.dist(a[:2], (x, y)) < 0.05:
                a[2] = end[3]
    for r, first in meeting:
        if r["c"] == "steps":
            continue
        p = r["p"] if first else r["p"][::-1]
        dz, s = z - p[0][2], 0.0
        if abs(dz) < 0.01:
            continue
        for k, a in enumerate(p):
            if k:
                s += math.dist(a[:2], p[k - 1][:2])
            if s >= EASE or _flag(a):
                break
            a[2] = round(a[2] + dz * (1 - s / EASE), 2)
