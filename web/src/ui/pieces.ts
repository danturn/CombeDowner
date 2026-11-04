// What the HUD page (ui.html) shows: each piece of the game's words over the streets, where it's
// drawn, who uses it and the states to step through, and the rules for which piece to use when.
// Only the words live here, so the catalogue can list them without loading the game; stage.ts draws
// each state with the game's own code.
// A piece marked own is a mode's private copy of a job a shared piece already does (none are left);
// a piece marked event is a deliberate one-off look.

export interface Piece {
  id: string; group: string; name: string;
  /** Where it's drawn: module and function. */
  src: string;
  used: string;
  own?: boolean;
  event?: boolean;
  /** For an own copy: the shared piece it duplicates. */
  of?: string;
  note?: string;
  states: string[];
}

export const GROUPS = [
  { id: "start", name: "Briefs and starting", blurb: "A job's brief, from its noticeboard to its title card and J; the entries and the countdown." },
  { id: "call", name: "Notices", blurb: "One family, six tiers: see the rules above." },
  { id: "panel", name: "Status panels and slots", blurb: "What stays up, each in its slot, stacking rather than overlapping." },
  { id: "prompt", name: "Prompts", blurb: "What a press does here." },
  { id: "end", name: "Results", blurb: "One card at the end of everything, with variants." },
  { id: "frame", name: "Pages and the big map", blurb: "The paper and BathText: the two frames for anything bigger than the HUD." },
  { id: "event", name: "Events", blurb: "Big celebrations keep their own look on purpose." },
];

/** The rules for using the pieces, shown over the catalogue. */
export const RULES = `
<h3>Three looks</h3>
<ul>
<li><b>Paper</b>: Bath talking to you. Briefs, title cards, result cards, the Chronicle.</li>
<li><b>BathText</b>: the machine. Menus, settings, wardrobe, trophies, the big map's cards, system notes.</li>
<li><b>Plate</b>: the HUD while you play. Panels and every notice.</li>
<li><b>Props</b> keep their own look: the watch, the amp, the parking ticket, the street sign, Paint, a zone opening.</li>
</ul>
<h3>Notices</h3>
<ul>
<li><b>call</b> news or a tip &middot; <b>stage</b> a mission moving on &middot; <b>trick</b> a score pop &middot; <b>award</b> something kept &middot; <b>system</b> the game about itself.</li>
</ul>
<h3>Slots</h3>
<ul>
<li>Top left: mission panels. Top middle: the brief. Top right: minimap. Bottom: health, rounds, street. Middle: stage, prompt, meters, combo, tricks.</li>
</ul>
<h3>Every mission</h3>
<p>Brief &rarr; title card &rarr; progress &rarr; calls (J for the brief) &rarr; result card.</p>`;

/** The title card's samples, under the brief. */
const TITLES = ["Job", "Long goal", "Race", "Wanted", "Challenge, with a best", "Bonfire", "Bus driver", "Pub takeover", "Shoot-out", "Long, two-line title"];

export const ELEMENTS: Piece[] = [
  // ---- starting
  { id: "entries", group: "start", name: "Entries banner and line-up", src: "missionscreens.ts missionWaiting(), from lineup.ts",
    used: "every noticeboard job and challenge", note: "Skipped on your own: entries only open with others in the room.", states: ["Entries open", "You're in", "Lining up", "Long title"] },
  { id: "brief", group: "start", name: "A job's brief: the board, the title card, J", src: "brief.ts briefHtml(); quests.ts Quests.hud() (#jobposter, #jobrecall); missionscreens.ts missionBegin() (the title card)",
    used: "every noticeboard job and challenge, the bonfire, a bus shift, a pub takeover, a shoot-out, the night out, and Wanted's round on J", note: "One cutting at the board, as the title card and on J. At the board its foot is the use prompt.",
    states: ["Board: job", "Board: challenge", "Board: done today", "Board: touch", ...TITLES.map((t) => `Title card: ${t}`), "Recall (J)", "Recall: Wanted"] },
  { id: "count", group: "start", name: "Countdown and start lights", src: "missionscreens.ts missionCountdown(); missionBegin({ countdown })",
    used: "every job and challenge, a race's go of your own, the bonfire", states: ["3", "2", "1", "GO!"] },

  // ---- notices
  { id: "notice", group: "call", name: "Notices", src: "notice.ts notice(); Game.toast is a call, missionCall a stage",
    used: "everything: pickups, kills, travel, the phone, examiner, critics, waves, checkpoints, trophies",
    note: "Queued: a newer call waits until the one up has been read, and held ones come one after another.",
    states: ["Call", "Call with a key", "Long call (as a note)", "Note", "Stage: wave", "Stage: checkpoint split", "Stage: life lost", "Stage: out of lives", "Stage: he got away", "Trick", "Award: trophy", "Award: wardrobe"] },
  { id: "system", group: "call", name: "The game's notes about itself", src: "notice.ts systemNote(), from loadnote.ts, net.ts, safegfx.ts",
    used: "the map stuck loading, someone on another version, safe graphics after a crash", states: ["Map stuck loading", "Another version", "Older version", "Safe graphics"] },

  // ---- panels
  { id: "mprog", group: "panel", name: "Status panel", src: "missionscreens.ts missionProgress() (.mprog in #mstack)",
    used: "every job and challenge, the bonfire, the bus driver, the shoot-out",
    states: ["Seagull Attack", "Race", "Wanted", "Challenge, with lives", "Bonfire", "Bus driver", "Bus stopping", "Shoot-out", "Flash (just changed)", "Long text"] },
  { id: "stack", group: "panel", name: "Top-left slot, stacked", src: "missionscreens.ts #mstack, with invasion.ts's #bunting as its last row",
    used: "a job, a bus shift and the Flag Lads at once", states: ["Job, bus and Flag Lads", "Job and Flag Lads", "Flag Lads alone"] },
  { id: "aux", group: "panel", name: "Meter slot under the crosshair", src: "missionscreens.ts missionAux(), missionAuxAdopt() (#maux, .aux-word/.aux-big/.aux-meter/.aux-panel)",
    used: "Push the Bus beat and cab, the Climb's grip, a race's gate clock, the combo row, the wings' flight", states: ["Gate clock", "Gate clock, running out", "Push the Bus beat", "Push the Bus cab", "Climb grip"] },
  { id: "combo", group: "panel", name: "The combo row, in the meter slot", src: "combo.ts comboLine(), fed by ridetricks.ts and flagjuice.ts",
    used: "riding tricks, and shooting the Flag Lads' flags", note: "One row: each source keeps its own count and scoring and labels its line. Both at once stack, the newer on top.",
    states: ["Ride", "Ride: bailed", "Ride: new best", "Flags x3", "Flags x7", "Both at once"] },
  { id: "banner", group: "panel", name: "Banner going up", src: "invasion.ts bannerBar() (#banner, .panel)", used: "pub takeovers", states: ["Going up", "Nearly up"] },
  { id: "spec", group: "panel", name: "Watching the others", src: "missionscreens.ts missionWatching()", used: "races, once you're over the line", states: ["Standings"] },
  { id: "feed", group: "panel", name: "Feed", src: "game.ts Game.feed() (#feed)", used: "everything: who took a job, who fell, a takeover", states: ["Three lines"] },
  { id: "slots", group: "panel", name: "Slot map", src: "style.css (the status panel slots), drawn all at once with each slot outlined",
    used: "the whole HUD", note: "Try the phone size: the touch layout puts the top-left slot in the left column, clear of the buttons.", states: ["Desktop", "Touch"] },

  // ---- prompts
  { id: "use", group: "prompt", name: "Use prompt", src: "useprompt.ts usePrompt(), keycaps(); written by game.ts",
    used: "everything you can use: vehicles, doors, noticeboards, pubs, buses, the mines door, a job's own use",
    note: "Each key is a key cap; on a touch screen the use and ride caps are buttons. Hidden while a result card is up.",
    states: ["Take the job", "Challenge", "Busy", "Get in", "Riding", "Job's own", "Touch key cap", "Keeper (shoot-out)"] },

  // ---- results
  { id: "result", group: "end", name: "Result card", src: "missionscreens.ts missionResult()",
    used: "every job, challenge, race, Wanted, the bonfire, a bus shift, a pub takeover, a shoot-out, the Flag Lads cleared",
    states: ["Job done, with rewards", "Job failed", "Called off", "Race: gold", "Race: did not finish", "Wanted: cuffed", "Wanted: got away", "Bonfire built", "Shift over", "Pub won back", "Town safe", "Long title"] },
  { id: "variants", group: "end", name: "Result card variants", src: "missionscreens.ts missionSheet(), missionNight(), missionResult({ variant: \"verdict\" })",
    used: "the driving test's report, the night out's front page, the gallery's verdict", states: ["Driving test: pass", "Driving test: fail", "Night out front page", "Gallery verdict"] },

  // ---- events
  { id: "reveal", group: "event", name: "Zone opening card", src: "reveal.ts Reveal.card() (#reveal)", used: "a zone opening; the whole map", event: true,
    note: "The big celebration: its own letterbox look on purpose.", states: ["New zone", "Whole map"] },
  { id: "chron", group: "frame", name: "The Chronicle, and the league table", src: "daily.ts Daily.draw() into #scoreboard; game.ts renderScores()", used: "on joining, Tab (with the league table as the top of its page), the pause menu, noticeboards", states: ["On joining", "Tab: league table"] },
  { id: "mapcard", group: "frame", name: "The big map's cards", src: "pubmap.ts (#pubcard), mapkey.ts (#keytip), minimap.ts tooltip(): .ttmini", used: "the big map, Go to a pub", note: "BathText, as the pause menu's Go to a pub (page 600) is.", states: ["Pub card", "Pub card, held up", "Key note"] },
];
