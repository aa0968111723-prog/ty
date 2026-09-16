import assert from "node:assert/strict";
import { test } from "node:test";
import {
  profileTouchesTaipeiDate,
  rosterFilterDate,
  shiftIsoDate,
  taipeiIsoDate,
} from "./roster-date.mjs";

test("rosterFilterDate maps today, yesterday, custom, and all history", () => {
  const now = new Date("2026-09-16T18:00:00+08:00");
  assert.equal(rosterFilterDate("all", "2026-09-12", now), "");
  assert.equal(rosterFilterDate("today", "2026-09-12", now), "2026-09-16");
  assert.equal(rosterFilterDate("yesterday", "2026-09-12", now), "2026-09-15");
  assert.equal(rosterFilterDate("custom", "2026-09-12", now), "2026-09-12");
  assert.equal(shiftIsoDate("2026-09-01", -1), "2026-08-31");
  assert.equal(taipeiIsoDate(now), "2026-09-16");
});

test("profileTouchesTaipeiDate matches game time, 接引日期, and ignores other days", () => {
  const todayGame = {
    name: "今日生",
    gameCompletedAt: "2026-09-16T01:00:00.000Z",
  };
  const sheetRow = {
    name: "指定日生",
    recruitedAt: "9/12",
  };
  const isoRecruit = {
    name: "ISO生",
    recruitedAt: "2026-09-14",
  };
  assert.equal(profileTouchesTaipeiDate(todayGame, "2026-09-16"), true);
  assert.equal(profileTouchesTaipeiDate(todayGame, "2026-09-15"), false);
  assert.equal(profileTouchesTaipeiDate(sheetRow, "2026-09-12"), true);
  assert.equal(profileTouchesTaipeiDate(sheetRow, "2026-09-16"), false);
  assert.equal(profileTouchesTaipeiDate(isoRecruit, "2026-09-14"), true);
  assert.equal(profileTouchesTaipeiDate(isoRecruit, "2026-09-16"), false);
  assert.equal(profileTouchesTaipeiDate(todayGame, ""), true);
});
