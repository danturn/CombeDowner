// How every minigame starts, the way a race always has: taking one opens the entries, and for a
// few seconds anyone in the game, wherever they are, can press E (□ on a pad, Use on a touch
// screen) to enter; whoever took it is in already. A banner in the middle says what's on, who's in
// and how long is left. When the entries close, everyone who entered, and nobody else, is taken out
// of whatever they were doing (out of a car or a balloon, down off a ladder, off their ride, anything
// carried put down), patched up, and put in the game area at a spot of the minigame's own, spread
// out and facing the way it says. Then its title card, held still, and 3, 2, 1, GO! under the start
// lights, and the minigame itself begins. With nobody else in the room there's nobody to wait for,
// so the entries are skipped and it goes straight to the line-up.
//
// Each minigame says only what's its own (JobKind.lineup): where its spots are, how long the
// entries and the hold last if not the usual, and anything more for whoever's put in place (a
// race's ride). It is handed who's in (the cast) when it starts at GO. Anyone who didn't enter, or
// joins the room after the entries close, is left where they are and watches.
//
// Who decides what: taking it goes round as quests.ts's "start" (with "lu": how long the entries
// are open, nought on your own), entering as "ent", and the host closes the entries and sends the
// line-up ("lu": who's in, in order, and the spots it worked out for them), all inside "qe". The host
// also patches up everyone in it. If no line-up comes (an older host), each player falls back on the
// entries they heard and works the spots out for themselves. The times all come from the taker's
// clock, so everyone counts down together.
import * as SFX from "./audio";
import { clearSpot } from "./haunts";
import type { GameMap } from "./map";
import { ctl } from "./controls";
import { esc } from "./hudkit";
import { type Start, countdownFor, missionBegin, missionCountdown, missionProgress, missionWaiting } from "./missionscreens";
import { bestFor } from "./trophies";
import type { JobKind, Offer, QuestWorld } from "./quests";
import { briefMore } from "./brief";
import { guide } from "./notice";

export const ENTRY = 15;        // seconds the entries are open, unless a minigame says otherwise
export const HOLD = 6;          // seconds from the line-up to GO: the title card, then 3, 2, 1
const SOLO_HOLD = 1;            // and on your own, with no countdown: just long enough to be put in place
const LINEUP_WAIT = 2.5;        // seconds after the entries close to wait for the host's line-up
const GO_HUSH = 1.3;            // seconds after GO before the middle of the screen is anyone else's again
const MAX = 64;

/** A place to stand at the start, scene coordinates, facing yaw. */
export interface LineupSpot { x: number; z: number; yaw: number }

/** What a minigame says about its start. */
export interface LineupConfig {
  /** Seconds the entries stay open (ENTRY if left out). */
  entry?: number;
  /** Seconds from the line-up to GO (HOLD if left out). */
  hold?: number;
  /** n places in the game area, one each, the first for the first in. Left out: round its noticeboard. */
  spots?(o: Offer, w: QuestWorld, n: number): LineupSpot[];
  /** Leave everyone's health as it is. */
  keepHealth?: boolean;
  /** Anything more once you're in place (a race's ride). */
  ready?(o: Offer, w: QuestWorld): void;
  /** What E says while the entries are open ("Enter the race"). */
  verb?: string;
  /** How the mode starts: a "race", any other "timed" clock, or "calm". The 3, 2, 1, GO! follows from
   *  that and how many are in it (countdownFor). Every mode says which; "timed" if it doesn't. */
  start?: Start;
}

/** n places spread round (cx, cz), r metres out (closer in if it can't fit them), each on clear
 *  ground, facing face: a point to look at, or "in" or "out" from the middle. */
export function ring(map: GameMap, cx: number, cz: number, n: number, r = 2.2, face: { x: number; z: number } | "in" | "out" = "in", a0 = 0.4): LineupSpot[] {
  const out: LineupSpot[] = [];
  const rr = n > 1 ? Math.max(r, (n * 1.1) / (Math.PI * 2)) : 0;
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / Math.max(1, n)) * Math.PI * 2, rk = rr + Math.floor(k / 12) * 1.4;
    let x = cx + Math.cos(a) * rk, z = cz + Math.sin(a) * rk;
    if (map.blocked(x, z, 0.4)) { const c = clearSpot(map, x, z, 3); if (c) { x = c[0]; z = c[1]; } }
    const fx = face === "in" ? cx : face === "out" ? x + (x - cx || 1) : face.x, fz = face === "in" ? cz : face === "out" ? z + (z - cz) : face.z;
    out.push({ x, z, yaw: Math.atan2(x - fx, z - fz) });
  }
  return out;
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** One minigame's start, from being taken till GO, on every player's screen. */
export class Lineup {
  readonly entries: string[] = [];
  cast: string[] | null = null;
  private castFromHost = false;
  private spots: LineupSpot[] | null = null;
  private mine: LineupSpot | null = null;
  readonly close: number;           // ms since 1970 on the taker's clock: the entries close
  private goAt = 0;                 // and GO, once the line-up's in
  private pipped = 4;
  private cfg: LineupConfig;

  constructor(readonly offer: Offer, readonly kind: JobKind, private w: QuestWorld, readonly t: number, readonly by: string, readonly entrySecs: number) {
    this.cfg = kind.lineup ?? {};
    this.close = t + entrySecs * 1000;
    this.enter(by);
    if (!entrySecs) return;
    const left = Math.ceil((this.close - Date.now()) / 1000);
    if (left <= 0) return;
    if (by === w.selfId) w.toast(`You're in. Everyone else has ${left} s to press {use} and join`, 3);
    else guide(`${w.nameOf(by)} has started ${offer.title}: {use} to join in (${left} s)`, 4);
  }

  /** How long the entries stay open, for whoever takes one: none with nobody else in the room. */
  static entryFor(kind: JobKind, w: QuestWorld) { return w.players().length <= 1 ? 0 : kind.lineup?.entry ?? ENTRY; }

  /** GO, ms since 1970, once there's a line-up. */
  get go() { return this.goAt; }
  /** It's GO: time for the minigame itself. */
  get started() { return !!this.cast && Date.now() >= this.goAt; }

  private here(id: string) { return this.w.players().some((p) => p.id === id); }
  enter(id: string) { if (!this.entries.includes(id) && this.entries.length < MAX) this.entries.push(id); }
  private open() { return !this.cast && Date.now() < this.close; }
  canEnter() { return this.open() && !this.entries.includes(this.w.selfId) && this.w.me().alive; }

  /** E while the entries are open: in. */
  use(): boolean {
    if (!this.canEnter()) return false;
    this.enter(this.w.selfId);
    this.w.send("qe", { k: "ent", s: this.offer.seed });
    SFX.tick();
    return true;
  }

  hint() {
    return this.canEnter() ? `<b>{use}</b> ${esc(this.cfg.verb ?? `Join in: ${this.offer.title}`)} (${Math.ceil((this.close - Date.now()) / 1000)} s)` : "";
  }

  /** The host closes the entries and says who's in and where each goes. */
  host() {
    if (this.cast || Date.now() < this.close) return;
    const ids = this.entries.filter((id) => this.here(id));
    const at = this.place(ids.length);
    const q = (n: number) => Math.round(n * 100) / 100;
    this.w.send("qe", { k: "lu", s: this.offer.seed, ids, at: at.map((p) => [q(p.x), q(p.z), q(p.yaw)]) });
    if (!this.cfg.keepHealth) for (const id of ids) this.w.heal?.(id);
    this.lineUp(ids, at, true);
  }

  private place(n: number): LineupSpot[] {
    let at: LineupSpot[] | null = null;
    try { at = this.cfg.spots?.(this.offer, this.w, n) ?? null; } catch (e) { console.warn("line-up spots", e); }
    if (!at || at.length < n) {
      const c = clearSpot(this.w.map, this.offer.x, this.offer.z, 12) ?? [this.offer.x, this.offer.z];
      at = [...(at ?? []), ...ring(this.w.map, c[0], c[1], n).slice(at?.length ?? 0)];
    }
    return at;
  }

  /** Who's in, and where: everyone in it taken out of what they were doing and put in place. One of
   *  my own making (no word from the host) gives way to the host's, till GO. */
  lineUp(ids: string[], at: LineupSpot[] | null, fromHost: boolean) {
    if (this.castFromHost || (this.cast && (!fromHost || this.started))) return;
    const was = this.cast;
    this.cast = ids.slice(0, MAX);
    this.castFromHost = fromHost;
    for (const id of this.cast) this.enter(id);
    this.spots = at && at.length >= this.cast.length ? at : this.place(this.cast.length);
    const hold = (this.entrySecs ? this.cfg.hold ?? HOLD : Math.min(this.cfg.hold ?? HOLD, SOLO_HOLD)) * 1000;
    this.goAt = this.close + hold;
    const k = this.cast.indexOf(this.w.selfId);
    if (k < 0) {
      this.mine = null;
      if (this.entries.includes(this.w.selfId) && !was) this.w.toast("The entries closed without you: you're watching this one", 3);
      else if (!was) this.w.feed(`<b style="color:${this.kind.colour}">${esc(this.offer.title)}</b> is under way, ${this.cast.length} in`);
      return;
    }
    const spot = this.spots[k];
    if (was && this.mine && Math.hypot(spot.x - this.mine.x, spot.z - this.mine.z) < 0.5) return;
    if (!this.w.me().alive) return;
    this.mine = spot;
    this.w.reset?.();
    this.w.moveTo(spot.x, spot.z, spot.yaw);
    this.cfg.ready?.(this.offer, this.w);
    if (!was) this.card();
  }

  private card() {
    const o = this.offer, k = this.kind;
    const many = (this.cast?.length ?? 1) > 1;
    missionBegin({
      title: o.title, goal: k.goal?.(o) ?? o.blurb.replace(/<[^>]*>/g, ""), label: k.label, colour: k.colour, best: bestFor(o.kind),
      detail: many ? `${this.cast!.length} in: ${this.names(this.cast!)}` : o.where ? `At ${o.where}` : undefined, ...briefMore(o, k),
    });
  }

  private names(ids: string[]) {
    return ids.slice(0, 6).map((id) => (id === this.w.selfId ? "You" : this.w.nameOf(id))).join(", ") + (ids.length > 6 ? ` and ${ids.length - 6} more` : "");
  }

  /** Every frame till GO: the fall-back line-up, the banner, the panel and the countdown. */
  update() {
    const now = Date.now();
    if (!this.cast && now >= this.close + LINEUP_WAIT * 1000) this.lineUp([...this.entries].sort().filter((id) => this.here(id)), null, false);
    const k = this.kind, o = this.offer;
    if (this.open()) {
      const inIt = this.entries.includes(this.w.selfId), left = Math.ceil((this.close - now) / 1000);
      missionWaiting({
        kind: o.title, colour: k.colour, head: `Waiting for players<span class="dots"></span>`, count: left,
        sub: `${this.entries.length} in: ${esc(this.names(this.entries))}`,
        small: inIt ? "You're in" : this.w.me().alive ? `<b>${esc(ctl("use"))}</b> to join in` : "",
      });
      missionProgress({
        id: "job", label: esc(k.label), colour: k.colour, goal: o.title,
        hint: inIt ? `<b class="clue">You're in</b> · starting in ${left} s` : `<b class="clue">Entries open</b>: <b>{use}</b> to join in · ${left} s`,
        sub: `${this.entries.length} in: ${esc(this.names(this.entries))}`, bar: 1 - Math.max(0, Math.min(1, (this.close - now) / Math.max(1, this.entrySecs * 1000))),
      });
      return;
    }
    if (!this.cast) {
      missionWaiting({ kind: o.title, head: `Lining up<span class="dots"></span>`, sub: `${this.entries.length} in: ${esc(this.names(this.entries))}` });
      return;
    }
    missionWaiting(null);
    const t = (now - this.goAt) / 1000;
    missionProgress({ id: "job", label: esc(k.label), colour: k.colour, goal: o.title, hint: this.mine ? `<b class="clue">Get ready</b>` : `Under way: ${esc(this.names(this.cast))}` });
    if (!this.mine) return;
    const n = Math.ceil(-t);
    if (t < 0 && n <= 3 && n < this.pipped) { this.pipped = n; this.count(n); }
    else if (t >= 0 && this.pipped > 0) { this.pipped = 0; this.count(0); }
  }

  /** The GO itself, if the minigame starts before the next frame's countdown would show it. */
  goNow() { if (this.mine && this.pipped > 0) { this.pipped = 0; this.count(0); } }

  private count(n: number) {
    const style = countdownFor(this.cfg.start ?? "timed", this.cast?.length ?? 1);
    if (style === "none") return;
    SFX.pip(n === 0);
    missionCountdown(n, this.kind.colour, style);
  }

  /** Where I'm held still till GO, if I'm in it. */
  held(): { x: number; z: number } | null { return this.mine && this.cast && Date.now() < this.goAt ? { x: this.mine.x, z: this.mine.z } : null; }
  /** The middle of the screen is the countdown's. */
  quiet() { return !!this.mine && Date.now() < this.goAt + GO_HUSH * 1000; }
  /** Am I in it? */
  inIt() { return this.entries.includes(this.w.selfId); }

  /** A step of the start from another player. */
  event(d: any, from: string) {
    if (d.k === "ent") { if (!this.cast && Date.now() < this.close + LINEUP_WAIT * 1000) this.enter(from); }
    else if (d.k === "lu" && Array.isArray(d.ids)) {
      const at = Array.isArray(d.at) ? d.at.slice(0, MAX).map((p: unknown) => (Array.isArray(p) ? { x: num(p[0]), z: num(p[1]), yaw: num(p[2]) } : null)) : null;
      this.lineUp(d.ids.map(String), at && at.every(Boolean) ? at : null, true);
    }
  }

  /** What goes round to someone joining before GO. */
  state() { return { e: this.entries, c: this.castFromHost ? this.cast : null, at: this.castFromHost ? this.spots?.map((p) => [p.x, p.z, p.yaw]) : null }; }
  restore(d: any) {
    if (Array.isArray(d?.e)) for (const id of d.e.slice(0, MAX)) this.enter(String(id));
    if (Array.isArray(d?.c)) this.event({ k: "lu", ids: d.c, at: d.at }, "");
  }

  dispose() { missionWaiting(null); }
}
