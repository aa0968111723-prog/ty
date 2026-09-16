// @ts-nocheck -- Contract tests assemble incomplete sheet rows and form payloads.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPrefilledFormUrl,
  buildRecruitmentDashboard,
  decodeStudentChoice,
  encodeStudentChoice,
  parseGameAttempts,
  parseMasterRows,
  parseRecruitmentResponses,
  dateInTaipei,
  toPartnerRecruitmentDashboard,
} from "./recruitment.mjs";
import {
  applyLastKnownGood,
  markSubmissionDuplicate,
  parsePrefillMetadata,
  parseSubmittedStudent,
  planRecruitmentFormSync,
  snapshotFormStructure,
  validatePlanDoesNotTouchRecruitmentQuestions,
} from "./recruitment-form-sync.mjs";

const game = (overrides = {}) => ({
  姓名: "王小明",
  電話: "0912345678",
  科系: "歷史學系",
  年級: "大一",
  遊戲關主: "柏能",
  分數: 600,
  答對: 5,
  答錯: 0,
  正確率: 100,
  最佳連續: 5,
  遊戲秒數: 60,
  遊戲時間: "2026-09-14T06:32:00.000Z",
  _submissionId: crypto.randomUUID(),
  _kind: "official",
  _skipSave: false,
  ...overrides,
});

test("two plays by one student become one pending candidate under the game gatekeeper", () => {
  const first = game({ _submissionId: "11111111-1111-4111-8111-111111111111" });
  const second = game({
    _submissionId: "22222222-2222-4222-8222-222222222222",
    遊戲時間: "2026-09-14T07:00:00.000Z",
    分數: 800,
  });
  const other = game({
    姓名: "李小華",
    電話: "0987654321",
    遊戲關主: "安倢",
    _submissionId: "33333333-3333-4333-8333-333333333333",
  });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T08:00:00+08:00"),
    gameRows: [first, second, other],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.pending.length, 2);
  const peng = data.pending.find((row) => row.name === "王小明");
  assert.equal(peng.attemptCount, 2);
  assert.equal(peng.gameGatekeeper, "柏能");
  assert.equal(data.candidatesByGatekeeper["柏能"].length, 1);
  assert.equal(data.candidatesByGatekeeper["安倢"].length, 1);
  const decoded = decodeStudentChoice(peng.choiceLabel);
  assert.match(peng.choiceLabel, /王小明/);
  assert.equal(decoded.personKey, peng.personKey);
  assert.equal(decoded.submissionId, "");
  assert.doesNotMatch(peng.choiceLabel, /#s:/i);
  assert.doesNotMatch(peng.choiceLabel, /submissionId/i);
  assert.equal(peng.choiceLabel.includes(second._submissionId), false);
  assert.equal(peng.choiceLabel.includes(first._submissionId), false);
});

test("name or phone collisions stay separate or flagged, never a silent merge", () => {
  const linA = game({ 姓名: "林同學", 電話: "0911111111", _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11" });
  const linB = game({ 姓名: "林同學", 電話: "0922222222", _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12" });
  const mixed = game({
    姓名: "王小明",
    電話: "0933333333",
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13",
  });
  const mixedOther = game({
    姓名: "李小華",
    電話: "0933333333",
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14",
  });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T08:00:00+08:00"),
    gameRows: [linA, linB, mixed, mixedOther],
    recruitmentRows: [],
    masterRows: [],
  });
  const lins = data.pending.filter((row) => row.name === "林同學");
  assert.equal(lins.length, 2);
  assert.equal(lins.every((row) => row.status === "ambiguous"), true);
  assert.notEqual(lins[0].phone, lins[1].phone);
  const phoneShare = data.pending.filter((row) => row.normalizedPhone === "0933333333");
  assert.equal(phoneShare.length, 1);
  assert.equal(phoneShare[0].status, "ambiguous");
  assert.equal(data.summary.conflicts >= 3, true);
  assert.equal(data.pending.some((row) => row.status !== "ambiguous"), false);
});

test("filled recruitment form removes the candidate and keeps another student", () => {
  const a1 = game({ 姓名: "A1", 電話: "0910000001", _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  const a2 = game({ 姓名: "A2", 電話: "0910000002", _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [a1, a2],
    recruitmentRows: [{
      時間戳記: "2026/9/14 下午 3:00:00",
      同學的姓名: "A1",
      "同學電話/LINE": "0910000001",
      _gameSubmissionId: a1._submissionId,
    }],
    masterRows: [],
  });
  assert.deepEqual(data.pending.map((row) => row.name), ["A2"]);
});

test("unknown and missing gatekeepers are not dropped", () => {
  const custom = game({ 遊戲關主: "現場志工", 電話: "0910000003", _submissionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
  const none = game({ 遊戲關主: "", 姓名: "未選關主", 電話: "0910000004", _submissionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [custom, none],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.pending.length, 2);
  assert.ok(data.gameGatekeepers.some((row) => row.name === "現場志工"));
  assert.ok(data.gameGatekeepers.some((row) => row.name === "未分類"));
});

test("master rows keep 總表 schema and parse 系級-derived fields", () => {
  const rows = parseMasterRows([{
    接引日期: "9/14",
    "接引人(可複選)": "柏能",
    同學的姓名: "王小明",
    科系: "物理",
    年級: "大三",
    分級: "S(已報名)",
    報名了那個活動: "9/30茶會",
    是否入社: "否",
    保證金是否繳費: "是",
    繳了多少: "100",
    "同學電話/LINE": "0912345678",
    即時統計: "總留資料人數",
  }]);
  assert.equal(rows[0].department, "物理");
  assert.equal(rows[0].grade, "大三");
  assert.match(rows[0].tier, /^S/);
  const responses = parseRecruitmentResponses([{
    時間戳記: "2026/9/14 10:00:00",
    同學的姓名: "王小明",
    系級: "物理大三",
    "同學電話/LINE": "0912345678",
    "這位同學是屬於那個分級呢:-)": "S(已報名)",
    是否入社: "否",
    保證金是否繳費: "是",
    "繳了多少呢?": "100",
  }]);
  assert.equal(responses[0].department, "物理");
  assert.equal(responses[0].grade, "大三");
});

test("prefill URL uses /viewform even when a forms.gle short link is configured", () => {
  const url = buildPrefilledFormUrl({
    name: "王小明",
    phone: "0912345678",
    department: "歷史學系",
    grade: "大一",
    gameGatekeeper: "安倢",
    latestAttempt: { submissionId: "x", completedAt: "2026-09-14T06:32:00.000Z" },
    personKey: "phone:0912345678",
    submissionId: "x",
    completedAt: "2026-09-14T06:32:00.000Z",
  }, { responderUrl: "https://forms.gle/CBmNvkcvSQMzvh9X7", recruiter: "柏能" });
  assert.match(url, /\/viewform\?/);
  assert.doesNotMatch(url, /forms\.gle/);
  assert.match(url, /entry\.887514514=/);
  assert.match(url, /entry\.1318284482=.*%E6%9F%8F%E8%83%BD|entry\.1318284482=%E6%9F%8F%E8%83%BD/);
  const note = decodeURIComponent(url);
  assert.match(note, /遊戲關主：安倢/);
  assert.doesNotMatch(note.split("遊戲關主：")[1], /^柏能/);
});

test("form plan never deletes preserved recruitment questions and keeps last-known-good on failure", () => {
  const snapshot = snapshotFormStructure({
    items: [
      { title: "接引人(可複選)", type: "CHECKBOX" },
      { title: "同學的姓名", type: "TEXT" },
      { title: "這位同學是屬於那個分級呢:-)", type: "CHOICE" },
    ],
  });
  const plan = planRecruitmentFormSync({
    snapshot,
    candidatesByGatekeeper: {
      柏能: [{ name: "A1", phone: "0910000001", department: "歷史學系", grade: "大一", personKey: "phone:0910000001", latestAttempt: { submissionId: "sid-a", completedAt: "2026-09-14T01:00:00.000Z" } }],
      安倢: [{ name: "B1", phone: "0910000002", department: "會計學系", grade: "大一", personKey: "phone:0910000002", latestAttempt: { submissionId: "sid-b", completedAt: "2026-09-14T01:00:00.000Z" } }],
    },
  });
  assert.equal(plan.firstQuestion, "本次遊戲關主");
  assert.ok(plan.gatekeeperChoices.includes("柏能"));
  const planned = plan.sections.flatMap((section) => section.choices).join("\n");
  assert.match(planned, /#p:phone:0910000001/);
  assert.match(planned, /#p:phone:0910000002/);
  assert.doesNotMatch(planned, /#s:/i);
  assert.doesNotMatch(planned, /sid-a|sid-b/);
  assert.equal(validatePlanDoesNotTouchRecruitmentQuestions(plan, snapshot), true);
  const failed = planRecruitmentFormSync({
    snapshot,
    failed: true,
    lastGood: { gatekeepers: ["柏能"], choices: { 柏能: ["kept"] } },
    candidatesByGatekeeper: {},
  });
  assert.equal(failed.sections[0].choices[0], "kept");
  assert.equal(applyLastKnownGood({ choices: ["old"] }, { choices: [] }, true).source, "last-known-good");
});

test("same submission processed twice is duplicate and does not create a second student", () => {
  const first = markSubmissionDuplicate(["sid-a"], "sid-a");
  const second = markSubmissionDuplicate([], "sid-b");
  assert.equal(first.duplicate, true);
  assert.equal(second.duplicate, false);
  const parsed = parseSubmittedStudent({
    namedValues: {
      本次遊戲關主: "柏能",
      選擇學生: "王小明｜歷史學系大一｜0912345678｜14:32|#p:phone:0912345678|#s:sid-a",
    },
  });
  assert.equal(parsed.submissionId, "sid-a");
  assert.equal(parsed.personKey, "phone:0912345678");
  const mixed = parseSubmittedStudent({
    namedValues: {
      "接引人(可複選)": "柏能",
      備註: "遊戲完成：2026/09/14 14:32\n遊戲關主：安倢\nsubmissionId：aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  });
  assert.equal(mixed.officialRecruiter, "柏能");
  assert.equal(mixed.gameGatekeeper, "安倢");
  assert.equal(mixed.submissionId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(parsePrefillMetadata(mixed.notes).gameGatekeeper, "安倢");
  const sectioned = parseSubmittedStudent({
    namedValues: {
      本次遊戲關主: ["柏能"],
      "柏能｜待跟進｜選擇學生": ["王小明｜歷史學系大一｜0912345678｜14:32|#p:phone:0912345678|#s:sid-a"],
    },
  });
  assert.equal(sectioned.submissionId, "sid-a");
  assert.equal(sectioned.gameGatekeeper, "柏能");
  const withoutSid = parseSubmittedStudent({
    namedValues: {
      本次遊戲關主: "柏能",
      選擇學生: "王小明｜歷史學系大一｜0912345678｜14:32|#p:phone:0912345678",
    },
  });
  assert.equal(withoutSid.personKey, "phone:0912345678");
  assert.equal(withoutSid.submissionId, "");
});

test("name and phone match removes candidate even without submissionId on the form row", () => {
  const player = game({
    姓名: "電話去重",
    電話: "0910000009",
    _submissionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01",
  });
  const other = game({
    姓名: "仍待跟進",
    電話: "0910000010",
    _submissionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02",
  });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [player, other],
    recruitmentRows: [{
      同學的姓名: "電話去重",
      "同學電話/LINE": "0910-000-009",
    }],
    masterRows: [],
  });
  assert.deepEqual(data.pending.map((row) => row.name), ["仍待跟進"]);
  assert.equal(data.summary.pending, 1);
  assert.equal(data.summary.pending, data.pending.length);
});

test("same-phone different-name form does not drop the pending student", () => {
  const tang = game({
    姓名: "唐同學",
    電話: "0917777174",
    遊戲關主: "安倢",
    分數: 3600,
    _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [tang],
    recruitmentRows: [{
      時間戳記: "2026/9/14 下午 4:00:00",
      同學的姓名: "陳同學甲乙丙",
      "同學電話/LINE": "0917777174",
      "接引人(可複選)": "柏能",
      是否入社: "否",
      保證金是否繳費: "是",
    }],
    masterRows: [],
  });
  assert.equal(data.summary.pending, 1);
  assert.equal(data.pending.length, 1);
  assert.equal(data.summary.pending, data.pending.length);
  assert.equal(data.pending[0].name, "唐同學");
  assert.equal(data.pending[0].needsReview, true);
  assert.equal(data.pending[0].gameGatekeeper, "安倢");
  assert.equal(data.pending[0].score, undefined);
  const partner = toPartnerRecruitmentDashboard(data);
  assert.equal(partner.pending.length, 1);
  assert.equal(partner.pending[0].name, "唐同學");
  assert.equal(partner.pending[0].needsReview, true);
  assert.equal(partner.pending[0].score, undefined);
  assert.equal(partner.pending[0].tier, undefined);
  assert.equal(data.gameGatekeepers.find((row) => row.name === "安倢")?.pending, 1);
  assert.equal(data.gameGatekeepers.find((row) => row.name === "安倢")?.recruited, 0);
});

test("form 備註 without submissionId still drops pending via name+phone", () => {
  const player = game({
    姓名: "備註無id",
    電話: "0910000011",
    _submissionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03",
  });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [player],
    recruitmentRows: [{
      同學的姓名: "備註無id",
      "同學電話/LINE": "0910000011",
      備註: "遊戲完成：2026/09/14 14:32\n遊戲關主：安倢\n喜歡茶會",
    }],
    masterRows: [],
  });
  assert.equal(data.pending.length, 0);
  assert.equal(data.profiles.some((row) => row.name === "備註無id" && row.pending), false);
});

test("practice-like rows are ignored by game attempt parser", () => {
  const rows = parseGameAttempts([
    game({ _kind: "practice", _skipSave: true }),
    game({ _submissionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }),
  ]);
  assert.equal(rows.length, 1);
});

test("missing activity and deposit fields are 資料不足 instead of zero", () => {
  const player = game({ _submissionId: "ffffffff-ffff-4fff-8fff-ffffffffffff" });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [player],
    recruitmentRows: [{
      時間戳記: "2026/9/14 10:00:00",
      同學的姓名: "王小明",
      "同學電話/LINE": "0912345678",
      _gameSubmissionId: player._submissionId,
    }],
    masterRows: [],
  });
  assert.equal(data.summary.activity, null);
  assert.equal(data.summary.depositPaid, null);
  assert.equal(data.funnel.some((layer) => layer.id === "s" || String(layer.label).includes("分級")), false);
  assert.equal(data.funnel.find((layer) => layer.id === "played")?.count, 1);
  assert.equal(data.funnel.find((layer) => layer.id === "activity")?.missing, true);
  assert.equal(data.funnel.find((layer) => layer.id === "joined")?.missing, true);
  assert.equal(data.funnel.find((layer) => layer.id === "deposit")?.missing, true);
});

test("招生狀況表 plus 總表 formula-shaped row keeps game gatekeeper separate from recruiter", () => {
  const player = game({ _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [player],
    recruitmentRows: [{
      時間戳記: "2026/9/14 10:00:00",
      "接引人(可複選)": "安倢",
      接引日期: "9/14",
      同學的姓名: "王小明",
      "同學電話/LINE": "0912345678",
      系級: "歷史學系大一",
      "這位同學是屬於那個分級呢:-)": "S(已報名)",
      報名了那個活動: "9/30茶會",
      是否入社: "是",
      "保證金是否繳費": "是",
      "繳了多少呢?": "300",
      _gameSubmissionId: player._submissionId,
    }],
    masterRows: [{
      接引日期: "9/14",
      "接引人(可複選)": "安倢",
      同學的姓名: "王小明",
      科系: "歷史學系",
      年級: "大一",
      分級: "S(已報名)",
      報名了那個活動: "9/30茶會",
      是否入社: "是",
      保證金是否繳費: "是",
      繳了多少: "300",
      "同學電話/LINE": "0912345678",
    }],
  });
  assert.equal(data.pending.length, 0);
  assert.equal(data.summary.s, undefined);
  assert.equal(data.summary.activity, 1);
  assert.equal(data.events.find((row) => row.name === "9/30茶會")?.count, 1);
  assert.equal(data.summary.joined, 1);
  assert.equal(data.summary.depositPaid, 1);
  assert.equal(data.summary.depositTotal, 300);
  assert.equal(data.funnel.find((layer) => layer.id === "joined")?.count, 1);
  const profile = data.profiles[0];
  assert.equal(profile.gameGatekeeper, "柏能");
  assert.ok(profile.recruiterList.includes("安倢"));
  assert.equal(profile.department, "歷史學系");
  assert.equal(profile.grade, "大一");
  assert.equal(data.profiles.length, 1);
});

test("總表-only roster rows appear even without a game attempt", () => {
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [],
    recruitmentRows: [],
    masterRows: [{
      接引日期: "9/14",
      "接引人(可複選)": "安倢",
      同學的姓名: "歷史生",
      科系: "歷史學系",
      年級: "大一",
      分級: "S(已報名)",
      報名了那個活動: "9/30茶會",
      是否入社: "是",
      保證金是否繳費: "是",
      繳了多少: "300",
      "同學電話/LINE": "0912000000",
    }],
  });
  assert.equal(data.profiles.length, 1);
  assert.equal(data.profiles[0].name, "歷史生");
  assert.equal(data.summary.s, undefined);
  assert.equal(data.summary.joined, 1);
  assert.equal(data.summary.depositTotal, 300);
  assert.equal(data.pending.length, 0);
  assert.equal(data.profiles[0].gameGatekeeper, "");
  assert.ok(data.profiles[0].timeline.every((item) => item.kind !== "game"));
});

test("today vs history contacts exclude practice and keep name-normalized unique people", () => {
  const first = game({
    姓名: "王 小明",
    遊戲時間: "2026-09-14T06:32:00.000Z",
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
  });
  const replay = game({
    姓名: "王小明",
    電話: "0912345678",
    遊戲時間: "2026-09-14T08:00:00.000Z",
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02",
  });
  const yesterday = game({
    姓名: "昨日生",
    電話: "0912000001",
    遊戲時間: "2026-09-13T06:00:00.000Z",
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03",
  });
  const practice = game({
    姓名: "練習生",
    電話: "0912000002",
    _kind: "practice",
    _skipSave: true,
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04",
  });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T12:00:00+08:00"),
    gameRows: [first, replay, yesterday, practice],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.summary.playedToday, 1);
  assert.equal(data.summary.playedAll, 2);
  assert.equal(data.summary.playedOnDate, 1);
  assert.equal(data.pending.length, 2);
  assert.deepEqual(data.kpiPeople.todayContacts.map((row) => row.name), ["王小明"]);
  assert.equal(data.kpiPeople.allContacts.length, 2);
  assert.ok(data.kpiPeople.allContacts.some((row) => row.name === "王小明"));
  assert.ok(data.kpiPeople.allContacts.some((row) => row.name === "昨日生"));
  assert.equal(data.kpiPeople.pending.length, 2);
  assert.equal(data.kpiPeople.todayContacts.some((row) => /09\d/.test(row.name)), false);
});

test("war-room today vs history contacts use Asia/Taipei midnight, not UTC", () => {
  assert.equal(dateInTaipei(new Date("2026-09-13T15:59:59.000Z")), "2026-09-13");
  assert.equal(dateInTaipei(new Date("2026-09-13T16:00:00.000Z")), "2026-09-14");
  assert.equal(dateInTaipei(new Date("2026-09-14T15:59:59.000Z")), "2026-09-14");
  assert.equal(dateInTaipei(new Date("2026-09-14T16:00:00.000Z")), "2026-09-15");
  const justAfterMidnight = game({
    姓名: "台北今日",
    電話: "0912000101",
    遊戲時間: "2026-09-13T16:00:00.000Z",
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21",
  });
  const justBeforeMidnight = game({
    姓名: "台北昨日",
    電話: "0912000102",
    遊戲時間: "2026-09-13T15:59:59.000Z",
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22",
  });
  const lateTaipeiToday = game({
    姓名: "台北深夜",
    電話: "0912000103",
    遊戲時間: "2026-09-14T15:59:59.000Z",
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23",
  });
  const taipeiTomorrow = game({
    姓名: "台北明日",
    電話: "0912000104",
    遊戲時間: "2026-09-14T16:00:00.000Z",
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa24",
  });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-13T16:30:00.000Z"),
    gameRows: [justAfterMidnight, justBeforeMidnight, lateTaipeiToday, taipeiTomorrow],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.date, "2026-09-14");
  assert.equal(data.summary.playedToday, 2);
  assert.equal(data.summary.playedOnDate, 2);
  assert.equal(data.summary.playedAll, 4);
  assert.deepEqual(data.kpiPeople.todayContacts.map((row) => row.name).sort(), ["台北今日", "台北深夜"]);
  assert.equal(data.kpiPeople.todayContacts.some((row) => row.name === "台北昨日"), false);
  assert.equal(data.kpiPeople.todayContacts.some((row) => row.name === "台北明日"), false);
  assert.equal(data.kpiPeople.allContacts.length, 4);
});

test("today contact chips keep eight unique names so the war-room peek can show 還有 N 人", () => {
  const names = ["接觸甲", "接觸乙", "接觸丙", "接觸丁", "接觸戊", "接觸己", "接觸庚", "接觸辛"];
  const gameRows = names.map((name, index) => game({
    姓名: name,
    電話: `09120001${String(index + 1).padStart(2, "0")}`,
    _submissionId: `cccccccc-cccc-4ccc-8ccc-ccccccccc${String(index + 1).padStart(2, "0")}`,
  }));
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T12:00:00+08:00"),
    gameRows,
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.summary.playedToday, 8);
  assert.equal(data.kpiPeople.todayContacts.length, 8);
  assert.deepEqual(data.kpiPeople.todayContacts.map((row) => row.name), names);
  assert.equal(data.kpiPeople.todayContacts.every((row) => !/09\d/.test(row.name)), true);
  assert.equal(data.kpiPeople.todayContacts.some((row) => /submissionId/i.test(row.name)), false);
  const shown = data.kpiPeople.todayContacts.slice(0, 6).map((row) => row.name);
  const rest = data.kpiPeople.todayContacts.length - shown.length;
  assert.deepEqual(shown, names.slice(0, 6));
  assert.equal(rest, 2);
});

test("event signup counts a person once today and once per event", () => {
  const a = game({ 姓名: "甲", 電話: "0912000101", _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01" });
  const b = game({ 姓名: "乙", 電話: "0912000102", _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02" });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T12:00:00+08:00"),
    gameRows: [a, b],
    recruitmentRows: [
      {
        時間戳記: "2026/9/14 下午 3:00:00",
        同學的姓名: "甲",
        "同學電話/LINE": "0912000101",
        報名了那個活動: "9/30茶會, 社課",
        _gameSubmissionId: a._submissionId,
      },
      {
        時間戳記: "2026/9/13 下午 3:00:00",
        同學的姓名: "乙",
        "同學電話/LINE": "0912000102",
        報名了那個活動: "9/30茶會",
        _gameSubmissionId: b._submissionId,
      },
    ],
    masterRows: [],
  });
  assert.equal(data.summary.activity, 2);
  assert.equal(data.summary.activityToday, 1);
  assert.equal(data.events.find((row) => row.name === "9/30茶會")?.count, 2);
  assert.equal(data.events.find((row) => row.name === "社課")?.count, 1);
  assert.equal(data.events.find((row) => row.name === "體驗禪")?.count, 0);
  assert.deepEqual(
    data.events.find((row) => row.name === "9/30茶會")?.people.map((row) => row.name).sort(),
    ["乙", "甲"],
  );
  assert.deepEqual(
    data.events.find((row) => row.name === "社課")?.people.map((row) => row.name),
    ["甲"],
  );
  assert.deepEqual(data.events.find((row) => row.name === "體驗禪")?.people, []);
  assert.equal(data.events[0].name, "9/30茶會");
  assert.equal(
    data.events.some((row) => /無|考慮中/.test(row.name) || row.people.some((person) => /09\d|submissionId/i.test(person.name))),
    false,
  );
});

test("join and deposit counts are name-normalized unique and do not merge different phones", () => {
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T12:00:00+08:00"),
    gameRows: [],
    recruitmentRows: [
      {
        時間戳記: "2026/9/14 10:00:00",
        同學的姓名: "林同學",
        "同學電話/LINE": "0911111111",
        是否入社: "是",
        保證金是否繳費: "是",
      },
      {
        時間戳記: "2026/9/14 11:00:00",
        同學的姓名: "林同學",
        "同學電話/LINE": "0911111111",
        是否入社: "是",
        保證金是否繳費: "是",
      },
      {
        時間戳記: "2026/9/14 12:00:00",
        同學的姓名: "林同學",
        "同學電話/LINE": "0922222222",
        是否入社: "是",
        保證金是否繳費: "否",
      },
    ],
    masterRows: [],
  });
  assert.equal(data.summary.joined, 2);
  assert.equal(data.summary.depositPaid, 1);
  assert.equal(data.kpiPeople.joined.length, 2);
  assert.equal(data.kpiPeople.deposit.length, 1);
  assert.equal(data.kpiPeople.joined.every((row) => row.name === "林同學"), true);
});

test("considering-none event options do not count as signups", () => {
  const player = game({ _submissionId: "cccccccc-cccc-4ccc-8ccc-cccccccccc01" });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T12:00:00+08:00"),
    gameRows: [player],
    recruitmentRows: [{
      時間戳記: "2026/9/14 10:00:00",
      同學的姓名: "王小明",
      "同學電話/LINE": "0912345678",
      報名了那個活動: "無(考慮中",
      是否入社: "否",
      保證金是否繳費: "否",
      _gameSubmissionId: player._submissionId,
    }],
    masterRows: [],
  });
  assert.equal(data.summary.activity, 0);
  assert.equal(data.summary.activityToday, 0);
  assert.equal(data.summary.joined, 0);
  assert.deepEqual(data.kpiPeople.todayEvents, []);
});

test("empty sheets report zero unique people, not missing counts", () => {
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T12:00:00+08:00"),
    gameRows: [],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.summary.playedToday, 0);
  assert.equal(data.summary.playedAll, 0);
  assert.equal(data.summary.pending, 0);
  assert.equal(data.summary.activityToday, null);
  assert.equal(data.trend.length, 7);
  assert.equal(data.trend.every((row) => row.contacts === 0 && row.signups === 0 && row.joined === 0), true);
  assert.deepEqual(data.kpiPeople.todayContacts, []);
  assert.deepEqual(data.kpiPeople.pending, []);
  assert.deepEqual(data.kpiPeople.allContacts, []);
});

test("Form 選擇學生 labels never include submissionId or #s:", () => {
  const sid = "11111111-1111-4111-8111-111111111111";
  const labeled = encodeStudentChoice({
    name: "王小明",
    department: "歷史學系",
    grade: "大一",
    phone: "0912345678",
    personKey: "phone:0912345678",
    latestAttempt: { submissionId: sid, completedAt: "2026-09-14T06:32:00.000Z" },
  });
  assert.match(labeled, /王小明｜歷史學系大一｜0912345678｜/);
  assert.match(labeled, /#p:phone:0912345678/);
  assert.doesNotMatch(labeled, /#s:/i);
  assert.doesNotMatch(labeled, /submissionId/i);
  assert.equal(labeled.includes(sid), false);
  const decoded = decodeStudentChoice(labeled);
  assert.equal(decoded.personKey, "phone:0912345678");
  assert.equal(decoded.submissionId, "");
  const attemptKeyed = encodeStudentChoice({
    name: "無名",
    personKey: `attempt:${sid}`,
    latestAttempt: { submissionId: sid, completedAt: "2026-09-14T06:32:00.000Z" },
  });
  assert.equal(attemptKeyed.includes(sid), false);
  assert.doesNotMatch(attemptKeyed, /#s:/i);
  assert.doesNotMatch(attemptKeyed, /#p:/);
  const legacy = decodeStudentChoice(`王小明｜歷史學系大一｜0912345678｜14:32|#p:phone:0912345678|#s:${sid}`);
  assert.equal(legacy.submissionId, sid);
  assert.equal(legacy.personKey, "phone:0912345678");
});
