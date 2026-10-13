// Wanted: a ringleader with a silly made-up title, hiding out round Bath with his crew. The poster
// says who he runs with, two quirks, and the three places he hangs about at, in the order he does
// the rounds, so you can chase him or lie in wait. A search circle goes on the map at his hideout;
// he's a size bigger than his crew, with a gold chain, and once anyone gets a proper look at him
// (close up, or through binoculars or down a scope from further off) everyone gets a marker on him.
// Put him down to collect. If nobody finds him he moves on to his next haunt every couple of
// minutes; run out of time and he's got away.
//
// The quirks, two to a poster, make each one play differently:
// - Slippery: hurt him badly and he legs it to his next haunt, once.
// - Lookouts: two of his crew posted round the hideout; if one of them spots you first, he moves.
// - Mob-handed: a second crew turns up once the shooting starts.
// - Hard as nails: twice the health.
// - Night owl: only out after dark (in the game's day), but he pays double.
//
// Who decides what: the poster comes from the day's seed (quests.ts), so everyone has the same one.
// The host runs him and his crew (chavs.ts) and says where he is ("at") every second or so, and when
// he's down ("down") or away ("away"). Whoever gets a look at him says so ("spot").
import * as SFX from "./audio";
import { BOSS, CHAV, CRICKET, RUGBY, SOCIETY, look } from "./chavs";
import { nightNow } from "./daylight";
import { RIDES } from "./rides";
import { clearSpot } from "./haunts";
import { type Card, type Job, type Offer, type PostSpot, type QuestWorld, type Rng, compassWord, esc, far, hash, pickOf, registerJob, rng, shuffled } from "./quests";

const TITLES = [
  "the Duke of Disorder", "the Marquis of Mischief", "the Countess of Chaos", "the Mayor of Mayhem", "Captain Kerfuffle",
  "the High Sheriff of Shenanigans", "the Professor of Pandemonium", "the Kingpin of Kerfuffle", "the Grand Wazzock",
  "the Baron of Bother", "the Earl of Aggro", "Lord Rumpus", "the Viscount of Vexation", "the Wizard of Wobbles",
  "the Commodore of Commotion", "Doctor Hullabaloo", "the Admiral of Argy-Bargy", "the Squire of Squabbles",
];
const CREWS: { kind: number; name: string; who: string }[] = [
  { kind: CHAV, name: "naughty boys", who: "a gang of naughty boys" },
  { kind: RUGBY, name: "rugby lads", who: "a rugby team gone rogue" },
  { kind: CRICKET, name: "cricketers", who: "a cricket club gone bad" },
  { kind: SOCIETY, name: "the Bunting Society", who: "a splinter group of the Bunting Society" },
];
type Quirk = "slippery" | "lookouts" | "mob" | "hard" | "night";
const QUIRK: Record<Quirk, string> = {
  slippery: "Slippery: hurt him and he legs it",
  lookouts: "Lookouts: if they see you first, he moves",
  mob: "Mob-handed: more of them turn up once it kicks off",
  hard: "Hard as nails: twice the health",
  night: "Night owl: only out after dark, pays double",
};
const MOVE_EVERY = 150;     // seconds at one haunt before he does his rounds, if nobody's found him
const CIRCLE = 250;         // metres across the search circle's radius
const SPOT_NEAR = 40;       // close enough to see it's him
const SPOT_FAR = 260;       // and through binoculars or a scope
const COLOUR = "#e04848";

/** The poster's details, from its seed. */
function details(o: Offer, w: QuestWorld) {
  const r = rng(o.seed);
  const title = pickOf(r, TITLES), crew = CREWS[Math.floor(r() * CREWS.length)], kit = Math.floor(r() * 4);
  const quirks = shuffled(r, Object.keys(QUIRK) as Quirk[]).slice(0, 2);
  const haunts = hauntsFor(o, w, r);
  const ride = pickOf(r, RIDES.filter((k) => k !== "trolley"));
  return { title, crew, kit, quirks, haunts, ride };
}

/** Three places he hangs about at, 400 m to 1.5 km from the noticeboard, and his circle round each. */
function hauntsFor(o: Offer, w: QuestWorld, r: Rng) {
  const ok = (x: number, z: number) => w.map.fieldEdge(x, z) > 120;
  const all = [...w.pubs().map((p) => ({ n: p.name, x: p.x, z: p.z })), ...w.places()]
    .filter((p) => ok(p.x, p.z) && Math.hypot(p.x - o.x, p.z - o.z) > 400 && Math.hypot(p.x - o.x, p.z - o.z) < 1500)
    .sort((a, b) => a.x - b.x || a.z - b.z || a.n.localeCompare(b.n));
  const out: { n: string; x: number; z: number; cx: number; cz: number }[] = [];
  for (const p of shuffled(r, all)) {
    if (out.length >= 3) break;
    if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 350 || q.n === p.n)) continue;
    // the circle isn't centred on him: he's somewhere inside it
    const a = r() * Math.PI * 2, d = r() * CIRCLE * 0.6;
    out.push({ ...p, cx: p.x + Math.cos(a) * d, cz: p.z + Math.sin(a) * d });
  }
  return out;
}

registerJob({
  id: "wanted", glyph: "W", colour: COLOUR, label: "Wanted",
  offer(r, spot: PostSpot, w) {
    const o: Offer = { kind: "wanted", seed: hash("wanted", r() * 1e9), stars: 1 + Math.floor(r() * 3), title: "", blurb: "", reward: "", x: spot.x, z: spot.z, where: spot.name };
    const d = details(o, w);
    if (d.haunts.length < 3) return null;
    const night = d.quirks.includes("night");
    o.title = `Wanted: ${d.title}`;
    o.blurb = `Runs with ${esc(d.crew.who)}. Does the rounds of <b>${d.haunts.map((h) => esc(h.n)).join("</b>, <b>")}</b>.`
      + `<br>${d.quirks.map((q) => QUIRK[q]).join("<br>")}`;
    o.reward = `${o.stars * (night ? 2 : 1)} prizes and a ${d.ride === "bike" ? "racing bike" : d.ride}`;
    return o;
  },
  start: (o, w, started) => new Wanted(o, w, started),
});

class Wanted implements Job {
  done: Job["done"] = null;
  private d: ReturnType<typeof details>;
  private h = 0;                 // which haunt he's at
  private spotted = false;
  private ring: { i: number; gen: number } | null = null;
  private crew: { i: number; gen: number }[] = [];
  private lookouts: { i: number; gen: number }[] = [];
  private seen: { x: number; z: number } | null = null;
  private movedT = 0;            // host: seconds at this haunt
  private bolted = false; private warned = false; private mobbed = false;
  private sendT = 0; private markT = 0; private spotT = 0;
  private limit: number;

  constructor(readonly offer: Offer, private w: QuestWorld, private started: number) {
    this.d = details(offer, w);
    this.limit = (8 + offer.stars * 2 + (this.d.quirks.includes("night") ? 12 : 0)) * 60;
    this.circle();
    w.toast(`Find ${this.d.title}. Try ${this.d.haunts[0].n}`, 4);
  }

  private get night() { return this.d.quirks.includes("night"); }
  private has(q: Quirk) { return this.d.quirks.includes(q); }
  private get left() { return this.limit - (Date.now() - this.started) / 1000; }

  /** The search circle round his haunt, or nothing once he's been spotted. */
  private circle() {
    const h = this.d.haunts[this.h];
    this.w.circle("wanted", this.spotted || !h ? null : { x: h.cx, z: h.cz, r: CIRCLE, colour: COLOUR });
  }

  update(dt: number) {
    if (this.done) return;
    // spotting him: close up with a clear view, or through binoculars or down the sights from further
    const b = this.ring ? this.w.chavs.at(this.ring.i) : null;
    if (!this.spotted && b?.alive && b.gen === this.ring!.gen && (this.spotT -= dt) <= 0) {
      this.spotT = 0.25;
      const me = this.w.me(), eye = this.w.look(), dx = b.x - eye.x, dy = b.y + 1.6 - eye.y, dz = b.z - eye.z, dist = Math.hypot(dx, dy, dz);
      const facing = (dx * eye.dx + dy * eye.dy + dz * eye.dz) / (dist || 1);
      const close = dist < SPOT_NEAR || (eye.zoomed && dist < SPOT_FAR && facing > 0.997);
      if (me.alive && close && facing > 0.5) {
        const hit = this.w.map.raycast(eye.x, eye.y, eye.z, dx / dist, dy / dist, dz / dist, dist);
        if (!hit || hit.dist > dist - 1) {
          const msg = { k: "spot", s: this.offer.seed };
          this.w.send("qe", msg);
          this.event(msg, this.w.selfId);
        }
      }
    }
    // the marker follows him, a second at a time (moving it rebuilds it)
    if (this.spotted && (this.markT -= dt) <= 0) {
      this.markT = 1;
      const at = b?.alive ? b : this.seen;
      if (at) this.w.mark("@wanted", { x: at.x, z: at.z }, this.d.title, COLOUR);
    }
  }

  host(dt: number) {
    if (this.done) return;
    const ch = this.w.chavs, players = this.w.players(), alive = players.filter((p) => p.alive);
    if (this.left <= 0) { this.getAway(false); return; }
    const hh = this.d.haunts[this.h];
    const night = !this.night || (nightNow() > 0.5);
    const b = this.ring ? ch.get(this.ring.i, this.ring.gen) : null;
    if (!this.ring) {
      // he turns up when someone's near his haunt (after dark, for a night owl)
      if (night && alive.some((p) => Math.hypot(p.x - hh.x, p.z - hh.z) < 220)) this.bring();
      else if ((this.movedT += dt) > MOVE_EVERY) this.move(false);
    } else if (!b) {
      // gone: put down (that's chavDown) or wandered off for good
      if (!this.done) { this.ring = null; this.crew = []; this.lookouts = []; }
    } else {
      const top = this.hpOf();
      // slippery: badly hurt, he legs it, once
      if (this.has("slippery") && !this.bolted && b.hp < top * 0.5) { this.bolted = true; this.move(true); this.say("He's legging it!"); }
      // mob-handed: once someone's having a go, his mates turn up
      if (this.has("mob") && !this.mobbed && (b.hp < top || b.target)) {
        this.mobbed = true;
        const at = clearSpot(this.w.map, b.x + 25, b.z, 10) ?? [b.x, b.z];
        this.crew.push(...ch.bring(at[0], at[1], this.lookCrew(), 2 + this.offer.stars, players, undefined, 5));
        this.say("His mates have turned up!");
      }
      // a lookout sees you first: off he goes
      if (!this.spotted && !this.warned && this.lookouts.some((l) => ch.get(l.i, l.gen)?.target)) { this.warned = true; this.move(true); this.say("A lookout's tipped him off!"); }
      // nobody's found him: he does his rounds
      if (!this.spotted && !b.target && (this.movedT += dt) > MOVE_EVERY) this.move(false);
    }
    if ((this.sendT -= dt) <= 0) {
      this.sendT = 1;
      const msg = { k: "at", s: this.offer.seed, h: this.h, i: this.ring?.i ?? -1, g: this.ring?.gen ?? 0, x: Math.round(b?.x ?? hh.x), z: Math.round(b?.z ?? hh.z) };
      this.w.send("qe", msg);
      this.event(msg, this.w.selfId);
    }
  }

  private lookCrew() { return look(this.d.crew.kind, this.d.kit); }
  private hpOf() {
    const base = [60, 85, 55, 50][this.d.crew.kind] ?? 60;
    return Math.round(base * (3 + 2 * this.offer.stars) * (this.has("hard") ? 2 : 1));
  }

  /** Host: him and his crew, at his haunt. */
  private bring() {
    const hh = this.d.haunts[this.h], ch = this.w.chavs, players = this.w.players();
    const at = clearSpot(this.w.map, hh.x, hh.z, 20) ?? [hh.x, hh.z];
    this.ring = ch.bring(at[0], at[1], look(this.d.crew.kind, this.d.kit + BOSS), 1, players, this.hpOf(), 0)[0] ?? null;
    this.crew = ch.bring(at[0], at[1], this.lookCrew(), 1 + this.offer.stars, players, undefined, 5);
    if (this.has("lookouts")) {
      this.lookouts = [0, 1].flatMap((k) => {
        const a = k * Math.PI + Math.random(), p = clearSpot(this.w.map, at[0] + Math.cos(a) * 50, at[1] + Math.sin(a) * 50, 15);
        return p ? ch.bring(p[0], p[1], this.lookCrew(), 1, players) : [];
      });
    }
    this.movedT = 0;
  }

  /** Host: on to his next haunt. rush: running for it. */
  private move(rush: boolean) {
    this.h = (this.h + 1) % this.d.haunts.length;
    this.movedT = 0;
    const hh = this.d.haunts[this.h], ch = this.w.chavs;
    if (this.ring) {
      ch.sendTo(this.ring.i, this.ring.gen, hh.x, hh.z, rush);
      for (const c of this.crew) ch.sendTo(c.i, c.gen, hh.x + (Math.random() - 0.5) * 8, hh.z + (Math.random() - 0.5) * 8, rush);
      for (const c of this.lookouts) ch.release(c.i, c.gen);
      this.lookouts = [];
    }
    this.sendT = 0;
  }

  private say(text: string) {
    const msg = { k: "say", s: this.offer.seed, t: text };
    this.w.send("qe", msg);
    this.event(msg, this.w.selfId);
  }

  chavDown(i: number, by: string) {
    if (!this.ring || i !== this.ring.i || this.done) return;
    const at = this.w.chavs.at(i);
    const msg = { k: "down", s: this.offer.seed, by, x: Math.round(at?.x ?? 0), z: Math.round(at?.z ?? 0) };
    this.w.send("qe", msg);
    this.event(msg, this.w.selfId);
  }

  /** Host: time's up, he's away. */
  private getAway(won: boolean) {
    if (won) return;
    const msg = { k: "away", s: this.offer.seed };
    this.w.send("qe", msg);
    this.event(msg, this.w.selfId);
  }

  event(d: any, from: string) {
    if (this.done) return;
    if (d.k === "at") {
      const h = Number(d.h) || 0;
      if (h !== this.h) {
        this.h = h % this.d.haunts.length;
        if (!this.spotted) this.w.toast(`Word is he's moved on to ${this.d.haunts[this.h].n}`, 3);
      }
      if (d.i >= 0) this.ring = { i: Number(d.i), gen: Number(d.g) };
      this.seen = { x: Number(d.x), z: Number(d.z) };
      this.circle();
    } else if (d.k === "spot" && !this.spotted) {
      this.spotted = true;
      this.markT = 0;
      SFX.jobStep();
      const who = from === this.w.selfId ? "You've" : `${this.w.nameOf(from)}'s`;
      this.w.toast(`${who} spotted ${this.d.title}!`, 3);
      this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(from === this.w.selfId ? "You" : this.w.nameOf(from))}</b> spotted <b style="color:${COLOUR}">${esc(this.d.title)}</b>`);
      this.circle();
    } else if (d.k === "say") {
      this.w.toast(String(d.t ?? ""), 2.5);
    } else if (d.k === "down") {
      const night = this.night ? 2 : 1;
      this.done = { won: true, text: `${this.w.nameOf(String(d.by))} put ${this.d.title} down. Bounty collected!`, x: Number(d.x), z: Number(d.z) };
      if (night > 1 && this.w.isHost) for (let k = 0; k < this.offer.stars; k++) this.w.prize(Number(d.x) + k, Number(d.z) - 2, false);
      this.w.reward(this.d.ride);
      try { localStorage.setItem("cd-bounties", String((Number(localStorage.getItem("cd-bounties")) || 0) + 1)); } catch { /* ignore */ }
    } else if (d.k === "away") {
      this.done = { won: false, text: `${this.d.title} got away` };
    }
  }

  progress() { return { h: this.h, sp: this.spotted ? 1 : 0, i: this.ring?.i ?? -1, g: this.ring?.gen ?? 0 }; }
  restore(p: any) {
    if (!p) return;
    this.h = (Number(p.h) || 0) % this.d.haunts.length;
    if (p.sp) this.spotted = true;
    if (p.i >= 0) this.ring = { i: Number(p.i), gen: Number(p.g) };
    this.circle();
  }

  boss() { return this.d.title; }

  card(): Card {
    const me = this.w.me(), left = Math.max(0, Math.round(this.left));
    const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    const hh = this.d.haunts[this.h];
    if (this.spotted && this.seen) {
      const d = Math.hypot(this.seen.x - me.x, this.seen.z - me.z);
      return { line: `Spotted! He's ${far(d)} ${compassWord(this.seen.x - me.x, this.seen.z - me.z)}. Put him down`, sub: `${clock} left · ${this.d.quirks.map((q) => QUIRK[q].split(":")[0]).join(", ")}`, bar: left / this.limit };
    }
    const d = Math.hypot(hh.cx - me.x, hh.cz - me.z);
    const nightNote = this.night && !(nightNow() > 0.5) ? " He's only out after dark." : "";
    return {
      line: `Somewhere round <b>${esc(hh.n)}</b>, ${far(d)} ${compassWord(hh.cx - me.x, hh.cz - me.z)}. Get a look at him: up close, or through binoculars (B).${nightNote}`,
      sub: `${clock} left · then ${esc(this.d.haunts[(this.h + 1) % 3].n)}`, bar: left / this.limit,
    };
  }

  end() {
    this.w.mark("@wanted", null);
    this.w.circle("wanted", null);
    if (this.w.isHost) for (const c of [...(this.ring ? [this.ring] : []), ...this.crew, ...this.lookouts]) this.w.chavs.release(c.i, c.gen);
  }
}
