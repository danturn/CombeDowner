// The HUD page (ui.html): every message and piece the game puts over the streets, drawn by the
// game's own code and style.css, laid out as a design-system site. A sidebar lists the categories
// (each the question a player is asking: what do I do now, what just happened, and so on); each
// category's page has its specimens in a grid, every one a live frame of the game's HUD (the stage,
// ui.html?stage) cropped to the piece at one scale, with its states as chips and a strip to inspect
// the call that draws it, its file and who uses it. A slot map shows where each category sits.
//
// Nothing goes over the network, nothing plays a sound and nothing is saved: ui.html swaps the
// audio, speech and storage for ones that go nowhere before any of the game's code loads.
// ui.html#<piece>/<state> opens that piece in that state; ui.html?stage#<piece>/<state>/<backdrop>
// draws just that, full screen, for a screenshot.
import { ELEMENTS, GROUPS, type Piece } from "./pieces";

// ---- the stage -------------------------------------------------------------------------------------

async function stage() {
  await import("../style.css");
  const S = await import("./stage");
  await S.ready();
  (window as any).__ui = S;
  const fromHash = () => {
    const [id, state, back] = decodeURIComponent(location.hash.slice(1)).split("/");
    if (back) S.backdrop(back);
    if (id) S.draw(id, state ?? "");
  };
  addEventListener("hashchange", fromHash);
  fromHash();
  document.body.dataset.ready = "1";
}

// ---- the catalogue ---------------------------------------------------------------------------------

const SCREENS = { desktop: [1280, 720], phone: [390, 844] } as const;
const SCALE = { desktop: 0.62, phone: 0.6 };
const PAD = 24;   // screen pixels of the game kept round a piece

const CSS = `
:root{--bg:#0e1012;--side:#15181b;--card:#1b1f23;--line:#2a2f35;--ink:#f4f1ea;--muted:#9da3a8;--accent:#ffdd00;--hud:"Barlow Condensed","Arial Narrow",sans-serif;
  --clip:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:500 16px/1.35 var(--hud)}
body{display:grid;grid-template-columns:248px 1fr;grid-template-rows:56px 1fr;height:100vh}
a{color:inherit;text-decoration:none}
button{font:inherit}
.top{grid-column:1/3;display:flex;align-items:center;gap:20px;padding:0 20px;border-bottom:1px solid var(--line);background:var(--side)}
.brand{font-weight:800;font-size:19px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.brand b{color:var(--accent)}
.controls{margin-left:auto;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.seg{display:inline-flex;background:#0b0d0f;border:1px solid var(--line);padding:2px;gap:2px}
.seg button{background:none;border:0;color:var(--muted);padding:4px 12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;cursor:pointer}
.seg button.on{background:var(--accent);color:#141100}
.seg button:hover:not(.on){color:var(--ink)}
.ctl-label{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
nav{background:var(--side);border-right:1px solid var(--line);padding:18px 14px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
nav .h{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:14px 8px 4px}
nav a{display:flex;flex-direction:column;padding:6px 10px;border-left:3px solid transparent;font-weight:700;font-size:17px;letter-spacing:.02em;line-height:1.15}
nav a small{font-weight:500;font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
nav a:hover{background:#1d2125}
nav a.on{border-left-color:var(--accent);background:#1d2125}
.slotmap{position:relative;aspect-ratio:16/9;background:linear-gradient(#5d7d93 0 46%,#4f5a44 46%);border:1px solid var(--line);margin:14px 4px 0;overflow:hidden;flex:none}
.slotmap.big{width:min(760px,100%);margin:0}
.slotmap::after{content:"";position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px;border:1px solid #fff8;border-radius:50%}
.slotmap i{position:absolute;border:1px dashed #fff5;background:#0007;transition:background .15s,border-color .15s;font:700 10px/1 var(--hud);letter-spacing:.06em;text-transform:uppercase;color:#fff8;padding:3px;overflow:hidden}
.slotmap.big i{font-size:13px;padding:5px}
.slotmap i.lit{background:rgba(255,221,0,.34);border:1px solid var(--accent);color:#fff}
main{overflow-y:auto;padding:34px 40px 80px}
.head{max-width:980px;margin-bottom:26px}
.head .kicker{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700}
.head h1{margin:2px 0 4px;font-size:44px;line-height:1;font-weight:800;letter-spacing:.01em}
.head .ask{font-size:24px;color:var(--ink);font-weight:600;margin:0 0 10px}
.head .facts{display:flex;gap:28px;flex-wrap:wrap;color:var(--muted);font-size:15px}
.head .facts b{display:block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:700}
.head .facts span{color:var(--ink)}
.rules{list-style:none;padding:0;margin:0 0 4px;display:grid;gap:4px;max-width:820px}
.rules li{font-size:17px;color:var(--muted);padding:4px 8px;cursor:pointer}
.rules li:hover{background:#1d2125}
.rules b{display:inline-block;min-width:130px;color:var(--accent)}
.rules i{font-style:normal;color:var(--ink);margin-right:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:22px;align-items:start}
.spec{background:var(--card);clip-path:var(--clip);display:flex;flex-direction:column;min-width:0}
.spec.wide{grid-column:1/-1}
.spec.hit{box-shadow:inset 0 0 0 2px var(--accent)}
.spec header{padding:12px 16px 10px;display:flex;flex-direction:column;gap:8px}
.spec h3{margin:0;font-size:19px;font-weight:800;letter-spacing:.02em;display:flex;gap:10px;align-items:baseline}
.spec h3 a{margin-left:auto;font-size:12px;color:var(--muted);font-weight:600;letter-spacing:.08em}
.spec h3 a:hover{color:var(--accent)}
.chips{display:flex;flex-wrap:wrap;gap:5px}
.chips button{background:#24292e;border:1px solid transparent;color:var(--muted);padding:2px 9px;font-size:13px;font-weight:600;cursor:pointer;letter-spacing:.02em}
.chips button:hover{color:var(--ink)}
.chips button.on{background:none;border-color:var(--accent);color:var(--accent)}
.view{position:relative;overflow:hidden;background:#0b0d0f;height:180px;transition:height .2s}
.view iframe{position:absolute;left:0;top:0;border:0;transform-origin:0 0;pointer-events:none}
.view .wait{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:13px;letter-spacing:.12em;text-transform:uppercase;z-index:1;background:#000}
.inspect{border-top:1px solid var(--line);font-size:14px}
.inspect summary{cursor:pointer;padding:7px 16px;color:var(--muted);font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;list-style:none}
.inspect summary::-webkit-details-marker{display:none}
.inspect summary::before{content:"+ ";color:var(--accent)}
.inspect[open] summary::before{content:"\\2013  "}
.inspect dl{margin:0;padding:0 16px 12px;display:grid;grid-template-columns:72px 1fr;gap:4px 10px}
.inspect dt{color:var(--muted);font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding-top:2px}
.inspect dd{margin:0;color:var(--ink)}
.inspect code{font:12.5px/1.4 ui-monospace,Menlo,monospace;color:var(--accent);word-break:break-word}
@media (max-width:820px){
  body{grid-template-columns:1fr;grid-template-rows:auto auto 1fr}
  .top{grid-column:1;flex-wrap:wrap;padding:10px 14px;gap:10px}.controls{margin-left:0;gap:8px}
  nav{flex-direction:row;overflow-x:auto;padding:6px 8px;border-right:0;border-bottom:1px solid var(--line);gap:4px}
  nav .h,nav .slotmap,nav a small{display:none}
  nav a{white-space:nowrap;border-left:0;border-bottom:3px solid transparent;font-size:15px}
  nav a.on{border-bottom-color:var(--accent)}
  main{padding:20px 14px 60px}
  .head h1{font-size:34px}
  .rules b{min-width:0;display:block}
  .grid{grid-template-columns:1fr}
}`;

function catalogue() {
  const css = document.createElement("style");
  css.textContent = CSS;
  document.head.appendChild(css);
  const outside = ["system", "world"], frames = ["frame"];
  const navLink = (g: (typeof GROUPS)[number]) => `<a href="#c/${g.id}" data-cat="${g.id}">${g.name}<small>${g.ask}</small></a>`;
  document.body.innerHTML = `<header class="top"><div class="brand">Combe Downer <b>HUD</b></div>
    <div class="controls"><span class="ctl-label">Screen</span><div class="seg" id="size"><button data-v="desktop" class="on">Desktop</button><button data-v="phone">Phone</button></div>
    <span class="ctl-label">Backdrop</span><div class="seg" id="back"><button data-v="street" class="on">Street</button><button data-v="sky">Sky</button><button data-v="dark">Dark</button></div>
    <span class="ctl-label">Inspect</span><div class="seg" id="insp"><button data-v="0" class="on">Off</button><button data-v="1">On</button></div></div></header>
    <nav><a href="#" data-cat="">Overview</a>
      <div class="h">Messages</div>${GROUPS.filter((g) => !outside.includes(g.id) && !frames.includes(g.id)).map(navLink).join("")}
      <div class="h">Outside the six</div>${GROUPS.filter((g) => outside.includes(g.id)).map(navLink).join("")}
      <div class="h">Layout</div>${GROUPS.filter((g) => frames.includes(g.id)).map(navLink).join("")}
      <div class="slotmap" id="navmap">${slotBoxes(false)}</div></nav>
    <main id="main"></main>`;

  let size: keyof typeof SCREENS = "desktop", back = "street", inspect = false, current: string | null = null;
  let cards: Card[] = [];
  const main = document.getElementById("main")!;

  const seg = (id: string, on: (v: string) => void) => {
    const box = document.getElementById(id)!;
    for (const b of box.querySelectorAll("button")) b.addEventListener("click", () => {
      box.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      on(b.dataset.v!);
    });
  };
  seg("size", (v) => { size = v as keyof typeof SCREENS; cards.forEach((c) => c.resize()); });
  seg("back", (v) => { back = v; cards.forEach((c) => c.backdrop()); });
  seg("insp", (v) => { inspect = v === "1"; main.querySelectorAll<HTMLDetailsElement>(".inspect").forEach((d) => { d.open = inspect; }); });

  // the slot map lights a category's places while its name is under the pointer
  const light = (cat: string) => document.querySelectorAll<HTMLElement>(".slotmap i").forEach((i) => i.classList.toggle("lit", i.dataset.cat === cat));
  for (const a of document.querySelectorAll<HTMLElement>("nav a")) {
    a.addEventListener("mouseenter", () => light(a.dataset.cat ?? ""));
    a.addEventListener("mouseleave", () => light(current ?? ""));
  }

  const open = (cat: string, piece?: string, state?: string) => {
    if (cat !== current) {
      current = cat;
      cards.forEach((c) => c.drop());
      cards = [];
      document.querySelectorAll<HTMLElement>("nav a").forEach((a) => a.classList.toggle("on", (a.dataset.cat ?? "") === cat));
      light(cat);
      main.scrollTop = 0;
      if (!cat) { overview(); return; }
      const g = GROUPS.find((x) => x.id === cat)!;
      main.innerHTML = `<div class="head"><div class="kicker">${outside.includes(cat) ? "Outside the six" : frames.includes(cat) ? "Layout" : "Messages"}</div>
        <h1>${g.name}</h1><p class="ask">${g.ask}</p><div class="facts"><div><b>Where</b><span>${g.where}</span></div><div><b>Look</b><span>${g.look}</span></div></div></div><div class="grid"></div>`;
      const grid = main.querySelector(".grid")!;
      for (const p of ELEMENTS.filter((e) => e.group === cat)) cards.push(new Card(p, grid));
    }
    if (piece) {
      const c = cards.find((x) => x.p.id === piece);
      if (!c) return;
      c.show(state && c.p.states.includes(state) ? state : c.state);
      c.el.scrollIntoView({ block: "center" });
      c.el.classList.add("hit");
      setTimeout(() => c.el.classList.remove("hit"), 1600);
    }
  };

  function overview() {
    main.innerHTML = `<div class="head"><div class="kicker">The HUD and its messages</div><h1>One question, one place, one look</h1>
      <p class="ask">Every message answers the question a player is asking. Pick one to see its pieces, drawn live by the game's own code.</p></div>
      <ul class="rules">${GROUPS.map((g) => `<li data-cat="${g.id}"><b>${g.name}</b><i>${g.ask}</i>${g.where}</li>`).join("")}</ul>
      <div class="slotmap big">${slotBoxes(true)}</div>`;
    for (const li of main.querySelectorAll<HTMLElement>(".rules li")) {
      li.addEventListener("mouseenter", () => light(li.dataset.cat!));
      li.addEventListener("mouseleave", () => light(""));
      li.addEventListener("click", () => { location.hash = `c/${li.dataset.cat}`; });
    }
  }

  class Card {
    el: HTMLElement; state: string;
    private frame: HTMLIFrameElement | null = null;
    private view: HTMLElement;
    private ready = false;
    private timers: number[] = [];
    constructor(public p: Piece, into: Element) {
      this.state = p.states[0];
      const el = (this.el = document.createElement("article"));
      el.className = `spec${p.wide ? " wide" : ""}`;
      el.id = `p-${p.id}`;
      el.innerHTML = `<header><h3><span></span><a href="#${p.id}" title="Link to this piece">#${p.id}</a></h3><div class="chips"></div></header>
        <div class="view"></div>
        <details class="inspect"${inspect ? " open" : ""}><summary>Inspect</summary><dl>${p.api ? `<dt>Call</dt><dd><code></code></dd>` : ""}<dt>File</dt><dd class="src"></dd><dt>Used by</dt><dd class="used"></dd>${p.note ? `<dt>Note</dt><dd class="note"></dd>` : ""}</dl></details>`;
      el.querySelector("h3 span")!.textContent = p.name;
      if (p.api) el.querySelector("code")!.textContent = p.api;
      el.querySelector(".src")!.textContent = p.src;
      el.querySelector(".used")!.textContent = p.used;
      if (p.note) el.querySelector(".note")!.textContent = p.note;
      const chips = el.querySelector(".chips")!;
      for (const s of p.states) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = s;
        b.addEventListener("click", () => { this.show(s); history.replaceState(null, "", `#${p.id}/${encodeURIComponent(s)}`); });
        chips.appendChild(b);
      }
      this.view = el.querySelector(".view")!;
      into.appendChild(el);
      this.load();
    }
    private ui() { return (this.frame?.contentWindow as any)?.__ui; }
    private load() {
      const [w, h] = SCREENS[size];
      this.view.insertAdjacentHTML("afterbegin", `<div class="wait">Drawing</div>`);
      const f = (this.frame = document.createElement("iframe"));
      f.title = this.p.name; f.tabIndex = -1;
      f.width = String(w); f.height = String(h);
      f.src = "./ui.html?stage";
      f.addEventListener("load", () => {
        const wait = () => {
          if (f !== this.frame) return;
          if (!f.contentDocument?.body.dataset.ready) { this.timers.push(window.setTimeout(wait, 100)); return; }
          this.ready = true;
          this.view.querySelector(".wait")?.remove();
          this.show(this.state);
        };
        wait();
      });
      this.view.appendChild(f);
      this.place(null);
    }
    show(state: string) {
      this.state = state;
      this.el.querySelectorAll<HTMLButtonElement>(".chips button").forEach((b) => b.classList.toggle("on", b.textContent === state));
      if (!this.ready) return;
      this.ui().backdrop(back);
      this.ui().draw(this.p.id, state);
      this.timers.forEach(clearTimeout);
      // measure once it's in, and again once any slide or spring has settled
      for (const ms of [150, 700, 1500]) this.timers.push(window.setTimeout(() => this.place(this.ui()?.bbox() ?? null), ms));
    }
    backdrop() { if (this.ready) this.ui().backdrop(back); }
    resize() { this.drop(); this.ready = false; this.load(); }
    /** Crop the frame to the piece at one scale; a phone, or a piece that fills the screen, shows whole. */
    private place(b: { x: number; y: number; w: number; h: number } | null) {
      const f = this.frame;
      if (!f) return;
      const [W, H] = SCREENS[size], vw = this.view.clientWidth || 340;
      const whole = size === "phone" || !b || b.w * b.h > W * H * 0.4;
      let s = SCALE[size], x: number, y = 0, h: number;
      if (whole) {
        s = Math.min(s, vw / W);
        h = H * s;
        x = Math.max(0, (vw - W * s) / 2);
      } else {
        h = Math.max(110, (b.h + 2 * PAD) * s);
        x = W * s <= vw ? (vw - W * s) / 2 : Math.min(0, Math.max(vw - W * s, vw / 2 - (b.x + b.w / 2) * s));
        y = Math.min(0, Math.max(h - H * s, h / 2 - (b.y + b.h / 2) * s));
      }
      f.style.transform = `translate(${x}px,${y}px) scale(${s})`;
      this.view.style.height = `${Math.round(h)}px`;
    }
    drop() { this.timers.forEach(clearTimeout); this.timers = []; this.frame?.remove(); this.frame = null; }
  }

  const route = () => {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) { open(""); return; }
    if (h.startsWith("c/")) { open(h.slice(2)); return; }
    const [id, state] = h.split("/");
    const p = ELEMENTS.find((e) => e.id === id);
    if (p) open(p.group, id, state); else open("");
  };
  addEventListener("hashchange", route);
  route();
}

/** The slot map's boxes: each category's places on the screen. */
function slotBoxes(named: boolean) {
  return GROUPS.flatMap((g) => g.slot.map(([l, t, w, h]) => `<i data-cat="${g.id}" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%">${named ? g.name : ""}</i>`)).join("");
}

const q = new URLSearchParams(location.search);
if (q.has("stage")) void stage();
else catalogue();
