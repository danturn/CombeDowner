// What you hold, drawn over the world in its own scene (like the guns in ../weapon.ts): a pick, a
// sledgehammer or a saw, swung with a click, plus a candle-lit glow on it from your own lamp.
import * as THREE from "three";

const iron = () => new THREE.MeshLambertMaterial({ color: "#5d5955" });
const ash = () => new THREE.MeshLambertMaterial({ color: "#6e5234" });

function pick(): THREE.Group {
  const g = new THREE.Group();
  const haft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.75), ash());
  haft.position.z = -0.3;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.07), iron());
  head.position.set(0, 0, -0.66);
  // the points curve down a little
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 5), iron());
    tip.rotation.z = (-s * Math.PI) / 2 - s * 0.35;
    tip.position.set(s * 0.36, -0.03, -0.66);
    g.add(tip);
  }
  g.add(haft, head);
  return g;
}

function sledge(): THREE.Group {
  const g = new THREE.Group();
  const haft = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.85), ash());
  haft.position.z = -0.35;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.17, 0.17), iron());
  head.position.set(0, 0, -0.76);
  g.add(haft, head);
  return g;
}

function saw(): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.16), ash());
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.13, 0.7), new THREE.MeshLambertMaterial({ color: "#a7a39c" }));
  blade.position.set(0, -0.02, -0.42);
  // big teeth: a freestone saw was a two-man saw for cutting blocks
  for (let k = 0; k < 9; k++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 3), new THREE.MeshLambertMaterial({ color: "#8d8981" }));
    t.rotation.x = Math.PI;
    t.position.set(0, -0.1, -0.12 - k * 0.075);
    g.add(t);
  }
  g.add(handle, blade);
  return g;
}

const MAKERS: Record<string, () => THREE.Group> = { pick, sledge, saw };

export class Viewmodel {
  readonly scene = new THREE.Scene();
  private holder = new THREE.Group();
  private tool: THREE.Group;
  private swingT = 1;
  private swingLen = 0.5;
  private bob = 0;
  private lamp: THREE.PointLight;

  constructor() {
    this.scene.add(new THREE.AmbientLight("#5a4a3a", 0.35));
    this.lamp = new THREE.PointLight("#ffd6a6", 2.2, 3, 1.5);
    this.lamp.position.set(-0.3, 0.3, 0.2);
    this.holder.add(this.lamp);
    this.scene.add(this.holder);
    this.tool = pick();
    this.tool.scale.setScalar(0.7);
    this.holder.add(this.tool);
    this.place();
  }

  setWeapon(kind: string) {
    this.holder.remove(this.tool);
    this.tool = (MAKERS[kind] ?? pick)();
    this.tool.scale.setScalar(0.7);
    this.holder.add(this.tool);
    this.place();
  }

  private place() {
    this.tool.position.set(0.3, -0.3, -0.3);
    this.tool.rotation.set(0.9, 0.15, 0.25);
  }

  /** Start a swing that takes about this long to recover from. */
  swing(cd: number) { this.swingT = 0; this.swingLen = Math.max(0.25, Math.min(0.9, cd * 0.85)); }

  update(dt: number, camera: THREE.Camera, speed: number, down: boolean) {
    this.holder.position.copy(camera.position);
    this.holder.quaternion.copy(camera.quaternion);
    this.bob += dt * speed * 1.9;
    this.swingT += dt / this.swingLen;
    // raise, then chop down hard, then come back up
    const s = this.swingT;
    let lift = 0, chop = 0;
    if (s < 0.25) lift = s / 0.25;
    else if (s < 0.45) { lift = 1 - (s - 0.25) / 0.2; chop = (s - 0.25) / 0.2; }
    else if (s < 1) chop = 1 - (s - 0.45) / 0.55;
    this.tool.position.set(0.3 - chop * 0.1, -0.3 + lift * 0.18 - chop * 0.12 + Math.sin(this.bob * 2) * 0.012 * Math.min(1, speed / 4), -0.3);
    this.tool.rotation.set(0.9 + lift * 0.9 - chop * 1.5, 0.15, 0.25 + chop * 0.3);
    this.tool.visible = !down;
  }
}
