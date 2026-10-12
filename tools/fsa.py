"""Download Food Standards Agency hygiene-rating establishments for a game map's area.

Usage: python3 -I tools/fsa.py <map> <out.geojson>

The FSA's open API (api.ratings.food.gov.uk) lists every pub, café, restaurant, takeaway and shop
that sells food, with its trading name, type, address and a location. Only establishments with a
location inside the bounding box are kept. Data: FSA, Open Government Licence.
"""
import json, math, os, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

API = "https://api.ratings.food.gov.uk/Establishments"
HDR = {"x-api-version": "2", "Accept": "application/json", "User-Agent": "CombeDowner map builder"}

if __name__ == "__main__":
    A, out = area(sys.argv[1]), sys.argv[2]
    W, S, E, N = A.bbox
    lon0, lat0 = A.centre
    miles = A.half * math.sqrt(2) / 1609.3 + 0.1      # the circle that covers the bounding box
    feats, page = [], 1
    while True:
        url = f"{API}?latitude={lat0}&longitude={lon0}&maxDistanceLimit={miles:.2f}&pageSize=500&pageNumber={page}"
        js = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=60).read())
        for e in js["establishments"]:
            g = e.get("geocode") or {}
            if not g.get("longitude"): continue
            lon, lat = float(g["longitude"]), float(g["latitude"])
            if not (W <= lon <= E and S <= lat <= N): continue
            props = {k: e[k] for k in ("FHRSID", "BusinessName", "BusinessType", "AddressLine1", "AddressLine2",
                                       "AddressLine3", "PostCode", "RatingValue", "RatingDate")}
            feats.append(dict(type="Feature", geometry={"type": "Point", "coordinates": [lon, lat]}, properties=props))
        meta = js["meta"]
        if page >= meta["totalPages"]: break
        page += 1
        time.sleep(0.5)
    json.dump({"type": "FeatureCollection", "features": feats}, open(out, "w"))
    print(f"fsa: {len(feats)} establishments")
