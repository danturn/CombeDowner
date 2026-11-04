// The HUD and mission screens page (ui.html): every piece of text the game puts over the streets,
// drawn by the game's own code and style.css, to set side by side and check they look and read as
// one game. Two halves: the catalogue (this page as you open it), and the stage, a frame of the
// page itself (ui.html?stage) the size of a laptop or a phone screen, with the game's HUD markup
// taken from index.html, where each piece is drawn. The stage has its own window, so the screens'
// sizes in vw and vh follow the frame, as they would on that screen.
//
// Nothing goes over the network, nothing plays a sound and nothing is saved: ui.html swaps the
// audio, speech and storage for ones that go nowhere before any of the game's code loads.
// ui.html?stage#<piece>/<state>/<backdrop> draws just that, for a screenshot.
import { ELEMENTS, GROUPS, RULES, type Piece } from "./pieces";

const q = new URLSearchParams(location.search);
if (q.has("stage")) void stage();
else catalogue();

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

function catalogue() {
  const css = document.createElement("style");
  css.textContent = `
:root{--bg:#14171c;--panel:#1f242c;--ink:#eef0f2;--dim:#a7afba;--accent:#f2b134;--line:#323944;--own:#e0605a;--shared:#58c47a;--event:#6aa8e8}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font-family:"Barlow Condensed",system-ui,sans-serif}
body{display:grid;grid-template-columns:minmax(340px,440px) 1fr;grid-template-rows:auto 1fr;height:100vh}
header{grid-column:1/3;padding:10px 16px 8px;border-bottom:1px solid var(--line);display:flex;gap:16px;align-items:center;flex-wrap:wrap}
h1{font-family:Cinzel,serif;font-weight:800;font-size:20px;margin:0;color:var(--accent);letter-spacing:.04em}
header p{margin:0;color:var(--dim);font-size:15px;flex:1 1 300px}
header .tools{display:flex;gap:6px}
#list{overflow-y:auto;padding:8px 10px 40px;border-right:1px solid var(--line)}
#list h2{font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);margin:16px 2px 6px;font-weight:700}
#list h2 small{display:block;text-transform:none;letter-spacing:0;font-weight:500;font-size:13px}
.piece{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--shared);border-radius:6px;padding:8px 10px;margin:0 0 6px}
.piece.own{border-left-color:var(--own);margin-left:18px}
.piece.sel{outline:2px solid var(--accent)}
.piece b{font-size:17px}
.piece .tag{float:right;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--shared)}
.piece.own .tag{color:var(--own)}
.piece.event{border-left-color:var(--event)}
.piece.event .tag{color:var(--event)}
#rules{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:4px 12px 8px;margin:4px 0 8px;font-size:14px;color:var(--dim)}
#rules h3{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink);margin:10px 0 4px}
#rules ul{margin:0;padding-left:18px}#rules li{margin:2px 0}#rules b{color:var(--ink)}
#rules code{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--accent)}
#rules summary{cursor:pointer;color:var(--accent);font-weight:700;font-size:15px;margin-top:4px}
.piece .src{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--dim);margin:2px 0;word-break:break-word}
.piece .used{font-size:14px;color:var(--dim)}
.piece .note{font-size:14px;color:#f0c890;margin-top:2px}
.states{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
button{background:#2a313b;color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:3px 9px;font:inherit;font-size:15px;cursor:pointer}
button:hover{border-color:var(--accent)}
button.on{background:var(--accent);color:#1a1408;border-color:var(--accent)}
#stagewrap{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#0b0d10}
#stage{border:0;background:#000;transform-origin:center center;box-shadow:0 0 0 1px var(--line)}
#caption{position:absolute;left:12px;bottom:8px;color:var(--dim);font-size:14px}
@media (max-width:900px){body{grid-template-columns:1fr;grid-template-rows:auto 45vh 1fr}#list{grid-row:3}#stagewrap{grid-row:2}}`;
  document.head.appendChild(css);
  document.body.innerHTML = `<header><h1>HUD and mission screens</h1>
    <p>Every piece drawn by the game's own code and style.css. Green: the shared piece. Red, indented under it: a mode's own copy still to move over. Blue: a deliberate one-off. Pick a state to draw it on the stage.</p>
    <div class="tools"><span style="color:var(--dim)">Backdrop</span><button data-back="street" class="on">Street</button><button data-back="sky">Sky</button><button data-back="dark">Dark</button>
    <span style="color:var(--dim);margin-left:10px">Screen</span><button data-size="1280x720" class="on">1280 × 720</button><button data-size="390x844">Phone 390</button></div></header>
    <div id="list"></div><div id="stagewrap"><iframe id="stage" title="The stage" src="./ui.html?stage"></iframe><div id="caption"></div></div>`;
  const frame = document.getElementById("stage") as HTMLIFrameElement;
  const wrap = document.getElementById("stagewrap")!;
  let size = [1280, 720], back = "street", cur = "", curState = "";
  const fit = () => {
    frame.style.width = `${size[0]}px`; frame.style.height = `${size[1]}px`;
    const k = Math.min(1, (wrap.clientWidth - 20) / size[0], (wrap.clientHeight - 30) / size[1]);
    frame.style.transform = `scale(${k})`;
  };
  addEventListener("resize", fit);
  fit();
  const ui = () => (frame.contentWindow as any)?.__ui;
  const draw = () => {
    if (!ui()) return;
    ui().backdrop(back);
    if (cur) ui().draw(cur, curState);
    document.getElementById("caption")!.textContent = cur ? `${cur} · ${curState} · ${back} · ${size.join("×")}` : "";
  };
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-back]")) b.onclick = () => {
    back = b.dataset.back!; document.querySelectorAll("[data-back]").forEach((x) => x.classList.toggle("on", x === b)); draw();
  };
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-size]")) b.onclick = () => {
    size = b.dataset.size!.split("x").map(Number); document.querySelectorAll("[data-size]").forEach((x) => x.classList.toggle("on", x === b)); fit();
    // the frame's window changes size: draw again so anything placed by size settles
    setTimeout(draw, 100);
  };
  const list = document.getElementById("list")!;
  const rules = document.createElement("details");
  rules.id = "rules"; rules.open = true;
  rules.innerHTML = `<summary>The rules: which piece, which tier, which slot</summary>${RULES}`;
  list.appendChild(rules);
  for (const g of GROUPS) {
    const h = document.createElement("h2");
    h.innerHTML = `${g.name}<small>${g.blurb}</small>`;
    list.appendChild(h);
    for (const p of ELEMENTS.filter((e) => e.group === g.id)) list.appendChild(card(p));
  }
  function card(p: Piece) {
    const el = document.createElement("div");
    el.className = `piece${p.own ? " own" : p.event ? " event" : ""}`;
    el.id = "p-" + p.id;
    el.innerHTML = `<span class="tag">${p.own ? `own copy${p.of ? ` of ${p.of}` : ""}` : p.event ? "event: its own look" : "shared"}</span><b></b><div class="src"></div><div class="used"></div>${p.note ? `<div class="note"></div>` : ""}<div class="states"></div>`;
    el.querySelector("b")!.textContent = p.name;
    el.querySelector(".src")!.textContent = p.src;
    el.querySelector(".used")!.textContent = `Used by: ${p.used}`;
    if (p.note) el.querySelector(".note")!.textContent = p.note;
    const st = el.querySelector(".states")!;
    for (const s of p.states) {
      const b = document.createElement("button");
      b.textContent = s;
      b.onclick = () => {
        cur = p.id; curState = s;
        document.querySelectorAll(".piece").forEach((x) => x.classList.toggle("sel", x === el));
        document.querySelectorAll(".states button").forEach((x) => x.classList.toggle("on", x === b));
        draw();
      };
      st.appendChild(b);
    }
    return el;
  }
  frame.addEventListener("load", () => {
    const wait = () => (frame.contentDocument?.body.dataset.ready ? draw() : setTimeout(wait, 100));
    wait();
  });
}
