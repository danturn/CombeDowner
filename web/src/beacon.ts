// A beacon over the way into a minigame (the mines, the deli): a glowing ring on the ground at the
// door, a badge with the minigame's icon turning slowly just above its neon sign, and a tall column
// of coloured light rising from there into the sky (starting above the sign, so it never hides it). The column cuts through the fog
// and shows over the roofs, so you can find the door from streets away; the minimap and the big map
// mark the same doors with the same icon (Minimap.spotIcon).
//
// Nothing here goes over the network: every player builds the same beacons from the map.
import * as THREE from "three";
import { spotIcon, type SpotKind } from "./minimap";

const HEIGHT = 70;   // metres the column of light rises
const BASE = 4.3;    // metres off the ground it starts: just above the neon sign over the door

export function beacon(kind: SpotKind, colour: string): { group: THREE.Group; update(t: number): void } {
  const group = new THREE.Group();

  // the column: an open tube, brightest at the bottom and fading out at the top, seen from inside too
  const cc = document.createElement("canvas");
  cc.width = 4; cc.height = 128;
  const cg = cc.getContext("2d")!;
  const fade = cg.createLinearGradient(0, 0, 0, 128);
  fade.addColorStop(0, "rgba(255,255,255,0)"); fade.addColorStop(0.55, "rgba(255,255,255,0.35)"); fade.addColorStop(1, "rgba(255,255,255,1)");
  cg.fillStyle = fade; cg.fillRect(0, 0, 4, 128);
  const fadeTex = new THREE.CanvasTexture(cc);
  const beamMat = new THREE.MeshBasicMaterial({
    map: fadeTex, color: colour, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false, fog: false, toneMapped: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.45, HEIGHT, 16, 1, true), beamMat);
  beam.position.y = BASE + HEIGHT / 2;
  // a thin white-hot core inside it
  const coreMat = beamMat.clone();
  coreMat.color = new THREE.Color(colour).lerp(new THREE.Color("#ffffff"), 0.6);
  coreMat.opacity = 0.5;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, HEIGHT, 8, 1, true), coreMat);
  core.position.y = BASE + HEIGHT / 2;

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
  spotIcon(bg, kind, colour, 64, 64, 5);
  const badgeTex = new THREE.CanvasTexture(bc);
  badgeTex.colorSpace = THREE.SRGBColorSpace;
  const badgeMat = new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, side: THREE.DoubleSide, toneMapped: false, fog: false, depthWrite: false });
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), badgeMat);
  badge.position.y = BASE + 0.4;

  group.add(beam, core, floor, badge);

  const update = (t: number) => {
    const k = 0.85 + Math.sin(t * 2.2) * 0.15;
    beamMat.opacity = 0.55 * k;
    coreMat.opacity = 0.5 * k;
    ringMat.opacity = 0.6 + 0.3 * Math.sin(t * 3.1);
    floor.scale.setScalar(1 + 0.08 * Math.sin(t * 3.1));
    badge.rotation.y = t * 1.2;
    badge.position.y = BASE + 0.4 + Math.sin(t * 1.7) * 0.12;
  };
  return { group, update };
}
