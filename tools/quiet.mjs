// Runs a command with sound provably off, and says afterwards that nothing made any.
//
// Chrome's --mute-audio covers the audio device but not speechSynthesis, which goes out through
// macOS's own speech service and is heard whatever the browser's flags say. The game does speak,
// so a run with only --mute-audio is not a silent run. Hence two halves:
//
//   - the page's own ways of making sound, replaced (tools/quiet-guard.mjs, which the tools that
//     drive a browser import: an OfflineAudioContext, a dead play(), a speechSynthesis.speak that
//     counts instead of speaking)
//   - an external check of the machine's audio device before and after, so the claim doesn't rest
//     on those guards being right: no process may hold CoreAudio that wasn't holding it already
//
//   node tools/quiet.mjs -- node tools/board_shot.mjs --dist web/dist --out shots/x
//   node tools/quiet.mjs --refuse-existing -- node tools/shoot.mjs views.json
//
// Options:
//   --refuse-existing  don't run at all if anything already holds the device. Off by default,
//                      because a working desktop has Slack, Signal and Chrome holding it anyway;
//                      with it off, a holder that appears *during* the run still fails the run.
//   --strict           fail if anything holds the device after the run, not just a new holder.
//
// Exit code is the command's, unless the audio check fails: then 70, whatever the command said.
import { spawn, execSync } from "child_process";

const argv = process.argv.slice(2);
let allowExisting = true, strict = false, i = 0;
for (; i < argv.length; i++) {
  if (argv[i] === "--refuse-existing") allowExisting = false;
  else if (argv[i] === "--strict") strict = true;
  else if (argv[i] === "--") { i++; break; }
}
const cmd = argv.slice(i);
if (!cmd.length) {
  console.error("usage: node tools/quiet.mjs [--refuse-existing] [--strict] -- <command...>");
  process.exit(64);
}

const darwin = process.platform === "darwin";

/** Everything holding the audio device now, as a Map of pid -> how many handles. Mac only: on
 *  other systems there's no cheap way to ask, and the guards above are what keep the sound in. */
function holders() {
  if (!darwin) return new Map();
  try {
    const out = execSync("lsof -F pn 2>/dev/null | awk '/^p/{p=substr($0,2)} /CoreAudio|\\/dev\\/audio/{c[p]++} END{for(k in c) print k\":\"c[k]}'",
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, shell: "/bin/bash" });
    return new Map(out.split("\n").filter(Boolean).map((l) => l.split(":")).map(([p, n]) => [p, +n]));
  } catch { return new Map(); }
}
const what = (pid) => {
  try { return execSync(`ps -p ${pid} -o command= 2>/dev/null`, { encoding: "utf8" }).trim().slice(0, 96); }
  catch { return "(gone)"; }
};
const volume = () => {
  if (!darwin) return null;
  try { return execSync("osascript -e 'get volume settings' 2>/dev/null", { encoding: "utf8" }).trim(); }
  catch { return null; }
};

const before = holders(), vol = volume();
console.log(`quiet: ${before.size} process(es) already holding audio${vol ? `  [${vol}]` : ""}`);
for (const [pid, n] of before) console.log(`  before  ${pid} (${n})  ${what(pid)}`);
if (!before.size) console.log(`  (${darwin ? "nothing on this Mac is holding the device" : "can't check the device on this system; the page guards are the check"})`);

if (!allowExisting && before.size) {
  console.log(`quiet: REFUSING to run: ${before.size} process(es) already hold the audio device, so a new one couldn't be told apart from them.`);
  console.log("quiet: close them, or drop --refuse-existing (a holder appearing during the run still fails it).");
  process.exit(70);
}

const t0 = Date.now();
const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit", shell: false });
const code = await new Promise((r) => child.on("exit", (c, s) => r(c ?? (s ? 128 : 1))));

const after = holders(), volNow = volume();
const appeared = [...after].filter(([pid]) => !before.has(pid));
const speaking = [...after].some(([pid]) => /speech/i.test(what(pid)));
let ok = true;
if (appeared.length) {
  ok = false;
  console.log(`quiet: FAILED: ${appeared.length} process(es) took the audio device during the run:`);
  for (const [pid, n] of appeared) console.log(`  AFTER   ${pid} (${n})  ${what(pid)}`);
}
if (strict && after.size) { ok = false; console.log(`quiet: FAILED (--strict): ${after.size} process(es) hold audio after the run`); }
if (speaking) { ok = false; console.log("quiet: FAILED: a speech service is running after the run"); }
if (vol !== null && volNow !== vol) console.log(`quiet: note: the volume changed during the run (${vol} -> ${volNow})`);
if (ok) {
  console.log(`quiet: ok, nothing new took the audio device in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const [pid, n] of after) console.log(`  still   ${pid} (${n})  ${what(pid)}`);
}
process.exit(ok ? code : 70);
