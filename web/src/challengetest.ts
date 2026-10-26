// A stand-in team challenge, only there to try the challenge machinery out (challenges.ts): it
// joins the game only with the testing option ?objects=N (oddments.ts). Everyone in the room
// stands on one spot together for a few seconds, and it's done.
//
// Who decides what: the host says when everyone has stood there long enough ("qe", as any job's
// step), and every screen ends it then.
import { registerChallenge } from "./challenges";
import { openGround } from "./oddments";
import type { Job } from "./quests";

const HOLD = 4, CLOSE = 6;

if (new URLSearchParams(location.search).has("objects")) registerChallenge({
  id: "standtogether", name: "Stand Together", blurb: "Everyone on the one spot at once, and hold it",
  glyph: "S", colour: "#c86bff", tier: 0, stars: 1,
  goal: () => "Everyone stands on the spot together",
  place(map) {
    const home = openGround(map);
    const at = openGround(map, home ? [[home.x, home.y]] : []);
    return at ? [{ x: at.x, z: -at.y, name: at.n || "the open ground" }] : null;
  },
  start({ offer, spots, w }) {
    const s = spots[0];
    let held = 0, inside = 0, all = 0;
    w.mark("@challenge", { x: s.x, z: s.z }, offer.title, "#c86bff");
    const job: Job = {
      offer, done: null,
      update(dt) {
        const ps = w.players().filter((p) => p.alive);
        all = ps.length;
        inside = ps.filter((p) => Math.hypot(p.x - s.x, p.z - s.z) < CLOSE).length;
        held = all && inside === all ? held + dt : 0;
      },
      host() {
        if (held < HOLD || job.done) return;
        w.send("qe", { k: "won", s: offer.seed });
        job.event!({ k: "won" }, w.selfId);
      },
      event(d) {
        if (d?.k === "won" && !job.done) job.done = { won: true, text: "Everyone stood together", x: s.x, z: s.z };
      },
      card: () => ({ line: "Everyone on the spot", progress: `${inside} / ${all}`, bar: Math.min(1, held / HOLD) }),
      end() { w.mark("@challenge", null); },
    };
    return job;
  },
});
