import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { injectGrokPwaHead, snapshotOgIdentity } from "./grok-pwa-shared.mjs";

test("versioned brand card survives build snapshot, serverless runtime and repeated injection", () => {
  const root = mkdtempSync(join(tmpdir(), "club-brand-"));
  mkdirSync(join(root, "src/lib/og"), { recursive: true });
  mkdirSync(join(root, "public/og"), { recursive: true });
  const image = "/og/turtle-v2.jpg";
  writeFileSync(join(root, "public", image), "image fixture");
  writeFileSync(join(root, "public/og.jpg"), "legacy image");
  writeFileSync(join(root, "src/lib/og/site.json"), JSON.stringify({
    title: "淡江大學禪學社｜專注力挑戰賽", description: "60 秒專注力挑戰",
    type: "x:game", image, url: "https://club.example/",
  }));
  const { site } = snapshotOgIdentity(root);
  assert.equal(site.image, image);
  const cwd = mkdtempSync(join(tmpdir(), "club-serverless-"));
  const context = { cwd, site, host: "internal.vercel.app" };
  const html = injectGrokPwaHead("<html><head><meta property=\"og:image\" content=\"old\"></head></html>", context);
  assert.equal(injectGrokPwaHead(html, context), html);
  for (const [key, value] of Object.entries({
    "og:title": site.title, "og:description": site.description,
    "og:image": `https://club.example${image}`, "og:image:width": "1200",
    "og:image:height": "630", "og:type": "x:game", "og:url": site.url,
    "twitter:card": "summary_large_image", "twitter:title": site.title,
    "twitter:description": site.description, "twitter:image": `https://club.example${image}`,
  })) {
    assert.ok(html.includes(`="${key}" content="${value}"`), key);
    assert.equal(html.split(`="${key}"`).length - 1, 1, key);
  }
});

test("a missing configured image is never baked as a broken URL", () => {
  const root = mkdtempSync(join(tmpdir(), "club-missing-brand-"));
  mkdirSync(join(root, "src/lib/og"), { recursive: true });
  writeFileSync(join(root, "src/lib/og/site.json"), JSON.stringify({ card: "custom", image: "/og/missing.jpg" }));
  const { site } = snapshotOgIdentity(root);
  assert.equal(site.image, undefined);
  assert.equal(site.card, undefined);
});
