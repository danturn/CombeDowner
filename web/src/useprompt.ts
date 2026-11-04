// The prompt under the crosshair that says what a press does here ("E Take the job", "E Get in",
// "Riding in the bus · E to get out"): one line for everything you can use, written by game.ts from
// whatever has the use key at that moment (a vehicle, a door, a noticeboard, a pub, a bus stop, the
// mines door, a job's own use). Each key in it is a key cap (keycap.ts), and on a touch screen the cap
// for use or ride is itself a button, so the prompt can be tapped as the button it names.
//
// It goes while a mission's result card is up or a race's entries banner says what E does, and is
// written only when its words change. Nothing here goes over the network.
import { input } from "./controls";
import { keycaps } from "./keycap";
import { addStyle } from "./hudkit";
import { show } from "./show";

addStyle("useprompt", `
#usehint,#shoothint{--cap-ink:var(--accent)}
body:has(.msc-result:not(.out)) #usehint,body:has(.msc-wait:not([hidden])) #usehint{visibility:hidden}`);

/** Put the prompt up, or take it down with "". */
export function usePrompt(text: string) {
  const el = document.getElementById("usehint");
  if (!el) return;
  const touch = input() === "touch";
  if (el.classList.contains("touch") !== touch) el.classList.toggle("touch", touch);
  show(el, text ? keycaps(text) : "", !!text);
}
