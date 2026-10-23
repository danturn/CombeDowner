// Scars: losing leaves its mark on the town for the rest of the day, Dwarf Fortress style. A job
// lost or called off, or a pub the Flag Lads kept, leaves something behind where it happened:
// - a pub kept by the Flag Lads: a cocky "WE RUN THIS" banner outside, signed by the Gaffer (who
//   has picked up a new trait for winning, in invasion.ts);
// - Seagull Attack lost: chips and litter all over, and gulls nesting on the roofs round about;
// - a treasure trail lost: a hole where the chest was dug up, with a rival's note ("Too slow. — K");
// - a race nobody finished: skid marks, and the winner's smug ghost idling on the line;
// - anything else (a Wanted man who got away): his tag sprayed on the pavement.
// Each one is also a little job of its own: stand at it and press E, and a few seconds' work
// (tearing down the banner, sweeping up, filling in the hole) clears it, with a prize and a banner.
// Scars go on the maps as a grey "!", and they all go at midnight GMT, with the Flag Lads' season.
//
// Who decides what: the host. Everyone sees a job end the same way, but only the host writes it
// down as a scar and sends the day's list round as "scr" when it changes and to anyone who joins.
// Everyone keeps a copy of the room's list for the day on their own machine (per map, room and
// day, so it survives a reload), and a joiner sends theirs ("scr" with k "mine") for the host to
// merge in: scars are joined together by id, and one put right stays put right (the fixed ids
// travel with the list). Whoever finishes clearing one says so ("scr" with k "fix"); the host takes
// it off the list, drops the prize and tells everyone who did it, for the banner. A page that
// doesn't know "scr" just sees no scars.
import * as THREE from "three";
import * as SFX from "./audio";
import type { GameMap } from "./map";
import type { JobSpot } from "./minimap";
import { missionStage } from "./missionscreens";
import { esc, hash, rng } from "./quests";

export type ScarKind = "pub" | "gulls" | "trail" | "race" | "tag";
interface Scar { id: number; k: ScarKind; x: number; z: number; n: string; day: number }

export interface ScarWorld {
  readonly map: GameMap;
  readonly scene: THREE.Scene;
  readonly selfId: string;
  readonly isHost: boolean;
  /** Which room's scars these are: the map and room code, or "solo". */
  readonly slot: string;
  me(): { x: number; z: number; alive: boolean };
  send(data: unknown, to?: string): void;
  toast(text: string, secs?: number): void;
  feed(html: string): void;
  nameOf(id: string): string;
  /** Host: a prize on the ground. */
  prize(x: number, z: number, good: boolean): void;
  hear(x: number, y: number, z: number): [number, number];
}

const KEY = "cd-scars";           // plus the room and the day, so each room keeps its own and old days can go
const MAX = 12;               // scars kept at once; the oldest goes first
const SHOWN = 260;            // built this close, and taken down past SHOWN + 40
const REACH = 4;              // how close to start clearing one
const WORK = 3;               // seconds of work to clear one
const COLOUR = "#9a3b3b";
const DAY = 24 * 3600 * 1000;
const today = () => Math.floor(Date.now() / DAY);

/** A job kind (quests.ts) as the kind of mark it leaves. */
export function scarKindOf(job: string): ScarKind {
  return job === "gulls" ? "gulls" : job === "trail" ? "trail" : job === "race" ? "race" : "tag";
}

const VERB: Record<ScarKind, [string, string]> = {
  pub: ["Tear down the Flag Lads' banner", "tore down the Flag Lads' banner"],
  gulls: ["Sweep up the chips (the gulls will go)", "swept up after the gulls"],
  trail: ["Fill in the hole", "filled in the rival's hole"],
  race: ["See off the smug ghost", "saw off the smug ghost"],
  tag: ["Scrub off the tag", "scrubbed off the tag"],
};
const SAID: Record<ScarKind, (n: string) => string> = {
  pub: (n) => `The Flag Lads kept ${n.split("|")[0]}, and they've put a banner up to say so`,
  gulls: (n) => `The gulls have made a mess of ${n}, and they're nesting on the roofs`,
  trail: () => "Someone else dug up the chest, and left a hole and a note",
  race: () => "The race's winner is idling on the line, looking smug",
  tag: (n) => `Lost "${n}", and there's a tag sprayed on the pavement to rub it in`,
};

function lambert(c: string) { return new THREE.MeshLambertMaterial({ color: c }); }

/** Words on a canvas, as a texture: lines drawn centred, in colour on a background (or none). */
function lettering(w: number, h: number, bg: string | null, lines: { t: string; font: string; c: string; y: number }[]) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const x = cv.getContext("2d")!;
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.textAlign = "center"; x.textBaseline = "middle";
  for (const l of lines) { x.font = l.font; x.fillStyle = l.c; x.fillText(l.t, w / 2, l.y, w - 16); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Scattered bits on the ground in one draw: n boxes of size s within r of the middle. */
function scatter(r: () => number, n: number, rad: number, size: [number, number, number], colour: string, ground: (x: number, z: number) => number, ox: number, oz: number) {
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(...size), lambert(colour), n);
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad, x = Math.cos(a) * d, z = Math.sin(a) * d;
    p.set(x, ground(ox + x, oz + z) - ground(ox, oz) + size[1] / 2, z);
    m.setMatrixAt(k, mat.compose(p, q.setFromEuler(e.set(0, r() * Math.PI, 0)), one));
  }
  return m;
}

export class Scars {
  private list: Scar[] = [];
  private views = new Map<number, { g: THREE.Group; ghost?: THREE.Object3D; cryT: number }>();
  private work: { id: number; t: number } | null = null;
  private near: Scar | null = null;
  private t = 0;
  private gone = new Set<number>();   // put right today: kept so a stale copy can't bring one back

  constructor(private w: ScarWorld) {
    this.prune();
    try {
      const d = JSON.parse(localStorage.getItem(this.key()) ?? "null");
      if (d) this.merge(d.s, d.f);
    } catch { /* storage may be blocked */ }
  }

  private key() { return `${KEY}:${this.w.slot}:${today()}`; }

  private prune() {
    try {
      const now = String(today());
      for (const k of Object.keys(localStorage)) {
        if (k === KEY || (k.startsWith(KEY + ":") && !k.endsWith(":" + now))) localStorage.removeItem(k);
      }
    } catch { /* storage may be blocked */ }
  }

  /** Host: something lost here, of this kind; n names it (the pub, the place, the Gaffer). */
  add(k: ScarKind, x: number, z: number, n: string) {
    if (!this.w.isHost) return;
    const day = today(), id = hash("scar", k, Math.round(x), Math.round(z), day);
    if (this.list.some((s) => s.id === id)) return;
    this.list.push({ id, k, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, n, day });
    while (this.list.length > MAX) this.drop(this.list[0].id);
    this.changed();
    this.say(this.list[this.list.length - 1]);
  }

  private say(s: Scar) { this.w.feed(`<b style="color:${COLOUR}">${esc(SAID[s.k](s.n))}</b>. Go and put it right (the grey ! on the map)`); }

  /** Someone joined: the host tells them the day's scars, and anyone else offers theirs to the host. */
  joined(id: string) {
    if (this.w.isHost) this.w.send({ k: "all", l: this.packed(), f: [...this.gone] }, id);
    else if (this.list.length || this.gone.size) this.w.send({ k: "mine", l: this.packed(), f: [...this.gone] }, id);
  }

  onMessage(d: any, from: string) {
    if (!d || typeof d !== "object") return;
    if (d.k === "all" && Array.isArray(d.l)) {
      if (this.w.isHost && from !== this.w.selfId) return;
      const had = new Set(this.list.map((s) => s.id));
      this.merge(d.l, d.f);
      this.save();
      for (const s of this.list.filter((o) => !had.has(o.id)).slice(-3)) this.say(s);
      return;
    }
    if (d.k === "mine" && Array.isArray(d.l)) {
      if (this.w.isHost && this.merge(d.l, d.f)) this.changed();
      return;
    }
    if (d.k === "fix" && this.w.isHost) {
      const s = this.list.find((o) => o.id === Number(d.id));
      if (!s) return;
      this.drop(s.id);
      this.w.prize(s.x, s.z, true);
      this.changed();
      const msg = { k: "fixed", id: s.id, sk: s.k, by: from };
      this.w.send(msg);
      this.onMessage(msg, this.w.selfId);
      return;
    }
    if (d.k === "fixed") {
      const k = (d.sk in VERB ? d.sk : "tag") as ScarKind, by = String(d.by ?? "");
      if (!this.w.isHost) this.drop(Number(d.id));
      this.gone.add(Number(d.id));
      this.save();
      missionStage({ title: "Put right!", sub: `${by === this.w.selfId ? "You" : this.w.nameOf(by)} ${VERB[k][1]}`, colour: "#58e06a", life: 2.5 });
      if (by === this.w.selfId) SFX.solved();
    }
  }

  private packed() { return this.list.map((s) => [s.id, s.k, s.x, s.z, s.n, s.day]); }

  /** Join another copy of the day's list to ours; says whether ours changed. */
  private merge(l: any, f: any) {
    const day = today(), before = this.list.length + this.gone.size;
    for (const id of Array.isArray(f) ? f : []) this.gone.add(Number(id));
    const have = new Set(this.list.map((s) => s.id));
    for (const r of Array.isArray(l) ? l : []) {
      if (!Array.isArray(r) || Number(r[5]) !== day || !(String(r[1]) in VERB) || have.has(Number(r[0]))) continue;
      this.list.push({ id: Number(r[0]), k: String(r[1]) as ScarKind, x: Number(r[2]) || 0, z: Number(r[3]) || 0, n: String(r[4] ?? "").slice(0, 90), day });
    }
    for (const s of this.list.filter((o) => this.gone.has(o.id))) this.drop(s.id);
    while (this.list.length > MAX) this.drop(this.list[0].id);
    return this.list.length + this.gone.size !== before || this.list.some((s) => !have.has(s.id));
  }
  private save() {
    try { localStorage.setItem(this.key(), JSON.stringify({ s: this.packed(), f: [...this.gone] })); } catch { /* storage may be blocked */ }
  }
  private changed() { this.save(); this.w.send({ k: "all", l: this.packed(), f: [...this.gone] }); }
  private drop(id: number) {
    this.list = this.list.filter((s) => s.id !== id);
    this.unbuild(id);
    if (this.work?.id === id) this.work = null;
  }

  /** The maps' grey "!" for each. */
  spots(): JobSpot[] { return this.list.map((s) => ({ x: s.x, z: s.z, colour: COLOUR, glyph: "!", label: VERB[s.k][0] })); }

  update(dt: number) {
    this.t += dt;
    if (this.list.length && this.list[0].day !== today()) { for (const s of this.list) this.unbuild(s.id); this.list = []; this.gone.clear(); this.prune(); this.save(); }
    const me = this.w.me();
    this.near = null;
    for (const s of this.list) {
      const d = Math.hypot(s.x - me.x, s.z - me.z), v = this.views.get(s.id);
      if (!v && d < SHOWN && this.w.map.detailedAt(s.x, s.z)) this.build(s);
      else if (v && d > SHOWN + 40) this.unbuild(s.id);
      const view = this.views.get(s.id);
      if (view) this.animate(s, view, d, dt);
      if (d < (s.k === "gulls" ? REACH + 4 : REACH) && me.alive && (!this.near || d < Math.hypot(this.near.x - me.x, this.near.z - me.z))) this.near = s;
    }
    if (this.work) {
      const s = this.list.find((o) => o.id === this.work!.id);
      if (!s || this.near !== s) { this.work = null; return; }
      if ((this.work.t += dt) >= WORK) {
        this.work = null;
        this.w.send({ k: "fix", id: s.id });
        if (this.w.isHost) this.onMessage({ k: "fix", id: s.id }, this.w.selfId);
      }
    }
  }

  /** What E does here, if anything. */
  hint(): string {
    const s = this.near;
    if (!s) return "";
    if (this.work) return `${esc(VERB[s.k][0].replace(/ \(.*\)$/, ""))}… ${Math.round((this.work.t / WORK) * 100)}%`;
    return `<b>E</b> ${esc(VERB[s.k][0])}`;
  }

  /** E pressed: start putting it right. */
  use(): boolean {
    const s = this.near;
    if (!s || this.work) return false;
    this.work = { id: s.id, t: 0 };
    SFX.dig();
    return true;
  }

  private animate(s: Scar, v: { g: THREE.Group; ghost?: THREE.Object3D; cryT: number }, d: number, dt: number) {
    if (v.ghost) { v.ghost.position.y = 0.05 + Math.sin(this.t * 3) * 0.05; v.ghost.rotation.y = Math.sin(this.t * 0.7) * 0.4; }
    if (s.k === "gulls" && d < 90 && (v.cryT -= dt) <= 0) {
      v.cryT = 5 + Math.random() * 6;
      SFX.gullCry(...this.w.hear(s.x, this.w.map.ground(s.x, s.z) + 8, s.z));
    }
  }

  private build(s: Scar) {
    const map = this.w.map, y0 = map.ground(s.x, s.z), g = new THREE.Group(), r = rng(s.id);
    const ground = (x: number, z: number) => map.ground(x, z);
    g.position.set(s.x, y0, s.z);
    // things scattered on the ground are laid on it where they fall, so only the rest is turned about
    if (s.k !== "gulls" && s.k !== "race") g.rotation.y = r() * Math.PI * 2;
    let ghost: THREE.Object3D | undefined;
    if (s.k === "pub") {
      for (const x of [-1.6, 1.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), lambert("#777")); p.position.set(x, 1.4, 0); g.add(p); }
      const tex = lettering(512, 160, "#f4f4f4", [
        { t: "WE RUN THIS", font: "900 84px Impact, 'Barlow Condensed', sans-serif", c: "#c8102e", y: 66 },
        { t: `— ${s.n.split("|")[1] || "the Flag Lads"}`, font: "italic 600 34px Georgia, serif", c: "#222", y: 134 },
      ]);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
      banner.position.y = 2.2;
      g.add(banner);
    } else if (s.k === "gulls") {
      g.add(scatter(r, 40, 9, [0.04, 0.04, 0.3], "#f2c94c", ground, s.x, s.z));
      g.add(scatter(r, 14, 9, [0.25, 0.02, 0.3], "#eeeeee", ground, s.x, s.z));
      // gulls sat on nests on the roofs round about, wherever there's a roof to sit on
      const roofs: THREE.Vector3[] = [];
      for (let k = 0; k < 14 && roofs.length < 6; k++) {
        const a = r() * Math.PI * 2, dd = 10 + r() * 40, x = s.x + Math.cos(a) * dd, z = s.z + Math.sin(a) * dd;
        const hit = map.raycast(x, y0 + 80, z, 0, -1, 0, 120);
        if (hit && hit.kind === "building") roofs.push(new THREE.Vector3(x, y0 + 80 - hit.dist, z));
      }
      if (roofs.length) {
        const nest = new THREE.InstancedMesh(new THREE.TorusGeometry(0.28, 0.1, 4, 8), lambert("#6b5433"), roofs.length);
        const gull = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), lambert("#f6f6f6"), roofs.length * 2);
        const m = new THREE.Matrix4(), inv = new THREE.Matrix4().makeRotationY(-g.rotation.y);
        roofs.forEach((p, k) => {
          const local = p.clone().sub(g.position).applyMatrix4(inv);
          nest.setMatrixAt(k, m.makeRotationX(Math.PI / 2).setPosition(local.x, local.y + 0.08, local.z));
          gull.setMatrixAt(k * 2, m.makeScale(1, 0.8, 1.6).setPosition(local.x, local.y + 0.3, local.z));
          gull.setMatrixAt(k * 2 + 1, m.makeScale(0.6, 0.6, 0.6).setPosition(local.x, local.y + 0.5, local.z + 0.28));
        });
        g.add(nest, gull);
      }
    } else if (s.k === "trail") {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), new THREE.MeshBasicMaterial({ color: "#1c140c" }));
      hole.rotation.x = -Math.PI / 2; hole.position.y = 0.04;
      const heap = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), lambert("#5b4632"));
      heap.scale.y = 0.45; heap.position.set(1.3, 0, 0.2);
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 0.05), lambert("#5a3d22"));
      stick.position.set(-1, 0.55, 0);
      const note = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, map: lettering(256, 184, "#f4ecd4", [
        { t: "Too slow.", font: "italic 700 48px Georgia, serif", c: "#222", y: 70 },
        { t: "— K", font: "italic 600 40px Georgia, serif", c: "#7a1b1b", y: 132 },
      ]) }));
      note.position.set(-1, 1.05, 0.04);
      g.add(hole, heap, stick, note);
    } else if (s.k === "race") {
      g.add(scatter(r, 10, 6, [0.22, 0.01, 2.6], "#1a1a1a", ground, s.x, s.z));
      const mat = new THREE.MeshBasicMaterial({ color: "#bfe8ff", transparent: true, opacity: 0.4, depthWrite: false });
      const ghostG = new THREE.Group();
      for (const z of [-0.55, 0.55]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.04, 4, 12), mat); wh.rotation.y = Math.PI / 2; wh.position.set(0, 0.35, z); ghostG.add(wh); }
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.8, 8), mat); body.position.set(0, 1.25, 0.1); body.rotation.x = 0.4;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat); head.position.set(0, 1.8, 0.3);
      const smug = new THREE.Sprite(new THREE.SpriteMaterial({ map: lettering(256, 64, null, [{ t: "too easy", font: "italic 700 40px Georgia, serif", c: "#ffffff", y: 32 }]), transparent: true, depthWrite: false }));
      smug.scale.set(1.2, 0.3, 1); smug.position.y = 2.35;
      ghostG.add(body, head, smug);
      g.add(ghostG);
      ghost = ghostG;
    } else {
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: lettering(256, 128, null, [
        { t: "GOT AWAY", font: "900 52px Impact, sans-serif", c: "#ff4fa3", y: 50 },
        { t: "ha ha", font: "italic 700 34px Georgia, serif", c: "#36d1ff", y: 100 },
      ]) }));
      tag.rotation.x = -Math.PI / 2; tag.position.y = 0.05;
      g.add(tag);
    }
    this.w.scene.add(g);
    this.views.set(s.id, { g, ghost, cryT: 2 });
  }

  private unbuild(id: number) {
    const v = this.views.get(id);
    if (!v) return;
    v.g.parent?.remove(v.g);
    v.g.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
        const m = o.material as THREE.MeshBasicMaterial;
        m.map?.dispose(); m.dispose();
      }
    });
    this.views.delete(id);
  }

  dispose() { for (const id of [...this.views.keys()]) this.unbuild(id); this.work = null; }
}
