"""How wide the streets really are, from OpenStreetMap's tags and the Environment Agency lidar.

The map data gives a street only a centre line and a kind (a main road, a residential street, a
lane), and the game draws every street of a kind the same width, with a 1.7 m pavement each side.
Many of Bath's streets are narrower than that: lanes squeezed between garden walls, a main road
like Ralph Allen Drive between estate walls, and plenty have a pavement on one side or none.
Drawn too wide, the street runs over the walls beside it, and the walls are lost (a wall found
standing on a street is taken for a parked car, and the gaps cut where streets cross walls take
out the rest). So each street's width is worked out from everything we have, in this order:

- OpenStreetMap, where the street is tagged (tools/osm.py roads): its width, or its number of
  lanes (about 3.25 m each), and which sides have a pavement ("sidewalk"). A street whose
  pavements are mapped as footpaths of their own has none drawn on it (the paths are drawn).
- The lidar: from each point along the street, look out sideways each way, every half metre up
  to 12 m, for the first thing standing half a metre or more above the ground: a wall, a hedge, a
  bank, a building. A parked car (car-high, a car's width across, with clear ground beyond) is
  looked past, and under a tree's crown the lidar sees only the crown, so that side isn't known.
  Each side's distance is the middle reading along about 40 m of street, so a gate pier doesn't
  narrow it. Where the street and its pavement on a side reach further than that, the
  carriageway narrows first, to an ordinary street's width; then that side's pavement, to 1 m and
  then none (as on a country lane); then the carriageway again, but never below its kind's
  narrowest (two cars passing on a main road, a car and a parked one where there's a pavement,
  one car on a lane).

A street is never made wider than its kind, and it changes width only in stretches of 30 m or
more. Each street (or piece of one) that differs from its kind carries "w", its carriageway's
width, and "pv", its pavements' widths [left, right] looking along its points.
"""
import numpy as np

REACH, STEP = 12.0, 0.5     # metres looked out from the centre line, and how often
STANDS = 0.5                # metres above the ground that counts as something in the way
CROWN = 2.5                 # anything taller, not in a building, is taken for a tree's crown
SPARE = 0.5                # metres kept clear between a pavement (or the road) and the wall (walls are cut 0.4 m into it)
NARROWEST = {"trunk": 6.0, "primary": 5.5, "secondary": 5.5, "tertiary": 5.0}   # else 3.5
SOFT = {"trunk": 7.0, "primary": 6.5, "secondary": 6.0, "tertiary": 5.5}        # an ordinary street's width: else 5
PAVE = 1.7
CAR_ACROSS, CAR_HIGH = (1.0, 3.2), (0.9, 2.3)    # metres: what a car looks like, side on, end on or parked at an angle


def _side_reach(lidar, pts, inside_building):
    """For each row of points looking out sideways, the distance to the first thing in the way
    (None: nothing in reach, or hidden under a tree)."""
    n, k = pts.shape[:2]
    surf, ground = lidar.surface_and_ground(pts[..., 0].ravel(), pts[..., 1].ravel())
    nd = (surf - ground).reshape(n, k)
    offs = np.arange(1, k + 1) * STEP
    out = []
    for i in range(n):
        hit, j = None, 0
        while j < k:
            h = nd[i, j]
            if np.isnan(h) or h < STANDS: j += 1; continue
            if h > CROWN and not inside_building(*pts[i, j]): break      # under a tree: unknown
            # a car (parked at the kerb, or on a drive) is looked past: something car-high and a
            # car's width across, with clear ground beyond it
            e = j
            while e < k and not np.isnan(nd[i, e]) and nd[i, e] >= STANDS: e += 1
            if CAR_ACROSS[0] <= (e - j) * STEP <= CAR_ACROSS[1] and CAR_HIGH[0] <= np.nanmax(nd[i, j:e]) <= CAR_HIGH[1] and e < k:
                j = e; continue
            hit = float(offs[j]); break
        out.append(hit)
    return out


def _num(v):
    try: return float(str(v).split()[0].replace("m", ""))
    except (ValueError, IndexError): return None


def osm_tags(osm_roads):
    """A finder for the OpenStreetMap tags of the street along (p, direction): (width, pavements
    [left, right] looking that way, or None where untagged), from the nearest tagged highway
    within 6 m that runs the same way."""
    import shapely
    if not osm_roads: return lambda p, t: (None, None)
    lines = [(g, props) for g, props in osm_roads if g.geom_type == "LineString" and g.length > 0]
    tree = shapely.STRtree([g for g, _ in lines])

    def find(p, t):
        pt = shapely.Point(*p)
        best = None
        for k in tree.query(pt.buffer(6)):
            g, props = lines[int(k)]
            d = g.distance(pt)
            if d > 6 or (best and d >= best[0]): continue
            s = g.project(pt)
            a, b = g.interpolate(max(0, s - 1)), g.interpolate(min(g.length, s + 1))
            u = np.array([b.x - a.x, b.y - a.y]); u /= (np.linalg.norm(u) or 1)
            dot = float(u @ t)
            if abs(dot) < 0.8: continue          # a street crossing this one
            best = (d, props, dot > 0)
        if best is None: return None, None
        _, props, same = best
        w = _num(props.get("width")) or _num(props.get("est_width"))
        if w is None and _num(props.get("lanes")): w = 3.25 * _num(props["lanes"])
        sw = props.get("sidewalk:both") or props.get("sidewalk")
        side = {"both": [1, 1], "left": [1, 0], "right": [0, 1], "no": [0, 0], "none": [0, 0], "separate": [0, 0], "yes": [1, 1]}.get(sw)
        left, right = props.get("sidewalk:left"), props.get("sidewalk:right")
        if left or right:
            side = side or [1, 1]
            if left: side[0] = 0 if left in ("no", "separate") else 1
            if right: side[1] = 0 if right in ("no", "separate") else 1
        if side and not same: side = side[::-1]
        return w, side
    return find


def measure(lidar, roads, RW, kerbed, inside_building, osm_roads=None):
    """Roads with the narrowed ones cut into pieces that each carry "w" (the carriageway's width)
    and "pv" (its pavements' widths, [left, right])."""
    out, narrowed = [], 0
    offs = np.arange(1, int(REACH / STEP) + 1) * STEP
    tags = osm_tags(osm_roads)
    for r in roads:
        pts = r["p"]
        if r["c"] not in RW or r["c"] not in NARROWEST and r["c"] not in kerbed or r.get("w") \
           or len(pts) < 2 or any(len(q) > 3 for q in pts):      # (a street on a bridge keeps its deck)
            out.append(r); continue
        p = np.array([q[:2] for q in pts], float)
        a, b = p[np.maximum(np.arange(len(p)) - 1, 0)], p[np.minimum(np.arange(len(p)) + 1, len(p) - 1)]
        t = b - a
        t /= np.maximum(np.linalg.norm(t, axis=1), 1e-6)[:, None]
        nrm = np.stack([-t[:, 1], t[:, 0]], 1)        # to the left
        sides = [_side_reach(lidar, p[:, None, :] + s * offs[None, :, None] * nrm[:, None, :], inside_building)
                 for s in (1, -1)] if lidar is not None else [[None] * len(p)] * 2
        w0, pave0 = RW[r["c"]], (PAVE if r["c"] in kerbed else 0.0)
        soft, hard = SOFT.get(r["c"], 5.0), NARROWEST.get(r["c"], 3.5)
        fits = []
        for i in range(len(p)):
            ow, oside = tags(p[i], t[i])
            w = min(w0, max(hard, ow)) if ow else w0
            pv = [pave0 * oside[0], pave0 * oside[1]] if oside else [pave0, pave0]
            room = []
            for s in sides:
                near = [v for v in s[max(0, i - 6):i + 7] if v is not None]
                room.append(float(np.median(near)) - SPARE if len(near) >= 3 else None)
            over = lambda: any(rm is not None and w / 2 + pv[k] > rm + 1e-6 for k, rm in enumerate(room))
            if over():
                w = max(min(w, soft), min(w, *(2 * (rm - pv[k]) for k, rm in enumerate(room) if rm is not None)))
                for k, rm in enumerate(room):
                    if rm is not None and w / 2 + pv[k] > rm:
                        # a pavement OpenStreetMap says is there stays, at least a metre wide
                        pv[k] = min(pv[k], 1.0) if rm - w / 2 >= 1.0 or (oside and oside[k] and pv[k]) else 0.0
                # (a street left with a pavement is a street, not a lane: room for a car and a parked one)
                w = max(hard if not any(pv) else max(hard, 4.5), min(w, *(2 * (rm - pv[k]) for k, rm in enumerate(room) if rm is not None)))
            fits.append((float(round(w * 2) / 2), round(pv[0], 1), round(pv[1], 1)))
        # a stretch shorter than 30 m takes the width of the street before it (or after, at the
        # start), so a street doesn't change width every few metres
        along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
        while True:
            runs, start = [], 0
            for i in range(1, len(fits) + 1):
                if i == len(fits) or fits[i] != fits[start]: runs.append((start, i)); start = i
            if len(runs) < 2: break
            short = [k for k, (a_, b_) in enumerate(runs) if along[min(b_, len(p) - 1)] - along[a_] < 30]
            if not short: break
            k = min(short, key=lambda k: along[min(runs[k][1], len(p) - 1)] - along[runs[k][0]])
            to = fits[runs[k - 1][0]] if k else fits[runs[1][0]]
            for i in range(*runs[k]): fits[i] = to
        base = (float(w0), pave0, pave0)
        if all(f == base for f in fits):
            out.append(r); continue
        narrowed += 1
        start = 0
        for i in range(1, len(pts) + 1):
            if i == len(pts) or fits[i] != fits[start]:
                piece = pts[max(0, start - 1):i]      # each piece starts where the one before ended
                w, pl, pr = fits[start]
                extra = {} if fits[start] == base else dict(w=w, pv=[pl, pr])
                if len(piece) > 1: out.append(dict(r, p=piece, **extra))
                start = i
    return out, narrowed
