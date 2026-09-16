import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

test("frontend UI files never import googleapis or Node process sheets clients", async () => {
  const files = (await walk(join(root, "src")))
    .filter((path) => /\.(tsx|ts|css)$/.test(path))
    .filter((path) => !path.includes("/routes/api/") && !path.includes(".test."));
  const hits = [];
  for (const path of files) {
    const source = await readFile(path, "utf8");
    if (/\bgoogleapis\b/.test(source) || /from ["']googleapis["']/.test(source)) {
      hits.push(path);
    }
  }
  assert.deepEqual(hits, []);
});
