// Minimap: a round map in the corner that turns with you (your heading is always up), with a
// north marker on its rim. The whole map is drawn once to an offscreen canvas, then each frame
// a rotated window of it is copied in.
import { GameMap, PATHS } from "./map";

const RANGE = 140;          // metres from the centre of the minimap to its edge
const BASE = 2048;          // offscreen canvas size in pixels

export interface Blip { x: number; z: number; colour: string }

export class Minimap {
  private base = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private mpp: number;      // metres per base pixel
  private x0: number; private y1: number;
  private size = 0;
  private labels: { name: string; x: number; y: number; angle: number; len: number }[] = [];
  private field: number;
  private full?: { canvas: HTMLCanvasElement; size: number; scale: number };

  constructor(map: GameMap, private canvas: HTMLCanvasElement) {
    this.field = map.field;
    this.ctx = canvas.getContext("2d")!;
    const D = map.d, [x0, y0, x1, y1] = D.b;
    this.x0 = x0; this.y1 = y1;
    this.mpp = Math.max(x1 - x0, y1 - y0) / BASE;
    this.base.width = this.base.height = BASE;
    const g = this.base.getContext("2d")!;
    const P = (x: number, y: number): [number, number] => [(x - x0) / this.mpp, (y1 - y) / this.mpp];

    // ground types from the terrain grid
    const T = D.t;
    const GROUND = ["#55663b", "#5f8a3e", "#3e4a2a", "#7d8550", "#5b6f47", "#77746c"];
    g.fillStyle = GROUND[0];
    g.fillRect(0, 0, BASE, BASE);
    const cw = T.dx / this.mpp + 0.6, ch = T.dy / this.mpp + 0.6;
    for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) {
      const k = +T.k[j * T.nx + i];
      if (!k) continue;
      g.fillStyle = GROUND[k];
      const [px, py] = P(T.x0 + i * T.dx, T.y0 + j * T.dy);
      g.fillRect(px - cw / 2, py - ch / 2, cw, ch);
    }
    // water
    g.fillStyle = "#3f6f8c";
    for (const w of D.wp) {
      g.beginPath();
      for (const ring of w.r) ring.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y))));
      g.fill("evenodd");
    }
    g.strokeStyle = "#3f6f8c";
    g.lineWidth = 1.5 / this.mpp;
    for (const l of D.wl) this.line(g, l.p, P);
    // roads: paths thin and sandy, streets wide and pale
    g.lineCap = g.lineJoin = "round";
    g.strokeStyle = "#a89a78";
    g.lineWidth = 1.6 / this.mpp;
    for (const r of D.rd) if (PATHS.has(r.c)) this.line(g, r.p, P);
    g.strokeStyle = "#c9c4b6";
    for (const r of D.rd) {
      if (PATHS.has(r.c)) continue;
      g.lineWidth = (r.c === "primary" || r.c === "tertiary" ? 8 : r.c === "service" ? 4 : 6) / this.mpp;
      this.line(g, r.p, P);
    }
    // one label per street, halfway along its longest stretch inside the field
    const best = new Map<string, { x: number; y: number; angle: number; len: number }>();
    for (const r of D.rd) {
      if (!r.n || PATHS.has(r.c) || r.p.length < 3) continue;
      let len = 0;
      for (let i = 1; i < r.p.length; i++) len += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
      const cur = best.get(r.n);
      if (cur && cur.len >= len) continue;
      let acc = 0, k = 1;
      for (; k < r.p.length - 1; k++) { acc += Math.hypot(r.p[k][0] - r.p[k - 1][0], r.p[k][1] - r.p[k - 1][1]); if (acc >= len / 2) break; }
      const a = r.p[Math.max(0, k - 2)], b = r.p[Math.min(r.p.length - 1, k + 2)];
      if (Math.hypot(r.p[k][0], r.p[k][1]) > map.field - 20) continue;
      best.set(r.n, { x: r.p[k][0], y: r.p[k][1], angle: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), len });
    }
    this.labels = [...best].map(([name, v]) => ({ name, ...v }));
    // buildings
    g.fillStyle = "#e3c98f";
    g.strokeStyle = "#8a7550";
    g.lineWidth = 1;
    for (const b of D.bl) {
      g.beginPath();
      for (const ring of b.r) { ring.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y)))); g.closePath(); }
      g.fill("evenodd");
      g.stroke();
    }
    // outside the force field
    const [cx, cy] = P(0, 0), r = map.field / this.mpp;
    g.fillStyle = "rgba(10, 20, 35, 0.55)";
    g.beginPath();
    g.rect(0, 0, BASE, BASE);
    g.arc(cx, cy, r, 0, Math.PI * 2, true);
    g.fill();
    g.strokeStyle = "#69c3ff";
    g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  }

  private line(g: CanvasRenderingContext2D, pts: number[][], P: (x: number, y: number) => [number, number]) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y))));
    g.stroke();
  }

  /** Full-screen map, north up, with street names, the player and any blips. */
  drawFull(c: HTMLCanvasElement, x: number, z: number, yaw: number, blips: Blip[]) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const css = Math.min(c.clientWidth, c.clientHeight);
    if (!css) return;
    const S = Math.round(css * dpr);
    if (c.width !== S) { c.width = c.height = S; }
    // the static part (map and street names) is drawn once per size
    if (!this.full || this.full.size !== S) {
      const fc = document.createElement("canvas");
      fc.width = fc.height = S;
      const g = fc.getContext("2d")!;
      const span = this.field * 2.08, scale = S / span;   // screen px per metre
      const cx = (0 - this.x0) / this.mpp, cy = this.y1 / this.mpp;   // map centre in base px
      g.fillStyle = "#1c2329"; g.fillRect(0, 0, S, S);
      g.drawImage(this.base, S / 2 - cx * this.mpp * scale, S / 2 - cy * this.mpp * scale, BASE * this.mpp * scale, BASE * this.mpp * scale);
      g.font = `600 ${Math.max(10, Math.round(S / 95))}px "Barlow Condensed", system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.lineJoin = "round";
      for (const l of this.labels) {
        const w = g.measureText(l.name).width;
        if (w > l.len * scale * 1.1) continue;    // longer than the street at this size
        let a = l.angle;
        if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
        g.save();
        g.translate(S / 2 + l.x * scale, S / 2 - l.y * scale);
        g.rotate(a);
        g.strokeStyle = "rgba(20,24,28,0.85)"; g.lineWidth = 3 * dpr;
        g.strokeText(l.name, 0, 0);
        g.fillStyle = "#f4f1ea";
        g.fillText(l.name, 0, 0);
        g.restore();
      }
      this.full = { canvas: fc, size: S, scale };
    }
    const g = c.getContext("2d")!, scale = this.full.scale;
    g.drawImage(this.full.canvas, 0, 0);
    const P = (sx: number, sz: number) => [S / 2 + sx * scale, S / 2 + sz * scale];
    for (const b of blips) {
      const [bx, by] = P(b.x, b.z);
      g.fillStyle = b.colour; g.beginPath(); g.arc(bx, by, 6 * dpr, 0, Math.PI * 2); g.fill();
    }
    // you: an arrow pointing the way you face (north is up)
    const [px, py] = P(x, z);
    g.save();
    g.translate(px, py); g.rotate(-yaw);
    g.fillStyle = "#ffdd00"; g.strokeStyle = "rgba(0,0,0,0.7)"; g.lineWidth = 2 * dpr;
    const k = 1.6 * dpr;
    g.beginPath(); g.moveTo(0, -9 * k); g.lineTo(6 * k, 7 * k); g.lineTo(0, 3 * k); g.lineTo(-6 * k, 7 * k); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    // north marker
    g.fillStyle = "#e8553f";
    g.beginPath(); g.arc(S - 28 * dpr, 28 * dpr, 14 * dpr, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.font = `700 ${15 * dpr}px "Barlow Condensed", system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("N", S - 28 * dpr, 29 * dpr);
  }

  /** Draw the minimap around the player at scene (x, z) facing yaw. */
  draw(x: number, z: number, yaw: number, blips: Blip[]) {
    const c = this.canvas, dpr = Math.min(2, devicePixelRatio || 1);
    const css = c.clientWidth;
    if (!css) return;
    if (this.size !== Math.round(css * dpr)) { this.size = Math.round(css * dpr); c.width = c.height = this.size; }
    const S = this.size, R = S / 2, g = this.ctx;
    const scale = R / RANGE;                       // screen px per metre
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = "#1c2329"; g.fillRect(0, 0, S, S);
    g.translate(R, R);
    g.rotate(yaw);                                 // heading up
    const bx = (x - this.x0) / this.mpp, by = (this.y1 + z) / this.mpp;   // scene z = -north
    const k = scale * this.mpp;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.base, -bx * k, -by * k, BASE * k, BASE * k);
    for (const b of blips) {
      g.fillStyle = b.colour;
      g.beginPath(); g.arc((b.x - x) * scale, (b.z - z) * scale, 4.5 * dpr, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // you: an arrow pointing up
    g.fillStyle = "#ffdd00"; g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1.5 * dpr;
    g.beginPath();
    g.moveTo(R, R - 8 * dpr); g.lineTo(R + 6 * dpr, R + 6 * dpr); g.lineTo(R, R + 2.5 * dpr); g.lineTo(R - 6 * dpr, R + 6 * dpr);
    g.closePath(); g.fill(); g.stroke();
    // rim
    g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 2 * dpr;
    g.beginPath(); g.arc(R, R, R - 1.5 * dpr, 0, Math.PI * 2); g.stroke();
    // north marker on the rim
    const nr = R - 11 * dpr, nx = R + Math.sin(yaw) * nr, ny = R - Math.cos(yaw) * nr;
    g.fillStyle = "#e8553f";
    g.beginPath(); g.arc(nx, ny, 9 * dpr, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff";
    g.font = `700 ${11 * dpr}px "Barlow Condensed", system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("N", nx, ny + 0.5 * dpr);
  }
}
