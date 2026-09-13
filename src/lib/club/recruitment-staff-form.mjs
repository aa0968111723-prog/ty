/**
 * In-app staff recruitment form → 招生狀況表 row mapping.
 * Same destination as the official Google Form. Never maps onto 總表.
 */
import { identityFields, text } from "./recruitment-identity.mjs";
import {
  LIVE_ACTIVITY_CHOICES,
  LIVE_INTEREST_TOPICS,
  LIVE_NOTE_TITLE,
  LIVE_TIER_CHOICES,
  LIVE_YES_NO,
  buildGameMetadataNote,
  departmentGradeOf,
  formatCompletedAt,
  formatRecruitDateMd,
  joinSheetChoices,
  taipeiDate,
} from "./recruitment-prefill.mjs";

const taipeiTimestamp = new Intl.DateTimeFormat("zh-TW", {
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
function staffTimestamp(value) {
  const raw = value instanceof Date ? value : new Date(String(value ?? ""));
  if (!Number.isFinite(raw.getTime())) return String(value ?? "");
  return taipeiTimestamp.format(raw).replace(/\//g, "/");
}

export const STAFF_FORM_SYNC_VERSION = "1";

export const DEFAULT_RECRUITMENT_RESPONSE_HEADERS = Object.freeze([
  "時間戳記",
  "接引人(可複選)",
  "接引日期",
  "同學的姓名",
  "同學電話/LINE",
  "系級",
  "這位同學是屬於那個分級呢:-)",
  "報名了那個活動",
  LIVE_NOTE_TITLE,
  "保證金是否繳費",
  "繳了多少呢?",
  "是否入社",
  "生日",
  "學號",
  "興趣",
  "對甚麼有興趣",
]);

export const RECRUITMENT_HELPER_HEADERS = Object.freeze([
  "_gameSubmissionId",
  "_gameGatekeeper",
  "_gameCompletedAt",
  "_syncVersion",
  "_duplicate",
]);

const RESPONSE_ALIASES = {
  timestamp: ["時間戳記", "Timestamp"],
  recruiter: ["接引人(可複選)", "接引人", "招生接引人"],
  recruitDate: ["接引日期"],
  name: ["同學的姓名", "姓名"],
  phone: ["同學電話/LINE", "電話"],
  departmentGrade: ["系級"],
  tier: ["這位同學是屬於那個分級呢:-)", "分級"],
  activity: ["報名了那個活動"],
  note: [LIVE_NOTE_TITLE, "備註"],
  depositPaid: ["保證金是否繳費"],
  depositAmount: ["繳了多少呢?", "繳了多少"],
  joined: ["是否入社"],
  birthday: ["生日", "同學生日"],
  studentId: ["學號"],
  interest: ["興趣"],
  interestTopics: ["對甚麼有興趣"],
  gameSubmissionId: ["_gameSubmissionId"],
  gameGatekeeper: ["_gameGatekeeper"],
  gameGatekeeperDisplay: ["遊戲關主"],
  gameCompletedAt: ["_gameCompletedAt"],
  syncVersion: ["_syncVersion"],
  duplicate: ["_duplicate"],
};

const MAX = {
  name: 40,
  phone: 40,
  department: 40,
  grade: 20,
  recruiter: 40,
  gameGatekeeper: 40,
  extraNotes: 2000,
  depositAmount: 20,
  studentId: 40,
  interest: 200,
  submissionId: 80,
};

/** @param {unknown} value */
function clipped(value, max) {
  return text(value).slice(0, max);
}

/** @param {unknown} value @param {readonly string[]} choices */
function pickChoice(value, choices) {
  const raw = text(value);
  return choices.includes(raw) ? raw : "";
}

/** @param {unknown} value @param {readonly string[]} choices */
export function pickChoices(value, choices) {
  const list = Array.isArray(value) ? value : text(value).split(/[,，、]/);
  return [...new Set(list.map((item) => text(item)).filter((item) => choices.includes(item)))];
}

/** @param {unknown} value */
function isoDay(value) {
  if (value instanceof Date) return taipeiDate(value);
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (raw) {
    const fromDate = taipeiDate(raw);
    if (fromDate) return fromDate;
  }
  return "";
}

/**
 * @param {unknown[]} headers
 * @param {readonly string[]} aliases
 */
export function matchResponseHeader(headers, aliases) {
  const list = (headers || []).map((header) => String(header || ""));
  for (const alias of aliases) {
    const exact = list.find((header) => header === alias);
    if (exact) return exact;
  }
  for (const alias of aliases) {
    const starts = list.find((header) => header.startsWith(alias));
    if (starts) return starts;
  }
  return "";
}

/**
 * Keep existing columns. Only append missing technical helpers at the END.
 * @param {unknown[]} currentHeaders
 */
export function ensureRecruitmentResponseHeaders(currentHeaders) {
  const headers = (currentHeaders || []).map((header) => String(header || ""));
  const empty = !headers.length || headers.every((header) => !header);
  if (empty) return [...DEFAULT_RECRUITMENT_RESPONSE_HEADERS, ...RECRUITMENT_HELPER_HEADERS];
  const next = [...headers];
  for (const helper of RECRUITMENT_HELPER_HEADERS) {
    if (!next.includes(helper)) next.push(helper);
  }
  return next;
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ now?: Date }} [options]
 */
export function normalizeStaffRecruitmentPayload(body = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const activities = pickChoices(body.activities ?? body.activity, LIVE_ACTIVITY_CHOICES);
  const interestTopics = pickChoices(body.interestTopics, LIVE_INTEREST_TOPICS);
  const recruitDay = isoDay(body.recruitedAt) || taipeiDate(now);
  const completedAt = text(body.completedAt || body.gameCompletedAt);
  const payload = {
    recruiter: clipped(body.recruiter, MAX.recruiter),
    recruitedAt: recruitDay,
    name: clipped(body.name, MAX.name),
    phone: clipped(body.phone, MAX.phone),
    department: clipped(body.department, MAX.department),
    grade: clipped(body.grade, MAX.grade),
    gameGatekeeper: clipped(body.gameGatekeeper, MAX.gameGatekeeper),
    completedAt,
    submissionId: clipped(body.submissionId, MAX.submissionId).toLowerCase(),
    extraNotes: clipped(body.extraNotes, MAX.extraNotes),
    tier: pickChoice(body.tier, LIVE_TIER_CHOICES),
    activities,
    joined: pickChoice(body.joined, LIVE_YES_NO),
    depositPaid: pickChoice(body.depositPaid, LIVE_YES_NO),
    depositAmount: clipped(body.depositAmount, MAX.depositAmount),
    birthday: isoDay(body.birthday),
    studentId: clipped(body.studentId, MAX.studentId),
    interest: clipped(body.interest, MAX.interest),
    interestTopics,
    submittedAt: now,
  };
  const errors = [];
  if (!payload.recruiter) errors.push("請選擇正式招生接引人");
  if (!payload.name) errors.push("請填寫同學的姓名");
  return { ok: errors.length === 0, errors, payload };
}

/**
 * @param {ReturnType<typeof normalizeStaffRecruitmentPayload>["payload"]} payload
 */
export function staffRecruitmentRecord(payload) {
  const identity = {
    name: payload.name,
    phone: payload.phone,
    department: payload.department,
    grade: payload.grade,
    gameGatekeeper: payload.gameGatekeeper,
    completedAt: payload.completedAt,
    submissionId: payload.submissionId,
  };
  return {
    timestamp: staffTimestamp(payload.submittedAt),
    recruiter: payload.recruiter,
    recruitDate: formatRecruitDateMd(payload.recruitedAt),
    name: payload.name,
    phone: payload.phone,
    departmentGrade: departmentGradeOf(payload),
    tier: payload.tier,
    activity: joinSheetChoices(payload.activities),
    note: buildGameMetadataNote(identity, payload.extraNotes),
    depositPaid: payload.depositPaid,
    depositAmount: payload.depositAmount,
    joined: payload.joined,
    birthday: payload.birthday,
    studentId: payload.studentId,
    interest: payload.interest,
    interestTopics: joinSheetChoices(payload.interestTopics),
    gameSubmissionId: payload.submissionId,
    gameGatekeeper: payload.gameGatekeeper,
    gameGatekeeperDisplay: payload.gameGatekeeper,
    gameCompletedAt: formatCompletedAt(payload.completedAt) || payload.completedAt,
    syncVersion: STAFF_FORM_SYNC_VERSION,
    duplicate: "FALSE",
  };
}

/**
 * @param {string[]} headers
 * @param {ReturnType<typeof staffRecruitmentRecord>} record
 */
export function cellsForRecruitmentResponse(headers, record) {
  return headers.map((header) => {
    for (const [field, aliases] of Object.entries(RESPONSE_ALIASES)) {
      if (matchResponseHeader([header], aliases) === header) {
        const value = record[field];
        return value == null ? "" : value;
      }
    }
    return "";
  });
}

/**
 * @param {Array<Record<string, unknown>>} existingRows
 * @param {{ submissionId?: string, phone?: string }} incoming
 */
export function recruitmentResponseDuplicate(existingRows, incoming) {
  const submissionId = text(incoming.submissionId).toLowerCase();
  const phone = identityFields({ phone: incoming.phone }).normalizedPhone;
  for (const row of existingRows || []) {
    const rowId = text(
      row._gameSubmissionId || row.submissionId || row._submissionId,
    ).toLowerCase();
    if (submissionId && rowId && rowId === submissionId) {
      return { duplicate: true, reason: "submissionId" };
    }
    const rowPhone = identityFields({
      phone: row["同學電話/LINE"] || row["電話"] || row.phone,
    }).normalizedPhone;
    if (phone && rowPhone && phone === rowPhone) {
      return { duplicate: true, reason: "phone" };
    }
  }
  return { duplicate: false, reason: "new" };
}

export {
  LIVE_ACTIVITY_CHOICES,
  LIVE_INTEREST_TOPICS,
  LIVE_NOTE_TITLE,
  LIVE_TIER_CHOICES,
  LIVE_YES_NO,
};
