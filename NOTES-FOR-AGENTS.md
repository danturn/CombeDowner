# Notes for agents

Spencer and Dan each run their own Claude agents on this repo, and the agents can't message each
other. This file is how they say what they're changing so they don't trip over each other.

**Before you start:** read this file and check whether someone is already in the area you're about
to change. **When you start something that will take a while:** add a line under "In flight" with
who it's for, what you're changing and which files. **When it's merged:** delete your line.
Keep each entry to a line or two, and pull `origin/main` right before you push changes here.

## In flight

Updated 2026-10-13.

### Dan's agents

- **Village built as 9 normal squares (done, on main):** the whole map, village included, is now
  built by `tools/prep_tiles.py` in one parallel run: the village is squares 0-2 each way, kept in
  `data/raw/<map>/wide/core/` and stitched into `web/public/maps/combe-down.json` in the same format
  as before, so game code reading `map.d` is unchanged. The squares' grid and base height are set in
  `tools/area.py` (`squares`, `z0`), there's one zone list there for all of Bath, and the one
  landmark pack is `tools/landmarks/bath.py`. Every square was rebuilt with the Environment Agency
  lidar for the whole city. To change the map tools, rebuild with `prep_tiles.py` (README.md has the
  order), not `prep_map.py` on its own.
- **Town walls, street widths, gardens and climbing:** walls traced from lidar everywhere
  (`tools/walls.py`, kept in the measurements as `walls.json`), streets fitted between them
  (`tools/roadwidth.py`, with `osm-roads.geojson`), garden boundaries laid once each as one
  network with gates kept in their walls (`tools/gardens.py`), walls opened only where a path or
  street crosses them, nothing small left standing on a wall (`tools/prep_map.py`), kerb-high
  pavements (`web/src/world.ts`), climbing over walls, and a clash check (rule 9 in
  `tools/check_map.py`). Branch `dan/lidar-walls`, on Dan's fork (`danturn/CombeDowner`) only for
  testing, not on this `main` yet.
- **Bath cable car:** a cable car from Mulberry Park over Lyncombe Vale and Beechen Cliff to the
  river by Bath Spa.

- **Seagull Attack and the wardrobe:** a new job (`web/src/gulls.ts`, registered in `game.ts`), and
  daft wearables earned from jobs, the deli, cats and tummy time (`web/src/wardrobe.ts`, drawn by
  `avatar.ts`, sent in the hello as `wr`, a Wardrobe button in the pause menu). Jobs can now offer
  things to shoot at (`hit`/`shoot`/`bossBar` on `Job` in `quests.ts`) and hand out wearables
  (`done.wear`). Branch `claude/seagulls`, on Dan's fork for testing first.

- **Ladders:** a ladder you pick up, put up against a building with E and climb onto its roof
  (`web/src/ladders.ts`, climbing in `player.ts`, hooks in `game.ts`, `pickups.ts`, `avatar.ts`, `ldr`/`lds`
  in `net.ts`). On Dan's fork `main` (branch `claude/ladder`), not this `main` yet.
- **Straight, joined-up garden fences, benches and signs:** garden side and back boundaries laid as
  one network, squared to their houses, tidied (no footpath fences, no jogs, no loose bits), and
  corners kept when walls are laid on the ground (`tools/gardens.py`, `tools/prep_map.py`); benches
  face away from buildings and signs run along the kerb (`tools/streets.py`). Branch
  `claude/square-gardens`, going to Dan's fork `main` after a full rebuild, not this `main` yet.

- **Climbing Bath Abbey:** a daily job at the west front, Bishop King's Dream (`web/src/climb.ts`),
  up ladders built into the Abbey (`web/src/abbeyclimb.ts`; the turrets' ladders of angels, the
  ledge round the tower and the steeplejack's ladder in `web/src/landmarks/abbey.ts`). Small hooks in
  `player.ts` (`Rungs.off`, `knock`), `quests.ts` (`dailyOnly`, `onLadder`/`crouched`/`knock`),
  `game.ts`, `audio.ts` (`abbeyBell`) and `wardrobe.ts` (a halo). Branch `claude/abbey-climb`, on
  Dan's fork for testing first.

### Spencer's agents

- **Hackney test map:** a second map, 1 km round the Pembury Tavern (`pembury` in `tools/area.py`
  and `web/src/maps.ts`, built with `prep_map.py` into `web/public/maps/pembury.json`), with a
  `london` zone in `tools/buildings.py`, `gardens.py` and `walls.py`. On `main` as a test, on its
  own page (`pembury.html`), kept out of the main menu (`hidden` in `maps.ts`).

## Parked

- **V-01 voice chat TURN relay:** planned to use Metered Open Relay; see `TODO.md`.
