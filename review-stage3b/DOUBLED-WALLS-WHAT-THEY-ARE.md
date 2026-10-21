# What the doubled walls actually are

Follow-up to `4e32c79`, which merged 274 sliver faces between plots and left `walls doubled`
unchanged. This says why, and it is not slivers.

Four squares (0,3 / 1,4 / −1,2 / 2,4), every barrier pair under a metre apart running alongside for
at least 2 m: **602 pairs**.

## By the two edges' label pairs

| the two edges | pairs | metres |
|---|---|---|
| **`corridor` beside `plot`** | **522** | 36,638 |
| `plot` beside `plot` | 79 | 1,238 |
| `corridor` beside `corridor` | 1 | 9 |

**87% are a street edge and a garden boundary**, not two garden boundaries. The sliver merge could
never have touched them.

## By the face between them

| between | pairs |
|---|---|
| `plot` | 368 |
| nothing | 100 |
| `open` | 88 |
| `pavement` | 29 |
| `carriageway` | 6 |
| `building` | 6 |
| `path` | 5 |

## The mechanism

One wide `corridor↔open` edge runs alongside a *series of different* short `open↔plot` edges:

| pair | edge A | edge B | gap |
|---|---|---|---|
| 240 / 2645 | `fence` `corridor↔open`, **315.8 m** | `wall` `open↔plot 27564`, 13.1 m | 0.08 m |
| 240 / 2646 | `fence` `corridor↔open`, 315.8 m | `fence` `open↔plot 27564`, 42.3 m | 0.43 m |
| 220 / 2413 | `wall` `corridor↔open`, 23.8 m | `hedge` `open↔plot 27475`, 12.8 m | 0.39 m |

The ground between them is a **1,400 m² open face, 15.9 m wide**. That is a yard or a back land, not a
sliver. So the shape is: a strip of open land between the street and a plot, with **both of its sides
drawn as barriers a few centimetres to half a metre apart**.

That is one frontage written twice: the street's own edge, and the plot's boundary immediately inside
it. The player sees two walls where there should be one, and between them a strip narrow enough to be
unwalkable but wide enough to be visible.

## What this means for the fix

The sliver merge in pass 2 was aimed at the wrong figure. It fixed 274 real artefacts, but the rule
that `check_map` reports is dominated by this different case, which is not a thin face at all.

The next question, which I have **not** answered, is which of the two edges should be drawn. Options,
none of them tested:

- a `corridor↔open` edge is the street's own edge and should not be a barrier at all where a plot
  boundary runs inside it — which is close to the rule that was wrong before, so it needs care;
- or the `open` strip itself is the artefact — land belonging to neither the street nor the plot,
  left by the block division — and should be absorbed into the plot rather than the street.

The second is the same *shape* of fault as the sliver merge, one size up: a strip that should not
exist, between two things that should meet. The difference is that 15.9 m is far too wide to merge
blindly, so the answer depends on what that land actually is.

## Numbers unchanged by this report

`9 walls doubled` 5,275, `9 walls a metre apart` 3,769, `9 wall on a pavement` 1,140,
`8 wall in a corridor` 854. Stage 3b checks clean: loose ends 0, overlap 0.0, neighbour 0.0 m over
944 lines, openings failing 0, fragments 28/28/0.
