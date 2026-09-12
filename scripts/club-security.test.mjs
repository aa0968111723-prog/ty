import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const files = [
  "src/components/club/recruitment-dashboard.tsx",
  "src/components/club/recruitment-profile-sheet.tsx",
  "src/components/club/admin-shell.tsx",
  "src/routes/admin.tsx",
  "src/components/admin-login.tsx",
  "src/styles.css",
  "src/admin.css",
];

test("admin password and service-account JSON stay off client UI sources", () => {
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal(source.includes("VITE_ADMIN_PASSWORD"), false, file);
    assert.equal(source.includes("VITE_GOOGLE_SERVICE_ACCOUNT_JSON"), false, file);
    assert.equal(source.includes("BEGIN PRIVATE KEY"), false, file);
    assert.equal(/const password = ["']/.test(source), false, file);
  }
});
