# Maps outside the UK (BRANCH: NON-UK)

Read this once, then go back to SKILL.md Step 4. Nothing here is a command to run: the build
fetches everything below by itself.

## What every map is built from (worldwide)

| Source | What it gives | Licence |
|---|---|---|
| Overture Maps (8 layers: building, segment, water, land_use, land, land_cover, place, infrastructure) | footprints, roads, paths, water, woods, fields, place names, bridges, railway | ODbL (© OpenStreetMap contributors, Overture Maps Foundation, and others) and CDLA Permissive 2.0: overturemaps.org/attribution |
| OpenStreetMap (`osm.py`: businesses, streets' widths and speed limits, path details, railway tags) | shop and pub signs on the right building, street widths, pavements, speed limits | ODbL, © OpenStreetMap contributors |
| Meta / WRI canopy height (one 290 MB tile per area of about 50 km) | trees, hedges, shrubs | CC BY 4.0, Meta and World Resources Institute |
| Mapzen terrain tiles (fetched during the build) | ground height | see github.com/tilezen/joerd/blob/master/docs/attribution.md |

## What a map outside the UK lacks

- No lidar: building heights come from OpenStreetMap's and Overture's heights and floor counts,
  roofs are guessed, there are no measured church towers, and the ground is the coarser terrain
  tiles.
- No census, conservation areas or food hygiene ratings: houses are guessed from the default zone
  (`suburb`), and pubs have no ratings.
- Speed limits: a street OpenStreetMap doesn't tag takes the limit most streets of its kind have in
  the map; with no tags at all, the UK's 30 mph. Expected.
- The railway (if there is one) keeps left, as in Britain.
- The sea: a coastal map's sea is drawn as ground under water at whatever the terrain says. Cape
  Town needed `sea=0.0` in its `tools/area.py` entry. If the shots show the sea as land, or land
  flooded: STOP and tell the user it needs `sea` set by a person.

These are expected, not faults. Put them in the report's "What it lacks".

## Never by this skill (STOP and tell the user it needs a person)

Zones (local house styles: Cape Town has `cbd`, `bokaap`, `cape`), landmarks and set pieces, a
canal, a cable car, the sea level.

## Credits (only needed if the map is ever committed or published)

`data/cape-town/README.md` is the model: a map built from worldwide data only. Copy its rows.
