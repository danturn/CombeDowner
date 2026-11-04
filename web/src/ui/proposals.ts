// Proposals on the HUD page's stage: staged mock-ups of how a few pieces could be made one with the
// rest, drawn beside what the game does now, for Dan to look at before any of it is built. Nothing
// here is used by the game: it borrows the game's own frames (cutting.ts, teletext.ts, the meter
// slot) and lays sample words out in them.
import * as MS from "../missionscreens";
import { cutFlag, tearOff } from "../cutting";
import { ttBar } from "../teletext";
import { keycaps, usePrompt } from "../useprompt";
import { addStyle, layer } from "../hudkit";
import { show } from "../show";
import { ctlText } from "../controls";

addStyle("proposals", `
.prop{position:fixed;left:50%;transform:translateX(-50%);z-index:7;pointer-events:none}
.prop .cut{padding:12px 20px 14px;width:min(440px,92vw)}
.prop .kind{font:800 13px var(--f-hud);letter-spacing:.18em;text-transform:uppercase;color:var(--kc)}
.prop .title{font:700 26px/1.05 "Old Standard TT",Georgia,serif;margin:2px 0 6px}
.prop p{margin:0 0 6px;font-size:15px;line-height:1.3}
.prop .reward{font-weight:700;color:#6a4a08}
.prop .act{display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:6px;border-top:1px solid var(--ink);font:800 16px var(--f-hud);letter-spacing:.08em;text-transform:uppercase;color:#1f4a33}
.prop .act kbd{display:inline-block;min-width:1.3em;padding:1px 6px 0;border:1px solid #1f4a33;border-bottom-width:3px;border-radius:3px;font:inherit;text-align:center}
.prop .live{margin:8px 0 4px;padding:6px 10px;border:1px dashed var(--ink);font:700 15px var(--f-hud);letter-spacing:.04em}
.prop .live b{color:var(--kc)}
.prop .live .bar{height:6px;margin-top:5px;background:#0002}
.prop .live .bar i{display:block;height:100%;background:var(--kc)}
.prop.board{top:calc(50% - 40px)}
.prop.board .cut{transform:rotate(-1deg);width:min(380px,92vw)}
.prop.title{top:12%}
.prop.title .cut{width:min(560px,94vw)}
.prop.title .title{font-size:40px}
.prop.title .goal{font:700 20px/1.2 var(--f-hud);margin:2px 0 8px}
.prop-count{position:fixed;z-index:7;pointer-events:none;left:50%;top:72%;transform:translateX(-50%);font:900 110px/1 var(--f-hud);color:#fff;text-shadow:0 4px 0 #000}
.prop.recall{top:14%}
.prop-cap{position:fixed;left:50%;transform:translateX(-50%);top:8px;z-index:60;max-width:min(560px,calc(100vw - 24px));background:#ff3df0;color:#000;font:700 13px/1.3 system-ui,sans-serif;padding:5px 9px}
.prop-map{position:fixed;inset:6% 8%;background:linear-gradient(135deg,#c9c3a8,#b7c49a 40%,#a8b48c);border:2px solid #222;z-index:5}
.prop-map::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(28deg,transparent 0 46px,#f4f0e2 46px 52px),repeating-linear-gradient(118deg,transparent 0 70px,#f4f0e2 70px 75px)}
.prop-map .pint{position:absolute;left:46%;top:44%;width:16px;height:22px;background:#d9932b;border:2px solid #000}
.prop-tt{position:fixed;z-index:8;font-size:19px;pointer-events:none;width:380px}
.prop-tt .ttno,.prop-tt .ttdate{display:none}
.prop-tt .ttbar{font-size:17px;padding:5px 10px 0}
.prop-tt .nm{display:block;margin:4px 10px 0;color:#ff0;font-size:26px;line-height:1}
.prop-tt .inf{margin:2px 10px;color:#0ff}
.prop-tt .why{margin:2px 10px;color:#ff0}
.prop-tt .fast{display:flex;gap:6px;margin:6px 10px 10px}
.prop-tt .fast span{padding:2px 8px;color:#000}
.prop-tt.tip{width:320px}
.prop-tt.tip p{margin:6px 10px 10px;font-size:19px;color:#fff}
`);

const $ = (id: string) => document.getElementById(id)!;
const caption = (text: string) => { const c = document.createElement("div"); c.className = "prop-cap"; c.textContent = text; document.body.appendChild(c); };

/** A job's brief: one cutting from the Chronicle's jobs column, at the board, as the title card,
 *  recalled with J while it runs. Only the bottom of it changes with the moment. */
function brief(where: "board" | "title" | "recall", o: { kind: string; colour: string; title: string; blurb: string; reward: string; foot?: string; goal?: string; live?: string; extra?: string }) {
  const el = document.createElement("div");
  el.className = `prop ${where}`;
  el.style.setProperty("--kc", o.colour);
  const cut = document.createElement("div");
  cut.className = "cut";
  el.appendChild(cut);
  tearOff(cut);
  cut.innerHTML = cutFlag(where === "recall" ? "Jobs · your job" : "Jobs · situations vacant")
    + `<div class="kind">${o.kind}</div><div class="title">${o.title}</div>`
    + (o.goal ? `<div class="goal">${o.goal}</div>` : "")
    + `<p>${o.blurb}</p>${o.extra ?? ""}`
    + (o.live ? `<div class="live">${o.live}</div>` : "")
    + `<p class="reward">Reward: ${o.reward}</p>`
    + (o.foot ? `<div class="act">${keycaps(o.foot)}</div>` : "");
  layer().appendChild(el);
  return el;
}

const GULLS = { kind: "Seagull Attack · ★★☆", colour: "#2a8fc0", title: "Seagull Attack: Chip Tuesday",
  blurb: "Tourists on the benches with their sandwiches, and the gulls of Bath want them. Five waves, then Big Lad himself.", reward: "2 prizes, and a seagull for your head for three stars" };
const WANTED = { kind: "Wanted · ★☆☆", colour: "#c0302a", title: "Wanted: the Kingpin of Kerfuffle",
  blurb: "Runs with a rugby team gone rogue. Catch him and cuff him; lose him three times and he's gone.", reward: "2 prizes and a skateboard" };
const ROUTE = `<div class="live">His round: the Hadley Arms → <b>Firs Field</b> → the bus stop on Church Road ↺</div>`;

export const PROPOSALS: Record<string, Record<string, () => void>> = {
  "p-board": {
    "Now": () => {
      show($("jobposter"), ctlText(`<div class="label" style="color:#2a8fc0">Seagull Attack · ★★☆</div><div class="jobtitle">${GULLS.title}</div><p>${GULLS.blurb}</p><p class="reward">Reward: ${GULLS.reward}</p><em>{use} to take the job</em>`), true);
      usePrompt("<b>{use}</b> Take the job");
      $("clickhint").hidden = false;
      caption("Now: three lines say what E does (the prompt, the poster's foot, and Click to aim), stacked over each other.");
    },
    "Proposed": () => {
      brief("board", { ...GULLS, foot: "<b>{use}</b> Take the job" });
      caption("Proposed: the poster is the brief, and its foot is the use prompt, key cap and all; the separate prompt and Click to aim stay down while you read it.");
    },
  },
  "p-brief": {
    "At the board": () => { brief("board", { ...GULLS, foot: "<b>{use}</b> Take the job" }); caption("1 of 4: the brief, pinned on the noticeboard."); },
    "Title card": () => {
      const el = brief("title", { ...GULLS, goal: "Keep the sandwiches out of the gulls' beaks for 5 waves" });
      void el; const n = document.createElement("div"); n.className = "prop-count"; n.textContent = "3"; layer().appendChild(n);
      caption("2 of 4: take it and the same cutting comes up as the title card, bigger, with the goal, then 3-2-1-GO.");
    },
    "Recall (J)": () => {
      MS.missionProgress({ id: "job", label: "Seagull Attack · ★★☆", colour: "#8fd0f0", goal: "Seagull Attack", progress: "Wave 2 / 5", bar: 5 / 9, hint: "Wave 2 of 5 · 6 gulls about", sub: "5 of 9 bites left" });
      brief("recall", { ...GULLS, live: `Wave <b>2</b> of 5 · <b>5</b> of 9 bites left<div class="bar"><i style="width:40%"></i></div>`, foot: "<b>{job}</b> Put it away" });
      caption("3 of 4: J brings the brief back for any job, with how it's going written on it (Wanted's poster now, for everyone).");
    },
    "Wanted, same frame": () => {
      brief("recall", { ...WANTED, extra: ROUTE, live: `Goes left <b>●●○</b> · 4:12 on the clock`, foot: "<b>{job}</b> Put it away" });
      caption("Wanted's poster is the same brief, with its round of stops as the mode's own block.");
    },
    "Result": () => {
      MS.missionResult({ result: "won", kind: "job", label: "Seagull Attack", title: "Seagulls seen off!", colour: "#8fd0f0", lead: "340", medal: "★★☆", lines: ["7 of 9 bites saved"], rewards: ["2 prizes where you finished", "New in your wardrobe: The gull hat"], sound: null, secs: 600 });
      caption("4 of 4: and it ends on the result card, already a cutting: one object from board to result.");
    },
  },
  "p-meters": {
    "Ride combo now": () => {
      let e = document.getElementById("combo"); if (!e) { e = document.createElement("div"); e.id = "combo"; $("hud").appendChild(e); }
      e.hidden = false; e.className = ""; e.innerHTML = `<b>1,240</b> <i>× 3</i><small>Manual · Wheelie · 180</small><small class="best">Best 2,010</small><span class="bal"><span style="left:40%"></span></span>`;
      MS.missionAux("race-gate", `<div class="aux-big">0:24</div><div class="aux-tag">Checkpoint 3</div>`);
      caption("Now: the ride combo sits on its own high up the screen (top 31%), and the meter slot is somewhere else.");
    },
    "Ride combo in the slot": () => {
      MS.missionAux("race-gate", `<div class="aux-big">0:24</div><div class="aux-tag">Checkpoint 3</div>`);
      MS.missionAux("ride", `<div class="aux-word">Manual · Wheelie · 180</div><div class="aux-big">1,240 <small style="font-size:.5em">× 3</small></div><div class="aux-meter thin"><i style="left:38%;width:6px;background:var(--accent)"></i></div><div class="aux-tag">Best 2,010</div>`);
      caption("Proposed: the combo is a row in the meter slot, under any other meter, and the trick pops land under it.");
    },
    "Flag Lads combo in the slot": () => {
      MS.missionAux("fj", `<div class="aux-word" style="color:#ff4a55">Bunting down</div><div class="aux-big" style="color:#ff4a55;font-style:italic">× 7</div><div class="aux-meter thin"><i style="width:60%;background:#fff"></i></div>`, "#ff4a55");
      caption("Proposed: the Flag Lads' combo the same, in their red, instead of floating at the bottom on its own.");
    },
  },
  "p-map": {
    "Pub card on teletext": () => {
      const m = document.createElement("div"); m.className = "prop-map"; m.innerHTML = `<i class="pint"></i>`; document.body.appendChild(m);
      const c = document.createElement("div"); c.className = "prop-tt card tt";
      Object.assign(c.style, { left: "calc(46% + 30px)", top: "calc(44% - 20px)" });
      c.innerHTML = `${ttBar(600)}<span class="nm">The Hadley Arms</span><div class="inf">0.4 km · hygiene ★★★★★</div><div class="why">A shoot-out's on: finish it first</div><div class="fast"><span style="background:#0f0">Go there</span><span style="background:#ff0">Mark it</span><span style="background:#f00;color:#fff">×</span></div>`;
      document.body.appendChild(c);
      caption("Proposed: the map's pub card is a BathText page (it is page 600 in the pause menu already), with Fastext keys, like every other menu.");
    },
    "Key tip on teletext": () => {
      const m = document.createElement("div"); m.className = "prop-map"; document.body.appendChild(m);
      const c = document.createElement("div"); c.className = "prop-tt tip card tt";
      Object.assign(c.style, { left: "calc(8% + 20px)", top: "20%" });
      c.innerHTML = `${ttBar(601)}<p>Jobs: walk up to a noticeboard to read one. Gold stars are ones you haven't done today.</p>`;
      document.body.appendChild(c);
      caption("Proposed: the key's notes, the hover tips and the pub card share one small teletext card, instead of three looks.");
    },
  },
};
