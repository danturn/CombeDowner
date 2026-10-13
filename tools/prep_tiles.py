"""Build the whole of Bath round a detailed map as tiles, at the detailed map's level of detail.

Usage: python3 -I tools/prep_tiles.py <map> <dir with the wide .geojson layers> <out dir> [--force] [--jobs 4] [--only ti,tj ...]

e.g. python3 -I tools/prep_tiles.py combe-down data/raw/combe-down/wide web/public/maps/combe-down

The dir is the one tools/prep_wide.py uses (the wide Overture layers and the canopy tile, see
docs/new-area.md), and the detailed map (web/public/maps/<map>.json) must be built first: the
tiles carry on its terrain grid and meet its edges. Each tile is one ordinary map file built by
tools/prep_map.py with --tile (see there for what a tile keeps), 261 x 261 of the detailed map's
grid cells (a little over a kilometre) square. Every tile that reaches into the wide force
field's data circle is built, except the nine the detailed map covers.

To keep each build quick, the layers are first cut once into what each tile needs (a tile reads
the features within 650 m of it, and the water within 1300 m), in <dir>/split/<ti>_<tj>/. The
Mapzen terrain tiles are kept in <dir>/terrain15/ so they're only downloaded once. Tiles already
built are skipped unless --force. Four builds run at once by default.

Writes <out dir>/<ti>_<tj>.json for each tile and <out dir>/tiles.json, which says how they're laid out:
{"x0", "y0": the south-west corner of tile (0, 0), metres east and north of the map centre;
 "dx": the grid spacing; "cells": grid cells per tile side; "z0": the height every tile's
 terrain is measured from; "tiles": [[ti, tj], ...]}.
"""
import json, math, os, subprocess, sys, time, gzip
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from shapely.geometry import shape, box, Point

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

TOOLS = os.path.dirname(os.path.abspath(__file__))
CELLS = 261
LAYERS = ["building", "segment", "water", "land_use", "land", "land_cover", "place", "infrastructure"]
PAD = {"water": 1300}       # metres round a tile that its build reads; 650 for everything else


def main():
    args = sys.argv[1:]
    force = "--force" in args
    if force: args.remove("--force")
    jobs = 4
    if "--jobs" in args:
        k = args.index("--jobs"); jobs = int(args[k + 1]); del args[k:k + 2]
    only = None
    if "--only" in args:
        k = args.index("--only")
        only = [tuple(int(v) for v in a.split(",")) for a in args[k + 1:]]
        del args[k:]
    map_id, src_dir, out_dir = args[:3]
    A = area(map_id, wide=True)
    core = json.load(open(os.path.join(TOOLS, "..", "web", "public", "maps", f"{map_id}.json")))
    CB, CT = core["b"], core["t"]
    D = (CB[2] - CB[0]) / (CT["nx"] - 1)
    size = CELLS * D
    tile_box = lambda ti, tj: (CB[0] + ti * CELLS * D, CB[1] + tj * CELLS * D, CB[0] + (ti + 1) * CELLS * D, CB[1] + (tj + 1) * CELLS * D)

    # ---- which tiles: every one reaching into the data circle, but not the detailed map's ----
    (fcx, fcy), R = A.field_centre, A.half
    circle = Point(fcx, fcy).buffer(R, 256)
    tiles = []
    for ti in range(math.floor((fcx - R - CB[0]) / size), math.floor((fcx + R - CB[0]) / size) + 1):
        for tj in range(math.floor((fcy - R - CB[1]) / size), math.floor((fcy + R - CB[1]) / size) + 1):
            if 0 <= ti <= 2 and 0 <= tj <= 2: continue
            if box(*tile_box(ti, tj)).intersects(circle): tiles.append((ti, tj))
    print(f"{len(tiles)} tiles of {size:.1f} m, {CELLS} cells of {D:.4f} m")
    os.makedirs(out_dir, exist_ok=True)
    out_of = lambda t: os.path.join(out_dir, f"{t[0]}_{t[1]}.json")
    todo = [t for t in tiles if (only is None or t in only) and (force or not os.path.exists(out_of(t)))]
    print(f"{len(todo)} to build")

    # ---- cut the layers into what each tile needs ----------------------------------------
    split_root = os.path.join(src_dir, "split")
    split_of = lambda t: os.path.join(split_root, f"{t[0]}_{t[1]}")
    need = [t for t in todo if force or not os.path.exists(os.path.join(split_of(t), ".done"))]
    if need:
        t0 = time.time()
        lon0, lat0 = A.centre
        kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
        boxes = np.array([tile_box(*t) for t in need])
        chosen = {t: {} for t in need}
        for layer in LAYERS:
            feats = json.load(open(os.path.join(src_dir, f"{layer}.geojson")))["features"]
            bb = np.array([shape(f["geometry"]).bounds for f in feats]).reshape(-1, 4)
            bx = np.stack([(bb[:, 0] - lon0) * kx, (bb[:, 1] - lat0) * ky, (bb[:, 2] - lon0) * kx, (bb[:, 3] - lat0) * ky], 1)
            text = [None] * len(feats)
            pad = PAD.get(layer, 650)
            for t, (x0, y0, x1, y1) in zip(need, boxes):
                idx = np.nonzero((bx[:, 2] >= x0 - pad) & (bx[:, 0] <= x1 + pad) & (bx[:, 3] >= y0 - pad) & (bx[:, 1] <= y1 + pad))[0]
                for i in idx:
                    if text[i] is None: text[i] = json.dumps(feats[i], separators=(",", ":"))
                chosen[t][layer] = [text[i] for i in idx]       # in the layer's own order
            print(f"split {layer}: {len(feats)} features ({time.time() - t0:.0f}s)")
            for t in need:
                d = split_of(t)
                os.makedirs(d, exist_ok=True)
                with open(os.path.join(d, f"{layer}.geojson"), "w") as f:
                    f.write('{"type":"FeatureCollection","features":[' + ",".join(chosen[t][layer]) + "]}")
                chosen[t][layer] = None
            del feats, text
        for t in need:
            d = split_of(t)
            for link in ("canopy", "terrain15", "lidar"):
                target = os.path.abspath(os.path.join(src_dir, link))
                os.makedirs(target, exist_ok=True)
                if not os.path.islink(os.path.join(d, link)): os.symlink(target, os.path.join(d, link))
            open(os.path.join(d, ".done"), "w").write("")
        print(f"split the layers for {len(need)} tiles in {time.time() - t0:.0f}s")

    # ---- build them, a few at once ----------------------------------------------------------
    done, failed, start = [], [], time.time()

    def build(t):
        t0 = time.time()
        log = os.path.join(split_of(t), "build.log")
        tmp = out_of(t) + ".tmp"
        with open(log, "w") as f:
            r = subprocess.run([sys.executable, "-I", os.path.join(TOOLS, "prep_map.py"), map_id, split_of(t), tmp, "--tile", str(t[0]), str(t[1])],
                               stdout=f, stderr=subprocess.STDOUT)
        secs = time.time() - t0
        if r.returncode == 0 and os.path.exists(tmp):
            os.replace(tmp, out_of(t))
            done.append((t, secs))
            last = open(log).read().strip().splitlines()[-1]
            print(f"[{len(done) + len(failed)}/{len(todo)}] {t[0]}_{t[1]} in {secs:.0f}s: {last.split('; ')[-1]}"
                  f"  ({time.time() - start:.0f}s so far)", flush=True)
        else:
            failed.append(t)
            print(f"[{len(done) + len(failed)}/{len(todo)}] {t[0]}_{t[1]} FAILED after {secs:.0f}s, see {log}", flush=True)

    with ThreadPoolExecutor(jobs) as pool:
        list(pool.map(build, todo))

    # ---- the index, and what it all came to ------------------------------------------------------
    built = [list(t) for t in tiles if os.path.exists(out_of(t))]
    json.dump(dict(x0=CB[0], y0=CB[1], dx=D, cells=CELLS, z0=CT["z0"], tiles=built),
              open(os.path.join(out_dir, "tiles.json"), "w"), separators=(",", ":"))
    raw = sum(os.path.getsize(out_of(t)) for t in built)
    zipped = sum(len(gzip.compress(open(out_of(t), "rb").read(), 6)) for t in built)    # about what the server sends
    print(f"{len(built)} of {len(tiles)} tiles built, {raw / 1e6:.1f} MB ({zipped / 1e6:.1f} MB gzipped)"
          + (f"; {len(failed)} failed: {' '.join(f'{a}_{b}' for a, b in failed)}" if failed else ""))
    if done: print(f"this run: {len(done)} tiles in {time.time() - start:.0f}s, {sum(s for _, s in done) / len(done):.0f}s each on average")


if __name__ == "__main__":
    main()
