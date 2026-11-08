// Gaps smashed through hedges and fences. Drive into a hedge or a garden fence fast enough and you go
// straight through it, leaving a hole a car wide; five minutes later it's been mended (menders.ts
// sends an old couple round to do it, grumbling). Walls, railings and gates are too solid for that.
//
// Every gap is a spot on the ground (scene x, z): the hedges and fences drawn there have a round hole
// cut out of them (the breakable ones are drawn with their own copy of the material, which leaves out
// anything within GAP_R of a gap, so nothing else needs rebuilding), and the same stretch stops being
// solid for anyone walking or driving into it (map.ts asks inGap).
//
// Who decides what: whoever smashes through says so (game.ts sends "hgb" to everyone), and each player
// mends each gap by their own clock, five minutes after they heard of it. Someone joining later doesn't
// hear of the gaps already there; they find those hedges whole, and solid, until they're mended anyway.
import * as THREE from "three";

/** How far round where it was hit a hedge or fence is smashed away: wide enough for a car to go through. */
export const GAP_R = 1.8;
/** How long a gap lasts before it's been mended, in seconds. */
export const MEND_SECS = 300;
/** The most gaps there are at once: past this, the oldest is mended early. */
const MOST = 32;

/** The kinds of boundary a car goes through, and which of them are leafy. */
export const breakable = (c: string) => /fence|hedge/.test(c);
export const leafy = (c: string) => c.includes("hedge");

/** Where a gap is (scene x, z), which way the hedge or fence ran through it (a unit ux, uz), when it was made, and whether it's a hedge. */
export interface Gap { x: number; z: number; ux: number; uz: number; at: number; leafy: boolean }
const list: Gap[] = [];
const holes = { value: Array.from({ length: MOST }, () => new THREE.Vector4(0, 0, 0, 0)) };
let version = 0;

/** The gaps there are now, oldest first. */
export const gaps = (): readonly Gap[] => list;
/** Goes up each time a gap is made or mended. */
export const gapsVersion = () => version;

function upload() {
  holes.value.forEach((h, k) => { const g = list[k]; if (g) h.set(g.x, g.z, GAP_R, 0); else h.set(0, 0, 0, 0); });
  version++;
}

/** A gap smashed at scene (x, z) in a hedge or fence running (ux, uz), at time at (seconds, performance.now's). False if there's one there already. */
export function addGap(x: number, z: number, ux: number, uz: number, at: number, isLeafy: boolean): boolean {
  if (![x, z, ux, uz].every(Number.isFinite) || list.some((g) => Math.hypot(g.x - x, g.z - z) < GAP_R * 0.5)) return false;
  const l = Math.hypot(ux, uz) || 1;
  if (list.length >= MOST) list.shift();
  list.push({ x, z, ux: ux / l, uz: uz / l, at, leafy: isLeafy });
  upload();
  return true;
}

/** Mend every gap that's been there long enough (now: seconds, performance.now's). */
export function mendGaps(now: number) {
  let n = 0;
  while (list.length && now - list[0].at >= MEND_SECS) { list.shift(); n++; }
  // (they come in order, nearly: one heard late can be younger than the next)
  for (let k = list.length - 1; k >= 0; k--) if (now - list[k].at >= MEND_SECS) { list.splice(k, 1); n++; }
  if (n) upload();
}

/** Whether scene (x, z) is in a gap. */
export function inGap(x: number, z: number): boolean {
  for (const g of list) if ((g.x - x) ** 2 + (g.z - z) ** 2 < GAP_R * GAP_R) return true;
  return false;
}

// ---- drawing -----------------------------------------------------------------------------------
/** Cut the gaps out of a material: anything drawn within GAP_R of one, from the side, isn't drawn. */
function cut<M extends THREE.Material>(m: M): M {
  const was = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (shader, r) => {
    was(shader, r);
    shader.uniforms.uGaps = holes;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGapAt;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvGapAt = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec2 vGapAt;\nuniform vec4 uGaps[${MOST}];`)
      .replace("void main() {", `void main() {\n  for (int i = 0; i < ${MOST}; i++) { vec4 g = uGaps[i]; if (g.z > 0.0 && distance(vGapAt, g.xy) < g.z) discard; }`);
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + "|gaps";
  return m;
}

const made = new Map<THREE.Material, { m: THREE.Material; depth: THREE.Material }>();
/** The breakable hedges' and fences' copy of a material (one per material, shared), and its shadow's. */
export function holed(m: THREE.Material): { m: THREE.Material; depth: THREE.Material } {
  let h = made.get(m);
  if (!h) {
    const src = m as THREE.MeshLambertMaterial;
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: src.alphaTest > 0 ? src.map : null, alphaTest: src.alphaTest });
    const c = m.clone();
    c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;   // (a clone doesn't keep them)
    made.set(m, (h = { m: cut(c), depth: cut(depth) }));
  }
  return h;
}
