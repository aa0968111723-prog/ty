// @ts-nocheck -- Form sync planner is covered by recruitment.test.mjs.
import {
  PLACEHOLDER_CHOICE,
  UNCLASSIFIED,
  UNKNOWN_GATEKEEPER,
  decodeStudentChoice,
  encodeStudentChoice,
} from "./recruitment.mjs";
import { normalizeGatekeeper, text } from "./recruitment-identity.mjs";

export const FORM_QUESTION_TITLES = Object.freeze({
  gameGatekeeper: "本次遊戲關主",
  student: "選擇學生",
});

export const PRESERVED_RECRUITMENT_TITLES = [
  "接引人(可複選)",
  "接引日期",
  "同學的姓名",
  "同學電話/LINE",
  "系級",
  "這位同學是屬於那個分級呢:-)",
  "報名了那個活動",
  "同學生日",
  "備註",
  "生日",
  "學號",
  "興趣",
  "對甚麼有興趣",
  "是否入社",
  "保證金是否繳費",
  "繳了多少呢?",
];

/** @param {unknown} form */
export function snapshotFormStructure(form) {
  const items = (form?.items || []).map((item, index) => ({
    id: item.id ?? index,
    title: text(item.title),
    type: item.type,
    index,
    choices: (item.choices || []).map((choice) => text(choice)),
    page: item.page ?? 0,
    goTo: item.goTo ?? null,
    preserved: PRESERVED_RECRUITMENT_TITLES.some((title) => text(item.title).startsWith(title)),
  }));
  return {
    id: form?.id || "",
    title: form?.title || "",
    itemCount: items.length,
    items,
    capturedAt: form?.now || new Date().toISOString(),
  };
}

function sectionTitle(gatekeeper) {
  return `${gatekeeper}｜待跟進`;
}

function gatekeeperList(candidatesByGatekeeper) {
  const names = Object.keys(candidatesByGatekeeper || {});
  const ordered = names.filter((name) => name !== UNCLASSIFIED && name !== UNKNOWN_GATEKEEPER)
    .sort((a, b) => a.localeCompare(b, "zh-Hant"));
  if (names.includes(UNKNOWN_GATEKEEPER)) ordered.push(UNKNOWN_GATEKEEPER);
  if (names.includes(UNCLASSIFIED) || !ordered.length) ordered.push(UNCLASSIFIED);
  return ordered;
}

function choicesFor(candidates) {
  const labels = (candidates || [])
    .filter((row) => row.status !== "ambiguous" || row.submissionId)
    .map((row) => encodeStudentChoice(row));
  return labels.length ? labels : [PLACEHOLDER_CHOICE];
}

/**
 * @param {{
 *   snapshot: ReturnType<typeof snapshotFormStructure>,
 *   candidatesByGatekeeper: Record<string, unknown[]>,
 *   lastGood?: { choices?: Record<string, string[]>, gatekeepers?: string[] },
 *   failed?: boolean,
 * }} input
 */
export function planRecruitmentFormSync(input) {
  const snapshot = input.snapshot || snapshotFormStructure({ items: [] });
  const failed = Boolean(input.failed);
  const lastGood = input.lastGood || {};
  const liveGroups = input.candidatesByGatekeeper || {};
  const gatekeepers = failed && lastGood.gatekeepers?.length
    ? lastGood.gatekeepers
    : gatekeeperList(liveGroups);
  const sections = gatekeepers.map((name) => {
    const live = choicesFor(liveGroups[name] || []);
    const previous = lastGood.choices?.[name];
    const choices = failed && previous?.length ? previous : live;
    return {
      title: sectionTitle(name),
      gatekeeper: name,
      question: FORM_QUESTION_TITLES.student,
      choices,
      usedLastKnownGood: Boolean(failed && previous?.length),
    };
  });
  const preserved = snapshot.items.filter((item) => item.preserved);
  const deletes = snapshot.items.filter((item) =>
    (item.title === FORM_QUESTION_TITLES.gameGatekeeper
      || item.title === FORM_QUESTION_TITLES.student
      || /｜待跟進$/.test(item.title))
    && !item.preserved);
  return {
    dryRun: true,
    wouldDeletePreserved: false,
    preservedCount: preserved.length,
    firstQuestion: FORM_QUESTION_TITLES.gameGatekeeper,
    gatekeeperChoices: gatekeepers,
    sections,
    navigation: gatekeepers.map((name) => ({ from: name, to: sectionTitle(name) })),
    staleItems: deletes.map((item) => ({ id: item.id, title: item.title })),
    applySafe: preserved.length > 0 || snapshot.items.length === 0,
  };
}

export function applyLastKnownGood(previous, next, failed) {
  if (!failed) return { ...next, source: "live" };
  if (!previous) return { ...next, source: "live-empty-fallback" };
  return { ...previous, source: "last-known-good" };
}

export function markSubmissionDuplicate(existingSubmissionIds, incomingSubmissionId) {
  const id = text(incomingSubmissionId).toLowerCase();
  if (!id) return { duplicate: false, reason: "missing-submission-id" };
  const exists = [...existingSubmissionIds].some((value) => text(value).toLowerCase() === id);
  return exists
    ? { duplicate: true, reason: "submission-already-recruited", submissionId: id }
    : { duplicate: false, reason: "new", submissionId: id };
}

export function helperColumnsFor(candidate, version = "1") {
  return {
    _gameSubmissionId: candidate?.latestAttempt?.submissionId || candidate?.submissionId || "",
    _gameGatekeeper: candidate?.gameGatekeeper || "",
    _gameCompletedAt: candidate?.completedAt || candidate?.latestAttempt?.completedAt || "",
    _syncVersion: version,
    _duplicate: false,
  };
}

export function validatePlanDoesNotTouchRecruitmentQuestions(plan, snapshot) {
  const preservedTitles = new Set(
    (snapshot?.items || []).filter((item) => item.preserved).map((item) => item.title),
  );
  const touching = (plan.staleItems || []).filter((item) => preservedTitles.has(item.title));
  return touching.length === 0;
}

export function parseSubmittedStudent(e) {
  const responses = e?.namedValues || e?.responses || {};
  const pick = (key) => {
    const value = responses[key];
    if (Array.isArray(value)) return text(value[0]);
    return text(value);
  };
  const pickIncludes = (fragment) => {
    const direct = pick(fragment);
    if (direct) return direct;
    for (const [key, value] of Object.entries(responses)) {
      if (String(key).includes(fragment)) {
        return Array.isArray(value) ? text(value[0]) : text(value);
      }
    }
    return "";
  };
  const student = pickIncludes(FORM_QUESTION_TITLES.student);
  const gatekeeper = pickIncludes(FORM_QUESTION_TITLES.gameGatekeeper)
    || pick("接引人(可複選)");
  const decoded = decodeStudentChoice(student);
  return {
    studentChoice: student,
    gameGatekeeper: normalizeGatekeeper(gatekeeper) || gatekeeper,
    ...decoded,
  };
}

export {
  FORM_QUESTION_TITLES as titles,
  PLACEHOLDER_CHOICE,
  UNCLASSIFIED,
  UNKNOWN_GATEKEEPER,
};
