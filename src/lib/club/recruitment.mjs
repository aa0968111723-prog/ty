// @ts-nocheck -- Recruitment aggregation is covered by recruitment.test.mjs.
import { createHash } from "node:crypto";
import { titleForScore } from "./runtime.mjs";
import {
  clusterGamePeople,
  identityFields,
  normalizeGatekeeper,
  normalizeName,
  personIsRecruited,
  splitDepartmentGrade,
  text,
} from "./recruitment-identity.mjs";
import { fieldFromAliases, formatTaipeiTimestamp, internalizedGameRow } from "./sheets.mjs";
import { generatePrefilledFormUrl, LIVE_ACTIVITY_CHOICES } from "./recruitment-prefill.mjs";

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

export function encodeStudentChoice(candidate) {
  const latest = candidate.latestAttempt || {};
  const clock = latest.completedAt ? taipeiClock.format(new Date(latest.completedAt)) : "--:--";
  const deptGrade = [candidate.department, candidate.grade].filter(Boolean).join("") || "系級未填";
  const phone = candidate.rawPhone || candidate.normalizedPhone || "電話未填";
  return `${candidate.name || "未填姓名"}｜${deptGrade}｜${phone}｜${clock}|#p:${candidate.personKey}|#s:${latest.submissionId || ""}`;
}

export function decodeStudentChoice(value) {
  const raw = text(value);
  const personKey = raw.match(/#p:([^|#]+)/)?.[1] || "";
  const submissionId = (raw.match(/#s:([^|#]*)/i)?.[1] || "").toLowerCase();
  const label = raw.split("|#p:")[0];
  return { label, personKey, submissionId, placeholder: raw.startsWith(PLACEHOLDER_CHOICE) || raw === PLACEHOLDER_CHOICE };
}

function rosterOverlap(profile, row) {
  const profilePhone = text(profile?.normalizedPhone);
  const rowPhone = text(row?.normalizedPhone);
  if (profilePhone && rowPhone) return profilePhone === rowPhone;
  const profileId = text(profile?.submissionId).toLowerCase();
  const rowId = text(row?.submissionId).toLowerCase();
  if (profileId && rowId && profileId === rowId) return true;
  if (profilePhone || rowPhone) return false;
  const profileName = normalizeName(profile?.name);
  return Boolean(profileName && row?.normalizedName && profileName === row.normalizedName);
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
    joined: source?.joined || "",
    depositPaid: source?.depositPaid || "",
    depositAmount: source?.depositAmount || "",
    birthday: source?.birthday || "",
    note: source?.note || "",
    studentId: source?.studentId || "",
    interest: source?.interest || "",
    activityList: signupActivitiesOf(source?.activity),
    timeline: [
      gameCompletedAt ? { at: gameCompletedAt, kind: "game", title: "遊戲完成", detail: `${gameGatekeeper || UNCLASSIFIED}` } : null,
      (recruited?.submittedAt || source?.submittedAt) ? { at: recruited?.submittedAt || source?.submittedAt, kind: "recruitment", title: "招生表提交", detail: recruited?.recruiters || source?.recruiters || "" } : null,
      source?.activity && signupActivitiesOf(source.activity).length
        ? { at: "", kind: "activity", title: signupActivitiesOf(source.activity).join("、"), detail: "活動報名" }
        : null,
      source?.joined && isYes(source.joined) ? { at: "", kind: "joined", title: "入社", detail: "" } : null,
      source?.depositPaid && isYes(source.depositPaid) ? { at: "", kind: "deposit", title: "保證金", detail: String(source.depositAmount || "") } : null,
    ].filter(Boolean),
  };
}

function appendUnmatchedRoster(profiles, rows, { prefix }) {
  rows.forEach((row, index) => {
    if (profiles.some((profile) => rosterOverlap(profile, row))) return;
    profiles.push(profileFromSources({
      personKey: row.normalizedPhone ? `phone:${row.normalizedPhone}` : `${prefix}:${index}`,
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

const SIGNUP_ACTIVITY_CHOICES = LIVE_ACTIVITY_CHOICES.filter((choice) => !choice.startsWith("無"));

/** @param {unknown} value */
export function parseActivityList(value) {
  return text(value).split(/[,，、]/).map((part) => part.trim()).filter(Boolean);
}

/** @param {unknown} value */
export function isSignupActivity(value) {
  const raw = text(value);
  if (!raw) return false;
  if (/^無/.test(raw)) return false;
  if (/無|考慮中|未報/.test(raw) && !SIGNUP_ACTIVITY_CHOICES.some((choice) => raw.includes(choice))) {
    return false;
  }
  return true;
}

/** @param {unknown} value */
export function signupActivitiesOf(value) {
  return parseActivityList(value).filter(isSignupActivity);
}

function isYes(value) {
  return text(value) === "是" || text(value).toLowerCase() === "yes" || text(value) === "Y";
}

/** @param {string} date @param {number} days */
export function addTaipeiDays(date, days) {
  const noon = new Date(`${date}T12:00:00+08:00`);
  if (!Number.isFinite(noon.getTime())) return "";
  return dateInTaipei(new Date(noon.getTime() + days * 86400000));
}

function identityKey(row) {
  if (text(row?.normalizedPhone)) return `phone:${row.normalizedPhone}`;
  if (text(row?.normalizedName)) return `name:${row.normalizedName}`;
  if (text(row?.submissionId)) return `id:${String(row.submissionId).toLowerCase()}`;
  return `row:${text(row?.name)}`;
}

function uniqueByIdentity(rows) {
  const seen = new Set();
  const unique = [];
  for (const row of rows || []) {
    const key = identityKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

function rowOnDate(row, date) {
  if (!date) return true;
  if (row?.submittedAt && onDate(row.submittedAt, date)) return true;
  const day = text(row?.recruitedAt);
  if (!day) return false;
  const parsed = day.match(/(\d{1,2})[/-](\d{1,2})/);
  if (!parsed) return false;
  const [, month, dayOfMonth] = parsed;
  return date.slice(5) === `${month.padStart(2, "0")}-${dayOfMonth.padStart(2, "0")}`;
}

function flagDuplicateIdentities(profiles) {
  /** @type {Map<string, typeof profiles>} */
  const byName = new Map();
  /** @type {Map<string, typeof profiles>} */
  const byPhone = new Map();
  for (const profile of profiles) {
    const name = normalizeName(profile.name);
    if (name) {
      const list = byName.get(name) || [];
      list.push(profile);
      byName.set(name, list);
    }
    if (profile.normalizedPhone) {
      const list = byPhone.get(profile.normalizedPhone) || [];
      list.push(profile);
      byPhone.set(profile.normalizedPhone, list);
    }
  }
  for (const profile of profiles) {
    const name = normalizeName(profile.name);
    const nameGroup = name ? byName.get(name) || [] : [];
    const phoneGroup = profile.normalizedPhone ? byPhone.get(profile.normalizedPhone) || [] : [];
    const namePhones = new Set(nameGroup.map((row) => row.normalizedPhone || row.personKey));
    const phoneNames = new Set(phoneGroup.map((row) => normalizeName(row.name) || row.personKey));
    const nameConflict = nameGroup.length > 1 && namePhones.size > 1;
    const phoneConflict = phoneGroup.length > 1 && phoneNames.size > 1;
    const ambiguous = profile.status === "ambiguous";
    profile.needsConfirmation = Boolean(nameConflict || phoneConflict || ambiguous);
    profile.confirmationReason = nameConflict
      ? "同名不同電話，需要確認"
      : phoneConflict
        ? "同電話不同姓名，需要確認"
        : ambiguous
          ? "資料不足，需要確認"
          : "";
  }
  return profiles;
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

  const pending = pendingPeople.map((person) => {
    const latest = latestAttempt(person.attempts);
    return {
      personKey: person.personKey,
      status: person.status,
      pending: true,
      name: latest.name,
      phone: latest.phone,
      normalizedPhone: person.normalizedPhone,
      department: person.department || latest.department,
      grade: person.grade || latest.grade,
      gameGatekeeper: latest.gatekeeper || UNCLASSIFIED,
      completedAt: latest.completedAt,
      score: latest.score,
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
    const recruited = recruits.find((row) => personIsRecruited(person, [row]));
    const masterRow = master.find((row) => rosterOverlap({
      normalizedPhone: person.normalizedPhone,
      submissionId: latest.submissionId,
    }, row));
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
  });
  appendUnmatchedRoster(profiles, master, { prefix: "master" });
  appendUnmatchedRoster(profiles, recruits, { prefix: "recruit", pending: false });
  flagDuplicateIdentities(profiles);
  const confirmationByKey = new Map(profiles.map((row) => [row.personKey, row]));
  for (const row of pending) {
    const profile = confirmationByKey.get(row.personKey);
    row.needsConfirmation = Boolean(profile?.needsConfirmation);
    row.confirmationReason = profile?.confirmationReason || "";
    row.followUpPath = `/follow-up?personKey=${encodeURIComponent(row.personKey)}`;
    row.activityList = [];
    row.joined = "";
    row.depositPaid = "";
    row.recruiters = "";
    row.recruiterList = [];
  }

  const completed = uniqueByIdentity(master.length ? master : recruits);
  function presentCount(rows, hasField, predicate) {
    if (!rows.length) return null;
    const known = rows.filter(hasField);
    if (!known.length) return null;
    return rows.filter(predicate).length;
  }
  const uniqueCompleted = completed;
  const hasActivityField = (row) => Boolean(text(row.activity));
  const signedUp = (row) => signupActivitiesOf(row.activity).length > 0;
  const activityCount = presentCount(uniqueCompleted, hasActivityField, signedUp);
  const activityTodayCount = presentCount(
    uniqueCompleted,
    hasActivityField,
    (row) => signedUp(row) && rowOnDate(row, date),
  );
  const joinedCount = presentCount(uniqueCompleted, (row) => Boolean(text(row.joined)), (row) => isYes(row.joined));
  const depositCount = presentCount(uniqueCompleted, (row) => Boolean(text(row.depositPaid)), (row) => isYes(row.depositPaid));
  const depositKnown = uniqueCompleted.filter((row) => text(row.depositAmount) !== "" || isYes(row.depositPaid));
  const depositTotal = !uniqueCompleted.length || !depositKnown.length
    ? null
    : uniqueCompleted.reduce((sum, row) => sum + amount(row.depositAmount), 0);

  const activityLabels = [...SIGNUP_ACTIVITY_CHOICES];
  for (const row of uniqueCompleted) {
    for (const activity of signupActivitiesOf(row.activity)) {
      if (!activityLabels.includes(activity)) activityLabels.push(activity);
    }
  }
  const activities = activityLabels.map((name) => ({
    name,
    count: uniqueCompleted.filter((row) => signupActivitiesOf(row.activity).includes(name)).length,
    today: uniqueCompleted.filter((row) =>
      signupActivitiesOf(row.activity).includes(name) && rowOnDate(row, date)).length,
  }));

  const played = datedPeople.length;
  const pendingToday = datedPending.length;
  const completedToday = uniqueCompleted.filter((row) => rowOnDate(row, date)).length;

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

  const dailyTrend = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const day = addTaipeiDays(date, offset);
    if (!day) continue;
    const dayContacts = clusterGamePeople(attempts.filter((row) => onDate(row.completedAt, day))).length;
    const dayActivity = uniqueCompleted.filter((row) => signedUp(row) && rowOnDate(row, day)).length;
    const dayJoined = uniqueCompleted.filter((row) => isYes(row.joined) && rowOnDate(row, day)).length;
    dailyTrend.push({ date: day, contacts: dayContacts, activity: dayActivity, joined: dayJoined });
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
      const source = master.find((row) => row.normalizedName === person.normalizedName)
        || recruits.find((row) => personIsRecruited(person, [row]));
      return { person, source };
    });
    return {
      name,
      played: groupPeople.length,
      pending: groupPending.length,
      recruited: groupRecruited.length,
      activity: presentCount(recruitedProfiles, (row) => Boolean(text(row.source?.activity)), (row) => signedUp(row.source)),
      joined: presentCount(recruitedProfiles, (row) => Boolean(text(row.source?.joined)), (row) => isYes(row.source?.joined)),
      depositPaid: presentCount(recruitedProfiles, (row) => Boolean(text(row.source?.depositPaid)), (row) => isYes(row.source?.depositPaid)),
    };
  }).sort((a, b) => b.played - a.played || a.name.localeCompare(b.name, "zh-Hant"));

  const recruiterNames = [...new Set(uniqueCompleted.flatMap((row) => row.recruiterList || []))];
  const recruiters = recruiterNames.map((name) => ({
    name,
    count: uniqueCompleted.filter((row) => row.recruiterList?.includes(name)).length,
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

  return {
    ok: true,
    date,
    summary: {
      contactsToday: played,
      contactsTotal: people.length,
      playedToday: played,
      pending: pending.length,
      pendingFormal: pending.length,
      pendingToday,
      recruited: uniqueCompleted.length,
      recruitedToday: completedToday,
      activityToday: activityTodayCount,
      activity: activityCount,
      joined: joinedCount,
      depositPaid: depositCount,
      depositTotal,
      roster: uniqueCompleted.length,
    },
    activities,
    dailyTrend,
    funnel,
    pending,
    profiles,
    gameGatekeepers,
    recruiters,
    distributions: {
      departments: distribution(uniqueCompleted.map((row) => row.department)),
      grades: distribution(uniqueCompleted.map((row) => row.grade)),
      activities: distribution(uniqueCompleted.flatMap((row) => signupActivitiesOf(row.activity))),
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

export function stableDashboardId(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export { PLACEHOLDER_CHOICE, UNCLASSIFIED, UNKNOWN_GATEKEEPER, formatTaipeiTimestamp };
