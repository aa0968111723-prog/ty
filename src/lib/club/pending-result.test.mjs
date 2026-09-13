import assert from "node:assert/strict";
import { test } from "node:test";
import { saveKindFromResponse } from "./pending-result.mjs";

test("sheet write success is confirmed, configured failure stays retryable", () => {
  assert.equal(saveKindFromResponse({ sheetsOk: true, sheetsConfigured: true }), "ok");
  assert.equal(saveKindFromResponse({ sheetsOk: true, sheetsConfigured: false }), "ok");
  assert.equal(saveKindFromResponse({ sheetsOk: false, sheetsConfigured: true }), "fail");
  assert.equal(saveKindFromResponse({ sheetsOk: false, sheetsConfigured: false }), "local");
  assert.equal(saveKindFromResponse({}), "local");
});
