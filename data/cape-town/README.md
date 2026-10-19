# Cape Town's map data

Everything the Cape Town map is built from, as the build reads it, so it rebuilds from a fresh
clone with no downloads. `python3 -I tools/mapdata.py unpack cape-town` puts it where the build
tools look (`data/raw/cape-town/wide/`), and the squares and the wide file read `measured/` straight
from here. "Rebuild a map" in the top README has the whole build; `tools/mapdata.py` says how each
part is kept, and `tools/fetch.py` how to fetch it all again (`--only overture,canopy,osm`: there's
no lidar, energy certificates or hygiene ratings outside the UK).

| File | What | From | Licence |
|---|---|---|---|
| `building`, `segment`, `water`, `land_use`, `land`, `land_cover`, `place`, `infrastructure` `.geojson.xz` | Overture Maps' layers for the wide circle, release 2026-09-23.1, without the properties no tool reads and the outlines no square reads (`prep_tiles.SKIP`) | `tools/download.py` | ODbL (© OpenStreetMap contributors, Overture Maps Foundation, Microsoft, Google) and CDLA Permissive 2.0: see overturemaps.org/attribution |
| `osm.geojson.xz` | OpenStreetMap's shops, pubs, offices and named buildings, downloaded 19 October 2026 | `tools/osm.py` | ODbL, © OpenStreetMap contributors |
| `osm-roads.geojson.xz` | OpenStreetMap's streets and paths with their widths, lanes and pavements (`sidewalk`), downloaded 19 October 2026 | `tools/osm.py ... wide roads` | ODbL, © OpenStreetMap contributors |
| `terrain15.zip`, `terrain14.zip` | The Mapzen terrarium tiles the builds read (zoom 15 for the squares, zoom 14 for the wide file), as their heights | Amazon / Mapzen Terrain Tiles | see github.com/tilezen/joerd/blob/master/docs/attribution.md |
| `measured/<ti>_<tj>.zip` | For each full-detail square, the tree canopy as its build reads it (no lidar here, so no roofs or walls) | Meta / WRI's canopy height map | CC BY 4.0, Meta and World Resources Institute, High Resolution Canopy Height Maps |
| `measured/wide.zip` | The canopy map's tree tops for the wide file, in 2 km windows | Meta / WRI's canopy height map | CC BY 4.0, Meta and World Resources Institute, High Resolution Canopy Height Maps |
