"""Roads graded as roads are built: one long profile for the whole network, fitted to the survey,
with every junction at one height, no stretch steeper than its kind of road may be, and the ground
then cut or filled to it (tools/prep_map.py flattens and banks it). Shared by tools/prep_map.py
and tools/structures.py.

- terrain_detail: how fine the terrain really is, in metres, measured from its own heights. The UK's
  lidar has detail down to its pixels; terrain from a radar survey (the SRTM, under Mapzen's tiles
  outside the UK) is a coarser grid smoothed up to the pixels, and has buildings and trees in it.
- grade: the heights along every road at once, as a linear programme (scipy's HiGHS). It keeps each
  point as near its survey height as it can (by the metres of road off it, so a bump in the survey
  is cut through rather than followed), keeps every stretch within its steepest grade where the
  fixed points allow, and charges for each change of gradient, so a bump narrower than about four
  times `scale` metres is evened out and anything wider is followed. `scale` comes from
  terrain_detail: on lidar it is a few metres and the roads stay where the survey has them; on a
  coarse survey it is tens of metres, which takes out the buildings and the cross-slope a road
  laid along a hillside picks up.
"""
import numpy as np

# metres: the heights are written to a tenth of a metre, so two ends of a stretch can each move by
# half that; a stretch is graded that much inside its steepest, less the little a stretch of road
# may be over it anyway (tools/check_map.py)
ROUNDING = 0.1


def terrain_detail(dem, px, least=1.3):
    """The finest scale (metres) at which the terrain `dem` (a grid, or a stack of grids, of pixels
    `px` metres apart) has detail of its own: the smallest scale at which its curvature still grows
    as the scale shrinks. A grid sampled up from a coarser one has no more curvature below that
    scale than at it. The sea, flat to the survey, is left out."""
    dem = np.asarray(dem, dtype=float)
    if dem.ndim == 2:
        dem = dem[None]
    gy, gx = np.gradient(dem, axis=(1, 2))
    land = np.hypot(gx, gy) > 1e-3
    curv = []
    for s in (1, 2, 4, 8, 16):
        if min(dem.shape[1:]) <= 2 * s + 1:
            break
        a = np.abs(dem[:, 2 * s:, :] + dem[:, :-2 * s, :] - 2 * dem[:, s:-s, :])[land[:, s:-s, :]]
        b = np.abs(dem[:, :, 2 * s:] + dem[:, :, :-2 * s] - 2 * dem[:, :, s:-s])[land[:, :, s:-s]]
        if not a.size or not b.size:
            break
        curv.append((s, (np.median(a) + np.median(b)) / 2 / s ** 2))
    for (s, c), (_, c2) in zip(curv, curv[1:]):
        if c >= least * c2:
            return s * px
    return curv[-1][0] * px if curv else px


def grade(chains, xy, target, fixed, steepest, scale, exact=None, join=2.5, hard=1e4):
    """The graded heights of a network of roads.

    chains: lists of point ids along each road; xy[id], target[id] (the survey's height there);
    fixed: {id: height} for points that keep theirs (a bridge's deck, a tunnel's floor); steepest:
    for each chain, the steepest grade allowed for each of its stretches. Points from different
    chains at the same place (to half a metre) are one junction, unless their survey heights are
    `join` metres apart or more (a road passing under a bridge).
    exact: like steepest, the steepest each stretch's kind of road may be; a stretch held to that is
    kept far enough inside it not to round over it (ROUNDING), and a gentler limit (the hill's)
    needn't be kept so closely.
    Returns {id: height}."""
    from scipy.optimize import linprog
    from scipy.sparse import coo_matrix

    key = lambda i: (round(xy[i][0] * 2), round(xy[i][1] * 2))
    groups = {}
    node = {}
    count = 0
    for ch in chains:
        for i in ch:
            if i in node:
                continue
            here = groups.setdefault(key(i), [])
            for n, h in here:
                if abs(h - target[i]) < join:
                    node[i] = n
                    break
            else:
                node[i] = count
                here.append((count, target[i]))
                count += 1
    nn = count
    if nn == 0:
        return {}
    tz = np.zeros(nn)
    cnt = np.zeros(nn)
    for i, n in node.items():
        tz[n] += target[i]
        cnt[n] += 1
    tz /= np.maximum(cnt, 1)
    lo, hi = np.full(nn, -np.inf), np.full(nn, np.inf)
    for i, h in fixed.items():
        if i in node and np.isinf(lo[node[i]]):
            lo[node[i]] = hi[node[i]] = h
    weight = np.zeros(nn)
    edges, bends = {}, []
    for c, (ch, lim) in enumerate(zip(chains, steepest)):
        run = []
        for m, i in enumerate(ch):
            if run and node[i] == run[-1][0]:
                continue
            g = lim[min(m, len(lim) - 1)] if lim else 0.25
            tight = exact is None or not exact[c] or g >= exact[c][min(m, len(exact[c]) - 1)] - 1e-9
            run.append((node[i], i, (g, tight)))
        for (a, ia, g), (b, ib, _) in zip(run, run[1:]):
            d = float(np.hypot(xy[ib][0] - xy[ia][0], xy[ib][1] - xy[ia][1]))
            if d < 0.01:
                continue
            weight[a] += d / 2
            weight[b] += d / 2
            e = (min(a, b), max(a, b))
            edges[e] = (d, min(g, edges[e][1]) if e in edges else g)
        for (a, ia, _), (b, ib, _), (c, ic, _) in zip(run, run[1:], run[2:]):
            d1 = float(np.hypot(xy[ib][0] - xy[ia][0], xy[ib][1] - xy[ia][1]))
            d2 = float(np.hypot(xy[ic][0] - xy[ib][0], xy[ic][1] - xy[ib][1]))
            if d1 >= 0.5 and d2 >= 0.5 and len({a, b, c}) == 3:
                bends.append((a, b, c, d1, d2))
    ne, nb = len(edges), len(bends)
    # variables: z, above, below (each point's height off its survey), slack (each stretch's
    # height past its steepest), bend (each point's change of gradient)
    oz, oa, ob, os_, oq = 0, nn, 2 * nn, 3 * nn, 3 * nn + ne
    nv = oq + nb
    lam = scale * scale
    c = np.concatenate([np.zeros(nn), weight, weight, np.full(ne, hard), np.full(nb, lam)])
    # equalities: z - above + below = survey
    r = np.concatenate([np.arange(nn)] * 3)
    cc = np.concatenate([oz + np.arange(nn), oa + np.arange(nn), ob + np.arange(nn)])
    v = np.concatenate([np.ones(nn), -np.ones(nn), np.ones(nn)])
    A_eq = coo_matrix((v, (r, cc)), shape=(nn, nv)).tocsr()
    rows, cols, vals, rhs = [], [], [], []
    k = 0
    for e, ((a, b), (d, (g, tight))) in enumerate(edges.items()):
        rise = max(g * d - max(0.0, ROUNDING - 0.02 * d), g * d / 2) if tight else g * d
        for s in (1, -1):
            rows += [k, k, k]
            cols += [oz + b, oz + a, os_ + e]
            vals += [s, -s, -1.0]
            rhs.append(rise)
            k += 1
    for t, (a, b, cn, d1, d2) in enumerate(bends):
        for s in (1, -1):
            rows += [k, k, k, k]
            cols += [oz + cn, oz + b, oz + a, oq + t]
            vals += [s / d2, -s * (1 / d2 + 1 / d1), s / d1, -1.0]
            rhs.append(0.0)
            k += 1
    A_ub = coo_matrix((vals, (rows, cols)), shape=(k, nv)).tocsr()
    bounds = np.column_stack([np.concatenate([lo, np.zeros(nv - nn)]), np.concatenate([hi, np.full(nv - nn, np.inf)])])
    # (heights measured from the lowest point, so the solver's tolerances are in metres of relief)
    base = float(np.nanmin(tz))
    b_eq = tz - base
    bounds[:nn] -= base
    res = linprog(c, A_ub=A_ub, b_ub=np.array(rhs), A_eq=A_eq, b_eq=b_eq,
                  bounds=[(None if np.isinf(a) else a, None if np.isinf(b) else b) for a, b in bounds], method="highs")
    if res.status != 0:
        raise RuntimeError(f"grading the roads failed: {res.message}")
    z = res.x[:nn] + base
    return {i: float(z[n]) for i, n in node.items()}
