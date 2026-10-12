"""Decide what each building in Combe Down probably looks like: how many storeys, its roof, its
walls and its chimneys.

The map data gives footprints, a class for some buildings, and (for about a quarter of them)
machine-learned heights from Microsoft that run low and noisy. Everything else is inferred:

- Attachment comes from the footprints themselves: buildings sharing a wall at least 2.5 m long
  are grouped. A group of one is detached, two is a semi-detached pair, three or more a terrace.
- Local character comes from what is known about the area (see the zones in area.py):
  * B&NES's Combe Down character appraisal (2018) and Bath Preservation Trust notes: the area is
    "primarily of two-storey terraced and semi-detached form"; the old village has Bath stone
    ashlar terraces (De Montalt Place, 1729, for Ralph Allen's quarrymen; Isabella Place, about
    1800; Oxford Terrace, "two-storey ... Bath stone ashlar with clay roof pantiles").
  * Foxhill: a post-war estate of about 900 homes on former MoD land.
  * Mulberry Park: the 2016+ redevelopment of the MoD site by Curo and HTA: cottage houses,
    family villas and apartment blocks, "predominantly brick with Bath Stone details".
- Terrace roofs run along the row (one continuous ridge), semis have a hipped outer end and a
  chimney stack on the party wall, detached houses get gabled or hipped roofs.

Around Royal Victoria Park, in Bath itself, almost everything is Bath stone, and OpenStreetMap
often gives a floor count (which there includes the basement and the attic):
- georgian: the upper town (Royal Crescent, Brock Street, the Circus, Marlborough Buildings, Gay
  Street, Queen's Parade, St James's Square, Norfolk Crescent). Three tall storeys over a
  basement, a parapet hiding a low slate roof, stacks on every party wall.
- victorian: the villas and terraces west and north of the park. Two or three storeys, slate,
  hipped semis.
- riverside: the Western Riverside flats of the 2010s by the Avon: four to six storeys, flat roofs.
- bath: everywhere else, a Bath stone mix of two and three storeys.
"""
import math, random
from collections import defaultdict
import numpy as np
import shapely
from shapely.geometry import Point
from shapely.strtree import STRtree

PITCH = math.tan(math.radians(37))   # typical British pitched roof


BATH = ("georgian", "victorian", "riverside", "bath")


def zone_at(zones, x, y, default):
    for name, cx, cy, r in zones:
        if math.hypot(x - cx, y - cy) < r:
            return name
    return default


def groups(polys):
    """Shared-wall neighbours of each footprint, and the wall segments they share."""
    tree = STRtree(polys)
    adj = defaultdict(dict)
    grown = [p.buffer(0.35) for p in polys]
    for i, p in enumerate(polys):
        for j in tree.query(grown[i]):
            j = int(j)
            if j <= i: continue
            shared = grown[i].intersection(grown[j])
            if shared.is_empty or shared.area <= 0: continue
            rect = shared.minimum_rotated_rectangle
            q = list(rect.exterior.coords)[:4]
            e0, e1 = math.dist(q[0], q[1]), math.dist(q[1], q[2])
            length = max(e0, e1)
            if length < 2.5: continue
            a, b = (q[0], q[1]) if e0 >= e1 else (q[1], q[2])
            wall = (a, b, shared.centroid.coords[0])
            adj[i][j] = wall
            adj[j][i] = wall
    comp, seen = {}, set()
    for i in range(len(polys)):
        if i in seen: continue
        stack, members = [i], []
        while stack:
            k = stack.pop()
            if k in seen: continue
            seen.add(k); members.append(k); stack += list(adj[k])
        for k in members: comp[k] = (min(members), len(members))
    return adj, comp


def oriented_rect(poly, ux, uy):
    """Bounding rectangle of poly aligned to unit vector u: corners q0..q3 with q0->q1 along u."""
    vx, vy = -uy, ux
    pts = np.array(poly.exterior.coords)
    su, sv = pts @ [ux, uy], pts @ [vx, vy]
    a, b, c, d = su.min(), su.max(), sv.min(), sv.max()
    P = lambda s, t: (s * ux + t * vx, s * uy + t * vy)
    return [P(a, c), P(b, c), P(b, d), P(a, d)], b - a, d - c


def core_rect(poly, ux, uy, cut=0.1):
    """Like oriented_rect, but around the main body of an L-shaped or irregular footprint: wings,
    porches and towers that hold less than cut of the floor area at either side are left out, so
    the roof doesn't overhang the gaps between them."""
    vx, vy = -uy, ux
    x0, y0, x1, y1 = poly.bounds
    gx, gy = np.meshgrid(np.arange(x0 + 0.25, x1, 0.5), np.arange(y0 + 0.25, y1, 0.5))
    gx, gy = gx.ravel(), gy.ravel()
    keep = shapely.contains_xy(poly, gx, gy)
    if keep.sum() < 20: return oriented_rect(poly, ux, uy)
    gx, gy = gx[keep], gy[keep]
    su, sv = gx * ux + gy * uy, gx * vx + gy * vy
    a, b = np.percentile(su, [100 * cut, 100 * (1 - cut)])
    c, d = np.percentile(sv, [100 * cut, 100 * (1 - cut)])
    # the percentiles shave the ends of a plain rectangle too: give back what was shaved
    a, b = a - (b - a) * cut / (1 - 2 * cut), b + (b - a) * cut / (1 - 2 * cut)
    c, d = c - (d - c) * cut / (1 - 2 * cut), d + (d - c) * cut / (1 - 2 * cut)
    P = lambda s, t: (s * ux + t * vx, s * uy + t * vy)
    return [P(a, c), P(b, c), P(b, d), P(a, d)], b - a, d - c


def classify(polys, props, rnd: random.Random, zones, default_zone="suburb", measured=None):
    """Return one dict of building attributes per footprint (same order as polys).

    measured, if given, has one lidar measurement (see lidar.py) or None per footprint: where
    there is one, the real eaves height and roof shape replace the guesses below."""
    adj, comp = groups(polys)
    out = []
    cluster_seed = {}
    for i, (poly, p) in enumerate(zip(polys, props)):
        cls = p.get("class") or p.get("subtype") or ""
        name = (p.get("names") or {}).get("primary") or ""
        ml = p.get("height")
        cx, cy = poly.centroid.coords[0]
        zone = zone_at(zones, cx, cy, default_zone)
        floors = p.get("num_floors") or 0
        above = floors - 2 if floors >= 4 else floors   # in Bath a floor count usually includes a basement and an attic
        root, size = comp[i]
        area = poly.area
        # one random draw per group, so a whole terrace shares its height and materials
        cr = cluster_seed.setdefault(root, random.Random(root * 7919 + 17))
        r_group = cr.random()
        r_self = rnd.random()

        # ---- what kind of building ----
        if cls in ("church", "chapel") or "Chapel" in name or name == "Holy Trinity":
            kind = "church"
        elif cls in ("school", "kindergarten", "hospital", "university") or area > 700:
            kind = "institution"
        elif cls in ("garage", "garages", "shed", "hut", "roof") or area < 28:
            kind = "outbuilding"
        elif cls in ("retail", "commercial", "office", "kiosk") and size == 1:
            kind = "shop"
        elif area > 320 and zone in ("mulberry", "riverside"):
            kind = "flats"
        elif area > 420:
            kind = "institution"
        elif size >= 3:
            kind = "terrace"
        elif size == 2:
            kind = "semi"
        else:
            kind = "detached"

        # ---- storeys and eaves height ----
        tall = 0          # storeys, for buildings whose storeys are taller than usual (windows follow them)
        if kind == "outbuilding":
            eaves = 2.4 + r_self * 0.4
        elif kind == "church":
            eaves = 8.5
        elif kind == "institution" and zone in BATH and floors:
            tall = max(2, above)
            eaves = tall * 3.5
        elif kind == "institution":
            storeys = 3 if (ml and ml > 7) or area > 1200 else 2
            eaves = storeys * 3.4
        elif kind == "flats" and zone == "riverside":
            eaves = (floors or (4 if r_group < 0.4 else 5 if r_group < 0.8 else 6)) * 3.0
        elif kind == "flats":
            eaves = (3 if r_group < 0.45 else 4) * 2.9
        elif kind == "shop" and zone in BATH:
            eaves = max(2, floors - 1 if floors >= 4 else floors or 3) * 3.2   # shops on the ground floor of town houses
        elif kind == "shop":
            eaves = 5.6
        elif zone in BATH:
            if zone == "georgian":
                tall = min(4, max(2, above or 3))
                eaves = tall * 3.5 + 0.8 + r_group * 0.5   # tall Georgian rooms over a raised ground floor
            elif zone == "victorian":
                eaves = (above or (3 if r_group < 0.35 else 2)) * 3.0 + 0.4
            elif zone == "riverside":
                eaves = (above or 3) * 2.9
            else:
                eaves = (above or (3 if kind == "terrace" and r_group < 0.5 else 2)) * 3.1 + 0.3
            if kind == "detached" and ml and ml < 3.3 and area > 45 and not floors:
                eaves = 2.7                           # a bungalow
        else:
            if zone == "village":
                storeys = 2
                eaves = 6.0 + r_group * 0.6          # Georgian and Victorian rooms are tall
            elif zone == "mulberry":
                storeys = 3 if r_group < 0.3 else 2
                eaves = storeys * 2.75
            else:
                storeys = 2
                eaves = 5.2 + r_group * 0.4
            # Microsoft heights run low, but a very low one on a detached house means a bungalow
            if kind == "detached" and ml and ml < 3.3 and area > 45 and zone != "village":
                eaves = 2.7
            elif ml and ml > 8.5 and kind != "terrace":
                eaves = max(eaves, 8.4)

        # ---- real heights from lidar, where the survey has the building ----
        m = measured[i] if measured else None
        if m:
            eaves = min(30.0, max(2.2, m["eaves"]))
            if tall: tall = max(1, round((eaves - 0.8) / 3.5))

        # ---- walls ----
        if zone in ("village", "georgian", "victorian") or kind == "church":
            wall = "stone"
        elif zone == "riverside":
            wall = "stone" if r_group < 0.6 else "buff" if r_group < 0.85 else "render"
        elif zone == "bath":
            wall = "stone" if r_group < 0.92 else "render"
        elif zone == "mulberry":
            wall = "brick" if r_group < 0.6 else "buff" if r_group < 0.85 else "stone"
        elif zone == "foxhill":
            wall = "render" if r_group < 0.55 else "brick" if r_group < 0.85 else "stone"
        elif kind in ("institution", "shop"):
            # big old buildings here (Prior Park, the schools) are Bath stone
            wall = "stone" if r_group < 0.7 or area > 1500 else "render"
        else:
            wall = "stone" if r_group < 0.55 else "render" if r_group < 0.85 else "brick"

        # ---- roof ----
        roof = None
        if kind not in ("outbuilding",) and not (kind == "institution" and area > 900):
            # ridge direction: along the row for attached houses, along the long side otherwise
            walls = list(adj[i].values())
            if m:
                ux, uy = m["u"]                         # the ridge as surveyed
            elif walls:
                (ax, ay), (bx, by), _ = walls[0]
                wl = math.hypot(bx - ax, by - ay) or 1
                ux, uy = -(by - ay) / wl, (bx - ax) / wl     # perpendicular to the party wall
            else:
                q = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
                e0, e1 = math.dist(q[0], q[1]), math.dist(q[1], q[2])
                (ax, ay), (bx, by) = (q[0], q[1]) if e0 >= e1 else (q[1], q[2])
                l = math.hypot(bx - ax, by - ay) or 1
                ux, uy = (bx - ax) / l, (by - ay) / l
            rect, length, depth = oriented_rect(poly, ux, uy)
            fill = area / max(1e-6, length * depth)
            if fill < 0.9:
                rect, length, depth = core_rect(poly, ux, uy)
            if (zone == "riverside" and kind == "flats") or (m and m["flat"]):
                pass                                    # flat roofs
            elif m and fill > 0.68 and depth > 3:
                hip0 = hip1 = 0.0
                if m["hipped"]:
                    half = min(depth / 2, length / 2)
                    hip0 = hip1 = half
                    if kind == "semi" and walls:
                        # only the outer end is hipped: the other is the party wall
                        _, _, (wx, wy) = walls[0]
                        s_wall = (wx - rect[0][0]) * ux + (wy - rect[0][1]) * uy
                        if s_wall > length / 2: hip1 = 0.0
                        else: hip0 = 0.0
                rise = min(8.0, max(0.8, m["ridge"] - eaves))
                roof = dict(rect=rect, rise=rise, hips=(hip0, hip1), u=(ux, uy))
            elif fill > 0.68 and depth > 3:
                rise = min(depth / 2 * PITCH, 5.5 if kind == "church" else 3.0 if zone == "georgian" else 4.2)
                if kind == "church": rise = depth / 2 * 1.2
                hip0 = hip1 = 0.0
                half = min(depth / 2, length / 2)
                if zone == "georgian": pass                                     # behind a parapet: plain gables
                elif kind == "detached":
                    if zone == "village" or r_self < 0.45: pass                 # gabled
                    else: hip0 = hip1 = half                                    # hipped
                elif kind == "semi" and zone != "village" and r_group < 0.7:
                    # hip the outer end, away from the party wall
                    _, _, (wx, wy) = walls[0]
                    s_wall = (wx - rect[0][0]) * ux + (wy - rect[0][1]) * uy
                    if s_wall > length / 2: hip0 = half
                    else: hip1 = half
                elif kind in ("institution", "flats") and r_group < 0.5:
                    hip0 = hip1 = half
                roof = dict(rect=rect, rise=rise, hips=(hip0, hip1), u=(ux, uy))

        if m and not roof and not m["flat"]:
            eaves = min(30.0, max(2.2, m["mid"]))     # a pitched roof drawn as a block: meet it halfway

        # a parapet along the eaves hides Georgian roofs from the street
        parapet = 0.9 if zone == "georgian" and kind not in ("outbuilding", "church") else 0.0

        # roof covering
        if zone == "village":
            cover = "pantile" if r_group < 0.45 else "slate"
        elif zone in ("georgian", "victorian"):
            cover = "slate" if r_group < 0.8 else "pantile"
        elif zone == "riverside":
            cover = "grey"
        elif zone == "bath":
            cover = "slate" if r_group < 0.7 else "pantile"
        elif zone == "mulberry":
            cover = "grey"
        elif zone == "foxhill":
            cover = "concrete" if r_group < 0.6 else "slate"
        else:
            cover = "slate" if r_group < 0.5 else "concrete" if r_group < 0.8 else "pantile"

        # ---- chimneys ----
        chim = []
        if roof and kind in ("terrace", "semi", "detached") and zone not in ("mulberry", "riverside") and eaves > 3:
            ux, uy = roof["u"]
            q = roof["rect"]
            mx, my = (q[0][0] + q[3][0]) / 2, (q[0][1] + q[3][1]) / 2   # ridge start
            for j, (_, _, (wx, wy)) in adj[i].items():
                if j < i: continue      # one stack per party wall
                s = (wx - mx) * ux + (wy - my) * uy
                chim.append((mx + ux * s, my + uy * s))
            if not adj[i] and r_self < 0.85:
                length = math.dist(q[0], q[1])
                s = length * (0.18 if r_self < 0.5 else 0.82)
                chim.append((mx + ux * s, my + uy * s))
            elif kind == "terrace" and len(adj[i]) == 1 and r_self < 0.5:
                pass   # end-of-terrace: the stack on the shared wall is enough
        out.append(dict(kind=kind, zone=zone, eaves=eaves, wall=wall, cover=cover, roof=roof, chim=chim, parapet=parapet, storeys=tall,
                        windows=kind not in ("outbuilding",)))
    return out
