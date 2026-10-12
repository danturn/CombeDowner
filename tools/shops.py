"""Shop signs and landmarks.

Businesses come from Overture places. Many places are sole traders registered at home
addresses, so only shopfront kinds of business get a sign (pubs, cafes, shops, the surgery and
so on). Each is matched to its building; the fascia goes on the wall that faces the nearest
street, above the ground floor, and pubs also get a hanging sign.

Landmarks: Holy Trinity's west tower and octagonal spire (H.E. Goodridge, 1830s).
"""
import math
import shapely
from shapely.geometry import LineString, Point

# Overture category -> sign style
SHOPFRONT = {
    "bar": "pub", "pub": "pub", "restaurant": "cafe", "casual_eatery": "cafe", "cafe": "cafe", "coffee_shop": "cafe",
    "fast_food_restaurant": "cafe", "bakery": "shop", "sporting_goods_store": "shop", "convenience_store": "shop",
    "grocery_store": "shop", "pharmacy_and_drug_store": "health", "dental_clinic": "health", "medical_service": "health",
    "real_estate_service": "agent", "family_service": "civic", "museum": "civic", "community_center": "civic",
    "automotive_service": "shop", "hair_salon": "shop", "barber": "shop", "beauty_salon": "shop",
    "sport_or_fitness_facility": "civic",
}
# some names read better as they appear over the door
RENAME = {"King William Bath Pub & Rooms": "The King William", "Nisa Combe Down": "Nisa Local", "Mydentist": "mydentist",
          "G Mannings Funeral Directors": "G. Mannings Funeral Directors", "Randys Bikes": "Randy's Bikes"}
SKIP = ("Save the ", "Bellway", "Costa Express", "Bath Lock & Key")


def shop_signs(places, polys, info, roads, RW, gelev, proj, field):
    lines = [LineString([(a, b) for a, b, _ in r["p"]]) for r in roads if r["c"] not in
             ("footway", "steps", "path", "cycleway", "bridleway", "track") and len(r["p"]) > 1]
    rtree = shapely.STRtree(lines)
    btree = shapely.STRtree(polys)
    signs, used, pubs = [], set(), []
    places = sorted(places, key=lambda gp: -(gp[1].get("confidence") or 0))   # best-known first
    for g, p in places:
        x, y = proj(g.x, g.y)
        if math.hypot(x, y) > field: continue
        name = (p.get("names") or {}).get("primary") or ""
        cat = (p.get("categories") or {}).get("primary") or p.get("basic_category")
        conf = p.get("confidence") or 0
        style = SHOPFRONT.get(cat)
        if name.startswith("Nisa") or name.startswith("Co-op"): style = "shop"
        if not style or any(name.startswith(s) for s in SKIP): continue
        if style in ("agent", "health", "civic", "shop") and conf < 0.75: continue
        name = RENAME.get(name, name)
        # the building it is in, or the nearest one
        pt = Point(x, y)
        cands = [int(k) for k in btree.query(pt.buffer(20))]
        if not cands: continue
        bi = min(cands, key=lambda k: polys[k].distance(pt))
        if polys[bi].distance(pt) > 15 or info[bi]["kind"] == "outbuilding": continue
        if bi in used: continue      # one sign per building
        used.add(bi)
        poly = polys[bi]
        c = poly.centroid
        # the wall facing the nearest street
        near = [int(k) for k in rtree.query(c.buffer(60))]
        if not near: continue
        road = min((lines[k] for k in near), key=lambda l: l.distance(c))
        ring = list(poly.exterior.coords)[:-1]
        best = None
        for i in range(len(ring)):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            L = math.dist(a, b)
            if L < 2.5: continue
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            d = road.distance(Point(m))
            if best is None or d < best[0]: best = (d, a, b, L, m)
        if not best: continue
        _, a, b, L, m = best
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        nx, ny = uy, -ux                       # one of the two normals; flip to point outward
        if (m[0] - c.x) * nx + (m[1] - c.y) * ny < 0: nx, ny = -nx, -ny
        ang = math.atan2(uy, ux)
        # local +z must point out of the wall: +z is (sin a, -cos a) in data coords
        if math.sin(ang) * nx - math.cos(ang) * ny < 0: ang += math.pi
        width = round(min(L - 0.5, 6.0), 2)
        sx, sy = m[0] + nx * 0.06, m[1] + ny * 0.06
        signs.append([round(sx, 2), round(sy, 2), round(gelev(*m), 2), round(ang, 3), width, name, style])
        if style == "pub": pubs.append(bi)
    return signs, pubs


def landmarks(polys, props, info, gelev):
    out = []
    for i, p in enumerate(props):
        name = (p.get("names") or {}).get("primary") or ""
        if name == "Holy Trinity":
            poly = polys[i]
            q = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
            e0, e1 = math.dist(q[0], q[1]), math.dist(q[1], q[2])
            a, b = (q[0], q[1]) if e0 >= e1 else (q[1], q[2])
            L = max(e0, e1)
            ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            c = poly.centroid
            # the west end: whichever end of the long axis lies further west
            if ux > 0: ux, uy = -ux, -uy
            tx, ty = c.x + ux * (L / 2 - 2.6), c.y + uy * (L / 2 - 2.6)
            out.append(["spire", round(tx, 2), round(ty, 2), round(gelev(tx, ty), 2), round(math.atan2(uy, ux), 3), 5.2, 17.0, 13.0])
    return out
