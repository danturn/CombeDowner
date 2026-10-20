# check_map baseline: today's checker, old build vs new city

`tools/check_map.py` unchanged since 2026-10-14 (`git log -- tools/check_map.py` since the old map was
built on 2026-10-14 is empty), so the comparison is fair: both sets judged by the same code.

Old: the game's shipped tiles in `web/public/maps/combe-down/` (123 files).
New: `out/tiles-gated/` over the same set, from the gate fix at `5b1ecc6` (123 files).

## Rule by rule

| rule | old | new | |
|---|---|---|---|
| 1 road kinked | 40 | **293** | worse |
| 1 road off its ground | 65 | 8 | better |
| 1 road too steep | 466 | **568** | worse |
| 2 bridge without headroom | 12 | 0 | better |
| 2 ways cross at different heights | 4 | 1 | better |
| 3 bridge over nothing | 7 | 1 | better |
| 3 deck end off the road | 45 | 11 | better |
| 3 span sunk in the ground | 6 | 0 | better |
| 4 way in the water | 0 | **54** | worse |
| 5 wall along a carriageway | 0 | **5** | worse |
| 6 road crosses the railway at grade | 18 | **60** | worse |
| 6 track off its ground | 7 | 7 | same |
| 7 ground not dug under a canal bridge | 1 | 1 | same |
| 7 road through the canal | 0 | **19** | worse |
| 8 shrub in a corridor | 0 | **8** | worse |
| 8 street item in a corridor | 0 | **44** | worse |
| 8 tree in a corridor | 0 | **9** | worse |
| 8 wall in a corridor | 0 | **187** | worse |
| 9 building on a carriageway | 639 | **773** | worse |
| 9 building on a pavement | 1320 | **1708** | worse |
| 9 footpath along a carriageway | 11 | **26** | worse |
| 9 footpath along a pavement | 470 | **1115** | worse |
| 9 front path through a wall | 0 | **7189** | worse |
| 9 gate without a wall each side | 0 | **1449** | worse |
| 9 shrub in a gateway or on a path | 0 | **496** | worse |
| 9 shrub inside a building | 8 | 8 | same |
| 9 tree in a gateway or on a path | 0 | **179** | worse |
| 9 tree inside a building | 5 | 5 | same |
| 9 tree on a wall | 86 | 12 | better |
| 9 wall off its ground | 0 | **215** | worse |
| 9 wall on a pavement | 3 | **846** | worse |
| 9 wall poking past another | 0 | **327** | worse |
| 9 wall stub on its own | 0 | **543** | worse |
| 9 walls a metre apart | 78 | **3227** | worse |
| 9 walls doubled | 0 | **3589** | worse |

## The top worse rule: `9 walls doubled`, 3,589

Two `br` runs lying along each other. **The doubled-wall hypothesis is confirmed, and it is the named
mechanism:** a plot edge and a street edge both drawn as barriers along the same frontage.

On three squares (0,3 / 1,4 / −1,2), 92 doubled pairs matched back to the partition edges that
produced them:

| pair of edges either side | count |
|---|---|
| `corridor↔plot` beside `plot↔plot` | **47** |
| `open↔plot` beside `open↔plot` | 17 |
| `corridor↔open` beside `open↔plot` | 10 |
| `corridor↔plot` beside `open↔plot` | 8 |
| `plot↔plot` beside `plot↔plot` | 7 |
| `open↔plot` beside `plot↔plot` | 3 |

Three examples with coordinates:

- **run 34 `wall` (84.5 m, `corridor↔open`, front) beside run 3600 `hedge` (7.8 m, `open↔plot`,
  parcel), square 0,3.** The street's own edge and the garden boundary behind it.
- **run 61 `garden_wall` (32.3 m) beside run 94 `hedge` (41.5 m, `open↔plot`, parcel), square 0,3.**
  Two materials over the same line, which is why the doubled count and the "different material"
  figure (645 of 970) move together.
- **run 1 `fence` (24.0 m) beside run 612 `fence` (107.6 m, `open↔plot`, parcel), square 0,3.** Same
  material, so it does not show as a colour change — the player sees one fence with a doubled
  collision surface.

City-wide, 970 runs have another wall alongside for most of their length, and **645 of those
neighbours are a different material** — a hedge against a wall, a fence against a garden wall.

## What I am not claiming

- **`9 walls a metre apart` (3,227) is the same defect counted with a wider tolerance**, not a second
  one. It should fall with the same fix.
- **`9 front path through a wall` (7,189) and `9 gate without a wall each side` (1,449) may be the
  checker being out of date rather than the city being wrong.** Both test a wall touching a gate or a
  path with `distance < 0.3`, which is satisfied by a wall *running through* the gap — the exact
  defect the gate fix removed. On square 0,3 the checker's gate rule reports 61 against our own
  rule's 58, so they broadly agree there; the city-wide 1,449 needs the same square-by-square
  comparison before it means anything. **Not tested yet.**
- **`building on a carriageway` 639 → 773** is not explained by any of this and I have not looked at
  it. It may be the new carriageway widths from the partition's corridors; it may be the checker's
  ground model against a new terrain.

## Follow-up: the gate and path findings, audited

`audit_rule9.py` (new) takes each finding and says what is physically there. Three squares (0,3 /
1,4 / −1,2):

| | ends / crossings |
|---|---|
| gate ends that do sit on a wall | 9,610 |
| gate ends with no wall at all | 382 |
| path crossings away from a gate | 1,747 |

**The gate rule is a units trap, not a defect.** `check_map` notes a gate when fewer than two of its
ends are walled; the audit counted ends. On 0,3: 11 gates have one walled side and 50 have neither,
so the checker reports 61 and the audit's end count is 11 + 2×50 = 111. Same geometry.

Those 50, classified: **20 have their middle inside a carriageway**, **14 are on a carriageway
boundary**, and **16 are on no road at all**. The 16 are the only ones that need explaining.

### The cause of the 16, measured

Edge 1990, square 0,3: a `plot↔plot` fence, 21.9 m, with a gate at t=19.4. The fence is **0.0 m
inside the road but 0.26 m from it** — and `ROAD_CLEAR` is 1 m, so the clearance buffer deletes
**19.77 m of a 21.9 m wall that is nowhere near the road's interior**. Its other side had only 1.5 m
beside the gate, under the floor, so the gate ends up walled on neither side.

So `ROAD_CLEAR` is doing two jobs: keeping a *cut* from grazing the road edge, which is what it was
added for, and clearing *walls that stand beside a road*, which it was not. Same over-broad pattern
as the label rule it replaced.

What the clearance actually costs, measured on 0,3 across every barrier edge:

| clip | kept | removed |
|---|---|---|
| 1.0 m clearance | 48,465 m | 8,649 m |
| 0.2 m clearance | 49,519 m | 7,596 m |
| no clearance | 49,747 m | 7,368 m |

Only about **1.05 km** of the 8.6 km removed is the clearance; the other 7.6 km is the road surface
itself, which is right to remove. So narrowing the clearance recovers roughly a kilometre of
frontage city-wide and fixes the class of gate that ends in air.

**Not changed.** Waiting on review, per the instruction.

## Nothing changed because of this

No code changed for this report. The next question is the doubled walls: they are one mechanism, they
account for the larger part of rule 9's worsening, and the fix is likely "do not draw a street's own
edge as a barrier where a plot boundary already runs there".
