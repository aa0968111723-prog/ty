import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { buildDashboard } from "../src/lib/club/admin.mjs";
import { DEFAULT_SETTINGS } from "../src/lib/club/runtime.mjs";

const base = process.env.CLUB_BROWSER_URL;
async function capture(page, name) {
  if (!process.env.CLUB_QA_DIR) return;
  mkdirSync(process.env.CLUB_QA_DIR, { recursive: true });
  await page.screenshot({ path: join(process.env.CLUB_QA_DIR, name + ".png"), fullPage: true });
}
test(
  "club mobile DOM, scrolling, admin filters and game interactions (optional QA screenshots)",
  { skip: !base },
  async (t) => {
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: ["--no-sandbox"],
    });
    t.after(() => browser.close());
    const origin = new URL(base).origin;
    for (const [width, height] of [
      [360, 800],
      [375, 812],
      [390, 844],
      [412, 915],
      [430, 932],
    ]) {
      await t.test(`${width}x${height} registration and dashboard scroll`, async () => {
        const context = await browser.newContext({
          viewport: { width, height },
          isMobile: true,
          hasTouch: true,
        });
        const errors = [];
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        await page.route("**/*", async (route) => {
          if (new URL(route.request().url()).origin !== origin) {
            await route.fulfill({ status: 200, body: "", contentType: "application/javascript" });
          } else await route.continue();
        });
        await page.goto(base);
        await page.locator("[data-register=official]").waitFor();
        await capture(page, `register-${width}`);
        assert.equal(await page.locator("[data-settings], .settings-sheet").count(), 0);
        const header = await page.locator(".club-header").boundingBox();
        const toggle = await page.locator(".header-actions").boundingBox();
        assert.ok(toggle.x >= header.x && toggle.x + toggle.width <= header.x + header.width + 1);
        async function assertScroll(label) {
          const initial = await page.evaluate(() => ({
            scrollHeight: document.documentElement.scrollHeight,
            clientHeight: document.documentElement.clientHeight,
            innerHeight: innerHeight,
            width: document.documentElement.scrollWidth,
            viewport: innerWidth,
          }));
          assert.ok(
            initial.scrollHeight > initial.innerHeight,
            `${label}: ${JSON.stringify(initial)}`,
          );
          assert.ok(initial.width <= initial.viewport + 1, `${label}: no horizontal overflow`);
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await page.waitForFunction(() => window.scrollY > 0);
          console.log(
            JSON.stringify({
              label,
              width,
              height,
              ...initial,
              scrollY: await page.evaluate(() => scrollY),
            }),
          );
        }
        await assertScroll("register");
        await page.getByRole("button", { name: "管理員登入", exact: true }).click();
        assert.equal(await page.getByRole("dialog").count(), 1);
        await capture(page, `login-${width}`);
        await page.getByRole("button", { name: "關閉登入" }).click();
        await page.route("**/api/admin/session", (route) =>
          route.fulfill({ json: { authenticated: true } }),
        );
        const result = {
          name: "測試同學",
          phone: "0900000000",
          department: "歷史學系",
          grade: "大一",
          gatekeeper: "柏能",
          completedAt: "2026-09-12T01:00:00Z",
          kind: "official",
          skipSave: false,
          duration: 60,
          settings: DEFAULT_SETTINGS,
          score: 600,
          correct: 5,
          wrong: 0,
          maxCombo: 5,
          accuracy: 100,
          submissionId: crypto.randomUUID(),
        };
        await page.route("**/api/admin/dashboard?*", (route) => {
          const date = new URL(route.request().url()).searchParams.get("date");
          return route.fulfill({
            json: buildDashboard({
              date,
              results: [result],
              forms: [{ name: "表單同學", timestamp: "2026/9/12 09:00", gatekeeper: "小哲" }],
            }),
          });
        });
        await page.goto(`${origin}/admin`);
        await page.getByLabel("查詢日期").fill("2026-09-12");
        await page.locator("[data-widget=todayContacts] strong").filter({ hasText: "2" }).waitFor();
        await assertScroll("admin");
        await capture(page, `admin-${width}`);
        await page.getByRole("button", { name: "自訂", exact: true }).click();
        assert.equal(await page.locator(".admin-widget-grid.is-editing [data-widget]").count(), 14);
        await page
          .locator("[data-widget=todayContacts]")
          .dragTo(page.locator("[data-widget=official]"));
        await page.getByRole("button", { name: "隱藏今日接觸人數" }).click();
        const savedLayout = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("admin-dashboard-layout")),
        );
        assert.deepEqual(Object.keys(savedLayout).sort(), ["order", "pinned", "visible"]);
        assert.equal(savedLayout.visible.includes("todayContacts"), false);
        assert.equal(
          savedLayout.order.indexOf("todayContacts") < savedLayout.order.indexOf("official"),
          true,
        );
        assert.equal(JSON.stringify(savedLayout).includes("tkuzen"), false);
        await page.getByRole("button", { name: "完成", exact: true }).click();
        assert.equal(await page.locator("[data-widget=todayContacts]").count(), 0);
        await page.getByRole("button", { name: "自訂", exact: true }).click();
        await page.getByRole("button", { name: "恢復預設" }).click();
        await page.getByRole("button", { name: "完成", exact: true }).click();
        await page
          .getByRole("navigation", { name: "手機後台導覽" })
          .getByRole("button", { name: "名單", exact: true })
          .click();
        await page.getByLabel("篩選來源").selectOption("Google Form");
        assert.equal(await page.locator(".admin-person-list article").count(), 1);
        await page.getByRole("button", { name: "成績", exact: true }).click();
        assert.equal(
          await page.locator(".admin-person-list article").count(),
          1,
          "hidden form-source filter must not hide results",
        );
        await page.getByRole("button", { name: "查看前三名" }).click();
        assert.equal(await page.locator(".admin-podium li").count(), 1);
        await page.getByRole("button", { name: "更多", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "關主", exact: true }).click();
        await page.getByRole("button", { name: /柏能/ }).click();
        assert.equal(await page.getByLabel("篩選關主").inputValue(), "柏能");
        await page.getByLabel("查詢日期").fill("2026-09-11");
        await page.getByText("沒有符合條件的紀錄").waitFor();
        await page.goto(`${origin}/admin?view=pinned`);
        await page.getByRole("heading", { name: "我的釘選" }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get("view"), "pinned");
        assert.ok((await page.locator(".admin-pinned-grid [data-widget]").count()) > 0);
        assert.deepEqual(errors, []);
        await context.close();
      });
    }
    await t.test("desktop workspace, login failure and navigation", async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.goto(base);
      await page.locator("[data-register=official]").waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await capture(page, "register-desktop");
      await page.route("**/api/admin/session", route => route.fulfill({ json: { authenticated: false } }));
      await page.route("**/api/admin/login", route => route.fulfill({ status: 401, json: { error: "密碼錯誤" } }));
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "管理員登入" }).waitFor();
      assert.equal(await page.locator(".admin-error").count(), 0);
      await page.getByLabel("管理員密碼").fill("ui-test-only");
      await page.getByRole("button", { name: "登入後台" }).click();
      await page.getByRole("alert").waitFor();
      await page.route("**/api/admin/login", route => route.fulfill({ json: { ok: true } }));
      await page.route("**/api/admin/dashboard?*", route => {
        const date = new URL(route.request().url()).searchParams.get("date");
        return route.fulfill({ json: buildDashboard({
          date, results: [], forms: [
            { name: "介面測試 A", timestamp: `${date} 09:00`, gatekeeper: "柏能" },
            { name: "介面測試 B", timestamp: `${date} 10:00`, gatekeeper: "小哲" },
          ],
        }) });
      });
      await page.getByRole("button", { name: "登入後台" }).click();
      await page.locator(".admin-summary").waitFor();
      assert.equal(await page.locator(".admin-widget-tools").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await capture(page, "admin-desktop");
      await page.getByRole("navigation", { name: "後台導覽", exact: true }).getByRole("button", { name: "Google 表單" }).click();
      assert.equal(await page.getByLabel("篩選來源").inputValue(), "Google Form");
      await page.getByRole("navigation", { name: "後台導覽", exact: true }).getByRole("button", { name: "聯絡名單" }).click();
      assert.equal(await page.getByLabel("篩選來源").inputValue(), "");
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test(
      "warmup, keyboard/pointer scoring, expiry, retry and reload keep a single entry ID",
      async () => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        await page.route("**/*", (route) =>
          new URL(route.request().url()).origin !== origin
            ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
            : route.continue(),
        );
        let confirmed = false;
        const submissions = [];
        await page.route("**/api/result", async (route) => {
          submissions.push(route.request().postDataJSON());
          await route.fulfill({ json: { ok: true, sheetsOk: confirmed, saved: confirmed } });
        });
        await page.route("**/api/register", (route) => route.fulfill({ json: { ok: true } }));
        await page.clock.install();
        await page.goto(base);
        await page.getByRole("button", { name: "柏能", exact: true }).click();
        await page.locator("#name").fill("測試同學");
        await page.locator("#department").selectOption("歷史學系");
        await page.getByRole("button", { name: "大一", exact: true }).click();
        await page.locator("#phone").fill("0900000000");
        await page.getByRole("button", { name: "開始練習", exact: true }).click();
        await page.locator("[data-screen=game]").waitFor();
        await capture(page, "game-mobile");
        await page.clock.fastForward(15100);
        await page.locator("[data-screen=warmup-result]").waitFor();
        await capture(page, "warmup-result-mobile");
        assert.equal(submissions.length, 0);
        await page.getByRole("button", { name: /開始正式 60 秒/ }).click();
        await page.locator("[data-session=official]").waitFor();
        const state = () =>
          page.evaluate(() => ({
            score: Number(document.querySelector("[data-score]").textContent),
            seq: Number(document.querySelector("[data-seq]").getAttribute("data-seq")),
          }));
        const correctKey = await page.locator(".stroop").innerText();
        const keys = { 紅: "1", 藍: "2", 綠: "3", 黃: "4" };
        await page.keyboard.press(keys[correctKey]);
        assert.equal((await state()).score, 100);
        await page.clock.runFor(100);
        await page.locator(".ans").first().focus();
        await page.keyboard.down("Enter");
        const entered = await state();
        await page.clock.runFor(100);
        await page.keyboard.down("Enter");
        assert.equal(
          (await state()).seq,
          entered.seq,
          "holding Enter must not activate subsequent answers",
        );
        await page.keyboard.up("Enter");
        await page.clock.runFor(100);
        const before = await state();
        await page.locator(".ans").first().dblclick({ delay: 0 });
        const after = await state();
        assert.equal(after.seq, before.seq + 1, "double event cannot score a second time");
        await page.clock.fastForward(60000);
        await page.locator("[data-screen=result]").waitFor();
        await capture(page, "result-mobile");
        await page.waitForFunction(
          () => document.querySelector(".pending-result button")?.disabled === false,
        );
        assert.equal(submissions.length, 1);
        await page.reload();
        await page.getByRole("button", { name: "重試儲存", exact: true }).waitFor();
        confirmed = true;
        await page.getByRole("button", { name: "重試儲存", exact: true }).click();
        await page.locator(".pending-result").waitFor({ state: "detached" });
        assert.equal(submissions.length, 2);
        assert.deepEqual(submissions[1], submissions[0]);
        await context.close();
      },
    );
  },
);
