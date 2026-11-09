// What the inside of each car is like, for the driver's own view (cockpit.ts builds it): the colours of
// its dash, trim, seats, carpet and roof lining, the cloth its seats are covered in, its steering wheel
// and dials, and the odd thing its owner's left lying about. Each is drawn as the real one was, near
// enough: the XR3i's sports seats and three-spoke wheel, the GTI's tartan and golf-ball gear knob, the
// Land Rover's painted metal and its dials in the middle of the dash, the Robin's single big speedo, a
// modern hatchback's airbag wheel and glowing radio. The seat cloth and the dials' faces are drawn on
// canvases here; at the longest draw distances (rich) the carpet, the roof lining and a dusty
// windscreen are too, and the parts are rounder.
//
// Who decides what: it's only ever drawn on each player's own screen, so nothing here goes over the network.
import * as THREE from "three";
import { view } from "./view";

const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
/** Go to town on the inside: only on a desktop seeing a long way, which can clearly spare it. */
export const rich = () => !touch && view.fogFar >= 4000;

export type WheelKind = "sport3" | "two" | "four" | "airbag" | "thin2" | "thin4" | "van";
export type DialKind = "pair" | "quad" | "single" | "centre" | "strip";
export type Cloth = "plain" | "tartan" | "stripe" | "velour" | "vinyl" | "check" | "weave";
export type Prop = "dice" | "tree" | "police" | "chimes" | "papers" | "atlas" | "crates" | "permit" | "cassettes";

export interface Style {
  dash: string; trim: string; seat: string; bolster: string; carpet: string; lining: string;
  cloth: Cloth;
  wheel: WheelKind; wheelR: number; wheelTilt: number; wheelCol: string;
  dials: DialKind;
  /** Before airbags and LCDs: cassette radios, window winders, a tax disc in the windscreen. */
  old: boolean;
  /** Front doors only, so they're long ones. */
  twoDoor: boolean;
  sporty: boolean; headrests: boolean;
  /** A van's: a bench for two beside the driver and a bulkhead behind. */
  van: boolean;
  /** The indicator stalk on the right of the column (Japanese cars), else on the left. */
  stalkRight: boolean;
  props: Prop[];
}

const CAR: Style = {
  dash: "#1e1f21", trim: "#2c2d31", seat: "#45464e", bolster: "#2f3036", carpet: "#232322", lining: "#a8a398",
  cloth: "weave", wheel: "airbag", wheelR: 0.185, wheelTilt: 0.42, wheelCol: "#161718", dials: "pair",
  old: false, twoDoor: false, sporty: false, headrests: true, van: false, stalkRight: false, props: ["tree", "permit"],
};
const VAN: Style = {
  ...CAR, dash: "#2a2b2d", trim: "#3d4044", seat: "#3a3d44", bolster: "#2b2d32", carpet: "#1b1c1c", lining: "#8f8b82",
  cloth: "vinyl", wheel: "van", wheelR: 0.21, wheelTilt: 0.33, dials: "strip", old: true, twoDoor: true, headrests: false, van: true, props: [],
};

/** Each kind's inside. The everyday cars are car0..car2 (their shapes); a Japanese make has its indicators on the right. */
export function styleOf(kind: string, make = ""): Style {
  const japanese = /Nissan|Toyota|Honda/.test(make);
  switch (kind) {
    case "xr3i": return { ...CAR, dash: "#1d1e20", trim: "#26272b", seat: "#3e3f47", bolster: "#2a2b31", cloth: "stripe", wheel: "sport3", wheelR: 0.175, dials: "quad", old: true, twoDoor: true, sporty: true, props: ["dice", "cassettes"] };
    case "robin": return { ...CAR, dash: "#2f2a25", trim: "#5b4f43", seat: "#6b5a46", bolster: "#5a4b3a", carpet: "#2e2822", lining: "#c9c0ad", cloth: "vinyl", wheel: "thin2", wheelR: 0.19, wheelTilt: 0.48, dials: "single", old: true, twoDoor: true, headrests: false, props: ["atlas"] };
    case "nova": return { ...CAR, dash: "#24252a", trim: "#3a3c44", seat: "#4b4d5a", bolster: "#363843", cloth: "velour", wheel: "two", dials: "pair", old: true, twoDoor: true, props: ["cassettes"] };
    case "metro": return { ...CAR, dash: "#2a2623", trim: "#6a5c4f", seat: "#7b6a57", bolster: "#5c4f41", carpet: "#2d2722", lining: "#cbc3b2", cloth: "check", wheel: "two", wheelR: 0.19, dials: "strip", old: true, twoDoor: true, headrests: false, props: ["atlas"] };
    case "sierra": return { ...CAR, dash: "#24272c", trim: "#465062", seat: "#566277", bolster: "#3c4556", carpet: "#22252b", cloth: "velour", wheel: "four", wheelR: 0.19, dials: "quad", old: true, props: ["cassettes"] };
    case "police": return { ...CAR, dash: "#24272c", trim: "#3c4048", seat: "#45495a", bolster: "#33363f", cloth: "velour", wheel: "four", wheelR: 0.19, dials: "quad", old: true, props: ["police"] };
    case "golf": return { ...CAR, dash: "#1c1d1f", trim: "#26272a", seat: "#2c2d33", bolster: "#222327", cloth: "tartan", wheel: "four", wheelR: 0.18, dials: "pair", old: true, twoDoor: true, sporty: true, props: ["cassettes"] };
    case "golfdriver": return { ...CAR, dash: "#1c1d1f", trim: "#2a2b2f", seat: "#3b3c44", bolster: "#2a2b30", cloth: "stripe", wheel: "four", wheelR: 0.18, dials: "pair", old: true, twoDoor: true, props: [] };
    case "landrover": return { ...CAR, dash: "#4f544b", trim: "#5a6055", seat: "#3a3d36", bolster: "#2e302b", carpet: "#1b1c1a", lining: "#7b7d74", cloth: "vinyl", wheel: "thin4", wheelR: 0.21, wheelTilt: 0.24, dials: "centre", old: true, twoDoor: true, headrests: false, props: ["atlas"] };
    case "transit": return { ...VAN, props: ["papers"] };
    case "icecream": return { ...VAN, trim: "#c9c6bd", lining: "#d8d4c8", props: ["chimes"] };
    case "chipvan": return { ...VAN, props: ["papers"] };
    case "milkfloat": return { ...VAN, dash: "#3a3c3a", trim: "#58605a", wheel: "thin2", wheelR: 0.19, wheelTilt: 0.2, dials: "single", props: ["crates"] };
    default: return { ...CAR, stalkRight: japanese, props: ["tree", "permit"] };
  }
}

/**
 * Texture coordinates laid on from the side each face looks to (a metre of cloth is a metre wherever it
 * goes, so seats of every size get the same weave): for parts merged in place, ready for model().
 */
export function planarUV(g: THREE.BufferGeometry, perMetre: number): THREE.BufferGeometry {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [z, x] : ax >= az ? [z, y] : [x, y];
    uv[i * 2] = u * perMetre; uv[i * 2 + 1] = v * perMetre;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

const canvas = (w: number, h = w) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")!] as const; };
function tex(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
/** A little speckle, the grain of a cloth or a carpet. */
function grain(g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random(), 1 + Math.random());
  }
}

/**
 * The seats' cloth, a tile that repeats every so many centimetres, light where it takes the seat's own
 * colour (the parts tint it). The GTI's red-and-grey tartan, the XR3i's grey with a red pinstripe, the
 * Metro's brown check, velour, a modern car's fine weave, or plain vinyl with a seam now and then.
 */
export function clothTexture(kind: Cloth, big: boolean): THREE.CanvasTexture {
  const S = big ? 256 : 128, [c, g] = canvas(S);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, S, S);
  if (kind === "tartan") {
    // over a near-black ground, bands of grey and red, and fine white and red lines between them, across and down
    g.fillStyle = "#2a2a2e"; g.fillRect(0, 0, S, S);
    const band = (at: number, w: number, col: string, a: number) => {
      g.globalAlpha = a; g.fillStyle = col;
      g.fillRect(at * S, 0, w * S, S); g.fillRect(0, at * S, S, w * S);
    };
    band(0.05, 0.3, "#7d8088", 0.55); band(0.55, 0.3, "#7d8088", 0.55);
    band(0.42, 0.06, "#c3262e", 0.85); band(0.92, 0.06, "#c3262e", 0.85);
    band(0.2, 0.012, "#f2f2f2", 0.8); band(0.7, 0.012, "#f2f2f2", 0.8);
    g.globalAlpha = 1;
    // and the twill's diagonal over it all
    g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 1;
    for (let k = -S; k < S; k += 3) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke(); }
  } else if (kind === "stripe") {
    g.fillStyle = "#bdbdc2"; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += S / 16) { g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(0, y, S, S / 32); }
    g.fillStyle = "#c43a3a"; g.fillRect(0, S * 0.48, S, Math.max(1, S / 96));
  } else if (kind === "check") {
    g.fillStyle = "#d8cfc0"; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) if ((k + j) % 2) { g.fillStyle = "rgba(90,60,30,0.32)"; g.fillRect(k * S / 4, j * S / 4, S / 4, S / 4); }
    g.strokeStyle = "rgba(60,40,20,0.35)"; g.lineWidth = 1;
    for (let k = 0; k <= 8; k++) { g.beginPath(); g.moveTo(k * S / 8, 0); g.lineTo(k * S / 8, S); g.moveTo(0, k * S / 8); g.lineTo(S, k * S / 8); g.stroke(); }
  } else if (kind === "vinyl") {
    g.fillStyle = "#e6e6e6"; g.fillRect(0, 0, S, S);
    g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, S / 2, S, 2); g.fillRect(S / 2, 0, 2, S);   // the fluted panels' seams
  } else if (kind === "velour") {
    g.fillStyle = "#dedede"; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += S / 8) { g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, y, S, S / 16); }   // its ribs
  } else {
    g.fillStyle = "#d4d4d4"; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 2) for (let x = (y / 2) % 2 ? 0 : 2; x < S; x += 4) { g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(x, y, 2, 2); }
  }
  grain(g, S, S, S * 6, 0.05);
  return tex(c);
}

/** A carpet's tufts, or the roof lining's fine pinholes: rich only. */
export function feltTexture(lining: boolean): THREE.CanvasTexture {
  const S = 128, [c, g] = canvas(S);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, S, S);
  if (lining) { for (let y = 2; y < S; y += 4) for (let x = (y % 8) ? 2 : 0; x < S; x += 4) { g.fillStyle = "rgba(0,0,0,0.16)"; g.fillRect(x, y, 1, 1); } }
  grain(g, S, S, lining ? 600 : 5000, lining ? 0.04 : 0.1);
  return tex(c);
}

/** The windscreen from inside, rich only: a film of dust, cleaner in the two arcs the wipers sweep, and a few flecks. */
export function screenTexture(): THREE.CanvasTexture {
  const W = 512, H = 256, [c, g] = canvas(W, H);
  g.fillStyle = "rgba(200,190,170,0.13)"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "destination-out";
  for (const x of [W * 0.3, W * 0.72]) {
    g.beginPath(); g.arc(x, H * 1.02, H * 0.9, Math.PI, 2 * Math.PI); g.arc(x, H * 1.02, H * 0.15, 2 * Math.PI, Math.PI, true); g.closePath();
    g.fillStyle = "rgba(0,0,0,0.75)"; g.fill();
  }
  g.globalCompositeOperation = "source-over";
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${Math.random() < 0.3 ? "255,255,240" : "60,55,45"},${0.15 + Math.random() * 0.3})`; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 0.6 + Math.random() * 1.4, 0, 7); g.fill(); }
  return tex(c, false);
}

export type Gauge = "speed" | "revs" | "fuel" | "temp" | "volts";
/**
 * A dial's face: its scale and numbers, round from 2.3 radians at the bottom left to -2.3 at the bottom
 * right as the needles go (cockpit.ts), in white on black with the red line on the rev counter.
 */
export function dialTexture(gauge: Gauge, top: number, big: boolean): THREE.CanvasTexture {
  const S = big ? 256 : 128, [c, g] = canvas(S), C = S / 2, R = S * 0.47;
  g.fillStyle = "#0d0e10"; g.beginPath(); g.arc(C, C, S / 2, 0, 7); g.fill();
  g.strokeStyle = "#3a3c40"; g.lineWidth = S * 0.025; g.beginPath(); g.arc(C, C, R, 0, 7); g.stroke();
  const at = (f: number, r: number): [number, number] => { const a = 2.3 - 4.6 * f; return [C - Math.sin(a) * r, C - Math.cos(a) * r]; };
  const span = (f0: number, f1: number, r: number, w: number, col: string) => {
    g.strokeStyle = col; g.lineWidth = w; g.beginPath();
    for (let k = 0; k <= 24; k++) { const [x, y] = at(f0 + (f1 - f0) * k / 24, r); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  };
  g.lineCap = "round";
  const tick = (f: number, long: boolean, col = "#ecebe2") => {
    const [x0, y0] = at(f, R * (long ? 0.72 : 0.8)), [x1, y1] = at(f, R * 0.9);
    g.strokeStyle = col; g.lineWidth = S * (long ? 0.022 : 0.012); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  const label = (f: number, t: string, size = 0.11) => {
    const [x, y] = at(f, R * 0.52);
    g.fillStyle = "#ecebe2"; g.font = `600 ${Math.round(S * size)}px Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, x, y);
  };
  const word = (t: string, y: number, size = 0.075, col = "#b9b8ae") => { g.fillStyle = col; g.font = `600 ${Math.round(S * size)}px Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, C, C + y * S); };
  if (gauge === "speed") {
    const step = top > 60 ? 20 : 10, minor = step / 2;
    for (let v = 0; v <= top + 0.01; v += minor) tick(v / top, v % step === 0);
    for (let v = 0; v <= top + 0.01; v += step) label(v / top, String(v), top > 99 ? 0.09 : 0.11);
    word("MPH", 0.2);
  } else if (gauge === "revs") {
    span(6 / 7, 1, R * 0.86, S * 0.05, "#c8241c");
    for (let v = 0; v <= 7; v += 0.5) tick(v / 7, v % 1 === 0, v >= 6 ? "#ff5a4a" : "#ecebe2");
    for (let v = 0; v <= 7; v++) label(v / 7, String(v));
    word("RPM x1000", 0.2, 0.06);
  } else if (gauge === "fuel") {
    span(0, 0.12, R * 0.84, S * 0.04, "#c8241c");
    for (let v = 0; v <= 4; v++) tick(v / 4, v % 2 === 0);
    label(0, "E", 0.14); label(1, "F", 0.14); word("FUEL", 0.2);
  } else if (gauge === "temp") {
    span(0.85, 1, R * 0.84, S * 0.04, "#c8241c");
    for (let v = 0; v <= 4; v++) tick(v / 4, v % 2 === 0);
    label(0, "C", 0.14); label(1, "H", 0.14); word("TEMP", 0.2);
  } else {
    for (let v = 0; v <= 4; v++) tick(v / 4, v % 2 === 0);
    label(0, "-", 0.16); label(1, "+", 0.16); word("CHARGE", 0.2, 0.065);
  }
  if (big) grain(g, S, S, 300, 0.03);
  return tex(c, false);
}

/** A radio's or a clock's glowing figures: an old car's amber cassette deck, a newer one's green. */
export function displayTexture(old: boolean): THREE.CanvasTexture {
  const [c, g] = canvas(128, 32);
  g.fillStyle = old ? "#1a0f04" : "#03140c"; g.fillRect(0, 0, 128, 32);
  g.fillStyle = old ? "#ffae3a" : "#5effb0"; g.font = "bold 20px monospace"; g.textBaseline = "middle"; g.textAlign = "center";
  g.fillText(old ? "FM  97.1" : "BATH 107.9", 64, 17);
  return tex(c, false);
}
