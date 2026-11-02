# Reference: what the build does, what it costs, and publishing

For people and stronger agents. A weak agent following SKILL.md does not need this file, and must
not run the publishing commands here unless the user asks for publishing and a person agrees.

## What `new_area.py build` runs

In this order (`--dry-run` prints the exact commands). `build` uses the Python that `check` found,
and holds the machine's build lock (`~/.combedowner-build.lock`, shared with `tools/mac_build.sh`)
from the railway step to the end.

| Step | Tool | Where | Notes |
|---|---|---|---|
| download | `tools/fetch.py <id> data/raw/<id>/wide --only ...` | all | Overture's 8 layers, the canopy tile, OpenStreetMap (businesses, roads, detail, rail); in England also the lidar, census and conservation areas; in the UK the hygiene ratings. Never the energy certificates or parcels. |
| railway | `tools/railway.py` | all | before the squares, which cut the ground to the track; warns and carries on where there is none |
| church towers | `tools/towers.py` | England | needs the lidar |
| squares | `tools/prep_tiles.py ... --measure` | all | every full-detail square, one per core; writes `data/<id>/measured/` |
| wide map | `tools/prep_wide.py ... --measure` | all | the lighter whole-map file |
| lidar ground | `tools/lidar_ground.py` | England, once | the terrain tiles take the lidar's ground; then the railway, squares and wide map are built again. A marker, `data/raw/<id>/wide/terrain15/.lidar-ground`, stops it running twice |
| minimap ground | `tools/ground_kinds.py` | all | |
| pubs | `tools/pubs.py` | all | |
| district names | `tools/districts.py` | all | |

Speed limits (`tools/maxspeed.py`) come from the OpenStreetMap roads download and need no step.
The map's picture for the telemetry dashboard is sent by the game itself; nothing to do.
The partition (`tools/partition/`) runs only for a map with `partition=True`, which today is only
Bath; a new map never sets it.

## Not automated, by design

- Energy certificates and OS Open UPRN (England and Wales): `docs/new-area.md`, "Energy certificates".
- HM Land Registry parcels: only the partition reads them.
- A canal (`tools/canal.py` needs a pack per map), moorings (`tools/moorings.py`), a cable car (`tools/cableway.py`).
- Zones, landmarks and set pieces: `docs/new-area.md` section 4.
- The sea level for a coastal map (`sea=` in `tools/area.py`, as Cape Town).

## Looking at one place

`python3 -I tools/square_at.py "<?at= value>" --map <id>` says which squares a view is in and prints
the command to rebuild just those. Shoot one view with
`cd web && npm run shoot -- "<east,north,bearing,tilt>" --map <id> --out ../shots/<id>` (note
`--map`: without it the tool shoots Bath).

On Dan's Mac, full builds can go through `tools/mac_build.sh <commit> --map --map-id <id> --check`.

## Publishing a map (only with the repository owner's say-so)

1. `python3 -I tools/mapdata.py pack <id> data/raw/<id>/wide` writes the compact copy to `data/<id>/`.
2. Write `data/<id>/README.md` with each source and licence: copy `data/bradford-on-avon/README.md`
   (England) or `data/cape-town/README.md` (outside the UK) and change the names and dates.
3. Commit `tools/area.py`, `web/src/maps.ts`, `data/<id>/` and `web/public/maps/<id>*`, never `data/raw/`.
4. Big maps go into Spencer's `main` as one squashed pull request. Follow `CLAUDE.md`.

## Cost and size

COST_TABLE
