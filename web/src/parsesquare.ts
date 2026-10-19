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

  constructor(private most = 2) {}

  /** Parse one square's text into its object, off the main thread where that is possible. */
  parse(ti: number, tj: number, text: string): Promise<Parsed> {
    if (this.broken) return Promise.resolve(this.onMain(ti, tj, text));
    let w: Worker;
    try {
      w = this.idle.pop() ?? this.make();
    } catch {
      this.broken = true;
      return Promise.resolve(this.onMain(ti, tj, text));
    }
    return new Promise<Parsed>((resolve) => {
      this.waiting.set(w, resolve);
      w.postMessage({ ti, tj, text });
    });
  }

  private make(): Worker {
    if (this.live >= this.most) throw new Error("no spare worker");   // (handled: falls back to the main thread)
    const w = new ParseSquare();
    this.live++;
    w.onmessage = (e: MessageEvent<Parsed>) => {
      const done = this.waiting.get(w);
      if (!done) return;
      this.waiting.delete(w);
      // give the worker back for the next square, unless there are already enough spare
      if (this.idle.length < this.most) this.idle.push(w);
      else { w.terminate(); this.live--; }
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
    try { return { ti, tj, data: JSON.parse(text) }; }
    catch (e) { return { ti, tj, error: String(e) }; }
  }

  dispose() {
    for (const w of this.idle) w.terminate();
    this.idle.length = 0;
    this.live = 0;
  }
}
