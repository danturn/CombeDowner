// The stage of the HUD page (ui.html?stage): the game's own HUD markup, taken from index.html, with
// each piece drawn into it by the game's own functions (missionscreens.ts, notice.ts, useprompt.ts
// and the rest) and sample words from the modes that use them. The few pieces a mode still builds
// out of reach (its own combo meter, the Flag Lads' row) are drawn from a copy of their markup,
// and pieces.ts says so.
import * as MS from "../missionscreens";
import * as WS from "../wantedscreens";
import { notice, noticeClear } from "../notice";
import { usePrompt, keycaps } from "../useprompt";
import { closeModals } from "../modal";
import { STREETS, controlsPage, ctl, ctlText } from "../controls";
import { show } from "../show";
import { Reveal, type Shot } from "../reveal";
import { FlagJuice } from "../flagjuice";
import { Daily } from "../daily";
import * as THREE from "three";
import { PROPOSALS } from "./proposals";

const $ = (id: string) => document.getElementById(id)!;
let hold = 0;          // a timer keeping something that would go by itself on the screen

/** Put the game's HUD on the page, from the game's own page. */
export async function ready() {
  controlsPage(STREETS);
  const html = await (await fetch("./index.html")).text();
  const hud = new DOMParser().parseFromString(html, "text/html").getElementById("hud");
  if (!hud) throw new Error("no #hud in index.html");
  hud.hidden = false;
  const back = document.createElement("div");
  back.id = "uiback";
  document.body.append(back, document.adoptNode(hud));
  const s = document.createElement("style");
  s.textContent = `html,body{margin:0;height:100%;overflow:hidden;background:#000}
#uiback{position:fixed;inset:0}
#uiback.street{background:linear-gradient(#8cc4ec 0,#cfe6f4 46%,#7f8f6a 46.2%,#5f6b4c 70%,#4a4f45 100%)}
#uiback.sky{background:linear-gradient(#5aa7e6,#bfe2fb)}
#uiback.dark{background:radial-gradient(ellipse at 50% 60%,#2a3038,#0c0e11)}
#minimap,#compass{background:rgba(20,26,30,.55);border-radius:50%}
.ui-slot{position:fixed;border:2px dashed #ff3df0;pointer-events:none;z-index:50;box-sizing:border-box}
.ui-slot b{position:absolute;left:0;top:-18px;background:#ff3df0;color:#000;font:700 12px/16px system-ui,sans-serif;padding:0 5px;white-space:nowrap}`;
  document.head.appendChild(s);
  backdrop("street");
}

export function backdrop(kind: string) { $("uiback").className = kind; }

/** Take everything down, as if nothing were on. */
function clear() {
  clearInterval(hold);
  closeModals();
  noticeClear();
  MS.missionClear(); MS.missionCardDrop(); MS.missionResultDrop(); MS.missionWaiting(null); MS.missionWatching(null); WS.wantedScreensDown();
  document.querySelectorAll(".msc,#reveal,.ui-copy,.ui-slot,#fj-combo,#award,#trick,.prop,.prop-count,.prop-cap,.prop-map,.prop-tt").forEach((e) => e.remove());
  for (const id of ["clickhint", "usehint", "shoothint", "jobposter", "bunting", "banner", "scoreboard", "combo", "touch"]) { const e = document.getElementById(id); if (e) e.hidden = true; }
  $("feed").innerHTML = "";
  $("hud").classList.remove("reveal"); document.body.classList.remove("reveal");
  $("scoreboard").classList.remove("join");
}

/** Call fn now and again every ms, for a piece that would otherwise go by itself. */
const keep = (fn: () => void, ms: number) => { fn(); hold = window.setInterval(fn, ms); };
/** ridetricks.ts makes its own #combo on the HUD the first time: so does this. */
const comboEl = () => { let e = document.getElementById("combo"); if (!e) { e = document.createElement("div"); e.id = "combo"; $("hud").appendChild(e); } e.className = ""; return e; };
const feed = (html: string) => { const el = document.createElement("div"); el.innerHTML = html; $("feed").prepend(el); };

const LONG = "Get every last one of the tourists' sandwiches back to the benches by the Abbey before the gulls work out where they went";
const ENTRIES = (o: { title: string; inIt: boolean; n: string[]; left: number; colour?: string; label?: string }) => {
  MS.missionWaiting({ kind: o.title, colour: o.colour, head: `Waiting for players<span class="dots"></span>`, count: o.left, sub: `${o.n.length} in: ${o.n.join(", ")}`,
    small: o.inIt ? "You're in" : `<b>${ctl("use")}</b> to join in` });
  MS.missionProgress({ id: "job", label: o.label ?? "Race", colour: o.colour ?? "#3ec7e8", goal: o.title,
    hint: o.inIt ? `<b class="clue">You're in</b> · starting in ${o.left} s` : `<b class="clue">Entries open</b>: <b>{use}</b> to join in · ${o.left} s`,
    sub: `${o.n.length} in: ${o.n.join(", ")}`, bar: 1 - o.left / 15 });
};

const STOPS: WS.PosterInfo["stops"] = [{ label: "the Hadley Arms", kind: "pub", now: false }, { label: "Firs Field", kind: "park", now: true }, { label: "the bus stop on Church Road", kind: "bus", now: false }];
let juice: FlagJuice | null = null;
const fj = () => (juice ??= new FlagJuice(new THREE.Scene(), { ground: () => 0, solo: () => true })) as any;

const panel = {
  gulls: () => MS.missionProgress({ id: "job", label: "Seagull Attack · ★★☆", colour: "#8fd0f0", goal: "Seagull Attack", progress: "Wave 2 / 5", bar: 5 / 9, hint: "Wave 2 of 5 · 6 gulls about", sub: "5 of 9 bites left · score 120 · chips ×1" }),
  bus: (bell = false) => MS.missionProgress({ id: "bus", label: "Badgerline · Route 2", colour: "#7fe08f", goal: "City centre",
    hint: `Next stop: <b>Church Road</b> · 250 m<br>3 waiting there${bell ? `<br><span class="sign">Bus stopping</span>` : ""}`, sub: "On board 4 · Fares 5 · Moans 1<br>“Cheers drive”" }),
  flags: (here = true) => show($("bunting"), `<div class="label">Flags up <b>27%</b><span class="downs">4 down</span></div><div class="bar"><div style="width:27%"></div></div>`
    + `<em>Pub takeover at <b>The Hadley Arms</b> · 400 m north · 2:40. Get there and clear them out</em>${here ? `<em>Shoot all <b>8</b> flags on <b>Church Road</b> to clear it</em>` : ""}`, true),
};
const rewards = ["2 prizes where you finished", "New in your wardrobe: The gull hat", "Trophy! silver: Seagull Attack, two stars"];

const DRAW: Record<string, Record<string, () => void>> = {
  entries: {
    "Entries open": () => ENTRIES({ title: "BMX climb to Moorlands Recreation Playground", inIt: false, n: ["Ann", "Bo"], left: 11 }),
    "You're in": () => ENTRIES({ title: "Seagull Attack", label: "Seagull Attack", colour: "#8fd0f0", inIt: true, n: ["You", "Ann", "Bo", "Cy"], left: 6 }),
    "Lining up": () => MS.missionWaiting({ kind: "The Lock Run", colour: "#3a8fd8", head: `Lining up<span class="dots"></span>`, sub: "3 in: You, Ann, Bo" }),
    "Long title": () => ENTRIES({ title: "Daily race: trolley dash to the Kingsmead Square fountain and back round the Abbey", inIt: false, n: ["Ann", "Bo", "Cy", "Dee", "Ed", "Flo"], left: 3 }),
  },
  title: {
    Job: () => MS.missionBegin({ label: "Seagull Attack", colour: "#8fd0f0", title: "Seagull Attack", goal: "Keep the sandwiches out of the gulls' beaks for 5 waves", detail: "At Firs Field" }),
    "Long goal": () => MS.missionBegin({ label: "Seagull Attack", colour: "#8fd0f0", title: "Seagull Attack: the hen do", goal: LONG, detail: "At the benches by the Abbey" }),
    Race: () => MS.missionBegin({ label: "Race", colour: "#3ec7e8", title: "BMX climb to Moorlands Recreation Playground", goal: "Race through every checkpoint and over the line first", detail: "3 in: You, Ann, Bo", best: "silver" }),
    Wanted: () => MS.missionBegin({ label: "Wanted", colour: "#e04848", title: "Wanted: the Duke of Disorder", goal: "Catch him and cuff him. Lose him three times and he's gone", detail: "At the Hadley Arms" }),
    "Challenge, with a best": () => MS.missionBegin({ label: "Challenge", colour: "#3a8fd8", title: "The Lock Run", goal: "Take the boat down the flight with its barrels", detail: "At Bath Locks", best: "4 barrels" }),
    Bonfire: () => MS.missionBegin({ title: "Get Wood", goal: "Build Kingswood's bonfire: 25 bundles on the pile", detail: "Carry them down to the court, then walk up to the pile", label: "Bonfire", colour: "#ff9a3c" }),
    "Bus driver": () => MS.missionBegin({ label: "Badgerline · Route 2", colour: "#7fe08f", title: "You're on the 2", goal: "the bus station to Combe Down and back. Follow the green line, and stop for anyone waiting" }),
    "Pub takeover": () => MS.missionBegin({ label: "Pub takeover", colour: "#b45cff", title: "The Flag Lads have taken over The Hadley Arms!", goal: "Follow the purple marker and clear them out" }),
    "Shoot-out": () => MS.missionBegin({ label: "Shoot-out", colour: "#58e06a", title: "Shoot-out!", goal: "Five kicks each. You kick first" }),
    "Long, two-line title": () => MS.missionBegin({ label: "Challenge", colour: "#f2c318", title: "Push the Bus all the way up Horsecombe Vale", goal: "Push the bus to the top of the hill: {use} at its back, then {heave} on every HEAVE! Miss the heaves and it rolls back", detail: "At the bottom of Horsecombe Vale" }),
  },
  count: Object.fromEntries([["3", 3], ["2", 2], ["1", 1], ["GO!", 0]].map(([k, n]) => [k, () => keep(() => MS.missionCountdown(n as number, "#3ec7e8"), 800)])),
  notice: {
    Call: () => keep(() => notice({ text: "You splatted Ann", secs: 30 }), 25000),
    "Call with a key": () => keep(() => notice({ text: ctlText("Your bus is here. {use} to get on"), secs: 30 }), 25000),
    "Long call (as a note)": () => keep(() => notice({ text: "The Flag Lads have taken over The Hadley Arms! Follow the purple marker and clear them out", secs: 30 }), 25000),
    Note: () => keep(() => notice({ tier: "note", text: "Mr Pratt: “Mirrors, signal, manoeuvre. In that order, ideally.”", secs: 30 }), 25000),
    "Stage: wave": () => keep(() => MS.missionCall({ text: "Wave 2 of 5: Hoverers", sub: "Hoverers: stare them out · 3 hoverers, in from the north-east", colour: "#8fd0f0", secs: 30 }), 25000),
    "Stage: checkpoint split": () => keep(() => MS.missionCall({ text: "Checkpoint 2 of 4", sub: "0:41.2 (-1.3 on your best) · -0.8 s on gold pace · +20 s", colour: "#58e06a", secs: 30 }), 25000),
    "Stage: life lost": () => keep(() => MS.missionCall({ text: "A life gone!", sub: "Ann fell", colour: "#d8262e", secs: 30 }), 25000),
    "Stage: out of lives": () => keep(() => MS.missionCall({ text: "Out of lives", sub: "Back to the bottom: the whole team starts again · 3 lives for the next go", colour: "#d8262e", secs: 30 }), 25000),
    "Stage: he got away": () => keep(() => MS.missionCall({ text: "He got away!", sub: "2 goes left. He's off to Firs Field: he's on your map", colour: "#e04848", secs: 30 }), 25000),
    Trick: () => keep(() => notice({ tier: "trick", text: "Bunting down! +400", sub: "from a bus", colour: "#ffd34a", secs: 30 }), 25000),
    "Award: trophy": () => notice({ tier: "award", kicker: "Trophy! gold", text: "Top of the Abbey", sub: "Climb Bath Abbey and put on the wings at the top", colour: "#ffc83a", secs: 60 }),
    "Award: wardrobe": () => notice({ tier: "award", kicker: "New in your wardrobe", text: "The gull hat", secs: 60 }),
  },
  combo: {
    Combo: () => show(comboEl(), `<b>1,240</b> <i>×3</i><small>kickflip + manual + rail grind 3.2 m</small>`),
    Bailed: () => { show(comboEl(), `<b>1,240</b> <i>×3</i><small>Bailed</small>`); $("combo").className = "bail"; },
    "New best": () => { show(comboEl(), `<b>2,980</b><small class="best">New best!</small>`); $("combo").className = "new"; },
  },
  fjcombo: { x3: () => fj().write(`<b>x3!</b><i>300</i><u style="--left:0.70"></u>`, "a"), x7: () => fj().write(`<b>x7!</b><i>1840</i><u style="--left:0.25"></u>`, "b") },
  mprog: {
    "Seagull Attack": panel.gulls,
    Race: () => MS.missionProgress({ id: "job", label: "Race · ★★☆", colour: "#3ec7e8", goal: "BMX climb to Moorlands Recreation Playground", progress: "2 / 4", bar: 0.5, timer: "0:45.2", hint: "120 m to <b>Checkpoint 3/4</b>, north-west", sub: "Gold 1:20 · silver 1:35 · bronze 1:50" }),
    Wanted: () => MS.missionProgress({ id: "job", label: "Wanted · ★★☆", colour: "#e04848", goal: "Wanted: the Duke of Disorder", bar: 0.8, timer: "12:03 left", hint: "He's at <b>the Hadley Arms</b>, 200 m north. Get close and he'll run", sub: "Goes left ●●○ · then Firs Field · poster: {job}" }),
    "Challenge, with lives": () => MS.missionProgress({ id: "job", label: "Challenge · ★★★", colour: "#e9e1cf", goal: "The Climb", progress: "Ledge 2 / 6", bar: 2 / 6, hint: `${MS.hearts(2, 3)} Get everyone to the top together`, sub: "Climbers: 3 · Ann on the rope" }),
    Bonfire: () => MS.missionProgress({ id: "bonfire", label: "Bonfire", colour: "#ff9a3c", goal: "Build the bonfire", progress: "7 / 25", bar: 7 / 25, hint: "Carrying wood: take it to the pile" }),
    "Bus driver": () => panel.bus(),
    "Bus stopping": () => panel.bus(true),
    "Shoot-out": () => MS.missionProgress({ id: "shootout", label: "Shoot-out", colour: "#58e06a", goal: "Ann 3 – 2 Bo", hint: "Ann to kick: 4 of 5" }),
    "Flash (just changed)": () => { MS.missionProgress({ id: "job", label: "Challenge · ★★★", colour: "#3a8fd8", goal: "The Lock Run", progress: "1 / 5", bar: 0.2, hint: "Shut the top gates", flash: "a" }); MS.missionProgress({ id: "job", label: "Challenge · ★★★", colour: "#3a8fd8", goal: "The Lock Run", progress: "1 / 5", bar: 0.2, hint: "Open the bottom paddles ({use})", flash: "b" }); },
    "Long text": () => MS.missionProgress({ id: "job", label: "Challenge · ★★★", colour: "#f2c318", goal: "Push the Bus all the way up Horsecombe Vale", progress: "37%", bar: 0.37, hint: "{use} at the back to push, then {heave} on every HEAVE! · 3 pushing · Bea in the cab · you call", sub: "Time it to the bar. Miss the heaves and you'll tire, and it rolls back. A naughty boy's on the roof: shoot him off" }),
  },
  stack: {
    "Job, bus and Flag Lads": () => { panel.gulls(); panel.bus(); panel.flags(false); },
    "Job and Flag Lads": () => { panel.gulls(); panel.flags(); },
    "Flag Lads alone": () => panel.flags(),
  },
  aux: {
    "Gate clock": () => MS.missionAux("race-gate", `<div class="aux-big">0:24</div><div class="aux-tag">CHECKPOINT 3</div>`),
    "Gate clock, running out": () => MS.missionAux("race-gate", `<div class="aux-big" style="color:#ff5a4e">0:07.4</div><div class="aux-tag">CHECKPOINT 3</div>`),
    "Push the Bus beat": () => MS.missionAux("push-beat", `<div class="aux-word">Ann calls</div><div class="aux-big" style="color:#f2c318">Heave!</div>`
      + `<div class="aux-meter"><i style="left:30%;width:40%;background:#ff8a3a;opacity:.75"></i><i style="left:40%;width:20%;background:#f2c318"></i><i style="left:46%;width:8%;background:#4dff8e"></i><i style="left:49%;width:6px;background:#fff"></i></div>`, "#f2c318"),
    "Push the Bus cab": () => MS.missionAux("push-cab", `<div class="aux-panel"><div class="aux-big" style="font-size:26px;color:#ff9a8a">▼ ROLLING BACK 2.1 m/s</div><div class="aux-tag">Handbrake off · ${ctlText("{handbrake}")} to hold it</div>`
      + `<div class="aux-meter" style="margin:6px 0 2px"><i style="width:45%;background:#ffb21f"></i></div><div class="aux-word" style="color:#fff">A car coming down, 80 m</div></div>`, "#f2c318"),
    "Climb grip": () => MS.missionAux("climb-grip", `<div class="aux-meter thin"><i style="width:30%;background:#e9e1cf"></i><i style="left:auto;right:0;width:15%;background:rgba(160,40,30,.7)"></i></div>`),
  },
  banner: {
    "Going up": () => show($("banner"), `<div class="label">Banner going up at <b>The Hadley Arms</b> · 2 on the ladder</div><div class="bar"><div style="width:40%"></div></div><em>Shoot the lads on the ladder to knock it back</em>`, true),
    "Nearly up": () => { show($("banner"), `<div class="label">Banner going up at <b>The Hadley Arms</b> · 2 on the ladder</div><div class="bar"><div style="width:82%"></div></div><em>Nearly up! Shoot the lads on the ladder to knock it back</em>`, true); $("banner").classList.add("late"); },
  },
  spec: { Standings: () => MS.missionWatching({ head: "Finished", sub: "2nd, 1:23.4", small: "Watching Bo · ◀ ▶ to switch", rows: [{ name: "Ann", time: "1:20.1" }, { name: "You", time: "1:23.4", me: true }, { name: "Bo", time: "riding", watch: true }], many: true }) },
  feed: { "Three lines": () => { feed(`<b style="color:#ffd84a">Ann</b> took on a job: <b style="color:#8fd0f0">Seagull Attack</b>`); feed(`<b>The Hadley Arms</b> won back from the Flag Lads`); feed(`Bo fell: the team's down to 2 lives`); } },
  slots: {
    Desktop: () => slotMap(false),
    Touch: () => slotMap(true),
  },
  use: {
    "Take the job": () => usePrompt("<b>{use}</b> Take the job"),
    Challenge: () => usePrompt("<b>{use}</b> The Lock Run"),
    Busy: () => usePrompt("Finish or call off your job first"),
    "Get in": () => usePrompt("<b>{use}</b> Get in the Badgerline bus"),
    Riding: () => usePrompt("Riding in the Badgerline bus · <b>{use}</b> to get out"),
    "Job's own": () => usePrompt("<b>{use}</b> Shout at the gulls"),
    "Touch key cap": () => { $("touch").hidden = false; usePrompt("<b>{use}</b> Take the job"); $("usehint").classList.add("touch"); $("usehint").querySelector("kbd")!.textContent = "Use"; },
    "Keeper (shoot-out)": () => show($("shoothint"), keycaps("You're in goal: hold {steer} to one side and press {dive} to dive"), true),
  },
  poster: {
    Job: () => poster("Seagull Attack · ★★☆", "#8fd0f0", "Seagull Attack", "Tourists on the benches with their sandwiches, and the gulls are circling. Five waves, then Big Lad himself.", "Two prizes and the gull hat", "{use} to take the job"),
    Challenge: () => poster("Challenge · ★★★", "#3a8fd8", "The Lock Run", "Take the boat down the flight with its barrels, working the paddles and gates as you go.", "Something strange, left where you finish", "{use} to start it"),
    "Done today": () => poster("Race · ★★☆", "#3ec7e8", "BMX climb to Moorlands Recreation Playground", "Up the hill on a BMX, through every checkpoint.", "A traffic cone for your head", "Done today"),
  },
  wposter: { Poster: () => WS.wantedPoster({ title: "Wanted: the Duke of Disorder", stops: STOPS, goes: { left: 2, of: 3 }, foot: "<b>12:03</b> left",
    rules: ["<b>He's on your map.</b> Get close and he legs it: he's quicker than you, but soon out of puff.", "<b>Catch him and cuff him</b> (<b>{use}</b>). A paintball hit winds him.", "<b>Three goes.</b> Fall too far behind and he's off to his next stop."] }) },
  result: {
    "Job done, with rewards": () => MS.missionResult({ result: "won", label: "Seagull Attack", title: "Seagulls seen off!", lead: "340", medal: "★★☆", lines: ["7 of 9 bites saved"], colour: "#8fd0f0", rewards, sound: null }),
    "Job failed": () => MS.missionResult({ result: "lost", label: "Push the Bus", title: "It got away from you", lines: ["Back down Horsecombe Vale and smashed into a car"], colour: "#f2c318", sound: null }),
    "Called off": () => MS.missionResult({ result: "lost", label: "The Lock Run", title: "Job called off", lines: ["Ann called it off"], colour: "#3a8fd8", sound: null }),
    "Race: gold": () => MS.missionResult({ result: "won", kind: "race", label: "BMX climb to Moorlands Recreation Playground", title: "Winner!", place: 1, lead: "1:18.6", medal: "Gold medal", lines: ["1.4 s inside gold"], best: "NEW BEST! 2.1 s quicker",
      stats: [{ k: "Top speed", v: "31 mph" }, { k: "Boosts", v: "3" }], rows: [{ name: "You", time: "1:18.6", me: true }, { name: "Ann", time: "1:22.0" }, { name: "Bo", time: "–", dnf: true }],
      rewards: ["A traffic cone for your head", "2 prizes at the finish", "Gold in your trophy cabinet"], colour: "#3ec7e8", again: () => {}, sound: null }),
    "Race: did not finish": () => MS.missionResult({ result: "lost", kind: "race", label: "Trolley dash to The Porter", title: "Out of time", lead: "2:30.0", medal: "No medal", lines: ["Checkpoint 3 of 5 · 60% of the route"], stats: [{ k: "Checkpoints", v: "2/5" }], colour: "#3ec7e8", again: () => {}, sound: null }),
    "Wanted: cuffed": () => MS.missionResult({ result: "won", kind: "wanted", label: "Wanted · the Duke of Disorder", title: "Cuffed!", lead: "6:12", medal: "Caught", lines: ["You cuffed him first go"], stats: [{ k: "Goes left", v: "3/3" }, { k: "Stars", v: "★★" }], rewards: ["2 prizes and a pogo stick"], colour: "#e04848", sound: null }),
    "Wanted: got away": () => MS.missionResult({ result: "lost", kind: "wanted", label: "Wanted · the Duke of Disorder", title: "He got away", lead: "15:00", medal: "Escaped", lines: ["He slipped away for good"], stats: [{ k: "Goes left", v: "0/3" }], colour: "#e04848", sound: null }),
    "Bonfire built": () => MS.missionResult({ result: "won", label: "Bonfire", title: "Bonfire built!", colour: "#ff9a3c", lines: ["Kingswood's bonfire is ready", "It's lit at dark"], sound: null }),
    "Shift over": () => MS.missionResult({ result: "over", kind: "bus", label: "Badgerline · Route 2", title: "Shift over", colour: "#7fe08f", lines: [`5 fares, 2 "cheers drive", 1 moan`], sound: null }),
    "Pub won back": () => MS.missionResult({ result: "won", label: "Pub takeover", title: "The Hadley Arms is won back!", colour: "#58e06a", lines: ["Flags down, everyone welcome.", "There's a ride outside, and the odd round on the house"], sound: null }),
    "Town safe": () => MS.missionResult({ result: "won", label: "The Flag Lads", title: "Bath is safe from the Flag Lads", colour: "#58e06a", lines: ["Not a flag left on a lamp post.", "They won't be back for 3 days."], sound: null }),
    "Long title": () => MS.missionResult({ result: "won", kind: "challenge", label: "The Climb", title: "The whole team stood on top of the crag together, every one of them", lines: ["Three lives to spare, and nobody carried up the last ledge"], rewards: ["Something strange, left where you finished"], colour: "#e9e1cf", sound: null }),
  },
  variants: {
    "Driving test: pass": () => MS.missionSheet({ kind: "Driving test report · test 1 of 3", title: "The Driving Test", who: "Candidate: You · Examiner: Mr Pratt", stamp: "PASS", good: true, sections: [{ head: "Minor faults: 2", lines: ["Too far from the kerb", "Late signal"] }, { head: "Serious", lines: [] }, { head: "Dangerous", lines: [] }], foot: "Two minors. Well driven.", sound: null }),
    "Driving test: fail": () => MS.missionSheet({ kind: "Driving test report · test 2 of 3", title: "The Driving Test", who: "Candidate: Ann · Examiner: Mr Pratt", stamp: "FAIL", good: false, sections: [{ head: "Minor faults: 4", lines: ["Too far from the kerb", "Late signal", "Hesitation", "Mirrors"] }, { head: "Serious", lines: ["Went through a red light"] }, { head: "Dangerous", lines: ["The examiner had to brake"] }], sound: null }),
    "Night out front page": () => MS.missionNight({ pub: "The Hadley Arms", head: "Whole room makes last orders at the Hadley", stand: "Six regulars, one stolen bus and a gull with a chip", by: "By our chief reporter",
      body: ["They came from all over Bath for one for the road, and the landlord says he has never seen the like.", "Ann won the race there by a length; Bo came in on the back of a milk float."], items: [{ head: "Weather", text: "Bright spells, flags drooping" }, { head: "Seagulls", text: "Restless" }, { head: "Lost", text: "One sandwich" }] }),
    "Gallery verdict": () => MS.missionResult({ result: "won", kind: "arts", variant: "verdict", label: "The Art Gallery · private view", title: "A triumph, darling", colour: "#c2185b", lead: "7.2", medal: "needed 6.0", sound: null,
      body: `<div class="cols"><div><h4>Mr Pettigrew</h4>8 · “Bold. Possibly a dog.”</div><div><h4>Lady Stanhope</h4>7 · “I have seen worse in Bristol.”</div><div><h4>The punters</h4>6.5 · “Is it for sale?”</div></div>` }),
  },
  chron: { "On joining": () => {
    const d = new Daily(() => {}, () => `<b>The Flag Lads</b> have flagged <b>21%</b> of Bath.`, () => "Bath", () => ({ kicker: "News from Bath", no: 1, strap: "Flag Lads arrive in Bath", lead: "<p>A van full of cable ties was seen at dawn. By breakfast there were flags on the lamp posts.</p>", side: "<h4>How to help</h4><p>Shoot the flags off the lamp posts.</p>", small: "" } as any));
    const b = $("scoreboard"); b.hidden = false; b.classList.add("join"); d.draw($("daily"));
  } },
  reveal: {
    "New zone": () => revealCard({ kind: "spot", x: 0, z: 0, kicker: "A new part of the map is open", title: "Widcombe", sub: "New challenge: Bell Ringing", lines: ["The buses run out this way now"] }),
    "Whole map": () => revealCard({ kind: "map", x: 0, z: 0, kicker: "Every zone is open", title: "The whole map is yours" }),
  },
};

function poster(label: string, colour: string, title: string, blurb: string, reward: string, foot: string) {
  show($("jobposter"), ctlText(`<div class="label" style="color:${colour}">${label}</div><div class="jobtitle">${title}</div><p>${blurb}</p><p class="reward">Reward: ${reward}</p><em>${foot}</em>`), true);
}
function revealCard(s: Shot) {
  const r = new Reveal(null as never, () => false) as any;
  r.card(s);
  document.getElementById("reveal")?.classList.add("shown");
}

/** Everything that stays up, at once, with each slot outlined and named: the layout's map. */
function slotMap(touch: boolean) {
  if (touch) $("touch").hidden = false;
  $("where").textContent = "Church Road";
  panel.gulls(); panel.bus(); panel.flags(false);
  feed("Ann took on a job: <b>Seagull Attack</b>"); feed("Bo fell: the team's down to 2 lives");
  usePrompt("<b>{use}</b> Get in the Badgerline bus");
  MS.missionAux("race-gate", `<div class="aux-big">0:24</div><div class="aux-tag">CHECKPOINT 3</div>`);
  notice({ text: "You splatted Ann", secs: 60 });
  notice({ tier: "trick", text: "Bunting down! +400", colour: "#ffd34a", secs: 60 });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const out = (id: string, name: string) => {
      const el = document.getElementById(id);
      if (!el || el.hidden) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const b = document.createElement("div");
      b.className = "ui-slot";
      Object.assign(b.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
      b.innerHTML = `<b>${name}</b>`;
      document.body.appendChild(b);
    };
    out("mstack", "top left: mission panels + Flag Lads row");
    out("minimap", "top right: minimap");
    out("feed", "feed");
    out("trick", "trick");
    out("health", "bottom left: health");
    out("ammo", "bottom right: rounds / vehicle");
    out("where", "street name");
    out("usehint", "use prompt");
    out("maux", "meter slot");
    out("toast", "call / note");
  }));
}

/** Draw piece id in state (its first, if not given). */
export function draw(id: string, state: string) {
  clear();
  const p = DRAW[id] ?? PROPOSALS[id];
  if (!p) return;
  (p[state] ?? Object.values(p)[0])();
}

export const states = (id: string) => Object.keys(DRAW[id] ?? PROPOSALS[id] ?? {});
