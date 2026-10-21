# What a streamed square draws, and what could be merged or skipped

Measured on `spencer/main` (8ab3a44), headless Chrome on this Mac, 1280x720, three.js 0.180. The Mac
was busy (load average 10 to 14, about 40 to 60 per cent idle), so frame rates mean nothing here.
Draw counts do not depend on load.

## What the numbers are

- A built square (about 1,040 m a side) holds 1,000 to 1,400 scene objects. If everything were
  switched on it would be **2,000 to 3,000 draw units** and 0.9 to 1.5 million triangles. A "draw unit" is
  a mesh, or one material group of a mesh with an array of materials: three.js draws each group on its own.
  (The 1,055 meshes and 2.27 M triangles quoted fit this; the exact figure moves from square to square.)
- Most of that is switched off at any moment (hidden by distance, or an instanced mesh with `count = 0`).
  What the camera really issues, with 5 to 9 squares loaded, is **390 to 620 main-pass draws and 70 to
  125 shadow draws**. So the saving is in the draws a view pays for, not in the built total.
- Main-pass draws a frame, averaged over four headings (N, E, S, W):

| group (name from `mark()` in `world.ts`) | town (-1500,1500) | Southgate (-960,1790) | village (0,0) | what a square builds |
|---|---|---|---|---|
| buildings | 95 | 71 | 74 | 29 to 37 meshes: 4 chunks x up to 7 materials |
| roads | 53 (545k tris) | 57 (475k) | 46 (340k) | 9 meshes, 9 materials |
| furniture | 55 | 79 | 63 | about 960 units of boxed signs, about 300 instanced |
| landmarks-tunnels | 49 | 34 | 27 | 28 to 51 meshes, each with its own material |
| trees | 42 | 31 | 62 | 400 to 520 instanced meshes, most hidden |
| ground | 21 (320k tris) | 19 | 21 | 10 fine meshes |
| walls-fences | 21 | - | 18 | 63 to 88 meshes |
| doors-bays | 20 | - | 24 | 430 to 540 instanced meshes, most hidden |
| unnamed: grass cells | about 40 | 10 to 15 | - | a pool of about 110 hidden cells |
| unnamed: pickups, props, vehicles, people | 80 | 93 | 85 | moving things |

### Detail levels and distance culling that already exist

- `Culler` (`cull.ts`, one per square, checked four times a second): doors 150 m and bays 170 m
  (`world.ts:1342,1374`), fences and railings 230 m (`world.ts:1235`), shop fronts 160 m
  (`furniture.ts:651`), signs and bus plates 120 m (`furniture.ts:456,471`), other furniture 200 m,
  lamps `LAMPS_FAR` 260 m (`view.ts:40`), pitches 300 to 420 m (`pitches.ts:50-196`), woods
  `view.sceneryFar` (`world.ts:1315`).
- Trees (`trees.ts`): 200 m patches; crowns at two levels (50 and 140 m), then flat pictures to about
  480 m; an unused level is hidden. Grass is 8 m cells within 42 m of the player (`grass.ts:65`).
- `SIMPLER_FAR = 850` (`view.ts:52`, used at `world.ts:1443-1458`): a square more than 850 m away swaps its 10
  fine ground meshes for one 12 m grid mesh and hides footpaths. At the default draw distance
  (fog 900 m, squares built to 980 m) that is only the last 130 m, so it hardly ever applies.
- Buildings, roads and landmarks have no culler: they are drawn all the way to the fog.
- `stayPut()` (`world.ts:177`) already stops matrix updates for a square's scenery.

## Recommendations, by draws saved for effort

### (a) Merge

1. **Street name signs and bus-stop plates cost 6 draws each; 2 would do.** `furniture.ts:451-471` makes a
   `BoxGeometry` with an array of six materials, and three.js draws each face group separately, even
   though four faces use `edge` and two use the same plate. Rewrite the geometry groups (faces 0-3 as
   one group, then the two plate faces as one) and 6 draws become 2 or 3. In town that is about 11
   draws, at Southgate about 46 of the 79 furniture draws, so **15 to 30 saved at busy spots**. A
   handful of lines. Later: merge each 250 m cell's signs into one mesh with a canvas atlas.
2. **Grass: about 40 draws on open ground, one mesh per 8 m cell** (`grass.ts:146,196`). Use 24 m cells
   (about 10 meshes in the 42 m radius) or one pooled mesh refilled as the player moves. The shader
   already fades by distance. **25 to 35 saved** in parks and gardens. Cost: a cell holds up to 256 tufts
   of 22 triangles today, so bigger cells refill slower when the player crosses a cell edge.
3. **Landmarks: merge across landmarks, per square.** `landmarks/index.ts:86-113` calls `mergeStatic`
   (`kit.ts:177`) on each landmark on its own, so a square keeps 28 to 51 landmark meshes, each with its own
   material (51 meshes and 51 materials in one square). After the loop, gather the parts, group them by the
   `keyOf` look test (`kit.ts:130`), and bake colour into vertex colours, as the kit already does inside a landmark.
   Expect 50 down to about 15 a square: **20 to 30 draws saved** in view. Leave set pieces and anything
   with `userData.moves`, the Abbey's angels or a glow `onBeforeRender` alone.
4. **Buildings: windowed and plain walls are separate meshes.** `world.ts:1118-1130` builds `<surface>w` and
   `<surface>p` for stone, brick and render, plus a roof: up to 7 meshes in each of 4 chunks. Putting the window
   and plain wall in one texture atlas (or a vertex attribute) gives 4 per chunk: **25 to 35 draws saved**
   (about 40 per cent of 71 to 95). Medium effort: the textures and the `litWindows` shader (`world.ts:203`) change.
5. **Roads: 9 meshes with 9 materials a square** (`world.ts`, roads block ending at mark 901). Few draws but
   the most triangles of any group (see b.2). Merging materials is not worth the effort.

### (b) Skip or simplify further away

1. **Bring `SIMPLER_FAR` in from 850 m to about 400 to 450 m.** The 10 fine ground meshes (152k tris a
   square) become one coarse mesh of about 8k, and footpaths and pavements go. At the default
   distance this makes a real band of squares simpler. **About 20 draws and 300k tris** in a typical view.
   One constant, but look for gaps at square seams.
2. **Roads, far:** the 9 road meshes are 100 to 130k tris a square and the biggest triangle cost in view.
   Past about 450 m, drop kerb detail, markings and the lighter paths, as is done for footpaths. Few draws
   saved, 150 to 250k tris.
3. **Landmarks and buildings have no culler.** After a.3, give each square's landmark meshes a `Culler`
   entry at `view.sceneryFar`, and let small landmarks drop out past about 500 m. A few draws, 20 to 30k tris.
4. **Shadows: 70 to 125 draws a frame.** Furniture is the largest (21 to 33), then walls-fences, buildings
   and trees. Every furniture mesh casts (`furniture.ts:375`); bins, benches and bollards beyond about 60 m
   need not. **15 to 25 shadow draws saved**; needs a quick look that nothing visible loses its shadow.

### (c) Surprises

- **Draw units are not meshes.** Boxes with six materials are the only large case, and are only paid for
  within 120 m.
- **A square keeps a lot of dead weight:** about 110 pooled grass meshes, and 400 to 500 tree and door meshes
  at `count = 0` or hidden. They cost no draws, but the scene holds 9,000 to 12,000 meshes in all (1,150 to
  1,400 shown) and 1,200 to 1,450 geometries, and `Culler.update` and `vegetation.update` walk every item four times
  a second. Worth trimming if the main thread matters; the grass pool could be released when the player is far off.
- **80 to 95 draws a frame are unnamed moving things** (pickups, props, vehicles, people, `RingGeometry`
  markers at 3 to 4 draws each, white `BoxGeometry` at 7 or so). Not traced to single sources. Pickups already use `merged()`.
- **Triangles:** the heaviest parts are the 19 instanced furniture models (320 to 360k tris a square),
  walls-fences (200 to 290k) and ground (153k). If triangles matter after draws, start there.

## How to measure again

```sh
git fetch spencer && git checkout --detach spencer/main && cd web && npm ci && npx vite build
top -l 1 | head -12                       # note the load first
node ../tools/fpsprobe.mjs --out /tmp/probe --spots southgate,town-aerial,combe-down --variants base --secs 2
```

`fpsprobe` prints draws and triangles by kind per spot, for the main and shadow passes. The per-square
census and the per-heading counts above came from scratch scripts outside the repo (the session
scratchpad: `census.mjs`, `census2.mjs`, `draws.mjs`). Each is lines 1 to 93 of `tools/fpsprobe.mjs` (static
server, Chrome with `channel: "chrome"` and `--mute-audio`, solo game) plus a hold on the camera at
`AT_SPOT="east,north,0,0"`, then either a walk over each scene child counting meshes and material
groups (`census*.mjs`; `census2` also counts hidden ones) or a wrapper on `renderer.renderBufferDirect`
over two frames at headings 0, 90, 180 and 270 (`draws.mjs`).
