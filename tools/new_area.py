"""Add a map of your own area, and build it.

Usage:
  python3 -I tools/new_area.py add "<place name>" [--id slug] [--radius 1500] [--lat N --lon N] [--zone suburb]
  python3 -I tools/new_area.py build <id> [--country england|uk|other] [--dry-run]

add: finds the place's centre (OpenStreetMap's Nominatim, unless --lat and --lon are given), then writes
the map into MAPS in tools/area.py and into web/src/maps.ts. --radius is the force field's radius in
metres (the play area is twice that across). The detailed middle is always the 3 x 3 squares of the
standard grid (half = 1565, as Bath's and Bradford-on-Avon's), with the field and the wide circle
round it. Without --lat and --lon the centre is the first match for the name, so check it is the right
place before building.

build: runs the downloads and builds in order (see docs/new-area.md, and .claude/skills/new-area).
--country says which optional data exists: england has the Environment Agency's lidar and the food
hygiene ratings, uk only the hygiene ratings, other neither. The energy certificates are never
fetched: they need an account (docs/new-area.md). --dry-run prints the commands and runs none.

It needs Python 3 with numpy, shapely and pillow, and overturemaps and rasterio for the downloads.
"""
import json, math, os, re, subprocess, sys, urllib.parse, urllib.request

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)
AREA_PY = os.path.join(TOOLS, "area.py")
MAPS_TS = os.path.join(ROOT, "web", "src", "maps.ts")
HALF = 1565          # metres from the middle to the edge of the detailed box: the standard square grid
UA = {"User-Agent": "CombeDowner map builder (github.com/danturn/CombeDowner)"}


def option(args, name, default=None):
    if name not in args: return default
    k = args.index(name)
    value = args[k + 1]
    del args[k:k + 2]
    return value


def flag(args, name):
    if name in args: args.remove(name); return True
    return False


def geocode(name):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": name, "format": "json", "limit": 1})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        found = json.load(r)
    if not found: raise SystemExit(f"no place found for {name!r}: give --lat and --lon")
    print(f"found: {found[0]['display_name']}")
    return float(found[0]["lon"]), float(found[0]["lat"])


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def add(args):
    radius = int(option(args, "--radius", 1500))
    lat, lon, zone, map_id = option(args, "--lat"), option(args, "--lon"), option(args, "--zone", "suburb"), option(args, "--id")
    name = args[0]
    map_id = map_id or slug(name)
    if radius < 400 or radius > 4000: raise SystemExit("--radius is metres, between 400 and 4000")
    src = open(AREA_PY).read()
    if f'"{map_id}": dict(' in src: raise SystemExit(f"{map_id!r} is already in tools/area.py")
    centre = (float(lon), float(lat)) if lat and lon else geocode(name)
    # the detailed box is the 3 x 3 squares at the middle; the force field is the whole circle, and
    # data runs a little past it so the scenery shows beyond the edge
    entry = f'''    "{map_id}": dict(
        name="{name}",
        centre=({centre[0]:.5f}, {centre[1]:.5f}),   # lon, lat: fixed once anything is placed by coordinates
        field=600,                     # the detailed box's own force field: the wide circle below is the play area
        half={HALF},
        zones=[],                      # local character areas, see "Zones" in docs/new-area.md
        default_zone="{zone}",
        z0=0,                          # metres: what every square's ground heights are measured from; set it near the middle's height
        wide=dict(
            field={radius},
            field_centre=(0, 0),
            half={max(radius + 150, 1600)},
        ),
    ),
'''
    marker = "\n}\n\n\ndef area("
    if marker not in src: raise SystemExit("tools/area.py has changed shape: add the entry by hand (docs/new-area.md)")
    open(AREA_PY, "w").write(src.replace(marker, "\n" + entry.rstrip("\n") + marker, 1))
    ts = open(MAPS_TS).read()
    line = (f'  {{ id: "{map_id}", name: "{name}", blurb: "Your own area, built from open map data", wide: true'
            + " },\n")
    if f'id: "{map_id}"' not in ts:
        if "];\n\n/**" not in ts: raise SystemExit("web/src/maps.ts has changed shape: add the entry by hand")
        open(MAPS_TS, "w").write(ts.replace("];\n\n/**", line + "];\n\n/**", 1))
    print(f"added {map_id}: tools/area.py and web/src/maps.ts. Set z0 in tools/area.py to about the ground height at the middle.")
    print(f"next: python3 -I tools/new_area.py build {map_id} --country other")


def build(args):
    dry = flag(args, "--dry-run")
    country = option(args, "--country", "other")
    if country not in ("england", "uk", "other"): raise SystemExit("--country is england, uk or other")
    map_id = args[0]
    py = ["python3", "-I"]
    raw = f"data/raw/{map_id}/wide"
    maps = f"web/public/maps/{map_id}"
    only = ["overture", "canopy", "osm"] + (["lidar"] if country == "england" else []) + (["fsa"] if country != "other" else [])
    steps = [
        [*py, "tools/fetch.py", map_id, raw, "--only", ",".join(only)],
        [*py, "tools/prep_tiles.py", map_id, raw, maps, "--measure"],
        [*py, "tools/prep_wide.py", map_id, raw, f"{maps}-wide.json", "--measure"],
        [*py, "tools/ground_kinds.py", map_id],
        [*py, "tools/pubs.py", map_id, raw, f"{maps}-pubs.json"],
        [*py, "tools/check_map.py", map_id],
    ]
    prep = open(os.path.join(TOOLS, "prep_map.py")).read()
    if country != "england" and 'raise SystemExit(f"--measure needs the lidar' in prep:
        raise SystemExit("this checkout's tools/prep_map.py insists on lidar, which only England has: bring in the "
                         "no-lidar change (the Cape Town map's, branch claude/cape-town) first")
    for s in steps:
        print("$", " ".join(s))
        if not dry: subprocess.run(s, cwd=ROOT, check=True)
    print(f"built. Play it: cd web && npm run dev, then http://localhost:5173/?map={map_id}")


def main():
    args = sys.argv[1:]
    if len(args) < 2 or args[0] not in ("add", "build"): raise SystemExit(__doc__)
    {"add": add, "build": build}[args[0]](args[1:])


if __name__ == "__main__":
    main()
