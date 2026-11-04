// A job's brief: one cutting from the Chronicle's jobs column (cutting.ts) that is the same thing at
// every moment of a job, so what you read at the noticeboard is what comes up when you take it and
// what J brings back while it runs; the result card at the end is a cutting too (missionscreens.ts).
//
//   board   pinned under the crosshair while you read a noticeboard (quests.ts). Its foot is what E
//           does there, key cap and all, so the use prompt and "Click to aim" stand down while it's
//           up, and on a touch screen the key cap is the button.
//   title   the title card as a job, a challenge or anything else begins (missionscreens.ts
//           missionBegin): the same cutting, larger, at the top, with the goal.
//   recall  J (the job control) while a job runs: the brief again with how it's going written on
//           it, and the mode's own block (a Wanted bounty's round of stops).
//
// The band over the crosshair is kept for calls in the middle of a mission (missionCall), where a
// piece of newspaper would be in the way. Only the words differ from mode to mode: each keeps its
// colour as the swatch by its kind. Nothing here goes over the network.
import { cutFlag, tearOff } from "./cutting";
import { addStyle, esc } from "./hudkit";
import { keycaps } from "./useprompt";
import { ctlText } from "./controls";
import type { JobKind, Offer } from "./quests";

export type BriefAt = "board" | "title" | "recall";

export interface Brief {
  /** The kind of job, small over the title ("Seagull Attack · ★★☆"), with its colour as a swatch. */
  label?: string; colour?: string;
  title: string;
  /** What to do, in a line (the title card's). */
  goal?: string;
  /** The poster's words (html). */
  blurb?: string;
  /** The mode's own piece of the poster (html): a race's board, a bounty's round. */
  block?: string;
  /** How it's going (html), on the recalled brief. */
  live?: string;
  /** Small lines under the goal: where, who's in, your best. */
  detail?: string; best?: string;
  reward?: string;
  /** What a press does (html with {control}s drawn as key caps), along the foot. */
  foot?: string;
}

const SECTION: Record<BriefAt, string> = { board: "Jobs · situations vacant", title: "Jobs · today", recall: "Jobs · your job" };

addStyle("brief", `
.brief{width:min(440px,92vw);padding:12px 20px 14px;text-align:left;text-shadow:none;font-weight:400;letter-spacing:0;text-transform:none}
.brief .bkind{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.brief .bkind::before{content:"";display:inline-block;width:9px;height:9px;margin-right:6px;background:var(--kc,var(--ink))}
.brief .btitle{font-weight:700;font-size:26px;line-height:1.05;margin:2px 0 6px;text-wrap:balance}
.brief .bgoal{font-weight:700;font-size:18px;line-height:1.2;margin:0 0 6px}
.brief .bdetail{font-size:14px;font-style:italic;color:var(--muted);margin:0 0 6px}
.brief .bdetail.best{font-style:normal;font-weight:700;color:var(--ink)}
.brief .bblurb{font-size:15px;line-height:1.3;margin:0 0 6px}
.brief .bblurb b,.brief .bblock b{color:var(--ink)}
.brief .blive{margin:6px 0;padding:6px 10px;border:1px dashed var(--ink);font-weight:700;font-size:15px;line-height:1.3}
.brief .blive .bar{height:6px;margin-top:5px;background:#0002}
.brief .blive .bar i{display:block;height:100%;background:var(--kc,var(--ink))}
.brief .breward{font-weight:700;font-size:15px;color:#6a4a08;margin:4px 0 0}
.brief .bfoot{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:8px;padding-top:6px;border-top:1px solid var(--ink);font-weight:700;font-size:16px}
.brief kbd{display:inline-block;min-width:1.3em;padding:1px 6px 0;margin-right:3px;border:1px solid var(--ink);border-bottom-width:3px;border-radius:3px;font:inherit;text-align:center;line-height:1.15}
.brief.touch kbd[data-ctl]{pointer-events:auto;padding:4px 12px 3px;background:#0001;cursor:pointer}
@media (max-width:600px),(max-height:500px){
  .brief{padding:8px 14px 10px}
  .brief .btitle{font-size:20px;margin-bottom:3px}
  .brief .bgoal{font-size:15px}
  .brief .bblurb{display:none}
  .brief .cut-flag{margin-bottom:4px}
  .brief .bfoot{margin-top:4px;padding-top:4px;font-size:14px}
}
@media (max-height:500px){.brief .wsc ul{display:none}.brief .wsc .paper{margin:2px 0}}`);

/** The words of a brief at that moment, for a cutting (the element with the "cut" class). */
export function briefHtml(at: BriefAt, b: Brief): string {
  return cutFlag(SECTION[at])
    + (b.label ? `<div class="bkind">${esc(b.label)}</div>` : "")
    + `<div class="btitle">${esc(b.title)}</div>`
    + (b.goal ? `<div class="bgoal">${esc(ctlText(b.goal))}</div>` : "")
    + (b.detail ? `<div class="bdetail">${esc(ctlText(b.detail))}</div>` : "")
    + (b.best ? `<div class="bdetail best">Your best: ${esc(b.best)}, beat it</div>` : "")
    + (b.blurb ? `<p class="bblurb">${ctlText(b.blurb)}</p>` : "")
    + ctlText(b.block ?? "")
    + (b.live ? `<div class="blive">${ctlText(b.live)}</div>` : "")
    + (b.reward ? `<p class="breward">Reward: ${esc(b.reward)}</p>` : "")
    + (b.foot ? `<div class="bfoot">${keycaps(b.foot)}</div>` : "");
}

/** Make el a brief's cutting (once), in the job's colour. */
export function briefCut(el: HTMLElement, colour?: string) {
  el.classList.add("brief", "cut");
  tearOff(el);
  if (colour) el.style.setProperty("--kc", colour); else el.style.removeProperty("--kc");
}

/** The rest of a job's brief for its title card, as its noticeboard had it: the goal stands in for
 *  the poster's words and its own piece, which you've just read, so the card stays a glance. */
export function briefMore(o: Offer, _kind: JobKind) {
  return { reward: o.reward };
}
