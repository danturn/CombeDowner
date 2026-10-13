# Combe Downer

A multiplayer first-person shooter in the browser, set in Combe Down, Bath, and built from real
open data. There is also a co-op dungeon crawl in the stone mines under the village ("Under Combe
Down"). `README.md` describes the game from the player's side; this file is for agents working on
the code.

Two people work on this repo at the same time, each with their own agents: **Spencer**
(spencereholtaway, who owns the repo) and **Dan** (danturn). Read "Working alongside each other"
below before you merge anything.

Also read `NOTES-FOR-AGENTS.md` before you start: it lists what each person's agents are changing
right now. Add your own in-flight work there, and remove it once it's merged.

## The map is the whole of Bath

The game was expanded from Combe Down to the whole of Bath. Bath is not an add-on round the
village: it is the map, and everything that works in Combe Down must work everywhere in Bath in
the same way. That includes traffic, chavs and the posh teams, cats, pickups, buses you can call,
parked cars you can drive, ball games on the pitches, landmarks and anything new. In the code,
Combe Down is the first area (`map.d`) and the rest of Bath comes in as full-detail squares
(`map.tiles`, `tiles.ts`) plus the city-wide `map.wide` data. So never read only `map.d` (its
roads, street furniture, shops, pitches) for gameplay: use `map.areas()`, `map.tilesNear()`,
`map.wide`, or the helpers built on them (`hauntsNear` and `streetSpot` in `haunts.ts`,
`vehicles.stopsNear`). Test new features out in Bath (for example by going to a pub in town), not
just in Combe Down.

## Workflow

- When a piece of work is done and checked (`cd web && npm run build` passes), merge it into
  `main` and push `main` straight away. Don't ask first and don't wait for a pull request: pushing
  `main` publishes the game to GitHub Pages, and that is the point.
- Before merging, bring in the latest `origin/main` and resolve any conflicts, keeping both sides'
  features.
- Check `TODO.md` for open fixes and ideas, and tick off anything you finish.

## Working alongside each other

- `main` on `spencereholtaway/CombeDowner` is the one true copy, and it is what's live. Both people
  push to it, often several times a day, so **fetch `origin/main` when you start and again just
  before you merge**. Never force-push `main`, and never rewrite history someone else has pushed.
- Branch names: Dan's work goes on `dan/<topic>` and agents' work on `claude/<topic>`. Dan
  sometimes works from his fork (`danturn/CombeDowner`) and merges in through a pull request; if
  you're in the fork, `main` there is not the live one, so bring in Spencer's `main` too.
- When you resolve a conflict, keep both sides' features. Never drop, revert or quietly rewrite
  something the other person built to make your change fit: if the two really can't live together,
  stop and ask the user. `git log -- <file>` shows who last worked on what.
- Files most likely to conflict, because everything touches them: `web/src/game.ts` (the match),
  `web/src/net.ts` (the `MESSAGE_TYPES` list), `web/src/main.ts`, `web/index.html`,
  `web/src/style.css` and `README.md`. Make small, local edits there rather than reshuffling.
- Anyone can work anywhere, but expect the other person to have work in progress. Dan has done a
  lot of the mines (`web/src/mines/`, `web/mines.html`), traffic and the building and roof work.
  Check `git log origin/main -- <path>` and the open `dan/*` and `claude/*` branches
  (`git branch -r`) before you make big changes to an area.
- Don't commit build output, `node_modules`, logs or raw map downloads (`data/raw/` is ignored).

## Running and checking

```sh
cd web
npm install
npm run dev          # http://localhost:5173 (the game); /mines.html is the mines
npm run build        # tsc --noEmit then vite build: this is the check before merging
```

There are no unit tests: the build's typecheck is the gate, then play it. Useful URL options:

- `?net=local` links tabs in one browser (BroadcastChannel) instead of WebRTC, to test multiplayer
  on one machine. It can't carry voice.
- `?fx=0` turns off the retro colour grade, `?res=full` renders at full resolution.
- `?room=CODE` joins a game, `?map=<id>` picks the map.
- Mines only: `?go=1` skips the menu, `?depth=3` starts that far down, `?class=mage` skips the class
  choice, `?seed=...` fixes the level.

Soundtrack tracks can be checked with `node tools/check_tracks.mjs web/src/tracks/<track>.ts`
(after `npm install`).

## How the code fits together

- `web/` is a Vite + TypeScript + three.js app with three pages: `index.html` → `src/main.ts` (the
  streets game), `mines.html` → `src/mines/main.ts` (the mines) and `deli.html` → `src/deli/main.ts`
  (COMBE DOWN WITH ME, the deli cooking game). The build publishes `web/dist`.
- **No asset files.** Textures are drawn on canvases in code (`textures.ts`, `mines/art.ts`,
  `mines/icons.ts`), models are built from primitives in code, and all sound and music is
  synthesised with Web Audio (`audio.ts`, `music.ts`, tracks in `src/tracks/`). Keep it that way.
- **The map** is one JSON file, `web/public/maps/combe-down.json`, built by the Python tools in
  `tools/` from Overture Maps, Environment Agency lidar, tree canopy, energy certificates and OSM
  (`tools/prep_map.py`; see `docs/new-area.md`). `map.ts` loads it and answers ground height,
  collision and raycasts; `world.ts` builds the scene from it. Data coordinates are metres east (x)
  and north (y) of the map centre; scene coordinates are X east, Y up, Z = -north. Don't hand-edit
  the JSON: change the tools and rebuild. Hand-made landmarks are plugins in `src/landmarks/`,
  placed by `tools/landmarks/<map>.py`.
- **Multiplayer is peer to peer**, with no server (`net.ts`: Trystero over WebRTC, or
  BroadcastChannel for `?net=local`). The **host is the player with the lowest id**, and if they
  leave the next one takes over. The rules, set out at the top of `game.ts` and `mines/game.ts`:
  - each player moves themselves and sends their position ("st") about 20 times a second;
  - the shooter decides their own hits and tells the host; the host applies damage, kills and
    scores and tells everyone;
  - the host runs everything shared that thinks for itself (chavs, cats, traffic, pickups, who
    sits where in vehicles, the mine monsters and bosses) and sends its state about 10 times a
    second; everyone else just draws it, smoothed;
  - the mines send only a seed: every player generates the same level from it (`mines/gen.ts`),
    so generation must stay deterministic for a given seed.

  A new kind of message needs its name added to `MESSAGE_TYPES` in `net.ts` (Trystero action
  names, so keep them a few letters long). Players on an older page in the same room won't know
  it, so new messages should be safe to ignore.
- Main modules in `web/src/`: `game.ts` (the match, and the hub everything plugs into),
  `player.ts` (movement and collision, shared with the mines), `weapon.ts`, `chavs.ts` +
  `haunts.ts` + `posh.ts`, `cats.ts`, `vehicles.ts`, `traffic.ts`, `pickups.ts`, `sport.ts` +
  `pitches.ts` + `broadcast.ts`, `voice.ts`, `furniture.ts`, `trees.ts`, `grass.ts`, `post.ts`
  (the retro render), `minimap.ts`, `touch.ts` (touch-screen controls), `minetour.ts` (the door from
  the streets into the mines). In `mines/`: `game.ts`, `gen.ts`, `level.ts`, `mobs.ts` +
  `mobviews.ts`, `bosses.ts` + `bossfx.ts`, `puzzles.ts`, `items.ts`, `viewmodel.ts`.
- Every source file opens with a comment saying what it is and who decides what over the network.
  Read that first, and keep it true when you change the file.
- It has to run well on iPads and phones as well as desktops: keep draw calls down (instancing,
  merged geometry, `cull.ts`) and make sure anything new works with touch controls too.

## Style

- Comments and docs are in plain British English, explaining what happens in the game rather than
  in programming terms, in the same voice as the existing ones.
- When you add or change something a player would notice, update `README.md` to match.
- Commit messages are a short plain sentence about what changed for the player, e.g. "Traffic
  pulls round parked cars, and you can stand on car and building roofs".
