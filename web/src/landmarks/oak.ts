// Eric's oak, on Bathampton Down: a mighty old oak, broad and low-crowned on a thick, flared
// trunk, with the memorial plaque on its post at the foot, facing the path. Planted in loving
// memory of our friend Eric Benjamin Holmes (1978-2022). Placed by tools/landmarks/combe_down_bath.py;
// its trunk is solid (map.ts).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as TX from "../textures";

/** The plaque's face: grey with a silver edge, a spreading oak, and the words. */
function plaqueTexture(): THREE.CanvasTexture {
  const W = 512, H = 384;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#c9cdd0"; g.fillRect(0, 0, W, H);                 // the silver rim
  g.fillStyle = "#43484c"; g.fillRect(12, 12, W - 24, H - 24);
  g.strokeStyle = "#d8dcde"; g.lineWidth = 3; g.strokeRect(24, 24, W - 48, H - 48);
  // the oak: a short fat trunk, boughs spreading wide, and clusters of leaves
  const r = (() => { let s = 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const cx = W / 2, base = 196;
  g.fillStyle = g.strokeStyle = "#f2f2ee";
  g.beginPath();
  g.moveTo(cx - 34, base); g.quadraticCurveTo(cx - 14, base - 10, cx - 12, base - 46);
  g.lineTo(cx + 12, base - 46); g.quadraticCurveTo(cx + 14, base - 10, cx + 34, base); g.closePath(); g.fill();
  g.lineCap = "round";
  const bough = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const ex = x + Math.cos(a) * len, ey = y - Math.sin(a) * len;
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
    if (depth > 0) for (const da of [-0.45, 0.4]) bough(ex, ey, a + da + (r() - 0.5) * 0.3, len * 0.68, w * 0.62, depth - 1);
    else for (let k = 0; k < 4; k++) {
      g.beginPath(); g.ellipse(ex + (r() - 0.5) * 22, ey + (r() - 0.5) * 16, 7, 5, r() * 3, 0, Math.PI * 2); g.fill();
    }
  };
  for (const a of [0.35, 0.95, 1.57, 2.2, 2.8]) bough(cx, base - 44, a, 46, 9, 3);
  // the words
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#f4f4f0";
  g.font = 'italic 600 30px Georgia, "Times New Roman", serif';
  g.fillText("Planted in loving memory", cx, 248);
  g.font = '600 38px Georgia, "Times New Roman", serif';
  g.fillText("ERIC BENJAMIN HOLMES", cx, 296, W - 70);
  g.font = '500 30px Georgia, "Times New Roman", serif';
  g.fillText("1978-2022", cx, 338);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function oak(): THREE.Object3D {
  const grp = new THREE.Group();
  const bark = new THREE.MeshLambertMaterial({ color: "#7d6a55", map: TX.bark() });
  const leaf = new THREE.MeshLambertMaterial({ map: TX.leaves(), vertexColors: true });
  const r = (() => { let s = 1978; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();

  // the trunk, flaring into its roots
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.25, 5.2, 14, 4), bark);
  trunk.position.y = 2.6;
  const flare = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 2.1, 0.9, 14), bark);
  flare.position.y = 0.3;
  grp.add(trunk, flare);

  // great boughs leaving the trunk low and reaching out wide, each with a few lesser limbs
  const limb = (from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number) => {
    const d = to.clone().sub(from), len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 8), bark);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    grp.add(m);
  };
  const tips: THREE.Vector3[] = [];
  const BOUGHS = 7;
  for (let k = 0; k < BOUGHS; k++) {
    const a = (k / BOUGHS) * Math.PI * 2 + r() * 0.5, h = 4.4 + r() * 1.2;
    const from = new THREE.Vector3(0, h, 0);
    const mid = new THREE.Vector3(Math.cos(a) * 5.5, h + 2.6 + r() * 1.5, Math.sin(a) * 5.5);
    const end = new THREE.Vector3(Math.cos(a + 0.15) * 10, h + 4.8 + r() * 2.2, Math.sin(a + 0.15) * 10);
    limb(from, mid, 0.62, 0.42); limb(mid, end, 0.42, 0.18);
    for (const side of [-1, 1]) {
      const b = a + side * 0.5, t = new THREE.Vector3(mid.x + Math.cos(b) * 3.5, mid.y + 3 + r() * 1.5, mid.z + Math.sin(b) * 3.5);
      limb(mid, t, 0.3, 0.12); tips.push(t);
    }
    tips.push(end);
  }
  // a leader up the middle
  const top = new THREE.Vector3(0.4, 13.5, -0.3);
  limb(new THREE.Vector3(0, 5, 0), top, 0.7, 0.25); tips.push(top);

  // the crown: big soft lumps of leaves over every limb's end, darker underneath
  const lumps: THREE.BufferGeometry[] = [];
  const addLump = (c: THREE.Vector3, rad: number) => {
    const g = new THREE.IcosahedronGeometry(rad, 1);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const bump = 1 + 0.16 * Math.sin(x * 2.1 + c.x) * Math.sin(y * 1.9 + c.y) * Math.sin(z * 2.3 + c.z);
      pos.setXYZ(i, c.x + x * bump, c.y + y * bump * 0.8, c.z + z * bump);
      const shade = 0.62 + 0.38 * Math.min(1, Math.max(0, (c.y + y * 0.8 - 7) / 9));
      col.set([shade * 0.92, shade, shade * 0.86], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    lumps.push(g.toNonIndexed());
  };
  for (const t of tips) addLump(t, 2.6 + r() * 1.2);
  for (let k = 0; k < 9; k++) {
    const a = r() * Math.PI * 2, d = 3 + r() * 6;
    addLump(new THREE.Vector3(Math.cos(a) * d, 10 + r() * 4, Math.sin(a) * d), 3 + r() * 1.3);
  }
  grp.add(new THREE.Mesh(mergeGeometries(lumps)!, leaf));

  // the plaque on its post at the foot of the tree, facing out (+z)
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 8), new THREE.MeshLambertMaterial({ color: "#b9bcbe" }));
  post.position.set(0.5, 0.375, 3.3);
  const face = new THREE.MeshLambertMaterial({ map: plaqueTexture() }), edge = new THREE.MeshLambertMaterial({ color: "#9a9ea1" });
  // a box with the face on its front (BoxGeometry's +z side is its fifth material)
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.02), [edge, edge, edge, edge, face, edge]);
  plaque.position.set(0.5, 0.86, 3.3);
  plaque.rotation.x = -0.35;      // tipped back to be read from the path
  grp.add(post, plaque);
  return grp;
}
