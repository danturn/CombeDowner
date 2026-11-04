// The small things every piece of the HUD's words shares (missionscreens.ts, notice.ts,
// useprompt.ts and the modes that write into them): escaping a name for html, the HUD's own layer
// to draw in, a race place as "1st", and one way to add a piece's look to the page once.
// Nothing here goes over the network.

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The HUD's layer, so photo mode and a hidden HUD take a piece away too. */
export const layer = () => document.getElementById("hud") ?? document.body;

/** A place as a word with its ending raised: "1<sup>st</sup>". */
export const nth = (n: number) => `${n}<sup>${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}</sup>`;

const added = new Set<string>();
/** Add a piece's style to the page, once whoever asks. */
export function addStyle(id: string, css: string) {
  if (added.has(id)) return;
  added.add(id);
  const s = document.createElement("style");
  s.dataset.hud = id;
  s.textContent = css;
  document.head.appendChild(s);
}
