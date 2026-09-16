import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FORMS_GLE_SHORT_URL,
  LIVE_PREFILL_ENTRIES,
  OFFICIAL_FORM_ID,
  OFFICIAL_VIEWFORM_URL,
  buildGameMetadataNote,
  generatePrefilledFormUrl,
  officialFormUrl,
  parseGameMetadataNote,
  prefillUsesViewform,
  resolveViewformUrl,
} from "./recruitment-prefill.mjs";

const candidate = {
  name: "王小明",
  phone: "0912345678",
  department: "歷史學系",
  grade: "大一",
  gameGatekeeper: "安倢",
  completedAt: "2026-09-14T06:32:00.000Z",
  submissionId: "11111111-1111-4111-8111-111111111111",
  latestAttempt: { submissionId: "11111111-1111-4111-8111-111111111111", completedAt: "2026-09-14T06:32:00.000Z" },
};

test("forms.gle and missing responder resolve to the published /viewform URL", () => {
  assert.equal(resolveViewformUrl(""), OFFICIAL_VIEWFORM_URL);
  assert.equal(resolveViewformUrl(FORMS_GLE_SHORT_URL), OFFICIAL_VIEWFORM_URL);
  assert.equal(
    resolveViewformUrl(`https://docs.google.com/forms/d/${OFFICIAL_FORM_ID}/edit`),
    OFFICIAL_VIEWFORM_URL,
  );
  assert.equal(resolveViewformUrl(`${OFFICIAL_VIEWFORM_URL}?usp=send_form`), OFFICIAL_VIEWFORM_URL);
});

test("prefill uses the full viewform URL and live entry IDs, never forms.gle", () => {
  const url = generatePrefilledFormUrl(candidate, {
    responderUrl: FORMS_GLE_SHORT_URL,
    recruiter: "柏能",
    recruitedAt: "2026-09-14T08:00:00+08:00",
  });
  assert.equal(url.startsWith(`${OFFICIAL_VIEWFORM_URL}?`), true);
  assert.equal(prefillUsesViewform(url), true);
  assert.doesNotMatch(url, /forms\.gle/);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("usp"), "pp_url");
  assert.equal(parsed.searchParams.get(LIVE_PREFILL_ENTRIES.name), "王小明");
  assert.equal(parsed.searchParams.get(LIVE_PREFILL_ENTRIES.phone), "0912345678");
  assert.equal(parsed.searchParams.get(LIVE_PREFILL_ENTRIES.departmentGrade), "歷史學系大一");
  assert.equal(parsed.searchParams.get(LIVE_PREFILL_ENTRIES.recruiter), "柏能");
  assert.equal(parsed.searchParams.get(`${LIVE_PREFILL_ENTRIES.recruitDate}_month`), "9");
  assert.equal(parsed.searchParams.get(`${LIVE_PREFILL_ENTRIES.recruitDate}_day`), "14");
  const note = parsed.searchParams.get(LIVE_PREFILL_ENTRIES.note) || "";
  const meta = parseGameMetadataNote(note);
  assert.equal(meta.gameGatekeeper, "安倢");
  assert.equal(meta.submissionId, candidate.submissionId);
  assert.match(meta.completedAt, /2026/);
  assert.match(note, /遊戲關主：安倢/);
});

test("official form URL uses the selected recruiter, never the game gatekeeper", () => {
  const url = officialFormUrl(candidate, "柏能");
  assert.equal(prefillUsesViewform(url), true);
  assert.doesNotMatch(url, /forms\.gle/);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get(LIVE_PREFILL_ENTRIES.recruiter), "柏能");
  assert.equal(parsed.searchParams.getAll(LIVE_PREFILL_ENTRIES.recruiter).includes("安倢"), false);
  const meta = parseGameMetadataNote(parsed.searchParams.get(LIVE_PREFILL_ENTRIES.note));
  assert.equal(meta.gameGatekeeper, "安倢");
  assert.equal(officialFormUrl({}, "柏能"), "");
});

test("custom recruiter uses Other; original game gatekeeper stays in notes", () => {
  const url = generatePrefilledFormUrl(candidate, { recruiter: "現場志工" });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get(LIVE_PREFILL_ENTRIES.recruiter), "__other_option__");
  assert.equal(
    parsed.searchParams.get(`${LIVE_PREFILL_ENTRIES.recruiter}.other_option_response`),
    "現場志工",
  );
  assert.equal(parseGameMetadataNote(parsed.searchParams.get(LIVE_PREFILL_ENTRIES.note)).gameGatekeeper, "安倢");
});

test("metadata note stays editable and extra notes append after the three game fields", () => {
  const note = buildGameMetadataNote(candidate, "喜歡茶會");
  assert.match(note, /喜歡茶會$/);
  assert.equal(parseGameMetadataNote(note).submissionId, candidate.submissionId);
});

test("unknown extra entry keys are ignored so invented IDs cannot ship", () => {
  const url = generatePrefilledFormUrl(candidate, {
    recruiter: "柏能",
    entries: { invented: "not-an-entry", name: "entry.887514514" },
  });
  assert.equal(new URL(url).searchParams.has("not-an-entry"), false);
  assert.equal(new URL(url).searchParams.has("invented"), false);
});
