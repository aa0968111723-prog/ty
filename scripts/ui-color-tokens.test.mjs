import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const styles = readFileSync(join(ROOT, "src/styles.css"), "utf8");
const admin = readFileSync(join(ROOT, "src/admin.css"), "utf8");

test("shared styles define the semantic color tokens and legacy aliases", () => {
  for (const token of [
    "--page-bg",
    "--page-bg-warm",
    "--surface-primary",
    "--surface-raised",
    "--surface-secondary",
    "--surface-highlight",
    "--surface-selected",
    "--accent-primary",
    "--accent-primary-hover",
    "--accent-highlight",
    "--status-success",
    "--status-warning",
    "--status-danger",
    "--text-primary",
    "--text-secondary",
    "--text-muted",
    "--border-soft",
  ]) {
    assert.match(styles, new RegExp(`${token}:`));
  }

  assert.match(styles, /--bg:\s*var\(--page-bg\)/);
  assert.match(styles, /--surface:\s*var\(--surface-primary\)/);
  assert.match(styles, /--brand:\s*var\(--accent-primary\)/);
  assert.match(styles, /--brand-soft:\s*var\(--surface-selected\)/);
  assert.match(styles, /--warning-soft:\s*var\(--surface-highlight\)/);
  assert.match(styles, /--danger:\s*var\(--status-danger\)/);
});

test("game answer colors remain on their existing answer-specific tokens", () => {
  for (const variant of ["red", "blue", "green", "yellow"]) {
    assert.match(styles, new RegExp(`\\.ans-${variant}\\s*\\{[\\s\\S]*?var\\(--answer-${variant}\\)`));
  }
});

test("admin styles use semantic surfaces for navigation and pinned hierarchy", () => {
  assert.match(admin, /\.admin-page\s*\{[\s\S]*background:\s*var\(--page-bg-warm\)/);
  assert.match(admin, /\.admin-summary\s*\{[\s\S]*background:\s*var\(--surface-primary\)/);
  assert.match(admin, /\.admin-widget\[data-widget="topThree"\][\s\S]*var\(--surface-highlight\)/);
  assert.match(admin, /\.admin-widget\[data-widget="todayContacts"\][\s\S]*var\(--surface-secondary\)/);
  assert.match(admin, /\.admin-bottom-nav button\[aria-current\][\s\S]*var\(--surface-selected\)/);
});
