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
  birthday: "entry.1517130172",
  studentId: "entry.1987771282",
  interest: "entry.399909881",
  interestTopics: "entry.410882616",
});

/** Live 2026招生狀況表單-上 titles and choices (published /viewform, 2026-09-13). */
export const LIVE_NOTE_TITLE = "備註(興趣壓~愛好~喜歡那個活動~或是我們介紹的那個特質";
export const LIVE_TIER_CHOICES = Object.freeze(["S(已報名)", "A(有興趣再考慮)", "B(還好沒興趣)"]);
export const LIVE_ACTIVITY_CHOICES = Object.freeze([
  "9/30茶會", "10/07演講", "社課", "體驗禪", "無(考慮中", "無(沒興趣",
]);
export const LIVE_YES_NO = Object.freeze(["是", "否"]);
export const LIVE_INTEREST_TOPICS = Object.freeze([
  "靜定力", "專注力", "時間管理", "口才表達", "領導力", "團隊合作", "獨立思考", "自我認識",
]);

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
  return taipeiDateTimeParts.format(date);
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

/** @param {Record<string, unknown>} [candidate] */
function candidateSubmissionId(candidate = {}) {
  const latest = candidate.latestAttempt && typeof candidate.latestAttempt === "object"
    ? /** @type {Record<string, unknown>} */ (candidate.latestAttempt)
    : {};
  return text(candidate.submissionId || latest.submissionId).toLowerCase();
}

/** @param {Record<string, unknown>} [candidate] */
function candidateCompletedAt(candidate = {}) {
  const latest = candidate.latestAttempt && typeof candidate.latestAttempt === "object"
    ? /** @type {Record<string, unknown>} */ (candidate.latestAttempt)
    : {};
  return candidate.completedAt || latest.completedAt || candidate.gameCompletedAt || "";
}

/** @param {Record<string, unknown>} [candidate] */
export function departmentGradeOf(candidate = {}) {
  return [text(candidate.department), text(candidate.grade)].filter(Boolean).join("");
}

/** @param {Record<string, unknown>} [candidate] @param {unknown} [extraNotes] */
export function buildGameMetadataNote(candidate = {}, extraNotes = "") {
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

/** @param {unknown} value */
export function parseGameMetadataNote(value) {
  const raw = text(value);
  return {
    completedAt: (raw.match(/遊戲完成[：:]\s*([^\n]+)/u) || [])[1]?.trim() || "",
    gameGatekeeper: (raw.match(/遊戲關主[：:]\s*([^\n]+)/u) || [])[1]?.trim() || "",
    submissionId: ((raw.match(/submissionId[：:]\s*([0-9a-f-]{8,})/i) || [])[1] || "").toLowerCase(),
  };
}

/**
 * Staff-facing 備註: keep human extras, drop the three game-metadata lines
 * that already have dedicated fields (and must not show submissionId).
 * @param {unknown} value
 */
export function visibleStaffNote(value) {
  return text(value)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (/^遊戲完成[：:]/.test(trimmed)) return false;
      if (/^遊戲關主[：:]/.test(trimmed)) return false;
      if (/^submissionId[：:]/i.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

/** @param {unknown} overrides @returns {Record<string, string>} */
function mergeEntries(overrides) {
  const extra = overrides && typeof overrides === "object" && !Array.isArray(overrides)
    ? /** @type {Record<string, string>} */ (overrides)
    : {};
  return { ...LIVE_PREFILL_ENTRIES, ...extra };
}

/** @param {URLSearchParams} params @param {unknown} entry @param {unknown} value */
function setEntry(params, entry, value) {
  const key = text(entry);
  const raw = text(value);
  if (!key || !raw || !/^entry\.\d+/.test(key)) return;
  params.set(key, raw);
}

/** @param {URLSearchParams} params @param {unknown} entry @param {unknown} recruiter */
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

/** @param {URLSearchParams} params @param {unknown} entry @param {unknown} isoDate */
function setMonthDay(params, entry, isoDate) {
  const key = text(entry);
  const match = text(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!key || !match) return;
  params.set(`${key}_month`, String(Number(match[2])));
  params.set(`${key}_day`, String(Number(match[3])));
}

/** @param {URLSearchParams} params @param {unknown} entry @param {unknown} isoDate */
function setYearMonthDay(params, entry, isoDate) {
  const key = text(entry);
  const match = text(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!key || !match) return;
  params.set(`${key}_year`, String(Number(match[1])));
  params.set(`${key}_month`, String(Number(match[2])));
  params.set(`${key}_day`, String(Number(match[3])));
}

/** @param {URLSearchParams} params @param {unknown} entry @param {unknown} values */
function setChoices(params, entry, values) {
  const key = text(entry);
  if (!key || !/^entry\.\d+/.test(key)) return;
  const list = Array.isArray(values) ? values : [values];
  for (const value of list) setEntry(params, key, value);
}

/** @param {unknown} values */
export function joinSheetChoices(values) {
  const list = Array.isArray(values) ? values : [values];
  return list.map((value) => text(value)).filter(Boolean).join(", ");
}

/** @param {unknown} isoDate */
export function formatRecruitDateMd(isoDate) {
  const match = text(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${Number(match[2])}/${Number(match[3])}`;
}

/**
 * @param {Record<string, unknown>} [candidate]
 * @param {{
 *   recruiter?: string,
 *   extraNotes?: string,
 *   recruitedAt?: Date | string,
 *   responderUrl?: string,
 *   entries?: Record<string, string>,
 *   tier?: string,
 *   activities?: unknown,
 *   joined?: string,
 *   depositPaid?: string,
 *   depositAmount?: string,
 *   birthday?: string,
 *   studentId?: string,
 *   interest?: string,
 *   interestTopics?: unknown,
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
  setEntry(params, entries.tier, options.tier || candidate.tier);
  setChoices(params, entries.activity, options.activities || candidate.activities || candidate.activity);
  setEntry(params, entries.joined, options.joined || candidate.joined);
  setEntry(params, entries.depositPaid, options.depositPaid || candidate.depositPaid);
  setEntry(params, entries.depositAmount, options.depositAmount || candidate.depositAmount);
  setYearMonthDay(params, entries.birthday, options.birthday || candidate.birthday);
  setEntry(params, entries.studentId, options.studentId || candidate.studentId);
  setEntry(params, entries.interest, options.interest || candidate.interest);
  setChoices(params, entries.interestTopics, options.interestTopics || candidate.interestTopics);
  return `${base}?${params.toString()}`;
}

/**
 * Pending-card / profile-sheet prefill. Recruiter is the currently selected
 * partner (`entry.1318284482`); the game gatekeeper stays in 備註.
 * @param {Record<string, unknown>} [candidate]
 * @param {unknown} [recruiter]
 */
export function officialFormUrl(candidate = {}, recruiter = "") {
  const row = candidate && typeof candidate === "object" ? candidate : {};
  if (!text(row.name) && !text(row.phone || row.normalizedPhone)) return "";
  return generatePrefilledFormUrl({
    ...row,
    completedAt: candidateCompletedAt(row),
    tier: "",
  }, { recruiter: text(recruiter), tier: "" });
}

/** @param {unknown} url */
export function prefillUsesViewform(url) {
  const raw = text(url);
  return /\/viewform(?:\?|$)/.test(raw) && !isFormsGleUrl(raw.split("?")[0]);
}

export const RECRUITER_STORAGE_KEY = "club-official-recruiter";
