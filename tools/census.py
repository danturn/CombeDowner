"""Fetch the census's accommodation types for every output area round a game map.

Usage: python3 -I tools/census.py <map> <out.geojson> [wide]

An output area is the smallest piece the census is published for, about 125 households. Table
TS044 says how many of each area's households live in a detached, semi-detached or terraced house,
a purpose-built block of flats, a converted house or other building, over a shop or in a caravan.
The build (buildings.classify) takes that mix as what to expect of the houses in each area wherever
the map data and the surveys don't say. England and Wales only: elsewhere there are no output
areas and the file has none.

In Scotland the same comes from Scotland's Census 2022 (National Records of Scotland): its output
areas are the same size, table UV402 counts households by the same types, and the two are read
into the same file. A Scottish converted house is England's converted house (Scotland doesn't
count the other converted buildings apart), and its purpose-built flats include the tenements.
- the output areas' outlines: NRS's Census 2022 map service (maps.gov.scot, layer OutputArea2022);
- UV402: the census's bulk download of output area tables (scotlandscensus.gov.uk, a 74 MB zip,
  fetched once into data/raw/scotland/). The counts are perturbed for confidentiality, so an
  area's types needn't add up to its total.

Read from two public services, both open (no account):
- the output areas' outlines: ONS Open Geography, Output Areas (December 2021) Boundaries EW BFC;
- TS044 for those areas: Nomis, dataset NM_2062_1.
Each feature is one output area, its code ("oa") and its households ("hh") in the order of TYPES.
Data: Office for National Statistics, Open Government Licence v3; data/combe-down/README.md has
the attribution. Scotland: National Records of Scotland, Open Government Licence v3.
"""
import csv
import io
import json
import re
import zipfile
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

OUTLINES = ("https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
            "Output_Areas_2021_EW_BFC_V8/FeatureServer/0/query")
TS044 = "https://www.nomisweb.co.uk/api/v01/dataset/NM_2062_1.data.csv"
SCOTTISH_OUTLINES = "https://maps.gov.scot/server/rest/services/NRS/Census2022/MapServer/3/query"
SCOTTISH_TABLES = "https://www.scotlandscensus.gov.uk/documents/2022-output-area-data"
# UV402's columns, in the order of TYPES (no Scottish column for a converted building that wasn't a house)
UV402 = ("Whole house or bungalow: Detached", "Whole house or bungalow: Semi-detached",
         "Whole house or bungalow: Terraced (including end-terrace)",
         "Flat, maisonette or apartment: Purpose-built block of flats or tenement",
         "Flat, maisonette or apartment: Part of a converted or shared house (including bed-sits)", None,
         "Flat, maisonette or apartment: In a commercial building", "Caravan or other mobile or temporary structure")
RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw")
# TS044's categories 1 to 8, in order: what each area's "hh" counts
TYPES = ("detached", "semi", "terraced", "flats", "converted_house", "converted_other", "commercial", "caravan")
UA = {"User-Agent": "CombeDowner map builder (https://combedowner.com)"}


def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except OSError:
            if k == tries - 1: raise
            time.sleep(5 * 2 ** k)


def outlines(bbox, service=OUTLINES, code="OA21CD"):
    out, offset = [], 0
    while True:
        q = dict(f="geojson", where="1=1", geometry=",".join(str(v) for v in bbox), geometryType="esriGeometryEnvelope",
                 inSR=4326, spatialRel="esriSpatialRelIntersects", outFields=code, outSR=4326,
                 geometryPrecision=6, orderByFields=code, resultOffset=offset, resultRecordCount=1000)
        d = json.loads(get(service + "?" + urllib.parse.urlencode(q)))
        got = d.get("features", [])
        out += got
        if len(got) < 1000 and not d.get("properties", {}).get("exceededTransferLimit"):
            return out
        offset += len(got)


def households(codes):
    hh = {c: [0] * len(TYPES) for c in codes}
    for k in range(0, len(codes), 150):
        q = dict(geography=",".join(codes[k:k + 150]), measures=20100, select="geography_code,c2021_acctype_9,obs_value")
        lines = get(TS044 + "?" + urllib.parse.urlencode(q)).decode().splitlines()[1:]
        for line in lines:
            code, cat, n = (v.strip('"') for v in line.split(","))
            if code in hh and 1 <= int(cat) <= len(TYPES): hh[code][int(cat) - 1] = int(n)
    return hh


def scottish_households(codes):
    """UV402 for these output areas, from the census's bulk download."""
    path = os.path.join(RAW, "scotland", "census-2022-output-area.zip")
    if not os.path.exists(path):
        link = re.search(r'href="([^"]+Census-2022-Output-Area[^"]*\.zip)"', get(SCOTTISH_TABLES).decode())
        if not link: raise SystemExit(f"census: no output area tables linked from {SCOTTISH_TABLES}")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path + ".part", "wb") as f: f.write(get(urllib.parse.urljoin(SCOTTISH_TABLES, link.group(1))))
        os.replace(path + ".part", path)
    hh = {c: [0] * len(TYPES) for c in codes}
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.startswith("UV402"))
        rows = csv.reader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig"))
        head = next(r for r in rows if len(r) > 2)
        cols = [head.index(c) if c else None for c in UV402]
        for r in rows:
            if r and r[0] in hh:
                hh[r[0]] = [0 if k is None or r[k] in ("-", "") else int(r[k]) for k in cols]
    return hh


def main(argv):
    A = area(argv[0], wide="wide" in argv[2:])
    scottish = getattr(A, "region", None) == "GB-SCT"
    code = "code" if scottish else "OA21CD"
    feats = outlines(A.bbox, SCOTTISH_OUTLINES, code) if scottish else outlines(A.bbox)
    codes = sorted({f["properties"][code] for f in feats})
    hh = (scottish_households if scottish else households)(codes) if codes else {}
    keep = [{"type": "Feature", "geometry": f["geometry"], "properties": {"oa": f["properties"][code], "hh": hh[f["properties"][code]]}}
            for f in sorted(feats, key=lambda f: f["properties"][code]) if sum(hh[f["properties"][code]])]
    text = '{"type":"FeatureCollection","features":[' + \
        ",\n".join(json.dumps(f, separators=(",", ":")) for f in keep) + "]}\n"
    with open(argv[1], "w", encoding="utf-8") as fh:
        fh.write(text)
    total = [sum(f["properties"]["hh"][i] for f in keep) for i in range(len(TYPES))]
    print(f"census: {len(keep)} output areas, {sum(total)} households: " +
          ", ".join(f"{t} {100 * n / max(1, sum(total)):.0f}%" for t, n in zip(TYPES, total)))


if __name__ == "__main__":
    main(sys.argv[1:])
