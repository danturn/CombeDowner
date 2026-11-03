"""Guessed fences and hedges between gardens, drawn straight where they only wander.

Without registered parcels the plots follow the blocks' division lines and the backs of the
gardens, so a boundary between gardens often steps sideways by a metre or two where one garden's
back meets the next one's. The old build straightened its guessed boundaries once its runs were
joined up (`_straighten` in `tools/prep_map.py`), and this is the same rule on the writer's runs: a
stretch that strays no more than WAVE metres from the straight line between two of its corners is
drawn straight between them, so long as that line runs clear of streets, houses, gateways and every
other wall and fence. A guessed fence that ends on it part way along slides along to meet it; one
that runs on through it, or a real wall, holds it where they meet. Neither may come to run alongside
or across another wall or fence more than it did before. Only what nothing was seen along moves.

Build-time only: nothing here is decided over the network.
"""
import math

from shapely.geometry import LineString, MultiPoint, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree

WAVE = 3.0          # metres a guessed boundary may stray from a straight line and still be drawn straight
JOIN = 0.3          # metres: an end this near a run is on it
SAME_WAY = math.cos(math.radians(35))   # runs meeting end to end this nearly in line are one run
SPACING = 2.5       # metres between the points of a straightened run
CLASH = 1.3         # metres: a run this near another lies alongside it
CLASH_SLACK = 0.5   # metres more of that a straightened run may have than it had


def _dir(pts, end):
    a, b = (pts[1], pts[0]) if end == 0 else (pts[-2], pts[-1])
    L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
    return (b[0] - a[0]) / L, (b[1] - a[1]) / L


def join_runs(runs, movable):
    """Runs of one guessed kind meeting end to end and carrying on the same way, joined into one, so
    a boundary the writer cut at every corner of the plots is straightened whole. `movable(run)` says
    which runs may be joined; the rest are passed through untouched."""
    keep = [r for r in runs if not movable(r)]
    todo = [dict(r, p=[list(q) for q in r["p"]]) for r in runs if movable(r)]
    joined = True
    while joined and len(todo) > 1:
        joined = False
        ends = STRtree([Point(r["p"][e][:2]) for r in todo for e in (0, -1)])
        used = set()
        for i, r in enumerate(todo):
            if i in used:
                continue
            for e in (0, -1):
                here = Point(r["p"][e][:2])
                hit = None
                for k in ends.query(here.buffer(JOIN)):
                    j, f = int(k) // 2, (0, -1)[int(k) % 2]
                    o = todo[j]
                    if j == i or j in used or o["c"] != r["c"] or o.get("h") != r.get("h"):
                        continue
                    if Point(o["p"][f][:2]).distance(here) > JOIN:
                        continue
                    (ux, uy), (vx, vy) = _dir(r["p"], e), _dir(o["p"], f)
                    if -(ux * vx + uy * vy) < SAME_WAY:
                        continue
                    hit = (j, f)
                    break
                if hit is None:
                    continue
                j, f = hit
                a_ = r["p"] if e == -1 else r["p"][::-1]
                c_ = todo[j]["p"] if f == 0 else todo[j]["p"][::-1]
                r["p"] = a_ + c_[1:]
                used.add(j)
                joined = True
                break
        todo = [r for k, r in enumerate(todo) if k not in used]
    return keep + todo


def straighten(runs, movable, ground, hard, houses):
    """The runs with the guessed ones' wavy stretches drawn straight. `movable(run)` says which are
    guesses; `hard` is a list of shapes no straightened line may cross (the streets, the gateways),
    `houses` the footprints. `ground(x, y)` gives a new point's height, or None off the grid.
    Returns (runs, corners taken out)."""
    runs = join_runs(runs, movable)
    if len(runs) < 2:
        return runs, 0
    walls = [h for h in houses if not h.is_empty]
    htree = STRtree(walls) if walls else None
    blocks = list(hard) + [w.buffer(-0.2) for w in walls]
    blocks = [b for b in blocks if not b.is_empty]
    btree = STRtree(blocks) if blocks else None
    line_of = lambda r: LineString([q[:2] for q in r["p"]])
    order = [k for k, r in enumerate(runs) if movable(r) and len(r["p"]) > 1] + \
            [k for k, r in enumerate(runs) if not (movable(r) and len(r["p"]) > 1) and len(r["p"]) > 1]
    n_move = sum(1 for r in runs if movable(r) and len(r["p"]) > 1)
    allines = [line_of(runs[k]) for k in order]
    lt = STRtree(allines)

    def z_at(x, y, like):
        z = ground(x, y)
        return round(like if z is None else z, 1)

    def dense(pts, like):
        ln = LineString([q[:2] for q in pts])
        n = max(1, int(math.ceil(ln.length / SPACING)))
        qs = [ln.interpolate(i / n, normalized=True) for i in range(n + 1)]
        return [[round(q.x, 1), round(q.y, 1), z_at(q.x, q.y, like)] for q in qs]

    def end_near(j, q, d):
        if j >= n_move:
            return None
        p = runs[order[j]]["p"]
        for e in (0, -1):
            if math.hypot(p[e][0] - q[0], p[e][1] - q[1]) < d:
                return e
        return None

    def clash(ln, r, moved):
        ends = [Point(ln.coords[0]), Point(ln.coords[-1])]
        total = 0.0
        for j in lt.query(ln.buffer(CLASH)):
            j = int(j)
            if j == r:
                continue
            o = moved.get(j, allines[j])
            near = ln.intersection(o.buffer(CLASH))
            if near.is_empty:
                continue
            meet = [p for p in ends + [Point(o.coords[0]), Point(o.coords[-1])]
                    if o.distance(p) < 0.4 and ln.distance(p) < 0.4]
            if meet:
                near = near.difference(unary_union([p.buffer(0.8) for p in meet]))
            total += near.length
        for h in (htree.query(ln.buffer(0.8)) if htree is not None else ()):
            near = ln.intersection(walls[int(h)].exterior.buffer(0.8)).difference(
                unary_union([e.buffer(1.5) for e in ends]))
            total += near.length
        return total

    taken = 0
    for k in range(n_move):
        r = runs[order[k]]
        ln = allines[k]
        pts = [list(q) for q in ln.simplify(0.1).coords]
        if len(pts) < 3:
            continue
        own = MultiPoint([ln.coords[0], ln.coords[-1]]).buffer(JOIN)
        hang = []       # (run, which end) of the guesses that end on this one part way along
        for j in lt.query(ln.buffer(JOIN)):
            j = int(j)
            if j == k or j >= n_move:
                continue
            for e in (0, -1):
                q = Point(runs[order[j]]["p"][e][:2])
                if ln.distance(q) < JOIN and not own.contains(q):
                    hang.append((j, e))
        hung = {j for j, _ in hang}

        def joined(q):
            pt = Point(q[:2])
            return any(int(j) != k and allines[int(j)].distance(pt) < JOIN and end_near(int(j), q, 0.5) is None
                       for j in lt.query(pt.buffer(JOIN)))

        def clear(a, c):
            seg = LineString([a[:2], c[:2]])
            if btree is not None and len(btree.query(seg, predicate="intersects")):
                return False
            ends = MultiPoint([a[:2], c[:2]]).buffer(JOIN)
            return not any(int(j) != k and int(j) not in hung and seg.intersects(allines[int(j)])
                           and not seg.intersection(allines[int(j)]).within(ends) for j in lt.query(seg))
        out, i = [pts[0]], 0
        while i < len(pts) - 1:
            far = i + 1
            for j in range(i + 2, len(pts)):
                if joined(pts[j - 1]):
                    break
                seg = LineString([pts[i][:2], pts[j][:2]])
                if any(seg.distance(Point(q[:2])) > WAVE for q in pts[i + 1:j]):
                    break
                if clear(pts[i], pts[j]):
                    far = j
            out.append(pts[far])
            i = far
        if len(out) >= len(pts):
            continue
        like = r["p"][0][2]
        new_p = {k: dense(out, like)}
        new_l = {k: LineString([q[:2] for q in new_p[k]])}
        for j, e in hang:
            q = runs[order[j]]["p"][e]
            m = new_l[k].interpolate(new_l[k].project(Point(q[:2])))
            if btree is not None and len(btree.query(LineString([q[:2], (m.x, m.y)]), predicate="intersects")):
                continue
            pj = [list(x) for x in new_p.get(j, runs[order[j]]["p"])]
            pj[e] = [round(m.x, 1), round(m.y, 1), z_at(m.x, m.y, q[2])]
            new_p[j] = pj
            new_l[j] = LineString([x[:2] for x in pj])
        if all(clash(new_l[x], x, new_l) <= clash(allines[x], x, {}) + CLASH_SLACK for x in new_l):
            for x, px in new_p.items():
                runs[order[x]]["p"] = px
                allines[x] = new_l[x]
            taken += len(pts) - len(out)
    return runs, taken
