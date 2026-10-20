// Postavlja ime keša u sw.js na otisak sadržaja ljuske aplikacije (fajlovi iz SHELL liste + logika sw.js).
// Ime se mijenja samo kad se promijeni neki od tih fajlova, pa korisnici dobijaju novu verziju bez ručnog podizanja "blizu-vN".
// Pokretanje: node tools/stamp-sw.mjs          (upisuje)
//             node tools/stamp-sw.mjs --check  (izlazi s greškom ako sw.js nije ažuran)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const swUrl = new URL("sw.js", root);
const sw = readFileSync(swUrl, "utf8");
const shell = /const SHELL = \[([^\]]*)\]/.exec(sw);
if (!shell) throw new Error("sw.js: SHELL lista nije pronađena");
const files = [...shell[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((f) => f !== "./").sort();
const h = createHash("sha1");
for (const f of files) {
  const u = new URL(f, root);
  h.update(f + "\0");
  if (existsSync(u)) h.update(readFileSync(u));
}
h.update(sw.replace(/const C = "[^"]*"/, "")); // logika sw.js (bez samog imena keša)
const name = "blizu-" + h.digest("hex").slice(0, 8);
const out = sw.replace(/const C = "[^"]*"/, `const C = "${name}"`);
const changed = out !== sw;
if (process.argv.includes("--check")) {
  if (changed) { console.error(`sw.js nije ažuran (očekivano ${name}). Pokreni: node tools/stamp-sw.mjs`); process.exit(1); }
} else if (changed) writeFileSync(swUrl, out);
console.log(name + (changed ? " (ažurirano)" : " (bez promjene)"));
