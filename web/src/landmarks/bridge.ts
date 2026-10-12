// A Palladian bridge: three arches carrying a colonnade between end pavilions, with slate roofs
// (Prior Park, 1755). Stands at the water level. No args.
import * as THREE from "three";

export function bridge() {
  const stone = new THREE.MeshLambertMaterial({ color: "#dccba3" }), shade = new THREE.MeshLambertMaterial({ color: "#5d5546" });
  const slate = new THREE.MeshLambertMaterial({ color: "#4a4e55" });
  const grp = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); grp.add(m); };
  add(new THREE.BoxGeometry(18, 3.2, 6.4), stone, 0, 0.6, 0);                         // the arched base
  for (const ax of [-5, 0, 5]) add(new THREE.BoxGeometry(3.4, 2.2, 6.5), shade, ax, -0.2, 0);   // three arches
  add(new THREE.BoxGeometry(18.4, 0.35, 6.8), stone, 0, 2.35, 0);                   // deck
  for (const ex of [-7.4, 7.4]) add(new THREE.BoxGeometry(3.2, 5.2, 6.4), stone, ex, 5.0, 0);   // end pavilions
  for (const cx of [-4.4, -1.5, 1.5, 4.4]) for (const cz of [-2.9, 2.9]) add(new THREE.CylinderGeometry(0.28, 0.32, 4.4, 10), stone, cx, 4.7, cz);   // Ionic columns
  add(new THREE.BoxGeometry(12, 0.6, 6.6), stone, 0, 7.15, 0);                      // entablature
  add(new THREE.CylinderGeometry(0.01, 4.4, 2.2, 4, 1).rotateY(Math.PI / 4).scale(2.9, 1, 1.05), slate, 0, 8.55, 0);
  for (const ex of [-7.4, 7.4]) add(new THREE.CylinderGeometry(0.01, 2.7, 1.8, 4, 1).rotateY(Math.PI / 4), slate, ex, 8.5, 0);
  return grp;
}
