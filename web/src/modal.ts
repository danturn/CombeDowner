// The big cards that stop you to read them (a mission's end card, a race's or a trail's results,
// a treasure hunt's or a bounty's opening poster, the night out's front page, the driving test's
// report): each gets a × in its top right corner to put it away, and Esc (or a pad's Options
// button) puts the top one away too. While one is up the mouse is let go, as it is for the big
// map, so you can click the × or its buttons with an ordinary pointer; a click anywhere off the
// card puts it away and takes the mouse back for aiming. The cards still go by themselves in time
// if you leave them, and then the next click takes the mouse back.
//
// In full screen Chrome and Edge let the game keep Esc (fullscreen.ts), so a tap of Esc here only
// puts the card away and full screen stays; Safari and Firefox always leave full screen on Esc.
//
// Nothing here goes over the network: each player puts their own cards away.
import { ctl } from "./controls";
import { padInUse } from "./gamepad";

interface Open {
  /** The whole thing, which may cover the screen. */
  el: HTMLElement;
  /** The card itself: a click off it puts it away. */
  card: () => HTMLElement;
  close: () => void;
}

const open: Open[] = [];
let freed = false;   // we let the mouse go for a card, so it's ours to take back
let relock: (byClick: boolean) => void = () => {};
let watch = 0;

/** main.ts: how to take the mouse back once the last card's gone (from a click, or not). */
export function onModalRelock(fn: (byClick: boolean) => void) { relock = fn; }

const live = (o: Open) => o.el.isConnected && !o.el.hidden && !o.el.classList.contains("out");

function prune(byClick = false) {
  for (let i = open.length - 1; i >= 0; i--) if (!live(open[i])) open.splice(i, 1);
  if (open.length) return;
  clearInterval(watch); watch = 0;
  if (freed || byClick) { freed = false; relock(byClick); }
}

/** A card that waits for you is up. */
export function modalUp() { prune(); return open.length > 0; }

/** The card a page element belongs to, if it's on one (main.ts lets clicks on it through). */
export function onModal(t: EventTarget | null) {
  return t instanceof Node && open.some((o) => live(o) && o.card().contains(t));
}

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `
.mdl-x{position:absolute;top:6px;right:6px;z-index:2;width:38px;height:38px;padding:0;margin:0;pointer-events:auto;cursor:pointer;
  display:flex;align-items:center;justify-content:center;border-radius:50%;border:2px solid #fff;background:rgba(8,14,20,.75);color:#fff;
  font:800 24px/1 'Barlow Condensed',Impact,sans-serif;text-shadow:none;box-shadow:0 2px 6px rgba(0,0,0,.5)}
/* the banners fade out at their ends: in where they're solid */
:is(.msc-end,.rsc) .band>.mdl-x{right:calc(15% + 6px)}
.msc-sheet .band .stamp{right:58px}
.mdl-x:hover,.mdl-x:focus-visible{background:#fff;color:#08131a}
@media (pointer:coarse){.mdl-x{width:46px;height:46px;font-size:28px}}`;
  document.head.appendChild(s);
}

/** Put the × in a card (again, if writing its words wiped it out). */
export function closeButton(card: HTMLElement, close: () => void) {
  style();
  if (getComputedStyle(card).position === "static") card.style.position = "relative";
  let b = card.querySelector<HTMLButtonElement>(":scope > .mdl-x");
  if (!b) {
    b = document.createElement("button");
    b.type = "button";
    b.className = "mdl-x";
    b.textContent = "×";
    // a press on it is the ×'s alone, not the game's underneath (a shot, a look round on a touch screen)
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    card.appendChild(b);
  }
  b.title = `Close (${ctl("card.close")})`;
  b.setAttribute("aria-label", "Close");
  b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); close(); prune(true); };
}

/** A card that waits for you has come up: give it its ×, let the mouse go, and take Esc for it.
 *  card is where the × goes (found afresh each time, as a card's words can be written over); close
 *  puts it away. Calling it again for a card already up just puts its × back. */
export function modal(el: HTMLElement, card: () => HTMLElement, close: () => void) {
  closeButton(card(), close);
  const had = open.find((o) => o.el === el);
  if (had) { had.card = card; had.close = close; }
  else open.push({ el, card, close });
  // a pad keeps the mouse, as it does over the big map: its Options button puts the card away
  if (document.pointerLockElement && !padInUse()) { freed = true; document.exitPointerLock(); }
  if (!watch) watch = window.setInterval(() => prune(), 250);   // for cards that go by themselves
}

/** A card's own button put it away (a results card's Continue): take the mouse back from that click. */
export function modalClicked() { prune(true); }

/** Put the top card away (Esc, a pad's Options, or a click off it). */
export function closeTopModal(byClick = false) {
  prune();
  const top = open.pop();
  if (!top) return false;
  top.close();
  prune(byClick);
  return true;
}

/** Put every card away (a click off them, back to aiming). */
export function closeModals(byClick = false) {
  prune();
  while (open.length) open.pop()!.close();
  prune(byClick);
}

// Esc puts the top card away before anything else hears it, so it doesn't pause the game too (or,
// in full screen in Chrome and Edge, let go of the mouse). Over the pause menu it's the menu's.
addEventListener("keydown", (e) => {
  if (e.code !== "Escape" || !modalUp()) return;
  const pause = document.getElementById("pause");
  if (pause && !pause.hidden) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (!e.repeat) closeTopModal();
}, true);
