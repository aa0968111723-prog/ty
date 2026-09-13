import assert from "node:assert/strict";
import { test } from "node:test";

test(
  "official game completion writes the game sheet immediately",
  { skip: process.env.CLUB_LIVE_SHEETS !== "1" },
  async () => {
    const { runLiveGameToSheet } = await import("./live-game-to-sheet.mjs");
    const result = await runLiveGameToSheet();
    if (result.skipped) return;
    assert.equal(result.officialPosts, 1);
    assert.equal(result.gameRead.found, true);
    assert.equal(result.gameRead.name, "畫面連動");
    assert.equal(result.recruitFound, false);
    assert.equal(result.masterFound, false);
    assert.match(result.saveText, /成績已交給攤位/);
  },
);
