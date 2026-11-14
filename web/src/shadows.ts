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
// least), as every lit surface works out its shadow from each one there is, used or not.
//
// This file changes how three.js lights every material on the page (the ShaderChunk below): a scene
// with more than one shadow-casting directional light has them taken as one sun's cascades, the
// sun's own light first. Only the streets' world (world.ts) has more than one. Nothing here goes over
// the network: everyone sees shadows as far as they like.
import * as THREE from "three";
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

  constructor(readonly sun: THREE.DirectionalLight, private size: number) {
    this.lights = [];
    this.addLight(sun);
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
