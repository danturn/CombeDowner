// The Chronicle, the game's one newspaper ("The <map name> Chronicle"). Its front page is today's
// jobs: three little missions a day (shoot some flags down, win a pub back, ride a couple of
// kilometres, land a combo...), picked fresh each calendar day, and the same three for everyone
// that day, with how the Flag Lads are doing as the lead. Finish one and it ticks off with a cheer;
// finish all three and that's you done till tomorrow. Its second page is yesterday's news (paper.ts
// writes it from the day log), reached by the tab under the masthead, the left and right arrow
// keys or a tap.
//
// The Chronicle shows when you join, opening on yesterday's page the first time each day if there's
// news, then tucks away: hold Tab (or pause, on a touch screen) to see it again, and the pause menu
// and the noticeboards open it at the news.
//
// Who decides what: all your own. Which three it is comes from the date, and your progress is kept
// on your machine; nothing goes over the network. The rest of the game tells this how you're
// getting on through note() (a flag down, a pub won back, metres ridden and so on).
import * as SFX from "./audio";
import { esc, hash, rng } from "./quests";
import { award, tally } from "./trophies";
import { show } from "./show";

/** Something you did that a mission might count. */
export type DailyKind = "flags" | "pub" | "ladder" | "job" | "ride" | "combo" | "trap" | "pint" | "naughty";

interface Mission { k: DailyKind; n: number; text: string }

/** Everything a mission can be, with how much of it (one picked at random) and what it says. */
const POOL: { k: DailyKind; n: number[]; text: (n: number) => string }[] = [
  { k: "flags", n: [5, 8, 12], text: (n) => `Shoot ${n} Flag Lads' flags off the lamp posts` },
  { k: "pub", n: [1], text: () => "Win a pub back from the Flag Lads" },
  { k: "ladder", n: [1], text: () => "Catch a ladder lad putting a flag back up" },
  { k: "job", n: [1, 2], text: (n) => (n === 1 ? "Finish a job from a noticeboard" : `Finish ${n} jobs from the noticeboards`) },
  { k: "ride", n: [1000, 2000, 3000], text: (n) => `Ride ${n / 1000} km on anything with wheels (or a pogo stick)` },
  { k: "combo", n: [300, 800, 1500], text: (n) => `Land a combo worth ${n} on a ride` },
  { k: "trap", n: [30, 40, 50], text: (n) => `Get clocked at ${n} km/h by a speed trap` },
  { k: "pint", n: [1, 2], text: (n) => (n === 1 ? "Have a pint" : `Have ${n} pints`) },
  { k: "naughty", n: [3, 5, 8], text: (n) => `Sort out ${n} naughty boys` },
];
/** combo and trap count your best one, not a running total. */
const BEST: DailyKind[] = ["combo", "trap"];
const KEY = "cd-daily";

/** Today, as the date on your calendar. */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Today as it's printed under the masthead: "Friday 16 October 2026". */
function dateline() {
  const d = new Date();
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Today's three, the same for everyone. */
function pick(day: string): Mission[] {
  const r = rng(hash("daily", day)), pool = [...POOL], out: Mission[] = [];
  while (out.length < 3 && pool.length) {
    const m = pool.splice(Math.floor(r() * pool.length), 1)[0], n = m.n[Math.floor(r() * m.n.length)];
    out.push({ k: m.k, n, text: m.text(n) });
  }
  return out;
}

let sink: ((k: DailyKind, n: number) => void) | null = null;

/** Tell today's jobs about something you did: n of kind k (metres for "ride", the score for "combo", km/h for "trap"). */
export function note(k: DailyKind, n = 1) { sink?.(k, n); }

export class Daily {
  private day = "";
  private list: Mission[] = [];
  private got: number[] = [];
  private saveT = 0;
  private page: 0 | 1 = 0;
  /** The news page as last written: kept while it's showing so a reader's scrolling isn't undone. */
  private news = "";
  private readonly turn = (e: KeyboardEvent) => {
    const up = !document.getElementById("scoreboard")?.hidden || !document.getElementById("pause")?.hidden;
    if (!up || e.target instanceof HTMLInputElement) return;
    if (e.code === "ArrowLeft") this.setPage(0);
    else if (e.code === "ArrowRight") this.setPage(1);
  };

  /** say: a toast. status: a line or two on how the Flag Lads are doing, as html.
   *  place: the map's name, for the masthead. newsPage: yesterday's news, as html. */
  constructor(private say: (text: string, secs: number) => void, private status: () => string,
    private place: () => string, private newsPage: () => string) {
    sink = (k, n) => this.add(k, n);
    addEventListener("keydown", this.turn);
    this.load();
  }

  /** Turn to the front page (0) or the news (1). */
  setPage(n: 0 | 1) {
    if (n === this.page) return;
    this.page = n;
    this.news = "";
  }

  /** Whether the news page is the one showing. */
  get onNews() { return this.page === 1; }

  private load() {
    this.day = today();
    this.list = pick(this.day);
    this.got = this.list.map(() => 0);
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (s && s.day === this.day && Array.isArray(s.got)) this.got = this.list.map((_, i) => Math.max(0, Number(s.got[i]) || 0));
    } catch { /* storage may be blocked */ }
  }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify({ day: this.day, got: this.got })); } catch { /* storage may be blocked */ }
  }

  private add(k: DailyKind, n: number) {
    if (today() !== this.day) this.load();   // past midnight: a new day's three
    this.list.forEach((m, i) => {
      if (m.k !== k || this.got[i] >= m.n) return;
      this.got[i] = BEST.includes(k) ? Math.max(this.got[i], n) : this.got[i] + n;
      if (this.got[i] >= m.n) {
        this.got[i] = m.n;
        const all = this.got.every((g, j) => g >= this.list[j].n);
        SFX.jobDone(true);
        if (all) { award("daily"); tally("dailydays"); }
        this.say(all ? `Today's jobs all done: ${m.text}. Back tomorrow for three more` : `Today's job done: ${m.text}`, 3.5);
      }
    });
    // metres ridden come in every frame, so they're saved now and then rather than every time
    if (k !== "ride" || performance.now() - this.saveT > 5000) { this.saveT = performance.now(); this.save(); }
  }

  /** The panel: the front page (today's three with how far you've got, and the Flag Lads) or the news. */
  render(): string {
    if (today() !== this.day) this.load();
    const rows = this.list.map((m, i) => {
      const done = this.got[i] >= m.n, f = Math.min(1, this.got[i] / m.n);
      const count = m.n === 1 ? "" : m.k === "ride" ? `${(this.got[i] / 1000).toFixed(1)} / ${m.n / 1000} km` : BEST.includes(m.k) ? (this.got[i] ? `best ${Math.round(this.got[i])}` : "") : `${this.got[i]} / ${m.n}`;
      return `<li class="${done ? "done" : ""}"><span class="tick">${done ? "✓" : ""}</span><span class="what">${esc(m.text)}${count && !done ? `<small>${count}</small>` : ""}</span>`
        + `<span class="bar"><span style="width:${Math.round(f * 100)}%"></span></span></li>`;
    }).join("");
    const place = this.place();
    const tabs = `<div class="chron-tabs"><button type="button" data-page="0" class="${this.page === 0 ? "on" : ""}">Front page</button>`
      + `<button type="button" data-page="1" class="${this.page === 1 ? "on" : ""}">Yesterday in ${esc(place)}</button></div>`;
    const top = `<div class="chron-ears"><span>Est. 1760</span><span>Price: free</span></div>`
      + `<div class="chron-mast">The ${esc(place)} Chronicle</div>`;
    if (this.page === 1) {
      if (!this.news) this.news = this.newsPage();
      return top + tabs + `<div class="chron-news">${this.news}</div>`;
    }
    const flags = this.status();
    return top + tabs
      + `<div class="chron-folio"><span>${dateline()}</span><span>Today in ${esc(place)}</span></div>`
      + `<div class="daily-head">Today's jobs</div><ul>${rows}</ul>`
      + (flags ? `<div class="daily-flags">${flags}</div>` : "");
  }

  /** Put the panel into el, if it's changed. */
  draw(el: HTMLElement) {
    el.onclick = (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-page]");
      if (t) this.setPage(t.dataset.page === "1" ? 1 : 0);
    };
    show(el, this.render());
  }

  dispose() { if (sink) sink = null; removeEventListener("keydown", this.turn); this.save(); }
}
