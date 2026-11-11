"""Each building's character, measured from the map's kept data, the same fields for every map.

    survey = Survey("combe-down", (x0, y0, x1, y1))      # map metres: reads only what is near
    rec, gap = survey.near(thing_geometry)               # the nearest building's character, and how far

A record, None wherever the data says nothing:
- form: "detached", "semi", "end-terrace" or "terrace": the energy certificates' built form, then
  OpenStreetMap's terraced tags, then how many houses share its walls, or how many houses' addresses
  one footprint holds (a row of houses the map draws as one outline);
- built: (earliest, latest) years it was built: from OpenStreetMap's start_date or style, the
  age band most of its homes' certificates give, its being listed, then the zone of area.py (rules.json's "evidence"
  sets the order); built_from names which;
- basement: True or False: OpenStreetMap's floors underground, Overture's, or a certificate for a
  basement flat in it;
- listed: its grade ("I", "II*", "II") on the National Heritage List for England; listed_entry;
- conservation: the name of the conservation area it stands in;
- material, architecture, heritage, start_date: OpenStreetMap's own tags, as mapped;
- zone: area.py's zone there, for rules where the data is thin.

Read from data/<map>/ (heritage, conservation, osm-character, building and footprints, and the
energy certificates' age band, built form and floor where the download kept them), or from the raw
dir with the same names. A map without one of them just has those fields unknown.
"""
import csv
import io
import json
import lzma
import math
import os
import re
import sys

import shapely
from shapely.geometry import box, shape
from shapely.ops import transform
from shapely.strtree import STRtree

TOOLS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, TOOLS)
from area import area                       # noqa: E402
from character import rules                 # noqa: E402

ROOT = os.path.dirname(TOOLS)
HOUSE_M2 = 28.0         # a smaller footprint sharing a wall is a shed or an extension, not a neighbour
NEAR = 4.0              # metres: an address or a mapper's point this close outside a footprint is still its
LISTED_SHARE = 0.3      # of a footprint a listed outline must cover for the footprint to be listed
GRADES = ("I", "II*", "II")
ROW = 3                 # houses' addresses in one footprint that make it a row drawn as one outline
FORMS = {"mid-terrace": "terrace", "enclosed mid-terrace": "terrace", "end-terrace": "end-terrace",
         "enclosed end-terrace": "end-terrace", "semi-detached": "semi", "detached": "detached"}
TERRACED = (("building", "terrace"), ("house", "terraced"), ("house", "terrace"))


def years(text, styles=None):
    """(earliest, latest) from a date as mappers and certificates write it: "1820", "c.1820",
    "1820..1830", "C18", "18th century", "England and Wales: before 1900", "1930-1949",
    "2012 onwards", or a style's name; None if it says no year."""
    if not text: return None
    t = str(text).lower()
    if styles and t.strip() in styles: return tuple(styles[t.strip()])
    found = [int(y) for y in re.findall(r"(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)", t)]
    if found:
        if "before" in t: return (0, found[0] - 1)
        if "onwards" in t or "after" in t: return (found[0], 2100)
        return (min(found), max(found))
    c = re.search(r"\bc(\d{2})\b|(\d{2})(?:st|nd|rd|th) century", t)
    if c:
        n = int(c.group(1) or c.group(2))
        return ((n - 1) * 100, n * 100 - 1)
    return None


def _style_years(map_id):
    return {k: v for k, v in rules(map_id).get("styles", {}).items() if isinstance(v, list)}


class Survey:
    def __init__(self, map_id, bbox=None, raw=None, pad=60.0):
        """bbox: the map metres (x0, y0, x1, y1) to measure in, None for the whole map; pad: how
        far round it the neighbours sharing a wall are looked for."""
        self.A = area(map_id)
        # the certificates are cut to the whole map: the detailed box alone is only the middle squares
        self.box = area(map_id, wide=True).bbox if getattr(self.A, "squares", None) else self.A.bbox
        self.map_id = map_id
        self.raw = raw or os.path.join(ROOT, "data", "raw", map_id, "wide")
        lon0, lat0 = self.A.centre
        kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
        self.proj = lambda x, y, z=None: ((x - lon0) * kx, (y - lat0) * ky)
        self.styles = _style_years(map_id)
        self.evidence = rules(map_id).get("evidence", {})
        if bbox:
            x0, y0, x1, y1 = bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad
            self.window = (x0 / kx + lon0, y0 / ky + lat0, x1 / kx + lon0, y1 / ky + lat0)
        else:
            self.window = None
        self._read()
        self._records = {}

    # ---- reading ----------------------------------------------------------------------------

    def _layer(self, name):
        raw, packed = os.path.join(self.raw, f"{name}.geojson"), os.path.join(ROOT, "data", self.map_id, f"{name}.geojson.xz")
        if os.path.exists(raw): feats = json.load(open(raw))["features"]
        elif os.path.exists(packed): feats = json.load(lzma.open(packed))["features"]
        else: return []
        out = []
        win = box(*self.window) if self.window else None
        for f in feats:
            if not f.get("geometry"): continue
            g = shape(f["geometry"])
            if win is not None and not g.intersects(win): continue
            out.append((transform(self.proj, g), f.get("properties") or {}))
        return out

    def _csv(self, name):
        raw, packed = os.path.join(self.raw, "epc", f"{name}.csv"), os.path.join(ROOT, "data", self.map_id, "epc", f"{name}.csv.xz")
        if os.path.exists(raw): return open(raw, encoding="utf-8-sig", errors="replace")
        if os.path.exists(packed): return io.TextIOWrapper(lzma.open(packed), encoding="utf-8-sig", errors="replace")
        return None

    def _addresses(self):
        """(x, y, age band, built form, floor, property type) of each home with a certificate; the
        three in the middle are None where the download did not keep them."""
        certs, uprns = self._csv("certificates"), self._csv("uprn")
        if certs is None or uprns is None: return []
        rows = csv.DictReader(certs)
        W, S, E, N = self.window or self.box
        where = {}
        for r in csv.DictReader(uprns):
            lon, lat = float(r["LONGITUDE"]), float(r["LATITUDE"])
            if W <= lon <= E and S <= lat <= N: where[r["UPRN"]] = self.proj(lon, lat)
        latest = {}
        for r in rows:
            u = r.get("uprn")
            if u in where and (u not in latest or latest[u]["lodgement_date"] < r["lodgement_date"]): latest[u] = r
        return [(*where[u], r.get("construction_age_band"), r.get("built_form"), r.get("floor_level"), r.get("property_type"))
                for u, r in latest.items()]

    def _read(self):
        feet = [(g, p) for g, p in self._layer("building") + self._layer("footprints")
                if g.geom_type in ("Polygon", "MultiPolygon") and not p.get("is_underground")]
        self.polys = [g.buffer(0) for g, _ in feet]
        self.props = [p for _, p in feet]
        self.tree = STRtree(self.polys) if self.polys else None
        self.listed = [(g.buffer(0), p) for g, p in self._layer("heritage") if g.geom_type.endswith("Polygon")]
        self.listed_tree = STRtree([g for g, _ in self.listed]) if self.listed else None
        self.areas = [(g.buffer(0), p) for g, p in self._layer("conservation") if g.geom_type.endswith("Polygon")]
        self.areas_tree = STRtree([g for g, _ in self.areas]) if self.areas else None
        self.tagged = [(g.centroid if g.geom_type != "Point" else g, p) for g, p in self._layer("osm-character")]
        self.tagged_tree = STRtree([g for g, _ in self.tagged]) if self.tagged else None
        self.homes = self._addresses()
        self.homes_tree = STRtree(shapely.points([(a[0], a[1]) for a in self.homes])) if self.homes else None
        from buildings import groups
        big = [i for i, p in enumerate(self.polys) if p.area >= HOUSE_M2]
        adj, _ = groups([self.polys[i] for i in big]) if big else ({}, {})
        self.walls = {big[i]: [big[j] for j in adj.get(i, {})] for i in range(len(big))}

    # ---- measuring ----------------------------------------------------------------------------

    def _points_in(self, tree, items, poly, get=lambda it: it):
        if tree is None: return []
        out = []
        for k in tree.query(poly.buffer(NEAR)):
            it = items[int(k)]
            if poly.distance(get(it)) <= NEAR: out.append(it)
        # a point inside its own footprint beats one just outside a neighbour's
        inside = [it for it in out if poly.contains(get(it))]
        return inside or out

    def _form_from_walls(self, i):
        near = self.walls.get(i)
        if near is None: return None
        if not near: return "detached"
        if len(near) >= 2: return "terrace"
        return "end-terrace" if len(self.walls.get(near[0], [])) >= 2 else "semi"

    def record(self, i):
        """The character of footprint i (see the top)."""
        if i in self._records: return self._records[i]
        poly, p = self.polys[i], self.props[i]
        rec = dict(form=None, form_from=None, built=None, built_from=None, basement=None, basement_from=None,
                   listed=None, listed_entry=None, conservation=None,
                   material=None, architecture=None, heritage=None, start_date=None, zone=None)

        tags = {}
        for _g, q in self._points_in(self.tagged_tree, self.tagged, poly, lambda it: it[0]):
            for k, v in q.items(): tags.setdefault(k, v)
        rec["material"] = tags.get("building:material")
        rec["architecture"] = tags.get("building:architecture")
        rec["heritage"] = tags.get("heritage")
        rec["start_date"] = tags.get("start_date")

        homes = [a for a in self._points_in(self.homes_tree, self.homes, poly, lambda a: shapely.Point(a[0], a[1]))]
        houses = [a for a in homes if (a[5] or "").lower() in ("house", "bungalow")]
        forms = [FORMS.get((a[3] or "").strip().lower()) for a in houses]
        forms = [f for f in forms if f]
        walls = self._form_from_walls(i)
        if forms:
            rec["form"], rec["form_from"] = max(sorted(set(forms)), key=forms.count), "epc"
        elif any(tags.get(k) == v for k, v in TERRACED):
            rec["form"], rec["form_from"] = ("end-terrace" if walls in ("end-terrace", "semi") else "terrace"), "osm"
        elif walls == "detached" and len(houses) >= ROW:
            rec["form"], rec["form_from"] = "terrace", "addresses"
        elif walls:
            rec["form"], rec["form_from"] = walls, "walls"

        if self.listed_tree is not None:
            best = None
            for k in self.listed_tree.query(poly):
                g, q = self.listed[int(k)]
                a = poly.intersection(g).area
                if a >= LISTED_SHARE * poly.area or a >= 0.5 * g.area > 0:
                    if best is None or GRADES.index(q["grade"]) < GRADES.index(best["grade"]): best = q
            if best: rec["listed"], rec["listed_entry"] = best["grade"], best.get("entry")

        if self.areas_tree is not None:
            c = poly.representative_point()
            for k in self.areas_tree.query(c, predicate="within"):
                rec["conservation"] = self.areas[int(k)][1].get("name") or "yes"
                break

        from buildings import zone_at
        c = poly.representative_point()
        rec["zone"] = zone_at(self.A.zones, c.x, c.y, self.A.default_zone)

        bands = [years(a[2], self.styles) for a in homes if a[2]]
        bands = [b for b in bands if b]
        dated = {
            "osm": years(rec["start_date"]) or years(rec["architecture"], self.styles),
            # the band most of its homes give: one flat's certificate dated by its conversion is not the building's age
            "epc": min(set(bands), key=lambda b: (-bands.count(b), b)) if bands else None,
            "listed": (0, self.evidence.get("listed_before", 1914)) if rec["listed"] else None,
            "zone": tuple(self.styles[rec["zone"]]) if rec["zone"] in self.styles else None,
        }
        for src in self.evidence.get("built_from", ("osm", "epc", "listed", "zone")):
            if dated.get(src):
                rec["built"], rec["built_from"] = list(dated[src]), src
                break

        under = tags.get("building:levels:underground")
        if under is not None and re.fullmatch(r"\s*\d+(\.\d+)?\s*", under):
            rec["basement"], rec["basement_from"] = float(under) > 0, "osm"
        elif p.get("num_floors_underground") is not None:
            rec["basement"], rec["basement_from"] = p["num_floors_underground"] > 0, "overture"
        elif any((a[4] or "").strip().lower() in ("basement", "-1", "-2", "lower ground") for a in homes):
            rec["basement"], rec["basement_from"] = True, "epc"

        self._records[i] = rec
        return rec

    def near(self, geom, reach=12.0):
        """The character of the building nearest a geometry in map metres, within reach, and how
        far its wall is: (record, metres), or (None, None)."""
        if self.tree is None: return None, None
        best = None
        for k in self.tree.query(geom.buffer(reach)):
            k = int(k)
            if self.polys[k].area < HOUSE_M2: continue
            d = self.polys[k].distance(geom)
            if d <= reach and (best is None or d < best[1]): best = (k, d)
        if best is None: return None, None
        return self.record(best[0]), round(best[1], 2)

    def every(self):
        """The character of every footprint in the window, in the layers' order."""
        win = box(*[*self.proj(*self.window[:2]), *self.proj(*self.window[2:])]) if self.window else None
        return [(i, self.record(i)) for i in range(len(self.polys)) if win is None or self.polys[i].intersects(win)]
