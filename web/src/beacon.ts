// A beacon over the way into a minigame (the mines, the deli): a glowing ring on the ground at the
// door and the point-of-interest marker turning slowly just above its neon sign. The maps mark the
// same doors with the same marker (spotIcon in minimap.ts). Every minigame gets the same beacon,
// which says something's here but not what.
//
// Nothing here goes over the network: every player builds the same beacons from the map.
import * as THREE from "three";
import { POI, spotIcon } from "./minimap";

const BASE = 4.3;    // metres off the ground of the marker: just above the neon sign over the door

export function beacon(): { group: THREE.Group; update(t: number): void } {
  const colour = POI;
  const group = new THREE.Group();

  // a ring of light on the ground where you walk in
  const rc = document.createElement("canvas");
  rc.width = rc.height = 128;
  const rg = rc.getContext("2d")!;
  const ring = rg.createRadialGradient(64, 64, 20, 64, 64, 64);
  ring.addColorStop(0, "rgba(255,255,255,0)"); ring.addColorStop(0.6, "rgba(255,255,255,0.9)"); ring.addColorStop(0.75, "rgba(255,255,255,0.5)"); ring.addColorStop(1, "rgba(255,255,255,0)");
  rg.fillStyle = ring; rg.fillRect(0, 0, 128, 128);
  const ringMat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(rc), color: colour, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), ringMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.04;

  // the badge: the same round icon as on the map, both sides, always lit
  const bc = document.createElement("canvas");
  bc.width = bc.height = 128;
  const bg = bc.getContext("2d")!;
  spotIcon(bg, 64, 64, 5);
  const badgeTex = new THREE.CanvasTexture(bc);
  badgeTex.colorSpace = THREE.SRGBColorSpace;
  const badgeMat = new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, side: THREE.DoubleSide, toneMapped: false, fog: false, depthWrite: false });
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), badgeMat);
  badge.position.y = BASE + 0.4;

  group.add(floor, badge);

  const update = (t: number) => {
    ringMat.opacity = 0.6 + 0.3 * Math.sin(t * 3.1);
    floor.scale.setScalar(1 + 0.08 * Math.sin(t * 3.1));
    badge.rotation.y = t * 1.2;
    badge.position.y = BASE + 0.4 + Math.sin(t * 1.7) * 0.12;
  };
  return { group, update };
}
