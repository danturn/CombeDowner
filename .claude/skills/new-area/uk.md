# UK maps (BRANCH: UK)

Read this once, then go back to SKILL.md Step 4. Nothing here is a command to run: the build
fetches everything below by itself. This file tells you what the map will have, what it will lack,
and which credits it needs.

## Which part of the UK

`add` and `find` print `region:`. Find the row for it:

| region | What the build downloads (on top of the worldwide sources in non-uk.md) | What the map lacks |
|---|---|---|
| `GB-ENG` (England) | Environment Agency lidar (real roofs, eaves, garden walls, church towers, the true ground), 2021 Census house types, conservation areas, food hygiene ratings | energy certificates and Land Registry parcels (both by hand only; see "Never by this skill" below) |
| `GB-WLS` (Wales) | 2021 Census house types, food hygiene ratings | lidar (Wales publishes its own on another site the tools don't read), conservation areas, energy certificates, parcels |
| `GB-SCT` (Scotland) | food hygiene ratings | lidar, census, conservation areas, energy certificates, parcels |
| `GB-NIR` (Northern Ireland) | food hygiene ratings | lidar, census, conservation areas, energy certificates, parcels |

Without lidar, buildings take their heights from OpenStreetMap's and Overture's heights and floor
counts, and their roofs are guessed. That is expected, not a fault.

## What happens in an English build that does not happen elsewhere

- The lidar is about 3 x 75 MB per Ordnance Survey 5 km square, and a map touches 2 to 6 squares.
  It is most of the download time.
- Church towers are measured from the lidar (`STEP church towers`).
- After the first build of the squares and the wide map, the terrain takes the lidar's ground
  (`STEP lidar ground`), and the squares and the wide map are built a second time
  (`STEP squares again`, `STEP wide map again`). This happens once per map; a rerun skips it.

## Never by this skill (STOP and tell the user it needs a person)

- **Energy certificates** (wall materials, bungalows; England and Wales): need an account at
  get-energy-performance-data.communities.gov.uk and a manual download. `docs/new-area.md`,
  "Energy certificates".
- **HM Land Registry parcels** (INSPIRE): only Bath's partition build reads them. A new map does
  not use the partition. Do not set `partition=True` in `tools/area.py`.
- **A canal with locks**: needs a hand-written pack in `tools/canal.py`.
- **Landmarks and set pieces** (spires, porticos, a famous building): hand-made in code.
- **Zones** (`zones=[...]` in `tools/area.py`): leave the list empty. The census and conservation
  areas do most of that job in England.

## Credits (only needed if the map is ever committed or published)

Every map: Overture Maps and OpenStreetMap (ODbL), Meta / WRI canopy (CC BY 4.0), Mapzen terrain
tiles. See non-uk.md for the exact lines.

UK additions, all Open Government Licence v3:

- Environment Agency lidar: "© Environment Agency copyright and/or database right. All rights reserved." (England)
- Food Standards Agency hygiene ratings: "Food Standards Agency, Open Government Licence".
- 2021 Census (England and Wales): "Source: Office for National Statistics licensed under the Open
  Government Licence v.3.0. Contains OS data © Crown copyright and database right <year>".
- Conservation areas (England): "© Historic England <year>. Contains Ordnance Survey data © Crown
  copyright and database right <year>", with the local planning authorities' data, via
  planning.data.gov.uk.

The full table, in the form each committed map uses, is `data/bradford-on-avon/README.md` (an
English map built the way this skill builds one). Copy its rows for a new English map.
