// A to B races: from the noticeboard to a real place 1 to 3 km away, on a set ride, everyone in the
// game at once. Taking one puts everyone on the start line with the ride, and a countdown (the same
// for everyone, as it comes from the clock) holds you there till GO. Then it's any way you like:
// the marker points at the finish and knowing Bath wins. The ride suits the route: downhill goes to
// the skateboard or the shopping trolley, uphill to the bikes, the flat to the rollerblades or the
// scooter, and now and then it's a pogo dash.
//
// Split times at a third and two thirds of the way (by how far you are from the finish) show green or
// red against your best, and there's gold, silver and bronze, and a hidden author's time to beat.
// Your best run on each route is kept, and you race a see-through ghost of it; finishing sends your
// run round, so everyone else gets your ghost to race too if it's faster than theirs. Races can be
// run again as often as you like.
//
// Who decides what: the route comes from the poster's seed. Each player times themselves from the
// shared start, and says when they're over the line ("fin"), with their run ("gh") if it's a best.
import * as THREE from "three";
import * as SFX from "./audio";
import { clearSpot } from "./haunts";
import { type RideKind, rideSpecs } from "./rides";
import { type Card, type Job, type Offer, type PostSpot, type QuestWorld, compassWord, esc, far, hash, pickOf, registerJob, rng } from "./quests";

const COLOUR = "#3ec7e8";
const COUNTDOWN = 8;       // seconds from taking it to GO
const FINISH = 9;          // metres from the finish point that counts as over the line
const GHOST_EVERY = 0.2;   // seconds between the points of a ghost run
const AFTER = 90;          // seconds after the first one's over the line that the others get
const KEY = "cd-race-";

interface Route { to: { n: string; x: number; z: number }; ride: RideKind; d: number; par: number; name: string }

/** The route from the poster: where to, on what, and the par time. */
function routeOf(o: Offer, w: QuestWorld): Route | null {
  const r = rng(o.seed);
  const ok = (x: number, z: number) => w.map.fieldEdge(x, z) > 100;
  const pogo = r() < 0.12;
  const near = pogo ? [500, 1000] : [1000, 3000];
  const all = [...w.pubs().map((p) => ({ n: p.name, x: p.x, z: p.z })), ...w.places()]
    .filter((p) => ok(p.x, p.z) && Math.hypot(p.x - o.x, p.z - o.z) > near[0] && Math.hypot(p.x - o.x, p.z - o.z) < near[1])
    .sort((a, b) => a.x - b.x || a.z - b.z || a.n.localeCompare(b.n));
  if (!all.length) return null;
  const to = pickOf(r, all), d = Math.hypot(to.x - o.x, to.z - o.z);
  const drop = w.map.ground(o.x, o.z) - w.map.ground(to.x, to.z);
  const ride: RideKind = pogo ? "pogo" : drop > 40 ? pickOf(r, ["trolley", "board"] as RideKind[]) : drop < -30 ? pickOf(r, ["bike", "bmx"] as RideKind[])
    : pickOf(r, ["blades", "scooter", "bike", "bmx"] as RideKind[]);
  const par = Math.round((d * 1.35) / (rideSpecs[ride].top * 0.8) + (drop > 0 ? -drop * 0.05 : -drop * 0.2));
  const label = ride === "trolley" ? "Trolley dash" : ride === "pogo" ? "Pogo dash" : ride === "board" ? "Skate run" : ride === "blades" ? "Blade run" : ride === "scooter" ? "Scooter sprint" : "Bike race";
  return { to, ride, d, par: Math.max(45, par), name: label };
}

registerJob({
  id: "race", glyph: "R", colour: COLOUR, label: "Race", again: true,
  offer(r, spot: PostSpot, w) {
    const o: Offer = { kind: "race", seed: hash("race", r() * 1e9), stars: 1, title: "", blurb: "", reward: "", x: spot.x, z: spot.z, where: spot.name };
    const rt = routeOf(o, w);
    if (!rt) return null;
    o.stars = rt.d > 2200 ? 3 : rt.d > 1500 ? 2 : 1;
    o.title = `${rt.name} to ${rt.to.n}`;
    const best = bestOf(o);
    o.blurb = `From here to <b>${esc(rt.to.n)}</b>, ${far(rt.d)} ${compassWord(rt.to.x - o.x, rt.to.z - o.z)} as the crow flies, on ${esc(rideSpecs[rt.ride].name)}. Any way you like. `
      + `Gold ${clock(rt.par)}, silver ${clock(rt.par * 1.25)}, bronze ${clock(rt.par * 1.6)}.${best ? ` Your best: ${clock(best.t)}.` : ""}`;
    o.reward = `${o.stars} prize${o.stars > 1 ? "s" : ""} for the winner's room, and your ghost`;
    return o;
  },
  start: (o, w, started) => new Race(o, w, started),
});

/** "1:23.4". */
function clock(s: number, tenths = false) {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${tenths ? r.toFixed(1).padStart(4, "0") : String(Math.round(r)).padStart(2, "0")}`;
}

/** Your best on a route: its time, splits, and the run, as x, z pairs every GHOST_EVERY seconds. */
interface Best { t: number; sp: number[]; g: number[]; by?: string }
function bestOf(o: Offer): Best | null {
  try { const b = JSON.parse(localStorage.getItem(KEY + o.seed) ?? "null"); return b && typeof b.t === "number" ? b : null; } catch { return null; }
}
function keepBest(o: Offer, b: Best) { try { localStorage.setItem(KEY + o.seed, JSON.stringify(b)); } catch { /* full */ } }

class Race implements Job {
  done: Job["done"] = null;
  private rt: Route;
  private go: number;                       // ms since 1970: GO
  private start: { x: number; z: number; yaw: number };
  private fin: { x: number; z: number };
  private racing = false;                   // I'm on the start line or on the way
  private over = false;                     // I'm over the line
  private results: { id: string; t: number }[] = [];
  private pipped = 4;
  private splits: number[] = [];
  private run: number[] = []; private runT = 0;
  private best: Best | null;
  private ghost: THREE.Group | null = null;
  private arch: THREE.Group | null = null;
  private firstT = 0;

  constructor(readonly offer: Offer, private w: QuestWorld, started: number) {
    this.rt = routeOf(offer, w)!;
    this.go = started + COUNTDOWN * 1000;
    this.best = bestOf(offer);
    const f = clearSpot(w.map, this.rt.to.x, this.rt.to.z, 25) ?? [this.rt.to.x, this.rt.to.z];
    this.fin = { x: f[0], z: f[1] };
    // everyone on the line, side by side, facing the finish
    const yaw = Math.atan2(-(this.fin.x - offer.x), -(this.fin.z - offer.z));
    const ids = w.players().map((p) => p.id).sort(), k = Math.max(0, ids.indexOf(w.selfId));
    const side = (k - (ids.length - 1) / 2) * 1.6, sx = offer.x + Math.cos(yaw) * side + -Math.sin(yaw) * 3, sz = offer.z - Math.sin(yaw) * side - Math.cos(yaw) * 3;
    const s = clearSpot(w.map, sx, sz, 6) ?? [offer.x, offer.z];
    this.start = { x: s[0], z: s[1], yaw };
    w.mark("@race", this.fin, `Finish: ${this.rt.to.n}`, COLOUR);
    if (Date.now() < this.go - 1000 && w.me().alive) {
      this.racing = true;
      w.moveTo(this.start.x, this.start.z, yaw);
      w.ride(this.rt.ride);
    } else w.toast("A race is on: you're watching this one", 3);
  }

  private get now() { return (Date.now() - this.go) / 1000; }

  update(dt: number) {
    const t = this.now, me = this.w.me();
    // the countdown: held on the line, with a pip a second and a long one on GO
    if (t < 0) {
      if (this.racing && Math.hypot(me.x - this.start.x, me.z - this.start.z) > 1.5) this.w.moveTo(this.start.x, this.start.z, this.start.yaw);
      const n = Math.ceil(-t);
      if (n <= 3 && n < this.pipped) { this.pipped = n; SFX.pip(false); }
    } else if (this.pipped > 0) { this.pipped = 0; SFX.pip(true); this.w.toast("GO!", 1); }
    if (!this.done && this.results.length && (Date.now() - this.firstT) / 1000 > AFTER) this.finish();
    if (this.done) return;
    const d = Math.hypot(this.fin.x - me.x, this.fin.z - me.z);
    if (this.racing && !this.over && t >= 0) {
      // the run, for your ghost
      if ((this.runT -= dt) <= 0) { this.runT = GHOST_EVERY; this.run.push(Math.round(me.x * 10) / 10, Math.round(me.z * 10) / 10); }
      // splits at two thirds and a third of the way to go
      const k = this.splits.length;
      if (k < 2 && d < this.rt.d * (k === 0 ? 2 / 3 : 1 / 3)) {
        this.splits.push(t);
        const was = this.best?.sp[k];
        const diff = was !== undefined ? t - was : null;
        this.w.toast(`Split ${k + 1}: ${clock(t, true)}${diff !== null ? ` (${diff <= 0 ? "-" : "+"}${Math.abs(diff).toFixed(1)})` : ""}`, 2);
        if (diff !== null) SFX.pip(diff <= 0);
      }
      if (d < FINISH && me.alive) {
        this.over = true;
        const msg = { k: "fin", s: this.offer.seed, t: Math.round(t * 10) / 10 };
        this.w.send("qe", msg);
        this.event(msg, this.w.selfId);
        // a best: keep it, and send it round as a ghost for everyone else
        if (!this.best || t < this.best.t) {
          const b: Best = { t, sp: this.splits, g: this.run };
          keepBest(this.offer, b);
          this.w.send("qe", { k: "gh", s: this.offer.seed, b: { t, sp: this.splits, g: this.run.filter((_, i) => i % 4 < 2) } });
        }
      }
    }
    this.drawGhost(t);
    this.drawArch(me);
  }

  /** Your best run (or a faster one someone sent), see-through, alongside you. */
  private drawGhost(t: number) {
    const g = this.best?.g;
    if (!g || g.length < 4 || t < 0) { if (this.ghost) this.ghost.visible = false; return; }
    if (!this.ghost) {
      this.ghost = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: COLOUR, transparent: true, opacity: 0.35, depthWrite: false });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 8), mat);
      body.position.y = 0.9;
      this.ghost.add(body);
      this.w.scene.add(this.ghost);
    }
    const step = this.best!.by ? GHOST_EVERY * 2 : GHOST_EVERY;   // a run someone sent has every other point
    const f = t / step, i = Math.min(g.length / 2 - 1, Math.floor(f)), j = Math.min(g.length / 2 - 1, i + 1), u = Math.min(1, f - i);
    const x = g[i * 2] + (g[j * 2] - g[i * 2]) * u, z = g[i * 2 + 1] + (g[j * 2 + 1] - g[i * 2 + 1]) * u;
    this.ghost.position.set(x, this.w.map.ground(x, z), z);
    this.ghost.visible = true;
  }

  /** A chequered arch over the finish, when you're near it. */
  private drawArch(me: { x: number; z: number }) {
    const near = Math.hypot(this.fin.x - me.x, this.fin.z - me.z) < 300;
    if (near && !this.arch) {
      const g = new THREE.Group(), c = document.createElement("canvas");
      c.width = 256; c.height = 32;
      const x = c.getContext("2d")!;
      for (let k = 0; k < 16; k++) for (let r = 0; r < 2; r++) { x.fillStyle = (k + r) % 2 ? "#111" : "#f4f4f2"; x.fillRect(k * 16, r * 16, 16, 16); }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const post = new THREE.MeshLambertMaterial({ color: "#d8d4c2" });
      for (const s of [-3, 3]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4, 0.15), post); p.position.set(s, 2, 0); g.add(p); }
      const banner = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.6, 0.08), new THREE.MeshLambertMaterial({ map: tex }));
      banner.position.y = 4;
      g.add(banner);
      g.position.set(this.fin.x, this.w.map.ground(this.fin.x, this.fin.z), this.fin.z);
      g.rotation.y = Math.atan2(this.fin.x - this.offer.x, this.fin.z - this.offer.z);
      this.arch = g;
      this.w.scene.add(g);
    } else if (!near && this.arch) this.dropArch();
  }

  private dropArch() {
    if (!this.arch) return;
    this.w.scene.remove(this.arch);
    this.arch.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.arch = null;
  }

  event(d: any, from: string) {
    if (d.k === "fin" && !this.results.some((r) => r.id === from)) {
      const t = Number(d.t);
      if (!Number.isFinite(t)) return;
      if (!this.results.length) this.firstT = Date.now();
      this.results.push({ id: from, t });
      this.results.sort((a, b) => a.t - b.t);
      const place = this.results.findIndex((r) => r.id === from) + 1;
      const who = from === this.w.selfId ? "You" : this.w.nameOf(from);
      SFX.jobStep();
      this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(who)}</b> crossed the line ${["1st", "2nd", "3rd"][place - 1] ?? `${place}th`} in ${clock(t, true)} (${this.medal(t)})`);
      // everyone who was on the line is over it: done
      const racers = this.w.players().length;
      if (this.results.length >= racers) this.finish();
    } else if (d.k === "gh" && from !== this.w.selfId && d.b && Array.isArray(d.b.g)) {
      const t = Number(d.b.t);
      if (Number.isFinite(t) && (!this.best || t < this.best.t)) {
        this.best = { t, sp: Array.isArray(d.b.sp) ? d.b.sp.map(Number) : [], g: d.b.g.map(Number), by: this.w.nameOf(from) };
        keepBest(this.offer, this.best);
      }
    }
  }

  private medal(t: number) {
    const p = this.rt.par;
    return t < p * 0.88 ? "beat the author!" : t < p ? "gold" : t < p * 1.25 ? "silver" : t < p * 1.6 ? "bronze" : "no medal";
  }

  private finish() {
    if (this.done || !this.results.length) return;
    const top = this.results.slice(0, 3).map((r, k) => `${k + 1}. ${r.id === this.w.selfId ? "You" : this.w.nameOf(r.id)} ${clock(r.t, true)}`).join(" · ");
    this.done = { won: true, text: top, x: this.fin.x, z: this.fin.z };
  }

  progress() { return { r: this.results }; }
  restore(p: any) { if (Array.isArray(p?.r)) for (const r of p.r) if (!this.results.some((o) => o.id === r.id)) this.results.push({ id: String(r.id), t: Number(r.t) }); }

  card(): Card {
    const t = this.now, me = this.w.me();
    if (t < 0) return { line: `<b class="clue">${Math.ceil(-t) <= 3 ? Math.ceil(-t) : "Get ready"}</b>`, sub: `${esc(rideSpecs[this.rt.ride].name)} · gold ${clock(this.rt.par)}${this.best ? ` · best ${clock(this.best.t, true)}${this.best.by ? ` (${esc(this.best.by)}'s ghost)` : ""}` : ""}` };
    const d = Math.hypot(this.fin.x - me.x, this.fin.z - me.z);
    const mine = this.results.find((r) => r.id === this.w.selfId);
    if (mine) return { line: `Over the line in ${clock(mine.t, true)}: ${this.medal(mine.t)}`, sub: `Waiting for the rest` };
    return {
      line: `${far(d)} to <b>${esc(this.rt.to.n)}</b>, ${compassWord(this.fin.x - me.x, this.fin.z - me.z)} · ${clock(Math.max(0, t), true)}`,
      sub: `Gold ${clock(this.rt.par)} · silver ${clock(this.rt.par * 1.25)} · bronze ${clock(this.rt.par * 1.6)}${this.results.length ? ` · leader ${clock(this.results[0].t, true)}` : ""}`,
      bar: 1 - Math.min(1, d / this.rt.d),
    };
  }

  end() {
    this.w.mark("@race", null);
    if (this.ghost) { this.w.scene.remove(this.ghost); this.ghost = null; }
    this.dropArch();
  }
}
