// A church's square west tower with an octagonal spire and corner pinnacles (Holy Trinity).
// args: tower width, tower height, spire height
import * as THREE from "three";

export function spire([size, towerH, spireH]: (number | string)[]) {
  const s = size as number, th = towerH as number, sh = spireH as number;
  const stone = new THREE.MeshLambertMaterial({ color: "#d9c79e" });
  const dark = new THREE.MeshLambertMaterial({ color: "#2a2d30" });
  const grp = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.BoxGeometry(s, th + 1, s), stone);
  tower.position.y = th / 2 - 0.5;
  const belfry = new THREE.Mesh(new THREE.BoxGeometry(s * 0.2, s * 0.36, s + 0.02), dark);
  belfry.position.set(0, th - 3, 0);
  const belfry2 = belfry.clone(); belfry2.rotation.y = Math.PI / 2;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(s * 0.42, sh, 8), stone);
  cone.position.y = th + sh / 2;
  grp.add(tower, belfry, belfry2, cone);
  for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 4), stone);
    pin.position.set(px * (s / 2 - 0.3), th + 1.2, pz * (s / 2 - 0.3));
    grp.add(pin);
  }
  return grp;
}
