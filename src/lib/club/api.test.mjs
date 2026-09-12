// @ts-nocheck -- Contract tests intentionally send malformed and incomplete JSON payloads.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { google } from "googleapis";
import { handleHealth, handleLeaderboard, handleRegister, handleResult } from "./api.mjs";
import { createLiveGame, createWarmupGame, GUEST_PLAYER, publicResult } from "./runtime.mjs";

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
  const names = ["GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_SHEET_ID", "GOOGLE_SHEET_TAB"];
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

  it("result recomputes title and hides pii on board", async () => {
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
    const lb = await handleLeaderboard(new Request("http://x/api/leaderboard"));
    const board = await lb.json();
    assert.equal(board.public, false);
    assert.deepEqual(board.rows, []);
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
    assert.equal(sent.gatekeeper, "柏能");
    assert.equal(sent.phone, "0968111723");
    assert.equal(sent.submissionId, submissionId);
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
});
