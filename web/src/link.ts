// Link a device: carry your room saves and your own things (name, look, settings, bests, trophies)
// to another phone or computer, with no server. On the menu, one device shows a six-letter code and
// the other types it in; they meet in a room of their own named after the code (the same Trystero
// signalling as a game), each says whose it is, and once both have said yes each sends the other
// everything (saves.ts pack) and merges what it gets: per room the furthest on, per best the best,
// so both end up with everything either had. Your name, look and settings come over to the device
// that typed the code in. For two devices that can't both be online, the whole save can be copied as
// text and pasted on the other.
//
// Who decides what: each device decides for itself what it takes in. Nothing is sent until both
// have said yes, and a device only listens to the first other device to turn up with the code. The
// "lk" messages only ever go round a link room, never a game.
import { connect, type Net } from "./net";
import * as Saves from "./saves";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LEN = 6;
const LOCAL = new URLSearchParams(location.search).get("net") === "local";

function newCode(): string {
  const a = new Uint32Array(LEN);
  crypto.getRandomValues(a);
  return [...a].map((v) => CHARS[v % CHARS.length]).join("");
}
const cleanLink = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, LEN);

function whose(): string {
  let name = "";
  try { name = localStorage.getItem("cd-name")?.trim() ?? ""; } catch { /* storage may be blocked */ }
  const kind = /iPhone|iPad|Android|Macintosh|Windows|Linux/.exec(navigator.userAgent)?.[0].replace("Macintosh", "Mac") ?? "device";
  return name ? `${name}'s ${kind}` : `a ${kind}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  e.append(...kids);
  return e;
}
const button = (text: string, onclick: () => void, primary = false) => el("button", { type: "button", textContent: text, onclick, className: primary ? "primary" : "" });

let sheet: HTMLElement | null = null;
let net: Net | null = null;

function hangUp() { net?.leave(); net = null; }

/** Open the sheet. done: what to do once something's been brought in (main.ts reloads the page). */
export function openLink(done: () => void) {
  sheet?.remove();
  const body = el("div", { className: "cardbody linkbody" });
  sheet = el("div", { id: "link", className: "overlay" },
    el("div", { className: "card" },
      el("header", { className: "masthead" }, el("span", { className: "mark" }), el("span", {}, "Bath & North East Somerset", el("b", {}, "Link a device"))),
      body));
  sheet.setAttribute("role", "dialog");
  document.body.append(sheet);
  const close = () => { hangUp(); sheet?.remove(); sheet = null; };
  const show = (...kids: (Node | string)[]) => body.replaceChildren(...kids);
  const finish = (r: { rooms: number; keys: number }) => {
    hangUp();
    show(el("h2", { textContent: "Done" }),
      el("p", { className: "inset", textContent: r.keys
        ? `Brought in ${r.keys} thing${r.keys === 1 ? "" : "s"}${r.rooms ? `, and ${r.rooms} room${r.rooms === 1 ? "" : "s"} further on than ${r.rooms === 1 ? "it was" : "they were"} here` : ""}.`
        : "Nothing new: this device already had everything." }),
      el("div", { className: "row" }, button("Carry on", () => { close(); if (r.keys) done(); }, true)));
  };

  const start = () => show(
    el("p", { className: "hint", textContent: "Carry your rooms' progress, trophies, bests, name and settings to another phone or computer. Nothing is lost on either: each room keeps whichever got furthest." }),
    el("div", { className: "row" }, button("Show a code", () => meet(newCode(), true), true), button("Enter a code", enter)),
    el("p", { className: "hint", textContent: "Show a code on the device you've played on, and enter it on the new one. Both need to be online. Can't be? Copy your save as text and paste it on the other." }),
    el("div", { className: "row" }, button("Copy save as text", copyText), button("Paste a save", pasteText)),
    el("div", { className: "row" }, button("Close", close)));

  const enter = () => {
    const input = el("input", { className: "code", maxLength: LEN, placeholder: "ABC234", autocomplete: "off", spellcheck: false, inputMode: "text" });
    input.setAttribute("autocapitalize", "characters");
    const err = el("p", { className: "err" });
    const go = () => { const c = cleanLink(input.value); if (c.length === LEN) meet(c, false); else err.textContent = `The code is ${LEN} letters and numbers.`; };
    input.oninput = () => { const v = cleanLink(input.value); if (v !== input.value) input.value = v; };
    input.onkeydown = (e) => { if (e.key === "Enter") go(); };
    show(el("label", {}, el("span", { className: "q", textContent: "The code on the other device" }), input), err,
      el("div", { className: "row" }, button("Link", go, true), button("Back", start)));
    input.focus();
  };

  /** Both devices: meet in the code's own room, swap names, both say yes, swap packs. shower: this one showed the code. */
  const meet = (code: string, shower: boolean) => {
    hangUp();
    const n = connect(`link:${code}`, LOCAL);
    net = n;
    let partner = "", iSaid = false, theySaid = false, sent = false, mine: { rooms: number; keys: number } | null = null, theyGot = false;
    const status = el("p", { className: "hint", textContent: "Waiting for the other device…" });
    const waiting = () => show(
      ...(shower ? [el("p", { className: "q", textContent: "Enter this code on the other device:" }), el("p", { className: "linkcode", textContent: code })]
        : [el("p", { className: "q", textContent: `Looking for the device showing ${code}` })]),
      status, el("div", { className: "row" }, button("Cancel", () => { hangUp(); start(); })));
    waiting();
    const say = (d: unknown) => { if (partner) n.send("lk", d, partner); };
    const trySend = () => { if (iSaid && theySaid && !sent) { sent = true; say({ op: "save", p: Saves.pack() }); } };
    const tryDone = () => { if (mine && theyGot) finish(mine); };
    const adopt = (id: string) => {
      if (partner || net !== n) return;
      partner = id;
      say({ op: "hi", who: whose(), ...Saves.packSize(Saves.pack()) });
    };
    n.onJoin = adopt;
    n.onLeave = (id) => {
      if (id !== partner || net !== n || mine) return;
      partner = ""; iSaid = theySaid = sent = false;
      waiting();
      status.textContent = "The other device went away. Waiting for it to come back…";
    };
    n.on("lk", (d, from) => {
      if (d?.op === "hi") adopt(from);
      if (net !== n || from !== partner || !d || typeof d !== "object") return;
      if (d.op === "hi") {
        const rooms = Number(d.rooms) | 0, cups = Number(d.trophies) | 0;
        const yes = button("Link them", () => { iSaid = true; say({ op: "ok" }); wait.textContent = "Waiting for the other device to say yes…"; yes.disabled = true; trySend(); }, true);
        const wait = el("p", { className: "hint", textContent: "" });
        show(el("p", { className: "q", textContent: `Found ${String(d.who ?? "a device").slice(0, 40)}` }),
          el("p", { className: "inset", textContent: `${rooms} room${rooms === 1 ? "" : "s"} saved, ${cups} troph${cups === 1 ? "y" : "ies"}. Both devices will end up with everything either has.${shower ? "" : " This one takes that device's name, look and settings."}` }),
          wait, el("div", { className: "row" }, yes, button("No", () => { say({ op: "no" }); hangUp(); start(); })));
      } else if (d.op === "ok") { theySaid = true; trySend(); }
      else if (d.op === "no") { hangUp(); show(el("p", { className: "inset", textContent: "The other device said no." }), el("div", { className: "row" }, button("Back", start))); }
      else if (d.op === "save" && iSaid && !mine && d.p && typeof d.p === "object") {
        mine = Saves.merge(d.p, !shower);
        say({ op: "got" });
        status.textContent = "Brought in. Finishing…";
        tryDone();
      } else if (d.op === "got") { theyGot = true; tryDone(); }
    });
  };

  const copyText = async () => {
    const box = el("textarea", { readOnly: true, value: "Packing…" });
    const said = el("p", { className: "hint" });
    show(el("p", { className: "hint", textContent: "Your whole save as text. Send it to yourself (a message or an email) and paste it on the other device." }),
      box, said,
      el("div", { className: "row" }, button("Copy", async () => {
        box.select();
        try { await navigator.clipboard.writeText(box.value); said.textContent = "Copied."; }
        catch { said.textContent = document.execCommand?.("copy") ? "Copied." : "Select it all and copy it by hand."; }
      }, true), button("Back", start)));
    box.value = await Saves.packText();
  };

  const pasteText = () => {
    const box = el("textarea", { placeholder: "CDSAVE1:…", spellcheck: false });
    const err = el("p", { className: "err" });
    show(el("p", { className: "hint", textContent: "Paste a save copied from another device. Each room keeps whichever got furthest, and this device takes that one's name, look and settings." }),
      box, err,
      el("div", { className: "row" }, button("Bring it in", async () => {
        const p = await Saves.unpackText(box.value);
        if (!p) { err.textContent = "That doesn't look like a save from this game."; return; }
        finish(Saves.merge(p, true));
      }, true), button("Back", start)));
    box.focus();
  };

  start();
}
