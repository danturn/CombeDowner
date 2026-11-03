// A race's own screens, big and in the middle, on top of the screens every mission shares
// (missionscreens.ts): the banner while the racers gather and line up, the 3, 2, 1, GO! with its
// start lights, the banner while you watch the others after you've finished or come off, and the
// results card at the end, which stays up till you carry on: a cutting from the Chronicle's sports
// pages (cutting.ts), with the race's colour on its section tab. A Wanted bounty's screens share the
// look (wantedscreens.ts), and its end card is this results card in the poster's red.
//
// All drawn on the page in the HUD's layer and sized by the screen, so they work the same on a
// phone. Nothing here goes over the network: race.ts says what to show from what it already knows.
// The only things that take a press are the results card (Continue, Again, and its × to put it
// away: it lets the mouse go while it's up, modal.ts) and the buttons to switch who you're watching
// on a touch screen.
import { ctl, isKey } from "./controls";
import { missionCardDrop } from "./missionscreens";
import { modal, modalClicked } from "./modal";
import { cutFlag, tearOff } from "./cutting";

const COLOUR = "#3ec7e8";
const CARD_SECS = 8;

let styled = false;
/** The race screens' look, for other set pieces (a Wanted bounty: wantedscreens.ts) to share; --rc on an element sets its colour. */
export function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `
.rsc{position:fixed;left:0;right:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;text-align:center;
  font-family:'Barlow Condensed',Impact,sans-serif;color:#fff;text-shadow:0 3px 0 #000,0 0 18px rgba(0,0,0,.6);z-index:6}
.rsc[hidden]{display:none}
.rsc .band{width:min(760px,94vw);box-sizing:border-box;padding:10px 16px 12px;background:linear-gradient(90deg,transparent,rgba(8,14,20,.84) 15%,rgba(8,14,20,.84) 85%,transparent);box-shadow:inset 0 -3px 0 var(--rc,${COLOUR})}
.rsc .head{font-weight:800;font-size:clamp(30px,7vmin,64px);letter-spacing:.06em;line-height:1;text-transform:uppercase}
.rsc .rsub{font-weight:700;font-size:clamp(15px,3.2vmin,26px);margin-top:4px;line-height:1.15}
.rsc .small{font-weight:600;font-size:clamp(13px,2.4vmin,19px);color:#c8d4dc;margin-top:3px}
.rsc b{color:var(--rc,${COLOUR})}
.rsc-wait{top:36%}
.rsc .kind{font-weight:700;font-size:clamp(12px,2.4vmin,17px);letter-spacing:.2em;text-transform:uppercase;color:var(--rc,${COLOUR})}
.rsc-wait .dots::after{content:'';animation:rsc-dots 1.2s steps(4) infinite}
.rsc-wait .count{font-weight:900;font-size:clamp(34px,8vmin,72px);line-height:1;color:#ffd84a;font-variant-numeric:tabular-nums}
.rsc-count{top:0;bottom:0;justify-content:center}
body:has(.rsc-count:not([hidden]),.rsc-wait:not([hidden])) #clickhint{visibility:hidden}
.rsc-count .num{font-weight:900;font-size:clamp(150px,42vmin,420px);line-height:.85;animation:rsc-punch .9s cubic-bezier(.15,1.5,.4,1) both}
.rsc-count .num.go{color:var(--rc,${COLOUR});font-size:clamp(130px,36vmin,360px)}
.rsc-count .lights{display:flex;gap:clamp(10px,2.4vmin,22px);margin-bottom:clamp(8px,2vmin,20px);padding:clamp(6px,1.4vmin,12px) clamp(10px,2.4vmin,20px);background:#111a;border:2px solid #000;border-radius:8px}
.rsc-count .lamp{width:clamp(26px,6vmin,56px);height:clamp(26px,6vmin,56px);border-radius:50%;background:#2a1414;border:3px solid #000;box-shadow:inset 0 -4px 0 #0006}
.rsc-count .lamp.red{background:radial-gradient(circle at 40% 35%,#ffb4a8,#ff2a1a 55%,#a00);box-shadow:0 0 22px #ff2a1a,inset 0 -4px 0 #0004}
.rsc-count .lamp.green{background:radial-gradient(circle at 40% 35%,#d8ffd0,#38e04a 55%,#0a8a1a);box-shadow:0 0 26px #38e04a,inset 0 -4px 0 #0004}
.rsc-spec{top:112px}
.rsc-spec .band{width:min(620px,60vw)}
#hud:has(.rsc-spec:not([hidden])) #mprog{display:none}
@media (max-width:700px),(max-height:500px){.rsc-spec{top:56px}.rsc-spec .band{width:min(420px,56vw);padding:6px 10px 8px}.rsc-spec table{display:none}}
.rsc-spec .head{font-size:clamp(26px,6vmin,54px)}
.rsc-spec table{margin:6px auto 0;border-collapse:collapse;font-weight:700;font-size:clamp(13px,2.4vmin,19px)}
.rsc-spec td{padding:0 8px;text-align:left}
.rsc-spec td.t{text-align:right;font-variant-numeric:tabular-nums}
.rsc-spec tr.me td{color:var(--rc,${COLOUR})}
.rsc-spec tr.watch td{color:#ffd84a}
.rsc-flip{position:absolute;top:50%;pointer-events:auto;font:800 28px 'Barlow Condensed',Impact,sans-serif;width:64px;height:64px;border-radius:50%;
  background:rgba(8,14,20,.7);color:#fff;border:2px solid var(--rc,${COLOUR});box-shadow:none}
.rsc-flip.l{left:14px}.rsc-flip.r{right:14px}
.rsc-end{inset:0;justify-content:center;background:radial-gradient(ellipse at center,rgba(4,8,12,.55),rgba(4,8,12,.8));pointer-events:auto;transition:opacity .5s}
.rsc-end.out{opacity:0}
.rsc-end .rcard{width:min(520px,94vw);max-height:94vh;overflow:auto;padding:16px 24px 20px;animation:cut-in .4s ease-out both}
.rsc-end .kind{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.rsc-end .title{font-weight:700;font-size:clamp(28px,6vmin,40px);line-height:1.05;margin:2px 0 10px;text-wrap:balance}
.rsc-end .lead{display:flex;align-items:baseline;gap:16px;padding:8px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink)}
.rsc-end .place,.rsc-end .time{font-weight:700;font-size:clamp(28px,6.4vmin,42px);line-height:1;font-variant-numeric:tabular-nums}
.rsc-end .place sup{font-size:.5em}
.rsc-end .medal{margin-left:auto;font-size:16px;font-style:italic;white-space:nowrap}
.rsc-end .lines{margin:8px 0 0;font-size:16px;line-height:1.4}
.rsc-end .cut b{color:var(--ink)}
.rsc-end table{width:100%;margin:14px 0 0;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums}
.rsc-end caption{text-align:left;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding-bottom:4px}
.rsc-end td{padding:4px 0;border-bottom:1px solid #d6cfbe;text-align:left}
.rsc-end td.n{width:2.2em;color:var(--muted)}
.rsc-end td.t{text-align:right}
.rsc-end tr.me td{font-weight:700}
.rsc-end tr.dnf td{color:var(--muted)}
.rsc-end .stats{margin-top:10px;font-size:13px;color:var(--muted)}
.rsc-end .stats b{color:var(--ink)}
.rsc-end .reward{margin-top:4px;font-size:14px;font-weight:700}
.rsc-end .go{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
.rsc-end button{pointer-events:auto;font:700 15px 'Old Standard TT',Georgia,serif;letter-spacing:.02em;text-transform:none;padding:7px 16px 6px;
  color:var(--ink);background:transparent;border:1px solid var(--ink);border-radius:0;cursor:pointer;box-shadow:none;text-shadow:none;position:relative;overflow:hidden}
.rsc-end button.main{background:var(--ink);color:#f5f2e9}
.rsc-end button small{font-weight:400;opacity:.7}
.rsc-end button .fill{position:absolute;left:0;bottom:0;height:2px;background:#f5f2e9;animation:rsc-fill ${CARD_SECS}s linear both}
@keyframes rsc-punch{0%{transform:scale(2.6);opacity:0}25%{transform:scale(.92);opacity:1}40%{transform:scale(1.04)}70%{transform:scale(1);opacity:1}100%{transform:scale(.96);opacity:0}}
@keyframes rsc-dots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}
@keyframes rsc-fill{from{width:100%}to{width:0}}`;
  document.head.appendChild(s);
}

const layer = () => document.getElementById("hud") ?? document.body;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const nth = (n: number) => `${n}<sup>${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}</sup>`;

/** What to call a control in a prompt: its key, pad button or touch word (controls.ts). */
export const control = (id: string) => ctl(id);

function el(cls: string): HTMLDivElement {
  style();
  const e = document.createElement("div");
  e.className = `rsc ${cls}`;
  e.hidden = true;
  layer().appendChild(e);
  return e;
}

/** A box written only when its words change. */
function put(e: HTMLElement, html: string) {
  if (e.innerHTML !== html) e.innerHTML = html;
  if (e.hidden) e.hidden = false;
}

// ---- waiting on the grid ------------------------------------------------------------------------------

let wait: HTMLDivElement | null = null;

/** The banner while the entries are open and the racers line up, or null to take it down. */
export function waiting(o: { kind?: string; head: string; sub: string; small?: string; count?: number } | null) {
  if (!o) { if (wait) wait.hidden = true; return; }
  if (!wait || wait.hidden) missionCardDrop();   // it says what the race is: the title card would only sit on it
  wait ??= el("rsc-wait");
  put(wait, `<div class="band">${o.kind ? `<div class="kind">${esc(o.kind)}</div>` : ""}<div class="head">${o.head}</div>${o.count !== undefined ? `<div class="count">${o.count}</div>` : ""}<div class="rsub">${o.sub}</div>${o.small ? `<div class="small">${o.small}</div>` : ""}</div>`);
}

// ---- 3, 2, 1, GO! -----------------------------------------------------------------------------------

let count: HTMLDivElement | null = null;
let countT = 0;

/** A number of the countdown (3, 2, 1, or 0 for GO!) punching in over the middle of the screen with
 *  the start lights over it; it fades by itself. */
export function countdown(n: number) {
  missionCardDrop();
  count ??= el("rsc-count");
  const lamps = [0, 1, 2].map((k) => `<div class="lamp ${n === 0 ? "green" : k < 4 - n ? "red" : ""}"></div>`).join("");
  // a fresh element each time, so its punch plays again
  count.innerHTML = `<div class="lights">${lamps}</div><div class="num${n === 0 ? " go" : ""}">${n === 0 ? "GO!" : n}</div>`;
  count.hidden = false;
  clearTimeout(countT);
  countT = window.setTimeout(() => { if (count) count.hidden = true; }, n === 0 ? 1100 : 950);
}

// ---- watching the others -------------------------------------------------------------------------------

let spec: HTMLDivElement | null = null;
let flips: HTMLButtonElement[] = [];

export interface StandRow { name: string; time: string; me?: boolean; watch?: boolean }

/** The banner while you wait for the race to end and watch the others ride, and the touch screen's
 *  buttons to switch who you're watching (flip: -1 or 1); null takes it all down. */
export function spectating(o: { head: string; sub: string; small?: string; rows: StandRow[]; many: boolean } | null, flip?: (by: number) => void) {
  if (!o) { if (spec) spec.hidden = true; for (const b of flips) b.hidden = true; return; }
  spec ??= el("rsc-spec");
  const table = o.rows.length ? `<table>${o.rows.slice(0, 8).map((r, k) => `<tr class="${r.me ? "me" : r.watch ? "watch" : ""}"><td>${k + 1}.</td><td>${esc(r.name)}</td><td class="t">${esc(r.time)}</td></tr>`).join("")}</table>` : "";
  put(spec, `<div class="band"><div class="head">${o.head}</div><div class="rsub">${o.sub}</div>${o.small ? `<div class="small">${o.small}</div>` : ""}${table}</div>`);
  const touch = document.getElementById("touch");
  if (touch && !flips.length && flip) {
    flips = [-1, 1].map((by) => {
      const b = document.createElement("button");
      b.className = `rsc-flip ${by < 0 ? "l" : "r"}`;
      b.textContent = by < 0 ? "◀" : "▶";
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); flipTo?.(by); });
      touch.appendChild(b);
      return b;
    });
  }
  flipTo = flip ?? null;
  for (const b of flips) b.hidden = !o.many;
}
let flipTo: ((by: number) => void) | null = null;

// ---- the results card -----------------------------------------------------------------------------------

export interface Summary {
  kind: string;                 // "Bike race to The Bell"
  title: string;                // "Winner!", "Finished", "Out of the race"
  dnf?: boolean;
  place?: number;               // in the room's race, if there was one with others in it
  time: string;
  /** "gold", "silver", "bronze", "author" or "" for none. */
  medal: string;
  medalWord?: string;           // what it says on the medal if not the medal's own name
  lines: string[];              // under the time: how far you got, your best, the gap to gold
  best?: string;                // "NEW BEST! 2.1 s quicker"
  stats: { k: string; v: string }[];
  podium?: { name: string; time: string }[];
  rows?: { name: string; time: string; me?: boolean; dnf?: boolean }[];
  reward?: string;
  /** The card's colour, if not a race's. */
  colour?: string;
}

let card: { remove(): void } | null = null;

/** The card at the end of a race: it punches in, and stays till Continue or its × (or about 8 s). again: the
 *  Again button's go, if there is one. */
export function summary(o: Summary, again?: () => void) {
  style();
  card?.remove();
  const e = document.createElement("div");
  e.className = `rsc rsc-end${o.dnf ? " dnf" : ""}`;
  if (o.colour) e.style.setProperty("--rc", o.colour);
  // one results line (place, time, medal), what that means in a line or two, the table, and the numbers small
  const word = o.medalWord ?? (o.medal ? `${o.medal[0].toUpperCase()}${o.medal.slice(1)} medal` : o.dnf ? "Did not finish" : "No medal");
  const list = o.rows && o.rows.length > 1 ? o.rows : o.podium && o.podium.length > 1 ? o.podium : null;
  const table = list
    ? `<table><caption>Results</caption>${list.slice(0, 10).map((r: { name: string; time: string; me?: boolean; dnf?: boolean }, k) => `<tr class="${r.me ? "me" : ""}${r.dnf ? " dnf" : ""}"><td class="n">${r.dnf ? "–" : `${k + 1}.`}</td><td>${esc(r.name)}</td><td class="t">${esc(r.time)}</td></tr>`).join("")}</table>`
    : "";
  const lines = [...o.lines.map(esc), ...(o.best ? [`<b>${esc(o.best)}</b>`] : [])];
  const ok = ctl("jump"), more = again ? ctl("again") : "";
  tearOff(e);
  e.innerHTML = `<div class="rcard cut">${cutFlag("Sport")}<div class="kind">${esc(o.kind)}</div><div class="title">${esc(o.title)}</div>`
    + `<div class="lead">${o.place ? `<span class="place">${nth(o.place)}</span>` : ""}<span class="time">${esc(o.time)}</span><span class="medal">${esc(word)}</span></div>`
    + (lines.length ? `<p class="lines">${lines.join("<br>")}</p>` : "")
    + table
    + (o.stats.length ? `<div class="stats">${o.stats.map((x) => `${esc(x.k)} <b>${esc(x.v)}</b>`).join(" &nbsp;·&nbsp; ")}</div>` : "")
    + (o.reward ? `<div class="reward">${esc(o.reward)}</div>` : "")
    + `<div class="go">${again ? `<button type="button" class="again">Again <small>(${esc(more)})</small></button>` : ""}<button type="button" class="main">Continue <small>(${esc(ok)})</small><span class="fill"></span></button></div></div>`;
  layer().appendChild(e);
  let gone = false;
  const remove = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    removeEventListener("keydown", onKey, true);
    e.classList.add("out");
    window.setTimeout(() => e.remove(), 500);
    if (card === handle) card = null;
  };
  const handle = { remove };
  card = handle;
  // jump (Space, Enter, ✕) carries on; use (E, □) or Backspace goes again. Taken here so the press
  // doesn't jump or get in a car too.
  const onKey = (k: KeyboardEvent) => {
    if (k.repeat) return;
    if (k.code === "Space" || k.code === "Enter") { k.preventDefault(); k.stopImmediatePropagation(); remove(); }
    else if (again && (k.code === "Backspace" || isKey(k.code, "use"))) { k.preventDefault(); k.stopImmediatePropagation(); remove(); again(); }
  };
  addEventListener("keydown", onKey, true);
  e.querySelector<HTMLButtonElement>("button.main")!.addEventListener("click", () => { remove(); modalClicked(); });
  e.querySelector<HTMLButtonElement>("button.again")?.addEventListener("click", () => { remove(); again?.(); modalClicked(); });
  modal(e, () => e.querySelector<HTMLElement>(".rcard") ?? e, remove);
  const timer = window.setTimeout(remove, CARD_SECS * 1000);
}

/** Take the results card down at once (a new race starting). */
export function dropSummary() { card?.remove(); }
