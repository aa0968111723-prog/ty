import assert from "node:assert/strict";
import { test } from "node:test";
import { readPendingResult, storePendingResult, clearPendingResult } from "../src/lib/club/pending-result.mjs";

test("retry survives remounts with identical entry ID and immutable completion payload", () => {
  const rows = new Map();
  const storage = { getItem: (key) => rows.get(key), setItem: (key, value) => rows.set(key, value), removeItem: (key) => rows.delete(key) };
  const payload = { submissionId: crypto.randomUUID(), kind: "official", skipSave: false, completedAt: new Date().toISOString() };
  assert.equal(storePendingResult(storage, payload), true);
  assert.deepEqual(readPendingResult(storage), payload);
  payload.completedAt = "changed";
  assert.notEqual(readPendingResult(storage).completedAt, payload.completedAt);
  clearPendingResult(storage, "different-entry");
  assert.ok(readPendingResult(storage));
  clearPendingResult(storage, payload.submissionId);
  assert.equal(readPendingResult(storage), null);
  storePendingResult(storage, payload, 0);
  assert.equal(readPendingResult(storage, 8 * 3600000), null);
});

test("unavailable storage does not crash the game", () => {
  const storage = { getItem() { throw new Error(); }, setItem() { throw new Error(); }, removeItem() { throw new Error(); } };
  assert.equal(storePendingResult(storage, {}), false);
  assert.equal(readPendingResult(storage), null);
  assert.doesNotThrow(() => clearPendingResult(storage, "unused"));
});
