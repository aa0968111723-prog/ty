// @ts-nocheck -- Sheets adapter is covered by scripts/club-sheets.test.mjs and api contract tests.
import "@tanstack/react-start/server-only";
import { google } from "googleapis";
import { asBoolean, cellValue, fieldFromAliases, internalizedGameRow, RESULT_COLUMNS } from "./game-row.mjs";
export { asBoolean, cellValue, fieldFromAliases, internalizedGameRow, RESULT_COLUMNS } from "./game-row.mjs";
import {
  cellsForRecruitmentResponse,
  ensureRecruitmentResponseHeaders,
  recruitmentResponseDuplicate,
  staffRecruitmentRecord,
} from "./recruitment-staff-form.mjs";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEET_TIMEOUT_MS = 8_000;
const CACHE_MS = 20_000;
export const GAME_RECORD_VERSION = "1";
export const GAME_SOURCE = "ty-focus-challenge";

export const GAME_DISPLAY_COLUMNS = [
  "遊戲時間", "姓名", "科系", "年級", "電話", "遊戲關主",
  "分數", "答對", "答錯", "作答次數", "正確率", "最佳連續",
  "平均反應毫秒", "遊戲秒數", "專注稱號", "完整作答", "原始答案 JSON",
];
export const GAME_TECHNICAL_COLUMNS = [
  "_submissionId", "_recordVersion", "_source", "_kind", "_skipSave", "_settings",
];
export const GAME_SAFE_HEADERS = [...GAME_DISPLAY_COLUMNS, ...GAME_TECHNICAL_COLUMNS];

export const EXPECTED_SHEET_IDS = Object.freeze({
  recruitmentMaster: 0,
  teaPartySignup: 107799715,
  recruitmentResponses: 1921679351,
  gameResults: 896311128,
});
function defaultGameTabTitle() {
  return ["09", "14後玩遊戲"].join("/");
}
export const DEFAULT_TAB_TITLES = Object.freeze({
  gameResults: defaultGameTabTitle(),
  recruitmentResponses: "招生狀況表",
  recruitmentMaster: "總表",
});

const ACTION_ALIASES = {
  results: "gameResults",
  gameResults: "gameResults",
  formResponses: "formResponses",
  recruitmentResponses: "recruitmentResponses",
  recruitmentMaster: "recruitmentMaster",
};

/** @typedef {{ saved: boolean, duplicate: boolean, conflict?: boolean }} SaveResult */

/** @type {string | undefined} */
let cachedCredentialsJson;
/** @type {InstanceType<typeof google.auth.GoogleAuth> | undefined} */
let cachedAuth;
let writeQueue = Promise.resolve();
/** @type {{ at: number, sheets: { title: string, sheetId: number }[] } | undefined} */
let metaCache;

/** @param {string} name */
function configuredValue(name) {
  const value = String(process.env[name] ?? "").trim();
  return value || null;
}

/** @returns {string} */
function serviceAccountJson() {
  const value = configuredValue("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!value) throw new Error("Google Sheets is not configured");
  return value;
}

/** @param {string} value @returns {Record<string, any>} */
function serviceAccountCredentials(value) {
  let credentials;
  try {
    credentials = JSON.parse(value);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is invalid");
  }
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is invalid");
  }
  if (
    typeof credentials.client_email !== "string" || !credentials.client_email.trim() ||
    typeof credentials.private_key !== "string" || !credentials.private_key.trim()
  ) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is invalid");
  }
  return {
    ...credentials,
    private_key: credentials.private_key.replace(/\\n/g, "\n"),
  };
}

/** @returns {import("googleapis").sheets_v4.Sheets} */
function sheetsClient() {
  const credentialsJson = serviceAccountJson();
  if (!cachedAuth || cachedCredentialsJson !== credentialsJson) {
    cachedAuth = new google.auth.GoogleAuth({
      credentials: serviceAccountCredentials(credentialsJson),
      scopes: [SHEETS_SCOPE],
    });
    cachedCredentialsJson = credentialsJson;
  }
  return google.sheets({ version: "v4", auth: cachedAuth });
}

/** @param {string} action */
export function canonicalSheetAction(action = "results") {
  const canonical = ACTION_ALIASES[action];
  if (!canonical) throw new TypeError("Invalid sheet action");
  return canonical;
}

/** @param {string} [action] */
function envTab(action = "results") {
  const canonical = canonicalSheetAction(action);
  if (canonical === "gameResults") {
    // Never follow leftover GOOGLE_SHEET_TAB — that name may not exist in the workbook.
    return configuredValue("GOOGLE_GAME_SHEET_TAB") || DEFAULT_TAB_TITLES.gameResults;
  }
  if (canonical === "recruitmentResponses") {
    return configuredValue("GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB")
      || DEFAULT_TAB_TITLES.recruitmentResponses;
  }
  if (canonical === "formResponses") {
    return configuredValue("GOOGLE_FORM_SHEET_TAB")
      || configuredValue("GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB")
      || DEFAULT_TAB_TITLES.recruitmentResponses;
  }
  return configuredValue("GOOGLE_RECRUITMENT_MASTER_SHEET_TAB")
    || DEFAULT_TAB_TITLES.recruitmentMaster;
}

/** @param {string} [action] */
function sheetConfig(action = "results") {
  const spreadsheetId = configuredValue("GOOGLE_SHEET_ID");
  const tab = envTab(action);
  if (!spreadsheetId || !tab) throw new Error("Google Sheets is not configured");
  return { spreadsheetId, tab, action: canonicalSheetAction(action) };
}

/** @param {string} [action] */
export function sheetsConfigured(action = "results") {
  const credentialsJson = configuredValue("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!credentialsJson || !configuredValue("GOOGLE_SHEET_ID")) return false;
  try {
    serviceAccountCredentials(credentialsJson);
    envTab(action);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} tab */
function quotedSheetName(tab) {
  return `'${tab.replace(/'/g, "''")}'`;
}

/** @param {number} index */
function columnName(index) {
  let name = "";
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

/** @param {string} tab @param {number} row @param {number} width */
function rowRange(tab, row, width) {
  return `${quotedSheetName(tab)}!A${row}:${columnName(width)}${row}`;
}

/** @param {unknown[][]} values @returns {Record<string, unknown>[]} */
export function rowsFromValues(values) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return [];
  const headers = values[0].map((value) => String(cellValue(value) ?? ""));
  return values.slice(1)
    .filter((cells) => Array.isArray(cells) && cells.some((value) => value !== "" && value != null))
    .map((cells) => {
      /** @type {Record<string, unknown>} */
      const row = {};
      headers.forEach((header, index) => {
        if (!header) return;
        let value = cellValue(cells[index] ?? "");
        if ((header === "settings" || header === "_settings" || header === "原始答案 JSON") && typeof value === "string") {
          try { value = JSON.parse(value); } catch { /* Invalid JSON remains a string. */ }
        }
        row[header] = value;
      });
      return row;
    });
}

/** @param {unknown} value @returns {string | number | boolean} */
function sheetCell(value) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : String(value);
}

const taipeiDateTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** @param {unknown} value */
export function formatTaipeiTimestamp(value) {
  const raw = value instanceof Date ? value : new Date(String(value ?? ""));
  if (!Number.isFinite(raw.getTime())) return String(value ?? "");
  return taipeiDateTime.format(raw).replace(/\//g, "/");
}

/** @param {unknown} value */
function isoTimestamp(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const local = raw.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(?:(上午|下午)\s*)?(\d{1,2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?)?$/,
  );
  if (local) {
    const [, year, month, day, period, hour = "0", minute = "00", second = "00", ms = ""] = local;
    let h = Number(hour);
    if (period) h = (h % 12) + (period === "下午" ? 12 : 0);
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${String(h).padStart(2, "0")}:${minute}:${second}${ms}+08:00`;
    const date = new Date(iso);
    return Number.isFinite(date.getTime()) ? date.toISOString() : raw;
  }
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : raw;
}

/** @param {Record<string, unknown>} row */
function normalizedResult(row) {
  return internalizedGameRow(row);
}

/** @param {unknown} value */
function comparableTimestamp(value) {
  return isoTimestamp(value).replace(/\.\d{3}Z$/, "Z");
}

/** @param {Record<string, unknown>} row */
function comparableResult(row) {
  const normalized = internalizedGameRow(row);
  normalized.completedAt = comparableTimestamp(normalized.completedAt);
  for (const key of ["score", "correct", "wrong", "maxCombo", "duration"]) {
    const n = Number(normalized[key]);
    if (Number.isFinite(n)) normalized[key] = n;
  }
  normalized.skipSave = asBoolean(normalized.skipSave, false);
  normalized.kind = String(normalized.kind || "official");
  if (typeof normalized.accuracy === "number") {
    normalized.accuracy = Math.round(normalized.accuracy * 10) / 10;
  }
  return normalized;
}

/** @param {Record<string, unknown>} left @param {Record<string, unknown>} right */
function sameResult(left, right) {
  return JSON.stringify(comparableResult(left)) === JSON.stringify(comparableResult(right));
}

/**
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} tab
 * @returns {Promise<unknown[][]>}
 */
async function getValues(sheets, spreadsheetId, tab) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: quotedSheetName(tab),
    majorDimension: "ROWS",
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  }, { timeout: SHEET_TIMEOUT_MS });
  return Array.isArray(response.data.values)
    ? /** @type {unknown[][]} */ (response.data.values)
    : [];
}

/** @param {import("googleapis").sheets_v4.Sheets} sheets @param {string} spreadsheetId */
async function listSheetProperties(sheets, spreadsheetId) {
  if (metaCache && Date.now() - metaCache.at < CACHE_MS) return metaCache.sheets;
  if (typeof sheets.spreadsheets.get !== "function") return [];
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties(title,sheetId)",
    }, { timeout: SHEET_TIMEOUT_MS });
    const sheetsMeta = (response.data.sheets || [])
      .map((sheet) => sheet.properties)
      .filter((properties) => properties?.title)
      .map((properties) => ({ title: String(properties.title), sheetId: Number(properties.sheetId) }));
    metaCache = { at: Date.now(), sheets: sheetsMeta };
    return sheetsMeta;
  } catch {
    return [];
  }
}

/**
 * Resolve tab title from env, then verify sheetId metadata when available.
 * Game writes always follow the live gid when that sheet exists — never a
 * leftover tab name that is missing or points elsewhere.
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} action
 */
async function resolveTab(sheets, spreadsheetId, action) {
  const canonical = canonicalSheetAction(action);
  const configured = envTab(canonical);
  const meta = await listSheetProperties(sheets, spreadsheetId);
  const expectedId = EXPECTED_SHEET_IDS[canonical];
  const byId = expectedId != null ? meta.find((sheet) => sheet.sheetId === expectedId) : null;
  if (canonical === "gameResults") {
    if (byId) return byId.title;
    return DEFAULT_TAB_TITLES.gameResults;
  }
  const explicitRecruitment = canonical === "recruitmentResponses"
    && configuredValue("GOOGLE_RECRUITMENT_RESPONSE_SHEET_TAB");
  const explicitMaster = canonical === "recruitmentMaster"
    && configuredValue("GOOGLE_RECRUITMENT_MASTER_SHEET_TAB");
  const explicit = Boolean(explicitRecruitment || explicitMaster
    || (canonical === "formResponses" && configuredValue("GOOGLE_FORM_SHEET_TAB")));
  if (expectedId != null && !explicit && byId) return byId.title;
  if (meta.length && !meta.some((sheet) => sheet.title === configured) && byId) return byId.title;
  const productDefault = DEFAULT_TAB_TITLES[canonical];
  if (!explicit && !meta.length && productDefault && configured !== productDefault) {
    return productDefault;
  }
  return configured;
}

/** @param {number} [sheetId] */
export function spreadsheetEditUrl(sheetId = EXPECTED_SHEET_IDS.gameResults) {
  const spreadsheetId = configuredValue("GOOGLE_SHEET_ID");
  if (!spreadsheetId) return "";
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
}

export function invalidateSheetCache() {
  metaCache = undefined;
}

/** @param {string} action */
export async function readSheetRows(action, _options = {}) {
  canonicalSheetAction(action);
  const { spreadsheetId } = sheetConfig(action);
  const sheets = sheetsClient();
  const tab = await resolveTab(sheets, spreadsheetId, action);
  const values = await getValues(sheets, spreadsheetId, tab);
  return rowsFromValues(values);
}

/** @param {Record<string, unknown>} row */
function displayValues(row) {
  const completedAt = row.completedAt;
  const answers = Array.isArray(row.answers) ? row.answers : row.answers || [];
  const total = Number(row.correct || 0) + Number(row.wrong || 0);
  return {
    遊戲時間: completedAt ? formatTaipeiTimestamp(completedAt) : "",
    姓名: row.name,
    科系: row.department,
    年級: row.grade,
    電話: row.phone,
    遊戲關主: row.gatekeeper,
    分數: row.score,
    答對: row.correct,
    答錯: row.wrong,
    作答次數: total,
    正確率: row.accuracy,
    最佳連續: row.maxCombo,
    平均反應毫秒: row.avgReactionMs ?? "",
    遊戲秒數: row.duration,
    專注稱號: row.title,
    完整作答: row.answerLog || "",
    "原始答案 JSON": answers,
    _submissionId: row.submissionId,
    _recordVersion: GAME_RECORD_VERSION,
    _source: GAME_SOURCE,
    _kind: row.kind,
    _skipSave: row.skipSave,
    _settings: row.settings,
  };
}

/** @param {string[]} headers @param {Record<string, unknown>} normalized */
function cellsForHeaders(headers, normalized) {
  const display = displayValues(normalized);
  return headers.map((header) => {
    if (Object.prototype.hasOwnProperty.call(display, header)) return sheetCell(display[header]);
    if (Object.prototype.hasOwnProperty.call(normalized, header)) return sheetCell(normalized[header]);
    return "";
  });
}

/** @param {Record<string, unknown>} row @returns {Promise<SaveResult>} */
async function saveOfficialResult(row) {
  const { spreadsheetId } = sheetConfig("gameResults");
  const sheets = sheetsClient();
  const tab = await resolveTab(sheets, spreadsheetId, "gameResults");
  const meta = await listSheetProperties(sheets, spreadsheetId);
  assertGameResultsTab(tab, meta);
  const values = await getValues(sheets, spreadsheetId, tab);
  const normalized = normalizedResult(row);
  Object.assign(normalized, {
    answers: row.answers,
    answerLog: row.answerLog,
    avgReactionMs: row.avgReactionMs,
  });
  const currentHeaders = Array.isArray(values[0])
    ? values[0].map((value) => String(cellValue(value) ?? ""))
    : [];
  const rows = rowsFromValues(values);
  const submissionId = String(normalized.submissionId).toLowerCase();
  const matches = rows.filter((existing) => {
    const id = String(fieldFromAliases(existing, "submissionId") || "").toLowerCase();
    return id && id === submissionId;
  });
  if (matches.length) {
    const duplicate = matches.every((existing) => sameResult(existing, normalized));
    return duplicate
      ? { saved: true, duplicate: true }
      : { saved: false, duplicate: false, conflict: true };
  }

  const empty = currentHeaders.every((header) => !header);
  const headers = empty ? [...GAME_SAFE_HEADERS] : [...currentHeaders];
  if (!empty) {
    const chinese = headers.includes("姓名") || headers.includes("遊戲時間") || headers.includes("_submissionId");
    const needed = chinese ? GAME_SAFE_HEADERS : RESULT_COLUMNS;
    for (const column of needed) if (!headers.includes(column)) headers.push(column);
    if (!headers.includes("_submissionId") && !headers.includes("submissionId")) {
      headers.push("_submissionId");
    }
  }
  if (headers.length !== currentHeaders.length || empty) {
    const range = rowRange(tab, 1, headers.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { range, majorDimension: "ROWS", values: [headers] },
    }, { timeout: SHEET_TIMEOUT_MS });
    if (empty && typeof sheets.spreadsheets.batchUpdate === "function") {
      const meta = await listSheetProperties(sheets, spreadsheetId);
      const sheetId = meta.find((sheet) => sheet.title === tab)?.sheetId
        ?? EXPECTED_SHEET_IDS.gameResults;
      const techStart = GAME_DISPLAY_COLUMNS.length;
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              updateDimensionProperties: {
                range: {
                  sheetId,
                  dimension: "COLUMNS",
                  startIndex: techStart,
                  endIndex: GAME_SAFE_HEADERS.length,
                },
                properties: { hiddenByUser: true },
                fields: "hiddenByUser",
              },
            }],
          },
        }, { timeout: SHEET_TIMEOUT_MS });
      } catch {
        /* Hiding technical columns is optional. */
      }
    }
  }

  const nextRow = Math.max(values.length + 1, 2);
  const range = rowRange(tab, nextRow, headers.length);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [{
        range,
        majorDimension: "ROWS",
        values: [cellsForHeaders(headers, normalized)],
      }],
    },
  }, { timeout: SHEET_TIMEOUT_MS });
  invalidateSheetCache();
  return { saved: true, duplicate: false };
}

/** @param {Record<string, unknown>} row @returns {Promise<SaveResult>} */
export function appendOfficialResult(row) {
  const task = writeQueue.then(
    () => saveOfficialResult(row),
    () => saveOfficialResult(row),
  );
  writeQueue = task.then(() => undefined, () => undefined);
  return task;
}

function assertGameResultsTab(tab, meta) {
  if (tab === DEFAULT_TAB_TITLES.recruitmentMaster || tab === "總表") {
    throw new Error("Game results must not write 總表");
  }
  if (tab === DEFAULT_TAB_TITLES.recruitmentResponses || tab === "招生狀況表") {
    throw new Error("Game results must not write 招生狀況表");
  }
  const sheet = (meta || []).find((item) => item.title === tab);
  if (sheet?.sheetId === EXPECTED_SHEET_IDS.recruitmentMaster) {
    throw new Error("Game results must not write 總表");
  }
  if (sheet?.sheetId === EXPECTED_SHEET_IDS.recruitmentResponses) {
    throw new Error("Game results must not write 招生狀況表");
  }
  if (sheet && sheet.sheetId !== EXPECTED_SHEET_IDS.gameResults) {
    throw new Error("Game results must not write a non-game tab");
  }
}

function assertRecruitmentResponseTab(tab, meta) {
  if (tab === DEFAULT_TAB_TITLES.recruitmentMaster || tab === "總表") {
    throw new Error("Staff form must not write 總表");
  }
  const sheet = (meta || []).find((item) => item.title === tab);
  if (sheet?.sheetId === EXPECTED_SHEET_IDS.recruitmentMaster) {
    throw new Error("Staff form must not write 總表");
  }
  if (sheet?.sheetId === EXPECTED_SHEET_IDS.gameResults) {
    throw new Error("Staff form must not write the game tab");
  }
}

/**
 * Partner-initiated append onto 招生狀況表. Never writes 總表 or the game tab.
 * @param {ReturnType<import("./recruitment-staff-form.mjs").normalizeStaffRecruitmentPayload>["payload"]} payload
 * @returns {Promise<{ saved: boolean, duplicate: boolean, reason?: string }>}
 */
async function saveRecruitmentResponse(payload) {
  const { spreadsheetId } = sheetConfig("recruitmentResponses");
  const sheets = sheetsClient();
  const tab = await resolveTab(sheets, spreadsheetId, "recruitmentResponses");
  const meta = await listSheetProperties(sheets, spreadsheetId);
  assertRecruitmentResponseTab(tab, meta);
  const values = await getValues(sheets, spreadsheetId, tab);
  const currentHeaders = Array.isArray(values[0])
    ? values[0].map((value) => String(cellValue(value) ?? ""))
    : [];
  const rows = rowsFromValues(values);
  const duplicate = recruitmentResponseDuplicate(rows, payload);
  if (duplicate.duplicate) {
    return { saved: true, duplicate: true, reason: duplicate.reason };
  }

  const headers = ensureRecruitmentResponseHeaders(currentHeaders);
  if (headers.length !== currentHeaders.length || currentHeaders.every((header) => !header)) {
    const range = rowRange(tab, 1, headers.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { range, majorDimension: "ROWS", values: [headers] },
    }, { timeout: SHEET_TIMEOUT_MS });
  }

  const record = staffRecruitmentRecord(payload);
  const cells = cellsForRecruitmentResponse(headers, record);
  const nextRow = Math.max(values.length + 1, 2);
  const range = rowRange(tab, nextRow, headers.length);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [{
        range,
        majorDimension: "ROWS",
        values: [cells],
      }],
    },
  }, { timeout: SHEET_TIMEOUT_MS });
  invalidateSheetCache();
  /** @type {Record<string, unknown>} */
  const row = {};
  headers.forEach((header, index) => {
    if (header) row[header] = cells[index];
  });
  return { saved: true, duplicate: false, reason: "new", row };
}

/** @param {ReturnType<import("./recruitment-staff-form.mjs").normalizeStaffRecruitmentPayload>["payload"]} payload */
export function appendRecruitmentResponse(payload) {
  const task = writeQueue.then(
    () => saveRecruitmentResponse(payload),
    () => saveRecruitmentResponse(payload),
  );
  writeQueue = task.then(() => undefined, () => undefined);
  return task;
}

export async function diagnoseSheetMappings() {
  const spreadsheetId = configuredValue("GOOGLE_SHEET_ID");
  if (!spreadsheetId || !sheetsConfigured("gameResults")) {
    return { ok: false, error: "not-configured" };
  }
  const sheets = sheetsClient();
  const listed = await listSheetProperties(sheets, spreadsheetId);
  const resolved = {};
  for (const action of ["gameResults", "recruitmentResponses", "recruitmentMaster"]) {
    resolved[action] = {
      envTab: envTab(action),
      resolvedTab: listed.length ? await resolveTab(sheets, spreadsheetId, action) : envTab(action),
      expectedSheetId: EXPECTED_SHEET_IDS[action],
    };
  }
  return { ok: true, spreadsheetIdSet: true, sheets: listed, resolved };
}
