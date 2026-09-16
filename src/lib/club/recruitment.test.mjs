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
  toPartnerRecruitmentDashboard,
  summarizePaidDeposit,
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
  assert.equal(data.funnel.find((layer) => layer.id === "activity")?.missing, true);
  assert.deepEqual(data.funnel.map((layer) => layer.id), ["played", "activity", "joined", "deposit"]);
  assert.equal(data.funnel.find((layer) => layer.id === "played")?.count, 1);
  assert.equal(data.summary.playedToday, 1);
  assert.equal(data.summary.playedTotal, 1);
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
  assert.equal(data.summary.s, undefined);
  assert.equal(data.summary.joined, 1);
  assert.equal(data.summary.depositTotal, 300);
  assert.equal(data.pending.length, 0);
  assert.equal(data.profiles[0].gameGatekeeper, "");
  assert.ok(data.profiles[0].timeline.every((item) => item.kind !== "game"));
});

test("today contact ignores practice and counts one person twice-played", () => {
  const official = game({ _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11" });
  const replay = game({
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12",
    遊戲時間: "2026-09-14T08:00:00.000Z",
  });
  const practice = game({
    姓名: "練習生",
    電話: "0910000099",
    _kind: "practice",
    _skipSave: true,
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13",
  });
  const yesterday = game({
    姓名: "昨日生",
    電話: "0910000088",
    遊戲時間: "2026-09-13T06:32:00.000Z",
    _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa14",
  });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T18:00:00+08:00"),
    gameRows: [official, replay, practice, yesterday],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.summary.playedToday, 1);
  assert.equal(data.summary.playedTotal, 2);
  assert.equal(data.daily.length, 7);
  assert.equal(data.daily.at(-1)?.date, "2026-09-14");
  assert.equal(data.daily.at(-1)?.contacts, 1);
});

test("activity signup counts unique people and ignores 無(考慮中", () => {
  const a = game({ 姓名: "甲", 電話: "0910000001", _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01" });
  const b = game({ 姓名: "乙", 電話: "0910000002", _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02" });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    now: new Date("2026-09-14T18:00:00+08:00"),
    gameRows: [a, b],
    recruitmentRows: [
      {
        時間戳記: "2026/9/14 下午 3:00:00",
        同學的姓名: "甲",
        "同學電話/LINE": "0910000001",
        報名了那個活動: "9/30茶會, 社課",
        是否入社: "是",
        保證金是否繳費: "是",
        _gameSubmissionId: a._submissionId,
      },
      {
        時間戳記: "2026/9/14 下午 4:00:00",
        同學的姓名: "乙",
        "同學電話/LINE": "0910000002",
        報名了那個活動: "無(考慮中",
        是否入社: "否",
        _gameSubmissionId: b._submissionId,
      },
    ],
    masterRows: [],
  });
  assert.equal(data.summary.activity, 1);
  assert.equal(data.summary.activityToday, 1);
  assert.equal(data.activities.find((row) => row.name === "9/30茶會")?.count, 1);
  assert.equal(data.activities.find((row) => row.name === "社課")?.count, 1);
  assert.equal(data.activities.some((row) => row.name.startsWith("無")), false);
  assert.equal(data.funnel.find((layer) => layer.id === "activity")?.count, 1);
  assert.equal(data.funnel.find((layer) => layer.id === "joined")?.count, 1);
});

test("same name different phones is flagged for review and not silently merged", () => {
  const left = game({ 姓名: "林同學", 電話: "0911111111", _submissionId: "cccccccc-cccc-4ccc-8ccc-cccccccccc01" });
  const right = game({ 姓名: "林同學", 電話: "0922222222", _submissionId: "cccccccc-cccc-4ccc-8ccc-cccccccccc02" });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [left, right],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.equal(data.summary.playedToday, 2);
  assert.equal(data.pending.length, 2);
  assert.equal(data.pending.every((row) => row.needsReview), true);
});

function paidDeposit(name, phone, extra = {}) {
  return {
    接引日期: "9/14",
    "接引人(可複選)": "安倢",
    同學的姓名: name,
    科系: "歷史學系",
    年級: "大一",
    是否入社: "否",
    保證金是否繳費: "是",
    繳了多少: extra.amount ?? "300",
    "同學電話/LINE": phone,
    ...extra,
  };
}

test("deposit people are unique by name and phone, not form row count", () => {
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [],
    recruitmentRows: [],
    masterRows: [
      paidDeposit("甲", "0910000001"),
      paidDeposit("乙", "0910000002"),
      paidDeposit("甲", "0910000001", { 繳了多少: "0" }),
    ],
  });
  assert.equal(data.summary.depositPaid, 2);
  assert.equal(data.summary.depositNeedsReview, true);
  assert.equal(data.funnel.find((layer) => layer.id === "deposit")?.count, 2);
  const summarized = summarizePaidDeposit(parseMasterRows([
    paidDeposit("甲", "0910000001"),
    paidDeposit("乙", "0910000002"),
    paidDeposit("甲", "0910000001"),
  ]));
  assert.equal(summarized.rowCount, 3);
  assert.equal(summarized.count, 2);
  assert.equal(summarized.nameCount, 2);
  assert.equal(summarized.phoneCount, 2);
});

test("same-name different-phone deposit rows stay two people and need review", () => {
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [],
    recruitmentRows: [],
    masterRows: [
      paidDeposit("林同學", "0911111111"),
      paidDeposit("林同學", "0922222222"),
    ],
  });
  assert.equal(data.summary.depositPaid, 2);
  assert.equal(data.summary.depositNeedsReview, true);
  assert.equal(data.summary.depositPaid === 1, false);
  assert.ok(data.profiles.filter((row) => row.depositPaid === "是").every((row) => row.needsReview));
  const partner = toPartnerRecruitmentDashboard(data);
  assert.equal(partner.summary.depositPaid, 2);
  assert.equal(partner.summary.depositNeedsReview, true);
});

test("same-phone different-name deposit rows stay two people and need review", () => {
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [],
    recruitmentRows: [],
    masterRows: [
      paidDeposit("唐同學", "0917777174"),
      paidDeposit("陳同學甲乙丙", "0917777174"),
    ],
  });
  assert.equal(data.summary.depositPaid, 2);
  assert.equal(data.summary.depositNeedsReview, true);
  const summarized = summarizePaidDeposit(parseMasterRows([
    paidDeposit("唐同學", "0917777174"),
    paidDeposit("陳同學甲乙丙", "0917777174"),
  ]));
  assert.equal(summarized.phoneCount, 1);
  assert.equal(summarized.nameCount, 2);
  assert.equal(summarized.count, 2);
  assert.ok(data.profiles.some((row) => row.needsReview && row.depositPaid === "是"));
});

test("deposit count ignores game scores and does not use phone unique as the only key", () => {
  const scored = game({
    姓名: "高分生",
    電話: "0910000099",
    分數: 3600,
    _submissionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01",
  });
  const rows = [
    paidDeposit("高分生", "0910000099"),
    paidDeposit("高分生", ""),
    paidDeposit("甲", "0910000001"),
    paidDeposit("乙", "0910000002"),
    paidDeposit("丙", "0910000003"),
    paidDeposit("丁", "0910000004"),
    paidDeposit("戊", "0910000005"),
    paidDeposit("己", "0910000006"),
    paidDeposit("庚", "0910000007"),
    paidDeposit("唐同學", "0917777174"),
    paidDeposit("陳同學甲乙丙", "0917777174"),
  ];
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [scored],
    recruitmentRows: [],
    masterRows: rows,
  });
  const summarized = summarizePaidDeposit(parseMasterRows(rows));
  assert.equal(data.summary.depositPaid, 11);
  assert.equal(data.summary.depositNeedsReview, true);
  assert.equal(summarized.rowCount, 11);
  assert.equal(summarized.nameCount, 10);
  assert.equal(summarized.phoneCount, 9);
  assert.notEqual(data.summary.depositPaid, summarized.phoneCount);
  assert.notEqual(data.summary.depositPaid, summarized.nameCount);
  assert.ok(data.profiles.some((row) => row.name === "高分生" && row.score === 3600));
  assert.equal(toPartnerRecruitmentDashboard(data).profiles.find((row) => row.name === "高分生")?.score, undefined);
});

test("partner dashboard hides grading, scores, and form choice tokens", () => {
  const player = game({ _submissionId: "dddddddd-dddd-4ddd-8ddd-dddddddddd01", 分數: 900 });
  const data = buildRecruitmentDashboard({
    date: "2026-09-14",
    gameRows: [player],
    recruitmentRows: [],
    masterRows: [],
  });
  assert.ok(data.pending[0].latestAttempt);
  assert.ok(data.pending[0].choiceLabel);
  const partner = toPartnerRecruitmentDashboard(data);
  assert.equal("s" in partner.summary, false);
  assert.equal("a" in partner.summary, false);
  assert.equal("b" in partner.summary, false);
  assert.equal(partner.candidatesByGatekeeper, undefined);
  assert.equal(partner.pending[0].latestAttempt, undefined);
  assert.equal(partner.pending[0].choiceLabel, undefined);
  assert.equal(partner.pending[0].score, undefined);
  assert.equal(partner.pending[0].name, "王小明");
  assert.doesNotMatch(JSON.stringify(partner), /S\(已報名\)/);
});
