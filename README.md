# Combe Downer

A multiplayer first-person shooter in the browser, set in Combe Down, Bath. The map is a circle
2 km across around the Hadley Arms, inside a force field, built from real open data: Overture Maps
buildings, roads, walls, woods and water, on Environment Agency lidar terrain.

Multiplayer is peer to peer (WebRTC via [Trystero](https://github.com/dmotz/trystero)): one player
creates a room and shares the link, and browsers connect directly. There is no game server.

**Play:** https://spencereholtaway.github.io/CombeDowner/

## Run it

```sh
cd web
npm install
npm run dev          # http://localhost:5173
```

Add `?net=local` to the URL to link tabs in one browser instead of using WebRTC (handy for testing).

## Publish

GitHub Pages serves the `docs` folder on `main` (Settings → Pages → Deploy from a branch → main, /docs).
After changing the game, rebuild that folder and commit it:

```sh
cd web
npm run publish      # builds the game into ../docs
```

## Rebuild the map

```sh
pip3 install overturemaps
mkdir -p data/raw && cd data/raw
for t in building segment water land_use land land_cover infrastructure; do
  python3 -I ../../tools/download.py $t $t.geojson
done
cd ../..
python3 -I tools/prep_map.py data/raw web/public/map.json
```

The map centre and size are in `tools/area.py`.

## Single-file build

`python3 -I tools/build_single.py web out.html` makes one self-contained HTML file with the map
inline. It is solo practice only.

## Credits

Map data © OpenStreetMap contributors, Overture Maps Foundation, Microsoft. Elevation contains
Environment Agency data © Crown copyright (Open Government Licence); terrain tiles by Mapzen.
