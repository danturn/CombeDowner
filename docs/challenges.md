# Writing a team challenge

Team challenges are the big things to do on a map: the lock run, the balloon tightrope, the co-op
climb, the bell ringing, pushing the bus. They stay shut until the room has filled enough sockets
on the strange structure (`web/src/oddments.ts`), and each one won leaves one of the strange objects
where it finished, which is how the next one gets opened. This page is for whoever writes the next.

## The interface

A challenge is one file in `web/src/` that calls `registerChallenge` (`web/src/challenges.ts`) and is
imported once from `game.ts` (next to `import "./challengetest"`).

```ts
registerChallenge({
  id: "lockrun",                 // also its job kind: keep it short and unique
  name: "The Lock Run",          // the title card, the poster and the fly-over
  blurb: "Take a boat up the flight before the pounds run dry",
  glyph: "L", colour: "#3a8fd8", // its badge on the maps
  tier: 1,                       // lower opens first; ties open in id order
  stars: 3,                      // how hard, for the poster
  place(map) { ... },            // ChallengeSpot[] | null
  start({ offer, spots, w, started, by }) { ... },   // returns a Job (quests.ts)
  goal: (o) => "Get the boat to the top lock",       // optional: the start card's line
});
```

`ChallengeSpot` is `{ x, z, name, y?, a? }` in scene coordinates (x east, z = minus north). The
first spot is where the challenge is: its noticeboard stands there, and the fly-over looks at it.
Further spots are yours to use (the other locks, the far end of the tightrope).

`start` returns a `Job`, exactly as a job kind's `start` does in `quests.ts`: `update`, `host`,
`event`, `card`, `progress`/`restore`, `use`/`hint`, `hit`/`shoot`, `end` and `done`. A job that
holds you off your own feet (a tightrope, a basket) returns where from `perch(dt, move)` each
frame, with a tilt to the view, a way to face, or somewhere else to watch from; `w.pose` leans
someone else's body over or sets their arms flailing (`tightrope.ts` uses both). Read the
`Job` interface there; `race.ts` and `gulls.ts` are good ones to copy from. Set
`done = { won, text, x, z }` when it's over, with `x, z` where it finished: that's where the object
appears. A lost challenge leaves no scar.

## Placement

`place(map)` works out where the challenge goes **from the map's own data**, so it fits any map:
Bath, Bradford-on-Avon, Cape Town, someone's own street. Return `null` when the map hasn't got what
it needs (no canal, no church tower), and the challenge is simply left out of that map; the
milestones spread out over the ones that are left.

- Read only what every player has from the start: `map.d` (the first area) and `map.wide` (the
  whole map, roughly: `wide.rd` streets, `wide.wp` water, `wide.buildingsNear`, `wide.treesNear`,
  `wide.d.pl` named places, `wide.ground`). Squares (`map.tiles`) stream in later and differently
  for each player, so never read them in `place`: everyone must get the same answer.
- Use the map, not a list of coordinates: the longest steep street, the tallest lidar walls
  (`map.d.wl` with `h`), the biggest field (`pl`), the canal's locks (`map.canal`), the church with
  the tallest tower. `openGround` in `oddments.ts` is a worked example (and `challengetest.ts`
  places its spot with it).
- Keep clear of the structure's own spot (`openGround(map)`), and of the force field's edge
  (`map.fieldEdge(x, z) > 60`).
- It must be deterministic: no `Math.random`, no clock. Sort ties by name.

## Opening and the noticeboards

The structure has `SOCKETS` (24) sockets. With N challenges placed on a map, challenge k opens at
`round(24 * k / (N + 1))` full sockets, and the last socket plays the finale. When one opens,
everyone in the room gets the fly-over to its first spot, then its noticeboard stands there every
day, and on some days a second board for it goes up round where everyone starts. Taking it from
either board runs it for the whole room; if taken far from its spot, your job should send people
there first (`w.mark` puts a column and a map pin on it).

To test: `?objects=24` drops that many objects round you (and registers the test challenge, Stand
Together). In the console, `__game().oddmentsHere(5)` drops more.

## The reward

Winning a challenge brings exactly one object, at `done.x, done.z`, once per challenge per game day.
Jobs' prizes still drop as usual. Don't award anything else: no currency, no cosmetics. The other
things that bring an object are a pub won back, and a job finished to gold or three stars (at most
three of those a game day); keep it that way, so there are only twenty or forty to find on a map.

## Who decides what

- The host runs anything shared that thinks for itself (a boat, a bell's swing, the bus's weight)
  in `host(dt)`, and says what happened with `w.send("qe", { k: "...", s: offer.seed, ... })`.
  Every screen gets that in `event`. Remember the host doesn't get its own message: call
  `event` yourself after sending, as `challengetest.ts` does.
- The host decides when it's won or lost. Each player decides only their own hits and moves.
- Anything random comes from `rng(offer.seed)` (`quests.ts`), so every screen builds the same
  challenge. A late joiner gets `progress()` from the host and `restore`s it.
- New message names aren't needed: everything goes through "qe". If you must add one, add it to
  `MESSAGE_TYPES` in `net.ts`, keep it a few letters long, and make it safe to ignore.

## What a good one is like

- **Hard.** It should take a few goes. A team that walks it first time is a team that won't remember it.
- **Real stakes.** Failing costs something you can see: the boat sinks back down the flight, the
  bus rolls back to the bottom, the climb starts again from the last ledge someone held.
- **Mistakes are funny.** A wrong move should be a pratfall, a splash, a bell clanging out of turn,
  something people laugh about, not a red screen.
- **No timers where tension does the job.** If the danger is someone letting go of the rope, you
  don't need a clock as well. Use one only when there's nothing else pressing.
- **Scale with players.** Read `w.players().length` when it starts and when it matters: more hands
  on the bus means a heavier bus or a longer hill, more climbers means more ledges that need two at
  once. It must still be possible alone, and better with four.
- **Works everywhere.** On touch screens (the Use and Ride buttons, nothing else) and on a
  controller (write key prompts with `keyLabel` from `gamepad.ts`, or `<b>E</b>` in a hint, which
  the game swaps for the pad's button).
- **Light.** Phones and iPads play this: instanced or merged meshes, built only when someone's near.
