"""Build the whole of Bath round a detailed map as tiles, at the detailed map's level of detail.

Usage: python3 -I tools/prep_tiles.py <map> <dir with the wide .geojson layers> <out dir> [--force] [--keep] [--measure] [--jobs 4] [--shard k/n] [--only ti,tj ...]

e.g. python3 -I tools/prep_tiles.py combe-down data/raw/combe-down/wide web/public/maps/combe-down

The dir is the one tools/prep_wide.py uses (the wide Overture layers and the canopy tile, see
docs/new-area.md, and the OpenStreetMap and food hygiene downloads for the shops), and the detailed map (web/public/maps/<map>.json) must be built first: the
tiles carry on its terrain grid and meet its edges. Each tile is one ordinary map file built by
tools/prep_map.py with --tile (see there for what a tile keeps), 261 x 261 of the detailed map's
grid cells (a little over a kilometre) square. Every tile that reaches into the wide force
field's data circle is built, except the nine the detailed map covers.

To keep each build quick, the layers are first cut once into what each tile needs (a tile reads
the features within 650 m of it, and the water within 1300 m), in <dir>/split/<ti>_<tj>/. The
Mapzen terrain tiles are kept in <dir>/terrain15/ so they're only downloaded once. The cut is
only made again when the wide layers change. A tile is only built again when something it's built
from has changed: its cut of the layers, the shared lidar, canopy, terrain and certificates, the
canal and railway files, or any of the map tools (what it was built from is kept in
<dir>/split/<ti>_<tj>/.built); --force builds them all anyway. With --keep, a square that is rebuilt carries over its earlier
build's lidar-measured buildings wherever this build's lidar doesn't reach (prep_map.py
--buildings-from), so a rebuild without every lidar tile loses no measured roofs. As many builds
run at once as the machine has cores, unless --jobs says otherwise.

What each square takes from the lidar and the tree canopy map (its buildings' heights, roofs and
roof levels, and the canopy) is read from its measurements in the repository,
data/<map>/measured/<ti>_<tj>.zip (see tools/mapdata.py), so neither is needed. With --measure it
is worked out afresh from the lidar and the canopy map in <dir> instead, and the measurements are
written over: the map comes out the same either way, from the same data.

Writes <out dir>/<ti>_<tj>.json for each tile and <out dir>/tiles.json, which says how they're laid out:
{"x0", "y0": the south-west corner of tile (0, 0), metres east and north of the map centre;
 "dx": the grid spacing; "cells": grid cells per tile side; "z0": the height every tile's
 terrain is measured from; "tiles": [[ti, tj], ...]}.
"""
import base64, hashlib, json, math, os, subprocess, sys, time, gzip
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import shapely
from shapely.geometry import shape, box, Point

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area
from mapdata import measured_dir

TOOLS = os.path.dirname(os.path.abspath(__file__))
CELLS = 261
LAYERS = ["building", "segment", "water", "land_use", "land", "land_cover", "place", "infrastructure"]
SHOPS = ["osm", "fsa", "osm-roads"]      # where the shops are (tools/osm.py, tools/fsa.py), and the streets' OpenStreetMap tags (tools/osm.py roads), if they've been downloaded
PAD = {"water": 1300}       # metres round a tile that its build reads; 650 for everything else
# Overture's huge outlines that no square's build reads: the land of Great Britain itself and its
# island groups (a million points of coastline, re-read by every square), and the nature
# designations that cover whole districts (the Cotswolds, the bats' conservation areas: prep_map
# leaves these out of the named places too). Left out of the squares' layers only; if a square
# ever needs them, take them off this list.
SKIP = {"land": lambda p: p.get("class") in ("island", "archipelago"),
        "land_use": lambda p: p.get("class") in ("protected_landscape_seascape", "wilderness_area", "species_management_area")}


def files(*roots):
    """Every file under roots (following links), sorted, leaving out our own dot files."""
    out = []
    for root in roots:
        if os.path.isfile(root): out.append(root); continue
        for d, sub, names in os.walk(root, followlinks=True):
            sub[:] = sorted(s for s in sub if not s.startswith("."))
            out += [os.path.join(d, n) for n in sorted(names) if not n.startswith(".")]
    return out


def stamp(paths):
    """What each file is by its size and when it last changed: cheap, for the big shared data."""
    return [(p, os.path.getsize(p), os.path.getmtime(p)) for p in paths]


def digest(paths, extra=()):
    """A fingerprint of the files' contents (and anything else that decides a build)."""
    h = hashlib.sha1(repr(list(extra)).encode())
    for p in paths:
        h.update(p.encode() + b"\0")
        with open(p, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()


def main():
    args = sys.argv[1:]
    force = "--force" in args
    if force: args.remove("--force")
    keep = "--keep" in args
    if keep: args.remove("--keep")
    measure = "--measure" in args
    if measure: args.remove("--measure")
    jobs = os.cpu_count() or 4
    if "--jobs" in args:
        k = args.index("--jobs"); jobs = int(args[k + 1]); del args[k:k + 2]
    shard = None        # k/n: build only the k-th of n shares of the squares, for several machines at once
    if "--shard" in args:
        k = args.index("--shard"); shard = tuple(int(v) for v in args[k + 1].split("/")); del args[k:k + 2]
    only = None
    if "--only" in args:
        k = args.index("--only")
        only = [tuple(int(v) for v in a.split(",")) for a in args[k + 1:]]
        del args[k:]
    map_id, src_dir, out_dir = args[:3]
    A = area(map_id, wide=True)
    G = A.squares
    D, X0, Y0 = G.dx, G.x0, G.y0
    size = CELLS * D
    tile_box = lambda ti, tj: (X0 + ti * CELLS * D, Y0 + tj * CELLS * D, X0 + (ti + 1) * CELLS * D, Y0 + (tj + 1) * CELLS * D)
    is_core = lambda t: 0 <= t[0] <= 2 and 0 <= t[1] <= 2

    # ---- which tiles: every one reaching into the data circle ----------------------------------
    (fcx, fcy), R = A.field_centre, A.half
    circle = Point(fcx, fcy).buffer(R, 256)
    tiles = []
    for ti in range(math.floor((fcx - R - X0) / size), math.floor((fcx + R - X0) / size) + 1):
        for tj in range(math.floor((fcy - R - Y0) / size), math.floor((fcy + R - Y0) / size) + 1):
            if is_core((ti, tj)) or box(*tile_box(ti, tj)).intersects(circle): tiles.append((ti, tj))
    print(f"{len(tiles)} tiles of {size:.1f} m, {CELLS} cells of {D:.4f} m")
    os.makedirs(out_dir, exist_ok=True)
    core_dir = os.path.join(src_dir, "core")      # the detailed area's nine, kept here to be stitched together
    os.makedirs(core_dir, exist_ok=True)
    out_of = lambda t: os.path.join(core_dir if is_core(t) else out_dir, f"{t[0]}_{t[1]}.json")
    wanted = [t for t in tiles if only is None or t in only]
    if shard:
        # the village's nine together in share 0 (they're stitched into one file), the rest dealt
        # round the other shares in turn
        k, n = shard
        rest = [t for t in wanted if not is_core(t)]
        wanted = [t for t in wanted if is_core(t)] if k == 0 and n > 1 else []
        wanted += [t for i, t in enumerate(rest) if n == 1 or i % (n - 1) + 1 == k]

    # ---- cut the layers into what each tile needs ----------------------------------------
    # done again whenever the wide layers or this file change (the cut is written in .done)
    split_root = os.path.join(src_dir, "split")
    split_of = lambda t: os.path.join(split_root, f"{t[0]}_{t[1]}")
    layer_files = [os.path.join(src_dir, f"{l}.geojson") for l in LAYERS + SHOPS if os.path.exists(os.path.join(src_dir, f"{l}.geojson"))]
    cut = digest([os.path.abspath(__file__)], stamp(layer_files))
    done_of = lambda t: os.path.join(split_of(t), ".done")
    need = [t for t in wanted if force or not os.path.exists(done_of(t)) or open(done_of(t)).read() != cut]
    if need:
        t0 = time.time()
        lon0, lat0 = A.centre
        kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
        boxes = np.array([tile_box(*t) for t in need])
        chosen = {t: {} for t in need}
        for layer in LAYERS + [l for l in SHOPS if os.path.exists(os.path.join(src_dir, f"{l}.geojson"))]:
            feats = json.load(open(os.path.join(src_dir, f"{layer}.geojson")))["features"]
            if layer in SKIP: feats = [f for f in feats if not SKIP[layer](f["properties"])]
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
            for link in ("canopy", "terrain15", "lidar", "epc"):
                target = os.path.abspath(os.path.join(src_dir, link))
                os.makedirs(target, exist_ok=True)
                if not os.path.islink(os.path.join(d, link)): os.symlink(target, os.path.join(d, link))
            open(os.path.join(d, ".done"), "w").write(cut)
        print(f"split the layers for {len(need)} tiles in {time.time() - t0:.0f}s")

    # ---- which need building: a square is built again only when something it's built from has
    # changed: its own cut of the layers, the shared data it reads (lidar, canopy, terrain,
    # certificates), the canal and railway files, or any of the map tools
    t0 = time.time()
    tools = digest([p for p in files(TOOLS) if p.endswith(".py") and p != os.path.abspath(__file__)])   # this file: in the cut
    shared = stamp(files(*(os.path.join(src_dir, l) for l in ("canopy", "terrain15", "lidar", "epc"))))
    maps = os.path.join(TOOLS, "..", "web", "public", "maps")
    lines = [p for p in (os.path.join(maps, f"{map_id}-{k}.json") for k in ("canal", "rail")) if os.path.exists(p)]
    # and, built from the repository's measurements, its own measurements file
    kept = lambda t: [] if measure else [p for p in [os.path.join(measured_dir(map_id), f"{t[0]}_{t[1]}.zip")] if os.path.exists(p)]
    key_of = lambda t: digest([p for p in files(split_of(t)) if p.endswith(".geojson") and os.path.dirname(p) == split_of(t)] + lines + kept(t),
                              (tools, shared, keep, measure, t))
    built_of = lambda t: os.path.join(split_of(t), ".built")
    keys = {t: key_of(t) for t in wanted}
    same = lambda t: os.path.exists(out_of(t)) and os.path.exists(built_of(t)) and open(built_of(t)).read() == keys[t]
    todo = [t for t in wanted if force or not same(t)]
    print(f"{len(todo)} to build, {len(wanted) - len(todo)} unchanged since they were last built ({time.time() - t0:.0f}s to check)")

    # ---- build them, a few at once ----------------------------------------------------------
    done, failed, start = [], [], time.time()

    def build(t):
        t0 = time.time()
        log = os.path.join(split_of(t), "build.log")
        tmp = out_of(t) + ".tmp"
        with open(log, "w") as f:
            earlier = ["--buildings-from", out_of(t)] if keep and os.path.exists(out_of(t)) else []
            measured = ["--measure" if measure else "--measured", os.path.join(measured_dir(map_id), f"{t[0]}_{t[1]}.zip")]
            r = subprocess.run([sys.executable, "-I", os.path.join(TOOLS, "prep_map.py"), map_id, split_of(t), tmp, "--tile", str(t[0]), str(t[1]), *earlier, *measured],
                               stdout=f, stderr=subprocess.STDOUT)
        secs = time.time() - t0
        if r.returncode == 0 and os.path.exists(tmp):
            os.replace(tmp, out_of(t))
            open(built_of(t), "w").write(keys[t])
            done.append((t, secs))
            last = open(log).read().strip().splitlines()[-1]
            print(f"[{len(done) + len(failed)}/{len(todo)}] {t[0]}_{t[1]} in {secs:.0f}s: {last.split('; ')[-1]}"
                  f"  ({time.time() - start:.0f}s so far)", flush=True)
        else:
            failed.append(t)
            print(f"[{len(done) + len(failed)}/{len(todo)}] {t[0]}_{t[1]} FAILED after {secs:.0f}s, see {log}", flush=True)

    with ThreadPoolExecutor(jobs) as pool:
        list(pool.map(build, todo))

    # ---- the detailed area: its nine squares as one file ----------------------------------------
    core_path = os.path.join(TOOLS, "..", "web", "public", "maps", f"{map_id}.json")
    nine = [t for t in tiles if is_core(t)]
    if all(os.path.exists(out_of(t)) for t in nine) and (any(is_core(t) for t, _ in done) or not os.path.exists(core_path)):
        stitch(area(map_id), G, [json.load(open(out_of(t))) for t in nine], core_path)

    # ---- the index, and what it all came to ------------------------------------------------------
    built = [list(t) for t in tiles if not is_core(t) and os.path.exists(out_of(t))]
    json.dump(dict(x0=X0, y0=Y0, dx=D, cells=CELLS, z0=G.z0, tiles=built),
              open(os.path.join(out_dir, "tiles.json"), "w"), separators=(",", ":"))
    raw = sum(os.path.getsize(out_of(t)) for t in built)
    zipped = sum(len(gzip.compress(open(out_of(t), "rb").read(), 6)) for t in built)    # about what the server sends
    print(f"{len(built)} of {len(tiles) - len(nine)} tiles built, {raw / 1e6:.1f} MB ({zipped / 1e6:.1f} MB gzipped)"
          + (f"; {len(failed)} failed: {' '.join(f'{a}_{b}' for a, b in failed)}" if failed else ""))
    if done: print(f"this run: {len(done)} tiles in {time.time() - start:.0f}s, {sum(s for _, s in done) / len(done):.0f}s each on average")
    if failed: sys.exit(1)


def stitch(A, G, parts, path):
    """The detailed area's nine squares as one map file, in the same form as a square, for the game
    to load first: what each square keeps is its own, so the lists just run on, and the terrain and
    the wood canopy are laid into one grid (neighbouring squares share their edge vertices)."""
    n = 3 * G.cells
    h = np.zeros((n + 1, n + 1), dtype=np.int64)
    k = np.zeros((n + 1, n + 1), dtype=np.uint8)
    cn = np.zeros((n, n), dtype=np.uint8)
    d = dict(id=A.id, name=A.name, release=parts[0]["release"], centre=A.centre, field=A.field, fc=list(A.field_centre),
             b=[round(G.x0, 1), round(G.y0, 1), round(G.x0 + n * G.dx, 1), round(G.y0 + n * G.dx, 1)], bk=parts[0]["bk"],
             v=list(A.view) if getattr(A, "view", None) else None,
             t=dict(nx=n + 1, ny=n + 1, x0=G.x0, y0=G.y0, dx=G.dx, dy=G.dx, z0=G.z0), spawn=None)
    for p in parts:
        ti, tj = p["tile"]
        T, i0, j0 = p["t"], ti * G.cells, tj * G.cells
        h[j0:j0 + T["ny"], i0:i0 + T["nx"]] = np.array(T["h"]).reshape(T["ny"], T["nx"])
        k[j0:j0 + T["ny"], i0:i0 + T["nx"]] = (np.frombuffer(T["k"].encode(), dtype=np.uint8) - 48).reshape(T["ny"], T["nx"])
        C = p.get("cn")
        if C:
            ci, cj = round((C["x0"] - G.x0) / G.dx - 0.5), round((C["y0"] - G.y0) / G.dx - 0.5)
            cn[cj:cj + C["ny"], ci:ci + C["nx"]] = np.frombuffer(base64.b64decode(C["h"]), dtype=np.uint8).reshape(C["ny"], C["nx"])
        d["spawn"] = d["spawn"] or p.get("spawn")
        for key, v in p.items():
            if isinstance(v, list) and key not in ("centre", "fc", "b", "tile", "spawn"): d.setdefault(key, []).extend(v)
    # a shrub one square planted where its neighbour's gate or front path comes in, at the seam
    # between them, goes: the way through stays clear across the seams too
    ways = ([shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(1.0) for q in d.get("gt", [])]
            + [shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(0.9) for q in d.get("fp", [])]
            + [shapely.LineString([(q[0], q[1]), (q[2], q[3])]).buffer(1.5) for q in d.get("dv", [])])
    if ways and d.get("sb"):
        wt = shapely.STRtree(ways)
        d["sb"] = [q for q in d["sb"] if not len(wt.query(shapely.Point(q[0], q[1]), predicate="within"))]
    # and a front path one square laid across its neighbour's wall, fence or hedge (anywhere but in a
    # gateway) goes, as it does within a square
    if d.get("fp") and d.get("br"):
        bl = [shapely.LineString([q[:2] for q in b["p"]]) for b in d["br"] if len(b["p"]) > 1]
        bt = shapely.STRtree(bl)
        gm = [shapely.Point((g[0] + g[2]) / 2, (g[1] + g[3]) / 2) for g in d.get("gt", [])]
        gtree = shapely.STRtree(gm) if gm else None
        def clear(q):
            ln = shapely.LineString([(q[0], q[1]), (q[2], q[3])])
            for j in bt.query(ln):
                x = bl[int(j)].intersection(ln)
                for c in getattr(x, "geoms", [x]):
                    if c.is_empty: continue
                    if gtree is None or not any(gm[int(g)].distance(c) < 0.9 for g in gtree.query(c.buffer(0.9))): return False
            return True
        d["fp"] = [q for q in d["fp"] if clear(q)]
    d["t"].update(h=h.ravel().tolist(), k="".join(map(str, k.ravel().tolist())))
    d["cn"] = dict(x0=G.x0 + G.dx / 2, y0=G.y0 + G.dx / 2, step=G.dx, nx=n, ny=n, h=base64.b64encode(cn.tobytes()).decode()) if cn.any() else None
    tmp = path + ".tmp"
    json.dump(d, open(tmp, "w"), separators=(",", ":"))
    os.replace(tmp, path)
    print(f"{A.id}: the detailed area stitched from its nine squares, {os.path.getsize(path) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
