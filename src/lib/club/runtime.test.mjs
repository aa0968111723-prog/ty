// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMBO_BONUS_AT,
  GAME_DURATION,
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
  clampSettings,
  correctId,
} from "./runtime.mjs";

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
      phone: "0912345678",
    });
    assert.equal(p.title.includes("潛力領袖"), true);
    assert.equal(p.total, 14);
    assert.ok(p.accuracy > 0);
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
});
