// What the HUD page (ui.html) shows: each piece of the game's words over the streets, where it's
// drawn, who uses it and the states to step through, and the rules for which piece to use when.
// Only the words live here, so the catalogue can list them without loading the game; stage.ts draws
// each state with the game's own code.
// A piece marked own is a mode's private copy of a job a shared piece already does: it's listed
// under the shared one it duplicates. A piece marked event is a deliberate one-off look.

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
  { id: "start", name: "Starting", blurb: "The entries, the title card and the countdown." },
  { id: "call", name: "Notices", blurb: "One family, five tiers, one queue: see the rules above." },
  { id: "panel", name: "Status panels and slots", blurb: "What stays up, each in its slot, stacking rather than overlapping." },
  { id: "prompt", name: "Prompts and posters", blurb: "What a press does here, and the poster on a noticeboard." },
  { id: "end", name: "Results", blurb: "One card at the end of everything, with variants." },
  { id: "event", name: "Events and the paper", blurb: "Big celebrations keep their own look on purpose; the Chronicle is the paper itself." },
];

/** The rules for using the pieces, shown over the catalogue. */
export const RULES = `
<h3>Which notice tier</h3>
<ul>
<li><b>call</b>: something just happened to you (a kill, a pickup, a ride, a fare). Big and yellow, a little above the middle. <code>Game.toast</code> / <code>notice()</code>. Longer than 64 characters it becomes a note.</li>
<li><b>note</b>: worth knowing but not news (a tip, the examiner, a critic). Same place, smaller and white. Calls and notes share one queue: nothing is lost, and they wait while a title card, a countdown or the big map is up.</li>
<li><b>stage</b>: a mission moving on (a wave, a checkpoint, a life gone, out of lives, he got away). The band over the crosshair in the mission's colour. <code>missionCall()</code>.</li>
<li><b>trick</b>: a score popping as you play (a flag shot, a boost, a barge). Low in the middle, over the Flag Lads' combo; never held back.</li>
<li><b>award</b>: something kept (a trophy, a wardrobe item). Slides in at the top; written on the result card instead while one is up.</li>
</ul>
<h3>Status panel slots</h3>
<ul>
<li><b>Top left</b>: mission panels, the job first, then a bus shift, a shoot-out, the bonfire, then the Flag Lads' row, which stays up on a job. Up to three; talkers above.</li>
<li><b>Top middle</b>: the compass, then one bar at a time (a pub's banner, a boss).</li>
<li><b>Top right</b>: the minimap, the feed under it.</li>
<li><b>Bottom left</b>: health, the watch above it. <b>Bottom right</b>: rounds or the vehicle, never both. <b>Bottom middle</b>: the street name.</li>
<li><b>The middle</b>: title or stage band over the crosshair; the use prompt under it; then one row per meter (<code>missionAux</code>); then trick pops over the Flag Lads' combo.</li>
<li>On a touch screen the top-left slot is the left column, and the bottom corners keep clear of the buttons.</li>
</ul>
<h3>Every mission</h3>
<p><code>missionBegin</code> → <code>missionProgress</code> (+ <code>missionAux</code>) → <code>missionCall</code> → <code>missionResult</code>. The result card owns the end sound, lists the rewards, hides the use prompt, and has Continue (Space), Again (E) where there is one, × and an 8 s timer. Big celebrations (a zone opening) keep their own look.</p>`;

export const ELEMENTS: Piece[] = [
  // ---- starting
  { id: "entries", group: "start", name: "Entries banner and line-up", src: "missionscreens.ts missionWaiting(), from lineup.ts",
    used: "every noticeboard job and challenge", note: "Skipped on your own: entries only open with others in the room.", states: ["Entries open", "You're in", "Lining up", "Long title"] },
  { id: "title", group: "start", name: "Title card", src: "missionscreens.ts missionBegin()",
    used: "every job and challenge, the bonfire, a bus shift, a pub takeover, a shoot-out, the night out",
    states: ["Job", "Long goal", "Race", "Wanted", "Challenge, with a best", "Bonfire", "Bus driver", "Pub takeover", "Shoot-out", "Long, two-line title"] },
  { id: "count", group: "start", name: "Countdown and start lights", src: "missionscreens.ts missionCountdown(); missionBegin({ countdown })",
    used: "every job and challenge, a race's go of your own, the bonfire", states: ["3", "2", "1", "GO!"] },

  // ---- notices
  { id: "notice", group: "call", name: "Notices", src: "notice.ts notice(); Game.toast is a call, missionCall a stage",
    used: "everything: pickups, kills, travel, the phone, examiner, critics, waves, checkpoints, trophies",
    note: "Queued: a newer call waits until the one up has been read, and held ones come one after another.",
    states: ["Call", "Call with a key", "Long call (as a note)", "Note", "Stage: wave", "Stage: checkpoint split", "Stage: life lost", "Stage: out of lives", "Stage: he got away", "Trick", "Award: trophy", "Award: wardrobe"] },
  { id: "combo", group: "call", name: "Ride combo", src: "ridetricks.ts (#combo, style.css)", used: "riding tricks", own: true, of: "the aux slot",
    note: "A meter of its own in the middle-top; not moved yet.", states: ["Combo", "Bailed", "New best"] },
  { id: "fjcombo", group: "call", name: "Flag Lads combo", src: "flagjuice.ts write() (#fj-combo)", used: "Flag Lads", own: true, of: "the aux slot",
    note: "Sits under the trick pops, low in the middle; its own look kept for now.", states: ["x3", "x7"] },

  // ---- panels
  { id: "mprog", group: "panel", name: "Status panel", src: "missionscreens.ts missionProgress() (.mprog in #mstack)",
    used: "every job and challenge, the bonfire, the bus driver, the shoot-out",
    states: ["Seagull Attack", "Race", "Wanted", "Challenge, with lives", "Bonfire", "Bus driver", "Bus stopping", "Shoot-out", "Flash (just changed)", "Long text"] },
  { id: "stack", group: "panel", name: "Top-left slot, stacked", src: "missionscreens.ts #mstack, with invasion.ts's #bunting as its last row",
    used: "a job, a bus shift and the Flag Lads at once", states: ["Job, bus and Flag Lads", "Job and Flag Lads", "Flag Lads alone"] },
  { id: "aux", group: "panel", name: "Meter slot under the crosshair", src: "missionscreens.ts missionAux() (#maux, .aux-word/.aux-big/.aux-meter/.aux-panel)",
    used: "Push the Bus beat and cab, the Climb's grip, a race's gate clock, the bells", states: ["Gate clock", "Gate clock, running out", "Push the Bus beat", "Push the Bus cab", "Climb grip"] },
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
  { id: "poster", group: "prompt", name: "Noticeboard poster", src: "quests.ts Quests.hud() (#jobposter)", used: "noticeboards and challenges", states: ["Job", "Challenge", "Done today"] },
  { id: "wposter", group: "prompt", name: "Wanted poster", src: "wantedscreens.ts wantedPoster(), on the job control", used: "Wanted, while it runs", states: ["Poster"] },

  // ---- results
  { id: "result", group: "end", name: "Result card", src: "missionscreens.ts missionResult()",
    used: "every job, challenge, race, Wanted, the bonfire, a bus shift, a pub takeover, a shoot-out, the Flag Lads cleared",
    states: ["Job done, with rewards", "Job failed", "Called off", "Race: gold", "Race: did not finish", "Wanted: cuffed", "Wanted: got away", "Bonfire built", "Shift over", "Pub won back", "Town safe", "Long title"] },
  { id: "variants", group: "end", name: "Result card variants", src: "missionscreens.ts missionSheet(), missionNight(), missionResult({ variant: \"verdict\" })",
    used: "the driving test's report, the night out's front page, the gallery's verdict", states: ["Driving test: pass", "Driving test: fail", "Night out front page", "Gallery verdict"] },

  // ---- events
  { id: "reveal", group: "event", name: "Zone opening card", src: "reveal.ts Reveal.card() (#reveal)", used: "a zone opening; the whole map", event: true,
    note: "The big celebration: its own letterbox look on purpose.", states: ["New zone", "Whole map"] },
  { id: "chron", group: "event", name: "The Chronicle (today's jobs)", src: "daily.ts Daily.render() into #scoreboard", used: "on joining, Tab, noticeboards", states: ["On joining"] },
];
