// The tourists on Seagull Attack's benches, as people: what they do with their arms, and what they
// say. Seagull Attack (gulls.ts) works out from the state every player already has how each one
// is feeling (a gull coming for them, a swoop, a shot that saved them, their sandwich gone) and
// says so here; each screen poses and voices its own tourists from that, so nothing more goes
// over the network.
//
// Their arms are two instanced meshes for every bench (sleeves and forearms), so all of them
// together cost two draws. They talk one at a time across the benches, with a gap between, in a
// speech bubble (naughtyboys.ts) and the browser's voice (posh.ts), each situation's lines dealt
// like quips.ts's decks so a line doesn't come round again till the rest have.
import * as THREE from "three";
import { box, part } from "./avatar";
import { speechBubble } from "./naughtyboys";
import * as Posh from "./posh";

export type Mood = "hold" | "clutch" | "shoo" | "duck" | "cheer" | "point" | "beckon" | "leave";
export type Said = "incoming" | "shoo" | "duck" | "beckon" | "cheer" | "saved" | "stolen" | "huff" | "idle";

const LINES: Record<Said, string[]> = {
  incoming: ["Ooh, here they come!", "Is that a gull? That's a gull.", "Look up! Look up!", "They're circling, I'm telling you.", "Oh, not again.", "Gerald, there's birds."],
  shoo: ["Shoo! Go on, shoo!", "Get away, you horrible thing!", "Not my sandwich, you don't!", "Go and bother the Roman Baths!", "Away with you!", "I paid good money for this!"],
  duck: ["Not in my hair!", "Ooh! That was close!", "Mind my perm!", "Heads down, everyone!", "Did it get me? It got me."],
  beckon: ["Over here! Help!", "Yoo-hoo! Help!", "Can somebody do something?", "Over here, quick!", "Help! It's got that look in its eye!"],
  cheer: ["Oh, well shot!", "Bravo!", "Ha! Take that!", "My hero!", "Ooh, lovely shot.", "That's the way!"],
  saved: ["My bite! You got it back!", "Ooh, thank you, love!", "Back where it belongs.", "I'll have that, thank you."],
  stolen: ["Oi! That bird's had my panini!", "My sandwich! Did you see that?", "It took it right out of my hand!", "That was a twelve pound sandwich!", "Is this normal here?"],
  huff: ["That's it. I'm off to the Pump Room.", "Never again. Next year it's Weston.", "I'm writing to the council.", "I'll be on TripAdvisor about this.", "Bath? Bath my foot."],
  idle: ["Lovely day for it.", "Is that the Abbey?", "Have you done the Baths yet?", "They do a lovely bun at Sally Lunn's.", "Ooh, I could get used to Bath.", "Is it always this windy?", "Pass us a napkin, Brenda."],
};
// these are about something that's just happened to them, so they wait their turn rather than go
const KEEP = new Set<Said>(["saved", "stolen", "huff", "cheer"]);

const BUBBLE = 2.6;          // seconds a line stays up
const GAP = 2.2;             // and quiet after it, before anyone else speaks
const SHOULDER = [0.26, 1.06, 0];
const ELBOW = -0.28;

/** An arm's angles: the upper arm swung forward (f) and out to the side (o), and the elbow bent (e). */
interface Arm { f: number; o: number; e: number }
const HOLD: Arm = { f: 0.15, o: 0.05, e: 1.4 };

interface Sitter { person: THREE.Group; seed: number; woman: boolean; mood: Mood; since: number; skin: THREE.Color; shirt: THREE.Color; bubble: THREE.Sprite | null }

const _m = new THREE.Matrix4(), _a = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _w = new THREE.Vector3();

export class Sitters {
  private list: Sitter[] = [];
  private upper: THREE.InstancedMesh;
  private fore: THREE.InstancedMesh;
  private decks = new Map<Said, string[]>();
  private queue: { k: number; what: Said }[] = [];
  private speaker = -1;
  private talkT = 0;          // the line up, then the gap after it
  private idleT = 8;

  constructor(private root: THREE.Group, mat: THREE.Material, max = 8) {
    const inst = (g: THREE.BufferGeometry) => {
      const im = new THREE.InstancedMesh(g, mat, max * 2);
      im.count = 0; im.frustumCulled = false;
      for (let i = 0; i < max * 2; i++) im.setColorAt(i, new THREE.Color("#ffffff"));
      root.add(im);
      return im;
    };
    this.upper = inst(part([[box(0.11, 0.28, 0.12, 0, -0.14, 0), "#ffffff"]]));
    this.fore = inst(part([[box(0.09, 0.24, 0.09, 0, -0.12, 0), "#ffffff"], [box(0.1, 0.09, 0.1, 0, -0.27, 0), "#ffffff"]]));
  }

  /** A new set of tourists (person: the one sat on bench k, which their arms follow). */
  set(people: { person: THREE.Group; skin: string; shirt: string; seed: number; woman: boolean }[]) {
    for (const s of this.list) this.unsay(s);
    this.list = people.map((p) => ({ person: p.person, seed: p.seed, woman: p.woman, mood: "hold", since: 0, skin: new THREE.Color(p.skin), shirt: new THREE.Color(p.shirt), bubble: null }));
    this.queue = []; this.speaker = -1; this.talkT = 0;
  }

  /** How tourist k is feeling this frame. */
  feel(k: number, mood: Mood) {
    const s = this.list[k];
    if (!s || s.mood === mood) return;
    s.mood = mood; s.since = 0;
    if (mood === "shoo" || mood === "duck" || mood === "beckon" || mood === "cheer") this.say(k, mood);
    else if (mood === "point") this.say(k, "incoming");
  }

  /** Tourist k has something to say about it. */
  say(k: number, what: Said) {
    if (!this.list[k]) return;
    if (this.talkT <= 0) { this.speak(k, what); return; }
    if (KEEP.has(what) && !this.queue.some((q) => q.k === k && q.what === what)) this.queue.push({ k, what });
  }

  update(dt: number, t: number, lull: boolean) {
    this.talkT -= dt;
    const s0 = this.speaker >= 0 ? this.list[this.speaker] : null;
    if (s0 && this.talkT < GAP) { this.unsay(s0); this.speaker = -1; }
    if (this.talkT <= 0 && this.queue.length) { const q = this.queue.shift()!; this.speak(q.k, q.what); }
    if (lull && (this.idleT -= dt) <= 0) {
      this.idleT = 10 + Math.random() * 10;
      const here = this.list.map((s, k) => ({ s, k })).filter(({ s }) => s.mood !== "leave");
      if (here.length && this.talkT <= 0) this.speak(here[Math.floor(Math.random() * here.length)].k, "idle");
    }
    let n = 0;
    this.list.forEach((s, k) => {
      s.since += dt;
      const p = s.person;
      if (!p.visible) return;
      // ducking hunches them forward and down; everything else sits up
      const duck = s.mood === "duck" ? Math.min(1, s.since * 6) : 0;
      p.rotation.x = 0.35 * duck;
      if (s.mood !== "leave") p.position.y = -0.1 * duck;
      p.updateWorldMatrix(true, false);
      for (const side of [-1, 1]) {
        const a = this.arm(s, side, t + k * 0.37);
        _e.set(-a.f, 0, side * a.o, "ZXY");
        _a.compose(_v.set(side * SHOULDER[0], SHOULDER[1], SHOULDER[2]), _q.setFromEuler(_e), _one);
        _m.multiplyMatrices(p.matrixWorld, _a);
        this.upper.setMatrixAt(n, _m);
        this.upper.setColorAt(n, s.shirt);
        _a.compose(_v.set(0, ELBOW, 0), _q.setFromEuler(_e.set(-a.e, 0, 0)), _one);
        this.fore.setMatrixAt(n, _m.multiply(_a));
        this.fore.setColorAt(n, s.skin);
        n++;
      }
    });
    for (const im of [this.upper, this.fore]) { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }

  /** Whether tourist k is speaking just now (their pin makes way for the bubble). */
  speaking(k: number) { return this.speaker === k && !!this.list[k]?.bubble; }

  private arm(s: Sitter, side: number, t: number): Arm {
    const right = side > 0;
    switch (s.mood) {
      case "shoo": {
        // both arms up over their head, flapping at it, out of step
        const w = Math.sin(t * 11 + (right ? 0 : Math.PI));
        return { f: 0.4, o: 2.4 + 0.35 * w, e: 0.5 + 0.4 * w };
      }
      case "duck": return { f: 2.3, o: 0.55, e: 1.9 };
      case "cheer": {
        // a clap in front, then both arms up
        if (Math.floor(s.since * 1.2) % 2 === 0) return { f: 1.3, o: -0.3 + 0.28 * Math.sin(t * 18), e: 0.35 };
        return { f: 2.6, o: 0.5 + 0.15 * Math.sin(t * 9), e: 0.15 };
      }
      case "point": return right ? { f: 2.6, o: 0.25, e: 0 } : HOLD;
      case "beckon": return right ? { f: 1.35, o: 0.35, e: 0.7 + 0.65 * Math.sin(t * 8) } : HOLD;
      case "clutch": return { f: 0.45, o: -0.12, e: 1.95 };
      case "leave": { const w = Math.sin(t * 8) * (right ? 1 : -1); return { f: 0.45 * w, o: 0.08, e: 0.35 }; }
      default: return HOLD;
    }
  }

  private speak(k: number, what: Said) {
    const s = this.list[k];
    if (!s) return;
    const prev = this.speaker >= 0 ? this.list[this.speaker] : null;
    if (prev) this.unsay(prev);
    const text = this.deal(what);
    s.bubble = speechBubble(text);
    s.bubble.position.set(0, 1.62, 0);
    s.person.add(s.bubble);
    this.speaker = k;
    this.talkT = BUBBLE + GAP;
    this.voice(s, text);
  }

  private voice(s: Sitter, text: string) {
    s.person.getWorldPosition(_w);
    const d = this.hearFrom ? this.hearFrom(_w.x, _w.z) : 0;
    Posh.speak(text, s.seed, d, undefined, s.woman);
  }
  /** How far a tourist at (x, z) is from you, for how loud they are. */
  hearFrom: ((x: number, z: number) => number) | null = null;

  private deal(what: Said) {
    let d = this.decks.get(what);
    if (!d?.length) {
      d = [...LINES[what]];
      for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
      this.decks.set(what, d);
    }
    return d.pop()!;
  }

  private unsay(s: Sitter) {
    if (!s.bubble) return;
    s.person.remove(s.bubble);
    s.bubble.material.map?.dispose();
    s.bubble.material.dispose();
    s.bubble = null;
  }

  dispose() {
    for (const s of this.list) this.unsay(s);
    for (const im of [this.upper, this.fore]) { this.root.remove(im); im.geometry.dispose(); }
  }
}
