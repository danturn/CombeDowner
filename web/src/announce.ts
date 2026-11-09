// Station announcements: the automated voice you hear on Great Western Railway platforms, read out
// by the browser's own speech in a British woman's voice. Near a station you hear "Platform two for
// the fourteen twenty Great Western Railway service to Westbury", calling at its stations, and
// "The train now approaching platform two is..." as it comes in, with the odd "See it. Say it.
// Sorted." between trains. No chime first: GWR don't use one. A train you can't get on is only
// said to be approaching, not in service. On a map whose trains aren't Great Western's (OPERATORS)
// it's just "the fourteen twenty service", without the British Transport Police.
//
// Each announcement is stitched together from recorded pieces, the way the real ones are, which gives
// them that stop-start rhythm: every word and phrase they use was said once by a British woman's voice
// (tools/station_voice.py, into public/sounds/station.mp3) and they're played one after another
// through the station's tannoy (audio.ts): thin, a little overdriven, the speakers down the platform
// answering, and a click and a hum as it comes on. Walk off the platform and it fades, and once
// you're out of earshot the rest goes unsaid, instead of following you up into town. Until those
// pieces have loaded, or for a phrase with a word that isn't among them, the browser's own voice reads
// it out instead (a British woman's if it has one), unfiltered: browsers give a page no way to put
// their speech through its sound.
//
// Who decides what: nobody. The times come from the trains' timetable (railway.ts), which runs to
// the clock, so everyone at the same station hears the same announcement at the same moment, and
// nothing goes over the network. The times said are the game's clock (daylight.ts), as on the boards.
import * as SFX from "./audio";
import { clockAt } from "./daylight";
import type { Departure, Railway } from "./railway";

const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;

// ---- the recorded voice ------------------------------------------------------------------------------
/** The pieces, by name (station_voice.py's key: lower case, words only, a full stop kept at the end), and the sound they're in. */
let pieces: Map<string, [number, number]> | null = null, sound: AudioBuffer | null = null, loading = false, longest = 1;
// (letters, digits and apostrophes, the rest made spaces: spelt out, as a regular expression with a quote in it upsets the build)
const norm = (t: string) => [...t.toLowerCase()].map((ch) => ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === "'" ? ch : " ")).join("").replace(/ +/g, " ").trim();
async function loadVoice() {
  const c = SFX.context();
  if (loading || !c) return;
  loading = true;
  try {
    const base = import.meta.env.BASE_URL;
    const [index, mp3] = await Promise.all([fetch(`${base}sounds/station.json`).then((r) => r.json()), fetch(`${base}sounds/station.mp3`).then((r) => r.arrayBuffer())]);
    sound = await c.decodeAudioData(mp3);
    pieces = new Map(Object.entries(index.pieces as Record<string, [number, number]>));
    longest = Math.max(...[...pieces.keys()].map((k) => k.split(" ").length));
  } catch { loading = false; }   // (try again next time you're at a station)
}
/** A phrase as the recorded pieces that say it, or null if one of its words isn't among them. The
 *  longest piece that fits each time; the last word of a sentence in its falling form, if there is one. */
function recorded(text: string): [number, number][] | null {
  if (!pieces) return null;
  const words = norm(text).split(" ").filter((w) => w), out: [number, number][] = [], end = text.trim().endsWith(".");
  for (let i = 0; i < words.length;) {
    let hit: [number, number] | undefined, n = Math.min(longest, words.length - i);
    for (; n > 0 && !hit; n--) {
      const k = words.slice(i, i + n).join(" ");
      hit = (end && i + n === words.length ? pieces.get(k + ".") : undefined) ?? pieces.get(k) ?? pieces.get(k + ".");
      if (hit) { i += n; break; }
    }
    if (!hit) return null;
    out.push(hit);
  }
  return out;
}

const RANGE = 35;          // metres from a platform (its edge, not the middle) you can hear the station's speakers
const FULL = 6;            // and within this of one they're as loud as they get
const NEXT = 80;           // seconds before a train pulls in that it's announced
const APPROACH = 18;       // and that it's said to be approaching
const LATE = 8;            // an announcement more than this late is dropped rather than said
const FILLER = [150, 260]; // seconds between the announcements that aren't about a train

/** Who runs the trains on each map, for the announcements; elsewhere it's just "the service". */
const OPERATORS: Record<string, string> = { "combe-down": "Great Western Railway", "bradford-on-avon": "Great Western Railway" };

const FILLERS = [
  ["If you see something that doesn't look right,", "speak to staff,", "or text the British Transport Police", "on six one, oh one six.", "We'll sort it.", "See it.", "Say it.", "Sorted."],
  ["Please keep your personal belongings with you", "at all times."],
  ["This is a no smoking station.", "Smoking, including e-cigarettes,", "is not permitted anywhere on this station."],
  ["Customers are reminded", "that cycling, skateboarding and pogo sticks", "are not permitted on the platforms."],
  ["Please take care when using the stairs.", "Use the handrail,", "and do not run on the platforms."],
];

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
  "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty"];
const words = (n: number) => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");

/** A platform's number as said: "two", or as written if it isn't a plain number ("2a"). */
const platform = (no: string) => /^\d{1,2}$/.test(no) && Number(no) < 60 ? words(Number(no)) : no;

/** A time as a station says it: "the fourteen twenty", "the nine oh five", "the sixteen hundred". */
function spoken(t: number): string {
  const [h, m] = clockAt(t).split(":").map(Number);
  const hh = h ? words(h) : "zero zero";
  return `the ${hh} ${m === 0 ? (h < 10 ? "o'clock" : "hundred") : m < 10 ? `oh ${ONES[m]}` : words(m)}`;
}

/** "Freshford, Avoncliff and Westbury", as phrases. */
function callingAt(calls: string[]): string[] {
  if (!calls.length) return [];
  if (calls.length === 1) return [`Calling at ${calls[0]} only.`];
  return ["Calling at", ...calls.slice(0, -1).map((c) => `${c},`), `and ${calls[calls.length - 1]}.`];
}

const FEMALE = /female|serena|kate|stephanie|martha|hazel|libby|sonia|maisie|susan|amy|emma|bella|abbi|hollie|olivia/i;
let voice: SpeechSynthesisVoice | null = null;
/** The station voice: a British woman's if there is one, else any British voice, else any English one.
 *  The computer's own voices first: some browsers' voices from the internet ignore how loud they're asked
 *  to be, so they'd sound as loud from the car park as on the platform. */
function load() {
  const all = (synth?.getVoices() ?? []).slice().sort((a, b) => +b.localService - +a.localService);
  const lang = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  const gb = all.filter((v) => lang(v) === "en-gb");
  voice = gb.find((v) => FEMALE.test(v.name) && !/\bmale/i.test(v.name.replace(/female/i, "")))
    ?? gb[0] ?? all.find((v) => lang(v).startsWith("en")) ?? null;
}
if (synth) {
  load();
  synth.addEventListener?.("voiceschanged", load);
}

export class Announcer {
  /** The announcements already made (or let go), by train and kind, so each is made once. */
  private said = new Set<string>();
  private fillerAt = 0;
  private t = 0;
  /** The phrases still to be said, and how loud the speakers are where you stand. */
  private queue: string[] = [];
  private loud = 0;
  /** When the phrase the station handed the browser was handed over (0: none is being said). */
  private saying = 0;
  /** The tannoy, while you're near enough a station to hear it, and how far off its speakers are. */
  private pa: ReturnType<typeof SFX.tannoy> = null;
  private far = 0;
  private playing: AudioBufferSourceNode[] = [];
  private paOff = 0;   // when the speakers click off, after the last piece (ctx time)

  /** Each frame: if you're near a station, announce what's due there. */
  update(dt: number, rail: Railway | null | undefined, x: number, y: number, z: number, mapId = "", now = Date.now() / 1000) {
    this.t -= dt;
    if (this.t > 0 || !rail) return;
    this.t = 0.5;
    const near = rail.stationNear(x, z, RANGE, y);
    // out of earshot: what's left of an announcement goes unsaid
    if (!near) { this.fillerAt = 0; this.queue.length = 0; this.loud = 0; this.hush(); return; }
    if (!pieces) void loadVoice();
    // full on and round the platforms, falling away quickly to nothing at the edge of earshot
    const off = Math.max(0, Math.min(1, (near.far - FULL) / (RANGE - FULL)));
    const loud = this.loud = (1 - off) * (1 - off) * SFX.effectsVolume();
    this.far = near.far;
    this.pa?.set(loud * 1.6, Math.max(4, near.far), 0);
    // the browser can fail to say a phrase has ended; give up waiting on one after a while
    if (this.saying && performance.now() - this.saying > 12000) this.saying = 0;
    if (!this.saying) this.next();
    if (!this.fillerAt) this.fillerAt = now + 20 + Math.random() * 40;
    const op = OPERATORS[mapId] ? `${OPERATORS[mapId]} ` : "";
    for (const d of rail.departures(near.station, 6)) {
      if (!d.service) {
        this.at(d, "app", d.arrive - APPROACH, now, loud, () => [
          d.plat ? `The train now approaching platform ${platform(d.plat)}` : "The train now approaching",
          "is not in service.", "Please do not board this train.", "Please stand behind the yellow line.",
        ]);
        continue;
      }
      this.at(d, "next", d.arrive - NEXT, now, loud, () => [
        d.plat ? `Platform ${platform(d.plat)},` : "",
        `for ${spoken(d.at)}`, `${op}service`, `to ${d.to}.`,
        ...callingAt(d.calls),
        `This train is formed of ${words(d.coaches)} coaches.`,
      ]);
      this.at(d, "app", d.arrive - APPROACH, now, loud, () => [
        d.plat ? `The train now approaching platform ${platform(d.plat)}` : "The train now approaching",
        `is ${spoken(d.at)}`, `${op}service`, `to ${d.to}.`,
        "Please stand behind the yellow line.",
      ]);
    }
    if (now >= this.fillerAt) {
      this.fillerAt = now + FILLER[0] + Math.random() * (FILLER[1] - FILLER[0]);
      // never over a train's announcement
      const fillers = op ? FILLERS : FILLERS.slice(1);
      if (!synth?.speaking && !synth?.pending && !this.queue.length && !this.playing.length) this.say(fillers[Math.floor(Math.random() * fillers.length)], loud);
    }
    if (this.said.size > 200) this.said.clear();
  }

  /** Make one announcement about a train when its moment comes, once; one missed by more than a
   *  few seconds (you only just got here) is let go. */
  private at(d: Departure, kind: string, when: number, now: number, loud: number, lines: () => string[]) {
    const key = `${d.arrive}|${d.plat}|${d.to}|${kind}`;
    if (now < when || this.said.has(key)) return;
    this.said.add(key);
    if (now - when < LATE) this.say(lines(), loud);
  }

  private say(lines: string[], loud: number) {
    if (document.hidden || loud <= 0.05) return;
    lines = lines.filter((t) => t);
    // all from the recordings, through the tannoy, or all in the browser's voice: never half and half
    const parts = lines.map(recorded);
    if (sound && parts.every((p) => p)) { this.speak(parts as [number, number][][]); return; }
    if (!synth) return;
    this.queue.push(...lines);
    if (!this.saying) this.next();
  }

  /** An announcement from the recorded pieces, each phrase after the last with a short breath between. */
  private speak(phrases: [number, number][][]) {
    const c = SFX.context();
    if (!c || !sound) return;
    this.pa ??= SFX.tannoy();
    const pa = this.pa;
    if (!pa) return;
    pa.set(this.loud * 1.6, Math.max(4, this.far), 0);
    // after whatever's being said already
    let t = Math.max(c.currentTime + 0.15, this.paOff + 0.6);
    pa.on(t);
    t += 0.25;
    for (const ph of phrases) {
      for (const [at, dur] of ph) {
        const src = c.createBufferSource();
        src.buffer = sound;
        src.connect(pa.input);
        src.start(t, at, dur);
        src.onended = () => { this.playing = this.playing.filter((s) => s !== src); src.disconnect(); };
        this.playing.push(src);
        t += dur + 0.03;
      }
      t += 0.22;
    }
    this.paOff = t;
    pa.off(t);
  }

  /** Out of earshot: the rest goes unsaid and the tannoy's let go. */
  private hush() {
    for (const s of this.playing) { try { s.stop(); } catch { /* not started */ } }
    this.playing = [];
    this.paOff = 0;
    this.pa?.stop();
    this.pa = null;
  }

  /** Hand the browser the next phrase, if you can still hear the speakers; the one after follows
   *  as soon as it's said. */
  private next() {
    this.saying = 0;
    if (!synth || document.hidden || this.loud <= 0.05) { this.queue.length = 0; return; }
    const text = this.queue.shift();
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-GB";
    u.rate = 0.9;
    u.pitch = 0.95;
    u.volume = this.loud;
    const at = this.saying = performance.now();
    const done = () => { if (this.saying === at) this.next(); };
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  }
}
