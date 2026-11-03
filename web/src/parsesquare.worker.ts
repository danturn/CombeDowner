// The worker half of parsesquare.ts: turns one square's file into its object, off the main
// thread, and sends it back. It does nothing else: no map, no scene, no game. Nothing here goes
// over the network.
import type { Parsed } from "./parsesquare";
import { readSquare, surfaceBuffers } from "./sfpack";

interface Ask { ti: number; tj: number; bytes: Uint8Array }

self.onmessage = async (e: MessageEvent<Ask>) => {
  const { ti, tj, bytes } = e.data;
  let out: Parsed;
  try {
    out = { ti, tj, data: await readSquare(bytes) };
  } catch (err) {
    out = { ti, tj, error: String(err) };
  }
  (self as unknown as { postMessage(m: Parsed, t: Transferable[]): void }).postMessage(out, surfaceBuffers(out.data));
};
