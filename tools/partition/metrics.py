"""The numbers each stage is judged on, kept in one place and reported into metrics.json.

The plan watches the same things at every stage so a change can be told from a regression:
barrier ends touching nothing, joins where a street's width or pavement steps mid-street, one
surface with no overlaps or holes, the carriageway width fitted with the OSM width tag hidden, and
the share of plot edge length lying on lidar or mapped evidence. The proof of concept's held-out
width test and the loose-end, pavement-step, overlap and uncovered-area reporting are kept at every
stage. Stage 1 adds the openings checks.
"""
import collections
import json
import os

from shapely.geometry import LineString, Point, box

from . import MAP, ROOT


def current_build(ti, tj, sq):
    """The square from the built map: buildings, roads and barriers inside sq. The comparison the
    plan's table is made against."""
    f = os.path.join(ROOT, "web", "public", "maps", MAP, f"{ti}_{tj}.json")
    if not os.path.exists(f):
        f = os.path.join(ROOT, "web", "public", "maps", MAP + ".json")
    if not os.path.exists(f):
        return None
    d = json.load(open(f))
    SQ = box(*sq)
    bl = [b for b in d["bl"] if b.get("r") and SQ.intersects(Point(b["r"][0][0]))]
    rd = [r for r in d["rd"] if SQ.intersects(LineString([(x, y) for x, y, *_ in r["p"]]))]
    br = [b for b in d["br"] if len(b["p"]) > 1 and SQ.intersects(LineString([(x, y) for x, y, *_ in b["p"]]))]
    return bl, rd, br


def pavement_steps(rd):
    """Joins between two road pieces (at a node no third piece uses) where the carriageway width or
    a pavement width differs: a step in the pavement."""
    ends = collections.defaultdict(list)
    for r in rd:
        for p in (r["p"][0], r["p"][-1]):
            ends[(round(p[0], 1), round(p[1], 1))].append(r)
    n = 0
    for k, rs in ends.items():
        if len(rs) != 2:
            continue
        a, b = rs
        if a.get("w") != b.get("w") or a.get("pv", [1.7, 1.7]) != b.get("pv", [1.7, 1.7]):
            n += 1
    return n


def openings_checks(openings, edge_lengths, building_fronts_without):
    """Stage 1's checks: every gate lies on a plot edge with the edge continuing both sides; no
    opening wider than its edge; no building without a gate or drive on a front that faces a street.
    Returns (failures, detail)."""
    fails = []
    by_edge = collections.defaultdict(list)
    for o in openings:
        by_edge[o["edge"]].append(o)
        el = edge_lengths[o["edge"]]
        if o["width"] > el + 1e-6:
            fails.append(dict(kind="opening_too_wide", edge=o["edge"], width=o["width"], edge_len=el))
        if o["t"] - o["width"] / 2 < -1e-6 or o["t"] + o["width"] / 2 > el + 1e-6:
            fails.append(dict(kind="opening_off_edge", edge=o["edge"], t=o["t"], width=o["width"]))
    for b in building_fronts_without:
        fails.append(dict(kind="front_without_opening", building=b))
    return fails, dict(openings=len(openings), failing=len(fails),
                       failing_by_kind=dict(collections.Counter(f["kind"] for f in fails)))
