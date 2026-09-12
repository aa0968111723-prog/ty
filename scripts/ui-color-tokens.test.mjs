import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const styles = readFileSync(join(ROOT, "src/styles.css"), "utf8");
const admin = readFileSync(join(ROOT, "src/admin.css"), "utf8");

function colorToken(name) {
  const match = styles.match(new RegExp(`--${name}:\\s*(#[\\da-f]{6})`, "i"));
  assert.ok(match, `expected --${name} to contain a six-digit hex color`);
  return match[1];
}

function relativeLuminance(color) {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const luminances = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left,
  );
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

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
  assert.match(styles, /--warning:\s*var\(--status-warning\)/);
  assert.match(styles, /--warning-soft:\s*var\(--surface-highlight\)/);
  assert.match(styles, /--danger:\s*var\(--status-danger\)/);
});

test("semantic foreground and surface pairs meet WCAG AA contrast", () => {
  for (const [foreground, background] of [
    ["text-muted", "surface-primary"],
    ["text-muted", "surface-secondary"],
    ["text-muted", "surface-highlight"],
    ["text-muted", "page-bg-warm"],
    ["accent-primary", "surface-selected"],
    ["on-brand", "accent-primary"],
    ["status-warning", "surface-highlight-strong"],
    ["status-danger", "danger-soft"],
  ]) {
    const ratio = contrastRatio(colorToken(foreground), colorToken(background));
    assert.ok(ratio >= 4.5, `${foreground} on ${background} has only ${ratio.toFixed(2)}:1 contrast`);
  }
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
