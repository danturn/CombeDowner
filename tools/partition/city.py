"""Build every square of a map as a partition, and report what the city came to.

Usage: python3 -I tools/partition/city.py [--only ti,tj ti,tj ...] [--jobs n] [--all] [--out dir]
                                           [--raw dir] [--terrain dir]

`--all` builds every square that reaches the wide force field's data circle (131 of them for
Combe Down); `--only 1,1 0,3` builds just those; both together are taken as `--only`. Without
either, every square is built, as `--all` does.

The squares are built in parallel with a *process* pool, not threads: the build is pure Python plus
shapely, so the work holds the GIL and threads would gain nothing (this is what `times.py` and
`prep_tiles.py` decide differently - they are mostly waiting on files). Each square writes its own
`partition.json`, `render.svg`, `evidence.svg`, `current.svg`, `metrics.json`, `checks.json` and
`boundary.json` into `<out>/<ti>_<tj>/`, exactly as one square built on its own does.

Then the city-wide things, which only make sense across squares:
- **the summary**: one row per square, and the totals, written to `<out>/summary.json` and printed.
- **the neighbour check**: every pair of squares that share an edge, their partitions compared
  along it (checks.edges_agree). The squares each work their own 40 m margin, so both see the same
  ground either side of the shared edge and must cut it the same way; the plan's tolerance is 1 cm.
- **the held-out widths**: every street with a width tag, fitted with the tag hidden, over the whole
  city. A square only reports the streets inside it, so a street crossing a square's edge is
  reported once, by the square holding its middle.
- **the data findings**: every check's lines, with square and position, so Dan can look at them in
  the game.

A square that fails is reported and the run carries on: one bad square in 131 should not lose the
other 130, and the failures are part of what the run is for.
"""
import argparse
import collections
import json
import math
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from partition import MAP, MARGIN, Q, ROOT, checks
from partition.__main__ import build
from area import area

A = area(MAP, wide=True)
SIZE = Q.dx * Q.cells


def squares():
    """Every square reaching the wide force field's data circle, as (ti, tj) in a fixed order."""
    fcx, fcy = A.field_centre
    R = A.half
    circle_r2 = R * R
    out = []
    for ti in range(math.floor((fcx - R - Q.x0) / SIZE), math.floor((fcx + R - Q.x0) / SIZE) + 1):
        for tj in range(math.floor((fcy - R - Q.y0) / SIZE), math.floor((fcy + R - Q.y0) / SIZE) + 1):
            x0, y0 = Q.x0 + ti * SIZE, Q.y0 + tj * SIZE
            cx = min(max(fcx, x0), x0 + SIZE)
            cy = min(max(fcy, y0), y0 + SIZE)
            if (cx - fcx) ** 2 + (cy - fcy) ** 2 <= circle_r2:
                out.append((ti, tj))
    return out


def box_of(ti, tj):
    return (Q.x0 + ti * SIZE, Q.y0 + tj * SIZE, Q.x0 + (ti + 1) * SIZE, Q.y0 + (tj + 1) * SIZE)


def one(job):
    """Build one square (the process pool's unit of work). Returns a small dict, not the metrics:
    the full record is on disk, and only the summary needs to come back."""
    ti, tj, out, raw, terrain = job
    t = time.time()
    try:
        m = build(ti, tj, os.path.join(out, f"{ti}_{tj}"), raw, terrain, log=lambda *_: None)
    except Exception as exc:                      # a square that fails is data, not the whole run
        return dict(square=[ti, tj], failed=f"{type(exc).__name__}: {exc}", secs=round(time.time() - t, 1))
    return dict(square=[ti, tj], secs=round(time.time() - t, 1), metrics=m)


def held_out(rows):
    """The city-wide held-out width test: every tagged street's width against the width fitted with
    the tag hidden.

    Each square already reports only the streets whose tagged stretch's middle lies inside it
    (`once.read_held_out`), and a stretch's middle is in exactly one square, so the rows are
    concatenated as they come: a street crossing a square's edge is counted once. (An earlier version
    deduplicated by name and width here, which also merged two distinct stretches of one street that
    happened to fit the same width.)"""
    out = []
    for r in rows:
        if "metrics" not in r:
            continue
        ti, tj = r["square"]
        for h in r["metrics"].get("held_out", []):
            out.append(dict(square=[ti, tj], name=h["name"], tagged=h["tagged"], fitted=h["fitted"]))
    return out


def neighbour_check(rows, tol=checks.AGREE_TOL):
    """Every shared edge of neighbouring squares, compared. Returns (worst mismatch, total positions
    without a partner, and one record per edge that disagrees)."""
    # the boundary files are read here rather than carried back through the pool: they are small and
    # this keeps the pool's return values to the summary
    edges = {}
    for r in rows:
        if "metrics" not in r:
            continue
        ti, tj = r["square"]
        p = os.path.join(OUT, f"{ti}_{tj}", "boundary.json")
        if os.path.exists(p):
            edges[(ti, tj)] = json.load(open(p))["edges"]

    pairs = []
    for (ti, tj), mine in sorted(edges.items()):
        # east neighbour: its west edge against this square's east. Both edges share one normal
        # (`edge_profile` gives every side the +x or +y normal), so the same offset names the same
        # physical line on both - "east@10" pairs with "west@10". Pairing opposite signs instead
        # compares x+10 against x-10 and reports every span as a mismatch.
        right = edges.get((ti + 1, tj))
        if right:
            for off in (0.0, 10.0, 20.0, 30.0):
                a = mine.get(f"east@{off:g}")
                b = right.get(f"west@{off:g}")
                if a is not None and b is not None:
                    pairs.append((f"{ti}_{tj}|{ti + 1}_{tj}", f"east {off:g}m", a, b))
        up = edges.get((ti, tj + 1))
        if up:
            for off in (0.0, 10.0, 20.0, 30.0):
                a = mine.get(f"north@{off:g}")
                b = up.get(f"south@{off:g}")
                if a is not None and b is not None:
                    pairs.append((f"{ti}_{tj}|{ti}_{tj + 1}", f"north {off:g}m", a, b))

    worst_all, missing_all, bad = 0.0, 0, []
    for name, side, mine, theirs in pairs:
        worst, missing, lonely = checks.edges_agree(mine, theirs, tol)
        worst_all = max(worst_all, worst)
        missing_all += missing
        if missing:
            bad.append(dict(pair=name, side=side, worst=worst, without_partner=missing,
                            positions=lonely[:20]))
    return round(worst_all, 4), missing_all, len(pairs), bad


def main(argv=None):
    global OUT
    ap = argparse.ArgumentParser(description="build every square of the map as a partition")
    ap.add_argument("--only", nargs="*", default=None, metavar="ti,tj",
                    help="build only these squares, e.g. --only 1,1 0,3")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--all", action="store_true", help="every square reaching the data circle")
    ap.add_argument("--out", default=os.path.join(ROOT, "out", "city"))
    ap.add_argument("--raw", default=os.path.join(ROOT, "data", "raw", MAP, "wide"))
    ap.add_argument("--terrain", default=None)
    a = ap.parse_args(argv)

    terrain = a.terrain or os.path.join(a.raw, "terrain15")
    OUT = a.out
    os.makedirs(OUT, exist_ok=True)
    wanted = squares()
    if a.only:
        only = [tuple(int(v) for v in s.split(",")) for s in a.only]
        wanted = [t for t in wanted if t in set(only)] or only
    print(f"{len(wanted)} squares of {MAP}, {a.jobs} at a time, into {OUT}", flush=True)

    start = time.time()
    jobs = [(ti, tj, OUT, a.raw, terrain) for ti, tj in wanted]
    rows = []
    with ProcessPoolExecutor(a.jobs) as pool:
        for n, r in enumerate(pool.map(one, jobs), 1):
            rows.append(r)
            if "failed" in r:
                print(f"[{n}/{len(jobs)}] {r['square'][0]}_{r['square'][1]} FAILED "
                      f"({r['failed']})", flush=True)
            else:
                m = r["metrics"]
                print(f"[{n}/{len(jobs)}] {r['square'][0]}_{r['square'][1]} "
                      f"{r['secs']:.0f}s loose {m['plot_edges_loose_ends_inside']} "
                      f"unc {m['surface_uncovered_m2']} ev {m['plot_edge_support_mean'] * 100:.0f}% "
                      f"checks {sum(m['data_checks'].values())}", flush=True)

    good = [r for r in rows if "metrics" in r]
    failed = [r for r in rows if "failed" in r]

    # ---- the city summary ------------------------------------------------------------------------
    checks_all = collections.Counter()
    rows_checks = []
    for r in good:
        for c in r["metrics"].get("data_check_list", []):
            checks_all[c["rule"]] += 1
            rows_checks.append(c)
    json.dump(rows_checks, open(os.path.join(OUT, "checks.json"), "w"), indent=1)

    widths = held_out(rows)
    errs = sorted(abs(w["fitted"] - w["tagged"]) for w in widths)
    med = errs[len(errs) // 2] if errs else None
    within = sum(1 for e in errs if e <= 1.0)
    worst_sq = sorted(good, key=lambda r: (r["metrics"]["plot_edges_loose_ends_inside"],
                                           -r["metrics"]["surface_uncovered_m2"]))[:10]
    worst_list = [[r["square"][0], r["square"][1]] for r in worst_sq]

    worst_agree, missing_agree, n_pairs, bad_agree = neighbour_check(rows)

    summary = dict(
        map=MAP, squares=len(rows), built=len(good), failed=[r["square"] for r in failed],
        secs=round(time.time() - start, 1),
        loose_ends_inside=sum(r["metrics"]["plot_edges_loose_ends_inside"] for r in good),
        uncovered_m2=round(sum(r["metrics"]["surface_uncovered_m2"] for r in good), 1),
        overlap_m2=round(sum(r["metrics"]["surface_overlap_m2"] for r in good), 1),
        evidence_share=round(sum(r["metrics"]["plot_edge_support_mean"] for r in good) / len(good), 4) if good else None,
        openings=sum(r["metrics"]["openings"]["openings"] for r in good),
        opening_failures=sum(r["metrics"]["opening_failures"] for r in good),
        data_checks=dict(checks_all),
        held_out_widths=len(widths), held_out_within_1m=within,
        held_out_median_error=round(med, 3) if med is not None else None,
        neighbour_pairs=n_pairs, neighbour_worst_mismatch=worst_agree,
        neighbour_positions_without_partner=missing_agree,
        neighbour_disagreeing=bad_agree[:20],
        worst_squares=worst_list,
    )
    json.dump(summary, open(os.path.join(OUT, "summary.json"), "w"), indent=1)
    json.dump(widths, open(os.path.join(OUT, "held-out.json"), "w"), indent=1)

    print()
    print(f"built {len(good)} of {len(rows)} squares in {summary['secs']:.0f}s"
          + (f"; {len(failed)} failed" if failed else ""))
    if good:
        print(f"loose ends inside {summary['loose_ends_inside']}  "
              f"uncovered {summary['uncovered_m2']} m2  overlap {summary['overlap_m2']} m2  "
              f"evidence {summary['evidence_share'] * 100:.1f}%  openings {summary['openings']} "
              f"(failing {summary['opening_failures']})")
    print(f"held-out widths {within} of {len(widths)} within 1 m"
          + (f", median {med:.2f} m" if med is not None else ""))
    print(f"neighbours: {n_pairs} shared edges, worst mismatch {worst_agree} m, "
          f"{missing_agree} positions without a partner")
    if checks_all:
        print("data findings: " + ", ".join(f"{k} {v}" for k, v in checks_all.most_common()))
    print(f"written to {OUT}: summary.json, checks.json, held-out.json")
    if len(good):
        print(f"worst squares: {' '.join(f'{a}_{b}' for a, b in worst_list)}")
    if failed:
        sys.exit(1)
    return summary


if __name__ == "__main__":
    main()
