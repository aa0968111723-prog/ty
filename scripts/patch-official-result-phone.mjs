import fs from "node:fs";

const runtimePath = "src/lib/club/runtime.mjs";
let runtime = fs.readFileSync(runtimePath, "utf8");
const from = `    grade: player.grade,
    gatekeeper: player.gatekeeper,
    score: game.score,`;
const to = `    grade: player.grade,
    phone: player.phone,
    gatekeeper: player.gatekeeper,
    score: game.score,`;
if (!runtime.includes(from)) throw new Error("publicResult target not found");
fs.writeFileSync(runtimePath, runtime.replace(from, to));

const testPath = "src/lib/club/runtime.test.mjs";
let test = fs.readFileSync(testPath, "utf8");
const testFrom = `    assert.equal(p.total, 14);
    assert.ok(p.accuracy > 0);`;
const testTo = `    assert.equal(p.total, 14);
    assert.equal(p.phone, "0912345678");
    assert.equal(p.gatekeeper, "柏能");
    assert.ok(p.accuracy > 0);`;
if (!test.includes(testFrom)) throw new Error("result payload test target not found");
fs.writeFileSync(testPath, test.replace(testFrom, testTo));

for (const path of [
  "scripts/patch-official-result-phone.mjs",
  ".github/workflows/patch-official-result-phone.yml",
]) {
  if (fs.existsSync(path)) fs.rmSync(path);
}
