// The game's notices: every line it puts up for a moment to tell you something, in one family with
// one look, so a pickup, a kill, a job's stage and a trophy read as the same game. Which tier to use:
//
//   call   Something just happened to you or because of you: a kill, a pickup, a ride, a fare, a
//          town arrived in. The big yellow line a little above the middle (#toast). Game.toast.
//   note   Something worth knowing that isn't news: a tip, the examiner's remark, a critic's aside.
//          The same place as a call, smaller and white, so the two queue together.
//   stage  A mission moving on: a wave, a checkpoint, a life gone, he got away, out of lives. The
//          band over the crosshair in the mission's colour (missionscreens.ts missionCall).
//   trick  A score popping as you play (a combo, a flag shot, a boost): at the right, by the
//          combo meter, never held back, each one replacing the last.
//   award  Something kept: a trophy, a new thing in your wardrobe. Slides in at the top, one at a
//          time; while a mission's result card is up it is written on the card instead.
//
// A call is a few words: one longer than LONG characters is put up as a note, so it wraps small
// rather than shouting across the screen. Calls and notes share one queue: nothing is lost. A new one waits until the one showing has been
// up long enough to read its first words, then takes its place; the same words again just keep
// it up. While a title card, a race's countdown or anything else asks for quiet (noticeHold), they
// wait, and come one after another once it's over; so do they while the big map is open.
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
  colour?: string;
}

const MIN_UP = 0.9;      // seconds a call is up before a newer one may take its place
const MAX_QUEUE = 5;
const LONG = 64;
const AWARD_SECS = 3.6;

addStyle("notice", `
#toast.note{font-size:21px;font-weight:700;text-transform:none;letter-spacing:.02em;color:#fff;-webkit-text-stroke:0;width:max-content;max-width:min(640px,calc(100vw - 32px));line-height:1.2}
#toast small{display:block;font-size:.6em;font-weight:700;letter-spacing:.04em;color:#fff;-webkit-text-stroke:0;margin-top:2px}
#trick{position:absolute;right:18px;top:34%;text-align:right;max-width:40vw;pointer-events:none;font-weight:800;font-size:26px;letter-spacing:.04em;
  color:var(--accent);text-shadow:0 2px 0 rgba(0,0,0,.6),0 0 12px rgba(0,0,0,.5);transition:opacity .3s}
#trick.out{opacity:0}
body:has(#bigmap:not([hidden])) #trick{visibility:hidden}
#trick small{display:block;font-size:14px;color:#fff;letter-spacing:.06em;text-transform:uppercase}
#award{position:absolute;left:50%;top:10px;z-index:12;transform:translate(-50%,-140%);transition:transform .45s cubic-bezier(.2,1.3,.4,1),opacity .4s;opacity:0;
  pointer-events:none;display:flex;align-items:center;gap:10px;padding:8px 16px 8px 10px;max-width:calc(100vw - 24px);box-sizing:border-box;
  background:var(--panel);border:2px solid var(--tc,var(--accent));box-shadow:0 6px 20px rgba(0,0,0,.5);color:#fff}
#award.in{transform:translate(-50%,0);opacity:1}
#award .medal{flex:none;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff8,var(--tc) 55%);box-shadow:0 0 12px var(--tc)}
#award b{display:block;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--tc)}
#award span{font-size:17px;font-weight:700;line-height:1.1}
#award small{display:block;font-size:12px;color:#c8d4dc;font-weight:500}`);

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
  el.className = it.tier === "note" ? "note" : "";
  el.style.color = it.colour;
  el.textContent = it.text;
  if (it.sub) { const s = document.createElement("small"); s.textContent = it.sub; el.appendChild(s); }
  if (it.tier === "call") pop(el);
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

/** Clear every call and note, shown or waiting (a new game on the same page). */
export function noticeClear() {
  queue.length = 0; clearTimeout(pumpT); clearTimeout(endT); current = null; hide();
}

// ---- stage calls are missionscreens.ts's, in the band over the crosshair ---------------------------

let stageCall: ((n: Notice) => void) | null = null;
/** missionscreens.ts: draw the stage tier. */
export function noticeStage(fn: (n: Notice) => void) { stageCall = fn; }

// ---- tricks ----------------------------------------------------------------------------------------

let trickEl: HTMLDivElement | null = null, trickT = 0;
function trick(n: Notice) {
  if (!trickEl || !trickEl.isConnected) { trickEl = document.createElement("div"); trickEl.id = "trick"; layer().appendChild(trickEl); }
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
let awardEl: HTMLDivElement | null = null, awarding = false;
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
  setTimeout(() => { el.classList.remove("in"); setTimeout(nextAward, 500); }, (n.secs ?? AWARD_SECS) * 1000);
}
