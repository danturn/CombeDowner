import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Relative base so the build works from any path (GitHub Pages serves it under /<repo>/).
// Two pages: the game (index.html) and the mines (mines.html). The single-file build
// (tools/build_single.py) is the game alone, so it gets no shared chunks to inline.
const single = process.env.VITE_SOLO_ONLY === "1";
export default defineConfig({
  base: "./",
  build: {
    target: "es2022", chunkSizeWarningLimit: 1200,
    rollupOptions: single ? {} : { input: { main: fileURLToPath(new URL("index.html", import.meta.url)), mines: fileURLToPath(new URL("mines.html", import.meta.url)) } },
  },
});
