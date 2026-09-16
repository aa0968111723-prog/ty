import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { google } from "googleapis";
import {
  buildDashboard, normalizeFormResponse, rankOfficialResults,
  handleAdminLogin, handleAdminLogout, handleAdminSession,
  handleAdminDashboard, handleAdminFormResponses, handleAdminResults,
  handleAdminRecruitment,
} from "../src/lib/club/admin.mjs";
import { DEFAULT_TAB_TITLES, EXPECTED_SHEET_IDS } from "../src/lib/club/sheets.mjs";
import { DEFAULT_SETTINGS } from "../src/lib/club/runtime.mjs";

const origin = "https://leader-dna-mcp-a7k2.zeabur.app";
const internalOrigin = "http://club.internal:8080";
const official = (overrides = {}) => ({
  name: "小華", phone: "0900000000", department: "歷史學系", grade: "大一", gatekeeper: "柏能",
  completedAt: "2026-09-12T01:00:00.000Z", submissionId: crypto.randomUUID(),
  kind: "official", skipSave: false, duration: 60, settings: DEFAULT_SETTINGS,
  score: 600, correct: 5, wrong: 0, maxCombo: 5, accuracy: 100,
  ...overrides,
});
const request = (path, { body, cookie, headers = {}, omitOrigin = false } = {}) =>
  new Request(`${internalOrigin}/api/admin/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(!omitOrigin ? { origin } : {}), "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test("Taipei date boundaries, normalized-name dedup, source and gatekeeper statistics", () => {
  const data = buildDashboard({
    now: new Date("2026-09-11T16:00:00Z"),
    forms: [
      { 姓名: " Ａｌｅｘ ", 時間戳記: "2026/9/12 上午 12:00:00", 關主: "甲" },
      { name: "Alex", timestamp: "2026-09-12T07:00:00+08:00", gatekeeper: "乙" },
      { name: "Yesterday", timestamp: "2026-09-11T15:59:59Z" },
      { name: "Invalid", timestamp: "2026/2/30 12:00:00" },
      { name: "", timestamp: "2026/9/12 12:00:00" },
    ],
    results: [
      official({ name: "a lex", gatekeeper: "丙" }),
      official({ name: "小明", completedAt: "2026-09-12T15:59:59Z" }),
      official({ name: "Practice", kind: "practice", skipSave: true }),
      official({ name: "Tomorrow", completedAt: "2026-09-12T16:00:00Z" }),
    ],
  });
  assert.equal(data.date, "2026-09-12");
  assert.deepEqual(data.kpis, {
    contacts: 2, rawRecords: 4, duplicates: 2, officialChallenges: 2,
    averageScore: 600, highestScore: 600, formResponses: 2,
  });
  assert.equal(data.contacts.find((row) => row.name === "a lex").gatekeeper, "丙");
  assert.equal(data.trend.length, 24);
  assert.equal(data.trend[9].count, 1);
  assert.equal(data.trend[23].count, 1);
  assert.equal(data.gatekeepers.reduce((sum, row) => sum + row.count, 0), 2);
  assert.equal(buildDashboard({ forms: [], date: "2026-01-01" }).kpis.contacts, 0);
  for (const date of ["2026-02-30", "2026-9-12", "invalid", ""]) {
    assert.throws(() => buildDashboard({ date }), RangeError);
  }
});

test("Form headers and timestamps normalize without relying on server timezone", () => {
  const value = normalizeFormResponse({ 姓名: "小華", 手機號碼: "0900000000", 科系: "歷史學系",
    年級: "大一", 關主姓名: "柏能", 時間戳記: "2026/9/12 下午 12:03:04" });
  assert.equal(value.completedAt, "2026-09-12T04:03:04.000Z");
  assert.equal(value.phone, "0900000000");
  assert.equal(value.gatekeeper, "柏能");
  assert.equal(normalizeFormResponse({ timestamp: "2026/9/12 24:00" }).completedAt, "");
});

test("official ranking rejects invalid aggregates, practice settings, and repeated entry IDs", () => {
  const first = official({ completedAt: "2026-09-12T00:00:00Z" });
  const second = official({ name: "小明" });
  const rows = [second, first, { ...first, submissionId: first.submissionId.toUpperCase() },
    official({ kind: "practice" }), official({ skipSave: true }), official({ duration: 30 }),
    official({ settings: { ...DEFAULT_SETTINGS, speed: "rush" } }),
    official({ accuracy: 80 }), official({ score: 1000 }), official({ maxCombo: 8 }),
    official({ completedAt: "2026-09-11T00:00:00Z" })];
  const ranked = rankOfficialResults(rows, "2026-09-12");
  assert.deepEqual(ranked.map((row) => row.submissionId), [first.submissionId, second.submissionId]);
  assert.equal(ranked[0].title, "Lv.1 心靈修煉者");
  assert.equal(buildDashboard({ date: "2026-09-12", results: rows }).topThree.length, 2);
  assert.equal(buildDashboard({ date: "2026-09-12", results: rows }).historyTop.length, 1);
  const legacy = official({ submissionId: "", settings: JSON.stringify(DEFAULT_SETTINGS) });
  assert.equal(rankOfficialResults([legacy])[0].id, rankOfficialResults([legacy])[0].id);
});

test("admin authentication and private read API contracts with mocked Google only", async (t) => {
  const names = ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "PUBLIC_ORIGIN", "GOOGLE_SERVICE_ACCOUNT_JSON",
    "GOOGLE_SHEET_ID", "GOOGLE_SHEET_TAB", "GOOGLE_FORM_SHEET_TAB",
    "GOOGLE_GAME_SHEET_TAB", "GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB", "GOOGLE_RECRUITMENT_MASTER_SHEET_TAB"];
  const before = names.map((name) => process.env[name]);
  t.after(() => names.forEach((name, i) => {
    if (before[i] === undefined) delete process.env[name]; else process.env[name] = before[i];
  }));
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.PUBLIC_ORIGIN;
  assert.equal((await handleAdminLogin(request("login", {
    body: { password: "" }, headers: { origin: internalOrigin },
  }))).status, 401);
  assert.equal((await handleAdminLogin(request("login", {
    body: { password: "wrong" }, headers: { origin: internalOrigin },
  }))).status, 401);
  const boothLogin = await handleAdminLogin(request("login", {
    body: { password: "tkuzen" }, headers: { origin: internalOrigin },
  }));
  assert.equal(boothLogin.status, 200);
  const boothCookie = (typeof boothLogin.headers.getSetCookie === "function"
    ? boothLogin.headers.getSetCookie()
    : [boothLogin.headers.get("set-cookie")]).filter(Boolean).map((item) => String(item).split(";")[0]).join("; ");
  assert.equal((await (await handleAdminSession(request("session", { cookie: boothCookie }))).json()).authenticated, true);
  assert.equal((await handleAdminLogin(request("login", {
    body: { password: "tkuzen" }, headers: { origin: internalOrigin },
  }))).status, 200);
  process.env.ADMIN_PASSWORD = randomBytes(24).toString("hex");
  process.env.ADMIN_SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.PUBLIC_ORIGIN = `${origin}/`;
  const login = () => handleAdminLogin(request("login", { body: { password: process.env.ADMIN_PASSWORD } }));
  assert.equal((await handleAdminLogin(request("login", { body: { password: process.env.ADMIN_PASSWORD },
    headers: { origin: "https://evil.example.com" } }))).status, 403);
  assert.equal((await handleAdminLogin(request("login", { body: { password: process.env.ADMIN_PASSWORD },
    headers: { "sec-fetch-site": "cross-site" } }))).status, 403);
  assert.equal((await handleAdminLogin(request("login", {
    body: { password: process.env.ADMIN_PASSWORD }, omitOrigin: true,
  }))).status, 403);
  assert.equal((await handleAdminLogin(request("login", { body: { password: process.env.ADMIN_PASSWORD },
    headers: { "x-forwarded-host": "evil.example.com" } }))).status, 200);
  assert.equal((await handleAdminLogin(request("login", { body: { password: process.env.ADMIN_PASSWORD },
    headers: { origin: internalOrigin } }))).status, 200);
  assert.equal((await handleAdminLogin(request("login", { body: { password: "wrong" } }))).status, 401);
  const response = await login();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const setCookie = response.headers.get("set-cookie");
  for (const flag of ["__Host-club_admin=", "Path=/", "HttpOnly", "Secure", "SameSite=Strict", "Max-Age=28800"]) {
    assert.ok(setCookie.includes(flag), flag);
  }
  assert.ok(!setCookie.includes(process.env.ADMIN_PASSWORD));
  const cookie = setCookie.split(";")[0];
  assert.equal((await (await handleAdminSession(request("session", { cookie }))).json()).authenticated, true);
  assert.equal((await (await handleAdminSession(request("session", { cookie: `${cookie}x` }))).json()).authenticated, false);
  assert.equal((await (await handleAdminSession(request("session", { cookie: `${cookie}; ${cookie}` }))).json()).authenticated, false);
  for (const handler of [handleAdminDashboard, handleAdminResults, handleAdminFormResponses, handleAdminRecruitment]) {
    assert.equal((await handler(request("dashboard"))).status, 401);
    assert.equal((await handler(request("dashboard?date=2026-02-30", { cookie }))).status, 400);
    assert.equal((await handler(request("dashboard?date=2026-09-12&date=2026-09-11", { cookie }))).status, 400);
  }
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "admin@example.test",
    private_key: "test\\nkey",
  });
  process.env.GOOGLE_SHEET_ID = "fixture-sheet";
  process.env.GOOGLE_SHEET_TAB = "results";
  process.env.GOOGLE_FORM_SHEET_TAB = "forms";
  process.env.GOOGLE_GAME_SHEET_TAB = "results";
  process.env.GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB = "forms";
  process.env.GOOGLE_RECRUITMENT_MASTER_SHEET_TAB = "forms";
  process.env.GOOGLE_GAME_SHEET_TAB = "results";
  process.env.GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB = "招生狀況表";
  process.env.GOOGLE_RECRUITMENT_MASTER_SHEET_TAB = "總表";
  const calls = [];
  const result = official();
  let failForms = false;
  t.mock.method(google.auth, "GoogleAuth", function GoogleAuth(options) {
    return { options };
  });
  t.mock.method(google, "sheets", () => ({
    spreadsheets: { values: {
      get: async ({ spreadsheetId, range }) => {
        assert.equal(spreadsheetId, "fixture-sheet");
        const action = range === "'results'" || range === `'${DEFAULT_TAB_TITLES.gameResults}'` ? "results" : "formResponses";
        calls.push(action);
        if (failForms && action === "formResponses") {
          throw new Error(`firewall blocked ${process.env.GOOGLE_SERVICE_ACCOUNT_JSON}`);
        }
        const rows = action === "results" ? [result] : [
          { 姓名: "小明", 時間戳記: "2026/9/12 10:00:00" },
        ];
        const headers = Object.keys(rows[0]);
        return { data: { values: [
          headers,
          ...rows.map((row) => headers.map((header) =>
            typeof row[header] === "object" ? JSON.stringify(row[header]) : row[header])),
        ] } };
      },
    } },
  }));
  const dashboard = await handleAdminDashboard(request("dashboard?date=2026-09-12", { cookie }));
  const data = await dashboard.json();
  assert.equal(data.kpis.contacts, 2);
  assert.equal(data.topThree.length, 1);
  assert.deepEqual(calls.sort(), ["formResponses", "results"]);
  const forms = await handleAdminFormResponses(request("form-responses?date=2026-09-12&q=小明", { cookie }));
  assert.equal((await forms.json()).rows.length, 1);
  assert.equal((await (await handleAdminResults(request("results?date=2026-09-12&q=nobody", { cookie }))).json()).rows.length, 0);
  failForms = true;
  const partial = await (await handleAdminDashboard(request("dashboard?date=2026-09-12", { cookie }))).json();
  assert.equal(partial.sync.forms.ok, false);
  assert.equal(partial.sync.results.ok, true);
  assert.equal(partial.results.length, 1);
  assert.ok(!JSON.stringify(partial).includes(process.env.GOOGLE_SERVICE_ACCOUNT_JSON));
  const recruitmentRes = await handleAdminRecruitment(request("recruitment?date=2026-09-12", { cookie }));
  const recruitment = await recruitmentRes.json();
  assert.equal(recruitmentRes.status, 200);
  assert.equal(recruitment.ok, true);
  assert.ok("pending" in recruitment);
  assert.ok("funnel" in recruitment);
  assert.ok("summary" in recruitment);
  assert.ok(Array.isArray(recruitment.pending));
  assert.equal("s" in recruitment.summary, false);
  assert.equal("a" in recruitment.summary, false);
  assert.equal("b" in recruitment.summary, false);
  assert.equal(recruitment.candidatesByGatekeeper, undefined);
  if (recruitment.pending.length) {
    assert.match(String(recruitment.pending[0].prefillUrl), /\/viewform\?/);
    assert.doesNotMatch(String(recruitment.pending[0].prefillUrl), /forms\.gle/);
    assert.equal(recruitment.pending[0].latestAttempt, undefined);
    assert.equal(recruitment.pending[0].choiceLabel, undefined);
    assert.equal(recruitment.pending[0].score, undefined);
  }
  assert.equal((await handleAdminRecruitment(request("recruitment"))).status, 401);
  assert.equal((await handleAdminFormResponses(request("form-responses", { cookie }))).status, 502);
  t.mock.method(google, "sheets", () => ({
    spreadsheets: { values: {
      get: async ({ spreadsheetId, range }) => {
        assert.equal(spreadsheetId, "fixture-sheet");
        if (String(range).includes("總表")) {
          throw new Error(`firewall blocked ${process.env.GOOGLE_SERVICE_ACCOUNT_JSON}`);
        }
        const action = range === "'results'" || range === `'${DEFAULT_TAB_TITLES.gameResults}'` ? "results" : "formResponses";
        const rows = action === "results" ? [result] : [
          { 姓名: "小明", 時間戳記: "2026/9/12 10:00:00" },
        ];
        const headers = Object.keys(rows[0]);
        return { data: { values: [
          headers,
          ...rows.map((row) => headers.map((header) =>
            typeof row[header] === "object" ? JSON.stringify(row[header]) : row[header])),
        ] } };
      },
    } },
  }));
  const partialRecruitment = await handleAdminRecruitment(request("recruitment?date=2026-09-12&refresh=1", { cookie }));
  const partialBody = await partialRecruitment.json();
  assert.equal(partialRecruitment.status, 200);
  assert.equal(partialBody.sync.recruitmentMaster.ok, false);
  assert.equal(partialBody.sync.gameResults.ok, true);
  assert.equal(typeof partialBody.summary.playedToday, "number");
  assert.ok(!JSON.stringify(partialBody).includes("private_key"));
  const logout = await handleAdminLogout(request("logout", { body: {}, cookie }));
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await handleAdminLogout(request("logout", { body: {}, headers: { origin: "https://evil.test" } }))).status, 403);
  const originalSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = randomBytes(32).toString("hex");
  assert.equal((await (await handleAdminSession(request("session", { cookie }))).json()).authenticated, false);
  process.env.ADMIN_SESSION_SECRET = originalSecret;
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 8 * 60 * 60 * 1000);
  assert.equal((await (await handleAdminSession(request("session", { cookie }))).json()).authenticated, false);
  t.mock.restoreAll();
  for (let i = 0; i < 5; i++) {
    assert.equal((await handleAdminLogin(request("login", { body: { password: "wrong" }, headers: { "x-forwarded-for": "rate-fixture" } }))).status, 401);
  }
  assert.equal((await handleAdminLogin(request("login", { body: { password: process.env.ADMIN_PASSWORD }, headers: { "x-forwarded-for": "rate-fixture" } }))).status, 429);
});

test("staff recruitment POST requires admin session and only appends 招生狀況表", async (t) => {
  const names = ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "PUBLIC_ORIGIN", "GOOGLE_SERVICE_ACCOUNT_JSON",
    "GOOGLE_SHEET_ID", "GOOGLE_GAME_SHEET_TAB", "GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB",
    "GOOGLE_RECRUITMENT_MASTER_SHEET_TAB"];
  const before = names.map((name) => process.env[name]);
  t.after(() => names.forEach((name, i) => {
    if (before[i] === undefined) delete process.env[name]; else process.env[name] = before[i];
  }));
  process.env.ADMIN_PASSWORD = randomBytes(24).toString("hex");
  process.env.ADMIN_SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.PUBLIC_ORIGIN = origin;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "staff@example.test",
    private_key: "test\\nkey",
  });
  process.env.GOOGLE_SHEET_ID = "fixture-sheet";
  process.env.GOOGLE_GAME_SHEET_TAB = DEFAULT_TAB_TITLES.gameResults;
  process.env.GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB = "招生狀況表";
  process.env.GOOGLE_RECRUITMENT_MASTER_SHEET_TAB = "總表";
  const login = await handleAdminLogin(request("login", { body: { password: process.env.ADMIN_PASSWORD } }));
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const body = {
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
    joined: "否",
    depositPaid: "否",
  };
  assert.equal((await handleAdminRecruitment(request("recruitment", { body }))).status, 401);
  assert.equal((await handleAdminRecruitment(request("recruitment", {
    body, cookie, omitOrigin: true,
  }))).status, 403);
  assert.equal((await handleAdminRecruitment(request("recruitment", {
    body, cookie, headers: { origin: "https://evil.example.com" },
  }))).status, 403);
  const values = [[
    "時間戳記", "接引人(可複選)", "同學的姓名", "同學電話/LINE", "這位同學是屬於那個分級呢:-)",
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
  const response = await handleAdminRecruitment(request("recruitment", { body, cookie }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.duplicate, false);
  assert.ok(ranges.every((range) => String(range).includes("招生狀況表")));
  assert.ok(ranges.every((range) => !String(range).includes("總表")));
  assert.ok(ranges.every((range) => !String(range).includes(DEFAULT_TAB_TITLES.gameResults)));
  const saved = Object.fromEntries(values[0].map((header, index) => [header, values[1][index]]));
  assert.equal(saved["同學的姓名"], "王小明");
  assert.equal(saved["接引人(可複選)"], "柏能");
  assert.equal(saved._gameGatekeeper, "安倢");
  assert.ok(!JSON.stringify(payload).includes("private_key"));
  const missingName = await handleAdminRecruitment(request("recruitment", {
    body: { ...body, name: "" }, cookie,
  }));
  assert.equal(missingName.status, 400);
});
