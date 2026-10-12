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
//   mirrors  turn mirrors on stands to bounce a lantern's beam onto a sun door
//   gems     find three gems about the level and set them in a wall's sockets in the order a verse gives
//   statues  turn the stone watchers to face the light; turning one turns the next one too
//   bridge   wind a windlass to raise a bridge out of the lava, cross before it sinks, pull the lever
//
// Like everything else, the host decides: each puzzle's state is a short list of numbers in the
// world the host sends out (s[0] is 1 once it's solved), uses go to the host as {k:"pz"}, and what
// happens comes back as events. Everyone draws the parts from the same level, so only numbers move.
import * as THREE from "three";
import * as SFX from "../audio";
import { CELL, FACING, GEMS, Level, MIRROR_N, MobKind, Puzzle, ROCKS, sokoban, flood as reach, traceBeam } from "./gen";
import { glow, graffiti, plaque, rockStyle, wood } from "./art";
import { rockTex, type MineLevel } from "./level";

const PLATE_HOLD = 6;      // seconds a plate stays down after you step off
const BURN = 22;           // seconds a chapel candle burns
const PUMP_RATE = 4;       // % a second for each person pumping
const ROMAN = ["I", "II", "III", "IV"];
const RAISE = 22;          // % a second the bridge rises for each person winding
const SINK = 3.4;          // % a second it sinks once nobody is
const BRIDGE_UP = 80;      // % up it has to be to walk on
const GEM_COLOURS = ["#e0303a", "#30c050", "#3a70ff"];
const SOCKET_Y = [1.75, 1.3, 0.85];
const SOCKET_NAMES = ["top", "middle", "bottom"];
const CHAPEL = "the chapel";

export const PUZZLE_NAMES: Record<Puzzle["kind"], string> = {
  levers: "Pull the levers", plates: "Hold the weighbridge plates down together", block: "Push the stone onto its plate",
  bells: "Ring the bells in the right order", dials: "Open the powder store lock", candles: `Keep every candle in ${CHAPEL} alight`,
  key: "Bring the foreman's key to the gate", secret: "Find the loose stone", flood: "Pump out the flooded working",
  riddle: "Answer the riddle on the tablet",
  mirrors: "Turn the mirrors to light the sun door", gems: "Set the three gems in the sockets",
  statues: "Turn the watchers to face the light", bridge: "Raise the bridge and pull the lever beyond",
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
  private winders = new Map<string, number>();   // host: who's winding the bridge up
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
        case "mirrors": return [0, ...p.code.slice(6 + p.cells.length)];
        case "gems": return [0, 0, 0, 0];
        case "statues": return [0, ...p.code.slice((p.code.length) / 2)];
        case "bridge": return [0, 0];
        default: return [0, 0];
      }
    });
  }

  // ---- models ----------------------------------------------------------------------------------------

  /** A carved tablet standing out from the rock on a slab, so the rough wall can't poke through it. */
  private plaqueMesh(lines: string[], w: number, h: number, pt: number[], y: number) {
    const t = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: plaque(lines), emissive: "#1a1408" }));
    face.position.z = 0.36;
    t.add(box(w + 0.16, h + 0.16, 0.34, mat("#6a6050"), 0, 0, 0.18), face);
    t.position.set(pt[0], this.y(pt[0] + pt[2] * 0.6, pt[1] + pt[3] * 0.6) + y, pt[1]);
    t.rotation.y = Math.atan2(pt[2], pt[3]);
    return t;
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
      // (stood a little off the rock, which is rough enough to swallow anything flush with it)
      w.position.set(pt[0] + pt[2] * 0.15, this.y(pt[0] + pt[2] * 0.6, pt[1] + pt[3] * 0.6), pt[1] + pt[3] * 0.15);
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
          m.position.set(p.clue[0] + p.clue[2] * 0.3, this.y(p.clue[0] + p.clue[2] * 0.6, p.clue[1] + p.clue[3] * 0.6) + 1.4, p.clue[1] + p.clue[3] * 0.3);
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
        const t = rockTex(ROCKS[this.L.rock[p.cells[0]]], 3 + this.L.rock[p.cells[0]]);
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
      case "mirrors": {
        // the lantern on the wall
        const lw = wallGroup(p.pts[0]);
        lw.add(box(0.5, 0.5, 0.4, this.brass, 0, 1.2, 0.2));
        const lens = cyl(0.17, 0.17, 0.06, mat("#fff2c0", "#ffd070"), 0, 1.2, 0.42, 14);
        lens.rotation.x = Math.PI / 2;
        lw.add(lens, this.flame(0, 1.2, 0.5, 0.9));
        // the sun door: a great stone disc carved with a sun, in the rock face the beam has to reach
        const dw = wallGroup(p.pts[1]);
        const sunMat = new THREE.MeshLambertMaterial({ map: this.sunTex(), color: "#d8ccb0", emissive: "#000000" });
        const sun = cyl(0.9, 0.9, 0.16, sunMat, 0, 1.25, 0.08, 20);
        sun.rotation.x = Math.PI / 2;
        sun.rotation.y = Math.PI;
        dw.add(sun);
        // mirrors on stands
        const mirrors = p.cells.map((c, k) => {
          const { i, j } = this.cellOf(c);
          const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL, y = this.y(x, z);
          g.add(cyl(0.3, 0.38, 0.12, this.iron, x, y + 0.06, z, 10), cyl(0.05, 0.05, 0.8, this.iron, x, y + 0.5, z, 6));
          const pivot = new THREE.Group();
          pivot.position.set(x, y + 1.2, z);
          const front = box(1.0, 0.9, 0.04, new THREE.MeshPhongMaterial({ color: "#dfe8ee", emissive: "#20303a", shininess: 120, specular: "#ffffff" }), 0, 0, 0.03);
          const backing = box(1.1, 1.0, 0.06, this.woodMat, 0, 0, -0.02);
          pivot.add(backing, front);
          const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), new THREE.MeshLambertMaterial({ map: plaque([ROMAN[k]]) }));
          tag.position.set(0, -0.62, 0.07);
          pivot.add(tag);
          g.add(pivot);
          return { pivot, want: 0 };
        });
        const beamMat = new THREE.MeshBasicMaterial({ color: "#fff0b0", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
        const beam = new THREE.Group();
        g.add(beam);
        const [ei, ej, edi, edj, ti, tj] = p.code;
        sync = (s) => {
          mirrors.forEach((m, k) => (m.want = Math.atan2(MIRROR_N[s[1 + k]][0], MIRROR_N[s[1 + k]][1])));
          for (const c of [...beam.children]) { beam.remove(c); (c as THREE.Mesh).geometry.dispose(); }
          const map = new Map(p.cells.map((c, k) => [c, s[1 + k]]));
          const tr = traceBeam(this.L.open, this.L.w, ei, ej, edi, edj, map);
          const y0 = this.y((ei + 0.5) * CELL, (ej + 0.5) * CELL) + 1.2;
          const pts = tr.pts.map(([i, j]) => [(i + 0.5) * CELL, (j + 0.5) * CELL]);
          pts[0] = [p.pts[0][0] + p.pts[0][2] * 0.5, p.pts[0][1] + p.pts[0][3] * 0.5];
          if (tr.hit >= 0) { const e = pts[pts.length - 1]; pts[pts.length - 1] = [e[0] - tr.di * CELL * 0.5, e[1] - tr.dj * CELL * 0.5]; }
          for (let n = 0; n + 1 < pts.length; n++) {
            const [ax, az] = pts[n], [bx, bz] = pts[n + 1], len = Math.hypot(bx - ax, bz - az);
            if (len < 0.01) continue;
            const seg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, len), beamMat);
            seg.position.set((ax + bx) / 2, y0, (az + bz) / 2);
            seg.rotation.y = Math.atan2(bx - ax, bz - az);
            beam.add(seg);
          }
          const lit = s[0] === 1 || tr.hit === tj * this.L.w + ti;
          sunMat.emissive.set(lit ? "#a07020" : "#000000");
        };
        anim = (dt) => mirrors.forEach((m) => {
          let d = m.want - m.pivot.rotation.y;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          m.pivot.rotation.y += d * Math.min(1, dt * 8);
        });
        break;
      }
      case "gems": {
        // the socket stone, with the verse beside it
        const w = wallGroup(p.pts[0]);
        w.add(box(1.0, 1.6, 0.14, new THREE.MeshLambertMaterial({ map: rockStyle("oolite", 6), color: "#d8ccb0" }), 0, 1.3, 0.07));
        const held = SOCKET_Y.map((sy) => {
          const hole = cyl(0.13, 0.13, 0.05, mat("#120c08"), 0, sy, 0.15, 12);
          hole.rotation.x = Math.PI / 2;
          w.add(hole);
          const gem = this.gem(0);
          gem.position.set(0, sy, 0.2);
          gem.visible = false;
          w.add(gem);
          return gem;
        });
        const verse = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshLambertMaterial({ map: plaque(["THE THREE STONES", ...p.text]), polygonOffset: true, polygonOffsetFactor: -2 }));
        verse.position.set(1.25, 1.5, 0.34);
        w.add(box(1.5, 0.9, 0.3, mat("#6a6050"), 1.25, 1.5, 0.17));
        w.add(verse);
        // the gems where they lie, on little stands
        const stand = mat("#8f8576");
        const loose = p.pts.slice(1).map(([x, z], gI) => {
          const y = this.y(x, z);
          g.add(cyl(0.18, 0.24, 0.8, stand, x, y + 0.4, z, 8));
          const gem = this.gem(gI);
          gem.position.set(x, y + 1.05, z);
          g.add(gem);
          return gem;
        });
        sync = (s) => {
          loose.forEach((gem, gI) => (gem.visible = s[1 + gI] === 0));
          held.forEach((gem, q) => {
            const gI = [0, 1, 2].find((n) => s[1 + n] === 2 + q);
            gem.visible = gI !== undefined || s[0] === 1;
            const c = GEM_COLOURS[gI ?? p.code[q]];
            for (const m of gem.children) { const mm = (m as THREE.Mesh).material as THREE.MeshPhongMaterial; mm.color?.set(c); mm.emissive?.set(c).multiplyScalar(0.4); }
          });
        };
        anim = (dt) => loose.forEach((gem) => { gem.rotation.y += dt * 1.5; });
        break;
      }
      case "statues": {
        // the shrine: an altar with a light on it
        const sw = wallGroup(p.pts[0]);
        sw.add(box(1.2, 0.9, 0.6, new THREE.MeshLambertMaterial({ map: rockStyle("oolite", 7), color: "#d8ccb0" }), 0, 0.45, 0.3));
        sw.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), mat("#fff0c0", "#ffcc60")));
        sw.children[1].position.set(0, 1.08, 0.3);
        sw.add(this.flame(0, 1.1, 0.3, 1.4));
        const words = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshLambertMaterial({ map: plaque(["THE WATCHERS", "All must look upon the light.", "Turn one, and the next turns too."]), polygonOffset: true, polygonOffsetFactor: -2 }));
        words.position.set(0, 1.9, 0.34);
        sw.add(box(1.7, 0.9, 0.3, mat("#6a6050"), 0, 1.9, 0.17));
        sw.add(words);
        const stoneMat = new THREE.MeshLambertMaterial({ map: rockStyle("oolite", 8), color: "#cfc6b4" });
        const eyes = mat("#ff6030", "#ff3010");
        const figures = p.pts.slice(1).map(([x, z], k) => {
          const y = this.y(x, z);
          g.add(box(0.9, 0.5, 0.9, stoneMat, x, y + 0.25, z));
          const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshLambertMaterial({ map: plaque([ROMAN[k]]) }));
          const fig = new THREE.Group();
          fig.position.set(x, y + 0.5, z);
          // a hooded figure, its face and hands to the front
          fig.add(cyl(0.18, 0.42, 1.5, stoneMat, 0, 0.75, 0, 8), new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), stoneMat));
          fig.children[1].position.set(0, 1.62, 0);
          const hood = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 8, 1, true), stoneMat);
          hood.position.set(0, 1.72, -0.04);
          fig.add(hood, box(0.5, 0.14, 0.24, stoneMat, 0, 1.05, 0.2));
          for (const ex of [-0.07, 0.07]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyes); e.position.set(ex, 1.64, 0.2); fig.add(e); }
          tag.position.set(0, -0.12, 0.46);
          fig.add(tag);
          g.add(fig);
          return { fig, want: 0 };
        });
        sync = (s) => figures.forEach((f, k) => { const [fx, fz] = FACING[s[1 + k]]; f.want = Math.atan2(fx, fz); });
        anim = (dt) => figures.forEach((f) => {
          let d = f.want - f.fig.rotation.y;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          f.fig.rotation.y += d * Math.min(1, dt * 5);
        });
        break;
      }
      case "bridge": {
        // the windlass on the shore
        const [wx, wz] = p.pts[0], wy = this.y(wx, wz);
        for (const s2 of [-0.45, 0.45]) g.add(box(0.14, 1.1, 0.14, this.woodMat, wx + s2, wy + 0.55, wz));
        const drum = new THREE.Group();
        drum.position.set(wx, wy + 0.95, wz);
        const barrel = cyl(0.2, 0.2, 0.8, this.woodMat, 0, 0, 0, 10);
        barrel.rotation.z = Math.PI / 2;
        drum.add(barrel, box(0.06, 0.7, 0.06, this.iron, 0.5, 0.3, 0), box(0.06, 0.06, 0.3, this.iron, 0.5, 0.65, 0.12));
        g.add(drum);
        // the lever on the island
        const [lx, lz] = p.pts[1], ly = this.y(lx, lz);
        g.add(box(0.5, 0.3, 0.5, this.iron, lx, ly + 0.15, lz));
        const lever = new THREE.Group();
        lever.position.set(lx, ly + 0.3, lz);
        lever.add(box(0.08, 1.0, 0.08, this.iron, 0, 0.5, 0), new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat("#c0301a", "#5a1005")));
        lever.children[1].position.y = 1.0;
        g.add(lever);
        // the bridge: a slab of stone per cell, each a little higher towards the island
        const n = p.cells.length, [shoreY, islandY] = p.code;
        const lavaY = p.cells.map((c) => this.L.fl[c]);
        const tops = p.cells.map((_, k) => shoreY + ((islandY - shoreY) * (n - k)) / (n + 1));
        const t = rockStyle("oolite", 5);
        const slabs = p.cells.map((c, k) => {
          const { i, j } = this.cellOf(c);
          const slab = box(CELL * 0.96, 1.2, CELL * 0.96, new THREE.MeshLambertMaterial({ map: t, color: "#bfb4a0" }), (i + 0.5) * CELL, 0, (j + 0.5) * CELL);
          slab.userData.top = tops[k];
          g.add(slab);
          return slab;
        });
        let shown = 0, want = 0, wound = 0, up = false;
        sync = (s) => {
          want = s[0] ? 100 : s[1];
          lever.rotation.x = s[0] ? 0.9 : -0.9;
          // walk on it once it's up (everyone works this out from the same number)
          const nowUp = s[0] === 1 || s[1] >= BRIDGE_UP;
          if (nowUp !== up) {
            up = nowUp;
            p.cells.forEach((c, k) => { this.L.surf[c] = up ? 0 : 1; this.L.fl[c] = up ? tops[k] : lavaY[k]; });
          }
        };
        (this as any)[`wind${p.id}`] = () => { wound = 1; };
        anim = (dt) => {
          shown += (want - shown) * Math.min(1, dt * 3);
          slabs.forEach((sl) => { sl.position.y = sl.userData.top - 0.6 - (1 - shown / 100) * 2.2; });
          wound = Math.max(0, wound - dt * 2);
          drum.rotation.x += dt * 6 * wound;
        };
        break;
      }
      case "riddle": {
        g.add(this.plaqueMesh([...p.text, "", "Make the right offering."], 2.4, 1.2, p.pts[0], 1.7));
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

  /** A cut gem. */
  private gem(k: number): THREE.Object3D {
    const o = new THREE.Group();
    const c = GEM_COLOURS[k];
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshPhongMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.4), shininess: 100, specular: "#ffffff", flatShading: true }));
    m.scale.y = 1.3;
    o.add(m);
    return o;
  }

  /** A sun carved in stone, for the mirror puzzle's door. */
  private sunTex(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#c8bca0"; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#6a5a40"; g.lineWidth = 4;
    g.beginPath(); g.arc(64, 64, 22, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30); g.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54); g.stroke(); }
    g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
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
        case "mirrors":
          if (!s[0]) p.cells.forEach((c, k) => {
            const { i, j } = this.cellOf(c), x = (i + 0.5) * CELL, z = (j + 0.5) * CELL;
            out.push({ x, y: this.y(x, z) + 1.2, z, text: `<b>E</b> Turn mirror ${ROMAN[k]}`, use: { id, a: "turn", v: k } });
          });
          break;
        case "gems": {
          if (s[0]) break;
          p.pts.slice(1).forEach(([x, z], gI) => { if (s[1 + gI] === 0) out.push({ x, y: this.y(x, z) + 1.05, z, text: `<b>E</b> Take the ${GEMS[gI]} gem`, use: { id, a: "take", v: gI } }); });
          const pt = p.pts[0];
          SOCKET_Y.forEach((sy, q) => {
            const { held, next } = this.gemSwap(s, q);
            const where = `the ${SOCKET_NAMES[q]} socket`;
            const text = held < 0 && next < 0 ? `An empty socket. Find the gems`
              : held < 0 ? `<b>E</b> Put the ${GEMS[next]} gem in ${where}`
              : next < 0 ? `<b>E</b> Take the ${GEMS[held]} gem out of ${where}`
              : `<b>E</b> Swap the ${GEMS[held]} gem for the ${GEMS[next]}`;
            out.push({ x: pt[0] + pt[2] * 0.15, y: wy(pt) + sy, z: pt[1] + pt[3] * 0.15, text, use: held < 0 && next < 0 ? undefined : { id, a: "socket", v: q } });
          });
          break;
        }
        case "statues":
          if (!s[0]) p.pts.slice(1).forEach(([x, z], k) => out.push({ x, y: this.y(x, z) + 1.6, z, text: `<b>E</b> Turn watcher ${ROMAN[k]}`, use: { id, a: "turn", v: k } }));
          break;
        case "bridge": {
          if (s[0]) break;
          const [wx, wz] = p.pts[0], [lx, lz] = p.pts[1];
          out.push({ x: wx, y: this.y(wx, wz) + 0.95, z: wz, text: `Hold <b>E</b> to wind the bridge up (${Math.floor(s[1])}%)`, use: { id, a: "wind" }, hold: true });
          out.push({ x: lx, y: this.y(lx, lz) + 1.0, z: lz, text: "<b>E</b> Pull the lever", use: { id, a: "pull" } });
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

  /** For a gem socket: the gem in it (or -1), and the gem E would put in its place (or -1). */
  private gemSwap(s: number[], q: number) {
    const held = [0, 1, 2].find((n) => s[1 + n] === 2 + q) ?? -1;
    const bag = [0, 1, 2].filter((n) => s[1 + n] === 1);
    const next = bag.find((n) => n > held) ?? bag[0] ?? -1;
    return { held, next };
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
      if (p.kind === "gems" && !s[0]) text += ` (${s.slice(1).filter((v) => v > 0).length} of 3 found)`;
      if (p.kind === "bridge" && !s[0] && s[1] > 0) text = `Raise the bridge (${Math.floor(s[1])}%) and pull the lever beyond`;
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
        case "gems":
          out.push({ x: p.pts[0][0], z: p.pts[0][1], done: s[0] === 1 });
          p.pts.slice(1).forEach(([x, z], gI) => { if (s[1 + gI] === 0 && !s[0]) out.push({ x, z, done: false, small: true }); });
          break;
        case "mirrors":
          out.push({ x: p.pts[1][0], z: p.pts[1][1], done: s[0] === 1 }, { x: p.pts[0][0], z: p.pts[0][1], done: s[0] === 1, small: true });
          break;
        case "bridge":
          out.push({ x: p.pts[0][0], z: p.pts[0][1], done: s[0] === 1 }, { x: p.pts[1][0], z: p.pts[1][1], done: s[0] === 1, small: true });
          break;
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
      case "wrong":
        SFX.clunk(d, pn);
        if (p.kind === "bells") (this as any)[`ring${ev.id}`]?.(ev.v);
        return p.kind === "bells" ? "A wrong note. Something stirs" : p.kind === "gems" ? "The gems fall from their sockets. Something stirs" : "The wrong offering. Something stirs";
      case "turn": SFX.grind(d, pn, 0.6); return "";
      case "gem": SFX.pickup("fizz"); return `Found the ${GEMS[ev.v ?? 0]} gem`;
      case "socket": SFX.clunk(d, pn); return "";
      case "wind": (this as any)[`wind${ev.id}`]?.(); SFX.tick(d, pn); return "";
      case "up": SFX.grind(d, pn, 1.6); return "The bridge stands clear of the lava";
      case "sinking": SFX.grind(d, pn, 0.8); return "The bridge is sinking back into the lava";
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
      case "mirrors": {
        if (a !== "turn" || v < 0 || v >= p.cells.length) return false;
        s[1 + v] = (s[1 + v] + 1) % 4;
        emit("turn");
        const [ei, ej, di, dj, ti, tj] = p.code;
        const tr = traceBeam(this.L.open, this.L.w, ei, ej, di, dj, new Map(p.cells.map((c, k) => [c, s[1 + k]])));
        if (tr.hit === tj * this.L.w + ti) solve();
        return true;
      }
      case "gems": {
        if (a === "take" && s[1 + v] === 0) { s[1 + v] = 1; emit("gem"); return true; }
        if (a !== "socket" || v < 0 || v > 2) return false;
        const { held, next } = this.gemSwap(s, v);
        if (held < 0 && next < 0) return false;
        if (held >= 0) s[1 + held] = 1;
        if (next >= 0) s[1 + next] = 2 + v;
        emit("socket");
        // all three set: right, or they fall out and something comes
        if ([0, 1, 2].every((q) => [0, 1, 2].some((n) => s[1 + n] === 2 + q))) {
          if (p.code.every((gI, q) => s[1 + gI] === 2 + q)) solve();
          else {
            for (let n = 0; n < 3; n++) s[1 + n] = 1;
            emit("wrong");
            const pt = p.pts[0];
            ctx.spawn(this.L.depth > 1 ? "headless" : "ghoul", pt[0] + pt[2] * 2.5, pt[1] + pt[3] * 2.5);
          }
        }
        return true;
      }
      case "statues": {
        const n = p.pts.length - 1;
        if (a !== "turn" || v < 0 || v >= n) return false;
        s[1 + v] = (s[1 + v] + 1) % 4;
        if (v + 1 < n) s[2 + v] = (s[2 + v] + 1) % 4;
        emit("turn");
        if (p.code.slice(0, n).every((f, k) => s[1 + k] === f)) solve();
        return true;
      }
      case "bridge":
        if (a === "wind") {
          if (!this.winders.has(from) || this.clock - this.winders.get(from)! > 0.6) emit("wind");
          this.winders.set(from, this.clock);
          return false;
        }
        if (a === "pull") { s[1] = 100; solve(); emit("pull"); return true; }
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
        case "bridge": {
          let n = 0;
          for (const [, t] of this.winders) if (this.clock - t < 0.6) n++;
          const before = s[1];
          s[1] = n ? Math.min(100, s[1] + dt * RAISE * n) : Math.max(0, s[1] - dt * SINK);
          if (Math.floor(s[1] / 5) !== Math.floor(before / 5)) changed = true;
          if (before < BRIDGE_UP && s[1] >= BRIDGE_UP) emit("up");
          if (!n && before >= 92 && s[1] < 92) emit("sinking");
          if (before >= BRIDGE_UP && s[1] < BRIDGE_UP) changed = true;
          break;
        }
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
