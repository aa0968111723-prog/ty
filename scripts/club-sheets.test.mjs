import assert from "node:assert/strict";
import { test } from "node:test";
import { google } from "googleapis";
import {
  RESULT_COLUMNS,
  appendOfficialResult,
  readSheetRows,
  sheetsConfigured,
} from "../src/lib/club/sheets.mjs";
import { DEFAULT_SETTINGS } from "../src/lib/club/runtime.mjs";

function configure(t, suffix, overrides = {}) {
  const names = [
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    "GOOGLE_SHEET_ID",
    "GOOGLE_SHEET_TAB",
    "GOOGLE_FORM_SHEET_TAB",
  ];
  const previous = names.map((name) => process.env[name]);
  t.after(() => names.forEach((name, index) => {
    if (previous[index] === undefined) delete process.env[name];
    else process.env[name] = previous[index];
  }));
  Object.assign(process.env, {
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: `${suffix}@example.test`,
      private_key: "line one\\nline two",
    }),
    GOOGLE_SHEET_ID: "fixture-sheet",
    GOOGLE_SHEET_TAB: "Result's",
    GOOGLE_FORM_SHEET_TAB: "Form's",
    ...overrides,
  });
}

function result(overrides = {}) {
  return {
    submissionId: crypto.randomUUID(),
    name: "小華",
    department: "歷史學系",
    grade: "大一",
    gatekeeper: "柏能",
    phone: "0968111723",
    score: 600,
    correct: 5,
    wrong: 0,
    accuracy: 100,
    maxCombo: 5,
    title: "Lv.1 心靈修煉者",
    duration: 60,
    kind: "official",
    skipSave: false,
    settings: DEFAULT_SETTINGS,
    completedAt: "2026-09-12T01:00:00.000Z",
    ...overrides,
  };
}

test("reads service-account JSON credentials and normalizes escaped private-key newlines", async (t) => {
  configure(t, "read");
  let authOptions;
  let getParams;
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth(options) {
    authOptions = options;
    return { fixture: "auth" };
  });
  t.mock.method(google, "sheets", ({ version, auth }) => {
    assert.equal(version, "v4");
    assert.deepEqual(auth, { fixture: "auth" });
    return {
      spreadsheets: { values: {
        get: async (params) => {
          getParams = params;
          return { data: { values: [
            ["姓名", "手機號碼", "settings"],
            ["小明", "'0900000000", JSON.stringify(DEFAULT_SETTINGS)],
          ] } };
        },
      } },
    };
  });

  assert.equal(sheetsConfigured("formResponses"), true);
  const rows = await readSheetRows("formResponses");
  assert.equal(authOptions.credentials.client_email, "read@example.test");
  assert.equal(authOptions.credentials.private_key, "line one\nline two");
  assert.deepEqual(authOptions.scopes, ["https://www.googleapis.com/auth/spreadsheets"]);
  assert.deepEqual(getParams, {
    spreadsheetId: "fixture-sheet",
    range: "'Form''s'",
    majorDimension: "ROWS",
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  assert.equal(rows[0]["手機號碼"], "0900000000");
  assert.deepEqual(rows[0].settings, DEFAULT_SETTINGS);
});

test("updates headers and batch-writes one idempotent result row", async (t) => {
  configure(t, "write");
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth(options) {
    return { options };
  });
  const values = [["submissionId", "legacy"], ["older-entry", "keep"]];
  const calls = { get: 0, update: [], batchUpdate: [] };
  t.mock.method(google, "sheets", () => ({
    spreadsheets: { values: {
      get: async () => {
        calls.get += 1;
        return { data: { values } };
      },
      update: async (params) => {
        calls.update.push(params);
        values[0] = [...params.requestBody.values[0]];
        return { data: {} };
      },
      batchUpdate: async (params) => {
        calls.batchUpdate.push(params);
        values.push([...params.requestBody.data[0].values[0]]);
        return { data: {} };
      },
    } },
  }));
  const row = result();

  assert.deepEqual(await appendOfficialResult(row), { saved: true, duplicate: false });
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].valueInputOption, "RAW");
  assert.deepEqual(values[0], ["submissionId", "legacy", ...RESULT_COLUMNS.slice(1)]);
  assert.equal(calls.batchUpdate.length, 1);
  assert.equal(calls.batchUpdate[0].requestBody.valueInputOption, "RAW");
  const saved = Object.fromEntries(values[0].map((header, index) => [header, values[2][index]]));
  assert.equal(saved.phone, "0968111723");
  assert.equal(saved.settings, JSON.stringify(DEFAULT_SETTINGS));

  assert.deepEqual(await appendOfficialResult(row), { saved: true, duplicate: true });
  assert.deepEqual(
    await appendOfficialResult({ ...row, gatekeeper: "小明" }),
    { saved: false, duplicate: false, conflict: true },
  );
  assert.equal(calls.get, 3);
  assert.equal(calls.update.length, 1);
  assert.equal(calls.batchUpdate.length, 1);
});
