// A Wanted bounty's own piece of its brief (brief.ts), when J brings the brief back while the bounty
// runs: WANTED, his round of stops with the one he's at picked out, the goes you have left, and how
// to catch him. Everything else of the bounty's (its title card, panel, calls and result) is the
// shared mission screens' (missionscreens.ts), in the poster's red. The pictures are little SVGs
// drawn here, so there's nothing to load. Nothing here goes over the network: wanted.ts says what
// to show.
import { addStyle, esc } from "./hudkit";

export const RED = "#e04848";

addStyle("wanted", `
.wsc .paper{box-sizing:border-box;margin:12px 0 10px;border:1px dashed var(--ink);color:var(--ink);font-size:clamp(14px,2.6vmin,19px);padding:6px 14px 10px}
.wsc .wanted{font:900 clamp(30px,7vmin,58px)/.9 var(--f-hud);letter-spacing:.14em;color:#8a1a14;text-align:center}
.wsc .h{display:block;font:700 clamp(11px,1.9vmin,14px) var(--f-hud);letter-spacing:.18em;text-transform:uppercase;color:#7a2a12;margin:4px 0 2px;text-align:center}
.wsc .route{display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap;font:700 clamp(12px,2.2vmin,16px)/1.1 var(--f-hud);color:#1b1b1d}
.wsc .stop{display:flex;flex-direction:column;align-items:center;width:clamp(48px,9vmin,70px);text-align:center}
.wsc .stop svg{width:clamp(30px,6vmin,44px);height:clamp(30px,6vmin,44px)}
.wsc .stop.now{color:#8a1a14}
.wsc .stop.now svg{filter:drop-shadow(0 0 4px ${RED})}
.wsc .arrow{font-size:1.3em;color:#7a2a12}
.wsc .goes{font:800 clamp(14px,2.6vmin,19px)/1.1 var(--f-hud);letter-spacing:.08em;color:#1b1b1d;margin-top:6px;text-align:center}
.wsc .goes b{color:#8a1a14;letter-spacing:.2em}
.wsc ul{list-style:none;margin:0;padding:0;text-align:left;color:var(--ink);font-weight:400;font-size:clamp(13px,2.4vmin,16px);line-height:1.3}
.wsc li{padding-left:1.1em;text-indent:-1.1em;break-inside:avoid}
.wsc li::before{content:'\\2013  ';color:var(--muted)}
@media (max-height:520px){.wsc .wanted{font-size:28px}.wsc .paper{margin:4px 0 2px;padding:4px 10px 6px}
  .wsc .stop svg{width:28px;height:28px}.wsc ul{font-size:11.5px;line-height:1.2}}`);

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

/** WANTED, his round and the goes left, then how to catch him (html rules), for his brief. */
export function wantedBlock(o: PosterInfo, rules: string[] = []) {
  const route = o.stops.map((st) => `<div class="stop${st.now ? " now" : ""}">${svg(STOP_ART[st.kind])}${esc(st.label.replace(/^an? /, ""))}</div>`).join(`<span class="arrow">→</span>`);
  return `<div class="wsc"><div class="paper"><div class="wanted">WANTED</div>`
    + `<span class="h">His round</span><div class="route">${route}<span class="arrow">↺</span></div>`
    + `<div class="goes">Goes left <b>${"●".repeat(o.goes.left)}${"○".repeat(Math.max(0, o.goes.of - o.goes.left))}</b></div></div>`
    + (rules.length ? `<ul>${rules.map((r) => `<li>${r}</li>`).join("")}</ul>` : "") + `</div>`;
}
