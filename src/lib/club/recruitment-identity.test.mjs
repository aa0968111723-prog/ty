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
  personIsRecruited,
  profileConsistent,
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

test("same phone different names stay two people; same student twice stays one", () => {
  const conflict = clusterGamePeople([
    { name: "王小明", phone: "0911111111", department: "歷史學系", grade: "大一", submissionId: "j" },
    { name: "李小華", phone: "0911111111", department: "會計學系", grade: "大二", submissionId: "k" },
  ]);
  assert.equal(conflict.length, 2);
  assert.deepEqual(
    [...new Set(conflict.map((person) => person.normalizedName))].sort(),
    ["李小華", "王小明"],
  );
  assert.ok(conflict.every((person) => person.personKey.startsWith("phone:0911111111|name:")));
  assert.ok(conflict.every((person) => person.normalizedPhone === "0911111111"));

  const twice = clusterGamePeople([
    { name: "王小明", phone: "0911111111", submissionId: "m" },
    { name: "王小明", phone: "0911-111-111", submissionId: "n" },
  ]);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].personKey, "phone:0911111111");
  assert.equal(twice[0].attempts.length, 2);
});

test("shared phone does not mark the other name recruited or silently match the form", () => {
  const people = clusterGamePeople([
    { name: "王小明", phone: "0911111111", submissionId: "sid-w" },
    { name: "李小華", phone: "0911111111", submissionId: "sid-l" },
  ]);
  const recruits = [
    { submissionId: "form-w", normalizedPhone: "0911111111", normalizedName: "王小明", duplicate: false },
  ];
  const wang = people.find((person) => person.normalizedName === "王小明");
  const li = people.find((person) => person.normalizedName === "李小華");
  assert.equal(personIsRecruited(wang, recruits), true);
  assert.equal(personIsRecruited(li, recruits), false);
  const named = matchIncomingRecruitment({
    submissionId: "",
    ...identityFields({ name: "王小明", phone: "0911111111" }),
  }, people);
  assert.equal(named.person?.normalizedName, "王小明");
  assert.equal(named.reason, "normalizedPhone");
  const ambiguous = matchIncomingRecruitment({
    submissionId: "",
    ...identityFields({ name: "", phone: "0911111111" }),
  }, people);
  assert.equal(ambiguous.reason, "ambiguous-phone");
  assert.equal(ambiguous.person, null);
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
