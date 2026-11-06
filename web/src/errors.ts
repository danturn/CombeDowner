// Anything that goes wrong in the browser, sent to the play counts (telemetry.ts) so we hear about
// it rather than waiting for a player to tell us: uncaught errors and promises, errors written to
// the console (three.js reports a shader that won't build there), the graphics giving out, squares of
// the map that won't load, and a start that never got going because the tab died (found on the next
// visit, by safegfx.ts's mark). Addresses lose their query, so no room code goes with them; each
// failure goes once a visit (telemetry.ts). Only when telemetry is on.
//
// Nothing here goes over the peer network.
import * as Telemetry from "./telemetry";
import { tileTrouble } from "./tiles";

/** A script address as file:line:col, without the site or its query. */
const place = (file?: string, line?: number, col?: number) =>
  file ? `${file.split("?")[0].split("/").pop()}:${line ?? 0}:${col ?? 0}` : "";

/** The top few frames of a stack, each as file:line:col. */
function frames(stack?: string): string {
  if (!stack) return "";
  return stack.split("\n").slice(1, 6).map((l) => {
    const m = l.match(/([^/\s(]+\.js)(?:\?[^:]*)?:(\d+):(\d+)/);
    const fn = l.trim().replace(/^at\s+/, "").split(/\s|@/)[0];
    return m ? `${fn && !fn.includes(".js") ? fn + " " : ""}${m[1]}:${m[2]}:${m[3]}` : "";
  }).filter(Boolean).join(" < ");
}

const text = (v: unknown) => v instanceof Error ? `${v.name}: ${v.message}` : typeof v === "string" ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();

export function watchErrors(canvas: HTMLCanvasElement, startCrashed: boolean, gpu: string) {
  addEventListener("error", (e) => {
    // a script, picture or sound that failed to load reports here too, with no message
    const t = e.target as (HTMLElement & { src?: string }) | null;
    if (t && t !== (window as unknown) && t.src) { Telemetry.failure("load", t.tagName.toLowerCase(), place(t.src)); return; }
    Telemetry.failure("js", e.message || text(e.error), frames((e.error as Error)?.stack) || place(e.filename, e.lineno, e.colno));
  }, true);
  addEventListener("unhandledrejection", (e) => {
    Telemetry.failure("promise", text(e.reason), frames((e.reason as Error)?.stack));
  });
  const said = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    said(...args);
    try { Telemetry.failure("console", args.map(text).join(" ").slice(0, 300), frames(new Error().stack?.split("\n").slice(1).join("\n"))); } catch { /* never reaches the game */ }
  };
  canvas.addEventListener("webglcontextlost", () => Telemetry.failure("gl-lost", gpu || "unknown chip"));
  if (startCrashed) Telemetry.failure("tab-died", "the last start never got going", "", { gpu });
  let failedBefore = 0;
  setInterval(() => {
    if (tileTrouble.failed > failedBefore) { failedBefore = tileTrouble.failed; Telemetry.failure("tile", tileTrouble.last.split("?")[0]); }
  }, 5000);
}
