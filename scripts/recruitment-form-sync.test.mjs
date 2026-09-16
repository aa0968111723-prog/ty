import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const script = readFileSync(new URL("../google-apps-script/recruitment-form-sync/Code.gs", import.meta.url), "utf8");

test("Apps Script source exposes required handlers without service-account JSON", () => {
  assert.match(script, /function syncRecruitmentCandidates\(/);
  assert.match(script, /function onRecruitmentFormSubmit\(/);
  assert.match(script, /function installRecruitmentTriggers\(/);
  assert.match(script, /function validateRecruitmentFormStructure\(/);
  assert.match(script, /function rebuildGatekeeperSections\(/);
  assert.match(script, /function buildPrefilledFormUrl\(/);
  assert.match(script, /\/viewform/);
  assert.doesNotMatch(script, /forms\.gle/);
  assert.match(script, /entry\.887514514/);
  assert.match(script, /_gameCompletedAt/);
  assert.match(script, /recruitParseMetadata_/);
  assert.doesNotMatch(script, /private_key/);
  assert.doesNotMatch(script, /BEGIN PRIVATE KEY/);
  assert.match(script, /PropertiesService/);
  assert.match(script, /DRY_RUN/);
  assert.match(script, /LAST_GOOD_CHOICES/);
  assert.match(script, /_duplicate/);
  assert.match(script, /everyMinutes\(5\)/);
  assert.match(script, /recruitStudentTitle_/);
  assert.match(script, /招生資料/);
  assert.match(script, /recruitSilentSubmissionId_/);
  assert.match(script, /recruitVisiblePersonKey_/);
  assert.doesNotMatch(script, /\|#s:" \+ /);
  assert.doesNotMatch(script, /\|#s:"\s*\+/);
  assert.match(script, /#s:\(\[0-9a-f-\]\*\)/);
  assert.match(script, /\|#p:" \+ personKey/);
});
