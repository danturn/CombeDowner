// The puzzles that keep the way down shut (see gen.ts for how each is laid out). Ten kinds:
//
//   levers   pull every lever on the level
//   plates   hold all the weighbridge plates down at once (one more plate than there are players,
//            and each stays down a few seconds after you step off, so somebody has to run)
//   block    push a stone block on runners onto its plate
//   bells    ring four bells in the order carved on a tablet somewhere else
//   dials    set a three-dial lock to the number scratched on a wall somewhere else
//   candles  light every candle in the chapel and have them all burning at once
//   key      kill the monster carrying the foreman's key, then take the key to the gate
//   secret   find the loose stone that opens a hidden chamber
//   flood    pump the water out of a flooded working (more hands pump faster)
//   riddle   answer a riddle by choosing the right offering
//
// Like everything else, the host decides: each puzzle's state is a short list of numbers in the
// world the host sends out (s[0] is 1 once it's solved), uses go to the host as {k:"pz"}, and what
// happens comes back as events. Everyone draws the parts from the same level, so only numbers move.
import * as THREE from "three";
import * as SFX from "../audio";
import { CELL, Level, MobKind, Puzzle, sokoban, flood as reach } from "./gen";
import { glow, graffiti, plaque, rockStyle, wood } from "./art";
import type { MineLevel } from "./level";

const PLATE_HOLD = 6;      // seconds a plate stays down after you step off
const BURN = 22;           // seconds a chapel candle burns
const PUMP_RATE = 4;       // % a second for each person pumping
const ROMAN = ["I", "II", "III", "IV"];
const CHAPEL = "the chapel";

export const PUZZLE_NAMES: Record<Puzzle["kind"], string> = {
  levers: "Pull the levers", plates: "Hold the weighbridge plates down together", block: "Push the stone onto its plate",
  bells: "Ring the bells in the right order", dials: "Open the powder store lock", candles: `Keep every candle in ${CHAPEL} alight`,
  key: "Bring the foreman's key to the gate", secret: "Find the loose stone", flood: "Pump out the flooded working",
  riddle: "Answer the riddle on the tablet",
};

/** Something you can use with E: where it is, what the hint says, and what to send the host. */
export interface Target { x: number; y: number; z: number; text: string; use?: { id: number; a: string; v?: number }; hold?: boolean; reach?: number }

/** What the host's puzzle code needs from the game. */
export interface HostCtx {
  party(): { id: string; x: number; z: number; down: boolean }[];
  spawn(kind: MobKind, x: number, z: number): void;
  emit(ev: { k: "pz"; id: number; e: string; v?: number; who?: string }): void;
}

interface Part { p: Puzzle; group: THREE.Group; anim: (dt: number, t: number, s: number[]) => void; sync: (s: number[]) => void }

const mat = (color: string, emissive = "#000000") => new THREE.MeshLambertMaterial({ color, emissive });
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  return b;
};
const cyl = (r0: number, r1: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 10) => {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);
  c.position.set(x, y, z);
  return c;
};

export class PuzzleSet {
  readonly group = new THREE.Group();
  private parts: Part[] = [];
  private woodMat: THREE.MeshLambertMaterial;
  private iron = mat("#2e2b29");
  private brass = mat("#b08a3a", "#2a1a00");
  private glowTex = glow();
  private pumpers = new Map<string, number>();   // host: who's pumping, and when they last did
  private clock = 0;
  private draughtSaid = false;
  /** Shown by the game when you first feel the draught from a secret door. */
  onDraught: () => void = () => {};

  constructor(private level: MineLevel, private L: Level) {
    this.woodMat = new THREE.MeshLambertMaterial({ map: wood() });
    for (const p of L.puzzles) this.parts.push(this.build(p));
  }

  private y(x: number, z: number) { return this.level.ground(x, z); }
  private cellOf(c: number) { return { i: c % this.L.w, j: Math.floor(c / this.L.w) }; }

  /** The host's starting state for each puzzle. players: how many are down here now. */
  init(players: number): number[][] {
    return this.L.puzzles.map((p) => {
      switch (p.kind) {
        case "levers": return [0, ...p.pts.map(() => 0)];
        case "plates": return [0, Math.max(2, Math.min(p.pts.length, players + 1)), ...p.pts.map(() => 0)];
        case "block": return [0, p.pts[1][0], p.pts[1][1], 0];
        case "bells": return [0, 0];
        case "dials": return [0, 0, 0, 0];
        case "candles": return [0, ...p.pts.map(() => 0)];
        case "key": return [0, 0, 0, 0];
        case "flood": return [0, 0];
        default: return [0, 0];
      }
    });
  }

  // ---- models ----------------------------------------------------------------------------------------

  private plaqueMesh(lines: string[], w: number, h: number, pt: number[], y: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: plaque(lines), polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(pt[0] + pt[2] * 0.06, this.y(pt[0] + pt[2] * 0.6, pt[1] + pt[3] * 0.6) + y, pt[1] + pt[3] * 0.06);
    m.rotation.y = Math.atan2(pt[2], pt[3]);
    return m;
  }

  private flame(x: number, y: number, z: number, s = 0.4) {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: "#ffc070", depthWrite: false, blending: THREE.AdditiveBlending }));
    f.position.set(x, y, z);
    f.scale.setScalar(s);
    return f;
  }

  private build(p: Puzzle): Part {
    const g = new THREE.Group();
    this.group.add(g);
    let anim: Part["anim"] = () => {};
    let sync: Part["sync"] = () => {};
    const wallGroup = (pt: number[]) => {
      const w = new THREE.Group();
      w.position.set(pt[0], this.y(pt[0] + pt[2] * 0.6, pt[1] + pt[3] * 0.6), pt[1]);
      w.rotation.y = Math.atan2(pt[2], pt[3]);
      g.add(w);
      return w;
    };
    switch (p.kind) {
      case "levers": {
        // a big iron lever on a board, a red knob, and a lamp over it (gen.ts)
        const handles = p.pts.map((pt) => {
          const w = wallGroup(pt);
          w.add(box(0.7, 1.0, 0.1, this.woodMat, 0, 1.25, 0.05));
          const pivot = new THREE.Group();
          pivot.position.set(0, 1.05, 0.14);
          pivot.add(box(0.09, 0.8, 0.09, this.iron, 0, 0.38, 0), new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat("#c0301a", "#5a1005")));
          pivot.children[1].position.y = 0.8;
          w.add(pivot);
          return pivot;
        });
        sync = (s) => handles.forEach((h, k) => (h.rotation.x = s[1 + k] ? 0.9 : -0.9));
        break;
      }
      case "plates": {
        const tops = p.pts.map(([x, z]) => {
          const y = this.y(x, z);
          g.add(box(1.5, 0.06, 1.5, this.brass, x, y + 0.03, z));
          const top = box(1.3, 0.12, 1.3, mat("#8f8576"), x, y + 0.1, z);
          g.add(top);
          return top;
        });
        if (p.clue) g.add(this.plaqueMesh(["THE WEIGHBRIDGE", "Hold every working plate", "down at the same time."], 1.6, 0.8, p.clue, 1.6));
        let timers: number[] = [];
        sync = (s) => { timers = s.slice(2); };
        anim = (dt, _t, s) => tops.forEach((top, k) => {
          const live = k < s[1];
          const down = s[0] || (live && (timers[k] ?? 0) > 0);
          if (live && timers[k] > 0) timers[k] = Math.max(0, timers[k] - dt * 10);
          const want = this.y(p.pts[k][0], p.pts[k][1]) + (down ? 0.02 : 0.1);
          top.position.y += (want - top.position.y) * Math.min(1, dt * 10);
          const m = top.material as THREE.MeshLambertMaterial;
          // working plates glow amber, green once down, fading as they're about to come back up
          m.emissive.set(!live ? "#000000" : down ? "#1f6a1f" : "#5a3a08").multiplyScalar(down && !s[0] ? 0.4 + 0.6 * Math.min(1, timers[k] / 30) : 1);
        });
        break;
      }
      case "block": {
        const [pi, pj] = p.pts[0];
        const px = (pi + 0.5) * CELL, pz = (pj + 0.5) * CELL, py = this.y(px, pz);
        g.add(box(1.8, 0.05, 1.8, this.brass, px, py + 0.03, pz));
        g.add(box(1.2, 0.06, 1.2, mat("#6f6658", "#3a2808"), px, py + 0.05, pz));
        const stone = new THREE.Group();
        const t = rockStyle("oolite", 9);
        stone.add(box(1.7, 1.3, 1.7, new THREE.MeshLambertMaterial({ map: t, color: "#efe3c8" }), 0, 0.8, 0));
        stone.add(box(0.2, 0.15, 1.8, this.woodMat, -0.6, 0.08, 0), box(0.2, 0.15, 1.8, this.woodMat, 0.6, 0.08, 0));
        g.add(stone);
        if (p.clue) g.add(this.plaqueMesh(["Push the stone onto the plate.", "It slides back if it sticks."], 1.6, 0.8, p.clue, 1.6));
        let at = { x: 0, z: 0, set: false };
        sync = (s) => {
          at = { x: (s[1] + 0.5) * CELL, z: (s[2] + 0.5) * CELL, set: at.set };
          if (!at.set) { stone.position.set(at.x, py, at.z); at.set = true; }
        };
        anim = (dt) => {
          const k = Math.min(1, dt * 4);
          stone.position.x += (at.x - stone.position.x) * k;
          stone.position.z += (at.z - stone.position.z) * k;
        };
        break;
      }
      case "bells": {
        const bells = p.pts.map(([x, z], k) => {
          const y = this.y(x, z);
          for (const s of [-0.55, 0.55]) g.add(box(0.14, 2.4, 0.14, this.woodMat, x + s, y + 1.2, z));
          g.add(box(1.3, 0.16, 0.16, this.woodMat, x, y + 2.35, z));
          const pivot = new THREE.Group();
          pivot.position.set(x, y + 2.25, z);
          const size = 0.5 - k * 0.06;   // bigger bells, lower notes
          const bell = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.45, size, size * 1.1, 12, 1, true), new THREE.MeshLambertMaterial({ color: "#a8762c", emissive: "#2a1500", side: THREE.DoubleSide }));
          bell.position.y = -size * 0.65;
          pivot.add(bell, cyl(0.03, 0.03, 0.3, this.iron, 0, -0.15, 0, 5));
          g.add(pivot);
          // its number on a little board on the frame
          const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshLambertMaterial({ map: plaque([ROMAN[k]]) }));
          tag.position.set(x - 0.55, y + 1.5, z + 0.08);
          g.add(tag);
          const tag2 = tag.clone();
          tag2.position.z = z - 0.08;
          tag2.rotation.y = Math.PI;
          g.add(tag2);
          return { pivot, swing: 0 };
        });
        if (p.clue) {
          g.add(this.plaqueMesh(p.text, 1.6, 0.8, p.clue, 1.6));
        }
        (this as any)[`ring${p.id}`] = (k: number) => { if (bells[k]) bells[k].swing = 1; };
        anim = (dt, t) => bells.forEach((b) => {
          b.swing = Math.max(0, b.swing - dt * 0.5);
          b.pivot.rotation.x = Math.sin(t * 9) * 0.5 * b.swing;
        });
        break;
      }
      case "dials": {
        const w = wallGroup(p.pts[0]);
        w.add(box(1.3, 2.0, 0.12, this.iron, 0, 1.0, 0.06));
        for (const y of [0.4, 1.0, 1.6]) w.add(box(1.32, 0.08, 0.16, mat("#4a3f36"), 0, y, 0.08));
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), new THREE.MeshLambertMaterial({ map: plaque(["POWDER STORE"]) }));
        sign.position.set(0, 2.2, 0.03);
        w.add(sign);
        const faces = [0, 1, 2].map((k) => {
          const dial = cyl(0.13, 0.13, 0.08, this.brass, (k - 1) * 0.34, 1.25, 0.18, 12);
          dial.rotation.x = Math.PI / 2;
          w.add(dial);
          const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: plaque(["0"]) }));
          face.position.set((k - 1) * 0.34, 1.25, 0.225);
          w.add(face);
          return face;
        });
        if (p.clue) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.48), new THREE.MeshLambertMaterial({ map: graffiti(p.text[0]), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
          m.position.set(p.clue[0] + p.clue[2] * 0.06, this.y(p.clue[0] + p.clue[2] * 0.6, p.clue[1] + p.clue[3] * 0.6) + 1.4, p.clue[1] + p.clue[3] * 0.06);
          m.rotation.y = Math.atan2(p.clue[2], p.clue[3]);
          g.add(m);
        }
        let shown = [-1, -1, -1];
        sync = (s) => faces.forEach((f, k) => {
          if (shown[k] === s[1 + k]) return;
          shown[k] = s[1 + k];
          const m = f.material as THREE.MeshBasicMaterial;
          m.map?.dispose();
          m.map = plaque([String(s[1 + k])]);
          m.needsUpdate = true;
        });
        break;
      }
      case "candles": {
        const flames = p.pts.map(([x, z]) => {
          const y = this.y(x, z);
          g.add(cyl(0.2, 0.25, 0.08, this.iron, x, y + 0.04, z, 8), cyl(0.04, 0.05, 1.0, this.iron, x, y + 0.55, z, 6), cyl(0.12, 0.08, 0.06, this.iron, x, y + 1.08, z, 8));
          g.add(cyl(0.06, 0.07, 0.3, mat("#efe6cf", "#2a2010"), x, y + 1.25, z, 8));
          const f = this.flame(x, y + 1.48, z, 0.5);
          g.add(f);
          return f;
        });
        if (p.clue) g.add(this.plaqueMesh(["Let every light burn together", "and the way will open."], 1.6, 0.8, p.clue, 1.6));
        let left: number[] = [];
        sync = (s) => { left = s.slice(1); };
        anim = (dt, t, s) => flames.forEach((f, k) => {
          if (left[k] > 0) left[k] = Math.max(0, left[k] - dt * 10);
          const lit = s[0] === 1 || left[k] > 0;
          f.visible = lit;
          // gutters as it burns down
          const life = s[0] ? 1 : Math.min(1, left[k] / (BURN * 10));
          f.scale.setScalar((0.25 + 0.3 * life) * (1 + 0.1 * Math.sin(t * 13 + k)));
        });
        break;
      }
      case "key": {
        const w = wallGroup(p.pts[0]);
        // the foreman's gate: iron bars across a doorway, a padlock
        for (let k = -2; k <= 2; k++) w.add(box(0.06, 2.0, 0.06, this.iron, k * 0.28, 1.0, 0.12));
        for (const y of [0.3, 1.0, 1.8]) w.add(box(1.3, 0.08, 0.08, this.iron, 0, y, 0.12));
        const lock = box(0.22, 0.26, 0.1, this.brass, 0, 1.0, 0.2);
        w.add(lock);
        // the key itself, once the keeper drops it
        const key = new THREE.Group();
        const gold = mat("#e0b040", "#6a4a00");
        key.add(box(0.06, 0.5, 0.04, gold, 0, 0, 0), box(0.18, 0.06, 0.04, gold, 0.06, -0.2, 0), new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12), gold));
        key.children[2].position.y = 0.3;
        key.add(this.flame(0, 0, 0, 0.9));
        key.visible = false;
        g.add(key);
        sync = (s) => {
          key.visible = s[1] === 1 && !s[0];
          if (key.visible) key.position.set(s[2] / 10, this.y(s[2] / 10, s[3] / 10) + 0.7, s[3] / 10);
          lock.visible = !s[0];
          w.children.slice(0, 8).forEach((c) => (c.visible = !s[0]));
        };
        anim = (dt) => { key.rotation.y += dt * 2; };
        break;
      }
      case "secret": {
        const { i, j } = this.cellOf(p.cells[0]);
        const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL, y = this.y(x, z), rf = this.level.roofAt(x, z);
        const t = rockStyle(["oolite", "ochre", "soot", "flow", "fossil", "spar"][this.L.rock[p.cells[0]]] as any, 3 + this.L.rock[p.cells[0]]);
        const door = box(CELL, rf - y, CELL, new THREE.MeshLambertMaterial({ map: t, color: "#a8a092" }), x, y + (rf - y) / 2, z);
        g.add(door);
        // the loose stone: a block standing a little proud of the face
        const pt = p.pts[0];
        const loose = box(0.42, 0.3, 0.1, new THREE.MeshLambertMaterial({ map: t, color: "#bcb2a0" }), pt[0] + pt[2] * 0.04, y + 1.3, pt[1] + pt[3] * 0.04);
        loose.rotation.y = Math.atan2(pt[2], pt[3]);
        g.add(loose);
        let sink = 0;
        sync = (s) => {
          const open = s[0] === 1;
          this.level.setSolid(i, j, !open);
          this.level.setAir(i, j, open);
        };
        anim = (dt, _t, s) => {
          if (s[0]) sink = Math.min(1, sink + dt * 0.5);
          door.position.y = y + (rf - y) / 2 - sink * (rf - y + 0.1);
          door.visible = sink < 1;
          loose.visible = !s[0];
        };
        break;
      }
      case "flood": {
        // water over the flooded cells, and a beam pump on the dry side
        const cells = p.cells.map((c) => this.cellOf(c));
        const top = Math.max(...p.cells.map((c) => this.L.fl[c])) + 1.1, bottom = Math.min(...p.cells.map((c) => this.L.fl[c])) - 0.1;
        const geo = new THREE.BufferGeometry();
        const pos: number[] = [];
        for (const { i, j } of cells) {
          const x0 = i * CELL, z0 = j * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
          pos.push(x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0);
        }
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        const water = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: "#1d3a3a", emissive: "#04100f", shininess: 80, specular: "#9fd0d0", transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
        water.position.y = top;
        g.add(water);
        const [px, pz] = p.pts[0], py = this.y(px, pz);
        for (const s of [-0.3, 0.3]) g.add(box(0.12, 1.2, 0.12, this.woodMat, px + s, py + 0.6, pz));
        g.add(cyl(0.12, 0.12, 1.3, this.iron, px, py + 0.65, pz + 0.3, 8));
        const handle = new THREE.Group();
        handle.position.set(px, py + 1.2, pz);
        handle.add(box(0.08, 0.08, 1.8, this.woodMat, 0, 0, 0));
        g.add(handle);
        let level = 0, want = 0, stroke = 0;
        sync = (s) => {
          want = s[0] ? 100 : s[1];
          for (const { i, j } of cells) this.level.setSolid(i, j, !s[0]);
        };
        (this as any)[`pump${p.id}`] = () => { stroke = 1; };
        anim = (dt, t) => {
          level += (want - level) * Math.min(1, dt * 2);
          water.position.y = top + (bottom - top) * (level / 100);
          water.visible = level < 99.5;
          stroke = Math.max(0, stroke - dt * 2);
          handle.rotation.x = Math.sin(t * 8) * 0.35 * Math.min(1, stroke * 2);
        };
        break;
      }
      case "riddle": {
        g.add(this.plaqueMesh([...p.text, "", "Make the right offering."], 2.0, 1.0, p.pts[0], 1.7));
        const stand = mat("#c4b89e");
        p.pts.slice(1).forEach(([x, z], k) => {
          const y = this.y(x, z);
          g.add(cyl(0.22, 0.28, 0.9, stand, x, y + 0.45, z, 8), cyl(0.3, 0.3, 0.06, stand, x, y + 0.93, z, 8));
          const o = this.offering(p.items[k]);
          o.position.set(x, y + 0.96, z);
          g.add(o);
        });
        break;
      }
    }
    return { p, group: g, anim, sync };
  }

  /** A little model of one of the riddle's offerings. */
  private offering(item: string): THREE.Object3D {
    const o = new THREE.Group();
    switch (item) {
      case "candle": o.add(cyl(0.05, 0.06, 0.3, mat("#efe6cf", "#2a2010"), 0, 0.15, 0, 8), this.flame(0, 0.36, 0, 0.3)); break;
      case "pint": o.add(cyl(0.08, 0.065, 0.24, new THREE.MeshLambertMaterial({ color: "#c47a1c", emissive: "#3a1c00" }), 0, 0.12, 0, 10), cyl(0.081, 0.081, 0.04, mat("#f4ead0"), 0, 0.25, 0, 10)); break;
      case "ammonite": { const t = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.06, 6, 14), mat("#b8a88a")); t.rotation.x = Math.PI / 2.4; t.position.y = 0.12; o.add(t); break; }
      case "key": { const gold = mat("#9a8a6a"); o.add(box(0.04, 0.03, 0.34, gold, 0, 0.03, 0), box(0.1, 0.03, 0.04, gold, 0.05, 0.03, 0.14)); break; }
      case "pick": o.add(box(0.04, 0.04, 0.5, this.woodMat, 0, 0.04, 0), box(0.4, 0.05, 0.05, this.iron, 0, 0.06, -0.24)); break;
      case "bell": { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.14, 0.2, 10, 1, true), new THREE.MeshLambertMaterial({ color: "#a8762c", side: THREE.DoubleSide })); b.position.y = 0.1; o.add(b); break; }
      case "bone": { const m = mat("#e8e0cc"); o.add(cyl(0.03, 0.03, 0.4, m, 0, 0.05, 0, 6)); o.children[0].rotation.z = Math.PI / 2; o.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), m), new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), m)); o.children[1].position.set(-0.2, 0.05, 0); o.children[2].position.set(0.2, 0.05, 0); break; }
      default: o.add(box(0.3, 0.22, 0.24, new THREE.MeshLambertMaterial({ map: rockStyle("oolite", 4), color: "#efe3c8" }), 0, 0.11, 0)); break;
    }
    return o;
  }

  // ---- everyone's side ---------------------------------------------------------------------------------

  /** Bring the parts in line with the host's state. */
  sync(states: number[][]) { this.parts.forEach((part, k) => states[k] && part.sync(states[k])); }

  update(dt: number, t: number, states: number[][], me: { x: number; z: number }) {
    this.clock += dt;
    this.parts.forEach((part, k) => states[k] && part.anim(dt, t, states[k]));
    // a draught from a hidden chamber
    for (const part of this.parts) {
      const pt = part.p.pts[0];
      if (part.p.kind === "secret" && !this.draughtSaid && !states[this.parts.indexOf(part)]?.[0] && Math.hypot(pt[0] - me.x, pt[1] - me.z) < 5) {
        this.draughtSaid = true;
        this.onDraught();
      }
    }
  }

  /** Lit chapel candles, for the game's pool of lights. */
  lights(states: number[][]): number[][] {
    const out: number[][] = [];
    this.parts.forEach((part, k) => {
      const s = states[k];
      if (part.p.kind !== "candles" || !s) return;
      part.p.pts.forEach(([x, z], n) => { if (s[0] || s[1 + n] > 0) out.push([x, this.y(x, z) + 1.6, z]); });
    });
    return out;
  }

  /** Things you could use with E right now. */
  targets(states: number[][]): Target[] {
    const out: Target[] = [];
    this.parts.forEach((part, id) => {
      const p = part.p, s = states[id];
      if (!s) return;
      const wy = (pt: number[]) => this.y(pt[0] + pt[2] * 0.6, pt[1] + pt[3] * 0.6);
      switch (p.kind) {
        case "levers":
          p.pts.forEach((pt, k) => { if (!s[1 + k]) out.push({ x: pt[0], y: wy(pt) + 1.4, z: pt[1], text: "<b>E</b> Pull the lever", use: { id, a: "pull", v: k } }); });
          break;
        case "block": {
          if (s[0]) break;
          const x = (s[1] + 0.5) * CELL, z = (s[2] + 0.5) * CELL;
          out.push({ x, y: this.y(x, z) + 1.0, z, text: "<b>E</b> Push the stone", use: { id, a: "push" }, reach: 2.6 });
          break;
        }
        case "bells":
          if (!s[0]) p.pts.forEach(([x, z], k) => out.push({ x, y: this.y(x, z) + 1.6, z, text: `<b>E</b> Ring bell ${ROMAN[k]}`, use: { id, a: "ring", v: k } }));
          break;
        case "dials": {
          if (s[0]) break;
          const pt = p.pts[0], tx = -pt[3], tz = pt[2];
          for (let k = 0; k < 3; k++) out.push({ x: pt[0] + tx * (k - 1) * 0.34, y: wy(pt) + 1.25, z: pt[1] + tz * (k - 1) * 0.34, text: `<b>E</b> Turn the ${["left", "middle", "right"][k]} dial (${s[1 + k]})`, use: { id, a: "dial", v: k } });
          break;
        }
        case "candles":
          if (!s[0]) p.pts.forEach(([x, z], k) => { if (!(s[1 + k] > 0)) out.push({ x, y: this.y(x, z) + 1.3, z, text: "<b>E</b> Light the candle", use: { id, a: "light", v: k } }); });
          break;
        case "key": {
          if (s[0]) break;
          const pt = p.pts[0];
          out.push(s[1] === 2
            ? { x: pt[0], y: wy(pt) + 1.0, z: pt[1], text: "<b>E</b> Unlock the foreman's gate", use: { id, a: "unlock" } }
            : { x: pt[0], y: wy(pt) + 1.0, z: pt[1], text: "Locked. Something down here has the foreman's key" });
          break;
        }
        case "secret": {
          if (s[0]) break;
          const pt = p.pts[0];
          out.push({ x: pt[0], y: wy(pt) + 1.3, z: pt[1], text: "<b>E</b> Press the loose stone", use: { id, a: "press" }, reach: 1.8 });
          break;
        }
        case "flood": {
          if (s[0]) break;
          const [x, z] = p.pts[0];
          out.push({ x, y: this.y(x, z) + 1.2, z, text: `Hold <b>E</b> to pump (${Math.floor(s[1])}% out)`, use: { id, a: "pump" }, hold: true });
          break;
        }
        case "riddle": {
          const pt = p.pts[0];
          out.push({ x: pt[0], y: wy(pt) + 1.7, z: pt[1], text: `The tablet reads: <i>${p.text.join(" ")}</i>`, reach: 3.5 });
          if (!s[0]) p.pts.slice(1).forEach(([x, z], k) => out.push({ x, y: this.y(x, z) + 1.0, z, text: `<b>E</b> Offer the ${p.items[k]}`, use: { id, a: "offer", v: k } }));
          break;
        }
      }
    });
    return out;
  }

  /** The dropped key, if you're standing on it. */
  keyUnder(states: number[][], x: number, z: number): number {
    return this.parts.findIndex((part, k) => part.p.kind === "key" && states[k]?.[1] === 1 && !states[k][0] && Math.hypot(states[k][2] / 10 - x, states[k][3] / 10 - z) < 1.1);
  }

  /** What still needs doing, for the HUD. */
  objectives(states: number[][]): { text: string; done: boolean }[] {
    return this.parts.map((part, k) => {
      const p = part.p, s = states[k] ?? [0];
      let text = PUZZLE_NAMES[p.kind];
      if (p.kind === "levers") text += ` (${s.slice(1).filter((v) => v).length} of ${p.pts.length})`;
      if (p.kind === "plates") text = `Hold all ${s[1]} weighbridge plates down together`;
      if (p.kind === "flood" && !s[0]) text += ` (${Math.floor(s[1])}%)`;
      if (p.kind === "candles" && !s[0]) text += ` (${s.slice(1).filter((v) => v > 0).length} of ${p.pts.length})`;
      if (p.kind === "key" && !s[0]) text = s[1] === 2 ? "Take the foreman's key to the gate" : s[1] === 1 ? "Pick up the foreman's key" : "Kill the keeper of the foreman's key";
      return { text, done: s[0] === 1 };
    });
  }

  /** Where each puzzle is, for the map. done: solved. */
  marks(states: number[][]): { x: number; z: number; done: boolean; small?: boolean }[] {
    const out: { x: number; z: number; done: boolean; small?: boolean }[] = [];
    this.parts.forEach((part, k) => {
      const p = part.p, s = states[k] ?? [0];
      const a = this.L.rooms[p.room];
      switch (p.kind) {
        case "levers": p.pts.forEach((pt, n) => out.push({ x: pt[0], z: pt[1], done: s[1 + n] === 1 })); break;
        case "secret": if (a) out.push({ x: ((a.i0 + a.i1) / 2 + 0.5) * CELL, z: ((a.j0 + a.j1) / 2 + 0.5) * CELL, done: s[0] === 1 }); break;
        case "block": out.push({ x: (p.pts[0][0] + 0.5) * CELL, z: (p.pts[0][1] + 0.5) * CELL, done: s[0] === 1 }); break;
        case "key":
          out.push({ x: p.pts[0][0], z: p.pts[0][1], done: s[0] === 1 });
          if (s[1] === 1 && !s[0]) out.push({ x: s[2] / 10, z: s[3] / 10, done: false, small: true });
          break;
        default:
          out.push({ x: p.pts[0][0], z: p.pts[0][1], done: s[0] === 1 });
          if (p.clue) out.push({ x: p.clue[0], z: p.clue[1], done: s[0] === 1, small: true });
      }
    });
    return out;
  }

  /** Sounds and movement for something the host says happened. Returns a line for the feed, if any. */
  onEvent(ev: { id: number; e: string; v?: number }, pan: (x: number, z: number) => { d: number; p: number }): string {
    const part = this.parts[ev.id];
    if (!part) return "";
    const p = part.p, at = p.pts[ev.v ?? 0] ?? p.pts[0], { d, p: pn } = pan(at[0], at[1]);
    switch (ev.e) {
      case "pull": SFX.door(d, pn); return "";
      case "ring": SFX.bell(ev.v ?? 0, d, pn); (this as any)[`ring${ev.id}`]?.(ev.v); return "";
      case "wrong": SFX.clunk(d, pn); if (p.kind === "bells") (this as any)[`ring${ev.id}`]?.(ev.v); return p.kind === "bells" ? "A wrong note. Something stirs" : "The wrong offering. Something stirs";
      case "push": SFX.grind(d, pn); return "";
      case "stuck": SFX.clunk(d, pn); return "";
      case "reset": SFX.grind(d, pn, 1.4); return "The stone grinds back to where it started";
      case "dial": SFX.tick(d, pn); return "";
      case "light": SFX.pickup("boost"); return "";
      case "out": return "";
      case "plate": SFX.tick(d, pn); return "";
      case "drop": return "The keeper dropped the foreman's key";
      case "take": SFX.pickup("fizz"); return "Got the foreman's key";
      case "pump": (this as any)[`pump${ev.id}`]?.(); SFX.pump(d, pn); return "";
      case "press": SFX.grind(d, pn, 2); return "A hidden chamber grinds open";
      case "solve": SFX.solved(); return `${PUZZLE_NAMES[p.kind].replace(/^\w/, (c) => c.toUpperCase())}: done`;
    }
    return "";
  }

  // ---- the host's side -----------------------------------------------------------------------------------

  /** Someone used a puzzle. Returns whether anything changed. */
  use(states: number[][], id: number, a: string, v: number, from: string, ctx: HostCtx): boolean {
    const part = this.parts[id], s = states[id];
    if (!part || !s || s[0]) return false;
    const p = part.p;
    const emit = (e: string, vv = v) => ctx.emit({ k: "pz", id, e, v: vv, who: from });
    const solve = () => { s[0] = 1; emit("solve"); };
    switch (p.kind) {
      case "levers":
        if (a !== "pull" || s[1 + v] !== 0) return false;
        s[1 + v] = 1;
        emit("pull");
        if (s.slice(1).every((x) => x === 1)) solve();
        return true;
      case "block": {
        if (a !== "push") return false;
        // it slides away from whoever pushed it, along whichever way they're more lined up
        const me = ctx.party().find((q) => q.id === from);
        if (!me) return false;
        const bx = (s[1] + 0.5) * CELL, bz = (s[2] + 0.5) * CELL, dx = bx - me.x, dz = bz - me.z;
        const [di, dj] = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
        const ti = s[1] + di, tj = s[2] + dj, a0 = this.L.rooms[p.room];
        const w = this.L.w, fl = this.L.fl;
        const ok = ti >= a0.i0 && ti <= a0.i1 && tj >= a0.j0 && tj <= a0.j1 && !this.level.isSolidCell(ti, tj) && fl[tj * w + ti] === fl[s[2] * w + s[1]]
          && !ctx.party().some((q) => Math.abs(q.x - (ti + 0.5) * CELL) < CELL / 2 + 0.4 && Math.abs(q.z - (tj + 0.5) * CELL) < CELL / 2 + 0.4)
          && !this.cuts(s[1], s[2], ti, tj);
        if (!ok) { emit("stuck"); return false; }
        this.level.setSolid(s[1], s[2], false);
        s[1] = ti; s[2] = tj;
        this.level.setSolid(ti, tj, true);
        emit("push");
        if (ti === p.pts[0][0] && tj === p.pts[0][1]) { solve(); return true; }
        // stuck in a corner: it slides back after a moment
        const open = new Uint8Array(this.L.open);
        for (let k = 0; k < open.length; k++) if (this.level.isSolidCell(k % w, Math.floor(k / w))) open[k] = 0;
        open[tj * w + ti] = 1;
        if (!sokoban(open, fl, w, this.L.h, ti, tj, p.pts[0][0], p.pts[0][1], a0)) s[3] = 25;
        return true;
      }
      case "bells":
        if (a !== "ring") return false;
        if (p.code[s[1]] === v) {
          s[1]++;
          emit("ring");
          if (s[1] >= 4) solve();
        } else {
          s[1] = 0;
          emit("ring"); emit("wrong");
          // a wrong peal wakes the bats
          const [x, z] = p.pts[v];
          for (let n = 0; n < 2; n++) ctx.spawn("bat", x + (n - 0.5) * 1.5, z + 1);
        }
        return true;
      case "dials":
        if (a !== "dial" || v < 0 || v > 2) return false;
        s[1 + v] = (s[1 + v] + 1) % 10;
        emit("dial");
        if (p.code.every((c, k) => s[1 + k] === c)) solve();
        return true;
      case "candles":
        if (a !== "light" || s[1 + v] > 0) return false;
        s[1 + v] = BURN * 10;
        emit("light");
        if (s.slice(1).every((x) => x > 0)) solve();
        return true;
      case "key":
        if (a === "take" && s[1] === 1) { s[1] = 2; emit("take"); return true; }
        if (a === "unlock" && s[1] === 2) { solve(); return true; }
        return false;
      case "secret":
        if (a !== "press") return false;
        emit("press");
        solve();
        return true;
      case "flood":
        if (a !== "pump") return false;
        if (!this.pumpers.has(from) || this.clock - this.pumpers.get(from)! > 0.6) emit("pump");
        this.pumpers.set(from, this.clock);
        return false;
      case "riddle": {
        if (a !== "offer") return false;
        if (v === p.code[0]) { solve(); return true; }
        s[1]++;
        emit("wrong");
        const [x, z] = p.pts[1 + v] ?? p.pts[1];
        const kind: MobKind = this.L.depth > 1 ? "headless" : "ghoul";
        ctx.spawn(kind, x + 1.5, z + 1.5);
        if (this.L.depth > 1) ctx.spawn("ghoul", x - 1.5, z + 1.5);
        return true;
      }
    }
    return false;
  }

  /** Whether moving a block from (ai, aj) to (bi, bj) would shut anyone off from the rest of the level. */
  private cuts(ai: number, aj: number, bi: number, bj: number) {
    const w = this.L.w, h = this.L.h;
    const before = new Uint8Array(w * h);
    for (let k = 0; k < before.length; k++) before[k] = this.level.isSolidCell(k % w, Math.floor(k / w)) ? 0 : 1;
    const after = before.slice();
    after[aj * w + ai] = 1; after[bj * w + bi] = 0;
    const s = { i: Math.floor(this.L.start.x / CELL), j: Math.floor(this.L.start.z / CELL) };
    const d0 = reach(before, w, h, s.i, s.j), d1 = reach(after, w, h, s.i, s.j);
    for (let k = 0; k < before.length; k++) if (k !== bj * w + bi && d0[k] >= 0 && d1[k] < 0) return true;
    return false;
  }

  /** Timers: plates coming back up, candles burning down, the pump, a stuck block. Returns whether to tell everyone. */
  tick(states: number[][], dt: number, ctx: HostCtx): boolean {
    let changed = false;
    this.parts.forEach((part, id) => {
      const p = part.p, s = states[id];
      if (!s || s[0]) return;
      const emit = (e: string, v?: number) => ctx.emit({ k: "pz", id, e, v });
      switch (p.kind) {
        case "plates": {
          const party = ctx.party().filter((q) => !q.down);
          let all = true;
          for (let k = 0; k < s[1]; k++) {
            const [x, z] = p.pts[k];
            const on = party.some((q) => Math.abs(q.x - x) < 0.85 && Math.abs(q.z - z) < 0.85);
            const was = s[2 + k];
            if (on) { if (!was) { emit("plate", k); changed = true; } s[2 + k] = PLATE_HOLD * 10; }
            else if (was > 0) { s[2 + k] = Math.max(0, was - dt * 10); if (!s[2 + k]) changed = true; }
            if (!(s[2 + k] > 0)) all = false;
          }
          if (all) { s[0] = 1; emit("solve"); changed = true; }
          break;
        }
        case "candles":
          for (let k = 0; k < p.pts.length; k++) if (s[1 + k] > 0) {
            s[1 + k] = Math.max(0, s[1 + k] - dt * 10);
            if (!s[1 + k]) { emit("out", k); changed = true; }
          }
          break;
        case "block":
          if (s[3] > 0) {
            s[3] = Math.max(0, s[3] - dt * 10);
            if (!s[3] && !this.cuts(s[1], s[2], p.pts[1][0], p.pts[1][1]) && !this.level.isSolidCell(p.pts[1][0], p.pts[1][1])) {
              this.level.setSolid(s[1], s[2], false);
              s[1] = p.pts[1][0]; s[2] = p.pts[1][1];
              this.level.setSolid(s[1], s[2], true);
              emit("reset");
              changed = true;
            }
          }
          break;
        case "flood": {
          let n = 0;
          for (const [, t] of this.pumpers) if (this.clock - t < 0.6) n++;
          if (!n) break;
          const before = Math.floor(s[1] / 5);
          s[1] = Math.min(100, s[1] + dt * PUMP_RATE * n);
          if (Math.floor(s[1] / 5) !== before) changed = true;
          if (s[1] >= 100) { s[0] = 1; emit("solve"); changed = true; }
          break;
        }
      }
    });
    return changed;
  }

  /** The keeper died where it fell: the key drops there (host). */
  dropKey(states: number[][], x: number, z: number, ctx: HostCtx) {
    this.parts.forEach((part, id) => {
      const s = states[id];
      if (part.p.kind !== "key" || !s || s[0] || s[1] !== 0) return;
      s[1] = 1; s[2] = Math.round(x * 10); s[3] = Math.round(z * 10);
      ctx.emit({ k: "pz", id, e: "drop" });
    });
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material & { map?: THREE.Texture };
      if (mat) { if (mat.map && mat.map !== this.glowTex) mat.map.dispose(); mat.dispose(); }
    });
    this.group.removeFromParent();
  }
}
