// Whole paintings for tools/critics_probe.mjs to mark: careful, full-canvas scenes of the evening's
// subjects, half-done and off-colour ones, and lazy ones, each painted in layers in the order a
// painter would (the ground first), with the easel's note of how it went. The layers are also what
// the time-lapse replays, so each one is a frame of it.
//
// tier: what the room ought to make of it. good: about 8 to 9 on average, a critic at 9.5 or more;
// mid: about 5.5 to 6.5; lazy: about 2 to 4; twist: anything, it is there for what is said about it.

/** d: the probe's drawing kit (canvas, rect, disc, ring, ellipse, line, poly, write, rand) and C. */
export function scenes(d) {
  const { C, W, H, rect, disc, ring, ellipse, line, poly, write, rand, put } = d;
  const careful = (o) => ({ secs: 96, undos: 6, big: 22, fine: 62, ruled: 12, ground: true, wobble: 5, ...o });
  const out = [];
  const add = (name, tier, theme, strokes, how, layers) => out.push({ name, tier, theme, strokes, how, layers });

  // a row of Bath terraces: stone fronts, roofs, chimneys, windows; from x0 to x1, eaves at y
  const terrace = (p, x0, x1, y, h, roof, win, lit) => {
    const n = Math.max(2, Math.round((x1 - x0) / 34)), w = (x1 - x0) / n;
    for (let k = 0; k < n; k++) {
      const a = x0 + k * w, b = a + w;
      rect(p, a, y, b - 1, y + h, C.stone);
      poly(p, [[a - 2, y], [a + w / 2, y - 16 - (k % 2) * 4], [b + 1, y]], roof);
      rect(p, a + w * 0.65, y - 24 - (k % 2) * 4, a + w * 0.65 + 5, y - 10, C.stone);
      rect(p, a + w * 0.65, y - 27 - (k % 2) * 4, a + w * 0.65 + 2, y - 24 - (k % 2) * 4, C.orange);
      for (const fx of [0.2, 0.6]) for (const fy of [0.18, 0.55]) {
        const wx = a + w * fx, wy = y + h * fy;
        rect(p, wx, wy, wx + 8, wy + 11, win);
        if (lit && (k + fx * 10 + fy * 10) % 3 < 1.6) rect(p, wx + 1, wy + 1, wx + 7, wy + 10, lit);
        line(p, wx + 4, wy, wx + 4, wy + 11, C.pale, 1);
      }
    }
  };
  const chips = (p, x, y) => {
    poly(p, [[x, y], [x + 16, y], [x + 13, y + 14], [x + 3, y + 14]], C.red);
    for (let k = 0; k < 6; k++) line(p, x + 2 + k * 2.4, y + 1, x + 1 + k * 2.6, y - 7 - (k % 3) * 2, C.yellow, 2);
  };
  const gull = (p, x, y, s, ang) => {
    ellipse(p, x, y, 26 * s, 10 * s, ang, C.pale);
    poly(p, [[x - 8 * s, y - 4 * s], [x - 30 * s, y - 34 * s], [x - 40 * s, y - 30 * s], [x + 4 * s, y - 2 * s]], C.grey);
    poly(p, [[x - 30 * s, y - 34 * s], [x - 40 * s, y - 30 * s], [x - 36 * s, y - 26 * s]], C.black);
    poly(p, [[x + 2 * s, y - 4 * s], [x + 18 * s, y - 30 * s], [x + 28 * s, y - 28 * s], [x + 12 * s, y]], C.grey);
    disc(p, x + 24 * s * Math.cos(ang), y + 24 * s * Math.sin(ang) - 2 * s, 8 * s, C.pale);
    const bx = x + 31 * s * Math.cos(ang), by = y + 31 * s * Math.sin(ang) - 2 * s;
    poly(p, [[bx, by - 2 * s], [bx + 12 * s, by + 4 * s], [bx, by + 3 * s]], C.yellow);
    disc(p, bx - 4 * s, by - 3 * s, 1.5 * s, C.black);
  };
  const vee = (p, x, y, s) => { line(p, x - s, y - s * 0.5, x, y, C.black, 1); line(p, x, y, x + s, y - s * 0.5, C.black, 1); };
  const person = (p, x, y, coat) => {
    rect(p, x - 7, y + 30, x - 2, y + 52, C.navy); rect(p, x + 2, y + 30, x + 7, y + 52, C.navy);
    rect(p, x - 9, y + 50, x - 1, y + 54, C.black); rect(p, x + 1, y + 50, x + 9, y + 54, C.black);
    ellipse(p, x, y + 18, 12, 16, 0, coat);
    disc(p, x, y - 4, 9, C.pink);
    region9(p, x, y - 4, 9, C.brown);
    disc(p, x - 3, y - 5, 1.2, C.black); disc(p, x + 3, y - 5, 1.2, C.black);
    disc(p, x, y + 1, 2.4, C.black);
  };
  // hair on the top half of a head
  const region9 = (p, x, y, r, c) => { for (let yy = -r; yy < -r / 3; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r) put(p, x + xx, y + yy, c); };
  const cat = (p, x, y, s, c, eye) => {
    ellipse(p, x, y + 28 * s, 26 * s, 30 * s, 0, c);
    disc(p, x, y - 14 * s, 20 * s, c);
    poly(p, [[x - 18 * s, y - 20 * s], [x - 16 * s, y - 46 * s], [x - 2 * s, y - 30 * s]], c);
    poly(p, [[x + 18 * s, y - 20 * s], [x + 16 * s, y - 46 * s], [x + 2 * s, y - 30 * s]], c);
    for (let k = 0; k < 18; k++) disc(p, x + 22 * s + k * 2.2 * s, y + 56 * s - k * 0.4 * s, 3 * s, c);
    disc(p, x - 8 * s, y - 16 * s, 4 * s, eye); disc(p, x + 8 * s, y - 16 * s, 4 * s, eye);
    line(p, x - 8 * s, y - 19 * s, x - 8 * s, y - 13 * s, C.black, 1); line(p, x + 8 * s, y - 19 * s, x + 8 * s, y - 13 * s, C.black, 1);
    poly(p, [[x - 3 * s, y - 8 * s], [x + 3 * s, y - 8 * s], [x, y - 5 * s]], C.pink);
    for (const sd of [-1, 1]) for (const k of [-1, 1]) line(p, x + sd * 6 * s, y - 6 * s, x + sd * 22 * s, y - 6 * s + k * 4 * s, C.pale, 1);
  };
  const bus = (p, x0, y0, x1, y1, win) => {
    rect(p, x0, y0, x1, y1, C.red);
    rect(p, x0, y0, x1, y0 + 3, C.black);
    const n = Math.floor((x1 - x0 - 24) / 22);
    for (let k = 0; k < n; k++) {
      rect(p, x0 + 6 + k * 22, y0 + 8, x0 + 22 + k * 22, y0 + 22, win);
      rect(p, x0 + 6 + k * 22, y0 + 30, x0 + 22 + k * 22, y0 + 42, win);
    }
    rect(p, x1 - 16, y0 + 8, x1 - 4, y1 - 12, C.black);
    rect(p, x0 + 4, y0 + 25, x1 - 4, y0 + 27, C.pale);
    disc(p, x0 + 28, y1, 10, C.black); disc(p, x1 - 32, y1, 10, C.black);
    disc(p, x0 + 28, y1, 4, C.grey); disc(p, x1 - 32, y1, 4, C.grey);
    disc(p, x1 - 3, y1 - 8, 3, C.yellow);
  };

  // ---- good: full canvas, on the subject, ground first, fine brush, the whole time used ------------
  add("Seagull's revenge (careful)", "good", "A seagull's revenge", 96, careful({}), [
    (p) => rect(p, 0, 0, W, H, C.sky),
    (p) => { ellipse(p, 50, 28, 30, 10, 0, C.pale); ellipse(p, 175, 20, 36, 11, 0, C.pale); ellipse(p, 120, 46, 20, 6, 0, C.pale); },
    (p) => terrace(p, 0, W, 112, 26, C.grey, C.navy, null),
    (p) => { rect(p, 0, 140, W, H, C.grey); line(p, 0, 140, W, 140, C.pale, 2); for (let x = 8; x < W; x += 30) line(p, x, 150, x + 10, 172, C.pale, 1); },
    (p) => person(p, 176, 96, C.blue),
    (p) => chips(p, 150, 112),
    (p) => gull(p, 92, 74, 1.1, 0.42),
    (p) => { vee(p, 30, 60, 8); vee(p, 210, 52, 7); vee(p, 190, 72, 5); },
  ]);
  add("Last orders (careful)", "good", "Last orders at {pub}", 104, careful({}), [
    (p) => rect(p, 0, 0, W, H, C.brown),
    (p) => { rect(p, 0, 0, W, 8, C.black); for (let x = 0; x < W; x += 60) rect(p, x, 0, x + 6, 70, C.black); },
    (p) => { for (const [x, y] of [[40, 22], [120, 18], [200, 22]]) { disc(p, x, y, 13, C.orange); disc(p, x, y, 7, C.yellow); } },
    (p) => { rect(p, 10, 58, 230, 61, C.stone); for (let k = 0; k < 18; k++) { const x = 16 + k * 12; rect(p, x, 40, x + 5, 58, [C.dkgreen, C.green, C.orange, C.navy][k % 4]); rect(p, x + 1, 35, x + 4, 40, C.black); } },
    (p) => { rect(p, 150, 66, 220, 92, C.black); write(p, "LAST", 156, 70, 2, C.yellow); write(p, "ORDERS", 154, 84, 1.3, C.yellow); },
    (p) => person(p, 100, 72, C.black),
    (p) => { rect(p, 0, 120, W, 126, C.stone); rect(p, 0, 126, W, H, C.navy); for (let x = 6; x < W; x += 40) rect(p, x, 134, x + 30, 168, C.black), rect(p, x + 3, 137, x + 27, 165, C.navy); },
    (p) => { for (const x of [30, 62, 160, 196]) { rect(p, x, 98, x + 12, 120, C.yellow); rect(p, x, 96, x + 12, 101, C.pale); line(p, x + 12, 104, x + 16, 110, C.pale, 1); } },
    (p) => { disc(p, 60, 36, 9, C.pale); ring(p, 60, 36, 9, C.black, 1); line(p, 60, 36, 60, 30, C.black, 1); line(p, 60, 36, 64, 36, C.black, 1); },
  ]);
  add("Night bus home (careful)", "good", "The night bus home", 92, careful({}), [
    (p) => rect(p, 0, 0, W, H, C.navy),
    (p) => { const r = rand(5); for (let k = 0; k < 40; k++) put(p, r() * W, r() * 70, r() < 0.3 ? C.yellow : C.pale); },
    (p) => { disc(p, 196, 30, 14, C.yellow); disc(p, 202, 26, 12, C.navy); },
    (p) => { for (let k = 0; k < 7; k++) { const x = k * 36, h = 40 + (k % 3) * 12; rect(p, x, 120 - h, x + 34, 120, C.black); poly(p, [[x - 2, 120 - h], [x + 17, 104 - h], [x + 36, 120 - h]], C.black); for (const wy of [120 - h + 8, 120 - h + 24]) if ((k + wy) % 3) rect(p, x + 8, wy, x + 16, wy + 9, C.yellow); } },
    (p) => { rect(p, 0, 120, W, H, C.black); rect(p, 0, 120, W, 126, C.grey); for (let x = 4; x < W; x += 28) rect(p, x, 160, x + 14, 163, C.yellow); },
    (p) => { line(p, 24, 50, 24, 126, C.grey, 3); disc(p, 24, 48, 9, C.orange); disc(p, 24, 48, 5, C.yellow); },
    (p) => bus(p, 50, 72, 214, 140, C.yellow),
    (p) => { rect(p, 60, 66, 120, 72, C.black); write(p, "BATH", 64, 67, 0.8, C.yellow); for (let k = 0; k < 6; k++) disc(p, 216 + k * 4, 132 + (k % 2), 2, C.yellow); },
  ]);
  add("Sunrise over rooftops (careful)", "good", "Sunrise over the rooftops", 88, careful({}), [
    (p) => { rect(p, 0, 0, W, 34, C.pink); rect(p, 0, 34, W, 66, C.orange); rect(p, 0, 66, W, 110, C.yellow); },
    (p) => { for (let x = 0; x < W; x += 3) { put(p, x, 34 + (x % 6 ? 1 : -1), C.pink); put(p, x + 1, 66 + (x % 6 ? 1 : -1), C.orange); } },
    (p) => { disc(p, 120, 96, 34, C.orange); disc(p, 120, 96, 28, C.yellow); for (let k = 0; k < 12; k++) { const a = Math.PI + (k * Math.PI) / 11; line(p, 120 + Math.cos(a) * 40, 96 + Math.sin(a) * 40, 120 + Math.cos(a) * 56, 96 + Math.sin(a) * 56, C.red, 2); } },
    (p) => { vee(p, 40, 30, 7); vee(p, 60, 22, 5); vee(p, 190, 40, 6); },
    (p) => terrace(p, 0, W, 112, 52, C.red, C.navy, C.yellow),
    (p) => { rect(p, 0, 164, W, H, C.grey); line(p, 0, 164, W, 164, C.stone, 2); },
    (p) => { for (let x = 10; x < W; x += 34) { rect(p, x + 12, 146, x + 20, 164, C.brown); } },
  ]);
  add("Cat owns the street (careful)", "good", "A cat who owns the street", 100, careful({}), [
    (p) => rect(p, 0, 0, W, 60, C.sky),
    (p) => { disc(p, 24, 16, 10, C.yellow); ellipse(p, 150, 16, 30, 7, 0, C.pale); },
    (p) => terrace(p, 0, W, 48, 72, C.grey, C.navy, null),
    (p) => { rect(p, 30, 102, 42, 120, C.dkgreen); rect(p, 166, 102, 178, 120, C.green); },
    (p) => { rect(p, 0, 120, W, 140, C.stone); rect(p, 0, 140, W, H, C.grey); line(p, 0, 140, W, 140, C.black, 1); for (let x = 0; x < W; x += 24) line(p, x, 120, x + 4, 140, C.brown, 1); rect(p, 0, 116, W, 120, C.green); },
    (p) => { rect(p, 20, 126, 24, 136, C.pale); rect(p, 200, 126, 204, 136, C.pale); },
    (p) => cat(p, 118, 118, 1.05, C.black, C.yellow),
    (p) => { for (let x = 60; x < 190; x += 14) line(p, x, 168, x + 6, 168, C.pale, 1); },
  ]);

  // ---- mediocre: half-done, or the subject in the wrong colours ---------------------------------
  const halfway = (o) => ({ secs: 52, undos: 2, big: 30, fine: 30, ruled: 10, ground: false, wobble: 9, ...o });
  add("Night bus, half-done", "mid", "The night bus home", 22, halfway({}), [
    (p) => rect(p, 0, 0, W, 70, C.navy),
    (p) => { disc(p, 196, 30, 12, C.yellow); },
    (p) => { rect(p, 60, 90, 180, 130, C.red); for (let k = 0; k < 4; k++) rect(p, 68 + k * 26, 98, 84 + k * 26, 110, C.yellow); },
  ]);
  add("Sunrise, off-colour", "mid", "Sunrise over the rooftops", 30, halfway({ secs: 61 }), [
    (p) => rect(p, 0, 0, W, 110, C.green),
    (p) => disc(p, 120, 70, 26, C.blue),
    (p) => { for (let k = 0; k < 5; k++) { const x = k * 48; rect(p, x + 4, 110, x + 44, 170, C.purple); poly(p, [[x, 110], [x + 24, 92], [x + 48, 110]], C.navy); } },
  ]);
  add("Seagull, half-done", "mid", "A seagull's revenge", 26, halfway({}), [
    (p) => rect(p, 0, 0, W, 60, C.sky),
    (p) => { ellipse(p, 100, 70, 28, 10, 0.3, C.grey); poly(p, [[90, 66], [70, 40], [104, 66]], C.grey); poly(p, [[124, 78], [138, 82], [124, 84]], C.yellow); },
    (p) => { disc(p, 180, 100, 10, C.pink); line(p, 180, 110, 180, 150, C.black, 2); line(p, 165, 125, 195, 125, C.black, 2); line(p, 180, 150, 170, 172, C.black, 2); line(p, 180, 150, 190, 172, C.black, 2); },
  ]);
  add("Cat, rough", "mid", "A cat who owns the street", 18, halfway({ secs: 44 }), [
    (p) => rect(p, 0, 120, W, 150, C.stone),
    (p) => { ellipse(p, 120, 108, 26, 24, 0, C.black); disc(p, 120, 74, 18, C.black); poly(p, [[104, 68], [106, 46], [118, 60]], C.black); poly(p, [[136, 68], [134, 46], [122, 60]], C.black); },
    (p) => { disc(p, 113, 72, 3, C.yellow); disc(p, 127, 72, 3, C.yellow); },
  ]);
  add("Pub, unfinished", "mid", "Last orders at {pub}", 16, halfway({ secs: 40 }), [
    (p) => rect(p, 0, 0, W, 90, C.brown),
    (p) => rect(p, 0, 120, W, 132, C.black),
    (p) => { for (const x of [60, 150]) { rect(p, x, 96, x + 14, 120, C.yellow); rect(p, x, 93, x + 14, 98, C.pale); } },
  ]);

  // ---- lazy: one blob, a scribble, a couple of strokes ---------------------------------------------
  add("One orange blob", "lazy", "Sunrise over the rooftops", 1, { secs: 3, undos: 0, big: 100, fine: 0, ruled: 0, ground: false, wobble: 0 }, [
    (p) => disc(p, 120, 90, 26, C.orange),
  ]);
  add("Cat, quick scribble", "lazy", "A cat who owns the street", 6, { secs: 11, undos: 0, big: 0, fine: 100, ruled: 0, ground: false, wobble: 21 }, [
    (p) => { const r = rand(17); let x = 110, y = 90; for (let k = 0; k < 22; k++) { const nx = 90 + r() * 60, ny = 60 + r() * 70; line(p, x, y, nx, ny, C.black, 1); x = nx; y = ny; } ring(p, 120, 70, 14, C.black, 1); },
  ]);
  add("Two navy strokes", "lazy", "The night bus home", 2, { secs: 5, undos: 0, big: 100, fine: 0, ruled: 0, ground: false, wobble: 3 }, [
    (p) => { line(p, 30, 60, 210, 70, C.navy, 12); line(p, 40, 110, 200, 120, C.navy, 12); },
  ]);
  add("One gull, one line", "lazy", "A seagull's revenge", 2, { secs: 4, undos: 0, big: 0, fine: 100, ruled: 0, ground: false, wobble: 0 }, [
    (p) => vee(p, 120, 90, 18),
  ]);
  add("Left blank", "lazy", "Last orders at {pub}", 0, undefined, []);

  // ---- a change of mind: started as one thing, finished as another -----------------------------------
  add("Started a cat, ended a bus", "good", "The night bus home", 84, careful({ undos: 9 }), [
    (p) => rect(p, 0, 0, W, H, C.navy),
    (p) => cat(p, 120, 84, 1.2, C.orange, C.green),
    (p) => { rect(p, 0, 120, W, H, C.black); rect(p, 0, 120, W, 126, C.grey); for (let x = 4; x < W; x += 28) rect(p, x, 160, x + 14, 163, C.yellow); },
    (p) => rect(p, 50, 20, 214, 140, C.navy),
    (p) => { const r = rand(9); for (let k = 0; k < 30; k++) put(p, r() * W, r() * 60, C.pale); disc(p, 30, 26, 10, C.yellow); },
    (p) => bus(p, 46, 70, 210, 138, C.yellow),
  ]);
  add("A rude one, painted out", "twist", "Rain. Again.", 34, halfway({ undos: 4 }), [
    (p) => rect(p, 0, 0, W, 90, C.grey),
    (p) => d.phallus(p, 90, 120, -0.5, C.pink, 70, 22),
    (p) => d.phallus(p, 90, 120, -0.5, C.pink, 70, 22),
    (p) => { rect(p, 0, 70, W, H, C.grey); rect(p, 70, 80, 170, 160, C.stone); poly(p, [[60, 80], [120, 40], [180, 80]], C.navy); },
    (p) => { for (let k = 0; k < 60; k++) line(p, (k * 37) % W, (k * 23) % 70, (k * 37) % W - 4, (k * 23) % 70 + 10, C.blue, 1); },
  ]);
  return out;
}
