// The cover over the view as you arrive somewhere new: starting a game, coming back to life, any
// jump across the map (Go to, a pub, a ?at= link) and stepping off the train in another town. The
// squares of the map where you land take a second or two to load and build (tiles.ts), and without
// it you'd stand and watch the streets go up round you. It stays up until the squares close by are
// built, and for a moment at least so it doesn't flicker; a jump to somewhere already built has no
// cover at all. It never stays longer than MAX, so a slow phone isn't stuck behind it: the map then
// comes in as it always did, and loadnote.ts says if it's stuck. While it's up the squares are built
// in bigger slices a frame, since nobody can see the frame rate.
//
// It's your own screen's business. While it's up you're held still and can't shoot (game.ts), and
// you count as sheltered: game.ts says so with the "rw" in your position updates, the flag a race's
// finishers already send, so the host lets nothing hurt you, on older pages too.
import type { World } from "./world";
import { Calm } from "./tiles";

const JUMP = 60;      // metres moved in one frame that can only be a jump
const NEAR = 250;     // squares this close are waited for; further ones come in behind, in the haze
const MIN = 0.6;      // seconds up at the least
const MAX = 9;        // and at the most
const FADE = 0.35;    // seconds to lift (style.css's #arrive)

export type ArrivalKind = "start" | "travel" | "respawn" | "jump";

/** What the cover says over the place's name, in the voice of the death screen's parking ticket. */
const BACK = ["Fine paid. Back on the streets", "Appeal upheld: one more life", "Back on your feet",
  "Released on a residents' permit", "Patched up and sent back out", "Penalty settled in full"];

export class Arrival {
  private t = -1;              // seconds the cover has been up; below nought when it's down
  private lift = 0;            // seconds left of its fade
  private from: { x: number; z: number } | null = null;
  private kind: ArrivalKind | null = "start";
  private calm = new Calm(6, 150);
  private el = document.getElementById("arrive")!;

  constructor(private world: World, private words: (kind: ArrivalKind, x: number, z: number) => { why: string; where: string }) {}

  /** The cover's up: hold the player still and let nothing hurt them. */
  get up() { return this.t >= 0; }

  /** The next jump is this sort of arrival (a respawn, a train), for what the cover says. */
  next(kind: ArrivalKind) { this.kind = kind; }

  /** Once a frame, last thing, with where you are now (scene x, z). */
  update(dt: number, x: number, z: number) {
    const jumped = !this.from || Math.hypot(x - this.from.x, z - this.from.z) > JUMP;
    this.from = { x, z };
    if (jumped) {
      this.world.look();
      if (this.world.unbuilt(x, z, NEAR) > 0) this.show(this.kind ?? "jump", x, z);
    }
    this.kind = null;
    if (this.lift > 0 && (this.lift -= dt) <= 0) this.el.hidden = true;
    if (this.t < 0) return;
    this.t += dt;
    const ready = this.calm.still(this.world.unbuilt(x, z, NEAR));
    if ((ready && this.t >= MIN) || this.t >= MAX) this.down();
  }

  private show(kind: ArrivalKind, x: number, z: number) {
    const { why, where } = this.words(kind, x, z);
    this.el.querySelector(".why")!.textContent = kind === "respawn" ? BACK[Math.floor(Math.random() * BACK.length)] : why;
    this.el.querySelector(".where")!.textContent = where;
    this.el.classList.remove("lifting");
    this.el.hidden = false;
    this.t = 0;
    this.lift = 0;
    this.calm.reset();
    this.world.rush = true;
  }

  private down() {
    this.t = -1;
    this.lift = FADE;
    this.el.classList.add("lifting");
    this.world.rush = false;
  }

  /** The game's over (or off to another town, where the next game puts up its own). */
  dispose() {
    this.t = -1;
    this.lift = 0;
    this.world.rush = false;
    this.el.hidden = true;
  }
}
