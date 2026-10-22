// Sir Bevil Grenville's monument on Lansdown, as a set piece (landmarks/setpieces.ts) in place of
// whatever the map tools build there. Put up in 1720 by his grandson George Granville, Lord
// Lansdown, where Grenville fell leading the Cornish foot at the battle of Lansdown on 5 July 1643:
// a tall square pedestal of Bath stone on steps, with inscribed panels and a cornice, a smaller
// block on top carved with trophies of arms, and the Grenvilles' griffin sitting on the top of it
// all. About seven and a half metres high. Day Bendy gives his history lessons beside it
// (daybendy.ts). Its frame: x along its front, z out of its front (towards the lane), y up from the
// ground at its middle. Solid as it's drawn (landmarks/shape.ts).
import * as THREE from "three";
import { Kit, stone, lettering } from "./kit";

export function grenville(): THREE.Object3D {
  const k = new Kit();
  const S = stone("#cdbd98"), S2 = stone("#b3a37f"), S3 = stone("#9c8d6c");
  const panel = lettering("BEVIL GRENVILLE  1643", { w: 512, h: 96, bg: "#c2b28d", ink: "#4c3f2b" });

  // the steps, sunk a little into the slope, and the plinth on them
  k.slab(S2, -2.2, 2.2, -0.8, 0.3, -2.2, 2.2);
  k.slab(S2, -1.8, 1.8, 0.3, 0.6, -1.8, 1.8);
  k.slab(S, -1.3, 1.3, 0.6, 1.3, -1.3, 1.3);
  k.slab(S2, -1.38, 1.38, 1.3, 1.42, -1.38, 1.38);
  // the pedestal, with a sunk panel on each face (the inscription on the front)
  k.slab(S, -1.0, 1.0, 1.42, 4.2, -1.0, 1.0);
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2, s = Math.sin(ry), c = Math.cos(ry);
    k.box(S3, s * 1.0, 1.85, c * 1.0, 1.35, 1.95, 0.04, ry, 1);
    k.box(S, s * 1.02, 1.95, c * 1.02, 1.2, 1.75, 0.02, ry, 1);
  }
  k.quad(panel, 0, 3.3, 1.04, 1.1, 0.21);
  // the cornice
  k.slab(S2, -1.2, 1.2, 4.2, 4.4, -1.2, 1.2);
  k.slab(S, -1.3, 1.3, 4.4, 4.62, -1.3, 1.3);
  // the block on top, with its trophies of arms: a round shield on crossed pikes, each side
  k.slab(S, -0.75, 0.75, 4.62, 5.85, -0.75, 0.75);
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2, s = Math.sin(ry), c = Math.cos(ry);
    for (const t of [-0.7, 0.7]) k.add(S3, new THREE.BoxGeometry(0.06, 1.2, 0.05), s * 0.77, 5.22, c * 0.77, ry, 0, 0, t);
    k.add(S2, new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12), s * 0.8, 5.22, c * 0.8, ry, 0, Math.PI / 2);
  }
  k.slab(S2, -0.85, 0.85, 5.85, 6.0, -0.85, 0.85);
  k.slab(S, -0.6, 0.6, 6.0, 6.25, -0.6, 0.6);
  // the griffin, sitting up and looking out over the hill: a lion's body, an eagle's head and wings
  const G = S;
  k.box(G, 0, 6.25, -0.15, 0.55, 0.45, 0.9);                                           // haunches and body
  k.add(G, new THREE.BoxGeometry(0.42, 0.75, 0.4), 0, 6.85, 0.18, 0, 0, 0.35);         // chest, sitting up
  k.add(G, new THREE.SphereGeometry(0.2, 8, 6), 0, 7.32, 0.33);                       // head
  k.add(G, new THREE.ConeGeometry(0.08, 0.28, 6), 0, 7.27, 0.56, 0, 0, Math.PI / 2 + 0.4);   // beak
  for (const s of [-1, 1]) {
    k.add(G, new THREE.BoxGeometry(0.06, 0.95, 0.55), s * 0.27, 7.1, -0.05, 0, 0, -0.3, -s * 0.35);   // wings, raised
    k.box(G, s * 0.16, 6.25, 0.38, 0.12, 0.62, 0.14);                                 // forelegs
  }
  k.add(G, new THREE.BoxGeometry(0.07, 0.07, 0.6), 0, 6.45, -0.75, 0, 0, 0.6);        // tail
  return k.build();
}
