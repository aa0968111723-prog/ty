// @ts-nocheck -- Identity matching is covered by recruitment-identity.test.mjs.
/** Identity normalization and person matching for game → recruitment candidates. */

const GRADE_CANON = [
  ["博士班", /博[一二]|博士/],
  ["碩士班", /碩[一二]|碩士|研究所/],
  ["大四", /大四|四年級|^4[A-Za-z]?$|四[A-Za-z]?$/],
  ["大三", /大三|三年級|^3[A-Za-z]?$|三[A-Za-z]?$/],
  ["大二", /大二|二年級|^2[A-Za-z]?$|二[A-Za-z]?$/],
  ["大一", /大一|一年級|^1[A-Za-z]?$|一[A-Za-z]?$/],
  ["其他", /其他|社青|校友/],
];

/** @param {unknown} value */
export function text(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

/** @param {unknown} value */
export function normalizeName(value) {
  return text(value).normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("en-US");
}

/** @param {unknown} value */
export function normalizeGatekeeper(value) {
  return text(value).normalize("NFKC").replace(/\s+/gu, "");
}

/** @param {unknown} value */
export function normalizeDepartment(value) {
  const raw = text(value).normalize("NFKC").replace(/\s+/gu, "");
  if (!raw) return "";
  const split = splitDepartmentGrade(raw);
  return split.department || raw;
}

/** @param {unknown} value */
export function normalizeGrade(value) {
  const raw = text(value).normalize("NFKC").replace(/\s+/gu, "");
  if (!raw) return "";
  const split = splitDepartmentGrade(raw);
  if (split.grade) return split.grade;
  for (const [canon, pattern] of GRADE_CANON) {
    if (pattern.test(raw)) return canon;
  }
  return raw;
}

/**
 * Split values like 物理大三 / 航太2A / 化學3 into department + grade.
 * @param {unknown} value
 * @returns {{ department: string, grade: string }}
 */
export function splitDepartmentGrade(value) {
  const raw = text(value).normalize("NFKC").replace(/\s+/gu, "");
  if (!raw) return { department: "", grade: "" };
  const match = raw.match(
    /^(.*?)(大[一二三四]|碩[一二]|博[一二]|碩士班|博士班|[一二三四1-4][A-Za-z]?)$/u,
  );
  if (!match) return { department: raw, grade: "" };
  const department = match[1].replace(/[／/]$/u, "");
  let token = match[2];
  let grade = "";
  for (const [canon, pattern] of GRADE_CANON) {
    if (pattern.test(token)) {
      grade = canon;
      break;
    }
  }
  if (!grade && /^[一二三四1-4]/u.test(token)) {
    const map = { 1: "大一", 2: "大二", 3: "大三", 4: "大四", 一: "大一", 二: "大二", 三: "大三", 四: "大四" };
    grade = map[token[0]] || "";
  }
  return { department, grade };
}

/**
 * @param {unknown} value
 * @returns {{ rawPhone: string, normalizedPhone: string | null }}
 */
export function normalizePhone(value) {
  const rawPhone = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : text(value);
  return { rawPhone, normalizedPhone: extractTaiwanMobile(value) };
}

/** @param {unknown} value */
export function extractTaiwanMobile(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const asInt = Math.round(value);
    const digits = String(asInt);
    if (/^9\d{8}$/.test(digits)) return `0${digits}`;
    if (/^8869\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
    return null;
  }
  const raw = text(value).normalize("NFKC");
  if (!raw) return null;
  if (/[\u4e00-\u9fff]/u.test(raw) && !/\d/.test(raw)) return null;

  const compact = raw.replace(/[()\s\-．.\u3000]/gu, "");
  const plus = compact.replace(/^(\+|＋)?886/, "0");
  if (/^09\d{8}$/.test(plus) && looksLikeStandalonePhone(raw, plus)) return plus;

  const digitRuns = [...raw.matchAll(/09[\d\-.\s]{8,14}/g)].map((match) =>
    match[0].replace(/\D/g, ""),
  ).filter((digits) => /^09\d{8}$/.test(digits));
  const unique = [...new Set(digitRuns)];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) return null;

  const onlyDigits = raw.replace(/\D/g, "");
  if (/^9\d{8}$/.test(onlyDigits) && !/[A-Za-z\u4e00-\u9fff]/u.test(raw)) return `0${onlyDigits}`;
  if (/^8869\d{8}$/.test(onlyDigits)) return `0${onlyDigits.slice(3)}`;
  return null;
}

/** @param {string} raw @param {string} phone */
function looksLikeStandalonePhone(raw, phone) {
  const leftover = raw.normalize("NFKC")
    .replace(/[()\s\-．.\u3000]/gu, "")
    .replace(/^(\+|＋)?886/, "0")
    .replace(phone, "");
  return leftover === "" || leftover === "+";
}

/**
 * @param {{ name?: unknown, phone?: unknown, department?: unknown, grade?: unknown, departmentGrade?: unknown }} row
 */
export function identityFields(row = {}) {
  const split = splitDepartmentGrade(row.departmentGrade || "");
  const department = normalizeDepartment(row.department || split.department);
  const grade = normalizeGrade(row.grade || split.grade);
  const phone = normalizePhone(row.phone);
  return {
    rawName: text(row.name),
    normalizedName: normalizeName(row.name),
    rawPhone: phone.rawPhone,
    normalizedPhone: phone.normalizedPhone,
    department,
    grade,
  };
}

/**
 * Department / grade are consistent when neither side contradicts the other.
 * @param {{ department?: string, grade?: string }} left
 * @param {{ department?: string, grade?: string }} right
 */
export function profileConsistent(left, right) {
  const deptL = normalizeDepartment(left?.department);
  const deptR = normalizeDepartment(right?.department);
  const gradeL = normalizeGrade(left?.grade);
  const gradeR = normalizeGrade(right?.grade);
  const deptOk = !deptL || !deptR || deptL === deptR;
  const gradeOk = !gradeL || !gradeR || gradeL === gradeR;
  return deptOk && gradeOk;
}

/**
 * @typedef {{ key: string, status: "matched" | "unmatched" | "ambiguous", reason: string }} IdentityMatch
 */

/**
 * Cluster game attempts into people. Never fuzzy-merge names.
 * @param {Array<Record<string, unknown>>} attempts
 * @returns {Array<{
 *   personKey: string,
 *   status: "matched" | "unmatched" | "ambiguous",
 *   reason: string,
 *   normalizedName: string,
 *   normalizedPhone: string | null,
 *   department: string,
 *   grade: string,
 *   attempts: Array<Record<string, unknown>>,
 * }>}
 */
export function clusterGamePeople(attempts) {
  const rows = (attempts || []).map((attempt, index) => ({
    attempt,
    index,
    identity: identityFields(attempt),
  }));
  /** @type {Map<string, typeof rows>} */
  const byPhone = new Map();
  const withoutPhone = [];
  for (const row of rows) {
    const phone = row.identity.normalizedPhone;
    if (phone) {
      const list = byPhone.get(phone) || [];
      list.push(row);
      byPhone.set(phone, list);
    } else withoutPhone.push(row);
  }

  /** @type {Array<ReturnType<typeof personFromRows>>} */
  const people = [];
  for (const [phone, group] of byPhone) {
    people.push(personFromRows(group, `phone:${phone}`, "matched", "normalizedPhone"));
  }

  /** @type {Map<string, typeof rows>} */
  const byName = new Map();
  for (const row of withoutPhone) {
    const name = row.identity.normalizedName;
    if (!name) {
      people.push(personFromRows([row], unmatchedKey(row), "unmatched", "missing-name"));
      continue;
    }
    const list = byName.get(name) || [];
    list.push(row);
    byName.set(name, list);
  }

  for (const [name, group] of byName) {
    if (group.length === 1) {
      const phoneHit = people.find((person) =>
        person.normalizedName === name && profileConsistent(person, group[0].identity));
      if (phoneHit) {
        phoneHit.attempts.push(group[0].attempt);
        continue;
      }
      const uniqueAcrossPhones = !people.some((person) => person.normalizedName === name);
      people.push(personFromRows(
        group,
        uniqueAcrossPhones ? `name:${name}` : unmatchedKey(group[0]),
        uniqueAcrossPhones ? "matched" : "unmatched",
        uniqueAcrossPhones ? "unique-name" : "name-conflicts-with-phone-identity",
      ));
      continue;
    }
    const buckets = [];
    for (const row of group) {
      const bucket = buckets.find((item) => profileConsistent(item.identity, row.identity));
      if (bucket) bucket.rows.push(row);
      else buckets.push({ identity: row.identity, rows: [row] });
    }
    const phoneCollides = people.some((person) => person.normalizedName === name);
    if (buckets.length === 1 && !phoneCollides) {
      const identity = buckets[0].identity;
      const key = identity.department || identity.grade
        ? `name:${name}|dept:${identity.department}|grade:${identity.grade}`
        : `name:${name}`;
      people.push(personFromRows(buckets[0].rows, key, "matched", "name-and-profile"));
      continue;
    }
    for (const bucket of buckets) {
      const reason = phoneCollides || buckets.length > 1
        ? "ambiguous-same-name"
        : "name-and-profile";
      const status = reason === "ambiguous-same-name" ? "ambiguous" : "matched";
      for (const row of status === "ambiguous" ? bucket.rows : [bucket.rows[0]]) {
        if (status === "ambiguous") {
          people.push(personFromRows([row], unmatchedKey(row), "ambiguous", reason));
        }
      }
      if (status !== "ambiguous") {
        people.push(personFromRows(bucket.rows, `name:${name}|dept:${bucket.identity.department}|grade:${bucket.identity.grade}`, "matched", "name-and-profile"));
      }
    }
  }
  return people;
}

/** @param {typeof rows[number]} row */
function unmatchedKey(row) {
  const submissionId = text(row.attempt.submissionId || row.attempt._submissionId).toLowerCase();
  return submissionId ? `attempt:${submissionId}` : `row:${row.index}`;
}

function personFromRows(group, personKey, status, reason) {
  const latest = group[group.length - 1].identity;
  return {
    personKey,
    status,
    reason,
    normalizedName: latest.normalizedName,
    normalizedPhone: group.map((row) => row.identity.normalizedPhone).find(Boolean) || null,
    department: latest.department,
    grade: latest.grade,
    attempts: group.map((row) => row.attempt),
  };
}

/**
 * @param {{ personKey: string, normalizedName: string, normalizedPhone: string | null, department: string, grade: string, status: string, attempts: unknown[] }} person
 * @param {Array<{ submissionId?: string, normalizedPhone?: string | null, normalizedName?: string, department?: string, grade?: string, duplicate?: boolean }>} recruits
 */
export function personIsRecruited(person, recruits) {
  const valid = (recruits || []).filter((row) => !row.duplicate);
  const attemptIds = new Set(
    (person.attempts || []).map((attempt) =>
      text(attempt.submissionId || attempt._submissionId).toLowerCase(),
    ).filter(Boolean),
  );
  if (valid.some((row) => attemptIds.has(text(row.submissionId).toLowerCase()))) return true;
  if (person.normalizedPhone && valid.some((row) => row.normalizedPhone === person.normalizedPhone)) {
    return true;
  }
  if (person.status !== "matched") return false;
  const named = valid.filter((row) => row.normalizedName && row.normalizedName === person.normalizedName);
  if (!named.length) return false;
  const consistent = named.filter((row) => profileConsistent(person, row));
  if (person.reason === "unique-name" && named.length === 1) return true;
  return consistent.length === 1 && named.length === 1;
}

/**
 * Match an incoming recruitment submission to a game person.
 * @param {ReturnType<typeof identityFields> & { submissionId?: string }} incoming
 * @param {Array<ReturnType<typeof clusterGamePeople>[number]>} people
 */
export function matchIncomingRecruitment(incoming, people) {
  const submissionId = text(incoming.submissionId).toLowerCase();
  if (submissionId) {
    const hit = people.find((person) =>
      person.attempts.some((attempt) =>
        text(attempt.submissionId || attempt._submissionId).toLowerCase() === submissionId));
    if (hit) return { person: hit, reason: "_gameSubmissionId" };
  }
  if (incoming.normalizedPhone) {
    const hits = people.filter((person) => person.normalizedPhone === incoming.normalizedPhone);
    if (hits.length === 1) return { person: hits[0], reason: "normalizedPhone" };
    if (hits.length > 1) return { person: null, reason: "ambiguous-phone" };
  }
  const named = people.filter((person) =>
    person.normalizedName && person.normalizedName === incoming.normalizedName);
  const consistent = named.filter((person) => profileConsistent(person, incoming));
  if (consistent.length === 1 && named.length === 1) {
    return { person: consistent[0], reason: consistent[0].reason === "unique-name" ? "unique-name" : "name-and-profile" };
  }
  if (named.length > 1) return { person: null, reason: "ambiguous-name" };
  return { person: null, reason: "unmatched" };
}
