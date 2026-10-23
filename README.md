# Combe Downer

A multiplayer first-person shooter in the browser, set in Bath. The map is the whole city, 11 km
across inside a force field, built from real open data: Overture Maps buildings, roads, walls,
woods and water on Environment Agency lidar terrain. It starts in Combe Down, round the Hadley
Arms, and everything you can do there you can do anywhere in Bath.

**Play:** https://spencereholtaway.github.io/CombeDowner/

**Who's who:** https://spencereholtaway.github.io/CombeDowner/characters.html, everyone you meet on
the streets and down the mines, and every car, bus, train, balloon, boat and ride in their colours, on a turntable.

**What's what:** https://spencereholtaway.github.io/CombeDowner/whatswhat.html, the set pieces,
landmarks and vehicles, in full, without textures or as wireframes, and in AR on an iPhone or iPad.

It's paintball by default, peer to peer with no game server, and ships no images or sound files:
every texture, model and note of music is made in the browser.

## What's in it

The full guide is in [docs/playing.md](docs/playing.md). In short:

- **Bath, all of it**: streamed in around you in squares about a kilometre across, at the same
  detail everywhere. Landmarks are modelled by hand: Bath Abbey, Pulteney Bridge, the Roman Baths,
  Great Pulteney Street, the Holburne Museum, Prior Park, Sham Castle, the Bell Inn, Twerton Park
  and more.
- **Jobs** on noticeboards round town, a fresh set every day: win pubs back from the Flag Lads,
  hunt Wanted ringleaders, follow treasure trails, race across town and fight off Seagull Attack.
  Races take entries, put the entrants on a grid in the street, run through checkpoints along a
  route drawn on the map, and end with a banner, confetti and a fanfare over the line.
- **Getting about**: bikes, boards, trolleys and a pogo stick with tricks and grinds (Shift on a kerb or
  low wall to grind; the way you hold the stick picks the grind, so a skateboard does 50-50, nosegrind,
  5-0, boardslide and lipslide, and each ride has its own names; Space pops you off, Shift in the air
  catches the next one, and a long grind wobbles: tap the opposite way to steady it. Grinds, jumps and
  air tricks chain into one combo with a multiplier, best kept for each ride), ladders up
  any wall, cars to drive, buses to call, narrowboats and working locks on the canal, a cable car,
  hot air balloons at dawn, and trains, one of which takes you down the valley to Bradford-on-Avon (it opens its doors on the
  platform side; the others stop with them shut, "Not in service" on the boards). Go to a pub, in the pause menu, takes you to any of about a hundred.
- **Trouble**: naughty boys, cat swarms, Bendy after dark, and paintball (or `?gore=1`) for
  everyone else. Paint splats stay on whoever you hit, and go where they go.
- **Always there**: climb Bath Abbey for the angel's wings (or type HEAVEN), take penalties and kicks on any pitch,
  build Kingswood's bonfire for a night of fireworks (with prefects on your back), and earn daft
  things to wear in the wardrobe.
- **Under Combe Down**, a co-op dungeon crawl in the stone mines (`web/mines.html`), and
  **COMBE DOWN WITH ME**, a co-op cooking game in the Darling Deli (`web/deli.html`). Both have a
  door in the street.

## Run it

```sh
cd web
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck and build: the check before merging
```

Add `?net=local` to the URL to link tabs in one browser instead of using WebRTC (handy for
testing). More address options are listed in [docs/playing.md](docs/playing.md#address-options).

Every push to `main` builds the game and publishes it to GitHub Pages
(`.github/workflows/pages.yml`; Settings → Pages → Source: GitHub Actions).

`python3 -I tools/build_single.py web out.html [map]` makes one self-contained HTML file with one
map inline (Combe Down unless you name another), for solo practice only.

## Play counts

If whoever put the game online has switched it on, the game sends anonymous play counts so they can
see roughly how many people play, for how long, on which map and in which mini-games, and how big
the rooms get. It sends a random number kept in your browser (not your name), a random number for
each tab, whether you are on a phone, tablet or computer, the map, the game's version, and when a
race, ball or the mines start and stop. The host of a room also sends how many are in it, with the
room's code scrambled so it can't be read back. It never sends names, chat, voice, where you are or
your address. Add `?telemetry=0` to the address to turn it off; the game remembers. Builds that
aren't set up for it (your own copy, for one) send nothing at all.

## Rebuild a map

Bath is one map, built in full-detail squares about a kilometre across (`tools/prep_tiles.py`).
The game loads a small file about the map as a whole (`web/public/maps/combe-down.json`), streams
in the squares round the player, and lays a lighter whole-city file underneath for the minimap and
anywhere a square isn't loaded yet.

Everything the map is built from is kept in `data/combe-down/` (`tools/mapdata.py`), so it rebuilds
from a fresh clone with nothing to download, byte for byte the same map everyone else gets. It
needs Python 3 with numpy, shapely and Pillow:

```sh
pip3 install numpy shapely pillow scipy scikit-image
MAP=combe-down
python3 -I tools/mapdata.py unpack $MAP        # the repository's copy -> data/raw/$MAP/wide
# the canal and railways first: the squares cut the ground to the levels these work out
python3 -I tools/canal.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-canal.json
python3 -I tools/railway.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-rail.json
python3 -I tools/prep_tiles.py $MAP data/raw/$MAP/wide web/public/maps/$MAP --force
python3 -I tools/prep_wide.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-wide.json
python3 -I tools/pubs.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-pubs.json
python3 -I tools/ground_kinds.py $MAP
```

That takes about 5 minutes on four cores, and a second run only rebuilds the squares whose data or
tools have changed. On GitHub, the "Rebuild the map" workflow (Actions tab, Run workflow) does the
same across ten machines, commits the map files and redeploys the game.

A change to what is measured from the lidar or the canopy (`tools/lidar.py`, `tools/canopy.py`,
`buildings.roof_parts`) needs the raw data again. Fetch it from the public sources (about 2.5 GB,
plus the energy certificates by hand), add `--measure` to the `prep_tiles.py` and `prep_wide.py`
steps, then pack it back:

```sh
pip3 install overturemaps rasterio scipy scikit-image
python3 -I tools/fetch.py $MAP                  # -> data/raw/$MAP/wide (see the top of fetch.py)
# ... the build above, with --measure on prep_tiles.py and prep_wide.py ...
python3 -I tools/mapdata.py pack $MAP data/raw/$MAP/wide
```

With only the lidar and canopy fetched (`tools/fetch.py $MAP --only lidar,canopy`, after
`mapdata.py unpack`), the same `--measure` builds measure afresh from the data already in the
repository.

Each map's centre, size and character areas are in `tools/area.py`. To make a map of somewhere
new, follow [docs/new-area.md](docs/new-area.md): every download (lidar and canopy included),
where it goes, the build, and landmark packs. A map with no wide area is one file, built with
`python3 -I tools/prep_map.py $MAP data/raw/$MAP web/public/maps/$MAP.json`.

Two other maps are set up but left out of the main menu: Royal Victoria Park (in `tools/area.py`;
build it and add it back to `web/src/maps.ts` to try it) and Hackney, a kilometre round the
Pembury Tavern in east London, which has its own page, `pembury.html`.

## Play your own street

Any place can be a map. `python3 -I tools/new_area.py add "Your Town" --radius 1500` finds it and
puts it on the menu, and `python3 -I tools/new_area.py build your-town` downloads the open map data
and builds it, which takes a quarter of an hour or so on a laptop. Then `cd web && npm run dev` and
open `?map=your-town`. It works for anywhere in England, whose lidar gives the real roofs (not Wales, Scotland or abroad
yet). [docs/own-area.md](docs/own-area.md) says what you will need installed
and what the script can't do for you. If you use Claude Code, ask it to make a map of your area and
it follows the `new-area` skill.

## Credits

Map data © OpenStreetMap contributors (Open Database Licence), Overture Maps Foundation,
Microsoft. Elevation and building heights contain Environment Agency data © Crown copyright (Open
Government Licence); terrain tiles by Mapzen (Amazon Terrain Tiles). Tree canopy from Meta and
World Resources Institute's High Resolution Canopy Height Maps (CC BY 4.0). Wall materials from
Energy Performance Certificate data (Open Government Licence) located with OS Open UPRN, which
contains OS data © Crown copyright and database right. Food hygiene ratings from the Food Standards
Agency (Open Government Licence). The copy of the map data in `data/` is shared under the same
terms (see `data/combe-down/README.md`, which also says where each part comes from).

Multiplayer runs over WebRTC with [Trystero](https://github.com/dmotz/trystero).

Eric's oak, up on Bathampton Down, is in memory of our friend Eric Benjamin Holmes.
