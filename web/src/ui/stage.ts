// The stage of the HUD page (ui.html?stage): the game's own HUD markup, taken from index.html, with
// each piece drawn into it by the game's own functions and sample words from the modes that use
// them. Where a mode builds its piece inside a class or a closure that can't be reached without the
// mode running, the piece is drawn from a copy of that markup, and pieces.ts says so: that a piece
// can't be drawn on its own is part of what this page shows.
import * as MS from "../missionscreens";
import * as WS from "../wantedscreens";
import { closeModals } from "../modal";
import { STREETS, controlsPage, ctl, ctlText } from "../controls";
import { show } from "../show";
import { pop } from "../pop";
import { Reveal, type Shot } from "../reveal";
import { FlagJuice } from "../flagjuice";
import { Daily } from "../daily";
import { award, TROPHIES } from "../trophies";
import * as THREE from "three";

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
#minimap,#compass{background:rgba(20,26,30,.55);border-radius:50%}`;
  document.head.appendChild(s);
  backdrop("street");
}

export function backdrop(kind: string) { $("uiback").className = kind; }

/** Take everything down, as if nothing were on. */
function clear() {
  clearInterval(hold);
  closeModals();
  MS.missionClear(); MS.missionCardDrop(); MS.missionResultDrop(); MS.missionWaiting(null); MS.missionWatching(null); WS.wantedScreensDown();
  document.querySelectorAll(".msc,.rsc-end,#reveal,.ui-copy,#fj-combo,#fj-call,#trophytoast").forEach((e) => e.remove());
  for (const id of ["usehint", "jobposter", "bunting", "banner", "buscard", "shootcard", "scoreboard", "combo"]) { const e = document.getElementById(id); if (e) e.hidden = true; }
  $("toast").classList.remove("show"); $("toast").textContent = "";
  $("feed").innerHTML = "";
  $("hud").classList.remove("reveal"); document.body.classList.remove("reveal");
  $("scoreboard").classList.remove("join");
}

/** Call fn now and again every ms, for a piece that would otherwise go by itself. */
const keep = (fn: () => void, ms: number) => { fn(); hold = window.setInterval(fn, ms); };
const toast = (text: string) => { const el = $("toast"); el.textContent = ctlText(text); pop(el); el.classList.add("show"); };
/** A piece a mode builds out of reach: its markup, copied, in the HUD (or on the body, where the mode puts it). */
function copy(html: string, css: string, onBody = false) {
  const el = document.createElement("div");
  el.className = "ui-copy";
  el.style.cssText = css;
  el.innerHTML = html;
  (onBody ? document.body : $("hud")).appendChild(el);
}
/** ridetricks.ts makes its own #combo on the HUD the first time: so does this. */
const comboEl = () => { let e = document.getElementById("combo"); if (!e) { e = document.createElement("div"); e.id = "combo"; $("hud").appendChild(e); } e.className = ""; return e; };
const feed = (html: string) => { const el = document.createElement("div"); el.innerHTML = html; $("feed").prepend(el); };

const LONG = "Get every last one of the tourists' sandwiches back to the benches by the Abbey before the gulls work out where they went";
const ENTRIES = (o: { title: string; inIt: boolean; n: string[]; left: number; colour?: string; label?: string }) => {
  MS.missionWaiting({ kind: o.title, head: `Waiting for players<span class="dots"></span>`, count: o.left, sub: `${o.n.length} in: ${o.n.join(", ")}`,
    small: o.inIt ? "You're in" : `<b>${ctl("use")}</b> to join in` });
  MS.missionProgress({ id: "job", label: o.label ?? "Race", colour: o.colour ?? "#3ec7e8", goal: o.title,
    hint: o.inIt ? `<b class="clue">You're in</b> · starting in ${o.left} s` : `<b class="clue">Entries open</b>: <b>{use}</b> to join in · ${o.left} s`,
    sub: `${o.n.length} in: ${o.n.join(", ")}`, bar: 1 - o.left / 15 });
};

export const STOPS: WS.PosterInfo["stops"] = [{ label: "the Hadley Arms", kind: "pub", now: true }, { label: "Firs Field", kind: "park", now: false }, { label: "the bus stop on Church Road", kind: "bus", now: false }];
let juice: FlagJuice | null = null;
const fj = () => (juice ??= new FlagJuice(new THREE.Scene(), { ground: () => 0, solo: () => true })) as any;

const DRAW: Record<string, Record<string, () => void>> = {
  entries: {
    "Entries open": () => ENTRIES({ title: "BMX climb to Moorlands Recreation Playground", inIt: false, n: ["Ann", "Bo"], left: 11 }),
    "You're in": () => ENTRIES({ title: "Seagull Attack", label: "Seagull Attack", colour: "#8fd0f0", inIt: true, n: ["You", "Ann", "Bo", "Cy"], left: 6 }),
    "Lining up": () => MS.missionWaiting({ kind: "The Lock Run", head: `Lining up<span class="dots"></span>`, sub: "3 in: You, Ann, Bo" }),
    "Long title": () => ENTRIES({ title: "Daily race: trolley dash to the Kingsmead Square fountain and back round the Abbey", inIt: false, n: ["Ann", "Bo", "Cy", "Dee", "Ed", "Flo"], left: 3 }),
  },
  title: {
    Job: () => MS.missionBegin({ label: "Seagull Attack", colour: "#8fd0f0", title: "Seagull Attack", goal: "Keep the sandwiches out of the gulls' beaks for 5 waves", detail: "At Firs Field" }),
    "Long goal": () => MS.missionBegin({ label: "Seagull Attack", colour: "#8fd0f0", title: "Seagull Attack: the hen do", goal: LONG, detail: "At the benches by the Abbey" }),
    Race: () => MS.missionBegin({ label: "Race", colour: "#3ec7e8", title: "BMX climb to Moorlands Recreation Playground", goal: "Race through every checkpoint and over the line first", detail: "3 in: You, Ann, Bo", best: "silver" }),
    Wanted: () => MS.missionBegin({ label: "Wanted", colour: "#e04848", title: "Wanted: the Duke of Disorder", goal: "Catch him and cuff him. Lose him three times and he's gone", detail: "At the Hadley Arms" }),
    "Challenge, with a best": () => MS.missionBegin({ label: "Challenge", colour: "#3a8fd8", title: "The Lock Run", goal: "Take the boat down the flight with its barrels", detail: "At Bath Locks", best: "4 barrels" }),
    Bonfire: () => MS.missionBegin({ title: "Get Wood", goal: "Build Kingswood's bonfire: 25 bundles on the pile", detail: "Carry them down to the court, then walk up to the pile", label: "Bonfire", colour: "#ff9a3c" }),
    "Long, two-line title": () => MS.missionBegin({ label: "Challenge", colour: "#f2c318", title: "Push the Bus all the way up Horsecombe Vale", goal: "Push the bus to the top of the hill: {use} at its back, then {heave} on every HEAVE! Miss the heaves and it rolls back", detail: "At the bottom of Horsecombe Vale" }),
  },
  count: Object.fromEntries([["3", 3], ["2", 2], ["1", 1], ["GO!", 0]].map(([k, n]) => [k, () => keep(() => MS.missionCountdown(n as number), 800)])),
  tstart: {
    "Bus driver": () => toast("You're on the 2: Combe Down to the city centre and back. Follow the green line, and stop for anyone waiting"),
    "Pub takeover call": () => { toast("The Flag Lads have taken over The Hadley Arms! Follow the purple marker and clear them out"); feed("📞 The Flag Lads have taken over <b>The Hadley Arms</b>, 400 m north"); },
    "Push the Bus": () => toast("The bus has broken down at the bottom of Horsecombe Vale"),
  },
  stage: {
    Wave: () => keep(() => MS.missionStage({ title: "Wave 2 of 5: Hoverers", sub: "Hoverers: stare them out · 3 hoverers, in from the north-east", colour: "#8fd0f0", life: 30 }), 25000),
    Checkpoint: () => keep(() => MS.missionStage({ title: "Checkpoint 2 of 4", colour: "#3ec7e8", life: 30 }), 25000),
    "Life lost (red)": () => keep(() => MS.missionStage({ title: "A life gone!", sub: "Ann fell", colour: "#d8262e", life: 30 }), 25000),
    "Square cleared": () => keep(() => MS.missionStage({ title: "Square cleared!", sub: "Combe Down", colour: "#ff4a55", life: 30 }), 25000),
    Long: () => keep(() => MS.missionStage({ title: "The critics confer over the private view", sub: "Mr Pettigrew taps his glass and clears his throat for rather longer than anyone would like", colour: "#c2185b", life: 30 }), 25000),
  },
  toast: {
    Short: () => toast("You splatted Ann"),
    Long: () => toast("Oh no. The cats. ALL the cats. Run! Get 120 m away and they'll give up"),
    "With a key": () => toast("A ladder! Face a building and press {ride} to put it up to the roof"),
  },
  rflash: {
    "Checkpoint split": () => copy(`Checkpoint 2 of 4 · 0:41.2 · <span style="color:#58e06a">-1.3</span>`, "position:fixed;left:50%;transform:translateX(-50%);top:calc(50% + 48px);pointer-events:none;z-index:5;text-align:center;font:800 22px 'Barlow Condensed',Impact,sans-serif;text-shadow:0 1px 3px #000;color:#fff"),
    Hurry: () => copy(`Hurry! 8 s to checkpoint 3`, "position:fixed;left:50%;transform:translateX(-50%);top:calc(50% + 48px);pointer-events:none;z-index:5;text-align:center;font:800 22px 'Barlow Condensed',Impact,sans-serif;text-shadow:0 1px 3px #000;color:#ffb02e"),
  },
  fjcall: { "Bunting down": () => keep(() => fj().say("Bunting down! +400", "from a bus"), 1400), "Combo over": () => keep(() => fj().say("Combo over: 5 shots, 1840 points", "", true), 1400) },
  fjcombo: { x3: () => fj().write(`<b>x3!</b><i>300</i><u style="--left:0.70"></u>`, "a"), x7: () => fj().write(`<b>x7!</b><i>1840</i><u style="--left:0.25"></u>`, "b") },
  combo: {
    Combo: () => show(comboEl(), `<b>1,240</b> <i>×3</i><small>kickflip + manual + rail grind 3.2 m</small>`),
    Bailed: () => { show(comboEl(), `<b>1,240</b> <i>×3</i><small>Bailed</small>`); $("combo").className = "bail"; },
    "New best": () => { show(comboEl(), `<b>2,980</b><small class="best">New best!</small>`); $("combo").className = "new"; },
  },
  trophy: { Gold: () => { const t = TROPHIES.find((x) => x.tier === "gold")!; localStorage.clear(); award(t.id); } },
  mprog: {
    "Seagull Attack": () => MS.missionProgress({ id: "job", label: "Seagull Attack · ★★☆", colour: "#8fd0f0", goal: "Seagull Attack", progress: "Wave 2 / 5", bar: 5 / 9, hint: "Wave 2 of 5 · 6 gulls about", sub: "5 of 9 bites left · score 120 · chips ×1" }),
    Race: () => MS.missionProgress({ id: "job", label: "Race · ★★☆", colour: "#3ec7e8", goal: "BMX climb to Moorlands Recreation Playground", progress: "2 / 4", bar: 0.5, timer: "0:45.2", hint: "120 m to <b>Checkpoint 3/4</b>, north-west", sub: "Gold 1:20 · silver 1:35 · bronze 1:50" }),
    Wanted: () => MS.missionProgress({ id: "job", label: "Wanted · ★★☆", colour: "#e04848", goal: "Wanted: the Duke of Disorder", bar: 0.8, timer: "12:03 left", hint: "He's at <b>the Hadley Arms</b>, 200 m north. Get close and he'll run", sub: "Goes left ●●○ · then Firs Field · poster: {job}" }),
    "Challenge, with lives": () => MS.missionProgress({ id: "job", label: "Challenge · ★★★", colour: "#e9e1cf", goal: "The Climb", progress: "Ledge 2 / 6", bar: 2 / 6, hint: `${MS.hearts(2, 3)} Get everyone to the top together`, sub: "Climbers: 3 · Ann on the rope" }),
    Bonfire: () => MS.missionProgress({ id: "bonfire", label: "Bonfire", colour: "#ff9a3c", goal: "Build the bonfire", progress: "7 / 25", bar: 7 / 25, hint: "Carrying wood: take it to the pile" }),
    "Flash (just changed)": () => { MS.missionProgress({ id: "job", label: "Challenge · ★★★", colour: "#3a8fd8", goal: "The Lock Run", progress: "1 / 5", bar: 0.2, hint: "Shut the top gates", flash: "a" }); MS.missionProgress({ id: "job", label: "Challenge · ★★★", colour: "#3a8fd8", goal: "The Lock Run", progress: "1 / 5", bar: 0.2, hint: "Open the bottom paddles ({use})", flash: "b" }); },
    "Long text": () => MS.missionProgress({ id: "job", label: "Challenge · ★★★", colour: "#f2c318", goal: "Push the Bus all the way up Horsecombe Vale", progress: "37%", bar: 0.37, hint: "{use} at the back to push, then {heave} on every HEAVE! · 3 pushing · Bea in the cab · you call", sub: "Time it to the bar. Miss the heaves and you'll tire, and it rolls back. A naughty boy's on the roof: shoot him off" }),
  },
  bunting: {
    "Takeover on": () => show($("bunting"), `<div class="label">Flags up <b>27%</b><span class="downs">4 down</span></div><div class="bar"><div style="width:27%"></div></div><em>Pub takeover at <b>The Hadley Arms</b> · 400 m north · 2:40. Get there and clear them out</em><em>Shoot all <b>8</b> flags in this square to clear it</em>`, true),
    "In a square": () => show($("bunting"), `<div class="label">Flags up <b>21%</b></div><div class="bar"><div style="width:21%"></div></div><em>This square: <b>3/8</b> flags down</em>`, true),
  },
  banner: {
    "Going up": () => show($("banner"), `<div class="label">Banner going up at <b>The Hadley Arms</b> · 2 on the ladder</div><div class="bar"><div style="width:40%"></div></div><em>Shoot the lads on the ladder to knock it back</em>`, true),
    "Nearly up": () => { show($("banner"), `<div class="label">Banner going up at <b>The Hadley Arms</b> · 2 on the ladder</div><div class="bar"><div style="width:82%"></div></div><em>Nearly up! Shoot the lads on the ladder to knock it back</em>`, true); $("banner").classList.add("late"); },
  },
  buscard: {
    "On the route": () => show($("buscard"), `<div class="label">Badgerline · Route 2</div><div class="bustitle">City centre</div><div class="busline">Next stop: <b>Church Road</b> · 250 m</div><div class="busline">3 waiting there</div><div class="busstat">On board 4 · Fares 5 · Moans 1</div><em>“Cheers drive”</em>`, true),
    "Bus stopping": () => show($("buscard"), `<div class="label">Badgerline · Route 2</div><div class="bustitle">City centre</div><div class="busline">Next stop: <b>Church Road</b></div><div class="bussign">Bus stopping</div><div class="busstat">On board 4 · Fares 5 · Moans 1</div>`, true),
  },
  shoot: { Score: () => show($("shootcard"), `<b>Ann 3 – 2 Bo</b><em>Ann to kick: 4 of 5</em>`, true) },
  pushbeat: {
    "Heave!": () => copy(beat("Heave!", "#f2c318", "scale(1.25)", "", ""), BEAT, true),
    Perfect: () => copy(beat("One...", "#fff", "none", "PERFECT!", "#4dff8e"), BEAT, true),
  },
  pushcab: { "Rolling back": () => copy(`<div style="font-size:26px;letter-spacing:0.04em;color:#ff9a8a">&#9660; ROLLING BACK 2.1 m/s</div><div style="font-size:15px;margin-top:4px;color:#ccc">Handbrake off · ${ctlText("{handbrake}")} to hold it</div><div style="position:relative;height:8px;margin:4px auto 2px;width:220px;background:rgba(255,255,255,0.15);border-radius:4px;overflow:hidden"><div style="position:absolute;top:0;bottom:0;left:0;width:45%;background:#ffb21f"></div></div><div style="font-size:16px;margin-top:6px">A car coming down, 80 m</div>`,
    "position:fixed;right:16px;top:214px;min-width:300px;padding:8px 14px;background:rgba(10,10,12,0.72);border:2px solid #fff;border-radius:8px;pointer-events:none;color:#fff;font-weight:700;text-shadow:0 1px 2px #000;z-index:6;text-align:center", true) },
  grip: { Tiring: () => copy(`<div style="position:absolute;left:0;top:0;bottom:0;width:30%;background:#e9e1cf"></div><div style="position:absolute;top:0;bottom:0;right:0;width:15%;background:rgba(160,40,30,.7)"></div>`,
    "position:fixed;left:50%;top:calc(50% + 30px);transform:translateX(-50%);width:96px;height:6px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.5);pointer-events:none;z-index:5", true) },
  rtimer: {
    "Plenty of time": () => copy(`<div style="font-size:clamp(34px,10vw,58px);color:#fff">0:24</div><div style="font-size:clamp(12px,3.4vw,16px);color:#cde">CHECKPOINT 3</div>`, TIMER),
    "Running out": () => copy(`<div style="font-size:clamp(34px,10vw,58px);color:#ff5a4e">0:07.4</div><div style="font-size:clamp(12px,3.4vw,16px);color:#cde">CHECKPOINT 3</div>`, TIMER),
  },
  spec: { Standings: () => MS.missionWatching({ head: "Finished", sub: "2nd, 1:23.4", small: "Watching Bo · ◀ ▶ to switch", rows: [{ name: "Ann", time: "1:20.1" }, { name: "You", time: "1:23.4", me: true }, { name: "Bo", time: "riding", watch: true }], many: true }) },
  feed: { "Three lines": () => { feed(`<b style="color:#ffd84a">Ann</b> took on a job: <b style="color:#8fd0f0">Seagull Attack</b>`); feed(`<b>The Hadley Arms</b> won back from the Flag Lads`); feed(`Bo fell: the team's down to 2 lives`); } },
  use: {
    "Take the job": () => show($("usehint"), ctlText("<b>{use}</b> Take the job"), true),
    Challenge: () => show($("usehint"), ctlText("<b>{use}</b> The Lock Run"), true),
    Busy: () => show($("usehint"), "Finish or call off your job first", true),
    "Job's own": () => show($("usehint"), ctlText("<b>{use}</b> Shout at the gulls"), true),
  },
  poster: {
    Job: () => poster("Seagull Attack · ★★☆", "#8fd0f0", "Seagull Attack", "Tourists on the benches with their sandwiches, and the gulls are circling. Five waves, then Big Lad himself.", "Two prizes and the gull hat", "{use} to take the job"),
    Challenge: () => poster("Challenge · ★★★", "#3a8fd8", "The Lock Run", "Take the boat down the flight with its barrels, working the paddles and gates as you go.", "Something strange, left where you finish", "{use} to start it"),
    "Done today": () => poster("Race · ★★☆", "#3ec7e8", "BMX climb to Moorlands Recreation Playground", "Up the hill on a BMX, through every checkpoint.", "A traffic cone for your head", "Done today"),
  },
  end: {
    "Job done": () => MS.missionResult({ result: "won", title: "Job done!", lines: ["Seagulls seen off! 7 of 9 bites saved ★★☆, score 340"], colour: "#8fd0f0" }),
    "Job failed": () => MS.missionResult({ result: "lost", title: "Job failed", lines: ["It got away from you, back down Horsecombe Vale and smashed into a car"], colour: "#f2c318" }),
    "Called off": () => MS.missionResult({ result: "lost", title: "Job called off", lines: ["Ann called it off"] }),
    "Place and rows": () => MS.missionResult({ result: "won", title: "Bonfire built!", place: 1, lead: "1:23.4", lines: ["Kingswood's bonfire is ready"], medal: "Gold", best: "NEW BEST! 2.1 s quicker", rows: [{ name: "You", time: "1:23.4", me: true }, { name: "Ann", time: "1:25.0" }] }),
    "Long title": () => MS.missionResult({ result: "won", title: "The whole team stood on top of the crag together, every one of them", lines: ["Three lives to spare, and nobody carried up the last ledge. The Climb is done for today: a strange thing has turned up where you finished"] }),
  },
  sheet: {
    Pass: () => MS.missionSheet({ kind: "Driving test report · test 1 of 3", title: "The Driving Test", who: "Candidate: You · Examiner: Mr Pratt", stamp: "PASS", good: true, sections: [{ head: "Minor faults: 2", lines: ["Too far from the kerb", "Late signal"] }, { head: "Serious", lines: [] }, { head: "Dangerous", lines: [] }], foot: "Two minors. Well driven." }),
    Fail: () => MS.missionSheet({ kind: "Driving test report · test 2 of 3", title: "The Driving Test", who: "Candidate: Ann · Examiner: Mr Pratt", stamp: "FAIL", good: false, sections: [{ head: "Minor faults: 4", lines: ["Too far from the kerb", "Late signal", "Hesitation", "Mirrors"] }, { head: "Serious", lines: ["Went through a red light"] }, { head: "Dangerous", lines: ["The examiner had to brake"] }] }),
  },
  tend: {
    "Pub won back": () => { toast("The Hadley Arms is won back! Flags down, everyone welcome. There's a ride outside, and the odd round on the house"); feed("<b>The Hadley Arms</b> won back from the Flag Lads"); },
    "Pub lost": () => { toast("Too slow: the Flag Lads keep The Hadley Arms, and the streets round it fill up with flags"); feed("The Flag Lads kept <b>The Hadley Arms</b>"); },
    "Shift over": () => toast(`Shift over: 5 fares, 2 "cheers drive", 1 moan`),
  },
  chron: { "On joining": () => {
    const d = new Daily(() => {}, () => `<b>The Flag Lads</b> have flagged <b>21%</b> of Bath.`, () => "Bath", () => ({ kicker: "News from Bath", no: 1, strap: "Flag Lads arrive in Bath", lead: "<p>A van full of cable ties was seen at dawn. By breakfast there were flags on the lamp posts.</p>", side: "<h4>How to help</h4><p>Shoot the flags off the lamp posts.</p>", small: "" } as any));
    const b = $("scoreboard"); b.hidden = false; b.classList.add("join"); d.draw($("daily"));
  } },
  night: { "Last orders": () => MS.missionNight({ pub: "The Hadley Arms", head: "Whole room makes last orders at the Hadley", stand: "Six regulars, one stolen bus and a gull with a chip", by: "By our chief reporter",
    body: ["They came from all over Bath for one for the road, and the landlord says he has never seen the like.", "Ann won the race there by a length; Bo came in on the back of a milk float."], items: [{ head: "Weather", text: "Bright spells, flags drooping" }, { head: "Seagulls", text: "Restless" }, { head: "Lost", text: "One sandwich" }] }) },
  reveal: {
    "New zone": () => revealCard({ kind: "spot", x: 0, z: 0, kicker: "A new part of the map is open", title: "Widcombe", sub: "New challenge: Bell Ringing", lines: ["The buses run out this way now"] }),
    "Whole map": () => revealCard({ kind: "map", x: 0, z: 0, kicker: "Every zone is open", title: "The whole map is yours" }),
  },
};

const BEAT = "position:fixed;left:50%;top:calc(50% + 84px);transform:translateX(-50%);width:min(340px, calc(100vw - 32px));text-align:center;pointer-events:none;color:#fff;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-shadow:0 2px 3px #000;z-index:6";
const TIMER = "position:fixed;left:50%;transform:translateX(-50%);top:112px;pointer-events:none;z-index:5;text-align:center;font:800 22px 'Barlow Condensed',Impact,sans-serif;text-shadow:0 1px 3px #000";
function beat(word: string, colour: string, scale: string, say: string, sayCol: string) {
  return `<div style="font-size:14px;height:18px;color:#f2c318">Ann calls</div><div style="font-size:30px;line-height:1.1;height:34px;color:${colour};transform:${scale}">${word}</div>`
    + `<div style="position:relative;height:14px;margin:6px 0 4px;background:rgba(0,0,0,0.5);border:2px solid #fff;border-radius:8px;overflow:hidden">`
    + `<div style="position:absolute;top:0;bottom:0;left:30%;width:40%;background:#ff8a3a;opacity:0.75"></div><div style="position:absolute;top:0;bottom:0;left:40%;width:20%;background:#f2c318;opacity:0.8"></div>`
    + `<div style="position:absolute;top:0;bottom:0;left:46%;width:8%;background:#4dff8e"></div><div style="position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:#fff"></div>`
    + `<div style="position:absolute;top:-2px;bottom:-2px;left:${say ? 50 : 38}%;width:6px;margin-left:-3px;background:#fff;border-radius:3px;box-shadow:0 0 6px #000"></div></div>`
    + `<div style="font-size:${say ? 24 : 17}px;height:22px;color:${sayCol}">${say}</div>`;
}
function poster(label: string, colour: string, title: string, blurb: string, reward: string, foot: string) {
  show($("jobposter"), ctlText(`<div class="label" style="color:${colour}">${label}</div><div class="jobtitle">${title}</div><p>${blurb}</p><p class="reward">Reward: ${reward}</p><em>${foot}</em>`), true);
}
function revealCard(s: Shot) {
  const r = new Reveal(null as never, () => false) as any;
  r.card(s);
  document.getElementById("reveal")?.classList.add("shown");
}

/** Draw piece id in state (its first, if not given). */
export function draw(id: string, state: string) {
  clear();
  const p = DRAW[id];
  if (!p) return;
  (p[state] ?? Object.values(p)[0])();
}

export const states = (id: string) => Object.keys(DRAW[id] ?? {});
