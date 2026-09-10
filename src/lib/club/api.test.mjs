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
