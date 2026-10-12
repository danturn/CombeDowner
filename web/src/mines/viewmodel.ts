// What you hold, drawn over the world in its own scene (like the guns in ../weapon.ts): a pick, a
// sledgehammer or a saw, swung with a click (or a bow / staff for the other classes), plus a candle-lit glow on it from your own lamp.
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

export type ViewClass = "quarryman" | "archer" | "mage";

const wood = () => new THREE.MeshLambertMaterial({ color: "#7a4a22" });
const GLOW = "#8fd0ff";
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);

// Stretch a thin unit-length box so it runs from a to b (in its parent's space).
function segment(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  _a.copy(b).sub(a);
  const len = _a.length();
  m.position.copy(a).addScaledVector(_a, 0.5);
  m.scale.set(1, 1, Math.max(0.001, len));
  m.quaternion.setFromUnitVectors(_z, _a.normalize());
}

// A short wooden longbow, held upright: grip at the origin, limbs curving back toward the player.
function makeBow() {
  const g = new THREE.Group();
  const half = 0.45, bend = 0.09;
  const limb = (sign: number) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 4; k++) {
      const u = k / 4;
      pts.push(new THREE.Vector3(0, sign * u * half, bend * u * u));
    }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.016, 5), wood());
    g.add(m);
  };
  limb(1); limb(-1);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), new THREE.MeshLambertMaterial({ color: "#3b2a1c" }));
  g.add(grip);
  const strMat = new THREE.MeshLambertMaterial({ color: "#d8d0bc" });
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 1), strMat);
  const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 1), strMat);
  g.add(s1, s2);
  // arrow: tail at its local origin, pointing down -z
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.7), new THREE.MeshLambertMaterial({ color: "#c9b283" }));
  shaft.position.z = -0.35;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 4), iron());
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -0.73;
  const fl = new THREE.MeshLambertMaterial({ color: "#b8372e" });
  for (let k = 0; k < 2; k++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(k ? 0.05 : 0.004, k ? 0.004 : 0.05, 0.1), fl);
    f.position.z = -0.05;
    arrow.add(f);
  }
  arrow.add(shaft, tip);
  g.add(arrow);
  return { g, s1, s2, arrow, tipTop: new THREE.Vector3(0, half, bend), tipBot: new THREE.Vector3(0, -half, bend) };
}

// A gnarled oak staff with a glowing orb in a claw of roots at the tip.
function makeStaff() {
  const g = new THREE.Group();
  const bark = new THREE.MeshLambertMaterial({ color: "#5b3d22" });
  // a few kinked sections, slightly off-axis each, for the gnarled look
  const kinks: [number, number, number][] = [[0, 0, 0], [0.03, 0.02, -0.4], [-0.02, 0.03, -0.8], [0.025, -0.01, -1.2], [0, 0, -1.5]];
  for (let k = 0; k < kinks.length - 1; k++) {
    const a = new THREE.Vector3(...kinks[k]), b = new THREE.Vector3(...kinks[k + 1]);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02 + 0.004 * (k < 3 ? 1 : 0), 0.028, 1, 6), bark);
    m.geometry.rotateX(Math.PI / 2);
    segment(m, a, b);
    g.add(m);
    const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.034, 0), bark);
    knot.position.copy(b);
    g.add(knot);
  }
  const tipPos = new THREE.Vector3(0, 0, -1.58);
  const orbMat = new THREE.MeshBasicMaterial({ color: GLOW });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), orbMat);
  orb.position.copy(tipPos);
  const light = new THREE.PointLight(GLOW, 1.4, 3, 1.6);
  orb.add(light);
  g.add(orb);
  // three root claws curling round the orb
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2;
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.17, 4), bark);
    claw.position.set(Math.cos(ang) * 0.05, Math.sin(ang) * 0.05, -1.5 - 0.02);
    claw.rotation.set(-Math.sin(ang) * 0.35 - Math.PI / 2, 0, Math.cos(ang) * 0.35);
    g.add(claw);
  }
  return { g, orb, orbMat, light };
}

export class Viewmodel {
  readonly scene = new THREE.Scene();
  private holder = new THREE.Group();
  private tool: THREE.Group;
  private swingT = 1;
  private swingLen = 0.5;
  private bob = 0;
  private lamp: THREE.PointLight;
  private cls: ViewClass = "quarryman";
  private bow = makeBow();
  private staff = makeStaff();
  private drawF = 0;
  private shootT = 1; // 0 = just fired, 1 = settled
  private time = 0;

  constructor() {
    this.scene.add(new THREE.AmbientLight("#5a4a3a", 0.35));
    this.lamp = new THREE.PointLight("#ffd6a6", 2.2, 3, 1.5);
    this.lamp.position.set(-0.3, 0.3, 0.2);
    this.holder.add(this.lamp);
    this.scene.add(this.holder);
    this.tool = pick();
    this.tool.scale.setScalar(0.7);
    this.holder.add(this.tool);
    this.holder.add(this.bow.g, this.staff.g);
    this.bow.g.visible = false;
    this.staff.g.visible = false;
    this.place();
  }

  /** Which hand-held thing is shown: the melee tool, a bow, or a staff. */
  setClass(kind: ViewClass) {
    this.cls = kind;
    this.tool.visible = kind === "quarryman";
    this.bow.g.visible = kind === "archer";
    this.staff.g.visible = kind === "mage";
    this.drawF = 0;
    this.shootT = 1;
  }

  /** 0..1 how far the bow is drawn (or how charged the spell is). */
  draw(f: number) { this.drawF = Math.max(0, Math.min(1, f)); }

  /** Let go: the string snaps forward / the staff thrusts and flashes. */
  shoot() { this.shootT = 0; this.drawF = 0; }

  setWeapon(kind: string) {
    this.holder.remove(this.tool);
    this.tool = (MAKERS[kind] ?? pick)();
    this.tool.scale.setScalar(0.7);
    this.tool.visible = this.cls === "quarryman";
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
    this.time += dt;
    this.swingT += dt / this.swingLen;
    this.shootT = Math.min(1, this.shootT + dt / 0.25);
    const walk = Math.sin(this.bob * 2) * 0.012 * Math.min(1, speed / 4);
    if (this.cls === "archer") this.updateBow(walk, down);
    else if (this.cls === "mage") this.updateStaff(walk, down);
    else this.updateTool(walk, down);
  }

  private updateTool(walk: number, down: boolean) {
    // raise, then chop down hard, then come back up
    const s = this.swingT;
    let lift = 0, chop = 0;
    if (s < 0.25) lift = s / 0.25;
    else if (s < 0.45) { lift = 1 - (s - 0.25) / 0.2; chop = (s - 0.25) / 0.2; }
    else if (s < 1) chop = 1 - (s - 0.45) / 0.55;
    this.tool.position.set(0.3 - chop * 0.1, -0.3 + lift * 0.18 - chop * 0.12 + walk, -0.3);
    this.tool.rotation.set(0.9 + lift * 0.9 - chop * 1.5, 0.15, 0.25 + chop * 0.3);
    this.tool.visible = !down;
  }

  // 0..1..0 hump over the length of a swing, for the short bash of a bow or staff
  private bash() { return this.swingT < 1 ? Math.sin(Math.PI * Math.max(0, this.swingT)) : 0; }

  private updateBow(walk: number, down: boolean) {
    const b = this.bow, f = this.drawF, kick = 1 - this.shootT;
    const bash = this.bash();
    b.g.visible = !down;
    b.g.position.set(-0.14 + bash * 0.1, -0.1 + walk + bash * 0.04, -0.62 + kick * 0.04 - bash * 0.12);
    b.g.rotation.set(0.05 - bash * 0.5, 0.12 - bash * 0.5, 0.08 + kick * 0.05);
    // string: pulled back toward the camera, with a tremble when fully drawn
    const shake = f > 0.9 ? Math.sin(this.time * 70) * 0.003 * ((f - 0.9) / 0.1) : 0;
    // after release the string overshoots forward and settles
    const snap = kick > 0 ? -Math.sin(kick * 20) * 0.05 * kick * kick : 0;
    const nock = _b.set(shake, shake, b.tipTop.z + f * 0.35 + snap);
    segment(b.s1, b.tipTop, nock);
    segment(b.s2, b.tipBot, nock);
    b.arrow.visible = f > 0;
    b.arrow.position.copy(nock);
  }

  private updateStaff(walk: number, down: boolean) {
    const st = this.staff, f = this.drawF;
    const bash = this.bash();
    const thrust = this.shootT < 1 ? Math.sin(Math.PI * Math.min(1, this.shootT * 1.6)) : 0;
    st.g.visible = !down;
    st.g.position.set(0.28 - bash * 0.12, -0.34 + walk + bash * 0.05, -0.38 - thrust * 0.22 - bash * 0.1);
    st.g.rotation.set(0.35 + thrust * 0.15 - bash * 0.7, -0.05 + bash * 0.4, 0.12);
    // gentle pulse, growing and brightening with charge, flaring on release
    const flash = this.shootT < 1 ? Math.pow(1 - this.shootT, 2) : 0;
    const pulse = 1 + Math.sin(this.time * 3.2) * 0.06;
    const size = pulse * (1 + 0.6 * f) * (1 + flash * 0.5);
    st.orb.scale.setScalar(size);
    st.orbMat.color.set(GLOW).lerp(new THREE.Color("#ffffff"), Math.min(1, f * 0.5 + flash));
    st.light.intensity = (1.2 + Math.sin(this.time * 3.2) * 0.2) * (1 + f * 1.5) + flash * 6;
  }
}
