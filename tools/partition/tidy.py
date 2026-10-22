"""The last tidy of a square's drawn walls, before its gates are checked.

The partition gives every boundary one edge, but the writer cuts those edges at roads, at the
square's edge and at gates, and a few places still end up with two walls side by side or a wall end
poking out past another it meets. Writing the tile does not decide anything over the network: this
is the same final step the old build had (`_unoverlap`, `_undouble` and `_trim_ends` in
`tools/prep_map.py`), done on the writer's runs.

Two runs lying the same way within `NEAR` metres of each other are one boundary drawn twice. The
better one stays and the other is cut back to where it leaves it, and its cut end is joined onto the
one that stays. Which stays: a real wall (mapped or seen by the lidar) over a guessed boundary, a
front over a side, and otherwise the longer one.

Each run comes with a `_k` key saying how good a wall it is, so the order is the writer's to choose.
"""
import math

from shapely.geometry import LineString, Point
from shapely.ops import linemerge, substring, unary_union
from shapely.strtree import STRtree

NEAR = 1.2          # metres: two runs this close and running the same way are one boundary
CLOSE = 0.6         # metres: the nearer band, which counts for less length before it is doubling
SAME_WAY = math.radians(25)
DOUBLED_LENGTH = 2.0    # metres lying within CLOSE of another run before it is a double
APART_LENGTH = 3.0      # metres lying between CLOSE and NEAR of another run before it is a double
STUB = 1.5          # metres: a bit left over beside a cut is no wall (1.0 if it is all that is left)
OVER = 1.0          # metres a run may poke out past another before it is cut back to it
JOIN = 1.3          # metres a cut end may move to meet the run that stays


def _angle(a, b):
    return math.atan2(b[1] - a[1], b[0] - a[0])


def _same_way(s, t):
    d = abs((_angle(*s) - _angle(*t) + math.pi / 2) % math.pi - math.pi / 2)
    return d <= SAME_WAY


def tidy_walls(runs, ground):
    """The runs with doubled stretches taken out and poking ends cut back. `ground(x, y)` gives the
    height for a point the tidy adds (or None, when the point is off the grid)."""
    runs = [piece for r in runs if len(r["p"]) >= 2 for piece in _unfolded(r)]
    if len(runs) < 2:
        return _plain(runs)
    # the writer cuts one boundary into several runs, all of one rank; where it folds back on itself
    # neither piece could give way to the other, and in Oldfield Park those were all its doubles left
    runs = [dict(r, _k=(*r["_k"], n)) for n, r in enumerate(runs)]
    # again until it settles: a cut end joined onto the run that stays can leave the rest of its run
    # lying alongside another (Oldfield Park's doubles went from 31 to 59 with one pass)
    for _ in range(6):
        before = [r["p"] for r in runs]
        runs = _undouble(runs, ground)
        if [r["p"] for r in runs] == before:
            break
    runs = _trim_ends(runs, ground)
    return _plain(runs)


FOLD = math.radians(150)    # a turn this sharp sends a run back along itself
FOLD_SMOOTH = 0.4           # metres of wiggle smoothed out before looking for one


def _unfolded(r):
    """A run that turns back along itself, cut at each turn, so its two halves can be undoubled like
    any two runs: one run is never compared with itself. The turns are looked for on the run with its
    wiggles smoothed out, so a U of three short sides counts as one turn back."""
    p = r["p"]
    if len(p) < 3:
        return [r]
    bends = list(LineString([q[:2] for q in p]).simplify(FOLD_SMOOTH).coords)
    at = {(q[0], q[1]): k for k, q in enumerate(p)}
    cuts = []
    for k in range(1, len(bends) - 1):
        a, b = _angle(bends[k - 1], bends[k]), _angle(bends[k], bends[k + 1])
        if abs((b - a + math.pi) % (2 * math.pi) - math.pi) > FOLD and (bends[k][0], bends[k][1]) in at:
            cuts.append(at[bends[k][0], bends[k][1]])
    out, start = [], 0
    for k in sorted(set(cuts)):
        if 0 < k < len(p) - 1:
            out.append(dict(r, p=p[start:k + 1]))
            start = k
    out.append(dict(r, p=p[start:]))
    return [q for q in out if len(q["p"]) >= 2]


def _plain(runs):
    return [{k: v for k, v in r.items() if k != "_k"} for r in runs]


def _points(xy, ground, like):
    """Rows of x, y, z for a changed run; a point the grid has no height for takes its neighbour's."""
    out = []
    for x, y in xy:
        z = ground(x, y)
        if z is None:
            z = out[-1][2] if out else like[0][2]
        out.append([round(x, 1), round(y, 1), round(z, 1)])
    return out


def _undouble(runs, ground):
    lines = [LineString([q[:2] for q in r["p"]]) for r in runs]
    segs = [(i, (a[:2], b[:2])) for i, r in enumerate(runs) for a, b in zip(r["p"], r["p"][1:])
            if math.hypot(b[0] - a[0], b[1] - a[1]) > 0.2]
    seg_lines = [LineString(s) for _, s in segs]
    tree = STRtree(seg_lines)
    near_c = [g.buffer(CLOSE, quad_segs=8) for g in seg_lines]
    near_n = [g.buffer(NEAR, quad_segs=8) for g in seg_lines]
    stats = {}
    for n, (i, s) in enumerate(segs):
        for m in tree.query(near_n[n]):
            m = int(m)
            j, t = segs[m]
            if j == i or runs[j]["_k"] <= runs[i]["_k"] or not _same_way(s, t):
                continue
            c = seg_lines[n].intersection(near_c[m]).length
            w = seg_lines[n].intersection(near_n[m]).length
            st = stats.setdefault((i, j), [0.0, 0.0, []])
            st[0] += c
            st[1] += w - c
            st[2].append(seg_lines[n].intersection(near_n[m]))
    covers = {}
    for (i, j), (c, w, parts) in stats.items():
        if c > DOUBLED_LENGTH or w > APART_LENGTH:
            covers.setdefault(i, []).append((j, parts))
    if not covers:
        return runs
    out = []
    for i, r in enumerate(runs):
        if i not in covers:
            out.append(r)
            continue
        # a band, not the lines: the overlaps are computed, not on the run, and taking a line off
        # a line that differs in the last digit takes nothing off at all
        cut = unary_union([g for _, parts in covers[i] for g in parts]).buffer(0.01)
        left = lines[i].difference(cut)
        pieces = [g for g in getattr(left, "geoms", [left]) if g.geom_type == "LineString" and not g.is_empty]
        merged = linemerge(pieces) if len(pieces) > 1 else left
        pieces = [g for g in getattr(merged, "geoms", [merged]) if g.geom_type == "LineString" and not g.is_empty]
        winners = unary_union([lines[j] for j, _ in covers[i]])
        pieces = [p for p in (_join(p, lines[i], winners) for p in pieces)
                  if p.length >= (1.0 if len(pieces) == 1 else STUB)]
        for p in pieces:
            out.append(dict(r, p=_points(list(p.coords), ground, r["p"])))
    return out


def _join(piece, original, winners):
    """A cut end is moved onto the run that stays, so the two still meet."""
    pts = list(piece.coords)
    for e in (0, -1):
        x, y = pts[e]
        ends = (original.coords[0], original.coords[-1])
        if any(math.hypot(x - a, y - b) < 0.05 for a, b in ends):
            continue
        here = Point(x, y)
        near = winners.interpolate(winners.project(here))
        if near.distance(here) <= JOIN:
            pts[e] = (near.x, near.y)
    return LineString(pts) if len(pts) >= 2 else piece


def _trim_ends(runs, ground):
    lines = [LineString([q[:2] for q in r["p"]]) for r in runs]
    tree = STRtree(lines)
    out = []
    for i, r in enumerate(runs):
        line = lines[i]
        if line.length < 2 * OVER + 0.5:
            out.append(r)
            continue
        lo, hi = 0.0, line.length
        for k in tree.query(line):
            if int(k) == i:
                continue
            x = line.intersection(lines[int(k)])
            for h in getattr(x, "geoms", [x]):
                if h.is_empty or h.geom_type != "Point":
                    continue
                t = line.project(h)
                if 0.05 < t < OVER:
                    lo = max(lo, t)
                if line.length - OVER < t < line.length - 0.05:
                    hi = min(hi, t)
        if lo == 0.0 and hi == line.length:
            out.append(r)
            continue
        out.append(dict(r, p=_points(list(substring(line, lo, hi).coords), ground, r["p"])))
    return out


def reseat_gates(runs, gaps, ground, reach=2.5):
    """Gates whose wall was cut away move onto the nearest wall within `reach` metres, which is opened
    for them; a gate with no wall near is dropped, as a gap in a boundary needs no gate."""
    runs = list(runs)
    kept = []
    for g in gaps:
        lines = [LineString([q[:2] for q in r["p"]]) for r in runs]
        tree = STRtree(lines) if lines else None
        here = Point((g[0] + g[2]) / 2, (g[1] + g[3]) / 2)
        a, b = Point(g[0], g[1]), Point(g[2], g[3])
        if tree is not None and _walled(lines, tree, a) and _walled(lines, tree, b):
            kept.append(g)
            continue
        if tree is None:
            continue
        for k in sorted((int(k) for k in tree.query(here.buffer(reach))), key=lambda k: lines[k].distance(here)):
            ln = lines[k]
            if ln.distance(here) > reach:
                break
            if ln.length < 3.2:
                continue
            t = min(max(ln.project(here), 1.6), ln.length - 1.6)
            p0, p1 = ln.interpolate(t - 0.55), ln.interpolate(t + 0.55)
            z = ground(here.x, here.y)
            if z is None:
                continue
            r = runs[k]
            runs[k:k + 1] = [dict(r, p=_points(list(substring(ln, 0, t - 0.55).coords), ground, r["p"])),
                             dict(r, p=_points(list(substring(ln, t + 0.55, ln.length).coords), ground, r["p"]))]
            kept.append([round(p0.x, 1), round(p0.y, 1), round(p1.x, 1), round(p1.y, 1), round(z, 1), r["c"]])
            break
    return runs, kept


def _walled(lines, tree, pt, r=0.3):
    return any(lines[int(k)].distance(pt) < r for k in tree.query(pt.buffer(r)))
