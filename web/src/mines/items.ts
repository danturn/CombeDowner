// Relics: what turns up in chests. Each one changes how you play for the rest of the run, and they
// stack, so no two runs go the same way.

/** Who you go down as. Chosen on the way in, kept for the run. */
export type ClassId = "quarryman" | "archer" | "mage";
export interface ClassDef { name: string; blurb: string; hp: number; how: string }
export const CLASSES: Record<ClassId, ClassDef> = {
  quarryman: { name: "Quarryman", hp: 130, blurb: "A pick and a strong back. Tough, and hits hard up close.",
    how: "Click to swing. Chests can turn up a sledgehammer or a freestone saw." },
  archer: { name: "Poacher", hp: 90, blurb: "A longbow from the Prior Park woods. Deadly at range, fragile up close.",
    how: "Hold the mouse button to draw, let go to loose. A full draw hits much harder." },
  mage: { name: "Bladud's heir", hp: 80, blurb: "Hot-spring magic from Bath's legendary king. Fire for monsters, light that heals friends.",
    how: "Click for a fire bolt. Right click for a healing light on everyone near you. Both use mana." },
};
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

export interface Weapon { name: string; dmg: number; cd: number; reach: number; arc: number; cleave: boolean }
export const WEAPONS: Record<string, Weapon> = {
  pick: { name: "Pick", dmg: 15, cd: 0.55, reach: 2.3, arc: 1.0, cleave: false },
  sledge: { name: "Sledgehammer", dmg: 36, cd: 1.05, reach: 2.5, arc: 1.4, cleave: true },
  saw: { name: "Freestone saw", dmg: 9, cd: 0.27, reach: 2.1, arc: 0.8, cleave: false },
};

export interface Relic { name: string; blurb: string; once?: boolean; cursed?: boolean }
export const RELICS: Record<string, Relic> = {
  davy: { name: "Davy lamp", blurb: "Your light reaches twice as far" },
  hobnails: { name: "Hobnail boots", blurb: "Faster on your feet" },
  lardy: { name: "Lardy cake", blurb: "25 more health, for good" },
  oliver: { name: "Tin of Bath Olivers", blurb: "You slowly heal" },
  ammonite: { name: "Ammonite", blurb: "Every hit heals you a little" },
  sledge: { name: "Sledgehammer", blurb: "Slow, but it hits everything in front of you" },
  saw: { name: "Freestone saw", blurb: "Weak but very fast" },
  lucozade: { name: "Lucozade", blurb: "Double damage for 30 seconds", once: true },
  fizz: { name: "Co-op Bucks Fizz", blurb: "Fills you right up", once: true },
  bat: { name: "Horseshoe bat charm", blurb: "Bats leave you alone" },
  blackdog: { name: "The Black Dog", blurb: "Cursed: you hit much harder, but have less health", cursed: true },
  mason: { name: "Mason's mark", blurb: "One hit in five does triple damage" },
  echo: { name: "Echo stone", blurb: "Monsters show on your map" },
  tea: { name: "Flask of tea", blurb: "You pick up fallen friends three times as fast" },
  // bosses' weaknesses (gen.ts WEAKNESS): carry one and hit its boss twice as hard, and stagger it
  vinegar: { name: "Stone jar of malt vinegar", blurb: "Eats lime mortar. Whatever's down there made of it won't like this" },
  spanner: { name: "Engineman's spanner", blurb: "A great iron spanner off a Cornish pumping engine. Strips valves and stays" },
  spring: { name: "Flask of Lyncombe spring water", blurb: "Ice-cold from the spring. It would quench anything that burns" },
  lampoil: { name: "Can of lamp oil", blurb: "Splash it and light it: nothing frozen stands up to burning oil" },
  deeds: { name: "Ralph Allen's deeds", blurb: "The deeds to the quarries, signed and sealed. A ghost who owned them can't bear the sight" },
  smokepot: { name: "Brimstone smoke-pot", blurb: "Smokes out spiders, big ones especially" },
  gravesalt: { name: "Pouch of grave salt", blurb: "Burns the restless dead. The Gaffer's gang fear it" },
  paybook: { name: "The pit paybook", blurb: "The Foreman's own book, with his cheating in it. He comes apart over it" },
  mallet: { name: "Banker mason's mallet", blurb: "Finds the bed in any stone and splits it. Golems hate it" },
};

export interface Stats {
  cls: ClassId; maxHp: number; speed: number; dmg: number; regen: number; heal: number; light: number;
  crit: number; revive: number; batSafe: boolean; echo: boolean; weapon: Weapon;
}

/** What your relics add up to. */
export function stats(relics: string[], cls: ClassId = "quarryman"): Stats {
  const n = (k: string) => relics.filter((r) => r === k).length;
  // the newest weapon you found is the one you use; archers and mages get stronger from them instead
  const lastWeapon = [...relics].reverse().find((r) => r in WEAPONS);
  const melee = cls === "quarryman";
  return {
    cls,
    maxHp: CLASSES[cls].hp + 25 * n("lardy") - 25 * n("blackdog"),
    speed: 1 + 0.18 * n("hobnails"),
    dmg: 1 + 0.6 * n("blackdog") + (melee ? 0 : 0.25 * (n("sledge") + n("saw"))),
    regen: 1.2 * n("oliver"),
    heal: 2.5 * n("ammonite"),
    light: 1 + n("davy"),
    crit: Math.min(0.6, 0.2 * n("mason")),
    revive: n("tea") ? 3 : 1,
    batSafe: n("bat") > 0,
    echo: n("echo") > 0,
    weapon: WEAPONS[(melee && lastWeapon) || "pick"],
  };
}
