// Climbing Bath Abbey: always on, with nothing to take and no clock, just a hard way up from the
// churchyard to the top of the tower, where there's a pair of angel's wings (wings.ts). The way
// up is the Abbey's own (abbeyclimb.ts):
// - up the ladder of angels on either of the west front's turrets, in three stretches, with a
//   stone angel coming down each stretch in turn: meet one on the ladder and it knocks you off. You
//   stop on each moulding between stretches (forward again takes you on), so wait there for the
//   angel to pass and go as soon as it has;
// - over the roofs and along the nave's ridge to the tower;
// - up onto the ledge round the tower (jump at it from the ridge), along it and over the gap in
//   it, a running jump 27 m up;
// - and up the steeplejack's ladder on the tower's north face to the battlements. Every so often
//   the Abbey's bells ring (a single toll first, as a warning): while they ring, anyone moving on
//   the steeplejack's ladder is shaken off it, and anyone stood up on the ledge is shaken about,
//   so stop, and crouch on the ledge, till they've done.
// Fall and you land on whatever's below: a moulding, the roof, or the churchyard to start again.
//
// Who decides what: nothing is sent. Where it all is comes from the map, and the angels and the
// bells go by the time of day, so everyone sees and hears the same; each player's knocks and
// shakes are their own.
import * as THREE from "three";
import * as SFX from "./audio";
import { abbeyClimb, type AbbeyClimb } from "./abbeyclimb";
import { CLIMB } from "./landmarks/abbey";
import { figure } from "./landmarks/kit";
import type { JobSpot } from "./minimap";
import type { Rungs } from "./player";
import { type QuestWorld, esc, registerFree } from "./quests";

const COLOUR = "#f2cf5b";
const BUILD = 150;         // the angels are out when you're this close to the Abbey, and put away past BUILD + 100
const HEAR = 120;          // and the bells heard this close
const NEAR = 60;           // close enough to be climbing it
// the angels: each stretch of each ladder has one, which waits by the top of its stretch, comes
// down it head first till its head's at the bottom, then flies back up beside it
const SPEED = 2.4;         // metres a second, coming down
const REST = 2.5;          // seconds waiting at the top
const FLY = 2.5;           // seconds flying back up
const NEXT = 4;            // seconds after one stretch's angel is down that the next stretch's is
const TALL = 1.3;          // an angel, top to toe
// the bells
const PERIOD = 20;         // seconds from one ringing to the next
const TOLL = 13;           // the warning toll, seconds into the period
const PEAL = 15;           // and the ringing, to the end of the period
const STRIKE = 0.28;       // seconds between bells
const SHOVE = 0.8;         // seconds between shakes on the ledge
const T = CLIMB.tower, LEDGE = CLIMB.ledge;

/** Seconds by the clock everyone shares: what the angels and the bells go by. */
export const abbeyTick = () => Date.now() / 1000;

interface Angel { L: Rungs; s: number; k: number; offset: number; down: number; obj: THREE.Group; fig: THREE.Mesh }

class Climb {
  private flash: HTMLDivElement;
  private flashT = 0;
  private angels: Angel[] = [];
  private group = new THREE.Group();
  private mat = new THREE.MeshLambertMaterial({ color: "#f3e9c8", emissive: "#a8853a", emissiveIntensity: 0.45 });
  private geo = figure(true, TALL / 2.15);
  private struck = -1;                      // the last bell rung (its number), and the last toll
  private tolled = -1;
  private lastY = 0;
  private shoveT = 0;
  private warned = 0;                       // when we last said why you fell, ms since 1970
  private told = false;                     // said what the climb is, at the foot of it

  constructor(readonly ab: AbbeyClimb, private w: QuestWorld) {
    this.flash = document.createElement("div");
    this.flash.style.cssText = "position:fixed;left:50%;top:calc(50% + 48px);width:340px;margin-left:-170px;pointer-events:none;z-index:5;text-align:center;font:800 20px 'Barlow Condensed',Impact,sans-serif;text-shadow:0 1px 3px #000";
    this.flash.hidden = true;
    (document.getElementById("hud") ?? document.body).appendChild(this.flash);
    // the angels, one to each stretch of each turret's ladder
    w.scene.add(this.group);
    ab.angels.forEach((ladder, s) => ladder.forEach((L, k) => {
      const obj = new THREE.Group(), fig = new THREE.Mesh(this.geo, this.mat);
      fig.castShadow = true;
      obj.add(fig);
      this.group.add(obj);
      // (from the Abbey's own heights, not the churchyard's ground as it loads, so it's the same for everyone)
      const tops = CLIMB.angels.tops, down = (tops[k] - (k ? tops[k - 1] : 0)) / SPEED, cycle = REST + down + FLY;
      this.angels.push({ L, s, k, offset: s * cycle / 2 - k * NEXT, down, obj, fig });
    }));
  }

  update(dt: number) {
    const me = this.w.me(), d = Math.hypot(me.x - this.ab.mid[0], me.z - this.ab.mid[1]);
    if (!this.told && me.alive && d < 30) {
      this.told = true;
      const [, ly] = this.ab.frame.local(me.x, me.y, me.z);
      if (ly < 3) this.w.toast("Climb the Abbey: up the ladder of angels (mind the angels coming down), and there's something at the top of the tower", 5);
    }
    this.drawAngels();
    this.bells(dt, me, d);
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.flash.hidden = true;
  }

  private show(html: string, secs: number) { this.flash.innerHTML = html; this.flash.hidden = false; this.flashT = secs; }

  // ---- the angels -------------------------------------------------------------------------------

  /** Where each angel is: waiting by the top of its stretch, coming down it, or flying back up
   *  beside it; and whether it's met you on the ladder. */
  private drawAngels() {
    const now = abbeyTick(), me = this.w.me(), on = this.w.onLadder?.() ?? null;
    for (const a of this.angels) {
      const { L } = a, cycle = REST + a.down + FLY;
      const u = (((now + a.offset) % cycle) + cycle) % cycle;
      // beside the ladder (side), or on it, a little nearer the wall than a climber
      const sx = -L.nz, sz = L.nx, side = (a.s ? 1 : -1) * 0.95;
      let y: number, coming = false, by = 0;
      if (u < REST) { y = L.y1 + Math.sin(now * 2 + a.k) * 0.08; by = side; }
      else if (u < REST + a.down) { y = L.y1 + TALL - (u - REST) * SPEED; coming = true; }
      else { y = L.y0 + ((u - REST - a.down) / FLY) * (L.y1 - L.y0); by = side; }
      a.obj.position.set(L.x - L.nx * 0.35 + sx * by, y, L.z - L.nz * 0.35 + sz * by);
      a.obj.rotation.y = Math.atan2(-L.nx, -L.nz);
      // coming down head first, like the carved ones; otherwise upright
      a.fig.rotation.z = coming ? Math.PI : 0;
      // met you on its stretch of the ladder: off you come
      if (coming && on === L && y - TALL < me.y + 1.7 && y > me.y + 0.1) {
        this.w.knock?.(-L.nx * 0.4, 1.5, -L.nz * 0.4);
        SFX.clunk();
        this.why("An angel came down on you! Wait on a moulding for it to pass");
      }
    }
  }

  // ---- the bells --------------------------------------------------------------------------------

  /** The bells: a toll, then a peal; and the tower shaking anyone on its ledge or its ladder. */
  private bells(dt: number, me: { x: number; y: number; z: number; alive: boolean }, dist: number) {
    const now = abbeyTick(), f = this.ab.frame;
    const n = Math.floor(now / PERIOD), u = now - n * PERIOD;
    const tower = f.at((T.x0 + T.x1) / 2, 34, 0), [d, pan] = this.w.hear?.(tower.x, tower.y, tower.z) ?? [0, 0];
    const hear = dist < HEAR, [, ly0] = f.local(me.x, me.y, me.z);
    if (u >= TOLL && this.tolled < n) {
      this.tolled = n;
      if (hear) SFX.abbeyBell(9, d, pan);
      if (dist < NEAR && ly0 > 15) this.show(`<span style="color:${COLOUR}">The bells are about to ring: hold on!</span>`, 2);
    }
    const ringing = u >= PEAL;
    if (ringing) {
      const k = n * 100 + Math.floor((u - PEAL) / STRIKE);
      if (k > this.struck) { this.struck = k; if (hear) SFX.abbeyBell(k % 10, d, pan); }
    }
    const on = this.w.onLadder?.() ?? null;
    if (ringing && me.alive) {
      const [lx, ly, lz] = f.local(me.x, me.y, me.z);
      if (on === this.ab.jack && Math.abs(me.y - this.lastY) > 0.005) {
        // moving on the steeplejack's ladder while it shakes
        this.w.knock?.(-on.nx * 0.5, 1, -on.nz * 0.5);
        this.why("The bells shook you off: keep still on the ladder while they ring");
      } else if (!on && Math.abs(ly - LEDGE) < 0.15 && lx > T.x0 - 1 && lx < T.x1 + 1 && Math.abs(lz) < T.z + 1
        && (lx < T.x0 || lx > T.x1 || Math.abs(lz) > T.z) && !this.w.crouched?.() && (this.shoveT -= dt) <= 0) {
        // stood up on the ledge: shaken about, out from the tower
        this.shoveT = SHOVE;
        const ox = lx < T.x0 ? -1 : lx > T.x1 ? 1 : 0, oz = lz < -T.z ? -1 : lz > T.z ? 1 : 0, r = Math.random() - 0.5;
        const vx = (ox + oz * r * 2) * 1.6, vz = (oz + ox * r * 2) * 1.6;
        this.w.knock?.(f.ax[0] * vx + f.az[0] * vz, 2, f.ax[1] * vx + f.az[1] * vz);
        this.why("The tower's shaking! Crouch (C) on the ledge to hold on");
      }
    } else this.shoveT = 0;
    this.lastY = me.y;
  }

  private why(text: string) {
    if (Date.now() - this.warned < 2500) return;
    this.warned = Date.now();
    this.show(`<span style="color:#ffb35a">${esc(text)}</span>`, 2.5);
  }

  dispose() {
    this.w.scene.remove(this.group);
    this.geo.dispose();
    this.mat.dispose();
    this.flash.remove();
  }
}

let climb: Climb | null = null;
/** The climb round the Abbey, while you're near it (for the probe, tools/climb_probe.mjs). */
export const abbeyClimbing = () => climb;

registerFree({
  update(dt, w) {
    if (dt <= 0) return;
    const ab = abbeyClimb(w.map);
    if (!ab) return;
    const me = w.me(), d = Math.hypot(me.x - ab.mid[0], me.z - ab.mid[1]);
    if (!climb && d < BUILD) climb = new Climb(ab, w);
    else if (climb && d > BUILD + 100) { climb.dispose(); climb = null; }
    climb?.update(dt);
  },
  spots(w): JobSpot[] {
    const ab = abbeyClimb(w.map);
    if (!ab) return [];
    const at = ab.frame.at(CLIMB.angels.x - 3, 0, 0);
    return [{ x: at.x, z: at.z, colour: COLOUR, glyph: "A", label: "Climb Bath Abbey" }];
  },
  dispose() { climb?.dispose(); climb = null; },
});
