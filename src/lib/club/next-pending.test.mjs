import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAssignedToPartner,
  isUnassignedOfficialRecruiter,
  nextPendingPerson,
  nextPendingReason,
  officialRecruiterNames,
} from "./next-pending.mjs";

function person(partial) {
  return {
    personKey: "phone:0900000000",
    name: "未指定",
    department: "歷史學系",
    waitMinutes: 10,
    completedAt: "2026-09-16T04:00:00.000Z",
    gameGatekeeper: "小哲",
    recruiters: "",
    recruiterList: [],
    ...partial,
  };
}

test("official recruiter names ignore 遊戲關主", () => {
  const row = person({ gameGatekeeper: "柏能", recruiters: "安倢", recruiterList: ["安倢"] });
  assert.deepEqual(officialRecruiterNames(row), ["安倢"]);
  assert.equal(isAssignedToPartner(row, "柏能"), false);
  assert.equal(isAssignedToPartner(row, "安倢"), true);
  assert.equal(isUnassignedOfficialRecruiter(row), false);
  assert.equal(isUnassignedOfficialRecruiter(person({ gameGatekeeper: "柏能" })), true);
});

test("next person prefers this partner's 接引人 over unassigned", () => {
  const unassigned = person({
    personKey: "phone:1",
    name: "未指定同學",
    waitMinutes: 90,
    gameGatekeeper: "柏能",
  });
  const mine = person({
    personKey: "phone:2",
    name: "我的有緣人",
    waitMinutes: 5,
    gameGatekeeper: "小哲",
    recruiters: "柏能",
    recruiterList: ["柏能"],
  });
  const other = person({
    personKey: "phone:3",
    name: "別人的",
    waitMinutes: 120,
    gameGatekeeper: "柏能",
    recruiters: "安倢",
    recruiterList: ["安倢"],
  });
  const picked = nextPendingPerson([other, unassigned, mine], { partner: "柏能" });
  assert.equal(picked?.name, "我的有緣人");
  assert.equal(nextPendingReason(picked, "柏能"), "assigned");
});

test("遊戲關主 match is never enough to become next person", () => {
  const gatekeeperOnly = person({
    personKey: "phone:1",
    name: "關主帶過的",
    waitMinutes: 200,
    gameGatekeeper: "柏能",
    recruiters: "安倢",
    recruiterList: ["安倢"],
  });
  const unassigned = person({
    personKey: "phone:2",
    name: "尚未指定",
    waitMinutes: 8,
    gameGatekeeper: "小哲",
  });
  assert.equal(
    nextPendingPerson([gatekeeperOnly, unassigned], { partner: "柏能" })?.name,
    "尚未指定",
  );
  assert.equal(
    nextPendingPerson([gatekeeperOnly], { partner: "柏能" }),
    null,
  );
  assert.equal(
    nextPendingPerson([gatekeeperOnly, unassigned], { partner: "小哲" })?.name,
    "尚未指定",
  );
});

test("without a selected partner, only unassigned 接引人 are eligible", () => {
  const unassigned = person({ personKey: "phone:1", name: "尚未指定", waitMinutes: 3 });
  const assigned = person({
    personKey: "phone:2",
    name: "已有接引人",
    waitMinutes: 90,
    recruiters: "安倢",
    recruiterList: ["安倢"],
  });
  assert.equal(nextPendingPerson([assigned, unassigned], { partner: "" })?.name, "尚未指定");
  assert.equal(nextPendingReason(unassigned, ""), "unassigned");
});

test("longer wait wins among the same rank", () => {
  const newer = person({
    personKey: "phone:1",
    name: "較新",
    waitMinutes: 12,
    completedAt: "2026-09-16T10:00:00.000Z",
  });
  const older = person({
    personKey: "phone:2",
    name: "等比較久",
    waitMinutes: 80,
    completedAt: "2026-09-16T02:00:00.000Z",
  });
  assert.equal(nextPendingPerson([newer, older], { partner: "安倢" })?.name, "等比較久");
});

test("handled keys and blank rows are skipped", () => {
  const open = person({ personKey: "phone:open", name: "還要填", waitMinutes: 4 });
  const done = person({ personKey: "phone:done", name: "已處理", waitMinutes: 400 });
  assert.equal(
    nextPendingPerson([done, open], { partner: "安倢", handledKeys: ["phone:done"] })?.name,
    "還要填",
  );
  assert.equal(nextPendingPerson([null, { name: "無 key" }, open]), open);
  assert.equal(nextPendingPerson([]), null);
  assert.equal(nextPendingPerson(undefined), null);
});
