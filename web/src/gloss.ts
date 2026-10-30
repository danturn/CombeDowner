// Glossy paint and glass. A car's paint and windows reflect the sky on their tops and catch it along
// their edges, the way real ones do in the shade: without it a dark car out of the sun is lit only
// by the dim sky, and on dark tarmac it all but disappears. It's worked out in the car's own shader
// from the sky light already in the scene (world.ts's hemisphere light), so it follows the time of
// day, the night and the tunnels by itself, and costs no extra lights, shadows or draw calls.
// Nothing here goes over the network.
import * as THREE from "three";

/**
 * The colour a vehicle's windows are built in: the shader picks its glass out by it and has it
 * mirror more of the sky than the paint does.
 */
export const GLASS = "#141c24";
const G = new THREE.Color(GLASS), GL = `vec3(${G.r.toFixed(6)}, ${G.g.toFixed(6)}, ${G.b.toFixed(6)})`;

const burnt = new WeakMap<THREE.Material, { value: number }>();

/**
 * Make a Lambert material glossy (k: how much, 1 for paint), and give it back. Its colour (or a
 * parked car's instance colour) is the paint, and only the white parts take it: the glass, lights,
 * plates, tyres and wheels keep their own colours whatever colour the car is.
 */
export function glossy<T extends THREE.MeshLambertMaterial>(m: T, k = 1): T {
  const K = k.toFixed(2), gBurnt = { value: 0 };
  burnt.set(m, gBurnt);
  m.onBeforeCompile = (s) => {
    s.uniforms.gBurnt = gBurnt;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vGlass, vPaint;\nvarying vec3 vBase;")
      .replace("#include <color_vertex>", `#include <color_vertex>
      #ifdef USE_COLOR
        vGlass = step(distance(color.rgb, ${GL}), 0.002);
        vPaint = step(2.97, color.r + color.g + color.b);
        vBase = color.rgb;
      #else
        vGlass = 0.0; vPaint = 1.0; vBase = vec3(1.0);
      #endif`);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vGlass, vPaint;\nvarying vec3 vBase;\nuniform float gBurnt;")
      .replace("#include <color_fragment>", `#include <color_fragment>
      diffuseColor.rgb = mix(vBase * mix(vec3(1.0), diffuse, gBurnt), diffuseColor.rgb, vPaint);`)
      .replace("#include <opaque_fragment>", `
      #if NUM_HEMI_LIGHTS > 0
      {
        // the sky (or the ground) mirrored in the surface: a little face on, a lot at a glancing angle.
        // Face on it's kept faint, or it greys the paint over like dust; glass mirrors more, a touch blue.
        vec3 gV = normalize(vViewPosition), gR = reflect(-gV, normal);
        float gUp = clamp(dot(gR, hemisphereLights[0].direction) * 0.5 + 0.5, 0.0, 1.0);
        vec3 gSky = mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, gUp);
        float gF = pow(1.0 - saturate(dot(normal, gV)), 4.0);
        vec3 gTint = mix(vec3(1.0), vec3(0.8, 0.9, 1.0), vGlass);
        outgoingLight += gSky * gTint * RECIPROCAL_PI * (mix(0.1, 0.2, vGlass) + mix(0.6, 0.7, vGlass) * gF) * ${K};
      }
      #endif
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `gloss${K}`;
  return m;
}

/** A glossy material burnt out: its colour then darkens every part, not just the paint. */
export function charred(m: THREE.Material) {
  const b = burnt.get(m);
  if (b) b.value = 1;
}
