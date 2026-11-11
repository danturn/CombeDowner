"""What houses are built of, from Energy Performance Certificates (England and Wales, and Scotland).

Data, both open:
- the domestic EPC register for the local authority, from
  get-energy-performance-data.communities.gov.uk (Domestic certificates, CSV), saved as
  <raw dir>/epc/certificates.csv. Every home sold or let since 2008 has one, with its wall
  construction ("Sandstone or limestone", "Solid brick", "Cavity wall" ...) and type (house,
  bungalow, flat), and a UPRN, the unique number of the address;
- OS Open UPRN, which locates every UPRN, from osdatahub.os.uk/downloads/open/OpenUPRN (CSV),
  saved as <raw dir>/epc/uprn.csv. The national file is large: keep just the area (see README).

In Scotland both are fetched with no account (python3 -I tools/epc.py <map> scotland <raw dir>):
the Scottish Government's domestic EPC dataset (data.gov.scot, one 7z archive of every current
certificate since 2016, about 200 MB) and OS Open UPRN (OS Downloads API, about 600 MB), both kept
once in data/raw/ for every map. The certificates are cut to the map's addresses and written in
England's columns, so everything after reads them the same way. Their address fields come under
Royal Mail's terms, not the Open Government Licence, so they are never read.

Each address takes its latest certificate and lands in the building footprint it stands in (or
the nearest within a few metres). A building then takes the wall most of its addresses report,
where that says something visible: stone, brick or render. A cavity wall could be faced in any of
them, so those leave the guess from buildings.py alone.
"""
import csv, io, json, os, pickle, re, shutil, subprocess, sys, urllib.request, zipfile, zlib
import numpy as np
import shapely

WALLS = (("sandstone", "stone"), ("limestone", "stone"), ("granite", "stone"), ("solid brick", "brick"),
         ("system built", "render"), ("timber frame", "render"), ("cob", "render"))
NEAR = 4.0      # metres: an address point this close outside a footprint still belongs to it


def load(folder, bbox, proj):
    """Addresses inside bbox (W, S, E, N, lon/lat): a list of (x, y, wall or None, bungalow, a house)."""
    certs, uprns = os.path.join(folder, "certificates.csv"), os.path.join(folder, "uprn.csv")
    if not (os.path.exists(certs) and os.path.exists(uprns)): raise FileNotFoundError(f"no EPC data in {folder}")
    # every square of the map reads the same addresses, so they're worked out once and kept beside
    # the data, until the files, the area or where the map is centred change
    key = repr((bbox, proj(*bbox[:2]), [(os.path.getsize(p), os.path.getmtime(p)) for p in (certs, uprns)], "house"))
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
        out.append((*where[u], wall, r["property_type"] == "Bungalow", r["property_type"] in ("House", "Bungalow")))
    return out


def per_building(addresses, polys):
    """For each footprint: dict(wall=..., bungalow=..., n=addresses, houses=how many are a house or
    bungalow) from the addresses in it, or None. A flat's certificate says nothing of the building:
    a house divided into flats and a block built as flats both have them."""
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
        out.append(dict(wall=wall, bungalow=all(g[3] for g in got), n=len(got), houses=sum(1 for g in got if g[4])))
    return out


# ---- Scotland -------------------------------------------------------------------------------------

UA = {"User-Agent": "CombeDowner map builder (https://combedowner.com)"}
SHARED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw")
OPEN_UPRN = "https://api.os.uk/downloads/v1/products/OpenUPRN/downloads"
SCOTTISH_SEARCH = "https://data.gov.scot/data?q=domestic+energy+performance+certificates"
# the Scottish register's columns -> England's, which the rest of the build reads
SCOTTISH_COLUMNS = {"OSG_REFERENCE_NUMBER": "uprn", "LODGEMENT_DATE": "lodgement_date", "WALL_DESCRIPTION": "walls_description",
                    "PROPERTY_TYPE": "property_type", "BUILT_FORM": "built_form", "CONSTRUCTION_AGE_BAND": "construction_age_band"}


def download(url, path):
    if os.path.exists(path): return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as r, open(path + ".part", "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)
    os.replace(path + ".part", path)
    return path


def open_uprn(bbox, out):
    """OS Open UPRN's points inside bbox (W, S, E, N), in its own columns, into out. The national file
    is fetched once into data/raw/os-open-uprn/ and read straight from its zip."""
    with urllib.request.urlopen(urllib.request.Request(OPEN_UPRN, headers=UA), timeout=60) as r:
        csv_zip = next(d for d in json.load(r) if d["format"] == "CSV" and d["area"] == "GB")
    path = download(csv_zip["url"], os.path.join(SHARED, "os-open-uprn", csv_zip["fileName"]))
    W, S, E, N = bbox
    kept = 0
    with zipfile.ZipFile(path) as z, open(out + ".part", "w", newline="") as f:
        name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        with io.TextIOWrapper(z.open(name), encoding="utf-8-sig") as src:
            head = src.readline()
            f.write(head)
            cols = head.strip().split(",")
            ilat, ilon = cols.index("LATITUDE"), cols.index("LONGITUDE")
            for line in src:
                v = line.split(",")
                if S <= float(v[ilat]) <= N and W <= float(v[ilon]) <= E:
                    f.write(line); kept += 1
    os.replace(out + ".part", out)
    print(f"epc: {kept} UPRNs in the box from {os.path.basename(path)}")


def _scottish_archive():
    """The newest domestic EPC dataset on data.gov.scot (the current certificates, not the extended
    history), fetched once into data/raw/scotland/."""
    def page(url):
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: return r.read().decode()
    found = re.findall(r'href="(/dataset/domestic_energy_performance_certificates___dataset_to_[a-z0-9_]+)"', page(SCOTTISH_SEARCH))
    if not found: raise SystemExit(f"epc: no domestic EPC dataset found at {SCOTTISH_SEARCH}")
    ds = "https://data.gov.scot" + found[0]
    link = re.search(r'href="(/dataset/[^"]+/resource/[0-9a-f-]+/download)"', page(ds))
    if not link: raise SystemExit(f"epc: no download on {ds}")
    title = re.search(r"<h1[^>]*>([^<]+)</h1>", page(ds))
    print(f"epc: {title.group(1).strip() if title else ds}")
    return download("https://data.gov.scot" + link.group(1), os.path.join(SHARED, "scotland", os.path.basename(found[0]) + ".7z"))


def _csv_rows_7z(archive):
    """Every row of every CSV in a 7z archive, as one stream, through 7-Zip or libarchive's bsdtar
    (whichever this machine has), or py7zr. The archive is solid, so it is read once from end to
    end rather than member by member. Each file starts with its header, which comes through as a row."""
    tool = next((t for t in ("7zz", "7z", "7za", "bsdtar") if shutil.which(t)), None)
    if tool:
        cmd = [tool, "-xOf", archive] if tool == "bsdtar" else [tool, "e", "-so", archive, "*.csv"]
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
        yield from csv.reader(io.TextIOWrapper(p.stdout, encoding="utf-8", errors="replace", newline=""))
        p.stdout.close()
        if p.wait(): raise SystemExit(f"epc: {tool} could not read {archive}")
        return
    try:
        import py7zr, tempfile
    except ImportError:
        raise SystemExit("epc: the Scottish certificates are a 7z archive: install 7-Zip, libarchive's bsdtar or py7zr")
    with tempfile.TemporaryDirectory(dir=os.path.dirname(archive)) as tmp:
        with py7zr.SevenZipFile(archive) as z: z.extractall(tmp)
        for name in sorted(os.listdir(tmp)):
            if name.lower().endswith(".csv"):
                with open(os.path.join(tmp, name), encoding="utf-8", errors="replace", newline="") as f: yield from csv.reader(f)


def scotland(map_id, raw):
    """The Scottish certificates of the map's addresses, in England's columns, into <raw>/epc/."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from area import area
    A = area(map_id, wide=True)
    folder = os.path.join(raw, "epc")
    os.makedirs(folder, exist_ok=True)
    uprns, certs = os.path.join(folder, "uprn.csv"), os.path.join(folder, "certificates.csv")
    if not os.path.exists(uprns): open_uprn(A.bbox, uprns)
    with open(uprns, encoding="utf-8-sig") as f: wanted = {r["UPRN"] for r in csv.DictReader(f)}
    latest, read, head = {}, 0, None
    for r in _csv_rows_7z(_scottish_archive()):
        if r and r[0].lstrip("\ufeff") == "BUILDING_REFERENCE_NUMBER":
            head = [c.lstrip("\ufeff") for c in r]
            at = {head.index(k): v for k, v in SCOTTISH_COLUMNS.items()}
            iu, idate = head.index("OSG_REFERENCE_NUMBER"), head.index("LODGEMENT_DATE")
            continue
        # (the line after each header repeats it in words, and has no UPRN of the map's)
        if head is None or len(r) != len(head) or r[iu] not in wanted: continue
        read += 1
        if r[iu] in latest and latest[r[iu]]["lodgement_date"] >= r[idate]: continue
        row = {v: r[k].strip() for k, v in at.items()}
        # a home of more than one build lists each wall, the main one first: England's name one
        row["walls_description"] = row["walls_description"].split(" | ")[0]
        latest[r[iu]] = row
    with open(certs + ".part", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(SCOTTISH_COLUMNS.values()))
        w.writeheader()
        w.writerows(latest[u] for u in sorted(latest, key=int))
    os.replace(certs + ".part", certs)
    walls = {}
    for r in latest.values():
        k = next((m for d, m in WALLS if d in r["walls_description"].lower()), "other")
        walls[k] = walls.get(k, 0) + 1
    print(f"epc: {len(latest)} homes with a certificate ({read} certificates) of {len(wanted)} addresses: "
          + ", ".join(f"{k} {n}" for k, n in sorted(walls.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[2] != "scotland":
        raise SystemExit("usage: python3 -I tools/epc.py <map> scotland <raw dir>")
    scotland(sys.argv[1], sys.argv[3])
