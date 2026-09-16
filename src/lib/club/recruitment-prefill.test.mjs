import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FORMS_GLE_SHORT_URL,
  LIVE_PREFILL_ENTRIES,
  OFFICIAL_FORM_EDIT_URL,
  OFFICIAL_FORM_ID,
  OFFICIAL_VIEWFORM_URL,
  buildGameMetadataNote,
  generatePrefilledFormUrl,
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

test("staff 查看招生表單後台 uses the live form /edit URL, not viewform or a new form", () => {
  assert.equal(OFFICIAL_FORM_EDIT_URL, `https://docs.google.com/forms/d/${OFFICIAL_FORM_ID}/edit`);
  assert.equal(OFFICIAL_FORM_ID, "12fk5ubMY0fnCSSTEljFJ1l-gcao1hDMkw7F8I8qTlOw");
  assert.doesNotMatch(OFFICIAL_FORM_EDIT_URL, /viewform/);
  assert.doesNotMatch(OFFICIAL_FORM_EDIT_URL, /forms\.gle/);
});

test("forms.gle and missing responder resolve to the published /viewform URL", () => {
  assert.equal(resolveViewformUrl(""), OFFICIAL_VIEWFORM_URL);
  assert.equal(resolveViewformUrl(FORMS_GLE_SHORT_URL), OFFICIAL_VIEWFORM_URL);
  assert.equal(
    resolveViewformUrl(`https://docs.google.com/forms/d/${OFFICIAL_FORM_ID}/edit`),
    OFFICIAL_VIEWFORM_URL,
  );
  assert.equal(resolveViewformUrl(`${OFFICIAL_VIEWFORM_URL}?usp=send_form`), OFFICIAL_VIEWFORM_URL);
  assert.equal(OFFICIAL_FORM_EDIT_URL, `https://docs.google.com/forms/d/${OFFICIAL_FORM_ID}/edit`);
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
  assert.equal(meta.submissionId, "");
  assert.match(meta.completedAt, /2026/);
  assert.match(note, /遊戲關主：安倢/);
  assert.doesNotMatch(note, /submissionId/i);
  assert.equal(note.includes(candidate.submissionId), false);
  assert.doesNotMatch(url, /submissionId/i);
  assert.equal(decodeURIComponent(url).includes(candidate.submissionId), false);
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

test("metadata note stays editable and extra notes append after game fields", () => {
  const note = buildGameMetadataNote(candidate, "喜歡茶會");
  assert.match(note, /喜歡茶會$/);
  assert.equal(parseGameMetadataNote(note).submissionId, "");
  assert.doesNotMatch(note, /submissionId/i);
  assert.equal(note.includes(candidate.submissionId), false);
});

test("viewform prefill URL and 備註 never include submissionId or the raw id", () => {
  const url = generatePrefilledFormUrl(candidate, {
    recruiter: "柏能",
    extraNotes: `興趣茶會\nsubmissionId：${candidate.submissionId}`,
    entries: { submissionId: "entry.999999999" },
  });
  const decoded = decodeURIComponent(url);
  const note = new URL(url).searchParams.get(LIVE_PREFILL_ENTRIES.note) || "";
  assert.doesNotMatch(url, /submissionId/i);
  assert.doesNotMatch(decoded, /submissionId/i);
  assert.equal(decoded.includes(candidate.submissionId), false);
  assert.doesNotMatch(note, /submissionId/i);
  assert.equal(note.includes(candidate.submissionId), false);
  assert.match(note, /遊戲完成/);
  assert.match(note, /遊戲關主：安倢/);
  assert.match(note, /興趣茶會/);
  assert.equal(new URL(url).searchParams.get("entry.999999999"), null);
  assert.equal(parseGameMetadataNote(note).submissionId, "");
});

test("extra notes #s: uuid is stripped from partner-visible 備註", () => {
  const url = generatePrefilledFormUrl(candidate, {
    recruiter: "柏能",
    extraNotes: `興趣茶會|#s:${candidate.submissionId}`,
  });
  const note = new URL(url).searchParams.get(LIVE_PREFILL_ENTRIES.note) || "";
  assert.doesNotMatch(note, /#s:/i);
  assert.equal(note.includes(candidate.submissionId), false);
  assert.match(note, /興趣茶會/);
});

test("unknown extra entry keys are ignored so invented IDs cannot ship", () => {
  const url = generatePrefilledFormUrl(candidate, {
    recruiter: "柏能",
    entries: { invented: "not-an-entry", name: "entry.887514514" },
  });
  assert.equal(new URL(url).searchParams.has("not-an-entry"), false);
  assert.equal(new URL(url).searchParams.has("invented"), false);
});

test("prefill never fills 分級 / S/A/B even when candidate.tier is set", () => {
  const url = generatePrefilledFormUrl(
    { ...candidate, tier: "S(已報名)" },
    { recruiter: "柏能", tier: "A(有興趣再考慮)", entries: { tier: "entry.1322037614" } },
  );
  const parsed = new URL(url);
  const decoded = decodeURIComponent(url);
  assert.equal(Object.hasOwn(LIVE_PREFILL_ENTRIES, "tier"), false);
  assert.equal(parsed.searchParams.get("entry.1322037614"), null);
  assert.doesNotMatch(decoded, /S\(已報名\)/);
  assert.doesNotMatch(decoded, /A\(有興趣再考慮\)/);
  assert.doesNotMatch(decoded, /B\(還好沒興趣\)/);
  assert.doesNotMatch(decoded, /分級/);
});

test("client prefill source does not embed the live 分級 entry id", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./recruitment-prefill.mjs", import.meta.url), "utf8");
  assert.equal(src.includes("1322037614"), false);
  assert.equal(src.includes("LIVE_TIER_CHOICES"), false);
});

test("pending and more surfaces mount official form + backoffice shortcuts", async () => {
  const { readFileSync } = await import("node:fs");
  const pending = readFileSync(new URL("../../components/club/recruitment-dashboard.tsx", import.meta.url), "utf8");
  const more = readFileSync(new URL("../../components/club/admin-shell.tsx", import.meta.url), "utf8");
  const forms = readFileSync(new URL("../../routes/admin.tsx", import.meta.url), "utf8");
  const shortcuts = readFileSync(new URL("../../components/club/official-form-shortcuts.tsx", import.meta.url), "utf8");
  assert.match(shortcuts, /OFFICIAL_VIEWFORM_URL/);
  assert.match(shortcuts, /OFFICIAL_FORM_EDIT_URL/);
  assert.match(shortcuts, /data-official-form="open-form"/);
  assert.match(shortcuts, /data-official-form="open-backoffice"/);
  assert.doesNotMatch(shortcuts, /1322037614|#s:|submissionId/);
  assert.match(pending, /<OfficialFormShortcuts/);
  assert.match(more, /<OfficialFormShortcuts/);
  assert.match(forms, /<OfficialFormShortcuts/);
});
