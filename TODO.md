# To do

Things we mean to get round to. Tick them off as they're done (change `[ ]` to `[x]`), and add new
ones wherever they fit. Anyone can add to it, people or Claude.

## Fixes

- [ ] The live site has no TURN relay, so some networks can't connect: add the `TURN_URLS`, `TURN_USERNAME` and `TURN_CREDENTIAL` secrets
- [ ] Traffic still sometimes brushes other cars in tight squeezes
- [ ] The map file is 14.9 MB since Lyncombe Vale went in, so it takes longer to load
- [x] The capped roof wings have only been checked in code, not looked at in the game
- [ ] Settle the Palladian Bridge: does it look right and is it in the right place?
- [ ] Cat balance: waiting on Dan's feedback after playing
- [ ] Sound crackling and the computer slowing down: the scenery no longer keeps a second copy in memory (about 680 MB down to 445 MB, no leak found); check it's gone on the machine that had it

## Streets

- [x] Spencer: adding all of Bath with basic, existing scenery. Bounds are bath racecourse in the north, university of Bath (east), bath spa uni (west),Twinhoe (south). Done at Combe Down's detail, and everything works across the city: traffic, chavs, cats, pickups, buses, cars, pitches
- [ ] Spencer: canal boats
- [x] Spencer: teleporting (pubs as nodes): Go to a pub, from the pause menu's map
- [ ] Food hygiene ratings for the pubs: run `tools/fsa.py` and `tools/pubs.py` where the FSA's API is reachable (see docs/new-area.md)
- [ ] Respawn location: let players choose, e.g. near the nearest group of friends
- [x] "COMBE DOWN WITH ME": an Overcooked-style co-op cooking game in the deli (first version in; follow-ups below)
- [ ] Bike time trial through the Two Tunnels, with ghosts of your friends' best runs
- [ ] Village fete on the rec: coconut shy, tug of war and a cat show where the cats judge back
- [ ] Day and night cycle: at night the lamps go out and the cats get braver
- [ ] BMX track at Odd Down like Motocross Maniacs (side-on, jumps and loops, tilt to land), raced live together as see-through riders, with best-run ghosts

## Under Combe Down (the mines)

- [ ] Play-test the "Stay on the street" button and the new rules for who's host in the mines
- [ ] Test the inventory with two players

## COMBE DOWN WITH ME (the deli)

- [ ] Play-test a shift with two to four people, and tune how fast orders come in and the star thresholds
- [ ] Washing up: dirty plates come back through the pass and need the sink
- [ ] Couch co-op: a second cook on the same keyboard
- [ ] More kitchens or a harder second level (fires to put out, a moving counter)

## Done

- [x] Start a to-do list
