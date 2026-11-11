"""Fetch the energy certificates and the address points that locate them, cut to a map's box.

Usage: python3 -I tools/epc_fetch.py <map> [<raw dir>] [--from <certificates.csv or .zip>] [--bulk] [--fresh]

Writes, into <raw dir>/epc/ (data/raw/<map>/wide unless given), what tools/epc.py and
tools/mapdata.py pack_epc read:
- uprn.csv: OS Open UPRN's address points (UPRN, LATITUDE, LONGITUDE) inside the map's box, from
  OS Data Hub's open downloads (no account; the national file, about 600 MB zipped, is kept in
  data/raw/downloads/ and reused);
- certificates.csv: the latest certificate of every home in the box, with only the columns the
  build reads (no address);
- non-domestic.csv: the latest certificate of every business premises in the box, with the first
  line of its address, which pack_epc turns into hashes and never keeps.

The certificates come from the energy certificate register for England and Wales, which needs the
user's own account (GOV.UK One Login, at get-energy-performance-data.communities.gov.uk): its
bearer token is read from the EPC_TOKEN environment variable or ~/.config/combedowner/epc-token,
and is only ever sent to the register's own API. Without one this says how to download them by
hand and stops there, without failing.

How: the councils the box lies in (postcodes.io, round a grid of points over the box) are searched
for every certificate, then each home's latest one is fetched whole, about ten a second, well
under the register's limit. What each gives is kept in <raw dir>/epc/cache/, so a run that stops
carries on where it left off, and a later run only searches the days since and asks the register
which certificates have been removed or moved to another address since (its deltas). The first
run for a city takes an hour or two.
--from filters a download made by hand instead (one council's CSV, or the bulk zip); --bulk
fetches the register's bulk zip of all England and Wales (several gigabytes) and filters that.
Data: OS Open UPRN and the EPC registers, Open Government Licence v3 (the register's address data
is under Royal Mail and Ordnance Survey terms, so no address is ever packed). postcodes.io serves
the ONS Postcode Directory, Open Government Licence v3.
"""
import csv
import datetime
import hashlib
import io
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import MAPS, area

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CACHE = os.path.join(ROOT, "data", "raw", "downloads")
UA = "CombeDowner map builder (https://combedowner.com)"
UPRN_API = "https://api.os.uk/downloads/v1/products/OpenUPRN/downloads"
POSTCODES = "https://api.postcodes.io/postcodes"
EPC_API = "https://api.get-energy-performance-data.communities.gov.uk"
TOKEN_FILE = os.path.join(os.path.expanduser("~"), ".config", "combedowner", "epc-token")
DOMESTIC = ("uprn", "lodgement_date", "walls_description", "property_type", "construction_age_band", "built_form", "floor_level")
PREMISES = ("uprn", "lodgement_date", "address")
CODES = ("property_type", "built_form", "construction_age_band", "flat_level")
PACE = 0.1              # seconds between the register's requests: steady, never a burst
WORKERS = 4            # answers waited on at once, so the pace holds while each takes its time
FIRST_YEAR = 2008       # the register's first certificates
PAGE = 5000             # the most a search page holds
GRID = 7                # points along each side of the box asked which council they are in
DELTA_DAYS = 7          # days of deltas asked for at a time (they are the whole of England and Wales)
MANUAL = ("energy certificates: no token, so download them by hand (docs/new-area.md, \"Energy certificates\"), "
          "or put your own token in EPC_TOKEN or ~/.config/combedowner/epc-token")
csv.field_size_limit(1 << 24)


def token():
    t = os.environ.get("EPC_TOKEN", "").strip()
    if not t and os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f: t = f.read().strip()
    return t or None


def save(url, path, headers=None, md5=None):
    """A download streamed to a temporary name and renamed when whole, so a broken one is never used."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    part, h = path + ".part", hashlib.md5()
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})}), timeout=600) as r, \
            open(part, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk); h.update(chunk)
    if md5 and h.hexdigest() != md5:
        os.remove(part)
        raise SystemExit(f"{os.path.basename(path)}: the download is not what OS listed (md5), try again")
    os.replace(part, path)


# ---- the address points ------------------------------------------------------------------------

def national_uprn(fresh=False):
    listing = json.load(urllib.request.urlopen(urllib.request.Request(UPRN_API, headers={"User-Agent": UA}), timeout=60))
    item = next(d for d in listing if d["format"] == "CSV" and d["area"] == "GB")
    path = os.path.join(CACHE, item["fileName"])
    if fresh or not os.path.exists(path):
        print(f"uprn: fetching {item['fileName']} ({item['size'] / 1e6:.0f} MB)", flush=True)
        save(item["url"], path, md5=item.get("md5"))
    return path


def rows_of(path):
    """The rows of a CSV, or of every CSV in a zip, with the column names in lower case (the old
    register wrote them in capitals)."""
    def read(f):
        r = csv.reader(io.TextIOWrapper(f, encoding="utf-8-sig", errors="replace", newline=""))
        head = [h.strip().lower() for h in next(r, [])]
        for row in r: yield dict(zip(head, row))
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as z:
            for name in sorted(n for n in z.namelist() if n.lower().endswith(".csv")):
                with z.open(name) as f: yield from read(f)
    else:
        with open(path, "rb") as f: yield from read(f)


def box_of(map_id):
    return area(map_id, wide="wide" in MAPS[map_id]).bbox


def cut_uprn(map_id, out, fresh=False):
    """OS Open UPRN's points inside the map's box, written to out; returns the set of UPRNs."""
    W, S, E, N = box_of(map_id)
    kept = {}
    for r in rows_of(national_uprn(fresh)):
        try: lat, lon = float(r["latitude"]), float(r["longitude"])
        except (KeyError, ValueError): continue
        if W <= lon <= E and S <= lat <= N: kept[r["uprn"]] = (r["latitude"], r["longitude"])
    with open(out, "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["UPRN", "LATITUDE", "LONGITUDE"])
        w.writerows([u, *ll] for u, ll in sorted(kept.items(), key=lambda t: int(t[0])))
    print(f"uprn: {len(kept)} address points in the box")
    return set(kept)


def write_csv(path, columns, rows):
    with open(path + ".part", "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(columns)
        w.writerows(rows)
    os.replace(path + ".part", path)


def cut_certificates(src, uprns, out, columns):
    """The certificates in a downloaded file whose UPRN is one of uprns, with only the columns given."""
    seen = [0]
    def rows():
        for r in rows_of(src):
            seen[0] += 1
            if r.get("uprn") in uprns: yield [r.get(c, "") for c in columns]
    got = list(rows())
    write_csv(out, columns, got)
    print(f"{os.path.basename(out)}: {len(got)} of {seen[0]} certificates in the box")


# ---- the register ------------------------------------------------------------------------------

class _Stay(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


class Register:
    """The register's API, asked steadily. Its errors are told by their status alone: nothing that
    says how it was asked (the token) ever reaches the screen."""

    def __init__(self, tok):
        self._head = {"User-Agent": UA, "Accept": "application/json", "Authorization": f"Bearer {tok}"}
        self._last = 0.0
        self._turn = threading.Lock()

    def get(self, path, **query):
        url = f"{EPC_API}{path}" + ("?" + urllib.parse.urlencode(query, doseq=True) if query else "")
        wait = 30
        for _ in range(12):
            with self._turn:
                # one request starts every PACE seconds, however many are waiting on answers
                time.sleep(max(0.0, self._last + PACE - time.time()))
                self._last = time.time()
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=self._head), timeout=120) as r:
                    return json.load(r)
            except urllib.error.HTTPError as e:
                if e.code == 404: return None
                if e.code in (401, 403): raise SystemExit(f"energy certificates: the register refused the token ({e.code}): is it current?") from None
                if e.code == 400: raise SystemExit(f"energy certificates: the register said the question was wrong (400) on {path}") from None
                if e.code != 429 and e.code < 500: raise SystemExit(f"energy certificates: the register answered {e.code} on {path}") from None
                pause = int(e.headers.get("Retry-After") or wait) if e.code == 429 else wait
                print(f"energy certificates: the register answered {e.code}, waiting {pause} s", flush=True)
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                pause = wait
                print(f"energy certificates: no answer, waiting {pause} s", flush=True)
            time.sleep(pause)
            wait = min(wait * 2, 600)
        raise SystemExit(f"energy certificates: the register kept failing on {path}; run again to carry on")

    def file(self, kind):
        """Where the bulk zip of one kind is today (the token goes to the API only, not to the file)."""
        req = urllib.request.Request(f"{EPC_API}/api/files/{kind}/csv", headers=self._head)
        try:
            urllib.request.build_opener(_Stay).open(req, timeout=60)
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308) and e.headers.get("Location"): return e.headers["Location"]
            raise SystemExit(f"energy certificates: the register answered {e.code} for the {kind} file") from None
        raise SystemExit(f"energy certificates: the register gave no {kind} file")

    def search(self, kind, names, since=None, until=None):
        """Every certificate of the councils registered between two days (all of them, without
        since): (certificate, uprn, date, first address line). Asked a council and a year at a
        time, each checked against the count the register gives, as a long run of pages has been
        seen to stop short."""
        until = datetime.date.fromisoformat(until)
        start = datetime.date.fromisoformat(since) if since else datetime.date(FIRST_YEAR, 1, 1)
        out = []
        for name in names:
            day = start
            while day <= until:
                to = min(until, datetime.date(day.year, 12, 31))
                for tries in range(3):
                    got, total = self._pages(kind, name, day.isoformat(), to.isoformat())
                    if len(got) >= total: break
                    print(f"energy certificates: {name} {day.year}: {len(got)} of {total}, asking again", flush=True)
                else:
                    raise SystemExit(f"energy certificates: the register kept stopping short on {name} {day.year}; run again")
                out += got
                day = to + datetime.timedelta(days=1)
        return out

    def _pages(self, kind, name, start, end):
        out, page, total = [], 1, 0
        while page:
            got = self.get(f"/api/{kind}/search", page_size=PAGE, current_page=page,
                           date_start=start, date_end=end, **{"council[]": name})
            if not got: break
            total = (got.get("pagination") or {}).get("totalRecords") or total
            out += [(d["certificateNumber"], str(d.get("uprn") or ""), d.get("registrationDate") or "", d.get("addressLine1") or "")
                    for d in got.get("data", [])]
            page = (got.get("pagination") or {}).get("nextPage")
        return out, total


def councils(reg, bbox):
    """The councils whose areas the box takes in, by asking which council a grid of points over it
    is in, and keeping the names the register knows."""
    W, S, E, N = bbox
    names = set()
    for i in range(GRID):
        for j in range(GRID):
            lon, lat = W + (E - W) * (i + 0.5) / GRID, S + (N - S) * (j + 0.5) / GRID
            q = urllib.parse.urlencode({"lon": f"{lon:.5f}", "lat": f"{lat:.5f}", "radius": 2000, "limit": 1})
            try:
                got = json.load(urllib.request.urlopen(urllib.request.Request(f"{POSTCODES}?{q}", headers={"User-Agent": UA}), timeout=30))
            except OSError:
                continue
            for r in got.get("result") or []:
                if r.get("admin_district"): names.add(r["admin_district"])
            time.sleep(0.1)
    known = []
    for name in sorted(names):
        try:
            if reg.get("/api/domestic/search", page_size=1, **{"council[]": name}) is not None: known.append(name)
        except SystemExit:
            print(f"energy certificates: the register has no council called {name!r}")
    return known


def plain(v):
    """A certificate's value, which the newer schemas wrap as {"value": ..., "language": ...}."""
    return v.get("value") if isinstance(v, dict) else v


def code_tables(reg, cache):
    path = os.path.join(cache, "codes.json")
    if os.path.exists(path):
        with open(path) as f: return json.load(f)
    tables = {}
    for name in CODES:
        got = reg.get("/api/codes/info", code=name) or {"data": []}
        tables[name] = {e["key"]: {v["schemaVersion"]: v["value"] for v in e["values"]} for e in got["data"]}
    with open(path, "w") as f: json.dump(tables, f)
    return tables


def words(tables, name, value, schema):
    """A coded value in words, as the register's CSV writes it."""
    value = plain(value)
    if value is None: return ""
    found = tables.get(name, {}).get(str(value))
    if not found: return str(value)
    return found.get(schema) or max(set(found.values()), key=list(found.values()).count)


def floor_of(c, tables, schema):
    """A flat's floor as the register's CSV writes it: Basement, Ground, 1st ... from the storey a
    survey of an existing home gives, or ground, mid or top floor from a new home's; "" for a house."""
    flat = c.get("sap_flat_details") or {}
    loc = plain(flat.get("flat_location"))
    try: n = int(str(loc).strip())
    except ValueError: n = None
    if n is not None:
        if n < 0: return "Basement"
        if n == 0: return "Ground"
        return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"
    if flat.get("level") is not None: return words(tables, "flat_level", flat["level"], schema)
    return "Basement" if "basement" in str(plain(c.get("dwelling_type")) or "").lower() else ""


def age_of(parts, tables, schema):
    """The main building's age band (the first part's, the extensions coming after it), or the year
    a new home was built."""
    for p in parts:
        if plain(p.get("construction_age_band")): return words(tables, "construction_age_band", p["construction_age_band"], schema)
        if plain(p.get("construction_year")): return str(plain(p["construction_year"]))
    return ""


def reduce(c, tables):
    """What the build reads of one whole certificate."""
    schema = plain(c.get("schema_type")) or ""
    parts = c.get("sap_building_parts") or [{}]
    walls = [plain(w.get("description")) for w in c.get("walls") or [] if isinstance(w, dict)]
    return {"uprn": str(plain(c.get("uprn")) or ""),
            "lodgement_date": plain(c.get("registration_date")) or "",
            "walls_description": walls[0] if walls else "",
            "property_type": words(tables, "property_type", c.get("property_type"), schema),
            "construction_age_band": age_of(parts, tables, schema),
            "built_form": words(tables, "built_form", c.get("built_form"), schema),
            "floor_level": floor_of(c, tables, schema)}


class Store:
    """What the register has said, kept between runs: every certificate the councils' searches
    found, each fetched one's reduced fields, and the day the searches reach to."""

    def __init__(self, folder):
        self.folder = folder
        os.makedirs(folder, exist_ok=True)
        self.state_path = os.path.join(folder, "state.json")
        self.state = json.load(open(self.state_path)) if os.path.exists(self.state_path) else {}
        self.found = {}             # certificate -> (uprn, date)
        for kind in ("domestic", "non-domestic"):
            p = os.path.join(folder, f"{kind}-found.json")
            self.found[kind] = json.load(open(p)) if os.path.exists(p) else {}
        self.fetched = {}
        self._log = os.path.join(folder, "certificates.jsonl")
        if os.path.exists(self._log):
            with open(self._log) as f:
                for line in f:
                    try: d = json.loads(line)
                    except ValueError: continue      # a line cut short when a run was stopped
                    self.fetched[d.pop("certificate")] = d

    def keep(self):
        for kind, found in self.found.items():
            p = os.path.join(self.folder, f"{kind}-found.json")
            with open(p + ".part", "w") as f: json.dump(found, f)
            os.replace(p + ".part", p)
        with open(self.state_path + ".part", "w") as f: json.dump(self.state, f)
        os.replace(self.state_path + ".part", self.state_path)

    def add(self, cert, fields):
        self.fetched[cert] = fields
        with open(self._log, "a") as f: f.write(json.dumps({"certificate": cert, **fields}) + "\n")


def latest(found, uprns):
    """The latest certificate of each UPRN in the box (the later number on the same day)."""
    best = {}
    for cert, (u, day, *_) in found.items():
        if u in uprns and (u not in best or (day, cert) > best[u][:2]): best[u] = (day, cert)
    return {u: c for u, (_, c) in best.items()}


def from_register(map_id, folder, uprns, tok):
    reg = Register(tok)
    store = Store(os.path.join(folder, "cache"))
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    if not store.state.get("councils"):
        store.state["councils"] = councils(reg, box_of(map_id))
        print(f"energy certificates: councils {', '.join(store.state['councils']) or 'none'}", flush=True)
    names = store.state["councils"]
    if not names: return print("energy certificates: the register knows no council in the box")
    since = store.state.get("searched_to")
    if since and since >= yesterday:
        pass
    else:
        after = (datetime.date.fromisoformat(since) + datetime.timedelta(days=1)).isoformat() if since else None
        for kind in ("domestic", "non-domestic"):
            got = reg.search(kind, names, after, yesterday)
            for cert, u, day, line in got: store.found[kind][cert] = [u, day, line] if kind == "non-domestic" else [u, day]
            print(f"energy certificates: {len(got)} {kind} certificates " + (f"since {since}" if since else "in all"), flush=True)
        if since:
            # certificates withdrawn, or moved to another address, since the last run
            moved = set()
            day = datetime.date.fromisoformat(since) + datetime.timedelta(days=1)
            end = datetime.date.fromisoformat(yesterday)
            while day <= end:
                to = min(end, day + datetime.timedelta(days=DELTA_DAYS - 1))
                for e in (reg.get("/api/deltas", date_start=day.isoformat(), date_end=to.isoformat()) or {"data": []})["data"]:
                    cert = e["certificateNumber"]
                    for kind in store.found:
                        if cert not in store.found[kind]: continue
                        if e["eventType"] == "removed": store.found[kind].pop(cert)
                        else: moved.add(cert)
                day = to + datetime.timedelta(days=1)
            for cert in moved: store.fetched.pop(cert, None)
            for cert in moved & set(store.found["domestic"]):
                c = (reg.get("/api/certificate", certificate_number=cert) or {}).get("data")
                if c: store.found["domestic"][cert][0] = str(plain(c.get("uprn")) or "")
            if moved: print(f"energy certificates: {len(moved)} moved to another address", flush=True)
        store.state["searched_to"] = yesterday
        store.keep()

    homes = latest(store.found["domestic"], uprns)
    want = sorted(c for c in homes.values() if c not in store.fetched)
    print(f"energy certificates: {len(homes)} homes in the box, {len(want)} certificates to fetch "
          f"(about {len(want) * PACE / 60:.0f} minutes)", flush=True)
    tables = code_tables(reg, store.folder)
    t0 = time.time()
    from concurrent.futures import ThreadPoolExecutor
    one = lambda cert: (cert, (reg.get("/api/certificate", certificate_number=cert) or {}).get("data"))
    with ThreadPoolExecutor(WORKERS) as pool:
        for k, (cert, c) in enumerate(pool.map(one, want), 1):
            if c: store.add(cert, reduce(c, tables))
            if k % 500 == 0 or k == len(want):
                print(f"energy certificates: {k} of {len(want)} fetched ({(time.time() - t0) / 60:.0f} min)", flush=True)
    rows = []
    for u, cert in sorted(homes.items(), key=lambda t: int(t[0])):
        d = store.fetched.get(cert)
        if d: rows.append([u] + [d[c] for c in DOMESTIC[1:]])
    write_csv(os.path.join(folder, "certificates.csv"), DOMESTIC, rows)
    premises = latest(store.found["non-domestic"], uprns)
    write_csv(os.path.join(folder, "non-domestic.csv"), PREMISES,
              [[u, store.found["non-domestic"][c][1], store.found["non-domestic"][c][2]] for u, c in sorted(premises.items(), key=lambda t: int(t[0]))])
    print(f"energy certificates: {len(rows)} homes and {len(premises)} premises written")


def from_bulk(folder, uprns, tok, fresh):
    reg = Register(tok)
    for kind, name, columns in (("domestic", "certificates", DOMESTIC), ("non-domestic", "non-domestic", PREMISES)):
        zipped = os.path.join(CACHE, f"epc-{kind}-csv.zip")
        if fresh or not os.path.exists(zipped):
            print(f"energy certificates: fetching the register's {kind} file (gigabytes)", flush=True)
            try:
                save(reg.file(kind), zipped)
            except urllib.error.HTTPError as e:
                # the file's address is a signed link: say what went wrong without it
                raise SystemExit(f"energy certificates: the {kind} file's download answered {e.code}") from None
        cut_certificates(zipped, uprns, os.path.join(folder, f"{name}.csv"), columns)


def main(argv):
    given = argv[argv.index("--from") + 1] if "--from" in argv else None
    args = [a for a in argv if not a.startswith("--") and a != given]
    fresh = "--fresh" in argv
    map_id = args[0]
    raw = args[1] if len(args) > 1 else os.path.join(ROOT, "data", "raw", map_id, "wide")
    folder = os.path.join(raw, "epc")
    os.makedirs(folder, exist_ok=True)
    uprn_csv = os.path.join(folder, "uprn.csv")
    if fresh or not os.path.exists(uprn_csv):
        uprns = cut_uprn(map_id, uprn_csv, fresh)
    else:
        with open(uprn_csv, encoding="utf-8-sig") as f: uprns = {r["UPRN"] for r in csv.DictReader(f)}
    if given:
        return cut_certificates(given, uprns, os.path.join(folder, "certificates.csv"), DOMESTIC)
    tok = token()
    if not tok: return print(MANUAL)
    if "--bulk" in argv: from_bulk(folder, uprns, tok, fresh)
    else: from_register(map_id, folder, uprns, tok)


if __name__ == "__main__":
    main(sys.argv[1:])
