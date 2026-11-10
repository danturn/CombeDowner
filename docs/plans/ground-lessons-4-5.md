# Ground lessons 4 and 5: options for Dan

Two lessons from the research on how games draw their ground
(`cd-ground-sheet/shots/research/ground-in-games.md`), written up as choices. Lessons 1, 2, 6 and 8
are decided; 3 is a fallback. This is design only: nothing here was built, and no map was rebuilt.

- **Lesson 4: settle every height once, at build time.** Roads, kerbs, pavements, paths, drives,
  flights and the ground beside them get their heights from one consistent pass in the tools,
  instead of many rules each fixing up the one before.
- **Lesson 5: bridges, tunnels, decks and flights of steps as their own typed pieces**, with ends
  that join the ground and the street network on purpose, instead of being read off flags on
  ordinary way records.

Code pointers are to `origin/claude/map-merge` (the newest; `main` differs only in small ways noted
where it matters). Counts are the whole of Bath (131 squares) from the last full check on Dan's Mac,
`~/combedowner-builds/map-fixes/check.txt` (commit `0972b26`).

## The short answer

| | today | recommended first | then | what it should fix |
|---|---|---|---|---|
| **4** | road centre lines come from one city-wide solve; every other height is ~40 rules run one after another in the writer, each with its own tolerance | **4A**: one ordered height pass per square, starting with **junctions as one surface** | bake walls' feet and treads on the final ground (with 5) | rule 41 (2,421), much of 26 (1,212), 24's drives (857), 44 (14,913 runs, the part that is sampling) |
| **5** | a bridge is a run of flagged points on a way; a flight is a way called `steps`; a tunnel is decided twice; ends are guessed by about ten rules, per square | **5C**: flights as pieces (joined, landings, treads baked) | **5A**: typed ends for bridges and tunnels; 5B only if the duplication still bites | 33 (215), 43 (35), 28 (38), 30 (3), 3 (11), part of 13 and 31 |

Neither needs a new download format of any size, both stay "same pack shape for every map", and both
can be proved on four or five squares with `mac_build.sh --only` before anything city-wide.

---

## Lesson 4: solve heights once, at build time

### How it works today

The important finding first: **the game already decides almost no heights at load.** With the
sheet on (the default), the game adds a fixed lift to each face (road 0.07, pavement 0.17, path
0.04: `world.ts` `surfaceFaces` ~2104), adds the sheet's baked carving to the grid
(`sheet.ts` `carved`), triangulates the open ground round the faces' edges (`buildSheetCdtGen`), and
stands you on what it drew. The old load-time sinking (`sinkUnder`, `clearOf`, `KERB_RAISE`) runs
only with `?ground=old`. So the lesson's picture of "the game fits the ground to the ways at load" is
mostly out of date. What is left at load is small but real:

- **Flights' treads** take their heights from the drawn ground, not from the record
  (`furniture.ts stairLayout` ~1037: the higher of a straight climb and the ground under the line).
- **Walls' feet** are worked out at each corner of a wall from the drawn ground
  (`world.ts` ~2790), and run straight between corners, whatever the ground does in between.
- **The open ground between grid points and face edges** is interpolated by the triangulation, and
  a grid point within 0.3 m of an edge is dropped.

The problem is at **build time**, where the heights come from many sources one after another:

1. **Two road solves.** `tools/prep_map.py` grades roads per square with its own copy of the linear
   programme and flattens the 4 m grid to them (`smooth_network` 678, `regrade` 713, `flatten` 355).
   Then the partition grades every road in Bath at once (`tools/grading.py grade` 58–212, called from
   `tools/structures.py solve` 386–1055 via `partition/once.py pass_structures` 443): an L1 fit to the
   survey with grade caps and bend costs, merged at junctions, with the new `TIE` cost so the answer
   doesn't depend on the order the roads are met. Only street centre lines are in it: no paths, no
   pavements, no junction areas.
2. **The writer reconciles them**, rule by rule (`tools/partition/write_tile.py`, in `build_tile`
   order): `follow_ground` clamps the solved line back to within 0.4 m of the old grid;
   `hold_steep_streets`, `lay_ground`, `_unspiked`, `settle_on_laid_ground`, `follow_laid_ground`
   move the grid and then move things to follow it; `ways_meet_level` lays path ends to whatever they
   meet; `level_z` levels paths across; `seam_z` fixes heights on a square's edge.
3. **Each face corner picks one street.** A carriageway or pavement corner takes `_level_at`
   (3680) of whichever street `nearest` (4350) chooses: the ground under that street's line. Where
   two streets differ by more than 1.5 m the surface is cut with a 0.15 m slot (`level_cuts`,
   `LEVEL_STEP`, `LEVEL_GAP`). Pavement backs are held within 0.12 m (`PAVE_FALL`).
4. **The sheet carves the ground to the faces** (`tools/partition/sheet.py ground_sheet` 365): cut
   1 in 1.5, fill 1 in 2, within 3 m, else a retaining wall; never more than 1 m of fill; flights
   held up to 1.2 m by a wall; 0.5 m under any deck.

Only step 1's second solve settles several heights together. Everything after it runs in turn, so a
later rule can undo an earlier one, and every place two sources disagree has a tolerance. The
height-reading agent counted about forty of them (0.4, 0.25, 0.15, 1.5, 0.12, 0.3, 0.6, 1.0 …),
plus the lift table copied into four files.

### What that costs in the checks

| rule | Bath now | where it comes from |
|---|---|---|
| 41 step in the carriageway | **2,421** | Junctions. Two streets graded separately reach one junction face at different heights; each corner of the face takes the nearest street's level, so a triangle between them climbs a metre or more. Worst: Camden Road meeting Upper Hedgemead Road (0_4, −1139, 2963), the face rising 6.2 m at 1 in 0.4, with the two centre lines at about 73 m and 75–78 m; St Stephen's Road's hairpin (0_4, −1084, 3199). |
| 26 face edge off the ground | 1,212 | Mostly faces side by side at different heights (a path a metre under a pavement); the sheet can't make those meet, the faces would have to change (§12.2 of the ground plan). |
| 24 path tilted sideways | 857 | Paths are level across now; what is left is drives and tracks, which still take the ground under their line (the worst a 2.3 km drive in 0_3). |
| 44 wall's foot over the ground | 14,913 runs | A wall's foot is set at its corners only; between them the drawn ground dips, so the sky shows under it. Half a metre is the shortest run counted. |
| 27 lump between faces | 10 | Ground held up by a retaining wall between two faces. |
| 1 road off its ground / too steep | 2 / 3 | Small. |
| 30, 33, 28 | 3, 215, 38 | Heights at the ends of structures: lesson 5. |
| 27 gap / pavement stops | 6,831 / 2,779 | Plan shapes, not heights. **Not fixed by this lesson.** |

### The options

**4A. One ordered height pass per square (the ground plan's §4.3, finished).**
Replace the reconcilers in the writer with one pass that pins heights in a fixed order, each step
only reading what earlier steps fixed: water; structure ends (lesson 5); carriageway centre lines
from the city solve **only** (the partition stops reading `prep_map.py`'s graded roads and flattened
grid for anything but the survey); **junction faces**, each one surface blended between the levels
its streets bring to it (a plane, or a smooth blend over the junction's own corners), with the
pavement kerb lines following; pavements; paths, front paths and **drives** level across; flights;
then the ground, carved to all of it as `sheet.py` does now. Where two pins can't both hold, the
edge between them becomes a named step (a kerb, a retaining wall), never a slot or a steep
triangle.
- *Fixes:* 41 almost entirely (it is junctions), 24's drives, the face-to-face part of 26 and
  27's lumps. Retires `follow_ground`'s 0.4 m clamp, `level_cuts`, most of the settle-and-follow
  rules.
- *Build time:* the same or less (it removes work: the grid is edited once, not three times).
  Download: no change; the heights are already in `sf.v`. Load: no change.
- *Caching and locality:* stays per square, keyed as now; a road change touches only the squares it
  is in, plus the city solve. `--verify` should stay byte-identical, as it is deterministic and
  order-free by construction.
- *Risk:* medium. It moves every face's height by centimetres, so traffic, parked cars and the
  ride probe need a run. Main traps: `house_divisions` must not see any of it (heights only, never
  plan); the seams must take their heights from the city solve, not from each square.
- *Effort:* medium (a week or two of agent work, mostly in `write_tile.py`), in two halves:
  junctions first, then the rest.

**4B. Widen the city solve to the faces.**
Put junction corners, kerb lines, pavement backs and path nodes into `grading.py`'s linear
programme as well as the centre lines, with constraints (shared corners equal, kerb height over the
carriageway, crossfall under `PAVE_FALL`, paths level across, grade caps) and the same "close to the
survey" cost. This is the OSM2World "constraint graph" idea, and the closest to the lesson as
written.
- *Fixes:* the same as 4A, and it finds the best compromise where pins conflict (a junction on a
  steep hill) instead of placing a step.
- *Build time:* the `structures` stage is already one city-wide unit of 140–280 s; this would make
  the programme ten to thirty times bigger. Download, load: no change.
- *Caching and locality:* the weak point. Today one road change re-runs the whole city solve, and
  because `structures.json` is hashed whole into every square's key, all 131 squares are rewritten
  (the bytes come out the same, but the time is spent). The `TIE` fix had to be added because a
  road in one place moved heights kilometres away; a bigger solve makes that harder to hold. It
  could be cut into **islands** (pieces of the network between fixed pins: bridges, tunnel mouths,
  water), each cached by its own inputs, but that is new machinery.
- *Risk:* high. The ground plan rejected a global solve for these reasons (§8.3); stable ids have
  since shown the programme can be made order-free, but not that it stays readable when it picks an
  odd compromise.
- *Effort:* large.

**4C. A local least-squares fit of the ground only.**
Leave the faces as they are and replace `sheet.py`'s batter clamp with a small smooth fit of the
grid points round each square's faces: as close to the survey as possible, meeting every face edge,
no steeper than a bank, with the square's outer ring fixed so neighbours agree. Then bake the
walls' feet and the flights' treads on that final ground.
- *Fixes:* the ground side of 26, 27's lumps, and most of 44 (once walls stand on the final ground,
  densified where it bends). **Not** 41 or 24, which are the faces' own heights.
- *Build time:* seconds a square. Download: the `gs` carving deltas may grow 1–3 KB a square (more
  points moved, by less). Load: none.
- *Caching:* per square, as now. *Risk:* low to medium; the retaining walls Dan asked for would
  need to survive a smooth fit. *Effort:* medium.

### Recommendation for lesson 4

**4A, junctions first**, then 4C's two small bakes (walls' feet and flights' treads on the final
ground, which needs the build to reproduce the game's triangulation: `tools/sheet_cdt.mjs` already
does that for the checks). Keep 4B on the shelf; revisit it only for junction islands 4A can't
settle without a step.

**First step that proves it:** junctions as one surface, on a branch, built with
`tools/mac_build.sh <branch> --map --only "0,4 1,3 0,3 1,2 1,1" --check`. Pass if rule 41 falls by
at least four fifths in those squares, rules 1, 24, 26 and 27 don't rise, overroad's "pavement on a
lip" doesn't rise, and `--verify` says identical. Camden Road and St Stephen's Road as views.

One change worth making whichever option is chosen: key each square's write on **its own slice** of
`structures.json` (the edges in its window), not the whole file, so a road change rewrites only the
squares near it.

---

## Lesson 5: bridges, tunnels, decks and flights as typed pieces

### How it works today

- **Bridges** are ordinary way records whose points carry a flag: 1 on a span the game builds, 2
  riding on another road's deck (`map.ts spanFlags` 2191, `bridgeSpans` 2218). The ends are not
  stored: the point before the first flag and the point after the last are taken as the abutments,
  and the game lands the deck on the survey's ground there. The writer decides the kind (`bridge_kinds`
  2309, from OSM `bridge:structure`, the outline, or what it carries and crosses) and the deck's
  reach. The ends are then shaped by about ten rules, each a guess with its own number:
  `grow_marks`, un-marking points within 0.3 m of the ground, `SPAN_REST`, `ramp_off_decks`,
  `decks_to_loose_ends`, `decks_meet`, `abutments_on_the_ground`, `level_footbridges`, and in the
  game `offTheEnd`. Bridge rules exist twice (`structures.py` is a port of `prep_map.py`), span
  joining three times (`write_tile._join_spans`, `world.ts joinSpans`, `check_more.join_spans`),
  and only within a square: at a square's edge the game leaves the abutment off.
- **Tunnels** are decided twice: `structures.py` marks which road points are bored, and the
  separate `tn` records come from the old `prep_map.py` pass (`tunnels.py`), copied through. A bore
  crossing a square's edge is two records with no portal at the cut.
- **Flights of steps** are ways called `steps`, mapped or made from steep paths
  (`steep_paths_as_steps` 3885, `steep_flights_that_fit` 4120, `flights_to_their_ends` 4949), laid
  straight between their ends (`ways_meet_level`). The face drawn for a flight uses the record's
  heights, but the treads you see and stand on use the drawn ground (`stairLayout`). Nothing keeps
  two flights apart, and the sheet holds the hill beside a flight with a wall up to 1.2 m
  (`SUNK_MOST`).
- **Generic already:** no bridge or tunnel is named in code. The only place-specific things are the
  canal's own pack (Spencer's lock and canal-tunnel data) and Spencer's Pulteney Bridge set piece,
  which marks the roads it covers `held` so the generic code leaves them alone. OSM `layer` is
  downloaded but nothing reads it.

### The two places Dan named

- **Crown Hill (−3027, 3593), square −2_4, 9 m from the seam with −1_4.** A 13-tread flight that
  doubles back on itself in 7 m, its record climbing only 0.3 m while the ground under its middle
  stands 1.4–1.5 m over it: the line is sunk into the bank, and since the treads follow the ground,
  they climb up the bank and drop again. A second flight starts 0.64 m away and runs to the seam,
  ending 0.38 m under the ground; the next square's footway carries on at the record's height, but
  the treads are at the ground's, so the step shows. Rule 43 counts the overlapping treads; rule 13
  doesn't see the step, because it compares the records' heights, which agree.
- **The footbridge foot at 1_4 (−16, 3139).** A footbridge over the railway lands at its east end
  on the survey's ground (31.41 m) while its record says 31.31, so the ground shows 0.10 m through
  the deck's end (rule 30). Three ways leave that one point: a footway that climbs to 32.5, a flight
  starting 0.73 m away at 34.2 (a 1.7 m hanging step), and a footway east. The deck also clears the
  two tracks by only 1.7–2.1 m: no rule checks headroom over the railway (rules 2 and 31 look at
  roads and paths only).

### What it costs in the checks

| rule | Bath now |
|---|---|
| 2 ways cross at different heights with no bridge | 1 |
| 3 deck end off the road / span ends where its record does / span sunk | 1 / 8 / 1 |
| 10 the gap under a bridge (building, face, ground, no gap, street on path) | 6 |
| 13 way steps at a square's edge | 2 |
| 19 a bridge's sides short of the ground | 3 |
| 28 deck end off the street / deck stops in the air | 27 / 11 |
| 29 parapet gap where pieces meet | 2 |
| 30 ground up through a deck | 3 |
| 31 no room under a bridge | 77 |
| 33 flight lands on nothing / treads wrong | 29 / 186 |
| 43 flights over each other / handrail on the paving | 33 / 2 |

About 390 places, more than half of them flights.

### The options

**5A. Typed ends on today's records.**
Keep bridges, tunnels and flights as they are, but have the build write each one's **ends** as
records of their own: kind (abutment, portal, landing, seam), where, how high, how wide, and which
face or way they land on. The writer decides them once, from the whole structure (not per square:
in the city-wide `structures` stage, so a span crossing a square's edge has one pair of ends), and
the game, the sheet and the checks read them instead of inferring. Every way meeting an end shares
its one height (so the 1_4 abutment is one point at one height, and its flight starts there or has
a ramp). One tunnel decision feeds both the bored marks and `tn`.
- *Fixes:* 28, 30, 3's end rows, 29, 19, the 1_4 foot; rail headroom becomes a rule.
- *Build:* small. Download: well under 1 KB a square. Load: drops `joinSpans`, `offTheEnd` and the
  seam guess. *Caching:* the ends are stored with `structures.json`, given stable ids from their
  geometry (as `edge_id` is). *Risk:* low to medium. *Effort:* medium.

**5B. Structures as their own pieces (as Cities: Skylines does).**
A new layer, the same for every map: each bridge, tunnel and flight is one piece with a stable id,
kept whole (owned by the square its middle is in, drawn by every square it reaches), with its kind,
its deck, bore or treads, and two or more typed ends tied to nodes of the street graph. The way
records under it just name the piece. The ends are the sheet's attachment edges (step 2 of the
height order in 4A), and abutments and portals are holes in the sheet. `structures.py` and
`prep_map.py`'s bridge rules become one; the three span-joiners become none.
- *Fixes:* everything in 5A, plus the tunnel and bridge seams (no more missing abutments or portals
  at a square's edge), and makes rules 2, 10 and 31 simpler to get right.
- *Build:* a little. Download: about the same (fields move rather than grow). Load: less work.
  *Caching:* one stage of pieces, each keyed by its own inputs; a square's write keyed by the pieces
  it touches. *Risk:* high: it touches `world.ts`, `map.ts`, `tunnels.ts`, `furniture.ts`, the checks,
  and must keep Spencer's Pulteney set piece's `held` handling and his canal tunnels as they are. A
  square without the layer must draw as today. *Effort:* large.

**5C. Flights first, as pieces.**
Just the flights, now: join steps records that meet into one flight with landings (a switchback
like Crown Hill's becomes one flight with a landing at the turn, not two lines crossing); where two
flights still overlap, keep the one the data says more about and drop or shorten the other; lay each
flight's line on the ground it is meant to climb (no bank over a tread), with its ends at the face
they land on; and **bake the tread heights** into the record, so the face, the treads and the
walk agree. The sinking Dan parked becomes a choice the build makes per flight (sunk with a cheek
wall, or the ground cut back), recorded, rather than a side effect.
- *Fixes:* 43 (33 + 2), most of 33 (215), the Crown Hill steps, 13's flight seam steps.
- *Build:* seconds. Download: a few hundred bytes a square with flights. Load: `stairLayout` reads
  the record. *Caching:* per square as now. *Risk:* low. *Effort:* small to medium.

### Recommendation for lesson 5

**5C now, then 5A**, built so that 5A's end records are what 5B would use: then 5B is a later
tidy-up, done only if the duplicated bridge rules keep causing trouble. Everything reads OSM's
`bridge`, `bridge:structure`, `tunnel`, `layer`, `highway=steps`, `step_count` and `incline`; no
bridge or flight is named anywhere, and Pulteney Bridge stays Spencer's set piece.

**First step that proves it:** 5C on `−2_4 −1_4 1_3 0_5 1_2` (Crown Hill, the 43 hot spots at 0_5
and 1_3, Widcombe's steps), with `--check`. Pass if rule 43 goes to 0 there, 33's two rows fall by
half or more, 13 and 26 don't rise, and `--verify` says identical. Crown Hill and the 1_4 foot as
views (shots, muted, through `tools/shoot.mjs`).

---

## How they fit together, and with the square edges

- **4 and 5 meet at the ends.** A structure's end is a pin in the height order (step 2 of 4A), so
  5's ends should land before or with 4A's rework, not after. Flights belong to both; 5C is the
  natural place to bake their treads, and 4A's "walls and treads on the final ground" bake is the
  same code.
- **Square edges** (the other agent's `docs/plans/square-edges.md`, not yet written when this was):
  both lessons want heights on a square's edge decided once for the city, not by each square
  (today `seam_z`, `SEAM_STEP` and "points on the edge never move"). 4A's junction pass must take a
  junction straddling an edge from the city solve; 5A and 5B keep bridges and tunnels whole, which
  removes their own seams (missing abutments and portals). Rule 42 (715 places: different faces
  either side) and 13 are the square-edges plan's; these lessons shouldn't claim them.
- **The triangulated ground** (lesson 2, now default) is unaffected: it reads the faces' heights
  and `gs` as now.

## Effects at a glance

| option | fixes (Bath, roughly) | build time | download | load time | locality | risk | effort |
|---|---|---|---|---|---|---|---|
| 4A ordered pass, junctions first | 41 ~2,400, 24 ~800, 26 part | same or less | none | none | per square | medium | medium |
| 4B widen the city solve | as 4A, fewer steps left | structures stage much longer | none | none | city-wide, weak | high | large |
| 4C local ground fit + bakes | 26 part, 27, 44 most | + seconds a square | +1–3 KB a square | slightly less | per square | low–medium | medium |
| 5A typed ends | 28, 30, 3, 29, 19 ~60 | small | < 1 KB a square | less | city stage, stable ids | low–medium | medium |
| 5B structures as pieces | 5A + seams, 2, 10, 31 | small | about the same | less | per piece | high | large |
| 5C flights as pieces | 43 35, 33 ~200, Crown Hill | seconds | tiny | less | per square | low | small–medium |

All counts are estimates from what each rule measures; none has been tried.
