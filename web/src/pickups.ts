// Things to pick up. Some stay put at landmarks: the sniper rifle in the middle of Firs Field,
// pints outside the two pubs and the Prior Park portico, and a bottle of Co-op Bucks Fizz outside
// the corner shop. Boxes of rounds for the rifle and the sniper turn up at random spots on the
// streets and paths, somewhere new each time. Chavs sometimes drop something when they go down.
//
// The host owns the list: it places everything, decides who gets each item (the first claim it
// hears, so two players can't both take one) and sends the list round. Everyone else draws it.
import * as THREE from "three";
import { GameMap, PATHS } from "./map";
import { sniperModel } from "./weapon";

export type Kind = "sniper" | "pint" | "fizz" | "ammo" | "sammo";
const KINDS: Kind[] = ["sniper", "pint", "fizz", "ammo", "sammo"];
export const PINT_HEAL = 40;
export const AMMO_PICKUP = 60;      // rifle rounds in a box
export const SNIPER_PICKUP = 5;     // sniper rounds in a box
const REACH = 1.3;
const DROP_LIFE = 45;               // seconds a chav's drop lies about
const DROPS: [Kind, number][] = [["pint", 0.3], ["ammo", 0.3], ["sammo", 0.08], ["fizz", 0.04]];   // chance of each
export const BLIP: Record<Kind, string> = { sniper: "#5fd0ff", pint: "#f2b134", fizz: "#ff8a2a", ammo: "#9fd36a", sammo: "#d9b23a" };

export interface Item { id: number; kind: Kind; x: number; z: number; ttl: number; obj: THREE.Group }
interface Slot { kind: Kind; at?: [number, number]; respawn: number; timer: number }

export class Pickups {
  readonly items = new Map<number, Item>();
  private slots: Slot[] = [];
  private spots: [number, number][] = [];   // where random boxes can turn up
  private group = new THREE.Group();
  private models: Record<Kind, THREE.Group>;
  private nextId = 1000 + Math.floor(Math.random() * 1e6);
  private t = 0;

  constructor(private map: GameMap, scene: THREE.Scene) {
    scene.add(this.group);
    this.models = buildModels();
    const D = map.d;
    const fixed = (kind: Kind, at: [number, number] | null, respawn: number) => { if (at) this.slots.push({ kind, at, respawn, timer: 0 }); };
    // the middle of Firs Field
    if (D.spawn?.length) {
      const n = D.spawn.length;
      fixed("sniper", this.clear(D.spawn.reduce((s, p) => s + p[0], 0) / n, -D.spawn.reduce((s, p) => s + p[1], 0) / n), 60);
    }
    // just in front of a sign or landmark: its local +z faces out, which is (sin a, cos a) in the scene
    const front = (x: number, y: number, a: number, d: number) => this.clear(x + Math.sin(a) * d, -y + Math.cos(a) * d);
    for (const [kind, x, y, , a] of D.lm ?? []) if (kind === "portico") fixed("pint", front(+x, +y, +a, 9), 30);
    for (const [x, y, , a, , name, style] of D.sh ?? []) {
      if (style === "pub") fixed("pint", front(+x, +y, +a, 2.5), 30);
      if (name === "Nisa Local") fixed("fizz", front(+x, +y, +a, 2.5), 90);
    }
    for (const r of D.rd) {
      const step = PATHS.has(r.c) ? 4 : 3;
      for (let i = 0; i < r.p.length; i += step) {
        const x = r.p[i][0], z = -r.p[i][1];
        if (Math.hypot(x, z) < map.field * 0.9 && !map.blocked(x, z, 0.6)) this.spots.push([x, z]);
      }
    }
    if (this.spots.length) {
      for (let i = 0; i < 14; i++) this.slots.push({ kind: "ammo", respawn: 25, timer: 0 });
      for (let i = 0; i < 5; i++) this.slots.push({ kind: "sammo", respawn: 40, timer: 0 });
    }
  }

  /** The nearest open ground to (x, z), so nothing sits inside a wall or a tree. */
  private clear(x: number, z: number): [number, number] | null {
    for (let r = 0; r <= 8; r++) {
      for (let k = 0, n = r ? 12 : 1; k < n; k++) {
        const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (!this.map.blocked(px, pz, 0.6)) return [px, pz];
      }
    }
    return null;
  }

  /** A random spot on a street or path, away from the other items. */
  private randomSpot(): [number, number] {
    let best = this.spots[0], bestScore = -1;
    for (let i = 0; i < 12; i++) {
      const s = this.spots[Math.floor(Math.random() * this.spots.length)];
      let d = 150;
      for (const it of this.items.values()) d = Math.min(d, Math.hypot(it.x - s[0], it.z - s[1]));
      const score = d + Math.random() * 25;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  private add(id: number, kind: Kind, x: number, z: number, ttl = 0) {
    this.remove(id);
    const obj = new THREE.Group();
    obj.add(this.models[kind].clone());
    obj.position.set(x, this.map.ground(x, z), z);
    this.group.add(obj);
    this.items.set(id, { id, kind, x, z, ttl, obj });
  }

  private remove(id: number): Item | undefined {
    const it = this.items.get(id);
    if (it) { this.group.remove(it.obj); this.items.delete(id); }
    return it;
  }

  /** Someone took it. A fixed or random item comes back after a while. */
  take(id: number): Item | undefined {
    const it = this.remove(id);
    if (this.slots[id]) this.slots[id].timer = this.slots[id].respawn;
    return it;
  }

  /** Host only: maybe leave something where a chav went down. Returns true if it did. */
  drop(x: number, z: number): boolean {
    let r = Math.random();
    for (const [kind, p] of DROPS) {
      if (r < p) { this.add(this.nextId++, kind, x, z, DROP_LIFE); return true; }
      r -= p;
    }
    return false;
  }

  /** Host only: bring items back and clear away old drops. Returns true if the list changed. */
  host(dt: number): boolean {
    let changed = false;
    this.slots.forEach((s, id) => {
      if (this.items.has(id)) return;
      s.timer -= dt;
      if (s.timer > 0) return;
      const [x, z] = s.at ?? this.randomSpot();
      this.add(id, s.kind, x, z);
      changed = true;
    });
    for (const it of [...this.items.values()]) {
      if (it.ttl > 0 && (it.ttl -= dt) <= 0) { this.remove(it.id); changed = true; }
    }
    return changed;
  }

  /** The list as the host sends it: id, kind, x, z (decimetres), seconds left for drops. */
  snapshot(): number[][] {
    return [...this.items.values()].map((it) => [it.id, KINDS.indexOf(it.kind), Math.round(it.x * 10), Math.round(it.z * 10), Math.ceil(it.ttl)]);
  }

  /** Take on the host's list. */
  apply(d: number[][]) {
    if (!Array.isArray(d)) return;
    const seen = new Set<number>();
    for (const e of d) {
      if (!Array.isArray(e) || !KINDS[e[1]]) continue;
      const [id, k, x, z, ttl] = e, kind = KINDS[k], it = this.items.get(id);
      seen.add(id);
      if (it && it.kind === kind && Math.abs(it.x - x / 10) < 0.2 && Math.abs(it.z - z / 10) < 0.2) { it.ttl = ttl || 0; continue; }
      this.add(id, kind, x / 10, z / 10, ttl || 0);
    }
    for (const id of [...this.items.keys()]) if (!seen.has(id)) this.remove(id);
    // whatever's missing is already counting down somewhere, so don't bring it straight back if we become host
    this.slots.forEach((s, id) => { if (!seen.has(id) && s.timer <= 0) s.timer = s.respawn; });
  }

  /** Items within reach of feet at (x, y, z). */
  near(x: number, y: number, z: number): Item[] {
    const out: Item[] = [];
    for (const it of this.items.values()) {
      if (Math.hypot(it.x - x, it.z - z) < REACH && Math.abs(it.obj.position.y - y) < 2) out.push(it);
    }
    return out;
  }

  /** Spin and bob. */
  update(dt: number) {
    this.t += dt;
    for (const it of this.items.values()) {
      const m = it.obj.children[0], spin = m.children[0];
      spin.rotation.y = this.t * 1.6 + it.id;
      spin.position.y = 0.55 + Math.sin(this.t * 2.4 + it.id) * 0.08;
      // a drop that's about to go blinks
      m.visible = !(it.ttl > 0 && it.ttl < 8 && Math.sin(this.t * 14) < 0);
    }
  }
}

// ---- models -------------------------------------------------------------------------------------
function buildModels(): Record<Kind, THREE.Group> {
  const mat = (color: string, emissive = "#000000") => new THREE.MeshLambertMaterial({ color, emissive });
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; return o; };

  const make = (kind: Kind, item: THREE.Object3D, scale: number) => {
    const root = new THREE.Group(), spin = new THREE.Group();
    item.scale.setScalar(scale);
    spin.add(item);
    // a glowing ring on the ground so it stands out
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.58, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: BLIP[kind], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.y = 0.16;   // clear of kerbs and pavements
    root.add(spin, ring);
    return root;
  };

  // a pint of best: amber with a creamy head
  const pint = new THREE.Group();
  pint.add(mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.28, 16), mat("#b8731b", "#3a2206"), 0, 0, 0));
  pint.add(mesh(new THREE.CylinderGeometry(0.103, 0.1, 0.05, 16), mat("#f2e8cf", "#2a2620"), 0, 0.165, 0));

  // Co-op Bucks Fizz: orange in the bottle, gold foil, the Co-op blue label
  const fizz = new THREE.Group();
  const orange = mat("#f08a1c", "#3a1c02");
  fizz.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 16), orange, 0, 0, 0));
  fizz.add(mesh(new THREE.CylinderGeometry(0.022, 0.06, 0.07, 16), orange, 0, 0.155, 0));
  fizz.add(mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.1, 12), mat("#d9b23a", "#2a2008"), 0, 0.235, 0));
  const label = mesh(new THREE.CylinderGeometry(0.0615, 0.0615, 0.09, 24, 1, true), new THREE.MeshLambertMaterial({ map: coopLabel(), emissive: "#0a2a38" }), 0, -0.01, 0);
  fizz.add(label);

  // a green ammo tin with a yellow band
  const ammo = new THREE.Group();
  ammo.add(mesh(new THREE.BoxGeometry(0.42, 0.24, 0.22), mat("#4d5a33", "#141a0c")));
  ammo.add(mesh(new THREE.BoxGeometry(0.43, 0.04, 0.23), mat("#d9b23a", "#2a2008"), 0, 0.06, 0));
  ammo.add(mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), mat("#2a2c2e"), 0, 0.135, 0));

  // a box of sniper rounds with five brass cartridges standing on top
  const sammo = new THREE.Group();
  sammo.add(mesh(new THREE.BoxGeometry(0.26, 0.12, 0.16), mat("#2f3338", "#0c0e10")));
  const brass = mat("#c99a3a", "#2a1e08"), round = new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8);
  for (let i = 0; i < 5; i++) sammo.add(mesh(round, brass, -0.09 + i * 0.045, 0.12, 0));

  const sniper = sniperModel(false);
  sniper.rotation.z = 0.2;

  return {
    pint: make("pint", pint, 1.6),
    fizz: make("fizz", fizz, 1.7),
    ammo: make("ammo", ammo, 1.3),
    sammo: make("sammo", sammo, 1.5),
    sniper: make("sniper", sniper, 1.4),
  };
}

function coopLabel(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#00b1e7";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#fff";
  g.font = "700 26px Arial, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("co-op", 64, 24);
  g.fillText("co-op", 192, 24);
  g.font = "700 14px Arial, sans-serif";
  g.fillText("BUCKS FIZZ", 64, 50);
  g.fillText("BUCKS FIZZ", 192, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
