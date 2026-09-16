import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const manifestUrl = new URL("../public/manifest.webmanifest", import.meta.url);

test("admin PWA manifest opens the pinned view and exposes operational shortcuts", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  assert.equal(manifest.name, "禪學社專注力挑戰");
  assert.equal(manifest.short_name, "禪學社專注力挑戰");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#506525");
  assert.equal(manifest.background_color, "#f7f8f4");
  assert.equal(manifest.start_url, "/admin?view=pinned");
  assert.deepEqual(
    manifest.shortcuts.map(({ name, url }) => [name, url]),
    [
      ["今日戰情", "/admin?view=today"],
      ["待處理", "/admin?view=pending"],
      ["名單", "/admin?view=roster"],
      ["今日排行榜", "/admin?view=today-board"],
    ],
  );
  assert.ok(manifest.icons.every(({ src }) => src.startsWith("/brand/tkuzen-turtle-3d-icon-")));
});
