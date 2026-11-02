# Cape Town's map data

Everything the Cape Town map is built from, as the build reads it, so it rebuilds from a fresh
clone with no downloads. `python3 -I tools/mapdata.py unpack cape-town` puts it where the build
tools look (`data/raw/cape-town/wide/`), and the squares and the wide file read `measured/` straight
from here. "Rebuild a map" in the top README has the whole build; `tools/mapdata.py` says how each
part is kept, and `tools/fetch.py` how to fetch it all again (`--only overture,canopy,osm,city`: there's
no lidar, energy certificates or hygiene ratings outside the UK, and the City of Cape Town's own
data takes their place where it can: `tools/cct.py`).

| File | What | From | Licence |
|---|---|---|---|
| `building`, `segment`, `water`, `land_use`, `land`, `land_cover`, `place`, `infrastructure` `.geojson.xz` | Overture Maps' layers for the wide circle, release 2026-09-23.1, without the properties no tool reads and the outlines no square reads (`prep_tiles.SKIP`) | `tools/download.py` | ODbL (© OpenStreetMap contributors, Overture Maps Foundation, Microsoft, Google) and CDLA Permissive 2.0: see overturemaps.org/attribution |
| `osm.geojson.xz` | OpenStreetMap's shops, pubs, offices and named buildings, downloaded 19 October 2026 | `tools/osm.py` | ODbL, © OpenStreetMap contributors |
| `osm-roads.geojson.xz` | OpenStreetMap's streets and paths with their widths, lanes and pavements (`sidewalk`), downloaded 19 October 2026 | `tools/osm.py ... wide roads` | ODbL, © OpenStreetMap contributors |
| `terrain15.zip`, `terrain14.zip` | The Mapzen terrarium tiles the builds read (zoom 15 for the squares, zoom 14 for the wide file), as their heights, with the ground of the City's 2 m contours laid over them wherever the contours reach (`tools/cct.py ground`) | Amazon / Mapzen Terrain Tiles; City of Cape Town, Ground Level Map 2 m Contours (GLM 2019, from the 2018-19 lidar) | see github.com/tilezen/joerd/blob/master/docs/attribution.md; City of Cape Town Open Data Policy (free for any use; credit "City of Cape Town") |
| `heights.geojson.xz` | Every roof the City measured within 7.6 km of the centre, its outline and its highest point above the ground (`BLD_HGT`, 2013-23), which the buildings over it take (`tools/cct.py heights`) | City of Cape Town, 2D Building Footprints | City of Cape Town Open Data Policy |
| `measured/<ti>_<tj>.zip` | For each full-detail square, the tree canopy as its build reads it (no lidar here, so no roofs or walls): the canopy map's heights kept to the crowns the City outlined (`tools/cct.py crowns`) | Meta / WRI's canopy height map; City of Cape Town, Tree Canopies (2018) | CC BY 4.0, Meta and World Resources Institute, High Resolution Canopy Height Maps; City of Cape Town Open Data Policy |
| `measured/wide.zip` | The canopy map's tree tops for the wide file, in 2 km windows, kept to the crowns the City outlined | Meta / WRI's canopy height map; City of Cape Town, Tree Canopies (2018) | CC BY 4.0, Meta and World Resources Institute, High Resolution Canopy Height Maps; City of Cape Town Open Data Policy |
