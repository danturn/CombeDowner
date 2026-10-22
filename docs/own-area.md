# Making your own area, without Claude

The recipe is in `docs/new-area.md` and, for Claude Code users, the `new-area` skill
(`.claude/skills/new-area/SKILL.md`). This note is about how far a plain script or a small web page
could take someone who has neither, what stays hard, and what to build.

## What is already automatic

Every step after "decide where" is a command that takes the map id and nothing else, because
`tools/area.py` holds the area's settings and every tool reads them from there:

- downloads: `tools/fetch.py` (Overture layers, canopy, OpenStreetMap, England's lidar and hygiene ratings);
- builds: `tools/prep_tiles.py`, `tools/prep_wide.py`, `tools/ground_kinds.py`, `tools/pubs.py`;
- check: `tools/check_map.py`.

`tools/new_area.py` (added with this note) is the thin wrapper over that: `add "Place" --radius 1500`
geocodes the name with Nominatim and writes the `MAPS` entry in `tools/area.py` and the menu line in
`web/src/maps.ts`, and `build <id> --country england|uk|other` runs the steps in order. It adds no
new logic, so it is cheap to keep true. I have run `add`, `build --dry-run` and the Overture
download for a 2.7 km circle; I have not run a whole build, which needs a 290 MB canopy tile and, in
England, gigabytes of lidar.

## What a single script still cannot do for you

| Step | Why it is hard to automate |
|---|---|
| **Choosing the centre** | A geocoded name gives a town's official middle, often a road junction or a council office. A good map centres on something you would walk to, and `centre` can never change afterwards (landmarks and the mines' door are placed by coordinates). Needs a human eye on a map. |
| **Lidar outside England** | The Environment Agency's open 1 m survey is the single biggest quality gain (real roof heights and shapes, tree heights, lidar-found walls). Other countries have their own portals, formats, licences and sometimes a login. `tools/lidar.py` also assumes British National Grid (EPSG:27700), and `tools/fetch.py` computes OS 5 km square names. Another country is a code change and a source-by-source hunt, not a flag. Without it the map still builds, but roofs are guessed and flatter. |
| **Energy certificates and OS Open UPRN** | Wall materials and bungalows, England and Wales only. Needs an account and a manual CSV download, and the licence forbids redistributing addresses (`tools/mapdata.py` strips them). Optional: leave it out. |
| **Hygiene ratings** | UK only (Food Standards Agency). Cheap, no key. |
| **Licences when sharing** | Overture is ODbL/CDLA, OpenStreetMap ODbL, canopy CC BY 4.0, lidar OGL. Fine to build and play locally. Committing a map to the repository means writing the sources and licences into `data/<id>/README.md`, as the other maps do. |
| **Zones (what the houses look like)** | `default_zone` and `zones` set wall material, roof style and storeys where the data is silent. Only Bath's four zones, `london` and `suburb` exist. A convincing Cape Town needed new zones and code; a plain `suburb` default looks generic but acceptable. |
| **Ground height (`z0`)** | Needs to be near the area's ground level. Easy to get from the terrain tiles, not yet done by `add`. A small improvement. |
| **Sea, canals, railways, cable cars** | Each has area-specific code or a hand-written pack (`tools/canal.py` locks and levels, `tools/cableway.py`). Cape Town's sea handling lives on its own branch. A flat inland town needs none. |
| **Landmarks** | A church spire, a bridge or a stadium is drawn by hand (`tools/landmarks/`, `web/src/landmarks/`). Not automatable, and the point of a personal map. |
| **Running on a stranger's machine** | Python with numpy, shapely, pillow, rasterio (needs GDAL on some machines), overturemaps, plus Node and a Chrome for screenshots. Most failures people would hit are here, not in the map code. |
| **Network failures** | Overture's S3 reads and the OpenStreetMap APIs fail now and then. `fetch.py` skips a file that exists, so a half-written layer after a dropped connection is kept and silently breaks the build (one `building` download failed this way on my test run). It should write to a temporary name and rename. |
| **Non-England builds on `main`** | `tools/prep_map.py` still refuses to measure without lidar. The no-lidar change is in the Cape Town commit (`46b1f28`, branch `claude/cape-town`). Until that is merged, only England builds from a clean checkout; `new_area.py build` says so rather than failing late. |

## How long it takes

Measured here: one Overture layer for a 2.7 km circle took 10 to 40 seconds (eight layers, so
two to five minutes), and the building layer alone was 9 MB. From the repository's own notes:
a square takes about 25 seconds, one per core at a time; Bath's 131 squares take about 5 minutes on
four cores with measurements already packed.

For a radius of 1500 m the circle touches about 20 squares (the 9 in the middle plus a ring), so:

- downloads: 5 to 15 minutes, dominated by the canopy tile (290 MB) and, in England, the lidar
  (three files of about 75 MB per 5 km square, two to four squares);
- squares: 1 to 3 minutes on four cores;
- the rest (wide file, ground, pubs, check): a few minutes;
- first start in the browser: seconds.

So 15 to 30 minutes end to end on a decent laptop, mostly waiting for downloads. A rebuild after a
tool change is minutes, because `prep_tiles.py` rebuilds only what changed.

## Is a small local web page realistic?

Yes, as a local tool. Not as a hosted service.

A local version is a Python `http.server` (no new dependency) with one page: a Leaflet or
MapLibre map, click to place the centre, a slider for the radius that draws the circle, a country
choice, a Build button. The server runs `new_area.py add` and then `build` as subprocesses and
streams their output to the page (server-sent events or polling a log), and when the build exits it
links to `http://localhost:5173/?map=<id>` (or starts `npm run dev`). Most of that is glue: the
tools already print progress, and `prep_tiles.py` prints `[n/N]` per square.

Rough size: a day for something that works for a developer, two or three days to make it survive
a stranger's machine (dependency check with install hints, resumable downloads, cancel, readable
errors, showing the check report and a screenshot of the middle, a `z0` filled in from the terrain).
The map picker is the easy part. The cost is everything in the "hard" table above, which a page
cannot hide, only report.

Hosting it is a different thing: each build is a dozen CPU-minutes, up to a few hundred megabytes of
transient downloads and tens of megabytes of output per person, and the licence and abuse questions
of generating maps for the public. Not worth it. The alternative that does scale is what already
exists: the repository's "Rebuild the map" workflow builds on GitHub's machines for whoever has
their own fork.

## Recommendation

1. Keep the script, finish it, and do not build a web page yet. `tools/new_area.py` plus the skill
   covers people with Claude Code (the skill walks them through the choices a script cannot make) and
   people without (a README paragraph: `pip install ...`, `add`, `build`, `npm run dev`).
2. Before pointing others at it, merge the no-lidar change from the Cape Town branch, so any country
   builds, and make `fetch.py` write downloads to a temporary name. Those two are what stop a
   stranger on their first try.
3. Small wins on the script: look up `z0` from the terrain tile, print the Nominatim place's
   type and bounding box so a wrong match is obvious, and offer `--country` automatically from the
   geocoder's country code.
4. If people want a picker after that, build the local page above on top of `new_area.py` unchanged.
   Do not put work into hosting it.
