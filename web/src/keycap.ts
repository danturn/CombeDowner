// A key cap: how every on-screen line shows a key to press ("E", "Space", a pad's "A", a touch
// screen's "Use"). The use prompt, guidance, the keeper's prompt and a job's brief all draw their keys
// here, so they look the same everywhere and a fix to one is a fix to all. Where it sits only says
// what colour its keys are (--cap-ink); the cap takes the colour of the words round it otherwise.
// On a touch screen the cap for use or ride is itself a button (touch.ts). Nothing here goes over
// the network.
import { ctl, ctlText } from "./controls";
import { addStyle } from "./hudkit";

// The page's own kbd rule draws keys on pale paper for the menus; a cap in a line of words must not
// pick that up, or a yellow letter lands on a near-white cap.
addStyle("keycap", `
kbd.cap{display:inline-block;min-width:1.3em;padding:1px 6px 0;margin:0 3px 0 0;box-sizing:content-box;
  border:1px solid currentColor;border-bottom-width:3px;border-radius:3px;background:transparent;
  font:inherit;color:var(--cap-ink,currentColor);text-align:center;line-height:1.15;letter-spacing:.04em;text-transform:inherit}
.touch kbd.cap[data-ctl]{pointer-events:auto;padding:3px 10px 2px;background:color-mix(in srgb,currentColor 12%,transparent);cursor:pointer}`);

/** Controls whose key cap is a button on a touch screen (touch.ts says what each does). */
export const TAPPABLE = new Set(["use", "ride"]);

/** A line's text with each {control} drawn as a key cap. */
export function keycaps(text: string): string {
  const out = text.replace(/(<b>)?\{([a-z0-9.]+)\}(<\/b>)?/g, (m, _a, id: string) => {
    const name = ctl(id);
    if (name === id) return m;
    return `<kbd class="cap"${TAPPABLE.has(id) ? ` data-ctl="${id}"` : ""}>${name}</kbd>`;
  });
  return ctlText(out);
}
