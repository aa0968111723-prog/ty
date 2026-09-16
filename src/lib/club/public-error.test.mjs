import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicError } from "./public-error.mjs";

describe("publicError", () => {
  it("keeps a short operational message", () => {
    assert.equal(publicError(new Error("Sheet 讀取逾時")), "Sheet 讀取逾時");
  });

  it("strips secrets, keys, and auth internals", () => {
    assert.equal(publicError(new Error("GOOGLE_PRIVATE_KEY leaked")), "同步失敗");
    assert.equal(publicError(new Error("-----BEGIN PRIVATE KEY-----")), "同步失敗");
    assert.equal(publicError(new Error("AUTH"), "招生資料同步失敗"), "招生資料同步失敗");
    assert.equal(publicError(new Error("credential dump token=abc")), "同步失敗");
  });

  it("falls back on empty or noisy messages", () => {
    assert.equal(publicError(""), "同步失敗");
    assert.equal(publicError(new Error("Unexpected token < in JSON")), "同步失敗");
    assert.equal(publicError(new Error("x".repeat(120))), "同步失敗");
  });
});
