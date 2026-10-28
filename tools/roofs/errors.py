"""How far the roofs the game draws are from the lidar's surface: the error map.

Usage: python3 -I tools/roofs/errors.py <out dir> <ti,tj> ... [--map combe-down] [--drawn <drawn.mjs>]

For every building in those built squares, the survey's first-return surface (DSM) is sampled
every half metre a little inside its walls, set in the map's frame (the two grounds' offset round
it, as prep_map.py does), and compared with the roof the game draws there (map.ts, through
tools/roofs/drawn.ts). Points where the laser went through leaves, or that stand no higher than
the garden (the outline and the survey don't line up exactly), are left out.

Writes <out dir>/roof-errors.csv, every building worst first, and <out dir>/roof-errors.txt, the
summary: how many roofs are how far out, and what kind of failure each bad one is.
"""
import csv, json, os, subprocess, sys, tempfile
from collections import Counter

import numpy as np
import shapely

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import open_lidar, square, footprint, grid_in, ground_offsets, register, PARTY, MIN_ABOVE, THROUGH, ROOT     # noqa: E402

GOOD, BAD = 0.5, 1.0        # metres RMS: within GOOD is right; past BAD is plainly wrong


def bundle(out):
    """tools/roofs/drawn.ts as a node script."""
    web = os.path.join(ROOT, "web")
    shim = open(os.path.join(ROOT, "tools", "roofs", "shim.js")).read()
    subprocess.run([os.path.join(web, "node_modules", ".bin", "esbuild"), "../tools/roofs/drawn.ts", "--bundle", "--platform=node",
                    "--format=esm", f"--outfile={out}", "--log-level=error", f"--banner:js={shim}"], cwd=web, check=True)
    return out


def drawn_heights(drawn, sq_path, pts):
    with tempfile.TemporaryDirectory() as t:
        p, o = os.path.join(t, "p.json"), os.path.join(t, "o.json")
        json.dump(pts, open(p, "w"))
        subprocess.run(["node", drawn, sq_path, p, o], check=True)
        return json.load(open(o))


def kind_of(z, err, drawn, bias):
    """What sort of failure a roof's errors are."""
    lo, hi = np.percentile(z, 5), np.percentile(z, 98)
    rise_real = hi - np.percentile(z, 12)
    rise_drawn = np.percentile(drawn, 98) - np.percentile(drawn, 5)
    zs = np.sort(z)
    gaps = np.diff(zs)
    k = int(np.argmax(gaps)) if len(gaps) else 0
    split = len(gaps) and gaps[k] > 2.0 and 0.1 < (k + 1) / len(zs) < 0.9
    if hi - np.percentile(z, 75) > 6: return "tower or spire"
    if abs(bias) > 1.0 and np.sqrt(np.mean((err - bias) ** 2)) < GOOD: return "whole roof too high or low"
    if split: return "levels: parts at different heights"
    if rise_real > 5.5 and rise_drawn < rise_real - 1.5: return "steep roof drawn too low"
    if rise_drawn < 0.8 and rise_real > 1.5: return "pitched roof drawn flat"
    if rise_drawn > 1.5 and rise_real < 1.0: return "flat roof drawn pitched"
    return "complex shape (L, cross gables, hips, dormers)"


def main():
    args = sys.argv[1:]
    map_id, drawn = "combe-down", None
    if "--map" in args: k = args.index("--map"); map_id = args[k + 1]; del args[k:k + 2]
    if "--drawn" in args: k = args.index("--drawn"); drawn = args[k + 1]; del args[k:k + 2]
    out_dir, squares = os.path.abspath(args[0]), [s.replace(",", "_") for s in args[1:]]
    os.makedirs(out_dir, exist_ok=True)
    drawn = drawn or bundle(os.path.join(out_dir, "drawn.mjs"))
    lidar = open_lidar(map_id)
    rows = []
    for sq in squares:
        d = square(map_id, sq)
        blds = d["bl"]
        polys = [footprint(b) for b in blds]
        shift, _ = ground_offsets(lidar, blds, polys)
        ptree = shapely.STRtree(polys)
        pts, keep = {}, {}
        for i, p in enumerate(polys):
            if p.is_empty or p.area < 8: continue
            gx, gy = grid_in(p)
            if len(gx) < 12: continue
            pts[str(i)] = [[float(x), float(y)] for x, y in zip(gx, gy)]
        drawn_z = drawn_heights(drawn, os.path.join(ROOT, "web", "public", "maps", map_id, f"{sq}.json"), pts)
        for k, xy in pts.items():
            i = int(k)
            b = blds[i]
            xy = np.array(xy)
            dsm, dtm = lidar.surface_and_ground(xy[:, 0], xy[:, 1])
            last = lidar._sample("last", *lidar._bng(xy[:, 0], xy[:, 1])) if "last" in lidar.grids else dsm
            dz = np.array(drawn_z[k])
            ok = ~np.isnan(dsm) & ~np.isnan(dtm)
            row = dict(square=sq, i=i, name=b.get("n", ""), kind=b.get("c", ""), x=round(float(xy[:, 0].mean()), 1), y=round(float(xy[:, 1].mean()), 1),
                       area=round(polys[i].area, 1), roof="flat" if not b.get("rp") else ("hipped" if any(b.get("hp") or []) else "gabled"))
            if ok.sum() < 12:
                rows.append(dict(row, fail="no survey")); continue
            leafy = ok & (dsm - last > THROUGH)
            up = ok & (dsm - dtm >= MIN_ABOVE)
            if leafy.sum() > 0.3 * up.sum():
                rows.append(dict(row, fail="under trees")); continue
            if up.sum() < 0.5 * ok.sum():
                rows.append(dict(row, fail="not in survey (newer, or gone)")); continue
            use = up & ~leafy
            z = dsm[use] - shift[i]
            err = z - dz[use]
            bias = float(np.median(err))
            rms = float(np.sqrt(np.mean(err ** 2)))
            row.update(n=int(use.sum()), rms=round(rms, 2), p95=round(float(np.percentile(np.abs(err), 95)), 2),
                       worst=round(float(err[np.argmax(np.abs(err))]), 2), bias=round(bias, 2),
                       rise=round(float(np.percentile(z, 98) - np.percentile(z, 12)), 1))
            # and with the survey lined up on the footprint (common.register), which leaves only
            # what is wrong with the roof's shape and height, not where the outline was drawn
            dx, dy, _ = register(lidar, polys[i], [polys[k] for k in ptree.query(polys[i].buffer(PARTY)) if k != i])
            s2, g2 = lidar.surface_and_ground(xy[:, 0] + dx, xy[:, 1] + dy)
            ok2 = ~np.isnan(s2) & ~np.isnan(g2) & (s2 - g2 >= MIN_ABOVE)
            if ok2.sum() >= 12:
                z2 = s2[ok2] - shift[i]
                e2 = z2 - dz[ok2]
                rms2 = float(np.sqrt(np.mean(e2 ** 2)))
                row.update(dx=dx, dy=dy, rms_lined=round(rms2, 2), p95_lined=round(float(np.percentile(np.abs(e2), 95)), 2))
                row["fail"] = "" if rms2 <= GOOD else kind_of(z2, e2, dz[ok2], float(np.median(e2)))
            else:
                row["fail"] = "" if rms <= GOOD else kind_of(z, err, dz[use], bias)
            rows.append(row)
        print(sq, len(blds), "buildings", flush=True)

    rows.sort(key=lambda r: -r.get("rms_lined", r.get("rms", -1)))
    cols = ["square", "i", "name", "kind", "x", "y", "area", "roof", "n", "rms", "p95", "worst", "bias", "rise", "dx", "dy", "rms_lined", "p95_lined", "fail"]
    with open(os.path.join(out_dir, "roof-errors.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, cols)
        w.writeheader()
        for r in rows: w.writerow({c: r.get(c, "") for c in cols})

    meas = [r for r in rows if "rms_lined" in r]
    raw = np.array([r["rms"] for r in meas])
    rms = np.array([r["rms_lined"] for r in meas])
    shiftm = np.array([np.hypot(r["dx"], r["dy"]) for r in meas])
    area = np.array([r["area"] for r in meas])
    lines = [f"roof error against the lidar surface, squares {' '.join(squares)}",
             f"{len(rows)} buildings; {len(meas)} measurable ({len(rows) - len(meas)} not: "
             + ", ".join(f"{n} {k}" for k, n in Counter(r['fail'] for r in rows if 'rms' not in r).most_common()) + ")",
             "",
             f"the footprints are {np.median(shiftm):.1f} m off the survey's buildings (median; a quarter are over {np.percentile(shiftm, 75):.1f} m),",
             "so the error is given as drawn, and with the survey lined up on each footprint (which leaves only the roof's shape and height)",
             "",
             f"RMS (m)        as drawn  share  area   | lined up  share  area",
             ]
    for lo, hi in ((0, GOOD), (GOOD, BAD), (BAD, 2), (2, 4), (4, 1e9)):
        cells = []
        for v in (raw, rms):
            m = (v > lo) & (v <= hi) if lo else v <= hi
            cells.append(f"{int(m.sum()):>8} {m.mean():>6.0%} {area[m].sum() / area.sum():>5.0%}")
        lines.append(f"{lo:>4}-{'' if hi > 1e8 else hi:<6}  " + "   | ".join(cells))
    lines += ["", f"median RMS {np.median(raw):.2f} m as drawn, {np.median(rms):.2f} m lined up; "
              f"area-weighted mean {np.sum(raw * area) / area.sum():.2f} / {np.sum(rms * area) / area.sum():.2f} m", "",
              f"failure kinds, lined up (RMS over {GOOD} m):"]
    for k, n in Counter(r["fail"] for r in meas if r["fail"]).most_common():
        a = sum(r["area"] for r in meas if r["fail"] == k)
        lines.append(f"  {n:>5}  {a / area.sum():>5.0%} of roof area  {k}")
    lines += ["", "by drawn roof:"]
    for k in ("flat", "gabled", "hipped"):
        m = np.array([r["roof"] == k for r in meas])
        if m.any(): lines.append(f"  {k:<7} {int(m.sum()):>5}  median RMS {np.median(rms[m]):.2f}  over {BAD} m: {np.mean(rms[m] > BAD):.0%}")
    lines += ["", "worst 25:"]
    for r in meas[:25]:
        lines.append(f"  {r['rms_lined']:>5.2f}  {r['square']:>5} #{r['i']:<5} {r['name'][:28]:<28} {r['kind']:<12} {r['area']:>7.0f} m2  {r['fail']}  ?at={r['x']:.0f},{r['y']:.0f}")
    open(os.path.join(out_dir, "roof-errors.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
