// @ts-nocheck -- Ranking helpers are covered by leaderboard and API contract tests.
import { accuracyOf, scoreIsConsistent, titleForScore } from "./runtime.mjs";
import { extractTaiwanMobile, normalizeName } from "./recruitment-identity.mjs";
import { internalizedGameRow, readSheetRows, sheetsConfigured } from "./sheets.mjs";

export const LEADERBOARD_CACHE_MS = 30_000;
export const LEADERBOARD_SCOPES = Object.freeze(["today", "history"]);
export const PUBLIC_ROW_KEYS = Object.freeze([
  "rank",
  "displayName",
  "score",
  "accuracy",
  "title",
  "time",
]);
const SENSITIVE_MARKERS = [
  "phone",
  "phoneNumber",
  "submissionId",
  "_submissionId",
  "playerKey",
  "gatekeeper",
  "department",
  "grade",
  "answers",
  "answerLog",
  "email",
];

const taipeiDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const taipeiClock = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const taipeiStamp = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** @type {Map<string, { at: number, body: Record<string, unknown> }>} */
const cache = new Map();

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
function number(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return NaN;
  return Number(String(value).replace(/%/g, ""));
}

/** @param {Date} value */
export function dateInTaipei(value) {
  return taipeiDate.format(value);
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

/** @param {unknown} name */
export function maskDisplayName(name) {
  const raw = text(name).normalize("NFKC");
  if (!raw) return "同學";
  const chars = [...raw];
  if (chars.length === 1) return `${chars[0]}○`;
  if (chars.length === 2) return `${chars[0]}○`;
  return `${chars[0]}${"○".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

/** @param {Record<string, unknown>} row */
export function playerKey(row) {
  const phone = extractTaiwanMobile(row.phone);
  if (phone) return `phone:${phone}`;
  const name = normalizeName(row.name);
  if (name) return `name:${name}`;
  const submissionId = text(row.submissionId).toLowerCase();
  return submissionId ? `sid:${submissionId}` : `anon:${text(row.completedAt)}:${text(row.score)}`;
}

/**
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
 */
export function compareLeaderboardRows(a, b) {
  return Number(b.score) - Number(a.score) || Number(b.accuracy) - Number(a.accuracy) ||
    Number(b.correct) - Number(a.correct) || Number(b.maxCombo) - Number(a.maxCombo) ||
    String(a.completedAt).localeCompare(String(b.completedAt)) ||
    String(a.submissionId).localeCompare(String(b.submissionId));
}

/** @param {unknown[]} rows */
export function eligibleOfficialResults(rows) {
  /** @type {Array<Record<string, unknown>>} */
  const eligible = [];
  const submissions = new Set();
  for (const value of rows || []) {
    const row = internalizedGameRow(record(value));
    if (row.kind !== "official" || row.skipSave !== false || Number(row.duration) !== 60 ||
      !officialSettings(row.settings)) continue;
    const score = number(row.score);
    const correct = number(row.correct);
    const wrong = number(row.wrong);
    const maxCombo = number(row.maxCombo);
    const accuracy = number(row.accuracy);
    const completedAt = text(row.completedAt);
    if (![score, correct, wrong, maxCombo].every((n) => Number.isSafeInteger(n) && n >= 0) ||
      !scoreIsConsistent({ score, correct, wrong, maxCombo }) ||
      correct + wrong > Math.ceil(60000 / 64) ||
      accuracy !== accuracyOf(correct, correct + wrong) ||
      !completedAt || !Number.isFinite(Date.parse(completedAt))) continue;
    const submissionId = text(row.submissionId).toLowerCase();
    if (submissionId && submissions.has(submissionId)) continue;
    if (submissionId) submissions.add(submissionId);
    eligible.push({
      name: text(row.name),
      phone: text(row.phone),
      score,
      accuracy,
      correct,
      wrong,
      maxCombo,
      title: titleForScore(score),
      duration: 60,
      kind: "official",
      skipSave: false,
      submissionId,
      completedAt,
    });
  }
  return eligible;
}

/** @param {Array<Record<string, unknown>>} rows */
export function bestResultsByPlayer(rows) {
  /** @type {Map<string, Record<string, unknown>>} */
  const best = new Map();
  for (const row of rows) {
    const key = playerKey(row);
    const current = best.get(key);
    if (!current || compareLeaderboardRows(row, current) < 0) best.set(key, row);
  }
  return [...best.values()];
}

/** @param {string} iso @param {"today" | "history"} scope */
function formatPublicTime(iso, scope) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  if (scope === "today") return taipeiClock.format(date);
  return taipeiStamp.format(date).replace(/\//g, "/");
}

/** @param {Record<string, unknown>} row @param {number} rank @param {"today" | "history"} scope */
export function toPublicLeaderboardRow(row, rank, scope) {
  return {
    rank,
    displayName: maskDisplayName(row.name),
    score: row.score,
    accuracy: row.accuracy,
    title: row.title,
    time: formatPublicTime(String(row.completedAt), scope),
  };
}

/** @param {unknown} payload */
export function publicLeaderboardHasSensitiveData(payload) {
  const dump = JSON.stringify(payload);
  if (SENSITIVE_MARKERS.some((key) => dump.includes(`"${key}"`))) return true;
  if (Array.isArray(payload?.rows)) {
    for (const row of payload.rows) {
      const keys = Object.keys(record(row));
      if (keys.some((key) => !PUBLIC_ROW_KEYS.includes(key))) return true;
    }
  }
  return /09\d{8}/.test(dump) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(dump);
}

/**
 * @param {{ rows?: unknown[], scope: "today" | "history", now?: Date }} input
 */
export function buildPublicLeaderboard(input) {
  const now = input.now || new Date();
  const date = dateInTaipei(now);
  const eligible = eligibleOfficialResults(input.rows || []);
  const scoped = input.scope === "today"
    ? eligible.filter((row) => dateInTaipei(new Date(String(row.completedAt))) === date)
    : eligible;
  const ranked = bestResultsByPlayer(scoped).sort(compareLeaderboardRows);
  const rows = ranked.map((row, index) => toPublicLeaderboardRow(row, index + 1, input.scope));
  return {
    ok: true,
    public: true,
    scope: input.scope,
    date,
    generatedAt: now.toISOString(),
    count: rows.length,
    topThree: rows.slice(0, 3),
    rows,
  };
}

export function parseLeaderboardScope(request) {
  const values = new URL(request.url).searchParams.getAll("scope");
  if (values.length > 1) return { ok: false, error: "scope 只能指定一次" };
  const scope = values[0] || "today";
  if (!LEADERBOARD_SCOPES.includes(scope)) return { ok: false, error: "scope 須為 today 或 history" };
  return { ok: true, scope };
}

export function leaderboardCacheKey(scope, date) {
  return scope === "today" ? `today:${date}` : "history";
}

export function readLeaderboardCache(key, now = Date.now()) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at > LEADERBOARD_CACHE_MS) {
    cache.delete(key);
    return null;
  }
  return hit.body;
}

/** @param {string} key @param {Record<string, unknown>} body */
export function writeLeaderboardCache(key, body, now = Date.now()) {
  cache.set(key, { at: now, body });
}

export function invalidateLeaderboardCache() {
  cache.clear();
}

export async function loadPublicLeaderboard(scope, now = new Date()) {
  const date = dateInTaipei(now);
  const key = leaderboardCacheKey(scope, date);
  const cached = readLeaderboardCache(key);
  if (cached) return /** @type {Record<string, unknown>} */ ({ ...cached, cached: true });
  const rows = sheetsConfigured("gameResults") ? await readSheetRows("gameResults") : [];
  const body = {
    ...buildPublicLeaderboard({ rows, scope, now }),
    source: sheetsConfigured("gameResults") ? "game-sheet" : "unconfigured",
    cached: false,
  };
  writeLeaderboardCache(key, body);
  return body;
}
