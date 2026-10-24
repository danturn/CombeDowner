// Glossy paint and glass. A car's paint and windows reflect the sky on their tops and catch it along
// their edges, the way real ones do in the shade: without it a dark car out of the sun is lit only
// by the dim sky, and on dark tarmac it all but disappears. It's worked out in the car's own shader
// from the sky light already in the scene (world.ts's hemisphere light), so it follows the time of
// day, the night and the tunnels by itself, and costs no extra lights, shadows or draw calls.
// Nothing here goes over the network.
import * as THREE from "three";

/** Make a Lambert material glossy (k: how much, 1 for paint), and give it back. */
export function glossy<T extends THREE.MeshLambertMaterial>(m: T, k = 1): T {
  const K = k.toFixed(2);
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace("#include <opaque_fragment>", `
      #if NUM_HEMI_LIGHTS > 0
      {
        // the sky (or the ground) mirrored in the surface: a little face on, a lot at a glancing angle
        vec3 gV = normalize(vViewPosition), gR = reflect(-gV, normal);
        float gUp = clamp(dot(gR, hemisphereLights[0].direction) * 0.5 + 0.5, 0.0, 1.0);
        vec3 gSky = mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, gUp);
        float gF = pow(1.0 - saturate(dot(normal, gV)), 4.0);
        outgoingLight += gSky * RECIPROCAL_PI * (0.3 + 0.7 * gF) * ${K};
      }
      #endif
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `gloss${K}`;
  return m;
}
