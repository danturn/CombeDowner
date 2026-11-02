// Cuttings from the Chronicle: the cards that stop you to read them (a job's end card, a race's or a
// trail's results, a treasure hunt's or a bounty's poster, the driving test's report, the night
// out's front page) come up as pieces torn out of the paper. Each is a scrap of newsprint with
// ragged top and bottom edges, a fold across the middle, a slight tilt and a shadow under it, with a
// strip of the paper's own masthead along its top (the section it's from, and the date). The
// Chronicle's masthead itself (navy, a small "The Bath" over a big heavy "Chronicle") is written
// here too, so the paper and its cuttings match.
//
// Each card's own screen file lays out its words (missionscreens.ts, racescreens.ts,
// trailscreens.ts, wantedscreens.ts); this gives them the paper. The torn edges are made up afresh
// for each card, so no two cuttings tear alike.
//
// Nothing here goes over the network.

let place = () => "Bath";

/** daily.ts: where the Chronicle is printed (the map's name), for the mastheads. */
export function chroniclePlace(fn: () => string) { place = fn; }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The Chronicle's masthead: a small "The <place>" over a big "Chronicle". */
export const chronMark = (where = place()) => `<span class="chron-mark"><small>The ${esc(where)}</small>Chronicle</span>`;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dateline = () => { const d = new Date(); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

/** The strip along the top of a cutting: the masthead small, the section it's from, and the date. */
export function cutFlag(section: string): string {
  style();
  return `<div class="cut-flag">${chronMark()}<span class="cut-sec">${esc(section)}</span><span class="cut-date">${dateline()}</span></div>`;
}

/** The top of a front page: the masthead full size, then the date and a line on the right (html). */
export function cutFront(right: string): string {
  style();
  return `<div class="cut-front">${chronMark()}</div><div class="cut-folio"><span>${dateline()}</span><span>${right}</span></div>`;
}

/** A ragged edge for a cutting, as a clip-path: torn along the top and the bottom, nearly straight
 *  down the sides. The tear wanders (each step goes on from the last) with small sharp teeth in it. */
function tearPath(): string {
  const r = Math.random, deep = 7, pts: string[] = [];
  const walk = (y: number) => Math.max(0, Math.min(deep, y + (r() - 0.5) * 4));
  let y = r() * deep;
  for (let x = 0; x < 100; x += 0.8 + r() * 2.2) { y = walk(y); pts.push(`${x.toFixed(1)}% ${(y + (r() < 0.3 ? r() * 2 : 0)).toFixed(1)}px`); }
  pts.push(`100% ${walk(y).toFixed(1)}px`);
  for (let h = 12; h < 92; h += 10 + r() * 16) pts.push(`calc(100% - ${(r() * 2).toFixed(1)}px) ${h.toFixed(1)}%`);
  y = r() * deep;
  for (let x = 100; x > 0; x -= 0.8 + r() * 2.2) { y = walk(y); pts.push(`${x.toFixed(1)}% calc(100% - ${(y + (r() < 0.3 ? r() * 2 : 0)).toFixed(1)}px)`); }
  pts.push(`0% calc(100% - ${walk(y).toFixed(1)}px)`);
  for (let h = 88; h > 8; h -= 10 + r() * 16) pts.push(`${(r() * 2).toFixed(1)}px ${h.toFixed(1)}%`);
  return `polygon(${pts.join(",")})`;
}

/** Tear a cutting for el's card (once: a card written over keeps its edges and its tilt). Its paper
 *  is drawn by whatever inside it has the "cut" class. */
export function tearOff(el: HTMLElement) {
  style();
  if (el.style.getPropertyValue("--tear")) return;
  el.style.setProperty("--tear", tearPath());
  el.style.setProperty("--tilt", `${((Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 1.1)).toFixed(2)}deg`);
}

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `
.cut{--ink:#1a1714;--muted:#5c544a;--navy:#1d2c5e;--red:#b3121b;position:relative;isolation:isolate;box-sizing:border-box;
  color:var(--ink);text-shadow:none;font-family:"Old Standard TT",Georgia,"Times New Roman",serif;text-align:left;
  rotate:var(--tilt,0deg);filter:drop-shadow(0 14px 18px rgba(0,0,0,.5)) drop-shadow(0 2px 2px rgba(0,0,0,.35))}
.cut::before{content:"";position:absolute;inset:0;z-index:-1;clip-path:var(--tear,none);
  background:linear-gradient(180deg,transparent calc(50% - 2px),rgba(0,0,0,.08) calc(50% - 1px),rgba(255,255,255,.55) calc(50% + 1px),transparent calc(50% + 3px)),
    radial-gradient(rgba(60,50,30,.07) .8px,transparent 1.2px) 0 0/4px 4px,
    linear-gradient(170deg,#f7f4ea,#eee8d8)}
.cut-flag{display:flex;align-items:flex-end;gap:10px;margin:0 44px 8px 0;padding:4px 0 4px;border-bottom:3px double var(--ink);font-size:12px;line-height:1.1}
.cut-flag .chron-mark{font-size:24px;padding-top:0}
.cut-flag .chron-mark small{position:static;display:block;margin:0 0 1px 21.5%;font-size:10px}
.cut-sec{margin-left:auto;padding:3px 8px 2px;background:var(--navy);color:#fff;font-weight:700;letter-spacing:.18em;text-transform:uppercase;white-space:nowrap}
.cut-date{font-style:italic;color:var(--muted);white-space:nowrap}
.cut-front{text-align:center;margin:2px 44px 2px;font-size:clamp(34px,8vw,58px)}
.cut-folio{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;padding:3px 0;border-top:1px solid var(--ink);border-bottom:3px double var(--ink);font-size:12px;font-style:italic;color:var(--muted)}
/* the × (modal.ts), kept in its corner even where a card styles its own buttons */
.cut>.mdl-x.mdl-x{position:absolute;top:6px;right:6px;width:34px;height:34px;padding:0;margin:0;border-radius:50%;border:2px solid #f7f4ea;background:var(--ink);color:#f7f4ea;
  font:800 22px/1 'Barlow Condensed',Impact,sans-serif;letter-spacing:0;text-transform:none;overflow:visible}
.cut>.mdl-x.mdl-x:hover,.cut>.mdl-x.mdl-x:focus-visible{background:var(--red);color:#fff}
@media (pointer:coarse){.cut>.mdl-x.mdl-x{width:44px;height:44px}}
@media (max-width:520px){.cut-date{display:none}.cut-flag .chron-mark{font-size:20px}}
@keyframes cut-in{from{transform:translateY(36px) scale(.94);opacity:0}to{transform:none;opacity:1}}`;
  document.head.appendChild(s);
}
