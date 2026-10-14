// Full screen from the pause menu: the page itself goes full screen, rather than the browser's own
// (F11 or the green button), which drops back to a window when you press Esc to pause.
// In full screen Chrome and Edge let the game keep the Esc key, so Esc pauses as usual and you hold
// Esc down to leave full screen. Safari and Firefox don't, and there Esc still leaves full screen.
// It's remembered for this tab, so going down the mines or into the deli (another page) and back
// puts you back in full screen at your next click into the game.
//
// Nothing here goes over the network.

const KEY = "cd-fullscreen";
const remember = (on: boolean) => { try { if (on) sessionStorage.setItem(KEY, "1"); else sessionStorage.removeItem(KEY); } catch { /* private window */ } };
const remembered = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } };

type KeyboardLock = { lock?: (codes: string[]) => Promise<void>; unlock?: () => void };
const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
let escHeld = false;   // the game has the Esc key (Chrome and Edge, in full screen only)

let leaving = false;   // going to another page: the browser leaves full screen, but you didn't ask to
addEventListener("pagehide", () => (leaving = true));
addEventListener("beforeunload", () => (leaving = true));
addEventListener("pageshow", () => (leaving = false));

const buttons: HTMLElement[] = [];
function label() {
  for (const b of buttons) b.textContent = document.fullscreenElement ? "Leave full screen" : "Full screen";
}

async function enter() {
  if (!document.fullscreenEnabled || document.fullscreenElement) return;
  try { await document.documentElement.requestFullscreen({ navigationUI: "hide" }); } catch { return; }
  remember(true);
  try { if (keyboard?.lock) { await keyboard.lock(["Escape"]); escHeld = true; } } catch { /* not allowed here */ }
}

function exit() {
  remember(false);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/** Back into full screen if you were in it before this page, from a click that's starting play. */
export function resumeFullscreen() {
  if (remembered()) void enter();
}

/** A button that goes in and out of full screen. Hidden where the page can't go full screen (iPhones). */
export function fullscreenButton(b: HTMLElement) {
  if (!document.fullscreenEnabled) { b.hidden = true; return; }
  b.hidden = false;
  buttons.push(b);
  label();
  b.addEventListener("click", () => { if (document.fullscreenElement) exit(); else void enter(); });
}

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    escHeld = false;
    keyboard?.unlock?.();
    if (!leaving) remember(false);   // you held Esc (or used the browser's own control) to leave
  }
  label();
});

// With the game holding Esc the browser no longer lets go of the mouse on Esc, so do it here:
// the page then pauses just as it would have.
addEventListener("keydown", (e) => {
  if (e.code === "Escape" && escHeld && document.pointerLockElement) document.exitPointerLock();
});
