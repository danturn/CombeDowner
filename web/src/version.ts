// Which build of the game this page is: when the game last changed and that commit's short hash
// (both set by vite.config.ts). The menu, the loading note and the debug panel all show it, so a
// player stuck on an old page (a phone holding on to yesterday's) can see so and say which.
// Nothing here goes over the network; net.ts swaps build times with other players itself.
declare const __BUILD__: number;
declare const __COMMIT__: string;

export const BUILT = __BUILD__;
export const COMMIT = __COMMIT__;

/** "build 1a2b3c4 · 26 Oct 14:05" in the player's own time. */
export function buildLabel(): string {
  const d = new Date(BUILT);
  const when = `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return ["build", COMMIT, "·", when].filter(Boolean).join(" ");
}
