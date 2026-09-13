// @ts-nocheck -- Contract tests intentionally send malformed and incomplete JSON payloads.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { google } from "googleapis";
import { handleHealth, handleLeaderboard, handleRegister, handleResult } from "./api.mjs";
import { invalidateLeaderboardCache, publicLeaderboardHasSensitiveData } from "./leaderboard.mjs";
import { createLiveGame, createWarmupGame, DEFAULT_SETTINGS, GUEST_PLAYER, publicResult } from "./runtime.mjs";

const jsonReq = (url, body) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(url.endsWith("/api/result") ? {
      ...publicResult(createLiveGame(0), GUEST_PLAYER),
      completedAt: "2026-09-12T01:00:00.000Z",
      total: undefined,
      ...body,
    } : body),
  });

function configureSheets(t, suffix) {
  const names = ["GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_SHEET_ID", "GOOGLE_SHEET_TAB", "GOOGLE_GAME_SHEET_TAB"];
  const previous = names.map((name) => process.env[name]);
  t.after(() => names.forEach((name, index) => {
    if (previous[index] === undefined) delete process.env[name];
    else process.env[name] = previous[index];
  }));
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: `${suffix}@example.test`,
    private_key: "test\\nkey",
  });
  process.env.GOOGLE_SHEET_ID = "sheet-id";
  process.env.GOOGLE_SHEET_TAB = "國際生專區";
}

function mockGoogleAuth(t) {
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth(options) {
    return { options };
  });
}

describe("api", () => {
  it("health ok", async () => {
    const res = await handleHealth();
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.equal(d.status, "ok");
    assert.match(res.headers.get("content-security-policy") || "", /frame-ancestors/);
  });

  it("register validates", async () => {
    const bad = await handleRegister(jsonReq("http://x/api/register", {}));
    assert.equal(bad.status, 400);
    const ok = await handleRegister(
      jsonReq("http://x/api/register", {
        name: "小華",
        department: "歷史學系",
        grade: "大一",
        gatekeeper: "柏能",
        phone: "0968111723",
      }),
    );
    assert.equal(ok.status, 200);
    const d = await ok.json();
    assert.equal(d.ok, true);
  });

  it("result recomputes title and public leaderboard hides pii", async (t) => {
    invalidateLeaderboardCache();
    const names = ["GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_SHEET_ID", "GOOGLE_SHEET_TAB", "GOOGLE_GAME_SHEET_TAB"];
    const previous = names.map((name) => process.env[name]);
    t.after(() => names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    }));
    for (const name of names) delete process.env[name];
    const res = await handleResult(
      jsonReq("http://x/api/result", {
        name: "小華",
        department: "歷史學系",
        grade: "大一",
        gatekeeper: "柏能",
        phone: "0968111723",
        score: 1550,
        correct: 12,
        wrong: 1,
        maxCombo: 6,
        title: "偽造稱號",
        submissionId: crypto.randomUUID(),
      }),
    );
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.match(d.title, /潛力領袖/);
    assert.equal(d.leaderboard, undefined);
    assert.equal(d.rank, undefined);
    const lb = await handleLeaderboard(new Request("http://x/api/leaderboard?scope=today"));
    const board = await lb.json();
    assert.equal(board.public, true);
    assert.equal(board.scope, "today");
    assert.equal(board.ok, true);
    assert.equal(Array.isArray(board.rows), true);
    assert.equal(JSON.stringify(board).includes("0968111723"), false);
    assert.equal(JSON.stringify(board).includes("小華"), false);
  });

  it("sends official results through the Sheets values API", async (t) => {
    configureSheets(t, "write");
    mockGoogleAuth(t);
    const calls = { get: [], update: [], batchUpdate: [] };
    t.mock.method(google, "sheets", () => ({
      spreadsheets: { values: {
        get: async (params) => {
          calls.get.push(params);
          return { data: { values: [] } };
        },
        update: async (params) => {
          calls.update.push(params);
          return { data: {} };
        },
        batchUpdate: async (params) => {
          calls.batchUpdate.push(params);
          return { data: {} };
        },
      } },
    }));
    const submissionId = crypto.randomUUID();
    const res = await handleResult(
      jsonReq("http://x/api/result", {
        name: "小華",
        department: "歷史學系",
        grade: "大一",
        gatekeeper: "柏能",
        phone: "0968111723",
        score: 1550,
        correct: 12,
        wrong: 1,
        maxCombo: 6,
        submissionId,
      }),
    );
    const data = await res.json();
    assert.equal(data.sheetsConfigured, true);
    assert.equal(data.sheetsOk, true);
    assert.equal(calls.get.length, 1);
    assert.equal(calls.update.length, 1);
    assert.equal(calls.batchUpdate.length, 1);
    assert.equal(calls.get[0].spreadsheetId, "sheet-id");
    const headers = calls.update[0].requestBody.values[0];
    const cells = calls.batchUpdate[0].requestBody.data[0].values[0];
    const sent = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    assert.equal(sent.遊戲關主 || sent.gatekeeper, "柏能");
    assert.equal(sent.電話 || sent.phone, "0968111723");
    assert.equal(sent._submissionId || sent.submissionId, submissionId);
  });

  it("reports a sheet failure without exposing connector details", async (t) => {
    configureSheets(t, "failure");
    mockGoogleAuth(t);
    t.mock.method(console, "error", () => {});
    t.mock.method(google, "sheets", () => ({
      spreadsheets: { values: {
        get: async () => { throw new Error("upstream credential detail"); },
      } },
    }));
    const res = await handleResult(
      jsonReq("http://x/api/result", {
        name: "小華",
        department: "歷史學系",
        grade: "大一",
        gatekeeper: "柏能",
        phone: "0968111723",
        score: 1550,
        correct: 12,
        wrong: 1,
        maxCombo: 6,
        submissionId: crypto.randomUUID(),
      }),
    );
    const data = await res.json();
    assert.equal(data.sheetsConfigured, true);
    assert.equal(data.sheetsOk, false);
    assert.equal(data.googleScriptUrl, undefined);
    assert.equal(data.phone, undefined);
    assert.ok(!JSON.stringify(data).includes("credential"));
  });

  it("rejects impossible score", async () => {
    const res = await handleResult(
      jsonReq("http://x/api/result", {
        name: "小華",
        department: "歷史學系",
        grade: "大一",
        gatekeeper: "柏能",
        phone: "0968111723",
        score: 99999,
        correct: 2,
        wrong: 0,
        maxCombo: 2,
        submissionId: "test-sub-2",
      }),
    );
    assert.equal(res.status, 400);
  });

  it("never forwards warm-up, guest or custom practice results to the sheet connector", async (t) => {
    configureSheets(t, "practice");
    const calls = [];
    t.mock.method(google, "sheets", (...args) => {
      calls.push(args);
      return { spreadsheets: { values: {} } };
    });
    for (const game of [
      createWarmupGame(0),
      createLiveGame(0, { skipSave: true }),
      createLiveGame(0, { settings: { duration: 30 } }),
      createLiveGame(0, { settings: { speed: "rush" } }),
    ]) {
      const response = await handleResult(
        jsonReq("http://x/api/result", publicResult(game, GUEST_PLAYER)),
      );
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.saved, false);
      assert.equal(data.sheetsOk, false);
    }
    assert.equal(calls.length, 0);
  });

  it("public leaderboard reads only the game sheet, ranks masked names, and caches for 30 seconds", async (t) => {
    invalidateLeaderboardCache();
    configureSheets(t, "leaderboard");
    mockGoogleAuth(t);
    const calls = [];
    const stamp = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date()).replace(/\//g, "/");
    const wang = crypto.randomUUID();
    const lin = crypto.randomUUID();
    const replay = crypto.randomUUID();
    t.mock.method(google, "sheets", () => ({
      spreadsheets: {
        values: {
          get: async (params) => {
            calls.push(params.range);
            return {
              data: {
                values: [
                  ["姓名", "電話", "分數", "答對", "答錯", "正確率", "最佳連續", "遊戲秒數", "遊戲時間", "_kind", "_skipSave", "_settings", "_submissionId"],
                  ["王小明", "0912345678", 3600, 20, 0, 100, 20, 60, stamp, "official", false, JSON.stringify(DEFAULT_SETTINGS), wang],
                  ["王小明", "0912345678", 600, 5, 0, 100, 5, 60, stamp, "official", false, JSON.stringify(DEFAULT_SETTINGS), replay],
                  ["林同學", "0987654321", 1800, 11, 0, 100, 11, 60, stamp, "official", false, JSON.stringify(DEFAULT_SETTINGS), lin],
                  ["練習生", "0911000000", 600, 5, 0, 100, 5, 15, stamp, "practice", true, JSON.stringify({ ...DEFAULT_SETTINGS, duration: 15 }), crypto.randomUUID()],
                ],
              },
            };
          },
        },
      },
    }));
    const first = await handleLeaderboard(new Request("http://x/api/leaderboard?scope=today"));
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "public, max-age=30");
    const board = await first.json();
    assert.equal(board.public, true);
    assert.equal(board.scope, "today");
    assert.equal(board.source, "game-sheet");
    assert.equal(board.rows.length, 2);
    assert.equal(board.topThree[0].displayName, "王○明");
    assert.equal(board.topThree[0].score, 3600);
    assert.equal(board.rows[1].displayName, "林○學");
    assert.equal(publicLeaderboardHasSensitiveData(board), false);
    const dump = JSON.stringify(board);
    assert.equal(dump.includes("王小明"), false);
    assert.equal(dump.includes("0912345678"), false);
    assert.equal(dump.includes(wang), false);
    assert.equal(dump.includes("招生狀況表"), false);
    const second = await handleLeaderboard(new Request("http://x/api/leaderboard?scope=today"));
    assert.equal((await second.json()).cached, true);
    assert.equal(calls.length, 1);
    assert.equal(calls.some((range) => String(range).includes("招生") || String(range).includes("總表")), false);
    const history = await handleLeaderboard(new Request("http://x/api/leaderboard?scope=history"));
    assert.equal((await history.json()).scope, "history");
    assert.equal((await handleLeaderboard(new Request("http://x/api/leaderboard?scope=all"))).status, 400);
  });
});
