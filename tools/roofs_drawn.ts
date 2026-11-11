// The roofs the game draws over each building of a square (web/src/map.ts: hipWhole, then the lidar's
// faces or roofsFit's pitched rectangles over a flat cap), for tools/check_map.py's rule 11 to look at
// pitched roofs as well as the lidar's.
//
// Bundled and run from web/ (check_map.py pipes it to esbuild), so the imports are web/'s.
// Usage: node roofs_drawn.mjs <buildings.json>; prints, for each building in turn, its outline as
// drawn ("r"), its faces where it has them ("rm"), and otherwise its pitched roofs ("p": the
// rectangle, rise and hips of each) and whether a flat cap is drawn under them ("f"), and the metres
// of its outline drawn with no wall ("o", web/src/wallruns.ts).
import { readFileSync } from "fs";
import { hipWhole, roofsFit, type Building } from "./src/map";
import { wallLeftOpen } from "./src/wallruns";

const bl: Building[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = bl.map((b) => {
  hipWhole(b);
  const o = b.r.reduce((sum, ring) => sum + wallLeftOpen(ring), 0);
  if (b.rm) return { r: b.r, rm: b.rm, o };
  const p = roofsFit(b);
  return { r: b.r, p: p.map((x) => ({ q: x.q, rp: x.rp, hp: x.hp })), f: !p.length || p.some((x) => x.wings), o };
});
process.stdout.write(JSON.stringify(out));
