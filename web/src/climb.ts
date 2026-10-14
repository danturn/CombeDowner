// Bishop King's Dream: a race up Bath Abbey, from the churchyard to the top of the tower. Its
// noticeboard is outside the west front every day, and it can be done again and again, like a
// race (Backspace for a go of your own). The way up is the Abbey's own (abbeyclimb.ts):
// - up the ladder of angels on either of the west front's turrets, in three stretches, with a
//   stone angel coming down each stretch in turn: meet one on the ladder and it knocks you off, so
//   wait on a moulding for it to pass and go as soon as it has;
// - over the roofs and along the nave's ridge to the tower;
// - up onto the ledge round the tower (jump at it from the ridge), along it and over the gap in
//   it, a running jump 27 m up;
// - and up the steeplejack's ladder on the tower's north face to the battlements. Every so often
//   the Abbey's bells ring (a single toll first, as a warning): while they ring, anyone moving on
//   the steeplejack's ladder is shaken off it, and anyone stood up on the ledge is shaken about,
//   so stop, and crouch on the ledge, till they've done.
// Fall and you land on whatever's below: a moulding, the roof, or the churchyard to start again.
// The clock runs from GO till you're on top of the tower, with splits at the top of the angels'
// ladder, on the ledge and over the gap, and gold, silver and bronze times. Gold earns a halo.
//
// Who decides what: where it all is comes from the map, and the angels and the bells go by the
// clock from when the job was taken, so everyone sees the same without anything being sent. Each
// player times themselves and says when they're at the top ("fin"), and a go of your own sends
// nothing.
import * as THREE from "three";
import * as SFX from "./audio";
import { abbeyClimb, type AbbeyClimb } from "./abbeyclimb";
import { dayNumber } from "./daylight";
import { CLIMB } from "./landmarks/abbey";
import { figure } from "./landmarks/kit";
import type { Rungs } from "./player";
import { type Card, type Job, type Offer, type QuestWorld, esc, hash, registerJob } from "./quests";

const COLOUR = "#f2cf5b";
const COUNTDOWN = 8;       // seconds from taking it to GO
const RETRY = 3;           // and for a go of your own
const AFTER = 120;         // seconds after the first one's at the top that the others get
const LINGER = 30;         // seconds a go of your own stays up after you're at the top
const KEY = "cd-climb-best";
const MEDALS = { gold: 50, silver: 75, bronze: 105 };
// the angels: each stretch of each ladder has one, which waits by the top of its stretch, comes
// down it head first till its head's at the bottom, then flies back up beside it
const SPEED = 2.4;         // metres a second, coming down
const REST = 2.5;          // seconds waiting at the top
const FLY = 2.5;           // seconds flying back up
const NEXT = 4;            // seconds after one stretch's angel is down that the next stretch's is
const TALL = 1.3;          // an angel, top to toe
// the bells
const PERIOD = 20;         // seconds from one ringing to the next
const TOLL = 13;           // the warning toll, seconds into the period
const PEAL = 15;           // and the ringing, to the end of the period
const STRIKE = 0.28;       // seconds between bells
const SHOVE = 0.8;         // seconds between shakes on the ledge
// the way up, in the Abbey's frame (landmarks/abbey.ts)
const T = CLIMB.tower, LEDGE = CLIMB.ledge;
const STAGES = ["Up the ladder of angels", "Along the roof to the tower", "Along the ledge and over the gap", "Up the steeplejack's ladder"];
const SPLITS = ["the angels' ladder", "the ledge", "over the gap"];

/** "1:23.4". */
function clock(s: number, tenths = false) {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${tenths ? r.toFixed(1).padStart(4, "0") : String(Math.round(r)).padStart(2, "0")}`;
}
const medalOf = (t: number) => (t < MEDALS.gold ? "gold" : t < MEDALS.silver ? "silver" : t < MEDALS.bronze ? "bronze" : "no medal");

interface Best { t: number; sp: number[] }
function bestOf(): Best | null {
  try {
    const b = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (b && Number.isFinite(b.t) && Array.isArray(b.sp)) return { t: Number(b.t), sp: b.sp.map(Number) };
  } catch { /* none */ }
  return null;
}
function keepBest(b: Best) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* full, or no storage */ } }

/** The HUD's flash under the crosshair, for the countdown, the splits and the bells. */
function hudBit(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:50%;top:calc(50% + 48px);width:320px;margin-left:-160px;pointer-events:none;z-index:5;text-align:center;font:800 22px 'Barlow Condensed',Impact,sans-serif;text-shadow:0 1px 3px #000";
  el.hidden = true;
  (document.getElementById("hud") ?? document.body).appendChild(el);
  return el;
}

interface Angel { L: Rungs; s: number; k: number; offset: number; down: number; obj: THREE.Group; fig: THREE.Mesh }

class Climb implements Job {
  done: Job["done"] = null;
  private ab: AbbeyClimb;
  private go: number;                       // ms since 1970: GO for the room, and when the angels and bells started
  private myGo: number;                     // and for me (a go of my own starts later)
  private start: { x: number; z: number; yaw: number };
  private climbing = false;                 // I'm on the start line or on the way up
  private own = false;                      // on a go of my own (Backspace), not the room's
  private over = false;                     // I'm at the top
  private overT = 0;
  private roomOver = false;
  private firstT = 0;
  private results: { id: string; t: number }[] = [];
  private stage = 0;
  private splits: number[] = [];
  private best = bestOf();
  private gold = false;
  private pipped = 4;
  private flash = hudBit();
  private flashT = 0;
  private angels: Angel[] = [];
  private group = new THREE.Group();
  private mat = new THREE.MeshLambertMaterial({ color: "#f3e9c8", emissive: "#a8853a", emissiveIntensity: 0.45 });
  private geo = figure(true, TALL / 2.15);
  private struck = -1;                      // the last bell rung (its number since GO), and the last toll
  private tolled = -1;
  private lastY = 0;
  private shoveT = 0;
  private warned = 0;                       // when we last said why you fell, ms since 1970

  constructor(readonly offer: Offer, private w: QuestWorld, started: number, private local: boolean) {
    this.ab = abbeyClimb(w.map)!;
    this.go = started + (local ? RETRY : COUNTDOWN) * 1000;
    this.myGo = this.go;
    const f = this.ab.frame;
    // everyone on the line across the churchyard, facing the west front
    const yaw = Math.atan2(-f.ax[0], -f.ax[1]);
    const ids = local ? [w.selfId] : w.players().map((p) => p.id).sort(), k = Math.max(0, ids.indexOf(w.selfId));
    const at = f.at(CLIMB.angels.x - 4.5, 0, Math.max(-9, Math.min(9, (k - (ids.length - 1) / 2) * 1.6)));
    this.start = { x: at.x, z: at.z, yaw };
    // the angels, one to each stretch of each turret's ladder
    w.scene.add(this.group);
    this.ab.angels.forEach((ladder, s) => ladder.forEach((L, k) => {
      const obj = new THREE.Group(), fig = new THREE.Mesh(this.geo, this.mat);
      fig.castShadow = true;
      obj.add(fig);
      this.group.add(obj);
      const down = (L.y1 - L.y0) / SPEED, cycle = REST + down + FLY;
      this.angels.push({ L, s, k, offset: s * cycle / 2 - k * NEXT, down, obj, fig });
    }));
    w.mark("@climb", this.target(), STAGES[0], COLOUR);
    this.own = local;
    if (Date.now() < this.go - 1000 && w.me().alive) {
      this.climbing = true;
      w.moveTo(this.start.x, this.start.z, yaw);
    } else w.toast("Someone's climbing the Abbey: Backspace to have a go of your own", 3);
  }

  /** Seconds since my GO. */
  private get now() { return (Date.now() - this.myGo) / 1000; }
  /** Seconds since the room's GO: what the angels and the bells go by. */
  private get tick() { return (Date.now() - this.go) / 1000; }

  restart(): boolean {
    if (!this.w.me().alive) return false;
    this.own = true; this.climbing = true; this.over = false;
    this.stage = 0; this.splits = []; this.pipped = 4;
    this.myGo = Date.now() + RETRY * 1000;
    this.w.moveTo(this.start.x, this.start.z, this.start.yaw);
    this.w.mark("@climb", this.target(), STAGES[0], COLOUR);
    SFX.tick();
    return true;
  }

  held() { return this.climbing && this.now < 0 ? { x: this.start.x, z: this.start.z } : null; }

  /** Where the marker stands for the stage you're on. */
  private target(): { x: number; y: number; z: number } {
    const f = this.ab.frame, J = CLIMB.jack;
    const p = this.stage === 0 ? f.at(CLIMB.angels.x - 0.5, 0, -CLIMB.angels.z)
      : this.stage === 1 ? f.at(T.x0 - 1.2, 25, 0)
      : this.stage === 2 ? f.at(J.x, LEDGE, J.z - 0.5)
      : f.at((T.x0 + T.x1) / 2, T.top, 0);
    return { x: p.x, y: p.y, z: p.z };
  }

  update(dt: number) {
    const t = this.now, me = this.w.me();
    if (this.climbing && !this.over) {
      if (t < 0) {
        const n = Math.ceil(-t);
        if (n <= 3 && n < this.pipped) { this.pipped = n; SFX.pip(false); this.show(`<span style="font-size:54px;color:#fff">${n}</span>`, 0.9); }
      } else if (this.pipped > 0) { this.pipped = 0; SFX.pip(true); this.show(`<span style="font-size:54px;color:${COLOUR}">GO!</span>`, 1); }
    }
    if (!this.roomOver && this.results.length && (Date.now() - this.firstT) / 1000 > AFTER) this.roomOver = true;
    if (!this.done) {
      const busy = this.climbing && !this.over;
      if (this.local ? this.over && Date.now() - this.overT > LINGER * 1000 : this.roomOver && !busy) this.finish();
    }
    if (this.done) { this.flash.hidden = true; this.group.visible = false; return; }
    this.drawAngels();
    this.bells(dt, me);
    if (this.climbing && !this.over && t >= 0 && me.alive) this.progress_(t, me);
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.flash.hidden = true;
  }

  private show(html: string, secs: number) { this.flash.innerHTML = html; this.flash.hidden = false; this.flashT = secs; }

  /** How far up you've got: the splits, and the top. */
  private progress_(t: number, me: { x: number; y: number; z: number }) {
    const [lx, ly, lz] = this.ab.frame.local(me.x, me.y, me.z);
    const byTower = lx > T.x0 - 1.3 && lx < T.x1 + 1.3 && Math.abs(lz) < T.z + 1.3;
    const on = this.w.onLadder?.() ?? null;
    const reached = [
      ly > 20,                                                          // up on the roofs
      byTower && ly > LEDGE - 0.2,                                      // on the ledge
      on === this.ab.jack || (byTower && ly > LEDGE + 1 && lz < -T.z),  // over the gap, at the steeplejack's ladder
      ly > T.top - 0.3 && lx > T.x0 && lx < T.x1 && Math.abs(lz) < T.z, // on top of the tower
    ];
    while (this.stage < 4 && reached[this.stage]) {
      if (this.stage < 3) this.split(this.stage, t);
      else { this.atTop(t); return; }
      this.stage++;
      this.w.mark("@climb", this.target(), STAGES[this.stage], COLOUR);
    }
  }

  private split(k: number, t: number) {
    this.splits.push(t);
    const was = this.best?.sp[k];
    const diff = was !== undefined ? t - was : null;
    const col = diff === null ? "#fff" : diff <= 0 ? "#58e06a" : "#ff5a4e";
    this.show(`<div style="font-size:16px;color:#ddd">${SPLITS[k]}</div><span style="color:#fff">${clock(t, true)}</span>`
      + (diff !== null ? ` <span style="color:${col}">${diff <= 0 ? "-" : "+"}${Math.abs(diff).toFixed(1)}</span>` : ""), 2.5);
    if (diff !== null) SFX.pip(diff <= 0); else SFX.tick();
  }

  /** On top of the tower, at t on my clock. */
  private atTop(t: number) {
    this.over = true; this.overT = Date.now();
    t = Math.round(t * 10) / 10;
    this.w.mark("@climb", null);
    if (!this.own) {
      const msg = { k: "fin", s: this.offer.seed, t };
      this.w.send("qe", msg);
      this.event(msg, this.w.selfId);
    } else SFX.jobStep();
    const beat = !this.best || t < this.best.t, m = medalOf(t);
    if (m === "gold") this.gold = true;
    this.show(`<span style="color:#fff">${clock(t, true)}</span> <span style="color:${beat ? "#58e06a" : "#ddd"}">${m}${beat && this.best ? ", a best!" : ""}</span>`
      + `<div style="font-size:15px;color:#ddd">Backspace to go again</div>`, 5);
    if (beat) { this.best = { t, sp: this.splits.slice() }; keepBest(this.best); }
  }

  // ---- the angels -------------------------------------------------------------------------------

  /** Where each angel is: waiting by the top of its stretch, coming down it, or flying back up
   *  beside it; and whether it's met you on the ladder. */
  private drawAngels() {
    const now = this.tick, me = this.w.me(), on = this.w.onLadder?.() ?? null;
    for (const a of this.angels) {
      const { L } = a, cycle = REST + a.down + FLY;
      const u = (((now + a.offset) % cycle) + cycle) % cycle;
      // beside the ladder (side), or on it, a little nearer the wall than a climber
      const sx = -L.nz, sz = L.nx, side = (a.s ? 1 : -1) * 0.95;
      let y: number, coming = false, by = 0;
      if (u < REST) { y = L.y1 + Math.sin(now * 2 + a.k) * 0.08; by = side; }
      else if (u < REST + a.down) { y = L.y1 + TALL - (u - REST) * SPEED; coming = true; }
      else { y = L.y0 + ((u - REST - a.down) / FLY) * (L.y1 - L.y0); by = side; }
      a.obj.position.set(L.x - L.nx * 0.35 + sx * by, y, L.z - L.nz * 0.35 + sz * by);
      a.obj.rotation.y = Math.atan2(-L.nx, -L.nz);
      // coming down head first, like the carved ones; otherwise upright
      a.fig.rotation.z = coming ? Math.PI : 0;
      // met you on its stretch of the ladder: off you come
      if (coming && on === L && y - TALL < me.y + 1.7 && y > me.y + 0.1) {
        this.w.knock?.(-L.nx * 0.4, 1.5, -L.nz * 0.4);
        SFX.clunk();
        this.why("An angel came down on you! Wait on a ledge for it to pass");
      }
    }
  }

  // ---- the bells --------------------------------------------------------------------------------

  /** The bells: a toll, then a peal; and the tower shaking anyone on its ledge or its ladder. */
  private bells(dt: number, me: { x: number; y: number; z: number; alive: boolean }) {
    const now = this.tick, f = this.ab.frame;
    if (now < 0) return;
    const n = Math.floor(now / PERIOD), u = now - n * PERIOD;
    const tower = f.at((T.x0 + T.x1) / 2, 34, 0), [d, pan] = this.w.hear?.(tower.x, tower.y, tower.z) ?? [0, 0];
    if (u >= TOLL && this.tolled < n) {
      this.tolled = n;
      SFX.abbeyBell(9, d, pan);
      if (this.near(me)) this.show(`<span style="color:${COLOUR}">The bells are about to ring: hold on!</span>`, 2);
    }
    const ringing = u >= PEAL;
    if (ringing) {
      const k = n * 100 + Math.floor((u - PEAL) / STRIKE);
      if (k > this.struck) { this.struck = k; SFX.abbeyBell(k % 10, d, pan); }
    }
    const on = this.w.onLadder?.() ?? null;
    if (ringing && me.alive) {
      const [lx, ly, lz] = f.local(me.x, me.y, me.z);
      if (on === this.ab.jack && Math.abs(me.y - this.lastY) > 0.005) {
        // moving on the steeplejack's ladder while it shakes
        this.w.knock?.(-on.nx * 0.5, 1, -on.nz * 0.5);
        this.why("The bells shook you off: keep still on the ladder while they ring");
      } else if (!on && Math.abs(ly - LEDGE) < 0.15 && lx > T.x0 - 1 && lx < T.x1 + 1 && Math.abs(lz) < T.z + 1
        && (lx < T.x0 || lx > T.x1 || Math.abs(lz) > T.z) && !this.w.crouched?.() && (this.shoveT -= dt) <= 0) {
        // stood up on the ledge: shaken about, out from the tower
        this.shoveT = SHOVE;
        const ox = lx < T.x0 ? -1 : lx > T.x1 ? 1 : 0, oz = lz < -T.z ? -1 : lz > T.z ? 1 : 0, r = Math.random() - 0.5;
        const vx = (ox + oz * r * 2) * 1.6, vz = (oz + ox * r * 2) * 1.6;
        this.w.knock?.(f.ax[0] * vx + f.az[0] * vz, 2, f.ax[1] * vx + f.az[1] * vz);
        this.why("The tower's shaking! Crouch (C) on the ledge to hold on");
      }
    } else this.shoveT = 0;
    this.lastY = me.y;
  }

  /** Near enough the Abbey to be climbing it. */
  private near(me: { x: number; z: number }) { return Math.hypot(me.x - this.ab.mid[0], me.z - this.ab.mid[1]) < 60; }

  private why(text: string) {
    if (Date.now() - this.warned < 2500) return;
    this.warned = Date.now();
    this.show(`<span style="color:#ffb35a;font-size:19px">${esc(text)}</span>`, 2.5);
  }

  // ---- the room ---------------------------------------------------------------------------------

  event(d: any, from: string) {
    if (d.k !== "fin" || this.results.some((r) => r.id === from)) return;
    const t = Number(d.t);
    if (!Number.isFinite(t) || t <= 0) return;
    if (!this.results.length) this.firstT = Date.now();
    this.results.push({ id: from, t });
    this.results.sort((a, b) => a.t - b.t);
    const place = this.results.findIndex((r) => r.id === from) + 1;
    const who = from === this.w.selfId ? "You" : this.w.nameOf(from);
    SFX.jobStep();
    this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(who)}</b> reached the top of the Abbey ${["1st", "2nd", "3rd"][place - 1] ?? `${place}th`} in ${clock(t, true)} (${medalOf(t)})`);
    if (this.results.length >= this.w.players().length) this.roomOver = true;
  }

  private finish() {
    if (this.done) return;
    const wear = this.gold ? ["halo"] : undefined;
    if (!this.results.length) {
      this.done = this.local ? { won: this.over, text: "Climb over", wear } : { won: false, text: "Nobody made it to the top", wear };
      return;
    }
    const top = this.results.slice(0, 3).map((r, k) => `${k + 1}. ${r.id === this.w.selfId ? "You" : this.w.nameOf(r.id)} ${clock(r.t, true)}`).join(" · ");
    const at = this.ab.frame.at(CLIMB.angels.x - 6, 0, 0);
    this.done = { won: true, text: top, x: at.x, z: at.z, wear };
  }

  progress() { return { r: this.results }; }
  restore(p: any) { if (Array.isArray(p?.r)) for (const r of p.r) if (!this.results.some((o) => o.id === r.id)) this.results.push({ id: String(r.id), t: Number(r.t) }); }

  card(): Card {
    const t = this.now;
    const medals = `Gold ${clock(MEDALS.gold)} · silver ${clock(MEDALS.silver)} · bronze ${clock(MEDALS.bronze)}`;
    if (this.climbing && !this.over && t < 0) {
      return { line: `<b class="clue">${Math.ceil(-t) <= 3 ? Math.ceil(-t) : "Get ready"}</b>`, sub: `${medals}${this.best ? ` · best ${clock(this.best.t, true)}` : ""}` };
    }
    const mine = this.results.find((r) => r.id === this.w.selfId);
    if (!this.climbing || this.over) {
      return {
        line: mine ? `At the top in ${clock(mine.t, true)}: ${medalOf(mine.t)}` : this.best ? `Your best: ${clock(this.best.t, true)} (${medalOf(this.best.t)})` : "Watching the climb",
        sub: `<b>Backspace</b> to go again${!this.local && this.results.length ? ` · leader ${clock(this.results[0].t, true)}` : ""}`,
      };
    }
    const sp = this.splits.map((s, k) => {
      const was = this.best?.sp[k];
      return was === undefined ? clock(s, true) : `<span style="color:${s <= was ? "#58e06a" : "#ff5a4e"}">${clock(s, true)}</span>`;
    }).join(" · ");
    return {
      line: `${STAGES[Math.min(3, this.stage)]} · ${clock(Math.max(0, t), true)}${this.own ? " (your own go)" : ""}`,
      sub: `${sp ? `Splits ${sp}<br>` : ""}${medals}${!this.own && this.results.length ? ` · leader ${clock(this.results[0].t, true)}` : ""}`,
      bar: this.stage / 4,
    };
  }

  end() {
    this.w.mark("@climb", null);
    this.w.scene.remove(this.group);
    this.geo.dispose();
    this.mat.dispose();
    this.flash.remove();
  }
}

registerJob({
  id: "climb", glyph: "A", colour: COLOUR, label: "Climb", again: true, dailyOnly: true,
  offer: () => null,
  daily(_r, _spots, w) {
    const ab = abbeyClimb(w.map);
    if (!ab) return null;
    const at = ab.frame.at(CLIMB.angels.x - 9, 0, 3);
    const best = bestOf();
    return {
      kind: "climb", seed: hash("climb", dayNumber()), stars: 3, x: at.x, z: at.z, where: "Bath Abbey, the west front",
      title: "Bishop King's Dream: climb the Abbey",
      blurb: "From the churchyard to the top of the tower, against the clock. Up the ladder of angels (mind the angels coming down), "
        + "along the roof, onto the ledge round the tower and over the gap, then up the steeplejack's ladder. Hold still when the bells ring. "
        + `Gold ${clock(MEDALS.gold)}, silver ${clock(MEDALS.silver)}, bronze ${clock(MEDALS.bronze)}.${best ? ` Your best: ${clock(best.t, true)}.` : ""}`,
      reward: "3 prizes for the winner's room, and a halo for gold",
    };
  },
  start: (o, w, started, _by, local) => new Climb(o, w, started, !!local),
});
