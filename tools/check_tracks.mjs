// Check soundtrack track files: node tools/check_tracks.mjs web/src/tracks/some-track.ts [...]
// Each file must load without errors (defineTrack checks the notation) and pass the range checks below.
import { build } from "../web/node_modules/esbuild/lib/main.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "tracks-"));
let bad = 0;
for (const file of process.argv.slice(2)) {
  const out = join(dir, `t${Math.random().toString(36).slice(2)}.mjs`);
  try {
    await build({ entryPoints: [resolve(file)], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error" });
    const t = (await import(pathToFileURL(out).href)).default;
    const problems = [];
    for (const [name, r] of Object.entries(t.riffs)) {
      for (const bar of r.guitar) for (const h of bar) {
        const root = 40 + t.key + h.off;
        if (root < 35 || root > 67) problems.push(`${name}: chord root MIDI ${root} is outside 35-67`);
      }
      for (const bar of r.lead ?? []) for (const n of bar) {
        if (n.midi < 59 || n.midi > 91) problems.push(`${name}: lead note MIDI ${n.midi} is outside 59-91 (b4 to g6)`);
      }
      if (r.guitar.every((b) => b.length === 0)) problems.push(`${name}: guitar is empty`);
    }
    const riffs = Object.keys(t.riffs).length;
    const leads = Object.values(t.riffs).filter((r) => r.lead).length;
    if (riffs < 4) problems.push(`only ${riffs} riffs (need at least 4)`);
    if (leads < 2) problems.push(`only ${leads} riffs with a lead (need at least 2)`);
    if (problems.length) { bad++; console.log(`FAIL ${file} (${t.name})\n  ${[...new Set(problems)].join("\n  ")}`); }
    else console.log(`ok   ${file}: "${t.name}", ${t.bpm} bpm, key ${t.key}, ${riffs} riffs, ${leads} with leads`);
  } catch (e) { bad++; console.log(`FAIL ${file}\n  ${e.message}`); }
}
rmSync(dir, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
