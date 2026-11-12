"""Convert HM Land Registry's INSPIRE Index Polygons, or Registers of Scotland's INSPIRE cadastral
parcels, into a wide-area layer for a game map.

Usage: python3 -I tools/parcels.py <map> <in.zip or .gml> [more ...] <out.geojson> [wide]
       python3 -I tools/parcels.py <map> ros <out.geojson> [wide]      (Scotland: fetched as needed)

A map across a council's border takes each council's download, one after another.

Writes the registered freehold property extents that touch the map's area, as the other wide
`.geojson` layers are kept (tools/mapdata.py). The download is one zip per local authority from
use-land-property-data.service.gov.uk/datasets/inspire/download (`<Council name>.zip`, holding
`Land_Registry_Cadastral_Parcels.gml`): a plain download, no sign-in. The GML is in British
National Grid (EPSG:27700, to the centimetre), so the polygons are reprojected to the lon/lat the
rest of the map is in with pyproj, whose OSTN15 grid is what gives the 1 m agreement with the
footprints; PROJ's fallback (a 2 m Helmert) would put every boundary two metres out.

The polygons' extents are *indicative*, not the legal boundary (only an individual title plan shows
that), and the licence forbids deriving building footprints from them, so the build reads them only
where it divides plots (tools/partition/plots.py). Data: HM Land Registry INSPIRE Index Polygons,
Open Government Licence v3; data/combe-down/README.md has the two attributions the licence
requires.

In Scotland Registers of Scotland publish the same kind of layer (ownership at ground level for
each registered title, indicative too) under the Open Government Licence, one zip per registration
county from ros-inspire.themapcloud.com, a plain download, no sign-in. `ros` reads the bounds in
each county's shapefile header straight from the archive (a few small ranged reads), fetches only
the counties whose parcels reach the map into data/raw/scotland/ros/, and converts their British
National Grid polygons as above. About a third of Scotland's ground has no parcel: ground whose
owner the register can't place at ground level (tenements' common parts, unregistered land).
Data: Registers of Scotland, Open Government Licence v3: "© Crown copyright. Reproduced with the
permission of Registers of Scotland. Contains OS data © Crown copyright and database right <year>".
"""
import io, json, math, os, struct, sys, urllib.request, zipfile
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

GML = "{http://www.opengis.net/gml/3.2}"
LR = "{www.landregistry.gov.uk}"
WFS = "{http://www.opengis.net/wfs/2.0}"
PARTS = "{http://www.opengis.net/gml/3.2}"
ROS = "https://ros-inspire.themapcloud.com/maps/download/ros-cp.cadastralparcel/{county}"
# the service's files: one for each of Scotland's land registration counties
ROS_COUNTIES = ("ABN", "ANG", "ARG", "AYR", "BNF", "BER", "BUT", "CTH", "CLK", "DMB", "DMF", "ELN", "FFE", "GLA", "INV",
                "KNC", "KNR", "KRK", "LAN", "MID", "MOR", "NRN", "OAZ", "PBL", "PTH", "REN", "ROS", "ROX", "SEL", "STG",
                "STH", "WLN", "WGN")
UA = {"User-Agent": "CombeDowner map builder (https://combedowner.com)"}
RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw")
DEC = 7                  # decimal places of lon/lat kept: about a centimetre, the GML's own precision


def gml_stream(path):
    """The GML opened for reading, from the download's zip or from the file itself."""
    if zipfile.is_zipfile(path):
        z = zipfile.ZipFile(path)
        name = next(n for n in z.namelist() if n.lower().endswith(".gml"))
        return z.open(name)
    return open(path, "rb")


def members(stream):
    """Every polygon in the GML, one at a time, as (INSPIRE ID, [[(e, n), ...] rings]): read with
    iterparse so the 100 MB file is never all in memory."""
    for _, el in ET.iterparse(stream, events=("end",)):
        if el.tag == WFS + "member":
            el.clear()
            continue
        if not el.tag.endswith("PREDEFINED"):
            continue
        rings = []
        for pl in el.iter(GML + "posList"):
            v = [float(t) for t in (pl.text or "").split()]
            rings.append(list(zip(v[0::2], v[1::2])))
        yield el.findtext(LR + "INSPIREID"), rings
        el.clear()


class Ranged(io.RawIOBase):
    """A file on a server that answers ranged requests, read only where it's asked for, so zipfile
    can read an archive's directory and one member's first bytes without fetching the rest."""
    def __init__(self, url):
        with urllib.request.urlopen(urllib.request.Request(url, headers={**UA, "Range": "bytes=0-0"}), timeout=60) as r:
            self.url, self.size, self.pos = r.url, int(r.headers["Content-Range"].split("/")[1]), 0

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos

    def seek(self, offset, whence=0):
        self.pos = (offset, self.pos + offset, self.size + offset)[whence]
        return self.pos

    def readinto(self, b):
        end = min(self.size, self.pos + len(b))
        if end <= self.pos: return 0
        with urllib.request.urlopen(urllib.request.Request(self.url, headers={**UA, "Range": f"bytes={self.pos}-{end - 1}"}), timeout=60) as r:
            data = r.read()
        b[:len(data)] = data
        self.pos += len(data)
        return len(data)


def shp_bounds(stream):
    """The (e0, n0, e1, n1) a shapefile's header says its shapes lie in."""
    return struct.unpack("<4d", stream.read(100)[36:68])


def shp_polygons(shp, dbf, field="inspireid"):
    """Every polygon in a shapefile, one at a time, as (its field's value, [[(e, n), ...] rings]),
    read as the files stream past."""
    head = dbf.read(32)
    count, header_len, record_len = struct.unpack("<IHH", head[4:12])
    fields, at = [], 1
    for _ in range((header_len - 33) // 32):
        d = dbf.read(32)
        fields.append((d[:11].split(b"\0")[0].decode(), at, d[16]))
        at += d[16]
    dbf.read(header_len - 32 - 32 * len(fields))
    _, start, width = next(f for f in fields if f[0].lower() == field)
    shp.read(100)
    for _ in range(count):
        rec = dbf.read(record_len)
        key = rec[start:start + width].decode("latin-1").strip()
        _, words = struct.unpack(">2i", shp.read(8))
        body = shp.read(2 * words)
        if struct.unpack("<i", body[:4])[0] != 5: yield key, []; continue
        parts, points = struct.unpack("<2i", body[36:44])
        starts = list(struct.unpack(f"<{parts}i", body[44:44 + 4 * parts])) + [points]
        xy = struct.unpack(f"<{2 * points}d", body[44 + 4 * parts:44 + 4 * parts + 16 * points])
        yield key, [list(zip(xy[2 * a:2 * b:2], xy[2 * a + 1:2 * b:2])) for a, b in zip(starts, starts[1:])]


def ros_members(paths):
    """The parcels in Registers of Scotland's county zips (British National Grid)."""
    for path in paths:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            stem = next(n[:-4] for n in names if n.lower().endswith("_bng.shp"))
            with z.open(stem + ".shp") as shp, z.open(stem + ".dbf") as dbf:
                yield from shp_polygons(io.BufferedReader(shp, 1 << 20), io.BufferedReader(dbf, 1 << 20))


def ros_counties(box):
    """Registers of Scotland's county zips whose parcels reach the box (British National Grid),
    fetched into data/raw/scotland/ros/ if they aren't there already."""
    e0, n0, e1, n1 = box
    out = []
    for county in ROS_COUNTIES:
        path = os.path.join(RAW, "scotland", "ros", f"{county}.zip")
        f = open(path, "rb") if os.path.exists(path) else io.BufferedReader(Ranged(ROS.format(county=county)), 1 << 16)
        with zipfile.ZipFile(f) as z:
            shp = next(n for n in z.namelist() if n.lower().endswith("_bng.shp"))
            with z.open(shp) as s: x0, y0, x1, y1 = shp_bounds(s)
        f.close()
        if x1 < e0 or x0 > e1 or y1 < n0 or y0 > n1: continue
        if not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with urllib.request.urlopen(urllib.request.Request(ROS.format(county=county), headers=UA), timeout=600) as r, \
                    open(path + ".part", "wb") as fh:
                while True:
                    b = r.read(1 << 20)
                    if not b: break
                    fh.write(b)
            os.replace(path + ".part", path)
        print(f"parcels: Registers of Scotland's {county} reaches the map")
        out.append(path)
    return out


def polygon(rings):
    """GeoJSON for a shapefile's rings: clockwise ones are outlines, the rest holes in the outline
    before them."""
    shapes = []
    for r in rings:
        area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(r, r[1:]))
        if area < 0 or not shapes: shapes.append([r])
        else: shapes[-1].append(r)
    if len(shapes) == 1: return {"type": "Polygon", "coordinates": shapes[0]}
    return {"type": "MultiPolygon", "coordinates": shapes}


def bounds(rings):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def main():
    from pyproj import Transformer
    args = sys.argv[2:]
    wide = args[-1] == "wide"
    if wide: args = args[:-1]
    src = area(sys.argv[1], wide=wide)
    in_paths, out_path = args[:-1], args[-1]
    from lidar import bng_transformer
    # (it stops the build if PROJ can't reach the OSTN15 grid, which the reverse needs as well)
    to_bng = bng_transformer()
    to_wgs = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)
    W, S, E, N = src.bbox
    # the bbox's envelope in the grid's metres: a first, conservative cut before reprojecting, so
    # the polygons of the rest of the county are never transformed (their edges are monotonic in
    # both longitude and latitude, so the four corners' envelope covers the whole area)
    es, ns = to_bng.transform([W, E, W, E], [S, S, N, N])
    bw, bs, be, bn = min(es), min(ns), max(es), max(ns)

    scottish = in_paths == ["ros"]
    found = ros_members(ros_counties((bw, bs, be, bn))) if scottish else (m for path in in_paths for m in members(gml_stream(path)))
    feats, seen, tried = [], 0, 0
    for insp, rings in found:
        tried += 1
        if not rings:
            continue
        x0, y0, x1, y1 = bounds(rings)
        if x1 < bw or x0 > be or y1 < bs or y0 > bn:
            continue
        out = []
        for r in rings:
            lons, lats = to_wgs.transform([p[0] for p in r], [p[1] for p in r])
            out.append([[round(a, DEC), round(b, DEC)] for a, b in zip(lons, lats)])
        lx = [p[0] for r in out for p in r]
        ly = [p[1] for r in out for p in r]
        if max(lx) < W or min(lx) > E or max(ly) < S or min(ly) > N:
            continue
        seen += 1
        feats.append({"id": insp, "type": "Feature", "geometry": polygon(out) if scottish else {"type": "Polygon", "coordinates": out},
                      "properties": {"inspire_id": insp}})

    text = '{"type":"FeatureCollection","features":[' + \
        ",\n".join(json.dumps(f, separators=(",", ":"), ensure_ascii=False) for f in feats) + "]}\n"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"parcels: {seen} of {tried} polygons touch the area -> {out_path} "
          f"({os.path.getsize(out_path) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
