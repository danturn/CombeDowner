import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

// Relative base so the build works from any path (GitHub Pages serves it under /<repo>/).
// Three pages: the game (index.html), the mines (mines.html) and the deli (deli.html). The single-file build
// (tools/build_single.py) is the game alone, so it gets no shared chunks to inline.
// The game's version is when it last changed: the last commit on main to touch web/. So pushes that
// only change the docs or the to-do list don't tell everyone playing that there's a new version.
// (Falls back to now if git can't say.)
const BUILD = (() => {
  try { return Number(execSync("git log -1 --first-parent --format=%ct -- .", { cwd: fileURLToPath(new URL(".", import.meta.url)) }).toString().trim()) * 1000 || Date.now(); }
  catch { return Date.now(); }
})();
const single = process.env.VITE_SOLO_ONLY === "1";
// When a link to a player drops, Trystero can look for them again straight away, but its Nostr
// signalling doesn't ask it to, so they only find each other at the next announcement, up to a
// minute later. This switches that on (net.ts). If a Trystero update changes the line, the build says so.
const REANNOUNCE_FROM = "const nextAnnounce = (nextAnnounceMs) => ({ nextAnnounceMs });";
const REANNOUNCE_TO = "const nextAnnounce = (nextAnnounceMs) => ({ nextAnnounceMs, reannounceOnDisconnect: true });";
const reannounce = {
  name: "nostr-reannounce", enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!/@trystero-p2p[\\/]nostr[\\/]dist[\\/]index\.mjs/.test(id)) return null;
    if (!code.includes(REANNOUNCE_FROM)) { this.warn("Trystero's Nostr code has changed: dropped players won't be looked for straight away (vite.config.ts)"); return null; }
    return { code: code.replace(REANNOUNCE_FROM, REANNOUNCE_TO), map: null };
  },
};
export default defineConfig({
  base: "./",
  // when the game last changed, so players on an old page can be told to refresh (net.ts)
  define: { __BUILD__: String(BUILD) },
  // version.json says which version is live, for anyone who wants to check by hand
  plugins: [reannounce, { name: "version", generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD }) }); } }],
  // so the change above applies in `npm run dev` too, which otherwise pre-packs Trystero untouched
  optimizeDeps: { exclude: ["trystero", "@trystero-p2p/nostr"] },
  build: {
    target: "es2022", chunkSizeWarningLimit: 1200,
    rollupOptions: single ? {} : { input: { main: fileURLToPath(new URL("index.html", import.meta.url)), mines: fileURLToPath(new URL("mines.html", import.meta.url)), deli: fileURLToPath(new URL("deli.html", import.meta.url)) } },
  },
});
