import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { google } from "googleapis";
import { handleResult } from "../src/lib/club/api.mjs";
import { createLiveGame, publicResult, GUEST_PLAYER, tickGame } from "../src/lib/club/runtime.mjs";

const script = readFileSync(new URL("./club-google-apps-script.gs", import.meta.url), "utf8");
function sheet(initial = []) {
  const rows = initial;
  return {
    rows,
    getLastRow: () => rows.length,
    getDataRange: () => ({ getValues: () => rows.map((row) => [...row]) }),
    getRange: (r, c) => ({ setValues(values) {
      values.forEach((valuesRow, index) => {
        rows[r - 1 + index] ??= [];
        valuesRow.forEach((value, j) => { rows[r - 1 + index][c - 1 + j] = value; });
      });
    } }),
  };
}
function deployment(tabs, props, available = true) {
  let locked = false;
  const context = vm.createContext({
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => props[key] }) },
    LockService: { getScriptLock: () => ({
      tryLock: () => { locked = available; return available; },
      releaseLock: () => { locked = false; },
    }) },
    SpreadsheetApp: {
      openById: (id) => {
        assert.ok(locked);
        assert.equal(id, props.GOOGLE_SHEET_ID);
        return {
          getSheetByName: (name) => tabs.get(name),
          insertSheet: (name) => { const tab = sheet(); tabs.set(name, tab); return tab; },
        };
      },
      flush: () => assert.ok(locked),
    },
  });
  vm.runInContext(script, context);
  return (body) => {
    const response = context.doPost({ postData: { contents: JSON.stringify(body) } });
    assert.equal(locked, false, "always releases the write lock");
    return response;
  };
}

test("Apps Script ledger survives new deployments and rejects conflicting entry IDs", () => {
  const props = { PASSWORD: randomBytes(24).toString("hex"), GOOGLE_SHEET_ID: "fixture",
    GOOGLE_SHEET_TAB: "results", GOOGLE_FORM_SHEET_TAB: "forms" };
  const tabs = new Map([["forms", sheet([["姓名", "時間戳記"], ["小明", "2026/9/12 10:00:00"]])]]);
  let post = deployment(tabs, props);
  const game = createLiveGame(0);
  tickGame(game, 60000);
  const row = publicResult(game, GUEST_PLAYER);
  const body = { password: props.PASSWORD, row };
  assert.equal(post({ ...body, password: "" }).error, "unauthorized");
  assert.equal(post({ ...body, sheetId: "other" }).error, "configuration");
  assert.equal(post({ ...body, row: { ...row, kind: "practice" } }).error, "invalid_result");
  assert.deepEqual(post(body), { ok: true, saved: true, duplicate: false });
  assert.equal(tabs.get("results").rows.length, 2);
  post = deployment(tabs, props);
  assert.deepEqual(post(body), { ok: true, saved: true, duplicate: true });
  assert.deepEqual(post({ ...body, row: { ...row, submissionId: row.submissionId.toUpperCase() } }), { ok: true, saved: true, duplicate: true });
  assert.equal(post({ ...body, row: { ...row, name: "小華" } }).conflict, true);
  assert.equal(tabs.get("results").rows.length, 2);
  const read = post({ password: props.PASSWORD, action: "results" });
  assert.equal(read.rows[0].phone, "0900000000");
  assert.deepEqual(read.rows[0].settings, row.settings);
  assert.equal(post({ password: props.PASSWORD, action: "formResponses" }).rows[0]["姓名"], "小明");
  assert.equal(deployment(tabs, props, false)(body).error, "busy");
});

test("result HTTP contract confirms durable duplicate and conflict via mocked Sheets API", async (t) => {
  const props = {
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "ledger@example.test",
      private_key: "test\\nkey",
    }),
    GOOGLE_SHEET_ID: "fixture",
    GOOGLE_SHEET_TAB: "results",
    GOOGLE_FORM_SHEET_TAB: "forms",
    GOOGLE_SCRIPT_URL: "https://example.test/legacy-rollback",
  };
  const previous = Object.fromEntries(Object.keys(props).map((key) => [key, process.env[key]]));
  Object.assign(process.env, props);
  t.after(() => Object.keys(props).forEach((key) => {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }));
  const values = [];
  let legacyCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    legacyCalls += 1;
    throw new Error("legacy connector must not be called");
  });
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth(options) {
    return { options };
  });
  t.mock.method(google, "sheets", () => ({
    spreadsheets: { values: {
      get: async () => ({ data: { values } }),
      update: async (params) => {
        values[0] = [...params.requestBody.values[0]];
        return { data: {} };
      },
      batchUpdate: async (params) => {
        values.push([...params.requestBody.data[0].values[0]]);
        return { data: {} };
      },
    } },
  }));
  const game = createLiveGame(0);
  tickGame(game, 60000);
  const row = publicResult(game, GUEST_PLAYER);
  const submit = (payload) => handleResult(new Request("https://club.example.test/api/result", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  }));
  const first = await (await submit(row)).json();
  assert.equal(first.saved, true);
  assert.equal(first.duplicate, false);
  assert.equal((await (await submit(row)).json()).duplicate, true);
  assert.equal((await submit({ ...row, gatekeeper: "小明" })).status, 409);
  assert.equal((await submit({ ...row, submissionId: "bad-id" })).status, 400);
  assert.equal((await submit({ ...row, kind: "practice", skipSave: false })).status, 400);
  assert.equal((await submit({ ...row, completedAt: null })).status, 400);
  assert.equal(values.length, 2);
  assert.equal(legacyCalls, 0);
});
