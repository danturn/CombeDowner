// Every cheat in the streets game, in one list, and the page that shows them all: type CHEATS while
// you play. Each cheat listens for its own word where it does its work (game.ts, wings.ts, gore.ts,
// wingsuit.ts); this list only names them and says what they do, from the words those files use.
//
// Nothing here goes over the network: the page is your own.
import { CHEAT as CLARET } from "./gore";
import { closeButton, modal } from "./modal";
import { PAGE, ttBar, ttTitle } from "./teletext";
import { CHEAT as HEAVEN } from "./wings";
import { CHEAT as SQUIRREL } from "./wingsuit";

export const IDKFA = "idkfa";
const SHOW = "cheats";

const CHEATS: { word: string; does: string }[] = [
  { word: IDKFA, does: "A full load of rounds" },
  { word: HEAVEN, does: "The angel's wings, that never tire or fold away (type it again to put them away)" },
  { word: SQUIRREL, does: "The wingsuit, on your back" },
  { word: CLARET, does: "Blood instead of paint (type it again for paint)" },
  { word: SHOW, does: "This page" },
];

let page: HTMLDivElement | null = null;

function close() { page?.remove(); page = null; }

function show() {
  if (page) return;
  page = document.createElement("div");
  page.id = "cheats";
  page.className = "overlay";
  page.innerHTML = `<div class="card tt cheatcard">
    ${ttBar(PAGE.cheats)}${ttTitle("Cheats")}
    <dl class="cheatlist">${CHEATS.map((c) => `<dt>${c.word.toUpperCase()}</dt><dd>${c.does}</dd>`).join("")}</dl>
    <div class="pubbar"><p class="hint">Type one any time you're playing</p><button type="button" class="cheatback">Back</button></div>
  </div>`;
  document.body.appendChild(page);
  const card = page.querySelector<HTMLElement>(".cheatcard")!;
  page.querySelector<HTMLButtonElement>(".cheatback")!.onclick = close;
  closeButton(card, close);
  modal(page, () => card, close, () => !!page);
}

let typed = "";
addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) || e.key.length !== 1) return;
  typed = (typed + e.key.toLowerCase()).slice(-SHOW.length);
  if (typed === SHOW) { typed = ""; show(); }
});
