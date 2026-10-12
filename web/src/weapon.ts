// The rifle: first-person model, firing rules (rate, spread, recoil, magazine) and world effects.
import * as THREE from "three";

export const MAG = 30;
export const FIRE_INTERVAL = 0.1;
export const RELOAD_TIME = 1.9;
export const DAMAGE_BODY = 22;
export const DAMAGE_HEAD = 55;
export const RANGE = 400;

const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
};

export class Weapon {
  /** Rendered in its own pass over the world so it never pokes into walls. */
  readonly scene = new THREE.Scene();
  readonly model = new THREE.Group();
  ammo = MAG;
  reloading = 0;
  cooldown = 0;
  aim = 0;          // 0 hip .. 1 aiming down sights, eased
  kick = 0;
  private flash: THREE.Mesh;
  private flashLight: THREE.PointLight;
  private flashT = 0;
  private sway = new THREE.Vector2();

  constructor() {
    this.scene.add(new THREE.HemisphereLight("#dfe8f0", "#5a5540", 2.2));
    const sun = new THREE.DirectionalLight("#fff0d8", 1.6);
    sun.position.set(-1, 2, 1);
    this.scene.add(sun);
    const g = this.model;
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
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.flash.position.set(0, 0.015, -0.66);
    this.flash.visible = false;
    g.add(this.flash);
    this.flashLight = new THREE.PointLight("#ffcf80", 0, 4);
    this.flashLight.position.set(0, 0.02, -0.7);
    g.add(this.flashLight);
    g.scale.setScalar(0.72);
    this.scene.add(g);
  }

  get canFire() { return this.cooldown <= 0 && this.reloading <= 0 && this.ammo > 0; }

  fire() {
    this.ammo--;
    this.cooldown = FIRE_INTERVAL;
    this.kick = 1;
    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
  }

  startReload(): boolean {
    if (this.reloading > 0 || this.ammo === MAG) return false;
    this.reloading = RELOAD_TIME;
    return true;
  }

  /** Spread cone half-angle in radians. */
  spread(moving: number, airborne: boolean) {
    return (0.012 - 0.0105 * this.aim) + moving * 0.0025 * (1 - this.aim * 0.6) + (airborne ? 0.03 : 0);
  }

  update(dt: number, camera: THREE.PerspectiveCamera, wantAim: boolean, bob: number, speed: number, sprinting: boolean, lookDx: number, lookDy: number) {
    this.cooldown -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.ammo = MAG;
    }
    this.aim += ((wantAim && this.reloading <= 0 && !sprinting ? 1 : 0) - this.aim) * Math.min(1, dt * 14);
    this.kick *= Math.max(0, 1 - dt * 18);
    this.sway.x += (-lookDx * 0.0004 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (lookDy * 0.0004 - this.sway.y) * Math.min(1, dt * 10);

    const hip = new THREE.Vector3(0.2, -0.18, -0.36), ads = new THREE.Vector3(0, -0.072, -0.24);
    const p = hip.lerp(ads, this.aim);
    const bobAmt = Math.min(1, speed / 5) * (1 - this.aim * 0.85);
    p.x += Math.sin(bob) * 0.012 * bobAmt + this.sway.x;
    p.y += Math.abs(Math.cos(bob)) * 0.012 * bobAmt + this.sway.y;
    p.z += this.kick * 0.06;
    if (sprinting) p.y -= 0.05;
    const rl = this.reloading > 0 ? Math.sin((1 - this.reloading / RELOAD_TIME) * Math.PI) : 0;
    p.y -= rl * 0.12;
    this.model.position.copy(p).applyQuaternion(camera.quaternion).add(camera.position);
    this.model.quaternion.copy(camera.quaternion);
    this.model.rotateX(this.kick * 0.06 - rl * 0.5);
    this.model.rotateZ(rl * 0.4 + (sprinting ? 0.35 : 0));
    this.model.rotateY(sprinting ? 0.45 : 0);
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

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = "#ffe6a0") {
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, fog: true });
    const line = new THREE.Line(g, mat);
    this.scene.add(line);
    this.items.push({ obj: line, life: 0.07, max: 0.07, mat });
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
