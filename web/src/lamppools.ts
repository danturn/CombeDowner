// The street lamps' pools of light, painted on far off. Only a few lamps round you really light the
// street after dark (world.ts), as every real light costs every lit pixel something. Past them, so
// that the town still looks lit from the drone and from up on the hills, every lamp's pool of light
// is painted onto one picture of the ground round you, seen from above: how much light falls on
// each spot, and how high the lamp over it is. The ground, roads, pavements, walls, fences and
// bridges (whichever materials lampLit is given) read that picture and are lit by it, as a real
// lamp would light them: the ground under it most, walls less, and nothing higher than the lamp's
// head, so roofs stay dark. It fades in just past the lamps that are really lit, so the two don't
// light one place twice, and costs the same however many lamps there are. Far off it's made
// brighter than a real lamp would and shows through the fog a little, so the town reads as lit.
//
// The picture is painted afresh, a few hundred lamps a frame, when you've moved some way from where
// it was centred or squares of Bath have come and gone, and swapped in once it's done. How big it is
// and how fine (the Street lights setting: view.ts) sets how far the pools reach.
//
// Nothing here goes over the network: each player's machine paints its own.
import * as THREE from "three";
import { LIGHT_LEVELS, lightLevel } from "./view";

/** The street lamps' light, as world.ts makes it: its colour, strength (candela), reach and fall-off. */
export const LAMP_COLOUR = "#ffc77a", LAMP_POWER = 70, LAMP_REACH = 28, LAMP_DECAY = 1.4;
/** How high a lamp's head is over the ground under it, metres (furniture.ts). */
const HEAD = 6;
/** The most light the picture holds on a spot: a little more than right under one lamp. */
const MOST = 8;

/** A picture n dots across (a new one for each size: the graphics card's copy can't change size). */
function picture(n: number) {
  const t = new THREE.DataTexture(new Uint8Array(n * n * 2), n, n, THREE.RGFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = n > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = n > 1; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
const U = {
  poolMap: { value: picture(1) },
  /** The picture's centre (scene x, z), one over its width in metres, and 1 when it's in use. */
  poolBox: { value: new THREE.Vector4(0, 0, 1, 0) },
  /** The height the picture's lowest lamp head stands for, and metres a step. */
  poolHeight: { value: new THREE.Vector2(0, 1) },
  /** The lamps' colour times how dark it is, and the light the picture's fullest spot stands for. */
  poolColour: { value: new THREE.Color() },
  /** Where the pools start to fade in from you, and where they're full, metres. */
  poolNear: { value: new THREE.Vector2(60, 100) },
  /** How much brighter they get far off, and how much of that the fog lets through. */
  poolFar: { value: new THREE.Vector2(1, 0) },
};

const VERT_DECL = "varying vec3 vPoolAt;";
const VERT = `vec4 poolAt = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  poolAt = instanceMatrix * poolAt;
#endif
  vPoolAt = (modelMatrix * poolAt).xyz;`;
const FRAG_DECL = `varying vec3 vPoolAt;
uniform sampler2D poolMap; uniform vec4 poolBox; uniform vec2 poolHeight, poolNear, poolFar; uniform vec3 poolColour;`;
// (BRDF_Lambert and material are what three's Lambert lighting uses, so the pools light it the same way)
// Far off they're brighter than a real lamp would make them (poolFar.x times, from 500 m on), so
// they still read through the haze and the picture's blurrier far-off copies, and some of them
// (poolFar.y) shows through the fog, as lit streets do on a misty night.
const FRAG = `vec3 poolOut = vec3(0.0);
  if (poolBox.w > 0.0) {
    vec2 puv = (vPoolAt.xz - poolBox.xy) * poolBox.z + 0.5;
    vec2 pe = min(puv, 1.0 - puv);
    float pedge = smoothstep(0.0, 0.04, min(pe.x, pe.y));
    float pnear = smoothstep(poolNear.x, poolNear.y, distance(vPoolAt.xz, cameraPosition.xz));
    if (pedge * pnear > 0.0) {
      vec2 pt = texture2D(poolMap, puv).rg;
      float above = poolHeight.x + pt.y * 255.0 * poolHeight.y - vPoolAt.y;
      float up = inverseTransformDirection(geometryNormal, viewMatrix).y;
      float pgain = mix(1.0, poolFar.x, smoothstep(poolNear.y, poolNear.y + 500.0, distance(vPoolAt, cameraPosition)));
      float pf = pedge * pnear * pgain * smoothstep(-0.5, 1.0, above) * mix(0.35, 1.0, max(up, 0.0));
      poolOut = poolColour * (pt.x * pf) * BRDF_Lambert(material.diffuseColor);
      reflectedLight.directDiffuse += poolOut;
    }
  }`;
const FOG = `#ifdef USE_FOG
  gl_FragColor.rgb += poolOut * fogFactor * poolFar.y;
#endif`;

const done = new WeakSet<THREE.Material>();
/** Let the painted pools light material m (a Lambert one), from now on. Call it before m is first drawn. */
export function lampLit<M extends THREE.Material>(m: M): M {
  if (done.has(m) || !(m as unknown as THREE.MeshLambertMaterial).isMeshLambertMaterial) return m;
  done.add(m);
  const was = m.onBeforeCompile, ownKey = m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? m.customProgramCacheKey : null;
  m.onBeforeCompile = function (this: THREE.Material, sh, r) {
    was.call(this, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\n${VERT_DECL}`)
      .replace("#include <project_vertex>", `#include <project_vertex>\n  ${VERT}`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\n${FRAG_DECL}`)
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n  ${FRAG}`)
      .replace("#include <fog_fragment>", `#include <fog_fragment>\n  ${FOG}`);
  };
  // (three tells shaders apart by this: the material's own, or the code it was put together with)
  m.customProgramCacheKey = function (this: THREE.Material) { return (ownKey ? ownKey.call(this) : was.toString()) + "|pools"; };
  return m;
}

/** The light a lamp head throws on level ground r metres from the foot of it, as a real one does (three's point light). */
function fall(r: number) {
  const d = Math.hypot(r, HEAD);
  const win = Math.max(0, 1 - (d / LAMP_REACH) ** 4);
  return LAMP_POWER / Math.max(d ** LAMP_DECAY, 0.01) * win * win * (HEAD / d);
}

/**
 * The painted pools, for one world. lamps(x, z, r): every lamp head (scene x, y, z in threes) within
 * about r of scene (x, z), in as many lists as it likes; squares(x, z, r): something that changes
 * when the squares of Bath there do.
 */
export class LampPools {
  private job: Generator<void> | null = null; private jobFor = "";
  private cx = NaN; private cz = NaN; private size = 0; private step = 0;
  private sig = ""; private sigT = 0; private since = 0;
  private colour = new THREE.Color(LAMP_COLOUR);

  constructor(private lamps: (x: number, z: number, r: number) => ArrayLike<number>[], private squares: (x: number, z: number, r: number) => string) {}

  /** Each frame: night 0 to 1, where you are, and how far off the lamps really lighting the street reach. */
  update(night: number, px: number, pz: number, lit: number, dt: number) {
    const l = LIGHT_LEVELS[lightLevel];
    U.poolColour.value.copy(this.colour).multiplyScalar(night * MOST);
    U.poolNear.value.set(lit + 5, lit + 45);
    U.poolFar.value.set(l.gain, l.pierce);
    this.since += dt;
    const on = night > 0.01 && l.pools > 0;
    if (!on) { U.poolBox.value.w = 0; if (!l.pools) this.drop(); return; }
    const span = l.pools * l.step;
    // paint afresh: for another setting, once you're an eighth of the way to the edge, or when the squares round you change
    let again = l.pools !== this.size || l.step !== this.step || Math.hypot(px - this.cx, pz - this.cz) > span / 8;
    if ((this.sigT -= dt) <= 0) {
      this.sigT = 1;
      const s = this.squares(px, pz, span * 0.71);
      if (s !== this.sig && this.since > 2) { this.sig = s; again = true; }
    }
    // (one painting at a time, unless the setting's changed under it)
    const want = `${l.pools}:${l.step}`;
    if (again && (!this.job || want !== this.jobFor)) { this.job = this.paint(px, pz, l.pools, l.step); this.jobFor = want; }
    if (this.job && this.job.next().done) this.job = null;
    U.poolBox.value.w = this.size ? 1 : 0;
  }

  private drop() {
    if (!this.size) return;
    this.size = 0; this.job = null; this.cx = NaN;
    U.poolMap.value.dispose();
    U.poolMap.value = picture(1);
  }

  private *paint(px: number, pz: number, n: number, step: number): Generator<void> {
    this.since = 0;
    const half = n * step / 2, x0 = px - half, z0 = pz - half;
    const heads: number[] = [];
    for (const l of this.lamps(px, pz, half * 1.42)) for (let i = 0; i + 2 < l.length; i += 3) {
      if (l[i] < x0 - LAMP_REACH || l[i] > x0 + 2 * half + LAMP_REACH || l[i + 2] < z0 - LAMP_REACH || l[i + 2] > z0 + 2 * half + LAMP_REACH) continue;
      heads.push(l[i], l[i + 1], l[i + 2]);
    }
    yield;
    let lo = Infinity, hi = -Infinity;
    for (let i = 1; i < heads.length; i += 3) { lo = Math.min(lo, heads[i]); hi = Math.max(hi, heads[i]); }
    if (!heads.length) lo = hi = 0;
    const base = lo - 2, per = Math.max(0.5, (hi - lo + 4) / 254);
    // light and lamp height, a byte each; where no lamp shines the height is the top, so that, blurred
    // into the picture's smaller copies (seen from far off), it never darkens a lit spot beside it
    const data = new Uint8Array(n * n * 2);
    for (let i = 1; i < data.length; i += 2) data[i] = 255;
    yield;
    // one lamp's pool, in dots out from its foot (the same for every lamp at this step)
    const R = Math.ceil(LAMP_REACH / step), W = 2 * R + 1, pool = new Float32Array(W * W);
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) pool[(j + R) * W + i + R] = fall(Math.hypot(i, j) * step) / MOST * 255;
    for (let k = 0; k < heads.length; k += 3) {
      const fx = (heads[k] - x0) / step, fz = (heads[k + 2] - z0) / step, hb = Math.max(0, Math.min(254, Math.round((heads[k + 1] - base) / per)));
      const ci = Math.round(fx), cj = Math.round(fz);
      for (let j = -R; j <= R; j++) {
        const tj = cj + j;
        if (tj < 0 || tj >= n) continue;
        for (let i = -R; i <= R; i++) {
          const ti = ci + i;
          if (ti < 0 || ti >= n) continue;
          const v = pool[(j + R) * W + i + R];
          if (v < 0.5) continue;
          const o = (tj * n + ti) * 2, had = data[o];
          data[o] = Math.min(255, had + v);
          // the height of the lamp lighting this spot most
          if (v >= had) data[o + 1] = hb;
        }
      }
      if (k % 900 === 897) yield;
    }
    // the picture runs north to south as scene z does: row j is z0 + j * step
    let tex = U.poolMap.value;
    if (tex.image.width !== n) { tex.dispose(); tex = U.poolMap.value = picture(n); }
    tex.image = { data, width: n, height: n };
    tex.needsUpdate = true;
    this.cx = px; this.cz = pz; this.size = n; this.step = step;
    U.poolBox.value.set(px, pz, 1 / (n * step), 1);
    U.poolHeight.value.set(base, per);
  }
}
