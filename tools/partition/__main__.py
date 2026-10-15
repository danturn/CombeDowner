"""Build one square of the map as a partition of the ground.

Usage: python3 -I tools/partition/__main__.py <ti> <tj> <out dir> [--raw <dir>] [--terrain <dir>]

Runs the stages in the design's order (buildings, street graph, corridors, plots, surface), writes
<out>/partition.json (the faces), <out>/render.svg, <out>/evidence.svg, <out>/current.svg (the
same square from the current build, drawn the same way) and <out>/metrics.json, and prints the
metrics. `partition_poc.py` is a thin wrapper round this.
"""
import collections
import json
import os
import statistics
import sys
import zipfile

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from . import MAP, MARGIN, Q, ROOT, Terrain, lap, load_layer, zone_at
from .buildings import clean_buildings
from .corridors import PATHS, PATHW, PRIOR, fit_cross_section, offset_poly, side_reach
from .graph import street_graph
from .metrics import current_build, openings_checks, pavement_steps
from .openings import find_openings, front_edges
from .plots import (OPEN_KINDS, building_axes, classify_edges, drop_loose, front_normals,
                    join_evidence, make_plots, tidy_plots)
from .render import free_ends, render
from .surface import partition, road_profile, surface


def load_ridges(raw, ti, tj):
    """The lidar wall runs the build kept for this square (data/combe-down/measured/<ti>_<tj>.zip)."""
    import lzma
    ridges = []
    mz = os.path.join(ROOT, "data", MAP, "measured", f"{ti}_{tj}.zip")
    if os.path.exists(mz):
        with zipfile.ZipFile(mz) as z:
            if "walls.json.xz" in z.namelist():
                for w in json.loads(lzma.decompress(z.read("walls.json.xz"))):
                    ridges.append((LineString(w["p"]), w["c"], w["h"]))
    return ridges


def build(ti, tj, out, raw, terrain, log=print):
    os.makedirs(out, exist_ok=True)
    side = Q.dx * Q.cells
    sq = (Q.x0 + ti * side, Q.y0 + tj * side, Q.x0 + (ti + 1) * side, Q.y0 + (tj + 1) * side)
    bb = (sq[0] - MARGIN, sq[1] - MARGIN, sq[2] + MARGIN, sq[3] + MARGIN)
    B, SQ = box(*bb), box(*sq)
    T = Terrain(terrain)
    print(f"square {ti},{tj}: {sq}")

    bld = [(g, p) for g, p in load_layer(raw, "building", bb) if g.geom_type in ("Polygon", "MultiPolygon")]
    bpolys = []
    for g, p in bld:
        for pg in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            bpolys.append(pg)
    roads = []
    for g, p in load_layer(raw, "osm-roads", bb):
        if g.geom_type != "LineString":
            continue
        g = g.intersection(B)
        for l in (g.geoms if hasattr(g, "geoms") else [g]):
            if l.geom_type == "LineString" and l.length > 0.5:
                roads.append((l, p))
    barriers = [(g, p["class"]) for g, p in load_layer(raw, "infrastructure", bb)
                if p.get("subtype") == "barrier" and p.get("class") in ("fence", "wall", "hedge", "retaining_wall")
                and g.geom_type in ("LineString", "MultiLineString")]
    landuse = [(g, p.get("class")) for g, p in load_layer(raw, "land_use", bb)
               if g.geom_type in ("Polygon", "MultiPolygon")]
    ridges = load_ridges(raw, ti, tj)
    print(f"  buildings {len(bpolys)}, road pieces {len(roads)}, mapped barriers {len(barriers)}, "
          f"lidar ridge runs {len(ridges)}, land use {len(landuse)}")

    bpolys, closed = clean_buildings(bpolys)
    bunion = unary_union(bpolys)
    lap("buildings"); print(f"  1. buildings cleaned: {len(bpolys)}, sliver gaps closed {closed}")

    edges = street_graph(roads, bb, log=log)
    streets = [e for e in edges if e["cls"] not in PATHS]
    paths = [e for e in edges if e["cls"] in PATHS]
    lap("graph"); print(f"  2. street graph: {len(streets)} street edges, {len(paths)} path edges, from {len(roads)} ways")

    evidence = [(g, "wall" if k in ("wall", "retaining_wall") else k) for g, k in barriers]
    evidence += [(g, {"fence": "fence", "hedge": "hedge"}.get(c, "wall")) for g, c, h in ridges]
    # evidence runs that are collinear within 10 degrees and 8 m of one another join into one line,
    # so a boundary the survey shows in pieces is one boundary (a joined line only becomes a plot
    # edge if it closes a face, so the partition can afford to join more than walls.py does)
    by_kind = collections.defaultdict(list)
    for g, k in evidence:
        by_kind[k].append(g)
    evidence = [(l, k) for k, gs in by_kind.items() for l in join_evidence(gs)]
    obstacles = [g for g, _ in evidence] + bpolys
    otree = STRtree(obstacles)
    corridors, held = [], []
    for e in streets:
        ts, L, R = side_reach(e["line"], otree, obstacles)
        stretches, sec = fit_cross_section(e, ts, L, R)
        e["sections"] = stretches
        car = offset_poly(e["line"], ts, sec[:, 0] / 2, sec[:, 0] / 2)
        pl = offset_poly(e["line"], ts, sec[:, 0] / 2 + sec[:, 1], -sec[:, 0] / 2)
        pr = offset_poly(e["line"], ts, -sec[:, 0] / 2, sec[:, 0] / 2 + sec[:, 2])
        corridors.append((e, car, pl, pr))
        tagged = [(t0, t1, tags) for t0, t1, tags in e["obs"] if "width" in tags]
        if tagged:
            _, sec2 = fit_cross_section(e, ts, L, R, hold_out=True)
            for t0, t1, tags in tagged:
                try:
                    wt = float(tags["width"])
                except ValueError:
                    continue
                m = (ts >= t0) & (ts <= t1)
                if m.sum():
                    held.append((e["name"], wt, float(np.median(sec2[m, 0])), float(np.median(sec[m, 0]))))
    for e in paths:
        w = PATHW.get(e["cls"], 1.8)
        ts = np.linspace(0, e["line"].length, max(2, int(e["line"].length / 2) + 1))
        corridors.append((e, offset_poly(e["line"], ts, np.full(len(ts), w / 2), np.full(len(ts), w / 2)),
                          Polygon(), Polygon()))
    lap("corridors"); print(f"  3. corridors fitted: {len(corridors)}; width tags held out {len(held)}")

    cor_union = unary_union([g for _, car, pl, pr in corridors for g in (car, pl, pr) if not g.is_empty])
    land = B.difference(cor_union).difference(bunion)
    blocks = [g for g in (land.geoms if hasattr(land, "geoms") else [land]) if g.area > 5]
    buildings = list(enumerate(bpolys))
    open_land = [g for g, k in landuse if k in OPEN_KINDS]
    for g in open_land:
        shapely.prepare(g)
    ev_lines = [g for g, _ in evidence]
    ev_tree = STRtree(ev_lines)
    plots = []
    lap(f"blocks {len(blocks)}")
    street_lines = [e["line"] for e in streets]
    street_tree = STRtree(street_lines) if street_lines else None
    b_axes = {i: a for i, a in enumerate(building_axes(bpolys))}
    b_fronts = front_normals(bpolys, [b_axes[i] for i in range(len(bpolys))], street_tree, street_lines)
    for blk in blocks:
        cx, cy = blk.representative_point().x, blk.representative_point().y
        plots += make_plots(blk, buildings, ev_lines, ev_tree, zone_at(cx, cy),
                           axes=b_axes, fronts=b_fronts, log=log)
    lu_tree = STRtree([g for g, _ in landuse])
    plots2 = []
    for g, kind, bi in plots:
        plots2.append((g, kind, bi))
    plots = plots2
    plots = tidy_plots(plots, bunion.union(cor_union))
    lap(f"plots {len(plots)}")
    ev_tree2 = STRtree([g for g, _ in evidence])
    pedges = classify_edges(plots, cor_union, evidence, ev_tree2, zone_at)
    pedges = drop_loose(pedges)
    lap("edges"); print(f"  4. plots: {sum(1 for _, k, _ in plots if k == 'plot')} plots, "
                        f"{sum(1 for _, k, _ in plots if k == 'open')} open pieces, {len(pedges)} edges")

    prof = {}
    faces = []
    for k, (e, car, pl, pr) in enumerate(corridors):
        prof[k] = road_profile(e, T)
        if not car.is_empty:
            faces.append((car.intersection(SQ), "carriageway" if e["cls"] not in PATHS else "path", k))
        for g in (pl, pr):
            if not g.is_empty:
                faces.append((g.intersection(SQ), "pavement", k))
    for g, kind, bi in plots:
        faces.append((g.intersection(SQ), kind, None))
    for b in bpolys:
        z = min(T.elev(x, y) for x, y in b.exterior.coords[::max(1, len(b.exterior.coords) // 8)])
        faces.append((b.intersection(SQ), "building", z))
    faces = [(g, c, d) for g, c, d in faces if not g.is_empty]
    lap("noding"); faces = partition(faces, SQ)
    lap("triangulating"); tris, bad = surface(faces, T, prof)
    covered = unary_union([g for g, _, _ in faces])
    holes = SQ.difference(covered)
    hole_area = holes.area
    overlap = sum(g.area for g, _, _ in faces) - covered.area
    lap("surface"); print(f"  5. surface: {len(tris)} triangles, faces failed {bad}, "
                          f"uncovered {hole_area:.1f} m2 of {SQ.area:.0f}, overlap {overlap:.1f} m2")

    drawn = [s for s, k, sup, src in pedges if k != "none"]
    n_free_new, pts_new = free_ends(drawn, bunion.union(cor_union.boundary))
    n_free_old, pts_old = free_ends([g for g, _, _ in ridges], bunion)
    # openings: gates and drives in the fronts, and where a path crosses a plot edge, with the
    # checks the plan names (a gate on its edge with the edge continuing either side, nothing wider
    # than its edge, no building facing a street with neither)
    houses = {i: b for i, b in buildings}
    path_corr = [(e["line"], PATHW.get(e["cls"], 1.8), e["cls"]) for e in paths]
    openings = find_openings(plots, pedges, houses, path_corr)
    plot_edges_len = {i: s.length for i, (s, k, sup, src) in enumerate(pedges) if k != "none"}
    # a building whose plot has a front on a street must have a gate or drive in it
    fronted = set(front_edges(plots, pedges))
    opening_bldgs = {bidx for bidx, eids in front_edges(plots, pedges).items()
                     if any(o["edge"] in eids and o["kind"] in ("gate", "drive", "open") for o in openings)}
    fronts_without = sorted(fronted - opening_bldgs)
    opening_fails, opening_sum = openings_checks(openings, plot_edges_len, fronts_without)
    held_err = [abs(f - w) for _, w, f, _ in held]
    metrics = dict(
        square=[ti, tj], buildings=len(bpolys), sliver_gaps_closed=closed,
        street_edges=len(streets), path_edges=len(paths), road_pieces=len(roads),
        lidar_runs=len(ridges), lidar_runs_free_ends=n_free_old,
        plot_edges=len(drawn), plot_edges_free_ends=n_free_new,
        plot_edges_by_source=dict(collections.Counter(src for _, _, _, src in pedges)),
        plot_edge_support_mean=float(np.mean([sup for _, _, sup, _ in pedges])) if pedges else None,
        held_out_widths=len(held), held_out_within_1m=sum(1 for e in held_err if e <= 1.0),
        held_out_median_error=float(statistics.median(held_err)) if held_err else None,
        held_out=[dict(name=n, tagged=w, fitted=f) for n, w, f, _ in held],
        surface_triangles=len(tris), surface_uncovered_m2=round(hole_area, 1),
        surface_overlap_m2=round(overlap, 1),
        cross_section_changes=sum(len(e.get("sections", [])) - 1 for e in streets),
        openings=opening_sum, opening_failures=len(opening_fails),
        opening_kinds=dict(collections.Counter(o["kind"] for o in openings)),
    )
    json.dump(metrics, open(os.path.join(out, "metrics.json"), "w"), indent=1)
    json.dump(dict(square=[ti, tj],
                   faces=[dict(cls=c, xy=list(map(list, (g.exterior.coords if g.geom_type == "Polygon" else []))))
                          for g, c, _ in faces][:20000],
                   edges=[dict(kind=k, support=round(sup, 2), source=src, xy=list(map(list, s.coords)))
                          for s, k, sup, src in pedges],
                   openings=openings),
              open(os.path.join(out, "partition.json"), "w"))
    lap("metrics")

    layers = [("poly", [(g, c) for g, c, _ in faces if c in ("open", "plot")]),
              ("poly", [(g, c) for g, c, _ in faces if c in ("pavement", "path")]),
              ("poly", [(g, c) for g, c, _ in faces if c == "carriageway"]),
              ("poly", [(g, c) for g, c, _ in faces if c == "building"]),
              ("line", [(s, k + (" inferred" if src == "inferred" else ""))
                        for s, k, sup, src in pedges if k != "none"]),
              ("dot", [(p, "free") for p in pts_new])]
    render(os.path.join(out, "render.svg"), sq, layers, f"partition: square {ti},{tj}")
    layers_ev = [("poly", [(g, c) for g, c, _ in faces
                           if c in ("open", "plot", "pavement", "path", "carriageway", "building")]),
                 ("line", [(g, "ridge") for g, _, _ in ridges]),
                 ("line", [(g, "railing") for g, _ in barriers]),
                 ("dot", [(p, "free") for p in pts_old])]
    render(os.path.join(out, "evidence.svg"), sq, layers_ev,
           f"evidence: lidar ridge runs (red) and mapped barriers, square {ti},{tj}")
    cur = current_build(ti, tj, sq)
    if cur:
        bl, rd, br = cur
        rl = []
        for r in rd:
            line = LineString([(x, y) for x, y, *_ in r["p"]])
            if line.length < 1:
                continue
            w, pv = r.get("w", PRIOR.get(r["c"], (5, 3.5))[0]), r.get("pv", [1.7, 1.7])
            ts = np.linspace(0, line.length, max(2, int(line.length / 2) + 1))
            rl.append((offset_poly(line, ts, np.full(len(ts), w / 2 + pv[0]), np.full(len(ts), w / 2 + pv[1])),
                       "pavement"))
            rl.append((offset_poly(line, ts, np.full(len(ts), w / 2), np.full(len(ts), w / 2)), "carriageway"))
        brl = [LineString([(x, y) for x, y, *_ in b["p"]]) for b in br if len(b["p"]) > 1]
        n_free_cur, pts_cur = free_ends(brl, unary_union([Polygon(b["r"][0]) for b in bl if len(b["r"][0]) > 3]))
        metrics["current_build"] = dict(barriers=len(brl), barriers_free_ends=n_free_cur, road_pieces=len(rd),
                                        pavement_steps=pavement_steps(rd))
        json.dump(metrics, open(os.path.join(out, "metrics.json"), "w"), indent=1)
        render(os.path.join(out, "current.svg"), sq,
               [("poly", [(SQ, "open")]), ("poly", [g for g in rl if g[1] == "pavement"]),
                ("poly", [g for g in rl if g[1] == "carriageway"]),
                ("poly", [(Polygon(b["r"][0]), "building") for b in bl if len(b["r"][0]) > 3]),
                ("line", [(l, b["c"]) for l, b in zip(brl, [b for b in br if len(b["p"]) > 1])]),
                ("dot", [(p, "free") for p in pts_cur])], f"current build: square {ti},{tj}")
    print(json.dumps({k: v for k, v in metrics.items() if k != "held_out"}, indent=1))
    return metrics


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    ti, tj, out = int(argv[0]), int(argv[1]), argv[2]
    raw = os.path.join(ROOT, "data", "raw", MAP, "wide")
    terrain = os.path.join(raw, "terrain15")
    if "--raw" in argv:
        raw = argv[argv.index("--raw") + 1]
    if "--terrain" in argv:
        terrain = argv[argv.index("--terrain") + 1]
    return build(ti, tj, out, raw, terrain)


if __name__ == "__main__":
    main()
