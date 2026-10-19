// A check that everyone in a game plays the same version (main.ts, versionGap; net.ts): two builds
// of the game served side by side, at /old/ and /new/ of one local site, so their tabs share a local
// test room, in one muted headless Chrome (as tools/seat_probe.mjs). A player on the new build tries
// to join a game on the old one, and then the other way round: neither should get in, the joiner
// should be told why, and the players already there should get the banner. Then two on the same
// build join as usual.
//
//   node tools/version_probe.mjs --old <older web/dist> --new <newer web/dist> --out versions
//
// The two builds must be of commits more than a minute apart that both change web/, and both from
// after this check went in (older pages don't say their version over a local room).
// Writes <out>/report.txt, <out>/probe.json and <out>/*.png; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2), opt = { old: "", new: "", out: "versions", room: "VERTEST" + Math.floor(Math.random() * 1000) };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
fs.mkdirSync(opt.out, { recursive: true });


let live = false;
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((q, res) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  // once the new version's "gone live", the old pages' site says so in its version.json
  const which = u.startsWith("/old/") && !(live && u.endsWith("/version.json")) ? opt.old : opt.new;
  let f = path.join(which, u.replace(/^\/(old|new)\//, "/"));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => {
    if (e) { res.statusCode = 404; return res.end(); }
    res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream");
    res.end(b);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const linux = process.platform === "linux";
const bundled = linux && fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null;
const exe = process.env.CHROME || bundled;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  // both tabs keep running at full speed, though only one is in front
  args: [...MUTED_ARGS, "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await silenceContext(context);
async function attempt(hostSide, joinSide, n) {
  opt.room = "VERTEST" + n + Math.floor(Math.random() * 1000);
  const H = await join(`Host${n}`, hostSide);
  await wait(1500);
  const J = await join(`Joiner${n}`, joinSide, joinSide === hostSide);
  await wait(joinSide === hostSide ? 3000 : 12000);
  const h = await state(H), j = await state(J);
  log.cases.push({ hostSide, joinSide, h, j });
  await J.screenshot({ path: `${opt.out}/${n}-${joinSide}-joins-${hostSide}-joiner.png` });
  await H.screenshot({ path: `${opt.out}/${n}-${joinSide}-joins-${hostSide}-host.png` });
  await J.close(); await H.close();
  return { h, j };
}
try {
  let r = await attempt("old", "new", 1);
  check("new build joining an old game is kept out and told to wait", !r.j.inGame && /older version/.test(r.j.lookup ?? "") && r.j.retry === "Try again", JSON.stringify(r.j));
  check("the old game is told a newer player is trying to join", /newer version/.test(r.h.banner ?? ""), JSON.stringify(r.h.banner));
  r = await attempt("new", "old", 2);
  check("old build joining a new game is kept out and told to refresh", !r.j.inGame && /newer version/.test(r.j.lookup ?? "") && r.j.retry === "Refresh", JSON.stringify(r.j));
  check("the new game is told an older player is trying to join", /older version/.test(r.h.banner ?? ""), JSON.stringify(r.h.banner));
  // a page left open on the old version while the new one goes live: Play updates it first, then (the
  // site here still handing out the old page) it's kept out at the door rather than reloading for ever
  live = true;
  opt.room = "VERTEST4" + Math.floor(Math.random() * 1000);
  {
    const H = await join("Host4", "new");
    await wait(1500);
    const J = await join("Joiner4", "old", false);
    // it reloads, loads the map again, and (the room in its address) goes straight on to the door
    let j = null;
    for (const t0 = Date.now(); Date.now() - t0 < 120000; await wait(1000)) {
      j = await state(J).catch(() => null);
      if (j?.retry || j?.inGame) break;
    }
    const url = J.url();
    log.cases.push({ case: "old page, new version live", url, j });
    check("Play on an old page reloads it fresh once a newer version is live", /[?&]v=\d+/.test(url), url);
    check("and doesn't reload again if the site still hands out the old page", !j.inGame && j.retry === "Refresh", JSON.stringify(j));
    await J.close(); await H.close();
  }
  live = false;
  r = await attempt("new", "new", 3);
  check("the same build joins as usual", r.j.inGame && !r.j.lookup && !r.h.banner && !r.j.banner, JSON.stringify(r));
} catch (e) {
  complaints.push(`probe: ${e.stack ?? e}`);
} finally {
  log.checks = checks; log.complaints = complaints;
  fs.writeFileSync(`${opt.out}/probe.json`, JSON.stringify(log, null, 1));
  const lines = [...checks.map((c) => `${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ": " + c.detail : ""}`), "", complaints.length ? complaints.join("\n") : "no page errors"];
  fs.writeFileSync(`${opt.out}/report.txt`, lines.join("\n") + "\n");
  console.log(complaints.length ? complaints.join("\n") : "no page errors");
  await browser.close();
  server.close();
}
process.exit(checks.length && checks.every((c) => c.ok) && !complaints.length ? 0 : 1);
