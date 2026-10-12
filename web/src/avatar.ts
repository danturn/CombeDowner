// Other players: a simple figure with a name tag, smoothed between network updates, plus hitboxes.
import * as THREE from "three";
import { nameLabel } from "./textures";

export interface Snap { t: number; x: number; y: number; z: number; yaw: number; pitch: number; crouch: number }

const DELAY = 110; // ms behind real time, so there are always two snapshots to blend between

export class Avatar {
  readonly root = new THREE.Group();
  private body: THREE.Group;
  private head: THREE.Mesh;
  private gun: THREE.Mesh;
  private label: THREE.Sprite;
  private snaps: Snap[] = [];
  alive = true;
  private deadT = 0;
  // smoothed pose, used for drawing and for hit tests
  x = 0; y = 0; z = 0; yaw = 0; pitch = 0; crouch = 0;

  constructor(name: string, colour: string) {
    const col = new THREE.Color(colour);
    const cloth = new THREE.MeshLambertMaterial({ color: col });
    const dark = new THREE.MeshLambertMaterial({ color: col.clone().multiplyScalar(0.45) });
    const skin = new THREE.MeshLambertMaterial({ color: "#c79a7a" });
    this.body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 10), cloth);
    torso.position.y = 1.12;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.78, 0.24), dark);
    legs.position.y = 0.4;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), skin);
    this.head.position.y = 1.62;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    cap.position.y = 1.65;
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.7), new THREE.MeshLambertMaterial({ color: "#25282b" }));
    this.gun.position.set(0.18, 1.32, -0.3);
    this.body.add(torso, legs, this.head, cap, this.gun);
    this.body.traverse((o) => { o.castShadow = true; });
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameLabel(name, colour), depthTest: false, transparent: true }));
    this.label.scale.set(1.6, 0.4, 1);
    this.label.position.y = 2.15;
    this.label.renderOrder = 10;
    this.root.add(this.body, this.label);
  }

  setName(name: string, colour: string) {
    (this.label.material.map as THREE.Texture).dispose();
    this.label.material.map = nameLabel(name, colour);
  }

  push(s: Snap) {
    if (!this.snaps.length) Object.assign(this, { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, crouch: s.crouch });
    this.snaps.push(s);
    if (this.snaps.length > 30) this.snaps.shift();
  }

  /** Jump straight to a position (respawns), dropping old snapshots. */
  teleport() { this.snaps = this.snaps.slice(-1); }

  update(now: number, dt: number) {
    const t = now - DELAY, S = this.snaps;
    if (S.length) {
      let a = S[0], b = S[S.length - 1];
      for (let i = 0; i < S.length - 1; i++) if (S[i].t <= t && S[i + 1].t >= t) { a = S[i]; b = S[i + 1]; break; }
      if (t >= b.t) a = b;
      const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
      const far = Math.hypot(b.x - a.x, b.z - a.z) > 8;   // a respawn: don't slide across the map
      const k = far ? 1 : f;
      this.x = a.x + (b.x - a.x) * k; this.y = a.y + (b.y - a.y) * k; this.z = a.z + (b.z - a.z) * k;
      let dy = b.yaw - a.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw = a.yaw + dy * k;
      this.pitch = a.pitch + (b.pitch - a.pitch) * k;
      this.crouch = a.crouch + (b.crouch - a.crouch) * k;
    }
    this.root.position.set(this.x, this.y, this.z);
    this.body.rotation.y = this.yaw;
    this.body.scale.y = 1 - this.crouch * 0.33;
    this.gun.rotation.x = this.pitch;
    if (this.alive) {
      this.deadT = 0;
      this.body.rotation.x = 0;
      this.root.visible = true;
    } else {
      this.deadT += dt;
      this.body.rotation.x = -Math.min(Math.PI / 2, this.deadT * 5);
      this.root.visible = this.deadT < 2.5;
    }
    this.label.visible = this.alive;
  }

  /**
   * Ray against this player's hitboxes (vertical cylinder for the body, sphere for the head).
   * Returns the distance and whether the head was hit, or null.
   */
  hit(o: THREE.Vector3, d: THREE.Vector3): { dist: number; head: boolean } | null {
    if (!this.alive) return null;
    const s = 1 - this.crouch * 0.33;
    const hy = this.y + 1.62 * s, hr = 0.22;
    let best: { dist: number; head: boolean } | null = null;
    // head sphere
    const ox = o.x - this.x, oy = o.y - hy, oz = o.z - this.z;
    const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - hr * hr, disc = b * b - c;
    if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0) best = { dist: t, head: true }; }
    // body cylinder
    const r = 0.36, y0 = this.y, y1 = this.y + 1.45 * s;
    const a2 = d.x * d.x + d.z * d.z;
    if (a2 > 1e-9) {
      const fx = o.x - this.x, fz = o.z - this.z;
      const b2 = fx * d.x + fz * d.z, c2 = fx * fx + fz * fz - r * r, disc2 = b2 * b2 - a2 * c2;
      if (disc2 >= 0) {
        for (const t of [(-b2 - Math.sqrt(disc2)) / a2, (-b2 + Math.sqrt(disc2)) / a2]) {
          const y = o.y + d.y * t;
          if (t > 0 && y >= y0 && y <= y1) { if (!best || t < best.dist) best = { dist: t, head: false }; break; }
        }
      }
    }
    return best;
  }
}

export const COLOURS = ["#e8553f", "#3f9be8", "#f2b134", "#5fc46a", "#b06be0", "#ef7fb4", "#3fd0c9", "#f08a2e"];
export function colourFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOURS[h % COLOURS.length];
}
