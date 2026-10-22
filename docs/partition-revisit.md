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

## One boundary per fence, and the writer's tidy

- [ ] **Where two sources trace one fence, the weaker gives way, but only where the ground either
  side stays apart.** About half the doubles are narrow necks between two owners, not one fence
  drawn twice. A given-away stretch whose removal joins more than 2 m of one owner's ground to
  another is put back (`_merged_ground`). The 2 m is a guess. The step alone took doubles from 1,196
  to 846 city-wide.
- [ ] **The rest is the writer's last tidy (`tidy.py`), as the old build did it.** This is a
  clean-up step on top, against the "rule, not a clean-up" principle, and it was kept because the
  old build reached zero the same way. On six squares it took doubled 147 → 53, metre-apart
  124 → 66 and poking 166 → 1, and lost 0.4% of barrier length. Which run stays is set by the
  writer's rank: a real wall, then a front, then the longer.
- [ ] **Thin arms are still given to a neighbour** (`_absorb_thin_arms`), since it helped.
- [ ] **A hairline slit the re-cut leaves takes the owner of the ground it lies in.** Left open, it
  was drawn as a hedge out and back through a house.
- [ ] **A path's gap is slid along its fence to fit**, rather than dropped, when the path crosses
  near the fence's end.
- [ ] **Streets are narrower than the old build's in places, and paths are cut under rail
  bridges.** Both were noted in passing. Look at them in game.

## Gates

- [ ] **A gate goes in a front, never in the fence between neighbours when the house has a front.** A
  registered or lidar line with a garden beyond it touches the house, so as the nearest "front" it took
  the gate: 953 of 2,174 gates in Oldfield Park stood in a party fence, and their paths ran along it
  and were dropped. On three squares front paths went 388 → 2,311. One new "front path through a
  wall" at -1,2 (-2736, 1057) crosses a hedge and a fence together.

## Street furniture

- [ ] **Parked cars are placed afresh along the new streets, by carriageway width**: none under
  4.8 m, one kerb up to 7 m, both above. The city centre (-1,2) has 636 against the old map's 466,
  and suburbs far fewer (4,-2: 58 against 233). Look in game; `TWO_KERBS` is the knob.
- [ ] **Lamps, bins and trees are still copied from the old map and dropped where they clash**,
  not placed afresh.
- [ ] **Street items in the road go back on the nearest pavement; plants and items by a wall are
  nudged up to 1 m off it.** A plant may not be nudged onto a road, pavement, railway, canal or
  water. City-wide: trees 354,948 (old map 358,497), shrubs 560,328 (566,588), street items 29,182
  (32,099).
- [ ] **Front paths go from the gate to its own garden's house**, straight in where they meet it,
  and one hugging a fence or ending on one is left out: 14,054 against the old map's 18,737. Most
  of the rest are houses within a metre of their gate.
- [ ] **A street item anywhere inside the carriageway goes back on the pavement**, not just one
  past the kerb line, and no parked car is placed on a lamp, sign or bin.

## Drives

- [ ] **Drives follow the old build's rule, with a check for room**: about half the detached and
  semi-detached houses with a front over 9 m get one beside the gate, where the garden has at least
  5.5 m from the front to the house and the drive stays inside it. Terraces get none, so Oldfield
  Park has few (56 on -2,2). The old city squares had no drives at all; the old village had 1,233.
  Mapped driveways aren't used yet. `DRIVE_SHARE` is the knob.
- [ ] **A drive is a gap in the front wall with no gate in it**, as before, and about 60% of the
  drives over 6 m have a car on them.

## The village

- [ ] **Spencer's main now builds the village as nine ordinary squares**, so the writer does them
  like any other.
- [ ] **The new village has a few more wall clashes than the old one** (doubled 0 → 5, a metre
  apart 5 → 23, stubs 0 → 10, two walls standing in a road: a service lane at (-1817, 1299) and
  Prior Park Road at (-435, 1339)), about the rate of the rest of the city's partition build. It
  has far fewer buildings in the road (112 → 11 on a carriageway, 262 → 2 on a pavement).

## Spencer's main

- [ ] **One-way streets are carried over from the old build's roads** (`carry_one_way`): a new
  stretch takes the way of the old road it lies along. Check traffic on a one-way street in town.
- [ ] **Wall styles are the partition's own, not Spencer's newer ones.** His build has stone walls
  (846), low brick walls (10,742) and retaining walls (51), and half as many hedges; the partition
  writes almost none of those. Bring his styling rules into `classify_edges`.

## Street faces

- [ ] **Carriageways and pavements are drawn from the partition's faces** (`sf`, `street_surfaces`,
  and `surfaceFaces` in `world.ts`), not as strips along each road; `?roads=strips` draws the old
  way. Paths, drives and bridges are still strips.
- [ ] **Every point takes the ground height under the middle of its nearest street**, as the strips
  did. Where two streets of different heights meet, the faces between are stretched to join them.
- [ ] **The outlines are simplified by 5 cm**, together, so a square's file grows about 11% rather
  than 2.5 times.
- [ ] **The kerb and stone faces round each piece are drawn both ways**, as the outline doesn't say
  which side is outside. That doubles their triangles; orient the rings in the writer to halve it.
- [ ] **What stands on the surface (the player's feet, grass, things laid flat) still reads the
  road strips' widths**, not the faces, so they can disagree by the difference.
