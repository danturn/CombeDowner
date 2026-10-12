// A little Winamp 2 at the top of the HUD: the track number and title scrolling across an LCD,
// the time into the track, its tempo and key, and a spectrum analyser in Winamp's colours.
import * as SFX from "./audio";
import { trackTitle } from "./music";
import { TRACKS } from "./tracks";

// tonic names, counted in semitones from E like the tracks' keys
const NOTES = ["E", "F", "F#", "G", "G#", "A", "A#", "B", "C", "C#", "D", "D#"];
// the classic skin's analyser colours, one per pixel row from the top
const ROWS = [
  "#ef3110", "#ce2910", "#d65a00", "#d66600", "#d67300", "#c67b08", "#dea518", "#d6b521",
  "#bdde29", "#94de21", "#29ce10", "#32be10", "#39b510", "#319c08", "#299400", "#188408",
];
const BARS = 19, W = 76, H = 16;

export function nowPlaying(root: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const title = $(".np-title span"), time = $(".np-time"), state = $(".np-state");
  const g = $<HTMLCanvasElement>("canvas").getContext("2d")!;
  const peaks = new Float32Array(BARS);
  let bins: Uint8Array<ArrayBuffer> | null = null;

  SFX.onTrackChange((name) => {
    const i = TRACKS.findIndex((t) => t.name === name);
    const t = TRACKS[i];
    const text = `${i + 1}. ${trackTitle(name)} (16-bit mix)  ***  `;
    title.textContent = text + text;   // two copies, so scrolling by half loops seamlessly
    title.style.animationDuration = `${text.length * 0.22}s`;
    $(".np-bpm").textContent = String(t?.bpm ?? "");
    $(".np-key").textContent = t ? NOTES[(t.key + 12) % 12] : "";
    root.hidden = false;
  });

  let last = 0;
  function draw(now: number) {
    requestAnimationFrame(draw);
    // 30 frames a second is plenty, and nothing to do while the HUD is hidden
    if (now - last < 33 || root.hidden || !root.offsetParent) return;
    last = now;
    const s = Math.floor(SFX.trackTime());
    time.textContent = `${String(Math.floor(s / 60) % 100).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    state.classList.toggle("stopped", SFX.musicMuted());

    const an = SFX.musicAnalyser();
    g.clearRect(0, 0, W, H);
    if (!an) return;
    bins ??= new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(bins);
    const nyquist = an.context.sampleRate / 2;
    for (let b = 0; b < BARS; b++) {
      // log-spaced bands from 50 Hz to 14 kHz
      const lo = Math.floor((50 * 280 ** (b / BARS) / nyquist) * bins.length);
      const hi = Math.max(lo + 1, Math.floor((50 * 280 ** ((b + 1) / BARS) / nyquist) * bins.length));
      let v = 0;
      for (let k = lo; k < hi && k < bins.length; k++) v = Math.max(v, bins[k]);
      const h = Math.round((v / 255) ** 1.4 * H);
      for (let y = 0; y < h; y++) {
        g.fillStyle = ROWS[H - 1 - y];
        g.fillRect(b * 4, H - 1 - y, 3, 1);
      }
      // peak caps that fall back slowly
      peaks[b] = Math.max(h, peaks[b] - 0.35);
      if (peaks[b] >= 1) {
        g.fillStyle = "#969696";
        g.fillRect(b * 4, H - Math.ceil(peaks[b]), 3, 1);
      }
    }
  }
  requestAnimationFrame(draw);
}
