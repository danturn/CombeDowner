# Combe Downer

A multiplayer first-person shooter in the browser, set in Bath. Each map is a circle inside a force
field, built from real open data: Overture Maps buildings, roads, walls, woods and water, on
Environment Agency lidar terrain.

- **Combe Down**: 2 km across, around the Hadley Arms.
- **Royal Victoria Park**: 1.2 km across, from the Great Dell at the park's west end to the Circus,
  with the Royal Crescent, Brock Street and the Avon.

Multiplayer is peer to peer (WebRTC via [Trystero](https://github.com/dmotz/trystero)): one player
picks a map, creates a room and shares the link, and browsers connect directly. There is no game
server. Entering a room code joins the game in that room on its map; if nobody is playing there,
you host it on the map you picked.

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
