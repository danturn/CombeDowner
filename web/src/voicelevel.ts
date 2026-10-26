// How loud you are on your own mic, for the things in the game that listen: quiet, talking or
// shouting, smoothed, and a rough guess at laughing (short bursts, one after another, with the pitch
// jumping about). Nothing is recognised and nothing is recorded: it's only ever how loud and how
// bursty, worked out fifteen times a second from the mic voice.ts already has open.
//
// Who decides what: each player measures only their own voice. What it comes to (a number: 0 quiet,
// 1 talking, 2 shouting, plus 4 while laughing) rides in your position updates (game.ts), so
// everyone knows how loud everyone else is without hearing a thing more than voice chat already
// carries. Without a mic, or with it muted, you're simply quiet.
import * as SFX from "./audio";

const RATE = 66;                     // ms between looks: about fifteen a second
const TALK = 0.02, SHOUT = 0.13;     // mic level (RMS) for talking, and for shouting
const LAUGH_GAP = [120, 450];        // ms between the bursts of a laugh

export type Loudness = 0 | 1 | 2;

class Level {
  /** 0..1, smoothed. */
  loud = 0;
  /** When the last shout began (ms, performance.now()): a sudden jump to shouting. */
  shoutAt = -1e9;
  /** Laughing, as near as can be guessed, until this time (ms). */
  private laughTill = 0;
  private an: AnalyserNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private buf = new Float32Array(1024);
  private timer = 0;
  private wasShout = false;
  private bursts: number[] = [];
  private inBurst = false;
  private zcr: number[] = [];
  private fake: { level: number; laugh: boolean } | null = null;

  /** Listen to this mic (null: none). */
  attach(stream: MediaStream | null) {
    if (stream === this.stream) return;
    this.src?.disconnect();
    this.src = null; this.stream = stream;
    if (!this.timer) this.timer = window.setInterval(() => this.look(), RATE);
  }

  /** For testing without a mic: pretend to be this loud (0..1) and laughing or not; null to stop pretending. */
  pretend(level: number | null, laugh = false) {
    this.fake = level === null ? null : { level, laugh };
    if (!this.timer) this.timer = window.setInterval(() => this.look(), RATE);
  }

  /** Quiet, talking or shouting. */
  get state(): Loudness { return this.loud > SHOUT * 0.8 ? 2 : this.loud > TALK ? 1 : 0; }
  get laughing() { return performance.now() < this.laughTill; }
  /** What goes in your position updates. */
  code() { return this.state + (this.laughing ? 4 : 0); }

  private look() {
    const now = performance.now();
    let rms = 0, crossings = 0;
    if (this.fake) {
      rms = this.fake.level;
      if (this.fake.laugh && !this.laughing) this.laughTill = now + 1500;
    } else {
      const ctx = SFX.context(), live = this.stream?.getAudioTracks().some((t) => t.readyState === "live" && t.enabled);
      if (ctx && this.stream && live && !this.src) {
        this.an = ctx.createAnalyser();
        this.an.fftSize = this.buf.length;
        this.src = ctx.createMediaStreamSource(this.stream);
        this.src.connect(this.an);
      }
      if (this.an && live) {
        this.an.getFloatTimeDomainData(this.buf);
        let sum = 0, prev = 0;
        for (let i = 0; i < this.buf.length; i++) {
          const v = this.buf[i];
          sum += v * v;
          if ((v >= 0) !== (prev >= 0)) crossings++;
          prev = v;
        }
        rms = Math.sqrt(sum / this.buf.length);
      }
    }
    // up quickly, down slowly, as a voice meter does
    this.loud += (rms - this.loud) * (rms > this.loud ? 0.6 : 0.15);
    const shout = rms > SHOUT;
    if (shout && !this.wasShout) this.shoutAt = now;
    this.wasShout = shout;
    // a laugh: three or more short bursts, close together, with the pitch (here, how often the wave
    // crosses zero) moving between them
    const on = rms > TALK * 1.5;
    if (on && !this.inBurst) {
      this.bursts.push(now);
      this.zcr.push(crossings);
      while (this.bursts.length > 6) { this.bursts.shift(); this.zcr.shift(); }
    }
    this.inBurst = on;
    const n = this.bursts.length;
    if (n >= 4 && !this.fake && now - this.bursts[n - 1] < 600) {
      let even = true, lo = Infinity, hi = 0;
      for (let i = n - 3; i < n; i++) {
        const g = this.bursts[i] - this.bursts[i - 1];
        if (g < LAUGH_GAP[0] || g > LAUGH_GAP[1]) even = false;
        lo = Math.min(lo, this.zcr[i]); hi = Math.max(hi, this.zcr[i]);
      }
      if (even && hi - lo > hi * 0.2) this.laughTill = now + 1500;
    }
  }
}

/** Your own voice's level, for anything that listens. */
export const voiceLevel = new Level();
(window as unknown as Record<string, unknown>).__voiceLevel = voiceLevel;

/** Someone else's, from what their position update said (the code above). */
export const decodeLevel = (code: number) => ({ state: (code & 3) as Loudness, laughing: (code & 4) !== 0 });
