// @ts-nocheck -- Shared row normalization is covered by leaderboard and sheets tests.
import { DEFAULT_SETTINGS } from "./runtime.mjs";

export const RESULT_COLUMNS = [
  "submissionId", "name", "department", "grade", "gatekeeper", "phone",
  "score", "correct", "wrong", "accuracy", "maxCombo", "title", "duration",
  "kind", "skipSave", "settings", "completedAt",
];

const RESULT_SETTING_KEYS = [
  "duration", "switchMs", "speed", "comboEvery", "tapLockMs", "startMode", "sound", "vibrate",
];

const FIELD_ALIASES = {
  submissionId: ["_submissionId", "submissionId"],
  name: ["姓名", "name", "同學的姓名"],
  department: ["科系", "department"],
  grade: ["年級", "grade"],
  gatekeeper: ["遊戲關主", "關主", "gatekeeper"],
  phone: ["電話", "phone", "同學電話/LINE"],
  score: ["分數", "score"],
  correct: ["答對", "correct"],
  wrong: ["答錯", "wrong"],
  accuracy: ["正確率", "accuracy"],
  maxCombo: ["最佳連續", "maxCombo"],
  title: ["專注稱號", "title"],
  duration: ["遊戲秒數", "duration"],
  kind: ["_kind", "kind"],
  skipSave: ["_skipSave", "skipSave"],
  settings: ["_settings", "settings"],
  completedAt: ["遊戲時間", "completedAt"],
  total: ["作答次數", "total"],
  avgReactionMs: ["平均反應毫秒", "avgReactionMs"],
  answerLog: ["完整作答", "answerLog"],
  answers: ["原始答案 JSON", "answers"],
  recordVersion: ["_recordVersion"],
  source: ["_source"],
};

/** @param {unknown} value */
export function cellValue(value) {
  return typeof value === "string" && value.startsWith("'") ? value.slice(1) : value;
}

/** @param {Record<string, unknown>} row @param {string} field */
export function fieldFromAliases(row, field) {
  const keys = FIELD_ALIASES[field] || [field];
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  const combined = row["科系／年級"];
  if ((field === "department" || field === "grade") && combined) return combined;
  return "";
}

/** @param {unknown} value */
export function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (["true", "yes", "1", "是"].includes(lower)) return true;
    if (["false", "no", "0", "否"].includes(lower)) return false;
  }
  if (value === "" || value == null) return fallback;
  return Boolean(value);
}

/** @param {unknown} value */
function normalizedSettings(value) {
  let settings = value;
  if (typeof settings === "string") {
    try { settings = JSON.parse(settings); } catch { return settings; }
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return settings;
  const record = /** @type {Record<string, unknown>} */ (settings);
  return Object.fromEntries(RESULT_SETTING_KEYS.map((key) => [key, record[key]]));
}

/** @param {unknown} value */
function asAccuracy(value) {
  const number = typeof value === "number" ? value : Number(String(value).replace("%", ""));
  if (!Number.isFinite(number)) return value;
  return number > 0 && number <= 1 ? Math.round(number * 1000) / 10 : number;
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
export function internalizedGameRow(row) {
  /** @type {Record<string, unknown>} */
  const normalized = {};
  for (const column of RESULT_COLUMNS) {
    normalized[column] = cellValue(fieldFromAliases(row, column));
  }
  if (typeof normalized.submissionId === "string") {
    normalized.submissionId = normalized.submissionId.toLowerCase();
  }
  if (!normalized.kind) normalized.kind = "official";
  if (normalized.skipSave === "" || normalized.skipSave == null) normalized.skipSave = false;
  else normalized.skipSave = asBoolean(normalized.skipSave, false);
  if (!normalized.settings) normalized.settings = { ...DEFAULT_SETTINGS };
  else normalized.settings = normalizedSettings(normalized.settings);
  if (!normalized.duration) normalized.duration = 60;
  else normalized.duration = Number(normalized.duration) || 60;
  for (const key of ["score", "correct", "wrong", "maxCombo"]) {
    if (normalized[key] !== "" && normalized[key] != null) normalized[key] = Number(normalized[key]);
  }
  normalized.accuracy = asAccuracy(normalized.accuracy);
  normalized.completedAt = isoTimestamp(normalized.completedAt);
  const combined = fieldFromAliases(row, "department");
  if (typeof combined === "string" && combined.includes("／") && !row.grade && !row["年級"]) {
    const [department, grade] = combined.split("／");
    if (!normalized.department) normalized.department = department;
    if (!normalized.grade) normalized.grade = grade;
  }
  return normalized;
}
