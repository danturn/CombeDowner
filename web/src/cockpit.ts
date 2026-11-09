// The inside of a vehicle, for the driver's own view (C while driving goes from the chase camera to
// this, then to the bonnet camera, game.ts). A car's or a van's cabin is set back from each kind's own
// windscreen and closed all round, so there's nowhere you can look from the seat and see out through
// the floor or a gap: a moulded dash with its vents and glovebox, the dials under a hood, read through
// the top of a steering wheel on its column (the indicator stalk moving as you signal), the pedals, the
// centre console with the radio, heater, gear stick and handbrake, the seats, the doors' insides up to
// the windows, the pillars and their belts, a roof lining fitted to the body's own roof line, the sun
// visors and mirror, and a parcel shelf over the boot or a van's bulkhead. Each kind is fitted out as
// its real one was, and drawn in more detail at the longest draw distances (interior.ts). The open ones (the
// C5 and the heavy roller) have no roof to frame. The buses have a cab of their own, being so
// different: a big flat wheel nearly lying down on its column, a long low dash, its dials read down through the wheel, under a split
// windscreen, the cab's green side panels, and an old mechanical ticket machine on its post by the
// door, with a crank handle and a coin tray: no screens, they're old buses. Arleen's coaches (coaches.ts) have the same
// sort of cab, under their own raked windscreen, in grey, with no ticket machine. A parked car with
// its driver's door left open (golfdriver.ts) shows the same inside through the doorway. The dash sits
// well down below the driver's eyes, so the windscreen is mostly road. The bonnet camera (bonnetEye)
// draws no inside at all: it looks out from just above the bonnet at the foot of the windscreen, or
// from the front of a bus's or a coach's cab.
//
// Who decides what: it's only ever drawn on each player's own screen (for whoever's driving, or
// through an open door), so nothing here goes over the network.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { model, Part, prof } from "./furniture";
import { clothTexture, dialTexture, feltTexture, planarUV, rich, screenTexture, styleOf, type DialKind, type Gauge, type WheelKind } from "./interior";

/** Where a kind's windscreen starts, metres ahead of the driver's seat, and how far back its top leans. */
const SCREEN: Record<string, [number, number]> = {
  xr3i: [1.2, 0.83], robin: [0.92, 0.6], nova: [0.87, 0.54], metro: [0.83, 0.46], sierra: [1.2, 0.88], police: [1.2, 0.88],
  golf: [0.91, 0.37], golfdriver: [0.91, 0.37], landrover: [0.67, 0.02], car0: [1.45, 0.9], car1: [1.55, 0.82], car2: [1.67, 1.04], transit: [0.49, 0.46], icecream: [0.31, 0.45], chipvan: [0.55, 0.49], milkfloat: [0.55, 0],
  c5: [0.9, 0], roller: [0.7, 0],
};
const OPEN = new Set(["c5", "roller"]);
/** The vans' bonnets meet the windscreen higher than their windows' line, so their dash sits up level with it. */
const SILL: Record<string, number> = { transit: 1.08, icecream: 1.12, chipvan: 1.1 };
/** The ice cream van's driver is drawn sat close up to the windscreen; from the seat you're this much further back, so its dash isn't in your lap. */
const SEAT_BACK: Record<string, number> = { icecream: 0.45 };
/** The milk float's windscreen is a flat pane right in front of you: from the seat the body's cut away up to this height, pane and all. */
const PANE: Record<string, number> = { milkfloat: 1.8 };
const screenOf = (kind: string): [number, number] => {
  const [screen, rake] = SCREEN[kind] ?? SCREEN.car0;
  return [screen + (SEAT_BACK[kind] ?? 0), rake];
};
/** The everyday cars' three shapes (furniture.ts) have their own roof heights and window lines: [H, waist]. */
const SHAPE_DIMS: Record<string, [number, number]> = { car0: [1.44, 0.9], car1: [1.45, 0.95], car2: [1.58, 0.93] };

/** What the cockpit needs to know about the vehicle. kind: its kind, or for an everyday car "car" and its shape's number.
 *  seat: the driver's [along, up, across]. decks and base: a bus's. */
export interface CockpitOf {
  kind: string; L: number; W: number; H: number; waist: number; seat: number[]; decks?: number; base?: number; coach?: { foot: number[]; top: number[] }; doorway?: boolean;
  /** An everyday car's make (its indicators are on the right if it's Japanese). */
  make?: string;
  /** How high the top of the body is at x along its middle (the roof, or the glass where it slopes), for fitting the roof lining. */
  top?: (x: number) => number;
}

const isBusCab = (d: CockpitOf) => d.kind === "bus" || d.kind === "minibus" || d.kind === "school" || !!d.coach;

/** Where the bonnet camera sits, in the vehicle's own frame (along, up, across): over the middle of the
 *  bonnet just ahead of the windscreen's foot, or for a bus or a coach just ahead of its flat front. */
export function bonnetEye(d: CockpitOf): THREE.Vector3 {
  if (isBusCab(d)) {
    const front = d.coach ? d.coach.foot[0] : d.L / 2, foot = d.coach ? d.coach.foot[1] : (d.decks ?? 2) === 2 ? 1.45 : 1.2;
    return new THREE.Vector3(front + 0.08, foot + 0.2, 0);
  }
  // the roller's windscreen line would be inside its drum: it looks out over the drum's frame instead
  if (d.kind === "roller") return new THREE.Vector3(0.4, 1.45, 0);
  const waist = SHAPE_DIMS[d.kind]?.[1] ?? d.waist, [screen] = SCREEN[d.kind] ?? SCREEN.car0;
  // and the Land Rover's spare wheel rides on its bonnet, so it looks out over the top of that
  return new THREE.Vector3(d.seat[0] + screen + 0.12, waist + (d.kind === "landrover" ? 0.4 : 0.26), 0);
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg);
const DASH = "#2e3033";

/** A box from a to b (two points along and up, at across z), thick t and wide w: a pillar or a rail. */
function strut(a: number[], b: number[], z: number, t: number, w: number, col: string): Part {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return [box(len, t, w).rotateZ(ang), col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z];
}

/**
 * Turned to face the driver, leaning back tilt radians off upright towards them: its face looks back
 * at them, its right is their right (across the vehicle) and its up is their up.
 */
function facing(tilt: number): THREE.Quaternion {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(s, c, 0), new THREE.Vector3(-c, s, 0));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

export class Cockpit {
  readonly group = new THREE.Group();
  /** Where the driver's eyes are, in the vehicle's own frame (along, up, across). */
  readonly eye: THREE.Vector3;
  private spin = new THREE.Group();     // the steering wheel, turning about its column
  private needles: THREE.Group[] = [];  // the speedo's needle, and the rev counter's
  private arrows: THREE.Mesh[] = [];    // the indicators' green arrows on the dash, left then right
  private stalk: THREE.Group | null = null;   // the indicator stalk, up or down as you signal
  private stalkSide = -1;               // which side of the column it's on (-1 left, 1 right)
  private turns: number;                // how far the wheel turns at full lock, radians
  /** The part of the body to cut away round you while you drive, in the vehicle's own frame (vehicles.ts): the cabin of a car. Null for the open ones, buses and coaches. */
  cut: THREE.Box3 | null = null;
  private top: number;                  // what the speedo reads up to, mph
  /** How far down the view settles (a pitch, radians): far enough that the dials show under the windscreen. */
  rest = -0.06;

  constructor(d: CockpitOf) {
    if (SHAPE_DIMS[d.kind]) [d.H, d.waist] = SHAPE_DIMS[d.kind];
    if (SEAT_BACK[d.kind]) d = { ...d, seat: [d.seat[0] - SEAT_BACK[d.kind], d.seat[1], d.seat[2]] };
    const [al, up, ac] = d.seat, bus = isBusCab(d);
    const open = OPEN.has(d.kind);
    // sat up and forward a touch, as you would to see the road, but never so high that the roof lining crowds the screen
    // in a short cab (a van's) you sit back from the dash, or the dials would be under your chin
    const [screen] = screenOf(d.kind), back = al + screen - 0.02 - Math.max(0.15, screen - 0.55);
    this.eye = new THREE.Vector3(bus ? al - 0.05 : Math.max(al - 0.15, Math.min(al - 0.01, back - 0.45)), open ? up + 0.78 : Math.min(d.H - 0.14, up + (bus ? 1.17 : 1.15)), ac);
    this.turns = bus ? 4 : 2.6;
    this.top = bus ? 60 : d.kind === "milkfloat" || d.kind === "c5" || d.kind === "roller" ? 20 : d.kind === "robin" || d.kind === "metro" ? 100 : 120;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const parts = bus ? this.busCab(d) : open ? this.openDash(d) : this.cabin(d);
    if (parts.length) this.group.add(new THREE.Mesh(model(parts), mat));
    this.group.traverse((o) => { o.castShadow = false; o.receiveShadow = true; });
  }

  /**
   * A car's or a van's cabin, closed all round so that wherever you look from the seat there's no gap
   * through to the road: the dash, its hooded dials and the steering wheel on its column, the pedals, the
   * console with the radio, heater and gear stick, the seats, the doors' insides, the pillars and roof
   * lining, the parcel shelf (or a van's bulkhead), and each car's own odds and ends (interior.ts).
   */
  private cabin(d: CockpitOf): Part[] {
    const st = styleOf(d.kind, d.make), R = rich(), [al, up, ac] = d.seat, [screen, rake] = screenOf(d.kind), ey = this.eye.y;
    // the top of the dash, along the bottom of the windows: any lower and you'd see down past it into the bonnet
    const yd = Math.min(ey - 0.3, (SILL[d.kind] ?? d.waist) + 0.02), lo = yd - 0.24;
    const front = al + screen - 0.02, deep = Math.max(0.15, screen - 0.55), back = front - deep;
    // in the shortest cab (the ice cream van's) you sit a little lower too, to see the dials over the wheel
    this.eye.y = Math.min(ey, yd + 0.8 * (back - this.eye.x));
    const E = this.eye;
    // from the seat the lining sits a little above the real roof: at its true height the wide view makes it crowd the top of
    // the screen. Seen through an open door from outside it has to stay under the roof
    const half = d.W / 2 - 0.08, roof = d.doorway ? d.H - 0.06 : d.H + 0.02, wide = d.W / 2 - 0.03;
    // the floor's where a car's floor is, well up off the road, so the ground never shows through it on a crest
    const fl = d.doorway ? Math.max(up, 0.32) : Math.max(up, 0.2), sill = d.waist + 0.1;
    const rear = st.van ? al - 0.5 : Math.max(-d.L / 2 + 0.3, al - 1.45), len = front - rear, mid = (front + rear) / 2;
    const single = d.kind === "milkfloat";
    this.cut = new THREE.Box3(new THREE.Vector3(rear, fl + 0.005, -wide), new THREE.Vector3(front + (PANE[d.kind] ? 0.08 : 0), PANE[d.kind] ?? sill, wide));
    const P: Part[] = [], C: Part[] = [], G: Part[] = [];   // plain, in the seats' cloth, and lit up
    const rb = (w: number, h: number, dp: number, r = 0.02) => new RoundedBoxGeometry(w, h, dp, R ? 3 : 1, Math.min(r, w / 2.01, h / 2.01, dp / 2.01));
    const disc = (r: number, h: number, seg = R ? 20 : 10) => new THREE.CylinderGeometry(r, r, h, seg);
    const CHROME = "#b9bdc1", BLACK = "#131415", RUBBER = "#1d1d1e";
    const sides = d.doorway ? [-1] : [1, -1];

    // ---- the floor, the footwells and the tunnel down the middle
    P.push([box(len, 0.03, wide * 2), st.carpet, mid, fl - 0.015, 0]);
    P.push([box(0.06, Math.max(0.05, lo - fl), wide * 2), st.carpet, front - 0.03, (lo + fl) / 2, 0]);   // the footwell's end, under the dash
    P.push([box(0.36, 0.25, wide * 2).rotateZ(-0.75), st.carpet, front - 0.12, fl + 0.07, 0]);              // and the toe board sloping up to it
    if (!st.van) P.push([box(front - al + 0.7, 0.16, 0.26), st.carpet, (front + al - 0.7) / 2, fl + 0.08, 0]);   // the tunnel
    for (const z of single ? [ac] : [ac, -ac]) P.push([box(0.44, 0.008, 0.4), RUBBER, Math.min(front - 0.25, al + 0.62), fl + 0.004, z]);   // mats

    // ---- the pedals, hanging from under the dash in your footwell: clutch, brake and accelerator
    const px = Math.min(front - 0.2, al + 0.92);
    for (const [dz, w, h] of [[-0.14, 0.055, 0.06], [-0.02, 0.07, 0.06], [0.12, 0.045, 0.12]]) {
      const pz = ac + dz, py = fl + (h > 0.1 ? 0.11 : 0.15);
      P.push([box(0.015, h, w).rotateZ(0.45), RUBBER, px, py, pz]);
      P.push(strut([px + 0.01, py + h / 2 - 0.01], [front - 0.08, lo - 0.01], pz, 0.014, 0.018, "#2b2c2e"));
    }

    // ---- the dash: a moulded top over the windscreen's foot, a face towards you, and the lower part over your knees
    const dashW = (wide - 0.05) * 2;
    P.push([prof([[front + 0.01, yd - 0.02], [front, lo], [back + 0.1, lo], [back - 0.005, yd - 0.16], [back - 0.005, yd - 0.025], [back + 0.03, yd + 0.005], [back + 0.14, yd + 0.012]], dashW), st.dash, 0, 0, 0]);
    // the demister's slots along the top, by the windscreen, and a speaker grille at each end
    for (const z of [-0.3, 0, 0.3]) P.push([box(0.035, 0.004, 0.24), "#0e0f10", front - 0.07, yd - 0.006 + 0.0, z * Math.min(1, half / 0.7)]);
    for (const s of [1, -1]) P.push([box(0.09, 0.004, 0.09), "#141516", front - 0.12, yd - 0.004, s * (half - 0.12)]);
    // the glovebox lid on the passenger's side, and its catch
    if (!single) P.push([box(0.01, 0.1, 0.34), st.dash, back - 0.011, yd - 0.095, -ac], [box(0.012, 0.012, 0.06), CHROME, back - 0.018, yd - 0.055, -ac]);
    // air vents: round ones in a newer car, oblong slatted ones in an old one, at each end of the dash and two in the middle
    for (const z of [half - 0.1, -half + 0.1, 0.07, -0.07]) {
      if (st.van && Math.abs(z) < 0.1) continue;
      if (st.old) {
        P.push([box(0.012, 0.045, 0.1), BLACK, back - 0.01, yd - 0.05, z]);
        for (let k = -1; k <= 1; k++) P.push([box(0.016, 0.004, 0.096), "#3a3b3e", back - 0.012, yd - 0.05 + k * 0.013, z]);
      } else {
        P.push([disc(0.034, 0.016).rotateZ(Math.PI / 2), "#4a4c50", back - 0.012, yd - 0.055, z]);
        P.push([disc(0.028, 0.02).rotateZ(Math.PI / 2), BLACK, back - 0.013, yd - 0.055, z]);
        P.push([box(0.024, 0.004, 0.052), "#3a3b3e", back - 0.02, yd - 0.055, z], [box(0.024, 0.052, 0.004), "#3a3b3e", back - 0.02, yd - 0.055, z]);
      }
    }

    // ---- the dials, under a hood: in front of you, or in the middle of the dash in a Land Rover
    const centred = st.dials === "centre", cz = centred ? 0.02 : ac, dc = new THREE.Vector3(back - 0.012, yd - 0.07, ac);
    const cw = st.dials === "quad" ? 0.36 : st.dials === "single" ? 0.24 : 0.28;
    P.push([box(0.008, 0.13, cw), BLACK, back - 0.009, yd - 0.07, cz]);                                           // the cluster's face
    P.push([box(0.075, 0.022, cw + 0.05).rotateZ(-0.12), st.dash, back - 0.025, yd + 0.012, cz]);             // its hood
    for (const s of [1, -1]) P.push([box(0.07, 0.12, 0.022), st.dash, back - 0.028, yd - 0.045, cz + s * (cw / 2 + 0.013)]);   // and the hood's cheeks
    if (centred) P.push([box(0.06, 0.1, 0.22), st.dash, back - 0.03, yd - 0.07, ac]);                         // (a Land Rover's driver has a plain pod)
    this.gauges(new THREE.Vector3(back - 0.014, yd - 0.07, cz), st.dials, R);
    // a row of warning lights along the top of the cluster, dark till something goes wrong
    for (let k = -2; k <= 2; k++) P.push([box(0.004, 0.01, 0.018), ["#3a1010", "#3a2a08", "#0e2a12", "#3a1010", "#0c1a30"][k + 2], back - 0.014, yd - 0.015, cz + k * 0.03]);

    // ---- the steering wheel, its rim clear of the hood, the dials read through the top of it, and its column into the dash
    const r = st.wheelR, t = st.wheelTilt;
    const hx = Math.max(E.x + 0.36, back - 0.12 - r * Math.sin(t));
    const rimX = hx + r * Math.sin(t), sight = dc.y + (E.y - dc.y) * (dc.x - rimX) / (dc.x - E.x);
    const hub = new THREE.Vector3(hx, sight + 0.06 - r * Math.cos(t), ac);
    this.wheel(hub, r, t, st.wheelCol, st.wheel);
    const dir = new THREE.Vector2(Math.cos(t), -Math.sin(t)), at = (k: number): number[] => [hub.x + dir.x * k, hub.y + dir.y * k];
    const reach = Math.max(0.12, (back + 0.02 - hub.x) / dir.x);
    P.push(strut(at(0.03), at(reach + 0.05), ac, 0.045, 0.045, "#18191a"));                                   // the column
    P.push(strut(at(0.07), at(Math.max(0.2, reach * 0.8)), ac, 0.09, 0.11, st.dash));                          // its shroud
    // the stalks either side, just behind the wheel: the indicators' (it goes up or down as you signal) and the wipers'
    this.stalkSide = st.stalkRight ? 1 : -1;
    const [sx, sy] = at(0.1);
    this.stalk = new THREE.Group();
    this.stalk.position.set(sx, sy, ac + this.stalkSide * 0.05);
    const stalkGeo = model([[box(0.014, 0.014, 0.15), "#1b1c1d", 0, 0, this.stalkSide * 0.075], [disc(0.011, 0.04).rotateX(Math.PI / 2), "#2a2b2d", 0, 0, this.stalkSide * 0.16]]);
    this.stalk.add(new THREE.Mesh(stalkGeo, new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.group.add(this.stalk);
    P.push([box(0.014, 0.014, 0.15), "#1b1c1d", sx, sy, ac - this.stalkSide * 0.125], [disc(0.011, 0.04).rotateX(Math.PI / 2), "#2a2b2d", sx, sy, ac - this.stalkSide * 0.21]);
    // the ignition key in its lock on the column's right, with its fob hanging off it
    P.push([disc(0.014, 0.02).rotateZ(Math.PI / 2), CHROME, at(0.16)[0], at(0.16)[1] - 0.02, ac + 0.056], [box(0.03, 0.022, 0.004), "#2a2b2d", at(0.16)[0] - 0.02, at(0.16)[1] - 0.02, ac + 0.062]);
    P.push([box(0.01, 0.04, 0.025), "#7a2f2a", at(0.16)[0] - 0.03, at(0.16)[1] - 0.06, ac + 0.064]);

    // ---- the middle: the centre stack (radio, heater, hazard switch) sloping down to the console, the gear stick and the handbrake
    if (d.kind === "landrover") {
      // a Land Rover has no console: a seat box between the seats, its levers coming up out of the floor in front of it
      P.push([box(0.5, 0.36, 0.3), st.trim, al - 0.05, fl + 0.18, 0], [box(0.48, 0.05, 0.28), st.seat, al - 0.05, fl + 0.385, 0]);
    } else if (!st.van) {
      const sx2 = Math.min(al + 0.45, back - 0.1);
      P.push([prof([[back + 0.1, yd - 0.03], [back - 0.012, yd - 0.03], [back - 0.03, yd - 0.24], [sx2, fl + 0.24], [sx2, fl], [back + 0.1, fl]], 0.24), st.dash, 0, 0, 0]);
      P.push([box(sx2 - al + 0.32, 0.24, 0.2), st.trim, (sx2 + al - 0.32) / 2, fl + 0.12, 0]);                  // the console between the seats
      P.push([box(0.02, 0.05, 0.18), BLACK, back - 0.026, yd - 0.1, 0]);                                       // the radio
      G.push([box(0.004, 0.018, 0.09), st.old ? "#ffae3a" : "#5effb0", back - 0.037, yd - 0.092, 0.02]);      // its display
      for (const z of [-0.07, 0.075]) P.push([disc(0.011, 0.016).rotateZ(Math.PI / 2), "#3a3b3e", back - 0.04, yd - 0.1, z]);
      if (st.old) P.push([box(0.006, 0.008, 0.1), "#2c2d30", back - 0.037, yd - 0.115, 0.01]);                // the cassette slot
      P.push([box(0.014, 0.022, 0.03), "#b5221a", back - 0.016, yd - 0.035, 0]);                               // the hazard switch
      // the heater: three knobs in a newer car, three sliders in a panel in an old one
      const hy = yd - 0.175, hxx = back - 0.03 - 0.0;
      if (st.old) {
        P.push([box(0.01, 0.06, 0.19), "#202123", hxx, hy, 0]);
        for (const z of [-0.06, 0, 0.06]) P.push([box(0.006, 0.04, 0.006), "#0b0b0c", hxx - 0.006, hy, z], [box(0.02, 0.014, 0.014), "#5a5c60", hxx - 0.012, hy + 0.006 - Math.abs(z) * 0.2, z]);
      } else for (const z of [-0.065, 0, 0.065]) P.push([disc(0.022, 0.02).rotateZ(Math.PI / 2), "#2e2f33", hxx - 0.008, hy, z], [box(0.022, 0.004, 0.004), "#d84a2a", hxx - 0.02, hy + 0.012, z]);
      // the gear stick in its gaiter, the knob a golf ball in a GTI
      const gx = al + 0.3, gy = fl + 0.24, gz = 0;
      P.push([new THREE.CylinderGeometry(0.03, 0.07, 0.09, R ? 16 : 8), "#1c1c1e", gx, gy + 0.045, gz]);
      P.push([new THREE.CylinderGeometry(0.009, 0.011, 0.24, 8).rotateZ(0.12), "#26272a", gx - 0.012, gy + 0.18, gz]);
      const golf = d.kind === "golf", knob = golf ? 0.025 : 0.027;
      P.push([new THREE.SphereGeometry(knob, R ? 20 : 12, R ? 14 : 8), golf ? "#f4f4ee" : "#151617", gx - 0.027, gy + 0.3 + knob * 0.4, gz]);
      if (golf) for (let k = 0; k < (R ? 40 : 10); k++) {   // its dimples
        const a = k * 2.399, y = 1 - (k + 0.5) / (R ? 40 : 10) * 1.4, rr = Math.sqrt(Math.max(0, 1 - y * y));
        P.push([new THREE.SphereGeometry(0.0042, 4, 3), "#d0d0c8", gx - 0.027 + Math.cos(a) * rr * knob, gy + 0.3 + knob * 0.4 + y * knob, gz + Math.sin(a) * rr * knob]);
      }
      // the gear pattern on its top, as a few dark lines
      if (!golf) P.push([box(0.012, 0.0012, 0.025), "#c9c9c0", gx - 0.027, gy + 0.3 + knob * 1.4, gz]);
      // the handbrake, pulled up a little between the seats, its button on the end
      P.push([box(0.26, 0.03, 0.04).rotateZ(0.22), "#1f2022", al - 0.08, fl + 0.29, 0.03]);
      P.push([disc(0.012, 0.03).rotateZ(Math.PI / 2 + 0.22), CHROME, al + 0.06, fl + 0.32, 0.03]);
      if (!st.old) for (const x of [al + 0.12, al - 0.3]) P.push([disc(0.035, 0.01), BLACK, x, fl + 0.241, -0.04]);   // the cup holders
      else P.push([box(0.08, 0.004, 0.13), "#2b2c2f", al + 0.14, fl + 0.241, 0]);                                  // the ashtray's lid
    } else if (!single) {
      // a van's gear stick comes straight up out of the floor, long, with the handbrake beside your seat
      const gx = al + 0.38, gz = ac - 0.4;
      P.push([new THREE.CylinderGeometry(0.03, 0.08, 0.08, 10), RUBBER, gx, fl + 0.04, gz], [new THREE.CylinderGeometry(0.009, 0.011, 0.6, 8).rotateZ(0.2), "#26272a", gx - 0.06, fl + 0.3, gz]);
      P.push([new THREE.SphereGeometry(0.028, 12, 8), "#151617", gx - 0.12, fl + 0.6, gz]);
      P.push([box(0.3, 0.03, 0.04).rotateZ(0.5), "#1f2022", al + 0.05, fl + 0.18, ac - 0.3]);
    }
    if (d.kind === "landrover") {
      // a Land Rover's three levers: the gear stick, the transfer box's red knob and the four-wheel drive's yellow
      for (const [dx, dz, col] of [[0.3, 0, "#151617"], [0.18, 0.06, "#c0261c"], [0.18, -0.06, "#e5b51a"]] as [number, number, string][]) {
        P.push([new THREE.CylinderGeometry(0.008, 0.01, 0.34, 8).rotateZ(0.15), "#26272a", al + dx, fl + 0.3, dz]);
        P.push([new THREE.SphereGeometry(0.024, 10, 8), col, al + dx - 0.025, fl + 0.47, dz]);
      }
    }

    // ---- the seats: a cushion, a raked back and a headrest on its posts, a base down to the floor; sports seats bolstered
    const ct = Math.max(fl + 0.2, Math.min(up + 0.42, E.y - 0.78)), rake2 = 0.22;
    const seat = (x: number, z: number, w: number, bench: boolean) => {
      C.push([rb(0.5, 0.11, w, 0.035).rotateZ(0.07), st.seat, x + 0.02, ct - 0.055, z]);
      P.push([box(0.42, Math.max(0.02, ct - 0.11 - fl), w - 0.1), "#161617", x, (ct - 0.11 + fl) / 2, z]);
      const hb = bench ? 0.52 : 0.6, bx = x - 0.24, by = ct - 0.07, sn = Math.sin(rake2), cs = Math.cos(rake2);
      C.push([rb(0.12, hb, w, 0.04).rotateZ(rake2), st.seat, bx - sn * hb / 2, by + cs * hb / 2, z]);
      if (st.sporty && !bench) for (const s of [1, -1]) {
        C.push([rb(0.46, 0.08, 0.075, 0.03).rotateZ(0.07), st.bolster, x + 0.02, ct + 0.01, z + s * (w / 2 - 0.035)]);
        C.push([rb(0.13, hb * 0.78, 0.075, 0.03).rotateZ(rake2), st.bolster, bx - sn * hb * 0.4 + 0.04, by + cs * hb * 0.4, z + s * (w / 2 - 0.035)]);
      }
      if (st.headrests && !bench) {
        const tx = bx - sn * hb, ty = by + cs * hb;
        C.push([rb(0.09, 0.17, Math.min(0.27, w - 0.12), 0.035).rotateZ(rake2), st.seat, tx - sn * 0.14, ty + cs * 0.14, z]);
        for (const s of [1, -1]) P.push([disc(0.006, 0.08, 6).rotateZ(rake2), CHROME, tx - sn * 0.04, ty + cs * 0.04, z + s * 0.07]);
      }
      // a recliner knob on the outside, by the hinge
      if (!bench) P.push([disc(0.03, 0.02).rotateX(Math.PI / 2), "#1a1b1c", bx + 0.02, by + 0.05, z + Math.sign(z || 1) * (w / 2 + 0.01)]);
    };
    const sw = Math.max(0.36, Math.min(0.5, 2 * (ac - 0.13)));
    if (single) seat(al, ac, 0.5, false);
    else if (st.van) {
      seat(al, ac, sw, false);
      const z0 = -(wide - 0.08), z1 = ac - sw / 2 - 0.08;   // a bench for two across the rest of the cab
      seat(al, (z0 + z1) / 2, z1 - z0, true);
    } else {
      for (const z of [ac, -ac]) seat(al, z, sw, false);
      if (al - 1.0 > rear) seat(al - 0.95, 0, wide * 2 - 0.12, true);
    }

    // ---- the doors' insides: the trim up to the window line, with an armrest, the handle, a window winder (or switches in a
    // newer car), a pocket and a speaker, and the lock's button on the sill; a seam where a four-door's back door starts
    const bpx = al - 0.42;
    if (!single) for (const s of sides) {
      const zi = s * (wide - 0.06), into = (k: number) => zi - s * k;
      P.push([box(len, sill - fl, 0.06), st.trim, mid, (sill + fl) / 2, s * (wide - 0.03)]);
      P.push([rb(len, 0.035, 0.07, 0.012), st.dash, mid, sill, s * (wide - 0.05)]);                              // the window sill's capping
      for (const [x0, x1] of st.twoDoor || st.van ? [[bpx - 0.15, front - 0.12]] : [[bpx + 0.04, front - 0.12], [rear + 0.12, bpx - 0.04]]) {
        C.push([box(x1 - x0 - 0.1, 0.2, 0.012), st.seat, (x0 + x1) / 2, sill - 0.27, into(0.006)]);             // a cloth panel in the trim
        P.push([rb(0.36, 0.05, 0.085, 0.015), st.dash, (x0 + x1) / 2 - 0.05, sill - 0.19, into(0.042)]);       // the armrest
        P.push([box(0.4, 0.12, 0.05), "#1a1b1d", (x0 + x1) / 2 + 0.05, fl + 0.16, into(0.025)]);                // the pocket
        if (x1 > x0 + 0.7) P.push([disc(0.06, 0.012).rotateX(Math.PI / 2), "#151617", x1 - 0.15, fl + 0.2, into(0.006)]);   // a speaker
        P.push([box(0.12, 0.04, 0.01), "#121314", x1 - 0.12, sill - 0.1, into(0.005)], [box(0.1, 0.02, 0.02), CHROME, x1 - 0.12, sill - 0.1, into(0.012)]);   // the handle
        if (st.old) {
          const wx = (x0 + x1) / 2 + 0.05, wy = sill - 0.33;
          P.push([disc(0.022, 0.02).rotateX(Math.PI / 2), "#2a2b2d", wx, wy, into(0.01)], [box(0.08, 0.016, 0.012).rotateZ(0.6), "#2a2b2d", wx - 0.03, wy + 0.02, into(0.02)]);
          P.push([disc(0.011, 0.045).rotateX(Math.PI / 2), "#151617", wx - 0.06, wy + 0.045, into(0.045)]);
        } else P.push([box(0.08, 0.008, 0.04), BLACK, (x0 + x1) / 2 + 0.02, sill - 0.163, into(0.05)]);           // the window switches
        P.push([disc(0.007, 0.03, 6), "#1a1b1c", x0 + 0.08, sill + 0.03, s * (wide - 0.05)]);                    // the lock's button
      }
      if (!st.twoDoor && !st.van) P.push([box(0.01, sill - fl - 0.04, 0.062), "#141516", bpx, (sill + fl) / 2, s * (wide - 0.03)]);
    }

    // ---- the windscreen's pillars and the rail over it, the pillars behind the doors with their belts hanging, the roof
    // lining fitted to the roof (up to the back window: d.top), the sun visors, the mirror and the light
    const base = [front + 0.02, yd - 0.02], tp = [front + 0.02 - rake, roof];
    for (const z of [half - 0.02, -half + 0.02]) P.push(strut(base, tp, z, 0.075, 0.09, st.trim));
    P.push([box(0.09, 0.06, half * 2), st.trim, tp[0] - 0.02, roof - 0.025, 0]);
    const topAt = d.top;
    let lb = st.van ? rear : Math.max(-d.L / 2 + 0.3, al - (d.doorway ? 0.95 : 1.5));
    if (topAt && !st.van) {
      const ref = topAt(E.x);
      lb = E.x;
      while (lb > -d.L / 2 + 0.15 && topAt(lb - 0.04) >= ref - 0.07) lb -= 0.04;
    }
    const lining: Part = [box(tp[0] - lb, 0.025, half * 2 - 0.02), st.lining, (tp[0] + lb) / 2, roof - 0.03, 0];
    for (const z of [half - 0.03, -half + 0.03]) {
      if (st.van) break;
      P.push([box(0.1, roof - sill, 0.05), st.trim, bpx, (roof + sill) / 2, z]);
      const s = Math.sign(z), bz = z - s * 0.035;
      P.push([box(0.012, roof - sill - 0.22, 0.045), "#1a1a1c", bpx + 0.055, (roof + sill) / 2 - 0.05, bz], [box(0.04, 0.012, 0.02), CHROME, bpx + 0.06, sill + 0.1, bz]);
    }
    // the sun visors, folded up under the lining, a vanity mirror on the passenger's
    for (const z of [0.36, -0.36]) P.push([rb(0.17, 0.018, 0.38, 0.008), st.lining, tp[0] - 0.13, roof - 0.055, z * Math.min(1, half / 0.7)], [disc(0.005, 0.38).rotateX(Math.PI / 2), "#6c6a64", tp[0] - 0.05, roof - 0.05, z * Math.min(1, half / 0.7)]);
    if (R) P.push([box(0.09, 0.004, 0.13), "#8b97a1", tp[0] - 0.13, roof - 0.066, -0.36 * Math.min(1, half / 0.7)]);
    P.push([box(0.03, 0.05, 0.22), "#1c1d1f", tp[0] - 0.1, roof - 0.11, 0], [box(0.005, 0.04, 0.2), "#8b97a1", tp[0] - 0.118, roof - 0.11, 0]);   // the mirror
    P.push([box(0.012, 0.07, 0.014), "#1c1d1f", tp[0] - 0.08, roof - 0.07, 0]);                                // on its stem
    P.push([box(0.14, 0.012, 0.07), "#e8e2cc", al - 0.15, roof - 0.045, 0]);                                     // the light
    P.push([box(0.22, 0.018, 0.022), "#4a4944", al + 0.1, roof - 0.1, -(half - 0.06)]);                          // the passenger's grab handle
    // a parcel shelf over the boot, from behind the back seat to the back window's foot, so you can't see down into it;
    // a van's bulkhead behind its seats instead, with a little window
    if (!st.van) {
      const shelf = d.waist + 0.07;
      let xs = -d.L / 2 + 0.15;
      if (topAt) { xs = rear; while (xs > -d.L / 2 + 0.08 && topAt(xs - 0.04) > shelf + 0.05) xs -= 0.04; }
      P.push([box(0.04, shelf - fl, wide * 2), st.trim, rear + 0.02, (shelf + fl) / 2, 0]);
      if (rear - xs > 0.02) P.push([box(rear - xs, 0.02, wide * 2 - 0.04), "#2a2a2b", (rear + xs) / 2, shelf, 0]);
    } else {
      const wy0 = sill + 0.08, wy1 = roof - 0.15, ww = Math.min(0.5, wide - 0.2);
      P.push([box(0.04, wy0 - fl, wide * 2), st.trim, rear, (wy0 + fl) / 2, 0], [box(0.04, roof - wy1, wide * 2), st.trim, rear, (roof + wy1) / 2, 0]);
      for (const s of [1, -1]) P.push([box(0.04, wy1 - wy0, wide - ww), st.trim, rear, (wy0 + wy1) / 2, s * (ww + wide) / 2]);
      P.push([box(0.01, wy1 - wy0, ww * 2), "#20282e", rear + 0.01, (wy0 + wy1) / 2, 0]);
    }

    // ---- the wipers, parked along the foot of the windscreen outside, and the odd things in it and about the car
    if (!single) for (const z of [0.12, -0.52]) P.push([box(0.012, 0.012, 0.48).rotateY(0.05), "#111213", front + 0.06, yd + 0.01, z * Math.min(1, half / 0.7)]);
    const lean = Math.atan2(rake, roof - base[1]), onScreen = (f: number, z: number, out = 0.006): number[] =>
      [base[0] + (tp[0] - base[0]) * f - Math.cos(lean) * out, base[1] + (tp[1] - base[1]) * f - Math.sin(lean) * out, z];
    const flat = (g: THREE.BufferGeometry) => g.rotateY(-Math.PI / 2).rotateZ(lean);
    if (st.old && !d.doorway && !single) {
      // the tax disc in its holder, down in the passenger's corner of the windscreen
      const [x, y, z] = onScreen(0.13, -(half - 0.16));
      P.push([flat(new THREE.CircleGeometry(0.042, 20)), "#d8dcde", x, y, z], [flat(new THREE.CircleGeometry(0.037, 20)), "#e9c9d8", x - 0.001, y, z]);
      P.push([flat(new THREE.RingGeometry(0.026, 0.03, 20)), "#8d4a6e", x - 0.002, y, z], [flat(new THREE.PlaneGeometry(0.03, 0.006)), "#3a3a3a", x - 0.002, y, z]);
    }
    const props = new Set(st.props), mx = tp[0] - 0.1, my = roof - 0.13;
    if (props.has("permit")) {
      const [x, y, z] = onScreen(0.1, -(half - 0.2));
      P.push([flat(new THREE.PlaneGeometry(0.12, 0.07)), "#f1f1ec", x, y, z], [flat(new THREE.PlaneGeometry(0.12, 0.016)), "#2e7d4a", x - 0.001, y + 0.02, z]);
    }
    if (props.has("dice")) for (const s of [1, -1]) {
      P.push([box(0.003, 0.12, 0.003), "#e6e6e6", mx, my - 0.06, s * 0.02], [rb(0.042, 0.042, 0.042, 0.014), "#f3f1ee", mx, my - 0.14, s * 0.025]);
      // their spots, on the faces you can see: three on the side towards you, one and two on the others
      const pip = (x: number, y: number, z: number) => P.push([new THREE.SphereGeometry(0.0055, 6, 4), "#151515", x, y, z]);
      for (const k of [-1, 0, 1]) pip(mx - 0.021, my - 0.14 + k * 0.011, s * 0.025 + k * 0.011);
      pip(mx, my - 0.14, s * 0.025 + s * 0.021);
      for (const k of [-1, 1]) pip(mx + k * 0.009, my - 0.14 + k * 0.009, s * 0.025 - s * 0.021);
    }
    if (props.has("tree")) P.push([box(0.002, 0.09, 0.002), "#e6e6e6", mx, my - 0.045, 0], [flat(prof([[0, 0.05], [-0.03, 0.01], [-0.015, 0.012], [-0.035, -0.03], [0.035, -0.03], [0.015, 0.012], [0.03, 0.01]], 0.003)).rotateZ(-lean), "#1f8a3a", mx, my - 0.12, 0]);
    if (props.has("atlas") && !single) C.push([box(0.21, 0.016, 0.29).rotateY(0.3), "#f2c230", al + 0.05, ct + 0.01, -ac], [box(0.212, 0.017, 0.06).rotateY(0.3), "#1d4f9c", al + 0.05 + 0.03, ct + 0.011, -ac - 0.08]);
    if (props.has("police")) {
      // the radio set under the dash in the middle, its handset on a clip, and the switches for the blues and twos
      P.push([box(0.12, 0.06, 0.2), "#232527", back + 0.02, lo - 0.035, 0], [box(0.004, 0.008, 0.02), "#ff3b2a", back - 0.042, lo - 0.02, 0.06]);
      G.push([box(0.004, 0.006, 0.006), "#ff3b2a", back - 0.043, lo - 0.02, 0.06]);
      P.push([rb(0.05, 0.1, 0.03, 0.01).rotateZ(0.3), "#1b1c1e", back - 0.03, yd - 0.12, -0.2], [box(0.004, 0.05, 0.004), "#111", back - 0.03, yd - 0.2, -0.2]);
      P.push([box(0.04, 0.03, 0.14), "#2a2c2e", back + 0.05, yd + 0.02, -0.25]);
      for (let k = 0; k < 4; k++) P.push([box(0.006, 0.012, 0.012), k < 2 ? "#3a6bd8" : "#d8d4c8", back + 0.03, yd + 0.04, -0.3 + k * 0.035]);
      C.push([box(0.24, 0.012, 0.32).rotateY(-0.2), "#c9b78e", al + 0.05, ct + 0.01, -ac], [box(0.2, 0.013, 0.26).rotateY(-0.2), "#f4f2ec", al + 0.05, ct + 0.012, -ac]);   // a clipboard on the seat
    }
    if (props.has("chimes")) P.push([box(0.08, 0.05, 0.12), "#d8d4c6", back + 0.04, yd + 0.025, -0.05], [disc(0.015, 0.012), "#d4261c", back + 0.04, yd + 0.055, -0.05]);
    if (props.has("papers") && R) for (let k = 0; k < 3; k++) C.push([box(0.3, 0.02, 0.4).rotateY(k * 0.25 - 0.2), "#e6e2d6", al + 0.02, ct + 0.012 + k * 0.021, -ac]);
    if (props.has("cassettes") && R) for (let k = 0; k < 3; k++) P.push([box(0.07, 0.017, 0.11).rotateY(k * 0.4), ["#c9cdd2", "#d2443a", "#e8e2c8"][k], al + 0.17, fl + 0.25 + k * 0.017, -0.01]);

    // the windscreen's own film of dust, wiped clean in two arcs (rich only)
    if (R && !d.doorway) {
      const h = Math.hypot(tp[0] - base[0], tp[1] - base[1]), screenMat = new THREE.MeshBasicMaterial({ map: screenTexture(), transparent: true, depthWrite: false });
      const [x, y] = onScreen(0.5, 0, 0.01), glass = new THREE.Mesh(flat(new THREE.PlaneGeometry(half * 2, h)), screenMat);
      glass.position.set(x, y, 0);
      glass.renderOrder = 2;
      this.group.add(glass);
    }

    // the cloth, the carpet and the lining: in the seats' weave (and, rich, the carpet's tufts and the lining's pinholes)
    this.group.add(new THREE.Mesh(modelUV(C, st.cloth === "tartan" ? 7 : 10), new THREE.MeshLambertMaterial({ vertexColors: true, map: clothTexture(st.cloth, R) })));
    if (R) {
      this.group.add(new THREE.Mesh(modelUV([lining], 6), new THREE.MeshLambertMaterial({ vertexColors: true, map: feltTexture(true) })));
      // (the carpet's the first part)
      this.group.add(new THREE.Mesh(modelUV([P.shift()!], 5), new THREE.MeshLambertMaterial({ vertexColors: true, map: feltTexture(false) })));
    } else P.push(lining);
    if (G.length) this.group.add(new THREE.Mesh(model(G), new THREE.MeshBasicMaterial({ vertexColors: true })));

    const down = Math.atan2(E.y - yd, back - E.x);
    this.rest = -Math.max(0.06, Math.min(0.25, down - 0.42));
    return P;
  }

  /** The open ones' (the C5's and the roller's): a dash and a wheel on the roller, handlebars under your knees in the C5, and a gear stick. */
  private openDash(d: CockpitOf): Part[] {
    const [al, up, ac] = d.seat, [screen] = screenOf(d.kind), ey = this.eye.y;
    const yd = Math.min(ey - 0.3, (SILL[d.kind] ?? d.waist) + 0.02);
    const front = al + screen - 0.02, deep = Math.max(0.15, screen - 0.55), back = front - deep, half = d.W / 2 - 0.08;
    const parts: Part[] = [];
    parts.push([cyl(0.012, 0.3, 6), "#2a2b2d", al + 0.32, up + 0.42, ac - 0.36], [new THREE.SphereGeometry(0.026, 10, 8), "#151617", al + 0.32, up + 0.58, ac - 0.36]);
    if (d.kind === "c5") {
      // the C5 steers by handlebars under your knees
      parts.push([box(0.04, 0.03, 0.42), "#1b1c1d", al + 0.3, up + 0.32, ac]);
      return parts;
    }
    parts.push([box(deep, 0.2, half * 2), DASH, (front + back) / 2, yd - 0.1, 0]);
    parts.push([box(0.16, 0.1, 0.38), DASH, back + 0.08, yd - 0.01, ac], [box(0.2, 0.02, 0.4), DASH, back + 0.06, yd + 0.06, ac]);
    const hub = new THREE.Vector3(Math.max(al + 0.3, Math.min(back - 0.12, al + 0.45)), yd - 0.07, ac);
    this.wheel(hub, 0.2, 0.4, "#2a2a2a", "thin4");
    this.gauges(new THREE.Vector3(back - 0.003, yd + 0.005, ac), "pair", false, 0.3);
    const down = Math.atan2(this.eye.y - yd, back - this.eye.x);
    this.rest = -Math.max(0.06, Math.min(0.25, down - 0.42));
    return parts;
  }

  /** The cab of a bus or a coach: its own wheel, dash, windscreen and side panels, and on a bus the ticket machine. */
  private busCab(d: CockpitOf): Part[] {
    const [al, up, ac] = d.seat, c = d.coach, f = c ? c.foot[0] : d.L / 2, base = c ? 0.35 : d.base ?? 0.45, two = !c && (d.decks ?? 2) === 2, W = d.W;
    const ws = c ? [c.foot[1], c.top[1]] : two ? [1.45, 2.38] : [1.2, 2.25], rake = c ? c.foot[0] - c.top[0] : 0;
    const win = c ? c.foot[1] : two ? 1.48 : 1.22, ceil = two ? 2.55 : d.H - 0.08, GREEN = c ? "#4a4e54" : "#2f4a35", POST = c ? "#1b1c1e" : "#1e2b22";
    const lo = [f - 0.04, ws[0]], hi = [f - 0.04 - rake, ws[1]];
    const parts: Part[] = [
      [box(0.06, ws[0] - base, W - 0.1), GREEN, f - 0.06, (base + ws[0]) / 2, 0],                          // the panel under the windscreen
      [box(0.42, 0.1, W - 0.16), DASH, f - 0.27, ws[0] - 0.05, 0],                                         // the long low dash
      strut(lo, hi, 0, 0.1, 0.05, POST),                                                                    // the split windscreen's middle
      strut(lo, hi, W / 2 - 0.06, 0.12, 0.08, POST), strut(lo, hi, -W / 2 + 0.06, 0.12, 0.08, POST),       // and its sides
      [box(0.12, ceil - ws[1], W - 0.1), POST, hi[0] - 0.03, (ws[1] + ceil) / 2, 0],                       // over it, the back of the destination box
      [box(2.2, win - base, 0.04), GREEN, f - 1.1, (base + win) / 2, W / 2 - 0.05],                        // the cab's side, under your window
    ];
    if (!two) parts.push([box(3, 0.02, W - 0.1), c ? "#c8c4b8" : "#d8d4c4", f - 1.5, ceil, 0]);   // a single-decker has a ceiling of its own; a double-decker's is the top deck's floor
    if (!c) parts.push(
      // the cab's partition on your left, with the ticket machine on its post by the door
      [box(1.1, 1.0 - base + up * 0.2, 0.04), GREEN, al - 0.05, base + 0.5, ac - 0.48],
      [cyl(0.025, 0.8, 8), "#6c7176", al + 0.5, up + 0.4, ac - 0.66],
      [box(0.22, 0.18, 0.24), "#7d848a", al + 0.5, up + 0.88, ac - 0.66],                                  // the ticket machine
      [cyl(0.075, 0.03, 16), "#c9ccd0", al + 0.5, up + 0.985, ac - 0.66],                                 // its fare dial
      [box(0.03, 0.02, 0.1), "#c9ccd0", al + 0.5, up + 0.9, ac - 0.83], [cyl(0.02, 0.06, 8), "#151617", al + 0.5, up + 0.9, ac - 0.9, Math.PI / 2],   // the crank handle
      [box(0.02, 0.03, 0.12), "#111213", al + 0.615, up + 0.84, ac - 0.66],                               // where the ticket comes out
      [box(0.28, 0.04, 0.32), "#a8adb2", al + 0.68, up + 0.62, ac - 0.62],                                // the coin tray
      [box(0.16, 0.03, 0.06), "#8a6a2a", al + 0.7, up + 0.65, ac - 0.58],                                 // with some change in it
    );
    // the big wheel, nearly flat, on its column
    // the dials sit low on the dash beyond the wheel's hub, read down through the far half of the wheel as in a real bus
    const dial = new THREE.Vector3(al + 0.62, Math.max(this.eye.y - 0.5, ws[0] + 0.05), ac);
    const hub = new THREE.Vector3(al + 0.45, Math.min(this.eye.y - 0.47, dial.y - 0.03), ac);
    this.wheel(hub, 0.25, 1.15, "#141516");
    parts.push(strut([hub.x + 0.05, hub.y - 0.03], [hub.x + 0.32, base + 0.2], ac, 0.05, 0.05, "#1b1c1d"));
    parts.push([box(0.14, dial.y - ws[0] + 0.02, 0.42), DASH, dial.x + 0.06, (dial.y + ws[0] - 0.08) / 2, ac]);
    this.dials(dial, 0.06, 0.15, 0.64);
    this.rest = -Math.max(0.06, Math.min(0.25, Math.atan2(this.eye.y - dial.y, dial.x - this.eye.x) - 0.42));
    return parts;
  }

  /**
   * A steering wheel of radius r at hub, its column rising towards the driver at tilt radians off level, in the
   * pattern of its kind: a sports three-spoke, a plain two-spoke, a padded four-spoke, a modern one round its
   * airbag, the thin-rimmed ones of the Robin and the Land Rover, or a bus's or van's big flat one.
   */
  private wheel(hub: THREE.Vector3, r: number, tilt: number, col: string, kind: WheelKind | "bus" = "bus") {
    const holder = new THREE.Group(), R = rich();
    holder.position.copy(hub);
    holder.quaternion.copy(facing(tilt));
    const thick = kind === "sport3" ? 0.115 : kind === "thin2" || kind === "thin4" ? 0.06 : kind === "airbag" ? 0.1 : 0.085;
    const parts: Part[] = [[new THREE.TorusGeometry(r, r * thick, R ? 12 : 6, R ? 56 : 24), col, 0, 0, 0]];
    // a spoke from the boss to the rim at angle a (0 to the driver's right, going round anticlockwise), dished back towards the hub
    const spoke = (a: number, w: number, t = 0.014, from = 0.04) => {
      const l = r - from;
      parts.push([box(l, w, t).rotateZ(a), col, Math.cos(a) * (from + l / 2), Math.sin(a) * (from + l / 2), -0.012]);
    };
    const boss = (w: number, h: number, dp: number, c = col) => parts.push([new RoundedBoxGeometry(w, h, dp, R ? 3 : 1, Math.min(w, h) * 0.25), c, 0, 0, dp / 2 - 0.02]);
    const D = Math.PI / 180;
    if (kind === "sport3") { for (const a of [-8, 188, 270]) spoke(a * D, 0.045, 0.012, 0.05); parts.push([new THREE.CylinderGeometry(0.055, 0.055, 0.035, R ? 24 : 12).rotateX(Math.PI / 2), col, 0, 0, 0]); parts.push([new THREE.CylinderGeometry(0.018, 0.018, 0.037, 12).rotateX(Math.PI / 2), "#c8221c", 0, 0, 0.002]); }
    else if (kind === "two" || kind === "van" || kind === "bus") { for (const a of [-25, 205]) spoke(a * D, kind === "bus" ? 0.06 : 0.05, 0.014, 0.06); boss(0.15, 0.085, 0.04); }
    else if (kind === "four") { for (const a of [30, 150, 210, 330]) spoke(a * D, 0.034); boss(0.12, 0.1, 0.045); parts.push([box(0.03, 0.012, 0.004), "#c9c9c9", 0, 0, 0.027]); }
    else if (kind === "airbag") { for (const a of [-5, 185, 270]) spoke(a * D, 0.05, 0.016, 0.06); boss(0.15, 0.115, 0.06); parts.push([new THREE.CylinderGeometry(0.013, 0.013, 0.004, 14).rotateX(Math.PI / 2), "#a8acb0", 0, 0.01, 0.042]); }
    else if (kind === "thin2") { for (const a of [-12, 192]) spoke(a * D, 0.012, 0.012, 0.035); parts.push([new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12).rotateX(Math.PI / 2), col, 0, 0, 0]); }
    else { for (const a of [40, 140, 220, 320]) spoke(a * D, 0.012, 0.012, 0.04); parts.push([new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12).rotateX(Math.PI / 2), col, 0, 0, 0]); }
    // the rim's grip: a leather wrap's stitched seam, rich only
    if (R && (kind === "sport3" || kind === "airbag")) parts.push([new THREE.TorusGeometry(r, r * thick * 1.02, 4, 56, Math.PI * 0.5).rotateZ(Math.PI * 0.25), "#2a2a2b", 0, 0, 0.001]);
    this.spin.add(new THREE.Mesh(model(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
    holder.add(this.spin);
    this.group.add(holder);
  }

  /** A bus's speedo and rev counter, side by side at p facing the driver, radius r, apart s; lean: how far back they face. */
  private dials(p: THREE.Vector3, r: number, s: number, lean = 0.3) {
    this.gauges(p, "pair", false, lean, r, s);
  }

  /**
   * The dials at p, facing the driver and leant back a touch, in the pattern of the kind: a speedo and rev counter
   * side by side (pair), with fuel and temperature gauges outside them (quad); one big speedo (single); a speedo with
   * little gauges stacked by it (strip, and centre, which is the same in the middle of the dash). Their faces are drawn
   * (interior.ts); the speedo's and rev counter's needles turn, the others sit where they are, and the indicators'
   * green arrows blink either side.
   */
  private gauges(p: THREE.Vector3, kind: DialKind, big: boolean, lean = 0.12, r0 = 0.046, s0 = 0.11) {
    const holder = new THREE.Group();
    holder.position.copy(p);
    holder.quaternion.copy(facing(lean));
    const hand = new THREE.MeshBasicMaterial({ color: "#ff7a2a" });
    const dial = (g: Gauge, x: number, y: number, r: number, turns: boolean, still = 0.6) => {
      const face = new THREE.Mesh(new THREE.CircleGeometry(r, big ? 40 : 24), new THREE.MeshBasicMaterial({ map: dialTexture(g, this.top, big || r > 0.04) }));
      face.position.set(x, y, 0);
      // a chrome bezel round it
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r * 1.08, big ? 40 : 24), new THREE.MeshLambertMaterial({ color: "#5a5d62" }));
      ring.position.set(x, y, 0.001);
      const needle = new THREE.Group(), n = new THREE.Mesh(box(Math.max(0.003, r * 0.09), r * 0.85, 0.003), hand);
      n.position.y = r * 0.4;
      needle.add(n, new THREE.Mesh(new THREE.CircleGeometry(r * 0.12, 10), new THREE.MeshBasicMaterial({ color: "#1a1a1a" })));
      needle.position.set(x, y, 0.004);
      needle.rotation.z = 2.3 - 4.6 * still;
      holder.add(face, ring, needle);
      if (turns) this.needles.push(needle);
    };
    const s = s0 / 2;
    if (kind === "pair" || kind === "quad") {
      dial("speed", -s, 0, r0, true); dial("revs", s, 0, r0, true);
      if (kind === "quad") { dial("fuel", -s - r0 - 0.03, -0.012, 0.022, false, 0.7); dial("temp", s + r0 + 0.03, -0.012, 0.022, false, 0.45); }
    } else if (kind === "single") {
      dial("speed", 0, 0, 0.058, true); dial("fuel", 0.09, -0.02, 0.022, false, 0.6);
      this.needles.push(new THREE.Group());   // (no rev counter)
    } else {
      dial("speed", -0.035, 0, 0.05, true); this.needles.push(new THREE.Group());
      dial("fuel", 0.06, 0.026, 0.022, false, 0.7); dial("temp", 0.06, -0.026, 0.022, false, 0.45);
    }
    // the indicators' green arrows, either side of the dials
    const green = new THREE.MeshBasicMaterial({ color: "#3dff5a" }), wide = kind === "quad" ? s + r0 + 0.065 : kind === "single" ? 0.09 : s + r0 + 0.015;
    for (const x of [-wide, wide]) {
      const a = new THREE.Mesh(new THREE.CircleGeometry(0.012, 3).rotateZ(x < 0 ? Math.PI : 0), green);
      a.position.set(x, r0 * 0.75, 0.004);
      a.visible = false;
      holder.add(a);
      this.arrows.push(a);
    }
    this.group.add(holder);
  }

  /** Turn the wheel with the steering (-1..1, + is left), set the needles (speed, m/s, and the engine's revs, 0..1), and blink the indicator's arrow (signal: 1 left, -1 right) with the stalk pushed that way. */
  update(steer: number, speed: number, revs: number, signal = 0) {
    const blink = performance.now() % 760 < 380;
    if (this.arrows.length) { this.arrows[0].visible = signal > 0 && blink; this.arrows[1].visible = signal < 0 && blink; }
    this.spin.rotation.z = steer * this.turns;
    // (the stalk goes the way the wheel's rim goes on its side: up on the left for a right turn)
    if (this.stalk) this.stalk.rotation.x = -signal * 0.14;
    const mph = Math.abs(speed) * 2.237;
    if (this.needles[0]) this.needles[0].rotation.z = 2.3 - 4.6 * Math.min(1, mph / this.top);
    if (this.needles[1]) this.needles[1].rotation.z = 2.3 - 4.6 * Math.max(0.1, Math.min(1, revs));
  }

  dispose() {
    this.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      for (const m of [o.material].flat() as THREE.MeshBasicMaterial[]) { m.map?.dispose(); m.dispose(); }
    });
  }
}

/** Parts merged into one geometry with per-vertex colours, like model(), but keeping texture coordinates for a cloth or a carpet: perMetre repeats a metre. */
function modelUV(parts: Part[], perMetre: number): THREE.BufferGeometry {
  if (!parts.length) return new THREE.BufferGeometry();
  return mergeGeometries(parts.map(([g, col, x, y, z, rx]) => {
    const c = g.index ? g.clone().toNonIndexed() : g.clone();
    if (rx) c.rotateX(rx);
    c.translate(x, y, z);
    planarUV(c, perMetre);
    const k = new THREE.Color(col), n = c.attributes.position.count, cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { cols[i * 3] = k.r; cols[i * 3 + 1] = k.g; cols[i * 3 + 2] = k.b; }
    c.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    return c;
  }))!;
}
