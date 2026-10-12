// One-liners, Duke Nukem style: as you load in, when you stand about too long, when you pick
// something up and when you drop someone. Spoken by the browser's own speech voice, pitched down.
// Where the browser has no speech, it stays quiet.
//
// Each pool is dealt like a shuffled deck, so a line doesn't come round again till the rest have.
// (B P is spelt out so the voice says the letters.)

const LOAD_IN = [
  "Okay... it's time to put that B P in my B P.",
  "Combe Down. Nothing goes down here unless I put it down.",
  "I've got balls of Bath stone.",
  "Hail to the king of the Down, baby.",
  "I came here to kick ass and drink Thatchers. And I'm all out of Thatchers.",
  "Somebody's parked on my verge. Big mistake.",
  "Lock up your wheelie bins. I'm back.",
  "The council sent me. They want this place tidied up.",
  "Who wants a penalty charge notice?",
  "Ah, Combe Down. Fresh air, nice views, and a whole lot of chavs to sort out.",
  "Time to mow some lawns. And some chavs.",
  "Right then. Who's been keying my car?",
  "Mind the potholes. And me.",
  "They mined the stone under this village. Now I'm mining for trouble.",
  "Let's get this street party started.",
  "No ball games. No loitering. No mercy.",
];

const IDLE = [
  "Come on. I haven't got all day.",
  "Is anyone going to shoot something, or what?",
  "I'm not getting any younger standing here.",
  "Nice view. Shame about the chavs.",
  "Hello? Neighbourhood Watch to whoever's driving.",
  "I could be down the pub right now.",
  "Bored now.",
  "Wake me up when something needs shooting.",
  "This is like waiting for the number 2 bus.",
  "Somebody's lawn needs a trim. Let's go.",
  "Are we playing, or are we admiring the stonework?",
  "Hurry up. My pint's getting warm.",
  "I've seen parish council meetings with more action.",
  "Tick tock.",
];

const PICKUP: Record<string, string[]> = {
  pint: [
    "Ahh. That hits the spot.",
    "Cheers. Now where was I?",
    "A pint a day keeps the chavs away.",
    "Real ale. Real man.",
    "Mmm. Breakfast.",
    "Thatchers. The good stuff.",
    "Don't mind if I do.",
    "One for the road. And the next road.",
  ],
  fizz: [
    "Bucks Fizz from the Co-op. Living the dream.",
    "Fizz! I'm good as new.",
    "Bubbles. Fancy.",
    "Ooh, brunch.",
    "That's the good stuff. Well, it's the Co-op stuff.",
    "Full health. Somebody's going to regret that.",
  ],
  ammo: [
    "Groovy.",
    "Now we're talking.",
    "More rounds. More fun.",
    "Christmas came early.",
    "Locked and loaded.",
    "Plenty more where that came from.",
    "That'll do nicely.",
  ],
  sammo: [
    "More long-distance love letters.",
    "Sniper rounds. Somebody's getting a surprise.",
    "Reach out and touch someone.",
    "From the other side of the village. With love.",
  ],
  sniper: [
    "Ooh. I'll be needing this.",
    "Now I can bother people from a long way off.",
    "Big gun. Small village. Perfect.",
    "Let's see what's going on at the other end of the street.",
    "Come to Daddy.",
  ],
};

const KILL_CHAV = [
  "Back to Odd Down with you.",
  "Your trackies are ruined.",
  "Rest in pieces.",
  "Nobody nicks my bike.",
  "That's what I call a chav-ectomy.",
  "Get your Monster off my lawn.",
  "Who's next for the tip?",
  "Burberry's in. You're out.",
  "Should've stayed in the bus shelter.",
  "Penalty charge. Paid in full.",
  "Oi yourself.",
  "And stay off the rec.",
  "Not so lippy now, are you?",
  "That's for my wing mirror.",
  "Go tell your mum.",
  "One less hoodie.",
  "No loitering.",
  "ASBO served.",
];

const KILL_PLAYER = [
  "Rest in pieces.",
  "Welcome to Combe Down.",
  "Should've stayed in Bath.",
  "Nothing personal. Okay, a bit personal.",
  "Respawn and try again, sunshine.",
  "That's going on the scoreboard.",
  "You call that a strategy?",
  "Down you go.",
  "Sorry, neighbour.",
  "I'll tell the parish newsletter.",
  "Penalty charge. Paid in full.",
  "Try the Odd Down server next time.",
  "Ooh. That's got to sting.",
  "And that's why I'm the king.",
];

const GAP = 5;           // seconds of quiet after any line before a pickup or kill gets one
const KILL_CHANCE = 0.5;
const PICKUP_CHANCE = 0.4;

const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;
let quietTill = 0;
const decks = new Map<string[], string[]>();
const lastDealt = new Map<string[], string>();

/** The next line from a pool, dealt from a shuffled deck so none repeats till the rest have had a go. */
function deal(pool: string[]) {
  let deck = decks.get(pool);
  if (!deck?.length) {
    deck = [...pool];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    // the first of a new deck isn't the last of the old one
    if (deck.length > 1 && deck[deck.length - 1] === lastDealt.get(pool)) deck.unshift(deck.pop()!);
    decks.set(pool, deck);
  }
  const line = deck.pop()!;
  lastDealt.set(pool, line);
  return line;
}

/** A deep English voice if there is one: a man's voice, British by preference. */
function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = synth?.getVoices().filter((v) => v.lang.startsWith("en")) ?? [];
  const male = /\bmale|daniel|arthur|george|fred|alex|david|mark|guy|ryan|thomas|oliver/i;
  const man = (v: SpeechSynthesisVoice) => male.test(v.name) && !/female/i.test(v.name);
  return voices.find((v) => v.lang === "en-GB" && man(v))
    ?? voices.find(man)
    ?? voices.find((v) => v.lang === "en-GB")
    ?? voices[0];
}

function say(text: string, delay = 0) {
  if (!synth) return;
  quietTill = performance.now() / 1000 + delay + GAP;
  setTimeout(() => {
    synth.cancel();   // a new line cuts off the last
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.pitch = 0.3;
    u.rate = 0.88;
    synth.speak(u);
  }, delay * 1000);
}

const quiet = () => performance.now() / 1000 < quietTill;

/** You've just dropped into a game. The world gets a beat to appear (and the voices to load) first. */
export function loadIn() {
  say(deal(LOAD_IN), 1.2);
}

/** You've been standing about doing nothing. */
export function idle() {
  if (!quiet()) say(deal(IDLE));
}

/** You picked something up. Sometimes says something about it. */
export function pickup(kind: string) {
  const pool = PICKUP[kind];
  if (pool && !quiet() && Math.random() < PICKUP_CHANCE) say(deal(pool), 0.3);
}

/** You killed a chav or a player. Sometimes says something about it, after the shot and the groan. */
export function kill(chav: boolean) {
  if (!quiet() && Math.random() < KILL_CHANCE) say(deal(chav ? KILL_CHAV : KILL_PLAYER), 0.35);
}

/** Leaving the game: stop talking. */
export function hush() {
  synth?.cancel();
}
