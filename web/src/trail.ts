// The treasure trail: a chain of clues across part of Bath, each one leading to a real place (a pub,
// a park, a square, a garden). Somewhere near each place there's a biscuit tin on a post, glinting:
// walk up and press E to open it and get the next clue. The last one is the Bath Bun chest, with the
// prizes and a ride. Four clues on an easy trail, five on a medium one, six on a hard one.
//
// The clues get harder with the stars: the place's name with letters missing, then directions with
// the first letter, then the name as an anagram. Work out where it is (the full map has the street
// names, Go to a pub has the pubs) and head there: a search circle goes on the map once you're
// within 400 m of the tin, and the card says if you're warm. Stuck for three minutes on one clue?
// The circle comes up anyway, but then the trail can't win you gold.
//
// Two ways to play, set on the poster: together, where anyone's find moves everyone on, and a race,
// where everyone has their own copy of the trail and first to the chest wins. Either way there's a
// par time, with gold, silver and bronze.
//
// Who decides what: the trail comes from the poster's seed, so everyone has the same one. Opening a
// tin goes round as "tin", from whoever opened it; nobody needs the host for any of it.
import * as THREE from "three";
import * as SFX from "./audio";
import { RIDES, rideSpecs, type RideKind } from "./rides";
import { clearSpot } from "./haunts";
import { type Card, type Job, type Offer, type PostSpot, type QuestWorld, type Rng, compassWord, esc, far, hash, pickOf, registerJob, rng, shuffled } from "./quests";

const COLOUR = "#e0a526";
const NEAR = 400;          // the search circle comes up this close to the tin
const CIRCLE = 90;         // and is this big
const STUCK = 180;         // or after this long on one clue
const OPEN = 2.6;          // how close to open a tin
const PAR_LEG = 150;       // seconds of par per clue
const THEMES = ["Pubs", "Parks and places", "A bit of everything"] as const;

interface Stop { n: string; x: number; z: number; pub: boolean; rating: number | null; tx: number; tz: number; style: number }

/** The trail from the poster's seed: where each tin is and what kind of clue leads there. */
function trailOf(o: Offer, w: QuestWorld): { theme: string; stops: Stop[]; ride: RideKind } {
  const r = rng(o.seed), theme = THEMES[(o.mode ?? 0) >> 1];
  const ok = (x: number, z: number) => w.map.fieldEdge(x, z) > 100;
  const pubs = w.pubs().filter((p) => ok(p.x, p.z)).map((p) => ({ n: p.name, x: p.x, z: p.z, pub: true, rating: p.rating }));
  const places = w.places().filter((p) => ok(p.x, p.z) && p.n.length >= 5).map((p) => ({ ...p, pub: false, rating: null }));
  const pool = (theme === "Pubs" ? pubs : theme === "Parks and places" ? places : [...pubs, ...places])
    .sort((a, b) => a.x - b.x || a.z - b.z || a.n.localeCompare(b.n));
  const n = 3 + o.stars, stops: Stop[] = [];
  let at = { x: o.x, z: o.z };
  for (let k = 0; k < n; k++) {
    const next = shuffled(r, pool).find((p) => {
      const d = Math.hypot(p.x - at.x, p.z - at.z);
      return d > 300 && d < 900 && !stops.some((s) => s.n === p.n || Math.hypot(s.x - p.x, s.z - p.z) < 200);
    });
    if (!next) break;
    // the tin's somewhere near the place, not on it
    const a = r() * Math.PI * 2, d = 10 + r() * 25;
    const style = o.stars === 1 ? 0 : o.stars === 2 ? Math.floor(r() * 2) : 1 + Math.floor(r() * 2);
    stops.push({ ...next, tx: next.x + Math.cos(a) * d, tz: next.z + Math.sin(a) * d, style });
    at = next;
  }
  const ride = pickOf(r, RIDES.filter((k) => k !== "trolley"));
  return { theme, stops, ride };
}

/** The name with some of its letters missing: "S _ D N _ Y   G A R D _ N S". */
function gaps(name: string, r: Rng) {
  return name.toUpperCase().split(/\s+/).map((wd) => [...wd].map((c, k) => (/[A-Z]/.test(c) && k > 0 && r() < 0.4 ? "_" : c)).join(" ")).join("&nbsp;&nbsp;&nbsp;");
}
/** The name's letters jumbled, word by word. */
function anagram(name: string, r: Rng) {
  return name.toUpperCase().split(/\s+/).map((wd) => {
    let s = wd;
    for (let t = 0; t < 6 && (s === wd || wd.length < 3); t++) s = shuffled(r, [...wd]).join("");
    return s;
  }).join(" ");
}

/** The clue that leads from (fx, fz) to stop s. */
function clueFor(s: Stop, fx: number, fz: number, r: Rng) {
  const d = Math.hypot(s.x - fx, s.z - fz), way = compassWord(s.x - fx, s.z - fz), what = s.pub ? "a pub" : "a place";
  const rated = s.pub && s.rating !== null ? `, rated ${s.rating} for food hygiene` : "";
  if (s.style === 0) return `<b class="clue">${gaps(s.n, r)}</b><br>About ${far(d)} ${way}`;
  if (s.style === 1) return `About ${far(d)} ${way}: ${what} beginning with <b>${esc(s.n[0].toUpperCase())}</b>${rated}`;
  return `<b class="clue">${esc(anagram(s.n, r))}</b><br>Somewhere ${way}`;
}

registerJob({
  id: "trail", glyph: "T", colour: COLOUR, label: "Treasure trail",
  offer(r, spot: PostSpot, w) {
    const mode = Math.floor(r() * THEMES.length) * 2 + (r() < 0.35 ? 1 : 0);
    const o: Offer = { kind: "trail", seed: hash("trail", r() * 1e9), stars: 1 + Math.floor(r() * 3), title: "", blurb: "", reward: "", x: spot.x, z: spot.z, where: spot.name, mode };
    const t = trailOf(o, w);
    if (t.stops.length < 3 + o.stars) return null;
    const race = mode & 1;
    o.title = `${race ? "Trail race" : "Trail"}: ${t.theme}`;
    o.blurb = `${t.stops.length} clues, each to a real place in Bath, with a tin to find near each. `
      + (race ? "Everyone has their own copy: first to the chest wins." : "Anyone's find moves everyone on.")
      + ` Par ${Math.round((t.stops.length * PAR_LEG) / 60)} minutes.`;
    o.reward = `${o.stars} prize${o.stars > 1 ? "s" : ""} and ${rideSpecs[t.ride].name}`;
    return o;
  },
  start: (o, w, started) => new Trail(o, w, started),
});

/** A tin on a post, or the chest at the end, with a glint turning over it. */
function tinModel(chest: boolean) {
  const g = new THREE.Group();
  const lambert = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  if (chest) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), lambert("#6b4423"));
    box.position.y = 0.25;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12, 1, false, 0, Math.PI), lambert("#7a5030"));
    lid.rotation.z = Math.PI / 2; lid.position.y = 0.5;
    g.add(box, lid);
    for (const x of [-0.3, 0.3]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.82, 0.64), lambert("#d9b143")); b.position.set(x, 0.42, 0); g.add(b); }
  } else {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), lambert("#5a3d22"));
    post.position.y = 0.45;
    const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 16), lambert("#b3262e"));
    tin.position.y = 0.96;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.03, 16), lambert("#d9b143"));
    lid.position.y = 1.03;
    g.add(post, tin, lid);
  }
  const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: "#fff2b0", toneMapped: false }));
  glint.position.y = chest ? 1.2 : 1.4; glint.name = "glint";
  g.add(glint);
  return g;
}

class Trail implements Job {
  done: Job["done"] = null;
  private t: ReturnType<typeof trailOf>;
  private race: boolean;
  private at = new Map<string, number>();   // how many tins each player's opened (together: everyone's the same)
  private legT = 0;                          // seconds on this clue (mine)
  private helped = false;                    // the circle came up from being stuck: no gold for this trail
  private tin: { view: THREE.Group; n: number; x: number; z: number; y: number } | null = null;
  private clues: string[];
  private lastD = Infinity; private warmth = "";

  constructor(readonly offer: Offer, private w: QuestWorld, private started: number) {
    this.t = trailOf(offer, w);
    this.race = !!((offer.mode ?? 0) & 1);
    const r = rng(hash("clues", offer.seed));
    let fx = offer.x, fz = offer.z;
    this.clues = this.t.stops.map((s) => { const c = clueFor(s, fx, fz, r); fx = s.x; fz = s.z; return c; });
    w.toast("First clue on the card, top left", 3);
  }

  private get mine() { return this.at.get(this.race ? this.w.selfId : "") ?? 0; }
  private get par() { return this.t.stops.length * PAR_LEG; }

  update(dt: number) {
    if (this.done) return;
    const n = this.mine, s = this.t.stops[n], me = this.w.me();
    if (!s) return;
    this.legT += dt;
    // the tin, near the place, once you're close enough for it to matter
    const d = Math.hypot(s.tx - me.x, s.tz - me.z);
    if (this.tin && this.tin.n !== n) this.dropTin();
    if (!this.tin && d < 160 && this.w.map.detailedAt(s.tx, s.tz)) {
      const c = clearSpot(this.w.map, s.tx, s.tz, 20) ?? [s.tx, s.tz];
      const view = tinModel(n === this.t.stops.length - 1);
      const y = this.w.map.ground(c[0], c[1]);
      view.position.set(c[0], y, c[1]);
      this.w.scene.add(view);
      this.tin = { view, n, x: c[0], z: c[1], y };
    }
    if (this.tin) {
      const g = this.tin.view.getObjectByName("glint");
      if (g) { g.rotation.y += dt * 3; g.position.y = (n === this.t.stops.length - 1 ? 1.2 : 1.4) + Math.sin(performance.now() / 300) * 0.06; }
    }
    // the search circle, when you're close or have been stuck a while
    const show = d < NEAR || this.legT > STUCK;
    if (show && d >= NEAR && !this.helped) { this.helped = true; this.w.toast("Stuck? The search circle's on the map now", 3); }
    this.w.circle("trail", show ? { x: s.tx, z: s.tz, r: CIRCLE, colour: COLOUR } : null);
    // warmer or colder
    const td = this.tin ? Math.hypot(this.tin.x - me.x, this.tin.z - me.z) : d;
    this.warmth = td < 25 ? "Red hot!" : td < 60 ? "Hot" : td < 150 ? "Warm" : td < NEAR ? "Getting warmer" : "";
    this.lastD = td;
  }

  private dropTin() {
    if (!this.tin) return;
    this.w.scene.remove(this.tin.view);
    this.tin.view.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
    this.tin = null;
  }

  hint() {
    if (!this.tin || this.lastD > OPEN) return "";
    return this.tin.n === this.t.stops.length - 1 ? "<b>E</b> Open the Bath Bun chest" : "<b>E</b> Open the tin";
  }

  use() {
    if (!this.tin || this.lastD > OPEN || this.done) return false;
    const msg = { k: "tin", s: this.offer.seed, n: this.tin.n, t: Date.now() };
    this.w.send("qe", msg);
    this.event(msg, this.w.selfId);
    return true;
  }

  event(d: any, from: string) {
    if (d.k !== "tin" || this.done) return;
    const key = this.race ? from : "", n = Number(d.n);
    if ((this.at.get(key) ?? 0) !== n) return;   // already past it (two at once)
    this.at.set(key, n + 1);
    const last = n + 1 >= this.t.stops.length, mine = from === this.w.selfId;
    if (key === "" || mine) { this.legT = 0; this.lastD = Infinity; }
    if (!last) {
      if (key === "" || mine) {
        SFX.jobStep();
        this.w.toast(mine ? "Got it! Next clue on the card" : `${this.w.nameOf(from)} found the tin. Next clue on the card`, 3);
      } else this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(this.w.nameOf(from))}</b> is on clue ${n + 2} of ${this.t.stops.length}`);
      return;
    }
    // the chest: done
    const secs = (Number(d.t) - this.started) / 1000;
    const medal = secs < this.par * 0.7 && !this.helped ? "gold" : secs < this.par ? "silver" : "bronze";
    const time = `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}`;
    const s = this.t.stops[n];
    const who = mine ? "You" : this.w.nameOf(from);
    this.done = { won: true, text: this.race ? `${who} reached the chest first, in ${time}${mine ? ` (${medal})` : ""}` : `Bath Bun chest found in ${time}: ${medal}!`, x: s.tx, z: s.tz };
    if (!this.race || mine) this.w.reward(this.t.ride);
  }

  progress() { return { at: [...this.at] }; }
  restore(p: any) { if (Array.isArray(p?.at)) for (const [k, v] of p.at) this.at.set(String(k), Number(v) || 0); }

  card(): Card {
    const n = this.mine, total = this.t.stops.length;
    const secs = (Date.now() - this.started) / 1000, time = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;
    const par = Math.round(this.par / 60);
    const lead = this.race ? Math.max(0, ...[...this.at].filter(([k]) => k !== this.w.selfId).map(([, v]) => v)) : 0;
    return {
      line: `Clue ${n + 1} of ${total}${n === total - 1 ? " (the chest)" : ""}: ${this.clues[n] ?? ""}`,
      sub: [time + ` · par ${par}:00`, this.warmth, this.race && lead ? `best rival on clue ${Math.min(total, lead + 1)}` : ""].filter(Boolean).join(" · "),
      bar: n / total,
    };
  }

  end() { this.dropTin(); this.w.circle("trail", null); }
}
