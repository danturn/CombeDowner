#!/usr/bin/env python3
"""How busy Bath's roads really are, for the traffic (web/src/traffic.ts): the Department for
Transport's road traffic counts (roadtraffic.dft.gov.uk), the annual average daily flow of motor
vehicles at each count point in Bath and North East Somerset, the latest year each was counted.

    python3 tools/traffic_counts.py [map id]      # writes web/public/maps/<id>-traffic.json

Each point is [metres east, metres north of the map's centre, vehicles a day, road], as the map's
data is. The main roads are all counted every year; only some side streets ever are, and the game
gives the rest a flow by the kind of road they are. Contains public sector information licensed
under the Open Government Licence v3.0.
"""
import json
import math
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://roadtraffic.dft.gov.uk/api/average-annual-daily-flow?filter%5Blocal_authority_id%5D={la}&page%5Bsize%5D=5000&page%5Bnumber%5D={page}"
LA = {"combe-down": 115, "bradford-on-avon": 191}   # Bath and North East Somerset; Wiltshire
KM_LAT = 110574                                      # as the map tools use (prep_map.py)


def main():
    map_id = sys.argv[1] if len(sys.argv) > 1 else "combe-down"
    with open(os.path.join(ROOT, "web", "public", "maps", f"{map_id}.json")) as f:
        lon0, lat0 = json.load(f)["centre"]
    rows, page = [], 1
    while True:
        with urllib.request.urlopen(API.format(la=LA[map_id], page=page), timeout=120) as r:
            d = json.load(r)
        rows += d["data"]
        if page >= d.get("last_page", 1):
            break
        page += 1
    latest = {}
    for x in rows:
        k = x["count_point_id"]
        if x.get("all_motor_vehicles") is not None and (k not in latest or x["year"] > latest[k]["year"]):
            latest[k] = x
    out, kx = [], 111320 * math.cos(math.radians(lat0))
    for x in latest.values():
        e = (float(x["longitude"]) - lon0) * kx
        n = (float(x["latitude"]) - lat0) * KM_LAT
        if abs(e) > 12000 or abs(n) > 12000:
            continue
        out.append([round(e), round(n), int(x["all_motor_vehicles"]), x.get("road_name") or ""])
    out.sort(key=lambda p: -p[2])
    path = os.path.join(ROOT, "web", "public", "maps", f"{map_id}-traffic.json")
    with open(path, "w") as f:
        json.dump({"source": "DfT road traffic statistics, annual average daily flow (OGL v3.0)", "points": out}, f, separators=(",", ":"))
    print(f"{len(out)} count points -> {path}", file=sys.stderr)


if __name__ == "__main__":
    main()
