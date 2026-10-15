# Building the map as one partition: implementation plan

This is the plan for replacing the record-by-record map build with a build that fits one
partition of the ground to all the data (the design is summarised below, and in full on the
"Parcels and corridors" page in the project). It is written for an agent to work through stage
by stage. Each stage ends in something that can be run, looked at and measured on its own, and
nothing in stages 1 to 4 changes the game or the existing build. Read `CLAUDE.md` and
`NOTES-FOR-AGENTS.md` first; the rules there (Dan's fork first, builds on the Mac through the
queue, `tools/check_map.py` before and after) all apply.

## Stage status

Measured with `python3 -I tools/partition/compare.py` on the three reference squares. Run it
before every push; the numbers must not get worse.

Two loose-end figures are kept, because they mean different things. **edge** is every plot edge
with an end touching nothing, all of them on the worked area's own boundary (the square plus its
40 m margin): the partition is deliberately cut off there, so these are expected. **loose** is the
ones *inside* the worked area — a boundary stopping in mid-air — and must be zero. The proof of
concept left 1, 2 and 28 loose ends inside on the three squares; the target is 0.

| stage | branch | status | square 1,1 (village) | square 0,0 (estate) | square 0,3 (city centre) |
|---|---|---|---|---|---|
| poc | `claude/partition-poc` | done | edge 61 / loose 1, unc 0.7, ev 8.1% | edge 81 / loose 2, unc 0.3, ev 8.1% | edge 73 / loose 28, unc 2.8, ev 6.4% |
| 1 | `claude/partition-stage-1` | **not ready** | edge 76 / **loose 46**, unc 0.7, ev 10.7% | edge 73 / **loose 27**, unc 0.3, ev 9.6% | edge 86 / **loose 70**, unc 2.9, ev 9.5% |
| 1 (fix) | `claude/partition-stage-1-fix` | **green, for review** | edge 46 / **loose 0**, unc 0.7, ev 11.4% | edge 58 / **loose 0**, unc 0.3, ev 10.7% | edge 37 / **loose 0**, unc 2.8, ev 7.0% |

(unc = m² of the square uncovered by the one surface; ev = share of plot edge length lying on
lidar or mapped evidence. Mid-street pavement steps stay 0 at every stage; the held-out width test
on 0,3 stays 53 of 78 within 1 m, median 0.80 m.)

The stage 1 "loose 0" first reported was **a bug in the metric**, not a result: `loose_ends()`
measured the free end against the square as a *polygon*, whose distance is zero for every point
inside it, so the inside count could never be anything but zero. Fixed to measure the square's
outline. Stage 1 is therefore worse than the proof of concept on loose ends everywhere (46/27/70
against 1/2/28), which is the one thing the rule forbade, and it is not ready to merge until that
is fixed. See `docs/partition-loose-ends-note.md` and `review-stage1/METRICS.md`.

The fix branch is rewritten so that every cut goes into one polygonize and a plot is a union of
faces of that one partition (so the plots tile a block exactly — measured gap 0.00 m², overlap
0.00 m² on every block), and so that the drawn boundaries come from the faces' ring topology
rather than from pairs of plot polygons or probe points. Slivers are absorbed by their neighbour
before the plots are formed. Loose ends inside are **0 on all three squares** and the uncovered
area is 0.7 / 0.3 / 2.8 m².

Evidence share is 9.5 to 10.7% after stage 1. The plan expected "towards 20% on the village
square"; lidar alone does not reach it, and stage 2's cadastral parcels are the lever that does.

## How a block is divided (worked out in stage 1)

The plan said a block is cut by "division lines instead of Voronoi edges" but not exactly how, and
stage 1 had to settle it. Written down here so the next reader does not have to work it out again:

- **The block is the land, and its holes are the union of the buildings.** A party wall between two
  neighbours is therefore an interior wall of that union, not part of the block boundary, so a
  division line drawn "back from the wall" would otherwise start in mid-air. A division line's
  start is put on the *footprint's own* boundary (the minimum rotated rectangle's midpoint can sit
  a little off a rotated wall).
- **A side-wall line** runs from a shared wall (once, not once per house) or a free side wall, in
  the wall's own front-to-back direction, to the block's far side. It is clipped to the block, so
  its far end lands on a building or a corridor.
- **A bisector between two houses that do not share a wall** starts at the midpoint of the gap and
  runs both ways, dropped where it meets a building. Its direction is the nearer house's
  front-to-back axis where the two houses stand side by side, and across the gap where they stand
  end to end.
- **One polygonize cuts the block, and a plot is a union of faces and nothing else.** The division
  lines, the bisectors, the evidence lines, the shared back lines and each garden cap (the back
  edge of the house's mitred GARDEN reach only) are all lines of the same network; the region
  growing then assigns whole faces and never cuts them. So two neighbours share their boundary by
  construction and a plot edge cannot end in mid-air. (Stages 1 and the first fix cut plots in two
  places — cuts in the polygonize, then a per-house cap afterwards — so neighbours were cut
  independently and their versions of a shared boundary did not coincide.)
- **The drawn boundaries come from that noded network by its ring topology, never by probing.**
  After the polygonize, each piece of the noded linework is looked up by every consecutive pair of
  its coordinates in a map from a ring edge's two points to the face it belongs to. A probe point
  just either side of a piece would miss on a thin face or a short piece (a point on a face's
  boundary is not contained by it), which left loose ends; the ring map cannot miss, because every
  ring edge of a face *is* an edge of the linework. A lookup can still name a third face the piece
  only touches at a junction, so the candidate faces are kept only if their boundary runs along
  more than half the piece. Two faces is an interior boundary, one is the block's outside, none is
  a dangle and is ignored. Each piece is labelled from what lies each side; segments along a
  building or the worked area's edge are dropped, the rest are grouped by their pair of labels and
  merged, so a boundary between two neighbours is one line. `classify_edges` then classes each
  merged line (a front, a division, a back, on evidence or inferred) as before.
- **A face too small to be a plot of its own is absorbed** by the neighbour it shares its longest
  edge with (a face under 2 m², or thinner than 0.25 m), before the plots are formed and repeat
  until steady. This is a rule of the partition — no hedge is drawn round a square metre of
  nothing — and it is what keeps a plot from leaving part of itself to open land.

**Still open:** 8 / 8 / 12 loose ends inside remain on the fix branch. Each is a spur where one
boundary's two pieces stop a few metres apart, a gap in the cut set rather than a labelling miss;
they are listed in `review-stage1/METRICS.md`.

## Where things stand

- `tools/partition_poc.py` (branch `claude/partition-poc` on `danturn/CombeDowner`) is the proof
  of concept: one square in, a partition of the ground out. It runs on the packed data in
  `data/combe-down/` plus the terrain tiles, takes 35 to 90 s a square on one core, and writes
  `partition.json`, `render.svg`, `evidence.svg`, `current.svg` and `metrics.json` into its
  output folder. Run it like this (the `--raw` folder holds the unpacked `.geojson` layers,
  `python3 -I tools/mapdata.py unpack combe-down` puts them in `data/raw/combe-down/wide/`, and
  `--terrain` the terrarium PNGs `mapdata.unpack_terrain` writes):

      python3 -I tools/partition_poc.py 1 1 out/1_1 --raw data/raw/combe-down/wide --terrain data/raw/combe-down/wide/terrain15

- Measured on squares 1,1 (the village), 0,0 (the estate west of it) and 0,3 (the city centre):

  | | current build | partition |
  |---|---|---|
  | barrier ends touching nothing, per square | 2,390 to 3,636 | 62 to 80 (nearly all on the square's edge) |
  | joins where a street's width or pavement steps mid-street | 78 to 390 | 0 (18 to 65 cross-section changes, at junctions or where the corridor changes, tapered) |
  | one surface with no overlaps or holes | no | yes (0.3 to 2.8 m² uncovered of 1.09 km²) |
  | carriageway width fitted with the OSM width tag hidden, within 1 m of the tag (centre square, 78 tagged streets) | n/a | 53 of 78, median error 0.8 m |
  | plot edge length lying on lidar or mapped evidence | n/a | about 8% |

- Known shortcomings of the proof of concept, all addressed below: plot divisions are straight
  but not square to their houses; most boundaries are inferred rather than seen; there are no
  gates, drives or openings; nothing is decorated; the output is not the game's format.

## The design in one paragraph

Every point of the ground is exactly one of: building, plot, street corridor (carriageway,
pavement, verge, parking), path, open land, water, railway. Boundaries are the shared edges of
that partition; a fence is only ever drawn along a plot edge, and a pavement is only ever a strip
of a corridor, so nothing can stand alone and nothing can stop for no reason. The data (footprints,
centre lines and their tags, lidar ridges, mapped barriers, land use, address points, and later
cadastral parcels and imagery) is evidence the partition is fitted to, in order of trust:
buildings first, then the street graph, then corridors fitted between what stands either side,
then plots dividing the blocks, then one triangulated surface with heights assigned per class.

## Conventions for all stages

- Work on `danturn/CombeDowner`, branch `claude/partition-<stage>` off `claude/partition-poc`
  (rebase onto the fork's `main` first). Merge each stage into the fork's `main` only after
  Dan has looked at it. Nothing goes to Spencer's `main` until the switch in stage 6.
- The new code lives in `tools/partition/` as a package (split `partition_poc.py` into modules in
  stage 1: `buildings.py`, `graph.py`, `corridors.py`, `plots.py`, `surface.py`, `render.py`,
  `metrics.py`, `__main__.py`), keeping `partition_poc.py` as a thin wrapper until stage 4
  removes it. Each module opens with a docstring saying what it decides, in the voice of the
  existing tools.
- Nothing in `tools/prep_map.py`, `tools/prep_tiles.py`, `tools/walls.py`, `tools/roadwidth.py`
  or `tools/gardens.py` is changed before stage 4. The two builds run side by side.
- Every stage keeps `metrics.json` working and adds to it; the numbers in the table above are
  the baseline and must not get worse. Add a `tools/partition/compare.py` that runs the three
  reference squares and prints the table, and run it before every push.
- Full-city runs go through the Mac queue (`macq-<name>.req.md`, see the project instructions),
  `alone: yes`. Single squares can run in a cloud container.
- Pictures: `render.svg` and the three-panel comparison (current, partition, evidence) are the
  review artefact for every stage. Keep the SVG classes in `render.py` stable so pictures from
  different stages compare.
- Nothing place-specific: no coordinates, street names or Bath rules in the code. Area priors
  come from `area.py`'s zones as they do now; everything else is a general rule with a named
  constant at the top of its module.

## Stage 1: plots that look like gardens, and openings

Goal: the garden geometry is as good as the metrics. About 2 to 3 days.

1. **Split `partition_poc.py` into the package** above, no behaviour change, `compare.py`
   reproducing the baseline table exactly.
2. **House axes.** For every building, its axis: the long side of its minimum rotated rectangle,
   or for a terrace house (sharing walls on two sides) the direction of its shared walls. Keep it
   on the building record.
3. **Division lines instead of Voronoi edges.** In `plots.py`, replace the dense-point Voronoi with
   candidate division lines: from each shared wall between two houses, and from each free side
   wall of a detached or end house, a line square to the house's front running back from the wall
   to the block's far side. Between houses that do not share a wall, the perpendicular bisector of
   the gap, turned to the nearer house's axis. Keep the evidence lines (lidar ridges, mapped
   barriers, extended 3 m past each end as now). Polygonize all of them with the block boundary
   and keep the region growing exactly as it is: faces go to the building they are nearest by
   path, crossing an evidence line costing 15 m. The Voronoi stays only as the fallback for a
   block with buildings and no usable walls.
4. **Backs.** Where two rows of houses back on to each other, the back boundary is one line for
   the whole yard: the evidence line if one runs along it, else the line midway between the two
   rows, parallel to the longer row. Replace the per-house `GARDEN` cap (`buffer(GARDEN,
   join_style="mitre")`) with that line where it exists, and keep the cap only for plots that
   back on to open land.
5. **Evidence along its line.** Before cutting faces, join lidar runs that are collinear within
   10° and 8 m into one line (the current `walls.py` does this with 5 m; the partition can afford
   more because a joined line only ever becomes a plot edge if it closes a face). Report the share
   of plot edge length on evidence in `metrics.json`; expect it to rise from 8% towards 20% on the
   village square.
6. **Openings.** In a new `openings.py`: a gate in a plot front where the building's door faces it
   (doors come from the current build's rule in `prep_map.py`, `doors` around line 1600; reuse it
   or port it), centred on the door, 1 m wide; a drive where a service way or a track crosses the
   front, or where the lidar shows a car-sized lump inside the plot within 8 m of the front, 2.8 m
   wide; an opening wherever a path edge crosses a plot edge, the path's width. Record each as
   (edge id, position along it, width, kind). Gates get the game's `gt` form in stage 4.
   Stage 1 leaves the gate **not yet centred on the door**: it is centred on the house's front for
   now, and the door rule (which needs `buildings.classify`, in the game's own terms) moves to
   stage 4, where the door rule already lives and the game's `dr` records are written. The gate
   check ("no building without a gate or drive on a front that faces a street") moves with it, so
   it is not lost — the check stays in `metrics.py` and runs at every stage.
7. **Checks** added to `metrics.py`: every gate lies on a plot edge with the edge continuing both
   sides; no opening wider than its edge; no building without a gate or drive on a front that
   faces a street.

Acceptance: on the three reference squares, plot edges run square to their houses (check by eye
on the render), the back of each yard is one line, the evidence share has risen, and the baseline
metrics are unchanged or better.

## Stage 2: real plot boundaries where the data allows

Goal: fences where they really are, not where a rule puts them. About 2 days, half of it waiting
on a download and a licence read.

1. **Licence.** Read HM Land Registry's current INSPIRE Index Polygons conditions of use and the
   Ordnance Survey attribution condition that comes with them, and write what they allow and
   require into `data/combe-down/README.md`'s table (a row for the parcels, with the attribution
   text). If the terms do not allow use in a game shared under ODbL, stop this stage here and say
   so in the thread; the build does not depend on it.
2. **Download** the Bath and North East Somerset polygons (the download needs a sign-in, so this is
   a job for the Mac queue: `kind: build`, the download URL and the unzip in `run:`, the GML file
   returned to `/mnt/project-files`). Convert to the wide-area `.geojson` form the other layers
   use, pack it with `tools/mapdata.py` (add a `parcels.geojson.xz` entry) and keep it in
   `data/combe-down/`.
3. **Use it as evidence, not as the answer.** In `plots.py`, parcel boundaries join the evidence
   lines with a weight above the lidar's: a face boundary on a parcel edge is never crossed by the
   region growing (cost 100 m rather than 15 m), and a parcel edge with no building on either side
   still cuts open land into fields. Keep the inferred division for plots the parcels do not cover
   (unregistered land, and anywhere the data is missing). The lidar then only says what each
   boundary is made of and how tall it is.
4. **Metrics:** evidence share again (expect it above 60% where parcels exist), and a new one:
   the share of plot edges that lie on a parcel edge.

Acceptance: fences follow parcel edges wherever parcels exist; the three squares' pictures show
gardens of the right shapes (long thin strips behind terraces, wedges on bends).

## Stage 3: the whole city, and the checks

Goal: every square built the new way, and the bad data found. About 2 days.

1. **Driver.** `tools/partition/__main__.py` takes `--only ti,tj ...`, `--jobs n` and `--all` like
   `prep_tiles.py`, runs squares in parallel with a process pool (the proof of concept is pure
   Python plus shapely, so processes, not threads), and writes one `metrics.json` per square plus
   a city summary. A square takes its margin (40 m) from the neighbouring squares' data as now,
   so edges agree; add a check that each square's partition boundary matches its neighbours'
   along the shared edge within 1 cm, and fix the margin or the noding if it does not.
2. **Mac run.** A `macq-partition-city.req.md` request building all 132 squares with
   `--jobs 12`, returning the city summary and the renders of the ten squares with the worst
   metrics. Expect about 10 minutes.
3. **Bad data.** The checks that point at data rather than code: a corridor narrower than its
   class minimum (a footprint or a centre line is wrong), a plot with no front on any street (a
   missing path or drive), a building the corridor cuts (a centre line through a building). Write
   each as a line in the summary with its square and position, as `check_map.py` does, so Dan can
   look at them in the game. Fix the ones that are code; list the ones that are data.
4. **Held-out widths** across the whole city (every tagged street, fitted with its tag hidden).
   Report the distribution. Below 60% within a metre, look at the worst ones before going on;
   the usual causes are a parked-car row read as a wall and a front garden read as corridor.

Acceptance: the city builds in one run with no square failing, the summary lists the data
problems, and the held-out width test holds across the city.

## Stage 4: the game's map file

Goal: the game loads a partition-built city with no engine changes. About a week.

The game reads `MapData` (`web/src/map.ts`, the interface near the top): `t` the terrain grid
(262 x 262 vertices a square, `area.py` `CELLS`), `bl` buildings, `rd` roads with `w` and `pv`,
`br` barrier lines with `h`, `gt` gates, `fp` front paths, `dv` drives, `dr` doors, `tr` trees,
`sb` shrubs, `fx` street items, `mk` markings, `sh` signs, `wp` ponds, `wl` streams, and the
rest. `world.ts` draws roads as strips offset from the centre line with kerb faces (`strips`,
around line 519) and sinks the terrain under them (`sinkUnder`), and `map.ts` answers ground
height and collision from terrain plus roads plus walls. At this stage the partition writes that
same file, so the game draws it the old way and the gain is in what the file says, not how it is
drawn.

1. **Writer.** `tools/partition/write_map.py` producing one square's JSON from the partition:
   - `rd`: one record per corridor stretch (not per OSM piece), with `w` the carriageway width and
     `pv` the pavement widths of that stretch, and the taper handled by splitting the stretch at
     the taper's ends with the intermediate widths. Points every 4 m along the centre line with
     the road profile's heights as `z`. Bridges, spans and tunnels: take the current build's
     records for these unchanged (`prep_map.py` keeps them with their flags); do not rebuild them.
     Paths (footway, path, cycleway, bridleway, track) are `rd` records too, with no `pv` and no
     kerbs, at the path widths (a cycleway such as a converted railway line is a 3 m tarmac strip,
     not a street; the current build draws cycleways at street width with kerbs, which is wrong).
   - `br`: every plot edge that is a wall, fence, hedge or railing, as a line with the class the
     game knows (`walls.py`'s STYLE names) and `h`, cut at every opening. No line anywhere else.
   - `gt`, `fp`, `dv`: from stage 1's openings.
   - `bl`, `dr`, `by`, roofs, chimneys: from the current build's building pass. The cleaned
     footprints (sliver gaps closed) replace its footprints, so port `clean_buildings` into
     `prep_map.py`'s building step or call it from there; everything after that step is unchanged.
   - `t`: the terrain grid as now, but with the road profile's heights written under the
     carriageway and pavements (replacing `prep_map.py`'s flattening), so `sinkUnder` has nothing
     to do.
   - `tr`, `sb`, `fx`, `mk`, `sh`, landmarks, pitches, water, railway, canal, cable car: from the
     current build's passes, run after the partition, placed relative to the new cross-sections
     (lamps and signs on the kerb line, bins and benches on the pavement's back edge, trees inside
     plots and verges). The simplest route is to run `prep_map.py --tile` with a flag that takes
     `rd`, `br`, `gt`, `fp`, `dv` and the footprints from the partition instead of computing them,
     then lets its decoration passes run as they are.
2. **Stitching and streaming** stay as they are (`prep_tiles.py` `stitch`, `tiles.ts`).
3. **Clash check.** `tools/check_map.py` on the new city. Rule 9's counts (lone gates, doubled
   fences, walls on pavements, buildings in the road) should fall to near zero; rules 1 to 8 must
   not get worse. Fix what fails in the writer, not in a clean-up pass.
4. **Mac run and screenshots** through the queue: the full build, the clash check, and the shots
   in `tools/shoot.mjs`'s views file, plus views of the three reference squares at street level.
   Compare against the same views of the current build.

Acceptance: the game runs on the new city with the old engine; the pictures show continuous
pavements, no loose fences, gates in walls; the clash check is better on every rule; Dan has
walked it.

## Stage 5: one surface in the game

Goal: the ground the player stands on is the partition's mesh. About a week, and the one stage
that touches player movement, so it is decided on separately after stage 4.

1. **Format.** Add to `MapData` an optional `sf`: the surface as a triangle mesh per square,
   vertices `[x, y, z]` and triangles `[a, b, c, class]`, with kerbs and retaining walls as
   vertical faces (duplicate vertices at different heights), and `t` kept for the wide map and for
   anything that still reads it. Size it: the proof of concept gives 90k to 260k triangles a
   square before simplification; simplify flat plots to under a tenth of that (merge coplanar
   triangles within 2 cm) and quantise to centimetres, so a square's surface is a few hundred
   kilobytes compressed.
2. **Drawing.** In `world.ts`, when `sf` exists, draw it instead of the terrain, road strips,
   pavement strips and path strips, coloured by class with the existing materials; the kerb faces
   come with it. Bridges keep their own meshes.
3. **Walking.** In `map.ts`, `ground(x, z)` reads the mesh (a grid index over triangles per
   square); `floor` and `deck` as now for bridges and roofs; `collide` unchanged for buildings and
   walls. A kerb is a 12 cm step the player walks up as they do now with the strips. Traffic
   (`traffic.ts`, `vehicles.ts`) reads the road's `z` from `rd`, which matches the mesh by
   construction.
4. **Tests on the Mac,** muted headless, before and after: the FPS probe, the collision probe
   (`tools/collision_probe.mjs`), the climb probe, and a walk along a scripted route through the
   three reference squares logging the player's height every frame (no step larger than a kerb
   except on stairs, no fall through). Nothing left running.

Acceptance: the probes pass, frame rate within 10% of before on the Mac and on an iPad, and the
walk log shows no jumps.

## Stage 6: tuning and the switch

1. Dan's eye: a list of places from his walks, each fixed as a rule in the right pass, never as a
   case.
2. `README.md` ("Rebuild a map") and `docs/new-area.md` rewritten for the new build;
   `CLAUDE.md`'s "Everything on the ground is laid out in one order" section replaced with the
   partition's order; `NOTES-FOR-AGENTS.md` updated.
3. Remove `walls.py`, `roadwidth.py`, `gardens.py` and the parts of `prep_map.py` the partition
   replaced, once nothing reads them.
4. Merge to the fork's `main`, full build and check on the Mac, then a pull request to Spencer's
   `main` with Dan's approval quoted, as the project rules require.

## Risks and what to do about them

- **A bad footprint pinches a street.** Stage 3's checks name it; the fix is the footprint, and
  until then the corridor's class minimum holds (the plot gives way, not the road).
- **Lidar rows of parked cars read as walls.** The corridor fit treats a ridge inside a class
  minimum of the centre line as cars, not a wall; if that is not enough, drop ridges whose height
  is 1.3 to 1.8 m and whose length is under 6 m when they lie within 4 m of a carriageway.
- **Footways that are really pavements** are snapped onto their street in the street graph; a
  path left standing beside a pavement is rule 9's last item and should be zero after stage 4.
- **Performance** is in the plot pass; the proof of concept is linear in the number of faces, and
  stage 3's process pool covers the city in minutes. If it does not, cap the seeds per block.
- **Bridges, tunnels, water and the railway** are deliberately left to the current code through
  stage 4; they already work and are not what the brief is about.
