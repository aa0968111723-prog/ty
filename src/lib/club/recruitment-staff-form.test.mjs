import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_RECRUITMENT_RESPONSE_HEADERS,
  RECRUITMENT_HELPER_HEADERS,
  cellsForRecruitmentResponse,
  ensureRecruitmentResponseHeaders,
  normalizeStaffRecruitmentPayload,
  recruitmentResponseDuplicate,
  staffRecruitmentRecord,
} from "./recruitment-staff-form.mjs";
import { LIVE_NOTE_TITLE, LIVE_PREFILL_ENTRIES, generatePrefilledFormUrl } from "./recruitment-prefill.mjs";

const payloadBody = {
  recruiter: "柏能",
  recruitedAt: "2026-09-14",
  name: "王小明",
  phone: "0912345678",
  department: "歷史學系",
  grade: "大一",
  gameGatekeeper: "安倢",
  completedAt: "2026-09-14T06:32:00.000Z",
  submissionId: "11111111-1111-4111-8111-111111111111",
  extraNotes: "喜歡茶會",
  tier: "S(已報名)",
  activities: ["9/30茶會", "社課"],
  joined: "是",
  depositPaid: "是",
  depositAmount: "300",
  birthday: "2007-08-01",
  studentId: "A123",
  interest: "跑步",
  interestTopics: ["專注力", "靜定力"],
};

test("staff payload keeps game gatekeeper separate from official recruiter", () => {
  const parsed = normalizeStaffRecruitmentPayload(payloadBody, { now: new Date("2026-09-14T08:00:00+08:00") });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.recruiter, "柏能");
  assert.equal(parsed.payload.gameGatekeeper, "安倢");
  const record = staffRecruitmentRecord(parsed.payload);
  assert.equal(record.recruiter, "柏能");
  assert.equal(record.gameGatekeeper, "安倢");
  assert.match(record.note, /遊戲關主：安倢/);
  assert.doesNotMatch(record.note, /submissionId/i);
  assert.doesNotMatch(record.note.split("遊戲關主：")[1], /^柏能/);
  assert.equal(record.activity, "9/30茶會, 社課");
  assert.equal(record.tier, "S(已報名)");
  assert.equal(record.joined, "是");
  assert.equal(record.depositPaid, "是");
  assert.equal(record.depositAmount, "300");
  assert.equal(record.gameSubmissionId, payloadBody.submissionId);
  assert.equal(record.recruitDate, "9/14");
});

test("invented choices and missing recruiter/name are rejected", () => {
  const parsed = normalizeStaffRecruitmentPayload({
    ...payloadBody,
    recruiter: "",
    name: "",
    tier: "invented-S",
    activities: ["invented"],
  });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.payload.tier, "");
  assert.deepEqual(parsed.payload.activities, []);
});

test("headers keep A:Q columns and only append helpers at the end", () => {
  const existing = ["時間戳記", "同學的姓名", "同學電話/LINE", "即時統計"];
  const next = ensureRecruitmentResponseHeaders(existing);
  assert.deepEqual(next.slice(0, 4), existing);
  assert.deepEqual(next.slice(4), [...RECRUITMENT_HELPER_HEADERS]);
  assert.equal(next.includes("總表"), false);
  const empty = ensureRecruitmentResponseHeaders([]);
  assert.equal(empty[0], "時間戳記");
  assert.equal(empty.at(-1), "_duplicate");
  assert.ok(empty.includes(LIVE_NOTE_TITLE));
  assert.ok(DEFAULT_RECRUITMENT_RESPONSE_HEADERS.every((header) => empty.includes(header)));
});

test("row cells follow live form titles including technical columns at the end", () => {
  const headers = ensureRecruitmentResponseHeaders([]);
  const parsed = normalizeStaffRecruitmentPayload(payloadBody, { now: new Date("2026-09-14T08:00:00+08:00") });
  const cells = cellsForRecruitmentResponse(headers, staffRecruitmentRecord(parsed.payload));
  const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  assert.equal(row["同學的姓名"], "王小明");
  assert.equal(row["接引人(可複選)"], "柏能");
  assert.equal(row["這位同學是屬於那個分級呢:-)"], "S(已報名)");
  assert.equal(row["報名了那個活動"], "9/30茶會, 社課");
  assert.equal(row["是否入社"], "是");
  assert.equal(row["保證金是否繳費"], "是");
  assert.equal(row["繳了多少呢?"], "300");
  assert.equal(row["對甚麼有興趣"], "專注力, 靜定力");
  assert.equal(row._gameSubmissionId, payloadBody.submissionId);
  assert.equal(row._gameGatekeeper, "安倢");
  assert.equal(headers.slice(-5).join(), RECRUITMENT_HELPER_HEADERS.join());
});

test("dedupe uses submissionId or phone, same as form submit", () => {
  const byId = recruitmentResponseDuplicate([{ _gameSubmissionId: payloadBody.submissionId }], payloadBody);
  assert.equal(byId.duplicate, true);
  const byPhone = recruitmentResponseDuplicate([{ "同學電話/LINE": "0912-345-678" }], {
    submissionId: "new-id",
    phone: "0912345678",
  });
  assert.equal(byPhone.duplicate, true);
  assert.equal(recruitmentResponseDuplicate([], payloadBody).duplicate, false);
});

test("Google Form secondary prefill still uses /viewform and carries in-app answers", () => {
  const url = generatePrefilledFormUrl(payloadBody, {
    recruiter: "柏能",
    extraNotes: "喜歡茶會",
    recruitedAt: "2026-09-14",
    tier: "S(已報名)",
    activities: ["9/30茶會"],
    joined: "是",
    depositPaid: "是",
    depositAmount: "300",
  });
  assert.match(url, /\/viewform\?/);
  assert.doesNotMatch(url, /forms\.gle/);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get(LIVE_PREFILL_ENTRIES.tier), "S(已報名)");
  assert.equal(parsed.searchParams.get(LIVE_PREFILL_ENTRIES.activity), "9/30茶會");
  assert.equal(parsed.searchParams.get(LIVE_PREFILL_ENTRIES.joined), "是");
  assert.equal(parsed.searchParams.get(LIVE_PREFILL_ENTRIES.recruiter), "柏能");
});
