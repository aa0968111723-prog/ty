/**
 * Official Google Form prefill for 2026招生狀況表單-上.
 *
 * Entry IDs were read from the published /viewform HTML on 2026-09-13.
 * Do not invent entry IDs. forms.gle short links are never a prefill base.
 */

export const OFFICIAL_FORM_ID = "12fk5ubMY0fnCSSTEljFJ1l-gcao1hDMkw7F8I8qTlOw";
export const OFFICIAL_VIEWFORM_PATH =
  "/forms/d/e/1FAIpQLSdzbqD9Bq4qaRu5HVfUS-pTNLSKiFcmGNs72w2lWuZ9u6TE7A/viewform";
export const OFFICIAL_VIEWFORM_URL = `https://docs.google.com${OFFICIAL_VIEWFORM_PATH}`;
export const FORMS_GLE_SHORT_URL = "https://forms.gle/CBmNvkcvSQMzvh9X7";

export const OFFICIAL_RECRUITERS = Object.freeze([
  "安倢", "小哲", "柏能", "宛臻老師", "宜晃", "柏憲", "振泰", "慕恩", "心宇", "瑀晴",
]);

/**
 * Live published-form entry IDs. Keys that are not on the live form
 * (遊戲完成時間 / 遊戲關主 / submissionId) travel in 備註 until dedicated
 * questions exist.
 */
export const LIVE_PREFILL_ENTRIES = Object.freeze({
  recruiter: "entry.1318284482",
  recruitDate: "entry.526408341",
  name: "entry.887514514",
  phone: "entry.1668669667",
  departmentGrade: "entry.628075911",
  note: "entry.88032894",
  tier: "entry.1322037614",
  activity: "entry.1403707043",
  joined: "entry.425502120",
  depositPaid: "entry.1491508611",
  depositAmount: "entry.1274494830",
});

const taipeiDateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const taipeiDateTimeParts = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** @param {unknown} value */
function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

/** @param {unknown} value */
export function isFormsGleUrl(value) {
  return /https?:\/\/forms\.gle\//i.test(text(value));
}

/** @param {unknown} value */
export function resolveViewformUrl(value) {
  const raw = text(value);
  if (!raw || isFormsGleUrl(raw)) return OFFICIAL_VIEWFORM_URL;
  const published = raw.match(/\/forms\/d\/e\/([^/?#]+)\/viewform/i);
  if (published) return `https://docs.google.com/forms/d/e/${published[1]}/viewform`;
  if (/\/viewform(?:$|[?#])/i.test(raw)) return raw.split(/[?#]/)[0];
  const editId = raw.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  if (editId?.[1] === OFFICIAL_FORM_ID) return OFFICIAL_VIEWFORM_URL;
  if (editId) return `https://docs.google.com/forms/d/${editId[1]}/viewform`;
  return OFFICIAL_VIEWFORM_URL;
}

/** @param {unknown} value */
export function taipeiDate(value) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (!Number.isFinite(date.getTime())) return "";
  return taipeiDateParts.format(date);
}

/** @param {unknown} value */
export function formatCompletedAt(value) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (!Number.isFinite(date.getTime())) return text(value);
  return taipeiDateTimeParts.format(date).replace(/\//g, "/");
}

/** @param {unknown} value */
export function datetimeLocalTaipei(value) {
  const iso = taipeiDate(value);
  if (!iso) return "";
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value instanceof Date ? value : new Date(String(value)));
  return `${iso}T${clock}`;
}

function candidateSubmissionId(candidate) {
  return text(candidate?.submissionId || candidate?.latestAttempt?.submissionId).toLowerCase();
}

function candidateCompletedAt(candidate) {
  return candidate?.completedAt || candidate?.latestAttempt?.completedAt || candidate?.gameCompletedAt || "";
}

export function departmentGradeOf(candidate) {
  return [text(candidate?.department), text(candidate?.grade)].filter(Boolean).join("");
}

export function buildGameMetadataNote(candidate, extraNotes = "") {
  const lines = [
    `遊戲完成：${formatCompletedAt(candidateCompletedAt(candidate))}`,
    `遊戲關主：${text(candidate?.gameGatekeeper)}`,
    `submissionId：${candidateSubmissionId(candidate)}`,
  ];
  const extra = text(extraNotes).replace(
    /^遊戲完成：[^\n]*\n遊戲關主：[^\n]*\nsubmissionId：[^\n]*(?:\n|$)/u,
    "",
  ).trim();
  return extra ? `${lines.join("\n")}\n${extra}` : lines.join("\n");
}

export function parseGameMetadataNote(value) {
  const raw = text(value);
  return {
    completedAt: (raw.match(/遊戲完成[：:]\s*([^\n]+)/u) || [])[1]?.trim() || "",
    gameGatekeeper: (raw.match(/遊戲關主[：:]\s*([^\n]+)/u) || [])[1]?.trim() || "",
    submissionId: ((raw.match(/submissionId[：:]\s*([0-9a-f-]{8,})/i) || [])[1] || "").toLowerCase(),
  };
}

function mergeEntries(overrides) {
  const extra = overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {};
  return { ...LIVE_PREFILL_ENTRIES, ...extra };
}

function setEntry(params, entry, value) {
  const key = text(entry);
  const raw = text(value);
  if (!key || !raw || !/^entry\.\d+/.test(key)) return;
  params.set(key, raw);
}

function setRecruiter(params, entry, recruiter) {
  const key = text(entry);
  const name = text(recruiter);
  if (!key || !name) return;
  if (OFFICIAL_RECRUITERS.includes(name)) {
    params.append(key, name);
    return;
  }
  params.append(key, "__other_option__");
  params.append(`${key}.other_option_response`, name);
}

function setMonthDay(params, entry, isoDate) {
  const key = text(entry);
  const match = text(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!key || !match) return;
  params.set(`${key}_month`, String(Number(match[2])));
  params.set(`${key}_day`, String(Number(match[3])));
}

/**
 * @param {Record<string, unknown>} candidate
 * @param {{
 *   recruiter?: string,
 *   extraNotes?: string,
 *   recruitedAt?: Date | string,
 *   responderUrl?: string,
 *   entries?: Record<string, string>,
 * }} [options]
 */
export function generatePrefilledFormUrl(candidate = {}, options = {}) {
  const base = resolveViewformUrl(options.responderUrl);
  const entries = mergeEntries(options.entries);
  const recruiter = text(options.recruiter);
  const gameGatekeeper = text(candidate.gameGatekeeper);
  const params = new URLSearchParams({ usp: "pp_url" });
  setEntry(params, entries.name, candidate.name);
  setEntry(params, entries.phone, candidate.phone || candidate.normalizedPhone);
  setEntry(params, entries.departmentGrade, departmentGradeOf(candidate));
  setRecruiter(params, entries.recruiter, recruiter);
  const recruitDay = options.recruitedAt ? taipeiDate(options.recruitedAt) : taipeiDate(new Date());
  setMonthDay(params, entries.recruitDate, recruitDay);
  setEntry(params, entries.note, buildGameMetadataNote(candidate, options.extraNotes));
  setEntry(params, entries.completedAt, formatCompletedAt(candidateCompletedAt(candidate)));
  setEntry(params, entries.gameGatekeeper, gameGatekeeper);
  setEntry(params, entries.submissionId, candidateSubmissionId(candidate));
  if (recruiter && recruiter === gameGatekeeper) {
    /* Recruiter may equal the booth leader; still never replace gameGatekeeper. */
  }
  return `${base}?${params.toString()}`;
}

export function prefillUsesViewform(url) {
  const raw = text(url);
  return /\/viewform(?:\?|$)/.test(raw) && !isFormsGleUrl(raw.split("?")[0]);
}

export const RECRUITER_STORAGE_KEY = "club-official-recruiter";
