"""Pass 3: assemble a square's partition from the corridors and worked blocks built once.

This is the pass that replaces the old `build`. Everything it uses was built once already, by the
pass before it, and owned by whichever square held its midpoint or representative point - so the
square does not build any ground itself, it gathers:

- **the corridors** overlapping the square, from its own folder and its eight neighbours', fitted in
  pass 1;
- **the worked blocks** overlapping it, likewise, divided in pass 2 - each with its plots, their
  building indices and its edged network;
- **the rest of the square as open land**, cut by the evidence lines near it, which is local and
  needs no block.

then clips everything to the square and runs the surface, openings, metrics and checks exactly as
before. The partition a square writes is consequently made of pieces its neighbours also hold, and a
shared edge agrees because it is the same geometry rather than because two builds happened to match.

`make_plots`, the cross-section fitting, the surface, the openings and the checks are unchanged: this
pass changes who calls them with what, not what they do.
"""
import collections
import json
import os
import statistics

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from . import MARGIN, Q, checks, lap, zone_at
from .buildings import clean_buildings
from .corridors import PATHS, PATHW, PRIOR
from .data import Data, neighbours, squares_over
from .metrics import current_build, openings_checks, pavement_steps
from .openings import find_openings, front_edges
from .once import _poly_from, blocks_path, read_cleaned, read_corridors, read_graph
from .plots import (EXTEND, OPEN_KINDS, Parcels, classify_edges, join_evidence)
from .render import free_ends, loose_ends, render
from .surface import partition, road_profile, surface


def gather(ti, tj, out, kind):
    """Every `<kind>.json` written for the square and the eight round it.

    A square reads its own folder and its neighbours' *of the pass before it*, which is the rule the
    plan sets: a pass never reads another square's output of its own pass. A piece belonging to a
    neighbour is read here because the square is assembling ground that runs past its own edge."""
    rows = []
    for a, b in neighbours(ti, tj):
        p = os.path.join(out, f"{a}_{b}", f"{kind}.json")
        if os.path.exists(p):
            rows.extend(json.load(open(p)))
    return rows


def corridors_for(rows, sq):
    """The corridors overlapping a square, as (edge, carriageway, left, right), each polygon cut to
    the worked area so the partition is assembled inside it.

    Clipped to the *worked area* (the square plus its 40 m margin), which is where stage 3's blocks
    ended, and not to the square. Pass 3 gathers whole worked pieces from the neighbours, and those
    run on past the margin: without this clip their edges end beyond B and count as loose ends rather
    than as ends on the worked area's boundary, they have no evidence loaded against them (pulling
    the evidence share down) and their fronts add openings. The faces written out are still clipped
    to the square afterwards."""
    C = box(*sq)
    out = []
    for r in rows:
        line = LineString(r["line"])
        if not line.intersects(C.buffer(0.5)):
            continue
        e = dict(id=r["id"], cls=r["cls"], name=r["name"], path=r["path"], line=line,
                 sections=[(t0, t1, vs) for t0, t1, vs in r["sections"]],
                 obs=[(t0, t1, tags) for t0, t1, tags in r["obs"]])
        polys = []
        for key in ("car", "pl", "pr"):
            a = r.get(key)
            if not a:
                polys.append(Polygon())
                continue
            g = _poly_from(a)
            if not g.is_valid:
                g = g.buffer(0)
            polys.append(g)
        out.append((e, polys[0], polys[1], polys[2]))
    return out


def blocks_for(rows, sq):
    """The worked blocks overlapping a square: their plots, their edges and their outlines.

    The plots carry the building indices from pass 2, so a house is the same house in every square
    that reads it. Everything is clipped to the worked area `sq` (the square plus its margin): a
    worked piece from a neighbour runs past it, and stage 3's ground never did."""
    C = box(*sq)
    plots, edges = [], []
    for r in rows:
        piece = _poly_from(r["xy"])
        if not piece.intersects(C.buffer(0.5)):
            continue
        for pl in r["plots"]:
            g = _poly_from(pl["xy"])
            g = g.intersection(C)
            for part in ([g] if g.geom_type == "Polygon" else
                         [q for q in getattr(g, "geoms", []) if q.geom_type == "Polygon"]):
                if not part.is_empty and part.area > 0:
                    plots.append((part, pl["kind"], pl["bi"]))
        for e in r["edges"]:
            line = LineString(e["xy"])
            if line.intersects(C.buffer(0.5)):
                cut = line.intersection(C)
                for part in ([cut] if cut.geom_type == "LineString" else
                             [q for q in getattr(cut, "geoms", []) if q.geom_type == "LineString"]):
                    if part.length > 0.05:
                        edges.append((part, tuple(e["la"]), tuple(e["lb"])))
    return plots, edges


def open_land(sq, bb, corridors, evidence, D, rid):
    """The rest of the worked area as open land, cut by the evidence lines near it.

    Open land beyond the worked blocks is open, and the only thing that divides it is evidence - a
    mapped barrier or a lidar run - which is local and needs no block. The 40 m margin is kept for
    this and for the evidence, as the plan says; it is no longer relied on for agreement."""
    B = box(*bb)
    carved = unary_union([g for _e, car, pl, pr in corridors for g in (car, pl, pr) if not g.is_empty])
    openf = B.difference(carved).difference(unary_union([g for g, _k in evidence]))
    return [g for g in (openf.geoms if hasattr(openf, "geoms") else [openf]) if g.area > 5]


def evidence_for(sq, bb, D, ridge_owner):
    """The evidence lines near a square: mapped barriers and the lidar wall runs of the squares it
    touches, joined as the plots join them."""
    barriers = [(g, p["class"]) for g, p in D.lines_near(bb, "infrastructure")
                if p.get("subtype") == "barrier"
                and p.get("class") in ("fence", "wall", "hedge", "retaining_wall")]
    ridges = D.ridges_near(bb)
    ev = [(g, "wall" if k in ("wall", "retaining_wall") else k) for g, k in barriers]
    ev += [(g, {"fence": "fence", "hedge": "hedge"}.get(c, "wall")) for g, c, h in ridges]
    by_kind = collections.defaultdict(list)
    for g, k in ev:
        by_kind[k].append(g)
    return [(l, k) for k, gs in by_kind.items() for l in join_evidence(gs)], ridges, barriers
