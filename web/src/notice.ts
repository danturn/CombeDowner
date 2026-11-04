// The game's notices: every line it puts up for a moment to tell you something, in one family with
// one look, so a pickup, a kill, a job's stage and a trophy read as the same game. They are all the
// HUD's plate (the dark panel with its clipped corners, in the HUD's font, with an edge along the
// bottom in the colour it's given), told apart only by size and place. Which tier to use:
//
//   call   News: something just happened to you or because of you (a kill, a pickup, a ride, a
//          fare, a town arrived in), or something worth knowing (a tip, the examiner's remark, a
//          critic's aside). A plate a little above the middle (#toast, Game.toast): big for a few
//          words, smaller and wrapped for anything longer. Asking for the "note" tier, or writing
//          more than LONG characters, gets the smaller one.
//   stage  A mission moving on: a wave, a checkpoint, a life gone, he got away, out of lives. A
//          wider plate over the crosshair, edged in the mission's colour (missionscreens.ts
//          missionCall).
//   trick  A score popping as you play (a flag shot, a boost): the same font and colour but no
//          plate, light and quick, in the meter slot under the crosshair (under the combo row),
//          never held back, each one replacing the last.
//   award  Something kept: a trophy, a new thing in your wardrobe. The plate with its medal, sliding
//          in at the top one at a time; while a mission's result card is up it is written on the
//          card instead.
//   system The game telling you about itself, not about Bath: the map stuck loading, someone on
//          another version, safe graphics after a crash. A thin BathText strip along the top
//          (systemNote), one per kind, that stays until it's put right or closed.
//
// Calls share one queue, short and long alike: nothing is lost. A new one waits until the one
// showing has been up long enough to read its first words, then takes its place; the same words
// again just keep it up. While a title card, a race's countdown or anything else asks for quiet
// (noticeHold), they wait, and come one after another once it's over; so do they while the big
// map is open.
//
// All drawn on this screen only, from what the game already knows: nothing goes over the network.
import { addStyle, layer } from "./hudkit";
import { pop } from "./pop";

export type Tier = "call" | "note" | "stage" | "trick" | "award";
export interface Notice {
  tier?: Tier;
  /** Plain text: names can't be taken for html. */
  text: string;
  /** A second, smaller line. */
  sub?: string;
  /** A small line above it (an award's kind). */
  kicker?: string;
  secs?: number;
  /** The plate's edge (a trick's words): the HUD's yellow if not given. */
  colour?: string;
}

const MIN_UP = 0.9;      // seconds a call is up before a newer one may take its place
const CLIP = "polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))";
const MAX_QUEUE = 5;
const LONG = 64;
const AWARD_SECS = 3.6;

addStyle("notice", `
#toast.plate{width:max-content;max-width:min(520px,calc(100vw - 32px));box-sizing:border-box;padding:8px 18px 12px;background:var(--panel);clip-path:${CLIP};
  box-shadow:inset 0 -3px 0 var(--kc,var(--accent));color:#fff;font:800 26px/1.1 var(--f-hud);letter-spacing:.02em;text-transform:none;-webkit-text-stroke:0;text-shadow:none}
#toast.plate.note{max-width:min(560px,calc(100vw - 32px));padding:6px 14px 10px;font-size:18px;font-weight:600;line-height:1.2}
#toast.plate small{display:block;font-size:.66em;font-weight:600;color:#c8d4dc;margin-top:2px}
@media (max-width:700px),(max-height:500px){#toast.plate{font-size:21px}#toast.plate.note{font-size:16px}}
#trick{position:absolute;left:50%;top:calc(50% + 150px);transform:translateX(-50%);text-align:center;max-width:calc(100vw - 32px);pointer-events:none;font:800 26px/1.1 var(--f-hud);letter-spacing:.04em;
  color:var(--accent);text-shadow:0 2px 0 rgba(0,0,0,.6),0 0 12px rgba(0,0,0,.5);transition:opacity .3s}
#trick.out{opacity:0}
#maux>#trick{position:static;transform:none;width:auto}
body:has(#bigmap:not([hidden])) #trick{visibility:hidden}
#trick small{display:block;font-size:14px;color:#fff;letter-spacing:.06em;text-transform:uppercase}
@media (max-height:500px){#trick{top:calc(50% + 96px);font-size:20px}}
#award{position:absolute;left:50%;top:10px;z-index:12;transform:translate(-50%,-140%);transition:transform .45s cubic-bezier(.2,1.3,.4,1),opacity .4s;opacity:0;
  pointer-events:none;display:flex;align-items:center;gap:10px;padding:8px 18px 11px 10px;max-width:calc(100vw - 24px);box-sizing:border-box;
  background:var(--panel);clip-path:${CLIP};box-shadow:inset 0 -3px 0 var(--tc,var(--accent));color:#fff;font-family:var(--f-hud)}
#award.in{transform:translate(-50%,0);opacity:1}
#award .medal{flex:none;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff8,var(--tc) 55%);box-shadow:0 0 12px var(--tc)}
#award b{display:block;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--tc)}
#award span{font-size:19px;font-weight:700;line-height:1.1}
#award small{display:block;font-size:13px;color:#c8d4dc;font-weight:500}
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
/** Calls and notes wait while fn says so (a title card, a race's countdown); a second fn under the
 *  same name takes the place of the first (a new game on the same page). */
export function noticeHold(name: string, fn: () => boolean) { holds.set(name, fn); }
const mapOpen = () => { const m = document.getElementById("bigmap"); return !!m && !m.hidden; };
const held = () => {
  if (mapOpen()) return true;
  for (const f of holds.values()) if (f()) return true;
  return false;
};

// ---- calls and notes -------------------------------------------------------------------------------

interface Item { tier: "call" | "note"; text: string; sub: string; secs: number; colour: string }
const queue: Item[] = [];
let current: Item | null = null, shownAt = 0, endT = 0, pumpT = 0;
const box = () => document.getElementById("toast");

function render(it: Item) {
  const el = box();
  if (!el) return;
  el.className = it.tier === "note" ? "plate note" : "plate";
  el.style.setProperty("--kc", it.colour || "var(--accent)");
  el.textContent = it.text;
  if (it.sub) { const s = document.createElement("small"); s.textContent = it.sub; el.appendChild(s); }
  void el.offsetWidth;
  el.classList.add("show");
}

function hide() { box()?.classList.remove("show"); }

function finish() {
  clearTimeout(endT);
  current = null;
  hide();
  pump();
}

function pump() {
  clearTimeout(pumpT);
  if (held()) {
    if (current) {
      const left = current.secs - (performance.now() - shownAt) / 1000;
      queue.unshift({ ...current, secs: Math.max(1.5, left) });
      current = null; clearTimeout(endT); hide();
    }
    if (queue.length) pumpT = window.setTimeout(pump, 250);
    return;
  }
  if (!queue.length) return;
  if (current) {
    const up = (performance.now() - shownAt) / 1000;
    if (up < MIN_UP) { pumpT = window.setTimeout(pump, (MIN_UP - up) * 1000); return; }
  }
  const it = queue.shift()!;
  current = it; shownAt = performance.now();
  render(it);
  clearTimeout(endT);
  endT = window.setTimeout(finish, it.secs * 1000);
}

/** Put a notice up (see the tiers at the top of this file). */
export function notice(o: Notice | string, secs?: number) {
  const n: Notice = typeof o === "string" ? { text: o, secs } : o;
  const tier = n.tier ?? "call";
  if (tier === "award") { award(n); return; }
  if (tier === "trick") { trick(n); return; }
  if (tier === "stage") { stageCall?.(n); return; }
  const it: Item = { tier: tier === "call" && n.text.length > LONG ? "note" : tier, text: n.text, sub: n.sub ?? "", secs: n.secs ?? 2, colour: n.colour ?? "" };
  if (!it.text) return;
  if (current && current.text === it.text && current.sub === it.sub && !held()) {
    current.secs = (performance.now() - shownAt) / 1000 + it.secs;
    clearTimeout(endT); endT = window.setTimeout(finish, it.secs * 1000);
    return;
  }
  const same = queue.findIndex((q) => q.text === it.text && q.sub === it.sub);
  if (same >= 0) queue.splice(same, 1);
  queue.push(it);
  while (queue.length > MAX_QUEUE) queue.shift();
  pump();
}

/** A call or a note is on the screen now. */
export const noticeUp = () => !!current;

/** Clear every call, note, award and trick, shown or waiting (a new game on the same page). */
export function noticeClear() {
  queue.length = 0; clearTimeout(pumpT); clearTimeout(endT); current = null; hide();
  awards.length = 0; clearTimeout(awardT); awarding = false; awardEl?.classList.remove("in");
  clearTimeout(trickT); trickEl?.classList.add("out");
}

// ---- stage calls are missionscreens.ts's, in the band over the crosshair ---------------------------

let stageCall: ((n: Notice) => void) | null = null;
/** missionscreens.ts: draw the stage tier. */
export function noticeStage(fn: (n: Notice) => void) { stageCall = fn; }

// ---- tricks ----------------------------------------------------------------------------------------

let trickEl: HTMLDivElement | null = null, trickT = 0;
let trickHome: ((el: HTMLElement) => void) | null = null;
/** missionscreens.ts: the meter slot, where tricks pop under the combo row. */
export function noticeTricksTo(fn: (el: HTMLElement) => void) { trickHome = fn; }
function trick(n: Notice) {
  if (!trickEl) { trickEl = document.createElement("div"); trickEl.id = "trick"; }
  if (trickHome) trickHome(trickEl);
  else if (!trickEl.isConnected) layer().appendChild(trickEl);
  const el = trickEl;
  el.textContent = n.text;
  if (n.sub) { const s = document.createElement("small"); s.textContent = n.sub; el.appendChild(s); }
  el.style.color = n.colour ?? "";
  el.classList.remove("out");
  pop(el);
  clearTimeout(trickT);
  trickT = window.setTimeout(() => el.classList.add("out"), (n.secs ?? 1.4) * 1000);
}

// ---- awards ----------------------------------------------------------------------------------------

const awards: Notice[] = [];
let awardEl: HTMLDivElement | null = null, awarding = false, awardT = 0;
let onCard: ((text: string) => boolean) | null = null;
/** missionscreens.ts: write an award on the result card while one is up, instead of sliding it in. */
export function noticeAwardsTo(fn: (text: string) => boolean) { onCard = fn; }

function award(n: Notice) {
  if (onCard?.(n.kicker ? `${n.kicker}: ${n.text}` : n.text)) return;
  awards.push(n);
  if (!awarding) nextAward();
}

function nextAward() {
  const n = awards.shift();
  if (!n) { awarding = false; return; }
  awarding = true;
  if (!awardEl || !awardEl.isConnected) {
    awardEl = document.createElement("div");
    awardEl.id = "award";
    awardEl.setAttribute("aria-live", "polite");
    layer().appendChild(awardEl);
  }
  const el = awardEl;
  el.style.setProperty("--tc", n.colour ?? "var(--accent)");
  el.innerHTML = `<i class="medal"></i><div><b></b><span></span><small></small></div>`;
  el.querySelector("b")!.textContent = n.kicker ?? "";
  el.querySelector("span")!.textContent = n.text;
  el.querySelector("small")!.textContent = n.sub ?? "";
  void el.offsetWidth;
  el.classList.add("in");
  awardT = window.setTimeout(() => { el.classList.remove("in"); awardT = window.setTimeout(nextAward, 500); }, (n.secs ?? AWARD_SECS) * 1000);
}

// ---- the system tier -------------------------------------------------------------------------------

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
