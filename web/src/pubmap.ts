// The pubs on the big map: a pint on every pub, faint till you zoom in so they don't crowd out the
// jobs and the markers. Point at one for its name, how far it is and its food hygiene rating; pick
// one and a card opens beside it with Go there and Mark it. Picking a crowd of pubs (the middle of
// Bath, zoomed out) zooms in on them instead. "Go to a pub" in the pause menu opens the same map
// with the pints at full strength.
//
// Going there can be held up: the card says what's stopping you instead of offering to go (something
// hostile after you, a shoot-out, being hurt), or, where it's yours to walk away from (a race on your
// own, a challenge on your own, a pub takeover), asks whether to leave it. Game.travelHold decides.
//
// Nothing here goes over the network: going to a pub just moves you (Game.goTo), and everyone else
// sees you turn up there in your next position update; marking it is the usual map marker.
import { ctl, input } from "./controls";
import type { Minimap } from "./minimap";

const $ = (id: string) => document.getElementById(id)!;
const CROWD_PX = 16;        // CSS pixels from a pint that still count as picking it
const CROWD_ZOOM = 3;       // how far picking a crowd of pubs zooms in
const REFRESH = 0.5;        // seconds between working out how far each pub is, and whether you can go

export interface PubSpot { i: number; name: string; rating: number | null; x: number; z: number; far: number }
/** Why you can't go just now. leave: it's yours to walk away from, and this is how. */
export interface TravelHold { why: string; leave?: { yes: string; go(): void } }

export interface PubHost {
  pubs(): PubSpot[];
  hold(): TravelHold | null;
  /** Go there; returns why not, if you can't after all. */
  goTo(i: number): string | null;
  mark(p: PubSpot): void;
}

const far = (m: number) => (m < 20 ? "you're here" : m < 1000 ? `${Math.round(m / 10) * 10} m away` : `${(m / 1000).toFixed(1)} km away`);
const hygiene = (r: number | null) => (r === null ? "" : `food hygiene ${r} out of 5`);

export class PubMap {
  private pubs: PubSpot[] = [];
  private picked = -1;
  private hold: TravelHold | null = null;
  private note = "";        // why going failed after all, till the card's closed
  private refreshT = 0;
  private shown = "";

  constructor(private host: PubHost, private mm: Minimap) {
    // set rather than added: a train ride builds a new game on the same page, and the old one mustn't answer
    $("pubcardgo").onclick = () => this.go();
    $("pubcardmark").onclick = () => this.markIt();
    $("pubcardx").onclick = () => this.close();
    // the card sits over the map: a tap on it mustn't reach the map, nor the dark round it (which closes the map)
    const card = $("pubcard"), stop = (e: Event) => e.stopPropagation();
    card.onpointerdown = card.onpointerup = card.onwheel = stop;
    card.hidden = true;
  }

  get isOpen() { return this.picked >= 0; }

  /** The pints, afresh. */
  refresh() {
    this.pubs = this.host.pubs();
    this.mm.pins = this.pubs.map((p, k) => ({
      x: p.x, z: p.z, on: k === this.picked, label: p.name,
      tip: [p.name, far(p.far), hygiene(p.rating)].filter(Boolean).join(" · "),
    }));
    this.refreshT = REFRESH;
  }

  /** Every frame the big map's up. */
  frame(dt: number) {
    if ((this.refreshT -= dt) <= 0) {
      const name = this.pubs[this.picked]?.name;
      this.refresh();
      if (name !== undefined && this.pubs[this.picked]?.name !== name) this.close();
      if (this.isOpen) { this.hold = this.host.hold(); this.say(); }
    }
    if (this.isOpen) this.place();
  }

  /** A pick on a pub's pint at scene (x, z), a fraction (u, v) across and down the map: its card,
   *  or with others crowded round it, zoom in on them. */
  pick(x: number, z: number, u: number, v: number) {
    const crowd = this.mm.pinsAt(u, v, CROWD_PX);
    if (crowd.length > 1 && !this.mm.fullZoomedIn) { this.close(); this.mm.zoomFull(CROWD_ZOOM, u, v); return; }
    let k = crowd[0] ?? -1, best = 6;
    if (k < 0) this.pubs.forEach((p, j) => { const d = Math.hypot(p.x - x, p.z - z); if (d < best) { best = d; k = j; } });
    if (k >= 0) this.open(k);
  }

  private open(k: number) {
    if (this.mm.pins[this.picked]) this.mm.pins[this.picked].on = false;
    this.picked = k;
    if (this.mm.pins[k]) this.mm.pins[k].on = true;
    this.note = "";
    this.hold = this.host.hold();
    this.shown = "";
    $("pubcard").hidden = false;
    this.say();
    this.place();
  }

  close() {
    if (this.mm.pins[this.picked]) this.mm.pins[this.picked].on = false;
    this.picked = -1;
    $("pubcard").hidden = true;
  }

  /** Go there (or leave what's holding you, and go), if nothing's stopping you. True if you went. */
  go(): boolean {
    const p = this.pubs[this.picked];
    if (!p) return false;
    this.hold = this.host.hold();
    if (this.hold && !this.hold.leave) { this.say(); return false; }
    this.hold?.leave?.go();
    const why = this.host.goTo(p.i);
    if (why) { this.note = why; this.say(); return false; }
    this.close();
    return true;
  }

  markIt() {
    const p = this.pubs[this.picked];
    if (!p) return;
    this.host.mark(p);
    this.close();
  }

  private say() {
    const p = this.pubs[this.picked];
    if (!p) return;
    const as = input(), named = as !== "touch", h = this.hold;
    const why = this.note || h?.why || "";
    const goes = !this.note && (!h || !!h.leave);
    const goWord = h?.leave?.yes ?? "Go there";
    const key = `${p.i}|${far(p.far)}|${why}|${goes}|${goWord}|${as}`;
    if (key === this.shown) return;
    this.shown = key;
    $("pubcardname").textContent = p.name;
    $("pubcardinfo").textContent = [far(p.far), hygiene(p.rating)].filter(Boolean).join(" · ");
    $("pubcardwhy").textContent = why;
    $("pubcardwhy").hidden = !why;
    $("pubcardgo").hidden = !goes;
    $("pubcardgo").textContent = named ? `${goWord} (${ctl("pubcard.go")})` : goWord;
    $("pubcardmark").textContent = named ? `Mark it (${ctl("pubcard.mark")})` : "Mark it";
    $("pubcardx").textContent = named ? `Back (${ctl("pubcard.back")})` : "Back";
    $("pubcard").classList.toggle("held", !!why);
  }

  /** Beside its pint, kept on the map. */
  private place() {
    const p = this.pubs[this.picked], at = p && this.mm.toFull(p.x, p.z);
    const c = $("bigmapcanvas").getBoundingClientRect(), w = $("bigmapwrap").getBoundingClientRect(), card = $("pubcard");
    if (!at || !c.width) return;
    const cw = card.offsetWidth, ch = card.offsetHeight, left = c.left - w.left, top = c.top - w.top;
    const px = left + at[0] * c.width, py = top + at[1] * c.height;
    // to the right of the pint if there's room, else to its left
    let x = px + 18;
    if (x + cw > left + c.width - 6) x = px - 18 - cw;
    x = Math.max(left + 6, Math.min(left + c.width - cw - 6, x));
    const y = Math.max(top + 6, Math.min(top + c.height - ch - 6, py - ch / 2));
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
  }
}
