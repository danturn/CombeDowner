# Partition build: decisions to check again

Choices made to get the partition city playable. Each one was the right call for now, but it
needs checking again in the game, or once the bigger rules are settled. Tick one off when it has
been looked at.

## Roads

- [ ] **Streets are narrower.** They are now fitted to the partition's carriageway faces, with a
  0.2 m margin and a 2.5 m floor. Average widths fell: service 2.99 → 2.69 m, residential
  5.58 → 5.21 m, trunk 7.12 → 6.72 m. About a third of service length sits on the floor (it was
  5%). Check that traffic, buses and parked cars still fit.
- [ ] **Vehicle roads stop at a house wall**, as in the old build. Look for dead ends this leaves
  in the traffic network.
- [ ] **Paths under a railway bridge are cut** 5 m either side of the line, because the ground
  isn't dug away under rail bridges. A real underpass loses its link. The fix is to dig the
  ground under spans, as `prep_map.py` does.
- [ ] **Road points are held within 0.4 m of the square's ground.** That ground was cut for the
  old roads. Once the ground is cut for the partition's own roads, the hold can be tightened or
  dropped.
- [ ] **Roads use bilinear ground, walls use the game's triangle ground.** This is because
  `check_map` rule 1 measures roads bilinearly. Make the check consistent, then put roads on the
  triangle ground too.
- [ ] **A stream under a road keeps its bridge span**, but `check_map` counts only water polygons
  as something under a bridge. So "bridge over nothing" rose from 2 to 7. Teach the check about
  streams (`wl`), or confirm these spans look right.
- [ ] **Bored tunnels are left out of `rd`**, and the square's tunnel list builds them. Only 2
  edges are bored. Walk through one.
- [ ] **Bridge decks assume a 1.7 m pavement** (`deckHalf` in `world.ts`), but streets can now be
  written with no pavement (`pv` [0,0]). Check a bridge on a street with no pavement.
- [ ] **Bridge and levelling logic is copied from `prep_map.py` into `tools/structures.py`**,
  which leaves `prep_map.py` untouched. The two copies can drift apart. Merge them into one once
  the partition build replaces the old one.
- [ ] **The railway file path was wrong** in the partition writer (`tile_base`), so it never saw
  the railway. Check whether the old build has the same mistake anywhere.
- [ ] **8 roads still cross the railway with no bridge**, on service roads, Lower Stoke and the
  village file (`combe-down.json`). The partition writer doesn't produce that file yet: who writes
  the village in the partition build?

## Paths and gates

- [ ] **Footpaths are dropped wherever they run inside a drawn pavement band plus 1 m.** Check
  that no real path beside a street went with them.
- [ ] **Gates less than 0.3 m apart merge into one**, and a gate on a wall taken off the road is
  dropped. Check that no garden lost its only way in (`plot_unreachable`).
- [ ] **A gate stays only with wall within 0.3 m of both its ends.** A gate at the end of a wall
  is dropped, along with the stub beside it. Gate without a wall each side fell from 82 to 1. Check
  that gardens whose only gate was at a wall's end still have a way in.
- [ ] **A front path that crosses a wall partway along is dropped.** One that hits a side fence in
  its last 1.5 m is cut short instead. Front paths fell from 4,485 to 4,278. Check how many houses
  lost their front path.
- [ ] **Paths that cross a street are left alone**, even though `check_map` counts them as
  "footpath along a pavement" (476 against 470). Cutting them would break pedestrian routes. Teach
  the check to tell a crossing from a path running along the street.

## Gardens and plots

- [ ] **A registered parcel line just inside the street gives way to the street edge.** Gardens
  gained about 30,000 m² across the city, and about 2,200 m² went from gardens to open land on two
  squares. Look at a few by eye.
- [ ] **A plot corner too small to stand on is left to the square holding its house.** That's
  every point within `FRAG_RUN` of the square's edge. Make sure the rule hides no real garden with
  no way in.
- [ ] **Wall poking past another (1,266) is put down to the partition's own shapes** (forks that
  run nearly side by side, and rounding to 0.1 m), not the writer. A per-point guard in the writer
  made no difference. Check again once the garden fixes land.
- [ ] **Walls are cut off the drawn road strip, the railway, the canal and the water**, as the old
  build did, and bits left under 1.5 m on their own go. A hedge or fence lying along a lane's
  carriageway edge, within a few centimetres of the strip, is lost whole (about 100 m in all).
  A wall standing on a pavement, short of its back edge by 0.2 m, is cut too. "Walls doubled" went
  1,681 to 1,765 and "poking past" 1,266 to 1,320, because a cut wall counts once per piece. Look at a lane where a hedge ran beside it.

## Build

- [ ] **Pass 3 takes 269 s against 175 s before the street-front change**, for no known reason.
  The `once` folder is 692 MB.
- [ ] **`audit_doubled2.py`'s breakdown by "between" uses the midpoint of the whole line**, so the
  breakdown is unreliable. The totals are fine.

## Thin arms trade pokes for doubled walls

Giving a thin arm to a neighbour cuts 30% off "walls a metre apart" and "walls doubled" but adds
about 430 "wall poking past another" (1,266 to 1,699): the cut across an arm's mouth makes a short
edge with a junction at each end. Revisit by snapping the mouth's junction onto the nearest existing
node instead of cutting across.
