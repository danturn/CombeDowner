"""The buildings the map's buildings layer (Overture's, mostly OpenStreetMap's) leaves out, from
other sources, as the footprints layer every map packs beside it: the build takes each of these
footprints as one more building (prep_map.py, prep_wide.py, the partition), so a street
OpenStreetMap hasn't mapped yet still has its houses.

Usage: python3 tools/footprints.py <map> fetch [<raw dir>]     the machine-learned footprints the map lists, over
                                                              the wide box (cached in <raw dir>/../footprints/; needs duckdb)
       python3 -I tools/footprints.py <map> merge [<raw dir>]  -> <raw dir>/footprints.geojson

Which sources feed it is the map's own setting (footprints in tools/area.py), best first; each
footprint is kept only where nothing better already stands on it, the buildings layer itself
being best and never touched:
- "survey": the heights layer's outlines (tools/cct.py: the City of Cape Town's 2D Building
  Footprints, drawn from aerial photographs);
- "google": Google Open Buildings v3 (CC BY 4.0 or ODbL), machine-learned from satellite images,
  as VIDA keeps it per country (source.coop/vida/google-microsoft-open-buildings, ODbL), for the
  map's country. The model says how sure it was of each, and the least sure are left out.
Microsoft's footprints aren't a source: Overture's buildings already take them where
OpenStreetMap has none. A map listing no sources packs an empty layer, and builds as it would
without one.
"""
import json, math, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

VIDA = "https://data.source.coop/vida/google-microsoft-open-buildings/geoparquet/by_country/country_iso={iso}/{iso}.parquet"
SURE = 0.75        # Google's confidence below which a footprint is left out (its least sure go down to 0.65)
LEAST = 10.0       # square metres: anything smaller is a shed or a trace of nothing
COVERED = 0.1      # a footprint counts as already standing where this much of it, or of what it meets, overlaps


def cache(raw):
    return os.path.join(os.path.dirname(os.path.abspath(raw)), "footprints")


def fetch(A, raw):
    out = os.path.join(cache(raw), "google.geojson")
    if "google" not in getattr(A, "footprints", ()):
        print("footprints: the map lists no machine-learned source, nothing fetched"); return
    import duckdb
    W, S, E, N = A.bbox
    os.makedirs(cache(raw), exist_ok=True)
    t = time.time()
    con = duckdb.connect()
    con.sql("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    rows = con.sql(f"SELECT confidence, ST_AsGeoJSON(geometry) FROM read_parquet('{VIDA.format(iso=A.country)}') "
                   f"WHERE bf_source = 'google' AND bbox.xmin > {W} AND bbox.xmax < {E} AND bbox.ymin > {S} AND bbox.ymax < {N}").fetchall()
    feats = [dict(type="Feature", properties=dict(src="google", conf=round(c, 3)), geometry=json.loads(g)) for c, g in rows]
    feats.sort(key=lambda f: json.dumps(f["geometry"]))
    with open(out, "w") as f:
        f.write('{"type":"FeatureCollection","features":[' + ",\n".join(json.dumps(x, separators=(",", ":")) for x in feats) + "]}\n")
    print(f"footprints: {len(feats)} of Google's footprints in {A.country} over the wide box ({time.time() - t:.0f}s) -> {out}")


def merge(A, raw):
    import shapely
    from shapely.geometry import shape
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574

    def read(path):
        if not os.path.exists(path): return []
        out = []
        for f in json.load(open(path))["features"]:
            g = shape(f["geometry"])
            m = shapely.transform(g, lambda a: (a - [lon0, lat0]) * [kx, ky]).buffer(0)
            if not m.is_empty: out.append((m, f))
        return out

    taken = [m for m, _ in read(os.path.join(raw, "building.geojson"))] if getattr(A, "footprints", ()) else []
    tree = shapely.STRtree(taken) if taken else None
    sources = {
        "survey": lambda: [(m, f, f["properties"].get("src") or "survey") for m, f in read(os.path.join(raw, "heights.geojson"))],
        "google": lambda: [(m, f, "google") for m, f in read(os.path.join(cache(raw), "google.geojson")) if f["properties"]["conf"] >= SURE],
    }
    added, counts = [], {}
    for name in getattr(A, "footprints", ()):
        rank = sources[name]()
        if name == "google" and not rank: raise SystemExit(f"footprints: no Google footprints in {cache(raw)}: fetch them first")
        later = shapely.STRtree([m for m, _, _ in added]) if added else None
        for m, f, src in rank:
            if m.area < LEAST: continue
            near = ([taken[i] for i in tree.query(m)] if tree is not None else []) + \
                   ([added[i][0] for i in later.query(m)] if later is not None else [])
            if any(m.intersection(h).area > COVERED * min(m.area, h.area) for h in near): continue
            added.append((m, f, src))
            counts[src] = counts.get(src, 0) + 1
    feats = [dict(type="Feature", properties=dict(is_underground=False, has_parts=False, src=src), geometry=f["geometry"])
             for _, f, src in added]
    path = os.path.join(raw, "footprints.geojson")
    with open(path, "w") as f:
        f.write('{"type":"FeatureCollection","features":[' + ",\n".join(json.dumps(x, separators=(",", ":")) for x in feats) + "]}\n")
    print(f"footprints: {len(feats)} buildings the buildings layer lacks ({', '.join(f'{v} {k}' for k, v in sorted(counts.items())) or 'none'}) -> {path}")


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[2] not in ("fetch", "merge"): sys.exit(__doc__)
    A = area(sys.argv[1], wide=True)
    raw = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw", sys.argv[1], "wide")
    dict(fetch=fetch, merge=merge)[sys.argv[2]](A, raw)
