import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import {
  buildDashboard, normalizeFormResponse, rankOfficialResults,
  handleAdminLogin, handleAdminLogout, handleAdminSession,
  handleAdminDashboard, handleAdminFormResponses, handleAdminResults,
} from "../src/lib/club/admin.mjs";
import { DEFAULT_SETTINGS } from "../src/lib/club/runtime.mjs";

const origin = "https://club.example.test";
const official = (overrides = {}) => ({
  name: "小華", phone: "0900000000", department: "歷史學系", grade: "大一", gatekeeper: "柏能",
  completedAt: "2026-09-12T01:00:00.000Z", submissionId: crypto.randomUUID(),
  kind: "official", skipSave: false, duration: 60, settings: DEFAULT_SETTINGS,
  score: 600, correct: 5, wrong: 0, maxCombo: 5, accuracy: 100,
  ...overrides,
});
const request = (path, { body, cookie, headers = {} } = {}) =>
  new Request(`${origin}/api/admin/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
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
  const legacy = official({ submissionId: "", settings: JSON.stringify(DEFAULT_SETTINGS) });
  assert.equal(rankOfficialResults([legacy])[0].id, rankOfficialResults([legacy])[0].id);
});

test("admin authentication and private read API contracts with mocked Google only", async (t) => {
  const names = ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "GOOGLE_SCRIPT_URL", "PASSWORD",
    "GOOGLE_SHEET_ID", "GOOGLE_SHEET_TAB", "GOOGLE_FORM_SHEET_TAB"];
  const before = names.map((name) => process.env[name]);
  t.after(() => names.forEach((name, i) => {
    if (before[i] === undefined) delete process.env[name]; else process.env[name] = before[i];
  }));
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_SESSION_SECRET;
  assert.equal((await handleAdminLogin(request("login", { body: { password: "" } }))).status, 503);
  process.env.ADMIN_PASSWORD = randomBytes(24).toString("hex");
  process.env.ADMIN_SESSION_SECRET = randomBytes(32).toString("hex");
  const login = () => handleAdminLogin(request("login", { body: { password: process.env.ADMIN_PASSWORD } }));
  assert.equal((await handleAdminLogin(request("login", { body: {}, headers: { origin: "https://evil.test" } }))).status, 403);
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
  assert.deepEqual(await (await handleAdminSession(request("session", { cookie }))).json(), { authenticated: true });
  assert.deepEqual(await (await handleAdminSession(request("session", { cookie: `${cookie}x` }))).json(), { authenticated: false });
  assert.equal((await (await handleAdminSession(request("session", { cookie: `${cookie}; ${cookie}` }))).json()).authenticated, false);
  for (const handler of [handleAdminDashboard, handleAdminResults, handleAdminFormResponses]) {
    assert.equal((await handler(request("dashboard"))).status, 401);
    assert.equal((await handler(request("dashboard?date=2026-02-30", { cookie }))).status, 400);
    assert.equal((await handler(request("dashboard?date=2026-09-12&date=2026-09-11", { cookie }))).status, 400);
  }
  process.env.GOOGLE_SCRIPT_URL = "https://example.test/mock-sheet";
  process.env.PASSWORD = randomBytes(24).toString("hex");
  process.env.GOOGLE_SHEET_ID = "fixture-sheet";
  process.env.GOOGLE_SHEET_TAB = "results";
  process.env.GOOGLE_FORM_SHEET_TAB = "forms";
  const calls = [];
  const result = official();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, process.env.GOOGLE_SCRIPT_URL);
    assert.equal(options.method, "POST");
    const body = JSON.parse(options.body);
    calls.push(body.action);
    assert.equal(body.password, process.env.PASSWORD);
    assert.equal(body.formSheetTab, "forms");
    return Response.json({ ok: true, rows: body.action === "results" ? [result] : [
      { 姓名: "小明", 時間戳記: "2026/9/12 10:00:00" },
    ] });
  });
  const dashboard = await handleAdminDashboard(request("dashboard?date=2026-09-12", { cookie }));
  const data = await dashboard.json();
  assert.equal(data.kpis.contacts, 2);
  assert.equal(data.topThree.length, 1);
  assert.deepEqual(calls.sort(), ["formResponses", "results"]);
  const forms = await handleAdminFormResponses(request("form-responses?date=2026-09-12&q=小明", { cookie }));
  assert.equal((await forms.json()).rows.length, 1);
  assert.equal((await (await handleAdminResults(request("results?date=2026-09-12&q=nobody", { cookie }))).json()).rows.length, 0);
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    if (JSON.parse(options.body).action === "results") return Response.json({ ok: true, rows: [result] });
    throw new Error(`firewall blocked ${process.env.PASSWORD}`);
  });
  const partial = await (await handleAdminDashboard(request("dashboard?date=2026-09-12", { cookie }))).json();
  assert.equal(partial.sync.forms.ok, false);
  assert.equal(partial.sync.results.ok, true);
  assert.equal(partial.results.length, 1);
  assert.ok(!JSON.stringify(partial).includes(process.env.PASSWORD));
  assert.equal((await handleAdminFormResponses(request("form-responses", { cookie }))).status, 502);
  const logout = await handleAdminLogout(request("logout", { body: {}, cookie }));
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await handleAdminLogout(request("logout", { body: {}, headers: { origin: "https://evil.test" } }))).status, 403);
  const originalPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = randomBytes(24).toString("hex");
  assert.equal((await (await handleAdminSession(request("session", { cookie }))).json()).authenticated, false);
  process.env.ADMIN_PASSWORD = originalPassword;
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 8 * 60 * 60 * 1000);
  assert.equal((await (await handleAdminSession(request("session", { cookie }))).json()).authenticated, false);
  t.mock.restoreAll();
  for (let i = 0; i < 5; i++) {
    assert.equal((await handleAdminLogin(request("login", { body: { password: "wrong" }, headers: { "x-forwarded-for": "rate-fixture" } }))).status, 401);
  }
  assert.equal((await handleAdminLogin(request("login", { body: { password: process.env.ADMIN_PASSWORD }, headers: { "x-forwarded-for": "rate-fixture" } }))).status, 429);
});
