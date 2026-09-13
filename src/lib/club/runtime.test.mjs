// @ts-nocheck -- Engine tests intentionally exercise invalid inputs and mutable game fixtures.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GAME_DURATION,
  WARMUP_DURATION,
  DEFAULT_SETTINGS,
  GRADE_LIST,
  GUEST_PLAYER,
  HIT_SCORE,
  COMBO_SCORE,
  judgeAnswer,
  nextQuestion,
  pointsForHit,
  publicResult,
  sanitizeLeaderboard,
  scoreIsConsistent,
  theoreticalMaxScore,
  tickGame,
  titleForScore,
  validatePlayer,
  createLiveGame,
  createWarmupGame,
  clampSettings,
  correctId,
  isOfficialSettings,
  settingsAreValid,
  TUTORIAL_LESSONS,
  tutorialCorrectId,
} from "./runtime.mjs";

const snapshot = (game) => ({ mode: game.mode, seq: game.questionSeq });
const answer = (game, now, chosen = correctId(game)) => judgeAnswer(game, chosen, snapshot(game), now);

describe("stroop question", () => {
  it("meaning != visual always", () => {
    let prev = null;
    for (let i = 0; i < 200; i += 1) {
      const q = nextQuestion(prev);
      assert.notEqual(q.meaning.id, q.visual.id);
      prev = q;
    }
  });
});

describe("pre-official warm-up", () => {
  it("uses exactly 15 seconds and official rules without changing saved settings", () => {
    const settings = { ...DEFAULT_SETTINGS, duration: 90, speed: "rush", sound: false };
    const g = createWarmupGame(1_000, settings);
    assert.equal(g.kind, "warmup");
    assert.equal(g.skipSave, true);
    assert.equal(g.duration, WARMUP_DURATION);
    assert.equal(g.settings.speed, "normal");
    assert.equal(g.mode, "meaning");
    assert.equal(g.settings.sound, false);
    assert.equal(settings.duration, 90);
    assert.equal(tickGame(g, 15_999).expired, false);
    assert.equal(tickGame(g, 16_000).expired, true);
    assert.equal(judgeAnswer(g, correctId(g), undefined, 16_001).ok, false);
    assert.equal(publicResult(g, GUEST_PLAYER).skipSave, true);
  });

  it("rejects answers at the warm-up deadline even before the next timer tick", () => {
    const g = createWarmupGame(1_000);
    assert.equal(judgeAnswer(g, correctId(g), undefined, 16_000).reason, "expired");
    assert.equal(g.score, 0);
  });

  it("keeps scores, combos, timers and submission IDs isolated on retry and official start", () => {
    const warmup = createWarmupGame(1_000);
    for (let i = 1; i <= 5; i += 1) {
      answer(warmup, 1_000 + i * 100);
    }
    assert.equal(warmup.score, 600);
    assert.equal(warmup.combo, 5);
    tickGame(warmup, 16_000);
    warmup.resultSubmitted = true;
    const retry = createWarmupGame(20_000);
    const official = createLiveGame(40_000);
    assert.equal(new Set([warmup.submissionId, retry.submissionId, official.submissionId]).size, 3);
    for (const g of [retry, official]) {
      assert.equal(g.score, 0);
      assert.equal(g.combo, 0);
      assert.equal(g.maxCombo, 0);
      assert.equal(g.correct, 0);
      assert.equal(g.wrong, 0);
      assert.equal(g.questionSeq, 1);
      assert.equal(g.lastAnswerAt, 0);
      assert.equal(g.mode, "meaning");
      assert.equal(g.ended, false);
      assert.equal(g.resultSubmitted, false);
    }
    assert.equal(official.kind, "official");
    assert.equal(official.skipSave, false);
    assert.equal(official.duration, GAME_DURATION);
    assert.equal(tickGame(official, 99_999).expired, false);
    assert.equal(tickGame(official, 100_000).expired, true);
    assert.equal(warmup.score, 600);
  });

  it("keeps guest and custom-settings practice separate from pre-official warm-up", () => {
    for (const opts of [
      { skipSave: true },
      { settings: { duration: 30 } },
      { settings: { speed: "rush" } },
    ]) {
      const g = createLiveGame(0, opts);
      assert.equal(g.kind, "practice");
      assert.equal(g.skipSave, true);
    }
  });
});

describe("judgeAnswer", () => {
  it("scores hit, combo bonus, miss floor", () => {
    const g = createLiveGame(1_000);
    let t = 1_000;
    const hitOnce = () => {
      t += 80;
      const s = { mode: g.mode, seq: g.questionSeq };
      const id = g.mode === "meaning" ? g.question.meaning.id : g.question.visual.id;
      return judgeAnswer(g, id, s, t);
    };
    const first = hitOnce();
    assert.equal(first.delta, HIT_SCORE);
    assert.equal(g.score, 100);
    for (let i = 2; i <= 4; i += 1) {
      const r = hitOnce();
      assert.equal(r.delta, HIT_SCORE);
    }
    assert.equal(g.score, 400);
    const fifth = hitOnce();
    assert.equal(fifth.delta, COMBO_SCORE);
    assert.equal(g.score, 600);
    assert.equal(g.combo, 5);
    const missSnap = { mode: g.mode, seq: g.questionSeq };
    const wrong = ["red", "blue", "green", "yellow"].find((id) => id !== correctId(g));
    const miss = judgeAnswer(g, wrong, missSnap, t + 80);
    assert.equal(g.combo, 0);
    assert.equal(miss.delta, -50);
    assert.equal(g.score, 550);
  });

  it("ignores double tap and post-end", () => {
    const g = createLiveGame(1_000);
    const snap = { mode: g.mode, seq: g.questionSeq };
    const id = g.mode === "meaning" ? g.question.meaning.id : g.question.visual.id;
    const a = judgeAnswer(g, id, snap, 1_010);
    const b = judgeAnswer(g, id, snap, 1_020);
    assert.equal(a.ok, true);
    assert.equal(b.ok, false);
    g.ended = true;
    const c = judgeAnswer(g, id, { mode: g.mode, seq: g.questionSeq }, 1_200);
    assert.equal(c.reason, "ended");
  });

  it("accepts the first answer at monotonic zero and locks double/triple taps until the exact boundary", () => {
    const game = createLiveGame(0);
    const first = snapshot(game);
    const chosen = correctId(game);
    assert.equal(judgeAnswer(game, chosen, first, 0).ok, true);
    assert.equal(judgeAnswer(game, chosen, first, 1).reason, "lock");
    assert.equal(judgeAnswer(game, chosen, first, 2).reason, "lock");
    assert.equal(answer(game, game.tapLockMs - 1).reason, "lock");
    assert.equal(judgeAnswer(game, chosen, first, game.tapLockMs).reason, "stale");
    assert.equal(answer(game, game.tapLockMs).ok, true);
    assert.equal(game.correct, 2);
    assert.equal(game.questionSeq, 3);
  });

  it("rejects absent, future, stale and mismatched-mode snapshots without changing the question", () => {
    const game = createLiveGame(0);
    for (const snap of [
      undefined, {}, { ...snapshot(game), seq: 0 }, { ...snapshot(game), seq: 2 },
      { ...snapshot(game), seq: "1" }, { ...snapshot(game), mode: "visual" },
    ]) {
      assert.equal(judgeAnswer(game, correctId(game), snap, 100).reason, "stale");
    }
    assert.equal(answer(game, 100, "invalid").reason, "invalid");
    assert.equal(game.questionSeq, 1);
    assert.equal(game.score, 0);
  });

  it("expires at the exact timer edge even when the previous answer is tap-locked", () => {
    for (const end of [60_000, 60_001, 61_000]) {
      const game = createLiveGame(0);
      assert.equal(answer(game, 59_999).ok, true);
      assert.equal(answer(game, end).reason, "expired");
      assert.equal(game.ended, true);
      assert.equal(game.score, 100);
      assert.ok(game.completedAt);
      const completion = game.completedAt;
      tickGame(game, end + 1000);
      assert.equal(game.completedAt, completion);
      assert.equal(answer(game, end + 1000).reason, "ended");
    }
  });

  it("rejects invalid/backward clocks and does not increase the remaining time", () => {
    const game = createLiveGame(0);
    assert.equal(answer(game, 100).ok, true);
    for (const now of [99, NaN, Infinity, "200"]) {
      assert.equal(answer(game, now).reason, "clock");
    }
    assert.equal(tickGame(game, 1000).remaining, 59);
    assert.equal(tickGame(game, 500).remaining, 59);
    assert.equal(answer(game, 999).reason, "clock");
    assert.equal(answer(game, 1000).ok, true);
  });

  it("floors wrong answers at zero and resets the five-hit bonus boundary after a miss", () => {
    const game = createLiveGame(0);
    let now = 0;
    const hit = () => answer(game, now += 100);
    const miss = () => answer(game, now += 100, game.mode === "meaning" ?
      game.question.visual.id : game.question.meaning.id);
    assert.equal(miss().delta, 0);
    assert.equal(hit().delta, 100);
    assert.equal(miss().delta, -50);
    assert.equal(miss().delta, -50);
    assert.equal(miss().delta, 0);
    for (let i = 1; i <= 4; i++) assert.equal(hit().delta, 100);
    assert.equal(hit().delta, COMBO_SCORE);
    assert.equal(hit().delta, 200);
    assert.equal(miss().delta, -50);
    for (let i = 1; i <= 4; i++) assert.equal(hit().delta, 100);
    assert.equal(hit().delta, 200);
    assert.equal(game.maxCombo, 6);
    assert.equal(game.combo, 5);
  });
});

describe("timer and answer mode", () => {
  it("ends at 60s without a time-based rule switch", () => {
    const g = createLiveGame(0);
    const mid = tickGame(g, 2_900);
    assert.equal(mid.expired, false);
    assert.equal(g.mode, "meaning");
    const end = tickGame(g, GAME_DURATION * 1000);
    assert.equal(end.expired, true);
    assert.equal(g.ended, true);
  });

  it("switches exactly once after each answered question", () => {
    const g = createLiveGame(0);
    const firstMode = g.mode;
    const firstId = correctId(g);
    const first = judgeAnswer(g, firstId, { mode: firstMode, seq: g.questionSeq }, 100);
    assert.equal(first.ok, true);
    assert.equal(first.switched, true);
    assert.notEqual(g.mode, firstMode);

    const secondMode = g.mode;
    const secondId = ["red", "blue", "green", "yellow"].find((id) => id !== correctId(g));
    const second = judgeAnswer(g, secondId, { mode: secondMode, seq: g.questionSeq }, 200);
    assert.equal(second.ok, true);
    assert.equal(second.hit, false);
    assert.equal(second.switched, true);
    assert.notEqual(g.mode, secondMode);
  });

  it("honors custom duration and tap settings", () => {
    const g = createLiveGame(0, { settings: { duration: 30, speed: "rush" } });
    assert.equal(g.duration, 30);
    assert.equal(g.modeSwitchMs, 1400);
    assert.equal(g.comboEvery, 2);
    assert.equal(g.skipSave, true);
    const end = tickGame(g, 30_000);
    assert.equal(end.expired, true);
  });
  it("snaps speed to tuned presets", () => {
    const s = clampSettings({ duration: 32, speed: "rush" });
    assert.equal(s.duration, 30);
    assert.equal(s.speed, "rush");
    assert.equal(s.switchMs, 1400);
  });
  it("requires canonical gameplay settings without coercing malformed values", () => {
    assert.equal(isOfficialSettings(DEFAULT_SETTINGS), true);
    assert.equal(isOfficialSettings({ ...DEFAULT_SETTINGS, sound: false, vibrate: false }), true);
    for (const settings of [
      null, {}, { duration: 60 }, { ...DEFAULT_SETTINGS, duration: "60" },
      { ...DEFAULT_SETTINGS, tapLockMs: 48 }, { ...DEFAULT_SETTINGS, comboEvery: 5 },
      { ...DEFAULT_SETTINGS, sound: 0 }, { ...DEFAULT_SETTINGS, switchMs: 3001 },
    ]) {
      assert.equal(isOfficialSettings(settings), false);
      assert.equal(settingsAreValid(settings), false);
    }
    assert.equal(isOfficialSettings(clampSettings({ duration: 30 })), false);
  });
});

describe("titles validation leaderboard", () => {
  it("keeps the supported grade options", () => {
    assert.deepEqual(GRADE_LIST, ["大一", "大二", "大三", "大四", "碩士班", "博士班", "其他"]);
  });
  it("thresholds", () => {
    assert.match(titleForScore(0), /心靈修煉者/);
    assert.match(titleForScore(1500), /潛力領袖/);
    assert.match(titleForScore(2500), /穩定領航者/);
    assert.match(titleForScore(3500), /卓越領袖/);
    assert.match(titleForScore(750, 30), /潛力領袖/);
    assert.match(titleForScore(700, 30), /心靈修煉者/);
    assert.match(titleForScore(1250, 30), /穩定領航者/);
  });
  it("player validate", () => {
    const bad = validatePlayer({});
    assert.equal(bad.ok, false);
    const good = validatePlayer({
      name: "小華",
      department: "歷史學系",
      grade: "大一",
      gatekeeper: "柏能",
      phone: "0968111723",
    });
    assert.equal(good.ok, true);
    const guest = validatePlayer(GUEST_PLAYER);
    assert.equal(guest.ok, true);
  });
  it("leaderboard strips pii", () => {
    const rows = sanitizeLeaderboard([
      { name: "A", department: "歷史學系", score: 300, phone: "0911111111", email: "a@x.com" },
      { name: "B", department: "會計學系", score: 900, phone: "0922222222" },
    ]);
    assert.equal(rows[0].name, "B");
    assert.equal("phone" in rows[0], false);
    assert.equal("email" in rows[0], false);
  });
  it("result payload", () => {
    const g = createLiveGame(1);
    g.score = 1500;
    g.correct = 12;
    g.wrong = 2;
    g.maxCombo = 6;
    const p = publicResult(g, {
      name: "小華",
      department: "歷史學系",
      grade: "大一",
      gatekeeper: "柏能",
      phone: "0912345678",
    });
    assert.equal(p.title.includes("潛力領袖"), true);
    assert.equal(p.total, 14);
    assert.equal(p.phone, "0912345678");
    assert.equal(p.gatekeeper, "柏能");
    assert.ok(p.accuracy > 0);
    assert.equal(p.completedAt, null);
    tickGame(g, 60_001);
    const completed = publicResult(g, GUEST_PLAYER);
    assert.equal(completed.kind, "official");
    assert.equal(completed.skipSave, false);
    assert.deepEqual(completed.settings, DEFAULT_SETTINGS);
    assert.equal(completed.completedAt, g.completedAt);
    assert.notEqual(completed.settings, g.settings);
  });
  it("max score bound", () => {
    assert.equal(theoreticalMaxScore(0), 0);
    assert.equal(theoreticalMaxScore(4), 400);
    assert.equal(theoreticalMaxScore(5), 600);
    assert.equal(theoreticalMaxScore(10), 1600);
    assert.equal(pointsForHit(4), HIT_SCORE);
    assert.equal(pointsForHit(5), COMBO_SCORE);
    assert.equal(scoreIsConsistent({ score: 600, correct: 5, wrong: 0, maxCombo: 5 }), true);
    assert.equal(scoreIsConsistent({ score: 500, correct: 5, wrong: 0, maxCombo: 5 }), false);
  });

  it("rejects malformed numeric aggregates and impossible combo/low score claims", () => {
    const valid = { score: 600, correct: 5, wrong: 0, maxCombo: 5 };
    for (const key of Object.keys(valid)) {
      for (const value of [undefined, null, "5", true, NaN, Infinity, -1, 0.5, 1e20]) {
        assert.equal(scoreIsConsistent({ ...valid, [key]: value }), false, `${key}: ${value}`);
      }
    }
    assert.equal(scoreIsConsistent({ score: 0, correct: 10, wrong: 1, maxCombo: 5 }), false);
    assert.equal(scoreIsConsistent({ score: 1600, correct: 12, wrong: 1, maxCombo: 6 }), false);
    assert.equal(scoreIsConsistent({ score: 100, correct: 1, wrong: 1, maxCombo: 0 }), false);
    assert.equal(scoreIsConsistent({ score: 100, correct: 1, wrong: 1250, maxCombo: 1 }), false);
  });

  it("accepts aggregates from every twelve-answer hit/miss sequence", () => {
    for (let bits = 0; bits < 4096; bits++) {
      const row = { score: 0, correct: 0, wrong: 0, maxCombo: 0 };
      let combo = 0;
      for (let i = 0; i < 12; i++) {
        if (bits & (1 << i)) {
          row.correct++;
          combo++;
          row.maxCombo = Math.max(row.maxCombo, combo);
          row.score += pointsForHit(combo);
        } else {
          row.wrong++;
          combo = 0;
          row.score = Math.max(0, row.score - 50);
        }
      }
      assert.equal(scoreIsConsistent(row), true, JSON.stringify(row));
    }
  });
});

describe("beginner tutorial lessons", () => {
  it("asks for the word first, then the ink, without matching colors", () => {
    assert.equal(TUTORIAL_LESSONS.length, 2);
    assert.equal(TUTORIAL_LESSONS[0].mode, "meaning");
    assert.equal(tutorialCorrectId(TUTORIAL_LESSONS[0]), "blue");
    assert.equal(TUTORIAL_LESSONS[1].mode, "visual");
    assert.equal(tutorialCorrectId(TUTORIAL_LESSONS[1]), "yellow");
    for (const lesson of TUTORIAL_LESSONS) {
      assert.notEqual(lesson.meaning, lesson.visual);
    }
  });
});
