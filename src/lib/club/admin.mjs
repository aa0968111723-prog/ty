// @ts-nocheck -- Admin HTTP handlers are covered by scripts/club-admin.test.mjs.
import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { SECURITY_HEADERS } from "./api.mjs";
import { adminServiceEnabled, buildSessionView, issuePasswordLogin, passwordConfig, readV2Session, revokeCurrentV2Session } from "./admin-auth.mjs";
import { accuracyOf, scoreIsConsistent, titleForScore } from "./runtime.mjs";
import { diagnoseSheetMappings, invalidateSheetCache, readSheetRows, appendRecruitmentResponse, sheetsConfigured, spreadsheetEditUrl, EXPECTED_SHEET_IDS } from "./sheets.mjs";
import { buildPrefilledFormUrl, buildRecruitmentDashboard, toPartnerRecruitmentDashboard } from "./recruitment.mjs";
import { normalizeStaffRecruitmentPayload } from "./recruitment-staff-form.mjs";
import { bestResultsByPlayer, compareLeaderboardRows } from "./leaderboard.mjs";

/** @typedef {import("./admin").AdminContact} AdminContact */
/** @typedef {import("./admin").OfficialResult} OfficialResult */
/** @typedef {import("./admin").DashboardInput} DashboardInput */
/** @typedef {import("./admin").SyncStatus} SyncStatus */

const COOKIE = "__Host-club_admin";
const SESSION_SECONDS = 8 * 60 * 60;
/** @type {Map<string, {count: number, expires: number}>} */
const limits = new Map();
/** @type {{ password: string, secret: string, key: Buffer } | undefined} */
let signingConfig;
/** @type {{ at: number, key: string, body: unknown } | undefined} */
let recruitmentCache;
const RECRUITMENT_CACHE_MS = 20_000;
const taipei = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const taipeiHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Taipei",
  hour: "2-digit",
  hourCycle: "h23",
});

/** @param {unknown} value */
function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

/** @param {unknown} value */
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/** @param {unknown} value */
export function normalizeName(value) {
  return text(value).normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("en-US");
}

/** @param {Date} value */
function dateInTaipei(value) {
  return taipei.format(value);
}

/** @param {string} value */
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** @param {unknown} value */
function timestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  const raw = text(value);
  if (!raw) return "";
  // Sheet timestamps without a zone are Taiwan wall time, never the server's local time.
  const local = raw.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(?:(上午|下午)\s*)?(\d{1,2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?)?$/,
  );
  let iso = raw;
  if (local) {
    const [, year, month, day, period, hour = "0", minute = "00", second = "00", ms = ""] = local;
    let h = Number(hour);
    if (period) {
      if (h < 1 || h > 12) return "";
      h = (h % 12) + (period === "下午" ? 12 : 0);
    }
    const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (!validDate(date) || h > 23 || Number(minute) > 59 || Number(second) > 59) return "";
    iso = `${date}T${String(h).padStart(2, "0")}:${minute}:${second}${ms}+08:00`;
  } else if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    return "";
  }
  if (!validDate(iso.slice(0, 10))) return "";
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

/** @param {Record<string, unknown>} row @param {string[]} keys */
function field(row, keys) {
  for (const key of keys) {
    if (text(row[key])) return row[key];
  }
  return "";
}

/** @param {unknown} value @returns {AdminContact} */
export function normalizeFormResponse(value) {
  const row = record(value);
  return {
    name: text(field(row, ["name", "姓名", "您的姓名", "你的姓名"])),
    phone: text(field(row, ["phone", "手機", "手機號碼", "電話", "聯絡電話"])),
    department: text(field(row, ["department", "科系", "系所", "就讀科系"])),
    grade: text(field(row, ["grade", "年級"])),
    gatekeeper: text(field(row, ["gatekeeper", "關主", "關主姓名"])),
    source: "Google Form",
    completedAt: timestamp(field(row, ["completedAt", "timestamp", "submittedAt", "時間戳記", "時間戳記 Timestamp", "Timestamp"])),
  };
}

/** @param {unknown} value @returns {AdminContact} */
function resultContact(value) {
  return { ...normalizeFormResponse(value), source: "Focus Challenge" };
}

/** @param {AdminContact} row @param {string | undefined} date */
function onDate(row, date) {
  return Boolean(normalizeName(row.name) && row.completedAt &&
    (!date || dateInTaipei(new Date(row.completedAt)) === date));
}

/** @param {unknown} value */
function number(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return NaN;
  return Number(value);
}

/** @param {unknown} value */
function officialSettings(value) {
  let settings = value;
  if (typeof settings === "string") {
    try { settings = JSON.parse(settings); } catch { return false; }
  }
  const row = record(settings);
  return row.duration === 60 && row.speed === "normal" && row.startMode === "meaning" &&
    row.switchMs === 3000 && row.comboEvery === 3 && row.tapLockMs === 64;
}

/** @param {unknown[]} rows @param {string} [date] @returns {OfficialResult[]} */
export function rankOfficialResults(rows, date) {
  if (date !== undefined && !validDate(date)) throw new RangeError("Invalid date");
  /** @type {OfficialResult[]} */
  const eligible = [];
  const submissions = new Set();
  for (const value of rows) {
    const row = record(value);
    if (row.kind !== "official" || row.skipSave !== false || row.duration !== 60 ||
      !officialSettings(row.settings)) continue;
    const contact = resultContact(row);
    if (!onDate(contact, date)) continue;
    const score = number(row.score);
    const accuracy = number(row.accuracy);
    const correct = number(row.correct);
    const wrong = number(row.wrong);
    const maxCombo = number(row.maxCombo);
    if (![score, correct, wrong, maxCombo].every((n) => Number.isSafeInteger(n) && n >= 0) ||
      !scoreIsConsistent({ score, correct, wrong, maxCombo }) ||
      correct + wrong > Math.ceil(60000 / 64) ||
      accuracy !== accuracyOf(correct, correct + wrong)) continue;
    const submissionId = text(row.submissionId).toLowerCase();
    if (submissionId && submissions.has(submissionId)) continue;
    if (submissionId) submissions.add(submissionId);
    const stable = JSON.stringify([contact, score, accuracy, correct, wrong, maxCombo]);
    eligible.push({
      ...contact,
      id: text(row.id) || submissionId || createHash("sha256").update(stable).digest("hex"),
      submissionId,
      score, accuracy, correct, wrong, maxCombo,
      title: titleForScore(score),
      kind: "official", skipSave: false, duration: 60,
    });
  }
  return eligible.sort((a, b) => b.score - a.score || b.accuracy - a.accuracy ||
    b.correct - a.correct || b.maxCombo - a.maxCombo ||
    a.completedAt.localeCompare(b.completedAt) || a.id.localeCompare(b.id));
}

/** @param {AdminContact[]} rows @param {"gatekeeper" | "department" | "grade"} key */
function distribution(rows, key) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const row of rows) {
    const name = row[key] || "未填寫";
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hant"));
}

/** @param {DashboardInput} [input] @returns {import("./admin").AdminDashboard} */
export function buildDashboard(input = {}) {
  const now = input.now || new Date();
  const date = input.date ?? dateInTaipei(now);
  if (!validDate(date)) throw new RangeError("Invalid date");
  const forms = (input.forms || []).map(normalizeFormResponse).filter((r) => onDate(r, date));
  const results = rankOfficialResults(input.results || [], date);
  const challenges = results.map(resultContact);
  const raw = [...forms, ...challenges].sort((a, b) =>
    b.completedAt.localeCompare(a.completedAt) || a.source.localeCompare(b.source));
  const names = new Set();
  const contacts = raw.filter((row) => {
    const key = normalizeName(row.name);
    if (names.has(key)) return false;
    names.add(key);
    return true;
  });
  const trend = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, "0")}:00`, count: 0,
  }));
  for (const row of contacts) trend[Number(taipeiHour.format(new Date(row.completedAt)))].count += 1;
  const historyTop = bestResultsByPlayer(rankOfficialResults(input.results || []))
    .sort(compareLeaderboardRows)
    .slice(0, 20);
  return {
    ok: true, date, contacts, results, topThree: results.slice(0, 3), historyTop,
    kpis: {
      contacts: contacts.length,
      rawRecords: raw.length,
      duplicates: raw.length - contacts.length,
      officialChallenges: results.length,
      averageScore: results.length ? Math.round(results.reduce((sum, row) => sum + row.score, 0) / results.length * 10) / 10 : 0,
      highestScore: results[0]?.score || 0,
      formResponses: forms.length,
    },
    gatekeepers: distribution(contacts, "gatekeeper"),
    departments: distribution(contacts, "department"),
    grades: distribution(contacts, "grade"),
    trend,
    sync: {
      forms: input.sync?.forms || { ok: true },
      results: input.sync?.results || { ok: true },
      updatedAt: now.toISOString(),
    },
  };
}

function authConfig() {
  return passwordConfig();
}

/** @param {unknown} body @param {number} [status] @param {Record<string, string | string[]>} [headers] */
function json(body, status = 200, headers = {}) {
  const headerList = new Headers({
    ...SECURITY_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    vary: "Cookie",
  });
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "set-cookie") continue;
    headerList.set(key, String(value));
  }
  const cookies = headers["set-cookie"];
  if (Array.isArray(cookies)) for (const cookie of cookies) headerList.append("set-cookie", cookie);
  else if (cookies) headerList.set("set-cookie", cookies);
  return new Response(JSON.stringify(body), { status, headers: headerList });
}

/** @param {string} left @param {string} right */
function constantEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  const length = Math.max(leftBytes.length, rightBytes.length, 1);
  const paddedLeft = Buffer.alloc(length);
  const paddedRight = Buffer.alloc(length);
  leftBytes.copy(paddedLeft);
  rightBytes.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && leftBytes.length === rightBytes.length;
}

/** @param {string} key @param {number} limit @param {number} windowMs @param {boolean} [consume] */
function rateOk(key, limit, windowMs, consume = true) {
  const now = Date.now();
  for (const [id, bucket] of limits) if (bucket.expires <= now) limits.delete(id);
  let bucket = limits.get(key);
  if (!bucket) {
    if (limits.size >= 4096) return false;
    bucket = { count: 0, expires: now + windowMs };
    if (consume) limits.set(key, bucket);
  }
  if (bucket.count >= limit) return false;
  if (consume) bucket.count += 1;
  return true;
}

/** @param {Request} request */
function clientKey(request) {
  // The global limit remains effective even when an untrusted proxy header is spoofed.
  return createHash("sha256").update((request.headers.get("x-forwarded-for") || "local").split(",")[0].trim().slice(0, 128)).digest("hex");
}

/** @param {Request} request */
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (!origin || fetchSite === "cross-site") return false;

  const configuredOrigin =
    process.env.PUBLIC_ORIGIN?.trim().replace(/\/+$/, "");

  let expectedOrigin;

  if (configuredOrigin) {
    try {
      expectedOrigin = new URL(configuredOrigin).origin;
    } catch {
      return false;
    }
  } else {
    expectedOrigin = new URL(request.url).origin;
  }

  const requestOrigin = new URL(request.url).origin;
  return origin === expectedOrigin || origin === requestOrigin;
}

/** @param {string} payload @param {{password: string, secret: string}} config */
function signature(payload, config) {
  if (!signingConfig || signingConfig.password !== config.password || signingConfig.secret !== config.secret) {
    signingConfig = { ...config, key: scryptSync(config.password, config.secret, 32) };
  }
  return createHmac("sha256", signingConfig.key).update(JSON.stringify(["club-admin-v2", payload])).digest("base64url");
}

/** @param {Request} request */
function passwordSession(request) {
  const config = authConfig();
  if (!config) return false;
  const cookies = (request.headers.get("cookie") || "").split(";").map((part) => part.trim());
  const matches = cookies.filter((part) => part.startsWith(`${COOKIE}=`));
  if (matches.length !== 1) return false;
  const token = matches[0].slice(COOKIE.length + 1);
  if (token.length > 1024) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[1]) || !constantEqual(parts[1], signature(parts[0], config))) return false;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    return data.v === 1 && Number.isSafeInteger(data.iat) && Number.isSafeInteger(data.exp) &&
      data.iat <= now && data.exp > now && data.exp - data.iat === SESSION_SECONDS &&
      typeof data.nonce === "string" && /^[a-f0-9]{32}$/.test(data.nonce);
  } catch { return false; }
}

/** @param {Request} request */
async function authenticated(request) {
  if (passwordSession(request)) return true;
  return Boolean(await readV2Session(request));
}

/** @param {string} token @param {number} maxAge */
function cookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}; Expires=${new Date(Date.now() + maxAge * 1000).toUTCString()}`;
}

/** @param {Request} request */
export async function handleAdminLogin(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站登入" }, 403);
  const config = authConfig();
  const ip = clientKey(request);
  if (!rateOk("login:global", 120, 60_000) || !rateOk(`login:${ip}`, 20, 60_000) ||
    !rateOk("failure:global", 90, 900_000, false) || !rateOk(`failure:${ip}`, 5, 900_000, false)) {
    return json({ error: "登入嘗試過多，請稍後再試" }, 429, { "Retry-After": "900" });
  }
  let password = "";
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error();
    // Bound the streamed body too; Content-Length alone is caller-controlled.
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 4096) { await reader.cancel(); throw new Error(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof body?.password !== "string" || body.password.length > 1024) throw new Error();
    password = body.password;
  } catch {
    rateOk(`failure:${ip}`, 5, 900_000);
    rateOk("failure:global", 90, 900_000);
    return json({ error: "請提供有效的登入資料" }, 400);
  }
  if (!constantEqual(password, config.password)) {
    rateOk(`failure:${ip}`, 5, 900_000);
    rateOk("failure:global", 90, 900_000);
    return json({ error: "密碼不正確" }, 401);
  }
  limits.delete(`failure:${ip}`);
  const cookies = await issuePasswordLogin(request);
  return json({ ok: true }, 200, { "set-cookie": cookies });
}

/** @param {Request} request */
export async function handleAdminLogout(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站登出" }, 403);
  await revokeCurrentV2Session(request);
  return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
}

/** @param {Request} request */
export async function handleAdminSession(request) {
  return json(await buildSessionView(request, { passwordSession: passwordSession(request) }));
}

/** @param {Request} request */
async function protect(request) {
  if (!adminServiceEnabled()) return json({ error: "管理功能尚未啟用" }, 503);
  if (!(await authenticated(request))) return json({ error: "請先登入管理後台" }, 401);
  if (!rateOk("read:global", 360, 60_000) || !rateOk(`read:${clientKey(request)}`, 90, 60_000)) {
    return json({ error: "請稍後再試" }, 429, { "Retry-After": "60" });
  }
  return null;
}

/** @param {Request} request */
async function protectWrite(request) {
  if (!adminServiceEnabled()) return json({ error: "管理功能尚未啟用" }, 503);
  if (!(await authenticated(request))) return json({ error: "請先登入管理後台" }, 401);
  if (!sameOrigin(request)) return json({ error: "請從本站送出" }, 403);
  if (!rateOk("write:global", 60, 60_000) || !rateOk(`write:${clientKey(request)}`, 20, 60_000)) {
    return json({ error: "請稍後再試" }, 429, { "Retry-After": "60" });
  }
  return null;
}

/** @param {Request} request @param {number} [maxBytes] */
async function readJsonObject(request, maxBytes = 16_384) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("format");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("format");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error("format");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("format");
  return parsed;
}

/** @param {Request} request */
function queryDate(request) {
  const values = new URL(request.url).searchParams.getAll("date");
  const date = values[0] ?? dateInTaipei(new Date());
  return values.length > 1 || !validDate(date) ? null : date;
}

/** @param {"formResponses" | "results"} action @returns {Promise<unknown[]>} */
async function readSheet(action) {
  try {
    return await readSheetRows(action);
  } catch {
    // Never reflect credentials, response bodies or upstream exception text.
    throw new Error("無法讀取資料，請稍後重試");
  }
}

/** @param {PromiseSettledResult<unknown[]>} result @returns {SyncStatus} */
function sourceStatus(result) {
  return result.status === "fulfilled" ? { ok: true } : { ok: false, error: result.reason.message };
}

/** @param {Request} request */
export async function handleAdminDashboard(request) {
  const denied = await protect(request);
  if (denied) return denied;
  const date = queryDate(request);
  if (!date) return json({ error: "日期格式須為有效的 YYYY-MM-DD" }, 400);
  const [forms, results] = await Promise.allSettled([readSheet("formResponses"), readSheet("results")]);
  return json(buildDashboard({
    date,
    forms: forms.status === "fulfilled" ? forms.value : [],
    results: results.status === "fulfilled" ? results.value : [],
    sync: { forms: sourceStatus(forms), results: sourceStatus(results) },
  }));
}

/** @param {AdminContact[]} rows @param {Request} request */
function searchContacts(rows, request) {
  const query = normalizeName(new URL(request.url).searchParams.get("q")).slice(0, 200);
  return query ? rows.filter((row) =>
    [row.name, row.phone, row.department, row.grade, row.gatekeeper].some((value) => normalizeName(value).includes(query))) : rows;
}

/** @param {Request} request @param {"formResponses" | "results"} action */
async function handleRows(request, action) {
  const denied = await protect(request);
  if (denied) return denied;
  const date = queryDate(request);
  if (!date) return json({ error: "日期格式須為有效的 YYYY-MM-DD" }, 400);
  try {
    const values = await readSheet(action);
    const contacts = values.map(action === "formResponses" ? normalizeFormResponse : resultContact)
      .filter((row) => onDate(row, date));
    const rows = action === "formResponses" ? contacts : rankOfficialResults(values, date);
    return json({ ok: true, date, rows: searchContacts(rows, request), contacts: searchContacts(contacts, request) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "無法讀取資料" }, 502);
  }
}

/** @param {Request} request */
export async function handleAdminFormResponses(request) {
  return handleRows(request, "formResponses");
}

/** @param {Request} request */
export async function handleAdminResults(request) {
  return handleRows(request, "results");
}

/** @type {Record<string, unknown[]>} */
const lastSourceRows = {
  gameResults: [],
  recruitmentResponses: [],
  recruitmentMaster: [],
};

/** @param {string} action @param {boolean} bypass */
async function readSource(action, bypass) {
  try {
    const rows = await readSheetRows(action, { bypassCache: bypass });
    lastSourceRows[action] = rows;
    return { ok: true, rows, stale: false };
  } catch {
    return {
      ok: false,
      rows: lastSourceRows[action] || [],
      stale: (lastSourceRows[action] || []).length > 0,
      error: "無法讀取資料，請稍後重試",
    };
  }
}

function sourceSync(result) {
  return result.ok
    ? { ok: true, stale: false }
    : { ok: false, stale: Boolean(result.stale), error: result.error };
}

/** @param {Request} request */
export async function handleAdminRecruitment(request) {
  if (request.method === "POST") return handleAdminRecruitmentSubmit(request);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, { Allow: "GET, POST" });
  const denied = await protect(request);
  if (denied) return denied;
  const date = queryDate(request);
  if (!date) return json({ error: "日期格式須為有效的 YYYY-MM-DD" }, 400);
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  if (refresh) {
    invalidateSheetCache();
    recruitmentCache = undefined;
  } else if (recruitmentCache && recruitmentCache.key === date && Date.now() - recruitmentCache.at < RECRUITMENT_CACHE_MS) {
    return json(recruitmentCache.body);
  }
  const [game, recruitment, master] = await Promise.all([
    readSource("gameResults", refresh),
    readSource("recruitmentResponses", refresh),
    readSource("recruitmentMaster", refresh),
  ]);
  const dashboard = buildRecruitmentDashboard({
    date,
    now: new Date(),
    gameRows: game.rows,
    recruitmentRows: recruitment.rows,
    masterRows: master.rows,
    sync: {
      gameResults: sourceSync(game),
      recruitmentResponses: sourceSync(recruitment),
      recruitmentMaster: sourceSync(master),
      form: sourceSync(recruitment),
      updatedAt: new Date().toISOString(),
    },
  });
  dashboard.pending = dashboard.pending.map((row) => ({
    ...row,
    prefillUrl: buildPrefilledFormUrl(row),
  }));
  dashboard.profiles = dashboard.profiles.map((row) => ({
    ...row,
    prefillUrl: row.pending ? buildPrefilledFormUrl(row) : "",
  }));
  try {
    const diagnosis = await diagnoseSheetMappings();
    const gameTab = diagnosis.ok
      ? diagnosis.sheets.find((sheet) => sheet.sheetId === EXPECTED_SHEET_IDS.gameResults)
      : null;
    dashboard.sync.tabs = diagnosis.ok
      ? {
        gameResults: diagnosis.resolved.gameResults.resolvedTab,
        recruitmentResponses: diagnosis.resolved.recruitmentResponses.resolvedTab,
        recruitmentMaster: diagnosis.resolved.recruitmentMaster.resolvedTab,
      }
      : undefined;
    dashboard.sync.links = {
      game: spreadsheetEditUrl(EXPECTED_SHEET_IDS.gameResults),
    };
    if (diagnosis.ok && diagnosis.sheets.length > 0 && !gameTab) {
      dashboard.sync.gameResults = {
        ok: false,
        stale: Boolean(dashboard.sync.gameResults?.stale),
        error: "遊戲成績分頁不存在",
      };
    }
  } catch {
    /* Tab titles are optional diagnostics. */
  }
  const partner = toPartnerRecruitmentDashboard(dashboard);
  recruitmentCache = { at: Date.now(), key: date, body: partner };
  return json(partner);
}

/** @param {Request} request */
export async function handleAdminRecruitmentSubmit(request) {
  const denied = await protectWrite(request);
  if (denied) return denied;
  if (!sheetsConfigured("recruitmentResponses")) {
    return json({ error: "招生狀況表尚未設定" }, 503);
  }
  let body;
  try {
    body = await readJsonObject(request);
  } catch {
    return json({ error: "請提供有效的招生資料" }, 400);
  }
  const parsed = normalizeStaffRecruitmentPayload(body, { now: new Date() });
  if (!parsed.ok) return json({ error: parsed.errors[0] || "請檢查欄位" }, 400);
  try {
    const result = await appendRecruitmentResponse(parsed.payload);
    const completedAt = timestamp(parsed.payload.completedAt);
    const effectiveDate = completedAt
      ? dateInTaipei(new Date(completedAt))
      : dateInTaipei(new Date());
    if (result.row) {
      lastSourceRows.recruitmentResponses = [
        ...(lastSourceRows.recruitmentResponses || []),
        result.row,
      ];
    }
    recruitmentCache = undefined;
    invalidateSheetCache();
    const dashboard = buildRecruitmentDashboard({
      date: effectiveDate,
      now: new Date(),
      gameRows: lastSourceRows.gameResults,
      recruitmentRows: lastSourceRows.recruitmentResponses,
      masterRows: lastSourceRows.recruitmentMaster,
    });
    return json({
      ok: true,
      duplicate: Boolean(result.duplicate),
      saved: Boolean(result.saved && !result.duplicate),
      pending: toPartnerRecruitmentDashboard(dashboard).pending,
    });
  } catch {
    return json({ error: "無法寫入招生狀況表，請稍後重試或改用正式表單" }, 502);
  }
}
