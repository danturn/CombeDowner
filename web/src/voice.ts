// Voice chat over the room's WebRTC links, push to talk, in two ways:
// - Nearby (hold V): heard in 3D from where you stand, fading to nothing by 60 m.
// - Radio (hold B): everyone in the room hears you at full volume through a crackly walkie-talkie,
//   with a squelch when you key it and an "over" beep when you let go. Players near you also hear
//   your real voice.
// The mic is only asked for the first time you talk. While you aren't talking its track is switched
// off, so it sends silence. Whether you're talking, and how, rides along in your position updates
// (game.ts), so listeners know how to play you.
import * as SFX from "./audio";
import type { Net } from "./net";

/** 0 silent, 1 talking nearby, 2 on the radio. */
export type Talk = 0 | 1 | 2;

const NEAR_REF = 6;                     // full volume within this many metres, then it falls off
const NEAR_FADE = 45, NEAR_MAX = 60;    // and fades out completely between these

interface Speaker { el: HTMLAudioElement; src: MediaStreamAudioSourceNode; near: GainNode; panner: PannerNode; radio: GainNode }

export class Voice {
  /** What you're doing. */
  mode: Talk = 0;
  private mic: MediaStream | null = null;
  private asking = false;
  private speakers = new Map<string, Speaker>();
  private modes = new Map<string, Talk>();
  private told = false;
  /** The mic is ready: say how to talk. */
  onMicReady = () => {};

  constructor(private net: Net, private say: (text: string, secs: number) => void) {
    net.onStream = (stream, id) => this.hear(stream, id);
  }

  get available() { return this.net.media; }
  /** How a player is talking, as of their last update. */
  modeOf(id: string): Talk { return this.modes.get(id) ?? 0; }

  /** Start talking nearby (1), on the radio (2), or stop (0). */
  talk(mode: Talk) {
    if (mode === this.mode) return;
    if (mode && !this.net.media) {
      if (!this.told) { this.told = true; this.say("Voice chat works in online games, not practice", 2.5); }
      return;
    }
    if (mode && !this.mic) { this.askForMic(); return; }
    if (mode === 2) SFX.radioClick();
    else if (this.mode === 2) SFX.radioOver();
    this.mode = mode;
    for (const t of this.mic?.getAudioTracks() ?? []) t.enabled = mode > 0;
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
    if (m === 2) SFX.radioClick();
    else if (was === 2) SFX.radioOver();
    this.modes.set(id, m);
  }

  /** Is a player close enough to be heard talking nearby? */
  inRange(d: number) { return d < NEAR_MAX; }

  /**
   * Once a frame: put the listener where the camera is (facing fx, fy, fz), and place each voice
   * at the speaker's head.
   */
  update(x: number, y: number, z: number, fx: number, fy: number, fz: number, where: (id: string) => { x: number; y: number; z: number } | null) {
    const ctx = SFX.context();
    if (!ctx || !this.speakers.size) return;
    const l = ctx.listener, t = ctx.currentTime;
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
    }
  }

  /** A player left. */
  drop(id: string) {
    this.unplug(id);
    this.modes.delete(id);
  }

  dispose() {
    for (const id of [...this.speakers.keys()]) this.drop(id);
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = null;
  }

  private askForMic() {
    if (this.asking) return;
    this.asking = true;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((stream) => {
        for (const t of stream.getAudioTracks()) t.enabled = false;
        this.mic = stream;
        this.net.addStream(stream);
        // the key may have been let go while the browser asked, so wait for the next press
        this.onMicReady();
      })
      .catch(() => this.say("Couldn't use your microphone. Check the browser's permission for this site", 4))
      .finally(() => (this.asking = false));
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
    if (!ctx || !out) return;
    this.unplug(id);
    // Chrome only feeds remote WebRTC audio into Web Audio while a media element is playing it
    const el = new Audio();
    el.muted = true;
    el.srcObject = stream;
    el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);

    // in person: positioned in 3D
    const near = ctx.createGain();
    near.gain.value = 0;
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = NEAR_REF;
    panner.rolloffFactor = 1;
    src.connect(near).connect(panner).connect(out);

    // over the radio: thin, a little distorted, the same from anywhere
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 2800;
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const v = (i / 255) * 2 - 1; curve[i] = Math.tanh(v * 3) / Math.tanh(3); }
    drive.curve = curve;
    const radio = ctx.createGain();
    radio.gain.value = 0;
    src.connect(hp).connect(lp).connect(drive).connect(radio).connect(out);

    this.speakers.set(id, { el, src, near, panner, radio });
  }
}
