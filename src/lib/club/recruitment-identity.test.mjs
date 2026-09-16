// @ts-nocheck -- Identity fixtures intentionally omit phones and mix formats.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clusterGamePeople,
  extractTaiwanMobile,
  identityFields,
  matchIncomingRecruitment,
  normalizeDepartment,
  normalizeGrade,
  normalizeName,
  normalizePhone,
  officialIdentityConflict,
  personIsRecruited,
  profileConsistent,
  sameOfficialIdentity,
  splitDepartmentGrade,
} from "./recruitment-identity.mjs";

test("name normalization is NFKC without fuzzy merge", () => {
  assert.equal(normalizeName(" Ａｌｅｘ "), "alex");
  assert.equal(normalizeName("王 小明"), "王小明");
  assert.notEqual(normalizeName("王小明"), normalizeName("王小朋"));
});

test("phones match across punctuation and reject line nicknames", () => {
  assert.equal(normalizePhone("0912-345-678").normalizedPhone, "0912345678");
  assert.equal(normalizePhone("0912345678").normalizedPhone, "0912345678");
  assert.equal(extractTaiwanMobile("+886912345678"), "0912345678");
  assert.equal(extractTaiwanMobile(968111172), "0968111172");
  assert.equal(normalizePhone("小哲Line").normalizedPhone, null);
  assert.equal(normalizePhone("柏能").normalizedPhone, null);
  assert.equal(normalizePhone("0925070（2）966").normalizedPhone, null);
});

test("department and grade split 系級 without inventing matches", () => {
  assert.deepEqual(splitDepartmentGrade("物理大三"), { department: "物理", grade: "大三" });
  assert.equal(normalizeGrade("化學3"), "大三");
  assert.equal(normalizeDepartment("航太2A"), "航太");
  assert.equal(normalizeGrade("航太2A"), "大二");
});

test("same student playing twice is one person; same name different phones stay apart", () => {
  const twice = clusterGamePeople([
    { name: "王小明", phone: "0912-345-678", department: "歷史學系", grade: "大一", submissionId: "a" },
    { name: "王小明", phone: "0912345678", department: "歷史學系", grade: "大一", submissionId: "b" },
  ]);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].attempts.length, 2);
  assert.equal(twice[0].personKey, "phone:0912345678");

  const sameName = clusterGamePeople([
    { name: "林同學", phone: "0911111111", department: "歷史學系", grade: "大一", submissionId: "c" },
    { name: "林同學", phone: "0922222222", department: "歷史學系", grade: "大一", submissionId: "d" },
  ]);
  assert.equal(sameName.length, 2);
  assert.equal(sameName.every((person) => person.personKey.startsWith("phone:")), true);
});

test("same name same department different phones stay two people", () => {
  const people = clusterGamePeople([
    { name: "林同學", phone: "0911111111", department: "歷史學系", grade: "大一", submissionId: "h" },
    { name: "林同學", phone: "0922222222", department: "歷史學系", grade: "大一", submissionId: "i" },
  ]);
  assert.equal(people.length, 2);
  assert.equal(people.every((person) => person.personKey.startsWith("phone:")), true);
});

test("unique name without phone matches; ambiguous same-name without phones does not merge", () => {
  const unique = clusterGamePeople([
    { name: "唯一", department: "歷史學系", grade: "大一", submissionId: "e" },
  ]);
  assert.equal(unique[0].reason, "unique-name");
  const ambiguous = clusterGamePeople([
    { name: "同名", department: "歷史學系", grade: "大一", phone: "", submissionId: "f" },
    { name: "同名", department: "會計學系", grade: "大二", phone: "", submissionId: "g" },
  ]);
  assert.equal(ambiguous.length, 2);
  assert.equal(ambiguous.every((person) => person.status === "ambiguous"), true);
});

test("recruited people drop out of candidates; unknown gatekeeper is kept", () => {
  const people = clusterGamePeople([
    { name: "甲", phone: "0911111111", gatekeeper: "柏能", submissionId: "sid-a" },
    { name: "乙", phone: "0922222222", gatekeeper: "神秘關主", submissionId: "sid-b" },
  ]);
  const recruits = [
    { submissionId: "sid-a", normalizedPhone: "0911111111", normalizedName: "甲", duplicate: false },
  ];
  assert.equal(personIsRecruited(people[0], recruits), true);
  assert.equal(personIsRecruited(people[1], recruits), false);
  const incoming = matchIncomingRecruitment({ submissionId: "sid-a", ...identityFields({ name: "甲", phone: "0911111111" }) }, people);
  assert.equal(incoming.reason, "_gameSubmissionId");
  assert.equal(profileConsistent({ department: "歷史學系", grade: "大一" }, { department: "歷史學系" }), true);
});

test("same phone different names is not recruited and is a conflict", () => {
  const people = clusterGamePeople([
    { name: "唐同學", phone: "0917777174", gatekeeper: "安倢", submissionId: "sid-tang" },
  ]);
  const chenForm = { normalizedPhone: "0917777174", normalizedName: "陳同學甲乙丙", duplicate: false };
  assert.equal(sameOfficialIdentity(people[0], chenForm), false);
  assert.equal(officialIdentityConflict(people[0], chenForm), true);
  assert.equal(personIsRecruited(people[0], [chenForm]), false);
  const incoming = matchIncomingRecruitment({
    ...identityFields({ name: "陳同學甲乙丙", phone: "0917777174" }),
  }, people);
  assert.equal(incoming.person, null);
  assert.equal(incoming.reason, "phone-name-conflict");
});

test("same name and phone still matches without submissionId", () => {
  const people = clusterGamePeople([
    { name: "電話去重", phone: "0910000009", gatekeeper: "柏能", submissionId: "sid-phone" },
  ]);
  const form = { normalizedPhone: "0910000009", normalizedName: "電話去重", duplicate: false };
  assert.equal(sameOfficialIdentity(people[0], form), true);
  assert.equal(personIsRecruited(people[0], [form]), true);
  const incoming = matchIncomingRecruitment(identityFields({ name: "電話去重", phone: "0910-000-009" }), people);
  assert.equal(incoming.reason, "name-and-phone");
  assert.equal(incoming.person.personKey, people[0].personKey);
});
