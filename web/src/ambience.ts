// The sound of where you are, under everything else (audio.ts's ambience): the town's far-off
// traffic in the streets, birds in the woods and gardens, the wind out in the open and up high,
// and owls by night. Every half second it looks round you at the map, anywhere in Bath: how much
// of the ground round about is built on, how many trees there are close by, and how high you are
// off the ground. Each player hears their own; nothing goes over the network.
import * as SFX from "./audio";
import type { GameMap } from "./map";
import { sky } from "./daylight";

/** Rings round you that are looked at for buildings (metres), and how many points on each. */
const RINGS = [15, 40, 90], SPOKES = 8;
/** Trees within this many metres make it a wood. */
const WOOD = 35;

const clamp = (v: number) => Math.max(0, Math.min(1, v));

export class Ambience {
  private sound: ReturnType<typeof SFX.ambience> = null;
  private lookT = 0;
  private want = { town: 0, woods: 0, open: 0 };
  private now = { town: 0, woods: 0, open: 0 };
  /** Set once a bad value has been reported, so the log says it once. (Hunt: remove with the cause.) */
  private flaggedBad = false;

  constructor(private map: GameMap) {}

  /** Every frame, from where you're standing (scene coords). shut: indoors, in a tunnel or in a vehicle. */
  update(dt: number, x: number, y: number, z: number, shut: boolean) {
    if (!this.sound && !(this.sound = SFX.ambience())) return;
    // Hunting the non-finite value that reaches the wind's setTargetAtTime and throws (which used
    // to freeze the game). This says which value went bad and from what, once, rather than
    // swallowing it: it is here to find the cause, not to paper over it.
    if ((globalThis as any).__ambHunt && !this.flaggedBad) {
      const bad: string[] = [];
      const chk = (n: string, v: number) => { if (!Number.isFinite(v)) bad.push(`${n}=${v}`); };
      chk("dt", dt); chk("x", x); chk("y", y); chk("z", z);
      chk("now.town", this.now.town); chk("now.woods", this.now.woods); chk("now.open", this.now.open);
      if (bad.length) {
        this.flaggedBad = true;
        const line = `ambience: not finite — ${bad.join(", ")} (shut ${shut})`;
        console.error(`Bad ambience state: ${line}`, { dt, x, y, z, want: { ...this.want }, now: { ...this.now } });
        const L = ((globalThis as any).__badAmbience ??= []);
        L.push(line);
      }
    }
    if ((this.lookT -= dt) <= 0) { this.lookT = 0.5; this.look(x, y, z); }
    // walking out of town into the woods, one fades into the other over a few seconds
    const k = Math.min(1, dt * 0.5), N = this.now, W = this.want;
    N.town += (W.town - N.town) * k; N.woods += (W.woods - N.woods) * k; N.open += (W.open - N.open) * k;
    this.sound.set({ ...N, night: sky().night, shut });
  }

  private look(x: number, y: number, z: number) {
    const M = this.map;
    let built = 0;
    for (const r of RINGS) for (let i = 0; i < SPOKES; i++) {
      const a = ((i + r * 0.37) / SPOKES) * Math.PI * 2;
      if (M.indoors(x + r * Math.cos(a), z + r * Math.sin(a))) built++;
    }
    const b = built / (RINGS.length * SPOKES);
    let trees = 0;
    const px = x, py = -z;
    for (const t of [M, ...M.tilesNear(x, z, WOOD)]) for (const p of t.d.tr) {
      const dx = p[0] - px, dy = p[1] - py;
      if (dx * dx + dy * dy < WOOD * WOOD) trees++;
    }
    // up on a roof, a tower or the top of a hill it's windier
    const high = clamp((y - M.ground(x, z)) / 25);
    this.want.town = clamp((b - 0.05) / 0.3);
    this.want.woods = clamp((trees - 6) / 40);
    this.want.open = clamp(clamp(1 - b * 4 - this.want.woods * 0.9) + high);
  }

  stop() { this.sound?.stop(); this.sound = null; }
}
