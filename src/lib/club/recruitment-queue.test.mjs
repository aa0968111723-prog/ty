import assert from "node:assert/strict";
import { test } from "node:test";
import { filterPendingQueue, isRelatedToPartner } from "./recruitment-queue.mjs";

const mine = {
  personKey: "a",
  name: "關主的同學",
  phone: "0910000001",
  gameGatekeeper: "柏能",
  recruiters: "",
  recruiterList: [],
  waitMinutes: 40,
};
const assigned = {
  personKey: "b",
  name: "已指定接引",
  phone: "0910000002",
  gameGatekeeper: "安倲",
  recruiters: "柏能",
  recruiterList: ["柏能"],
  waitMinutes: 10,
};
const other = {
  personKey: "c",
  name: "別人的同學",
  phone: "0910000003",
  gameGatekeeper: "小哲",
  recruiters: "",
  recruiterList: [],
  waitMinutes: 90,
};

test("related means assigned recruiter or same game gatekeeper, never mixing the two roles", () => {
  assert.equal(isRelatedToPartner(mine, "柏能"), true);
  assert.equal(isRelatedToPartner(assigned, "柏能"), true);
  assert.equal(isRelatedToPartner(other, "柏能"), false);
  assert.equal(isRelatedToPartner(mine, "安倲"), false);
  assert.equal(isRelatedToPartner(assigned, "安倲"), true);
});

test("queue default with a selected recruiter hides unrelated unfilled people", () => {
  const rows = filterPendingQueue([mine, assigned, other], { self: "柏能" });
  assert.deepEqual(rows.map((row) => row.name), ["關主的同學", "已指定接引"]);
});

test("show-all is explicit and handled people stay hidden until asked", () => {
  const handled = new Set(["a"]);
  const hidden = filterPendingQueue([mine, other], { self: "柏能", handled });
  assert.deepEqual(hidden.map((row) => row.name), []);
  const all = filterPendingQueue([mine, other], { self: "柏能", showAll: true, handled });
  assert.deepEqual(all.map((row) => row.name), ["別人的同學"]);
  const withHandled = filterPendingQueue([mine, other], {
    self: "柏能",
    includeHandled: true,
    handled,
  });
  assert.deepEqual(withHandled.map((row) => row.name), ["關主的同學"]);
});

test("without a selected recruiter the default list is empty until show-all", () => {
  assert.equal(filterPendingQueue([mine, other], {}).length, 0);
  assert.equal(filterPendingQueue([mine, other], { showAll: true }).length, 2);
});
