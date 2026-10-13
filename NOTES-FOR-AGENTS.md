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

- **Village becoming 9 normal squares (likely to conflict, check before touching the village or
  map tools):** the Combe Down village (`map.d`, built by `tools/prep_map.py`) is being turned
  into 9 ordinary squares like the rest of Bath. The two character-zone lists in `tools/area.py`
  are being merged into one, and the landmarks pack (`tools/landmarks/combe_down.py`,
  `combe_down_bath.py`) is being renamed to a single Bath pack. The village will also pick random
  choices the same way the squares do. Starts after the lidar rebuild below lands. Spawn, mines
  door and village positions are being kept working. If you're changing `tools/area.py`,
  `tools/prep_map.py`, `tools/landmarks/`, or code that reads `map.d` directly, say so here first.
- **Lidar rebuild of all 122 Bath squares:** Environment Agency lidar for the whole city, rebuilt
  together with shop, town-centre tree and pedestrian street width fixes. Touches every square's
  map data.
- **Town walls and climbing:** walls traced from lidar everywhere, plus climbing over walls. On
  Dan's fork (`danturn/CombeDowner`) only for testing, not on this `main` yet. Bridges left alone
  because Spencer's agent was working on them.
- **Bath cable car:** a cable car from Mulberry Park over Lyncombe Vale and Beechen Cliff to the
  river by Bath Spa.

### Spencer's agents

- _(add yours here)_

## Parked

- **V-01 voice chat TURN relay:** planned to use Metered Open Relay; see `TODO.md`.
