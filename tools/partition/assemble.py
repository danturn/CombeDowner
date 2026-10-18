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
        # the row is *not* skipped when its piece outline misses the worked area: a piece writes the
        # whole parent-block open face whose representative point lies inside it, and that face can
        # reach far past the piece itself (measured: a 36 m piece carrying a 1,901 m2 open face, and
        # 160 rows city-wide whose plots reach a square's B while their own outline does not). Gating
        # on the piece drops those faces from one square and not its neighbour, which is exactly the
        # disagreement the neighbour check looks for. What is kept is decided by the clip below.
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


def face_label(f):
    """A face's label for `relabel`: the pair `classify_edges` reads. A plot carries its building
    index, so two plots either side of a division are two different labels - with `data=None` they
    are the same label and the division cannot be named from the faces at all."""
    g, cls, data = f
    if cls in ("carriageway", "pavement", "path"):
        return ("corridor",)
    if cls == "plot":
        return ("plot", data)
    if cls == "building":
        return ("building",)
    return ("open",)


def relabel(raw, faces, B):
    """Re-label every assembled segment from the two assembled faces either side of it.

    This is the project's own rule - a drawn edge is classified by the face labels either side - and
    stage 3 applied it because it classified from the faces of one polygonize. Pass 3 was trusting the
    label pass 2 guessed with a probe, and pass 2 divided a worked piece knowing only that piece's own
    buildings, evidence and parcels: it never saw a corridor, so the ground beyond a piece was a guess.
    A plot against a *carriageway* therefore went down as plot-against-open and came out a fence where
    the rule says a front (measured: 144 inferred edges lying on a corridor in pass 3, none in stage 3).

    `faces` must be the ground noded over the *worked area*, not over the square, and each plot face
    must carry its building index. Both are needed for a division between two plots to read as
    plot-against-plot, and the two failures look alike but are not the same:

    - clip to the square first and the neighbour's plot has no face here, so its side of the division
      reads as whatever pass 2 guessed (measured: 13 edges' source changes on the village square);
    - give every plot face `data=None` and `label` returns ("plot", None) for *both* sides, so the two
      labels are equal, `classify_edges` skips the segment as "la == lb", and the boundary is never
      drawn at all (measured: parcel 3,173 -> 1,008 over B, and 1,450 with the faces clipped to the
      square - which is what the first version of this function did, and what looked like the face
      set's fault until the two were separated).

    Two things the faces must not decide. The *source* of a division - parcel, evidence or inferred -
    is geometric, from the line it lies on, and `classify_edges` measures it there: a division between
    two plots keeps its parcel source whatever faces it was read from. And a segment that cannot find
    two faces keeps pass 2's label, which is the honest answer for one on the worked area's own edge;
    that count is reported, because anywhere but B's edge it means something is missing from `gather`.

    The faces either side are found by *topology*, not by probing a point either side: a face's own
    boundary runs along the segment, which is the fact `ring_adjacency` uses and which cannot miss on a
    thin face. A probe at a fixed distance lands on the same face either side of a party wall, which
    turns a plot-against-building boundary into plot-against-plot (measured: 6,283 plot/plot and 4,175
    building/building pairs, where pass 2 had neither). A segment from pass 2 is not itself noded
    against this face set, though: it can run along a junction, where one side changes face (a plot
    against two corridors in turn), or a third face can touch it at a corner. So the two sides are the
    two *labels* carrying the most of the segment's length, summed over the faces that carry each.

    That majority rule is a *wrinkle*, and it is on stage 6's list rather than solved here: a segment
    that runs along a junction takes the label of the side it mostly has, so the minority stretch is
    read from the wrong side. The clean answer is to node pass 2's network against the assembled faces
    and read each piece's own two faces, which is the rule the block's internal network already
    follows (`ring_adjacency`); the majority rule is what stands in for it while pass 3 assembles from
    whole written pieces. Measured, it is not what the remaining inferred edges come from: 3 of
    17,307 segments on the village square find fewer than two faces at all, and 1 of the 288 inferred
    edges lies on a corridor (2 m, float noise)."""
    if not faces:
        return raw
    bounds = [f[0].boundary for f in faces]
    tree = STRtree(bounds)

    def sides(g):
        along = collections.defaultdict(float)
        for i in np.atleast_1d(tree.query(g.buffer(0.05))):
            i = int(i)
            if bounds[i].distance(g) > 0.05:
                continue
            a = bounds[i].intersection(g.buffer(0.02)).length
            if a > 0:
                along[face_label(faces[i])] += a
        return sorted(along, key=lambda k: -along[k])

    out, kept, away = [], 0, 0
    for g, la, lb in raw:
        if g.is_empty or g.length < 0.05:
            continue
        s = sides(g)
        if len(s) >= 2:
            ka, kb = s[0], s[1]
        else:
            kept += 1
            if B is not None and g.distance(B.boundary) > 0.05:
                away += 1
            ka, kb = la, lb          # fewer than two faces: pass 2's label stands
        out.append((g, ka, kb))
    if kept:
        print(f"  relabel: {kept} of {len(out)} segments found fewer than two faces and kept pass "
              f"2's label; {away} of those are away from the worked area's edge and must be 0, or "
              f"something is missing from gather", flush=True)
    return out

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
