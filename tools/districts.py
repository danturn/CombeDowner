"""Download the names of a map's districts from OpenStreetMap, for the game's zones (web/src/zones.ts):
the places mapped as a town, suburb, quarter, neighbourhood, village or hamlet inside the force field.

Usage: python3 -I tools/districts.py <map> [out.json]

Writes web/public/maps/<map>-districts.json (or out.json): {"ds": [[x, y, name, kind], ...]}, x and y in
whole metres east and north of the map's centre, kind one of the place kinds above, sorted by kind
and then name. The game names each zone after the biggest district in it, so a map with no file
still works: it falls back on the named parks and squares in its own data.
Data (c) OpenStreetMap contributors, ODbL.
"""
import json, math, os, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area
from osm import get

KINDS = ("town", "suburb", "quarter", "village", "neighbourhood", "hamlet")

if __name__ == "__main__":
    map_id = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "..", "web", "public", "maps", f"{map_id}-districts.json")
    A = area(map_id)
    F = area(map_id, wide=True) if "wide" in A.__dict__ else A
    W, S, E, N = F.bbox
    q = f'[out:json][timeout:60];node["place"~"^({"|".join(KINDS)})$"]["name"]({S},{W},{N},{E});out;'
    js = json.loads(get("https://overpass-api.de/api/interpreter", urllib.parse.urlencode({"data": q}).encode()))
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    fx, fy = F.field_centre
    ds = []
    for e in js["elements"]:
        x, y = (e["lon"] - lon0) * kx, (e["lat"] - lat0) * ky
        if math.hypot(x - fx, y - fy) > F.field: continue
        t = e["tags"]
        ds.append([round(x), round(y), t.get("name:en") or t["name"], t["place"]])
    ds.sort(key=lambda d: (KINDS.index(d[3]), d[2]))
    json.dump({"ds": ds}, open(out, "w"), separators=(",", ":"))
    print(f"districts: {len(ds)} for {map_id} -> {out}")
