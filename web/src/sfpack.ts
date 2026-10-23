// A square's street faces (map.ts `sf`) are written packed, which takes a third off their download:
// each point as whole centimetres from the one before it, from the square's corner `o`, and each
// list of point numbers as the step from the number before. This puts them back as the game reads them.
// Nothing here goes over the network.

const LISTS = ["road", "service", "pave", "path", "front", "drive"] as const;

const unstep = (a: number[]) => { for (let k = 1; k < a.length; k++) a[k] += a[k - 1]; };

/** Unpack a square's `sf` in place, if it came packed. */
export function unpackSurfaces(d: any) {
  const sf = d?.sf;
  if (!sf?.o) return;
  const v: number[] = sf.v, o = [sf.o[0], sf.o[1], 0];
  const at = [0, 0, 0];
  for (let k = 0; k < v.length; k++) { const a = k % 3; at[a] += v[k]; v[k] = o[a] + at[a] / 100; }
  for (const name of LISTS) if (sf[name]) unstep(sf[name]);
  for (const e of sf.e) unstep(e.i);
  delete sf.o;
}
