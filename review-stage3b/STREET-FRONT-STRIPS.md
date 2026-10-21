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
- Not yet rebuilt city-wide.
