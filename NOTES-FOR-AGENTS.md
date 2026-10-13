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

- **Lidar rebuild of Bath:** rebuilding all 122 Bath squares with the new Environment Agency lidar
  for the whole city.
- **Town walls and climbing:** walls traced from lidar everywhere, plus climbing over walls. On
  Dan's fork (`danturn/CombeDowner`) only for testing, not on this `main` yet. Bridges left alone
  because Spencer's agent was working on them.
- **Map build and village squares:** making the village pick random choices the same way the
  squares do; next, merging the two character-zone lists in `tools/area.py` into one, turning the
  village into 9 normal squares, and renaming the landmarks pack from Combe Down to Bath. Keeps the
  spawn, mines door and village positions working.
- **Minigame markers:** a generic point-of-interest marker on minigame entrances (the mines
  dungeon, Combe Down With Me). Game code only.
- **Bath cable car:** a cable car from Mulberry Park over Lyncombe Vale and Beechen Cliff to the
  river by Bath Spa.

### Spencer's agents

- _(add yours here)_

## Parked

- **V-01 voice chat TURN relay:** planned to use Metered Open Relay; see `TODO.md`.
