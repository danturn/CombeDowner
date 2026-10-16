"""Run the three reference squares and print the plan's status table.

Usage: python3 -I tools/partition/compare.py [--out out] [--raw <dir>] [--terrain <dir>]

Builds squares 1,1 (the village), 0,0 (the estate west of it) and 0,3 (the city centre) and prints
the table the plan keeps at its top: barrier ends touching nothing, mid-street width/pavement
steps, one surface with no overlaps or holes, the carriageway width fitted with the width tag
hidden, and the share of plot edge lying on evidence. Run it before every push; the numbers must
not get worse.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from partition import MAP, ROOT
from partition import once
from partition.__main__ import build
from partition.data import neighbours

SQUARES = [(1, 1), (0, 0), (0, 3)]


def ensure_once(raw, out, once, jobs, log=print):
    """Make sure the passes' output exists for the squares to assemble from, and return its folder.

    Stage 3b moved the building of the ground itself into passes 1 and 2, so a square can no longer
    build alone: it assembles from the corridors and worked blocks those passes wrote, for itself and
    its eight neighbours. So this checks the folder and, if it is missing or too small to cover the
    squares, runs the passes first - one command still does the whole check."""
    need = set()
    for ti, tj in SQUARES:
        for a, b in neighbours(ti, tj):
            need.add((a, b))
    have = {tuple(int(v) for v in d.split("_"))
            for d in os.listdir(once) if os.path.isdir(os.path.join(once, d)) and "_" in d} \
        if os.path.isdir(once) else set()
    if not os.path.exists(os.path.join(once, "blocks.json")) or not need <= have:
        log(f"compare: the passes are not in {once} (or do not cover these squares); running them")
        os.makedirs(once, exist_ok=True)
        once.pass_streets(once, raw, jobs=jobs, log=log)
        once.pass_blocks(once, raw, jobs=jobs, log=log)
    return once


def run(out=None, raw=None, terrain=None):
    raw = raw or os.path.join(ROOT, "data", "raw", MAP, "wide")
    terrain = terrain or os.path.join(raw, "terrain15")
    out = out or os.path.join(ROOT, "out", "compare")
    once_dir = ensure_once(raw, out, os.path.join(ROOT, "out", "once-p1"),
                           os.cpu_count() or 4)
    rows = {}
    for ti, tj in SQUARES:
        m = build(ti, tj, os.path.join(out, f"{ti}_{tj}"), raw, terrain, once=once_dir)
        rows[(ti, tj)] = m
        print()
    print("=" * 118)
    print(f"{'square':>8} | {'barriers cur':>12} {'free cur':>9} {'free part':>10} {'loose in':>8} | "
          f"{'steps cur':>9} {'xsect chg':>9} | {'uncovered m2':>12} {'overlap m2':>10} | "
          f"{'held >1m/ n':>11} {'med err':>8} | {'evid share':>10} {'on parcel':>9}")
    for sq, m in rows.items():
        cb = m.get("current_build", {})
        hw, hn = m["held_out_within_1m"], m["held_out_widths"]
        med = m["held_out_median_error"]
        print(f"{str(sq):>8} | {cb.get('barriers', 0):>12} {cb.get('barriers_free_ends', 0):>9} "
              f"{m['plot_edges_free_ends']:>10} {m['plot_edges_loose_ends_inside']:>8} | "
              f"{cb.get('pavement_steps', 0):>9} "
              f"{m['cross_section_changes']:>9} | {m['surface_uncovered_m2']:>12} "
              f"{m['surface_overlap_m2']:>10} | {f'{hw}/{hn}' if hn else '-':>11} "
              f"{'-' if med is None else f'{med:.2f}':>8} | {m['plot_edge_support_mean'] * 100:>9.1f}% "
              f"{m['plot_edges_on_parcel_edge'] * 100:>8.1f}%")
    print("\nfree part: plot edges with an end touching nothing, all of them on the worked area's "
          "edge.\nloose in:  of those, the ones inside it (a boundary stopping in mid-air) — the "
          "number that must be zero.\non parcel: share of plot edge length on a registered parcel "
          "boundary (HM Land Registry's INSPIRE Index Polygons).")
    return rows


def main():
    argv = sys.argv[1:]
    kw = {}
    for flag, key in (("--out", "out"), ("--raw", "raw"), ("--terrain", "terrain")):
        if flag in argv:
            kw[key] = argv[argv.index(flag) + 1]
    run(**kw)


if __name__ == "__main__":
    main()
