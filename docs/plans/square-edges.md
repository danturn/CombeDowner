# Where two squares meet: options for making them agree

Written for Dan to choose from. Nothing here has been built: it was read from the code at
`286447e7` (`claude/map-fixes`, the map rebuilt from `0972b266`), with the `claude/stable-ids`
branch beside it, and rule 42 was run again over that build's squares
(`/Users/dan/src/cd-map-fixes/web/public/maps/combe-down/`). It finds the same 718 places, 4,168 m
in all.

## 1. What a square decides on its own

Some things already cross the squares: they are worked out once and every square cuts its share.

- **The street graph** (`once.build_graph`): one for the city.
- **Each street's widths and pavements, stretch by stretch** (the corridors, `once._fit_square_edges`).
  Despite the name, that function is about the graph's *edges*, not the square's sides. Each street is
  fitted once, by the square holding the middle of it (`data.owner_of`, or `once.owned_edges` on
  `stable-ids`).
- **Bridges and road heights** (`once.pass_structures`, the grading in `tools/grading.py`): one solve
  for the city.
- **The blocks** (`once.pass_pieces`; on `stable-ids`, cut from the corridors joined 250 m at a time).
- **The faces' outlines.** Each square's assembly gathers its eight neighbours' corridors and blocks
  (`assemble.py`), so a carriageway or pavement face has the same outline on both sides of the line.

Everything after that is the writer's (`write_tile.build_tile`), one square at a time. It reads only
the streets whose lines enter its own square, and its own copy of prep_map's square (the ground grid,
the old streets, the markings). This is where the two sides fall out:

| What the player sees | Decided where | Rule-42 places |
|---|---|---|
| **A street just across the line is missing from this side.** The writer keeps a street only where its line is in the square (`own` and `roads_from_corridors`, which clips to the grid). The faces still reach over, so this side calls them something else: paving at ground level, which rule 42 counts as "drive" (`street_surfaces`: "carriageway the partition laid where no vehicle street runs is a square's paving"); lane grey if a lane is the nearest street it knows (`carriageway_of`); or nothing. | `build_tile` (`own`), `roads_from_corridors`, `street_surfaces` (`own`, `kerbed`, `carriageway_of`) | **287 places, 2,562 m (61%)** |
| **Both sides know the street but disagree about it.** The width and pavements are fitted again to the faces, one square at a time (`fit_to_faces`, in runs of similar width). The seam stub is made narrower to keep off a house the next square holds (`narrowed`, `EDGE_NARROW`). A short piece becomes a pedestrian street if 70% of *its own* length lies along an old pedestrian way (`carry_pedestrian`), and one-way streets follow the same kind of rule (`carry_one_way`). Lane or street colour (`carriageway_of`), and pavements kept or dropped near verges (`verge_out_of_town`), depend on which pieces each side has. | `roads_from_corridors`, `carry_pedestrian`, `carry_one_way`, `verge_out_of_town`, `street_surfaces` | **88 places, 425 m** |
| **Same kind both sides, different height.** Most are 3 to 9 cm. Each side levels a face across from the nearest street *it* knows (`nearest`, `_level_at`). The street's points are written to the nearest 0.1 m. The grid's edge row is each square's own copy, and the steep-street hold and the ground laying keep 8 m off the edge (`hold_steep_streets`, `lay_ground`). A junction just over the line is blended on one side only. Nine places are 0.3 to 1 m. | `street_surfaces`, `roads_from_corridors`, `hold_steep_streets`, `lay_ground` | **226 places, 648 m** |
| **Paths, drives and surfaces.** The same problem for footpaths and front drives (29 places with a path on one side only). A path's gravel, dirt or grass is worked out per square from that square's unpaved zones. Drives are placed from each square's own gates. | `street_surfaces` (`unpaved`, `drawn_paths`), `drives_from_openings` | **117 places, 532 m** |
| **Walls and fences, and road markings.** Rule 42 doesn't count these. Which boundaries stand is settled per square (`settle`, `walls_and_gates`), and a seam pass afterwards drops lone stubs (`drop_edge_stubs`, `drop_edge_way_stubs`). The markings, give-way lines among them, come from prep_map's streets in each square. They are kept only where they lie on this square's carriageways (`marks_on_carriageways`), so a street that this side stops short of the line, or turns into a pedestrian street, loses its line there. That last part is inferred from the code, not measured. | `settle`, `walls_and_gates`, `marks_on_carriageways` | not counted |

I sorted the places by looking up the streets that reach each place's middle in both squares' `rd`
(throwaway scripts, not committed).

**Dan's spots:**

- **08:19, Lower Bristol Road.** The trunk road's line crosses y = 1785 at a shallow angle over about
  80 m. In 0_2 the trunk stops at x = -1450. West of that, the nearest street 0_2 knows is the lane
  under construction alongside, so the road there is lane grey: the 40 m "service here, road in 0_3".
  Rule 40's last lane-grey faces are the same thing. In 0_3 the trunk's piece from the line is the
  narrowed seam stub: 3.88 m wide where it should be 4.2, with no pavements, because at full width it
  would reach over a house that the trunk's 0_2 piece kept clear of.
- **11:03 and 11:09, Bridge Street and Grand Parade.** In the graph, Bridge Street (primary) runs on
  4 m past x = -931.7 before Grand Parade starts. In 1_3 that 4 m piece lies along the old build's
  pedestrian street, so it became a pedestrian street 11.3 m wide. In 0_3 the rest of Bridge Street,
  being longer, didn't. So Bridge Street ends at the line, its give-way meets paving, and the corner
  paving takes odd shapes. Rule 42 also finds "road here, service in 1_3" there, 12 m.
- **09:28 to 09:40, Crown Hill.** Church Road meets Crown Hill 2 m east of x = -3018.3. Square -2_4
  doesn't know Church Road, so its corner of the junction is drawn as paving on the ground, while
  -1_4 draws it as road at the junction's level. That is the step: 8 m of "drive here, road in -1_4".
  Pavement widths differ either side too.

## 2. The options

**(a) Decide it once, before the squares.** A new city-wide step after the assembly writes each
street's final record for the whole street: its kind (including pedestrian and one-way), width and
pavements stretch by stretch (the fit to the faces included), whether it is a lane or a street, how
its ends meet, and its heights. It also writes each face's final kind. Each street is owned by one
square, as the corridors are now. The writer then only cuts records and faces at the line, lays the
ground and places small things. This is the ground plan's own direction (decided once, cut by squares).
It keeps "squares built independently": the squares still don't read each other. But it moves about
fifteen of the writer's steps, several of which read things only the square has (houses, tunnels,
water, prep_map's old streets). Those inputs would have to move forward with them.
`carry_pedestrian` would be better reading Overture's access tags than the old build.

**(b) Each square reads its neighbours' decisions.** A square looks at what its neighbours wrote
before choosing. That breaks independence. Either the squares are written in an order (and two
neighbours can't each wait for the other), or in two rounds. Each square's key would include its
neighbours' output, so a change ripples outwards a ring at a time. I can't recommend it. Done
honestly, it turns into (c).

**(c) Look past the line, then cut at it.** The writer works with every street, path and house within
a margin past the line (about 40 m, the `REACH` the stages already use). It makes every choice from
those, and writes only what lies inside. Both squares then see the same streets near their shared
side, so the same rules give the same answer. Most of the inputs are already there: the writer
already reads every square's corridors and filters them down, and it already reads the neighbours'
houses from their prep squares (`buildings_next_door`). Heights past the line come from the city's
road profile where there is one, and otherwise from the neighbour's prep grid. The seam stub
(`narrowed`) and the run-on-to-the-edge patches (`_at_edge`, `onward`) go, because a street is
fitted whole and then cut. Rules that judge "most of a record's length" must judge the whole
corridor, not the piece in the square. Squares are still built independently, from inputs only, but
each reads a wider window. That widening is Dan's call.

**(d) Stitch each side after the squares are built.** A pass after writing, like the ones already
there (`drop_edge_stubs`, `string_city_wires`, `clear_seams`). It reads both squares along each
side, sets face corners on the line to one height, and gives a face the kind the street's owner gave
it. It is cheap and fixes the centimetres well. But it treats the symptom. A face drawn as paving on
the ground on one side is the wrong shape and level for metres in, not just at the line. A missing
pavement can't be stitched back. The records, which traffic and parked cars use, still disagree. To
come out the same whichever order the sides are done in, each side's result must depend only on the
two squares.

| | (a) once, city-wide | (b) read neighbours | (c) look past, cut | (d) stitch after |
|---|---|---|---|---|
| Fits the ground plan | yes: it is stage 2's "decided once" taken further | no | yes: it is how the assembly already works | a patch over it |
| Squares independent | yes | **no** | yes, wider window (Dan to agree) | yes, plus a pass over each side |
| Build time | about the same: work moves, the writer gets lighter | slower: rounds, less parallel | writing +5 to 15% (writing is 243 s of 436 s; the slowest square, 219 s, sets the pace) | +10 to 30 s for a pass over every side |
| Caching and `--verify` | a new stage, keyed per street as the corridors are | each square's key takes in its neighbours' output, so a change ripples outwards | the writer's key takes in the neighbours' prep squares (it really reads them already); no new stage | each side keyed by its two squares; it must not depend on order |
| A road change stays local (`stable-ids`) | yes, per street | no: ripples ring by ring | yes, to within the margin | yes |
| Download size | no change | no change | no change (a few pavements come back) | no change |
| Risk | high: the writer's biggest rework yet | high | medium: each of the writer's choices has to look past the line | low, but it can hide real faults |
| 08:19, 11:03, 09:28 | all three | in principle | all three (08:19's stub goes; Bridge Street is judged whole; Church Road is seen from -2_4) | heights only; 08:19's missing pavements stay |
| Share of the 4,168 m | ~90% | ? | ~65 to 75% (most of 2,562 m, half of 425, some heights and paths) | ~15 to 25% (the heights, some kinds) |
| Effort | weeks | weeks | days | a day or two |

## 3. Recommendation

**Do (c), and move the record decisions towards (a) as they are touched. Keep (d) only for whatever
is still out by centimetres.**

The biggest failure, 61% of the length, is not two squares deciding differently from the same facts.
It is one square not being given the facts: the writer has the street across the line in hand and
throws it away before choosing. Keeping it costs a margin, and the window grows by one ring at most.
It needs no new stage, and the ground plan's order (measured things, then streets, then gardens,
then small things) stays as it is. The faces already agree because the assembly works this way.
(c) applies the same idea to the records. After that, the record choices that need nothing from the
square (kind, pedestrian, one-way, verges, widths) can be moved into the corridor stage one at a time
and owned per street. That is (a) in small, safe steps, each locality-proved as `stable-ids` was. (d)
on its own isn't worth building, because it can't fix the main class. The rounding to 0.1 m is worth
fixing directly: write a street's points to the centimetre.

**A first step that would prove it** (two `--only` rebuilds, no full map). Give `street_surfaces`, and
only it, the streets whose lines lie within the margin past each side, as streets it may consult but
won't write. Heights come from the profile or the neighbour's prep grid. Then rebuild 0_2, 0_3, -2_4
and -1_4 and run rule 42 over their shared sides. It should show:

1. the "drive" and lane-grey strips gone at 08:19 and at Crown Hill, with the place count on those
   sides falling by about the share above;
2. no rule going up in those squares (rules 40 and 41 especially);
3. what the margin costs in writing time on 0_2, one of the slowest squares.

If that holds, step two takes out `narrowed` and the run-on patches, and judges `carry_pedestrian`
over the whole corridor (Bridge Street). Then a full build under the `--verify` rule, and the
`stable-ids` locality probe with the wider window.
