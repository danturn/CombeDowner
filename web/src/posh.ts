// The rugby and cricket teams don't just shout "Oi!": they speak in actual words, using the
// browser's own speech voice. We pick a British one if the browser has one (a man's voice if we can
// find one) so they sound properly posh. Their line also shows in a bubble over their head (see
// chavs.ts), so you still get it with the sound off or with no speech voice at all.
import * as SFX from "./audio";

/** Any of the posh lot might say these. The ones asked for come up twice as often. */
const ANYONE = [
  "Come on then!", "Come on then!", "I used to box for Cambridge, you know.", "I used to box for Cambridge, you know.",
  "I'm a master pugilist.", "I'm a master pugilist.", "Put your fists up, sir!", "Queensberry rules, old boy!",
  "I say! You there!", "Have at you!", "Right, you frightful oik.", "Do you know who my father is?",
  "Tally ho!", "Come here, you absolute cad!", "I'll give you a jolly good thrashing!", "Fisticuffs it is, then!",
  "Rah!", "Steady on, I'm a Blue!",
];
const RUGBY = [
  "Scrum down, chaps!", "Let's ruck him, lads!", "Hand off! Hand off!", "First fifteen, with me!",
  "I'll put you in touch, sunshine!", "Ruck over!", "Tackle him, Tarquin!",
];
const CRICKET = [
  "Howzat!", "I'll hit you for six!", "Leg before wicket, old boy!", "That's not cricket!",
  "Stumps for you, sunshine!", "Owzat, umpire?", "Fetch my pads, Rupert!",
];

/** Something for one of the posh lot to shout. kind 1 is rugby, 2 cricket. */
export function line(kind: number) {
  const own = kind === 1 ? RUGBY : CRICKET;
  const all = Math.random() < 0.3 ? own : ANYONE;
  return all[Math.floor(Math.random() * all.length)];
}

const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;
const MALE = /daniel|arthur|oliver|george|ryan|thomas|alfie|elliot|harry|male/i;
const FEMALE = /female|serena|kate|stephanie|martha|hazel|libby|sonia|maisie|susan|fiona/i;
let voices: SpeechSynthesisVoice[] = [];
/** Voices to pick from, best first: British men, then any British voice, then any English one. */
function load() {
  const all = synth?.getVoices() ?? [];
  const lang = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  const gb = all.filter((v) => lang(v) === "en-gb");
  const men = gb.filter((v) => MALE.test(v.name) || !FEMALE.test(v.name));
  voices = men.length ? men : gb.length ? gb : all.filter((v) => lang(v).startsWith("en"));
}
if (synth) {
  load();
  synth.addEventListener?.("voiceschanged", load);
  // some browsers (iOS) only speak once speech has started from a tap or a key press
  let primed = false;
  const prime = () => {
    if (primed) return;
    primed = true;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
  };
  addEventListener("pointerdown", prime, { once: true });
  addEventListener("keydown", prime, { once: true });
}

/**
 * Say a line out loud, distance metres away. seed gives each of them a voice of their own. One at a
 * time, and never over your own one-liners (quips.ts): while anything is being said, they keep quiet.
 * own: a voice set by hand instead (breakdown.ts): the first British man's voice, at this pitch.
 */
export function speak(text: string, seed: number, distance: number, own?: { pitch: number; rate?: number }) {
  if (!synth || distance > 55 || document.hidden || synth.speaking || synth.pending) return;
  const r = (k: number) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const u = new SpeechSynthesisUtterance(text);
  const v = voices.length ? voices[own ? 0 : Math.floor(r(3) * voices.length)] : null;
  if (v) u.voice = v;
  u.lang = v?.lang ?? "en-GB";
  u.pitch = own?.pitch ?? 0.65 + r(1) * 0.4;
  u.rate = own?.rate ?? 0.95 + r(2) * 0.15;
  u.volume = Math.min(1, 10 / (distance + 10)) * SFX.effectsVolume();
  if (u.volume === 0) return;
  synth.speak(u);
}
