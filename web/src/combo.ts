// The combo row: one row of the meter slot under the crosshair (missionscreens.ts) for every combo
// you're building, so a ride's tricks and a string of the Flag Lads' flags read as the same thing.
// Each source keeps its own count and its own scoring (ridetricks.ts, flagjuice.ts) and just hands
// its line over to be drawn: the score, the ×count, and a label saying what it is. When two are going
// at once (shooting flags down from a moving board) both lines show in the one row, the newer on top.
//
// Drawn on this screen only: nothing here goes over the network.
import { addStyle, esc } from "./hudkit";
import { missionAuxAdopt } from "./missionscreens";

export interface ComboLine {
  /** The running score (or a word in its place: "Bailed"). */
  score: string;
  /** The ×count beside it, if there is one. */
  mult?: string;
  /** What it is: the tricks in it, "Flag down", "1,240 lost". Plain text. */
  label: string;
  /** Anything under the label (a balance bar, the time left, your bests), as html. */
  more?: string;
  /** bail, done, new: how the line ended. */
  cls?: string;
  /** The score's colour: the HUD's yellow if not given. */
  colour?: string;
}

addStyle("combo", `
#combo{pointer-events:none;color:#fff;font-family:var(--f-hud);text-shadow:0 2px 0 rgba(0,0,0,.6),0 0 10px rgba(0,0,0,.5);gap:2px}
#combo .cb{display:flex;flex-direction:column;align-items:center;line-height:1.05}
#combo .cb b{font-size:30px;font-weight:800;color:var(--kc,var(--accent))}
#combo .cb i{font-size:20px;font-weight:800;font-style:normal;margin-left:4px}
#combo .cb small{display:block;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
#combo .cb+.cb{opacity:.85}
#combo .cb+.cb b{font-size:20px}
#combo .cb+.cb i{font-size:15px}
#combo .cb+.cb small{font-size:12px}
#combo .cb.pop b{animation:cb-pop .22s ease-out}
@keyframes cb-pop{from{transform:scale(1.5)}to{transform:none}}
#combo small.best{font-weight:600;text-transform:none;opacity:.85}
#combo .new small.best{color:var(--accent);opacity:1}
#combo .bail b{color:#ff6a4d}
#combo .bail small{text-decoration:line-through}
#combo .bar{display:block;position:relative;width:120px;height:6px;margin:5px auto 0;border-radius:3px;background:rgba(0,0,0,.5)}
#combo .bar>span{position:absolute;top:-3px;width:4px;height:12px;margin-left:-2px;background:var(--accent)}
#combo .bar>u{position:absolute;inset:0;border-radius:3px;background:#fff;transform-origin:center;transform:scaleX(var(--left,1))}
@media (max-height:500px){#combo .cb b{font-size:24px}}`);

const lines = new Map<string, { line: ComboLine; at: number }>();
let started = 0;   // counts lines as they start, so the newer is on top even within one frame
let shown = "";
let el: HTMLDivElement | null = null;

/** Draw this source's line in the combo row, or take it away with null. pop: the score just went up. */
export function comboLine(src: string, line: ComboLine | null, pop = false) {
  if (!line) { if (!lines.delete(src)) return; }
  else lines.set(src, { line, at: lines.get(src)?.at ?? ++started });
  if (!el) { el = document.createElement("div"); el.id = "combo"; }
  if (!lines.size) { el.hidden = true; el.innerHTML = ""; shown = ""; return; }
  missionAuxAdopt(el);
  el.hidden = false;
  const order = [...lines.entries()].sort((a, b) => b[1].at - a[1].at);
  const html = order.map(([k, { line: l }]) => `<div class="cb ${l.cls ?? ""}" data-src="${k}"${l.colour ? ` style="--kc:${l.colour}"` : ""}>`
    + `<span><b>${esc(l.score)}</b>${l.mult ? `<i>${esc(l.mult)}</i>` : ""}</span><small>${esc(l.label)}</small>${l.more ?? ""}</div>`);
  const key = html.join("");
  if (key !== shown) { el.innerHTML = key; shown = key; }
  if (pop) {
    const row = el.querySelector<HTMLElement>(`.cb[data-src="${src}"]`);
    if (row) { row.classList.remove("pop"); void row.offsetWidth; row.classList.add("pop"); }
  }
}
