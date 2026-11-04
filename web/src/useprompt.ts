// The prompt under the crosshair that says what a press does here ("E Take the job", "E Get in",
// "Riding in the bus · E to get out"): one line for everything you can use, written by game.ts from
// whatever has the use key at that moment (a vehicle, a door, a noticeboard, a pub, a bus stop, the
// mines door, a job's own use). Each key in it is drawn as a key cap, named for the input in use (a
// key, a pad's button, or a touch screen's button word), and on a touch screen the cap for use or
// ride is itself a button, so the prompt can be tapped as the button it names.
//
// It goes while a mission's result card is up or a race's entries banner says what E does, and is
// written only when its words change. Nothing here goes over the network.
import { ctl, ctlText, input } from "./controls";
import { addStyle } from "./hudkit";
import { show } from "./show";

addStyle("useprompt", `
#usehint kbd,#shoothint kbd{display:inline-block;min-width:1.3em;padding:1px 6px 0;margin:0 3px 0 0;border:1px solid var(--accent);border-bottom-width:3px;border-radius:3px;
  font:inherit;color:var(--accent);text-align:center;line-height:1.15;letter-spacing:.04em}
#usehint.touch kbd[data-ctl]{pointer-events:auto;padding:3px 10px 2px;background:rgba(255,221,0,.12);cursor:pointer}
body:has(.msc-result:not(.out)) #usehint,body:has(.msc-wait:not([hidden])) #usehint{visibility:hidden}`);

/** Controls whose key cap is a button on a touch screen (touch.ts says what each does). */
export const TAPPABLE = new Set(["use", "ride"]);

/** A prompt's text with each {control} drawn as a key cap. */
export function keycaps(text: string): string {
  const out = text.replace(/(<b>)?\{([a-z0-9.]+)\}(<\/b>)?/g, (m, _a, id: string) => {
    const name = ctl(id);
    if (name === id) return m;
    return `<kbd${TAPPABLE.has(id) ? ` data-ctl="${id}"` : ""}>${name}</kbd>`;
  });
  return ctlText(out);
}

/** Put the prompt up, or take it down with "". */
export function usePrompt(text: string) {
  const el = document.getElementById("usehint");
  if (!el) return;
  const touch = input() === "touch";
  if (el.classList.contains("touch") !== touch) el.classList.toggle("touch", touch);
  show(el, text ? keycaps(text) : "", !!text);
}
