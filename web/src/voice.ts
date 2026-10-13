// Voice chat over the room's WebRTC links, in two ways:
// - Nearby: an open mic, heard in 3D from where you stand and fading to nothing by 60 m, like
//   talking in the street. It's on whenever your mic is.
// - Radio (hold V): everyone in the room hears you at full volume through a crackly walkie-talkie,
//   with a squelch when you key it and an "over" beep when you let go. Players near you still hear
//   your real voice too.
// The mic is asked for the moment you press Play on an online game (askForMic), while the menu is
// still up: asked once the game had captured the mouse, Chrome swept its question away, and after a
// few of those it stops asking at all. It can be muted from the pause menu, and switching it back
// on there asks again if it never got going. While it's muted its track is switched off, so it
// sends silence. How you're talking rides along in your position updates (game.ts), so listeners
// know how to play you. net.ts keeps every link carrying your mic and hands over every voice that
// comes in, so a hiccup joining doesn't leave two players unable to hear each other.
import * as SFX from "./audio";
import type { Net } from "./net";

/** 0 mic off, 1 open mic (nearby), 2 on the radio. */
export type Talk = 0 | 1 | 2;

const NEAR_REF = 6;                     // full volume within this many metres, then it falls off
const NEAR_FADE = 45, NEAR_MAX = 60;    // and fades out completely between these
const SPEAKING = 0.015;                 // mic level (RMS) that counts as talking
const SPEAKING_HOLD = 350;              // ms to keep showing someone as talking after they pause

let micStream: MediaStream | null = null;
let micAsking: Promise<MediaStream | null> | null = null;
let micProblem = "";

/**
 * Ask for the mic, or hand back the one already granted. Call it from the click on Play, so the
 * browser's question appears on the menu rather than over the game.
 */
export function askForMic(): Promise<MediaStream | null> {
  if (micStream?.getAudioTracks().some((t) => t.readyState === "live")) return Promise.resolve(micStream);
  if (micAsking) return micAsking;
  if (!navigator.mediaDevices?.getUserMedia) { micProblem = "This browser can't use a microphone here"; return Promise.resolve(null); }
  micAsking = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    .then((stream) => {
      for (const t of stream.getAudioTracks()) t.contentHint = "speech";
      micProblem = "";
      return (micStream = stream);
    }, async (e: unknown) => {
      micProblem = await why(e);
      return null;
    })
    .finally(() => { micAsking = null; });
  return micAsking;
}

/** Is the browser still asking the player about the mic? */
export function micPending() { return !!micAsking; }

/** Wait for the answer to the mic question, but not for ever: the game goes on without it. */
export function micAnswered(ms = 20000): Promise<unknown> {
  return micAsking ? Promise.race([micAsking, new Promise((r) => setTimeout(r, ms))]) : Promise.resolve();
}

/** Why the mic didn't start, in words a player can act on. */
async function why(e: unknown): Promise<string> {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone found, so you can listen but not talk";
  if (name === "NotReadableError" || name === "AbortError") return "Another app is using the microphone, so you can listen but not talk";
  let state = "";
  try { state = (await navigator.permissions.query({ name: "microphone" as PermissionName })).state; } catch { /* not supported */ }
  if (state === "denied") return "The browser is blocking the mic for this site. Click the icon at the left of the address bar, allow the microphone, then switch Microphone on again in the pause menu";
  return "The mic wasn't allowed, so you can listen but not talk. Switch Microphone on in the pause menu to be asked again";
}

interface Speaker {
  el: HTMLAudioElement; src: MediaStreamAudioSourceNode; near: GainNode; panner: PannerNode; radio: GainNode;
  level: AnalyserNode; heardAt: number;
}

export class Voice {
  /** What you're doing. */
  mode: Talk = 0;
  private mic: MediaStream | null = null;
  private muted = false;
  private radioOn = false;
  private speakers = new Map<string, Speaker>();
  private waiting = new Map<string, MediaStream>();   // voices that arrived before the sound had started
  private gone = false;
  private modes = new Map<string, Talk>();
  private buf = new Float32Array(512);

  constructor(private net: Net, private say: (text: string, secs: number) => void) {
    net.onStream = (stream, id) => this.hear(stream, id);
    if (net.media) this.askForMic();
  }

  get available() { return this.net.media; }
  get micOn() { return !!this.mic && !this.muted; }
  /** How a player is talking, as of their last update. */
  modeOf(id: string): Talk { return this.modes.get(id) ?? 0; }

  /** Hold the radio (true) or let go of it (false). */
  radio(on: boolean) {
    if (on === this.radioOn) return;
    if (on && !this.micOn) {
      this.say(!this.net.media ? "The radio works in online games, not practice"
        : this.muted ? "Your mic is muted. Turn it on from the pause menu" : "No microphone, so no radio", 2.5);
      return;
    }
    this.radioOn = on;
    if (on) SFX.pttDown(); else SFX.pttUp();
    this.refresh();
  }

  /** Mute or unmute your mic. Unmuting asks for the mic again if it never started. */
  mute(muted: boolean) {
    this.muted = muted;
    if (muted && this.radioOn) { this.radioOn = false; SFX.pttUp(); }
    this.refresh();
    if (!muted && !this.mic && this.net.media) this.askForMic();
  }

  /** A player joined: send them the mic too. */
  join(id: string) {
    if (this.mic) this.net.addStream(this.mic, id);
  }

  /** A player's latest talk state, from their position updates. */
  heard(id: string, mode: number) {
    const m = (mode === 1 || mode === 2 ? mode : 0) as Talk;
    const was = this.modeOf(id);
    if (m === was) return;
    if (m === 2) SFX.radioIn();
    else if (was === 2) SFX.radioOut();
    this.modes.set(id, m);
    SFX.carrier([...this.modes.values()].includes(2));
  }

  /** Is a player talking right now (on the radio, or out loud)? */
  speaking(id: string) {
    const m = this.modeOf(id), s = this.speakers.get(id);
    return m === 2 || (m === 1 && !!s && performance.now() - s.heardAt < SPEAKING_HOLD);
  }

  /** For the debug panel: whether we're getting a player's voice, and how they're talking. */
  debugState(id: string) {
    if (!this.speakers.has(id)) return "no audio";
    const m = this.modeOf(id);
    return m === 2 ? "on the radio" : m === 0 ? "mic off" : this.speaking(id) ? "talking" : "open mic";
  }

  /** Is a player close enough to be heard nearby? */
  inRange(d: number) { return d < NEAR_MAX; }

  /**
   * Once a frame: put the listener where the camera is (facing fx, fy, fz), place each voice at
   * the speaker's head, and notice who's making a sound.
   */
  update(x: number, y: number, z: number, fx: number, fy: number, fz: number, where: (id: string) => { x: number; y: number; z: number } | null) {
    const ctx = SFX.context();
    if (ctx && this.waiting.size) for (const [id, stream] of [...this.waiting]) this.hear(stream, id);
    if (!ctx || !this.speakers.size) return;
    const l = ctx.listener, t = ctx.currentTime, now = performance.now();
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {   // Firefox
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
    for (const [id, s] of this.speakers) {
      const mode = this.modeOf(id), p = where(id);
      let near = 0;
      if (mode && p) {
        const d = Math.hypot(p.x - x, p.y + 1.6 - y, p.z - z);
        near = Math.max(0, Math.min(1, (NEAR_MAX - d) / (NEAR_MAX - NEAR_FADE)));
        if (s.panner.positionX) { s.panner.positionX.value = p.x; s.panner.positionY.value = p.y + 1.6; s.panner.positionZ.value = p.z; }
        else s.panner.setPosition(p.x, p.y + 1.6, p.z);
      }
      s.near.gain.setTargetAtTime(near, t, 0.04);
      s.radio.gain.setTargetAtTime(mode === 2 ? 1 : 0, t, 0.02);
      if (mode) {
        s.level.getFloatTimeDomainData(this.buf);
        let sum = 0;
        for (const v of this.buf) sum += v * v;
        if (Math.sqrt(sum / this.buf.length) > SPEAKING) s.heardAt = now;
      }
    }
  }

  /** A player left. */
  drop(id: string) {
    this.unplug(id);
    this.waiting.delete(id);
    this.modes.delete(id);
    SFX.carrier([...this.modes.values()].includes(2));
  }

  dispose() {
    this.gone = true;
    for (const id of [...this.speakers.keys()]) this.drop(id);
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = micStream = null;
  }

  private refresh() {
    this.mode = !this.micOn ? 0 : this.radioOn ? 2 : 1;
    SFX.dipForRadio(this.mode === 2);
    for (const t of this.mic?.getAudioTracks() ?? []) t.enabled = this.mode > 0;
  }

  private askForMic() {
    askForMic().then((stream) => {
      if (this.gone || this.mic) return;
      if (!stream) { this.say(micProblem, 6); return; }
      this.mic = stream;
      this.refresh();
      this.net.addStream(stream);
      this.say(this.muted ? "Your mic is muted. Turn it on from the pause menu" : "Mic on: players nearby can hear you. Hold V for the radio", 3);
    });
  }

  private unplug(id: string) {
    const s = this.speakers.get(id);
    if (!s) return;
    s.src.disconnect();
    s.el.srcObject = null;
    this.speakers.delete(id);
  }

  private hear(stream: MediaStream, id: string) {
    const ctx = SFX.context(), out = SFX.voiceOut();
    this.waiting.delete(id);
    if (!ctx || !out) { this.waiting.set(id, stream); return; }   // plugged in once the sound starts (update)
    this.unplug(id);
    // Chrome only feeds remote WebRTC audio into Web Audio while a media element is playing it
    const el = new Audio();
    el.muted = true;
    el.srcObject = stream;
    el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const level = ctx.createAnalyser();
    level.fftSize = this.buf.length;
    src.connect(level);

    // in person: positioned in 3D
    const near = ctx.createGain();
    near.gain.value = 0;
    const panner = ctx.createPanner();
    panner.panningModel = "equalpower";   // a fraction of the processing of HRTF, and in a game it sounds much the same
    panner.distanceModel = "inverse";
    panner.refDistance = NEAR_REF;
    panner.rolloffFactor = 1;
    src.connect(near).connect(panner).connect(out);

    // over the radio: thin, a little distorted, the same from anywhere
    const [fx, fxOut] = SFX.radioSound(ctx);
    const radio = ctx.createGain();
    radio.gain.value = 0;
    src.connect(fx);
    fxOut.connect(radio).connect(out);

    this.speakers.set(id, { el, src, near, panner, radio, level, heardAt: 0 });
  }
}
