// A giant portico against a wall: six columns on a podium, an entablature and a pediment
// (Prior Park mansion's north front). args: width, column height
import * as THREE from "three";

export function portico([width, height]: (number | string)[]) {
  const w = width as number, h = height as number;
  const stone = new THREE.MeshLambertMaterial({ color: "#e0cfa6" });
  const grp = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, px: number, py: number, pz: number) => { const m = new THREE.Mesh(geo, stone); m.position.set(px, py, pz); grp.add(m); };
  add(new THREE.BoxGeometry(w + 2, 1.6, 6), 0, 0.8, 3);                                // podium and steps
  for (let k = 0; k < 6; k++) add(new THREE.CylinderGeometry(0.45, 0.5, h - 2.4, 12), -w / 2 + 0.8 + k * (w - 1.6) / 5, 1.6 + (h - 2.4) / 2, 4.8);
  add(new THREE.BoxGeometry(w + 0.6, 1.3, 5.2), 0, h - 0.15, 3.1);                     // entablature
  const ped = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.3, 0), new THREE.Vector2(w / 2 + 0.3, 0), new THREE.Vector2(0, 2.9)]);
  const pm = new THREE.Mesh(new THREE.ExtrudeGeometry(ped, { depth: 5.2, bevelEnabled: false }), stone);
  pm.position.set(0, h + 0.5, 0.5);
  grp.add(pm);
  return grp;
}
