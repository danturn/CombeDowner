// What the angel's wings look like (wings.ts): a pair of white feathered wings and a gold glow,
// over the top of Bath Abbey's tower, in view as you fly, and on the backs of the others flying
// with them (avatar.ts). Just the look: nothing here goes over the network.
import * as THREE from "three";

const feather = new THREE.MeshLambertMaterial({ color: "#fffaf0", emissive: "#e8d9a8", emissiveIntensity: 0.6, side: THREE.DoubleSide });

/** One wing, spread out along +x from its root (s: -1 for the left one, mirrored). */
export function wing(s: number, len: number): THREE.Group {
  const g = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const l = len * (1 - k * 0.11), w = len * 0.17;
    const f = new THREE.Mesh(new THREE.BoxGeometry(l, 0.012 * len, w), feather);
    f.position.set((s * l) / 2, -k * 0.05 * len, k * 0.06 * len);
    f.rotation.z = s * -k * 0.09;
    g.add(f);
  }
  return g;
}

/** A pair of wings, spread, len long each: over the tower, or on someone's back (avatar.ts). */
export function angelWings(len = 1.1): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) { const w = wing(s, len); w.position.x = s * 0.12; w.rotation.z = s * 0.35; g.add(w); }
  return g;
}

let glowTex: THREE.CanvasTexture | null = null;
/** A gold glow round someone flying with the wings, size metres across. */
export function angelGlow(size = 4): THREE.Sprite {
  if (!glowTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,244,200,1)"); r.addColorStop(0.3, "rgba(255,214,110,0.55)"); r.addColorStop(1, "rgba(255,190,60,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(size);
  return s;
}
