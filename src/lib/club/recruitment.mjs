// @ts-nocheck -- Recruitment aggregation is covered by recruitment.test.mjs.
import { createHash } from "node:crypto";
import { titleForScore } from "./runtime.mjs";
import {
  clusterGamePeople,
  identityFields,
  normalizeGatekeeper,
  normalizeName,
  officialIdentityConflict,
  personIsRecruited,
  splitDepartmentGrade,
  text,
} from "./recruitment-identity.mjs";
import { fieldFromAliases, formatTaipeiTimestamp, internalizedGameRow } from "./sheets.mjs";
import { LIVE_ACTIVITY_CHOICES, generatePrefilledFormUrl } from "./recruitment-prefill.mjs";

const UNCLASSIFIED = "未分類";
const UNKNOWN_GATEKEEPER = "未知關主";
const PLACEHOLDER_CHOICE = "（目前沒有待跟進學生）";

const taipei = new Intl.DateTimeFormat("en-CA", {
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

/** @param {unknown} value */
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/** @param {Record<string, unknown>} row @param {string[]} keys */
function field(row, keys) {
  for (const key of keys) {
    if (text(row[key])) return text(row[key]);
  }
  return "";
}

/** @param {unknown} value */
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** @param {unknown} value */
export function timestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const excel = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(excel);
    return Number.isFinite(date.getTime()) ? date.toISOString() : "";
  }
  const raw = text(value);
  if (!raw) return "";
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

/** @param {Date} value */
export function dateInTaipei(value) {
  return taipei.format(value);
}

/** @param {unknown} value */
function number(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return NaN;
  return Number(String(value).replace(/,/g, ""));
}

function officialSettings(value) {
  let settings = value;
  if (typeof settings === "string") {
    try { settings = JSON.parse(settings); } catch { return false; }
  }
  const row = record(settings);
  return row.duration === 60 && row.speed === "normal" && row.startMode === "meaning" &&
    row.switchMs === 3000 && row.comboEvery === 3 && row.tapLockMs === 64;
}

/** @param {unknown[]} rows */
export function parseGameAttempts(rows) {
  /** @type {Array<Record<string, unknown>>} */
  const attempts = [];
  const seen = new Set();
  for (const value of rows || []) {
    const internal = internalizedGameRow(record(value));
    const raw = record(value);
    const submissionId = text(internal.submissionId).toLowerCase();
    if (submissionId && seen.has(submissionId)) continue;
    if (internal.kind && internal.kind !== "official") continue;
    if (internal.skipSave === true) continue;
    const score = number(internal.score);
    const correct = number(internal.correct);
    const wrong = number(internal.wrong);
    const maxCombo = number(internal.maxCombo);
    const duration = number(internal.duration) || 60;
    const accuracy = number(internal.accuracy);
    if (internal.settings && typeof internal.settings === "object"
      && Object.keys(record(internal.settings)).length
      && record(internal.settings).speed
      && !officialSettings(internal.settings)
      && duration === 60) {
      continue;
    }
    const completedAt = timestamp(internal.completedAt) || timestamp(raw["遊戲時間"]);
    const identity = identityFields({
      name: internal.name,
      phone: internal.phone,
      department: internal.department,
      grade: internal.grade,
    });
    if (submissionId) seen.add(submissionId);
    attempts.push({
      ...identity,
      submissionId,
      name: text(internal.name),
      phone: text(internal.phone),
      department: identity.department || text(internal.department),
      grade: identity.grade || text(internal.grade),
      gatekeeper: text(internal.gatekeeper),
      normalizedGatekeeper: normalizeGatekeeper(internal.gatekeeper) || UNCLASSIFIED,
      score: Number.isFinite(score) ? score : 0,
      correct: Number.isFinite(correct) ? correct : 0,
      wrong: Number.isFinite(wrong) ? wrong : 0,
      accuracy: Number.isFinite(accuracy) ? (accuracy <= 1 ? Math.round(accuracy * 1000) / 10 : accuracy) : (Number.isFinite(correct) && Number.isFinite(wrong) ? Math.round((1000 * correct) / Math.max(correct + wrong, 1)) / 10 : 0),
      maxCombo: Number.isFinite(maxCombo) ? maxCombo : 0,
      title: text(internal.title) || titleForScore(Number.isFinite(score) ? score : 0),
      duration,
      completedAt,
      avgReactionMs: number(fieldFromAliases(raw, "avgReactionMs")),
      kind: "official",
      skipSave: false,
    });
  }
  return attempts.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
}

function isDuplicateFlag(value) {
  const raw = text(value).toLowerCase();
  return raw === "true" || raw === "yes" || raw === "1" || value === true;
}

/** @param {unknown[]} rows */
export function parseRecruitmentResponses(rows) {
  return (rows || []).map((value) => {
    const row = record(value);
    const name = field(row, ["同學的姓名", "姓名", "name"]);
    const phone = field(row, ["同學電話/LINE", "電話", "phone"]);
    const departmentGrade = field(row, ["系級"]);
    const split = splitDepartmentGrade(departmentGrade);
    const department = field(row, ["科系", "department"]) || split.department;
    const grade = field(row, ["年級", "grade"]) || split.grade;
    const identity = identityFields({ name, phone, department, grade, departmentGrade });
    const recruiters = field(row, ["接引人(可複選)", "接引人", "招生接引人"]);
    return {
      ...identity,
      name,
      phone,
      department: identity.department,
      grade: identity.grade,
      departmentGrade,
      recruiters,
      recruiterList: recruiters.split(/[,，、]/).map((part) => part.trim()).filter(Boolean),
      recruitedAt: field(row, ["接引日期"]),
      submittedAt: timestamp(field(row, ["時間戳記", "timestamp", "Timestamp"])),
      tier: field(row, ["這位同學是屬於那個分級呢:-)", "分級"]),
      activity: field(row, ["報名了那個活動"]),
      birthday: field(row, ["同學生日", "生日"]),
      note: field(row, ["備註(興趣壓~愛好~喜歡那個活動~或是我們介紹的那個特質", "備註"]),
      studentId: field(row, ["學號"]),
      interest: field(row, ["對甚麼有興趣", "興趣"]),
      joined: field(row, ["是否入社"]),
      depositPaid: field(row, ["保證金是否繳費"]),
      depositAmount: field(row, ["繳了多少呢?", "繳了多少"]),
      submissionId: field(row, ["_gameSubmissionId", "submissionId"]).toLowerCase(),
      gameGatekeeper: field(row, ["_gameGatekeeper"]),
      gameCompletedAt: timestamp(field(row, ["_gameCompletedAt"])),
      syncVersion: field(row, ["_syncVersion"]),
      duplicate: isDuplicateFlag(row._duplicate),
    };
  }).filter((row) => row.normalizedName || row.normalizedPhone || row.submissionId);
}

/** @param {unknown[]} rows */
export function parseMasterRows(rows) {
  return (rows || []).map((value) => {
    const row = record(value);
    if (field(row, ["同學的姓名", "姓名"]) === "" && field(row, ["接引日期"]) === "") return null;
    const name = field(row, ["同學的姓名", "姓名"]);
    if (!name) return null;
    const phone = field(row, ["同學電話/LINE", "電話"]);
    const identity = identityFields({
      name,
      phone,
      department: field(row, ["科系"]),
      grade: field(row, ["年級"]),
    });
    return {
      ...identity,
      name,
      phone,
      recruiters: field(row, ["接引人(可複選)", "接引人"]),
      recruiterList: field(row, ["接引人(可複選)", "接引人"]).split(/[,，、]/).map((part) => part.trim()).filter(Boolean),
      recruitedAt: field(row, ["接引日期"]),
      department: identity.department || field(row, ["科系"]),
      grade: identity.grade || field(row, ["年級"]),
      tier: field(row, ["分級"]),
      activity: field(row, ["報名了那個活動"]),
      birthday: field(row, ["同學生日"]),
      note: field(row, ["備註"]),
      studentId: field(row, ["學號"]),
      interest: field(row, ["對甚麼有興趣"]),
      joined: field(row, ["是否入社"]),
      depositPaid: field(row, ["保證金是否繳費", "保證金"]),
      depositAmount: field(row, ["繳了多少呢?", "繳了多少", "繳費金額"]),
    };
  }).filter(Boolean);
}

function latestAttempt(attempts) {
  return [...attempts].sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
}

function waitMinutes(completedAt, now) {
  const at = Date.parse(completedAt);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.round((now.getTime() - at) / 60000));
}

const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Partner-visible Form choice suffix. Never phone-less attempt UUIDs. */
export function visibleChoicePersonKey(personKey) {
  const key = text(personKey);
  if (!key || UUID_IN_TEXT.test(key) || key.startsWith("attempt:")) return "";
  if (key.startsWith("phone:") || key.startsWith("name:")) return key;
  return "";
}

export function encodeStudentChoice(candidate) {
  const latest = candidate.latestAttempt || {};
  const clock = latest.completedAt ? taipeiClock.format(new Date(latest.completedAt)) : "--:--";
  const deptGrade = [candidate.department, candidate.grade].filter(Boolean).join("") || "系級未填";
  const phone = candidate.rawPhone || candidate.phone || candidate.normalizedPhone || "電話未填";
  const label = `${candidate.name || "未填姓名"}｜${deptGrade}｜${phone}｜${clock}`;
  const personKey = visibleChoicePersonKey(candidate.personKey);
  return personKey ? `${label}|#p:${personKey}` : label;
}

export function decodeStudentChoice(value) {
  const raw = text(value);
  const personKey = raw.match(/#p:([^|#]+)/)?.[1] || "";
  const submissionId = (raw.match(/#s:([^|#]*)/i)?.[1] || "").toLowerCase();
  const label = raw.split("|#p:")[0];
  return { label, personKey, submissionId, placeholder: raw.startsWith(PLACEHOLDER_CHOICE) || raw === PLACEHOLDER_CHOICE };
}

function rosterName(row) {
  return text(row?.normalizedName) || normalizeName(row?.name);
}

function rosterOverlap(profile, row) {
  const profileId = text(profile?.submissionId).toLowerCase();
  const rowId = text(row?.submissionId).toLowerCase();
  if (profileId && rowId && profileId === rowId) return true;
  const profileName = rosterName(profile);
  const rowName = rosterName(row);
  const profilePhone = text(profile?.normalizedPhone);
  const rowPhone = text(row?.normalizedPhone);
  if (profilePhone && rowPhone) {
    if (profilePhone !== rowPhone) return false;
    if (profileName && rowName) return profileName === rowName;
    return !profileName && !rowName;
  }
  if (profilePhone || rowPhone) return false;
  return Boolean(profileName && rowName && profileName === rowName);
}

function profileFromSources({
  personKey,
  status = "",
  normalizedPhone = "",
  name = "",
  phone = "",
  department = "",
  grade = "",
  gameGatekeeper = "",
  gameCompletedAt = "",
  score = "",
  title = "",
  accuracy = "",
  correct = "",
  wrong = "",
  submissionId = "",
  pending = false,
  source = null,
  recruited = null,
}) {
  return {
    personKey,
    status,
    normalizedPhone,
    name,
    phone,
    department,
    grade,
    gameGatekeeper,
    gameCompletedAt,
    score,
    title,
    accuracy,
    correct,
    wrong,
    submissionId,
    pending,
    recruiters: source?.recruiters || "",
    recruiterList: source?.recruiterList || [],
    recruitedAt: source?.recruitedAt || recruited?.submittedAt || "",
    submittedAt: recruited?.submittedAt || source?.submittedAt || "",
    tier: source?.tier || "",
    activity: source?.activity || "",
    events: listedEvents(source?.activity),
    joined: source?.joined || "",
    depositPaid: source?.depositPaid || "",
    depositAmount: source?.depositAmount || "",
    birthday: source?.birthday || "",
    note: source?.note || "",
    studentId: source?.studentId || "",
    interest: source?.interest || "",
    timeline: [
      gameCompletedAt ? { at: gameCompletedAt, kind: "game", title: "遊戲完成", detail: gameGatekeeper || UNCLASSIFIED } : null,
      (recruited?.submittedAt || source?.submittedAt) ? { at: recruited?.submittedAt || source?.submittedAt, kind: "recruitment", title: "招生表提交", detail: recruited?.recruiters || source?.recruiters || "" } : null,
      source?.activity && hasActivity(source.activity) ? { at: "", kind: "activity", title: source.activity, detail: "活動報名" } : null,
      source?.joined && isYes(source.joined) ? { at: "", kind: "joined", title: "入社", detail: "" } : null,
      source?.depositPaid && isYes(source.depositPaid) ? { at: "", kind: "deposit", title: "保證金", detail: String(source.depositAmount || "") } : null,
    ].filter(Boolean),
  };
}

function appendUnmatchedRoster(profiles, rows, { prefix }) {
  rows.forEach((row, index) => {
    if (profiles.some((profile) => rosterOverlap(profile, row))) return;
    profiles.push(profileFromSources({
      personKey: depositPersonKey(row, index),
      status: row.normalizedPhone ? "matched" : "unmatched",
      normalizedPhone: row.normalizedPhone || "",
      name: row.name,
      phone: row.phone,
      department: row.department,
      grade: row.grade,
      gameGatekeeper: row.gameGatekeeper || "",
      submissionId: row.submissionId || "",
      pending: false,
      source: row,
      recruited: prefix === "recruit" ? row : null,
    }));
  });
}

/** @param {unknown} value */
export function splitActivities(value) {
  return text(value)
    .split(/[,，、]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** @param {unknown} value */
export function isCountedActivity(value) {
  const raw = text(value);
  if (!raw) return false;
  if (/^無/.test(raw) || /考慮中|沒興趣|未報/.test(raw)) return false;
  return true;
}

function countedActivityList(value) {
  return [...new Set(splitActivities(value).filter(isCountedActivity))];
}

function hasActivity(value) {
  return countedActivityList(value).length > 0;
}

function personIdentityKey(row) {
  if (text(row?.normalizedPhone)) return `phone:${row.normalizedPhone}`;
  if (text(row?.normalizedName)) return `name:${row.normalizedName}`;
  return `row:${text(row?.name)}:${text(row?.phone)}`;
}

function uniqueActivityPeople(rows) {
  const keys = new Set();
  for (const row of rows || []) {
    if (!hasActivity(row.activity)) continue;
    keys.add(personIdentityKey(row));
  }
  return keys.size;
}

function activityBreakdown(rows) {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  for (const row of rows || []) {
    const key = personIdentityKey(row);
    for (const activity of countedActivityList(row.activity)) {
      const set = map.get(activity) || new Set();
      set.add(key);
      map.set(activity, set);
    }
  }
  return [...map]
    .map(([name, set]) => ({ name, count: set.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hant"));
}

/** @param {string} iso @param {number} days */
export function shiftIsoDate(iso, days) {
  const [year, month, day] = String(iso).split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + Number(days || 0));
  return new Date(utc).toISOString().slice(0, 10);
}

function recruitOnDate(row, date) {
  if (!date) return true;
  const at = timestamp(row?.submittedAt) || "";
  if (at && onDate(at, date)) return true;
  const day = text(row?.recruitedAt);
  if (!day) return false;
  const parsed = day.match(/(\d{1,2})[/-](\d{1,2})/);
  if (!parsed) return false;
  const [, month, d] = parsed;
  return date.slice(5) === `${month.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function reviewPersonKeys(people) {
  const keys = new Set();
  /** @type {Map<string, typeof people>} */
  const byName = new Map();
  for (const person of people || []) {
    if (person.status === "ambiguous") keys.add(person.personKey);
    const attemptNames = new Set(
      (person.attempts || []).map((attempt) => normalizeName(attempt.name)).filter(Boolean),
    );
    if (attemptNames.size > 1) keys.add(person.personKey);
    if (!person.normalizedName) continue;
    const list = byName.get(person.normalizedName) || [];
    list.push(person);
    byName.set(person.normalizedName, list);
  }
  for (const group of byName.values()) {
    const phones = new Set(group.map((person) => person.normalizedPhone).filter(Boolean));
    if (group.length > 1 && phones.size > 1) {
      for (const person of group) keys.add(person.personKey);
    }
  }
  return keys;
}

const REAL_EVENT_CHOICES = LIVE_ACTIVITY_CHOICES.filter((name) => hasActivity(name));

export function listedEvents(value) {
  const parts = text(value).split(/[,，、]/).map((part) => part.trim()).filter(Boolean);
  const known = [];
  for (const part of parts) {
    const match = REAL_EVENT_CHOICES.find((choice) => part === choice || part.includes(choice) || choice.includes(part));
    if (match && !known.includes(match)) known.push(match);
  }
  return known;
}

function rosterDay(row, date) {
  if (!date) return true;
  if (row.submittedAt && onDate(row.submittedAt, date)) return true;
  const day = text(row.recruitedAt);
  const parsed = day.match(/(\d{1,2})[/-](\d{1,2})/);
  if (!parsed) return false;
  const [, month, d] = parsed;
  return date.slice(5) === `${month.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Unique people for formal stats. Phone wins; same name + different phones stay
 * separate; same name without phones is one person; name that collides with a
 * phone identity is not silently merged.
 */
export function uniqueByIdentity(rows) {
  const byPhone = new Map();
  const noPhone = [];
  for (const row of rows || []) {
    if (row?.normalizedPhone) {
      if (!byPhone.has(row.normalizedPhone)) byPhone.set(row.normalizedPhone, row);
    } else noPhone.push(row);
  }
  const namesWithPhone = new Set(
    [...byPhone.values()].map((row) => row.normalizedName).filter(Boolean),
  );
  const byName = new Map();
  const unmatched = [];
  for (const row of noPhone) {
    const name = row.normalizedName;
    if (!name) {
      unmatched.push(row);
      continue;
    }
    if (namesWithPhone.has(name)) {
      unmatched.push(row);
      continue;
    }
    if (!byName.has(name)) byName.set(name, row);
  }
  return [...byPhone.values(), ...byName.values(), ...unmatched];
}

function uniqueCount(rows, predicate) {
  return uniqueByIdentity((rows || []).filter(predicate)).length;
}

function presentUnique(rows, hasField, predicate) {
  if (!rows.length) return null;
  const known = rows.filter(hasField);
  if (!known.length) return null;
  return uniqueCount(rows, predicate);
}

function isYes(value) {
  return text(value) === "是" || text(value).toLowerCase() === "yes" || text(value) === "Y";
}

function depositPersonKey(row, index) {
  const name = text(row?.normalizedName);
  const phone = text(row?.normalizedPhone);
  if (name && phone) return `name:${name}|phone:${phone}`;
  if (name) return `name:${name}|nophone`;
  if (phone) return `phone:${phone}`;
  return `row:${index}`;
}

/** Paid-deposit people: official form 是, unique by name+phone. Never phone-only merge. */
export function summarizePaidDeposit(rows) {
  const list = rows || [];
  if (!list.length) {
    return {
      count: null,
      needsReview: false,
      rowCount: 0,
      nameCount: 0,
      phoneCount: 0,
      conflictNames: [],
      conflictPhones: [],
    };
  }
  const known = list.filter((row) => Boolean(text(row.depositPaid)));
  if (!known.length) {
    return {
      count: null,
      needsReview: false,
      rowCount: 0,
      nameCount: 0,
      phoneCount: 0,
      conflictNames: [],
      conflictPhones: [],
    };
  }
  const yes = list.filter((row) => isYes(row.depositPaid));
  const keys = new Set();
  /** @type {Map<string, Set<string>>} */
  const byName = new Map();
  /** @type {Map<string, Set<string>>} */
  const byPhone = new Map();
  yes.forEach((row, index) => {
    const key = depositPersonKey(row, index);
    keys.add(key);
    const name = text(row.normalizedName);
    const phone = text(row.normalizedPhone);
    if (name) {
      const set = byName.get(name) || new Set();
      set.add(key);
      byName.set(name, set);
    }
    if (phone) {
      const set = byPhone.get(phone) || new Set();
      set.add(key);
      byPhone.set(phone, set);
    }
  });
  const conflictNames = [...byName.entries()].filter(([, set]) => set.size > 1).map(([name]) => name);
  const conflictPhones = [...byPhone.entries()].filter(([, set]) => set.size > 1).map(([phone]) => phone);
  return {
    count: keys.size,
    needsReview: Boolean(conflictNames.length || conflictPhones.length || yes.length > keys.size),
    rowCount: yes.length,
    nameCount: byName.size,
    phoneCount: byPhone.size,
    conflictNames,
    conflictPhones,
  };
}

function rosterIdentityConflicts(rows) {
  /** @type {Map<string, Set<string>>} */
  const byName = new Map();
  /** @type {Map<string, Set<string>>} */
  const byPhone = new Map();
  (rows || []).forEach((row, index) => {
    const name = rosterName(row);
    const phone = text(row.normalizedPhone);
    const key = depositPersonKey({ normalizedName: name, normalizedPhone: phone }, index);
    if (name) {
      const set = byName.get(name) || new Set();
      set.add(key);
      byName.set(name, set);
    }
    if (phone) {
      const set = byPhone.get(phone) || new Set();
      set.add(key);
      byPhone.set(phone, set);
    }
  });
  return {
    names: [...byName.entries()].filter(([, set]) => set.size > 1).map(([name]) => name),
    phones: [...byPhone.entries()].filter(([, set]) => set.size > 1).map(([phone]) => phone),
  };
}

function amount(value) {
  const n = number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function onDate(iso, date) {
  if (!date) return true;
  if (!iso) return false;
  return dateInTaipei(new Date(iso)) === date;
}

export function buildRecruitmentDashboard(input = {}) {
  const now = input.now || new Date();
  const date = input.date ?? dateInTaipei(now);
  if (date && !validDate(date)) throw new RangeError("Invalid date");
  const attempts = parseGameAttempts(input.gameRows || []);
  const datedAttempts = date ? attempts.filter((row) => onDate(row.completedAt, date)) : attempts;
  const people = clusterGamePeople(attempts);
  const datedPeople = clusterGamePeople(datedAttempts);
  const recruits = parseRecruitmentResponses(input.recruitmentRows || []).filter((row) => !row.duplicate);
  const allRecruitsIncludingDup = parseRecruitmentResponses(input.recruitmentRows || []);
  const master = parseMasterRows(input.masterRows || []);
  const pendingPeople = people.filter((person) => !personIsRecruited(person, recruits));
  const datedPending = datedPeople.filter((person) => !personIsRecruited(person, recruits));
  const reviewKeys = reviewPersonKeys(people);

  const pending = pendingPeople.map((person) => {
    const latest = latestAttempt(person.attempts);
    const needsReview = person.status === "ambiguous"
      || reviewKeys.has(person.personKey)
      || recruits.some((row) => officialIdentityConflict(person, row))
      || master.some((row) => officialIdentityConflict(person, row));
    return {
      personKey: person.personKey,
      status: person.status,
      needsReview,
      name: latest.name,
      phone: latest.phone,
      normalizedPhone: person.normalizedPhone,
      department: person.department || latest.department,
      grade: person.grade || latest.grade,
      gameGatekeeper: latest.gatekeeper || UNCLASSIFIED,
      completedAt: latest.completedAt,
      waitMinutes: waitMinutes(latest.completedAt, now),
      submissionId: latest.submissionId,
      attemptCount: person.attempts.length,
      prefillUrl: "",
      choiceLabel: "",
      latestAttempt: latest,
    };
  }).map((row) => ({ ...row, choiceLabel: encodeStudentChoice(row) }))
    .sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));

  const profiles = people.map((person) => {
    const latest = latestAttempt(person.attempts);
    const identity = {
      normalizedPhone: person.normalizedPhone,
      normalizedName: person.normalizedName,
      name: latest.name,
      submissionId: latest.submissionId,
    };
    const recruited = recruits.find((row) => rosterOverlap(identity, row));
    const masterRow = master.find((row) => rosterOverlap(identity, row));
    const source = masterRow || recruited;
    return profileFromSources({
      personKey: person.personKey,
      status: person.status,
      normalizedPhone: person.normalizedPhone,
      name: latest.name,
      phone: latest.phone,
      department: person.department || latest.department,
      grade: person.grade || latest.grade,
      gameGatekeeper: latest.gatekeeper || "",
      gameCompletedAt: latest.completedAt,
      score: latest.score,
      title: latest.title,
      accuracy: latest.accuracy,
      correct: latest.correct,
      wrong: latest.wrong,
      submissionId: latest.submissionId,
      pending: !recruited,
      source,
      recruited,
    });
  }).map((row) => ({
    ...row,
    needsReview: row.status === "ambiguous" || reviewKeys.has(row.personKey),
  }));
  appendUnmatchedRoster(profiles, master, { prefix: "master" });
  appendUnmatchedRoster(profiles, recruits, { prefix: "recruit", pending: false });

  const completed = master.length ? master : recruits;
  const formal = recruits.length ? recruits : master;
  function presentCount(rows, hasField, predicate) {
    if (!rows.length) return null;
    const known = rows.filter(hasField);
    if (!known.length) return null;
    return rows.filter(predicate).length;
  }
  const activityCount = presentUnique(
    formal,
    (row) => Boolean(text(row.activity)),
    (row) => listedEvents(row.activity).length > 0 || hasActivity(row.activity),
  );
  const joinedCount = presentUnique(formal, (row) => Boolean(text(row.joined)), (row) => isYes(row.joined));
  const depositCount = presentUnique(
    formal,
    (row) => Boolean(text(row.depositPaid)),
    (row) => isYes(row.depositPaid),
  );
  const depositKnown = completed.filter((row) => text(row.depositAmount) !== "" || isYes(row.depositPaid));
  const depositTotal = !completed.length || !depositKnown.length
    ? null
    : uniqueByIdentity(completed).reduce((sum, row) => sum + amount(row.depositAmount), 0);
  const deposit = summarizePaidDeposit(completed);

  const today = dateInTaipei(now);
  const todayPeople = clusterGamePeople(attempts.filter((row) => onDate(row.completedAt, today)));
  const played = datedPeople.length;
  const pendingToday = datedPending.length;
  const completedToday = uniqueCount(completed, (row) => rosterDay(row, date));
  const activityToday = presentUnique(
    formal,
    (row) => Boolean(text(row.activity)),
    (row) => rosterDay(row, today) && (listedEvents(row.activity).length > 0 || hasActivity(row.activity)),
  );
  const events = REAL_EVENT_CHOICES.map((name) => {
    const signed = uniqueByIdentity(formal.filter((row) => listedEvents(row.activity).includes(name)));
    return {
      name,
      count: signed.length,
      people: signed.map((row) => ({
        name: text(row.name) || "未填姓名",
        personKey: row.normalizedPhone
          ? `phone:${row.normalizedPhone}`
          : `name:${row.normalizedName || row.name || "未填"}`,
      })),
    };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hant"));

  function rate(part, whole) {
    if (!Number.isFinite(whole) || whole <= 0) return null;
    if (!Number.isFinite(part)) return null;
    return Math.round((part / whole) * 1000) / 10;
  }

  const funnelPlayed = people.length;
  const funnel = [
    { id: "played", label: "遊戲接觸", count: funnelPlayed, fromPrevious: null, fromStart: funnelPlayed ? 100 : null },
    { id: "activity", label: "活動報名", count: activityCount, fromPrevious: rate(activityCount, funnelPlayed), fromStart: rate(activityCount, funnelPlayed) },
    { id: "joined", label: "入社", count: joinedCount, fromPrevious: rate(joinedCount, activityCount), fromStart: rate(joinedCount, funnelPlayed) },
    { id: "deposit", label: "保證金", count: depositCount, fromPrevious: rate(depositCount, joinedCount), fromStart: rate(depositCount, funnelPlayed) },
  ].map((layer, index) => {
    if (index === 0) return layer;
    if (layer.count == null) {
      return { ...layer, fromPrevious: null, fromStart: null, missing: true };
    }
    return layer;
  });

  const trendDays = [];
  const trendEnd = new Date(`${today}T12:00:00+08:00`);
  for (let i = 6; i >= 0; i -= 1) {
    const day = dateInTaipei(new Date(trendEnd.getTime() - i * 86400000));
    trendDays.push({
      date: day,
      contacts: clusterGamePeople(attempts.filter((row) => onDate(row.completedAt, day))).length,
      signups: uniqueCount(
        formal,
        (row) => rosterDay(row, day) && (listedEvents(row.activity).length > 0 || hasActivity(row.activity)),
      ),
      joined: uniqueCount(formal, (row) => rosterDay(row, day) && isYes(row.joined)),
    });
  }

  const gatekeeperNames = [...new Set([
    ...attempts.map((row) => row.gatekeeper || UNCLASSIFIED),
    ...pending.map((row) => row.gameGatekeeper),
  ])];

  const gameGatekeepers = gatekeeperNames.map((name) => {
    const groupAttempts = attempts.filter((row) => (row.gatekeeper || UNCLASSIFIED) === name);
    const groupPeople = clusterGamePeople(groupAttempts);
    const groupPending = groupPeople.filter((person) => !personIsRecruited(person, recruits));
    const groupRecruited = groupPeople.filter((person) => personIsRecruited(person, recruits));
    const recruitedProfiles = groupRecruited.map((person) => {
      const latest = latestAttempt(person.attempts);
      const source = master.find((row) => row.normalizedName === person.normalizedName)
        || recruits.find((row) => personIsRecruited(person, [row]));
      return { person, latest, source };
    });
    return {
      name,
      played: groupPeople.length,
      pending: groupPending.length,
      recruited: groupRecruited.length,
      activity: presentCount(recruitedProfiles, (row) => Boolean(text(row.source?.activity)), (row) => hasActivity(row.source?.activity)),
      joined: presentCount(recruitedProfiles, (row) => Boolean(text(row.source?.joined)), (row) => isYes(row.source?.joined)),
    };
  }).sort((a, b) => b.played - a.played || a.name.localeCompare(b.name, "zh-Hant"));

  const recruiterNames = [...new Set(completed.flatMap((row) => row.recruiterList || []))];
  const recruiters = recruiterNames.map((name) => ({
    name,
    count: completed.filter((row) => row.recruiterList?.includes(name)).length,
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hant"));

  function distribution(values) {
    const counts = new Map();
    for (const value of values) {
      const name = value || "未填寫";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hant"));
  }

  const candidatesByGatekeeper = {};
  for (const row of pending) {
    const key = normalizeGatekeeper(row.gameGatekeeper) || UNCLASSIFIED;
    (candidatesByGatekeeper[key] ||= []).push(row);
  }

  function personChip(person) {
    const latest = latestAttempt(person.attempts);
    return { name: text(latest?.name) || "未填姓名", personKey: person.personKey };
  }
  function rowChips(rows) {
    return uniqueByIdentity(rows).map((row) => ({
      name: text(row.name) || "未填姓名",
      personKey: row.normalizedPhone
        ? `phone:${row.normalizedPhone}`
        : `name:${row.normalizedName || row.name || "未填"}`,
    }));
  }
  const kpiPeople = {
    todayContacts: todayPeople.map(personChip),
    allContacts: people.map(personChip),
    todayEvents: rowChips(formal.filter((row) =>
      rosterDay(row, today) && (listedEvents(row.activity).length > 0 || hasActivity(row.activity)))),
    joined: rowChips(formal.filter((row) => isYes(row.joined))),
    deposit: rowChips(formal.filter((row) => isYes(row.depositPaid))),
    pending: pending.map((row) => ({ name: text(row.name) || "未填姓名", personKey: row.personKey })),
  };

  return {
    ok: true,
    date,
    summary: {
      playedToday: todayPeople.length,
      playedOnDate: played,
      playedAll: people.length,
      pending: pending.length,
      pendingToday,
      recruited: uniqueByIdentity(completed).length,
      recruitedToday: completedToday,
      activity: activityCount,
      activityToday,
      events,
      joined: joinedCount,
      depositPaid: depositCount,
      depositNeedsReview: deposit.needsReview,
      depositTotal,
      roster: uniqueByIdentity(master.length ? master : completed).length,
      conflicts: people.filter((person) => person.status === "ambiguous").length,
    },
    events,
    trend: trendDays,
    funnel,
    kpiPeople,
    pending,
    profiles,
    gameGatekeepers,
    recruiters,
    distributions: {
      departments: distribution(completed.map((row) => row.department)),
      grades: distribution(completed.map((row) => row.grade)),
    },
    candidatesByGatekeeper,
    duplicates: allRecruitsIncludingDup.filter((row) => row.duplicate).length,
    sync: input.sync || {
      gameResults: { ok: true },
      recruitmentResponses: { ok: true },
      recruitmentMaster: { ok: true },
      form: { ok: true },
      updatedAt: now.toISOString(),
    },
  };
}

export function buildPrefilledFormUrl(candidate, options = {}) {
  return generatePrefilledFormUrl(candidate, {
    responderUrl: options.responderUrl || process.env.GOOGLE_FORM_RESPONDER_URL,
    entries: { ...parsePrefillEntries(process.env.GOOGLE_FORM_PREFILL_ENTRIES), ...options.entries },
    recruiter: options.recruiter,
    extraNotes: options.extraNotes,
    recruitedAt: options.recruitedAt,
  });
}

function parsePrefillEntries(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function recruitmentChoiceGroups(dashboard) {
  const groups = { ...dashboard.candidatesByGatekeeper };
  const known = Object.keys(groups);
  if (!groups[UNCLASSIFIED]) groups[UNCLASSIFIED] = [];
  if (!groups[UNKNOWN_GATEKEEPER]) {
    const leftover = (dashboard.pending || []).filter((row) =>
      !known.includes(normalizeGatekeeper(row.gameGatekeeper)) && row.gameGatekeeper);
    if (leftover.length) groups[UNKNOWN_GATEKEEPER] = leftover;
  }
  return groups;
}

/** Partner WHO chips: display name only. personKey is a hash so phones never leave the server. */
function partnerNameChip(row = {}) {
  const name = text(row.name) || "未填姓名";
  const seed = String(row.personKey || name);
  return {
    name,
    personKey: `who:${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`,
  };
}

function partnerEvents(events = []) {
  return (Array.isArray(events) ? events : []).map((event) => ({
    name: text(event.name),
    count: Number(event.count) || 0,
    people: Array.isArray(event.people) ? event.people.map(partnerNameChip) : [],
  }));
}

function partnerKpiPeople(lists = {}) {
  const empty = { todayContacts: [], allContacts: [], todayEvents: [], joined: [], deposit: [], pending: [] };
  const source = lists && typeof lists === "object" ? lists : {};
  /** @type {typeof empty} */
  const out = { ...empty };
  for (const key of Object.keys(empty)) {
    out[key] = Array.isArray(source[key]) ? source[key].map(partnerNameChip) : [];
  }
  return out;
}

function partnerTrend(trend = []) {
  return (Array.isArray(trend) ? trend : []).map((row) => ({
    date: text(row.date),
    contacts: Number(row.contacts) || 0,
    signups: Number(row.signups) || 0,
    joined: Number(row.joined) || 0,
  }));
}

function partnerPerson(row = {}) {
  return {
    personKey: row.personKey,
    needsReview: Boolean(row.needsReview),
    name: row.name,
    phone: row.phone,
    department: row.department,
    grade: row.grade,
    gameGatekeeper: row.gameGatekeeper,
    gameCompletedAt: row.gameCompletedAt,
    completedAt: row.completedAt,
    waitMinutes: row.waitMinutes,
    pending: row.pending,
    recruiters: row.recruiters,
    recruiterList: row.recruiterList,
    recruitedAt: row.recruitedAt,
    submittedAt: row.submittedAt,
    activity: row.activity,
    joined: row.joined,
    depositPaid: row.depositPaid,
    depositAmount: row.depositAmount,
    birthday: row.birthday,
    note: row.note,
    studentId: row.studentId,
    interest: row.interest,
    timeline: Array.isArray(row.timeline)
      ? row.timeline.map((item) => ({
        at: item.at,
        kind: item.kind,
        title: item.title,
        detail: item.detail,
      }))
      : undefined,
    prefillUrl: row.prefillUrl || "",
    submissionId: row.submissionId,
    attemptCount: row.attemptCount,
  };
}

/** Partner-facing payload: no S/A/B, no game scores, no Google Form choice tokens. */
export function toPartnerRecruitmentDashboard(dashboard = {}) {
  const summary = dashboard.summary || {};
  return {
    ok: dashboard.ok,
    date: dashboard.date,
    summary: {
      playedToday: summary.playedToday,
      playedTotal: summary.playedTotal ?? summary.playedAll,
      pending: summary.pending,
      pendingToday: summary.pendingToday,
      recruited: summary.recruited,
      recruitedToday: summary.recruitedToday,
      activity: summary.activity,
      activityToday: summary.activityToday,
      joined: summary.joined,
      depositPaid: summary.depositPaid,
      depositNeedsReview: Boolean(summary.depositNeedsReview),
      depositTotal: summary.depositTotal,
      roster: summary.roster,
    },
    activities: dashboard.activities,
    daily: dashboard.daily,
    funnel: dashboard.funnel,
    events: partnerEvents(dashboard.events),
    trend: partnerTrend(dashboard.trend),
    kpiPeople: partnerKpiPeople(dashboard.kpiPeople),
    pending: (dashboard.pending || []).map(partnerPerson),
    profiles: (dashboard.profiles || []).map(partnerPerson),
    gameGatekeepers: dashboard.gameGatekeepers,
    recruiters: dashboard.recruiters,
    duplicates: dashboard.duplicates,
    sync: dashboard.sync,
  };
}

export function stableDashboardId(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export { PLACEHOLDER_CHOICE, UNCLASSIFIED, UNKNOWN_GATEKEEPER, formatTaipeiTimestamp };
