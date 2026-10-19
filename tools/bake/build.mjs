// Bundles tools/bake/entry.ts for Node, stubbing the Vite-only worker import (the baker never
// loads a square in the game, so the real worker is not needed). Run it, then the bundle:
//   node tools/bake/build.mjs && BAKE_WEB=web node tools/bake/bake.mjs 1_1
// Bundle the baker for Node, stubbing the Vite-only worker import (the baker never loads squares).
import * as esbuild from "../../web/node_modules/esbuild/lib/main.js";
const stub = {
  name: "worker-stub",
  setup(build) {
    build.onResolve({ filter: /\?worker(&inline)?$/ }, () => ({ path: new URL("./worker-stub.js", import.meta.url).pathname, namespace: "file" }));
  },
};
await esbuild.build({
  entryPoints: [new URL("./entry.ts", import.meta.url).pathname],
  bundle: true, platform: "node", format: "esm",
  outfile: new URL("./bake.mjs", import.meta.url).pathname, plugins: [stub], logLevel: "error",
  absWorkingDir: new URL("../../web", import.meta.url).pathname,
  // (the entry lives outside web/, so the game's node_modules must be searched for its imports)
  nodePaths: [new URL("../../web/node_modules", import.meta.url).pathname],
  external: ["fs", "path", "url", "perf_hooks"],
});
console.log("bundled ok");
