// A Wanted poster's own screens, built from the treasure trail's boxes and paper (trailscreens.ts)
// in the poster's red: the splash when the bounty starts (the poster itself, with his features as
// pictures and his round of stops, the clock, and how to catch him), the same poster brought back
// on the job control, which keeps up with what the witnesses have said, and the
// little card beside the crosshair while you're looking at one of the men dressed like him, ticking
// off which of his known features that man has. The circle's call-outs are the trail's (callout),
// and the end is the race results card (racescreens.ts summary).
//
// The pictures are drawn here as little SVGs, so there's nothing to load. Nothing here goes over the
// network: wanted.ts says what to show from what it already knows.
import { ctlText } from "./controls";
import { missionCardDrop } from "./missionscreens";
import { box, fadeAfter, put } from "./trailscreens";

export const RED = "#e04848";

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `
.wsc.wsc{--rc:${RED}}
.wsc.wsc .paper{font-size:clamp(14px,2.6vmin,19px);padding:6px 14px 10px;max-width:760px}
.wsc.wsc .wanted{font:900 clamp(30px,7vmin,58px)/.9 'Barlow Condensed',Impact,sans-serif;letter-spacing:.14em;color:#8a1a14;text-align:center}
.wsc.wsc .who{font:800 clamp(18px,3.8vmin,30px)/1.05 'Barlow Condensed',Impact,sans-serif;text-align:center;color:#1b1b1d;margin:2px 0 4px}
.wsc.wsc .cols{display:flex;gap:14px;align-items:flex-start;justify-content:center}
.wsc.wsc .col{flex:1;min-width:0}
.wsc.wsc .h{display:block;font:700 clamp(11px,1.9vmin,14px) 'Barlow Condensed',Impact,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#7a2a12;margin:4px 0 2px;text-align:left}
.wsc.wsc .feats{display:flex;gap:6px;flex-wrap:wrap}
.wsc.wsc .feat{position:relative;width:clamp(58px,11vmin,86px);text-align:center;font:700 clamp(11px,2vmin,14px)/1.05 'Barlow Condensed',Impact,sans-serif;color:#1b1b1d}
.wsc.wsc .feat svg{display:block;width:clamp(42px,8.4vmin,64px);height:clamp(42px,8.4vmin,64px);margin:0 auto 1px;background:#fff8;border:2px solid #1b1b1d;border-radius:6px}
.wsc.wsc .feat.unknown svg{border-style:dashed;background:#0000}
.wsc.wsc .feat .tick{position:absolute;right:2px;top:-4px;width:20px;height:20px;border-radius:50%;font:900 14px/20px sans-serif;color:#fff;border:2px solid #1b1b1d}
.wsc.wsc .feat em{display:block;font-style:normal;font-weight:600;font-size:.82em;color:#6a5a40}
.wsc.wsc .route{display:flex;align-items:center;gap:4px;flex-wrap:wrap;font:700 clamp(12px,2.2vmin,16px)/1.1 'Barlow Condensed',Impact,sans-serif;color:#1b1b1d}
.wsc.wsc .stop{display:flex;flex-direction:column;align-items:center;width:clamp(48px,9vmin,70px);text-align:center}
.wsc.wsc .stop svg{width:clamp(30px,6vmin,44px);height:clamp(30px,6vmin,44px)}
.wsc.wsc .stop.now{color:#8a1a14}
.wsc.wsc .stop.now svg{filter:drop-shadow(0 0 4px ${RED})}
.wsc.wsc .arrow{font-size:1.3em;color:#7a2a12}
.wsc.wsc .note{font:600 clamp(12px,2.2vmin,16px)/1.2 Georgia,serif;color:#1b1b1d;text-align:left;margin-top:3px}
.wsc.wsc .note b{color:#8a1a14}
.wsc.wsc ul{max-width:760px}
.wsc.wsc .clock{font-weight:800;font-size:clamp(15px,3vmin,22px);color:#ffd84a}
.wsc-tag{position:fixed;left:calc(50% + 72px);top:50%;transform:translateY(-50%);pointer-events:none;z-index:6;
  font-family:'Barlow Condensed',Impact,sans-serif;color:#fff;text-shadow:0 2px 0 #000;background:rgba(8,14,20,.82);border-left:4px solid var(--v,#ffd84a);
  padding:4px 8px 5px;max-width:min(300px,44vw)}
.wsc-tag[hidden]{display:none}
.wsc-tag .row{display:flex;gap:4px}
.wsc-tag .mini{position:relative;width:34px;text-align:center;font:700 11px/1 'Barlow Condensed',sans-serif}
.wsc-tag .mini svg{width:30px;height:30px;background:#f4ecd4;border-radius:4px;display:block;margin:0 auto 1px}
.wsc-tag .mini .tick{position:absolute;right:-2px;top:-4px;width:15px;height:15px;border-radius:50%;font:900 11px/15px sans-serif;border:1px solid #000}
.wsc-tag .v{font-weight:800;font-size:clamp(14px,2.6vmin,18px);color:var(--v,#ffd84a);margin-top:3px;line-height:1.1}
.wsc-tag .s{font-weight:600;font-size:clamp(11px,2vmin,14px);color:#c8d4dc;line-height:1.15}
.mini-ic{display:inline-block;vertical-align:middle;width:22px;height:22px;margin:0 1px;background:#f4ecd4;border-radius:3px}
@media (max-height:520px){.wsc.wsc .cols{gap:8px}.wsc.wsc .note{font-size:12px}.wsc.wsc .wanted{font-size:28px}.wsc.wsc .who{font-size:17px;margin:0 0 2px}
  .wsc.wsc .feat{width:52px}.wsc.wsc .feat svg{width:38px;height:38px}.wsc.wsc .stop svg{width:28px;height:28px}
  .wsc.wsc .note ~ .note{display:none}.wsc.wsc ul{font-size:11.5px;line-height:1.2;margin-top:3px}.wsc.wsc .again{font-size:13px;margin-top:2px}
  .tsc-splash.wsc .paper{margin:4px auto 2px}.tsc-splash.wsc .clock{font-size:13px}
  .wsc-tag{left:calc(50% + 60px)}}
body[data-input=touch] .wsc-tag{left:auto;right:calc(50% + 40px)}`;
  document.head.appendChild(s);
}

// ---- the pictures ------------------------------------------------------------------------------------

const JACKET = ["#8d8f94", "#b8232b", "#2f7a3e", "#c9a227"];
/** Each feature's words by its value, short, for under a picture. */
export const FEAT_SHORT: string[][] = [
  ["No hat", "Hat"],
  ["No jacket", "Red jacket", "Green jacket", "Mustard jacket"],
  ["No bag", "Bag"],
  ["No dog", "Dog"],
  ["No limp", "Limp, stick"],
];

const svg = (body: string, cls = "") => `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 40 40" aria-hidden="true">${body}</svg>`;
const STRIKE = `<path d="M6 34 L34 6" stroke="#c0221a" stroke-width="4" stroke-linecap="round"/>`;

/** A feature (0 hat, 1 jacket, 2 bag, 3 dog, 4 limp) with value v, as the inside of a picture. */
function featArt(f: number, v: number): string {
  const no = v === 0, fade = (s: string) => (no ? `<g opacity=".4">${s}</g>${STRIKE}` : s);
  switch (f) {
    case 0: return fade(`<path d="M4 29 Q20 34 36 29 L36 31 Q20 37 4 31Z" fill="#3a2a1c"/><path d="M10 29 C10 18 13 11 20 11 C27 11 30 18 30 29Z" fill="#4e3a26"/><path d="M16 12 Q20 16 24 12" stroke="#2a1c10" stroke-width="2" fill="none"/><rect x="10" y="24" width="20" height="3.5" fill="#1b1b1d"/>`);
    case 1: return fade(`<path d="M13 7 L20 11 L27 7 L35 13 L32 35 L8 35 L5 13Z" fill="${JACKET[v] ?? JACKET[0]}" stroke="#1b1b1d" stroke-width="1.6" stroke-linejoin="round"/><path d="M20 11 V35 M13 7 L17 20 L20 11 L23 20 L27 7" stroke="#1b1b1d" stroke-width="1.4" fill="none"/>`);
    case 2: return fade(`<path d="M12 17 Q20 0 28 17" stroke="#5a3418" stroke-width="3" fill="none"/><rect x="7" y="16" width="26" height="18" rx="3" fill="#8a5428" stroke="#3a220e" stroke-width="1.4"/><path d="M7 21 H33" stroke="#3a220e" stroke-width="1.4"/><rect x="17" y="19" width="6" height="5" fill="#c9a227" stroke="#3a220e"/>`);
    case 3: return fade(`<path d="M9 19 Q8 14 12 13 L15 12 Q17 11 18 14 L18 18 L28 18 Q33 18 33 23 L33 29 L31 29 L31 24 L27 25 L27 32 L25 32 L25 25 L17 25 L17 32 L15 32 L15 24 Q11 23 10 21Z" fill="#7a5a3a"/><path d="M33 20 Q37 15 36 12" stroke="#7a5a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M12 13 L11 8 L15 11Z" fill="#5a3e24"/><circle cx="13" cy="16" r="1.2" fill="#111"/>`);
    default: return fade(`<path d="M27 7 Q20 6 20 12" stroke="#6b4423" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M20 12 L17 36" stroke="#6b4423" stroke-width="3.2" stroke-linecap="round"/><path d="M8 33 Q11 30 14 33 M26 33 Q29 30 32 33" stroke="#1b1b1d" stroke-width="1.6" fill="none"/>`);
  }
}
const UNKNOWN = `<text x="20" y="29" text-anchor="middle" font-family="Georgia,serif" font-size="26" font-weight="700" fill="#8a1a14">?</text>`;

/** A feature as a small picture for a line of text (the mission panel). */
export const miniIcon = (f: number, v: number) => { style(); return svg(featArt(f, v), "mini-ic").replace("<svg", `<svg width="22" height="22"`); };

const STOP_ART: Record<string, string> = {
  pub: `<path d="M12 9 H28 L26 35 H14Z" fill="#c98a1e" stroke="#1b1b1d" stroke-width="1.6"/><path d="M12 9 H28 L27.4 15 H12.6Z" fill="#fff"/><path d="M28 14 Q34 14 34 20 Q34 26 27 26" stroke="#1b1b1d" stroke-width="2.2" fill="none"/>`,
  park: `<circle cx="20" cy="15" r="10" fill="#3f8a3a" stroke="#1b1b1d" stroke-width="1.4"/><rect x="18" y="22" width="4" height="13" fill="#6b4423"/><path d="M6 35 H34" stroke="#1b1b1d" stroke-width="2"/>`,
  bus: `<rect x="7" y="5" width="26" height="28" rx="4" fill="#c0221a" stroke="#1b1b1d" stroke-width="1.6"/><rect x="10" y="9" width="20" height="10" fill="#cfe6f4"/><circle cx="13" cy="27" r="2" fill="#ffd84a"/><circle cx="27" cy="27" r="2" fill="#ffd84a"/><path d="M11 33 V37 M29 33 V37" stroke="#1b1b1d" stroke-width="3"/>`,
};

// ---- what's known ----------------------------------------------------------------------------------------

/** One of his features as the poster shows it: from the poster itself, or a witness's word on it
 *  (said and not yet pressed, sworn to, or backed down from), or nothing yet. */
export interface Known { f: number; v: number; how: "poster" | "said" | "sworn" | "doubt" | "none" }

const BADGE: Record<Known["how"], [string, string]> = {
  poster: ["✓", "#2f8a3a"], sworn: ["✓", "#2f8a3a"], said: ["?", "#d89a18"], doubt: ["✗", "#c0221a"], none: ["?", "#8a1a14"],
};
const HOW: Record<Known["how"], string> = {
  poster: "on the poster", sworn: "a witness swears", said: "a witness says", doubt: "witness backed down", none: "ask a witness",
};

function featBox(k: Known) {
  const [mark, col] = BADGE[k.how];
  const art = k.how === "none" ? UNKNOWN : featArt(k.f, k.v);
  const name = k.how === "none" ? "One more thing" : FEAT_SHORT[k.f][k.v] ?? "";
  return `<div class="feat${k.how === "none" ? " unknown" : ""}">${svg(art)}<span class="tick" style="background:${col}">${mark}</span>${name}<em>${HOW[k.how]}</em></div>`;
}

export interface PosterInfo {
  title: string;
  known: Known[];
  /** His round of stops: what each is, and whether it's the one he's at or making for. */
  stops: { label: string; kind: "pub" | "park" | "bus"; now: boolean }[];
  /** html, a line each, under the pictures: who he runs with and his quirks. */
  notes: string[];
}

function posterHtml(o: PosterInfo) {
  const route = o.stops.map((s) => `<div class="stop${s.now ? " now" : ""}">${svg(STOP_ART[s.kind])}${esc(s.label.replace(/^an? /, ""))}</div>`).join(`<span class="arrow">→</span>`);
  return `<div class="paper"><div class="wanted">WANTED</div><div class="who">${esc(o.title)}</div><div class="cols">`
    + `<div class="col"><span class="h">Find the man with all of these</span><div class="feats">${o.known.map(featBox).join("")}</div></div>`
    + `<div class="col"><span class="h">His round (where is unknown)</span><div class="route">${route}<span class="arrow">↺</span></div>`
    + o.notes.map((n) => `<div class="note">${n}</div>`).join("") + `</div></div></div>`;
}

// ---- the splash, and the poster again ----------------------------------------------------------------

let splashEl: HTMLDivElement | null = null;
const splashT = { t: 0 };

/** The big card as the bounty starts; it goes by itself after secs. Null takes it down now. */
export function wantedSplash(o: (PosterInfo & { clock: string; rules: string[]; again: string }) | null, secs = 18) {
  if (!o) { clearTimeout(splashT.t); if (splashEl) splashEl.hidden = true; return; }
  style();
  missionCardDrop();
  splashEl ??= box("tsc-splash wsc");
  put(splashEl, `<div class="band"><div class="kind">Wanted · a bounty</div><div class="clock">${o.clock}</div>${posterHtml(o)}`
    + `<ul>${o.rules.map((r) => `<li>${r}</li>`).join("")}</ul><div class="again">${o.again}</div></div>`);
  fadeAfter(splashEl, secs, splashT);
}
const splashUp = () => !!splashEl && !splashEl.hidden && !splashEl.classList.contains("out");

let cardEl: HTMLDivElement | null = null;

/** The poster again, as it stands now, while it's asked for; null takes it down. */
export function wantedPoster(o: (PosterInfo & { foot: string }) | null) {
  if (!o) { if (cardEl && !cardEl.hidden) cardEl.hidden = true; return; }
  style();
  if (splashUp()) wantedSplash(null);
  cardEl ??= box("tsc-card wsc");
  put(cardEl, `<div class="band">${posterHtml(o)}${o.foot ? `<div class="small">${o.foot}</div>` : ""}</div>`);
}

// ---- the man you're looking at ---------------------------------------------------------------------------

let tagEl: HTMLDivElement | null = null;

/** Beside the crosshair: one man's features against what's known, and what that adds up to. Null takes it down. */
export function suspectTag(o: { rows: { f: number; v: number; ok: boolean | null }[]; verdict: string; say: string; colour: string } | null) {
  if (!o) { if (tagEl && !tagEl.hidden) tagEl.hidden = true; return; }
  style();
  if (!tagEl) {
    tagEl = document.createElement("div");
    tagEl.className = "wsc wsc-tag";
    (document.getElementById("hud") ?? document.body).appendChild(tagEl);
  }
  tagEl.style.setProperty("--v", o.colour);
  const html = ctlText(`<div class="row">${o.rows.map((r) => {
    const [m, c] = r.ok === null ? ["?", "#d89a18"] : r.ok ? ["✓", "#2f8a3a"] : ["✗", "#c0221a"];
    return `<div class="mini">${svg(featArt(r.f, r.v))}<span class="tick" style="background:${c}">${m}</span></div>`;
  }).join("")}</div><div class="v">${o.verdict}</div>${o.say ? `<div class="s">${o.say}</div>` : ""}`);
  if (tagEl.innerHTML !== html) tagEl.innerHTML = html;
  tagEl.hidden = false;
}

/** Everything of the bounty's down (it's over). */
export function wantedScreensDown() {
  wantedSplash(null); wantedPoster(null); suspectTag(null);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
