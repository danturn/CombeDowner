"""Check the partition's store: compare a build that took what it could from the store with one built
from an empty store, file by file, and name the first stage whose outputs differ.

Usage: python3 -I tools/partition/verify.py <warm maps dir> <cold maps dir> <warm stages.json> <cold stages.json>

`tools/mac_build.sh --verify` runs both builds and then this. A stage's key is found by reading its
source, so a function looked up by a name made at run time, an environment variable or a file read
outside the layers the key covers can change what a stage gives without changing its key; the warm
build then takes a stale entry, and only a build from an empty store shows it. The stages.json files
(written by `stage.py` and `pipeline.py`) hold the digest of every stage's outputs, square by square.
Prints "identical" or what differs, and exits 1 on any difference. It is all build-time.
"""
import filecmp
import json
import os
import sys

# the order the build runs them in: the first that differs is where a stale key starts
ORDER = ("prep", "graph", "corridors", "structures", "pieces", "divide", "assemble", "write", "report")


def files_under(root):
    return {os.path.relpath(os.path.join(d, n), root) for d, _, ns in os.walk(root) for n in ns}


def compare_maps(warm, cold):
    a, b = files_under(warm), files_under(cold)
    differ = sorted(f for f in a & b if not filecmp.cmp(os.path.join(warm, f), os.path.join(cold, f), shallow=False))
    return differ, sorted(a - b), sorted(b - a)


def compare_stages(warm, cold):
    """[(stage, [output files whose digest differs, or that only one build has])] in build order."""
    w = json.load(open(warm)) if os.path.exists(warm) else {}
    c = json.load(open(cold)) if os.path.exists(cold) else {}
    out = []
    for stage in [s for s in ORDER if s in w or s in c] + sorted((set(w) | set(c)) - set(ORDER)):
        ws, cs = w.get(stage, {}), c.get(stage, {})
        bad = sorted(f for f in set(ws) | set(cs) if ws.get(f) != cs.get(f))
        if bad:
            out.append((stage, bad))
    return out


def main(argv):
    warm, cold, warm_st, cold_st = argv[:4]
    differ, only_warm, only_cold = compare_maps(warm, cold)
    stages = compare_stages(warm_st, cold_st)
    same = not (differ or only_warm or only_cold)
    lines = []
    if same:
        n = len(files_under(warm))
        lines.append(f"identical: all {n} map files are the same, byte for byte, from the store and from an empty one")
    else:
        lines.append(f"DIFFERENT: {len(differ)} map files differ, {len(only_warm)} only from the store, "
                     f"{len(only_cold)} only from an empty store")
        lines += [f"  differs: {f}" for f in differ]
        lines += [f"  only from the store: {f}" for f in only_warm]
        lines += [f"  only from an empty store: {f}" for f in only_cold]
    if stages:
        first, files = stages[0]
        why = (" (outside the store: the build itself came out different)" if first == "prep" else
               " (only the reports, which never reach the map)" if first == "report" else
               ": its key missed something it reads" if not same else "")
        lines.append(f"first stage whose outputs differ: {first}{why}")
        for stage, files in stages:
            shown = ", ".join(files[:8]) + (f" and {len(files) - 8} more" if len(files) > 8 else "")
            lines.append(f"  {stage}: {len(files)} outputs differ: {shown}")
    elif not same:
        lines.append("no stage's outputs differ: the files that do are built outside the partition's store")
    print("\n".join(lines))
    return 0 if same else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
