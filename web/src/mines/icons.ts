// Inventory icons, Ultima Underworld style: little pixel pictures, hand-drawn in code on a 32×32
// grid and given a dark outline, then shown scaled up with crisp pixels (image-rendering: pixelated).
// Anything without its own drawing (a relic added to RELICS later) gets a leather pouch, tinted from
// a hash of its id so different unknown things still look different.

const N = 32;
type Col = string | null;

/** A 32×32 grid of colours, with a few ways to fill it in that never blur. */
class Grid {
  d: Col[] = new Array(N * N).fill(null);
  set(x: number, y: number, c: Col) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < N && y < N) this.d[y * N + x] = c;
  }
  get(x: number, y: number): Col { return x >= 0 && y >= 0 && x < N && y < N ? this.d[y * N + x] : null; }
  rect(x0: number, y0: number, x1: number, y1: number, c: Col) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Col) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / (rx + 0.4), dy = (y - cy) / (ry + 0.4);
      if (dx * dx + dy * dy <= 1) this.set(x, y, c);
    }
  }
  disc(cx: number, cy: number, r: number, c: Col) { this.ellipse(cx, cy, r, r, c); }
  /** A line with a square brush w pixels across. */
  line(x0: number, y0: number, x1: number, y1: number, c: Col, w = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const h = Math.floor((w - 1) / 2);
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
      for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) this.set(x - h + a, y - h + b, c);
    }
  }
  /** A path of lines through the points. */
  path(pts: number[][], c: Col, w = 1) { for (let k = 0; k < pts.length - 1; k++) this.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], c, w); }
  /** A filled polygon: every pixel whose centre is inside. */
  poly(pts: number[][], c: Col) {
    const ys = pts.map((p) => p[1]), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) for (let x = 0; x < N; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) this.set(x, y, c);
    }
  }
  /** Recolour pixels already drawn, inside a box, where the test passes (for shading and patterns). */
  tint(x0: number, y0: number, x1: number, y1: number, c: Col, test: (x: number, y: number) => boolean = () => true) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.get(x, y) && test(x, y)) this.set(x, y, c);
  }
  /** A dark edge round everything, which is what makes it read as a sprite. */
  outline(c = "#160e07") {
    const add: number[] = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * N + x);
    }
    for (const k of add) this.d[k] = c;
  }
}

// ---- the drawings -----------------------------------------------------------------------------------

const BRASS = "#c9a040", BRASS_LT = "#f0d27a", BRASS_DK = "#86641f";
const IRON = "#6f6c68", IRON_LT = "#b4b0a8", IRON_DK = "#403d3a";
const WOOD = "#8a5a2c", WOOD_LT = "#b88148", WOOD_DK = "#5a3818";

const DRAW: Record<string, (g: Grid) => void> = {
  davy(g) {
    // hook and ring
    g.path([[14, 1], [17, 1]], BRASS_DK); g.set(13, 2, BRASS_DK); g.set(18, 2, BRASS_DK); g.path([[13, 3], [18, 3]], BRASS_DK);
    g.rect(15, 4, 16, 5, BRASS);
    // bonnet
    g.rect(11, 6, 20, 8, BRASS); g.rect(11, 6, 20, 6, BRASS_LT); g.rect(10, 9, 21, 9, BRASS_DK);
    // gauze: a fine mesh
    g.rect(12, 10, 19, 18, "#8d8f8c");
    g.tint(12, 10, 19, 18, "#595b58", (x, y) => (x + y) % 2 === 0);
    g.tint(12, 10, 12, 18, "#b9bbb6");
    // glass with the flame inside
    g.rect(11, 19, 20, 24, "#f6e9b8"); g.rect(11, 19, 20, 19, BRASS_DK);
    g.rect(12, 20, 12, 24, "#fffbe6");
    g.ellipse(15.5, 22, 1.6, 2.4, "#ff9a1e"); g.rect(15, 22, 16, 23, "#fff3a0"); g.set(15, 19, "#ffcf4a");
    // pillars
    for (const x of [10, 21]) g.rect(x, 10, x, 24, BRASS);
    g.rect(10, 10, 10, 24, BRASS_LT);
    // base
    g.rect(9, 25, 22, 28, BRASS); g.rect(9, 25, 22, 25, BRASS_LT); g.rect(9, 27, 22, 27, BRASS_DK); g.rect(10, 29, 21, 29, BRASS_DK);
  },
  hobnails(g) {
    const L = "#7a4a26", LT = "#a46a3a", DK = "#4a2a12";
    // the shaft
    g.poly([[9, 4], [18, 4], [19, 18], [9, 19]], L);
    g.rect(9, 4, 18, 5, LT); g.rect(9, 4, 10, 18, LT);
    // laces crossing up the front
    for (let y = 7; y <= 16; y += 3) { g.line(15, y, 18, y + 2, "#e2d2a6"); g.line(18, y, 15, y + 2, "#c6b58a"); }
    // the foot and toe cap
    g.poly([[9, 18], [20, 17], [25, 19], [28, 22], [28, 25], [9, 25]], L);
    g.ellipse(25, 22, 3, 2.5, LT); g.ellipse(25.5, 22.5, 2, 1.5, L);
    g.rect(9, 23, 28, 24, DK);
    // sole, heel, and the nails
    g.rect(8, 25, 29, 27, "#2c1a0c"); g.rect(8, 27, 14, 28, "#2c1a0c");
    for (let x = 9; x <= 28; x += 3) g.set(x, 27, "#d8d8d0");
    for (let x = 9; x <= 13; x += 2) g.set(x, 28, "#d8d8d0");
  },
  lardy(g) {
    const TOP = "#e3a84e", MID = "#c98432", SIDE = "#9a5c20", GLAZE = "#fff0c8";
    g.poly([[4, 13], [9, 9], [24, 9], [28, 13], [28, 24], [24, 27], [8, 27], [4, 24]], SIDE);
    g.poly([[4, 13], [9, 9], [24, 9], [28, 13], [28, 17], [24, 20], [8, 20], [4, 17]], MID);
    g.poly([[6, 13], [10, 10], [23, 10], [26, 13], [26, 16], [23, 18], [9, 18], [6, 16]], TOP);
    // scored into squares
    g.line(11, 10, 11, 18, MID); g.line(16, 10, 16, 18, MID); g.line(21, 10, 21, 18, MID); g.line(6, 14, 26, 14, MID);
    // sticky sugar shine
    for (const [x, y] of [[8, 12], [13, 11], [18, 12], [23, 12], [9, 16], [19, 16], [14, 15], [24, 15]]) g.set(x, y, GLAZE);
    g.rect(12, 11, 14, 11, GLAZE);
    // currants
    for (const [x, y] of [[7, 22], [12, 24], [17, 22], [22, 24], [25, 21], [10, 21], [20, 21], [14, 25]]) { g.set(x, y, "#3a160c"); g.set(x + 1, y, "#5a2414"); }
    g.rect(5, 18, 5, 23, "#b87634");
  },
  oliver(g) {
    const RED = "#a8262a", RED_LT = "#d24a3e", RED_DK = "#6e1418", GOLD = "#e3c060";
    // the tin's side
    g.rect(6, 12, 25, 25, RED);
    g.ellipse(15.5, 25, 9.5, 3.5, RED_DK);
    g.rect(6, 12, 25, 25, RED);
    g.rect(6, 12, 8, 25, RED_LT);
    g.rect(6, 18, 25, 19, GOLD);
    // the lid, seen from above
    g.ellipse(15.5, 11, 10, 4, GOLD);
    g.ellipse(15.5, 11, 8.5, 3, "#c43a32");
    g.ellipse(15.5, 11, 4, 1.5, "#f1e6c8");
    g.rect(13, 11, 18, 11, RED_DK);
    // a label roundel with "B.O." in it
    g.rect(11, 21, 20, 24, "#f1e6c8"); g.rect(12, 22, 19, 22, RED_DK); g.rect(12, 23, 16, 23, "#c8b890");
    // a biscuit leaning against it
    g.disc(25, 25, 4, "#e2c48a"); g.disc(25, 25, 3, "#d4b070");
    for (const [x, y] of [[24, 24], [26, 24], [25, 26]]) g.set(x, y, "#a8844a");
  },
  ammonite(g) {
    const SH = "#bfa678", SH_DK = "#7c6440", SH_LT = "#e6d4a8";
    g.disc(16, 16, 13, SH);
    g.tint(3, 3, 29, 29, SH_LT, (x, y) => x + y < 26);
    // the spiral and its ribs
    let px = 16, py = 16;
    for (let a = 0; a < Math.PI * 7.2; a += 0.05) {
      const r = 0.6 + a * 0.55, x = 16 + Math.cos(a) * r, y = 16 + Math.sin(a) * r;
      g.line(px, py, x, y, SH_DK);
      px = x; py = y;
    }
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
      const r0 = 7.5 + ((a * 0.55) / (Math.PI * 2)) * 3.4;
      g.line(16 + Math.cos(a) * r0, 16 + Math.sin(a) * r0, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, "#9c8458");
    }
    g.set(16, 16, SH_DK);
  },
  sledge(g) {
    // haft, bottom left to top right
    g.line(5, 28, 20, 13, WOOD_DK, 3);
    g.line(5, 27, 19, 13, WOOD, 2);
    g.line(5, 26, 18, 13, WOOD_LT, 1);
    g.line(4, 29, 7, 26, "#3a2410", 3);
    // a big square iron head across the end
    g.poly([[13, 9], [20, 2], [30, 12], [23, 19]], IRON);
    g.poly([[13, 9], [20, 2], [22, 4], [15, 11]], IRON_LT);
    g.poly([[21, 17], [28, 10], [30, 12], [23, 19]], IRON_DK);
    g.line(14, 10, 21, 3, "#d9d6cf");
  },
  saw(g) {
    const BL = "#b9b6ae", BL_DK = "#7e7b74";
    // a long two-man blade
    g.rect(4, 11, 27, 18, BL);
    g.rect(4, 11, 27, 11, "#e2e0da");
    g.rect(4, 17, 27, 18, BL_DK);
    for (let x = 4; x <= 26; x += 3) { g.set(x, 19, BL_DK); g.set(x + 1, 19, BL_DK); g.set(x, 20, BL_DK); }
    // rivets
    for (const x of [6, 25]) { g.set(x, 14, IRON_DK); }
    // upright wooden handles at each end
    for (const x of [1, 28]) { g.rect(x, 6, x + 2, 23, WOOD); g.rect(x, 6, x, 23, WOOD_LT); g.rect(x, 22, x + 2, 23, WOOD_DK); }
  },
  pick(g) {
    // haft
    g.line(6, 29, 18, 9, WOOD_DK, 3);
    g.line(6, 28, 17, 9, WOOD, 2);
    g.line(6, 27, 16, 10, WOOD_LT, 1);
    // the head: two curved points
    const top: number[][] = [[2, 13], [6, 8], [11, 5], [17, 4], [23, 6], [28, 10], [30, 15]];
    g.path(top, IRON, 3);
    g.path(top.map(([x, y]) => [x, y - 1]), IRON_LT, 1);
    g.rect(15, 4, 20, 9, IRON);
    g.rect(15, 4, 20, 4, IRON_LT);
    g.set(2, 15, IRON_DK); g.set(30, 17, IRON_DK);
  },
  lucozade(g) {
    const OR = "#f07c12", OR_LT = "#ffb04a", OR_DK = "#b04a06";
    // the bottle in its crinkly orange cellophane
    g.rect(14, 3, 18, 5, "#c8c8c0"); g.rect(14, 3, 14, 5, "#ececec");
    g.rect(14, 6, 18, 10, OR);
    g.poly([[14, 10], [18, 10], [23, 15], [23, 29], [9, 29], [9, 15]], OR);
    g.rect(10, 15, 11, 28, OR_LT); g.rect(21, 15, 22, 28, OR_DK);
    g.rect(14, 6, 14, 10, OR_LT);
    // the crinkles
    for (const [x, y] of [[13, 17], [18, 19], [15, 25], [20, 26], [12, 22]]) { g.set(x, y, OR_LT); g.set(x + 1, y + 1, OR_DK); }
    // a yellow label band
    g.rect(9, 20, 23, 23, "#ffe14a"); g.rect(11, 21, 21, 22, "#3a6ac8");
    g.rect(13, 21, 13, 22, "#ffe14a"); g.rect(17, 21, 17, 22, "#ffe14a");
    g.rect(9, 29, 23, 29, OR_DK);
  },
  fizz(g) {
    const GL = "#2f7a3a", GL_LT = "#5aae5c", GL_DK = "#1a4a22";
    // gold foil top
    g.rect(14, 2, 18, 9, "#e3c060"); g.rect(14, 2, 14, 9, "#fff0a0"); g.rect(14, 9, 18, 9, "#a8842e");
    g.rect(14, 10, 18, 12, GL);
    g.poly([[14, 12], [18, 12], [23, 17], [23, 29], [9, 29], [9, 17]], GL);
    g.rect(10, 17, 11, 28, GL_LT); g.rect(21, 17, 22, 28, GL_DK);
    // the orange inside showing through, and the label
    g.rect(12, 26, 20, 28, "#d88a1c");
    g.rect(9, 19, 23, 24, "#f4ecd8"); g.rect(11, 21, 21, 22, "#f08a12");
    g.rect(9, 19, 23, 19, "#1a5aa8");
    // bubbles
    for (const [x, y] of [[24, 6], [26, 3], [8, 8], [6, 4], [25, 10]]) g.set(x, y, "#fff6c0");
  },
  bat(g) {
    const B = "#3a2a24", B_LT = "#6a5246", SIL = "#cfc8bb";
    // the string loop
    g.path([[13, 1], [16, 4], [19, 1]], SIL);
    g.set(16, 5, SIL);
    // a horseshoe bat, wings spread
    g.poly([[16, 8], [12, 9], [6, 7], [2, 11], [3, 17], [6, 15], [8, 18], [11, 16], [13, 20], [16, 23], [19, 20], [21, 16], [24, 18], [26, 15], [29, 17], [30, 11], [26, 7], [20, 9]], B);
    // finger bones in the wings
    g.path([[13, 11], [6, 8]], B_LT); g.path([[13, 12], [5, 13]], B_LT); g.path([[13, 13], [9, 17]], B_LT);
    g.path([[19, 11], [26, 8]], B_LT); g.path([[19, 12], [27, 13]], B_LT); g.path([[19, 13], [23, 17]], B_LT);
    // body and head, ears, the horseshoe nose
    g.ellipse(16, 14, 3, 5, "#57413a");
    g.disc(16, 9, 2.5, "#57413a");
    g.set(14, 6, B); g.set(18, 6, B); g.set(14, 7, B); g.set(18, 7, B);
    g.set(15, 9, "#ffd04a"); g.set(17, 9, "#ffd04a");
    g.path([[15, 11], [15, 12], [17, 12], [17, 11]], "#c99a8a");
  },
  blackdog(g) {
    const F = "#1e1c22", F_LT = "#3c3a46";
    // ears
    g.poly([[5, 3], [13, 9], [7, 15]], F);
    g.poly([[27, 3], [19, 9], [25, 15]], F);
    g.poly([[7, 6], [11, 9], [8, 12]], "#4a2a2a"); g.poly([[25, 6], [21, 9], [24, 12]], "#4a2a2a");
    // head and muzzle
    g.ellipse(16, 15, 9, 8, F);
    g.ellipse(16, 23, 5, 5, F);
    g.ellipse(16, 24, 3.5, 3.5, F_LT);
    g.rect(15, 21, 17, 22, "#000");
    g.tint(8, 8, 24, 13, F_LT, (x, y) => (x * 7 + y * 3) % 5 === 0);
    // the burning red eyes
    for (const x of [11, 19]) { g.rect(x, 14, x + 2, 15, "#ff2a1a"); g.set(x + 1, 14, "#ffd08a"); g.set(x - 1, 15, "#7a0a06"); g.set(x + 3, 15, "#7a0a06"); }
    // teeth
    g.set(14, 27, "#e8e0d0"); g.set(18, 27, "#e8e0d0");
  },
  mason(g) {
    const ST = "#d6be8a", ST_LT = "#efdcae", ST_DK = "#a48a5a", CUT = "#5a4426";
    // an ashlar block with its top showing
    g.poly([[3, 10], [9, 5], [29, 5], [29, 24], [23, 29], [3, 29]], ST);
    g.poly([[3, 10], [9, 5], [29, 5], [23, 10]], ST_LT);
    g.poly([[23, 10], [29, 5], [29, 24], [23, 29]], ST_DK);
    // tooling marks
    g.tint(4, 12, 22, 28, "#c8ae7a", (x, y) => (x + y * 2) % 6 === 0);
    // the mason's mark cut into the face: an arrow with a bar
    g.line(13, 13, 13, 26, CUT); g.line(8, 18, 13, 13, CUT); g.line(18, 18, 13, 13, CUT); g.line(9, 23, 17, 23, CUT);
    g.line(14, 14, 14, 26, ST_LT);
  },
  echo(g) {
    const S = "#7c8a96", S_LT = "#b2c0ca", S_DK = "#4c5862", W = "#7fe0ff";
    // a smooth river stone
    g.ellipse(13, 17, 8, 6.5, S);
    g.ellipse(11, 15, 4, 2.5, S_LT);
    g.tint(5, 20, 21, 24, S_DK, (x, y) => y > 19 + Math.abs(x - 13) * 0.25);
    // the sound coming off it
    for (const r of [4, 7, 10]) {
      for (let a = -0.9; a <= 0.9; a += 0.05) g.set(Math.round(19 + Math.cos(a) * r), Math.round(17 + Math.sin(a) * r), r === 10 ? "#3a9ec0" : W);
    }
  },
  tea(g) {
    const T = "#2f5a3a", T_RED = "#a8282a", CUP = "#c4c2bc";
    // a tartan flask
    g.rect(9, 10, 22, 29, T);
    for (let x = 9; x <= 22; x++) if (x % 5 === 1) g.rect(x, 10, x, 29, T_RED);
    for (let y = 10; y <= 29; y++) if (y % 5 === 2) g.rect(9, y, 22, y, T_RED);
    g.tint(9, 10, 22, 29, "#e8d070", (x, y) => x % 5 === 3 && y % 5 === 4);
    g.rect(9, 10, 10, 29, "#4a7a52");
    g.rect(9, 28, 22, 29, "#1a3420");
    // its cup for a lid, and the steam
    g.rect(8, 5, 23, 9, CUP); g.rect(8, 5, 23, 5, "#ecebe6"); g.rect(8, 9, 23, 9, "#8a8882");
    for (const x of [12, 18]) { g.set(x, 3, "#d8d8d8"); g.set(x + 1, 2, "#e8e8e8"); g.set(x + 1, 1, "#f4f4f4"); g.set(x, 0, "#ffffff"); }
  },
  bow(g) {
    // a longbow bent in a D, string straight, an arrow nocked and pointing up and left
    const pts: number[][] = [];
    for (let k = 0; k <= 20; k++) {
      const u = k / 20, x = 27 - u * 22, y = 3 + u * 26;
      const bulge = Math.sin(u * Math.PI) * 8;
      pts.push([x - bulge * 0.75, y - bulge * 0.66]);
    }
    g.line(27, 3, 5, 29, "#e8e0c8");
    // the arrow, across the bow through the grip
    g.line(21, 22, 6, 9, "#c9b283");
    g.poly([[4, 7], [9, 8], [6, 11]], IRON_LT);
    g.line(20, 23, 23, 20, "#b8372e"); g.line(19, 21, 21, 19, "#b8372e");
    g.path(pts, "#7a4a22", 3);
    g.path(pts.map(([x, y]) => [x - 1, y - 1]), "#b07a40", 1);
    g.rect(9, 13, 11, 15, "#3a2414");
  },
  fire(g) {
    // a hot-spring flame, in layers
    const shape = (cx: number, base: number, h: number, w: number, c: string) => {
      for (let y = 0; y < h; y++) {
        const u = y / h, half = w * Math.sin(Math.min(1, (1 - u) * 1.15) * Math.PI * 0.5) * Math.pow(u, 0.55);
        const lean = Math.sin(u * 4) * 1.2 * (1 - u);
        g.rect(Math.round(cx - half + lean), base - h + y, Math.round(cx + half + lean), base - h + y, c);
      }
    };
    shape(16, 30, 28, 11, "#c8261a");
    shape(16, 30, 22, 8, "#f06a1a");
    shape(16, 30, 15, 5.5, "#ffb83a");
    shape(16, 30, 8, 3, "#fff2b0");
    for (const [x, y] of [[6, 8], [26, 5], [24, 12], [7, 15]]) g.set(x, y, "#ffb83a");
  },
};

/** The fallback: a drawstring pouch, tinted from the id. */
function pouch(g: Grid, id: string) {
  let h = 2166136261;
  for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 16777619);
  const hue = (h >>> 0) % 360;
  const c = (l: number, s = 45) => `hsl(${hue}, ${s}%, ${l}%)`;
  g.poly([[9, 13], [23, 13], [28, 20], [27, 27], [22, 30], [10, 30], [5, 27], [4, 20]], c(38));
  g.poly([[9, 13], [12, 13], [8, 20], [7, 28], [5, 27], [4, 20]], c(52));
  g.poly([[22, 30], [27, 27], [28, 20], [25, 16], [25, 25]], c(26));
  // gathered neck and frill
  g.rect(12, 9, 20, 12, c(34));
  g.poly([[10, 4], [14, 7], [16, 3], [18, 7], [22, 4], [21, 9], [11, 9]], c(46));
  g.rect(11, 11, 21, 12, "#e3c060"); g.set(21, 13, "#e3c060"); g.set(22, 14, "#e3c060"); g.set(22, 15, "#e3c060");
  // a stitched rune on the front, so it reads as something special
  g.path([[16, 17], [16, 25]], c(78, 60)); g.path([[13, 19], [16, 22], [19, 19]], c(78, 60));
}

const cache = new Map<string, HTMLCanvasElement>();
const urls = new Map<string, string>();

/** Has its own drawing (not the pouch). */
export const hasIcon = (id: string) => id in DRAW;

/** The 32×32 icon for an item, weapon or relic id. Cached; don't draw on it. */
export function iconCanvas(id: string): HTMLCanvasElement {
  let c = cache.get(id);
  if (c) return c;
  const g = new Grid();
  (DRAW[id] ?? ((gg: Grid) => pouch(gg, id)))(g);
  g.outline();
  c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d")!;
  for (let k = 0; k < N * N; k++) {
    const col = g.d[k];
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.fillRect(k % N, Math.floor(k / N), 1, 1);
  }
  cache.set(id, c);
  return c;
}

/** The icon as an image URL, for <img> tags. */
export function iconURL(id: string): string {
  let u = urls.get(id);
  if (!u) { u = iconCanvas(id).toDataURL(); urls.set(id, u); }
  return u;
}

/** Every id with its own drawing, for tests. */
export const ICON_IDS = Object.keys(DRAW);
