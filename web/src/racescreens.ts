// A race's own screens, big and in the middle, on top of the screens every mission shares
// (missionscreens.ts): the banner while the racers gather and line up, the 3, 2, 1, GO! with its
// start lights, the banner while you watch the others after you've finished or come off, and the
// results card at the end, which stays up till you carry on. A treasure trail's screens share the
// look (trailscreens.ts), and its end card is this results card in the trail's colour.
//
// All drawn on the page in the HUD's layer and sized by the screen, so they work the same on a
// phone. Nothing here goes over the network: race.ts says what to show from what it already knows.
// The only things that take a press are the results card (Continue, Again) and the buttons to
// switch who you're watching on a touch screen.
import { keyLabel, padInUse } from "./gamepad";
import { missionCardDrop } from "./missionscreens";

const COLOUR = "#3ec7e8";
const PODIUM = ["", "#ffd23a", "#dfe5ea", "#e0975a"];
export const MEDAL_COLOUR: Record<string, string> = { author: "#7ff0ff", gold: "#ffd23a", silver: "#dfe5ea", bronze: "#e0975a" };
const CARD_SECS = 8;

let styled = false;
/** The race screens' look, for other set pieces (a treasure trail: trailscreens.ts) to share; --rc on an element sets its colour. */
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
.rsc-end .rcard{width:min(680px,94vw);max-height:94vh;overflow:hidden;box-sizing:border-box;padding:clamp(10px,2.4vmin,22px) clamp(12px,3vmin,28px);
  background:linear-gradient(rgba(10,18,26,.94),rgba(6,10,14,.94));border:2px solid var(--rc,${COLOUR});box-shadow:0 0 0 4px #000,0 12px 40px #000;
  animation:rsc-card .6s cubic-bezier(.2,1.5,.4,1) both}
.rsc-end.dnf .rcard{border-color:#ff5a4e}
.rsc-end .flag{height:12px;margin:0 auto 6px;background:repeating-conic-gradient(#111 0 25%,#f4f4f2 0 50%) 0 0/12px 12px}
.rsc-end .kind{font-weight:700;font-size:clamp(12px,2.4vmin,17px);letter-spacing:.2em;text-transform:uppercase;color:var(--rc,${COLOUR})}
.rsc-end .title{font-weight:900;font-size:clamp(30px,7vmin,58px);line-height:1;letter-spacing:.04em;text-transform:uppercase}
.rsc-end.dnf .title{color:#ff8a80}
.rsc-end .rrow{display:flex;align-items:center;justify-content:center;gap:clamp(12px,4vmin,40px);margin:6px 0}
.rsc-end .place{font-weight:900;font-size:clamp(70px,17vmin,150px);line-height:.85;animation:rsc-punch .8s cubic-bezier(.15,1.5,.4,1) .2s both}
.rsc-end .place sup{font-size:.4em}
.rsc-end .time{font-weight:800;font-size:clamp(34px,8vmin,72px);line-height:1;font-variant-numeric:tabular-nums}
.rsc-end .medal{position:relative;overflow:hidden;width:clamp(78px,17vmin,140px);height:clamp(78px,17vmin,140px);border-radius:50%;flex:none;
  display:flex;align-items:center;justify-content:center;font-weight:900;font-size:clamp(14px,3vmin,24px);letter-spacing:.06em;color:#20160a;text-shadow:0 1px 0 #fff8;
  border:4px solid #0008;box-shadow:0 0 0 3px #000,0 0 30px var(--m);background:radial-gradient(circle at 35% 30%,#fff,var(--m) 45%,#5a4a2a 110%);
  animation:rsc-medal .9s cubic-bezier(.2,1.6,.4,1) .45s both}
.rsc-end .medal::after{content:'';position:absolute;inset:-40%;background:linear-gradient(115deg,transparent 40%,#fffb 50%,transparent 60%);animation:rsc-shine 2.4s ease-in-out 1.2s infinite}
.rsc-end .medal.none{--m:#556;color:#ccd;text-shadow:none;box-shadow:0 0 0 3px #000}
.rsc-end .medal.none::after{display:none}
.rsc-end .line{font-weight:700;font-size:clamp(15px,3.2vmin,24px);margin-top:2px}
.rsc-end .best{font-weight:900;font-size:clamp(20px,4.4vmin,34px);color:#58e06a;animation:rsc-blink .5s steps(2) infinite}
.rsc-end .stats{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:8px 0 4px}
.rsc-end .stat{background:#ffffff12;border:1px solid #ffffff26;padding:3px 10px 2px;min-width:72px}
.rsc-end .stat .v{font-weight:800;font-size:clamp(18px,3.8vmin,28px);line-height:1;font-variant-numeric:tabular-nums}
.rsc-end .stat .k{font-weight:700;font-size:clamp(10px,1.9vmin,13px);letter-spacing:.12em;text-transform:uppercase;color:#9fb0bc}
.rsc-end .podium{display:flex;align-items:flex-end;justify-content:center;gap:6px;margin:8px 0 2px;height:clamp(64px,13vmin,110px)}
.rsc-end .step{width:clamp(80px,18vmin,140px);display:flex;flex-direction:column;justify-content:flex-end;font-weight:800;font-size:clamp(12px,2.4vmin,17px)}
.rsc-end .step i{display:block;font-style:normal;color:#20160a;text-shadow:none;font-size:clamp(16px,3.4vmin,26px);padding-top:2px}
.rsc-end table{margin:4px auto 0;border-collapse:collapse;font-weight:700;font-size:clamp(13px,2.6vmin,19px)}
.rsc-end td{padding:0 8px;text-align:left}
.rsc-end td.t{text-align:right;font-variant-numeric:tabular-nums}
.rsc-end tr.me td{color:var(--rc,${COLOUR})}
.rsc-end tr.dnf td{color:#9aa}
.rsc-end .reward{font-weight:700;font-size:clamp(14px,2.8vmin,20px);color:#ffd84a;margin-top:6px}
.rsc-end .go{display:flex;justify-content:center;gap:10px;margin-top:10px}
.rsc-end button{pointer-events:auto;font:800 clamp(16px,3.2vmin,22px) 'Barlow Condensed',Impact,sans-serif;letter-spacing:.08em;text-transform:uppercase;
  padding:6px 18px 5px;color:#fff;background:#ffffff14;border:2px solid var(--rc,${COLOUR});cursor:pointer;box-shadow:none;text-shadow:none;position:relative;overflow:hidden}
.rsc-end button.main{background:var(--rc,${COLOUR});color:#08131a}
.rsc-end button .fill{position:absolute;left:0;bottom:0;height:3px;background:#fff;animation:rsc-fill ${CARD_SECS}s linear both}
@media (max-height:600px){.rsc-end .podium{display:none}.rsc-end .stats{margin:4px 0 2px}.rsc-end .flag{display:none}}
@keyframes rsc-punch{0%{transform:scale(2.6);opacity:0}25%{transform:scale(.92);opacity:1}40%{transform:scale(1.04)}70%{transform:scale(1);opacity:1}100%{transform:scale(.96);opacity:0}}
.rsc-end .place{animation-name:rsc-in}
@keyframes rsc-in{0%{transform:scale(2.6);opacity:0}60%{transform:scale(.94);opacity:1}100%{transform:none;opacity:1}}
@keyframes rsc-card{from{transform:translateY(40vh) scale(.8);opacity:0}to{transform:none;opacity:1}}
@keyframes rsc-medal{from{transform:scale(0) rotate(-200deg)}to{transform:none}}
@keyframes rsc-shine{0%{transform:translateX(-60%)}45%,100%{transform:translateX(60%)}}
@keyframes rsc-blink{to{opacity:.4}}
@keyframes rsc-dots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}
@keyframes rsc-fill{from{width:100%}to{width:0}}`;
  document.head.appendChild(s);
}

const layer = () => document.getElementById("hud") ?? document.body;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const nth = (n: number) => `${n}<sup>${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}</sup>`;

/** On a touch screen: its own buttons are up rather than the keys. */
export const touchUp = () => { const t = document.getElementById("touch"); return !!t && !t.hidden; };

/** What to call a key in a prompt: the touch button, the pad's button once it's in use, else the key. */
export function control(code: string, touch: string): string {
  return touchUp() ? touch : keyLabel(code);
}

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

/** The card at the end of a race: it punches in, and stays till Continue (or about 8 s). again: the
 *  Again button's go, if there is one. */
export function summary(o: Summary, again?: () => void) {
  style();
  card?.remove();
  const e = document.createElement("div");
  e.className = `rsc rsc-end${o.dnf ? " dnf" : ""}`;
  if (o.colour) e.style.setProperty("--rc", o.colour);
  const medal = o.medal
    ? `<div class="medal" style="--m:${MEDAL_COLOUR[o.medal] ?? "#ffd23a"}">${esc((o.medalWord ?? o.medal).toUpperCase())}</div>`
    : `<div class="medal none">${esc((o.medalWord ?? (o.dnf ? "DNF" : "No medal")).toUpperCase())}</div>`;
  const place = o.place ? `<div class="place" style="color:${PODIUM[o.place] ?? "#fff"}">${nth(o.place)}</div>` : "";
  const podium = o.podium && o.podium.length > 1
    ? `<div class="podium">${[1, 0, 2].filter((k) => o.podium![k]).map((k) => `<div class="step"><span>${esc(o.podium![k].name)}</span><span class="small">${esc(o.podium![k].time)}</span><i style="background:${PODIUM[k + 1]};height:${[100, 72, 52][k]}%">${k + 1}</i></div>`).join("")}</div>`
    : "";
  const table = o.rows && o.rows.length > 1
    ? `<table>${o.rows.slice(0, 10).map((r, k) => `<tr class="${r.me ? "me" : ""}${r.dnf ? " dnf" : ""}"><td>${r.dnf ? "–" : `${k + 1}.`}</td><td>${esc(r.name)}</td><td class="t">${esc(r.time)}</td></tr>`).join("")}</table>`
    : "";
  const ok = control("Space", "Tap"), more = again ? control(padInUse() ? "KeyR" : "Backspace", "Tap") : "";
  e.innerHTML = `<div class="rcard">${o.dnf ? "" : `<div class="flag"></div>`}<div class="kind">${esc(o.kind)}</div><div class="title">${esc(o.title)}</div>`
    + `<div class="rrow">${place}<div><div class="time">${esc(o.time)}</div>${o.lines.map((l) => `<div class="line">${esc(l)}</div>`).join("")}</div>${medal}</div>`
    + (o.best ? `<div class="best">${esc(o.best)}</div>` : "")
    + `<div class="stats">${o.stats.map((s) => `<div class="stat"><div class="v">${esc(s.v)}</div><div class="k">${esc(s.k)}</div></div>`).join("")}</div>`
    + podium + table
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
  // Space or Enter carries on (and so does the pad's Cross, which presses Space); Backspace, or the
  // pad's reload button, which presses R, goes again. Taken here so the press doesn't jump or reload too.
  const onKey = (k: KeyboardEvent) => {
    if (k.repeat) return;
    if (k.code === "Space" || k.code === "Enter") { k.preventDefault(); k.stopImmediatePropagation(); remove(); }
    else if (again && (k.code === "Backspace" || (k.code === "KeyR" && !k.isTrusted))) { k.preventDefault(); k.stopImmediatePropagation(); remove(); again(); }
  };
  addEventListener("keydown", onKey, true);
  e.querySelector<HTMLButtonElement>("button.main")!.addEventListener("click", remove);
  e.querySelector<HTMLButtonElement>("button.again")?.addEventListener("click", () => { remove(); again?.(); });
  const timer = window.setTimeout(remove, CARD_SECS * 1000);
}

/** Take the results card down at once (a new race starting). */
export function dropSummary() { card?.remove(); }
