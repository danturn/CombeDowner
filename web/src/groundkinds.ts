// The minimap's ground for the whole of Bath at full detail: what each 4 m patch of ground is
// (grass, wood, field, garden, paving...), square by square, from public/maps/<id>-ground.json
// (tools/ground_kinds.py). The whole-city map's own ground is 12 m to the patch, which looks blocky;
// this is drawn over it wherever there's a square, before any square has loaded. Nothing about it
// goes over the network: every player loads the same file.
import { fetchPacked, packedName } from "./pack";

/** The minimap's colour for each kind of ground, by its character in the maps' ground grids ('0' up;
 *  the wild ground's rock, heath, sand and wetland after the town's, tools/wild.py), kept plain: gardens,
 *  paving, flowerbeds and playgrounds are all just land, and the open green ground two shades of green.
 *  Garden grass, pitches, woods, fields, cemeteries, paving, flowerbeds, playgrounds, rock, heath, sand, wetland. */
const LAND = "#3b4148", GREEN = "#40603d", WOOD = "#34502f";
export const GROUND = [LAND, GREEN, WOOD, GREEN, GREEN, LAND, LAND, LAND,
  "#4f5357", GREEN, "#857a5c", GREEN];
const RGB = GROUND.map((c) => parseInt(c.slice(1), 16));

export class GroundKinds {
  private x0: number; private y0: number; private dx: number; private n: number;
  /** Each square's patches, one digit each, row by row from the south, keyed by ti * 4096 + tj. */
  private sq = new Map<number, string>();

  constructor(d: { x0: number; y0: number; dx: number; cells: number; sq: Record<string, string> }) {
    this.x0 = d.x0; this.y0 = d.y0; this.dx = d.dx; this.n = d.cells;
    for (const [key, s] of Object.entries(d.sq)) {
      const [ti, tj] = key.split("_").map(Number);
      if (s.length === this.n * this.n) this.sq.set(ti * 4096 + tj, s);
    }
  }

  /**
   * Paint the ground onto g, size px square, from (x0, y1) at its top left (data coords), mpp
   * metres to the pixel: one sample per patch, or per pixel when zoomed out further than that, and
   * nothing where there's no square (the whole-city map's own ground shows through there).
   */
  paint(g: CanvasRenderingContext2D, x0: number, y1: number, mpp: number, size: number) {
    const step = Math.max(this.dx, mpp), m = Math.ceil((size * mpp) / step);
    if (m < 1) return;
    const c = document.createElement("canvas");
    c.width = c.height = m;
    const cg = c.getContext("2d")!, img = cg.createImageData(m, m), D = img.data, n = this.n, cell = n * this.dx;
    let any = false;
    for (let b = 0; b < m; b++) {
      const y = y1 - (b + 0.5) * step, fj = (y - this.y0) / this.dx, tj = Math.floor(fj / n), j = Math.floor(fj) - tj * n;
      let lastT = NaN, s: string | undefined;
      for (let a = 0; a < m; a++) {
        const x = x0 + (a + 0.5) * step, ti = Math.floor((x - this.x0) / cell);
        if (ti !== lastT) { lastT = ti; s = this.sq.get(ti * 4096 + tj); }
        if (!s) continue;
        const i = Math.floor((x - this.x0) / this.dx) - ti * n;
        const col = RGB[s.charCodeAt(j * n + i) - 48] ?? RGB[0], o = (b * m + a) * 4;
        D[o] = col >> 16; D[o + 1] = (col >> 8) & 255; D[o + 2] = col & 255; D[o + 3] = 255;
        any = true;
      }
    }
    if (!any) return;
    cg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(c, 0, 0, (m * step) / mpp, (m * step) / mpp);
  }
}

export async function loadGroundKinds(url: string): Promise<GroundKinds | null> {
  // a map without squares has no file (some servers send a page instead)
  const data = await fetchPacked(packedName(url)).catch(() => null);
  return data?.sq ? new GroundKinds(data) : null;
}

/** The wild ground's kinds (tools/wild.py), and which channel of the wild ground's detail each takes
 *  (textures.ts wildDetail): rock, heath and scrub, sand. */
export const ROCK = 8, HEATH = 9, SAND = 10, WETLAND = 11;
export const WILD_CHANNEL: Record<number, number> = { [ROCK]: 0, [HEATH]: 1, [SAND]: 2 };
