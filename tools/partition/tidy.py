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
WHOLLY = 0.8        # of its length: a run this much alongside another is that other drawn twice
WHOLLY_LENGTH = 0.5     # metres of it lying within CLOSE, so a run only grazing another is left
STUB = 1.5          # metres: a bit left over beside a cut is no wall (1.0 if it is all that is left)
OVER = 1.0          # metres a run may poke out past another before it is cut back to it
JOIN = 1.3          # metres a cut end may move to meet the run that stays


def _angle(a, b):
    return math.atan2(b[1] - a[1], b[0] - a[0])


def _same_way(s, t):
    d = abs((_angle(*s) - _angle(*t) + math.pi / 2) % math.pi - math.pi / 2)
    return d <= SAME_WAY


def tidy_walls(runs, ground, gate_ends=()):
    """The runs with doubled stretches taken out and poking ends cut back. `ground(x, y)` gives the
    height for a point the tidy adds (or None, when the point is off the grid). A short run by a gate
    end is the wall that makes it a gate, so it is not dropped for lying along another."""
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
        runs = _undouble(runs, ground, gate_ends)
        if [r["p"] for r in runs] == before:
            break
    runs = _square_off_wedges(runs, ground, gate_ends)
    # points are kept to 0.1 m, which moves a trimmed end a little off the junction it was cut to
    for _ in range(3):
        before = [r["p"] for r in runs]
        runs = _trim_ends(runs, ground)
        if [r["p"] for r in runs] == before:
            break
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


def _undouble(runs, ground, gate_ends=()):
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
            if j == i or not _same_way(s, t):
                continue
            c = seg_lines[n].intersection(near_c[m]).length
            w = seg_lines[n].intersection(near_n[m]).length
            st = stats.setdefault((i, j), [0.0, 0.0, []])
            st[0] += c
            st[1] += w - c
            st[2].append(seg_lines[n].intersection(near_n[m]))
    covers = {}
    for (i, j), (c, w, parts) in stats.items():
        if runs[j]["_k"] <= runs[i]["_k"]:
            continue
        # the stretch is measured from either run's side: a short run beside the middle of a long
        # one has a different length of each in the other's band, and the check counts from whichever
        # comes first
        c_back, w_back, _ = stats.get((j, i), (0.0, 0.0, None))
        c, w = max(c, c_back), max(w, w_back)
        # a short run lying wholly along another is a double however short it is: boundaries that meet
        # at a junction in a cluster leave pairs of stubs, none of them 2 m long
        whole = (c + w >= WHOLLY * lines[i].length and c >= WHOLLY_LENGTH
                 and not any(lines[i].distance(Point(e)) < 0.3 for e in gate_ends))
        if c > DOUBLED_LENGTH or w > APART_LENGTH or whole:
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
        # measured before the ends are joined: a sliver joined at both ends to a run a metre away
        # would otherwise grow into a hairpin
        pieces = [_join(p, lines[i], winners) for p in pieces
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


WEDGE = 1.0         # metres an end may lie along the run it meets before it is squared off


def _square_off_wedges(runs, ground, gate_ends=()):
    """A run that meets another at a shallow angle lies within a few tens of centimetres of it for
    metres before they touch, which reads as one boundary drawn twice. Such an end stops where it is
    first 0.6 m from the other run and steps across to it square on."""
    lines = [LineString([q[:2] for q in r["p"]]) for r in runs]
    tree = STRtree(lines)
    gate_pts = [Point(g) for g in gate_ends]
    gate_tree = STRtree(gate_pts) if gate_pts else None
    out = []
    for i, r in enumerate(runs):
        line = lines[i]
        for e in (0, 1):
            if line.length < 2 * WEDGE + 1.0:
                continue
            end = Point(line.coords[0 if e == 0 else -1])
            if gate_tree is not None and any(end.distance(gate_pts[int(g)]) < 0.3
                                             for g in gate_tree.query(end, predicate="dwithin", distance=0.3)):
                continue
            along = line if e else LineString(line.coords[::-1])
            for k in tree.query(end.buffer(0.05)):
                k = int(k)
                if k == i or lines[k].distance(end) > 0.05:
                    continue
                inside = along.intersection(lines[k].buffer(CLOSE + 0.05))
                first = next((g for g in getattr(inside, "geoms", [inside])
                              if g.geom_type == "LineString" and g.distance(end) < 0.05), None)
                if first is None or first.length < WEDGE or first.length > line.length - WEDGE:
                    continue
                keep = substring(along, 0, along.length - first.length)
                foot = lines[k].interpolate(lines[k].project(Point(keep.coords[-1])))
                pts = list(keep.coords) + [(foot.x, foot.y)]
                line = LineString(pts if e else pts[::-1])
                break
        if line is lines[i]:
            out.append(r)
        else:
            out.append(dict(r, p=_points(list(line.coords), ground, r["p"])))
    return out


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


CORNER = math.radians(30)   # a turn this sharp is a corner a gate keeps clear of
CORNER_CLEAR = 0.6          # metres between a gate's wall stub and a corner, so no stub hooks round it


def _straight_spot(ln, t):
    """The nearest place to `t` along the run where a gate's opening and a stub of wall either side lie
    on one straight stretch, with no corner in them (or None if there's no such place)."""
    pts = list(ln.coords)
    at, corners = 0.0, []
    for k in range(1, len(pts) - 1):
        at += math.dist(pts[k - 1], pts[k])
        a, b = _angle(pts[k - 1], pts[k]), _angle(pts[k], pts[k + 1])
        if abs((b - a + math.pi) % (2 * math.pi) - math.pi) > CORNER:
            corners.append(at)
    half = 0.55 + CORNER_CLEAR
    bounds = [0.0] + corners + [ln.length]
    best = None
    for lo, hi in zip(bounds, bounds[1:]):
        lo, hi = max(lo + half, 1.6), min(hi - half, ln.length - 1.6)
        if lo > hi:
            continue
        c = min(max(t, lo), hi)
        if best is None or abs(c - t) < abs(best - t):
            best = c
    return best


def reseat_gates(runs, gaps, ground, reach=2.5):
    """Gates whose wall was cut away move onto the nearest wall within `reach` metres, which is opened
    for them; a gate with no wall near is dropped, as a gap in a boundary needs no gate."""
    runs = list(runs)
    kept = []
    lines = None
    for g in gaps:
        if lines is None:
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
            t = _straight_spot(ln, min(max(ln.project(here), 1.6), ln.length - 1.6))
            if t is None:
                continue
            p0, p1 = ln.interpolate(t - 0.55), ln.interpolate(t + 0.55)
            z = ground(here.x, here.y)
            if z is None:
                continue
            r = runs[k]
            runs[k:k + 1] = [dict(r, p=_points(list(substring(ln, 0, t - 0.55).coords), ground, r["p"])),
                             dict(r, p=_points(list(substring(ln, t + 0.55, ln.length).coords), ground, r["p"]))]
            kept.append([round(p0.x, 1), round(p0.y, 1), round(p1.x, 1), round(p1.y, 1), round(z, 1), r["c"]])
            lines = None
            break
    return runs, kept


POKE_CLEAR = 1.1    # metres a gate's wall stub runs on before the first run that meets it


def clear_gates_of_junctions(runs, gaps, ground):
    """A gate set just short of a place where another run meets its wall leaves a stub that pokes a
    few tens of centimetres past that run. The gate slides along its own straight wall, away from
    the junction, until the stub is long enough to read as wall."""
    runs, gaps = list(runs), [list(g) for g in gaps]
    lines, stale = None, False
    for gi, g in enumerate(gaps):
        if lines is None or stale:
            stale = False
            lines = [LineString([q[:2] for q in r["p"]]) for r in runs]
            tree = STRtree(lines)
        a, b = Point(g[0], g[1]), Point(g[2], g[3])
        width = a.distance(b)
        ends = {}
        for name, pt in (("a", a), ("b", b)):
            for k in tree.query(pt.buffer(0.15)):
                k = int(k)
                c = lines[k].coords
                for first in (True, False):
                    if Point(c[0 if first else -1]).distance(pt) < 0.15:
                        ends[name] = (k, first)
        if len(ends) < 2 or ends["a"][0] == ends["b"][0]:
            continue
        for near, far in (("b", "a"), ("a", "b")):
            ik, ifirst = ends[near]
            piece = lines[ik] if ifirst else LineString(lines[ik].coords[::-1])
            if piece.length < 2.5:
                continue
            meets = [(piece.project(h), int(k), h) for k in tree.query(piece) if int(k) != ik
                     for h in getattr(piece.intersection(lines[int(k)]), "geoms", [piece.intersection(lines[int(k)])])
                     if not h.is_empty and h.geom_type == "Point" and 0.1 < piece.project(h) < 1.0]
            if not meets:
                continue
            t, mk, at = min(meets, key=lambda m: m[0])
            fk, ffirst = ends[far]
            other = lines[fk] if not ffirst else LineString(lines[fk].coords[::-1])
            shift = POKE_CLEAR - t
            path = list(other.coords) + list(piece.coords)
            whole = LineString(path)
            pos = other.length
            if (other.length < shift + 1.6
                    or _corner_between(whole, pos - shift - CORNER_CLEAR, pos + width)):
                # no room to slide: the run that ends on the wall is brought to the gate's edge instead
                m = lines[mk].coords
                for e in (0, -1):
                    if Point(m[e]).distance(at) < 0.15:
                        pts = [list(q[:2]) for q in runs[mk]["p"]]
                        pts[e] = list(piece.coords[0])
                        runs[mk] = dict(runs[mk], p=_points(pts, ground, runs[mk]["p"]))
                        stale = True
                        break
                continue
            lo, hi = whole.interpolate(pos - shift), whole.interpolate(pos + width - shift)
            front = substring(whole, 0, pos - shift)
            back = substring(whole, pos + width - shift, whole.length)
            for k, line, keep_first in ((fk, front, not ffirst), (ik, back, ifirst)):
                pts = list(line.coords) if keep_first else list(line.coords)[::-1]
                runs[k] = dict(runs[k], p=_points(pts, ground, runs[k]["p"]))
            stale = True
            first, second = (lo, hi) if near == "b" else (hi, lo)
            g[:4] = [round(first.x, 1), round(first.y, 1), round(second.x, 1), round(second.y, 1)]
            break
    return runs, gaps


def _corner_between(line, lo, hi):
    pts = list(line.coords)
    at = 0.0
    for k in range(1, len(pts) - 1):
        at += math.dist(pts[k - 1], pts[k])
        if lo < at < hi:
            a, b = _angle(pts[k - 1], pts[k]), _angle(pts[k], pts[k + 1])
            if abs((b - a + math.pi) % (2 * math.pi) - math.pi) > CORNER:
                return True
    return False


def _walled(lines, tree, pt, r=0.3):
    return any(lines[int(k)].distance(pt) < r for k in tree.query(pt.buffer(r)))
