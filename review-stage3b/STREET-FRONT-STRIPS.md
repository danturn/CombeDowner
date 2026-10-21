# The doubled street fronts: registered fronts just inside the street

Follow-up to `DOUBLED-WALLS-WHAT-THEY-ARE.md`.

## Cause

On square -1,2, 365 of the 388 doubled pairs (94%) sit on a **registered parcel line running 0.1 to
0.5 m inside the street edge** (`region.boundary`). Polygonize cuts a strip there, either a face of its
own (35%) or a thin tongue of a bigger face (65%). The strip borders 2 to 8 gardens (median 4) but can
take only one owner, so every other garden beside it keeps two fronts: the street's edge and its own
registered edge. Lidar evidence, divisions, back lines and caps account for the rest.

`audit_doubled2.py` reads "between" at the midpoint of the two whole lines, which on long edges is
nowhere near the pair: its between-face breakdown is unreliable; totals and label pairs are fine.

## Fix

`_frontage_parcels` (plots.py): within `SLIVER_WIDTH` of the street, a registered line running
alongside it is dropped and one coming up to it is carried on to meet it. The block is **re-cut with
it only after growing and labelling**, each new face taking the owner of the old face it mostly covers.

Doing it before the growing (v1) made bigger faces that grew differently: about 20,000 m² of gardens
went to open land and 13,000 m² moved next door, on two squares.

## Measured, squares -1,2 and 0,3

| | base | v1 (cut before growing) | v2 (re-cut after) |
|---|---|---|---|
| doubled pairs | 424 | 122 | **136** |
| corridor + plot | 368 | 58 | 72 |
| plot + plot | 56 | 63 | 63 |
| shipped plot area m² | 562,506 | 554,237 | 563,942 |
| garden area to open land m² | | ~20,500 | ~2,200 |
| garden area to a neighbour m² | | ~13,200 | ~2,600 |
| plot_unreachable | 13 | 15 | 14 |
| evidence share | 79.0% | 72.6% | 73.1% |
| pass 2 time, -1,2 | 65 s | 76 s | 76 s |

Unchanged: loose ends 0, overlap 0.0, uncovered 3.2 m², openings failing 0, fragments 0/0/0, held-out
179/384 within 1 m. 85 tests pass.

The evidence share falls because the drawn front is now the street's edge, not the registered line
beside it. Plot faces fall (4597→4525, 1722→1644) mostly because a garden's separate pieces fuse.

## Left

- 72 corridor + plot pairs: mostly gardens bounding a path (about 1.8 m) beside the street, so the
  street's front and the gardens' boundary across the path.
- 63 plot + plot: neighbours with their own boundary each, under a metre apart; 7 new ones where a
  carried-on line runs beside an existing one.
- 1 corridor + corridor: a front hedge and front wall 3 cm apart on one plot (-2235, 1740).

## Whole city

Two faults in the first version, found on the city-wide run and fixed: the stretches near the street
were found by putting a point every half metre along each registered line, and the points stayed in
the output (pass 3 2.6x slower, the pass folder 654 MB to 1.1 GB); and every edge of the block counted
as street, not just the parts facing a corridor.

One opening on square 5,3 still failed: a garden's corner now meets a service road 0.09 m past the
square's edge, a 0.009 m2 sliver judged on its own as a front without a gate. `deferred_fragments`
now leaves a piece under `FRAG_RUN` both along and into its square to the square holding the house.

| whole city | 20 Oct build | now |
|---|---|---|
| doubled pairs | 2,751 | **553** |
| corridor + plot | 2,370 | 175 |
| plot + plot | 369 | 369 |
| corridor + corridor | 12 | 9 |
| shipped plot area m2 | 13,113,058 | 13,142,980 |
| plot_unreachable | 190 | 189 |
| openings failing | 0 | 0 |
| fragments deferred / unresolved | 28 / 0 | 29 / 0 |
| loose ends, overlap, neighbour | 0 | 0 |
| uncovered m2 | 22.2 | 22.3 |
| evidence share (by length) | 45.3% | 43.3% |
| pass 3 | 175 s | 269 s |
| pass folder | 654 MB | 692 MB |

Old plot ground now in open faces is at most 132,000 m2 gross, against a net gain of 30,000 m2 of plot.
Pass 3 is still about 1.5x slower than before, not yet explained. `check_map`'s rule 9 has not been
re-measured: that needs every square's game tile written.

## Thin arms, lone stubs and hairline holes

Measured on the whole city against the build before (check_map, all 123 files):

| | before | after |
|---|---|---|
| walls a metre apart | 2,846 | 1,982 |
| walls doubled | 1,681 | 1,160 |
| wall poking past another | 1,266 | 1,699 |
| wall stub on its own | 309 | 68 |
| uncovered ground m2 | 22.3 | 0.0 |
| loose ends, overlap, openings failing | 0 | 0 |
| plot_unreachable | 189 | 196 |
| shipped plot area m2 | 13,142,980 | 13,145,066 |

Garden ground lost to open land is 11,168 m2 (0.08% of plot area); 13,440 m2 went the other way.

- **Arms** (`_thin_arms`, `_absorb_thin_arms`): after labelling, a part of one owner's ground under
  1.6 m wide, 2 m or more long, bounded on both sides by other owners, goes to the neighbour it lies
  against for longer, re-cut and relabelled by overlap. An owner's faces are taken together, since a
  neck often runs from one face into the next. A mapped way or a plot's last 10 m2 keeps it. The
  opening's round ends are cut as straight lines: arcs left tiny hooks (pokes 334 to 153 on two
  squares). About 30% of the pairs remain: arms against a street or building, and pairs that are
  not an arm at all.
- **Stubs**: 201 of 309 came from short partition edges and 108 from the writer cutting longer
  ones at roads and squares, so the fix is in the writer (`_without_lone_stubs`). The 68 left are
  runs cut at a square's seam that continue in the next square.
- **Uncovered ground**: all of it was hairline faces under 0.01 m2 dropped by `partition()` (over
  a hundred per square, each 0.005 to 0.02 m2). They now join the neighbour sharing the longest border.
