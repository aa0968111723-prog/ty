import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SECURITY_HEADERS } from "./api.mjs";
import { accuracyOf, scoreIsConsistent, titleForScore } from "./runtime.mjs";

/** @typedef {import("./admin").AdminContact} AdminContact */
/** @typedef {import("./admin").OfficialResult} OfficialResult */
/** @typedef {import("./admin").DashboardInput} DashboardInput */
/** @typedef {import("./admin").SyncStatus} SyncStatus */

const COOKIE = "__Host-club_admin";
const SESSION_SECONDS = 8 * 60 * 60;
const SHEET_TIMEOUT_MS = 8_000;
/** @type {Map<string, {count: number, expires: number}>} */
const limits = new Map();
/** @type {{ password: string, secret: string, key: Buffer } | undefined} */
let signingConfig;
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
  return {
    ok: true, date, contacts, results, topThree: results.slice(0, 3),
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
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!password?.trim() || !secret || Buffer.byteLength(secret) < 32) return null;
  return { password, secret };
}

/** @param {unknown} body @param {number} [status] @param {Record<string, string>} [headers] */
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "vary": "Cookie",
      ...headers,
    },
  });
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

  return origin === expectedOrigin;
}

/** @param {string} payload @param {{password: string, secret: string}} config */
function signature(payload, config) {
  if (!signingConfig || signingConfig.password !== config.password || signingConfig.secret !== config.secret) {
    signingConfig = { ...config, key: scryptSync(config.password, config.secret, 32) };
  }
  return createHmac("sha256", signingConfig.key).update(JSON.stringify(["club-admin-v2", payload])).digest("base64url");
}

/** @param {Request} request */
function authenticated(request) {
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

/** @param {string} token @param {number} maxAge */
function cookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}; Expires=${new Date(Date.now() + maxAge * 1000).toUTCString()}`;
}

/** @param {Request} request */
export async function handleAdminLogin(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站登入" }, 403);
  const config = authConfig();
  if (!config) return json({ error: "管理功能尚未啟用" }, 503);
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
  const iat = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ v: 1, iat, exp: iat + SESSION_SECONDS, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  return json({ ok: true }, 200, { "set-cookie": cookie(`${payload}.${signature(payload, config)}`, SESSION_SECONDS) });
}

/** @param {Request} request */
export async function handleAdminLogout(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "請從本站登出" }, 403);
  return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
}

/** @param {Request} request */
export async function handleAdminSession(request) {
  return json({ authenticated: authenticated(request) });
}

/** @param {Request} request */
function protect(request) {
  if (!authConfig()) return json({ error: "管理功能尚未啟用" }, 503);
  if (!authenticated(request)) return json({ error: "請先登入管理後台" }, 401);
  if (!rateOk("read:global", 360, 60_000) || !rateOk(`read:${clientKey(request)}`, 90, 60_000)) {
    return json({ error: "請稍後再試" }, 429, { "Retry-After": "60" });
  }
  return null;
}

/** @param {Request} request */
function queryDate(request) {
  const values = new URL(request.url).searchParams.getAll("date");
  const date = values[0] ?? dateInTaipei(new Date());
  return values.length > 1 || !validDate(date) ? null : date;
}

/** @param {"formResponses" | "results"} action @returns {Promise<unknown[]>} */
async function readSheet(action) {
  const configured = text(process.env.GOOGLE_SCRIPT_URL);
  const markdown = configured.match(/^\[(https?:\/\/[^\]]+)\]\(\1\)$/);
  const url = markdown?.[1] || configured;
  if (!url) throw new Error("資料來源尚未設定");
  try {
    if (new URL(url).protocol !== "https:") throw new Error();
  } catch { throw new Error("資料來源尚未設定"); }
  const controller = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("讀取資料逾時，請重試")); }, SHEET_TIMEOUT_MS);
  });
  try {
    const task = async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          password: text(process.env.PASSWORD),
          sheetId: text(process.env.GOOGLE_SHEET_ID),
          sheetTab: text(process.env.GOOGLE_SHEET_TAB),
          formSheetTab: text(process.env.GOOGLE_FORM_SHEET_TAB),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data?.ok !== true || !Array.isArray(data.rows)) throw new Error();
      return data.rows;
    };
    return /** @type {unknown[]} */ (await Promise.race([task(), timeout]));
  } catch {
    // Never reflect connector URLs, passwords, response bodies or upstream exception text.
    throw new Error(controller.signal.aborted ? "讀取資料逾時，請重試" : "無法讀取資料，請稍後重試");
  } finally { clearTimeout(timer); }
}

/** @param {PromiseSettledResult<unknown[]>} result @returns {SyncStatus} */
function sourceStatus(result) {
  return result.status === "fulfilled" ? { ok: true } : { ok: false, error: result.reason.message };
}

/** @param {Request} request */
export async function handleAdminDashboard(request) {
  const denied = protect(request);
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
  const denied = protect(request);
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
