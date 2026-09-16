const taipei = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** @param {Date} [now] */
export function taipeiIsoDate(now = new Date()) {
  return taipei.format(now);
}

/** @param {string} iso @param {number} days */
export function shiftIsoDate(iso, days) {
  const [year, month, day] = String(iso).split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + Number(days || 0));
  return new Date(utc).toISOString().slice(0, 10);
}

/**
 * @param {"all" | "today" | "yesterday" | "custom" | string} scope
 * @param {string} [selectedDate]
 * @param {Date} [now]
 */
export function rosterFilterDate(scope, selectedDate, now = new Date()) {
  if (!scope || scope === "all") return "";
  const today = taipeiIsoDate(now);
  if (scope === "today") return today;
  if (scope === "yesterday") return shiftIsoDate(today, -1);
  return String(selectedDate || "");
}

/** @param {unknown} value */
function isoToTaipeiDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";
  return taipei.format(date);
}

/** @param {unknown} value */
function recruitedMonthDay(value) {
  const raw = String(value || "").trim();
  if (!raw || /^\d{4}-\d{2}-\d{2}/.test(raw)) return "";
  const parsed = raw.match(/(\d{1,2})[/-](\d{1,2})/);
  if (!parsed) return "";
  return `${parsed[1].padStart(2, "0")}-${parsed[2].padStart(2, "0")}`;
}

/**
 * @param {{
 *   gameCompletedAt?: string,
 *   completedAt?: string,
 *   submittedAt?: string,
 *   recruitedAt?: string,
 *   timeline?: Array<{ at?: string }>
 * }} row
 * @param {string} date
 */
export function profileTouchesTaipeiDate(row, date) {
  if (!date) return true;
  const fields = [row?.gameCompletedAt, row?.completedAt, row?.submittedAt, row?.recruitedAt];
  for (const value of fields) {
    if (isoToTaipeiDate(value) === date) return true;
  }
  const monthDay = recruitedMonthDay(row?.recruitedAt);
  if (monthDay && date.slice(5) === monthDay) return true;
  for (const item of row?.timeline || []) {
    if (isoToTaipeiDate(item?.at) === date) return true;
  }
  return false;
}
