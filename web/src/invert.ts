// Turning the look round the other way, for those who play inverted: up and down, and side to side,
// each set for the mouse (with the trackpad and the arrow keys, which stand in for it) and for
// touch on its own, as a phone held in the hand feels different from a mouse. The controller keeps
// its own pair with its other settings (gamepad.ts). Kept in this browser like the other settings
// (settings.ts); nothing here goes over the network.

export type LookFrom = "mouse" | "touch";

const KEYS = {
  mouse: { x: "cd-invmousex", y: "cd-invmousey" },
  touch: { x: "cd-invtouchx", y: "cd-invtouchy" },
} as const;
// each setting's box on the Settings page (and the mines' menu), by id
const INPUTS = {
  mouse: { x: "inv-mouse-x", y: "inv-mouse-y" },
  touch: { x: "inv-touch-x", y: "inv-touch-y" },
} as const;

const loaded = (key: string) => { try { return localStorage.getItem(key) === "1"; } catch { return false; } };
const invert: Record<LookFrom, { x: boolean; y: boolean }> = {
  mouse: { x: loaded(KEYS.mouse.x), y: loaded(KEYS.mouse.y) },
  touch: { x: loaded(KEYS.touch.x), y: loaded(KEYS.touch.y) },
};

/** A look by (dx, dy) from this device, turned round as its settings say. */
export function inverted(from: LookFrom, dx: number, dy: number): [number, number] {
  const v = invert[from];
  return [v.x ? -dx : dx, v.y ? -dy : dy];
}

function set(from: LookFrom, axis: "x" | "y", on: boolean) {
  invert[from][axis] = on;
  try { localStorage.setItem(KEYS[from][axis], on ? "1" : "0"); } catch { /* private window: just this visit */ }
}

function show() {
  for (const from of ["mouse", "touch"] as const) for (const axis of ["x", "y"] as const) {
    const el = document.getElementById(INPUTS[from][axis]) as HTMLInputElement | null;
    if (el) el.checked = invert[from][axis];
  }
}

/** Wire up the invert boxes on this page, wherever they are. */
export function invertSettings() {
  show();
  for (const from of ["mouse", "touch"] as const) for (const axis of ["x", "y"] as const) {
    const el = document.getElementById(INPUTS[from][axis]) as HTMLInputElement | null;
    el?.addEventListener("change", () => set(from, axis, el.checked));
  }
}

export function resetInvert() {
  for (const from of ["mouse", "touch"] as const) for (const axis of ["x", "y"] as const) set(from, axis, false);
  show();
}
