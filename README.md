# Combe Downer

A multiplayer first-person shooter in the browser, set in Bath. Each map is a circle inside a force
field, built from real open data: Overture Maps buildings, roads, walls, woods and water, on
Environment Agency lidar terrain.

- **Combe Down**: 2 km across, around the Hadley Arms.

A second map, Royal Victoria Park, is set up in `tools/area.py` but left out of the game for now:
build it as below and add it back to `web/src/maps.ts` to try it.

Chavs hang about the streets in gangs. Get spotted and they chase you: they're faster than a walk
but slower than a sprint, and they give up if you get far enough away or out of sight. If they
catch you they hit you. Shooting anyone, player or chav, splashes blood on the ground, and they
leave bloody footprints while they bleed.

You start with a rifle and 120 spare rounds. Keys 1, 2 and 3 pick your fists, the rifle and the
sniper rifle, and right click toggles aiming. The one sniper rifle sits in the middle of Firs
Field: 10-round magazines, a bolt to work between shots and a scope that sways. Pints outside the Hadley
Arms, the King William and the Prior Park portico give back 40 health, and a bottle of Co-op Bucks
Fizz outside the Nisa Local fills you right up. Tins of rifle rounds and boxes of sniper rounds
turn up at random spots on the streets, and chavs sometimes drop a pint, a bottle or some rounds.
Picking up a second sniper rifle, a tin or a box adds a spare magazine. Run dry and it's fists.

Online games have voice chat. Your mic is open to players nearby: they hear you in 3D from where
you stand, fading out by 60 m. Hold V (or the Radio button on touch screens) to talk to everyone
in the room on the radio, through a crackly walkie-talkie filter with a squelch and an "over" beep.
The browser asks for the microphone as you join, and you can mute it from the pause menu.

The sound effects and the soundtrack (procedural 90s-shooter metal, `web/src/music.ts`) are
synthesised in the browser, so the game ships no audio files.

The look is a modern take on 90s Build-engine shooters: chunky pixel-art textures drawn in the
browser (`web/src/textures.ts`), leafy swaying trees and shrubs (`web/src/trees.ts`), tufts of grass
with buttercups and daisies around you (`web/src/grass.ts`), and a punchy colour grade with a fine
palette dither over the frame (`web/src/post.ts`). Add `?fx=0` to the URL to turn the grade off.

Multiplayer is peer to peer (WebRTC via [Trystero](https://github.com/dmotz/trystero)): you type a
game name (like `HADLEY`) and press Play. If that game is running you join it, on its map; if not,
you start it on the map you picked. Tell your friends the name, or share the link, and browsers
connect directly. There is no game server.

**Play:** https://spencereholtaway.github.io/CombeDowner/

## Run it

```sh
cd web
npm install
npm run dev          # http://localhost:5173
```

Add `?net=local` to the URL to link tabs in one browser instead of using WebRTC (handy for testing).

## Publish

Every push to `main` builds the game and publishes it to GitHub Pages
(`.github/workflows/pages.yml`; Settings → Pages → Source: GitHub Actions).

## Rebuild a map

```sh
pip3 install overturemaps
MAP=combe-down
mkdir -p data/raw/$MAP && cd data/raw/$MAP
for t in building segment water land_use land land_cover infrastructure; do
  python3 -I ../../../tools/download.py $MAP $t $t.geojson
done
cd ../../..
python3 -I tools/prep_map.py $MAP data/raw/$MAP web/public/maps/$MAP.json
```

Each map's centre, size and local character areas are in `tools/area.py`. To add a map, add it
there and to `web/src/maps.ts`, then build it as above.

## Single-file build

`python3 -I tools/build_single.py web out.html [map]` makes one self-contained HTML file with one
map inline (Combe Down unless you name another). It is solo practice only.

## Credits

Map data © OpenStreetMap contributors, Overture Maps Foundation, Microsoft. Elevation contains
Environment Agency data © Crown copyright (Open Government Licence); terrain tiles by Mapzen.

### Tree canopy (optional)

Trees are placed from Meta / WRI's global canopy height map when a tile is present in
`data/raw/canopy/`. For this map that is the zoom-9 quadkey tile `031313120`:

```sh
mkdir -p data/raw/canopy
curl -o data/raw/canopy/031313120.tif \
  https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/031313120.tif
pip3 install rasterio
```
