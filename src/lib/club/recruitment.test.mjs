// @ts-nocheck -- Contract tests assemble incomplete sheet rows and form payloads.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPrefilledFormUrl,
  buildRecruitmentDashboard,
  decodeStudentChoice,
  encodeStudentChoice,
  parseEventChoices,
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

test("missing S/A/B and deposit fields are 資料不足 instead of zero", () => {
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
  assert.equal(data.summary.s, null);
  assert.equal(data.summary.depositPaid, null);
  assert.equal(data.funnel.find((layer) => layer.id === "deposit")?.missing, true);
  assert.equal(data.funnel.find((layer) => layer.id === "played")?.count, 1);
  assert.equal(data.funnel.find((layer) => layer.id === "s"), undefined);
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
  assert.equal(data.summary.s, 1);
  assert.equal(data.summary.activity, 1);
  assert.equal(data.summary.joined, 1);
  assert.equal(data.summary.depositPaid, 1);
  assert.equal(data.summary.depositTotal, 300);
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
  assert.equal(data.summary.s, 1);
  assert.equal(data.summary.joined, 1);
  assert.equal(data.summary.depositTotal, 300);
  assert.equal(data.pending.length, 0);
  assert.equal(data.profiles[0].gameGatekeeper, "");
  assert.ok(data.profiles[0].timeline.every((item) => item.kind !== "game"));
});

test("battle stats use Taipei days, normalized names, unique people, and live form events", () => {
  const midnightTaipei = game({
    姓名: " 王 小明 ",
    電話: "0912-345-678",
    遊戲時間: "2026-09-13T16:05:00.000Z",
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001",
  });
  const samePersonReplay = game({
    姓名: "王小明",
    電話: "0912345678",
    遊戲時間: "2026-09-14T02:00:00.000Z",
    分數: 900,
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002",
  });
  const yesterday = game({
    姓名: "昨日生",
    電話: "0912000002",
    遊戲時間: "2026-09-13T15:00:00.000Z",
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003",
  });
  const practice = game({
    姓名: "練習生",
    電話: "0912000003",
    _kind: "practice",
    _skipSave: true,
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0004",
  });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T12:00:00+08:00"),
    gameRows: [midnightTaipei, samePersonReplay, yesterday, practice],
    recruitmentRows: [
      {
        時間戳記: "2026/9/14 下午 1:00:00",
        同學的姓名: "王小明",
        "同學電話/LINE": "0912345678",
        報名了那個活動: "9/30茶會, 社課",
        是否入社: "是",
        保證金是否繳費: "是",
        "接引人(可複選)": "安倢",
        _gameSubmissionId: samePersonReplay._submissionId,
      },
      {
        時間戳記: "2026/9/14 下午 1:10:00",
        同學的姓名: "王小明",
        "同學電話/LINE": "0912345678",
        報名了那個活動: "9/30茶會",
        是否入社: "是",
        保證金是否繳費: "是",
        "接引人(可複選)": "安倢",
        _gameSubmissionId: samePersonReplay._submissionId,
        _duplicate: true,
      },
      {
        時間戳記: "2026/9/13 下午 4:00:00",
        同學的姓名: "昨日生",
        "同學電話/LINE": "0912000002",
        報名了那個活動: "無(考慮中",
        是否入社: "否",
        保證金是否繳費: "否",
        "接引人(可複選)": "柏能",
      },
      {
        時間戳記: "2026/9/14 上午 10:00:00",
        同學的姓名: "茶會乙",
        "同學電話/LINE": "0912000008",
        報名了那個活動: "9/30茶會",
        是否入社: "否",
        保證金是否繳費: "否",
        "接引人(可複選)": "小哲",
      },
    ],
    masterRows: [],
  });
  assert.equal(data.summary.contactsToday, 1);
  assert.equal(data.summary.contactsCumulative, 2);
  assert.equal(data.summary.eventSignupsToday, 2);
  assert.equal(data.events.find((row) => row.label === "9/30茶會")?.count, 2);
  assert.equal(data.events.find((row) => row.label === "社課")?.count, 1);
  assert.equal(data.events.find((row) => row.label === "體驗禪")?.count, 0);
  assert.equal(data.summary.joined, 1);
  assert.equal(data.summary.depositPaid, 1);
  assert.equal(data.summary.pendingOfficialForm, 0);
  assert.deepEqual(data.funnel.map((layer) => layer.id), ["played", "activity", "joined", "deposit"]);
  assert.equal(data.daily.find((row) => row.date === "2026-09-14")?.contacts, 1);
  assert.equal(data.daily.find((row) => row.date === "2026-09-13")?.contacts, 1);
  assert.deepEqual(parseEventChoices("9/30茶會, 無(考慮中, 社課"), ["9/30茶會", "社課"]);
  assert.deepEqual(parseEventChoices("無(沒興趣"), []);
});

test("same name different phones stay two people and are flagged, never silently merged", () => {
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [
      game({ 姓名: "林同學", 電話: "0911111111", _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001" }),
      game({ 姓名: "林同學", 電話: "0922222222", _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002" }),
    ],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.summary.contactsToday, 2);
  assert.equal(data.pending.length, 2);
  assert.ok(data.profiles.every((row) => row.duplicateWarning));
});
