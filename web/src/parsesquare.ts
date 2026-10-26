// Reading a square's file off the main thread.
//
// Each square of Bath is a JSON file of a few megabytes, and the game has to turn it into an object
// before it can build anything from it. JSON.parse of one costs 5-9 ms on the Mac (more on a phone,
// and more again when several arrive together after a bad connection), and it used to land in a
// frame, as a stutter. This does it in a worker instead, so the frame that starts a square's load
// only waits for the result, not for the work.
//
// Nothing here goes over the network: it reads the file the game already fetches.
import ParseSquare from "./parsesquare.worker?worker&inline";
import { unpackSurfaces } from "./sfpack";

/** The message a square's worker sends back: the square it is, and the object or what went wrong. */
export interface Parsed {
  ti: number; tj: number;
  data?: unknown;
  error?: string;
}

/**
 * A pool of workers that parse square files. Workers are made on demand, up to `most`, and kept for
 * the next square: making one costs more than parsing a single file.
 *
 * If a worker can't be made at all (a browser that won't have one, or the single-file build where
 * there is nothing to load), every request is answered on the main thread instead, so the game still
 * works — it just pays the parse cost it always did.
 */
export class SquareParser {
  private idle: Worker[] = [];
  private waiting = new Map<Worker, (p: Parsed) => void>();
  private live = 0;
  private broken = false;
  private linger = new Map<Worker, number>();

  /** most: workers at once. idleMs: let a worker go once it has had nothing to do this long, as
   *  each one keeps its own memory, which a phone can't spare (0: keep them). */
  constructor(private most = 2, private idleMs = 0) {}

  /** Parse one square's text into its object, off the main thread where that is possible. */
  parse(ti: number, tj: number, text: string): Promise<Parsed> {
    if (this.broken) return Promise.resolve(this.onMain(ti, tj, text));
    // (for tools/parsetest.mjs: the same work done the old way, to compare against)
    if ((globalThis as any).__parseOnMain) return Promise.resolve(this.onMain(ti, tj, text));
    let w: Worker;
    try {
      w = this.idle.pop() ?? this.make();
    } catch {
      this.broken = true;
      return Promise.resolve(this.onMain(ti, tj, text));
    }
    clearTimeout(this.linger.get(w));
    return new Promise<Parsed>((resolve) => {
      // a worker the browser kills (out of memory, on a phone) never answers and never says so:
      // give up on it rather than wait on that square for ever
      const late = setTimeout(() => {
        if (this.waiting.get(w) !== done) return;
        this.waiting.delete(w);
        w.terminate();
        this.live--;
        resolve({ ti, tj, error: "reading the square took too long" });
      }, 30000);
      const done = (p: Parsed) => { clearTimeout(late); resolve(p); };
      this.waiting.set(w, done);
      w.postMessage({ ti, tj, text });
    });
  }

  private rest(w: Worker) {
    if (this.idle.length >= this.most) { w.terminate(); this.live--; return; }
    this.idle.push(w);
    if (this.idleMs) this.linger.set(w, window.setTimeout(() => {
      const i = this.idle.indexOf(w);
      if (i < 0) return;
      this.idle.splice(i, 1);
      w.terminate();
      this.live--;
    }, this.idleMs));
  }

  private make(): Worker {
    if (this.live >= this.most) throw new Error("no spare worker");   // (handled: falls back to the main thread)
    const w = new ParseSquare();
    this.live++;
    (globalThis as any).__parseWorkers = ((globalThis as any).__parseWorkers ?? 0) + 1;
    w.onmessage = (e: MessageEvent<Parsed>) => {
      const done = this.waiting.get(w);
      if (!done) return;
      this.waiting.delete(w);
      this.rest(w);
      done(e.data);
    };
    w.onerror = () => {
      // a worker that fails outright: answer whoever was waiting on it, then never make another
      const done = this.waiting.get(w);
      this.waiting.delete(w);
      w.terminate();
      this.live--;
      this.broken = true;
      this.idle.length = 0;
      done?.({ ti: -1, tj: -1, error: "worker failed" });
    };
    return w;
  }

  /** The old way, for when no worker is available. */
  private onMain(ti: number, tj: number, text: string): Parsed {
    try { const data = JSON.parse(text); unpackSurfaces(data); return { ti, tj, data }; }
    catch (e) { return { ti, tj, error: String(e) }; }
  }

  dispose() {
    for (const t of this.linger.values()) clearTimeout(t);
    for (const w of this.idle) w.terminate();
    this.idle.length = 0;
    this.live = 0;
  }
}
