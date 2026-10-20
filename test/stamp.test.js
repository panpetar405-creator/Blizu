const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

test("svi fajlovi iz SHELL liste postoje", () => {
  const root = path.join(__dirname, "..");
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const files = [...(/const SHELL = \[([^\]]*)\]/.exec(sw)[1]).matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((f) => f !== "./");
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), f + " ne postoji");
});
