"""Check a built map (and the squares round it) against the scenery rules, and say where it breaks them.

Usage: python3 -I tools/check_map.py <map> [web/public/maps] [--tiles ti,tj ...] [--all] [--list 'rule name']
(--list prints every failure of the rules whose names contain that text, and CHECK_SHOW=40 in the
environment lists the worst 40 places for each rule, rather than 6)

The rules it checks, each with the worst places listed (data coordinates, metres east and north of
the map centre), so a rule that fails can be looked at in the game and fixed in the tools, not
case by case:

 1. Roads run smoothly: no vehicle road steeper than 1 in 4, no kink sharper than a quarter
    of a gradient between points, and the ground under a vehicle road within half a metre of it.
 2. Ways that cross do so as a junction (they share a point), a bridge (one marked as a span
    with headroom over the other), an underpass, or a tunnel. A road and a road, or a road and the
    railway, crossing at grade without a junction is wrong; a path crossing a road at grade is a
    pedestrian crossing and allowed.
 3. A bridge's span stands clear of the ground under it, its deck meets the road at each end
    within a step, and it has something to cross: water, the railway, a road, or a drop.
 4. Nothing runs through the water: a road or path in a river or pond is on a span, and the
    water's bed is below its surface.
 5. Walls, fences and hedges don't cross roads or paths (the game cuts them at the kerb; here
    the data is checked for ones lying along a carriageway, which the game can't cut).
 6. The railway: track on the ground sits on it; a road crossing the line is a bridge or an
    underpass, never at grade (there are no level crossings in Bath).
 7. The canal: every road or path crossing it (outside its tunnels) is a bridge with headroom for
    a boat over the water, and the ground under the span is dug below the water.
 8. The corridors are clear: no tree, shrub, street item (parked cars aside) or wall stands in a
    road's carriageway, on the railway, in the water or in the canal's channel.
 9. Things on the ground fit together: every gate has a wall or fence at both sides; no two walls,
    fences or hedges run on top of each other; a front path goes through a garden boundary only at
    a gate; no tree, shrub or street item stands on a wall or inside a building; no building
    stands on a pavement; and a mapped footpath doesn't run along a drawn pavement (it is that
    pavement).
"""
import glob, json, math, multiprocessing, os, sys, collections
import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon, box

# the game's road widths (web/src/map.ts), the same table as tools/prep_map.py
RW = {"motorway": 14, "trunk": 12, "primary": 8.5, "secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 5.5,
      "living_street": 5, "service": 3.5, "unknown": 4, "pedestrian": 6, "footway": 1.6, "steps": 1.8, "cycleway": 2,
      "path": 1.4, "track": 2.8, "bridleway": 2}
PATHS = {"footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"}
VEHICLE = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "service", "unknown"}


def main():
    args = sys.argv[1:]
    listed = None
    if "--list" in args:
        k = args.index("--list")
        listed = args[k + 1]
        del args[k:k + 2]
    map_id = args[0]
    root = args[1] if len(args) > 1 and not args[1].startswith("--") else "web/public/maps"
    files = [os.path.join(root, f"{map_id}.json")]
    if "--tiles" in args:
        k = args.index("--tiles")
        files = [os.path.join(root, map_id, f"{a.replace(',', '_')}.json") for a in args[k + 1:] if not a.startswith("--")]
    elif "--all" in args or True:
        files += sorted(glob.glob(os.path.join(root, map_id, "*_*.json")))
    rail = json.load(open(os.path.join(root, f"{map_id}-rail.json"))) if os.path.exists(os.path.join(root, f"{map_id}-rail.json")) else None
    canal = json.load(open(os.path.join(root, f"{map_id}-canal.json"))) if os.path.exists(os.path.join(root, f"{map_id}-canal.json")) else None
    canal_segs = []
    if canal:
        for run in canal["runs"]:
            pts = run["p"]
            for i in range(len(pts) - 1):
                if (pts[i][6] | pts[i + 1][6]) & 1: continue
                canal_segs.append((LineString([pts[i][:2], pts[i + 1][:2]]), run["lv"]))
    canal_tree = shapely.STRtree([c[0] for c in canal_segs])
    rail_lines = [LineString([q[:2] for q in t["p"]]) for t in rail["tracks"] if len(t["p"]) > 1] if rail else []
    rail_pts = [t["p"] for t in rail["tracks"]] if rail else []
    rail_tree = shapely.STRtree(rail_lines)
    totals = collections.Counter()
    worst = collections.defaultdict(list)

    def check(f):
        """The failures in one map file, in the order they're found."""
        found = []
        note = lambda rule, score, where, what: found.append((rule, score, where, what))
        m = json.load(open(f))
        tag = os.path.basename(f).replace(".json", "")
        T = m["t"]; nx, ny = T["nx"], T["ny"]
        H = np.array(T["h"], dtype=float).reshape(ny, nx) / 10 + T["z0"]

        def ground(x, y):
            fi, fj = (x - T["x0"]) / T["dx"], (y - T["y0"]) / T["dy"]
            i, j = min(nx - 2, max(0, int(fi))), min(ny - 2, max(0, int(fj)))
            u, v = min(1, max(0, fi - i)), min(1, max(0, fj - j))
            return (H[j, i] * (1 - u) + H[j, i + 1] * u) * (1 - v) + (H[j + 1, i] * (1 - u) + H[j + 1, i + 1] * u) * v

        roads = [r for r in m["rd"] if len(r["p"]) > 1]
        lines = [LineString([q[:2] for q in r["p"]]) for r in roads]
        tree = shapely.STRtree(lines)
        marks = [[q[3] if len(q) > 3 else 0 for q in r["p"]] for r in roads]
        # ---- 1. smooth roads on their ground -------------------------------------------------
        for r, mk in zip(roads, marks):
            p = r["p"]
            if r["c"] in PATHS: continue
            for a, b in zip(p, p[1:]):
                d = math.dist(a[:2], b[:2]) or 0.01
                g = abs(b[2] - a[2]) / d
                if g > 0.25 and d > 1: note("1 road too steep", g, (tag, round(a[0]), round(a[1])), f"{r['c']} {r['n']!r} 1 in {1 / g:.1f}")
            for a, b, c in zip(p, p[1:], p[2:]):
                d1, d2 = math.dist(a[:2], b[:2]) or 0.01, math.dist(b[:2], c[:2]) or 0.01
                if d1 < 1.5 or d2 < 1.5: continue
                k = abs((c[2] - b[2]) / d2 - (b[2] - a[2]) / d1)
                if k > 0.25: note("1 road kinked", k, (tag, round(b[0]), round(b[1])), f"{r['c']} {r['n']!r} bend {k:.2f}")
            for i, q in enumerate(p):
                if mk[i]: continue
                dz = q[2] - ground(q[0], q[1])
                if abs(dz) > 0.5: note("1 road off its ground", abs(dz), (tag, round(q[0]), round(q[1])), f"{r['c']} {r['n']!r} {dz:+.1f} m")
        # ---- 2. crossings ---------------------------------------------------------------------
        def joined(i, j):
            for a, b in ((i, j), (j, i)):
                for q in (roads[a]["p"][0], roads[a]["p"][-1]):
                    if lines[b].distance(Point(q[:2])) < 2.5: return True
            if lines[i].crosses(lines[j]):     # a crossroads: both roads have a point at the spot
                x = lines[i].intersection(lines[j]); x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type == "Point" and all(any(math.dist(q[:2], (x.x, x.y)) < 0.7 for q in roads[a]["p"]) for a in (i, j)): return True
            return False
        def z_at(k, x):
            """A way's height where it crosses another, as the game has it: its own on a bridge, the ground elsewhere."""
            p = roads[k]["p"]
            i = min(range(len(p)), key=lambda i: math.dist(p[i][:2], (x.x, x.y)))
            return (p[i][2] if marks[k][i] else ground(p[i][0], p[i][1])), i
        for i in range(len(roads)):
            for j in tree.query(lines[i]):
                j = int(j)
                if j <= i or not lines[i].crosses(lines[j]) or joined(i, j): continue
                x = lines[i].intersection(lines[j]); x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point": continue
                zi, ii = z_at(i, x); zj, jj = z_at(j, x)
                hi, lo = (i, j) if zi >= zj else (j, i)
                dz = abs(zi - zj)
                upper, lower = roads[hi], roads[lo]
                up_mark = marks[hi][ii if hi == i else jj]
                if up_mark == 2 or marks[lo][jj if hi == i else ii] == 2: continue   # a bridge's pavement meeting the street at its end
                if up_mark:
                    need = 2.8 if lower["c"] in PATHS else 4.5
                    if lower["c"] in PATHS and dz < 1.0: continue       # a path crossing on the deck at its level
                    if dz < need: note("2 bridge without headroom", need - dz, (tag, round(x.x), round(x.y)), f"{upper['c']} {upper['n']!r} over {lower['c']} {lower['n']!r}: {dz:.1f} m")
                elif dz > 1.5:
                    note("2 ways cross at different heights with no bridge", dz, (tag, round(x.x), round(x.y)), f"{upper['c']} {upper['n']!r} {dz:.1f} m over {lower['c']} {lower['n']!r}")
                elif upper["c"] not in PATHS and lower["c"] not in PATHS:
                    note("2 roads cross at grade with no junction", 1, (tag, round(x.x), round(x.y)), f"{upper['c']} {upper['n']!r} x {lower['c']} {lower['n']!r}")
        # ---- 3. bridges ------------------------------------------------------------------------
        canals = [l for l in m["wl"] if l["c"] == "canal"]
        def is_canal(w):   # the canal's water is drawn by the game at its own levels, not the map's
            ring = w["r"][0]
            return sum(1 for k in range(10) if any(math.dist(q[:2], ring[(k * len(ring)) // 10]) < 14 for l in canals for q in l["p"])) >= 5
        water = [(Polygon(w["r"][0], [tuple(map(tuple, h)) for h in w["r"][1:]]), w["z"]) for w in m["wp"] if len(w["r"][0]) >= 3 and not is_canal(w)]
        wtree = shapely.STRtree([w for w, _ in water])
        water_all = [Polygon(w["r"][0], [h for h in w["r"][1:] if len(h) >= 3]) for w in m["wp"] if len(w["r"][0]) >= 3]   # (islands are land)
        wtree_all = shapely.STRtree(water_all)
        for r, mk, ln in zip(roads, marks, lines):
            if not any(mk): continue
            p = r["p"]
            k = 0
            while k < len(p):
                if not mk[k]: k += 1; continue
                e = k
                while e + 1 < len(p) and mk[e + 1]: e += 1
                a, b = max(0, k - 1), min(len(p) - 1, e + 1)
                seg = LineString([q[:2] for q in p[a:b + 1]])
                # clear of the ground along the span
                for q in p[k + 1:e]:
                    c = q[2] - ground(q[0], q[1])
                    if c < -0.3: note("3 span sunk in the ground", -c, (tag, round(q[0]), round(q[1])), f"{r['c']} {r['n']!r} {c:.1f} m")
                # meets the road at each end
                for end in (a, b):
                    if not mk[end] and abs(p[end][2] - ground(p[end][0], p[end][1])) > 0.6:
                        note("3 deck end off the road", abs(p[end][2] - ground(p[end][0], p[end][1])), (tag, round(p[end][0]), round(p[end][1])), f"{r['c']} {r['n']!r}")
                # something to cross
                under = any(water_all[int(w)].intersects(seg) for w in wtree_all.query(seg)) or any(rail_lines[int(t)].intersects(seg) for t in rail_tree.query(seg))
                if not under:
                    under = any(lines[int(j)].crosses(seg) and not joined(roads.index(r), int(j)) for j in tree.query(seg) if roads[int(j)] is not r)
                if not under:
                    under = any(q[2] - ground(q[0], q[1]) > 2.5 for q in p[k:e + 1])
                if not under and mk[k] == 1: note("3 bridge over nothing", seg.length, (tag, round(p[k][0]), round(p[k][1])), f"{r['c']} {r['n']!r} {seg.length:.0f} m")
                k = e + 1
        # ---- 4. water --------------------------------------------------------------------------
        for r, mk, ln in zip(roads, marks, lines):
            for w in wtree.query(ln):
                poly, wz = water[int(w)]
                for i, q in enumerate(r["p"]):
                    if not mk[i] and poly.contains(Point(q[:2])) and q[2] < wz + 0.2 and poly.exterior.distance(Point(q[:2])) > 2:
                        note("4 way in the water", wz - q[2], (tag, round(q[0]), round(q[1])), f"{r['c']} {r['n']!r} {q[2]:.1f} under water at {wz:.1f}")
                        break
        for poly, wz in water:
            x0, y0, x1, y1 = poly.bounds
            if x1 - x0 < 8 or y1 - y0 < 8: continue
            pts = [poly.representative_point()]
            above = [pt for pt in pts if ground(pt.x, pt.y) > wz + 0.1]
            if above: note("4 water bed above its surface", ground(above[0].x, above[0].y) - wz, (tag, round(above[0].x), round(above[0].y)), f"bed {ground(above[0].x, above[0].y):.1f} water {wz:.1f}")
        # ---- 5. walls along a carriageway ---------------------------------------------------------
        vlines = [(LineString([q[:2] for q in r["p"]]), (r.get("w") or RW.get(r["c"], 4)) / 2) for r in roads if r["c"] in VEHICLE]
        vtree = shapely.STRtree([l for l, _ in vlines])
        for bline in m["br"]:
            if len(bline["p"]) < 2: continue
            bl = LineString([q[:2] for q in bline["p"]])
            for j in vtree.query(bl):
                l, half = vlines[int(j)]
                inside = bl.intersection(l.buffer(half - 0.3))
                if inside.length > 6: note("5 wall along a carriageway", inside.length, (tag, round(bline["p"][0][0]), round(bline["p"][0][1])), f"{bline['c']} {inside.length:.0f} m in the road")
        # ---- 6. the railway --------------------------------------------------------------------
        b = m["b"]
        for pts in rail_pts:
            for q in pts:
                if q[3] == 0 and b[0] <= q[0] <= b[2] and b[1] <= q[1] <= b[3]:
                    dz = q[2] - ground(q[0], q[1])
                    if abs(dz) > 0.6: note("6 track off its ground", abs(dz), (tag, round(q[0]), round(q[1])), f"{dz:+.1f} m")
        for ri, (r, mk, ln) in enumerate(zip(roads, marks, lines)):
            for t in rail_tree.query(ln):
                t = int(t)
                if not ln.crosses(rail_lines[t]): continue
                x = ln.intersection(rail_lines[t]); x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point": continue
                zr, i = z_at(ri, x)
                tp = rail_pts[t]
                k = min(range(len(tp)), key=lambda k: math.dist(tp[k][:2], (x.x, x.y)))
                zt, flag = tp[k][2], tp[k][3]
                if abs(zr - zt) < 2.5 and flag != 2 and not mk[i]:
                    note("6 road crosses the railway at grade", 2.5 - abs(zr - zt), (tag, round(x.x), round(x.y)), f"{r['c']} {r['n']!r} road {zr:.1f} rail {zt:.1f} (rail flag {flag})")
        # ---- 7. the canal -----------------------------------------------------------------------
        for ri, (r, mk, ln) in enumerate(zip(roads, marks, lines)):
            for c in canal_tree.query(ln):
                seg, lv = canal_segs[int(c)]
                if not ln.crosses(seg): continue
                x = ln.intersection(seg); x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point": continue
                zr, i = z_at(ri, x)
                if not mk[i] or zr < lv + 2.0: note("7 road through the canal", lv + 2.6 - zr, (tag, round(x.x), round(x.y)), f"{r['c']} {r['n']!r} at {zr:.1f}, water {lv:.1f}, {'span' if mk[i] else 'no span'}")
                elif ground(x.x, x.y) > lv - 0.3: note("7 ground not dug under a canal bridge", ground(x.x, x.y) - lv, (tag, round(x.x), round(x.y)), f"{r['c']} {r['n']!r} ground {ground(x.x, x.y):.1f} water {lv:.1f}")
        # ---- 8. the corridors are clear -------------------------------------------------------------
        corr = [l.buffer((r.get("w") or RW.get(r["c"], 4)) / 2, cap_style=2) for r, l in zip(roads, lines) if r["c"] not in PATHS]
        b = m["b"]
        for pts in rail_pts:
            run = [q[:2] for q in pts if q[3] != 2 and b[0] - 20 <= q[0] <= b[2] + 20 and b[1] - 20 <= q[1] <= b[3] + 20]
            if len(run) > 1: corr.append(LineString(run).buffer(4.5, cap_style=2))
        if canal:
            for run in canal["runs"]:
                pts = [q for q in run["p"] if b[0] - 20 <= q[0] <= b[2] + 20 and b[1] - 20 <= q[1] <= b[3] + 20]
                for i in range(len(pts) - 1):
                    if (pts[i][6] | pts[i + 1][6]) & 1: continue
                    corr.append(LineString([pts[i][:2], pts[i + 1][:2]]).buffer(max(pts[i][2], pts[i + 1][2]) + 0.8, cap_style=2))
        corr += [w.buffer(0.8) for w in water_all]
        ctree = shapely.STRtree(corr)
        def standing(xy):
            # which of the points stand inside a corridor, all asked of the tree at once
            out = np.zeros(len(xy), bool)
            if len(xy): out[ctree.query(shapely.points(np.asarray(xy, float).reshape(-1, 2)), predicate="within")[0]] = True
            return out
        for q, s in zip(m["tr"], standing([q[:2] for q in m["tr"]])):
            if s: note("8 tree in a corridor", 1, (tag, round(q[0]), round(q[1])), "tree")
        sb = m.get("sb") or []
        for q, s in zip(sb, standing([q[:2] for q in sb])):
            if s: note("8 shrub in a corridor", 1, (tag, round(q[0]), round(q[1])), "shrub")
        fx = [q for q in m.get("fx") or [] if q[0] != "car"]
        for q, s in zip(fx, standing([q[1:3] for q in fx])):
            if s: note("8 street item in a corridor", 1, (tag, round(q[1]), round(q[2])), str(q[0]))
        for bl in m["br"]:
            if len(bl["p"]) < 2: continue
            ln = LineString([q[:2] for q in bl["p"]])
            inside = sum(corr[int(k)].intersection(ln).length for k in ctree.query(ln))
            if inside > 3: note("8 wall in a corridor", inside, (tag, round(bl["p"][0][0]), round(bl["p"][0][1])), f"{bl['c']} {inside:.0f} m")
        fit_together(m, tag, note)
        return found

    # the files are checked a few at once (each on its own), and their failures gathered in order;
    # first, the walls and gates at each file's edges, so a run cut at a square's edge is judged with
    # the rest of it, in the square next door
    global _check, SEAM
    _check = check
    with multiprocessing.get_context("fork").Pool(min(len(files), os.cpu_count() or 1)) as pool:
        SEAM = [s for s in pool.map(_edge_runs, files) if s]
    with multiprocessing.get_context("fork").Pool(min(len(files), os.cpu_count() or 1)) as pool:
        for found in pool.imap(_check_one, files):
            for rule, score, where, what in found:
                totals[rule] += 1
                worst[rule].append((score, where, what))
    print("rule failures across", len(files), "map files:")
    for rule in sorted(totals):
        print(f"  {totals[rule]:5d}  {rule}")
        shown = len(worst[rule]) if listed and listed in rule else int(os.environ.get("CHECK_SHOW", 6))
        for score, where, what in sorted(worst[rule], key=lambda w: -w[0])[:shown]:
            print(f"           {where[0]:>8s} ({where[1]:>6},{where[2]:>6})  {what}")
    if not totals: print("  none")


def fit_together(m, tag, note):
    """Rule 9: walls, gates, paths, pavements, buildings, trees and street items don't clash."""
    KERBED = {"trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street"}
    line = lambda p: LineString([q[:2] for q in p])
    homes = [Polygon(b["r"][0]) for b in m["bl"] if len(b["r"][0]) >= 3]
    homes = [h if h.is_valid else h.buffer(0) for h in homes]
    indoors = shapely.STRtree([h.buffer(-0.3) for h in homes])
    bars = [b for b in m["br"] if len(b["p"]) > 1]
    segs = [(i, LineString([a[:2], c[:2]])) for i, b in enumerate(bars) for a, c in zip(b["p"], b["p"][1:])
            if math.hypot(c[0] - a[0], c[1] - a[1]) > 0.2]
    stree = shapely.STRtree([s for _, s in segs])
    bar_tree = shapely.STRtree([line(b["p"]) for b in bars])
    bar_lines = [line(b["p"]) for b in bars]
    near_bar = lambda pt, r: any(bar_lines[int(k)].distance(pt) < r for k in bar_tree.query(pt.buffer(r)))
    # (and, at the map's edges, the walls and gates of the squares next door)
    door_lines, door_posts = _next_door(m)
    door_tree = shapely.STRtree(door_lines + door_posts)
    next_door = lambda pt, r, posts=True: any((door_lines + door_posts)[int(k)].distance(pt) < r for k in door_tree.query(pt.buffer(r))
                                              if posts or int(k) < len(door_lines))
    # gates with a wall at both sides
    gates = [g for g in m.get("gt") or [] if g[5] != "open"]
    for g in gates:
        ends = sum(near_bar(p, 0.3) or next_door(p, 0.3, False) for p in (Point(g[0], g[1]), Point(g[2], g[3])))
        if ends < 2: note("9 gate without a wall each side", 2 - ends, (tag, round(g[0]), round(g[1])), f"{g[5]} gate, {ends} side{'s' if ends != 1 else ''} walled")
    # two runs on top of each other (within 0.6 m and within 25 degrees)
    ang = lambda s: math.atan2(s.coords[1][1] - s.coords[0][1], s.coords[1][0] - s.coords[0][0])
    # (each stretch of a run counted once against the other run, however finely either is drawn)
    doubled = collections.Counter()
    for i, s in segs:
        alike = collections.defaultdict(list)
        for j in stree.query(s.buffer(0.6)):
            bi, t = segs[int(j)]
            if bi <= i or abs((ang(s) - ang(t) + math.pi / 2) % math.pi - math.pi / 2) > math.radians(25): continue
            alike[bi].append(t.buffer(0.6))
        for bi, near in alike.items():
            doubled[(i, bi)] += s.intersection(shapely.union_all(near)).length
    for (i, bi), L in doubled.items():
        if L > 2: note("9 walls doubled", L, (tag, round(bars[i]["p"][0][0]), round(bars[i]["p"][0][1])), f"{bars[i]['c']} on {bars[bi]['c']} {L:.0f} m")
    # two runs side by side a metre or so apart (0.6 to 1.2 m, over more than 3 m): one boundary drawn twice
    apart = collections.Counter()
    for i, s in segs:
        alike = collections.defaultdict(list)
        for j in stree.query(s.buffer(1.2)):
            bi, t = segs[int(j)]
            if bi <= i or abs((ang(s) - ang(t) + math.pi / 2) % math.pi - math.pi / 2) > math.radians(25): continue
            alike[bi].append(t)
        for bi, near in alike.items():
            u = shapely.union_all(near)
            apart[(i, bi)] += s.intersection(u.buffer(1.2)).length - s.intersection(u.buffer(0.6)).length
    for (i, bi), L in apart.items():
        if L > 3: note("9 walls a metre apart", L, (tag, round(bars[i]["p"][0][0]), round(bars[i]["p"][0][1])), f"{bars[i]['c']} beside {bars[bi]['c']} {L:.0f} m")
    # a run that pokes out past another it meets (by up to a metre), with its end free: not at a
    # gate's post, nor meeting another run's end
    posts = [Point(g[k], g[k + 1]) for g in m.get("gt") or [] if g[5] != "open" for k in (0, 2)]
    ends_at = [Point(L.coords[e]) for L in bar_lines for e in (0, -1)] + posts
    etree = shapely.STRtree(ends_at)
    def free(i, e):
        pt = Point(bar_lines[i].coords[e])
        return not any(int(k) // 2 != i and ends_at[int(k)].distance(pt) < 0.3 for k in etree.query(pt.buffer(0.3))) \
            and not next_door(pt, 0.3)
    for i, L in enumerate(bar_lines):
        if L.length < 2.5: continue
        for k in bar_tree.query(L):
            if int(k) == i: continue
            x = L.intersection(bar_lines[int(k)])
            for h in getattr(x, "geoms", [x]):
                if h.is_empty or h.geom_type != "Point": continue
                t = L.project(h)
                if 0.1 < t < 1.0 and free(i, 0) or L.length - 1.0 < t < L.length - 0.1 and free(i, -1):
                    note("9 wall poking past another", 1, (tag, round(h.x), round(h.y)), f"{bars[i]['c']} past {bars[int(k)]['c']}")
    # front paths through a boundary away from a gate
    gate_pts = [Point((g[0] + g[2]) / 2, (g[1] + g[3]) / 2) for g in m.get("gt") or []]
    gtree = shapely.STRtree(gate_pts)
    for q in m.get("fp") or []:
        path = LineString([(q[0], q[1]), (q[2], q[3])])
        for k in bar_tree.query(path):
            x = bar_lines[int(k)].intersection(path)
            for h in getattr(x, "geoms", [x]):
                if h.is_empty: continue
                if not any(gate_pts[int(j)].distance(h) < 1.0 for j in gtree.query(h.buffer(1.0))):
                    note("9 front path through a wall", 1, (tag, round(h.x if h.geom_type == "Point" else q[0]), round(h.y if h.geom_type == "Point" else q[1])), bars[int(k)]["c"])
    # trees, shrubs and street items on a wall or indoors
    for kind, items, xy in (("tree", m["tr"], lambda q: q[:2]), ("shrub", m.get("sb") or [], lambda q: q[:2]),
                            ("street item", [q for q in m.get("fx") or [] if q[0] != "car"], lambda q: q[1:3])):
        pts = shapely.points(np.asarray([xy(q) for q in items], float).reshape(-1, 2))
        inside = set(indoors.query(pts, predicate="within")[0].tolist()) if len(items) else set()
        for n, (q, pt) in enumerate(zip(items, pts)):
            where = (tag, round(xy(q)[0]), round(xy(q)[1]))
            if n in inside: note(f"9 {kind} inside a building", 1, where, str(q[0]) if kind == "street item" else kind)
            elif near_bar(pt, 0.3 if kind == "tree" else 0.2): note(f"9 {kind} on a wall", 1, where, str(q[0]) if kind == "street item" else kind)
    # walls on their ground (not lifted off it, as where a square's edge once confused the heights)
    T = m["t"]; tnx, tny = T["nx"], T["ny"]
    TH = np.array(T["h"], dtype=float).reshape(tny, tnx) / 10 + T["z0"]
    def ground(x, y):
        fi, fj = (x - T["x0"]) / T["dx"], (y - T["y0"]) / T["dy"]
        i, j = min(tnx - 2, max(0, int(fi))), min(tny - 2, max(0, int(fj)))
        u, v = min(1, max(0, fi - i)), min(1, max(0, fj - j))
        if u + v <= 1: return TH[j, i] + (TH[j, i + 1] - TH[j, i]) * u + (TH[j + 1, i] - TH[j, i]) * v
        return TH[j + 1, i + 1] + (TH[j + 1, i] - TH[j + 1, i + 1]) * (1 - u) + (TH[j, i + 1] - TH[j + 1, i + 1]) * (1 - v)
    for b in bars:
        dz = max(abs(q[2] - ground(q[0], q[1])) for q in b["p"])
        if dz > 0.35: note("9 wall off its ground", dz, (tag, round(b["p"][0][0]), round(b["p"][0][1])), f"{b['c']} {dz:.1f} m")
    # a stub of wall on its own, with nothing at either end
    gate_ends = [Point(g[0], g[1]) for g in m.get("gt") or []] + [Point(g[2], g[3]) for g in m.get("gt") or []]
    ends_tree = shapely.STRtree(bar_lines + gate_ends)
    for i, L in enumerate(bar_lines):
        if L.length >= 1.5: continue
        alone = lambda pt: not any(int(k) != i and (bar_lines + gate_ends)[int(k)].distance(pt) < 0.3 for k in ends_tree.query(pt.buffer(0.3)))
        if alone(Point(L.coords[0])) and alone(Point(L.coords[-1])) and not next_door(Point(L.coords[0]), 0.3) and not next_door(Point(L.coords[-1]), 0.3):
            note("9 wall stub on its own", 1, (tag, round(L.coords[0][0]), round(L.coords[0][1])), f"{bars[i]['c']} {L.length:.1f} m")
    # the way through a gate, up a front path or along a drive is clear of trees and shrubs
    ways = ([LineString([(q[0], q[1]), (q[2], q[3])]).buffer(0.8) for q in gates]
            + [LineString([(q[0], q[1]), (q[2], q[3])]).buffer(0.7) for q in m.get("fp") or []]
            + [LineString([(q[0], q[1]), (q[2], q[3])]).buffer(1.3) for q in m.get("dv") or []])
    if ways:
        wtree = shapely.STRtree(ways)
        for kind, items in (("tree", m["tr"]), ("shrub", m.get("sb") or [])):
            if not items: continue
            pts = shapely.points(np.asarray([q[:2] for q in items], float).reshape(-1, 2))
            for n in sorted(set(wtree.query(pts, predicate="within")[0].tolist())):
                note(f"9 {kind} in a gateway or on a path", 1, (tag, round(items[n][0]), round(items[n][1])), kind)
    # pavements: no building on one, no mapped footpath along one
    paves = []
    for r in m["rd"]:
        if r["c"] not in KERBED or len(r["p"]) < 2: continue
        L, w = line(r["p"]), r.get("w", RW.get(r["c"], 4))
        for side, pv in zip((1, -1), r.get("pv", [1.7, 1.7])):
            if pv > 0: paves.append(L.buffer(side * (w / 2 + pv), cap_style=2, single_sided=True).difference(L.buffer(w / 2, cap_style=2)))
    ptree = shapely.STRtree(paves)
    for i, L in enumerate(bar_lines):
        near = [paves[int(k)].buffer(-0.25) for k in ptree.query(L)]
        on = shapely.union_all(near).intersection(L).length if near else 0.0
        if on > 0.5: note("9 wall on a pavement", on, (tag, round(L.coords[0][0]), round(L.coords[0][1])), f"{bars[i]['c']} {on:.1f} m")
    cars_ = [r for r in m["rd"] if len(r["p"]) > 1 and r["c"] not in ("footway", "path", "cycleway", "steps", "pedestrian", "track", "bridleway")
             and not any(len(q) > 3 for q in r["p"])]
    carr = [line(r["p"]).buffer(r.get("w", RW.get(r["c"], 4)) / 2, cap_style=2) for r in cars_]
    if carr:
        ctree_ = shapely.STRtree(carr)
        for h in homes:
            for k in ctree_.query(h):
                a = carr[int(k)].intersection(h).area
                if a > 2: note("9 building on a carriageway", a, (tag, round(h.centroid.x), round(h.centroid.y)), f"{cars_[int(k)]['c']} {a:.0f} m2")
    for h in homes:
        near = [paves[int(k)] for k in ptree.query(h)]      # (each bit of pavement counted once, where a street's pieces meet)
        over = shapely.union_all(near).intersection(h).area if near else 0.0
        if over > 2: note("9 building on a pavement", over, (tag, round(h.centroid.x), round(h.centroid.y)), f"{over:.0f} m2")
    for r in m["rd"]:
        if r["c"] not in ("footway", "path", "cycleway") or len(r["p"]) < 2: continue
        L = line(r["p"])
        near = [paves[int(k)].buffer(1.0) for k in ptree.query(L.buffer(1.0))]
        along = shapely.union_all(near).intersection(L).length if near else 0.0
        if along > 5: note("9 footpath along a pavement", along, (tag, round(r["p"][0][0]), round(r["p"][0][1])), f"{along:.0f} m")
    # and none along a carriageway (it would be drawn on the road)
    roads_ = [line(r["p"]).buffer(r.get("w", RW.get(r["c"], 4)) / 2, cap_style=2) for r in m["rd"] if r["c"] in KERBED and len(r["p"]) > 1]
    rtree = shapely.STRtree(roads_)
    for r in m["rd"]:
        if r["c"] not in ("footway", "path", "cycleway") or len(r["p"]) < 2 or any(len(q) > 3 for q in r["p"]): continue   # (not a bridge)
        L = line(r["p"])
        on = sum(roads_[int(k)].intersection(L).length for k in rtree.query(L))
        if on > 0.8 * L.length and on > 5: note("9 footpath along a carriageway", on, (tag, round(r["p"][0][0]), round(r["p"][0][1])), f"{on:.0f} m")


def _check_one(f):
    return _check(f)


SEAM = []      # (file, its bounds, walls near its edge, closed gates' posts near its edge), for each file
EDGE = 1.5


def _edge_runs(f):
    """The walls and closed gates' posts within EDGE of a file's edge."""
    m = json.load(open(f))
    if not m.get("b"): return None
    x0, y0, x1, y1 = m["b"]
    near = lambda x, y: min(x - x0, x1 - x, y - y0, y1 - y) < EDGE
    runs = [[q[:2] for q in b["p"]] for b in m["br"] if len(b["p"]) > 1 and any(near(q[0], q[1]) for q in b["p"])]
    posts = [g[k:k + 2] for g in m.get("gt") or [] if g[5] != "open" for k in (0, 2) if near(g[k], g[k + 1])]
    return os.path.basename(f), m["b"], runs, posts


def _next_door(m):
    """The walls and closed gates' posts of the files next door, near map m's edges."""
    if not m.get("b"): return [], []
    x0, y0, x1, y1 = m["b"]
    edge = box(x0 - EDGE, y0 - EDGE, x1 + EDGE, y1 + EDGE).difference(box(x0 + EDGE, y0 + EDGE, x1 - EDGE, y1 - EDGE))
    lines, posts = [], []
    sides = {"w": LineString([(x0, y0), (x0, y1)]), "e": LineString([(x1, y0), (x1, y1)]),
             "s": LineString([(x0, y0), (x1, y0)]), "n": LineString([(x0, y1), (x1, y1)])}
    for f, b, runs, ps in SEAM:
        if b == m["b"] or b[0] > x1 + EDGE or b[2] < x0 - EDGE or b[1] > y1 + EDGE or b[3] < y0 - EDGE: continue
        lines += [L for L in (LineString(r) for r in runs) if L.intersects(edge)]
        posts += [Point(p) for p in ps if edge.contains(Point(p))]
        # (a side with a file next door along it is a seam; one without is the edge of the map)
        for k, s in list(sides.items()):
            if box(*b).buffer(0.5).intersection(s).length > 1: del sides[k]
    # a run cut off at the edge of the map carries on beyond it, where nothing is built: it's judged
    # as joined there
    lines += list(sides.values())
    return lines, posts


if __name__ == "__main__":
    main()
