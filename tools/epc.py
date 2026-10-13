"""What houses are built of, from Energy Performance Certificates (England and Wales).

Data, both open:
- the domestic EPC register for the local authority, from
  get-energy-performance-data.communities.gov.uk (Domestic certificates, CSV), saved as
  <raw dir>/epc/certificates.csv. Every home sold or let since 2008 has one, with its wall
  construction ("Sandstone or limestone", "Solid brick", "Cavity wall" ...) and type (house,
  bungalow, flat), and a UPRN, the unique number of the address;
- OS Open UPRN, which locates every UPRN, from osdatahub.os.uk/downloads/open/OpenUPRN (CSV),
  saved as <raw dir>/epc/uprn.csv. The national file is large: keep just the area (see README).

Each address takes its latest certificate and lands in the building footprint it stands in (or
the nearest within a few metres). A building then takes the wall most of its addresses report,
where that says something visible: stone, brick or render. A cavity wall could be faced in any of
them, so those leave the guess from buildings.py alone.
"""
import csv, os, pickle, zlib
import numpy as np
import shapely

WALLS = (("sandstone", "stone"), ("limestone", "stone"), ("granite", "stone"), ("solid brick", "brick"),
         ("system built", "render"), ("timber frame", "render"), ("cob", "render"))
NEAR = 4.0      # metres: an address point this close outside a footprint still belongs to it


def load(folder, bbox, proj):
    """Addresses inside bbox (W, S, E, N, lon/lat): a list of (x, y, wall or None, bungalow)."""
    certs, uprns = os.path.join(folder, "certificates.csv"), os.path.join(folder, "uprn.csv")
    if not (os.path.exists(certs) and os.path.exists(uprns)): raise FileNotFoundError(f"no EPC data in {folder}")
    # every square of the map reads the same addresses, so they're worked out once and kept beside
    # the data, until the files, the area or where the map is centred change
    key = repr((bbox, proj(*bbox[:2]), [(os.path.getsize(p), os.path.getmtime(p)) for p in (certs, uprns)]))
    kept = os.path.join(folder, f".addresses-{zlib.crc32(key.encode()):08x}.pickle")
    if os.path.exists(kept):
        with open(kept, "rb") as f: return pickle.load(f)
    out = _read(certs, uprns, bbox, proj)
    tmp = f"{kept}.{os.getpid()}"
    with open(tmp, "wb") as f: pickle.dump(out, f)
    os.replace(tmp, kept)
    return out


def _read(certs, uprns, bbox, proj):
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
            if u not in where: continue
            if u in latest and latest[u]["lodgement_date"] >= r["lodgement_date"]: continue
            latest[u] = r
    out = []
    for u, r in latest.items():
        desc = r["walls_description"].lower()
        wall = next((w for k, w in WALLS if k in desc), None)
        out.append((*where[u], wall, r["property_type"] == "Bungalow"))
    return out


def per_building(addresses, polys):
    """For each footprint: dict(wall=..., bungalow=...) from the addresses in it, or None."""
    if not addresses: return [None] * len(polys)
    tree = shapely.STRtree(polys)
    pts = shapely.points(np.array([(a[0], a[1]) for a in addresses]))
    found = [[] for _ in polys]
    inside = tree.query(pts, predicate="within")
    hit = set()
    for a, b in zip(*inside):
        found[int(b)].append(addresses[int(a)]); hit.add(int(a))
    rest = [i for i in range(len(addresses)) if i not in hit]
    if rest:
        near, dist = tree.query_nearest(pts[rest], max_distance=NEAR, return_distance=True)
        for (a, b), d in zip(near.T, dist):
            found[int(b)].append(addresses[rest[int(a)]])
    out = []
    for got in found:
        if not got: out.append(None); continue
        walls = [g[2] for g in got if g[2]]
        # the commonest wall, the first one listed on a tie (not whichever Python's per-run hashing puts first)
        wall = max(walls, key=walls.count) if walls and len(walls) * 2 >= len(got) else None
        out.append(dict(wall=wall, bungalow=all(g[3] for g in got), n=len(got)))
    return out
