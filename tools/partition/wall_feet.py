"""Walls' feet settled on the ground as it is finally drawn, once a square is written.

The game stands a wall, fence or hedge's foot at each of its points a little under the ground drawn
there (world.ts barrierRun) and runs it straight to the next, so where the drawn ground dips between
two points (carved to meet a pavement, a path or a flight, let down under a face's edge) the sky
showed under the wall. The writer laid its points on the survey's grid (`walls_follow_the_ground`);
here, with the sheet (`gs`) and the faces (`sf`) settled, a point is put in wherever the foot would
stand off the ground as drawn, at the height the wall's top already runs through there, so the wall
looks as it did and only its foot follows the ground down. The drawn ground is the game's own
triangulation (tools/sheet_cdt.mjs, through tools/check_more.py, which measures the same thing for
rule 44).
"""
import json

import numpy as np

FOOT_UNDER = 0.1     # world.ts: a wall's foot stands this far under the drawn ground at its points
FOOT_DEEP = 0.4      # world.ts: and at least this far under its own point's height
FOOT_AIM = 0.03      # metres the foot may stand over the ground between points (rule 44 counts 0.05)
SIDE = 0.12          # metres either side of a wall's line its faces stand (about half the thickest wall)
SAMPLE = 0.25        # metres between the places the foot is measured along a stretch
SHORTEST = 0.3       # metres: no piece of a stretch is cut shorter than this
LOWER_MOST = 0.6     # metres a point is ever let down to bring its foot to what is drawn under it
OFF_GRID = 0.33      # metres a point may stand off the survey's grid (tools/check_map.py: a wall off its ground)


def _drawn(m, path):
    """(bare, top): the open ground as the game draws it, and the height of whatever is drawn on top
    (a face's surface, else the ground), for many points at once."""
    import check_more as cm
    sheet = cm.Sheet(m)
    if not sheet.ok:
        return None
    D, _ = cm.drawn_terrain(m, sheet, faces=False)
    sink = cm.gsheet.read(m["gs"], m["t"])[1] - D
    land = cm.cdt_land(m, path, sink)
    bare = land.ground
    return bare, (lambda x, y: sheet.top(x, y, bare)[0])


def bake(path):
    """Put points into the walls of the square written at `path` where their feet would stand off the
    ground as drawn, and write it back. Returns how many points went in."""
    m = json.load(open(path))
    br = m.get("br") or []
    if not br or not m.get("gs") or not m.get("sf") or "t" not in m:
        return 0
    got = _drawn(m, path)
    if got is None:
        return 0
    bare, top = got
    stretches = []      # (wall, index of its first point, sample positions along, xy of each side's samples)
    xs, ys = [], []
    for w, b in enumerate(br):
        p = b["p"]
        if len(p) < 2 or any(len(q) < 3 for q in p):
            continue
        for i, (a, q) in enumerate(zip(p, p[1:])):
            L = float(np.hypot(q[0] - a[0], q[1] - a[1]))
            if L < 2 * SHORTEST:
                continue
            n = max(2, int(np.ceil(L / SAMPLE)))
            t = np.linspace(0.0, 1.0, n + 1)
            ux, uy = (q[0] - a[0]) / L, (q[1] - a[1]) / L
            cx, cy = a[0] + (q[0] - a[0]) * t, a[1] + (q[1] - a[1]) * t
            first = len(xs)
            for s in (1, -1):
                xs.append(cx - uy * SIDE * s)
                ys.append(cy + ux * SIDE * s)
            stretches.append((w, i, t, L, first))
    if not stretches:
        return 0
    X, Y = np.concatenate(xs), np.concatenate(ys)
    G, U = bare(X, Y), top(X, Y)
    offsets = np.cumsum([0] + [len(x) for x in xs])

    def under_of(k, foot):
        g, u = G[offsets[k]:offsets[k + 1]], U[offsets[k]:offsets[k + 1]]
        # (on a face the face is what is drawn, not the ground carved under it; one high overhead, a
        # deck, is not what the wall stands on)
        return np.where(u <= foot + 1.0, u, g)

    # A point standing on a face lower than the ground carved under it (a hedge along a path cut into
    # the bank) has its foot held at that ground: it comes down to the face, by as much as LOWER_MOST.
    import check_more as cm
    grid = cm.terrain(m["t"])
    floor = lambda x, y, z: max(z - LOWER_MOST, float(grid(x, y)) - OFF_GRID)
    lower = {}
    for w, i, t, L, first in stretches:
        p = br[w]["p"]
        for end, at in ((0, i), (-1, i + 1)):
            z = p[at][2]
            for k in (first, first + 1):
                g, u = G[offsets[k]:offsets[k + 1]][end], U[offsets[k]:offsets[k + 1]][end]
                foot = min(z - FOOT_DEEP, g - FOOT_UNDER)
                under = u if u <= foot + 1.0 else g
                # (only a point's own height can bring its foot down: the ground's limit is the game's)
                if foot - under > FOOT_AIM and g - FOOT_UNDER > z - FOOT_DEEP:
                    want = max(under + FOOT_DEEP - FOOT_AIM, floor(p[at][0], p[at][1], z))
                    if want < z:
                        lower[(w, at)] = min(lower.get((w, at), z), want)
    for (w, at), z in lower.items():
        q = list(br[w]["p"][at])
        q[2] = round(z, 2)
        br[w] = dict(br[w], p=[q if k == at else r for k, r in enumerate(br[w]["p"])])
    added = {}
    for w, i, t, L, first in stretches:
        a, q = br[w]["p"][i], br[w]["p"][i + 1]
        zs = a[2] + (q[2] - a[2]) * t
        sides = []
        for k in (first, first + 1):
            g = G[offsets[k]:offsets[k + 1]]
            foot = np.minimum(zs - FOOT_DEEP, g - FOOT_UNDER)
            sides.append((foot, under_of(k, foot)))
        keep = set()

        def split(i0, i1):
            if i1 - i0 < 2:
                return
            worst, at = FOOT_AIM, None
            for foot, under in sides:
                lin = foot[i0] + (foot[i1] - foot[i0]) * (t[i0 + 1:i1] - t[i0]) / (t[i1] - t[i0])
                gap = lin - under[i0 + 1:i1]
                ok = ((t[i0 + 1:i1] - t[i0]) * L >= SHORTEST) & ((t[i1] - t[i0 + 1:i1]) * L >= SHORTEST)
                gap = np.where(ok, gap, -np.inf)
                k = int(np.argmax(gap))
                if gap[k] > worst:
                    worst, at = float(gap[k]), i0 + 1 + k
            if at is not None:
                keep.add(at)
                split(i0, at)
                split(at, i1)
        split(0, len(t) - 1)
        if keep:
            # (the new point's height brings its foot down to what is drawn there, as LOWER_MOST allows)
            def z_at(k):
                need = min(float(under[k]) for _, under in sides) + FOOT_DEEP - FOOT_AIM
                x, y = a[0] + (q[0] - a[0]) * t[k], a[1] + (q[1] - a[1]) * t[k]
                # (and no further over the survey's grid than a point may stand)
                return round(min(float(zs[k]), max(need, floor(x, y, float(zs[k]))), float(grid(x, y)) + OFF_GRID), 2)
            added[(w, i)] = [[round(a[0] + (q[0] - a[0]) * t[k], 2), round(a[1] + (q[1] - a[1]) * t[k], 2), z_at(k)]
                             for k in sorted(keep)]
    if not added and not lower:
        return 0
    for w in sorted({w for w, _ in added}):
        p = br[w]["p"]
        out = [p[0]]
        for i in range(len(p) - 1):
            out += added.get((w, i), [])
            out.append(p[i + 1])
        br[w] = dict(br[w], p=out)
    m["br"] = br
    open(path, "w").write(json.dumps(m, separators=(",", ":")))
    return sum(len(v) for v in added.values()) + len(lower)
