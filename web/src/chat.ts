// The chat phone: \ (or "Chat" in the pause menu, on a touch screen) brings up a mobile on the right
// of the screen, done up like the colour screen of a Nokia 3300 from 2003: signal bars down the left,
// the battery down the right, the messages in a small pixel font on the backlit screen, the
// characters you've got left counting down from 160 as you type, and the two soft keys along the
// bottom (Send and Back). Type and press Enter and it goes to everyone in the game, on any map in the
// room; what others send comes in with the old "SMS" beep, and the phone pops up for a few seconds to
// show it even when you haven't got it out.
//
// A line starting with / is a command, for trying things out (dev.ts says which there are). Some
// put a list on the screen instead (/spawn): ↑ and ↓ pick, Enter does it, typing narrows the list
// down, and on a touch screen you tap one. Back goes from the list to the messages, and from there
// puts the phone away.
//
// While the phone's out it's a card that waits for you (modal.ts): the mouse is let go so the list
// can be clicked, Esc puts it away without pausing, and a click off it takes the mouse back. What you
// type goes to the phone alone, not to your feet or your gun.
//
// Who decides what: the text you send goes to everyone as it is ("tx", game.ts); nobody checks it.
// What a command does is dev.ts's business.
import * as SFX from "./audio";
import { modal } from "./modal";

/** What the game does with what's typed: game.ts fills these in for whichever game is running. */
export interface ChatHooks {
  /** Can the phone come out just now (playing, not on the big map)? */
  canOpen(): boolean;
  /** A line of text for everyone. */
  say(text: string): void;
  /** A /command: its word (lower case, without the /) and whatever came after it. */
  command(word: string, rest: string): void;
}

/** One thing on a list the phone shows (/spawn's). */
export interface PickItem { label: string; group?: string; run(): void }

const MAX = 160;               // a text message's letters
const KEEP = 60;               // lines kept on the phone
const PEEK = 7000;             // ms the phone stays up for a message that comes in while it's away

let hooks: ChatHooks | null = null;
let root: HTMLDivElement, log: HTMLOListElement, list: HTMLOListElement, input: HTMLInputElement, title: HTMLElement;
let left: HTMLElement, mid: HTMLElement, right: HTMLElement;
let isOpen = false, peekTimer = 0;
let picking: { title: string; items: PickItem[]; shown: PickItem[]; at: number } | null = null;

/** game.ts: point the phone at this game (the train builds a new Game for each town; the messages stay). */
export function useChat(h: ChatHooks | null) { hooks = h; if (!h) close(); }

/** Is the phone out (taking what you type)? */
export const chatOpen = () => isOpen;

function build() {
  if (root) return;
  root = document.createElement("div");
  root.id = "chatphone";
  root.className = "nokia";
  root.hidden = true;
  root.innerHTML = `<div class="nk-screen">
    <div class="nk-top"><span class="nk-sig"><i></i><i></i><i></i><i></i><i></i></span><b class="nk-title">Messages</b><span class="nk-bat"><i></i><i></i><i></i><i></i></span></div>
    <ol class="nk-log"></ol>
    <ol class="nk-list" hidden></ol>
    <input class="nk-input" type="text" maxlength="${MAX}" autocomplete="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="send" placeholder="Write message">
    <div class="nk-keys"><button type="button" class="nk-l">Send</button><span class="nk-c">${MAX}</span><button type="button" class="nk-r">Back</button></div>
  </div>`;
  document.body.appendChild(root);
  log = root.querySelector(".nk-log")!;
  list = root.querySelector(".nk-list")!;
  input = root.querySelector(".nk-input")!;
  title = root.querySelector(".nk-title")!;
  left = root.querySelector(".nk-l")!;
  mid = root.querySelector(".nk-c")!;
  right = root.querySelector(".nk-r")!;
  // what's typed here is the phone's alone: not a step, a jump, a reload or a cheat word
  const mine = (e: KeyboardEvent) => e.stopPropagation();
  input.addEventListener("keydown", (e) => { mine(e); onKey(e); });
  input.addEventListener("keyup", mine);
  input.addEventListener("keypress", mine);
  input.addEventListener("input", () => { mid.textContent = String(MAX - input.value.length); if (picking) filter(); });
  // a press on the phone is the phone's, not a shot or a look round on a touch screen
  root.addEventListener("pointerdown", (e) => e.stopPropagation());
  left.onclick = () => enter();
  right.onclick = () => back();
}

/** Bring the phone out to write on. */
export function openChat(text = "") {
  build();
  if (!hooks) return;
  clearTimeout(peekTimer);
  // let go of anything held down as it came out, so you don't walk on while typing
  dispatchEvent(new Event("blur"));
  isOpen = true;
  root.hidden = false;
  root.classList.remove("peek");
  root.classList.add("open");
  input.value = text;
  mid.textContent = String(MAX - text.length);
  showMode();
  modal(root, () => root, () => closed());
  input.focus({ preventScroll: true });
  scrollDown();
}

/** Put it away. */
function close() {
  if (!root || !isOpen) return;
  closed();
}

/** It's been put away (by Back, Esc or a click off it): the list goes, and the messages with it. */
function closed() {
  isOpen = false;
  picking = null;
  input.blur();
  root.classList.remove("open");
  root.hidden = true;
  showMode();
}

/** Back: from a list to the messages, and from there away. */
function back() {
  if (picking) { picking = null; input.value = ""; mid.textContent = String(MAX); showMode(); input.focus({ preventScroll: true }); return; }
  closeModal();
}

function showMode() {
  const p = !!picking;
  list.hidden = !p;
  log.hidden = p;
  title.textContent = p ? picking!.title : "Messages";
  left.textContent = p ? "Select" : "Send";
  input.placeholder = p ? "Find" : "Write message";
  if (p) filter();
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter") { e.preventDefault(); enter(); return; }
  if (e.key === "\\" && !input.value) { e.preventDefault(); closeModal(); return; }
  if (picking && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    const n = picking.shown.length;
    if (n) { picking.at = (picking.at + (e.key === "ArrowDown" ? 1 : -1) + n) % n; drawList(); }
  }
}

/** Enter, or the Send/Select soft key. */
function enter() {
  if (picking) { picking.shown[picking.at]?.run(); return; }
  const text = input.value.trim();
  input.value = "";
  mid.textContent = String(MAX);
  if (!text) { close(); return; }
  if (text.startsWith("/")) {
    const [word, ...rest] = text.slice(1).split(/\s+/);
    hooks?.command(word.toLowerCase(), rest.join(" "));
  } else hooks?.say(text);
  // a command that put a list up keeps the phone out; anything else, and it goes away, the
  // messages left up a moment to read
  if (!picking) { closeModal(); peek(); }
}

/** Put the phone away as a card does (modal.ts's Esc), so the mouse comes back. */
function closeModal() {
  // the card's own × is hidden (the soft keys do its job): its click puts the card away and takes the mouse back
  const x = root.querySelector<HTMLButtonElement>(".mdl-x");
  if (x) x.click(); else close();
}

/** Show the messages for a few seconds without taking what you type (one came in, or you just sent one). */
function peek() {
  if (isOpen) { scrollDown(); return; }
  root.hidden = false;
  root.classList.add("peek");
  scrollDown();
  clearTimeout(peekTimer);
  peekTimer = window.setTimeout(() => { if (!isOpen) { root.hidden = true; root.classList.remove("peek"); } }, PEEK);
}

function scrollDown() { log.scrollTop = log.scrollHeight; }

/** A line on the phone. who: the sender's name, with their colour (none for the phone's own word). */
export function chatLine(text: string, who?: { name: string; colour: string; me?: boolean }) {
  build();
  const li = document.createElement("li");
  if (who) {
    const b = document.createElement("b");
    b.className = "nk-who";
    b.style.setProperty("--who", who.colour);
    b.textContent = who.name;
    li.append(b, document.createTextNode(" " + text));
    if (who.me) li.className = "me";
  } else {
    li.className = "sys";
    li.textContent = text;
  }
  log.appendChild(li);
  while (log.children.length > KEEP) log.firstElementChild!.remove();
  if (who && !who.me) SFX.textIn();
  peek();
}

/** Put a list on the phone to pick from (/spawn): ↑ ↓ and Enter, typing to narrow it, or a tap. */
export function chatPick(name: string, items: PickItem[]) {
  if (!isOpen) openChat();
  picking = { title: name, items, shown: items, at: 0 };
  input.value = "";
  mid.textContent = String(MAX);
  showMode();
  input.focus({ preventScroll: true });
}

function filter() {
  if (!picking) return;
  const q = input.value.trim().toLowerCase();
  const n = Number(q);
  picking.shown = !q ? picking.items
    : Number.isInteger(n) && n >= 1 && n <= picking.items.length ? [picking.items[n - 1]]
    : picking.items.filter((it) => it.label.toLowerCase().includes(q) || it.group?.toLowerCase().includes(q));
  picking.at = Math.min(picking.at, Math.max(0, picking.shown.length - 1));
  drawList();
}

function drawList() {
  if (!picking) return;
  list.textContent = "";
  let group = "";
  picking.shown.forEach((it, k) => {
    if (it.group && it.group !== group) {
      group = it.group;
      const h = document.createElement("li");
      h.className = "nk-group";
      h.textContent = group;
      list.appendChild(h);
    }
    const li = document.createElement("li");
    li.className = k === picking!.at ? "nk-item on" : "nk-item";
    li.textContent = `${picking!.items.indexOf(it) + 1}. ${it.label}`;
    li.onclick = () => { if (!picking) return; picking.at = k; drawList(); it.run(); input.focus({ preventScroll: true }); };
    list.appendChild(li);
  });
  if (!picking.shown.length) {
    const li = document.createElement("li");
    li.className = "nk-group";
    li.textContent = "No matches";
    list.appendChild(li);
  }
  list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
}

// \ anywhere in play (not in a text box) brings the phone out
addEventListener("keydown", (e) => {
  if (e.key !== "\\" || e.repeat || isOpen || !hooks?.canOpen()) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  e.preventDefault();
  openChat();
});
