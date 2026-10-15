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
from partition.__main__ import build

SQUARES = [(1, 1), (0, 0), (0, 3)]


def run(out=None, raw=None, terrain=None):
    raw = raw or os.path.join(ROOT, "data", "raw", MAP, "wide")
    terrain = terrain or os.path.join(raw, "terrain15")
    out = out or os.path.join(ROOT, "out", "compare")
    rows = {}
    for ti, tj in SQUARES:
        m = build(ti, tj, os.path.join(out, f"{ti}_{tj}"), raw, terrain)
        rows[(ti, tj)] = m
        print()
    print("=" * 100)
    print(f"{'square':>8} | {'barriers cur':>12} {'free cur':>9} {'free part':>10} | "
          f"{'steps cur':>9} {'xsect chg':>9} | {'uncovered m2':>12} {'overlap m2':>10} | "
          f"{'held >1m/ n':>11} {'med err':>8} | {'evid share':>10}")
    for sq, m in rows.items():
        cb = m.get("current_build", {})
        hw, hn = m["held_out_within_1m"], m["held_out_widths"]
        med = m["held_out_median_error"]
        print(f"{str(sq):>8} | {cb.get('barriers', 0):>12} {cb.get('barriers_free_ends', 0):>9} "
              f"{m['plot_edges_free_ends']:>10} | {cb.get('pavement_steps', 0):>9} "
              f"{m['cross_section_changes']:>9} | {m['surface_uncovered_m2']:>12} "
              f"{m['surface_overlap_m2']:>10} | {f'{hw}/{hn}' if hn else '-':>11} "
              f"{'-' if med is None else f'{med:.2f}':>8} | {m['plot_edge_support_mean'] * 100:>9.1f}%")
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
