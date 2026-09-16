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
  assert.equal(data.pending.every((row) => row.pending === true), true);
  const peng = data.pending.find((row) => row.name === "王小明");
  assert.equal(peng.attemptCount, 2);
  assert.equal(peng.gameGatekeeper, "柏能");
  assert.equal(data.candidatesByGatekeeper["柏能"].length, 1);
  assert.equal(data.candidatesByGatekeeper["安倢"].length, 1);
  const decoded = decodeStudentChoice(encodeStudentChoice(peng));
  assert.equal(decoded.submissionId, second._submissionId);
  assert.match(peng.choiceLabel, /王小明/);
  assert.equal(decoded.personKey, peng.personKey);
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
});

test("phone match removes candidate even without submissionId on the form row", () => {
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
});

test("practice-like rows are ignored by game attempt parser", () => {
  const rows = parseGameAttempts([
    game({ _kind: "practice", _skipSave: true }),
    game({ _submissionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }),
  ]);
  assert.equal(rows.length, 1);
});

test("missing activity, joined and deposit fields are 資料不足 instead of zero", () => {
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
  assert.equal(data.summary.activityToday, null);
  assert.equal(data.summary.depositPaid, null);
  assert.equal(data.summary.joined, null);
  assert.equal(data.funnel.find((layer) => layer.id === "activity")?.missing, true);
  assert.equal(data.summary.popularActivity, null);
  assert.equal(data.funnel.find((layer) => layer.id === "played")?.count, 1);
  assert.equal(data.funnel.some((layer) => layer.id === "s" || /S|A|B|分級/.test(layer.label)), false);
  assert.deepEqual(data.funnel.map((layer) => layer.id), ["played", "activity", "joined", "deposit"]);
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
  assert.equal(data.summary.contactsToday, 1);
  assert.equal(data.summary.contactsTotal, 1);
  assert.equal(data.summary.activity, 1);
  assert.equal(data.summary.activityToday, 1);
  assert.equal(data.summary.joined, 1);
  assert.equal(data.summary.depositPaid, 1);
  assert.equal(data.summary.depositTotal, 300);
  assert.equal(data.summary.s, undefined);
  assert.equal(data.activities.find((row) => row.name === "9/30茶會")?.count, 1);
  const profile = data.profiles[0];
  assert.equal(profile.gameGatekeeper, "柏能");
  assert.ok(profile.recruiterList.includes("安倢"));
  assert.equal(profile.department, "歷史學系");
  assert.equal(profile.grade, "大一");
  assert.equal(data.profiles.length, 1);
  assert.equal(profile.timeline.some((item) => item.kind === "tier" || /分級|^S|^A|^B/.test(item.title)), false);
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
  assert.equal(data.summary.activity, 1);
  assert.equal(data.summary.joined, 1);
  assert.equal(data.summary.depositTotal, 300);
  assert.equal(data.summary.s, undefined);
  assert.equal(data.pending.length, 0);
  assert.equal(data.profiles[0].gameGatekeeper, "");
  assert.ok(data.profiles[0].timeline.every((item) => item.kind !== "game"));
});

test("practice games are excluded from contact counts and pending", () => {
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T20:00:00+08:00"),
    gameRows: [
      game({ _kind: "practice", _skipSave: true, _submissionId: "practice-1" }),
      game({ 姓名: "正式生", 電話: "0910000099", _submissionId: "official-1" }),
    ],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.summary.contactsToday, 1);
  assert.equal(data.summary.contactsTotal, 1);
  assert.deepEqual(data.pending.map((row) => row.name), ["正式生"]);
});

test("one person signing two activities counts once today and once per activity", () => {
  const first = game({ 姓名: "甲", 電話: "0910000101", _submissionId: "act-1" });
  const second = game({ 姓名: "乙", 電話: "0910000102", _submissionId: "act-2" });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [first, second],
    recruitmentRows: [{
      時間戳記: "2026/9/14 下午 3:00:00",
      同學的姓名: "甲",
      "同學電話/LINE": "0910000101",
      報名了那個活動: "9/30茶會, 社課",
      是否入社: "否",
      保證金是否繳費: "否",
      _gameSubmissionId: first._submissionId,
    }, {
      時間戳記: "2026/9/13 下午 3:00:00",
      同學的姓名: "乙",
      "同學電話/LINE": "0910000102",
      接引日期: "9/13",
      報名了那個活動: "10/07演講",
      是否入社: "是",
      保證金是否繳費: "是",
      _gameSubmissionId: second._submissionId,
    }],
    masterRows: [],
  });
  assert.equal(data.summary.activity, 2);
  assert.equal(data.summary.activityToday, 1);
  assert.equal(data.activities.find((row) => row.name === "9/30茶會")?.count, 1);
  assert.equal(data.activities.find((row) => row.name === "社課")?.count, 1);
  assert.equal(data.activities.find((row) => row.name === "10/07演講")?.count, 1);
  assert.equal(data.summary.joined, 1);
  assert.equal(data.dailyTrend.length, 7);
  assert.equal(data.dailyTrend.at(-1)?.date, "2026-09-14");
  assert.equal(data.dailyTrend.at(-1)?.contacts, 2);
  assert.equal(data.dailyTrend.at(-1)?.activity, 1);
});

test("popular activity is the signup with the most people, not a game score", () => {
  const tea = [
    game({ 姓名: "甲", 電話: "0910000101", _submissionId: "pop-1" }),
    game({ 姓名: "乙", 電話: "0910000102", _submissionId: "pop-2" }),
    game({ 姓名: "丙", 電話: "0910000103", _submissionId: "pop-3" }),
  ];
  const talk = game({ 姓名: "丁", 電話: "0910000104", _submissionId: "pop-4", 分數: 3500 });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [...tea, talk],
    recruitmentRows: [
      ...tea.map((row, index) => ({
        時間戳記: "2026/9/14 下午 3:00:00",
        同學的姓名: row.姓名,
        "同學電話/LINE": row.電話,
        報名了那個活動: index === 0 ? "9/30茶會, 10/07演講" : "9/30茶會",
        是否入社: "否",
        保證金是否繳費: "否",
        _gameSubmissionId: row._submissionId,
      })),
      {
        時間戳記: "2026/9/14 下午 3:00:00",
        同學的姓名: talk.姓名,
        "同學電話/LINE": talk.電話,
        報名了那個活動: "10/07演講",
        是否入社: "否",
        保證金是否繳費: "否",
        _gameSubmissionId: talk._submissionId,
      },
    ],
    masterRows: [],
  });
  assert.equal(data.summary.activity, 4);
  assert.deepEqual(data.summary.popularActivity, { name: "9/30茶會", count: 3, today: 3 });
  assert.equal(data.activities.find((row) => row.name === "10/07演講")?.count, 2);
  assert.equal(data.summary.s, undefined);
});

test("same name different phones stay separate and are flagged for confirmation", () => {
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [
      game({ 姓名: "林同學", 電話: "0911111111", _submissionId: "dup-1" }),
      game({ 姓名: "林同學", 電話: "0922222222", _submissionId: "dup-2" }),
    ],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.pending.length, 2);
  assert.equal(data.summary.contactsToday, 2);
  assert.ok(data.pending.every((row) => row.needsConfirmation));
  assert.ok(data.profiles.every((row) => row.needsConfirmation));
  assert.equal(data.pending[0].confirmationReason, "同名不同電話，需要確認");
  assert.equal(data.pending[1].confirmationReason, "同名不同電話，需要確認");
  assert.notEqual(data.pending[0].personKey, data.pending[1].personKey);
  assert.doesNotMatch(JSON.stringify(data.summary), /"s":|"a":|"b":/);
});

test("same phone different names stay separate and are flagged for confirmation", () => {
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [
      game({ 姓名: "王小明", 電話: "0911111111", _submissionId: "dup-p1" }),
      game({ 姓名: "李小華", 電話: "0911111111", 科系: "會計學系", 年級: "大二", _submissionId: "dup-p2" }),
    ],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.pending.length, 2);
  assert.equal(data.summary.contactsToday, 2);
  assert.ok(data.pending.every((row) => row.needsConfirmation));
  assert.ok(data.profiles.every((row) => row.needsConfirmation));
  assert.ok(data.pending.every((row) => row.confirmationReason === "同電話不同姓名，需要確認"));
  assert.deepEqual(data.pending.map((row) => row.name).sort(), ["李小華", "王小明"]);
  assert.notEqual(data.pending[0].personKey, data.pending[1].personKey);
  assert.doesNotMatch(JSON.stringify(data.summary), /"s":|"a":|"b":/);
});

test("official form for one name on a shared phone leaves the other person pending", () => {
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [
      game({ 姓名: "王小明", 電話: "0911111111", _submissionId: "keep-p1" }),
      game({ 姓名: "李小華", 電話: "0911111111", 科系: "會計學系", 年級: "大二", _submissionId: "keep-p2" }),
    ],
    recruitmentRows: [{
      時間戳記: "2026/9/14 下午 3:00:00",
      同學的姓名: "王小明",
      "同學電話/LINE": "0911111111",
      報名了那個活動: "無",
      是否入社: "否",
      保證金是否繳費: "否",
      _gameSubmissionId: "keep-p1",
    }],
    masterRows: [],
  });
  assert.equal(data.pending.length, 1);
  assert.equal(data.pending[0].name, "李小華");
  assert.equal(data.pending[0].needsConfirmation, true);
  assert.equal(data.pending[0].confirmationReason, "同電話不同姓名，需要確認");
  const wang = data.profiles.find((row) => row.name === "王小明");
  assert.equal(wang?.pending, false);
  assert.equal(wang?.needsConfirmation, true);
});

test("official-form 備註 keeps extras and does not carry submissionId into profiles", () => {
  const player = game({
    姓名: "已填乙",
    電話: "0920000002",
    遊戲關主: "安倢",
    _submissionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [player],
    recruitmentRows: [{
      時間戳記: "2026/9/14 下午 3:00:00",
      同學的姓名: player.姓名,
      "同學電話/LINE": player.電話,
      "接引人(可複選)": "小哲",
      報名了那個活動: "9/30茶會",
      是否入社: "是",
      保證金是否繳費: "是",
      備註: "遊戲完成：2026/09/14 10:00\n遊戲關主：安倢\nsubmissionId：cccccccc-cccc-4ccc-8ccc-cccccccccccc\n喜歡茶會",
      _gameSubmissionId: player._submissionId,
    }],
    masterRows: [],
  });
  const profile = data.profiles.find((row) => row.name === "已填乙");
  assert.equal(profile?.note, "喜歡茶會");
  assert.doesNotMatch(String(profile?.note), /submissionId/i);
  assert.equal(profile?.gameGatekeeper, "安倢");
  assert.ok(profile?.recruiterList?.includes("小哲"));
  assert.doesNotMatch(JSON.stringify(data.profiles.map((row) => row.note)), /submissionId/i);
});

test("empty game and form sheets stay at zero without inventing funnel counts", () => {
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T12:00:00+08:00"),
    gameRows: [],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.summary.contactsToday, 0);
  assert.equal(data.summary.contactsTotal, 0);
  assert.equal(data.summary.playedToday, 0);
  assert.equal(data.summary.pending, 0);
  assert.equal(data.summary.recruited, 0);
  assert.equal(data.summary.roster, 0);
  assert.equal(data.summary.activity, null);
  assert.equal(data.summary.joined, null);
  assert.equal(data.summary.depositPaid, null);
  assert.equal(data.pending.length, 0);
  assert.equal(data.profiles.length, 0);
  assert.equal(data.recruiters.length, 0);
  assert.equal(data.gameGatekeepers.length, 0);
  assert.equal(data.funnel.find((layer) => layer.id === "played")?.count, 0);
  assert.equal(data.funnel.find((layer) => layer.id === "activity")?.missing, true);
  assert.equal(data.summary.s, undefined);
  assert.equal(data.dailyTrend.at(-1)?.date, "2026-09-14");
  assert.equal(data.dailyTrend.at(-1)?.contacts, 0);
  assert.doesNotMatch(JSON.stringify(data), /googleapis|submissionId/);
});

