// How long a voice takes from one player's mic to another's ears, measured over a real WebRTC link
// between two pages in one Chrome on this machine (no network delay, so what's left is what the
// browsers and the game add). Page A's mic is a fake one playing a beep a second; both pages listen
// for the beep's start in Web Audio, as the game hears voices (voice.ts), and the gap between the two
// is the delay through the link. The sound engine's own output delay is added from the browser's
// figures. Muted: nothing reaches the speakers.
//
//   node tools/voicelag.mjs                       the game's settings (web/src/voicelink.ts)
//   node tools/voicelag.mjs --old                 as before: 20 ms packets and a "balanced" sound engine
//   node tools/voicelag.mjs --game                through the game's own links (net.ts), found over the Nostr relays
//   node tools/voicelag.mjs --secs 20 --headed
//
// Options mix and match: --ptime 20 (leave the packets alone), --hint balanced|interactive, --jbt
// none|<ms> (the jitter buffer target; the game asks for 0), --plain-mic (no noise suppression or
// gain control). CHROME=<path> picks the browser; Playwright's own Chromium by default, as the
// installed Chrome may never answer for the fake mic. On one machine the network adds nothing, so
// this shows what the browsers and the game add, not what the distance does.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { MUTED_ARGS } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const req = createRequire(WEB + "package.json");
const { chromium } = req("playwright");
const esbuild = req("esbuild");

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const old = args.includes("--old");
const cfg = {
  ptime: Number(opt("ptime", old ? 20 : 10)),
  hint: opt("hint", old ? "balanced" : "game"),
  jbt: opt("jbt", "0"),
  plainMic: args.includes("--plain-mic"),
  game: args.includes("--game"),
};
const secs = Number(opt("secs", 15));

// a beep a second: 60 ms of 1 kHz, with 2 ms ramps so its start is sharp but clean
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voicelag-"));
const wav = path.join(dir, "beep.wav");
{
  const rate = 48000, n = rate, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate, env = t < 0.06 ? Math.min(1, t / 0.002, (0.06 - t) / 0.002) : 0;
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 1000 * t) * env * 0.5 * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(wav, Buffer.concat([h, data]));
}

const pack = async (src, name) => (await esbuild.build({ stdin: { contents: src, resolveDir: WEB + "src", loader: "ts" }, bundle: true, write: false, format: "iife", globalName: name,
  define: { __BUILD__: "0", "import.meta.env": "{}" }, logLevel: "error" })).outputFiles[0].text;
const lib = await pack(`export * from "./voicelink";`, "VL") + (cfg.game ? await pack(`export { connect } from "./net";`, "NET") : "");
const room = `VOICELAG${Date.now().toString(36).toUpperCase()}`;

const PAGE = `<!doctype html><meta charset="utf-8"><body><script>${lib}</script><script>
const cfg = ${JSON.stringify(cfg)}, role = location.hash.slice(1);
const out = window.out = { onsets: [], stats: [], ctx: null, err: null };
const DETECT = \`registerProcessor("onset", class extends AudioWorkletProcessor {
  constructor() { super(); this.quiet = 0; }
  process(ins) {
    const x = ins[0][0]; if (!x) return true;
    for (let i = 0; i < x.length; i++) {
      if (Math.abs(x[i]) > 0.05) { if (this.quiet > 24000) this.port.postMessage(currentFrame + i); this.quiet = 0; }
      else this.quiet++;
    }
    return true;
  }
});\`;
async function engine() {
  const hint = cfg.hint === "game" ? VL.latencyHint() : cfg.hint;
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: hint });
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([DETECT], { type: "text/javascript" })));
  const det = new AudioWorkletNode(ctx, "onset");
  det.port.onmessage = () => out.onsets.push(performance.timeOrigin + performance.now());
  const sink = ctx.createGain(); sink.gain.value = 0; det.connect(sink).connect(ctx.destination);
  await ctx.resume();
  setTimeout(() => out.ctx = { hint, base: ctx.baseLatency * 1000, output: (ctx.outputLatency || 0) * 1000 }, 1000);
  return [ctx, det];
}
const net = cfg.game ? NET.connect(${JSON.stringify(room)}, false) : null;
if (net && role === "a") net.onJoin = () => { if (!started) { started = true; start(); } };
const ch = new BroadcastChannel("voicelag");
const pc = new (cfg.ptime === 10 ? VL.VoiceLink : RTCPeerConnection)();
pc.onicecandidate = (e) => e.candidate && ch.postMessage({ from: role, cand: e.candidate.toJSON() });
ch.onmessage = async ({ data }) => {
  if (data.from === role) return;
  if (data.cand) return pc.addIceCandidate(data.cand);
  if (data.sdp) {
    await pc.setRemoteDescription(data.sdp);
    if (data.sdp.type === "offer") { await pc.setLocalDescription(); ch.postMessage({ from: role, sdp: pc.localDescription.toJSON() }); }
  }
  if (data.go && role === "a" && !started) { started = true; start(); }
};
let started = false;
async function start() {
  try {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: !cfg.plainMic, autoGainControl: !cfg.plainMic } });
    const [ctx, det] = await engine();
    ctx.createMediaStreamSource(mic).connect(det);
    if (net) return net.addStream(mic);
    pc.addTrack(mic.getAudioTracks()[0], mic);
    await pc.setLocalDescription();
    ch.postMessage({ from: role, sdp: pc.localDescription.toJSON() });
  } catch (e) { out.err = String(e); }
}
if (role === "b") {
  let det, ctx;
  engine().then(([c, d]) => { ctx = c; det = d; if (net) return; const go = setInterval(() => pc.remoteDescription ? clearInterval(go) : ch.postMessage({ from: role, go: 1 }), 300); });
  const hear = (stream) => {
    if (cfg.jbt !== "none") for (const r of pc.getReceivers()) r.jitterBufferTarget = Number(cfg.jbt);
    const el = new Audio(); el.muted = true; el.srcObject = stream; el.play().catch(() => {});
    ctx.createMediaStreamSource(stream).connect(det);
  };
  if (net) net.onStream = (stream) => { out.via = "trystero"; hear(stream); };
  else pc.ontrack = (e) => hear(e.streams[0] ?? new MediaStream([e.track]));
  setInterval(async () => {
    if (net) { const l = (await net.linkStats())[0]; if (l) out.stats.push({ held: l.held, packet: l.packet, route: l.route, via: l.via, rtt: l.rtt, lost: l.lost, got: l.got }); return; }
    const rep = new Map(); (await pc.getStats()).forEach((r) => rep.set(r.id, r));
    const v = VL.voiceIn(pc, rep);
    const rtp = [...rep.values()].find((r) => r.type === "inbound-rtp" && r.kind === "audio");
    out.stats.push({ ...v, jbt: pc.getReceivers()[0]?.jitterBufferTarget ?? null, lost: rtp?.packetsLost, got: rtp?.packetsReceived, conceal: rtp?.concealedSamples });
  }, 1000);
}
</script>`;

const server = http.createServer((q, r) => { r.setHeader("content-type", "text/html"); r.end(PAGE); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

// Not the game, and it needs a real, running sound engine to time the beeps, so not quiet-guard's
// silence(): nothing is ever played out loud (the beeps go into a silent sink and a muted element),
// nothing speaks, and the audio device stays on only so the engine's delays are the real ones.
const browser = await chromium.launch({
  executablePath: process.env.CHROME, headless: !args.includes("--headed"),
  args: [...MUTED_ARGS.filter((a) => a !== "--disable-audio-output" && !a.startsWith("--autoplay")), "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`,
    "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ permissions: ["microphone"] });
const b = await context.newPage(); await b.goto(url + "#b");
const a = await context.newPage(); for (const p of [a, b]) p.on("pageerror", (e) => console.log("pageerror:", e.message)); await a.goto(url + "#a");
await new Promise((r) => setTimeout(r, secs * 1000));
const A = await a.evaluate(() => window.out), B = await b.evaluate(() => window.out);
await browser.close(); server.close();
fs.rmSync(dir, { recursive: true, force: true });

if (A.err || B.err) console.log("error:", A.err ?? B.err);
// each beep heard at B, against the last time A's mic heard one
const gaps = [];
for (const t of B.onsets) {
  const s = A.onsets.filter((x) => x <= t).pop();
  if (s !== undefined && t - s < 900) gaps.push(t - s);
}
const sorted = gaps.slice(3).sort((x, y) => x - y), mid = sorted[Math.floor(sorted.length / 2)];
const last = B.stats[B.stats.length - 1] ?? {};
const r1 = (v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v);
console.log(JSON.stringify({
  cfg, beeps: `${B.onsets.length} heard of ${A.onsets.length} sent`,
  linkMs: { median: r1(mid), min: r1(sorted[0]), max: r1(sorted[sorted.length - 1]) },
  engine: { a: A.ctx, b: B.ctx },
  mouthToEarMs: r1(mid + (B.ctx?.base ?? 0) + (B.ctx?.output ?? 0)),
  jitterBuffer: { lately: r1(last.held), packetMs: r1(last.packet), jbt: last.jbt, lost: last.lost, got: last.got },
  ...(cfg.game ? { link: { route: last.route, via: last.via, rtt: r1(last.rtt) } } : {}),
}, null, 1));
