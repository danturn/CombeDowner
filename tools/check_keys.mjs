// A check that no prompt names a raw key: every key, pad button or touch word a player reads comes
// from the table of controls (web/src/controls.ts), through ctl("use") or a "{use}" in a line that
// goes through ctlText. This looks through the game's source and pages for strings that name keys
// themselves ("Press E", "(M)", "<b>E</b>", "Space to", "W/S", "click to") and lists them.
//
//   node tools/check_keys.mjs          # exits 1 if it finds any
//
// A line that really must name a key (a reference page, a cheat code) can end in a "keys-ok" comment.
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
process.exit(found.length ? 1 : 0);
