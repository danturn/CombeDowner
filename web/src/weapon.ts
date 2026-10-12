// What you hold: fists, the rifle and the sniper rifle. First-person models, firing rules (rate,
// spread, recoil, rounds) and world effects.
import * as THREE from "three";

export type GunKind = "fists" | "rifle" | "sniper";
export const SLOTS: GunKind[] = ["fists", "rifle", "sniper"];   // keys 1, 2, 3

export interface Gun {
  label: string;
  mag: number;        // rounds it holds (0: fists, never run out)
  interval: number;   // seconds between shots
  body: number; head: number;
  range: number;
  adsFov: number;     // field of view aiming down the sights
  zoom: number;       // how much aiming slows the mouse
  recoil: number;
}

export const GUNS: Record<GunKind, Gun> = {
  fists: { label: "Fists", mag: 0, interval: 0.45, body: 20, head: 35, range: 2, adsFov: 72, zoom: 0, recoil: 0.004 },
  rifle: { label: "Rounds", mag: 30, interval: 0.1, body: 22, head: 55, range: 400, adsFov: 45, zoom: 0.45, recoil: 0.011 },
  // one round at a time, then the bolt has to be worked before the next
  sniper: { label: "Sniper", mag: 10, interval: 2.2, body: 80, head: 200, range: 550, adsFov: 11, zoom: 0.85, recoil: 0.06 },
};

export const MAG = GUNS.rifle.mag;
export const RESERVE = 120;          // spare rifle rounds you spawn with
export const MAX_RESERVE = 240;
export const RELOAD_TIME = 1.9;
export const SWITCH_TIME = 0.35;
const BOLT_START = 0.3, BOLT_END = 1.5;   // seconds after a sniper shot that the bolt is worked

export const damage = (kind: GunKind, head: boolean) => (head ? GUNS[kind].head : GUNS[kind].body);

const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
};
const tube = (r: number, len: number, color: string, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
};

/** The sniper rifle: long barrel, scope and a wooden stock. Also used for the pickup lying in the world. */
export function sniperModel(hands = true): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.065, 0.08, 0.36, "#3b3f36", 0, 0, 0));            // receiver
  g.add(box(0.03, 0.03, 0.62, "#2a2c2e", 0, 0.01, -0.48));      // barrel
  g.add(box(0.045, 0.045, 0.07, "#2a2c2e", 0, 0.01, -0.81));    // muzzle brake
  g.add(box(0.06, 0.11, 0.32, "#6b4a2b", 0, -0.03, 0.3));       // stock
  g.add(box(0.055, 0.04, 0.14, "#7a5733", 0, 0.04, 0.28));      // cheek rest
  g.add(box(0.045, 0.1, 0.05, "#2a2c2e", 0, -0.08, 0.1));       // grip
  g.add(box(0.05, 0.07, 0.08, "#2a2c2e", 0, -0.07, -0.02));     // magazine
  g.add(box(0.06, 0.015, 0.015, "#2a2c2e", 0.05, 0.02, 0.08));  // bolt handle
  g.add(tube(0.032, 0.3, "#1c1e20", 0, 0.09, -0.02));           // scope
  g.add(tube(0.042, 0.06, "#1c1e20", 0, 0.09, -0.19));          // objective bell
  g.add(tube(0.038, 0.05, "#1c1e20", 0, 0.09, 0.14));           // eyepiece
  g.add(box(0.02, 0.04, 0.02, "#2a2c2e", 0, 0.055, -0.1));      // mounts
  g.add(box(0.02, 0.04, 0.02, "#2a2c2e", 0, 0.055, 0.06));
  if (hands) {
    g.add(box(0.09, 0.08, 0.16, "#c49a7c", 0.005, -0.06, -0.3));  // front hand
    g.add(box(0.08, 0.09, 0.12, "#c49a7c", 0.01, -0.09, 0.12));   // back hand
  }
  return g;
}

function rifleModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.07, 0.09, 0.42, "#4a4f55", 0, 0, -0.05));        // receiver
  g.add(box(0.04, 0.04, 0.34, "#3a3e43", 0, 0.015, -0.43));     // barrel
  g.add(box(0.06, 0.06, 0.18, "#5d5442", 0, 0.005, -0.33));     // handguard
  g.add(box(0.05, 0.14, 0.07, "#3a3e43", 0, -0.11, -0.07));     // magazine
  g.add(box(0.045, 0.1, 0.05, "#3a3e43", 0, -0.08, 0.1));       // grip
  g.add(box(0.06, 0.08, 0.2, "#5d5442", 0, -0.02, 0.24));       // stock
  g.add(box(0.03, 0.035, 0.1, "#222", 0, 0.065, -0.02));        // sight
  g.add(box(0.008, 0.02, 0.008, "#e04030", 0, 0.088, -0.05));   // red dot
  g.add(box(0.09, 0.08, 0.16, "#c49a7c", 0.005, -0.07, -0.3));  // front hand
  g.add(box(0.08, 0.09, 0.12, "#c49a7c", 0.01, -0.09, 0.12));   // back hand
  return g;
}

/** Two fists with a bit of sleeve, held up in front. */
function fist(x: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.1, 0.1, 0.12, "#c49a7c", 0, 0, 0));               // fist
  g.add(box(0.03, 0.03, 0.05, "#b58a6c", 0.035, 0.05, -0.02));  // thumb knuckle
  g.add(box(0.11, 0.11, 0.3, "#3d4651", 0, -0.02, 0.2));        // sleeve
  g.position.set(x, 0, 0);
  return g;
}

export class Weapon {
  /** Rendered in its own pass over the world so it never pokes into walls. */
  readonly scene = new THREE.Scene();
  readonly model = new THREE.Group();
  kind: GunKind = "rifle";
  ammo = MAG;           // rifle rounds in the magazine
  reserve = RESERVE;    // spare rifle rounds
  hasSniper = false;
  sniperAmmo = 0;
  reloading = 0;
  cooldown = 0;
  private sniperCool = 0;   // the bolt keeps cycling while you hold something else
  switching = 0;
  aim = 0;          // 0 hip .. 1 aiming down sights, eased
  kick = 0;
  /** Where the scope has drifted to, in radians (yaw, pitch). */
  readonly drift = new THREE.Vector2();
  private models: Record<GunKind, THREE.Group>;
  private fists: THREE.Group[];
  private jab = 0;      // which fist threw the last punch
  private flash: THREE.Mesh;
  private flashLight: THREE.PointLight;
  private flashT = 0;
  private sway = new THREE.Vector2();
  private t = 0;

  constructor() {
    this.scene.add(new THREE.HemisphereLight("#dfe8f0", "#5a5540", 2.2));
    const sun = new THREE.DirectionalLight("#fff0d8", 1.6);
    sun.position.set(-1, 2, 1);
    this.scene.add(sun);
    const fists = new THREE.Group();
    this.fists = [fist(-0.2), fist(0.06)];
    fists.add(...this.fists);
    this.models = { fists, rifle: rifleModel(), sniper: sniperModel() };
    for (const m of Object.values(this.models)) this.model.add(m);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.flash.visible = false;
    this.model.add(this.flash);
    this.flashLight = new THREE.PointLight("#ffcf80", 0, 4);
    this.model.add(this.flashLight);
    this.model.scale.setScalar(0.72);
    this.scene.add(this.model);
    this.show();
  }

  get gun() { return GUNS[this.kind]; }
  /** Rounds left in what you're holding (Infinity for fists). */
  get rounds() { return this.kind === "fists" ? Infinity : this.kind === "sniper" ? this.sniperAmmo : this.ammo; }
  get canFire() { return this.cooldown <= 0 && this.reloading <= 0 && this.switching <= 0 && this.rounds > 0; }
  /** True while the bolt is being worked after a sniper shot. */
  get rechambering() {
    const since = this.gun.interval - this.cooldown;
    return this.kind === "sniper" && this.cooldown > 0 && since > BOLT_START && since < BOLT_END;
  }
  /** Can this be picked with its number key: fists always, guns while they have rounds. */
  has(kind: GunKind) {
    return kind === "fists" || (kind === "rifle" ? this.ammo + this.reserve > 0 : this.hasSniper && this.sniperAmmo > 0);
  }

  fire() {
    if (this.kind === "sniper") this.sniperAmmo--;
    else if (this.kind === "rifle") this.ammo--;
    this.cooldown = this.gun.interval;
    this.kick = 1;
    if (this.kind === "fists") { this.jab ^= 1; return; }
    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
  }

  /** A click with nothing to fire. */
  dry() { this.cooldown = 0.3; }

  startReload(): boolean {
    if (this.kind !== "rifle" || this.reloading > 0 || this.ammo === MAG || this.reserve <= 0) return false;
    this.reloading = RELOAD_TIME;
    return true;
  }

  /** Back to how you spawn: the rifle, a full magazine, spare rounds, no sniper. */
  reset() {
    Object.assign(this, { kind: "rifle", ammo: MAG, reserve: RESERVE, hasSniper: false, sniperAmmo: 0, reloading: 0, cooldown: 0, sniperCool: 0, switching: 0, aim: 0 });
    this.show();
  }

  giveSniper() {
    this.hasSniper = true;
    this.sniperAmmo = GUNS.sniper.mag;
    this.select("sniper");
  }

  /** Change weapon. Returns false if you're already holding it or it has nothing to fire. */
  select(kind: GunKind): boolean {
    if (kind === this.kind || !this.has(kind)) return false;
    if (this.kind === "sniper") this.sniperCool = this.cooldown;
    this.kind = kind;
    this.reloading = 0;
    this.cooldown = kind === "sniper" ? this.sniperCool : 0;
    this.switching = SWITCH_TIME;
    this.show();
    return true;
  }

  private show() {
    for (const [k, m] of Object.entries(this.models)) m.visible = k === this.kind;
    const z = this.kind === "sniper" ? -0.88 : -0.66;
    this.flash.position.set(0, 0.015, z);
    this.flashLight.position.set(0, 0.02, z - 0.04);
  }

  /** Spread cone half-angle in radians. */
  spread(moving: number, airborne: boolean) {
    if (this.kind === "fists") return 0;
    if (this.kind === "sniper") return (0.06 - 0.0595 * this.aim) + moving * 0.012 * (1 - this.aim * 0.5) + (airborne ? 0.05 : 0);
    return (0.012 - 0.0105 * this.aim) + moving * 0.0025 * (1 - this.aim * 0.6) + (airborne ? 0.03 : 0);
  }

  update(dt: number, camera: THREE.PerspectiveCamera, wantAim: boolean, bob: number, speed: number, sprinting: boolean, crouch: number, lookDx: number, lookDy: number) {
    this.t += dt;
    this.cooldown -= dt;
    this.sniperCool -= dt;
    this.switching = Math.max(0, this.switching - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const take = Math.min(MAG - this.ammo, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      }
    }
    const canAim = this.kind !== "fists" && this.reloading <= 0 && this.switching <= 0 && !this.rechambering && !sprinting;
    this.aim += ((wantAim && canAim ? 1 : 0) - this.aim) * Math.min(1, dt * (this.kind === "sniper" ? 9 : 14));
    this.kick *= Math.max(0, 1 - dt * (this.kind === "fists" ? 9 : 18));
    this.sway.x += (-lookDx * 0.0004 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (lookDy * 0.0004 - this.sway.y) * Math.min(1, dt * 10);

    // The scope wanders in a slow figure of eight, more on the move, less crouched.
    const s = this.kind === "sniper" ? this.aim * (0.0055 + Math.min(1, speed / 5) * 0.006) * (1 - crouch * 0.5) : 0;
    const t = this.t;
    this.drift.set(
      (Math.sin(t * 0.83) + Math.sin(t * 2.1 + 1) * 0.3) * s,
      (Math.sin(t * 1.66 + 0.5) * 0.6 + Math.sin(t * 2.9) * 0.25) * s,
    );

    const hip = new THREE.Vector3(0.2, -0.18, -0.36), ads = this.kind === "sniper" ? new THREE.Vector3(0, -0.065, -0.2) : new THREE.Vector3(0, -0.072, -0.24);
    if (this.kind === "fists") hip.set(0.07, -0.13, -0.32);
    const p = hip.lerp(ads, this.aim);
    const bobAmt = Math.min(1, speed / 5) * (1 - this.aim * 0.85);
    p.x += Math.sin(bob) * 0.012 * bobAmt + this.sway.x;
    p.y += Math.abs(Math.cos(bob)) * 0.012 * bobAmt + this.sway.y;
    if (this.kind !== "fists") p.z += this.kick * (this.kind === "sniper" ? 0.1 : 0.06);
    if (sprinting) p.y -= 0.05;
    const rl = this.reloading > 0 ? Math.sin((1 - this.reloading / RELOAD_TIME) * Math.PI) : 0;
    p.y -= rl * 0.12;
    // working the bolt: the rifle dips and rolls towards you
    const since = this.gun.interval - this.cooldown;
    const bolt = this.kind === "sniper" && this.cooldown > 0 ? Math.max(0, Math.sin(((since - BOLT_START) / (BOLT_END - BOLT_START)) * Math.PI)) * (since < BOLT_END ? 1 : 0) : 0;
    p.y -= bolt * 0.05;
    const sw = this.switching / SWITCH_TIME;
    p.y -= sw * 0.3;
    this.model.position.copy(p).applyQuaternion(camera.quaternion).add(camera.position);
    this.model.quaternion.copy(camera.quaternion);
    this.model.rotateX(this.kick * (this.kind === "sniper" ? 0.12 : this.kind === "fists" ? 0 : 0.06) - rl * 0.5 - sw * 0.6);
    this.model.rotateZ(rl * 0.4 + bolt * 0.35 + (sprinting ? 0.35 : 0));
    this.model.rotateY(sprinting ? 0.45 : 0);
    // a punch: the fist shoots forward and back
    this.fists.forEach((f, i) => { f.position.z = i === this.jab ? -this.kick * 0.32 : 0; f.position.y = i === this.jab ? this.kick * 0.04 : 0; });
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.flashLight.intensity = this.flashT > 0 ? 3 : 0;
  }
}

/** Tracers, bullet impacts and hit puffs in the world. */
export class Effects {
  private items: { obj: THREE.Object3D; life: number; max: number; vel?: THREE.Vector3; mat: THREE.Material & { opacity: number } }[] = [];
  private puffGeo = new THREE.IcosahedronGeometry(0.08, 0);

  constructor(private scene: THREE.Scene) {}

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = "#ffe6a0", life = 0.07) {
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, fog: true });
    const line = new THREE.Line(g, mat);
    this.scene.add(line);
    this.items.push({ obj: line, life, max: life, mat });
  }

  impact(at: THREE.Vector3, normal: THREE.Vector3, color: string, n = 6) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const m = new THREE.Mesh(this.puffGeo, mat);
      m.position.copy(at);
      const v = normal.clone().multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(2.2));
      this.scene.add(m);
      this.items.push({ obj: m, life: 0.45, max: 0.45, vel: v, mat });
    }
  }

  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.vel) { it.vel.y -= 9 * dt; it.obj.position.addScaledVector(it.vel, dt); }
      it.mat.opacity = Math.max(0, it.life / it.max);
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        if (it.obj instanceof THREE.Line) it.obj.geometry.dispose();
        it.mat.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
