"""The space over streets and paths kept clear of the trees, last of all on the ground.

Every street, lane and path has room over it to walk or drive: head height over a path or a
pavement, a van's over a lane and a bus's over a main road, and on a bridge its deck and parapets
as well. Trees come from the canopy map, which measures them from the air and knows nothing of
what's under them, so a tree in a valley can grow up through a viaduct and a wood's canopy hang
across a path at head height. Here each is cut back out of that room:

- the woods' canopy (one sheet over the woods, its height cell by cell: web/src/world.ts) is
  lowered under a bridge's deck, and opened where it would come down into the room over a path;
- a tree's crown (web/src/trees.ts) is cut back the cheapest way that clears it: the tree stepped
  back a little off the street, its crown raised on a taller trunk, as street trees are, or made
  smaller; only where none of that will do is the tree left out. A tree in a wood whose canopy
  has been opened over it gets a crown of its own and is cut back the same way, and one where the
  canopy map reads too low to draw any is drawn as part of the canopy instead.

A tree is [x, y, ground, size], [x, y, ground, size, 1] in a wood, or [x, y, ground, size, 0,
lift] with its crown raised: drawn lift times as tall on the same width.
"""
import base64, math
import numpy as np
import shapely

# metres clear over a path or pavement, over a lane or a side street, and over a main road (a bus's height)
HEAD_WALK, HEAD_LANE, HEAD_MAIN = 2.5, 3.2, 4.5
MAIN = {"motorway", "trunk", "primary", "secondary", "tertiary"}
DECK, PARAPET = 1.2, 0.4             # a bridge's deck under its surface, and its parapets either side
# a tree of size 1's crown as ellipsoids (middle, half its height, half its width), with the size's
# spread and the leaves' bumps: a broadleaf's (trees.ts broadleafCrown), and a conifer's low tiers
# (coniferCrown), as the game picks which a tree is itself
CROWNS = ((5.0, 2.9, 3.3), (3.2, 1.9, 2.6))
LIFTS = (1.15, 1.3, 1.45)       # how far a crown may be raised before it's made smaller instead
SHRINKS = (0.9, 0.8, 0.7, 0.6)
SMALLEST = 0.35                      # (prep_map.py's smallest tree)
LEAST_CANOPY = 4                     # (a canopy cell lower than this isn't drawn: prep_map.py)
CANOPY_BESIDE = 1.0                  # the canopy is a solid sheet, so it stands this far further back than a crown


def rooms(roads, paths, kerbed):
    """The room over each piece of each street and path: (piece, half its width, its surface at
    each end, how far under that and over it is kept clear)."""
    out = []
    for r in roads:
        p = r["p"]
        if len(p) < 2: continue
        walk = r["c"] in paths
        half = (r.get("w") or 4) / 2
        pv = max(r["pv"]) if r.get("pv") else (1.7 if r["c"] in kerbed else 0)
        for a, b in zip(p, p[1:]):
            if a[:2] == b[:2]: continue
            span = len(a) > 3 and len(b) > 3 and a[3] and b[3]
            under, edge = (DECK, PARAPET) if span else (0.3, 0)
            seg = shapely.LineString([a[:2], b[:2]])
            out.append((seg, half + edge, a[2], b[2], under, HEAD_WALK if walk else HEAD_MAIN if r["c"] in MAIN or r.get("bu") else HEAD_LANE))
            if pv > 0: out.append((seg, half + pv + edge, a[2], b[2], under, HEAD_WALK))
    return out


class Room:
    def __init__(self, roads, paths, kerbed):
        self.r = rooms(roads, paths, kerbed)
        self.tree = shapely.STRtree([q[0] for q in self.r]) if self.r else None

    def near(self, geom, reach):
        if self.tree is None: return []
        return [self.r[int(k)] for k in self.tree.query(geom.buffer(reach))]

    @staticmethod
    def level(seg, za, zb, pt):
        f = seg.project(pt, normalized=True)
        return za + (zb - za) * f


def crown_clash(x, y, g, s, lift, room):
    """The piece of street or path whose room a tree's crown reaches into, if any."""
    pt = shapely.Point(x, y)
    reach = max(c[2] for c in CROWNS) * s
    for seg, half, za, zb, under, head in room.near(pt, reach + 6):
        d = seg.distance(pt) - half
        if d >= reach: continue
        z = Room.level(seg, za, zb, pt)
        lo, hi = z - under, z + head
        for c_mid, c_up, c_across in CROWNS:
            across, up, mid = c_across * s, c_up * s * lift, g + c_mid * s * lift
            dz = 0.0 if lo <= mid <= hi else min(abs(mid - lo), abs(mid - hi))
            if (max(0.0, d) / across) ** 2 + (dz / up) ** 2 < 1: return seg
    return None


# Ways to cut a tree back, cheapest first: stepped back off the street a little (its spot is the
# canopy map's, a few metres across), its crown raised, or made smaller, alone or together.
STEPS = (0, 0.5, 1.0, 1.5, 2.0)
FITS = sorted(((m, f, k) for m in STEPS for f in (1,) + SHRINKS for k in (1,) + LIFTS),
              key=lambda c: c[0] + (1 - c[1]) * 4 + (c[2] - 1) * 2)


def keep_clear(out, roads, ground, paths, kerbed, free=lambda x, y: True):
    """Cuts the trees and the woods' canopy in out (a map or square) back out of the room over the
    streets and paths. ground(x, y) is the ground's height, free(x, y) whether a trunk may stand
    there. Returns what it did, to print."""
    room = Room(roads, paths, kerbed)
    did = dict(cells_filled=0, cells_lowered=0, cells_opened=0, unwooded=0, stepped=0, lifted=0, trimmed=0, dropped=0)
    C = out.get("cn")
    H = None
    if C and room.tree is not None:
        H = np.frombuffer(base64.b64decode(C["h"]), dtype=np.uint8).reshape(C["ny"], C["nx"]).astype(float)
        # a tree in a wood where the canopy map reads too low to draw is drawn as part of the canopy
        # (a crown of its own each would cost far more to draw), so its trunk isn't left bare
        for t in out["tr"]:
            if len(t) >= 5 and t[4] == 1:
                i, j = round((t[0] - C["x0"]) / C["step"]), round((t[1] - C["y0"]) / C["step"])
                if 0 <= i < C["nx"] and 0 <= j < C["ny"] and not H[j, i]:
                    H[j, i] = min(40, max(LEAST_CANOPY, round(7.5 * t[3])))
                    did["cells_filled"] += 1
        H0 = H.copy()
        open_canopy(H, C, ground, room)
        did["cells_lowered"] = int(((H > 0) & (H < H0)).sum())
        did["cells_opened"] = int(((H == 0) & (H0 > 0)).sum())
        if (H != np.frombuffer(base64.b64decode(C["h"]), dtype=np.uint8).reshape(H.shape)).any():
            C["h"] = base64.b64encode(H.astype(np.uint8).tobytes()).decode()
    kept = []
    for t in out["tr"]:
        if len(t) >= 5 and t[4] == 1:
            if H is None or covered(H, C, t[0], t[1]):
                kept.append(t); continue
            t = t[:4]; did["unwooded"] += 1
        x, y, g, s = t[:4]
        lift = t[5] if len(t) > 5 else 1
        seg = crown_clash(x, y, g, s, lift, room)
        if seg is None:
            kept.append(t); continue
        # back is straight away from the street it first reaches into
        on = seg.interpolate(seg.project(shapely.Point(x, y)))
        bx, by = x - on.x, y - on.y
        bl = math.hypot(bx, by)
        if bl < 1e-3:
            (ax, ay), (cx, cy) = seg.coords[0], seg.coords[-1]
            bx, by, bl = ay - cy, cx - ax, math.hypot(cx - ax, cy - ay) or 1
        bx, by = bx / bl, by / bl
        fit = None
        for m, f, k in FITS:
            if s * f < SMALLEST and f < 1: continue
            nx_, ny_ = round(x + bx * m, 1), round(y + by * m, 1)
            if m and not free(nx_, ny_): continue
            g_ = ground(nx_, ny_) if m else g
            # (stepped back off the square's grid, it has no ground to stand on there)
            if g_ is None: continue
            g_ = round(g_, 1)
            if crown_clash(nx_, ny_, g_, s * f, k, room) is None:
                fit = (nx_, ny_, g_, round(s * f, 2), k); break
        if fit is None:
            did["dropped"] += 1; continue
        did["stepped" if fit[:2] != (x, y) else "trimmed" if fit[3] < s else "lifted"] += 1
        kept.append(list(fit[:4]) + ([0, fit[4]] if fit[4] > 1 else []))
    out["tr"] = kept
    return did


def trunk_room(buildings, walls, roads, also=lambda x, y: True):
    """Where a tree stepped back may stand: not indoors or against a wall of a house, not on a wall,
    fence or hedge, and not on a street or path on the ground (buildings are outer rings, walls
    lines of points)."""
    bld = shapely.STRtree([shapely.Polygon(r).buffer(0.6) for r in buildings if len(r) >= 3])
    wl = [shapely.LineString([q[:2] for q in w]) for w in walls if len(w) > 1]
    wlt = shapely.STRtree(wl) if wl else None
    ways = [shapely.LineString([q[:2] for q in r["p"]]).buffer((r.get("w") or 4) / 2 + (max(r["pv"]) if r.get("pv") else 0) + 0.5)
            for r in roads if len(r["p"]) > 1 and not any(len(q) > 3 and q[3] for q in r["p"])]
    wyt = shapely.STRtree(ways) if ways else None

    def free(x, y):
        pt = shapely.Point(x, y)
        return (not len(bld.query(pt, predicate="intersects"))
                and not (wlt is not None and any(wl[int(k)].distance(pt) < 0.5 for k in wlt.query(pt.buffer(0.5))))
                and not (wyt is not None and len(wyt.query(pt, predicate="intersects")))
                and also(x, y))
    return free


def covered(H, C, x, y):
    i, j = round((x - C["x0"]) / C["step"]), round((y - C["y0"]) / C["step"])
    return 0 <= i < C["nx"] and 0 <= j < C["ny"] and H[j, i] > 0


def corners(H):
    """The canopy's height at each cell's corners, as world.ts draws it: the cells round a corner
    averaged, tapering down where the wood ends."""
    ny, nx = H.shape
    P = np.zeros((ny + 2, nx + 2)); P[1:-1, 1:-1] = H
    blocks = [P[:-1, :-1], P[:-1, 1:], P[1:, :-1], P[1:, 1:]]
    n = sum((b > 0).astype(float) for b in blocks)
    s = sum(blocks)
    return np.where(n > 0, s / np.maximum(n, 1) * (0.55 + 0.45 * n / 4), 0)


def open_canopy(H, C, ground, room):
    """Lowers each canopy cell under a deck over it, and opens it where it comes down into the room
    over a street or path, until none does (a cell changed changes the corners it shares)."""
    step, half = C["step"], C["step"] / 2
    cells = {}
    for j, i in zip(*np.nonzero(H)):
        x, y = C["x0"] + i * step, C["y0"] + j * step
        sq = shapely.box(x - half, y - half, x + half, y + half)
        near = [q for q in room.near(sq, CANOPY_BESIDE) if q[0].distance(sq) < q[1] + CANOPY_BESIDE]
        if near: cells[(int(j), int(i))] = (x, y, ground(x, y), sq, near)
    for _ in range(8):
        K = corners(H)
        changed = False
        for (j, i), (x, y, g, sq, near) in cells.items():
            if not H[j, i]: continue
            cs = np.maximum(1.5, K[j:j + 2, i:i + 2])
            bottom, top = g + 0.5 * cs.min(), g + cs.max() + 0.8
            for seg, w, za, zb, under, head in near:
                z = Room.level(seg, za, zb, sq.centroid)
                lo, hi = z - under, z + head
                if top <= lo or bottom >= hi: continue
                # a deck high over the wood: the canopy stays under it; else it's opened there
                lower = math.floor(lo - g - 1.1)
                H[j, i] = lower if bottom < lo and LEAST_CANOPY <= lower < H[j, i] else 0
                changed = True
                break
        if not changed: break
