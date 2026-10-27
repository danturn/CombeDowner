"""The partition as the last stage of the map build: `prep_tiles.py` runs it after its squares.

Usage: python3 -I tools/partition/stage.py <map> <dir with the wide layers> <out dir> [--only ti,tj ...] [--jobs n]

`prep_tiles.py` writes `prep_map.py`'s squares into `<dir>/partition/prep/`, not into the game's
folder. This stage then lays the ground out as a partition and writes each square into `<out dir>`,
starting from that square's file in `prep/` (so whatever the partition doesn't own is as
`prep_map.py` built it). The partition's output is never read back as a starting point, so a
rebuild can't stack one partition on another, and no rebuild can put the old-style squares into the
game in its place.

The city-wide passes (the street graph and its corridors, the bridges and road heights, the worked
blocks) and each square's assembly from them run into `<dir>/partition/once/` and
`<dir>/partition/city/` through `pipeline.py`, which gives every stage its own key: its own code and
what it reads (the stage before it, and the parts of the map's layers it looks at). A stage whose key
was built before is taken from the store (`$CD_PARTITION_CACHE`, else `<dir>/partition/cache/`), so
only what a change reaches is built again. A square is written (`write_tile.py`) again only when its
own assembly, what the passes wrote, the map's data, the writer's own tools and kept lidar, or its
`prep_map.py` square have changed, and a square written before under the same key comes from the
store. `--only` divides and assembles only what those squares gather from, and writes only them. The
metrics, checks and city summary come last (`pipeline.py report`), off the map's own path: a change
to them redoes only the reports.

The stage runs for a map marked `partition=True` in `tools/area.py` (Combe Down's Bath, so far the
only one with the Land Registry's parcels and the lidar it needs kept, `measured.py`): for any
other map `prep_tiles.py` builds straight into the game's folder and this stage doesn't run.
Nothing here is decided over the network: it is all build-time.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)

from area import MAPS


def partitioned(map_id):
    return bool(MAPS.get(map_id, {}).get("partition"))


def stage_dir(src_dir):
    return os.path.join(src_dir, "partition")


def prep_dir(src_dir):
    return os.path.join(stage_dir(src_dir), "prep")


def code_files(*roots):
    """The partition's modules `roots` and every tool module they import, found by reading the
    imports rather than by importing, so an import inside a function counts too."""
    seen, todo = set(), [os.path.join(HERE, n) for n in roots]
    while todo:
        p = todo.pop()
        if p in seen:
            continue
        seen.add(p)
        text = open(p).read()
        names = [os.path.join(TOOLS, f"{n}.py") for n in re.findall(r"^\s*(?:from|import)\s+(\w+)", text, re.M)]
        names += [os.path.join(HERE, f"{n}.py") for n in re.findall(r"^\s*from\s+(?:\.|partition\.)(\w+)", text, re.M)]
        for group in re.findall(r"^\s*from\s+(?:\.|partition)\s+import\s+\(?([\w, ]+)", text, re.M):
            names += [os.path.join(HERE, f"{n.strip()}.py") for n in group.split(",")]
        todo += [q for q in names if os.path.exists(q) and q not in seen]
    return sorted(seen)


def digest(paths, extra=()):
    h = hashlib.sha1(repr(list(extra)).encode())
    for p in paths:
        h.update(os.path.relpath(p, ROOT).encode() + b"\0")
        with open(p, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
    return h.hexdigest()


WRITER_REACH = 1000.0    # metres: further than the writer reads any layer from its square


def data_keys(map_id, src_dir, store, tiles):
    """The map's data, for each square's writing: the part of every map layer within WRITER_REACH of
    the square, and the rest of the map's data files whole. The terrain tiles are left out: the
    partition fetches any it lacks into the folder, which would change the key on every run, and
    they're unpacked from the repository's `terrain15.zip`, which is in."""
    from partition import cache
    from partition.data import box_of
    data = os.path.join(ROOT, "data", map_id)
    kept = os.path.join(data, "measured", "partition.zip")      # the writer's alone
    layers = sorted(n[:-8] for n in os.listdir(src_dir) if n.endswith(".geojson"))
    inputs = []
    for d, sub, names in os.walk(data):
        sub[:] = sorted(sub)
        inputs += [os.path.join(d, n) for n in sorted(names) if not n.startswith(".")
                   and os.path.join(d, n) != kept and not n.endswith(".geojson.xz")]
    maps = os.path.join(ROOT, "web", "public", "maps")
    inputs += [p for p in (os.path.join(maps, f"{map_id}-{k}.json") for k in ("canal", "rail")) if os.path.exists(p)]
    whole = digest(inputs)
    L = cache.Layers(src_dir, store)
    return {t: digest([], (whole, [L.digest(n, box_of(*t), WRITER_REACH) for n in layers])) for t in tiles}


def read(path):
    return open(path).read() if os.path.exists(path) else None


def run(cmd, log):
    with open(log, "w") as f:
        return subprocess.run([sys.executable, "-I", *cmd], stdout=f, stderr=subprocess.STDOUT,
                              env=dict(os.environ, CD_PARTITION_QUICK="1")).returncode


def write(job):
    from partition import measured
    from partition.write_tile import write_one
    measured.missed[0] = 0
    r = write_one(job)
    r["missed"] = measured.missed[0]
    return r


def main(argv):
    only = None
    if "--only" in argv:
        k = argv.index("--only")
        only = {tuple(int(v) for v in a.split(",")) for a in argv[k + 1:]}
        argv = argv[:k]
    jobs = os.cpu_count() or 4
    if "--jobs" in argv:
        k = argv.index("--jobs")
        jobs = int(argv[k + 1])
        argv = argv[:k] + argv[k + 2:]
    map_id, src_dir, out_dir = argv[:3]
    if not partitioned(map_id):
        print(f"partition: not set up for {map_id}")
        return 0
    os.environ["CD_MAP"] = map_id
    os.environ["CD_PARTITION_QUICK"] = "1"
    from partition import MAP
    assert MAP == map_id
    from partition.city import squares
    from partition.measured import PATH as KEPT
    from partition.write_tile import drop_edge_stubs, string_city_wires
    if not os.path.exists(KEPT):
        sys.exit(f"partition: {KEPT} is missing, and without it the map would quietly come out different: "
                 "pack it from the lidar (tools/mapdata.py pack)")

    base, root = prep_dir(src_dir), stage_dir(src_dir)
    once, city, keys = (os.path.join(root, n) for n in ("once", "city", "keys"))
    os.makedirs(keys, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    built = sorted(tuple(int(v) for v in n[:-5].split("_")) for n in os.listdir(base)
                   if re.fullmatch(r"-?\d+_-?\d+\.json", n))
    wanted = [t for t in built if only is None or t in only]
    ours = set(squares())
    name = lambda t: f"{t[0]}_{t[1]}"
    start = time.time()

    # every stage up to the assembly, each kept in the store under its own key (pipeline.py)
    store = os.environ.get("CD_PARTITION_CACHE") or os.path.join(root, "cache")
    t0 = time.time()
    result = os.path.join(root, "build.json")
    if os.path.exists(result):
        os.remove(result)
    print(f"partition: the passes and {len(wanted)} squares' assembly (log in {root}/city.log, store {store})",
          flush=True)
    run([os.path.join(HERE, "pipeline.py"), "build", src_dir, once, city, store, str(jobs), result,
         *([] if only is None else [f"{a},{b}" for a, b in wanted])], os.path.join(root, "city.log"))
    if not os.path.exists(result):
        sys.exit(f"partition: the passes failed, see {root}/city.log")
    passes = json.load(open(result))
    failed = {tuple(s) for s in passes["failed"]}
    print(f"partition: assembled in {time.time() - t0:.0f}s, stages run: {passes['ran'] or 'none'}"
          + (f"; {len(failed)} failed: {' '.join(map(name, sorted(failed)))}" if failed else ""), flush=True)

    # a square is written again when its prep_map square, its own assembly, what the passes wrote,
    # the map's data or the writer has changed
    from partition import cache
    wt = os.path.join(HERE, "write_tile.py")
    writer = cache.key_of(cache.code_key((wt, "write_one"), (wt, "drop_edge_stubs"), (wt, "string_city_wires"),
                                         (os.path.join(HERE, "measured.py"), "missed")),
                          cache.file_digest(KEPT), cache.libraries())
    data = data_keys(map_id, src_dir, store, wanted)
    wkey = lambda t: digest([os.path.join(base, name(t) + ".json")],
                            (passes["partition"].get(name(t)), passes["upstream"], data[t], writer))
    out_of = lambda t: os.path.join(out_dir, name(t) + ".json")
    todo, copy = [], []
    for t in wanted:
        if t in failed or t not in ours:
            copy.append(t)
        elif not os.path.exists(out_of(t)) or read(os.path.join(keys, name(t) + ".tile")) != wkey(t):
            todo.append(t)
    def keep_prep(t):
        shutil.copyfile(os.path.join(base, name(t) + ".json"), out_of(t))
        if os.path.exists(os.path.join(keys, name(t) + ".tile")):
            os.remove(os.path.join(keys, name(t) + ".tile"))
    for t in copy:
        keep_prep(t)
    if todo:
        from concurrent.futures import ProcessPoolExecutor
        t0 = time.time()
        from partition.cache import Store
        st = Store(store)
        # a square written before under the same key comes from the store, as it was before the seams
        kept = {t for t in todo if st.get("write", wkey(t), out_dir) is not None}
        print(f"partition: writing {len(todo) - len(kept)} squares ({len(kept)} from the store)", flush=True)
        jobs_ = [(a, b, out_dir, once, city, os.path.join(base, name((a, b)) + ".json"))
                 for a, b in todo if (a, b) not in kept]
        wrote, missed = set(), 0
        with ProcessPoolExecutor(jobs) as pool:
            # the biggest squares start first; results are taken in square order, which the seams use
            part = lambda j: os.path.join(city, name((j[0], j[1])), "partition.json")
            size = lambda j: os.path.getsize(part(j)) if os.path.exists(part(j)) else 0
            from partition.once import _timed, pool_use
            futures, spans, tp = {}, [], time.time()
            for k in sorted(range(len(jobs_)), key=lambda k: -size(jobs_[k])):
                futures[k] = pool.submit(_timed, write, jobs_[k])
            for k in range(len(jobs_)):
                r, pid, a, b = futures[k].result()
                spans.append((pid, a - tp, b - tp, name(jobs_[k][:2])))
                t = tuple(r["square"])
                if "failed" in r:
                    print(f"  {name(t)} FAILED ({r['failed']}): left as prep_map built it", flush=True)
                    keep_prep(t)
                    failed.add(t)
                else:
                    st.put("write", wkey(t), out_dir, [name(t) + ".json"])
                    wrote.add(t)
                    missed += r["missed"]
        if spans:
            print("  " + pool_use("writing", spans, time.time() - tp, jobs), flush=True)
        done = [t for t in todo if t in kept or t in wrote]
        stubs = drop_edge_stubs(out_dir, done)
        loose_wires = string_city_wires(out_dir, done)
        for t in done:
            open(os.path.join(keys, name(t) + ".tile"), "w").write(wkey(t))
        print(f"partition: {len(done)} squares written in {time.time() - t0:.0f}s, {stubs} stubs at the edges dropped, "
              f"{loose_wires} wires with no pole left out", flush=True)
        if missed:
            # a dozen or so are the far ends of paths the old build dipped for bridges of its own
            print(f"partition: {missed} points under bridges had no kept lidar ground"
                  + (": pack it again (tools/mapdata.py pack)" if missed > 100 else ""))
    # the metrics, checks and the city summary: they only report, so they come after the map is written
    t0 = time.time()
    run([os.path.join(HERE, "pipeline.py"), "report", src_dir, once, city, store, str(jobs),
         *([] if only is None else [f"{a},{b}" for a, b in wanted])], os.path.join(root, "report.log"))
    print(f"partition: reports in {time.time() - t0:.0f}s (log in {root}/report.log)", flush=True)
    print(f"partition: {len(wanted) - len(todo) - len(copy)} squares unchanged, "
          f"{len(copy) - len(failed & set(copy))} outside the partition kept as prep_map built them, "
          f"{time.time() - start:.0f}s in all")
    if failed:
        print(f"partition: {len(failed)} squares failed: {' '.join(map(name, sorted(failed)))}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
