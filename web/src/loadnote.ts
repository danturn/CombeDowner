// A note on screen when the map stops coming in, so a player whose game never loads (a phone short
// of memory, a bad connection) can see what it's stuck on and tell us, instead of looking at an
// endless "Loading". It says how many squares of Bath are still to come, the last thing that went
// wrong, and if the graphics gave out. Nothing here goes over the network.
import { tileTrouble } from "./tiles";

const STALL = 30;   // seconds without a square coming in before saying so

export function watchLoading(canvas: HTMLCanvasElement) {
  let lastError = "", lost = false, dismissed = "", key = "";
  addEventListener("error", (e) => { lastError = String(e.message || e.error || "error"); });
  addEventListener("unhandledrejection", (e) => { lastError = String((e.reason as Error)?.message ?? e.reason); });
  canvas.addEventListener("webglcontextlost", () => { lost = true; });
  canvas.addEventListener("webglcontextrestored", () => { lost = false; });

  const box = document.createElement("div");
  box.setAttribute("role", "status");
  box.style.cssText = "position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:9999;max-width:min(92vw,520px);" +
    "padding:8px 30px 8px 12px;background:rgba(20,20,20,.88);color:#fff;font:13px/1.35 system-ui,sans-serif;border-radius:6px;white-space:pre-line";
  const text = document.createElement("span");
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  close.style.cssText = "position:absolute;right:4px;top:2px;background:none;border:0;color:#fff;font-size:18px;cursor:pointer";
  close.onclick = () => { dismissed = key; box.hidden = true; };
  box.append(text, close);
  box.hidden = true;
  document.body.append(box);

  const t0 = performance.now();
  let pending = -1, since = t0;
  setInterval(() => {
    const now = performance.now();
    const loading = (globalThis as any).__tilesPending as number | undefined;
    const p = loading === undefined ? undefined : loading + tileTrouble.missing;
    const menuLoading = !document.getElementById("loading")?.hidden;
    // only fewer squares to wait for counts as getting on: one that failed and is tried again adds one
    // back. The clock starts afresh when squares are wanted after none were (a jump, a longer view).
    if (p === undefined || pending <= 0 || p < pending) since = now;
    pending = p ?? -1;
    const waiting = menuLoading ? now - t0 : (p ?? 0) > 0 ? now - since : 0;
    const lines: string[] = [];
    if (lost) lines.push("The graphics stopped working on this device (WebGL context lost). Reloading the page may help.");
    if (waiting > STALL * 1000) {
      lines.push(menuLoading ? `Still loading the map after ${Math.round(waiting / 1000)} s.`
        : `Still waiting for ${p} square${p === 1 ? "" : "s"} of the map (nothing new for ${Math.round(waiting / 1000)} s).`);
      if (tileTrouble.last) lines.push(`Couldn't load ${tileTrouble.failed} time${tileTrouble.failed === 1 ? "" : "s"}, last: ${tileTrouble.last}`);
      if (lastError) lines.push(`Last error: ${lastError.slice(0, 160)}`);
    }
    const msg = lines.join("\n");
    // closing it keeps it closed until something changes (seconds ticking by don't count)
    key = msg ? `${lost}|${menuLoading}|${p}|${tileTrouble.failed}|${lastError}` : "";
    if (msg && key !== dismissed) { text.textContent = msg; box.hidden = false; }
    else box.hidden = true;
  }, 1000);
}
