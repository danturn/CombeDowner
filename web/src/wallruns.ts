// Which of a building's outline edges the game draws as one wall (world.ts addBuilding), shared with
// the clash check (tools/roofs_drawn.ts). Nothing here is decided over the network.

/** A ring's walls as runs of edges in one straight line, each [first corner, edges in it]: a wall
 *  is drawn whole along its run, so the points a roof that follows the outline adds along a gable
 *  wall, often a few centimetres apart, neither leave a slit of sky nor restart its windows. */
export function wallRuns(ring: number[][]): [number, number][] {
  const n = ring.length, STRAIGHT = 0.01;
  const at = (i: number) => ring[((i % n) + n) % n];
  const inLine = (s0: number, k: number) => {
    const a = at(s0), q = at(s0 + k), dx = q[0] - a[0], dy = q[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-3) return true;
    for (let j = 1; j < k; j++) {
      const p = at(s0 + j), t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L;
      if (t < -STRAIGHT || t > L + STRAIGHT || Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L > STRAIGHT) return false;
    }
    return true;
  };
  // start at a corner, so no run is cut where the ring closes
  let start = 0;
  for (let i = 0; i < n; i++) if (!inLine(i - 1, 2)) { start = i; break; }
  const runs: [number, number][] = [];
  for (let s0 = start, done = 0; done < n;) {
    let k = 1;
    while (done + k < n && inLine(s0, k + 1)) k++;
    runs.push([s0 % n, k]);
    s0 += k; done += k;
  }
  return runs;
}

/** Metres of a ring's outline the game draws no wall along: runs too short to draw. */
export function wallLeftOpen(ring: number[][]): number {
  const n = ring.length;
  let open = 0;
  for (const [s0, k] of wallRuns(ring)) {
    const a = ring[s0], q = ring[(s0 + k) % n];
    if (Math.hypot(q[0] - a[0], q[1] - a[1]) >= 1e-3) continue;
    for (let j = 0; j < k; j++) {
      const p = ring[(s0 + j) % n], r = ring[(s0 + j + 1) % n];
      open += Math.hypot(r[0] - p[0], r[1] - p[1]);
    }
  }
  return open;
}
