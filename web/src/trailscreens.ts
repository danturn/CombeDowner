// A treasure trail's own screens, in the race screens' look (racescreens.ts) and the trail's gold:
// the splash when it starts (what you're after, any clock, how the search circle works, the first
// clue large, and how to see it again), the clue card that comes back on the clue key or over the
// big map, the offer when you go to ask a local (what the hint gives and what it costs, before
// anything's paid), and the call-out when a search circle draws in. Its end card is the race
// results card (racescreens.ts summary) in the trail's colour.
//
// All drawn on the page in the HUD's layer, sized by the screen, and none of it takes a click.
// Nothing here goes over the network: trail.ts says what to show from what it already knows.
import { keyLabel, padInUse } from "./gamepad";
import { missionCardDrop } from "./missionscreens";
import { style as raceStyle, touchUp } from "./racescreens";

const GOLD = "#e0a526";

let styled = false;
function style() {
  raceStyle();
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `
.tsc{--rc:${GOLD};transition:opacity .6s}
.tsc.out{opacity:0}
.tsc .band{animation:tsc-in .45s cubic-bezier(.2,1.5,.4,1) both}
.tsc-splash{top:7%}
.tsc-splash .band{width:min(840px,96vw);padding:12px 18px 14px}
.tsc .look{font-weight:700;font-size:clamp(16px,3.3vmin,26px);margin-top:6px;line-height:1.15}
.tsc .look b{color:#ffd84a}
.tsc .paper{margin:10px auto 6px;max-width:700px;box-sizing:border-box;padding:8px 16px 12px;background:#f4ecd4;color:#1b1b1d;text-shadow:none;
  border:2px solid #000;box-shadow:0 0 0 3px var(--rc),0 8px 24px #000a;font:600 clamp(18px,3.7vmin,30px)/1.25 Georgia,serif}
.tsc .paper .ctag{display:block;font:700 clamp(11px,2vmin,14px) 'Barlow Condensed',Impact,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#7a5a20;margin-bottom:3px}
.tsc .paper b{color:#7a2a12}
.tsc .paper b.clue{letter-spacing:.08em;color:#1b1b1d}
.tsc .paper img{display:block;margin:4px auto 0;max-width:min(60vw,300px);image-rendering:pixelated}
.tsc .paper i{font-size:.75em}
.tsc ul{list-style:none;margin:6px auto 0;padding:0;max-width:700px;text-align:left;font-weight:600;font-size:clamp(13px,2.5vmin,19px);line-height:1.3;color:#dde6ec}
.tsc li{padding-left:1.1em;text-indent:-1.1em}
.tsc li::before{content:'\\25B8  ';color:var(--rc)}
.tsc .again{font-weight:800;font-size:clamp(14px,2.8vmin,21px);color:#ffd84a;margin-top:6px}
.tsc .again b{color:#fff}
.tsc-card{top:6%}
.tsc-card .band{width:min(720px,96vw)}
.tsc-card .paper{font-size:clamp(16px,3.2vmin,26px)}
.tsc-card .small b{color:#ffd84a}
.tsc-call{top:27%}
.tsc-call .head{color:#ffd84a;animation:tsc-pulse .5s ease-in-out 3 alternate}
.tsc-offer{top:17%}
.tsc-offer .band{width:min(600px,94vw)}
.tsc-offer .head{font-size:clamp(24px,5vmin,40px)}
.tsc-offer .price{font-weight:800;font-size:clamp(16px,3.2vmin,24px);color:#ffd84a;margin-top:4px}
.tsc-offer .go{font-weight:800;font-size:clamp(15px,3vmin,22px);margin-top:6px}
.tsc-offer .go b{color:#fff;background:var(--rc);color:#14100a;padding:0 6px;text-shadow:none}
@media (max-height:520px){.tsc-splash{top:2%}.tsc ul{font-size:12px}.tsc .paper{margin:6px auto 4px;padding:6px 12px 8px}.tsc-offer{top:4%}}
@keyframes tsc-in{from{transform:scale(1.6);opacity:0}to{transform:none;opacity:1}}
@keyframes tsc-pulse{to{transform:scale(1.06)}}`;
  document.head.appendChild(s);
}

const layer = () => document.getElementById("hud") ?? document.body;

function box(cls: string): HTMLDivElement {
  style();
  const e = document.createElement("div");
  e.className = `rsc tsc ${cls}`;
  e.hidden = true;
  layer().appendChild(e);
  return e;
}

const written = new WeakMap<HTMLElement, string>();
/** Write a box, only when its words change: written afresh it would play its entrance again. */
function put(e: HTMLElement, html: string) {
  if (written.get(e) !== html) { written.set(e, html); e.innerHTML = html; }
  e.classList.remove("out");
  e.hidden = false;
}

/** Fade a box out after secs, unless it's put up again first. */
function fadeAfter(e: HTMLElement, secs: number, timer: { t: number }) {
  clearTimeout(timer.t);
  timer.t = window.setTimeout(() => {
    e.classList.add("out");
    timer.t = window.setTimeout(() => { e.hidden = true; }, 600);
  }, secs * 1000);
}

/** How to see the clue again, named for whatever you last played with. */
export function againText(): string {
  if (touchUp()) return "Tap <b>Clue</b> to see it again";
  if (padInUse()) return `Open the map (<b>${keyLabel("KeyM")}</b>) to see it again`;
  return "Press <b>J</b> to see it again (it's on the map, <b>M</b>, too)";
}

/** The clue on its slip of paper, with what it is over it. */
const paper = (tag: string, clue: string) => `<div class="paper"><span class="ctag">${tag}</span>${clue}</div>`;

// ---- the splash ---------------------------------------------------------------------------------------

export interface SplashInfo {
  name: string;        // the trail's title
  find: string;        // what you're after, html ("2 locked tins, then the Bath Bun chest")
  clock: string;       // the time limit, or that there isn't one (html)
  tag: string;         // over the clue ("Clue 1 of 3")
  clue: string;        // html
  rules: string[];     // html, a line each
}

let splashEl: HTMLDivElement | null = null;
const splashT = { t: 0 };

/** The big card when a trail starts; it goes by itself after secs. Null takes it down now. */
export function splash(o: SplashInfo | null, secs = 16) {
  if (!o) { clearTimeout(splashT.t); if (splashEl) splashEl.hidden = true; return; }
  missionCardDrop();   // it says all the title card would, and more
  splashEl ??= box("tsc-splash");
  put(splashEl, `<div class="band"><div class="kind">Treasure hunt</div><div class="head">${esc(o.name)}</div>`
    + `<div class="look">${o.find}</div><div class="small">${o.clock}</div>${paper(o.tag, o.clue)}`
    + `<ul>${o.rules.map((r) => `<li>${r}</li>`).join("")}</ul><div class="again">${againText()}</div></div>`);
  fadeAfter(splashEl, secs, splashT);
}
export const splashUp = () => !!splashEl && !splashEl.hidden && !splashEl.classList.contains("out");

// ---- the clue again ------------------------------------------------------------------------------------

let cardEl: HTMLDivElement | null = null;

/** The clue again, big, while it's asked for (the clue key, or over the big map); null takes it down. */
export function clueCard(o: { tag: string; clue: string; foot: string } | null) {
  if (!o) { if (cardEl && !cardEl.hidden) cardEl.hidden = true; return; }
  if (splashUp()) splash(null);
  cardEl ??= box("tsc-card");
  put(cardEl, `<div class="band">${paper(o.tag, o.clue)}${o.foot ? `<div class="small">${o.foot}</div>` : ""}</div>`);
}

// ---- asking a local ----------------------------------------------------------------------------------------

let offerEl: HTMLDivElement | null = null;

/** What asking a local would get you and cost, before you pay; null takes it down. */
export function offer(o: { head: string; get: string; price: string; go: string } | null) {
  if (!o) { if (offerEl && !offerEl.hidden) offerEl.hidden = true; return; }
  offerEl ??= box("tsc-offer");
  put(offerEl, `<div class="band"><div class="kind">Ask a local</div><div class="head">${o.head}</div><div class="rsub">${o.get}</div>`
    + `<div class="price">${o.price}</div><div class="go">${o.go}</div></div>`);
}

// ---- the circle drawing in ----------------------------------------------------------------------------------

let callEl: HTMLDivElement | null = null;
const callT = { t: 0 };

/** A banner across the middle for a few seconds: the search area's shrinking. */
export function callout(head: string, sub: string, secs = 3.5) {
  splash(null);
  callEl ??= box("tsc-call");
  // written afresh each time, so a second call-out punches in like the first
  written.delete(callEl);
  put(callEl, `<div class="band"><div class="head">${head}</div><div class="rsub">${sub}</div></div>`);
  fadeAfter(callEl, secs, callT);
}

/** Everything of the trail's down (it's over). */
export function trailScreensDown() {
  splash(null); clueCard(null); offer(null);
  clearTimeout(callT.t);
  if (callEl) callEl.hidden = true;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
