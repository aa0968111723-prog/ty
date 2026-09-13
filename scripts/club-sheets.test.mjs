import assert from "node:assert/strict";
import { test } from "node:test";
import { google } from "googleapis";
import {
  DEFAULT_TAB_TITLES,
  EXPECTED_SHEET_IDS,
  GAME_SAFE_HEADERS,
  RESULT_COLUMNS,
  appendOfficialResult,
  appendRecruitmentResponse,
  invalidateSheetCache,
  readSheetRows,
  sheetsConfigured,
  spreadsheetEditUrl,
} from "../src/lib/club/sheets.mjs";
import { DEFAULT_SETTINGS } from "../src/lib/club/runtime.mjs";
import { normalizeStaffRecruitmentPayload } from "../src/lib/club/recruitment-staff-form.mjs";

function configure(t, suffix, overrides = {}) {
  const names = [
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    "GOOGLE_SHEET_ID",
    "GOOGLE_SHEET_TAB",
    "GOOGLE_FORM_SHEET_TAB",
    "GOOGLE_GAME_SHEET_TAB",
    "GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB",
    "GOOGLE_RECRUITMENT_MASTER_SHEET_TAB",
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

test("rejects incomplete service-account JSON instead of falling back to file credentials", async (t) => {
  configure(t, "invalid", { GOOGLE_SERVICE_ACCOUNT_JSON: "{}" });
  assert.equal(sheetsConfigured(), false);
  await assert.rejects(() => readSheetRows("results"), /GOOGLE_SERVICE_ACCOUNT_JSON is invalid/);
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
  const row = result({ settings: { ...DEFAULT_SETTINGS, ignored: "not persisted" } });

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

test("empty game sheet writes Chinese headers plus technical submissionId", async (t) => {
  configure(t, "empty-zh");
  const values = [];
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth() { return {}; });
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
  const row = result({ completedAt: "2026-09-12T01:00:00.367Z" });
  assert.deepEqual(await appendOfficialResult(row), { saved: true, duplicate: false });
  assert.ok(values[0].includes("姓名"));
  assert.ok(values[0].includes("_submissionId"));
  assert.equal(values[0].includes("submissionId") || values[0].includes("_submissionId"), true);
  const saved = Object.fromEntries(values[0].map((header, index) => [header, values[1][index]]));
  assert.equal(saved._submissionId, row.submissionId);
  assert.equal(saved.遊戲關主, "柏能");
  assert.deepEqual(await appendOfficialResult(row), { saved: true, duplicate: true });
});

test("Chinese game headers do not grow English duplicate columns", async (t) => {
  configure(t, "zh-stable");
  const values = [[...GAME_SAFE_HEADERS]];
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth() { return {}; });
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
  const first = result({ submissionId: crypto.randomUUID() });
  const second = result({ submissionId: crypto.randomUUID(), name: "小明" });
  assert.deepEqual(await appendOfficialResult(first), { saved: true, duplicate: false });
  assert.deepEqual(await appendOfficialResult(second), { saved: true, duplicate: false });
  assert.deepEqual(values[0], GAME_SAFE_HEADERS);
  assert.equal(values[0].includes("gatekeeper"), false);
  assert.equal(values[0].includes("submissionId"), false);
});

test("GOOGLE_GAME_SHEET_TAB wins over GOOGLE_SHEET_TAB", async (t) => {
  configure(t, "prefer-new", { GOOGLE_GAME_SHEET_TAB: DEFAULT_TAB_TITLES.gameResults });
  let range;
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth() { return {}; });
  t.mock.method(google, "sheets", () => ({
    spreadsheets: { values: {
      get: async (params) => {
        range = params.range;
        return { data: { values: [["submissionId"]] } };
      },
    } },
  }));
  await readSheetRows("results");
  assert.equal(range, "'" + DEFAULT_TAB_TITLES.gameResults + "'");
});

test("gameResults follows sheetId 896311128 instead of leftover GOOGLE_SHEET_TAB", async (t) => {
  configure(t, "gid", { GOOGLE_SHEET_TAB: "國際生專區" });
  delete process.env.GOOGLE_GAME_SHEET_TAB;
  invalidateSheetCache();
  let range;
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth() { return {}; });
  t.mock.method(google, "sheets", () => ({
    spreadsheets: {
      get: async () => ({
        data: {
          sheets: [
            { properties: { title: "總表", sheetId: EXPECTED_SHEET_IDS.recruitmentMaster } },
            { properties: { title: "茶會報名", sheetId: EXPECTED_SHEET_IDS.teaPartySignup } },
            { properties: { title: "招生狀況表", sheetId: EXPECTED_SHEET_IDS.recruitmentResponses } },
            { properties: { title: "國際生專區", sheetId: 123 } },
            { properties: { title: DEFAULT_TAB_TITLES.gameResults, sheetId: EXPECTED_SHEET_IDS.gameResults } },
          ],
        },
      }),
      values: {
        get: async (params) => {
          range = params.range;
          return { data: { values: [["_submissionId"]] } };
        },
      },
    },
  }));
  await readSheetRows("gameResults");
  assert.equal(range, "'" + DEFAULT_TAB_TITLES.gameResults + "'");
  assert.ok(!String(range).includes("國際生"));
  assert.ok(!String(range).includes("總表"));
  assert.ok(!String(range).includes("招生狀況表"));
});

test("without spreadsheet metadata, leftover GOOGLE_SHEET_TAB does not receive game writes", async (t) => {
  configure(t, "no-meta", { GOOGLE_SHEET_TAB: "國際生專區" });
  delete process.env.GOOGLE_GAME_SHEET_TAB;
  invalidateSheetCache();
  let range;
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth() { return {}; });
  t.mock.method(google, "sheets", () => ({
    spreadsheets: { values: {
      get: async (params) => {
        range = params.range;
        return { data: { values: [["_submissionId"]] } };
      },
    } },
  }));
  await readSheetRows("gameResults");
  assert.equal(range, "'" + DEFAULT_TAB_TITLES.gameResults + "'");
});

test("game writes follow gid 896311128 even if GOOGLE_GAME_SHEET_TAB names a missing tab", async (t) => {
  configure(t, "dead-explicit", {
    GOOGLE_SHEET_TAB: "國際生專區",
    GOOGLE_GAME_SHEET_TAB: "國際生專區",
  });
  invalidateSheetCache();
  let range;
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth() { return {}; });
  t.mock.method(google, "sheets", () => ({
    spreadsheets: {
      get: async () => ({
        data: {
          sheets: [
            { properties: { title: "總表", sheetId: EXPECTED_SHEET_IDS.recruitmentMaster } },
            { properties: { title: DEFAULT_TAB_TITLES.gameResults, sheetId: EXPECTED_SHEET_IDS.gameResults } },
          ],
        },
      }),
      values: {
        get: async (params) => {
          range = params.range;
          return { data: { values: [["_submissionId"]] } };
        },
      },
    },
  }));
  await readSheetRows("gameResults");
  assert.equal(range, "'" + DEFAULT_TAB_TITLES.gameResults + "'");
  assert.ok(!String(range).includes("國際生"));
  assert.match(spreadsheetEditUrl(), /gid=896311128$/);
});

test("official result writes never target 招生狀況表 or 總表", async (t) => {
  configure(t, "game-write-only", { GOOGLE_GAME_SHEET_TAB: DEFAULT_TAB_TITLES.gameResults });
  const ranges = [];
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth() { return {}; });
  t.mock.method(google, "sheets", () => ({
    spreadsheets: {
      get: async () => ({
        data: {
          sheets: [{ properties: { title: DEFAULT_TAB_TITLES.gameResults, sheetId: EXPECTED_SHEET_IDS.gameResults } }],
        },
      }),
      values: {
        get: async (params) => {
          ranges.push(params.range);
          return { data: { values: [["_submissionId"]] } };
        },
        update: async (params) => {
          ranges.push(params.range);
          return { data: {} };
        },
        batchUpdate: async (params) => {
          ranges.push(params.requestBody.data[0].range);
          return { data: {} };
        },
      },
    },
  }));
  await appendOfficialResult(result());
  assert.ok(ranges.length > 0);
  assert.ok(ranges.every((range) => String(range).includes(DEFAULT_TAB_TITLES.gameResults)));
  assert.ok(ranges.every((range) => !String(range).includes("招生狀況表") && !String(range).includes("總表")));
});

test("staff form appends onto 招生狀況表 and never writes 總表 or the game tab", async (t) => {
  configure(t, "staff-write", {
    GOOGLE_GAME_SHEET_TAB: DEFAULT_TAB_TITLES.gameResults,
    GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB: "招生狀況表",
    GOOGLE_RECRUITMENT_MASTER_SHEET_TAB: "總表",
  });
  invalidateSheetCache();
  const values = [[
    "時間戳記", "接引人(可複選)", "接引日期", "同學的姓名", "同學電話/LINE", "系級",
    "這位同學是屬於那個分級呢:-)", "報名了那個活動",
  ]];
  const ranges = [];
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth() { return {}; });
  t.mock.method(google, "sheets", () => ({
    spreadsheets: {
      get: async () => ({
        data: {
          sheets: [
            { properties: { title: "總表", sheetId: EXPECTED_SHEET_IDS.recruitmentMaster } },
            { properties: { title: "招生狀況表", sheetId: EXPECTED_SHEET_IDS.recruitmentResponses } },
            { properties: { title: DEFAULT_TAB_TITLES.gameResults, sheetId: EXPECTED_SHEET_IDS.gameResults } },
          ],
        },
      }),
      values: {
        get: async (params) => {
          ranges.push(params.range);
          return { data: { values } };
        },
        update: async (params) => {
          ranges.push(params.range);
          values[0] = [...params.requestBody.values[0]];
          return { data: {} };
        },
        batchUpdate: async (params) => {
          ranges.push(params.requestBody.data[0].range);
          values.push([...params.requestBody.data[0].values[0]]);
          return { data: {} };
        },
      },
    },
  }));
  const parsed = normalizeStaffRecruitmentPayload({
    recruiter: "柏能",
    name: "王小明",
    phone: "0912345678",
    department: "歷史學系",
    grade: "大一",
    gameGatekeeper: "安倢",
    completedAt: "2026-09-14T06:32:00.000Z",
    submissionId: "11111111-1111-4111-8111-111111111111",
    tier: "S(已報名)",
    activities: ["9/30茶會"],
    joined: "是",
    depositPaid: "是",
    depositAmount: "300",
  }, { now: new Date("2026-09-14T08:00:00+08:00") });
  const first = await appendRecruitmentResponse(parsed.payload);
  assert.equal(first.saved, true);
  assert.equal(first.duplicate, false);
  assert.ok(ranges.every((range) => String(range).includes("招生狀況表")));
  assert.ok(ranges.every((range) => !String(range).includes("總表")));
  assert.ok(ranges.every((range) => !String(range).includes(DEFAULT_TAB_TITLES.gameResults)));
  assert.ok(values[0].at(-1) === "_duplicate" || values[0].includes("_gameSubmissionId"));
  const saved = Object.fromEntries(values[0].map((header, index) => [header, values[1][index]]));
  assert.equal(saved["同學的姓名"], "王小明");
  assert.equal(saved["接引人(可複選)"], "柏能");
  assert.equal(saved._gameGatekeeper, "安倢");
  assert.equal(saved._gameSubmissionId, parsed.payload.submissionId);
  const again = await appendRecruitmentResponse(parsed.payload);
  assert.equal(again.duplicate, true);
  assert.equal(values.length, 2);
});
