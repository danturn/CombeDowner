// The sun's shadows, and how far from you they reach. One shadow map can't be both sharp at your feet
// and reach the far end of a long view, so the sun's shadows are drawn in up to four nested squares
// round you ("cascades"), each four times the size of the one inside it: the sun's own light carries
// the smallest and sharpest, and the bigger ones are extra lights that cast shadows but give no light
// of their own. Every lit surface takes its shadow from the smallest square it stands in, blending
// into the next one across the square's edge, so there is no line where one ends.
//
// How far they reach is a share of the draw distance (view.ts), chosen in Settings (settings.ts) or
// by the automatic settings (quality.ts): Off, Low, Medium, High or Ultra, the whole view, but never
// further than SHADOW_MOST, past which a house's shadow is smaller than a pixel. The small square is
// drawn afresh every other frame (less often if the automatic settings ease back), the bigger ones
// in turn on the frames between, less often the bigger they are: a shadow 1 km off a few frames
// behind can't be seen.
//
// There are only as many squares' lights as the level and draw distance have needed so far (two at
// least), as every lit surface works out its shadow from each one there is, used or not. Big models
// are drawn into the shadows in pieces, so a square draws only what's in it ("in pieces", below).
//
// This file changes how three.js lights every material on the page (the ShaderChunk below): a scene
// with more than one shadow-casting directional light has them taken as one sun's cascades, the
// sun's own light first. Only the streets' world (world.ts) has more than one. Nothing here goes over
// the network: everyone sees shadows as far as they like.
import * as THREE from "three";
import { traverseAll } from "./cull";
import { quality } from "./quality";
import { MOBILE } from "./safegfx";
import { view } from "./view";

/** The levels in Settings: the share of the draw distance the shadows reach. */
export const SHADOW_LEVELS = [
  { name: "Off", share: 0 },
  { name: "Low", share: 0.1 },
  { name: "Medium", share: 0.25 },
  { name: "High", share: 0.5 },
  { name: "Ultra", share: 1 },
] as const;
export const SHADOW_OFF = 0, SHADOW_LOW = 1, SHADOW_MEDIUM = 2, SHADOW_ULTRA = SHADOW_LEVELS.length - 1;
/** Where shadows stop, however far you see, metres. At 3 km a pixel on the screen is about 8 m across,
 *  as long as a house's shadow at midday, and drawing the whole city into the shadows again costs
 *  more each time; a phone or tablet stops sooner. */
export const SHADOW_MOST = MOBILE ? 1000 : 3000;
/** The layer for things that only cast shadows (the stand-ins for far-off trees, trees.ts): the sun's
 *  shadow cameras see it, the camera you look through doesn't, so they cost nothing on the screen. */
export const SHADOW_ONLY = 1;
/** The sharpest square's half-width, metres: as the shadows always were, with the same detail. */
const NEAR = 70;
/** The most squares: each is a light with a shadow map, and each costs every lit surface a little. */
const MOST_CASCADES = MOBILE ? 3 : 4;
/** The fewest lights while shadows are on: with one, three.js's own lighting would cut the shadows off
 *  sharply at the square's edge instead of fading them out. */
const LEAST_CASCADES = 2;

/** The level in force. Set with setShadowLevel. */
export let shadowLevel: number = MOBILE ? SHADOW_LOW : SHADOW_MEDIUM;
/** What a level is called on the page (Settings), with its share of the view. */
export const shadowLevelName = (level: number) => {
  const l = SHADOW_LEVELS[level];
  return level === SHADOW_OFF ? l.name : level === SHADOW_ULTRA ? `${l.name} (all the view, up to ${SHADOW_MOST / 1000} km)` : `${l.name} (${l.share * 100}% of the view)`;
};
export const SHADOW_DEFAULT = shadowLevel;
export function setShadowLevel(level: number) {
  shadowLevel = Math.max(SHADOW_OFF, Math.min(SHADOW_ULTRA, Math.round(level) || 0));
}

/** How far the shadows reach at this level and draw distance, metres (0 when they're off). */
export function shadowReach(level = shadowLevel, far = view.fogFar) {
  if (level <= SHADOW_OFF) return 0;
  return Math.round(Math.min(SHADOW_MOST, Math.max(NEAR, SHADOW_LEVELS[level].share * far)));
}

/** The half-widths of the squares that cover reach, smallest first. Each is about four times the last;
 *  one that would only add a little is folded into the one before it. */
function squaresFor(reach: number): number[] {
  if (reach <= 100) return [reach];
  const out = [NEAR];
  while (out[out.length - 1] < reach) {
    const last = out[out.length - 1];
    if (out.length > 1 && reach <= last * 2) { out[out.length - 1] = reach; break; }
    out.push(Math.min(last * 4, reach));
  }
  if (out.length > MOST_CASCADES) { out.length = MOST_CASCADES; out[MOST_CASCADES - 1] = reach; }
  return out;
}

// ---- the lighting, for every material ---------------------------------------------------------------
// With more than one shadow-casting directional light, they are the sun's cascades: the first (the sun)
// lights the surface once, darkened by whichever square it's in, and the others give no light.
const cascade = (k: number) => `
		#if NUM_DIR_LIGHT_SHADOWS > ${k}
		cdC = vDirectionalShadowCoord[ ${k} ].xyz / vDirectionalShadowCoord[ ${k} ].w;
		cdW = cdLeft * smoothstep( 0.0, 0.08, min( min( cdC.x, 1.0 - cdC.x ), min( cdC.y, 1.0 - cdC.y ) ) );
		if ( cdW > 0.001 ) {
			directionalLightShadow = directionalLightShadows[ ${k} ];
			cdLit += cdW * getShadow( directionalShadowMap[ ${k} ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ ${k} ] );
			cdLeft -= cdW;
		}
		#endif`;
const PLAIN = "#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )";
const CASCADED = `#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 1 )
	DirectionalLight directionalLight = directionalLights[ 0 ];
	DirectionalLightShadow directionalLightShadow;
	getDirectionalLightInfo( directionalLight, directLight );
	if ( receiveShadow ) {
		// cdLeft: how much of the surface no square has spoken for yet; past them all it's in the sun
		float cdLit = 0.0, cdLeft = 1.0, cdW;
		vec3 cdC;
		${[0, 1, 2, 3].map(cascade).join("")}
		directLight.color *= cdLit + cdLeft;
	}
	RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	#if NUM_DIR_LIGHTS > NUM_DIR_LIGHT_SHADOWS
	#pragma unroll_loop_start
	for ( int i = NUM_DIR_LIGHT_SHADOWS; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
	#endif
#elif ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )`;
if (!THREE.ShaderChunk.lights_fragment_begin.includes(PLAIN)) console.warn("shadows.ts: three.js's lighting has changed; the far shadows are off");
else if (!THREE.ShaderChunk.lights_fragment_begin.includes("NUM_DIR_LIGHT_SHADOWS > 1 )"))
  THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(PLAIN, CASCADED);

// a square not in use is moved where nothing is: every surface falls outside it
const NOWHERE = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(5, 5, 5);

/** The sun and its cascades, for one world. Add group to the scene (it holds the sun) and call follow each frame. */
export class SunShadows {
  /** The sun first, then the bigger squares' lights: their order is the order the lighting reads them in. */
  readonly group = new THREE.Group();
  private lights: THREE.DirectionalLight[];
  private halves: number[] = [];
  private level = -1;
  private frame = 0;
  /** Where each square was last drawn round, and the light's direction then. */
  private drawnAt: { x: number; z: number; d: THREE.Vector3 }[] = [];

  constructor(readonly sun: THREE.DirectionalLight, private size: number, scene: THREE.Scene) {
    this.lights = [];
    this.addLight(sun);
    // (pieces are only ever drawn into shadows: the models are whole again before the picture works
    // out what to draw, and once it's drawn, for the rest of the game)
    const before = scene.onBeforeRender, after = scene.onAfterRender;
    scene.onBeforeRender = function (...a) { wholeAgain(); before.apply(this, a); };
    scene.onAfterRender = function (...a) { wholeAgain(); after.apply(this, a); };
    this.fit();
  }

  /** One more square's light. Every lit material is built again for a new light, a stutter, so there
   *  are only as many as the level and draw distance have needed so far. */
  private addLight(l: THREE.DirectionalLight) {
    const k = this.lights.length;
    if (k > 0) {
      l.name = `sun shadows ${k}`;
      l.castShadow = true;
      l.visible = this.level > SHADOW_OFF;
    }
    l.shadow.autoUpdate = false;
    l.shadow.camera.layers.enable(SHADOW_ONLY);
    const um = l.shadow.updateMatrices.bind(l.shadow);
    l.shadow.updateMatrices = (light: THREE.Light) => { um(light); piecesFor(k === 0, l.shadow.getFrustum()); };
    this.lights.push(l);
    this.group.add(l, l.target);
    this.drawnAt.push({ x: Infinity, z: Infinity, d: new THREE.Vector3() });
  }

  /** Set the squares for the level and draw distance in force, if they've changed. */
  private fit() {
    const reach = shadowReach();
    const halves = squaresFor(Math.max(1, reach));
    if (this.level === shadowLevel && halves.join() === this.halves.join()) return;
    // the extra lights stay whenever shadows are on, so the materials needn't be built again when the
    // reach shrinks; off, they go, and the lighting is three.js's own
    const on = shadowLevel > SHADOW_OFF;
    this.level = shadowLevel; this.halves = halves;
    while (on && this.lights.length < Math.min(MOST_CASCADES, Math.max(LEAST_CASCADES, halves.length)))
      this.addLight(new THREE.DirectionalLight(this.sun.color, 0));
    this.lights.forEach((l, k) => {
      const h = halves[k];
      if (k > 0) l.visible = on;
      if (!h) {
        l.shadow.map?.dispose(); l.shadow.map = null;
        l.shadow.needsUpdate = false;
        l.shadow.matrix.copy(NOWHERE);
        return;
      }
      // each square's light stands far enough back towards the sun to catch the hills in it; the
      // nudges that keep a surface from shading itself grow with the square's texels
      const back = h <= 100 ? 200 : h * 1.5 + 300, s = h / NEAR;
      Object.assign(l.shadow.camera, { left: -h, right: h, top: h, bottom: -h, near: 1, far: back * 2 });
      l.shadow.camera.updateProjectionMatrix();
      l.shadow.mapSize.set(this.size, this.size);
      l.shadow.bias = -0.24 * s / (back * 2 - 1);
      l.shadow.normalBias = 0.04 * s;
      l.userData.back = back;
      l.shadow.needsUpdate = true;
      this.drawnAt[k].x = Infinity;
    });
  }

  /** Keep the squares round the player at scene (px, py, pz), lit from towards dir (the sun or moon). */
  follow(px: number, py: number, pz: number, dir: THREE.Vector3) {
    this.fit();
    const every = quality.shadowEvery, f = this.frame++;
    this.halves.forEach((h, k) => {
      const l = this.lights[k], at = this.drawnAt[k];
      if (!l) return;
      // snapped to the square's texels so its shadows don't shimmer as you move
      const snap = 2 * h / this.size;
      const cx = Math.round(px / snap) * snap, cz = Math.round(pz / snap) * snap, back = l.userData.back as number;
      l.target.position.set(cx, py, cz);
      l.position.set(cx + dir.x * back, py + dir.y * back, cz + dir.z * back);
      // the small square every few frames; each bigger one half as often as the one inside it, in the
      // frames between, and straight away if you've jumped across it or the light has swung round
      const period = every * 2 ** k;
      const due = k === 0 ? f % every === 0
        : f % period === 2 ** k - 1 || Math.hypot(cx - at.x, cz - at.z) > h / 4 || at.d.dot(dir) < 0.999;
      if (due) { l.shadow.needsUpdate = true; at.x = cx; at.z = cz; at.d.copy(dir); }
    });
  }

  dispose() {
    for (const l of this.lights.slice(1)) l.dispose();   // the sun is the world's
  }
}

// ---- big models in pieces, for the shadows --------------------------------------------------------
// A square's buildings, walls or steps are each drawn as a handful of big models reaching hundreds of
// metres, and a model is drawn into a shadow map whole if any of it is in the square, so the sharpest
// square (140 m across) drew several squares' worth of the city every time. So each big model's
// triangles are put in order by PIECE-metre cell as its square is finished, and pieces, each one cell's
// run of them, stand in for the model in the sharpest square: only the pieces in it are drawn. The
// bigger squares hold most of a model anyway, and draw it whole in one go, unless it is a heavy one.
// The picture itself is drawn exactly as before (the same triangles, in the same order cell by cell).
const PIECE = 100;
/** Models smaller than this, in triangles, aren't worth more draws. */
const LEAST_TRIS = 3000;
/** Models this heavy go in pieces into every square. */
const HEAVY_TRIS = 40000;

interface Pieces { holder: THREE.Group; heavy: boolean }
const pieced = new Map<THREE.Mesh, Pieces>();
const inUse: THREE.Mesh[] = [];

function wholeAgain() {
  for (const m of inUse) { m.castShadow = true; pieced.get(m)!.holder.visible = false; }
  inUse.length = 0;
}

/** As the sun's square k is about to be drawn: its pieces in, for the models that are in it. */
function piecesFor(sharpest: boolean, frustum: THREE.Frustum) {
  wholeAgain();
  for (const [m, p] of pieced) {
    if (!(sharpest || p.heavy) || !m.visible || !m.castShadow || !frustum.intersectsObject(m)) continue;
    m.castShadow = false; p.holder.visible = true;
    inUse.push(m);
  }
}

const keepArrays = () => !!(globalThis as { __keepArrays?: boolean }).__keepArrays;

/** g's triangles in order of the PIECE-metre cell each is in, as a new model (g is left as it was),
 *  and each cell's run of them with its bounds; null if g can't be or needn't be. */
function byCell(g: THREE.BufferGeometry) {
  const pos = g.attributes.position, idx = g.index;
  const attrs = Object.entries(g.attributes) as [string, THREE.BufferAttribute][];
  if (!(pos instanceof THREE.BufferAttribute) || pos.itemSize !== 3 || !(pos.array instanceof Float32Array) || g.groups.length > 1
    || g.drawRange.start !== 0 || g.drawRange.count !== Infinity || Object.keys(g.morphAttributes).length
    || attrs.some(([, a]) => !(a instanceof THREE.BufferAttribute) || (a as unknown as THREE.InstancedBufferAttribute).isInstancedBufferAttribute || !a.array)
    || (idx && !idx.array)) return null;
  const n = Math.floor((idx ? idx.count : pos.count) / 3);
  if (n < LEAST_TRIS) return null;
  const P = pos.array, I = idx?.array;
  const v = (t: number, c: number) => (I ? I[3 * t + c] : 3 * t + c);
  const cellOf = new Int32Array(n), ids = new Map<number, number>();
  for (let t = 0; t < n; t++) {
    const a = v(t, 0), b = v(t, 1), c = v(t, 2);
    const x = (P[3 * a] + P[3 * b] + P[3 * c]) / 3, z = (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3;
    const key = Math.floor(x / PIECE) * 65536 + Math.floor(z / PIECE);
    let id = ids.get(key);
    if (id === undefined) ids.set(key, (id = ids.size));
    cellOf[t] = id;
  }
  if (ids.size < 2) return null;
  const cells = Array.from({ length: ids.size }, () => ({ start: 0, count: 0, box: new THREE.Box3() }));
  for (let t = 0; t < n; t++) cells[cellOf[t]].count++;
  for (let k = 1; k < cells.length; k++) cells[k].start = cells[k - 1].start + cells[k - 1].count;
  const at = cells.map((c) => c.start);
  const out = new THREE.BufferGeometry(), _v = new THREE.Vector3();
  // runs of triangles in one cell are copied in one go: a model is mostly built a place at a time
  const copy = (from: THREE.TypedArray, to: THREE.TypedArray, per: number) => {
    at.forEach((_, k) => (at[k] = cells[k].start));
    for (let t = 0; t < n;) {
      let e = t + 1;
      while (e < n && cellOf[e] === cellOf[t]) e++;
      const k = cellOf[t];
      to.set(from.subarray(t * per, e * per), at[k] * per);
      at[k] += e - t;
      t = e;
    }
  };
  if (I) {
    const J = new (I.constructor as new (n: number) => THREE.TypedArray)(I.length);
    copy(I, J, 3);
    out.setIndex(new THREE.BufferAttribute(J, 1));
    for (const [name, a] of attrs) out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(), a.itemSize, a.normalized));
  } else {
    for (const [name, a] of attrs) {
      const to = new (a.array.constructor as new (n: number) => THREE.TypedArray)(a.array.length);
      copy(a.array, to, 3 * a.itemSize);
      out.setAttribute(name, new THREE.BufferAttribute(to, a.itemSize, a.normalized));
    }
  }
  const Q = (out.attributes.position as THREE.BufferAttribute).array, K = out.index?.array;
  for (const c of cells)
    for (let i = 3 * c.start; i < 3 * (c.start + c.count); i++) { const q = K ? K[i] : i; c.box.expandByPoint(_v.set(Q[3 * q], Q[3 * q + 1], Q[3 * q + 2])); }
  out.boundingSphere = g.boundingSphere?.clone() ?? null;
  out.boundingBox = g.boundingBox?.clone() ?? null;
  if (!out.boundingSphere) out.computeBoundingSphere();
  out.userData = g.userData;
  if (g.groups.length) out.addGroup(0, Infinity, g.groups[0].materialIndex);
  if (!keepArrays()) for (const a of [...Object.values(out.attributes), ...(out.index ? [out.index] : [])] as THREE.BufferAttribute[])
    a.onUpload(() => { (a as { array: unknown }).array = null; });
  return { geo: out, cells };
}

/** Put the big shadow-casting models under root in pieces (see above), a few at a time. skip: models
 *  lent by another world, which other meshes draw too; kept: meshes whose models may be kept for
 *  another square. */
export function* inPieces(root: THREE.Object3D, skip: Set<unknown>, kept: (o: THREE.Object3D) => boolean): Generator<void> {
  const users = new Map<THREE.BufferGeometry, number>(), meshes: THREE.Mesh[] = [];
  traverseAll(root, (o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    users.set(m.geometry, (users.get(m.geometry) ?? 0) + 1);
    if (m.castShadow && !(m as THREE.InstancedMesh).isInstancedMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && !Array.isArray(m.material) && !pieced.has(m)) meshes.push(m);
  });
  let work = 0;
  for (const m of meshes) {
    const g = m.geometry;
    if (users.get(g)! > 1 || skip.has(g) || (g.boundingSphere && g.boundingSphere.radius < PIECE) || kept(m)) continue;
    const cut = byCell(g);
    if (!cut) continue;
    m.geometry = cut.geo;
    g.dispose();
    const holder = new THREE.Group();
    holder.visible = false;
    holder.matrixAutoUpdate = holder.matrixWorldAutoUpdate = false;
    for (const c of cut.cells) {
      const pg = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(cut.geo.attributes)) pg.setAttribute(name, a);
      if (cut.geo.index) pg.setIndex(cut.geo.index);
      pg.setDrawRange(3 * c.start, 3 * c.count);
      pg.boundingBox = c.box;
      pg.boundingSphere = c.box.getBoundingSphere(new THREE.Sphere());
      const piece = new THREE.Mesh(pg, m.material);
      piece.castShadow = true;
      piece.receiveShadow = false;
      piece.customDepthMaterial = m.customDepthMaterial;
      piece.customDistanceMaterial = m.customDistanceMaterial;
      // (it sits where its model does, always: the same matrix, not a copy kept up to date)
      piece.matrixAutoUpdate = piece.matrixWorldAutoUpdate = false;
      piece.matrixWorld = m.matrixWorld;
      piece.raycast = () => {};
      holder.add(piece);
    }
    m.add(holder);
    const n = (cut.geo.index ? cut.geo.index.count : cut.geo.attributes.position.count) / 3;
    pieced.set(m, { holder, heavy: n >= HEAVY_TRIS });
    cut.geo.addEventListener("dispose", () => { pieced.delete(m); const i = inUse.indexOf(m); if (i >= 0) inUse.splice(i, 1); });
    work += n;
    if (work > 40000) { work = 0; yield; }
  }
}
