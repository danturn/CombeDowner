// The map's big files (each square, the wider map, the ground kinds) are shipped packed: the same
// object the JSON holds, so the game reads exactly the same map, at a fraction of the download.
// tools/pack_squares.mjs packs them from the JSON when the game is built (vite.config.ts) and checks
// every one decodes back to its JSON exactly; this is the one copy of the format, used by both.
//
// The format, before gzip:
//   "CDP1", the header's length (4 bytes), the header (JSON), then the number streams.
// The header holds the file's object with every number taken out (its skeleton) and says how each
// stream is stored. In the skeleton a number k stands for the next value of stream k, and a list
// [k] for the next list of group k: a list of nothing but numbers, or of such lists, nested the
// same depth all through (a building's outline, the trees, a terrain grid). Every value at the
// same place in the file (all the trees' heights, every building's outline points) goes in one
// stream, so like sits with like. A stream's numbers are whole multiples of 10^-d, where d is the
// most decimals any of them has in the JSON, so n / 10^d gives back the very same number the JSON
// does; they're kept as steps from the one before where that's shorter, then as variable-length
// whole numbers. A stream with numbers that won't go that way is kept as raw doubles.
// Nothing here goes over the network between players.

const MAGIC = 0x31504443; // "CDP1"
const SHORT = 8;          // tuples this long or shorter keep each place in its own stream
const POW = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15];

/** How a stream is stored: n values; d decimals (-1: raw doubles); t how they're kept (0 as they
 *  are, 1 as steps, 2 as point numbers back from the newest: see readStream); e 0 for
 *  variable-length whole numbers or the bytes each takes as byte planes; its length in bytes; and
 *  where its -0s are (the JSON has a few, written as 0 in the stream); and its exceptions, as
 *  place and value pairs: numbers with more decimals than d, written to d in the stream. */
interface Stream { n: number; d: number; t: 0 | 1 | 2; e: number; b: number; z?: number[]; x?: number[] }
/** A group of nested number lists: their depth, the streams of list lengths at each depth, and
 *  the value streams (one per place in a short tuple, or one for all). */
interface Group { D: number; L: number[]; V: number[] }
interface Header { s: unknown; st: Stream[]; g: Group[] }

// ---- reading ----

/** The object a packed file holds, from its bytes once un-gzipped. */
export function unpack(bytes: Uint8Array): any {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error("not a packed map file");
  const hl = dv.getUint32(4, true);
  const head: Header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + hl)));
  let at = 8 + hl;
  const streams = head.st.map((s) => { const v = readStream(bytes, dv, at, s); at += s.b; return v; });
  const pos = new Int32Array(streams.length);
  const next = (k: number) => streams[k][pos[k]++];
  const block = (g: Group, level: number): number[] => {
    const len = next(g.L[level]);
    const out = new Array(len);
    if (level === g.D - 1) {
      if (g.V.length === 1) { const k = g.V[0], s = streams[k]; let p = pos[k]; for (let i = 0; i < len; i++) out[i] = s[p++]; pos[k] = p; }
      else for (let i = 0; i < len; i++) out[i] = next(g.V[i]);
    } else for (let i = 0; i < len; i++) out[i] = block(g, level + 1);
    return out;
  };
  const fill = (o: any) => {
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) {
        const v = o[i];
        if (typeof v === "number") o[i] = next(v);
        else if (Array.isArray(v) && isMarker(v)) o[i] = block(head.g[v[0]], 0);
        else if (v !== null && typeof v === "object") fill(v);
      }
    } else for (const k in o) {
      const v = o[k];
      if (typeof v === "number") o[k] = next(v);
      else if (Array.isArray(v) && isMarker(v)) o[k] = block(head.g[v[0]], 0);
      else if (v !== null && typeof v === "object") fill(v);
    }
  };
  let s = head.s;
  if (typeof s === "number") s = next(s);
  else if (Array.isArray(s) && isMarker(s)) s = block(head.g[s[0]], 0);
  else if (s !== null && typeof s === "object") fill(s);
  return s;
}

/** In a skeleton, a list made only of numbers is always a group's marker: a real one would have
 *  been packed whole. */
const isMarker = (v: unknown[]) => v.length === 1 && typeof v[0] === "number";

function readStream(bytes: Uint8Array, dv: DataView, at: number, s: Stream): Float64Array {
  const n = s.n, out = new Float64Array(n);
  if (s.d < 0) { for (let i = 0; i < n; i++) out[i] = dv.getFloat64(at + 8 * i, true); return out; }
  // first the signed whole numbers, kept to 32-bit sums where they fit, as nearly all do
  if (s.e === 1) for (let i = 0; i < n; i++) { const z = bytes[at + i]; out[i] = (z >>> 1) ^ -(z & 1); }
  else if (s.e === 2) for (let i = 0; i < n; i++) { const z = bytes[at + i] | (bytes[at + n + i] << 8); out[i] = (z >>> 1) ^ -(z & 1); }
  else if (s.e === 3) for (let i = 0; i < n; i++) { const z = bytes[at + i] | (bytes[at + n + i] << 8) | (bytes[at + 2 * n + i] << 16); out[i] = (z >>> 1) ^ -(z & 1); }
  else if (s.e === 4) for (let i = 0; i < n; i++) { const z = (bytes[at + i] | (bytes[at + n + i] << 8) | (bytes[at + 2 * n + i] << 16)) + bytes[at + 3 * n + i] * 16777216; out[i] = z % 2 === 0 ? z / 2 : -(z + 1) / 2; }
  else {
    let q = at;
    for (let i = 0; i < n; i++) {
      let b = bytes[q++], z = b & 127;
      if (b > 127) {
        b = bytes[q++]; z |= (b & 127) << 7;
        if (b > 127) {
          b = bytes[q++]; z |= (b & 127) << 14;
          if (b > 127) {
            b = bytes[q++]; z |= (b & 127) << 21;
            if (b > 127) {
              let f = 268435456;
              do { b = bytes[q++]; z += (b & 127) * f; f *= 128; } while (b > 127);
              out[i] = z % 2 === 0 ? z / 2 : -(z + 1) / 2;
              continue;
            }
          }
        }
      }
      out[i] = (z >>> 1) ^ -(z & 1);
    }
  }
  // then put back what they stand for
  if (s.t === 1) { let acc = 0; for (let i = 0; i < n; i++) out[i] = acc += out[i]; }
  else if (s.t === 2) {
    // steps along a list of point numbers, kept as how far back from the next new point each is
    let hw = -1, last = 0;
    for (let i = 0; i < n; i++) { const idx = hw + 1 - out[i]; if (idx > hw) hw = idx; out[i] = idx - last; last = idx; }
  }
  // division, not multiplying by 0.1s: n / 10^d is exactly the double nearest the decimal
  if (s.d) { const p = POW[s.d]; for (let i = 0; i < n; i++) out[i] /= p; }
  if (s.z) for (const i of s.z) out[i] = -0;
  if (s.x) for (let k = 0; k < s.x.length; k += 2) out[s.x[k]] = s.x[k + 1];
  return out;
}

/** gzip's bytes inflated: by the browser's own DecompressionStream where it has one, else by
 *  inflate() below. Bytes that aren't gzip are handed back as they are, in case a server sent
 *  them with Content-Encoding and the browser has already done it. */
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  if (typeof DecompressionStream !== "undefined") {
    const s = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  return gunzipSync(bytes);
}

/** A packed map file fetched and read, or null if there isn't one. Where only the JSON is there
 *  (a tool serving the map folder before the packs are made), that is read instead. */
export async function fetchPacked(url: string, init?: RequestInit): Promise<any | null> {
  const res = await fetch(url, init).catch(() => null);
  if (res?.ok && !/text\/html/.test(res.headers?.get?.("content-type") ?? "")) return unpack(await gunzip(new Uint8Array(await res.arrayBuffer())));
  const json = url.replace(/\.pack\.gz$/, ".json");
  if (json === url) return null;
  const r2 = await fetch(json, init).catch(() => null);
  return r2?.ok ? r2.json().catch(() => null) : null;
}

/** The packed file's name for a map file's JSON name. */
export const packedName = (jsonUrl: string) => jsonUrl.replace(/\.json$/, ".pack.gz");

// ---- inflate, for browsers without DecompressionStream (before Safari 16.4) ----

const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** A canonical Huffman code: counts of codes of each length, and the symbols in code order. */
interface Huff { count: Uint16Array; sym: Uint16Array }
function huff(lengths: ArrayLike<number>, n: number): Huff {
  const count = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(n);
  for (let i = 0; i < n; i++) count[lengths[i]]++;
  count[0] = 0;
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
  for (let i = 0; i < n; i++) if (lengths[i]) sym[offs[lengths[i]]++] = i;
  return { count, sym };
}

/** Inflate gzip's bytes without the browser's help (RFC 1951 and 1952). Concatenated members are
 *  read one after the other, as gzip itself does. */
export function gunzipSync(src: Uint8Array): Uint8Array {
  let out = new Uint8Array(Math.max(1024, src.length * 4)), op = 0;
  const room = (k: number) => {
    if (op + k <= out.length) return;
    let m = out.length * 2;
    while (m < op + k) m *= 2;
    const o = new Uint8Array(m); o.set(out.subarray(0, op)); out = o;
  };
  let ip = 0, bitbuf = 0, bitcnt = 0;
  const bits = (n: number) => {
    while (bitcnt < n) { if (ip >= src.length) throw new Error("gzip data ends early"); bitbuf |= src[ip++] << bitcnt; bitcnt += 8; }
    const v = bitbuf & ((1 << n) - 1);
    bitbuf >>>= n; bitcnt -= n;
    return v;
  };
  const decode = (h: Huff) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const c = h.count[len];
      if (code - c < first) return h.sym[index + (code - first)];
      index += c; first += c; first <<= 1; code <<= 1;
    }
    throw new Error("bad gzip code");
  };
  const fixedL = new Uint8Array(288); fixedL.fill(8, 0, 144); fixedL.fill(9, 144, 256); fixedL.fill(7, 256, 280); fixedL.fill(8, 280, 288);
  const fixedLit = huff(fixedL, 288), fixedDist = huff(new Uint8Array(30).fill(5), 30);
  while (ip + 18 <= src.length && src[ip] === 0x1f && src[ip + 1] === 0x8b) {
    const flg = src[ip + 3];
    ip += 10;
    if (flg & 4) ip += 2 + (src[ip] | (src[ip + 1] << 8));
    if (flg & 8) while (src[ip++]);
    if (flg & 16) while (src[ip++]);
    if (flg & 2) ip += 2;
    bitbuf = 0; bitcnt = 0;
    let last = 0;
    while (!last) {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0;
        const len = src[ip] | (src[ip + 1] << 8);
        ip += 4;
        room(len); out.set(src.subarray(ip, ip + len), op); op += len; ip += len;
        continue;
      }
      let lit = fixedLit, dist = fixedDist;
      if (type === 2) {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) cl[CLORDER[i]] = bits(3);
        const clh = huff(cl, 19), lens = new Uint8Array(hlit + hdist);
        for (let i = 0; i < hlit + hdist;) {
          const s = decode(clh);
          if (s < 16) lens[i++] = s;
          else {
            let rep = 0, v = 0;
            if (s === 16) { v = lens[i - 1]; rep = 3 + bits(2); } else if (s === 17) rep = 3 + bits(3); else rep = 11 + bits(7);
            while (rep--) lens[i++] = v;
          }
        }
        lit = huff(lens.subarray(0, hlit), hlit); dist = huff(lens.subarray(hlit), hdist);
      } else if (type !== 1) throw new Error("bad gzip block");
      for (;;) {
        const s = decode(lit);
        if (s < 256) { room(1); out[op++] = s; continue; }
        if (s === 256) break;
        const len = LBASE[s - 257] + bits(LEXT[s - 257]);
        const ds = decode(dist);
        const d = DBASE[ds] + bits(DEXT[ds]);
        room(len);
        for (let i = 0; i < len; i++, op++) out[op] = out[op - d];
      }
    }
    ip += 8;
  }
  return out.slice(0, op);
}

// ---- writing (the build's packer, tools/pack_squares.mjs; never in the game) ----

/** How many decimals a number's shortest form has, and it as a whole number of those. */
function digits(x: number): { d: number; m: bigint } | null {
  if (!Number.isFinite(x)) return null;
  const s = String(x);
  const e = s.indexOf("e");
  const mant = e < 0 ? s : s.slice(0, e), exp = e < 0 ? 0 : Number(s.slice(e + 1));
  const dot = mant.indexOf(".");
  const frac = dot < 0 ? 0 : mant.length - dot - 1;
  let m = BigInt(mant.replace(".", ""));
  let d = frac - exp;
  if (d < 0) { m *= 10n ** BigInt(-d); d = 0; }
  return { d, m };
}

const zz = (n: number) => (n >= 0 ? 2 * n : -2 * n - 1);
function varints(z: number[]): Uint8Array {
  const out = new Uint8Array(z.length * 8);
  let o = 0;
  for (let v of z) {
    while (v > 127) { out[o++] = (v % 128) | 128; v = Math.floor(v / 128); }
    out[o++] = v;
  }
  return out.subarray(0, o);
}
function planes(z: number[], w: number): Uint8Array {
  const n = z.length, out = new Uint8Array(n * w);
  for (let i = 0; i < n; i++) { let v = z[i]; for (let k = 0; k < w; k++) { out[k * n + i] = v % 256; v = Math.floor(v / 256); } }
  return out;
}
const LIMIT = 2 ** 51;

/** The writer's measure of how small some bytes will be once gzipped (vite.config's packer passes
 *  zlib's; without one, the shortest wins). */
export type Measure = (b: Uint8Array) => number;

/** A stream's numbers, stored the shortest exact way. A few with more decimals than the rest
 *  (a fence's corner at 1 cm among ones at 10 cm) can go as exceptions, so the rest keep fewer. */
function writeStream(vals: number[], measure: Measure): { s: Stream; bytes: Uint8Array } {
  const ds = vals.map(digits);
  let top = 0, ok = ds.every((x) => x !== null);
  if (ok) for (const x of ds) if (x!.d > top) top = x!.d;
  ok &&= top < POW.length;
  const negz: number[] = [];
  vals.forEach((v, i) => { if (Object.is(v, -0)) negz.push(i); });
  let best: { s: Stream; bytes: Uint8Array; size: number } | null = null;
  for (let d = top; ok && d >= Math.max(0, top - 2); d--) {
    const ints: number[] = [], x: number[] = [];
    let fits = true;
    for (let i = 0; i < vals.length; i++) {
      const q = ds[i]!;
      let m = q.m;
      if (q.d > d) {
        // an exception: kept whole in the header, and near enough in the stream to keep its steps small
        const f = 10n ** BigInt(q.d - d);
        m = (m >= 0n ? m + f / 2n : m - f / 2n) / f;
        x.push(i, vals[i]);
      } else m *= 10n ** BigInt(d - q.d);
      if (m >= BigInt(LIMIT) || m <= -BigInt(LIMIT)) { fits = false; break; }
      ints.push(Number(m));
    }
    if (!fits || x.length > vals.length / 5) break;
    // and each has to come back as the very same double
    for (let i = 0, k = 0; i < vals.length; i++) {
      if (k < x.length && x[k] === i) { k += 2; continue; }
      if ((d ? ints[i] / POW[d] : ints[i]) !== vals[i]) { fits = false; break; }
    }
    if (!fits) { if (d === top) ok = false; break; }
    const extra = x.length ? measure(new TextEncoder().encode(JSON.stringify(x))) : 0;
    const ways: [0 | 1 | 2, number[]][] = [[0, ints], [1, ints.map((v, i) => v - (i ? ints[i - 1] : 0))]];
    {
      let hw = -1, idx = 0, fine = true;
      const back = ints.map((v) => { idx += v; const c = hw + 1 - idx; if (Math.abs(idx) >= LIMIT || Math.abs(c) >= LIMIT) fine = false; if (idx > hw) hw = idx; return c; });
      if (fine && ints.length > 64) ways.push([2, back]);
    }
    for (const [t, v] of ways) {
      const z = v.map(zz);
      const most = z.reduce((a, b) => Math.max(a, b), 0);
      const w = most < 256 ? 1 : most < 65536 ? 2 : most < 2 ** 24 ? 3 : most < 2 ** 32 ? 4 : 0;
      const tries: [number, Uint8Array][] = [[0, varints(z)]];
      if (w && z.length > 64) tries.push([w, planes(z, w)]);
      for (const [e, bytes] of tries) {
        const size = measure(bytes) + extra;
        if (!best || size < best.size) best = { s: { n: vals.length, d, t, e, b: bytes.length, ...(negz.length ? { z: negz } : {}), ...(x.length ? { x } : {}) }, bytes, size };
      }
    }
  }
  if (!ok || !best) {
    const bytes = new Uint8Array(vals.length * 8), dv = new DataView(bytes.buffer);
    vals.forEach((v, i) => dv.setFloat64(8 * i, v, true));
    return { s: { n: vals.length, d: -1, t: 0, e: 0, b: bytes.length }, bytes };
  }
  return best;
}

/** How deep a list of numbers (or of such lists, the same depth all through) goes; 0 if it isn't one. */
function depth(v: unknown[]): number {
  if (v.every((e) => typeof e === "number")) return 1;
  let d = -1;
  for (const e of v) {
    if (!Array.isArray(e)) return 0;
    const k = depth(e);
    if (!k || (d >= 0 && k !== d)) return 0;
    d = k;
  }
  return d + 1;
}

/** The bytes of a map file's object, packed (to be gzipped). */
export function pack(obj: unknown, measure: Measure = (b) => b.length): Uint8Array {
  const scalars = new Map<string, number[]>();
  const groups = new Map<string, { D: number; blocks: unknown[][] }>();
  const sid = new Map<string, number>(), gid = new Map<string, number>();
  const id = (m: Map<string, number>, k: string) => { let i = m.get(k); if (i === undefined) m.set(k, (i = m.size)); return i; };
  const walk = (v: unknown, p: string): unknown => {
    if (typeof v === "number") {
      const k = id(sid, p);
      let a = scalars.get(p); if (!a) scalars.set(p, (a = []));
      a.push(v);
      return k;
    }
    if (Array.isArray(v)) {
      const D = depth(v);
      if (D) {
        const key = `${p}#${D}`, k = id(gid, key);
        let g = groups.get(key); if (!g) groups.set(key, (g = { D, blocks: [] }));
        g.blocks.push(v);
        return [k];
      }
      // a short list's numbers and strings by place (a fence's kind, then its height...), else all as one
      return v.map((e, i) => walk(e, p + (v.length <= SHORT && (e === null || typeof e !== "object") ? `[${i}]` : "[]")));
    }
    if (v !== null && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(v)) o[k] = walk((v as Record<string, unknown>)[k], p + "." + k);
      return o;
    }
    return v;
  };
  const s = walk(obj, "");
  const st: Stream[] = [], parts: Uint8Array[] = [];
  const add = (vals: number[]) => { const w = writeStream(vals, measure); st.push(w.s); parts.push(w.bytes); return st.length - 1; };
  // scalar streams first, so stream k is the skeleton's number k
  for (const [p] of [...sid.entries()].sort((a, b) => a[1] - b[1])) add(scalars.get(p)!);
  const g: Group[] = [];
  for (const [key] of [...gid.entries()].sort((a, b) => a[1] - b[1])) {
    const { D, blocks } = groups.get(key)!;
    const lens: number[][] = Array.from({ length: D }, () => []);
    const leaves: number[][] = [];
    const visit = (l: unknown[], level: number) => {
      lens[level].push(l.length);
      if (level === D - 1) leaves.push(l as number[]);
      else for (const c of l) visit(c as unknown[], level + 1);
    };
    for (const b of blocks) visit(b, 0);
    const split = leaves.every((l) => l.length <= SHORT);
    const width = split ? Math.max(0, ...leaves.map((l) => l.length)) : 1;
    const cols: number[][] = Array.from({ length: Math.max(1, width) }, () => []);
    for (const l of leaves) if (split) l.forEach((x, i) => cols[i].push(x)); else for (const x of l) cols[0].push(x);
    g.push({ D, L: lens.map(add), V: cols.map(add) });
  }
  const head = new TextEncoder().encode(JSON.stringify({ s, st, g }));
  const total = 8 + head.length + parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, head.length, true);
  out.set(head, 8);
  let at = 8 + head.length;
  for (const b of parts) { out.set(b, at); at += b.length; }
  return out;
}
