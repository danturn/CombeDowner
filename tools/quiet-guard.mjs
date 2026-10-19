// The page-side half of tools/quiet.mjs: everything that can make a sound, replaced or made
// harmless, for a tool that drives a browser at this game.
//
// Chrome's --mute-audio covers the audio device but not speechSynthesis, which goes out through
// macOS's own speech service and is heard whatever the browser's flags say. So a run that only
// passed --mute-audio was not silent, and the game does speak (Posh, quips, breakdown.ts).
//
//   import { silence } from "./quiet-guard.mjs";
//   const browser = await chromium.launch({ args: [...MUTED_ARGS] });
//   const page = await browser.newPage(...);
//   await silence(page);          // before the first goto: init scripts run on every navigation
//   ...
//   const heard = await silenceReport(page);   // what it tried to play, for the log
//
// Keep every tool that drives a browser on this, rather than each writing its own guards: they
// have to agree, and a tool that forgets one is the run that leaks.

/** The Chrome flags that keep a run off the machine's audio device. */
export const MUTED_ARGS = ["--mute-audio", "--disable-audio-output",
  "--autoplay-policy=document-user-activation-required"];

/** Install the guards on a page: no live AudioContext, no media playback, no speech. Must be
 *  called before the page navigates, so the guards are in place before any game code runs. */
export async function silence(page) {
  await page.addInitScript(() => {
    // An AudioContext that is offline can't reach the speakers, and the game only ever plays into
    // one, so everything it builds lands in a buffer nobody hears.
    class Silent extends OfflineAudioContext {
      constructor() { super(2, 44100, 44100); }
      resume() { return Promise.resolve(); }
      suspend() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    }
    window.AudioContext = window.webkitAudioContext = Silent;
    // Nothing the page tries to play as a media element plays, and each attempt is counted, so a
    // run can report that the game did try rather than leaving anyone to assume it didn't.
    window.__audioGuard = { played: 0, spoke: 0 };
    HTMLMediaElement.prototype.play = function () { window.__audioGuard.played++; return Promise.resolve(); };
    // Chrome's speech goes out through the system, not the muted device: drop it at the call.
    if (window.speechSynthesis) {
      const synth = window.speechSynthesis;
      const real = synth.speak.bind(synth);
      synth.speak = (u) => { window.__audioGuard.spoke++; };
      synth.speak.real = real;
    }
  });
}

/** What the guards caught, and whether the context is really the silent one. */
export async function silenceReport(page) {
  return page.evaluate(() => {
    const g = window.__audioGuard ?? {};
    const Ctx = window.AudioContext;
    return {
      played: g.played ?? 0,
      spoke: g.spoke ?? 0,
      contextIsSilent: Ctx ? Ctx.name === "Silent" : null,
    };
  });
}

/** One line saying what was silenced, for a tool's log. */
export async function silenceNote(page) {
  const r = await silenceReport(page);
  const ok = r.contextIsSilent !== false;
  return `audio: ${r.played} media play() and ${r.spoke} speak() silenced; context=${r.contextIsSilent ? "Silent" : "REAL"}${ok ? "" : " (WARNING: AudioContext was not replaced)"}`;
}
