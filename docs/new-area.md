# Making a map of a new area

Every map is built from open data by `tools/prep_map.py`. The build is generic: point it at a new
place, download the data for it, and it works out the buildings, roofs, walls, trees, roads and
terrain. Some data is optional. The map still builds without it, just with more guessing.

| Data | What it gives | Needed? | Coverage |
|---|---|---|---|
| Overture Maps | footprints, roads, paths, walls, water, woods, place names | yes | worldwide |
| Mapzen terrain tiles | ground height | yes (downloaded by the build) | worldwide |
| Environment Agency lidar | real building heights, roof shapes, parts at different levels, tree heights | strongly recommended | England |
| Meta / WRI canopy height | tree positions, hedges, shrubs | recommended | worldwide |
| Energy certificates (EPC) and OS Open UPRN | wall materials, bungalows, business premises | optional | England and Wales |
| OpenStreetMap | shops, pubs, cafés and offices, on the right building | recommended | worldwide |
| Food Standards Agency ratings | pubs, cafés and takeaways OpenStreetMap is missing | optional | England, Wales, NI |
| A landmark pack | hand-made landmarks (spires, porticos, bridges) | optional | per map |

All raw data goes in `data/raw/<map id>/`, which git ignores.

## 1. Add the area

In `tools/area.py`, add an entry to `MAPS`:

```python
"my-place": dict(
    name="My Place",
    centre=(-2.3452, 51.3624),   # lon, lat of the middle of the map
    field=1000,                  # force field radius in metres (the play area)
    field_centre=(0, 0),         # optional: the force field's centre, metres east and north of centre
    half=1100,                   # metres of data from the field's centre to each edge (a bit more than field)
    zones=[("village", 0, 0, 300)],   # local character areas: (zone, x east, y north, radius), metres from the centre
    default_zone="suburb",
),
```

`centre` is the origin of every coordinate in the map, so keep it fixed once anything (a landmark,
the mines' front door) is placed by coordinates. To grow the play area, make `field` bigger and
move `field_centre` instead: the data box follows the field.

Zones set the guesses used where the data is silent (what walls are made of, roof styles, storey
heights). The zone names and what each means are listed at the top of `tools/buildings.py`.
Where lidar and EPC data are present, they override the guesses.

Then add the map to `MAPS` in `web/src/maps.ts` so it appears in the menu.

## 2. Download the data

Set the map id once:

```sh
MAP=my-place
mkdir -p data/raw/$MAP
pip3 install overturemaps rasterio
```

### Overture Maps (required)

```sh
cd data/raw/$MAP
for t in building segment water land_use land land_cover infrastructure place; do
  python3 -I ../../../tools/download.py $MAP $t $t.geojson
done
cd ../../..
```

### Environment Agency lidar (England)

From https://environment.data.gov.uk/survey, download for every OS 5 km square the map
touches (the map is `2 × half` metres across, so usually two to four squares):

- **LIDAR Composite DTM, 1 m** (bare ground)
- **LIDAR Composite First Return DSM, 1 m** (ground plus buildings and trees)

Unzip the GeoTIFFs into:

```
data/raw/my-place/lidar/dtm/*.tif
data/raw/my-place/lidar/dsm/*.tif
```

To find the squares, open the map's centre on the survey site, or convert it to British National
Grid: Combe Down is in ST76SE and ST76SW.

### Meta / WRI tree canopy

One zoom-9 tile covers the map. Work out its quadkey and download it:

```sh
python3 -c "
import math; lon, lat = -2.3452, 51.3624     # the map's centre
z = 9; n = 2 ** z
x = int((lon + 180) / 360 * n); y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
print(''.join(str(((x >> i) & 1) + 2 * ((y >> i) & 1)) for i in range(z - 1, -1, -1)))"
mkdir -p data/raw/$MAP/canopy
curl -o data/raw/$MAP/canopy/<quadkey>.tif \
  https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/<quadkey>.tif
```

With lidar present, tree heights come from the lidar and this tile only fills in low growth such
as hedges and shrubs.

### Energy certificates (England and Wales)

1. Sign up at https://get-energy-performance-data.communities.gov.uk and download the
   **Domestic** certificates for the local authority as CSV. Save it as
   `data/raw/my-place/epc/certificates.csv`.
2. Download **OS Open UPRN** (CSV) from https://osdatahub.os.uk/downloads/open/OpenUPRN. It
   covers all of Great Britain and is too big to keep, so cut it to a box around the area
   (south, north, west and east edges in degrees):

   ```sh
   unzip -p osopenuprn_*.zip '*.csv' \
     | awk -F, 'NR==1 || ($4>51.27 && $4<51.45 && $5>-2.70 && $5<-2.25)' \
     > data/raw/$MAP/epc/uprn.csv
   ```

   For shop signs, also download the **Non-domestic** certificates for the same authority and
   save them as `data/raw/my-place/epc/non-domestic.csv`.

### OpenStreetMap businesses (recommended)

```sh
python3 -I tools/osm.py $MAP data/raw/$MAP/osm.geojson
```

This fetches every shop, amenity, office, craft and named building in the map's box. It tries
the Overpass API first and falls back on the main OpenStreetMap API in tiles, so it works on
networks that block Overpass. Without it, shop signs come from Overture's places, which are often
a few doors off.

### Food hygiene ratings (optional)

```sh
python3 -I tools/fsa.py $MAP data/raw/$MAP/fsa.geojson
```

## 3. Build the map

```sh
python3 -I tools/prep_map.py $MAP data/raw/$MAP web/public/maps/$MAP.json
```

The build prints what it found, for example:

```
split buildings: 49 more parts where roof levels change
lidar: measured 2207 of 2682 buildings (247 flat, 284 hipped)
epc: 2263 addresses, 1324 buildings, 398 with a known wall, 100 bungalows
canopy: tree heights from lidar
shops: 32 businesses (29 osm, 2 fsa, 1 overture)
```

A "no lidar data", "no canopy data" or "no EPC data" line means that data wasn't found where
expected. Check the folder names above.

Try it with `cd web && npm run dev`, then pick the map in the menu.

### A wider circle round it (optional)

A map can have a much bigger, simpler circle round it: Combe Down sits inside the whole of Bath.
Give its entry in `tools/area.py` a `wide` setting (the bigger force field, its centre and data
radius, and zones for the wider area), download the Overture layers into `data/raw/<map>/wide/`
with `wide` on the end of each `download.py` command, put the canopy tile in
`data/raw/<map>/wide/canopy/`, and build it after the detailed map:

```sh
python3 -I tools/prep_wide.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-wide.json
```

It keeps the terrain on a 12 m grid lined up with the detailed map's, every building (guessed at
by the same rules, without lidar or energy certificates), roads with their bridges, water, named
places and every tree in the canopy map, cut into squares the game streams in round the player
(`web/src/wide.ts`, `web/src/outskirts.ts`). Then set `wide: true` on the map in `web/src/maps.ts`.

### The wider circle in full detail, as tiles (optional)

The same wide data can also be built at the detailed map's own level of detail (gardens, walls,
doors, street furniture, parked cars, shop signs, shrubs), cut into squares a little over a
kilometre across that the game streams in. Build the detailed map first, then:

```sh
python3 -I tools/prep_tiles.py $MAP data/raw/$MAP/wide web/public/maps/$MAP
```

Each tile is an ordinary map file, `web/public/maps/<map>/<ti>_<tj>.json`, built by
`prep_map.py --tile ti tj` (one tile on its own:
`python3 -I tools/prep_map.py $MAP data/raw/$MAP/wide out.json --tile 0 3`). The tiles carry on
the detailed map's terrain grid, 261 of its cells to a side, with tile (0, 0) at the detailed
map's south-west corner, so the detailed map itself is tiles 0 to 2 each way and isn't built
again. `tiles.json` beside them gives the grid's corner, spacing, cells per tile, the height the
terrain is measured from and the list of tiles. Every tile reaching into the wide data circle is
built; about 120 of them for Bath, around 25 seconds each, four at a time.

So that the squares meet cleanly, each tile is worked out over a 60 m margin (roads half a
kilometre further) and keeps only its own share: buildings whole, in the tile holding the middle
of the footprint; anything standing at a point, in the tile it stands in; roads, walls and streams
cut at the edge; terrain edges shared exactly, and the detailed map's own heights where they meet.
The random choices (a house's roof, where its door goes, which side the telegraph poles run) come
from where each thing stands, so two tiles building the same street near their shared edge agree.

The first run cuts the wide layers into what each tile needs (`data/raw/<map>/wide/split/`) and
keeps the terrain downloads in `data/raw/<map>/wide/terrain15/`; tiles already built are skipped,
so add `--force` to rebuild them, or `--only 0,3 -1,3` to build just those. With no lidar,
energy certificates or OpenStreetMap download for the wide area, buildings are guessed at from
the wide zones in `tools/area.py`, and shop names come from Overture's places. Hand-made
landmarks for the tiles go in their own pack, `tools/landmarks/<map>_bath.py` (the detailed map's
pack is never used for them, as its name lookups would find the wrong buildings).

### Pubs for the pause menu (optional)

The pause menu's "Go to a pub" lists every pub in the force field. It comes from Overture's places
and, for the ratings, the FSA (with `wide` on the end for a map with a wider circle, and the
detailed map built first):

```sh
python3 -I tools/download.py $MAP place data/raw/$MAP/wide/place.geojson wide
python3 -I tools/fsa.py $MAP data/raw/$MAP/wide/fsa.geojson wide
python3 -I tools/pubs.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-pubs.json
```

Without the FSA download the pubs are listed without ratings. Without the file at all, the menu
lists just the pubs signed in the detailed map. Names Overture has wrong, or places it calls pubs
that aren't, are fixed in `tools/pubs.py`.

## 4. Landmarks (optional)

The build can't draw what the data doesn't show, such as a church spire, a portico or an
ornamental bridge. Those go in a landmark pack for the map, `tools/landmarks/<map id>.py` (write
`-` in the id as `_`). See `tools/landmarks/combe_down.py` for a working example. A pack has:

```python
def place(ctx):
    # return a list of [kind, x, y, ground, angle, ...] landmarks
    ...

def replaces(ctx):          # optional
    # return the indexes of building parts a landmark stands in place of
    ...
```

`ctx` carries the buildings (with their lidar heights), the named places from Overture, the water
and the ground height. The docstring in `tools/landmarks/__init__.py` lists everything in it.
Find landmarks by name from the map data (`landmarks.named(ctx, "Holy Trinity")`) rather than by
hard-coded coordinates, so the pack keeps working when the data moves a little.

Each kind is drawn by a builder in `web/src/landmarks/`: `spire.ts`, `portico.ts` and
`bridge.ts` exist already. A new kind is a new file there that returns a `THREE.Object3D` built
around its own origin, with its front facing +z, plus one line in `KINDS` in
`web/src/landmarks/index.ts`.

## How the build turns the data into a map

`tools/prep_map.py` runs these steps in order. Each step lives in its own module, so it can be
changed for every area at once.

1. **Terrain** (`prep_map.py`): Mapzen terrain tiles become a 4 m height grid. Roads are
   flattened into it. Any road or path Overture flags as a tunnel is carried level between the
   ground at its ends, and where the hill over it is deeper than the arch it becomes a bored
   tunnel (`tunnels.py`), which the game builds as a lit brick tube with a stone face at each
   portal (`web/src/tunnels.ts`). You can walk, or drive, through it. The terrain is cut down to
   the floor in its approaches; shallow underpasses stay ordinary roads.
2. **Footprints** (`prep_map.py`): Overture buildings, simplified to 0.25 m.
3. **Splitting by roof level** (`buildings.roof_parts`): the lidar roof is sampled every metre,
   and a footprint is cut wherever the roof jumps by more than 1.5 m, giving a mansion and its
   wings, or a nave and its aisles, as separate parts. Big irregular parts are then cut into
   rectangles (`buildings.wings`).
4. **Measuring** (`lidar.Lidar.measure`): each part gets its eaves and ridge height from the
   lidar (surface minus ground). `lidar.fit_roof` fits every roof the game can draw (flat, or a
   ridge either way with gabled or hipped ends) and keeps the best fit.
5. **Wall materials** (`epc.py`): each home's energy certificate, placed by its UPRN, says stone,
   brick or render. A building takes the majority, and bungalows get one storey.
6. **Everything else** (`buildings.classify`): where the data is silent, the area's zones in
   `tools/area.py` decide the materials, roof style and storeys, with Overture's building class
   and attachment (detached, semi or terrace) worked out from shared walls.
7. **Trees** (`canopy.py`): Meta's canopy map gives tree positions and low growth. Where lidar is
   present, tree heights and crowns come from it, with roofs and thin things removed. Trunks are
   kept off roads and pavements.
8. **Streets and gardens** (`streets.py`, `gardens.py`, `landscape.py`): pavements, walls, fences
   and hedges, gates, doors, driveways and parked cars. A car that would clash with a wall or a
   building is left out. Each house wall is divided into equal window bays, centred on the wall
   (one window if there's only room for one, none if there isn't); the front door takes the
   middle of a bay, and the game leaves out the ground-floor window behind a door or shopfront.
9. **Shop signs** (`shops.py`): businesses come from OpenStreetMap, which usually maps them on
   the building itself, so its outline picks the building. A non-domestic energy certificate
   placed by its UPRN marks the exact premises, and moves a business mapped only as a point
   nearby. Food hygiene ratings add pubs, cafés and takeaways OpenStreetMap is missing, and an
   Overture place joins only when a certificate confirms it. With no OpenStreetMap download at
   all (the tiles of the wider circle), Overture's places are used instead: only shopfront trades
   it is fairly sure of, each on the nearest building within 15 m that could have a shopfront.
   The fascia goes on the wall facing
   the business's own street, skipping party walls; several businesses in one building share the
   wall. A landmark pack can rename a business to what is over the door (`SIGN_NAMES`) or drop
   one (`SIGN_SKIP`).
10. **Landmarks** (`tools/landmarks/<map>.py`): the map's own pack, if it has one.

The output is one JSON file per map, which the game loads (`web/src/map.ts` describes every field).

## 5. Publish

Commit the new `web/public/maps/<map id>.json` and push `main`. GitHub Pages rebuilds the game.
