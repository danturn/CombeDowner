// A check that no prompt names a raw key: every key, pad button or touch word a player reads comes
// from the table of controls (web/src/controls.ts), through ctl("use") or a "{use}" in a line that
// goes through ctlText. This looks through the game's source and pages for strings that name keys
// themselves ("Press E", "(M)", "<b>E</b>", "Space to", "W/S", "click to") and lists them.
//
//   node tools/check_keys.mjs          # exits 1 if it finds any
//
// A line that really must name a key (a reference page, a cheat code) can end in a "keys-ok" comment.
//
// Then it checks the controls the prompts do name, on a pad and on a touch screen: each must come out
// as a button or a touch word there rather than falling back to its key ("1" on a phone), and each pad
// button a prompt names must do something on that page (a row in its padActions, or the big map's own).
import fs from "fs";
import path from "path";

const ROOT = new URL("../web/", import.meta.url).pathname;
// the table itself, the pad's own code, and the two reference pages written for the keyboard
const SKIP = new Set(["src/controls.ts", "src/gamepad.ts", "src/characters.ts", "src/whatswhat.ts", "characters.html", "whatswhat.html"]);
const KEY = String.raw`(?:[A-Z]|[1-9]|Space|Shift|Esc|Tab|Enter|Backspace)`;
const RULES = [
  [new RegExp(String.raw`<b>${KEY}</b>`), "a key in bold"],
  [new RegExp(String.raw`\b(?:Press|press|Hold|hold|Tap|tap) ${KEY}(?![\w'])`), "press/hold a key"],
  [new RegExp(String.raw`(?<!\w)\((?:[A-Z]|Esc|Space|Tab)\)`), "a key in brackets"],
  [new RegExp(String.raw`(?:^|[\s"'\x60(·:])${KEY} (?:to|for) [a-z]`), "a key to do something"],
  [/\bW\/S\b|\bA\/D\b|\bA or D\b|\bWASD\b|\bH\/↑/, "movement keys"],
  [/\b(?:[Cc]lick (?:to|for)|[Ll]eft click|[Rr]ight click)\b/, "a mouse click"],
  [/\b(?:keyLabel|padText)\(/, "the old key helpers"],
];

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", "dist", "public"].includes(e.name)) yield* files(p); }
    else if (/\.(ts|html)$/.test(e.name)) yield p;
  }
}

const found = [];
for (const f of files(ROOT)) {
  const rel = path.relative(ROOT, f);
  if (SKIP.has(rel)) continue;
  let block = false;
  fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    const t = line.trim();
    // comments say which key does what for whoever reads the code: only what a player reads counts
    if (block) { if (t.includes("*/")) block = false; return; }
    if (t.startsWith("/*")) { block = !t.includes("*/"); return; }
    if (t.startsWith("//") || t.startsWith("<!--") || t.includes("keys-ok")) return;
    const code = line.replace(/\s\/\/ .*$/, "");
    // in code only the strings are read by a player; in a page, all of it
    const read = rel.endsWith(".ts") ? (code.match(/(["'`])(?:\\.|(?!\1).)*\1/g) ?? []).join(" ") : code;
    for (const [re, why] of RULES) if (re.test(read)) { found.push(`${rel}:${i + 1}: ${why}: ${t.slice(0, 140)}`); break; }
  });
}
for (const l of found) console.log(l);
console.log(found.length ? `${found.length} prompt${found.length === 1 ? "" : "s"} naming keys: name them with ctl() or {id} (web/src/controls.ts)` : "No prompt names a raw key.");

// ---- the controls the prompts name, as a pad and a touch screen see them -----------------------
const C = await import(new URL("../web/src/controls.ts", import.meta.url).href);
const PLACE_IDS = new Set(Object.values(C.PLACES).flat().map((c) => c.id));
const known = (t, id) => t.some((c) => c.id === id) || PLACE_IDS.has(id);
// where each id is named: {id} in a string, ctl("id"), a stripOf row, or a whole strip("place")
const named = new Map();
const note = (id, at, strip) => { if (!named.has(id) || !strip && named.get(id).strip) named.set(id, { at, strip }); };
for (const f of files(ROOT)) {
  const rel = path.relative(ROOT, f);
  if (SKIP.has(rel) || !rel.endsWith(".ts")) continue;
  fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.includes("keys-ok")) return;
    const at = `${rel}:${i + 1}`, mines = rel.startsWith("src/mines/");
    const add = (id, strip = false) => { const tbl = mines ? C.MINES : C.STREETS; if (known(tbl, id)) note(`${mines ? "mines" : "streets"} ${id}`, at, strip); };
    for (const m of line.matchAll(/(?<![$\w])\{([a-z][a-z0-9]*(?:\.[a-z0-9]+)?)\}/g)) add(m[1]);
    for (const m of line.matchAll(/\bctl\("([a-z0-9.]+)"/g)) add(m[1]);
    if (line.includes("stripOf")) for (const m of line.matchAll(/\[\s*"([a-z0-9.]+)",\s*"[^"]*"\s*\]/g)) add(m[1]);
    for (const m of line.matchAll(/\bstrip\("([a-z]+)"(?:,\s*\[([^\]]*)\])?/g)) {
      const only = m[2] ? [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
      for (const c of C.PLACES[m[1]] ?? []) if (!only || only.includes(c.id)) add(c.id, true);
    }
  });
}
const bad = [];
const runsOf = (file, from) => {
  const src = fs.readFileSync(ROOT + file, "utf8"), i = src.indexOf(from);
  return i < 0 ? "" : src.slice(i, src.indexOf("\n}, ", i));
};
const RUNS = { streets: runsOf("src/main.ts", "padActions(STREETS"), mines: runsOf("src/mines/main.ts", "padActions(MINES") };
// the mines have no touch controls, so input() never says "touch" down there
const TOUCH = { streets: /id="touch"/.test(fs.readFileSync(ROOT + "index.html", "utf8")), mines: /id="touch"/.test(fs.readFileSync(ROOT + "mines.html", "utf8")) };
const MAP_PAD = runsOf("src/game.ts", "mapPad(b: number");
// Options pauses on every page, from the pad's own code rather than a page's table
const FIXED_PAD = new Set([C.B.options]);
// a strip leaves out what the input in use hasn't got (strip in controls.ts)
const inStrip = (c, as) => c.say?.[as] !== undefined ? !!c.say[as] : as === "pad" ? c.pad !== undefined || !!c.via : !!(c.touch || c.via);
for (const [key, { at, strip }] of [...named].sort()) {
  const [pg, id] = key.split(" ");
  C.controlsPage(pg === "mines" ? C.MINES : C.STREETS);
  const c = C.control(id), keys = C.ctl(id, "keys");
  const keyish = !!(c.keys?.length || c.mouse !== undefined);
  // what a strip leaves out for an input isn't shown there at all
  const blank = (as) => c.say?.[as] === "";
  for (const as of ["pad", "touch"]) {
    const said = C.ctl(id, as);
    if ((strip && !inStrip(c, as)) || (as === "touch" && !TOUCH[pg])) continue;
    if (keyish && !blank(as) && said === keys && !(as === "pad" && c.pad !== undefined)) bad.push(`${at}: ${pg} "${id}" shows the key "${keys}" on a ${as === "pad" ? "pad" : "touch screen"}`);
  }
  // a pad button a prompt names has to do something here
  let p = c, seen = 0;
  while (p && p.pad === undefined && p.via && seen++ < 4) p = C.control(p.via);
  if (p?.pad === undefined || c.say?.pad || FIXED_PAD.has(p.pad)) continue;
  const runs = PLACE_IDS.has(p.id) ? (p.id.startsWith("map.") ? MAP_PAD : "ok") : RUNS[pg];
  const has = runs === "ok" || new RegExp(`(?:^|[\\s{,])${p.id.replace(".", "\\.")}:|is\\("${p.id.replace(".", "\\.")}"\\)`).test(runs);
  if (!has) bad.push(`${at}: ${pg} "${id}" names ${C.PAD_NAME[p.pad]}, which does nothing on this page`);
}
for (const l of bad) console.log(l);
console.log(bad.length ? `${bad.length} control${bad.length === 1 ? "" : "s"} named wrongly on a pad or touch screen` : `All ${named.size} controls the prompts name have a pad button and a touch word.`);
process.exit(found.length || bad.length ? 1 : 0);
