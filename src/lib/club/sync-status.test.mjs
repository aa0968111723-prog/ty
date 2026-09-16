import assert from "node:assert/strict";
import { test } from "node:test";
import { partnerSyncFailure, recruitmentSyncLabel } from "./sync-status.mjs";

const ok = { ok: true, stale: false };
const stale = { ok: false, stale: true };
const down = { ok: false, stale: false };
const sync = {
  gameResults: ok,
  recruitmentResponses: ok,
  recruitmentMaster: ok,
  form: ok,
};

test("healthy sync uses 成功 and not 正常", () => {
  const label = recruitmentSyncLabel(sync);
  assert.equal(label.tone, "ok");
  assert.match(label.text, /成功/);
  assert.doesNotMatch(label.text, /正常/);
});

test("stale source uses 等待", () => {
  const label = recruitmentSyncLabel({ ...sync, form: stale });
  assert.equal(label.tone, "wait");
  assert.match(label.text, /等待/);
});

test("failed source or thrown error uses 失敗", () => {
  assert.match(recruitmentSyncLabel({ ...sync, gameResults: down }).text, /失敗/);
  assert.match(recruitmentSyncLabel(sync, "timeout").text, /失敗/);
});

test("HTTP/sync failure copy distinguishes empty from last-known-good", () => {
  assert.equal(partnerSyncFailure(false), "同步失敗，請重新整理");
  assert.equal(partnerSyncFailure(true), "同步失敗，仍顯示上次資料");
});
