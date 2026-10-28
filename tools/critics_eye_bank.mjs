// Works out, ahead of time, what each thing the critics' eye can recognise (web/src/eye-bank.ts)
// looks like to the model, so the game only ever has to download the half of the model that looks
// at pictures, not the half that reads. Run it after changing the bank, the subjects or the model:
//
//   node tools/critics_eye_bank.mjs
//
// It downloads the model's text half (a few hundred megabytes, cached under node_modules) and
// writes web/public/critics-eye.json: each entry's direction, squeezed to a byte a number.
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const WEB = new URL("../web/", import.meta.url).pathname;
const req = createRequire(WEB + "package.json");
const { build } = req("esbuild");
const res = await build({ entryPoints: [WEB + "src/eye-bank.ts"], bundle: true, write: false, format: "esm", platform: "node", logLevel: "error" });
const tmp = path.join(fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "eye-")), "bank.mjs");
fs.writeFileSync(tmp, res.outputFiles[0].text);
const { BANK, SUBJECTS, ASKS, MODEL } = await import(tmp);
const T = await import(WEB + "node_modules/@huggingface/transformers/dist/transformers.node.mjs");
T.env.allowLocalModels = false;

const siglip = MODEL.id.includes("siglip");
const opts = { revision: MODEL.revision };
const tok = await T.AutoTokenizer.from_pretrained(MODEL.id, opts);
const Text = siglip ? T.SiglipTextModel : T.CLIPTextModelWithProjection;
const text = await Text.from_pretrained(MODEL.id, { ...opts, dtype: "fp32" });

async function embed(phrases) {
  const all = phrases.flatMap((p) => ASKS.map((a) => a.replace("{}", p)));
  const out = await text(tok(all, { padding: "max_length", truncation: true }));
  const e = siglip ? out.pooler_output : out.text_embeds, D = e.dims[1];
  // every way of asking about every phrase, averaged, then made unit length again
  const v = new Float32Array(D);
  for (let i = 0; i < all.length; i++) {
    let n = 0;
    for (let d = 0; d < D; d++) n += e.data[i * D + d] ** 2;
    n = Math.sqrt(n);
    for (let d = 0; d < D; d++) v[d] += e.data[i * D + d] / n;
  }
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
const pack = (v) => Buffer.from(Int8Array.from(v, (x) => Math.max(-127, Math.min(127, Math.round(x * 127 / 0.25)))).buffer).toString("base64");

const bank = [];
for (const s of BANK) bank.push(pack(await embed([s.ask])));
const subjects = {};
for (const [k, ps] of Object.entries(SUBJECTS)) subjects[k] = pack(await embed(ps));
const sig = BANK.map((s) => s.ask).join("|") + "#" + Object.keys(SUBJECTS).join("|") + "#" + ASKS.join("|");
const out = { model: MODEL.id, revision: MODEL.revision, dims: (await embed(["x"])).length, sig, bank, subjects };
fs.writeFileSync(WEB + "public/critics-eye.json", JSON.stringify(out));
console.log(`${BANK.length} things, ${Object.keys(subjects).length} subjects, ${(fs.statSync(WEB + "public/critics-eye.json").size / 1024).toFixed(0)} KB`);
