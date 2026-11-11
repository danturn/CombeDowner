"""Fetch Historic England's listed railings and walls into a wide-area layer for a game map, or with
"buildings" every listed building's outline.

Usage: python3 -I tools/listed.py <map> <out.geojson> [wide] [--from points.geojson]
       python3 -I tools/listed.py <map> <out.geojson> [wide] buildings     (heritage.geojson)

The National Heritage List for England lists many of Bath's area railings and boundary walls as
entries of their own ("Railings to area of 1-30 Royal Crescent"). Each entry is a point, so it says
which house's front has railings rather than where the line runs; the partition build gives that
house's front boundary the listed kind (tools/partition/settle.py). Only entries whose names say
railings or walls are kept. Read from the list's public ArcGIS service (layer 0, the points), or
from a file of the same already fetched (--from).

With "buildings" it keeps every list entry's outline (layer 3, the polygons) with its grade (I, II*
or II), entry number and name, for tools/character to say which buildings are listed. Data:
Historic England, Open Government Licence v3; data/combe-down/README.md has the attribution.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

SERVICE = ("https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/"
           "National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer/{layer}/query")
UA = {"User-Agent": "CombeDowner map builder (https://combedowner.com)"}
POINTS, OUTLINES = 0, 3
RAILING = re.compile(r"\brailings?\b", re.I)
WALL = re.compile(r"\bwalls?\b", re.I)


def fetch(bbox, layer=POINTS):
    out, offset = [], 0
    while True:
        q = dict(f="geojson", where="1=1", geometry=",".join(str(v) for v in bbox),
                 geometryType="esriGeometryEnvelope", inSR=4326, spatialRel="esriSpatialRelIntersects",
                 outFields="ListEntry,Name,Grade", outSR=4326, resultOffset=offset, resultRecordCount=1000)
        if layer == OUTLINES:
            q["geometryPrecision"] = 6     # a tenth of a metre: plenty to say which footprint it is
        url = SERVICE.format(layer=layer) + "?" + urllib.parse.urlencode(q)
        d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120))
        got = d.get("features", [])
        out += got
        more = d.get("exceededTransferLimit") or d.get("properties", {}).get("exceededTransferLimit")
        if len(got) < 1000 and not more:
            return out
        offset += len(got)


def write(path, feats):
    text = '{"type":"FeatureCollection","features":[' + \
        ",\n".join(json.dumps(f, separators=(",", ":"), ensure_ascii=False) for f in feats) + "]}\n"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def buildings(src, out_path):
    keep = []
    for f in fetch(src.bbox, OUTLINES):
        p, g = f["properties"], f.get("geometry")
        if not g or p.get("Grade") not in ("I", "II*", "II"):
            continue
        keep.append({"type": "Feature", "geometry": g,
                     "properties": {"entry": p.get("ListEntry"), "grade": p["Grade"], "name": p.get("Name") or ""}})
    keep.sort(key=lambda f: f["properties"]["entry"] or 0)
    write(out_path, keep)
    print(f"listed: {len(keep)} listed buildings' outlines -> {out_path}")


def kind_of(name):
    """'railing' or 'wall' from a listed entry's name, or None for a building."""
    if RAILING.search(name):
        return "railing"
    if WALL.search(name):
        return "wall"
    return None


def main(argv):
    src = area(argv[0], wide="wide" in argv[2:])
    out_path = argv[1]
    if "buildings" in argv[2:]:
        return buildings(src, out_path)
    W, S, E, N = src.bbox
    feats = json.load(open(argv[argv.index("--from") + 1]))["features"] if "--from" in argv else fetch(src.bbox)
    keep = []
    for f in feats:
        p = f["properties"]
        kind = kind_of(p.get("Name") or "")
        g = f.get("geometry") or {}
        pts = g.get("coordinates") or []
        if g.get("type") == "Point":
            pts = [pts]
        if not kind or not pts:
            continue
        lon, lat = pts[0][:2]
        if not (W <= lon <= E and S <= lat <= N):
            continue
        keep.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 7), round(lat, 7)]},
                     "properties": {"entry": p.get("ListEntry"), "name": p.get("Name"), "kind": kind}})
    keep.sort(key=lambda f: f["properties"]["entry"] or 0)
    write(out_path, keep)
    print(f"listed: {len(keep)} railings and walls of {len(feats)} entries -> {out_path}")


if __name__ == "__main__":
    main(sys.argv[1:])
