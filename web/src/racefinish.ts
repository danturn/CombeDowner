// The big moment over a race's finish line: a banner across the screen with where you came and
// your time, the medal and whether it's a best, the times of everyone over the line so far (filled
// in as they come), and confetti, all drawn here on the page over the game. It goes by itself
// after a while and never takes a click, so you can ride on underneath it.
//
// Nothing here goes over the network: race.ts tells it what to show on this player's screen.

const LIFE = 10;             // seconds it stays up
const FADE = 1;              // and spends fading
const PIECES = 180;
const COLOURS = ["#3ec7e8", "#ffd84a", "#ff5a7a", "#58e06a", "#ffffff", "#c99cff", "#ff9a3c"];

export interface FinishRow { name: string; time: string; colour: string; me: boolean }
export interface FinishShow { place: number; of: number; time: string; medal: string; best: string; rows: FinishRow[] }

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `
.rfin{position:fixed;inset:0;z-index:30;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;
  font-family:'Barlow Condensed',Impact,sans-serif;color:#fff;text-shadow:0 3px 0 #000,0 0 18px rgba(0,0,0,.6);transition:opacity 1s}
.rfin canvas{position:absolute;inset:0;width:100%;height:100%}
.rfin .band{position:relative;width:100%;padding:14px 16px 18px;text-align:center;background:linear-gradient(90deg,transparent,rgba(8,14,20,.82) 15%,rgba(8,14,20,.82) 85%,transparent);
  animation:rfin-in .5s cubic-bezier(.2,1.6,.4,1) both}
.rfin .flag{height:14px;margin:0 auto 6px;max-width:520px;background:repeating-conic-gradient(#111 0 25%,#f4f4f2 0 50%) 0 0/14px 14px}
.rfin .flag.b{margin:8px auto 0}
.rfin .head{font-weight:800;font-size:clamp(28px,6vw,52px);letter-spacing:.06em;color:#3ec7e8}
.rfin .place{font-weight:900;font-size:clamp(72px,18vw,170px);line-height:.9;animation:rfin-pop 1.2s ease-in-out .4s infinite alternate}
.rfin .place sup{font-size:.4em}
.rfin .gold{background:linear-gradient(#fff6b0,#ffc520 55%,#c47a00);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 4px 0 #000)}
.rfin .time{font-weight:800;font-size:clamp(30px,7vw,60px)}
.rfin .medal{font-weight:700;font-size:clamp(18px,4vw,30px);color:#ffd84a}
.rfin .best{font-weight:800;font-size:clamp(18px,4vw,28px);color:#58e06a;animation:rfin-blink .5s steps(2) infinite}
.rfin table{margin:10px auto 0;border-collapse:collapse;font-weight:700;font-size:clamp(15px,3.4vw,22px);text-shadow:0 1px 2px #000}
.rfin td{padding:1px 10px;text-align:left}
.rfin td.t{text-align:right;font-variant-numeric:tabular-nums}
.rfin tr.me td{color:#3ec7e8}
@keyframes rfin-in{from{transform:scale(2.4) rotate(-6deg);opacity:0}to{transform:none;opacity:1}}
@keyframes rfin-pop{from{transform:scale(1)}to{transform:scale(1.08) rotate(-2deg)}}
@keyframes rfin-blink{to{opacity:.35}}`;
  document.head.appendChild(s);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const nth = (n: number) => `${n}<sup>${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}</sup>`;

interface Bit { x: number; y: number; vx: number; vy: number; a: number; va: number; w: number; h: number; c: string }

export class Celebration {
  private el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private table: HTMLDivElement;
  private bits: Bit[] = [];
  private age = 0;
  private bursts = 0;
  private dead = false;

  constructor(s: FinishShow) {
    style();
    this.el = document.createElement("div");
    this.el.className = "rfin";
    this.canvas = document.createElement("canvas");
    this.el.appendChild(this.canvas);
    const band = document.createElement("div");
    band.className = "band";
    const won = s.place === 1 && s.of > 1;
    const head = s.place === 0 ? "Time trial" : won ? "Winner!" : s.of === 1 ? "Finished!" : "Over the line!";
    band.innerHTML = `<div class="flag"></div><div class="head">${head}</div>`
      + (s.place > 0 && s.of > 1 ? `<div class="place${s.place === 1 ? " gold" : ""}">${nth(s.place)}</div>` : "")
      + `<div class="time">${esc(s.time)}</div><div class="medal">${esc(s.medal)}</div>`
      + (s.best ? `<div class="best">${esc(s.best)}</div>` : "");
    this.table = document.createElement("div");
    band.appendChild(this.table);
    band.insertAdjacentHTML("beforeend", `<div class="flag b"></div>`);
    this.el.appendChild(band);
    document.body.appendChild(this.el);
    this.rows(s.rows);
    this.burst();
    // it runs itself, so it plays out even once the race it's for is over and gone
    let last = performance.now();
    const tick = (ms: number) => {
      if (this.dead) return;
      this.update(Math.min(0.05, (ms - last) / 1000));
      last = ms;
      if (this.age > LIFE + FADE) this.remove(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** The times of everyone over the line so far. */
  rows(rows: FinishRow[]) {
    this.table.innerHTML = rows.length > 1 || (rows.length && !rows[0].me)
      ? `<table>${rows.slice(0, 8).map((r, k) => `<tr class="${r.me ? "me" : ""}"><td>${k + 1}.</td><td style="color:${r.me ? "" : r.colour}">${esc(r.name)}</td><td class="t">${esc(r.time)}</td></tr>`).join("")}</table>`
      : "";
  }

  private burst() {
    const W = innerWidth, H = innerHeight;
    for (let k = 0; k < PIECES / 3; k++) {
      for (const side of [0, 1]) {
        const a = side ? Math.PI * (1.2 + Math.random() * 0.25) : -Math.PI * (0.2 + Math.random() * 0.25);
        const v = 500 + Math.random() * 700;
        this.bits.push({
          x: side ? W : 0, y: H * 0.85, vx: Math.cos(a) * v, vy: -Math.abs(Math.sin(a) * v),
          a: Math.random() * 6, va: (Math.random() - 0.5) * 14, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: COLOURS[k % COLOURS.length],
        });
      }
      this.bits.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 120,
        a: Math.random() * 6, va: (Math.random() - 0.5) * 10, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: COLOURS[(k + 3) % COLOURS.length] });
    }
    this.bursts++;
  }

  private update(dt: number) {
    this.age += dt;
    if (this.bursts < 3 && this.age > this.bursts * 1.6) this.burst();
    const c = this.canvas, W = innerWidth, H = innerHeight;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, W, H);
    let n = 0;
    for (const b of this.bits) {
      b.vy += 600 * dt; b.vx *= 1 - 1.2 * dt; b.vy = Math.min(b.vy, 220);
      b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
      if (b.y > H + 20) continue;
      this.bits[n++] = b;
      g.save(); g.translate(b.x, b.y); g.rotate(b.a); g.scale(1, Math.cos(b.a * 1.7));
      g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    this.bits.length = n;
    if (this.age > LIFE) this.el.style.opacity = String(Math.max(0, 1 - (this.age - LIFE) / FADE));
  }

  remove() { this.dead = true; this.el.remove(); }
}
