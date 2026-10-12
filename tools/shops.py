"""Shop signs: which businesses there are, which building each is in, and where its fascia goes.

Sources, best first (each is optional; see docs/new-area.md):
- OpenStreetMap (<raw dir>/osm.geojson, from tools/osm.py). Locals map shops, pubs and cafés on
  the building they are in, often as the building's own outline, so this decides the building.
- Non-domestic Energy Performance Certificates (<raw dir>/epc/non-domestic.csv) located by OS
  Open UPRN (<raw dir>/epc/uprn.csv). The UPRN point is the exact premises, so a business whose
  certificate names it moves to that building when OpenStreetMap only has it as a nearby point.
- Food Standards Agency hygiene ratings (<raw dir>/fsa.geojson, from tools/fsa.py): pubs, cafés
  and takeaways that OpenStreetMap is missing.
- Overture places, only for a map with no OpenStreetMap download. Their points are often a few
  doors off and include sole traders registered at home, so they are the last resort.

Each business is matched to its building part; the fascia goes on the wall that faces its street
(the addr:street it is mapped on, or else the nearest street), above the ground floor. Several
businesses in one building share the wall, or take the next wall along. Pubs also get a hanging
sign. A map's landmark pack can rename businesses to what is written over the door
(SIGN_NAMES) and leave some out (SIGN_SKIP).
"""
import csv, json, math, os, re
import shapely.ops
import shapely
from shapely.geometry import LineString, Point, shape

# OpenStreetMap tags -> sign style; anything else (schools, churches, halls) gets no fascia
OSM_STYLE = {
    "amenity": {"pub": "pub", "bar": "pub", "cafe": "cafe", "restaurant": "cafe", "fast_food": "cafe", "ice_cream": "cafe",
                "pharmacy": "health", "dentist": "health", "doctors": "health", "clinic": "health", "veterinary": "health",
                "post_office": "shop", "bank": "shop", "community_centre": "civic", "library": "civic", "arts_centre": "civic"},
    "healthcare": {"*": "health"},
    "office": {"*": "agent"},
    "craft": {"*": "shop"},
    "tourism": {"museum": "civic", "gallery": "civic"},
    "leisure": {"fitness_centre": "civic"},
    "shop": {"*": "shop", "vacant": None, "kiosk": None},
}
# FSA business types -> sign style
FSA_STYLE = {"Pub/bar/nightclub": "pub", "Restaurant/Cafe/Canteen": "cafe", "Takeaway/sandwich shop": "cafe",
             "Retailers - other": "shop", "Retailers - supermarkets/hypermarkets": "shop"}
# places that aren't shopfronts: an FSA entry inside one (a school kitchen, a care home) gets no sign
NOT_SHOPFRONT = {"school", "kindergarten", "college", "university", "hospital", "social_facility", "place_of_worship",
                 "nursing_home", "care_home"}
# Overture categories -> sign style (fallback only)
OVERTURE_STYLE = {
    "bar": "pub", "pub": "pub", "restaurant": "cafe", "casual_eatery": "cafe", "cafe": "cafe", "coffee_shop": "cafe",
    "fast_food_restaurant": "cafe", "bakery": "shop", "convenience_store": "shop", "grocery_store": "shop",
    "pharmacy_and_drug_store": "health", "dental_clinic": "health", "real_estate_service": "agent", "museum": "civic",
    "community_center": "civic", "funeral_service": "civic", "automotive_service": "shop", "hair_salon": "shop", "barber": "shop", "beauty_salon": "shop",
}
NEAR = 10.0       # metres: a point this close outside a footprint still belongs to it
SLOT = 2.5        # metres of wall each sign needs at least
STOP = {"the", "and", "of", "ltd", "limited", "public", "house", "inn", "cafe", "café", "at", "co", "bath", "combe", "down"}


def words(s):
    """The distinctive words of a name or address, for matching one source against another."""
    return {w for w in re.findall(r"[a-z0-9]+", (s or "").lower().replace("'", "")) if w not in STOP and len(w) > 1}


def same(a, b):
    """Two names for one business: most of the shorter one's words are in the other."""
    wa, wb = words(a), words(b)
    if not wa or not wb: return False
    small = min(len(wa), len(wb))
    return len(wa & wb) >= max(1, math.ceil(small * 0.6))


def osm_style(p):
    for k, table in OSM_STYLE.items():
        v = p.get(k)
        if v is None: continue
        if v in table: return table[v]
        if "*" in table: return table["*"]
    return None


def overture_style(p):
    """Older Overture releases file a place under categories.primary, newer ones under taxonomy."""
    cat = (p.get("taxonomy") or {}).get("primary") or (p.get("categories") or {}).get("primary")
    return OVERTURE_STYLE.get(cat) or OVERTURE_STYLE.get(p.get("basic_category"))


class Footprints:
    def __init__(self, polys, info):
        self.polys, self.info = polys, info
        self.tree = shapely.STRtree(polys)

    def at_point(self, pt, near=NEAR):
        """The part containing pt, or the nearest within near metres."""
        cands = [int(k) for k in self.tree.query(pt.buffer(near)) if self.info[int(k)]["kind"] != "outbuilding"]
        if not cands: return None
        bi = min(cands, key=lambda k: self.polys[k].distance(pt))
        return bi if self.polys[bi].distance(pt) <= near else None

    def at_shape(self, g):
        """The part a mapped outline covers most of, else the part at its centre."""
        if g.geom_type == "Point": return self.at_point(g)
        if g.geom_type in ("Polygon", "MultiPolygon"):
            best, share = None, 0.0
            for k in self.tree.query(g):
                k = int(k)
                if self.info[k]["kind"] == "outbuilding": continue
                inter = self.polys[k].intersection(g).area
                s = inter / max(1e-6, min(self.polys[k].area, g.area))
                if s > share: best, share = k, s
            if best is not None and share > 0.3: return best
        return self.at_point(g.representative_point())


def load_osm(path, proj):
    if not os.path.exists(path): return None
    out = []
    for f in json.load(open(path))["features"]:
        g = shapely.ops.transform(lambda x, y, z=None: proj(x, y), shape(f["geometry"]))
        out.append((g, f["properties"]))
    return out


def load_epc(folder, bbox, proj):
    """Non-domestic certificates in bbox, latest per address: (Point, address)."""
    certs, uprns = os.path.join(folder, "non-domestic.csv"), os.path.join(folder, "uprn.csv")
    if not (os.path.exists(certs) and os.path.exists(uprns)): return []
    W, S, E, N = bbox
    where = {}
    with open(uprns, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            lat, lon = float(r["LATITUDE"]), float(r["LONGITUDE"])
            if W <= lon <= E and S <= lat <= N: where[r["UPRN"]] = proj(lon, lat)
    latest = {}
    with open(certs, encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            u = r.get("uprn")
            if u in where and (u not in latest or latest[u]["lodgement_date"] < r["lodgement_date"]): latest[u] = r
    return [(Point(*where[u]), r["address"]) for u, r in latest.items()]


def businesses(src_dir, bbox, proj, polys, info, places, inside, rename=None, skip=()):
    """Every business with a shopfront: dicts of name, style, building part (b) and source."""
    rename = rename or {}
    fp = Footprints(polys, info)
    found, log = [], []

    def add(name, style, bi, src, street=None):
        name = rename.get(name, name)
        if not name or not style or bi is None or any(name.startswith(s) for s in skip): return
        # mapped twice: a similar name close by, or exactly the same name anywhere (the addressed one came first)
        if any(name == b["name"] or (same(name, b["name"]) and polys[b["b"]].distance(polys[bi]) < 80) for b in found): return
        found.append(dict(name=name, style=style, b=bi, src=src, street=street))

    osm = load_osm(os.path.join(src_dir, "osm.geojson"), proj)
    epcs = load_epc(os.path.join(src_dir, "epc"), bbox, proj)
    non_shop = []        # outlines of schools, care homes and the like
    if osm is not None:
        osm.sort(key=lambda gp: not any(k.startswith("addr:") for k in gp[1]))    # addressed features first
        for g, p in osm:
            if p.get("amenity") in NOT_SHOPFRONT or p.get("social_facility") or p.get("building") in NOT_SHOPFRONT:
                if g.geom_type != "Point": non_shop.append(g)
                continue
            style, name = osm_style(p), p.get("name")
            if not style or not name: continue
            c = g.representative_point()
            if not inside(c.x, c.y): continue
            bi = fp.at_shape(g)
            # the certificate names the premises: trust it over a point mapped nearby
            for pt, addr in epcs:
                # a namesake far off is another branch or another business
                if same(name, addr.split(",")[0]) and pt.distance(c) < 60:
                    eb = fp.at_point(pt, 4.0)
                    if eb is not None and eb != bi:
                        log.append(f"{name}: EPC puts it in another building {polys[eb].distance(polys[bi]) if bi is not None else -1:.0f} m away"
                                   + ("; moved" if g.geom_type == "Point" or bi is None else "; kept the mapped outline"))
                        if g.geom_type == "Point" or bi is None: bi = eb
                    break
            add(name, style, bi, "osm", p.get("addr:street"))
    non_shop_tree = shapely.STRtree(non_shop) if non_shop else None

    fsa_path = os.path.join(src_dir, "fsa.geojson")
    if os.path.exists(fsa_path):
        for f in json.load(open(fsa_path))["features"]:
            p = f["properties"]
            style = FSA_STYLE.get(p["BusinessType"])
            if not style: continue
            x, y = proj(*f["geometry"]["coordinates"])
            if not inside(x, y): continue
            pt = Point(x, y)
            if non_shop_tree is not None and len(non_shop_tree.query(pt.buffer(15), predicate="intersects")): continue
            if any(same(p["BusinessName"], b["name"]) or same(p["AddressLine1"], b["name"]) for b in found): continue
            bi = fp.at_point(pt, 12.0)
            if bi is not None and any(b["b"] == bi for b in found): continue   # the same premises under another name
            n = len(found)
            add(p["BusinessName"], style, bi, "fsa")
            if len(found) > n: log.append(f"{found[-1]['name']}: added from the food hygiene register")

    # an Overture place that a certificate confirms is a going concern on that building
    for g, p in places:
        name = (p.get("names") or {}).get("primary") or ""
        style = overture_style(p)
        if not style or (p.get("confidence") or 0) < 0.9: continue
        x, y = proj(g.x, g.y)
        if not inside(x, y): continue
        for pt, addr in epcs:
            if same(name, addr.split(",")[0]) and pt.distance(Point(x, y)) < 60:
                n = len(found)
                add(name, style, fp.at_point(pt, 4.0), "overture")
                if len(found) > n: log.append(f"{found[-1]['name']}: added from Overture, confirmed by its EPC")
                break
    if osm is None:     # no OpenStreetMap download: fall back on Overture's places
        for g, p in sorted(places, key=lambda gp: -(gp[1].get("confidence") or 0)):
            x, y = proj(g.x, g.y)
            if not inside(x, y): continue
            name = (p.get("names") or {}).get("primary") or ""
            style = overture_style(p)
            if style and (style in ("pub", "cafe") or (p.get("confidence") or 0) >= 0.75):
                add(name, style, fp.at_point(Point(x, y), 15.0), "overture")
    return found, log


def shop_signs(found, polys, roads, gelev):
    btree = shapely.STRtree(polys)
    """Fascias as [x, y, ground, angle, width, name, style], and the parts that are pubs."""
    drive = [r for r in roads if r["c"] not in ("footway", "steps", "path", "cycleway", "bridleway", "track") and len(r["p"]) > 1]
    lines = [LineString([(a, b) for a, b, _ in r["p"]]) for r in drive]
    rtree = shapely.STRtree(lines)
    by_part = {}
    for b in found: by_part.setdefault(b["b"], []).append(b)
    signs, pubs = [], []
    for bi, group in by_part.items():
        poly = polys[bi]
        c = poly.centroid
        near = [int(k) for k in rtree.query(c.buffer(80))]
        if not near: continue
        street = next((b["street"] for b in group if b["street"]), None)
        named = [k for k in near if street and drive[k]["n"] == street]
        streets = [k for k in near if drive[k]["c"] != "service"]     # not a back lane or a drive
        road = min((lines[k] for k in (named or streets or near)), key=lambda l: l.distance(c))
        # walls that face the road, nearest first
        ring = list(poly.exterior.coords)[:-1]
        if shapely.Polygon(ring).exterior.is_ccw is False: ring = ring[::-1]     # counter-clockwise: outward normal is (dy, -dx)
        walls, backs = [], []
        for i in range(len(ring)):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            L = math.dist(a, b)
            if L < SLOT: continue
            ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            nx, ny = uy, -ux
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            q = road.interpolate(road.project(Point(m)))
            tx, ty = q.x - m[0], q.y - m[1]
            d = math.hypot(tx, ty) or 1e-6
            facing = (tx * nx + ty * ny) / d
            # a party wall: the next building starts just outside it
            if any(int(o) != bi for o in btree.query(Point(m[0] + nx * 0.8, m[1] + ny * 0.8), predicate="intersects")): continue
            (walls if facing >= 0.3 else backs).append((d / (1.5 + facing), a, ux, uy, nx, ny, L))
        walls.sort(key=lambda w: w[0])
        walls += sorted(backs, key=lambda w: w[0])      # a corner unit's side, if the front is all party walls
        if not walls: continue
        todo = list(group)
        for _, a, ux, uy, nx, ny, L in walls:
            if not todo: break
            k = max(1, min(len(todo), int(L // SLOT)))
            slot = L / k
            ang = math.atan2(uy, ux)
            # local +z must point out of the wall: +z is (sin a, -cos a) in data coords
            if math.sin(ang) * nx - math.cos(ang) * ny < 0: ang += math.pi
            for j in range(k):
                b = todo.pop(0)
                t = slot * (j + 0.5)
                mx, my = a[0] + ux * t, a[1] + uy * t
                width = round(min(slot - 0.5, 6.0), 2)
                signs.append([round(mx + nx * 0.06, 2), round(my + ny * 0.06, 2), round(gelev(mx, my), 2), round(ang, 3), width, b["name"], b["style"]])
        if any(b["style"] == "pub" for b in group): pubs.append(bi)
    return signs, pubs
