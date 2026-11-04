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
<h3>Three frames, and props</h3>
<ul>
<li><b>The paper</b> is Bath talking to you: a cutting from the Chronicle (<code>cutting.ts</code>). A job's brief at its noticeboard, its title card and J's recall (<code>brief.ts</code>), every result card, the Chronicle itself, and the league table under Tab as the top of its page.</li>
<li><b>BathText</b> is the machine: teletext (<code>teletext.ts</code>, <code>.card.tt</code>, <code>.ttmini</code>). The menu, pause, settings, linking a device, the wardrobe, the trophy cabinet, the big map's key, notes and pub card, and the game's notes about itself (the system tier).</li>
<li><b>The plate</b> is the HUD while you play (<code>.panel</code>): health, rounds, the vehicle, the boss, the status panels, the Flag Lads' row, and every notice (news, a stage, an award), told apart by size, place and the colour of its edge; meters go in the slot under the crosshair.</li>
<li><b>Props</b> are things in Bath or of the time, and keep their own look on purpose: the G-Shock watch, the Now Playing amp, the parking ticket when you die, the stone street sign and arrival, the Art Gallery's Paint window, and a zone opening's fly-over (the big celebration). A prop keeps to its slot and gets out of the way of the big map and a result card.</li>
<li>Every sheet over the game has the same × in its top right corner (<code>modal.ts</code>), and Esc puts it away.</li>
</ul>
<h3>Which notice tier</h3>
<ul>
<li><b>call</b>: news (a kill, a pickup, a ride, a fare) or something worth knowing (a tip, the examiner, a critic). A plate a little above the middle: big for a few words, smaller and wrapped for longer ones (over 64 characters, or <code>tier: "note"</code>). <code>Game.toast</code> / <code>notice()</code>. One queue: nothing is lost, and they wait while a title card, a countdown or the big map is up.</li>
<li><b>stage</b>: a mission moving on (a wave, a checkpoint, a life gone, out of lives, he got away). A wider plate over the crosshair, edged and titled in the mission's colour. <code>missionCall()</code>.</li>
<li><b>trick</b>: a score popping as you play (a flag shot, a boost, a barge). The same font and yellow but no plate, in the meter slot under the combo row; never held back.</li>
<li><b>award</b>: something kept (a trophy, a wardrobe item). The plate with its medal, sliding in at the top; written on the result card instead while one is up.</li>
<li><b>system</b>: the game about itself (the map stuck loading, someone on another version, safe graphics). A BathText strip along the top that stays till it's put right or closed. <code>systemNote()</code>.</li>
</ul>
<h3>Status panel slots</h3>
<ul>
<li><b>Top left</b>: mission panels, the job first, then a bus shift, a shoot-out, the bonfire, then the Flag Lads' row, which stays up on a job. Up to three; talkers above.</li>
<li><b>Top middle</b>: the title card (a brief), J's recall, then the compass and one bar at a time (a pub's banner, a boss).</li>
<li><b>Top right</b>: the minimap, the feed under it.</li>
<li><b>Bottom left</b>: health, the watch above it. <b>Bottom right</b>: rounds or the vehicle, never both. <b>Bottom middle</b>: the street name.</li>
<li><b>The middle</b>: the stage plate over the crosshair; the use prompt under it, or at a noticeboard the brief, whose foot is the prompt; then one row per meter (<code>missionAux</code>: a gate's clock, a beat, a grip, the wings' flight); then the combo row; then trick pops.</li>
<li>On a touch screen the top-left slot is the left column, the bottom corners keep clear of the buttons, and a key cap for use or ride (in the prompt or along a brief's foot) is a button.</li>
</ul>
<h3>Every mission</h3>
<p>The brief at the board → <code>missionBegin</code> (the same brief as the title card) → <code>missionProgress</code> (+ <code>missionAux</code>) → <code>missionCall</code>, with J bringing the brief back → <code>missionResult</code>. The result card owns the end sound, lists the rewards, hides the use prompt, and has Continue (Space), Again (E) where there is one, × and an 8 s timer.</p>`;

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
