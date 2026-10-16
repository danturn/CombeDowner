// The one thing you carry (a ride or a ladder, or firewood for the bonfire), as a little line drawing for the corner of the HUD,
// over your rounds (game.ts). Drawn in the text colour, on a 32 by 32 grid.
import type { RideKind } from "./rides";

const svg = (body: string) =>
  `<svg viewBox="0 0 32 32" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS: Record<RideKind | "ladder" | "wood", string> = {
  bike: svg(`<circle cx="7" cy="21" r="5.5"/><circle cx="25" cy="21" r="5.5"/><path d="M7 21l5-10h9l4 10M12 11l4 10 5-10M10 8h4M21 11l-1-4h3"/>`),
  bmx: svg(`<circle cx="8" cy="22" r="4.5"/><circle cx="24" cy="22" r="4.5"/><path d="M8 22l5-8h7l4 8M13 14l3 8 4-8M11 11h4M20 14l1-5h3"/>`),
  blades: svg(`<path d="M8 5h7v12h7a3 3 0 0 1 3 3v3H7z"/><circle cx="10" cy="27" r="2"/><circle cx="16" cy="27" r="2"/><circle cx="22" cy="27" r="2"/>`),
  board: svg(`<path d="M3 17h26a2 2 0 0 1-2 3H5a2 2 0 0 1-2-3z"/><circle cx="9" cy="24" r="2"/><circle cx="23" cy="24" r="2"/>`),
  scooter: svg(`<circle cx="7" cy="25" r="3"/><circle cx="25" cy="25" r="3"/><path d="M7 25h12l5-19M20 6h7"/>`),
  pogo: svg(`<path d="M16 3v22M10 7h12M11 19h10"/><path d="M14 25l2 4 2-4" />`),
  trolley: svg(`<path d="M3 6h4l3 14h15l3-10H8.5"/><circle cx="12" cy="25" r="2"/><circle cx="23" cy="25" r="2"/>`),
  ladder: svg(`<path d="M10 3v26M22 3v26M10 8h12M10 14h12M10 20h12M10 26h12"/>`),
  wood: svg(`<path d="M4 21L26 9M5 25L28 13M3 17L24 5"/><path d="M11 12l4 9M17 9l4 9"/>`),
};

/** The icon for what's in your hands. */
export const carryIcon = (k: RideKind | "ladder" | "wood") => ICONS[k];
