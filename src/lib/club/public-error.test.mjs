import assert from "node:assert/strict";
import test from "node:test";
import { METHOD_NOT_ALLOWED, NOT_FOUND, publicAdminError } from "./public-error.mjs";

test("publicAdminError keeps Chinese partner copy", () => {
  assert.equal(publicAdminError("請先登入管理後台"), "請先登入管理後台");
  assert.equal(publicAdminError("PIN 不正確"), "解鎖碼不正確");
  assert.equal(publicAdminError("兩次 PIN 不一致"), "兩次解鎖碼不一致");
  assert.equal(publicAdminError("請輸入 4 碼數字 PIN"), "請輸入 4 碼數字解鎖碼");
  assert.equal(publicAdminError("日期格式須為有效的 YYYY-MM-DD"), "日期格式須為有效的 YYYY-MM-DD");
});

test("publicAdminError translates English protocol text", () => {
  assert.equal(publicAdminError("Method not allowed"), METHOD_NOT_ALLOWED);
  assert.equal(publicAdminError("Not found"), NOT_FOUND);
  assert.equal(publicAdminError("not-configured"), "資料來源尚未設定");
});

test("publicAdminError hides stacks, googleapis and submissionId", () => {
  assert.equal(
    publicAdminError("Request to https://sheets.googleapis.com/v4/spreadsheets failed"),
    "資料暫時無法讀取，請稍後再試",
  );
  assert.equal(
    publicAdminError("TypeError: Cannot read properties of undefined\n    at Client.request"),
    "資料暫時無法讀取，請稍後再試",
  );
  assert.equal(
    publicAdminError("duplicate submissionId aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    "資料暫時無法讀取，請稍後再試",
  );
  assert.equal(publicAdminError("Unable to parse range"), "操作失敗，請稍後再試");
  assert.equal(publicAdminError(""), "操作失敗，請稍後再試");
  assert.equal(publicAdminError(null, "無法載入待跟進名單"), "無法載入待跟進名單");
});
