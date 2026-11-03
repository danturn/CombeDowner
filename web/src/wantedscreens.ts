// A Wanted poster's own screens, in the race screens' look (racescreens.ts) and the poster's red,
// the splash and the poster as cuttings from the Chronicle's police notices (cutting.ts): the
// splash when the bounty starts (the poster itself, with how he looks as pictures, his round of
// stops, the goes you have left, the clock, and how to catch him), the same poster brought back on
// the job control, and a call-out banner across the middle when he gets away. The end is the race
// results card (racescreens.ts summary). The splash waits for you to read it, with a ×
// to put it away (Esc too), and the mouse let go while it's up (modal.ts).
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
.wsc.wsc{--rc:${RED}}
.wsc.wsc .paper{font-size:clamp(14px,2.6vmin,19px);padding:6px 14px 10px}
.wsc.wsc .wanted{font:900 clamp(30px,7vmin,58px)/.9 'Barlow Condensed',Impact,sans-serif;letter-spacing:.14em;color:#8a1a14;text-align:center}
.wsc.wsc .who{font:800 clamp(18px,3.8vmin,30px)/1.05 'Barlow Condensed',Impact,sans-serif;text-align:center;color:#1b1b1d;margin:2px 0 4px}
.wsc.wsc .cols{display:flex;gap:14px;align-items:flex-start;justify-content:center}
.wsc.wsc .col{flex:1;min-width:0}
.wsc.wsc .h{display:block;font:700 clamp(11px,1.9vmin,14px) 'Barlow Condensed',Impact,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#7a2a12;margin:4px 0 2px;text-align:left}
.wsc.wsc .feats{display:flex;gap:6px;flex-wrap:wrap}
.wsc.wsc .feat{position:relative;width:clamp(58px,11vmin,86px);text-align:center;font:700 clamp(11px,2vmin,14px)/1.05 'Barlow Condensed',Impact,sans-serif;color:#1b1b1d}
.wsc.wsc .feat svg{display:block;width:clamp(42px,8.4vmin,64px);height:clamp(42px,8.4vmin,64px);margin:0 auto 1px;background:#fff8;border:2px solid #1b1b1d;border-radius:6px}
.wsc.wsc .goes{font:800 clamp(14px,2.6vmin,19px)/1.1 'Barlow Condensed',Impact,sans-serif;letter-spacing:.08em;color:#1b1b1d;margin-top:4px}
.wsc.wsc .goes b{color:#8a1a14;letter-spacing:.2em}
.wsc.wsc .route{display:flex;align-items:center;gap:4px;flex-wrap:wrap;font:700 clamp(12px,2.2vmin,16px)/1.1 'Barlow Condensed',Impact,sans-serif;color:#1b1b1d}
.wsc.wsc .stop{display:flex;flex-direction:column;align-items:center;width:clamp(48px,9vmin,70px);text-align:center}
.wsc.wsc .stop svg{width:clamp(30px,6vmin,44px);height:clamp(30px,6vmin,44px)}
.wsc.wsc .stop.now{color:#8a1a14}
.wsc.wsc .stop.now svg{filter:drop-shadow(0 0 4px ${RED})}
.wsc.wsc .arrow{font-size:1.3em;color:#7a2a12}
.wsc.wsc .note{font:600 clamp(12px,2.2vmin,16px)/1.2 Georgia,serif;color:#1b1b1d;text-align:left;margin-top:3px}
.wsc.wsc .note b{color:#8a1a14}
.wsc.wsc .clock{font-weight:700;font-size:clamp(15px,3vmin,20px);color:var(--ink,#ffd84a)}
@media (max-height:520px){.wsc.wsc .cols{gap:8px}.wsc.wsc .note{font-size:12px}.wsc.wsc .wanted{font-size:28px}.wsc.wsc .who{font-size:17px;margin:0 0 2px}
  .wsc.wsc .feat{width:52px}.wsc.wsc .feat svg{width:38px;height:38px}.wsc.wsc .stop svg{width:28px;height:28px}
  .wsc.wsc .note ~ .note{display:none}.wsc.wsc ul{font-size:11.5px;line-height:1.2;margin-top:3px}.wsc.wsc .again{font-size:13px;margin-top:2px}
  .wsc-splash .clock{font-size:13px}}
.wsc{transition:opacity .6s}
.wsc.out{opacity:0}
.wsc .band{animation:wsc-in .45s cubic-bezier(.2,1.5,.4,1) both}
.wsc-splash{top:7%}
.wsc-splash .band{width:min(840px,96vw);padding:12px 18px 14px}
.wsc .paper{margin:10px auto 6px;box-sizing:border-box;background:#f4ecd4;color:#1b1b1d;text-shadow:none;
  border:2px solid #000;box-shadow:0 0 0 3px var(--rc),0 8px 24px #000a;font-weight:600;font-family:Georgia,serif;line-height:1.25}
.wsc ul{list-style:none;margin:6px auto 0;padding:0;text-align:left;font-weight:600;font-size:clamp(13px,2.5vmin,19px);line-height:1.3;color:#dde6ec}
.wsc li{padding-left:1.1em;text-indent:-1.1em}
.wsc li::before{content:'\\25B8  ';color:var(--rc)}
.wsc .again{font-weight:800;font-size:clamp(14px,2.8vmin,21px);color:#ffd84a;margin-top:6px}
.wsc .again b{color:#fff}
.wsc-card{top:6%}
.wsc-card .band{width:min(720px,96vw)}
.wsc-call{top:27%}
.wsc-call .head{color:#ffd84a;animation:wsc-pulse .5s ease-in-out 3 alternate}
/* the splash and the poster as cuttings: newsprint words, and the poster in a dashed box, as a coupon */
.rsc .band.cut{background:none;box-shadow:none;text-align:left;padding:16px 24px 18px;animation:cut-in .4s ease-out both}
.wsc .cut .small{color:var(--muted);font-style:italic;font-weight:400}
.wsc .cut .small b{color:var(--ink)}
.wsc .cut .paper{max-width:none;margin:12px 0 10px;background:none;color:var(--ink);border:1px dashed var(--ink);box-shadow:none}
.wsc .cut ul{max-width:none;margin:0;color:var(--ink);font-weight:400;font-size:clamp(13px,2.4vmin,16px)}
.wsc .cut li{break-inside:avoid}
.wsc .cut .again{color:var(--ink);font-weight:400;font-style:italic;font-size:14px;margin-top:8px}
.wsc .cut .again b{color:var(--ink)}
.rsc .cut b{color:var(--ink)}
.wsc .cut li::before{content:'\\2013  ';color:var(--muted)}
@media (max-height:520px){.wsc-splash{top:2%}.wsc ul{font-size:12px}.wsc .paper{padding:6px 12px 8px}}
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

// ---- the pictures ------------------------------------------------------------------------------------

const JACKET = ["#8d8f94", "#b8232b", "#2f7a3e", "#c9a227"];
/** Each feature's words by its value, short, for under a picture. */
const FEAT_SHORT: string[][] = [
  ["No hat", "Hat"],
  ["No jacket", "Red jacket", "Green jacket", "Mustard jacket"],
  ["No bag", "Bag"],
  ["No dog", "Dog"],
  ["No limp", "Limp, stick"],
];

const svg = (body: string) => `<svg viewBox="0 0 40 40" aria-hidden="true">${body}</svg>`;

/** A feature he has (0 hat, 1 jacket, 2 bag, 3 dog, 4 limp) with value v, as the inside of a picture. */
function featArt(f: number, v: number): string {
  switch (f) {
    case 0: return `<path d="M4 29 Q20 34 36 29 L36 31 Q20 37 4 31Z" fill="#3a2a1c"/><path d="M10 29 C10 18 13 11 20 11 C27 11 30 18 30 29Z" fill="#4e3a26"/><path d="M16 12 Q20 16 24 12" stroke="#2a1c10" stroke-width="2" fill="none"/><rect x="10" y="24" width="20" height="3.5" fill="#1b1b1d"/>`;
    case 1: return `<path d="M13 7 L20 11 L27 7 L35 13 L32 35 L8 35 L5 13Z" fill="${JACKET[v] ?? JACKET[0]}" stroke="#1b1b1d" stroke-width="1.6" stroke-linejoin="round"/><path d="M20 11 V35 M13 7 L17 20 L20 11 L23 20 L27 7" stroke="#1b1b1d" stroke-width="1.4" fill="none"/>`;
    case 2: return `<path d="M12 17 Q20 0 28 17" stroke="#5a3418" stroke-width="3" fill="none"/><rect x="7" y="16" width="26" height="18" rx="3" fill="#8a5428" stroke="#3a220e" stroke-width="1.4"/><path d="M7 21 H33" stroke="#3a220e" stroke-width="1.4"/><rect x="17" y="19" width="6" height="5" fill="#c9a227" stroke="#3a220e"/>`;
    case 3: return `<path d="M9 19 Q8 14 12 13 L15 12 Q17 11 18 14 L18 18 L28 18 Q33 18 33 23 L33 29 L31 29 L31 24 L27 25 L27 32 L25 32 L25 25 L17 25 L17 32 L15 32 L15 24 Q11 23 10 21Z" fill="#7a5a3a"/><path d="M33 20 Q37 15 36 12" stroke="#7a5a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M12 13 L11 8 L15 11Z" fill="#5a3e24"/><circle cx="13" cy="16" r="1.2" fill="#111"/>`;
    default: return `<path d="M27 7 Q20 6 20 12" stroke="#6b4423" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M20 12 L17 36" stroke="#6b4423" stroke-width="3.2" stroke-linecap="round"/><path d="M8 33 Q11 30 14 33 M26 33 Q29 30 32 33" stroke="#1b1b1d" stroke-width="1.6" fill="none"/>`;
  }
}

const STOP_ART: Record<string, string> = {
  pub: `<path d="M12 9 H28 L26 35 H14Z" fill="#c98a1e" stroke="#1b1b1d" stroke-width="1.6"/><path d="M12 9 H28 L27.4 15 H12.6Z" fill="#fff"/><path d="M28 14 Q34 14 34 20 Q34 26 27 26" stroke="#1b1b1d" stroke-width="2.2" fill="none"/>`,
  park: `<circle cx="20" cy="15" r="10" fill="#3f8a3a" stroke="#1b1b1d" stroke-width="1.4"/><rect x="18" y="22" width="4" height="13" fill="#6b4423"/><path d="M6 35 H34" stroke="#1b1b1d" stroke-width="2"/>`,
  bus: `<rect x="7" y="5" width="26" height="28" rx="4" fill="#c0221a" stroke="#1b1b1d" stroke-width="1.6"/><rect x="10" y="9" width="20" height="10" fill="#cfe6f4"/><circle cx="13" cy="27" r="2" fill="#ffd84a"/><circle cx="27" cy="27" r="2" fill="#ffd84a"/><path d="M11 33 V37 M29 33 V37" stroke="#1b1b1d" stroke-width="3"/>`,
};

export interface PosterInfo {
  title: string;
  /** How he looks: each feature's value (naughtyboys.ts), drawn if he has it. */
  feats: number[];
  /** His round of stops: what each is, and whether it's the one he's at. */
  stops: { label: string; kind: "pub" | "park" | "bus"; now: boolean }[];
  goes: { left: number; of: number };
  /** html, a line each, under the round. */
  notes: string[];
}

function posterHtml(o: PosterInfo) {
  const route = o.stops.map((s) => `<div class="stop${s.now ? " now" : ""}">${svg(STOP_ART[s.kind])}${esc(s.label.replace(/^an? /, ""))}</div>`).join(`<span class="arrow">→</span>`);
  const feats = o.feats.flatMap((v, f) => (v ? [`<div class="feat">${svg(featArt(f, v))}${FEAT_SHORT[f][v] ?? ""}</div>`] : [])).join("");
  return `<div class="paper"><div class="wanted">WANTED</div><div class="who">${esc(o.title)}</div><div class="cols">`
    + `<div class="col"><span class="h">How he looks</span><div class="feats">${feats}</div></div>`
    + `<div class="col"><span class="h">His round</span><div class="route">${route}<span class="arrow">↺</span></div>`
    + o.notes.map((n) => `<div class="note">${n}</div>`).join("")
    + `<div class="goes">Goes left <b>${"●".repeat(o.goes.left)}${"○".repeat(Math.max(0, o.goes.of - o.goes.left))}</b></div></div></div></div>`;
}

// ---- the splash, and the poster again ----------------------------------------------------------------

let splashEl: HTMLDivElement | null = null;
const splashT = { t: 0 };

/** The big card as the bounty starts; it goes by itself after secs, or on its ×. Null takes it down now. */
export function wantedSplash(o: (PosterInfo & { clock: string; rules: string[]; again: string }) | null, secs = 18) {
  if (!o) { clearTimeout(splashT.t); if (splashEl) splashEl.hidden = true; return; }
  style();
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
  style();
  if (splashUp()) wantedSplash(null);
  cardEl ??= box("wsc-card");
  tearOff(cardEl);
  put(cardEl, `<div class="band cut">${cutFlag("Wanted")}${posterHtml(o)}${o.foot ? `<div class="small">${o.foot}</div>` : ""}</div>`);
}

// ---- the call-out ------------------------------------------------------------------------------------

let callEl: HTMLDivElement | null = null;
const callT = { t: 0 };

/** A banner across the middle for a few seconds. */
export function callout(head: string, sub: string, secs = 3.5, colour = RED) {
  callEl ??= box("wsc-call");
  callEl.style.setProperty("--rc", colour);
  // written afresh each time, so a second call-out punches in like the first
  written.delete(callEl);
  put(callEl, `<div class="band"><div class="head">${head}</div><div class="rsub">${sub}</div></div>`);
  fadeAfter(callEl, secs, callT);
}

/** Everything of the bounty's down (it's over). */
export function wantedScreensDown() {
  wantedSplash(null); wantedPoster(null);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
