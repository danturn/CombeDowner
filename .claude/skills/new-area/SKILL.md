---
name: new-area
description: Add and build a map of your own area (anywhere in the world) for Combe Downer, from a fresh checkout to playing it with ?map=<id>. Use when someone wants to play their own town, street or village, add a new map, or asks how to generate an area.
---

# Make a map of your own area

The game is built from open data, so any place can be a map. This takes you from a fresh checkout
to `http://localhost:5173/?map=<id>`. The full reference is `docs/new-area.md`; the honest
account of what is easy and what is not is `docs/own-area.md`. Read the second one first if the
place is outside England.

Run everything from the repository root. Work in your own branch or worktree: the build writes
into `tools/area.py` and `web/src/maps.ts`, which other people edit too.

## 0. Ask the person

Settle these before touching anything:

1. **Place and centre.** A name is enough (it is looked up), but a pub, a green or a crossroads in
   the middle gives a better map than a town's official centre. Coordinates are `lon, lat`.
2. **Radius.** The play area is a circle (the force field). 1000 to 2000 m is sensible: 1500 m is
   about ten squares of a kilometre each and builds in a few minutes. The detailed middle (the 3 x 3
   squares round the centre) is always about 3.1 km across.
3. **Country.** England has everything (lidar roofs, energy certificates, hygiene ratings). The UK
   has hygiene ratings only. Elsewhere there is only Overture, OpenStreetMap, canopy and terrain:
   the map is flatter and guesses its roofs, but works (Cape Town is built that way).
4. **Map id**: lower-case with dashes, e.g. `my-town`. It names folders and files, so do not change it later.

## 1. Install

```sh
# Python 3 (the project's builds use 3.13), Node (CI uses 22), and Chrome for screenshots
pip3 install numpy shapely pillow overturemaps rasterio
cd web && npm install && cd ..
```

`overturemaps` is only for the downloads; `rasterio` is also what reads the lidar and canopy
GeoTIFFs. If `pip3 install rasterio` fails on your machine, it needs GDAL (`brew install gdal`).
Every tool is run as `python3 -I tools/<name>.py` (the `-I` stops a stray file in the current
directory shadowing a library).

## 2. Check the checkout can build your kind of area

```sh
grep -n 'needs the lidar' tools/prep_map.py
```

- A line like `raise SystemExit(f"--measure needs the lidar: ...")` means **this checkout cannot
  build outside England**: its first build insists on lidar. The Cape Town map (branch
  `claude/cape-town`, commit `46b1f28`) makes lidar optional (a few lines in `tools/prep_map.py`),
  along with its sea, paint and zone work. Merge that branch in before going on, or stay in England.
- No such line: lidar is optional and any country builds.

## 3. Register the area

```sh
python3 -I tools/new_area.py add "My Town" --id my-town --radius 1500
```

Options (all checked against the script): `--lat N --lon N` to skip the lookup and give the centre
yourself, `--zone suburb` for the default look of houses. It looks up the name on OpenStreetMap's
Nominatim: **read the "found:" line and check it is the right place**, and pass `--lat/--lon` if not.

It adds an entry to `MAPS` in `tools/area.py` and a line to `MAPS` in `web/src/maps.ts` (the menu).
Then open the new `tools/area.py` entry and:

- Set `z0` to about the ground height at the centre in metres (Bath is 15, Cape Town 0). It only
  has to be close. If you have no idea, look it up, or build once and read the terrain from the
  squares' `tiles.json`.
- Set `default_zone` and `zones` if you want local character. The zones are named at the top of
  `tools/buildings.py`: `suburb` (the default), `london` (stock-brick terraces and council flats),
  and Bath's `georgian`, `victorian`, `riverside`, `bath` (all Bath stone). An unknown name just
  gets the plain guesses. `zones=[("georgian", east, north, radius), ...]` is in metres from the
  centre, first match wins.
- Optionally `spawn="Name of a green"` (must match a park's name in the map data) so everyone starts
  there; leave it out and the game picks a place itself.
- **Never change `centre` once built**: landmarks and the mine's door are placed by coordinates.

If the entry is wrong, edit it by hand: `add` refuses to add the same id twice.

## 4. Download and build

One command runs the whole sequence (each step below is a real tool, listed so you can run them
singly when something breaks):

```sh
python3 -I tools/new_area.py build my-town --country england     # or uk, or other
python3 -I tools/new_area.py build my-town --country england --dry-run   # prints the commands only
```

What it runs, in order, from the repository root:

| Step | Command | Time | Notes |
|---|---|---|---|
| Downloads | `python3 -I tools/fetch.py my-town data/raw/my-town/wide --only overture,canopy,osm[,lidar][,fsa]` | 2 to 10 min | Overture layers (about 10 s each, S3), the Meta/WRI canopy tile (about 290 MB), OpenStreetMap shops and street widths, and for England the Environment Agency lidar (3 files, about 75 MB each, per 5 km square) and the hygiene ratings. Files already there are skipped, so it resumes. |
| Squares | `python3 -I tools/prep_tiles.py my-town data/raw/my-town/wide web/public/maps/my-town --measure` | about 25 s a square, one per core | `--measure` works out roofs and trees from the lidar and canopy and writes them to `data/my-town/measured/` (this is why a new area needs the raw data once). Mapzen terrain tiles download here. Writes `web/public/maps/my-town.json`, `my-town/<ti>_<tj>.json` and `tiles.json`. |
| Whole-area file | `python3 -I tools/prep_wide.py my-town data/raw/my-town/wide web/public/maps/my-town-wide.json --measure` | about a minute | The light file for the minimap and the distance. |
| Minimap ground | `python3 -I tools/ground_kinds.py my-town` | seconds | `my-town-ground.json`. |
| Pubs | `python3 -I tools/pubs.py my-town data/raw/my-town/wide web/public/maps/my-town-pubs.json` | seconds | The pause menu's "Go to a pub". |
| Check | `python3 -I tools/check_map.py my-town` | a minute | Rule counts and the worst places as data coordinates. |

Only `data/raw/` is ignored by git. `web/public/maps/my-town*` and `data/my-town/` are not, so do not commit them unless the owner of the repository wants the map published
(see "Keep it" below).

Things the script leaves out because they need hand work:

- **Energy certificates and OS Open UPRN** (England and Wales): need an account; they only give
  wall materials and bungalows. See `docs/new-area.md`, "Energy certificates", and put the files in
  `data/raw/my-town/wide/epc/`. Skip them to start with.
- **Lidar outside England**: Wales, Scotland and other countries publish their own surveys, with
  their own download sites. `tools/fetch.py` only knows England's, and `tools/lidar.py` assumes
  British National Grid (EPSG:27700), so another country's lidar needs code, not just files.
  Without lidar, buildings use Overture's heights and the zone guesses.
- **Canal and railway** (`tools/canal.py`, `tools/railway.py`): the railway needs no pack and is run
  as `python3 -I tools/railway.py my-town data/raw/my-town/wide web/public/maps/my-town-rail.json`.
  Run it before `prep_tiles.py` if the area has lines. The canal needs a hand-written pack of locks
  and levels in `tools/canal.py`.
- **Landmarks** (spires, bridges, set pieces): hand-made, see `docs/new-area.md` section 4. Optional.
- A seaside area wants `sea=0.0` in the area's entry (the Cape Town change), so the sea sits at sea level.

If a download dies half way (the network drops), `fetch.py` leaves the partial file and skips it
next time because it exists: delete that file in `data/raw/my-town/wide/` and run `build` again.
(I saw the Overture `building` layer fail once this way on a test run of a 2.7 km circle.)

A second run of `prep_tiles.py` only rebuilds squares whose data or tools changed. Add `--force`
to rebuild everything and `--only 1,1 0,2` to rebuild named squares.

## 5. Play it

```sh
cd web && npm run dev
```

Open `http://localhost:5173/?map=my-town`. The menu also lists the map, as `maps.ts` was updated.
Useful extras on the address: `?at=east,north,bearing,tilt` to start at a spot, `?view=1200` for
the draw distance, `?fx=0` for no colour grade. Shift+F3 in the game copies a link to where you stand.

If the page loads but is empty: open the browser console, and check `web/public/maps/my-town.json`
and `web/public/maps/my-town/tiles.json` exist (the build writes them last).

## 6. Look at it and check it

```sh
python3 -I tools/square_at.py "10,20,90,0" --map my-town        # which square a spot is in
cd web && npm run shoot -- "0,0,90,-5" "300,200,200,-10" --map my-town --out ../shots --tag first
# (square_at.py prints a shoot command without --map: add it)
```

`npm run shoot` builds the game, then shoots each `?at=` view from the menu's backdrop in a muted
headless Chrome (options at the top of `tools/shoot.mjs`: `--map`, `--out`, `--tag`, `--time`,
`--size`, `--play`). Needs Chrome installed; it is the only browser it uses. A view is
`east,north,bearing,tilt[,height]` in metres from `centre`. Read the image to look for floating
buildings, roads through houses, a flooded valley (wrong `z0`), a blank ground (a layer failed to download).

`python3 -I tools/check_map.py my-town` prints counts for each rule (roads steeper than 1 in 4,
things on walls, buildings in roads and so on) and lists the worst places. Some are real data
faults in your area, so judge, do not chase zero. Re-run after any change and don't let counts rise.

## 7. Keep it (optional)

- **Just for you**: leave everything uncommitted. A second `build` reuses the downloads.
- **To share the map with the repository**: first pack the inputs so anyone can rebuild with no
  downloads, then commit `data/my-town/` and `web/public/maps/my-town*`:

  ```sh
  python3 -I tools/mapdata.py pack my-town data/raw/my-town/wide
  ```

  Packing is how `data/combe-down/`, `data/bradford-on-avon/` and (on its branch) `data/cape-town/`
  were made; each has a `README.md` giving where each file came from and its licence. Write one
  for yours. Then follow `CLAUDE.md`'s workflow: build with `cd web && npm run build`, fetch
  `origin/main`, merge, push. Do not do this without the owner's say-so.

## Worked example: Cape Town (a non-English area)

Commit `46b1f28` on branch `claude/cape-town` is the whole of it, and shows what a real area adds
to the generic steps:

- `tools/area.py`: centre `(18.4175, -33.9265)`, `field=1000`, `half=1565`, `z0=0`, `sea=0.0`, a
  `wide` circle of 3300 m centred `(-500, -450)`, and four `zones` (`bokaap`, `cbd`) found by
  looking at named places.
- Built from worldwide data only: `tools/fetch.py cape-town --only overture,canopy,osm` (no lidar,
  certificates or hygiene ratings), then the usual `prep_tiles.py ... --measure`, `prep_wide.py`.
- Code it needed beyond the area entry: lidar optional in `prep_map.py`, the sea held at sea level
  with quays, new zones in `tools/buildings.py`, painted walls, `tools/cableway.py` for the
  Table Mountain cableway, set pieces in `web/src/landmarks/`. None of that is needed for an
  ordinary area: the entry plus the commands above gave the first working map.
- Packed to `data/cape-town/` (about 4 MB of `.xz` and `measured/*.zip`, with a README on sources
  and licences).
