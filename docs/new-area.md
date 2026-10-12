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
| Energy certificates (EPC) and OS Open UPRN | wall materials, bungalows | optional | England and Wales |
| A landmark pack | hand-made landmarks (spires, porticos, bridges) | optional | per map |

All raw data goes in `data/raw/<map id>/`, which git ignores.

## 1. Add the area

In `tools/area.py`, add an entry to `MAPS`:

```python
"my-place": dict(
    name="My Place",
    centre=(-2.3452, 51.3624),   # lon, lat of the middle of the map
    field=1000,                  # force field radius in metres (the play area)
    half=1100,                   # metres of data from the centre to each edge (a bit more than field)
    zones=[("village", 0, 0, 300)],   # local character areas: (zone, x east, y north, radius), metres from the centre
    default_zone="suburb",
),
```

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
```

A "no lidar data", "no canopy data" or "no EPC data" line means that data wasn't found where
expected. Check the folder names above.

Try it with `cd web && npm run dev`, then pick the map in the menu.

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

## 5. Publish

Commit the new `web/public/maps/<map id>.json` and push `main`. GitHub Pages rebuilds the game.
