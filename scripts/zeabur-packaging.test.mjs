import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

test("Zeabur packaging keeps the Vercel preset unless NITRO_PRESET is set", async () => {
  const vite = await readFile(new URL("vite.config.ts", root), "utf8");
  assert.match(vite, /process\.env\.NITRO_PRESET \|\| process\.env\.SERVER_PRESET \|\| "vercel"/);
  const docker = await readFile(new URL("Dockerfile", root), "utf8");
  assert.match(docker, /NITRO_PRESET=node-server/);
  assert.match(docker, /CMD \["node", "\.output\/server\/index\.mjs"\]/);
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(pkg.scripts.start, "node .output/server/index.mjs");
});
