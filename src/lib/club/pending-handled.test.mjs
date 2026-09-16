import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPersonHandled,
  markPersonHandled,
  PENDING_HANDLED_STORAGE_KEY,
  readHandledPersonKeys,
} from "./pending-handled.mjs";

function memoryStorage(start = {}) {
  /** @type {Record<string, string>} */
  const data = { ...start };
  return {
    /** @param {string} key */
    getItem(key) {
      return Object.hasOwn(data, key) ? data[key] : null;
    },
    /** @param {string} key @param {string} value */
    setItem(key, value) {
      data[key] = String(value);
    },
    dump: data,
  };
}

test("markPersonHandled stores only person keys in local tracking", () => {
  const storage = memoryStorage();
  assert.deepEqual(readHandledPersonKeys(storage), []);
  const first = markPersonHandled("person:tang", storage);
  assert.deepEqual(first, ["person:tang"]);
  assert.deepEqual(markPersonHandled("person:tang", storage), ["person:tang"]);
  assert.deepEqual(markPersonHandled("person:chen", storage), ["person:tang", "person:chen"]);
  assert.equal(isPersonHandled("person:chen", first), false);
  assert.equal(isPersonHandled("person:chen", readHandledPersonKeys(storage)), true);
  assert.equal(storage.dump[PENDING_HANDLED_STORAGE_KEY], JSON.stringify(["person:tang", "person:chen"]));
});

test("markPersonHandled ignores blank keys and broken storage JSON", () => {
  const storage = memoryStorage({ [PENDING_HANDLED_STORAGE_KEY]: "{not-json" });
  assert.deepEqual(readHandledPersonKeys(storage), []);
  assert.deepEqual(markPersonHandled("  ", storage), []);
  assert.deepEqual(markPersonHandled("", storage), []);
});
