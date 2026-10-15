# Bradford-on-Avon by train: feasibility and implementation plan

Checked against Dan's fork `danturn/CombeDowner` main at `f5f061b` (15 Oct 2026), after the
village-as-squares work. Nothing here is built. Distances are data metres (east, north of the Hadley
Arms, the map centre); squares are `ti,tj` on the existing grid (1043.3 m each, `x0 -1975, y0 -1345`).

## Verdict

**Yes, it's possible**, and the "one world" shape in the spec is the right one. The game already
works out every train from the clock with nothing sent over the network, the square grid simply
carries on to Bradford-on-Avon, coordinates out there are well within every limit in the code, and
riders can be shown to other players the way cable car riders are, with no new message types.

It is bigger than the spec says in three places:

1. **No train goes from Bath Spa towards Bradford-on-Avon today.** `tools/railway.py` only ever goes
   "straight on" at points, so eastbound trains from Bath all go to Box; the Wessex Main Line only
   has trains coming *in* to Bath. The route builder has to learn branching routes.
2. **The single circle is built into far more than `fieldEdge`.** The player clamp in
   `map.collide`, the force-field wall mesh, the minimap, the pub map, invasion, the spawn test, and
   on the build side `download.py`, `osm.py`, `fsa.py`, `fetch.py`, `prep_tiles.py`, `prep_wide.py`,
   `railway.py`, `canal.py` and `pubs.py` all assume one circle.
3. **The journey takes about ten minutes at timetable speed** (about 15.5 km by rail), so "fade to
   black while the journey happens" needs a decision on how long the black lasts (decision 5 below).

## What's wrong or missing in the spec

| Spec says | What's true | Source |
|---|---|---|
| Bradford-on-Avon is about 8 km from Bath Spa by rail | About 8.1 km **in a straight line**. By rail it's about 15.5 km: 11.1 km from Bath Spa to where the line leaves today's circle near Freshford (measured on `combe-down-rail.json`), then about 4.5 km down the valley | `combe-down-rail.json` routes 0/1; station positions |
| Trains run Bath Spa, Freshford, Avoncliff, Bradford-on-Avon; the line is "an extension of what's already built" | The track is there to the circle's edge (track 8 is the down Wessex line from Bathampton Junction), but **no route uses it outbound**: routes are built going straight on at every junction, and eastbound that's always the GWML to Box. Freshford (6.4 km from the field centre) and Avoncliff (7.7 km) are outside the data circle (6050 m) | `tools/railway.py:107-142` |
| "out under the city" | The line runs east from Bath Spa through Sydney Gardens and up the Avon valley; there's no tunnel under the city. Cosmetic | |
| The Wessex trains are local services | Today they're drawn as HSTs that stop only at Bath Spa, because any route named Great Western and longer than 15 km gets an HST, and the valley routes are mostly GWML track | `web/src/railway.ts:104-108, 155` |
| "Everyone sees the same train" | True to within each device's wall-clock error: trains use `Date.now()` every frame, unsmoothed. The cable car smooths its clock (`cableway.ts:295-302`); a rider on a train needs the same, or the seat will jitter | `railway.ts:339` |
| Boarding is "the same get in used for a parked car" | Parked-car seats go through the host (`vin` → host `applyEnter` → `vh`). That **would** need host involvement. To keep "no new messages", copy the cable car's rider pattern: the seat is decided locally and sent as a new field in the `st` extras, like `cab` | `game.ts:1700-1720, 1860-1879, 2845-2852` |
| The cable car "does exactly this" (doors, boarding) | Doors on a clock with a chime and solid-only-when-shut: yes, copy them. But the cable car is walk-in with no E, and you stand on a moving floor. Train carriages are one solid box each with no inside, so "seat in a carriage" is new | `cableway.ts:25-29, 196-205, 271-287`; `railway.ts:35-39, 403-405` |
| Trains run independently of who's near | Trains are only created within ~SHOW + 200 m of the player and removed past it, so a rider's own train has to be kept alive however far it goes | `railway.ts:348-358` |
| Black loading screen | There's no fade-to-black anywhere yet. "Go to a pub" moves you instantly and waits up to 20 s for the square. The menu waits with `world.hold()`, which pins squares for good | `game.ts:1081-1131`; `main.ts:141-157`; `tiles.ts:58-72` |
| Its 5 km lidar square, ST86SW, is already in the Bath list | True, but the south of the town (Southville, the Trowbridge road) is in **ST85NW**, which isn't. Neither raw tile is on Dan's Mac: the Mac has no `data/raw`, and the Bath builds read the committed `data/combe-down/measured/` instead | `fetch.lidar_squares` logic run for the new squares; macq-vsq-c2 report |
| Energy certificates and Land Registry parcels from Wiltshire, two extra downloads | Certificates: yes (Wiltshire domestic + non-domestic). **No tool reads Land Registry parcels**, so drop that. The OS Open UPRN cut needs widening east: the box in `docs/new-area.md` stops at longitude -2.25, which is the middle of Bradford-on-Avon | `tools/epc.py`; grep of `tools/` |
| Two lobes is "a contained change: one function plus a handful of places" | Many more places (full list in stage 5). The biggest is `map.collide`, which clamps you back onto one circle and would drag anyone in Bradford-on-Avon back to Bath | `map.ts:806-808` |
| The wide map fills the gap | The wide grid is a square that ends at x ≈ 4021; Bradford-on-Avon is at x ≈ 6460. Outside the grid the ground is the edge height stretched flat and nothing is drawn | `wide.ts`, `outskirts.ts:41, 136-137` |
| Bradford-on-Avon adds maybe a dozen squares, tens of MB | **16 squares** for a 1.2 km field with 1.6 km of data round it (19 for 1.5 km): ti 6-9, tj -3..1. At today's average of 1.2 MB a square, about 15-20 MB | computed with `area.py`'s grid |
| One big circle | Radius about 8 km instead of 5.6 km: **237 squares instead of 131**, about +100 MB of committed squares, and full builds roughly 1.8× longer | computed |
| (not mentioned) | The Kennet and Avon runs through Bradford-on-Avon too (Bradford Lock, and the Avoncliff aqueduct in the gap). `canal.py` clips to the circle, so the canal there needs its pack extended or it won't be dug and drawn as the canal | `tools/canal.py:42-60, 79` |

Things the spec gets right: one world needs no new `MESSAGE_TYPES` (one new `st` extras field
does it); Bradford-on-Avon is in Wiltshire; the station and platforms come out of `railway.py` once
the data covers them; the tree canopy tile is the same one as Bath's (zoom-9 tile 252,170); square
indexing (`tileKey`, ±512) and every spatial hash cope with x up to about 8 km (the tightest,
`world.ts:1278` `surfKey`, is good to x = 30 km).

## Key numbers

| Place | x, y (m) | From field centre | Square |
|---|---|---|---|
| Bath Spa station | -822, 1683 | 1.4 km | 1,2 |
| Freshford station | 3077, -2253 | 6.4 km | 4,-1 |
| Avoncliff station | 4412, -2541 | 7.7 km | 6,-2 |
| Bradford-on-Avon station | 6462, -1944 | 9.3 km | 8,-1 |
| Bradford-on-Avon Town Bridge | 6483, -1778 | 9.2 km | 8,-1 |

Today: field 5600 m round (-2200, 1400), data 6050 m, 131 squares (about 160 MB), wide file 12.7 MB,
ground file 8.9 MB, all plain git (no LFS). With a Bradford lobe of 1.2 km round (6350, -1850), the
gap between the two force fields is about 2.3 km.

## Recommended shape

- **Two lobes**, as the spec recommends: Bath's circle unchanged, plus a Bradford-on-Avon circle
  (suggest field 1200 m round (6350, -1850), data 1600 m), plus a **rail corridor**: a narrow strip
  (about 40 m each side of the Wessex Main Line) from Bath's data circle to Bradford's, and on to the
  Trowbridge side of the lobe. The corridor is data only: no squares, not playable. It gives
  `railway.py` continuous track so routes run edge to edge as they do now, and gives the wide file
  ground under the track so the train doesn't run over a void where anyone can see it.
- **The gap is not built at full detail**. The wide file covers the corridor strip only.
- **Riders are local, like the cable car**: the seat is decided on your machine, sent as an `st`
  extras field, no host, no new message type.

## Rules for whoever implements this

From the project instructions; they apply to every stage.

- **Map work goes to Dan's fork first.** Anything touching boundaries, walls, fences, gates,
  pavements, lidar, building heights or the map build is pushed to `danturn/CombeDowner` and
  verified there by Dan before it goes near `spencereholtaway/CombeDowner`. Never push it straight
  to Spencer's main. Spencer's main needs Dan's approval message quoted (with its id) in the request.
- **Full map builds run on Dan's Mac**, never in a cloud container (quick single-square checks are
  fine in the container). Each build runs in a throwaway worktree off `/Users/dan/CombeDowner`
  using `/Users/dan/.venvs/combedowner`, via `tools/mac_build.sh`.
- **Ask the Mac through the queue**: write `/mnt/project-files/macq-<name>.req.md` (flat, new unique
  lowercase name, no dots) with `thread`, `kind` (test | build | push), `commit`, `run`, `return`,
  `push` (none | fork-main | spencer-main), `alone` (map builds and FPS probes = yes). Tell the
  coordinator "macq-<name>.req.md is waiting". Don't say it's running until
  `macq-<name>.running.md` exists; results are in `macq-<name>.done.md` and files prefixed `<name>-`.
- **Test game changes on the Mac** in muted headless Chrome (`--mute-audio`, audio stubbed), never
  grabbing mouse focus, stopping the dev server and every browser afterwards. Game tests run in
  parallel, each in its own worktree and port. Don't run the game in a cloud browser.
- **Pushes to a main are one at a time, fast-forward only, never forced.**
- **It's a joint decision with Spencer** (`CLAUDE.md`, "Working alongside each other"): settle the
  decisions below with him before stage 2, and add the work to `NOTES-FOR-AGENTS.md` while it's in
  flight.
- Run `tools/check_map.py combe-down web/public/maps --all` before and after every map change; the
  Bath counts must not go up.

## Stages

Each stage ends in a commit on a `claude/bradford-*` branch on Dan's fork. Stages 1-4 are map and
build work; 5-7 are game code and can start in parallel with 2-4 against a stub lobe.

### Stage 0: agree the decisions with Spencer

Dan takes the open decisions (end of this file) to Spencer. Add an entry to `NOTES-FOR-AGENTS.md`.
Nothing else starts until the field shape (decision 1) is settled, because everything else depends
on it.

### Stage 1: lobes in `tools/area.py`, with Bath unchanged

Give the map's settings a list of extra lobes and one helper the tools share.

- `tools/area.py`: add to `combe-down` something like
  `lobes=[dict(name="Bradford-on-Avon", field=1200, field_centre=(6350, -1850), half=1600, zones=[...])]`
  and `corridors=[dict(line="Wessex Main Line", width=40)]` (or a hand-listed polyline of
  lon/lat points from Bath's circle to past Bradford-on-Avon station, which is more predictable than
  finding it by name). Add helpers on the returned namespace:
  - `A.fields`: `[(cx, cy, field), ...]`, Bath first;
  - `A.region(pad=0)`: a shapely union of every data circle (+ the corridor buffer);
  - `A.inside(x, y)`: inside any force field;
  - `A.bboxes`: one lon/lat box per data circle and per corridor segment, for downloads.
  Zones for Bradford-on-Avon go in the same list as Bath's (positions from named places): the old
  town round the Town Bridge and up Newtown/Middle Rank is Bath-stone "georgian"/"victorian", the
  rest "suburb".
- `tools/prep_tiles.py:115-121`: choose squares that intersect any lobe's data circle (not the
  corridor). `write_header` (`:296-304`) writes `field`, `fc` and a new `lobes: [[cx, cy, r], ...]`
  into `combe-down.json`; it should write the wide field, not the old village one (it writes
  1465 / (-410, 220) today, which the game then overrides from the wide file).
- `tools/fetch.py` `lidar_squares`: loop over lobes; add `--squares ST8055,ST8060` so only the new
  ones are fetched.
- `tools/download.py`, `tools/osm.py`, `tools/fsa.py`: fetch each box in `A.bboxes` and merge
  (de-duplicate Overture by feature `id`, OSM by element id, FSA by `FHRSID`).
- `tools/prep_wide.py`: grid over the union's bounding box, content clipped to `A.region()`
  (`region = circle` at `:70` today). Check whether it stores terrain for the whole rectangle; if
  so, store only chunks that touch the region, or the file grows by about a third for empty
  countryside.
- `tools/railway.py`, `tools/canal.py`, `tools/pubs.py`: use `A.region()` in place of the circle
  (`railway.py:52`, `canal.py:79`, `pubs.py:67-68` uses the force fields, not the data).
- `tools/fetch.py`/`docs/new-area.md`: the UPRN cut box widened to at least lon -2.70 to -2.18,
  lat 51.27 to 51.45.

**Check (Mac, `kind: build`, `alone: yes`)**: with the lobe present but no Bradford data yet
downloaded, a full `tools/mac_build.sh <sha> --map --check` must change **no Bath file** (same
131 squares byte for byte, same rail/canal/wide/ground/pubs; `changed.txt` empty apart from the
header gaining `lobes`). This proves the refactor before any data moves.

### Stage 2: Bradford-on-Avon's data

On the Mac (needs the network; the raw data isn't kept on the Mac, so unpack the repo copy into the
worktree first, as the vsq-c2 build did):

1. `python3 -I tools/mapdata.py unpack combe-down` (Bath's data as it is).
2. Overture layers for the new boxes, merged into `data/raw/combe-down/wide/*.geojson` at the same
   release (`RELEASE` in `area.py`, `2026-09-23.1`) so Bath doesn't move: `tools/fetch.py
   combe-down --only overture` after stage 1's change. **Check Bath's features are unchanged** (same
   ids, same geometry) after the merge.
3. OpenStreetMap businesses and streets, FSA ratings: as stage 1's merged fetches. These are live
   data; fetch only the new boxes and merge, so Bath's copy stays as it was.
4. Lidar: ST85NW and ST86SW (DTM, first-return DSM, last-return DSM; about 75 MB each, about
   450 MB in all) into `wide/lidar/{dtm,dsm,last}/`.
5. Canopy: already the same zoom-9 tile as Bath's; fetch it if it isn't there (about 290 MB).
6. Energy certificates (by hand, needs an account at
   get-energy-performance-data.communities.gov.uk): **Wiltshire** domestic and non-domestic. Filter
   to postcodes BA15 (and BA14 9 if the lobe reaches Trowbridge's edge) and append to
   `wide/epc/certificates.csv` and `non-domestic.csv` with one header (`epc.py` reads one file of
   each; the columns match across councils). Re-cut OS Open UPRN with the wider box.
7. Terrain tiles come down as the builds need them.

Then `tools/mapdata.py pack combe-down data/raw/combe-down/wide` after stage 4's measuring, so the
repo copy grows to cover Bradford-on-Avon. Update `data/combe-down/README.md` (Wiltshire's
certificates; the new lidar squares).

### Stage 3: the railway and the canal

`tools/railway.py`:

- Clip to `A.region()` so the track runs continuously from Bath through the corridor and the lobe.
  Stations Freshford, Avoncliff and Bradford-on-Avon come in from `infrastructure.geojson`.
- `at_edge` (`:116`) becomes "on the region's boundary and not inside any force field", so routes
  still start and end where track leaves the data.
- **Branching routes**: replace "straight on at the points" with every edge-to-edge path that
  never turns sharper than the current `0.6` heading test, de-duplicated, and keep-left decided as
  now. This gives W edge ↔ E edge (today's) and W edge ↔ the Trowbridge side via Bath Spa and
  Bradford-on-Avon (new, both directions). Check no silly routes appear (e.g. via the Bathampton
  loop, track 13); if they do, add a small pack naming the services to keep, by the stations they
  call at.
- Write each route's service type into the file (`"k": "hst" | "local"`) rather than guessing it
  from the name in `railway.ts:155`, so the Bradford trains are two-car locals that call at every
  station, and the HST rule stays as it is for the London trains.

`tools/canal.py`: extend the `combe-down` pack with Bradford Lock (its lower and upper gates and
lift, about 3.7 m, from the data) so the canal is right inside the lobe; the Avoncliff aqueduct is
in the corridor and only matters if the corridor carries water (it needn't).

**Check (Mac, `kind: build`, quick, `alone: no`)**: `railway.py` prints the new routes with stops
`[Oldfield Park, Bath Spa, Freshford, Avoncliff, Bradford-on-Avon]` both ways; Bath's existing four
routes still present with the same stops; squares rebuilt only where the rail file touches them.

### Stage 4: build the Bradford-on-Avon squares and the wide file

On the Mac, `alone: yes`:

1. `tools/prep_tiles.py combe-down data/raw/combe-down/wide web/public/maps/combe-down --measure --only <the 16 new squares>`.
   `--measure` with `--only` writes only those squares' `data/combe-down/measured/<ti>_<tj>.zip`;
   Bath's measurements are not touched.
2. Then a normal full build (`tools/mac_build.sh <sha> --map --check`): Bath squares should be
   unchanged except the few the new rail routes cut, the new squares rebuilt from their own
   measurements byte for byte the same as step 1.
3. `prep_wide.py --measure` for the wide file's tree tops over the new area (or measure only the
   new 2 km windows if `WideTops` allows it), then `pubs.py` and `ground_kinds.py`.
4. `check_map.py --all`: Bath counts unchanged; record Bradford's counts as its baseline.
5. Shots of Bradford-on-Avon (station, Town Bridge, Tithe Barn, the Shambles) with `--shots`.
6. `tools/mapdata.py pack` and commit map files and data to `claude/bradford-map` on Dan's fork
   (`--push claude/bradford-map`). Expect about +15-20 MB of squares, a bigger wide and ground file,
   and the repo data growing by the new layers and measurements.

Dan checks the map on his fork before anything goes further.

### Stage 5: two force fields in the game

Make the field a list. `combe-down.json` gains `lobes`; the wide file's `field`/`fx`/`fy` stay as
Bath's for older pages.

- `web/src/map.ts:274-275`: keep `field`, `fieldX`, `fieldZ` as Bath's (the main lobe) and add
  `fields: {x, z, r}[]`. `fieldEdge` (`:742`) returns the largest `r - distance` over the fields.
  Add `fieldOf(x, z)` (the lobe you're in, or the nearest).
- `map.ts:806-808` `collide`: clamp to the nearest lobe, not Bath's circle. Without this anyone in
  Bradford-on-Avon is dragged back to Bath.
- `world.ts:1400-1422, 1462-1463`: one wall cylinder per lobe, with the hex pattern scaled to each
  circumference (`vUv.x * 1600` is tuned to Bath's). Lobes don't overlap at these sizes, so no
  clipping is needed.
- `minimap.ts`: 283-284 (one centre and radius), 372-381 (non-wide path), 386 `drawWide` (one
  2048 px canvas for fc ± 6050: extend to the union's box, or a second canvas for Bradford),
  455-462 and 474-481 (dark outside one circle: make it outside every lobe), 538-542 (full-map
  framing: frame the lobe you're in, or both), 565/654/662/681 (default centre: your lobe), 683-685
  (pan clamp: either lobe).
- `pubmap.ts:72-75, 122-126` and `game.fieldArea` (`game.ts:1031`): frame and clamp to the lobe
  you're in (pubs in Bradford-on-Avon listed with the rest).
- `invasion.ts:243-260`: keep squares within any lobe; the spread is 4-neighbour, so it won't cross
  the gap, which is right (Bradford gets its own outbreak or none; decision 6).
- `game.ts:929`: the street test `fieldEdge > field * 0.15` (840 m) would rule out almost all of a
  1.2 km lobe; make it relative to the lobe's own radius.
- `haunts.ts:42`: the margin is `min(60, field * 0.1)`, fine as is with per-lobe radius.
- Everything else that goes through `fieldEdge` (stunts, trail, race, wanted, quests, vehicles'
  exit and bus stops, bendy, sport, the pubs list, saved spot, the HUD warning) is fine once
  `fieldEdge` takes the best lobe.
- Traffic, naughty boys, cats, gulls and pickups read squares and the wide file, not the field, so
  they come with the map data. Check traffic in Bradford-on-Avon once squares are in.
- Pubs come from `combe-down-pubs.json`, regenerated in stage 4.

**Check (Mac, `kind: test`)**: `?at=` into Bradford-on-Avon (e.g. `?at=6460,-1930,0,0`): you can
walk the lobe, the wall stops you at its edge and doesn't pull you to Bath, the minimap and pub map
frame it, Bath plays as before. Muted headless Chrome per the rules.

### Stage 6: doors, boarding and the destination choice

`web/src/railway.ts`:

- **Smoothed clock** like `cableway.ts:295-302`, used by every train (not only ridden ones).
- **Expose each train's state**: `stopped`, `nextStop`, `dwellLeft`, and its route's remaining
  stations. A train already knows when it's in a dwell (`DWELL = 35`, `timetable()` at
  `:172-187`); add a `stopAt(route, k, t)` that says which station and how far through the dwell.
- **Doors**: copy the cable car's door logic (`cableway.ts:271-280`): open 2 s into the dwell,
  chime and close 4-7 s before it ends, door events within 40 m for `SFX.door` / `SFX.bell`
  (`game.ts:2365-2369`). Draw door leaves on each carriage side facing the platform (which side:
  the platform polygon's side of the track).
- **Pin the ridden train**: keep it alive while anyone on this machine is riding it, however far
  from the player it is (`railway.ts:348-358` removes it otherwise).

`web/src/game.ts` (small local edits; it's the file everyone touches):

- In `useKey` (`:2860-2869`), before `useVehicle`: on a platform, within about 3 m of an open door
  of a dwelling train, **E boards**. Show the prompt and the time left ("Bradford-on-Avon train,
  doors close in 12 s") on the HUD.
- **Choosing where you're going**: the board prompt lists the stations still ahead on that train's
  route that are inside a force field (from Bath Spa that's Bradford-on-Avon on the down Wessex
  trains; Oldfield Park on the westbound ones). Number keys / tap pick one; one choice boards
  straight away. On touch, the same as a button in `touch.ts`.
- **Riding**: you're seated in the carriage (position = train position + seat offset, camera at
  seat height, no walking); getting out with E at a stop, or automatically at your chosen stop.
- **Others see you** through a new `st` extras field, e.g. `trn: [route, k, car, seat]` (parsed at
  `game.ts:211-220`, sent at `:2841-2852`), drawn in their own copy of that train, exactly as
  `cab` does for the cable car. No new `MESSAGE_TYPES`. Older pages ignore it and see you where your
  position says.
- Getting hit by a train (`trh`) must not fire for riders.

### Stage 7: the black screen and arriving

- **A fade overlay**: a full-screen black div in `index.html` / `style.css` with an opacity
  transition, and a line of text ("Bath Spa to Bradford-on-Avon"). Not the menu's "Loading the
  map…".
- **Leaving**: fade to black once the doors have shut and the train has pulled clear of the
  platform (about 5 s after departure).
- **Arriving**: on the black screen, start loading the arrival platform's squares with a
  *temporary* hold (add `TileManager.hold(x, z, r, until)` or a `release()`; today's `hold()` pins
  for good, `tiles.ts:58-72`). When the train reaches the arrival station's dwell (or per decision 5)
  and the squares are in, place you on the platform beside your carriage's door, doors open, and
  fade up. Reuse `land()` (`game.ts:1081-1096`) to move you off anything solid.
- **The train stood behind you**: it's the real train at the platform, so other players in
  Bradford-on-Avon see the same train and see you step off it.
- **Returning**: nothing new. The up Wessex trains at Bradford-on-Avon offer Bath Spa (and Oldfield
  Park) in the same prompt.
- **Missed the train / friend on a later train**: falls out of the timetable for free.
- Update `README.md` (getting on a train, Bradford-on-Avon) and the header comments of
  `railway.ts`, `game.ts` and `map.ts` (what is decided where over the network).

**Check (Mac, `kind: test`, game test in parallel is fine)**: a scripted run that stands at Bath
Spa with `?at=`, waits for a dwelling down Wessex train, presses E, picks Bradford-on-Avon, and
records: doors opened and closed on time, the fade, arrival on the Bradford-on-Avon platform with
the train behind, two tabs with `?net=local` where the second tab sees the rider in the carriage,
and the return to Bath Spa. Shots of each moment. Then a frame-rate probe in Bradford-on-Avon
(`alone: yes`).

### Stage 8: to Spencer's repo

Only after Dan has checked the map (stage 4) and the travel (stage 7) on his fork, and Spencer has
agreed the decisions: a `push` request with `push: spencer-main`, quoting Dan's approval message and
its id, fast-forward only.

## Decisions to settle with Spencer

1. **Field shape**: two lobes plus a data-only rail corridor (recommended: 16 new squares, about
   +15-20 MB), or one big circle (237 squares instead of 131, about +100 MB, builds about 1.8×
   longer, no game changes to the field).
2. **How big the Bradford-on-Avon lobe is**: 1.2 km (town, station, Tithe Barn, Barton Farm) or
   1.5 km (also Avoncliff's end of the valley and more of the Trowbridge road; 19 squares).
3. **How much of the gap is built**: none at full detail (recommended), with only the corridor in
   the wide file; or full detail along the valley (Freshford, Avoncliff) as extra squares.
4. **Which stations offer the train**: Bath Spa and Bradford-on-Avon (recommended to start);
   Oldfield Park too (it's on the same trains, inside the field already).
5. **How long the black lasts**, because the train takes about ten minutes:
   - **Real time** (recommended for one world): black for the whole ride, with the journey text
     and a time to arrival; you step off the very train you boarded, and anyone in Bradford-on-Avon
     sees it come in with you on it. Needs a sensible headway on this route (today `HEADWAY = 400`
     s per route).
   - **Next train in**: a short black (a few seconds, while squares load), then you're put off the
     next down train due at Bradford-on-Avon, which may not be the one you boarded. Waits up to one
     headway. Others see you step off a real train, just not the one you got on.
   - **Ride, then cut**: watch the departure, black for a few seconds, then arrive on a train that
     is dwelling at Bradford-on-Avon now (only works if the timetable guarantees one).
6. **What Bradford-on-Avon has at first**: everything the build gives every square (traffic, naughty
   boys, cats, pickups, buses, parked cars, pubs) as `CLAUDE.md` requires for all of the map; whether
   invasions can start there.
7. **The train**: the two-car local for the Bradford-on-Avon services, and whether you see inside
   the carriage while boarding (needs an interior) or the fade starts before you would.

## Risks

- **Bath changing by accident.** The rail clip and branching routes will move some Bath squares'
  track cuts; the stage 1 "no Bath file changes" build and `check_map` before/after are the guard.
- **Live data drift.** OSM and FSA re-downloads would change Bath's shops if merged wholesale; fetch
  only the new boxes.
- **Clock skew.** Two players whose clocks differ by a few seconds disagree about when the doors
  shut; the smoothed clock and deciding boarding locally keep each player's own experience right.
- **Repository size.** About +20 MB with two lobes; about +100 MB with one big circle. Still plain
  git and GitHub Pages; check the Pages artifact stays well under its limit.
- **Conflicts.** `game.ts`, `net.ts` (untouched here), `main.ts`, `index.html`, `style.css` and
  `README.md` are the shared hot spots; keep edits small and local.
