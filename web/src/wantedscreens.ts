// A Wanted poster's own screens, in the race screens' look (racescreens.ts) and the poster's red, the
// splash and the poster as cuttings from the Chronicle's police notices (cutting.ts): the splash when
// the bounty starts (his name, his round of stops, the goes you have left, the clock, and how to
// catch him), the same poster brought back on the job control, and the call-out across the middle
// when he gets away. The end is the race results card (racescreens.ts summary). The splash waits for
// you to read it, with a × to put it away (Esc too), and the mouse let go while it's up (modal.ts).
//
// The pictures are drawn here as little SVGs, so there's nothing to load. Nothing here goes over the
// network: wanted.ts says what to show from what it already knows.
import { ctlText } from "./controls";
import { missionCardDrop } from "./missionscreens";
import { modal } from "./modal";
import { style as raceStyle } from "./racescreens";
import { cutFlag, tearOff } from "./cutting";

export const RED = "#e04848";

let styled = false;
function style() {
  raceStyle();
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `
.wsc{--rc:${RED};transition:opacity .6s}
.wsc.out{opacity:0}
.wsc .band{animation:wsc-in .45s cubic-bezier(.2,1.5,.4,1) both}
.rsc.wsc .band.cut{background:none;box-shadow:none;text-align:left;padding:16px 24px 18px;animation:cut-in .4s ease-out both}
.rsc.wsc .cut b{color:var(--ink)}
.wsc-splash{top:7%}
.wsc-splash .band{width:min(840px,96vw);padding:12px 18px 14px}
.wsc-card{top:6%}
.wsc-card .band{width:min(720px,96vw)}
.wsc-call{top:27%}
.wsc-call .head{color:#ffd84a;animation:wsc-pulse .5s ease-in-out 3 alternate}
.wsc .cut .small{color:var(--muted);font-style:italic;font-weight:400}
.wsc .cut .small b{color:var(--ink)}
.wsc .paper{box-sizing:border-box;margin:12px 0 10px;border:1px dashed var(--ink);color:var(--ink);font-size:clamp(14px,2.6vmin,19px);padding:6px 14px 10px}
.wsc .wanted{font:900 clamp(30px,7vmin,58px)/.9 'Barlow Condensed',Impact,sans-serif;letter-spacing:.14em;color:#8a1a14;text-align:center}
.wsc .who{font:800 clamp(18px,3.8vmin,30px)/1.05 'Barlow Condensed',Impact,sans-serif;text-align:center;color:#1b1b1d;margin:2px 0 6px}
.wsc .h{display:block;font:700 clamp(11px,1.9vmin,14px) 'Barlow Condensed',Impact,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#7a2a12;margin:4px 0 2px;text-align:center}
.wsc .route{display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap;font:700 clamp(12px,2.2vmin,16px)/1.1 'Barlow Condensed',Impact,sans-serif;color:#1b1b1d}
.wsc .stop{display:flex;flex-direction:column;align-items:center;width:clamp(48px,9vmin,70px);text-align:center}
.wsc .stop svg{width:clamp(30px,6vmin,44px);height:clamp(30px,6vmin,44px)}
.wsc .stop.now{color:#8a1a14}
.wsc .stop.now svg{filter:drop-shadow(0 0 4px ${RED})}
.wsc .arrow{font-size:1.3em;color:#7a2a12}
.wsc .goes{font:800 clamp(14px,2.6vmin,19px)/1.1 'Barlow Condensed',Impact,sans-serif;letter-spacing:.08em;color:#1b1b1d;margin-top:6px;text-align:center}
.wsc .goes b{color:#8a1a14;letter-spacing:.2em}
.wsc ul{list-style:none;margin:0;padding:0;text-align:left;color:var(--ink);font-weight:400;font-size:clamp(13px,2.4vmin,16px);line-height:1.3}
.wsc li{padding-left:1.1em;text-indent:-1.1em;break-inside:avoid}
.wsc li::before{content:'\\2013  ';color:var(--muted)}
.wsc .again{color:var(--ink);font-style:italic;font-size:14px;margin-top:8px}
.wsc .clock{font-weight:700;font-size:clamp(15px,3vmin,20px);color:var(--ink,#ffd84a)}
@media (max-height:520px){.wsc-splash{top:2%}.wsc .wanted{font-size:28px}.wsc .who{font-size:17px;margin:0 0 2px}.wsc .paper{margin:4px 0 2px;padding:4px 10px 6px}
  .wsc .stop svg{width:28px;height:28px}.wsc ul{font-size:11.5px;line-height:1.2}.wsc .again{font-size:13px;margin-top:2px}.wsc-splash .clock{font-size:13px}}
@keyframes wsc-in{from{transform:scale(1.6);opacity:0}to{transform:none;opacity:1}}
@keyframes wsc-pulse{to{transform:scale(1.06)}}`;
  document.head.appendChild(s);
}

const layer = () => document.getElementById("hud") ?? document.body;

function box(cls: string): HTMLDivElement {
  style();
  const e = document.createElement("div");
  e.className = `rsc wsc ${cls}`;
  e.hidden = true;
  layer().appendChild(e);
  return e;
}

const written = new WeakMap<HTMLElement, string>();
/** Write a box, only when its words change: written afresh it would play its entrance again. */
function put(e: HTMLElement, html: string) {
  html = ctlText(html);
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

const svg = (body: string) => `<svg viewBox="0 0 40 40" aria-hidden="true">${body}</svg>`;

const STOP_ART: Record<string, string> = {
  pub: `<path d="M12 9 H28 L26 35 H14Z" fill="#c98a1e" stroke="#1b1b1d" stroke-width="1.6"/><path d="M12 9 H28 L27.4 15 H12.6Z" fill="#fff"/><path d="M28 14 Q34 14 34 20 Q34 26 27 26" stroke="#1b1b1d" stroke-width="2.2" fill="none"/>`,
  park: `<circle cx="20" cy="15" r="10" fill="#3f8a3a" stroke="#1b1b1d" stroke-width="1.4"/><rect x="18" y="22" width="4" height="13" fill="#6b4423"/><path d="M6 35 H34" stroke="#1b1b1d" stroke-width="2"/>`,
  bus: `<rect x="7" y="5" width="26" height="28" rx="4" fill="#c0221a" stroke="#1b1b1d" stroke-width="1.6"/><rect x="10" y="9" width="20" height="10" fill="#cfe6f4"/><circle cx="13" cy="27" r="2" fill="#ffd84a"/><circle cx="27" cy="27" r="2" fill="#ffd84a"/><path d="M11 33 V37 M29 33 V37" stroke="#1b1b1d" stroke-width="3"/>`,
};

export interface PosterInfo {
  title: string;
  /** His round of stops: what each is, and whether it's the one he's at. */
  stops: { label: string; kind: "pub" | "park" | "bus"; now: boolean }[];
  goes: { left: number; of: number };
}

function posterHtml(o: PosterInfo) {
  const route = o.stops.map((s) => `<div class="stop${s.now ? " now" : ""}">${svg(STOP_ART[s.kind])}${esc(s.label.replace(/^an? /, ""))}</div>`).join(`<span class="arrow">→</span>`);
  return `<div class="paper"><div class="wanted">WANTED</div><div class="who">${esc(o.title)}</div>`
    + `<span class="h">His round</span><div class="route">${route}<span class="arrow">↺</span></div>`
    + `<div class="goes">Goes left <b>${"●".repeat(o.goes.left)}${"○".repeat(Math.max(0, o.goes.of - o.goes.left))}</b></div></div>`;
}

// ---- the splash, and the poster again ----------------------------------------------------------------

let splashEl: HTMLDivElement | null = null;
const splashT = { t: 0 };

/** The big card as the bounty starts; it goes by itself after secs, or on its ×. Null takes it down now. */
export function wantedSplash(o: (PosterInfo & { clock: string; rules: string[]; again: string }) | null, secs = 18) {
  if (!o) { clearTimeout(splashT.t); if (splashEl) splashEl.hidden = true; return; }
  missionCardDrop();
  splashEl ??= box("wsc-splash");
  tearOff(splashEl);
  put(splashEl, `<div class="band cut">${cutFlag("Wanted · a bounty")}<div class="clock">${o.clock}</div>${posterHtml(o)}`
    + `<ul>${o.rules.map((r) => `<li>${r}</li>`).join("")}</ul><div class="again">${o.again}</div></div>`);
  const el = splashEl;
  modal(el, () => el.querySelector<HTMLElement>(".band") ?? el, () => wantedSplash(null));
  fadeAfter(splashEl, secs, splashT);
}
const splashUp = () => !!splashEl && !splashEl.hidden && !splashEl.classList.contains("out");

let cardEl: HTMLDivElement | null = null;

/** The poster again, as it stands now, while it's asked for; null takes it down. */
export function wantedPoster(o: (PosterInfo & { foot: string }) | null) {
  if (!o) { if (cardEl && !cardEl.hidden) cardEl.hidden = true; return; }
  if (splashUp()) wantedSplash(null);
  cardEl ??= box("wsc-card");
  tearOff(cardEl);
  put(cardEl, `<div class="band cut">${cutFlag("Wanted")}${posterHtml(o)}${o.foot ? `<div class="small">${o.foot}</div>` : ""}</div>`);
}

// ---- he's got away -----------------------------------------------------------------------------------

let callEl: HTMLDivElement | null = null;
const callT = { t: 0 };

/** A banner across the middle for a few seconds. */
export function wantedCallout(head: string, sub: string, secs = 5) {
  wantedSplash(null);
  callEl ??= box("wsc-call");
  // written afresh each time, so a second call-out punches in like the first
  written.delete(callEl);
  put(callEl, `<div class="band"><div class="head">${head}</div><div class="rsub">${sub}</div></div>`);
  fadeAfter(callEl, secs, callT);
}

/** Everything of the bounty's down (it's over). */
export function wantedScreensDown() {
  wantedSplash(null); wantedPoster(null);
  clearTimeout(callT.t);
  if (callEl) callEl.hidden = true;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
