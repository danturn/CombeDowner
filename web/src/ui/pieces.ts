// What the HUD page (ui.html) shows: each piece of the game's text over the streets, where it's
// drawn, who uses it and the states to step through. Only the words live here, so the catalogue can
// list them without loading the game; stage.ts draws each state with the game's own code.
// A piece marked own is a mode's private copy of a job a shared piece already does: it's listed
// under the shared one it duplicates, so the two can be put up one after the other.

export interface Piece {
  id: string; group: string; name: string;
  /** Where it's drawn: module, function, file:line. */
  src: string;
  used: string;
  own?: boolean;
  /** For an own copy: the shared piece it duplicates. */
  of?: string;
  note?: string;
  states: string[];
}

export const GROUPS = [
  { id: "start", name: "Starting", blurb: "The entries, the title card and the countdown, and what modes do instead." },
  { id: "call", name: "Call-outs and banners", blurb: "A line over the crosshair for a moment: a stage, a toast, a trick." },
  { id: "panel", name: "Objective and progress panels", blurb: "What to do and how far you've got, up the whole way through." },
  { id: "prompt", name: "Prompts and posters", blurb: "What E does here, and the poster on a noticeboard." },
  { id: "end", name: "Results", blurb: "The card at the end: won, lost, a time, a report." },
  { id: "paper", name: "The Chronicle and the reveal", blurb: "The cards to read: the paper, the night out, a zone opening." },
];

export const ELEMENTS: Piece[] = [
  // ---- starting
  { id: "entries", group: "start", name: "Entries banner and line-up", src: "lineup.ts:189 Lineup.update → racescreens.ts:122 waiting() (.rsc-wait), missionscreens.ts:164 missionProgress()",
    used: "every noticeboard job and challenge (race, Wanted, Seagull Attack, Lock Run, Push the Bus, Bells, Gallery, Climb, Tightrope, Driving Test)",
    note: "Skipped on your own: entries only open with others in the room.", states: ["Entries open", "You're in", "Lining up", "Long title"] },
  { id: "title", group: "start", name: "Title card", src: "missionscreens.ts:248 missionStart() (.msc-start); called from lineup.ts:178 and quests.ts:828",
    used: "every job and challenge, and the bonfire (bonfire.ts:624)", states: ["Job", "Long goal", "Race", "Wanted", "Challenge, with a best", "Bonfire", "Long, two-line title"] },
  { id: "count", group: "start", name: "Countdown and start lights", src: "racescreens.ts:136 countdown() (.rsc-count); called from lineup.ts:216",
    used: "every job and challenge; a race's go of your own (race.ts:725)", states: ["3", "2", "1", "GO!"] },
  { id: "wsplash", group: "start", name: "Wanted splash", src: "wantedscreens.ts:119 wantedSplash() (.wsc-splash), at GO from wanted.ts:216",
    used: "Wanted only", own: true, of: "the title card", note: "A second start card after the shared title card, in racescreens' look, as a newspaper cutting.", states: ["At GO", "Poster again (job key)"] },
  { id: "tstart", group: "start", name: "Starts told by a toast", src: "busdriver.ts:263, pushbus.ts:1109, invasion.ts:1233 ring(), drivingtest.ts:840",
    used: "bus driver, Push the Bus (after its title card), pub takeovers, Driving Test", own: true, of: "the title card",
    note: "No title card or countdown: the mode starts with a toast in the call-out style.", states: ["Bus driver", "Pub takeover call", "Push the Bus"] },

  // ---- call-outs
  { id: "stage", group: "call", name: "Stage banner", src: "missionscreens.ts:266 missionStage() (.msc-stage); quests.ts:1026 from a job's card().stage",
    used: "jobs and challenges (waves, locks, ledges, faults), invasion.ts:553 square cleared, scars.ts:266", states: ["Wave", "Checkpoint", "Life lost (red)", "Square cleared", "Long"] },
  { id: "toast", group: "call", name: "Toast", src: "game.ts:4949 Game.toast() (#toast, style.css:848), springs in with pop.ts",
    used: "everything: passed into every mode as toast / w.toast", note: "Held back while a title card or countdown is up; a newer held toast replaces an older one.", states: ["Short", "Long", "With a key"] },
  { id: "wcall", group: "call", name: "Wanted call-out", src: "wantedscreens.ts:149 wantedCallout() (.wsc-call)", used: "Wanted only", own: true, of: "the stage banner",
    note: "A third banner style at 27% down, between the toast (22%) and the stage banner (over the crosshair).", states: ["He got away"] },
  { id: "rflash", group: "call", name: "Race checkpoint flash", src: "race.ts:447 hudBit() (inline style), race.ts:1030", used: "races only", own: true, of: "the stage banner",
    note: "Copy of the markup: the real one is built inside the race. A checkpoint also fires the shared stage banner, so both show at once.", states: ["Checkpoint split", "Hurry"] },
  { id: "fjcall", group: "call", name: "Flag Lads call-out", src: "flagjuice.ts:175 FlagJuice.say() (#fj-call, own style at flagjuice.ts:211)", used: "Flag Lads (shooting flags and bunting)", own: true, of: "the toast",
    note: "Yellow, 58% down, never held back by a title card.", states: ["Bunting down", "Combo over"] },
  { id: "fjcombo", group: "call", name: "Flag Lads combo", src: "flagjuice.ts:165 FlagJuice.write() (#fj-combo)", used: "Flag Lads", own: true, of: "the ride combo",
    states: ["x3", "x7"] },
  { id: "combo", group: "call", name: "Ride combo", src: "ridetricks.ts:185 (#combo, style.css:856)", used: "riding tricks", states: ["Combo", "Bailed", "New best"] },
  { id: "trophy", group: "call", name: "Trophy toast", src: "trophies.ts:184 nextToast() (#trophytoast, own style at trophies.ts:168)", used: "every trophy: race medals, gulls stars, bonfire, abbey top", own: true, of: "the toast",
    note: "Its own panel at the top, in a fourth look.", states: ["Gold"] },

  // ---- panels
  { id: "mprog", group: "panel", name: "Objective panel", src: "missionscreens.ts:164 missionProgress() (#mprog in #lstack); fed by quests.ts:1016 from job.card()",
    used: "every job and challenge, the bonfire", states: ["Seagull Attack", "Race", "Wanted", "Challenge, with lives", "Bonfire", "Flash (just changed)", "Long text"] },
  { id: "bunting", group: "panel", name: "Flag Lads meter", src: "invasion.ts:1386 Invasion.hud() (#bunting, style.css:534)", used: "pub takeovers and Flag Lads", own: true, of: "the objective panel",
    note: "Copy of the markup (drawn inside Invasion). Hidden whenever a job's panel is up, so a takeover during a job has no panel.", states: ["Takeover on", "In a square"] },
  { id: "banner", group: "panel", name: "Banner going up", src: "invasion.ts:1426 bannerBar() (#banner)", used: "pub takeovers", own: true, of: "the objective panel", states: ["Going up", "Nearly up"] },
  { id: "buscard", group: "panel", name: "Bus driver card", src: "busdriver.ts:506 hud() (#buscard, style.css:653)", used: "bus driver", own: true, of: "the objective panel",
    note: "Copy of the markup (drawn inside BusDriver).", states: ["On the route", "Bus stopping"] },
  { id: "shoot", group: "panel", name: "Shoot-out card", src: "game.ts:4826 shootCard() (#shootcard, style.css:646)", used: "penalty shoot-out", own: true, of: "the objective panel", states: ["Score"] },
  { id: "pushbeat", group: "panel", name: "Push the Bus beat", src: "pushbus.ts:579 (#pushbeat, inline style, on document.body)", used: "Push the Bus", own: true, of: "the objective panel",
    note: "Copy of the markup. On the body, not the HUD, so it stays up when the HUD is hidden.", states: ["Heave!", "Perfect"] },
  { id: "pushcab", group: "panel", name: "Push the Bus cab panel", src: "pushbus.ts:620 (#pushcab, inline style)", used: "Push the Bus, in the cab", own: true, of: "the objective panel",
    note: "Copy of the markup: a rounded panel, unlike the HUD's chamfered ones, in the slot the feed uses.", states: ["Rolling back"] },
  { id: "grip", group: "panel", name: "The Climb grip bar", src: "theclimb.ts:1213 gripBar() (inline style, on document.body)", used: "The Climb", own: true, of: "the objective panel", states: ["Tiring"] },
  { id: "rtimer", group: "panel", name: "Race checkpoint timer", src: "race.ts:598 hudBit(), drawTimer race.ts:926", used: "races", own: true, of: "the objective panel",
    note: "Copy of the markup. The panel already has the race's clock.", states: ["Plenty of time", "Running out"] },
  { id: "spec", group: "panel", name: "Watching the others", src: "racescreens.ts:156 spectating() (.rsc-spec)", used: "races, once you're over the line", states: ["Standings"] },
  { id: "feed", group: "panel", name: "Feed", src: "game.ts:4929 Game.feed() (#feed, style.css:499)", used: "everything: who took a job, who fell, a takeover", states: ["Three lines"] },

  // ---- prompts
  { id: "use", group: "prompt", name: "Press E prompt", src: "game.ts:4801 (#usehint, style.css:673); text from quests.ts:743 board(), job.hint()", used: "everything you can use", states: ["Take the job", "Challenge", "Busy", "Job's own"] },
  { id: "poster", group: "prompt", name: "Noticeboard poster", src: "quests.ts:1031 Quests.hud() (#jobposter, style.css:557)", used: "noticeboards and challenges",
    note: "Copy of the markup (built inside Quests.hud).", states: ["Job", "Challenge", "Done today"] },

  // ---- results
  { id: "end", group: "end", name: "End card", src: "missionscreens.ts:282 missionEnd() (.msc-end); quests.ts:851 endCard() for every job",
    used: "every job and challenge that has no card of its own; the bonfire (bonfire.ts:601); The Climb and the Tightrope's 'Out of lives'", states: ["Job done", "Job failed", "Called off", "Place and rows", "Long title"] },
  { id: "summary", group: "end", name: "Race results card", src: "racescreens.ts:202 summary() (.rsc-end)", used: "races (race.ts:1172) and Wanted (wanted.ts:424, in red)", own: true, of: "the end card",
    note: "A second results card: scrim behind, buttons, 'Sport' flag, 8 s. The shared end card has none of those.", states: ["Gold", "Did not finish", "Wanted: cuffed", "Wanted: got away"] },
  { id: "sheet", group: "end", name: "Driving test report", src: "missionscreens.ts:368 missionSheet()", used: "Driving Test, after each test", states: ["Pass", "Fail"] },
  { id: "tend", group: "end", name: "Results told by a toast", src: "invasion.ts:1147, busdriver.ts:267, sport.ts:607", used: "pub takeovers, bus driver, shoot-out", own: true, of: "the end card",
    note: "No card at the end: a toast and a feed line.", states: ["Pub won back", "Pub lost", "Shift over"] },

  // ---- paper
  { id: "chron", group: "paper", name: "The Chronicle (today's jobs)", src: "daily.ts:125 Daily.render() into #scoreboard (game.ts:4885)", used: "on joining, Tab, noticeboards", states: ["On joining"] },
  { id: "night", group: "paper", name: "Night out front page", src: "missionscreens.ts:377 missionNight(), from nightout.ts:263", used: "the night out", states: ["Last orders"] },
  { id: "reveal", group: "paper", name: "Zone opening card", src: "reveal.ts:95 Reveal.card() (#reveal, style.css:1106)", used: "a zone opening; the whole map", own: true, of: "the title card",
    note: "Its own look: letterbox, Cinzel, pink kicker.", states: ["New zone", "Whole map"] },
];
