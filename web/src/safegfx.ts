// What this device's graphics can safely be asked for, and a guard for when they give out.
// Some phones' graphics chips (the PowerVR in the Pixel 10, and others we don't know) kill the whole
// tab rather than report an error when the picture asks too much of them, and Chrome's "Aw, Snap"
// leaves the page no moment to react. So starting a game leaves a mark in localStorage that's
// cleared once it has run for a while (or the page is closed properly): a page that finds the mark
// still there knows the last start never got that far, and turns the graphics down for good (shadows
// off, no retro grade, fewer lines, a shorter view), saying so in a note. Those are ordinary Settings,
// so they can be turned back up there. Phones and tablets also draw shadows more simply and smaller,
// and ones with a PowerVR or unrecognised chip start with shadows off and a plain picture buffer.
// Nothing here goes over the network.
import * as THREE from "three";
import { setView, view } from "./view";

const START_KEY = "cd-starting", CRASHED_KEY = "cd-crashed";
const RUN_FOR = 20;   // seconds of play after which a start counts as having worked

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string | null) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private window */ }
};

const ua = navigator.userAgent;
export const MOBILE = /Android|iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  || matchMedia("(pointer: coarse)").matches;

export interface Gfx {
  /** The graphics chip as the browser names it ("" if it won't say). */
  gpu: string;
  /** The last start never got as far as playing, so this visit begins turned down. */
  crashed: boolean;
  /** Draw into a plain 8-bit buffer without multisampling rather than a half-float multisampled one. */
  plainBuffer: boolean;
  samples: number;
  shadowType: THREE.ShadowMapType;
}

/** The size of the sun's shadow map, read by world.ts as it lights each map. */
export let shadowSize = 2048;

function gpuName(renderer: THREE.WebGLRenderer) {
  const gl = renderer.getContext();
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
  } catch { return ""; }
}

/** Look at the device's graphics and pick safe settings. Call once, before Post is made and shadows are set up. */
export function checkGraphics(renderer: THREE.WebGLRenderer): Gfx {
  const gpu = gpuName(renderer);
  const known = /Adreno|Mali|Immortalis|Xclipse|Apple/i.test(gpu);
  const risky = MOBILE && (/PowerVR|Imagination|\bIMG\b/i.test(gpu) || !known);
  const crashed = get(START_KEY) !== null;
  const crashedBefore = get(CRASHED_KEY) !== null;
  put(START_KEY, null);
  const caps = renderer.capabilities, ext = renderer.extensions;
  const gl = renderer.getContext();

  if (crashed) {
    put("cd-shadows", "0");
    put("cd-fx", "0");
    put("cd-res", crashedBefore ? "270" : "360");
    setView(Math.min(view.fogFar, crashedBefore ? 300 : 400), true);
    put(CRASHED_KEY, "1");
  } else if (risky && get("cd-shadows") === null) put("cd-shadows", "0");

  const halfFloat = caps.isWebGL2 && (ext.has("EXT_color_buffer_half_float") || ext.has("EXT_color_buffer_float"));
  const plainBuffer = risky || crashed || crashedBefore || !halfFloat;
  const maxSamples = caps.isWebGL2 ? Number(gl.getParameter((gl as WebGL2RenderingContext).MAX_SAMPLES)) || 0 : 0;
  shadowSize = Math.min(MOBILE ? 1024 : 2048, caps.maxTextureSize);
  const gfx: Gfx = {
    gpu, crashed, plainBuffer,
    samples: plainBuffer ? 0 : Math.min(4, maxSamples),
    // the soft kind takes many more lookups in every lit pixel, too much for a phone
    shadowType: MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap,
  };
  if (crashed) safeNote();
  return gfx;
}

let ran = -1;
/** A game is about to be built: if the tab dies before it has run a while, the next visit starts safe. */
export function starting() {
  ran = 0;
  document.getElementById("safenote")?.remove();
  put(START_KEY, String(Date.now()));
}

/** Count play time each frame; the mark goes once the game has run long enough to trust. */
export function playing(dt: number) {
  if (ran < 0 || document.hidden) return;
  if ((ran += dt) >= RUN_FOR) { ran = -1; put(START_KEY, null); }
}

// closing the page or switching away isn't a crash, and Android may quietly drop a hidden tab
const off = () => { if (ran >= 0) put(START_KEY, null); };
addEventListener("pagehide", off);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) off();
  else if (ran >= 0) put(START_KEY, String(Date.now()));
});

function safeNote() {
  const box = document.createElement("div");
  box.id = "safenote";
  box.setAttribute("role", "status");
  box.style.cssText = "position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:9999;max-width:min(92vw,520px);" +
    "padding:8px 30px 8px 12px;background:rgba(20,20,20,.88);color:#fff;font:13px/1.35 system-ui,sans-serif;border-radius:6px";
  box.textContent = "Your device crashed last time, so the game is in safe graphics; you can change it in Settings.";
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  close.style.cssText = "position:absolute;right:4px;top:2px;background:none;border:0;color:#fff;font-size:18px;cursor:pointer";
  close.onclick = () => box.remove();
  box.append(close);
  document.body.append(box);
}
