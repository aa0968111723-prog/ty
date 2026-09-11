// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleHealth, handleLeaderboard, handleRegister, handleResult } from "./api.mjs";

const jsonReq = (url, body) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

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
        phone: "0968111723",
        score: 1600,
        correct: 12,
        wrong: 1,
        maxCombo: 6,
        title: "偽造稱號",
        submissionId: "test-sub-1",
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

  it("sends official results to the server-side sheet connector", async () => {
    const previousUrl = process.env.GOOGLE_SCRIPT_URL;
    const previousSheetId = process.env.GOOGLE_SHEET_ID;
    const previousSheetTab = process.env.GOOGLE_SHEET_TAB;
    const previousPassword = process.env.PASSWORD;
    const previousFetch = globalThis.fetch;
    const calls = [];
    process.env.GOOGLE_SCRIPT_URL = "[https://example.test/sheet](https://example.test/sheet)";
    process.env.GOOGLE_SHEET_ID = "sheet-id";
    process.env.GOOGLE_SHEET_TAB = "國際生專區";
    process.env.PASSWORD = "sheet-password";
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const res = await handleResult(
        jsonReq("http://x/api/result", {
          name: "小華",
          department: "歷史學系",
          grade: "大一",
          phone: "0968111723",
          score: 1600,
          correct: 12,
          wrong: 1,
          maxCombo: 6,
          submissionId: "sheet-sub-1",
        }),
      );
      const data = await res.json();
      assert.equal(data.sheetsConfigured, true);
      assert.equal(data.sheetsOk, true);
      assert.equal(calls.length, 1);
      const sent = JSON.parse(calls[0].options.body);
      assert.equal(calls[0].url, "https://example.test/sheet");
      assert.equal(sent.row.phone, "0968111723");
      assert.equal(sent.row.submissionId, "sheet-sub-1");
      assert.equal(sent.password, "sheet-password");
      assert.equal(sent.sheetId, "sheet-id");
      assert.equal(sent.sheetTab, "國際生專區");
    } finally {
      globalThis.fetch = previousFetch;
      if (previousUrl === undefined) delete process.env.GOOGLE_SCRIPT_URL;
      else process.env.GOOGLE_SCRIPT_URL = previousUrl;
      if (previousSheetId === undefined) delete process.env.GOOGLE_SHEET_ID;
      else process.env.GOOGLE_SHEET_ID = previousSheetId;
      if (previousSheetTab === undefined) delete process.env.GOOGLE_SHEET_TAB;
      else process.env.GOOGLE_SHEET_TAB = previousSheetTab;
      if (previousPassword === undefined) delete process.env.PASSWORD;
      else process.env.PASSWORD = previousPassword;
    }
  });

  it("reports a sheet failure without exposing connector details", async () => {
    const previousUrl = process.env.GOOGLE_SCRIPT_URL;
    const previousFetch = globalThis.fetch;
    process.env.GOOGLE_SCRIPT_URL = "https://example.test/sheet";
    globalThis.fetch = async () => new Response("bad gateway", { status: 502 });
    try {
      const res = await handleResult(
        jsonReq("http://x/api/result", {
          name: "小華",
          department: "歷史學系",
          grade: "大一",
          phone: "0968111723",
          score: 1600,
          correct: 12,
          wrong: 1,
          maxCombo: 6,
          submissionId: "sheet-sub-2",
        }),
      );
      const data = await res.json();
      assert.equal(data.sheetsConfigured, true);
      assert.equal(data.sheetsOk, false);
      assert.equal(data.googleScriptUrl, undefined);
      assert.equal(data.phone, undefined);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousUrl === undefined) delete process.env.GOOGLE_SCRIPT_URL;
      else process.env.GOOGLE_SCRIPT_URL = previousUrl;
    }
  });

  it("rejects impossible score", async () => {
    const res = await handleResult(
      jsonReq("http://x/api/result", {
        name: "小華",
        department: "歷史學系",
        grade: "大一",
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
});
