# Baking a square's scenery at build time: tried and dropped

This is the prototype for step 5 of `docs/plans/fps-round2.md`. It works, and it is kept so nobody
builds it again: the geometry is far too big to ship. See the note at step 5 in that plan.

What it does: builds one square's scenery outside the browser (Node, with the game's own builders and
the canvas textures stubbed), and reports the size of what came out.

```sh
node tools/bake/build.mjs                                  # bundle the baker for Node
BAKE_WEB=web node tools/bake/bake.mjs 1_1                  # bake square 1,1
```

For square `1_1`: 2.3 MB of JSON in, 81.5 MB of geometry out, in about 480 ms. That is ~35x, over
131 squares, to save 0.3–0.5 s a square. Not worth it.

`build.mjs` stubs the Vite-only worker import (`parsesquare.worker?worker&inline`), because the baker
never loads a square in the game.
