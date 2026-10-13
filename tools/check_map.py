"""Check a built map (and the squares round it) against the scenery rules, and say where it breaks them.

Usage: python3 -I tools/check_map.py <map> [web/public/maps] [--tiles ti,tj ...] [--all]

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
"""
import glob, json, math, os, sys, collections
import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon

# the game's road widths (web/src/map.ts), the same table as tools/prep_map.py
RW = {"motorway": 14, "trunk": 12, "primary": 8.5, "secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 5.5,
      "living_street": 5, "service": 3.5, "unknown": 4, "pedestrian": 6, "footway": 1.6, "steps": 1.8, "cycleway": 2,
      "path": 1.4, "track": 2.8, "bridleway": 2}
PATHS = {"footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"}
VEHICLE = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "service", "unknown"}


def main():
    args = sys.argv[1:]
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

    def note(rule, score, where, what):
        totals[rule] += 1
        worst[rule].append((score, where, what))

    for f in files:
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
        def z_at(r, x):
            i = min(range(len(r["p"])), key=lambda i: math.dist(r["p"][i][:2], (x.x, x.y)))
            return r["p"][i][2], i
        for i in range(len(roads)):
            for j in tree.query(lines[i]):
                j = int(j)
                if j <= i or not lines[i].crosses(lines[j]) or joined(i, j): continue
                x = lines[i].intersection(lines[j]); x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point": continue
                zi, ii = z_at(roads[i], x); zj, jj = z_at(roads[j], x)
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
        vlines = [(LineString([q[:2] for q in r["p"]]), RW.get(r["c"], 4) / 2) for r in roads if r["c"] in VEHICLE]
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
        for r, mk, ln in zip(roads, marks, lines):
            for t in rail_tree.query(ln):
                t = int(t)
                if not ln.crosses(rail_lines[t]): continue
                x = ln.intersection(rail_lines[t]); x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point": continue
                zr, i = z_at(r, x)
                tp = rail_pts[t]
                k = min(range(len(tp)), key=lambda k: math.dist(tp[k][:2], (x.x, x.y)))
                zt, flag = tp[k][2], tp[k][3]
                if abs(zr - zt) < 2.5 and flag != 2 and not mk[i]:
                    note("6 road crosses the railway at grade", 2.5 - abs(zr - zt), (tag, round(x.x), round(x.y)), f"{r['c']} {r['n']!r} road {zr:.1f} rail {zt:.1f} (rail flag {flag})")
        # ---- 7. the canal -----------------------------------------------------------------------
        for r, mk, ln in zip(roads, marks, lines):
            for c in canal_tree.query(ln):
                seg, lv = canal_segs[int(c)]
                if not ln.crosses(seg): continue
                x = ln.intersection(seg); x = x.geoms[0] if hasattr(x, "geoms") else x
                if x.geom_type != "Point": continue
                zr, i = z_at(r, x)
                if not mk[i] or zr < lv + 2.0: note("7 road through the canal", lv + 2.6 - zr, (tag, round(x.x), round(x.y)), f"{r['c']} {r['n']!r} at {zr:.1f}, water {lv:.1f}, {'span' if mk[i] else 'no span'}")
                elif ground(x.x, x.y) > lv - 0.3: note("7 ground not dug under a canal bridge", ground(x.x, x.y) - lv, (tag, round(x.x), round(x.y)), f"{r['c']} {r['n']!r} ground {ground(x.x, x.y):.1f} water {lv:.1f}")
        # ---- 8. the corridors are clear -------------------------------------------------------------
        corr = [l.buffer(RW.get(r["c"], 4) / 2, cap_style=2) for r, l in zip(roads, lines) if r["c"] not in PATHS]
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
        def standing(x, y):
            pt = Point(x, y)
            return any(corr[int(k)].contains(pt) for k in ctree.query(pt))
        for q in m["tr"]:
            if standing(q[0], q[1]): note("8 tree in a corridor", 1, (tag, round(q[0]), round(q[1])), "tree")
        for q in m.get("sb") or []:
            if standing(q[0], q[1]): note("8 shrub in a corridor", 1, (tag, round(q[0]), round(q[1])), "shrub")
        for q in m.get("fx") or []:
            if q[0] != "car" and standing(q[1], q[2]): note("8 street item in a corridor", 1, (tag, round(q[1]), round(q[2])), str(q[0]))
        for bl in m["br"]:
            if len(bl["p"]) < 2: continue
            ln = LineString([q[:2] for q in bl["p"]])
            inside = sum(corr[int(k)].intersection(ln).length for k in ctree.query(ln))
            if inside > 3: note("8 wall in a corridor", inside, (tag, round(bl["p"][0][0]), round(bl["p"][0][1])), f"{bl['c']} {inside:.0f} m")
    print("rule failures across", len(files), "map files:")
    for rule in sorted(totals):
        print(f"  {totals[rule]:5d}  {rule}")
        for score, where, what in sorted(worst[rule], key=lambda w: -w[0])[:6]:
            print(f"           {where[0]:>8s} ({where[1]:>6},{where[2]:>6})  {what}")
    if not totals: print("  none")


if __name__ == "__main__":
    main()
