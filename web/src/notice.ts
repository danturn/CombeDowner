// Every message the game puts up while you play, sorted by the question you're asking. Each kind
// has one place on the screen and one look, all in the HUD's plate family (the dark panel with
// clipped corners, in the HUD's font):
//
//   guide()    Guidance, "what do I do now?": how to do the thing in front of you, a mode's
//              instructions, the examiner's directions. Under the crosshair, with the use prompt's
//              look (key caps and all), just under the prompt when one is up (#guide).
//   news()     News, "what just happened?": a kill, a pickup, the speed trap, a town arrived in, a
//              pub won back. A plate a little above the middle (#toast): big for a few words,
//              smaller and wrapped for anything longer than LONG characters.
//   Mission    "How's my job going?": the brief, title card, status panel, stage calls and the result
//              card, in the mission's colour. All missionscreens.ts (missionCall for a stage call).
//   score()    Score, "how am I doing right now?": the pops (a flag shot, a boost, a barge) under the
//              combo row (combo.ts) in the meter slot under the crosshair, each replacing the last.
//   reward()   Rewards, "what have I earned to keep?": a trophy, a wardrobe item (with its picture
//              when one can be drawn), a token. A gold-edged plate with its medal sliding in at the
//              top, one at a time; while a mission's result card is up it is written on the card.
//   people()   People, "who's around?": who did what, who joined or left. The feed, top right.
//
// Callers say only what happened: the words, a name, an item, a trophy's grade. How each kind looks,
// where it sits and how long it stays (readSecs, from how long it takes to read) are decided here,
// so changing a kind is one edit in this file.
//
// Outside the six: systemNote() is the game about itself (the map stuck loading, someone on another
// version), a BathText strip along the top; and speech bubbles, the Chronicle and the phone are
// props in the world, with their own looks.
//
// Guidance and news each keep a queue: nothing is lost. A new one waits until the one showing has
// been up long enough to read its first words (MIN_UP), then takes its place; the same words again
// just keep it up. While a title card, a race's countdown or anything else asks for quiet
// (noticeHold), or the big map is open, they wait, and come one after another once it's over.
//
// All drawn on this screen only, from what the game already knows: nothing goes over the network.
import { addStyle, esc, layer } from "./hudkit";
import { pop } from "./pop";
import { ctlText } from "./controls";
import { padText } from "./gamepad";
import { keycaps } from "./useprompt";

/** What a message says: never how it looks or how long it stays, which each kind decides for itself. */
export interface Message {
  /** Plain text: names can't be taken for html. {use} and the like become the key's name. */
  text: string;
  /** A second, smaller line. */
  sub?: string;
}
export interface Reward extends Message {
  /** What kind of thing it is, small above it. */
  kicker?: string;
  /** A trophy's grade, which the medal shows. */
  grade?: "gold" | "silver" | "bronze";
  /** A picture of the thing (a wardrobe item), in place of the medal once it's drawn. */
  pic?: string | Promise<string | null>;
}
export interface ScorePop extends Message {
  /** The run is over (a combo's total): said in white rather than climbing gold. */
  final?: boolean;
}

const MIN_UP = 0.9;      // seconds a line is up before a newer one may take its place
const CLIP = "polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))";
const MAX_QUEUE = 5;
const LONG = 64;
const REWARD_SECS = 3.6;
const PEOPLE_ROWS = 5, PEOPLE_SECS = 7, PEOPLE_DOOR_SECS = 4.5;
const GRADE = { gold: "#ffc83a", silver: "#c3ccd6", bronze: "#cd7f32" };

let linger = 1;
/** The HUD page holds its specimens up: every message stays k times as long. */
export function noticeLinger(k: number) { linger = k; }
/** How long a message stays up: a glance plus long enough to read it, between lo and hi seconds. */
export function readSecs(text: string, lo: number, hi: number, perChar = 1 / 20, glance = 1.2) {
  return Math.min(hi, Math.max(lo, glance + text.length * perChar)) * linger;
}

addStyle("notice", `
#toast.plate{width:max-content;max-width:min(520px,calc(100vw - 32px));box-sizing:border-box;padding:8px 18px 12px;background:var(--panel);clip-path:${CLIP};
  box-shadow:inset 0 -3px 0 var(--kc,var(--accent));color:#fff;font:800 26px/1.1 var(--f-hud);letter-spacing:.02em;text-transform:none;-webkit-text-stroke:0;text-shadow:none}
#toast.plate.note{max-width:min(560px,calc(100vw - 32px));padding:6px 14px 10px;font-size:18px;font-weight:600;line-height:1.2}
#toast.plate small{display:block;font-size:.66em;font-weight:600;color:#c8d4dc;margin-top:2px}
@media (max-width:700px),(max-height:500px){#toast.plate{font-size:21px}#toast.plate.note{font-size:16px}}
#guide{position:absolute;left:50%;top:calc(50% + 46px);transform:translateX(-50%);width:max-content;max-width:min(520px,calc(100vw - 32px));box-sizing:border-box;
  background:var(--panel);padding:5px 14px 4px;font:700 15px/1.3 var(--f-hud);letter-spacing:.08em;text-transform:uppercase;text-align:center;color:#fff;pointer-events:none;
  opacity:0;transition:opacity .25s}
#guide.show{opacity:1}
#guide kbd{display:inline-block;min-width:1.3em;padding:1px 6px 0;margin:0 3px 0 0;border:1px solid var(--accent);border-bottom-width:3px;border-radius:3px;font:inherit;color:var(--accent);text-align:center;line-height:1.15;letter-spacing:.04em}
#guide small{display:block;font-size:13px;color:#c8d4dc;letter-spacing:.06em}
/* "Click to aim" sits just under the crosshair too; the use prompt's rule outranks this one */
:has(#clickhint:not([hidden])) #guide{top:calc(50% + 70px)}
:has(#clickhint:not([hidden])) #hud:has(#guide.show) #maux{top:calc(50% + 108px + var(--guide-h,0px))}
#hud:has(#usehint:not([hidden])) #guide{top:calc(50% + 80px)}
#hud:has(#guide.show) #maux{top:calc(50% + 84px + var(--guide-h,0px))}
#hud:has(#usehint:not([hidden])):has(#guide.show) #maux{top:calc(50% + 118px + var(--guide-h,0px))}
body:has(#bigmap:not([hidden])) #guide{visibility:hidden}
#trick{position:absolute;left:50%;top:calc(50% + 150px);transform:translateX(-50%);text-align:center;max-width:calc(100vw - 32px);pointer-events:none;font:800 26px/1.1 var(--f-hud);letter-spacing:.04em;
  color:var(--accent);text-shadow:0 2px 0 rgba(0,0,0,.6),0 0 12px rgba(0,0,0,.5);transition:opacity .3s}
#trick.out{opacity:0}
#trick.final{color:#fff}
#maux>#trick{position:static;transform:none;width:auto}
body:has(#bigmap:not([hidden])) #trick{visibility:hidden}
#trick small{display:block;font-size:14px;color:#fff;letter-spacing:.06em;text-transform:uppercase}
@media (max-height:500px){#trick{top:calc(50% + 96px);font-size:20px}}
#award{position:absolute;left:50%;top:10px;z-index:12;transform:translate(-50%,-140%);transition:transform .45s cubic-bezier(.2,1.3,.4,1),opacity .4s;opacity:0;
  pointer-events:none;display:flex;align-items:center;gap:10px;padding:8px 18px 11px 10px;max-width:calc(100vw - 24px);box-sizing:border-box;
  background:var(--panel);clip-path:${CLIP};box-shadow:inset 0 -3px 0 var(--accent);color:#fff;font-family:var(--f-hud)}
#award.in{transform:translate(-50%,0);opacity:1}
#award .medal{flex:none;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff8,var(--tc) 55%);box-shadow:0 0 12px var(--tc)}
#award img.pic{flex:none;width:48px;height:48px;margin:-6px 0;object-fit:contain;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
#award b{display:block;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}
#award span{font-size:19px;font-weight:700;line-height:1.1}
#award small{display:block;font-size:13px;color:#c8d4dc;font-weight:500}
#feed div.in,#feed div.out{border-right:3px solid var(--ok)}
#feed div.out{border-right-color:var(--muted)}
#sysnotes{position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;align-items:center;gap:6px;width:max-content;max-width:min(92vw,640px);pointer-events:none}
.sysnote{position:relative;display:flex;gap:1ch;align-items:baseline;padding:5px 34px 5px 10px;background:#000;color:#fff;border-left:4px solid #0ff;
  font:19px/1.15 VT323,ui-monospace,Menlo,Consolas,monospace;white-space:pre-line;text-align:left;pointer-events:auto;box-shadow:0 0 0 2px #000,0 6px 18px rgba(0,0,0,.55)}
.sysnote .sn-tag{flex:none;color:#ff0}
.sysnote.warn{background:#ff0;color:#000;border-left-color:#000}.sysnote.warn .sn-tag{color:#00f}
.sysnote.alert{background:#f00;color:#fff;border-left-color:#fff}.sysnote.alert .sn-tag{color:#ff0}
.sysnote.tap{cursor:pointer}
.sysnote button{position:absolute;right:4px;top:3px;width:24px;height:22px;padding:0;border:0;border-radius:0;background:#f00;color:#fff;font:inherit;line-height:1;cursor:pointer;box-shadow:none}
.sysnote.alert button{background:#000}`);

// ---- holding back ----------------------------------------------------------------------------------

const holds = new Map<string, () => boolean>();
/** Guidance and news wait while fn says so (a title card, a race's countdown); a second fn under the
 *  same name takes the place of the first (a new game on the same page). */
export function noticeHold(name: string, fn: () => boolean) { holds.set(name, fn); }
const mapOpen = () => { const m = document.getElementById("bigmap"); return !!m && !m.hidden; };
const held = () => {
  if (mapOpen()) return true;
  for (const f of holds.values()) if (f()) return true;
  return false;
};

// ---- guidance and news: a queue each -----------------------------------------------------------------

interface Item { text: string; sub: string; secs: number }

class Line {
  private queue: Item[] = [];
  current: Item | null = null;
  private shownAt = 0; private endT = 0; private pumpT = 0;
  constructor(private draw: (it: Item) => void, private hide: () => void) {}

  put(it: Item) {
    if (!it.text) return;
    const c = this.current;
    if (c && c.text === it.text && c.sub === it.sub && !held()) {
      c.secs = (performance.now() - this.shownAt) / 1000 + it.secs;
      clearTimeout(this.endT); this.endT = window.setTimeout(() => this.finish(), it.secs * 1000);
      return;
    }
    const same = this.queue.findIndex((q) => q.text === it.text && q.sub === it.sub);
    if (same >= 0) this.queue.splice(same, 1);
    this.queue.push(it);
    while (this.queue.length > MAX_QUEUE) this.queue.shift();
    this.pump();
  }

  clear() {
    this.queue.length = 0; clearTimeout(this.pumpT); clearTimeout(this.endT); this.current = null; this.hide();
  }

  private finish() {
    clearTimeout(this.endT);
    this.current = null;
    this.hide();
    this.pump();
  }

  private pump() {
    clearTimeout(this.pumpT);
    if (held()) {
      if (this.current) {
        const left = this.current.secs - (performance.now() - this.shownAt) / 1000;
        this.queue.unshift({ ...this.current, secs: Math.max(1.5, left) });
        this.current = null; clearTimeout(this.endT); this.hide();
      }
      if (this.queue.length) this.pumpT = window.setTimeout(() => this.pump(), 250);
      return;
    }
    if (!this.queue.length) return;
    if (this.current) {
      const up = (performance.now() - this.shownAt) / 1000;
      if (up < MIN_UP) { this.pumpT = window.setTimeout(() => this.pump(), (MIN_UP - up) * 1000); return; }
    }
    const it = this.queue.shift()!;
    this.current = it; this.shownAt = performance.now();
    this.draw(it);
    clearTimeout(this.endT);
    this.endT = window.setTimeout(() => this.finish(), it.secs * 1000);
  }
}

const item = (o: Message | string): Item => {
  const m: Message = typeof o === "string" ? { text: o } : o;
  return { text: m.text, sub: m.sub ?? "", secs: readSecs(m.text + (m.sub ?? ""), 2, 6) };
};
/** {use} and the like as the key's name, or the pad's button while a pad's in use. */
const words = (t: string) => padText(ctlText(t));

const newsLine = new Line((it) => {
  const el = document.getElementById("toast");
  if (!el) return;
  el.className = it.text.length > LONG ? "plate note" : "plate";
  el.textContent = it.text;
  if (it.sub) { const s = document.createElement("small"); s.textContent = it.sub; el.appendChild(s); }
  void el.offsetWidth;
  el.classList.add("show");
}, () => document.getElementById("toast")?.classList.remove("show"));

let guideEl: HTMLDivElement | null = null;
const guideLine = new Line((it) => {
  if (!guideEl || !guideEl.isConnected) {
    guideEl = document.createElement("div");
    guideEl.id = "guide";
    guideEl.setAttribute("aria-live", "polite");
    layer().appendChild(guideEl);
  }
  // key caps as the use prompt draws them, on words escaped first so a name can't be taken for html
  guideEl.innerHTML = keycaps(esc(it.text)) + (it.sub ? `<small>${esc(words(it.sub))}</small>` : "");
  void guideEl.offsetWidth;
  guideEl.classList.add("show");
  const extra = Math.max(0, guideEl.offsetHeight - 28);
  document.getElementById("hud")?.style.setProperty("--guide-h", `${extra}px`);
}, () => guideEl?.classList.remove("show"));

/** News: something that just happened (see the top of this file). */
export function news(o: Message | string) {
  const it = item(o);
  it.text = words(it.text); it.sub = words(it.sub);
  newsLine.put(it);
}

/** Guidance: what to do now (see the top of this file). */
export function guide(o: Message | string) { guideLine.put(item(o)); }

/** A line of guidance or news is on the screen now. */
export const noticeUp = () => !!newsLine.current || !!guideLine.current;

/** Clear every message, shown or waiting (a new game on the same page). */
export function noticeClear() {
  newsLine.clear(); guideLine.clear();
  rewards.length = 0; clearTimeout(rewardT); rewarding = false; rewardEl?.classList.remove("in");
  clearTimeout(scoreT); scoreEl?.classList.add("out");
}

// ---- score pops --------------------------------------------------------------------------------------

let scoreEl: HTMLDivElement | null = null, scoreT = 0;
let scoreHome: ((el: HTMLElement) => void) | null = null;
/** missionscreens.ts: the meter slot, where score pops come under the combo row. */
export function noticeTricksTo(fn: (el: HTMLElement) => void) { scoreHome = fn; }

/** Score: a pop as you play (see the top of this file). */
export function score(o: ScorePop | string) {
  const n: ScorePop = typeof o === "string" ? { text: o } : o;
  if (!scoreEl) { scoreEl = document.createElement("div"); scoreEl.id = "trick"; }
  if (scoreHome) scoreHome(scoreEl);
  else if (!scoreEl.isConnected) layer().appendChild(scoreEl);
  const el = scoreEl;
  el.textContent = n.text;
  if (n.sub) { const s = document.createElement("small"); s.textContent = n.sub; el.appendChild(s); }
  el.classList.toggle("final", !!n.final);
  el.classList.remove("out");
  pop(el);
  clearTimeout(scoreT);
  scoreT = window.setTimeout(() => el.classList.add("out"), readSecs(n.text, 0.9, 2.5, 1 / 25, 0.7) * 1000);
}

// ---- rewards -----------------------------------------------------------------------------------------

const rewards: Reward[] = [];
let rewardEl: HTMLDivElement | null = null, rewarding = false, rewardT = 0;
let onCard: ((text: string, pic?: Reward["pic"]) => boolean) | null = null;
/** missionscreens.ts: write a reward on the result card while one is up, instead of sliding it in. */
export function noticeAwardsTo(fn: (text: string, pic?: Reward["pic"]) => boolean) { onCard = fn; }

/** Rewards: something you keep (see the top of this file). */
export function reward(n: Reward) {
  if (onCard?.(n.kicker ? `${n.kicker}: ${n.text}` : n.text, n.pic)) return;
  rewards.push(n);
  if (!rewarding) nextReward();
}

/** Show pic in place of the medal in el once it's drawn; the medal stays if it can't be. */
export function rewardPic(el: HTMLElement, pic: Reward["pic"]) {
  if (!pic) return;
  void Promise.resolve(pic).then((url) => {
    const medal = el.querySelector(".medal");
    if (!url || !medal) return;
    const img = document.createElement("img");
    img.className = "pic"; img.alt = ""; img.src = url;
    medal.replaceWith(img);
  }, () => { /* no picture: the medal stays */ });
}

function nextReward() {
  const n = rewards.shift();
  if (!n) { rewarding = false; return; }
  rewarding = true;
  if (!rewardEl || !rewardEl.isConnected) {
    rewardEl = document.createElement("div");
    rewardEl.id = "award";
    rewardEl.setAttribute("aria-live", "polite");
    layer().appendChild(rewardEl);
  }
  const el = rewardEl;
  el.style.setProperty("--tc", n.grade ? GRADE[n.grade] : "var(--accent)");
  el.innerHTML = `<i class="medal"></i><div><b></b><span></span><small></small></div>`;
  el.querySelector("b")!.textContent = n.kicker ?? "";
  el.querySelector("span")!.textContent = n.text;
  el.querySelector("small")!.textContent = n.sub ?? "";
  rewardPic(el, n.pic);
  void el.offsetWidth;
  el.classList.add("in");
  rewardT = window.setTimeout(() => { el.classList.remove("in"); rewardT = window.setTimeout(nextReward, 500); }, REWARD_SECS * linger * 1000);
}

// ---- people ------------------------------------------------------------------------------------------

/** A name in a line of the feed (a player, a pub, a job), in its own colour if it has one. Every
 *  name in the feed is drawn by this, so they all look alike. */
export function named(text: string, colour?: string) {
  return colour ? `<b style="color:${esc(colour)}">${esc(text)}</b>` : `<b>${esc(text)}</b>`;
}

/** People: who did what, who joined or left, as a line of the feed, its names drawn by named().
 *  door: someone came in or went out, with the edge to say which. */
export function people(html: string, door?: "in" | "out") {
  const f = document.getElementById("feed");
  if (!f) return;
  const el = document.createElement("div");
  el.innerHTML = html;
  if (door) el.className = door;
  f.prepend(el);
  while (f.children.length > PEOPLE_ROWS) f.lastChild!.remove();
  setTimeout(() => el.remove(), (door ? PEOPLE_DOOR_SECS : PEOPLE_SECS) * linger * 1000);
}

// ---- the game about itself -------------------------------------------------------------------------------

export interface SystemNote {
  text: string;
  /** info (white on black), warn (black on yellow: don't miss it), alert (white on red). */
  tone?: "info" | "warn" | "alert";
  /** A × to put it away. */
  close?: () => void;
  /** What a tap on it does (refresh the page). */
  tap?: () => void;
}

const sysRows = new Map<string, HTMLDivElement>();
/** Put up the game's note about itself of this kind (a strip along the top), or take it down with null. */
export function systemNote(key: string, o: SystemNote | null) {
  let row = sysRows.get(key);
  if (!o) { row?.remove(); sysRows.delete(key); return; }
  let box = document.getElementById("sysnotes");
  if (!box) { box = document.createElement("div"); box.id = "sysnotes"; box.setAttribute("role", "status"); document.body.appendChild(box); }
  if (!row || !row.isConnected) {
    row = document.createElement("div");
    row.innerHTML = `<span class="sn-tag">BathText</span><span class="sn-text"></span>`;
    sysRows.set(key, row);
    box.appendChild(row);
  }
  row.className = `sysnote ${o.tone ?? "info"}${o.tap ? " tap" : ""}`;
  const t = row.querySelector(".sn-text")!;
  if (t.textContent !== o.text) t.textContent = o.text;
  row.onclick = o.tap ? () => o.tap!() : null;
  let x = row.querySelector("button");
  if (o.close && !x) { x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.setAttribute("aria-label", "Close"); row.appendChild(x); }
  if (!o.close) x?.remove();
  else x!.onclick = (e) => { e.stopPropagation(); systemNote(key, null); o.close!(); };
}
