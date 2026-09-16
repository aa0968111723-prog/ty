import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const apiRoutes = [
  "src/routes/api/health.ts",
  "src/routes/api/leaderboard.ts",
  "src/routes/api/register.ts",
  "src/routes/api/result.ts",
  "src/routes/api/admin/dashboard.ts",
  "src/routes/api/admin/form-responses.ts",
  "src/routes/api/admin/login.ts",
  "src/routes/api/admin/logout.ts",
  "src/routes/api/admin/recruitment.ts",
  "src/routes/api/admin/results.ts",
  "src/routes/api/admin/session.ts",
  "src/routes/api/admin/auth/$.ts",
];

describe("client/server bundle boundaries", () => {
  it("keeps Google Sheets behind server-only API route handlers", async () => {
    const sources = await Promise.all(apiRoutes.map((path) => readFile(new URL(path, root), "utf8")));
    for (const source of sources) {
      assert.match(source, /createServerOnlyFn/);
      assert.doesNotMatch(source, /from ["']@\/lib\/club\/(api|admin|admin-auth)\.mjs["']/);
    }
  });

  it("keeps googleapis and Sheets adapters off the public/admin client sources", async () => {
    const { readdir } = await import("node:fs/promises");
    async function walk(dir) {
      const entries = await readdir(dir, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) files.push(...await walk(path));
        else if (/\.(tsx|ts|mjs|js)$/.test(entry.name)) files.push(path);
      }
      return files;
    }
    const files = [
      ...(await walk(new URL("src/components", root).pathname)),
      ...(await walk(new URL("src/routes", root).pathname)),
    ].filter((path) => !path.includes("/routes/api/"));
    for (const file of files) {
      const source = await readFile(file, "utf8");
      assert.doesNotMatch(source, /googleapis/, file);
      assert.doesNotMatch(source, /from ["']@\/lib\/club\/sheets\.mjs["']/, file);
      assert.doesNotMatch(source, /from ["']@\/lib\/club\/admin\.mjs["']/, file);
    }
    const recruitment = await readFile(new URL("src/lib/club/recruitment.mjs", root), "utf8");
    assert.doesNotMatch(recruitment, /from ["']\.\/sheets\.mjs["']/);
  });

  it("keeps the public leaderboard route free of server-only imports", async () => {
    const route = await readFile(new URL("src/routes/leaderboard.tsx", root), "utf8");
    const sheets = await readFile(new URL("src/lib/club/sheets.mjs", root), "utf8");
    assert.match(route, /createServerFn/);
    assert.doesNotMatch(route, /from ["']@\/lib\/club\/(api|admin|sheets)\.mjs["']/);
    assert.match(sheets, /@tanstack\/react-start\/server-only/);
  });
});
