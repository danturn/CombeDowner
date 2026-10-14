// What the angel's wings look like (wings.ts): a pair of white feathered wings and a gold glow,
// over the top of Bath Abbey's tower, in view as you fly, and on the backs of the others flying
// with them (avatar.ts); and the heavenly guitar that comes with them, a pearl and gold Flying V. Just the look: nothing here goes over the network.
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

const pearl = new THREE.MeshLambertMaterial({ color: "#fbf7ee", emissive: "#d9cfb8", emissiveIntensity: 0.35 });
const gilt = new THREE.MeshLambertMaterial({ color: "#f5d36a", emissive: "#c79a2e", emissiveIntensity: 0.55 });
const ebony = new THREE.MeshLambertMaterial({ color: "#1d1712" });

/** An outline (x, y pairs) pulled out depth deep towards +z, with its edges rounded off. */
function slab(pts: number[], depth: number, bevel: number, mat: THREE.Material, z = 0): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) s.lineTo(pts[i], pts[i + 1]);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 }), mat);
  m.position.z = z;
  return m;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};

/** The heavenly guitar: a Flying V in pearl, edged in gold, with an ebony neck, gold pickups and
 *  hardware, a headstock like a feather and strings that light up as they're played (their material
 *  is userData.strings). Neck up +y, its face towards +z, the body's middle at the origin. */
export function heavenlyGuitar(): THREE.Group {
  const g = new THREE.Group();
  // the V, pearl on a gold edge a shade bigger behind it
  const V = [-0.07, 0.07, 0.07, 0.07, 0.27, -0.36, 0.19, -0.41, 0, -0.13, -0.19, -0.41, -0.27, -0.36];
  g.add(slab(V.map((v, i) => (i % 2 ? (v + 0.17) * 1.09 - 0.17 : v * 1.11)), 0.03, 0.006, gilt, -0.004));
  g.add(slab(V, 0.04, 0.008, pearl));
  // the gold scratchplate down the middle, two humbuckers, the bridge and tailpiece, and the knobs
  g.add(slab([-0.06, 0.04, 0.06, 0.04, 0.09, -0.1, 0, -0.04, -0.09, -0.1], 0.004, 0, gilt, 0.05));
  for (const y of [0.0, -0.09]) {
    g.add(box(0.075, 0.032, 0.012, 0, y, 0.058, ebony));
    for (let k = 0; k < 6; k++) g.add(box(0.006, 0.006, 0.004, (k - 2.5) * 0.011, y, 0.065, gilt));
  }
  g.add(box(0.07, 0.012, 0.012, 0, -0.045, 0.06, gilt));
  for (const [x, y] of [[0.13, -0.25], [0.17, -0.31], [0.21, -0.27]]) {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.014, 10), gilt);
    k.rotation.x = Math.PI / 2; k.position.set(x, y, 0.055); g.add(k);
  }
  // the ebony neck with gold frets and pearl dots, and the headstock, a feather in pearl and gold
  g.add(box(0.048, 0.56, 0.022, 0, 0.33, 0.05, ebony));
  for (let k = 0; k < 14; k++) g.add(box(0.05, 0.003, 0.004, 0, 0.6 - k * 0.036 * (1 - k * 0.02), 0.062, gilt));
  for (const y of [0.52, 0.45, 0.38, 0.3, 0.2]) g.add(box(0.008, 0.008, 0.004, 0, y, 0.063, pearl));
  g.add(slab([-0.03, 0.6, 0.03, 0.6, 0.06, 0.7, 0.02, 0.8, 0, 0.83, -0.035, 0.74], 0.018, 0.004, pearl, 0.04));
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.03, 6), gilt);
    t.rotation.z = Math.PI / 2; t.position.set(s * 0.045 + (s > 0 ? 0.01 : 0) - k * 0.004, 0.64 + k * 0.045, 0.05); g.add(t);
  }
  // the strings, glowing
  const strings = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.75, 0.75) });
  for (let k = 0; k < 6; k++) g.add(box(0.0025, 0.66, 0.0025, (k - 2.5) * 0.0075, 0.28, 0.068, strings));
  g.userData.strings = strings;
  return g;
}
