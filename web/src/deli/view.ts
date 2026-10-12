// COMBE DOWN WITH ME: drawing the kitchen. Everything is built from boxes and cylinders in code and
// coloured by hand, like the rest of the game. This only draws: what's where comes from the host's
// Shift (kitchen.ts) and the cooks' positions (game.ts).
//
// Scene units are tiles. Tile (i, j) sits at x = i + 0.5 - W/2, z = j + 0.5 - H/2, with the back
// wall at -z and the camera out front, looking down from the shop.
import * as THREE from "three";
import { nameLabel } from "../textures";
import { CRATES, Food, H, Item, LAYOUT, W, tileAt } from "./kitchen";

export const TOP = 0.9;   // counter height

// ---- materials and shapes, shared by everything ---------------------------------------------
const mats = new Map<string, THREE.MeshLambertMaterial>();
export const mat = (c: string, emissive?: string) => {
  const key = c + (emissive ?? "");
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: c, emissive: emissive ?? "#000000" }); mats.set(key, m); }
  return m;
};
const geos = new Map<string, THREE.BufferGeometry>();
const geo = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geos.get(key);
  if (!g) { g = make(); geos.set(key, g); }
  return g;
};
const box = (w: number, h: number, d: number) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (r1: number, r2: number, h: number, n = 14) => geo(`c${r1},${r2},${h},${n}`, () => new THREE.CylinderGeometry(r1, r2, h, n));
const ball = (r: number) => geo(`s${r}`, () => new THREE.SphereGeometry(r, 14, 10));
function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

const CHAR = "#2b211b";

/** A food, raw (s 0), ready (1) or burnt (2), sitting on y = 0. */
function foodModel(k: Food, s: number): THREE.Group {
  const g = new THREE.Group();
  const burnt = s === 2;
  switch (k) {
    case "bread":
      if (s === 0) {
        g.add(mesh(box(0.38, 0.16, 0.2), mat("#c98a45"), 0, 0.08, 0));
        const top = mesh(cyl(0.1, 0.1, 0.38, 10), mat("#a8682e"), 0, 0.16, 0);
        top.rotation.z = Math.PI / 2; top.scale.set(1, 1, 0.7);
        g.add(top);
      } else for (let n = 0; n < 3; n++) {
        const sl = mesh(box(0.2, 0.03, 0.2), mat(burnt ? CHAR : "#f2deb0"), (n - 1) * 0.03, 0.02 + n * 0.035, (n - 1) * 0.02);
        sl.rotation.y = n * 0.3;
        g.add(sl);
      }
      break;
    case "cheddar":
      if (s === 0) {
        const w = mesh(cyl(0.2, 0.2, 0.15, 3), mat("#f2c23b"), 0, 0.075, 0);
        w.rotation.y = 0.4;
        g.add(w, mesh(box(0.06, 0.15, 0.24), mat("#e0a92a"), -0.08, 0.075, 0));
      } else for (let n = 0; n < 4; n++) g.add(mesh(box(0.09, 0.05, 0.09), mat(burnt ? CHAR : "#f5cf55"), (n % 2 - 0.5) * 0.11, 0.025 + (n > 1 ? 0.05 : 0), (n < 2 ? -0.04 : 0.03)));
      break;
    case "tomato":
      if (s === 0) {
        const t = mesh(ball(0.13), mat("#d8352a"), 0, 0.12, 0);
        t.scale.set(1, 0.85, 1);
        g.add(t, mesh(cyl(0.02, 0.03, 0.05, 6), mat("#3f8a2c"), 0, 0.24, 0));
      } else for (let n = 0; n < 3; n++) {
        const d = mesh(cyl(0.08, 0.08, 0.03, 12), mat(burnt ? CHAR : "#e2453a"), (n - 1) * 0.1, 0.02 + (n === 1 ? 0.02 : 0), (n === 1 ? 0.04 : -0.02));
        g.add(d, mesh(cyl(0.05, 0.05, 0.032, 10), mat(burnt ? CHAR : "#f7907f"), d.position.x, d.position.y + 0.001, d.position.z));
      }
      break;
    case "bacon":
      for (let n = 0; n < 2; n++) {
        const c = burnt ? CHAR : s === 1 ? "#a2462a" : "#f09a96";
        const r = mesh(box(0.36, 0.025, 0.08), mat(c), 0, 0.015 + n * 0.026, (n - 0.5) * 0.1);
        r.rotation.y = (n - 0.5) * 0.25;
        if (s !== 2) r.add(mesh(box(0.36, 0.027, 0.02), mat(s === 1 ? "#d9a06a" : "#fff3ea"), 0, 0, 0.025));
        g.add(r);
      }
      break;
    case "egg":
      if (s === 0) {
        const e = mesh(ball(0.1), mat("#f4ede0"), 0, 0.12, 0);
        e.scale.set(0.85, 1.15, 0.85);
        g.add(e);
      } else {
        const white = mesh(cyl(0.16, 0.17, 0.025, 16), mat(burnt ? "#5a3b22" : "#fbfaf4"), 0, 0.012, 0);
        white.scale.set(1, 1, 0.85);
        const yolk = mesh(ball(0.06), mat(burnt ? CHAR : "#f6a41c"), 0.02, 0.025, 0);
        yolk.scale.set(1, 0.6, 1);
        g.add(white, yolk);
      }
      break;
    case "dough": {
      const bun = mesh(ball(0.15), mat(burnt ? CHAR : s === 1 ? "#b9692a" : "#efdcb4"), 0, 0.06, 0);
      bun.scale.set(1, s === 1 ? 0.75 : 0.55, 1);
      g.add(bun);
      if (s === 1) for (let n = 0; n < 7; n++) {
        const a = n * 2.4, r = 0.03 + (n % 3) * 0.03;
        g.add(mesh(box(0.03, 0.03, 0.03), mat("#ffffff"), Math.cos(a) * r, 0.17 - r * 0.4, Math.sin(a) * r));
      }
      break;
    }
  }
  return g;
}

/** Anything a cook can hold or put down. */
export function itemModel(it: Item): THREE.Group {
  if (it.k !== "plate") return foodModel(it.k, it.s ?? 0);
  const g = new THREE.Group();
  g.add(mesh(cyl(0.25, 0.2, 0.035, 20), mat("#fbfbf6"), 0, 0.018, 0));
  g.add(mesh(cyl(0.17, 0.17, 0.037, 20), mat("#ece9df"), 0, 0.019, 0));
  const on = it.on ?? [];
  on.forEach((f, n) => {
    const m = foodModel(f, 1);
    const a = (n / Math.max(1, on.length)) * Math.PI * 2;
    const r = on.length > 1 ? 0.08 : 0;
    m.scale.setScalar(0.7);
    m.position.set(Math.cos(a) * r, 0.035 + n * 0.02, Math.sin(a) * r);
    g.add(m);
  });
  return g;
}
const itemKey = (it: Item | null | undefined) => (it ? `${it.k}${it.s ?? ""}${it.on?.join(",") ?? ""}` : "");

/** Where a tile's middle is in the scene. */
export const tileX = (i: number) => i + 0.5 - W / 2;
export const tileZ = (j: number) => j + 0.5 - H / 2;

/** A little progress bar floating over a station, turned to face the camera. */
class Bar {
  readonly o = new THREE.Group();
  private fill: THREE.Mesh;
  constructor() {
    const bg = mesh(box(0.62, 0.11, 0.01), mat("#1a1a1a"));
    this.fill = mesh(box(0.56, 0.07, 0.012), new THREE.MeshBasicMaterial({ color: "#5fd35a" }));
    this.fill.position.z = 0.002;
    this.o.add(bg, this.fill);
  }
  set(p: number, colour: string) {
    p = Math.max(0.02, Math.min(1, p));
    this.fill.scale.x = p;
    this.fill.position.x = -0.28 * (1 - p);
    (this.fill.material as THREE.MeshBasicMaterial).color.set(colour);
  }
}

/** A cook: an apron over their colour, a chef's hat and a name over it. */
export class Cook {
  readonly o = new THREE.Group();
  private body = new THREE.Group();
  private knife: THREE.Mesh;
  private hands = new THREE.Group();
  private heldKey = "";
  private heldModel: THREE.Object3D | null = null;
  private label: THREE.Sprite;
  private step = 0;

  constructor(name: string, colour: string) {
    const cloth = mat(colour);
    this.body.add(mesh(cyl(0.22, 0.26, 0.5, 14), cloth, 0, 0.3, 0));
    this.body.add(mesh(box(0.3, 0.38, 0.06), mat("#f5f3ee"), 0, 0.3, 0.22));   // the apron
    this.body.add(mesh(ball(0.17), mat("#f0c39a"), 0, 0.7, 0));
    this.body.add(mesh(cyl(0.13, 0.13, 0.16, 14), mat("#ffffff"), 0, 0.88, 0));
    this.body.add(mesh(ball(0.17), mat("#ffffff"), 0, 1.0, 0));
    for (const s of [-1, 1]) {
      this.body.add(mesh(ball(0.03), mat("#1a1a1a"), s * 0.06, 0.73, 0.15));
      const arm = mesh(cyl(0.05, 0.05, 0.3, 8), cloth, s * 0.2, 0.42, 0.14);
      arm.rotation.x = Math.PI / 2.4;
      this.body.add(arm);
    }
    this.knife = mesh(box(0.03, 0.02, 0.24), mat("#cfd3d6"), 0.18, 0.5, 0.36);
    this.knife.visible = false;
    this.body.add(this.knife, this.hands);
    this.hands.position.set(0, 0.5, 0.36);
    this.o.add(this.body);
    const blob = mesh(cyl(0.3, 0.3, 0.01, 16), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.25, depthWrite: false }), 0, 0.006, 0);
    this.o.add(blob);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameLabel(name, colour), depthTest: false, transparent: true }));
    this.label.scale.set(1.3, 0.33, 1);
    this.label.position.y = 1.45;
    this.label.renderOrder = 5;
    this.o.add(this.label);
  }

  /** x, z in the scene; a = the way they face; speed for the waddle. */
  set(x: number, z: number, a: number, speed: number, chopping: boolean, held: Item | null | undefined, t: number, dt: number) {
    this.o.position.set(x, 0, z);
    this.body.rotation.y = a;
    this.step += dt * speed * 9;
    this.body.position.y = speed > 0.2 ? Math.abs(Math.sin(this.step)) * 0.05 : 0;
    this.body.rotation.z = speed > 0.2 ? Math.sin(this.step) * 0.08 : 0;
    this.knife.visible = chopping;
    if (chopping) this.knife.position.y = 0.5 + Math.abs(Math.sin(t * 14)) * 0.14;
    const k = itemKey(held);
    if (k !== this.heldKey) {
      this.heldKey = k;
      if (this.heldModel) this.hands.remove(this.heldModel);
      this.heldModel = held ? itemModel(held) : null;
      if (this.heldModel) this.hands.add(this.heldModel);
    }
  }
}

/** The tiles' contents and progress bars. */
interface Slot { key: string; o: THREE.Object3D | null; bar: Bar | null; smoke: THREE.Mesh[] }

export class KitchenView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  private slots = new Map<number, Slot>();
  private facing: THREE.Mesh;
  private ovenGlow: THREE.MeshLambertMaterial;

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color("#2a2522");
    s.add(new THREE.HemisphereLight("#fff4e0", "#5a4a40", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(-3, 10, 6);
    s.add(sun);

    // the floor: black and white tiles, and the shop floor out front
    const floorTex = checker();
    floorTex.repeat.set(W, H);
    const floor = mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const shop = mesh(new THREE.PlaneGeometry(W + 12, 10), mat("#6b4a33"));
    shop.rotation.x = -Math.PI / 2;
    shop.position.set(0, -0.01, H / 2 + 5);
    s.add(shop);

    // walls: metro tiles at the back with the deli's name over the pass, low half-walls at the sides
    const wallTex = metro();
    wallTex.repeat.set(W / 2, 1.5);
    const back = mesh(new THREE.PlaneGeometry(W + 0.4, 3), new THREE.MeshLambertMaterial({ map: wallTex }), 0, 1.5, -H / 2);
    s.add(back);
    const sign = mesh(new THREE.PlaneGeometry(4.6, 0.75), new THREE.MeshBasicMaterial({ map: signTex() }), tileX(6.5), 2.3, -H / 2 + 0.02);
    s.add(sign);
    for (const side of [-1, 1]) {
      const w = mesh(box(0.2, 1.2, H + 0.2), mat("#d9d2c4"), side * (W / 2 + 0.1), 0.6, 0);
      s.add(w);
    }
    // the shop counter along the front, with a gap to walk through
    s.add(mesh(box(W + 0.4, 0.5, 0.15), mat("#7b5236"), 0, 0.25, H / 2 + 0.08));

    // counters: one instanced mesh for the cupboards and one for the tops
    const tiles: [number, number, string][] = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (LAYOUT[j][i] !== "." && LAYOUT[j][i] !== "X") tiles.push([i, j, LAYOUT[j][i]]);
    const bodies = new THREE.InstancedMesh(box(0.98, TOP - 0.06, 0.98), mat("#ffffff"), tiles.length);
    const tops = new THREE.InstancedMesh(box(1, 0.06, 1), mat("#ffffff"), tiles.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    tiles.forEach(([i, j, t], n) => {
      m4.makeTranslation(tileX(i), (TOP - 0.06) / 2, tileZ(j));
      bodies.setMatrixAt(n, m4);
      bodies.setColorAt(n, c.set(t === "O" ? "#3b3f44" : t === "H" ? "#55595e" : t in CRATES ? "#8a5a35" : "#5f7f6a"));
      m4.makeTranslation(tileX(i), TOP - 0.03, tileZ(j));
      tops.setMatrixAt(n, m4);
      tops.setColorAt(n, c.set("HOS".includes(t) ? "#b9bec2" : t === "K" ? "#c7a173" : t in CRATES ? "#9c6b40" : "#d8b98a"));
    });
    s.add(bodies, tops);

    this.ovenGlow = new THREE.MeshLambertMaterial({ color: "#2a1508", emissive: "#000000" });
    for (const [i, j, t] of tiles) {
      const x = tileX(i), z = tileZ(j);
      // which way the tile faces: towards the nearest floor
      const fz = tileAt(i, j + 1) === "." ? 1 : tileAt(i, j - 1) === "." ? -1 : 0;
      const fx = fz ? 0 : tileAt(i + 1, j) === "." ? 1 : tileAt(i - 1, j) === "." ? -1 : 0;
      if (t === "K") {
        const b = mesh(box(0.7, 0.05, 0.5), mat("#e8cfa0"), x, TOP + 0.025, z);
        b.rotation.y = fx ? Math.PI / 2 : 0;
        s.add(b, mesh(box(0.04, 0.03, 0.26), mat("#cfd3d6"), x + 0.3, TOP + 0.07, z + 0.2));
      } else if (t === "H") {
        s.add(mesh(cyl(0.34, 0.34, 0.02, 20), mat("#222222"), x, TOP + 0.01, z));
        const ring = new THREE.Mesh(geo("ring", () => new THREE.TorusGeometry(0.22, 0.025, 6, 20)), mat("#3a1a10", "#000000"));
        ring.rotation.x = Math.PI / 2; ring.position.set(x, TOP + 0.03, z);
        s.add(ring);
        s.add(mesh(cyl(0.26, 0.24, 0.06, 18), mat("#2f2f33"), x, TOP + 0.06, z));
        const handle = mesh(box(0.05, 0.03, 0.32), mat("#1d1d1f"), x + fx * 0.4, TOP + 0.08, z + fz * 0.4 + (fx || fz ? 0 : 0.4));
        if (fx) handle.rotation.y = Math.PI / 2;
        s.add(handle);
      } else if (t === "O") {
        const door = mesh(box(0.6, 0.4, 0.02), this.ovenGlow, x + fx * 0.5, 0.45, z + fz * 0.5);
        if (fx) door.rotation.y = Math.PI / 2;
        s.add(door, mesh(box(0.8, 0.03, 0.6), mat("#6d6f72"), x, TOP + 0.015, z));
      } else if (t in CRATES) {
        // an open crate of the food on top
        s.add(mesh(box(0.8, 0.22, 0.8), mat("#b07a45"), x, TOP + 0.11, z));
        s.add(mesh(box(0.7, 0.02, 0.7), mat("#5b3b20"), x, TOP + 0.2, z));
        const f = CRATES[t];
        for (let n = 0; n < 3; n++) {
          const m = foodModel(f, 0);
          m.position.set(x + (n - 1) * 0.2, TOP + 0.2, z + (n === 1 ? -0.1 : 0.1));
          m.rotation.y = n * 1.3;
          m.scale.setScalar(0.8);
          s.add(m);
        }
      } else if (t === "P") {
        for (let n = 0; n < 5; n++) s.add(mesh(cyl(0.25, 0.2, 0.035, 20), mat("#fbfbf6"), x, TOP + 0.02 + n * 0.04, z));
      } else if (t === "S") {
        // the pass: a heat lamp over it and a bell
        s.add(mesh(box(1, 0.06, 0.3), mat("#8a8f94"), x, 1.9, z));
        s.add(mesh(box(0.9, 0.03, 0.2), new THREE.MeshBasicMaterial({ color: "#ff7a2a" }), x, 1.86, z));
        if (i === 6) {
          s.add(mesh(cyl(0.08, 0.1, 0.03, 12), mat("#2b2b2b"), x - 0.32, TOP + 0.015, z + 0.3));
          const b = mesh(ball(0.07), mat("#d8b04a"), x - 0.32, TOP + 0.05, z + 0.3);
          b.scale.y = 0.7;
          s.add(b);
        }
      }
    }
    // the bin
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (LAYOUT[j][i] === "X") {
      s.add(mesh(cyl(0.34, 0.3, 0.8, 16), mat("#3e4a52"), tileX(i), 0.4, tileZ(j)));
      s.add(mesh(cyl(0.36, 0.36, 0.05, 16), mat("#2a3238"), tileX(i), 0.82, tileZ(j)));
    }

    // signs over the places that aren't obvious
    const label = (text: string, x: number, y: number, z: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(text), transparent: true, depthWrite: false }));
      sp.scale.set(1.1, 0.34, 1); sp.position.set(x, y, z);
      s.add(sp);
    };
    label("Serve here", tileX(6.5), 2.25 - 0.55, tileZ(0) + 0.1);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (LAYOUT[j][i] === "X") label("Bin", tileX(i), 1.35, tileZ(j));
      if (LAYOUT[j][i] === "P") label("Plates", tileX(i), 1.45, tileZ(j));
    }

    // a highlight on the tile you're facing
    this.facing = mesh(box(1.02, 0.02, 1.02), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.28, depthWrite: false }));
    this.facing.visible = false;
    s.add(this.facing);
  }

  /** Back the camera off until the whole kitchen fits the screen, below `top` (the tickets' edge, -1..1). */
  fit(aspect: number, top = 0.72) {
    const cam = this.camera;
    cam.aspect = aspect;
    // on a tall, narrow screen (a phone held upright) look from the side, so the kitchen's long way
    // runs up the screen, and more straight down
    this.az = aspect < 0.85 ? Math.PI / 2 : 0;
    const el = aspect < 1 ? 1.15 : 0.95, az = this.az;
    const look = new THREE.Vector3(az ? 0.4 : 0, 0, az ? 0 : 0.4);
    const corners: THREE.Vector3[] = [];
    for (const x of [-W / 2 - 0.2, W / 2 + 0.2]) for (const z of [-H / 2 - 0.2, H / 2 + 0.4]) for (const y of [0, 1.2]) corners.push(new THREE.Vector3(x, y, z));
    corners.push(new THREE.Vector3(0, 2.8, -H / 2));
    let d = 6;
    for (; d < 60; d += 0.25) {
      cam.position.set(look.x + Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, look.z + Math.cos(az) * Math.cos(el) * d);
      cam.lookAt(look);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      // leave room at the top for the tickets
      if (corners.every((p) => { const q = p.clone().project(cam); return Math.abs(q.x) < 0.96 && q.y > -0.94 && q.y < top; })) break;
    }
  }

  /** Which way the camera looks round from the shop: 0 from the front, a quarter turn from the side. */
  az = 0;
  /** Turn a push on the stick or the keys (right, down on screen) into a way across the kitchen floor. */
  screenToFloor(jx: number, jy: number): [number, number] {
    const c = Math.cos(this.az), s = Math.sin(this.az);
    return [c * jx + s * jy, -s * jx + c * jy];
  }

  /** Draw what's on every tile. Called each frame with the latest copy of the shift. */
  sync(items: Record<number, Item>, t: number) {
    const seen = new Set<number>();
    for (const key in items) {
      const idx = Number(key), it = items[idx];
      seen.add(idx);
      let slot = this.slots.get(idx);
      if (!slot) { slot = { key: "", o: null, bar: null, smoke: [] }; this.slots.set(idx, slot); }
      const i = idx % W, j = Math.floor(idx / W), tile = tileAt(i, j);
      const x = tileX(i), z = tileZ(j);
      const k = itemKey(it);
      if (k !== slot.key) {
        slot.key = k;
        if (slot.o) this.scene.remove(slot.o);
        slot.o = itemModel(it);
        slot.o.position.set(x, TOP + (tile === "H" ? 0.09 : tile === "K" ? 0.05 : 0.03), z);
        this.scene.add(slot.o);
      }
      // progress: chopping, cooking, and a red bar counting down to burning
      const p = it.p ?? 0;
      const cooking = (tile === "H" || tile === "O") && it.k !== "plate";
      const show = (it.s === 0 && p > 0) || (cooking && it.s === 1);
      if (show && !slot.bar) { slot.bar = new Bar(); slot.bar.o.position.set(x, TOP + 0.75, z); slot.bar.o.quaternion.copy(this.camera.quaternion); this.scene.add(slot.bar.o); }
      if (!show && slot.bar) { this.scene.remove(slot.bar.o); slot.bar = null; }
      if (slot.bar) {
        if (it.s === 0) slot.bar.set(p, "#5fd35a");
        else slot.bar.set(1 - p, p > 0.5 && Math.sin(t * 18) > 0 ? "#ff3b2a" : "#f5a623");
        slot.bar.o.quaternion.copy(this.camera.quaternion);
      }
      // smoke off anything burnt on the heat
      const smoking = cooking && it.s === 2;
      if (smoking && !slot.smoke.length) for (let n = 0; n < 4; n++) {
        const puff = mesh(ball(0.12), new THREE.MeshLambertMaterial({ color: "#444444", transparent: true, opacity: 0.6, depthWrite: false }), x, TOP, z);
        slot.smoke.push(puff); this.scene.add(puff);
      }
      if (!smoking && slot.smoke.length) { slot.smoke.forEach((m) => this.scene.remove(m)); slot.smoke = []; }
      slot.smoke.forEach((m, n) => {
        const f = (t * 0.6 + n / 4) % 1;
        m.position.set(x + Math.sin(t * 2 + n) * 0.1, TOP + 0.2 + f * 1.3, z);
        m.scale.setScalar(0.6 + f * 1.4);
        (m.material as THREE.MeshLambertMaterial).opacity = 0.6 * (1 - f);
      });
    }
    for (const [idx, slot] of this.slots) if (!seen.has(idx)) {
      if (slot.o) this.scene.remove(slot.o);
      if (slot.bar) this.scene.remove(slot.bar.o);
      slot.smoke.forEach((m) => this.scene.remove(m));
      this.slots.delete(idx);
    }
    // the oven door glows while something bakes
    let baking = false;
    for (const key in items) { const idx = Number(key); if (tileAt(idx % W, Math.floor(idx / W)) === "O" && items[idx].s !== 2) baking = true; }
    this.ovenGlow.emissive.set(baking ? "#e2571c" : "#000000");
    this.ovenGlow.emissiveIntensity = baking ? 0.6 + Math.sin(t * 3) * 0.15 : 0;
  }

  /** Light up the tile in front of you, or nothing. */
  face(idx: number) {
    if (idx < 0) { this.facing.visible = false; return; }
    const i = idx % W, j = Math.floor(idx / W), t = tileAt(i, j);
    this.facing.visible = true;
    this.facing.position.set(tileX(i), t === "X" ? 0.86 : TOP + 0.01, tileZ(j));
  }

  /** Where a point in the scene lands on screen, in CSS pixels. */
  toScreen(x: number, y: number, z: number, w: number, h: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h];
  }
}

// ---- textures drawn in code ----------------------------------------------------------------
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function checker() {
  const t = canvasTex(64, 64, (g) => {
    g.fillStyle = "#efeae0"; g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#26282b"; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}
function metro() {
  const t = canvasTex(128, 128, (g) => {
    g.fillStyle = "#b8b2a6"; g.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 8; r++) for (let c = -1; c < 3; c++) {
      g.fillStyle = r % 3 === 0 ? "#f3f0ea" : "#eae6dd";
      g.fillRect(c * 64 + (r % 2) * 32 + 2, r * 16 + 2, 60, 12);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function tagTex(text: string) {
  return canvasTex(256, 80, (g) => {
    g.font = "700 40px 'Barlow Condensed', 'Arial Narrow', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    const w = Math.min(250, g.measureText(text).width + 30);
    g.fillStyle = "rgba(20,24,22,0.75)";
    g.beginPath(); g.roundRect(128 - w / 2, 12, w, 56, 10); g.fill();
    g.fillStyle = "#f4e6b8";
    g.fillText(text.toUpperCase(), 128, 42);
  });
}
function signTex() {
  return canvasTex(512, 84, (g) => {
    g.fillStyle = "#1f3b2c"; g.fillRect(0, 0, 512, 84);
    g.strokeStyle = "#d9b85a"; g.lineWidth = 4; g.strokeRect(6, 6, 500, 72);
    g.fillStyle = "#f4e6b8"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "700 34px Georgia, 'Times New Roman', serif";
    g.fillText("The Darling Deli Kitchen", 256, 44);
  });
}
