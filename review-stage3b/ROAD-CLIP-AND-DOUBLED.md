# The road clip and the doubled walls, measured

Two audits, no changes. Base `8f69b73`.

## 1. Where the 7,368 m comes from

`audit_road_clip.py` sorts every metre the road clip removes into one group. Square 0,3:

| group | metres |
|---|---|
| **B** inside the corridor face the road record came from | **7,282.5** |
| **E** on the road's *edge* only, the clip grazing | 90.0 |
| **C** inside `rd` but outside its corridor (`rd` overdrawn) | **0.0** |

By label pair, all of it is corridor edges: `corridor↔plot` 6,647 m and `corridor↔open` 635 m. An
independent recompute confirms **0 non-corridor barrier edges have any length inside a carriageway**.

### But the grouping was the wrong question

Testing "inside" by `intersection.length` is a trap: a line that *shares* a polygon's boundary
intersects it along its whole length. Shrinking the road surface by 5 cm separates the two:

| | metres |
|---|---|
| barrier whose line intersects the road surface | 7,367.8 |
| genuinely inside its **interior** (survives a 5 cm shrink) | **0.0** |
| only sharing the road's boundary line | 7,367.8 |

**Not one metre of barrier is inside a carriageway.** The same holds for the 20 gates: 19 have their
midpoint within 2 cm of the road's boundary and **1** survives the shrink.

So the premise "7.4 km of barrier is road surface and should go" is not what the data says. What
exists is **7.4 km of barrier drawn exactly along the carriageway's boundary line** — the plot front
that runs along the back of the pavement or the kerb. The partition does not have plots overlapping
the street (group C is zero), and `rd` is not overdrawn.

This also explains why these edges are `corridor↔plot` with a `front` source: they are the pavement's
back edge, which is where a front wall belongs. The writer removed them because its clip asked "is
this in the road surface", and a line exactly on the boundary answers yes.

### The three examples

- **edge 65 `hedge`, `corridor↔open`, at (−1783.2, 2635.7)**, square 0,3.
- **edge 90 `fence`, `corridor↔open`, at (−1725.7, 2094.7)**, square 0,3.
- **edge 1117 `hedge_low`, `corridor↔plot`, at (−1898.5, 2386.3)**, square 0,3 — 4.7 m long, inside a
  carriageway face by 4.7 m by `intersection`, and **0.0 m** after the 5 cm shrink.

## 2. The doubled walls

`audit_doubled.py`, square 0,3: **55 doubled barrier pairs** under a metre apart, gaps 0.02–0.87 m.

The first form of the pairing was wrong and worth recording: at gap 0.00 it matched every pair of
edges that merely *shares an endpoint*, giving 1,946 "pairs" whose median enclosing face was 55 m².
A corner is not a doubling. Requiring a real separation, parallel run and overlap gives the 55.

What fills the gap:

| face class | pairs | median gap | median enclosing face area |
|---|---|---|---|
| `plot` | 30 | 0.34 m | 42.6 m² |
| no face covers the gap | 12 | — | — |
| `open` | 9 | 0.39 m | 111.7 m² |
| `pavement` | 3 | 0.26 m | 78.1 m² |
| `path` | 1 | 0.02 m | 23.5 m² |

**There is no thin face between them.** The median face is 42 m² — a garden, not a sliver. The pairs
are two *different plots'* boundaries running near each other: edge 930 is `open↔plot 26137` and edge
933 is `open↔plot 26035`, 0.26 m apart. Two neighbours' hedges, each drawn along its own side.

So the doubled walls are **not** one thin sliver that could be merged. They are two legitimate
boundaries drawn a few centimetres apart, which is the block division putting the shared boundary in
slightly different places for each plot.

### Where the thin faces actually are — and why it is not a defect

The partition makes a lot of small faces: **5,216 under 2 m² on square 0,3**, of which the great
majority are corridor (`carriageway` 2,392, `pavement` 1,226, `path` 889). Only 19 are plots.

**That looked like fragmentation and it is not.** The 5,608 carriageway faces union into **41 parts**,
and their summed area exceeds the union's by only **0.1%** (85.9 m² of 145,080 m²). So they are
consecutive pieces of one continuous surface, cut wherever the block division fell — which is how the
partition works — and not overlapping scraps. The same is almost certainly true of pavement and path.

So the small faces are an artefact of how the corridor is stored, not a structural fault, and they do
not explain the other two findings. I had flagged them as the most promising lead before measuring;
that was wrong, and this is the correction.

## What I changed

Nothing. No check_map rule touched, no geometry changed, no fix attempted.

## What the two findings actually are, in one line each

- **The 7,368 m** is 7,368 m of front wall lying exactly on the carriageway's boundary line, none of
  it inside the road. The clip asks "is this in the road surface" and a line on the boundary answers
  yes.
- **The doubled walls** are two different plots' boundaries 0.02–0.87 m apart, not one thin sliver.
  There is no face to delete; there are two legitimate boundaries placed slightly differently by the
  block division.
