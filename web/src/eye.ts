// The critics' eye: a real picture-recognising model (SigLIP, through Transformers.js) that looks
// at each painting at the Art Gallery's private view and says what's in it and how well it fits the
// evening's subject. What it sees is added to what the hand-made tests in sight.ts find (critics.ts),
// never put in their place, so the critics still work exactly as before without it.
//
// Only the host looks at paintings, so only the host ever loads it, and only once they've taken on
// the gallery: it downloads while everyone paints (about 70 MB the first time, then from the
// browser's cache), runs on the graphics card where the browser allows and on the processor
// otherwise. Anything that goes wrong (an old browser, no connection, too slow) and it quietly
// stands aside. ?critics=plain turns it off. The half of the model that reads words is never
// downloaded: what each thing in eye-bank.ts looks like to it was worked out ahead of time
// (tools/critics_eye_bank.mjs, web/public/critics-eye.json).
//
// Who decides what: the host. Nothing here goes over the network; its findings go into the host's
// staging of the show, and everyone else gets the remarks as text.
import { H, PALETTE, W } from "./easel";
import { ASKS, BANK, MODEL, SUBJECTS } from "./eye-bank";
import type { Rude, Thing } from "./sight";

/** What the eye made of one painting. */
export interface Eye {
  /** How well it fits the evening's subject, 0..1. */
  subject: number;
  /** What it's confident is in it, likeliest first, as the visitors would say it. */
  seen: { word: string; k?: Thing | Rude; p: number }[];
  /** Its best guesses, confident or not, and the subjects it fits best, for anyone checking its work. */
  top: { ask: string; p: number }[];
  fits: [string, number][];
}

type State = "off" | "loading" | "ready" | "failed";
let state: State = "off", progress = 0, device = "";
let loading: Promise<boolean> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let model: any = null, TF: typeof import("@huggingface/transformers") | null = null;
let bank: Float32Array[] = [], subjects = new Map<string, Float32Array>();

export const eyeWanted = () => new URLSearchParams(location.search).get("critics") !== "plain";
export const eyeState = () => ({ state, progress, device });

/** Start loading, if it's wanted and hasn't started. Safe to call as often as you like. */
export function wake(): Promise<boolean> {
  if (!eyeWanted()) return Promise.resolve(false);
  loading ??= load().catch((e) => { console.info("critics' eye stands aside:", e?.message ?? e); state = "failed"; return false; });
  return loading;
}

async function load(): Promise<boolean> {
  state = "loading";
  if (typeof OffscreenCanvas === "undefined" && typeof document === "undefined") throw new Error("no canvas");
  const words = await (await fetch(`${import.meta.env.BASE_URL}critics-eye.json`)).json();
  const sig = BANK.map((s) => s.ask).join("|") + "#" + Object.keys(SUBJECTS).join("|") + "#" + ASKS.join("|");
  if (words.sig !== sig || words.model !== MODEL.id || words.revision !== MODEL.revision) throw new Error("critics-eye.json is out of date");
  bank = words.bank.map(unpack);
  subjects = new Map(Object.entries(words.subjects as Record<string, string>).map(([k, v]) => [k, unpack(v)]));

  TF = await import("@huggingface/transformers");
  TF.env.allowLocalModels = false;
  const files = new Map<string, [number, number]>();
  const onProgress = (e: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (e.status !== "progress" || !e.file || !e.total) return;
    files.set(e.file, [e.loaded ?? 0, e.total]);
    let a = 0, b = 0;
    for (const [l, t] of files.values()) { a += l; b += t; }
    progress = Math.min(0.99, a / b);
  };
  const gpu = "gpu" in navigator && !!(await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null));
  const make = (device: string) => TF!.SiglipVisionModel.from_pretrained(MODEL.id, { revision: MODEL.revision, dtype: MODEL.dtype, device: device as "webgpu" | "wasm", progress_callback: onProgress });
  device = gpu ? "webgpu" : "wasm";
  try { model = await make(device); }
  catch (e) { if (!gpu) throw e; device = "wasm"; model = await make(device); }
  progress = 1;
  state = "ready";
  return true;
}

function unpack(b64: string): Float32Array {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const v = Float32Array.from(new Int8Array(bytes.buffer), (x) => (x * 0.25) / 127);
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}

const RGB = PALETTE.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));

/** The paintings as the model takes them: on a white square, as they'd look in a frame, scaled -1..1. */
function pixels(pxs: Uint8Array[]): Float32Array {
  const S = MODEL.size, plane = S * S, out = new Float32Array(pxs.length * 3 * plane).fill(1);
  const k = Math.max(W, H) / S, h = Math.round(H / k), top = Math.floor((S - h) / 2), w = Math.round(W / k), left = Math.floor((S - w) / 2);
  pxs.forEach((px, n) => {
    const base = n * 3 * plane;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // each pixel of the square is the average of the canvas pixels under it, so thin lines survive
      let r = 0, g = 0, b = 0, c = 0;
      for (let yy = Math.floor(y * k); yy < Math.min(H, Math.ceil((y + 1) * k)); yy++)
        for (let xx = Math.floor(x * k); xx < Math.min(W, Math.ceil((x + 1) * k)); xx++) {
          const q = RGB[px[yy * W + xx] & 15]; r += q[0]; g += q[1]; b += q[2]; c++;
        }
      const i = (top + y) * S + left + x;
      out[base + i] = r / c / 127.5 - 1;
      out[base + plane + i] = g / c / 127.5 - 1;
      out[base + 2 * plane + i] = b / c / 127.5 - 1;
    }
  });
  return out;
}

const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Look at the paintings. `theme` is the subject's title before the map's names went in. */
export async function judge(pxs: Uint8Array[], theme: string): Promise<Eye[] | null> {
  if (state !== "ready" || !model || !TF || !pxs.length) return null;
  const S = MODEL.size;
  const out = await model({ pixel_values: new TF.Tensor("float32", pixels(pxs), [pxs.length, 3, S, S]) });
  const e = out.pooler_output ?? out.image_embeds, D = e.dims[1];
  const mine = subjects.get(theme);
  return pxs.map((_, n) => {
    const v = new Float32Array(e.data.slice(n * D, (n + 1) * D));
    const len = Math.hypot(...v);
    for (let i = 0; i < D; i++) v[i] /= len;
    return read(v, mine);
  });
}

// how sure it has to be, as a share of its belief across the whole bank, before the visitors say so
const SURE = 0.3, SURE_RUDE = 0.45;

function read(v: Float32Array, mine: Float32Array | undefined): Eye {
  const sims = bank.map((b) => dot(v, b)), hi = Math.max(...sims);
  const ex = sims.map((s) => Math.exp(MODEL.scale * (s - hi))), Z = ex.reduce((a, b) => a + b, 0);
  const p = ex.map((x) => x / Z);
  // several ways of asking after one thing: what it believes about the thing is their sum
  const byWord = new Map<string, { word: string; k?: Thing | Rude; p: number }>();
  BANK.forEach((s, i) => {
    if (!s.word) return;
    const o = byWord.get(s.word) ?? { word: s.word, k: s.k, p: 0 };
    o.p += p[i];
    byWord.set(s.word, o);
  });
  const words = [...byWord.values()].sort((a, b) => b.p - a.p);
  const rude = (k?: string) => k === "penis" || k === "boobs" || k === "bum";
  const seen = words.filter((w, i) => (rude(w.k) ? w.p >= SURE_RUDE && i === 0 : w.p >= SURE)).slice(0, 2);
  const top = p.map((q, i) => ({ ask: BANK[i].ask, p: q })).sort((a, b) => b.p - a.p).slice(0, 5);
  // on the subject: how far it leans towards tonight's subject over the evening's others
  const fit = (mine: Float32Array) => {
    const others = [...subjects.values()].filter((s) => s !== mine).map((s) => dot(v, s));
    const mean = others.reduce((a, b) => a + b, 0) / others.length;
    const sd = Math.sqrt(others.reduce((a, b) => a + (b - mean) ** 2, 0) / others.length) || 1;
    return Math.max(0, Math.min(1, ((dot(v, mine) - mean) / sd - 1) / 2));
  };
  const fits = [...subjects].map(([k, s]) => [k, fit(s)] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { subject: mine ? fit(mine) : 0, seen, top, fits };
}
