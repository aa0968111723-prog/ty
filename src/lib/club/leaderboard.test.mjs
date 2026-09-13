import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS } from "./runtime.mjs";
import {
  bestResultsByPlayer,
  buildPublicLeaderboard,
  compareLeaderboardRows,
  eligibleOfficialResults,
  invalidateLeaderboardCache,
  leaderboardCacheKey,
  maskDisplayName,
  parseLeaderboardScope,
  playerKey,
  publicLeaderboardHasSensitiveData,
  readLeaderboardCache,
  writeLeaderboardCache,
} from "./leaderboard.mjs";

const official = (overrides = {}) => ({
  name: "王小明",
  phone: "0912345678",
  department: "歷史學系",
  grade: "大一",
  gatekeeper: "柏能",
  completedAt: "2026-09-12T01:00:00.000Z",
  submissionId: crypto.randomUUID(),
  kind: "official",
  skipSave: false,
  duration: 60,
  settings: DEFAULT_SETTINGS,
  score: 600,
  correct: 5,
  wrong: 0,
  maxCombo: 5,
  accuracy: 100,
  title: "偽造稱號",
  ...overrides,
});

describe("leaderboard ranking", () => {
  it("masks names and never keeps a one-character name fully visible", () => {
    assert.equal(maskDisplayName("王小明"), "王○明");
    assert.equal(maskDisplayName("陳大"), "陳○");
    assert.equal(maskDisplayName("Alex"), "A○○x");
    assert.equal(maskDisplayName("王"), "王○");
    assert.equal(maskDisplayName("  "), "同學");
  });

  it("keeps official 60-second saved games and drops practice, warmup, skipSave, bad settings and duplicate IDs", () => {
    const keep = official({ score: 1550, correct: 12, wrong: 1, maxCombo: 6, accuracy: 92.3 });
    const duplicate = { ...keep, submissionId: keep.submissionId.toUpperCase(), score: 2500, correct: 20, wrong: 0, maxCombo: 20, accuracy: 100 };
    const rows = [
      keep,
      duplicate,
      official({ kind: "practice" }),
      official({ kind: "warmup", skipSave: true }),
      official({ skipSave: true }),
      official({ duration: 30, settings: { ...DEFAULT_SETTINGS, duration: 30 } }),
      official({ settings: { ...DEFAULT_SETTINGS, speed: "rush" } }),
      official({ accuracy: 80 }),
      official({ score: 1000 }),
    ];
    const eligible = eligibleOfficialResults(rows);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].submissionId, keep.submissionId.toLowerCase());
    assert.equal(eligible[0].title, "Lv.2 潛力領袖");
  });

  it("accepts Chinese game-sheet rows and still requires official saved settings", () => {
    const id = crypto.randomUUID();
    const rows = [{
      姓名: "林小華",
      電話: "0987654321",
      分數: 600,
      答對: 5,
      答錯: 0,
      正確率: 100,
      最佳連續: 5,
      遊戲秒數: 60,
      遊戲時間: "2026/09/12 09:00:00",
      _kind: "official",
      _skipSave: false,
      _settings: DEFAULT_SETTINGS,
      _submissionId: id,
    }];
    const eligible = eligibleOfficialResults(rows);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].name, "林小華");
    assert.equal(eligible[0].submissionId, id.toLowerCase());
  });

  it("keeps one personal best per player and ranks by score, accuracy, correct, combo, then earlier finish", () => {
    const replayLow = official({
      phone: "0911111111",
      score: 1500,
      correct: 10,
      wrong: 2,
      maxCombo: 10,
      accuracy: 83.3,
      completedAt: "2026-09-12T02:00:00.000Z",
    });
    const replayHigh = official({
      name: "王小明改名",
      phone: "0911111111",
      score: 3600,
      correct: 20,
      wrong: 0,
      maxCombo: 20,
      accuracy: 100,
      completedAt: "2026-09-12T03:00:00.000Z",
    });
    const other = official({
      name: "陳大同",
      phone: "0922222222",
      score: 2500,
      correct: 15,
      wrong: 2,
      maxCombo: 15,
      accuracy: 88.2,
      completedAt: "2026-09-12T04:00:00.000Z",
    });
    const earlierTie = official({
      name: "黃早到",
      phone: "0933333333",
      score: 2500,
      correct: 15,
      wrong: 2,
      maxCombo: 15,
      accuracy: 88.2,
      completedAt: "2026-09-12T01:30:00.000Z",
    });
    const ranked = bestResultsByPlayer(eligibleOfficialResults([
      replayLow, replayHigh, other, earlierTie,
    ])).sort(compareLeaderboardRows);
    assert.equal(ranked.length, 3);
    assert.equal(playerKey(replayLow), playerKey(replayHigh));
    assert.equal(ranked[0].name, "王小明改名");
    assert.equal(ranked[0].score, 3600);
    assert.equal(ranked[1].phone, "0933333333");
    assert.equal(ranked[2].phone, "0922222222");
  });

  it("today uses Asia/Taipei and history keeps the all-time personal best", () => {
    const todayMorning = official({
      name: "今日王",
      phone: "0912000001",
      completedAt: "2026-09-11T16:00:00.000Z",
      score: 1800,
      correct: 11,
      wrong: 0,
      maxCombo: 11,
      accuracy: 100,
    });
    const yesterday = official({
      name: "昨日王",
      phone: "0912000001",
      completedAt: "2026-09-11T15:59:59.000Z",
      score: 3600,
      correct: 20,
      wrong: 0,
      maxCombo: 20,
      accuracy: 100,
    });
    const otherToday = official({
      name: "林同學",
      phone: "0912000002",
      completedAt: "2026-09-12T07:00:00.000Z",
      score: 600,
      correct: 5,
      wrong: 0,
      maxCombo: 5,
      accuracy: 100,
    });
    const now = new Date("2026-09-11T16:30:00.000Z");
    const today = buildPublicLeaderboard({
      rows: [todayMorning, yesterday, otherToday],
      scope: "today",
      now,
    });
    const history = buildPublicLeaderboard({
      rows: [todayMorning, yesterday, otherToday],
      scope: "history",
      now,
    });
    assert.equal(today.date, "2026-09-12");
    assert.equal(today.rows.length, 2);
    assert.equal(today.rows[0].displayName, "今○王");
    assert.equal(today.rows[0].score, 1800);
    assert.equal(history.rows.length, 2);
    assert.equal(history.rows[0].displayName, "昨○王");
    assert.equal(history.rows[0].score, 3600);
    assert.equal(today.topThree.length, 2);
    const dump = JSON.stringify({ today, history });
    assert.equal(dump.includes("王小明"), false);
    assert.equal(dump.includes("今日王"), false);
    assert.equal(dump.includes("0912000001"), false);
    assert.equal(publicLeaderboardHasSensitiveData(today), false);
    assert.equal(publicLeaderboardHasSensitiveData(history), false);
    assert.deepEqual(Object.keys(today.rows[0]), ["rank", "displayName", "score", "accuracy", "title", "time"]);
  });

  it("rejects invalid or repeated scope query values", () => {
    assert.deepEqual(parseLeaderboardScope(new Request("http://x/api/leaderboard")), { ok: true, scope: "today" });
    assert.deepEqual(parseLeaderboardScope(new Request("http://x/api/leaderboard?scope=history")), { ok: true, scope: "history" });
    assert.equal(parseLeaderboardScope(new Request("http://x/api/leaderboard?scope=all")).ok, false);
    assert.equal(parseLeaderboardScope(new Request("http://x/api/leaderboard?scope=today&scope=history")).ok, false);
  });

  it("caches a board for 30 seconds by scope", () => {
    invalidateLeaderboardCache();
    writeLeaderboardCache("today:2026-09-12", { ok: true, stamp: 1 }, 1_000);
    assert.equal(readLeaderboardCache("today:2026-09-12", 1_000 + 29_999)?.stamp, 1);
    assert.equal(readLeaderboardCache("today:2026-09-12", 1_000 + 30_001), null);
    assert.equal(leaderboardCacheKey("today", "2026-09-12"), "today:2026-09-12");
    assert.equal(leaderboardCacheKey("history", "2026-09-12"), "history");
  });
});
