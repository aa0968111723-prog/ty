import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { buildDashboard } from "../src/lib/club/admin.mjs";
import { buildRecruitmentDashboard } from "../src/lib/club/recruitment.mjs";
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
        await page.route((url) => {
          try { return new URL(url).origin !== origin; } catch { return false; }
        }, async (route) => {
          await route.fulfill({ status: 200, body: "", contentType: "application/javascript" });
        });
        await page.goto(base);
        await page.locator("[data-register=official]").waitFor();
        assert.equal(await page.locator("[data-howto=rules]").count(), 1);
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
        await page.route("**/api/leaderboard**", (route) =>
          route.fulfill({
            json: {
              ok: true, public: true, scope: "today", date: "2026-09-13",
              generatedAt: "2026-09-13T10:00:00.000Z", count: 1,
              topThree: [{ rank: 1, displayName: "王○明", score: 3600, accuracy: 100, title: "Lv.4 卓越領袖", time: "18:00" }],
              rows: [{ rank: 1, displayName: "王○明", score: 3600, accuracy: 100, title: "Lv.4 卓越領袖", time: "18:00" }],
            },
          }),
        );
        await page.locator("[data-leaderboard-nav]").click();
        await page.locator("[data-leaderboard-page]").waitFor();
        assert.equal(await page.locator("[data-scope=today]").count(), 1);
        assert.equal(await page.locator("[data-leaderboard-podium]").count(), 1);
        assert.equal(await page.locator("[data-leaderboard-list]").count(), 1);
        await capture(page, `leaderboard-${width}`);
        await assertScroll("leaderboard");
        await page.goto(base);
        await page.locator("[data-register=official]").waitFor();
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
        await page.route("**/api/admin/dashboard**", (route) => {
          const date = new URL(route.request().url()).searchParams.get("date") || "2026-09-12";
          return route.fulfill({
            json: buildDashboard({
              date,
              results: [result],
              forms: [{ name: "表單同學", timestamp: "2026/9/12 09:00", gatekeeper: "小哲" }],
            }),
          });
        });
        await page.route("**/api/admin/recruitment**", (route) => {
          const date = new URL(route.request().url()).searchParams.get("date") || "2026-09-12";
          return route.fulfill({
            json: buildRecruitmentDashboard({
              date,
              gameRows: [{
                ...result,
                姓名: result.name,
                電話: result.phone,
                科系: result.department,
                年級: result.grade,
                遊戲關主: result.gatekeeper,
                _submissionId: result.submissionId,
              }],
              recruitmentRows: [],
              masterRows: [],
            }),
          });
        });
        await page.goto(`${origin}/admin`);
        await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
        const brandBox = await page.locator(".admin-mobile-top .club-brand").boundingBox();
        assert.ok(brandBox.height >= 44, `brand touch height ${brandBox.height}`);
        assert.ok(brandBox.width >= 44, `brand touch width ${brandBox.width}`);
        await page.getByLabel("查詢日期").fill("2026-09-12");
        await page.getByRole("button", { name: /今日接觸/ }).first().waitFor();
        assert.equal(await page.getByText("分級", { exact: true }).count(), 0);
        assert.equal(await page.getByRole("heading", { name: /^S$/ }).count(), 0);
        assert.equal(await page.locator("text=submissionId").count(), 0);
        await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
        await page.getByRole("heading", { name: "現在該處理" }).waitFor();
        await page.getByText("先選「這位有緣人的接引人」，這裡會出現你現在該找的同學。").waitFor();
        assert.equal(await page.getByRole("link", { name: "填寫正式資料" }).count(), 0);
        await page.getByLabel("這位有緣人的接引人").selectOption("柏能");
        await page.getByRole("link", { name: "填寫正式資料" }).first().waitFor();
        await page.getByText("測試同學").first().waitFor();
        await capture(page, `recruitment-${width}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await assertScroll("admin");
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "待處理", exact: true }).click();
        await page.getByRole("heading", { name: "待填正式招生資料" }).waitFor();
        const recruiterSelect = page.getByLabel("這位有緣人的接引人");
        if ((await recruiterSelect.inputValue()) !== "柏能") await recruiterSelect.selectOption("柏能");
        await page.getByRole("link", { name: "填寫正式資料" }).first().waitFor();
        await capture(page, `admin-${width}`);
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "更多", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "我的釘選" }).click();
        await page.getByRole("heading", { name: "我的釘選" }).waitFor();
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
        await page.getByRole("heading", { name: "招生名單" }).waitFor();
        await page.getByRole("button", { name: "展開篩選" }).waitFor();
        assert.equal(await page.getByLabel("搜尋姓名或電話").isVisible(), true);
        assert.equal(await page.getByLabel("日期範圍").isVisible(), false);
        await page.getByLabel("搜尋姓名或電話").fill("測試同學");
        assert.ok(await page.locator(".admin-person-list article").count() >= 1);
        await page.getByRole("button", { name: "展開篩選" }).click();
        assert.equal(await page.getByLabel("日期範圍").isVisible(), true);
        await page.getByRole("button", { name: "收合篩選" }).click();
        assert.equal(await page.getByLabel("搜尋姓名或電話").isVisible(), true);
        assert.equal(await page.getByLabel("日期範圍").isVisible(), false);
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "更多", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "今日排行榜" }).click();
        await page.locator("h1", { hasText: "今日排行榜" }).waitFor();
        await page.goto(`${origin}/admin?view=pinned`);
        await page.getByRole("heading", { name: "我的釘選" }).waitFor();
        await page.locator(".admin-pinned-grid [data-widget]").first().waitFor();
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
      assert.equal(await page.locator("[data-howto=rules]").count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await capture(page, "register-desktop");
      await page.route("**/api/admin/session", route => route.fulfill({ json: { authenticated: false, passwordEnabled: true, googleEnabled: true } }));
      await page.route("**/api/admin/login", route => route.fulfill({ status: 401, json: { error: "密碼錯誤" } }));
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "管理員登入" }).waitFor();
      await page.getByLabel("管理員密碼").waitFor();
      await page.getByRole("link", { name: "使用 Google 登入" }).waitFor();
      assert.equal(await page.locator(".admin-error").count(), 0);
      await page.getByLabel("管理員密碼").fill("ui-test-only");
      await page.getByRole("button", { name: "登入後台" }).click();
      await page.getByRole("alert").waitFor();
      await page.route("**/api/admin/login", route => route.fulfill({ json: { ok: true } }));
      await page.route("**/api/admin/session", route => route.fulfill({ json: { authenticated: true, passwordEnabled: true, googleEnabled: true } }));
      await page.route("**/api/admin/dashboard?*", route => {
        const date = new URL(route.request().url()).searchParams.get("date");
        return route.fulfill({ json: buildDashboard({
          date, results: [], forms: [
            { name: "介面測試 A", timestamp: `${date} 09:00`, gatekeeper: "柏能" },
            { name: "介面測試 B", timestamp: `${date} 10:00`, gatekeeper: "小哲" },
          ],
        }) });
      });
      await page.route("**/api/admin/recruitment?*", route => {
        const date = new URL(route.request().url()).searchParams.get("date");
        return route.fulfill({ json: buildRecruitmentDashboard({ date, gameRows: [], recruitmentRows: [], masterRows: [] }) });
      });
      await page.getByRole("button", { name: "登入後台" }).click();
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      assert.equal(await page.locator(".admin-widget-tools").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await capture(page, "admin-desktop");
      await page.getByRole("navigation", { name: "更多後台導覽", exact: true }).getByRole("button", { name: "表單資料" }).click();
      assert.equal(await page.getByLabel("篩選來源").inputValue(), "Google Form");
      await page.getByRole("navigation", { name: "後台導覽", exact: true }).getByRole("button", { name: "名單" }).click();
      await page.getByRole("heading", { name: "招生名單" }).waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("recruitment API failure keeps the command center visible", async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) =>
        route.fulfill({ json: { authenticated: true, passwordEnabled: true } }),
      );
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: new URL(route.request().url()).searchParams.get("date"), results: [], forms: [] }) }),
      );
      await page.route("**/api/admin/recruitment?*", (route) =>
        route.fulfill({ status: 502, json: { error: "同步失敗" } }),
      );
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      await page.getByRole("heading", { name: "招生資料暫時無法載入" }).waitFor();
      await page.getByRole("button", { name: "重新同步" }).waitFor();
      assert.equal(await page.locator("text=submissionId").count(), 0);
      assert.equal(await page.getByText("googleapis").count(), 0);
      assert.equal(await page.getByText("Something went wrong").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("session check shows a login skeleton", async (t) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      let release = () => {};
      const held = new Promise((resolve) => { release = resolve; });
      t.after(() => release());
      await page.route("**/api/admin/session", async (route) => {
        await held;
        return route.fulfill({ json: { authenticated: false, passwordEnabled: true, googleEnabled: true } });
      });
      await page.goto(`${origin}/admin`);
      await page.getByRole("status").getByText("正在確認登入狀態…").waitFor();
      await page.locator("[data-loading=session]").waitFor();
      assert.ok(await page.locator(".admin-skeleton-card").count() >= 1);
      await capture(page, "loading-session-390");
      release();
      await page.locator("[data-loading=session]").waitFor({ state: "detached" });
      await page.getByRole("heading", { name: "管理員登入" }).waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("command queue and roster show a loading skeleton before data arrives", async (t) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: "2026-09-14", results: [], forms: [] }) }),
      );
      let release = () => {};
      const held = new Promise((resolve) => { release = resolve; });
      t.after(() => release());
      await page.route("**/api/admin/recruitment**", async (route) => {
        await held;
        return route.fulfill({
          json: buildRecruitmentDashboard({ date: "2026-09-14", gameRows: [], recruitmentRows: [], masterRows: [] }),
        });
      });
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      await page.locator("[data-loading=recruitment][data-mode=command]").waitFor();
      await page.getByRole("heading", { name: "現在該處理" }).waitFor();
      await page.getByRole("status").getByText("同步中…").waitFor();
      assert.ok(await page.locator(".admin-skeleton-card").count() >= 1);
      assert.ok(await page.locator(".admin-skeleton-kpi").count() >= 4);
      await capture(page, "loading-command-390");
      await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "待處理", exact: true }).click();
      await page.locator("[data-loading=recruitment][data-mode=queue]").waitFor();
      await page.getByRole("heading", { name: "待填正式招生資料" }).waitFor();
      await page.getByRole("status").getByText("同步中…").waitFor();
      await capture(page, "loading-queue-390");
      await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "名單", exact: true }).click();
      await page.locator("[data-loading=recruitment][data-mode=roster]").waitFor();
      await page.getByRole("heading", { name: "招生名單" }).waitFor();
      await capture(page, "loading-roster-390");
      release();
      await page.locator("[data-loading=recruitment]").waitFor({ state: "detached" });
      assert.equal(await page.getByText("招生資料暫時無法載入").count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("expired admin session shows a Chinese re-login notice", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      let authed = true;
      await page.route("**/api/admin/session", (route) =>
        route.fulfill({ json: { authenticated: authed, passwordEnabled: true } }),
      );
      await page.route("**/api/admin/dashboard?*", (route) => {
        if (!authed) return route.fulfill({ status: 401, json: { error: "請先登入管理後台" } });
        return route.fulfill({
          json: buildDashboard({ date: new URL(route.request().url()).searchParams.get("date"), results: [], forms: [] }),
        });
      });
      await page.route("**/api/admin/recruitment?*", (route) => {
        if (!authed) return route.fulfill({ status: 401, json: { error: "請先登入管理後台" } });
        return route.fulfill({
          json: buildRecruitmentDashboard({ date: new URL(route.request().url()).searchParams.get("date"), gameRows: [], recruitmentRows: [], masterRows: [] }),
        });
      });
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      const brandBox = await page.locator(".admin-mobile-top .club-brand").boundingBox();
      assert.ok(brandBox.height >= 44, `brand touch height ${brandBox.height}`);
      assert.ok(brandBox.width >= 44, `brand touch width ${brandBox.width}`);
      authed = false;
      await page.getByRole("button", { name: "更新資料" }).click();
      await page.getByRole("heading", { name: "管理員登入" }).waitFor();
      await page.getByRole("alert").getByText("登入已失效，請重新登入").waitFor();
      assert.equal(await page.locator("text=PIN").count(), 0);
      assert.equal(await page.getByText("Something went wrong").count(), 0);
      assert.equal(await page.getByText("googleapis").count(), 0);
      assert.equal(await page.locator("text=submissionId").count(), 0);
      const loginTap = await page.getByRole("button", { name: "登入後台" }).evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { height: box.height, width: box.width };
      });
      assert.ok(loginTap.height >= 44, `login button ${loginTap.height}`);
      assert.ok(loginTap.width >= 44, `login button ${loginTap.width}`);
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("follow-up sync failure stays Chinese and hides googleapis", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/recruitment**", (route) =>
        route.fulfill({
          status: 502,
          json: { error: "Request to https://sheets.googleapis.com/v4/spreadsheets failed\n    at Client.request" },
        }),
      );
      await page.goto(`${origin}/follow-up`);
      await page.getByRole("alert").waitFor();
      assert.match(await page.getByRole("alert").innerText(), /資料暫時無法讀取|無法載入待跟進名單|稍後/);
      assert.equal(await page.getByText("googleapis").count(), 0);
      assert.equal(await page.getByText("Client.request").count(), 0);
      assert.equal(await page.locator("text=submissionId").count(), 0);
      assert.equal(await page.getByText("Something went wrong").count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("queue defaults to people related to the selected recruiter", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: "2026-09-14", results: [], forms: [] }) }),
      );
      const mine = {
        姓名: "關主的同學", 電話: "0910000001", 科系: "歷史學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:00:00.000Z",
      };
      const other = {
        姓名: "別人的同學", 電話: "0910000002", 科系: "歷史學系", 年級: "大一", 遊戲關主: "安倢",
        _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T02:00:00.000Z",
      };
      await page.route("**/api/admin/recruitment**", (route) => route.fulfill({
        json: buildRecruitmentDashboard({ date: "2026-09-14", gameRows: [mine, other], recruitmentRows: [], masterRows: [] }),
      }));
      await page.goto(`${origin}/admin?view=queue`);
      await page.getByRole("heading", { name: "待處理" }).waitFor();
      await page.getByLabel("查詢日期").waitFor();
      assert.equal(await page.getByRole("link", { name: "填寫正式資料" }).count(), 0);
      const searchBox = await page.getByLabel("搜尋姓名或電話").boundingBox();
      assert.ok(searchBox.y + searchBox.height < 390, `queue search ${JSON.stringify(searchBox)}`);
      await capture(page, "queue-compact-390");
      await page.getByLabel("這位有緣人的接引人").selectOption("柏能");
      assert.equal(await page.getByRole("article").filter({ hasText: "關主的同學" }).count(), 1);
      assert.equal(await page.getByRole("article").filter({ hasText: "別人的同學" }).count(), 0);
      const phoneBox = await page.getByText("0910000001").boundingBox();
      const deptBox = await page.getByText(/歷史學系/).boundingBox();
      assert.ok(
        phoneBox.width >= 70 && phoneBox.height <= 28,
        `phone wrapped ${JSON.stringify(phoneBox)}`,
      );
      assert.ok(
        deptBox.width >= 70 && deptBox.height <= 28,
        `dept wrapped ${JSON.stringify(deptBox)}`,
      );
      assert.ok(
        Math.abs(phoneBox.y - deptBox.y) < 8 && phoneBox.x > deptBox.x,
        `facts not two columns phone=${JSON.stringify(phoneBox)} dept=${JSON.stringify(deptBox)}`,
      );
      const queueForm = page.getByRole("article").filter({ hasText: "關主的同學" }).getByRole("link", { name: /開啟表單/ });
      const queueFormHref = decodeURIComponent(String(await queueForm.getAttribute("href")));
      assert.match(queueFormHref, /\/viewform\?/);
      assert.doesNotMatch(queueFormHref, /forms\.gle/);
      assert.match(queueFormHref, /entry\.1318284482=柏能/);
      assert.match(queueFormHref, /關主的同學/);
      assert.doesNotMatch(await queueForm.innerText(), /submissionId/);
      await capture(page, "queue-card-twocol-390");
      await page.getByLabel("這位有緣人的接引人").selectOption("小哲");
      await page.getByRole("status").getByText(/目前沒有與「小哲」相關/).waitFor();
      await page.getByRole("button", { name: "看全部尚未填表" }).click();
      assert.equal(await page.getByRole("article").filter({ hasText: "關主的同學" }).count(), 1);
      assert.equal(await page.getByRole("article").filter({ hasText: "別人的同學" }).count(), 1);
      await page.getByRole("article").filter({ hasText: "別人的同學" }).getByRole("button", { name: "查看詳細" }).click();
      const sheet = page.getByRole("dialog");
      await sheet.getByRole("heading", { name: "別人的同學" }).waitFor();
      await sheet.getByText("遊戲關主").waitFor();
      assert.match(await sheet.locator("dd").filter({ hasText: "安倢" }).innerText(), /安倢/);
      const sheetForm = sheet.getByRole("link", { name: /開啟正式招生表單/ });
      const sheetFill = sheet.getByRole("link", { name: "填寫正式資料" });
      const sheetBackoffice = sheet.getByRole("link", { name: /查看招生表單後台/ });
      const sheetHref = decodeURIComponent(String(await sheetForm.getAttribute("href")));
      assert.match(sheetHref, /\/viewform\?/);
      assert.doesNotMatch(sheetHref, /forms\.gle/);
      assert.match(sheetHref, /entry\.1318284482=小哲/);
      assert.match(sheetHref, /遊戲關主：安倢/);
      assert.doesNotMatch(sheetHref, /entry\.1318284482=安倢/);
      assert.doesNotMatch(await sheet.innerText(), /submissionId/);
      assert.equal(await sheetBackoffice.getAttribute("href"), "/admin?view=form");
      const sheetTap = await sheetForm.boundingBox();
      const fillTap = await sheetFill.boundingBox();
      const backTap = await sheetBackoffice.boundingBox();
      assert.ok(
        sheetTap && sheetTap.height >= 43.5 && sheetTap.width >= 43.5,
        `sheet open-form tap ${JSON.stringify(sheetTap)}`,
      );
      assert.ok(
        backTap && backTap.height >= 43.5 && backTap.width >= 43.5,
        `sheet backoffice tap ${JSON.stringify(backTap)}`,
      );
      assert.ok(
        fillTap && sheetTap && fillTap.y + fillTap.height <= sheetTap.y + 1,
        `sheet actions overlap fill=${JSON.stringify(fillTap)} form=${JSON.stringify(sheetTap)}`,
      );
      await capture(page, "profile-sheet-prefill-390");
      assert.equal(await page.locator("text=submissionId").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("command home KPIs include 最受歡迎活動 and stay collapsed until clicked", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: "2026-09-14", results: [], forms: [] }) }),
      );
      await page.route("**/api/admin/recruitment**", (route) => route.fulfill({
        json: buildRecruitmentDashboard({ date: "2026-09-14", gameRows: [], recruitmentRows: [], masterRows: [] }),
      }));
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      const smallTargets = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll("a, button, [role='button']")];
        return nodes.flatMap((el) => {
          if (el.closest(".admin-sidebar")) return [];
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return [];
          const rect = el.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) return [];
          if (rect.height >= 43.5 && rect.width >= 43.5) return [];
          return [{
            text: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48),
            h: Math.round(rect.height * 10) / 10,
            w: Math.round(rect.width * 10) / 10,
          }];
        });
      });
      assert.deepEqual(smallTargets, []);
      await page.getByText("● 已連線").waitFor();
      const popular = page.getByRole("button", { name: /最受歡迎活動/ });
      await popular.waitFor();
      assert.equal(await popular.getAttribute("aria-expanded"), "false");
      assert.equal(await page.locator("#popular-detail").isVisible(), false);
      await page.getByRole("heading", { name: /各活動報名/ }).waitFor();
      const contacts = page.getByRole("button", { name: /今日接觸/ });
      assert.equal(await contacts.getAttribute("aria-expanded"), "false");
      assert.equal(await page.locator("#contacts-today-detail").isVisible(), false);
      await contacts.click();
      await page.locator("#contacts-today-detail").getByText("練習不計").waitFor();
      await popular.click();
      assert.equal(await popular.getAttribute("aria-expanded"), "true");
      await page.locator("#popular-detail").getByText("9/30茶會").waitFor();
      await page.locator("#popular-detail").getByText("10/07演講").waitFor();
      await page.locator("#popular-detail").getByText("社課").waitFor();
      await page.locator("#popular-detail").getByText("體驗禪").waitFor();
      assert.equal(await page.getByRole("button", { name: /資料同步狀態/ }).count(), 0);
      assert.equal(await page.getByText("分級", { exact: true }).count(), 0);
      const unlabeledCharts = await page.evaluate(() =>
        [...document.querySelectorAll(".battle-ring, .battle-funnel-bar, .battle-bar, .battle-trend, .battle-trend-cols")]
          .filter((el) => !el.getAttribute("aria-label"))
          .map((el) => el.className),
      );
      assert.deepEqual(unlabeledCharts, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("command home expands 活動報名 and 最受歡迎 into per-activity counts", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: "2026-09-14", results: [], forms: [] }) }),
      );
      const tea = {
        姓名: "茶會同學", 電話: "0910000101", 科系: "歷史學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:00:00.000Z",
      };
      const teaTwo = {
        姓名: "茶會同學乙", 電話: "0910000103", 科系: "中國文學學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:30:00.000Z",
      };
      const talk = {
        姓名: "演講同學", 電話: "0910000102", 科系: "會計學系", 年級: "大二", 遊戲關主: "安倢",
        _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T02:00:00.000Z",
      };
      await page.route("**/api/admin/recruitment**", (route) => route.fulfill({
        json: buildRecruitmentDashboard({
          date: "2026-09-14",
          gameRows: [tea, teaTwo, talk],
          recruitmentRows: [{
            時間戳記: "2026/9/14 下午 3:00:00",
            同學的姓名: tea.姓名,
            "同學電話/LINE": tea.電話,
            報名了那個活動: "9/30茶會, 社課",
            是否入社: "否",
            保證金是否繳費: "否",
            _gameSubmissionId: tea._submissionId,
          }, {
            時間戳記: "2026/9/14 下午 3:30:00",
            同學的姓名: teaTwo.姓名,
            "同學電話/LINE": teaTwo.電話,
            報名了那個活動: "9/30茶會",
            是否入社: "否",
            保證金是否繳費: "否",
            _gameSubmissionId: teaTwo._submissionId,
          }, {
            時間戳記: "2026/9/14 下午 3:00:00",
            同學的姓名: talk.姓名,
            "同學電話/LINE": talk.電話,
            報名了那個活動: "10/07演講",
            是否入社: "是",
            保證金是否繳費: "否",
            _gameSubmissionId: talk._submissionId,
          }],
          masterRows: [],
        }),
      }));
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      const activity = page.getByRole("button", { name: /活動報名/ }).first();
      const popular = page.getByRole("button", { name: /最受歡迎活動/ });
      assert.equal(await activity.getAttribute("aria-expanded"), "false");
      await activity.click();
      assert.equal(await activity.getAttribute("aria-expanded"), "true");
      const activityDetail = page.locator("#activity-detail");
      await activityDetail.getByText("9/30茶會").waitFor();
      await activityDetail.getByText("10/07演講").waitFor();
      await activityDetail.getByText("社課").waitFor();
      await activityDetail.getByText("體驗禪").waitFor();
      assert.equal(await activityDetail.locator("li", { hasText: "9/30茶會" }).locator("b").innerText(), "2");
      assert.equal(await activityDetail.locator("li", { hasText: "10/07演講" }).locator("b").innerText(), "1");
      assert.equal(await activityDetail.locator("li", { hasText: "社課" }).locator("b").innerText(), "1");
      assert.equal(await activityDetail.locator("li", { hasText: "體驗禪" }).locator("b").innerText(), "0");
      await capture(page, "command-activity-expand-390");
      await popular.click();
      assert.equal(await popular.getAttribute("aria-expanded"), "true");
      const popularDetail = page.locator("#popular-detail");
      await popularDetail.getByText("9/30茶會").waitFor();
      await popularDetail.getByText("10/07演講").waitFor();
      await popularDetail.locator("li.is-popular", { hasText: "9/30茶會" }).waitFor();
      await capture(page, "command-popular-expand-390");
      assert.equal(await page.getByText("分級", { exact: true }).count(), 0);
      assert.equal(await page.getByRole("heading", { name: /^S$/ }).count(), 0);
      assert.equal(await page.locator("text=submissionId").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("command home expands 入社人數 and 已繳保證金 into counts and completion rates", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: "2026-09-14", results: [], forms: [] }) }),
      );
      const skip = {
        姓名: "茶會同學", 電話: "0910000101", 科系: "歷史學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:00:00.000Z",
      };
      const skipTwo = {
        姓名: "茶會同學乙", 電話: "0910000103", 科系: "中國文學學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:30:00.000Z",
      };
      const paid = {
        姓名: "演講同學", 電話: "0910000102", 科系: "會計學系", 年級: "大二", 遊戲關主: "安倢",
        _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T02:00:00.000Z",
      };
      await page.route("**/api/admin/recruitment**", (route) => route.fulfill({
        json: buildRecruitmentDashboard({
          date: "2026-09-14",
          gameRows: [skip, skipTwo, paid],
          recruitmentRows: [{
            時間戳記: "2026/9/14 下午 3:00:00",
            同學的姓名: skip.姓名,
            "同學電話/LINE": skip.電話,
            報名了那個活動: "9/30茶會",
            是否入社: "否",
            保證金是否繳費: "否",
            _gameSubmissionId: skip._submissionId,
          }, {
            時間戳記: "2026/9/14 下午 3:30:00",
            同學的姓名: skipTwo.姓名,
            "同學電話/LINE": skipTwo.電話,
            報名了那個活動: "9/30茶會",
            是否入社: "否",
            保證金是否繳費: "否",
            _gameSubmissionId: skipTwo._submissionId,
          }, {
            時間戳記: "2026/9/14 下午 3:00:00",
            同學的姓名: paid.姓名,
            "同學電話/LINE": paid.電話,
            報名了那個活動: "10/07演講",
            是否入社: "是",
            保證金是否繳費: "是",
            "繳了多少呢?": "300",
            _gameSubmissionId: paid._submissionId,
          }],
          masterRows: [],
        }),
      }));
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      const joined = page.getByRole("button", { name: /入社人數/ });
      const deposit = page.getByRole("button", { name: /已繳保證金/ });
      assert.equal(await joined.getAttribute("aria-expanded"), "false");
      assert.equal(await page.locator("#joined-detail").isVisible(), false);
      await joined.click();
      assert.equal(await joined.getAttribute("aria-expanded"), "true");
      const joinedDetail = page.locator("#joined-detail");
      await joinedDetail.getByText("人數", { exact: true }).waitFor();
      assert.equal(await joinedDetail.locator("dt", { hasText: "人數" }).locator("xpath=../dd").innerText(), "1");
      assert.equal(await joinedDetail.locator("dt", { hasText: "完成比例" }).locator("xpath=../dd").innerText(), "33.3%");
      await joinedDetail.getByText("佔活動報名").waitFor();
      await joinedDetail.getByText("不用遊戲分數推論").waitFor();
      assert.equal(await joinedDetail.getByText("分級", { exact: true }).count(), 0);
      assert.equal(await joinedDetail.getByText(/^S$|^A$|^B$/).count(), 0);
      await capture(page, "command-joined-expand-390");
      await deposit.click();
      assert.equal(await deposit.getAttribute("aria-expanded"), "true");
      const depositDetail = page.locator("#deposit-detail");
      await depositDetail.getByText("人數", { exact: true }).waitFor();
      assert.equal(await depositDetail.locator("dt", { hasText: "人數" }).locator("xpath=../dd").innerText(), "1");
      assert.equal(await depositDetail.locator("dt", { hasText: "完成比例" }).locator("xpath=../dd").innerText(), "100%");
      await depositDetail.getByText("佔入社").waitFor();
      await depositDetail.getByText("已登錄金額合計 300").waitFor();
      await depositDetail.getByText("不用遊戲分數推論").waitFor();
      assert.equal(await depositDetail.getByText("分級", { exact: true }).count(), 0);
      assert.equal(await depositDetail.getByText(/^S$|^A$|^B$/).count(), 0);
      await capture(page, "command-deposit-expand-390");
      assert.equal(await page.getByText("分級", { exact: true }).count(), 0);
      assert.equal(await page.getByRole("heading", { name: /^S$/ }).count(), 0);
      assert.equal(await page.locator("text=submissionId").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("command home expands 今日接觸 and 累積接觸 into count definitions", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: "2026-09-14", results: [], forms: [] }) }),
      );
      const today = {
        姓名: "王小明", 電話: "0910000101", 科系: "歷史學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:00:00.000Z", 遊戲秒數: 60,
      };
      const todayAgain = {
        姓名: "王 小明", 電話: "0910000101", 科系: "歷史學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:20:00.000Z", 遊戲秒數: 60,
      };
      const practice = {
        姓名: "練習生", 電話: "0910000199", 科系: "歷史學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "practice-1", _kind: "practice", _skipSave: true,
        遊戲時間: "2026-09-14T01:10:00.000Z", 遊戲秒數: 15,
      };
      const yesterday = {
        姓名: "林同學", 電話: "0910000102", 科系: "會計學系", 年級: "大二", 遊戲關主: "安倢",
        _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-13T02:00:00.000Z", 遊戲秒數: 60,
      };
      await page.route("**/api/admin/recruitment**", (route) => route.fulfill({
        json: buildRecruitmentDashboard({
          date: "2026-09-14",
          gameRows: [today, todayAgain, practice, yesterday],
          recruitmentRows: [],
          masterRows: [],
        }),
      }));
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      const todayCard = page.getByRole("button", { name: /今日接觸/ });
      const totalCard = page.getByRole("button", { name: /累積接觸/ });
      assert.equal(await todayCard.getAttribute("aria-expanded"), "false");
      assert.equal(await page.locator("#contacts-today-detail").isVisible(), false);
      await todayCard.click();
      assert.equal(await todayCard.getAttribute("aria-expanded"), "true");
      const todayDetail = page.locator("#contacts-today-detail");
      await todayDetail.getByText("人數", { exact: true }).waitFor();
      assert.equal(await todayDetail.locator("dt", { hasText: "人數" }).locator("xpath=../dd").innerText(), "1");
      await todayDetail.getByText("正式 60 秒").waitFor();
      await todayDetail.getByText("姓名去重").waitFor();
      await todayDetail.getByText("練習不計").waitFor();
      assert.equal(await todayDetail.getByText("累積已接觸").count(), 0);
      assert.equal(await todayDetail.getByText("分級", { exact: true }).count(), 0);
      assert.equal(await todayDetail.locator("text=submissionId").count(), 0);
      await capture(page, "command-contacts-today-expand-390");
      await totalCard.click();
      assert.equal(await totalCard.getAttribute("aria-expanded"), "true");
      const totalDetail = page.locator("#contacts-total-detail");
      await totalDetail.getByText("人數", { exact: true }).waitFor();
      assert.equal(await totalDetail.locator("dt", { hasText: "人數" }).locator("xpath=../dd").innerText(), "2");
      await totalDetail.getByText("正式 60 秒").waitFor();
      await totalDetail.getByText("姓名去重").waitFor();
      await totalDetail.getByText("練習不計").waitFor();
      await totalDetail.getByText("今日 1").waitFor();
      assert.equal(await totalDetail.getByText("分級", { exact: true }).count(), 0);
      assert.equal(await totalDetail.locator("text=submissionId").count(), 0);
      await capture(page, "command-contacts-total-expand-390");
      assert.equal(await page.getByText("分級", { exact: true }).count(), 0);
      assert.equal(await page.getByRole("heading", { name: /^S$/ }).count(), 0);
      assert.equal(await page.locator("text=submissionId").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("command home expands 待填正式資料 into count and recruiter priority", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: "2026-09-14", results: [], forms: [] }) }),
      );
      const mine = {
        姓名: "關主的同學", 電話: "0910000001", 科系: "歷史學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:00:00.000Z",
      };
      const other = {
        姓名: "別人的同學", 電話: "0910000003", 科系: "會計學系", 年級: "大二", 遊戲關主: "小哲",
        _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T02:00:00.000Z",
      };
      await page.route("**/api/admin/recruitment**", (route) => route.fulfill({
        json: buildRecruitmentDashboard({
          date: "2026-09-14",
          gameRows: [mine, other],
          recruitmentRows: [],
          masterRows: [],
        }),
      }));
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      const pending = page.getByRole("button", { name: /待填正式資料/ });
      assert.equal(await pending.getAttribute("aria-expanded"), "false");
      await pending.click();
      assert.equal(await pending.getAttribute("aria-expanded"), "true");
      const detail = page.locator("#pending-detail");
      await detail.getByText("人數", { exact: true }).waitFor();
      assert.equal(await detail.locator("dt", { hasText: "人數" }).locator("xpath=../dd").innerText(), "2");
      await detail.getByText("已完成遊戲、尚未正式資料").waitFor();
      await detail.getByText("優先依目前接引人").waitFor();
      await detail.getByText("遊戲關主不是接引人").waitFor();
      assert.equal(await detail.locator("text=submissionId").count(), 0);
      await page.getByLabel("這位有緣人的接引人").selectOption("柏能");
      if ((await pending.getAttribute("aria-expanded")) !== "true") await pending.click();
      await detail.getByText("優先「柏能」").waitFor();
      assert.equal(await detail.locator("dt", { hasText: "人數" }).locator("xpath=../dd").innerText(), "2");
      assert.equal(await detail.getByText("遊戲關主不是接引人").count(), 1);
      assert.equal(await page.getByText("分級", { exact: true }).count(), 0);
      await capture(page, "command-pending-expand-390");
      await detail.getByRole("button", { name: "查看待處理名單" }).click();
      await page.getByRole("heading", { name: "待填正式招生資料" }).waitFor();
      assert.equal(await page.locator("text=submissionId").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("command home funnel and daily trend show labeled counts below the fold", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: "2026-09-14", results: [], forms: [] }) }),
      );
      const todayA = {
        姓名: "甲", 電話: "0910000101", 科系: "歷史學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:00:00.000Z",
      };
      const todayB = {
        姓名: "乙", 電話: "0910000102", 科系: "會計學系", 年級: "大二", 遊戲關主: "柏能",
        _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T02:00:00.000Z",
      };
      const yesterday = {
        姓名: "丙", 電話: "0910000103", 科系: "中國文學學系", 年級: "大一", 遊戲關主: "安倢",
        _submissionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-13T03:00:00.000Z",
      };
      await page.route("**/api/admin/recruitment**", (route) => route.fulfill({
        json: buildRecruitmentDashboard({
          date: "2026-09-14",
          gameRows: [todayA, todayB, yesterday],
          recruitmentRows: [{
            時間戳記: "2026/9/14 下午 3:00:00",
            同學的姓名: todayA.姓名,
            "同學電話/LINE": todayA.電話,
            報名了那個活動: "9/30茶會",
            是否入社: "是",
            保證金是否繳費: "是",
            "繳了多少呢?": "300",
            _gameSubmissionId: todayA._submissionId,
          }, {
            時間戳記: "2026/9/14 下午 3:30:00",
            同學的姓名: todayB.姓名,
            "同學電話/LINE": todayB.電話,
            報名了那個活動: "10/07演講",
            是否入社: "否",
            保證金是否繳費: "否",
            _gameSubmissionId: todayB._submissionId,
          }, {
            時間戳記: "2026/9/13 下午 3:00:00",
            同學的姓名: yesterday.姓名,
            "同學電話/LINE": yesterday.電話,
            報名了那個活動: "社課",
            是否入社: "是",
            保證金是否繳費: "否",
            _gameSubmissionId: yesterday._submissionId,
          }],
          masterRows: [],
        }),
      }));
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      const funnelHeading = page.getByRole("heading", { name: "招生漏斗" });
      const funnelBox = await funnelHeading.boundingBox();
      assert.ok(funnelBox && funnelBox.y >= 780, `funnel on first screen ${JSON.stringify(funnelBox)}`);
      await funnelHeading.scrollIntoViewIfNeeded();
      const funnel = page.locator(".battle-funnel");
      await funnel.getByText("遊戲接觸").waitFor();
      await funnel.getByText("活動報名").waitFor();
      await funnel.getByText("入社", { exact: true }).waitFor();
      await funnel.getByText("保證金").waitFor();
      assert.equal(await funnel.locator("li", { hasText: "遊戲接觸" }).locator("b").innerText(), "3");
      assert.equal(await funnel.locator("li", { hasText: "活動報名" }).locator("b").innerText(), "3");
      assert.equal(await funnel.locator("li", { hasText: "入社" }).locator("b").innerText(), "2");
      assert.equal(await funnel.locator("li", { hasText: "保證金" }).locator("b").innerText(), "1");
      const funnelLabels = await page.evaluate(() =>
        [...document.querySelectorAll(".battle-funnel-bar")].map((el) => el.getAttribute("aria-label")),
      );
      assert.deepEqual(funnelLabels, ["遊戲接觸 3 人", "活動報名 3 人", "入社 2 人", "保證金 1 人"]);
      await capture(page, "command-funnel-390");
      const trendHeading = page.getByRole("heading", { name: "近七日趨勢" });
      await trendHeading.scrollIntoViewIfNeeded();
      const trend = page.locator('[aria-label="近七日趨勢"]');
      const todayCol = trend.locator(".battle-trend-day", { hasText: "09/14" });
      await todayCol.getByText("接觸 2").waitFor();
      await todayCol.getByText("報名 2").waitFor();
      await todayCol.getByText("入社 1").waitFor();
      assert.equal(await todayCol.locator(".sr-only").count(), 0);
      const unlabeled = await page.evaluate(() =>
        [...document.querySelectorAll(".battle-ring, .battle-funnel-bar, .battle-bar, .battle-trend, .battle-trend-cols")]
          .filter((el) => !el.getAttribute("aria-label"))
          .map((el) => el.className),
      );
      assert.deepEqual(unlabeled, []);
      await capture(page, "command-trend-390");
      assert.equal(await page.getByText("分級", { exact: true }).count(), 0);
      assert.equal(await page.locator("text=submissionId").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("command home shows the next related person after picking a recruiter", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: "2026-09-14", results: [], forms: [] }) }),
      );
      const mine = {
        姓名: "關主的同學", 電話: "0910000001", 科系: "歷史學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:00:00.000Z",
      };
      const other = {
        姓名: "別人的同學", 電話: "0910000002", 科系: "資訊工程學系", 年級: "大二", 遊戲關主: "安倢",
        _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T02:00:00.000Z",
      };
      await page.route("**/api/admin/recruitment**", (route) => route.fulfill({
        json: buildRecruitmentDashboard({ date: "2026-09-14", gameRows: [mine, other], recruitmentRows: [], masterRows: [] }),
      }));
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      await page.getByRole("heading", { name: "現在該處理" }).waitFor();
      await page.getByRole("status").getByText("先選「這位有緣人的接引人」，這裡會出現你現在該找的同學。").waitFor();
      assert.equal(await page.getByRole("link", { name: "填寫正式資料" }).count(), 0);
      assert.equal(await page.locator(".admin-person-list").count(), 0);
      await page.getByLabel("這位有緣人的接引人").selectOption("柏能");
      const nextCard = page.locator(".battle-next-card").filter({ hasText: "關主的同學" });
      await nextCard.waitFor();
      assert.equal(await nextCard.locator("text=下一位").count(), 1);
      await nextCard.getByText("歷史學系", { exact: false }).waitFor();
      await nextCard.getByText("尚未填正式資料").waitFor();
      assert.equal(await page.getByRole("link", { name: "填寫正式資料" }).count(), 1);
      const nextForm = nextCard.getByRole("link", { name: "開啟表單" });
      await nextForm.waitFor();
      const nextFormHref = decodeURIComponent(String(await nextForm.getAttribute("href")));
      assert.match(nextFormHref, /\/viewform\?/);
      assert.doesNotMatch(nextFormHref, /forms\.gle/);
      assert.match(nextFormHref, /entry\.1318284482=柏能/);
      assert.match(nextFormHref, /關主的同學/);
      const nextFormBox = await nextForm.boundingBox();
      assert.ok(
        nextFormBox && nextFormBox.height >= 43.5 && nextFormBox.width >= 43.5,
        `open-form tap ${JSON.stringify(nextFormBox)}`,
      );
      await capture(page, "command-prefill-390");
      assert.equal(await page.getByText("別人的同學").count(), 0);
      const glance = [
        [/今日接觸/, "今日接觸"],
        [/累積接觸/, "累積接觸"],
        [/活動報名/, "活動報名"],
        [/最受歡迎活動/, "最受歡迎活動"],
        [/入社人數/, "入社"],
        [/已繳保證金/, "保證金"],
        [/待填正式資料/, "待填正式資料"],
      ];
      for (const [name, label] of glance) {
        const box = await page.getByRole("button", { name }).first().boundingBox();
        assert.ok(box, `${label} missing`);
        assert.ok(box.y + box.height <= 780, `${label} below fold ${JSON.stringify(box)}`);
      }
      assert.equal(await page.locator("text=submissionId").count(), 0);
      assert.equal(await page.getByText("分級", { exact: true }).count(), 0);
      await page.getByLabel("這位有緣人的接引人").selectOption("小哲");
      await page.getByRole("status").getByText(/目前沒有與「小哲」相關/).waitFor();
      await page.getByLabel("這位有緣人的接引人").selectOption("柏能");
      await page.getByRole("link", { name: "填寫正式資料" }).click();
      await page.getByRole("heading", { name: /這位有緣人的接引人/ }).waitFor();
      assert.match(page.url(), /\/follow-up\?personKey=/);
      assert.equal(await page.locator('[aria-label="submissionId"]').count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("same name different phones stay two people and show 需要確認", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: "2026-09-14", results: [], forms: [] }) }),
      );
      const first = {
        姓名: "林同學", 電話: "0911111111", 科系: "歷史學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:00:00.000Z",
      };
      const second = {
        姓名: "林同學", 電話: "0922222222", 科系: "會計學系", 年級: "大二", 遊戲關主: "柏能",
        _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T02:00:00.000Z",
      };
      await page.route("**/api/admin/recruitment**", (route) => route.fulfill({
        json: buildRecruitmentDashboard({ date: "2026-09-14", gameRows: [first, second], recruitmentRows: [], masterRows: [] }),
      }));
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      await page.getByLabel("這位有緣人的接引人").selectOption("柏能");
      const cards = page.locator(".battle-next-card").filter({ hasText: "林同學" });
      assert.equal(await cards.count(), 2);
      assert.equal(await page.getByText("需要確認").count() >= 2, true);
      await page.getByText("0911111111").waitFor();
      await page.getByText("0922222222").waitFor();
      await page.getByRole("status").getByText("還有 1 位同名待確認").waitFor();
      const secondBox = await cards.nth(1).boundingBox();
      assert.ok(secondBox.y + secondBox.height <= 760, `second card ${JSON.stringify(secondBox)}`);
      assert.equal(await page.locator("text=submissionId").count(), 0);
      await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "待處理", exact: true }).click();
      await page.getByRole("heading", { name: "待填正式招生資料" }).waitFor();
      const queue = page.getByRole("article").filter({ hasText: "林同學" });
      assert.equal(await queue.count(), 2);
      assert.equal(await page.getByText("同名不同電話，需要確認").count() >= 2, true);
      await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "名單", exact: true }).click();
      await page.getByRole("heading", { name: "招生名單" }).waitFor();
      assert.equal(await page.getByRole("article").filter({ hasText: "林同學" }).count(), 2);
      assert.equal(await page.getByText("需要確認").count() >= 2, true);
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("roster search stays visible while extra filters stay collapsed", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: "2026-09-14", results: [], forms: [] }) }),
      );
      const mine = {
        姓名: "關主的同學", 電話: "0910000001", 科系: "歷史學系", 年級: "大一", 遊戲關主: "柏能",
        _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:00:00.000Z",
      };
      const other = {
        姓名: "別人的同學", 電話: "0920000002", 科系: "資訊工程學系", 年級: "大二", 遊戲關主: "安倢",
        _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T02:00:00.000Z",
      };
      await page.route("**/api/admin/recruitment**", (route) => route.fulfill({
        json: buildRecruitmentDashboard({ date: "2026-09-14", gameRows: [mine, other], recruitmentRows: [], masterRows: [] }),
      }));
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "名單", exact: true }).click();
      await page.getByRole("heading", { name: "招生名單" }).waitFor();
      await page.getByRole("button", { name: "展開篩選" }).waitFor();
      assert.equal(await page.getByLabel("搜尋姓名或電話").isVisible(), true);
      assert.equal(await page.getByLabel("日期範圍").isVisible(), false);
      assert.equal(await page.getByLabel("篩選遊戲關主").isVisible(), false);
      assert.equal(await page.getByRole("article").filter({ hasText: "關主的同學" }).count(), 1);
      assert.equal(await page.getByRole("article").filter({ hasText: "別人的同學" }).count(), 1);
      await page.getByLabel("搜尋姓名或電話").fill("0920000002");
      assert.equal(await page.getByRole("article").filter({ hasText: "別人的同學" }).count(), 1);
      assert.equal(await page.getByRole("article").filter({ hasText: "關主的同學" }).count(), 0);
      await page.getByRole("button", { name: "展開篩選" }).click();
      assert.equal(await page.getByLabel("日期範圍").isVisible(), true);
      await page.getByRole("button", { name: "收合篩選" }).click();
      assert.equal(await page.getByLabel("搜尋姓名或電話").isVisible(), true);
      assert.equal(await page.getByLabel("日期範圍").isVisible(), false);
      await page.getByLabel("搜尋姓名或電話").fill("");
      await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "待處理", exact: true }).click();
      await page.getByRole("heading", { name: "待填正式招生資料" }).waitFor();
      await page.getByRole("button", { name: "看全部尚未填表" }).click();
      assert.equal(await page.getByLabel("搜尋姓名或電話").isVisible(), true);
      assert.equal(await page.getByLabel("篩選遊戲關主").isVisible(), false);
      await page.getByLabel("搜尋姓名或電話").fill("關主的同學");
      assert.equal(await page.getByRole("article").filter({ hasText: "關主的同學" }).count(), 1);
      assert.equal(await page.getByRole("article").filter({ hasText: "別人的同學" }).count(), 0);
      await capture(page, "roster-search-390");
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("command 看名單 keeps roster fill and recruiter filters at 不限", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => new URL(route.request().url()).origin !== origin
        ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
        : route.continue());
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard?*", (route) =>
        route.fulfill({ json: buildDashboard({ date: "2026-09-14", results: [], forms: [] }) }),
      );
      const pending = {
        姓名: "待填甲", 電話: "0910000001", 科系: "歷史學系", 年級: "大一", 遊戲關主: "安倢",
        _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T01:00:00.000Z",
      };
      const filled = {
        姓名: "已填乙", 電話: "0920000002", 科系: "資訊工程學系", 年級: "大二", 遊戲關主: "安倢",
        _submissionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", _kind: "official", _skipSave: false,
        遊戲時間: "2026-09-14T02:00:00.000Z",
      };
      await page.route("**/api/admin/recruitment**", (route) => route.fulfill({
        json: buildRecruitmentDashboard({
          date: "2026-09-14",
          gameRows: [pending, filled],
          recruitmentRows: [{
            時間戳記: "2026/9/14 下午 3:00:00",
            同學的姓名: filled.姓名,
            "同學電話/LINE": filled.電話,
            "接引人(可複選)": "小哲",
            報名了那個活動: "9/30茶會",
            是否入社: "是",
            保證金是否繳費: "是",
            _gameSubmissionId: filled._submissionId,
          }],
          masterRows: [],
        }),
      }));
      await page.goto(`${origin}/admin?view=contacts`);
      await page.getByRole("heading", { name: "招生名單" }).waitFor();
      assert.equal(await page.getByRole("article").filter({ hasText: "待填甲" }).count(), 1);
      assert.equal(await page.getByRole("article").filter({ hasText: "已填乙" }).count(), 1);
      await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "戰情", exact: true }).click();
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      await page.getByLabel("這位有緣人的接引人").selectOption("柏能");
      await page.getByRole("button", { name: "看名單" }).click();
      await page.getByRole("heading", { name: "招生名單" }).waitFor();
      assert.equal(await page.getByText("2 位 · 僅工作人員可見").count(), 1);
      assert.equal(await page.getByRole("article").filter({ hasText: "待填甲" }).count(), 1);
      assert.equal(await page.getByRole("article").filter({ hasText: "已填乙" }).count(), 1);
      const openFilters = page.getByRole("button", { name: "展開篩選" });
      if (await openFilters.count()) await openFilters.click();
      assert.equal(await page.getByLabel("篩選正式接引人").inputValue(), "");
      assert.equal(await page.getByLabel("是否已填正式資料").inputValue(), "");
      await page.getByLabel("是否已填正式資料").selectOption("yes");
      assert.equal(await page.getByRole("article").filter({ hasText: "已填乙" }).count(), 1);
      assert.equal(await page.getByRole("article").filter({ hasText: "待填甲" }).count(), 0);
      await page.getByLabel("是否已填正式資料").selectOption("");
      await page.getByLabel("篩選正式接引人").selectOption("小哲");
      assert.equal(await page.getByRole("article").filter({ hasText: "已填乙" }).count(), 1);
      assert.equal(await page.getByRole("article").filter({ hasText: "待填甲" }).count(), 0);
      await page.getByRole("article").filter({ hasText: "已填乙" }).getByRole("button", { name: "查看詳細" }).click();
      const filledSheet = page.getByRole("dialog");
      await filledSheet.getByRole("heading", { name: "已填乙" }).waitFor();
      const filledForm = filledSheet.getByRole("link", { name: /開啟正式招生表單/ });
      const filledBackoffice = filledSheet.getByRole("link", { name: /查看招生表單後台/ });
      assert.equal(await filledForm.count(), 1);
      assert.equal(await filledBackoffice.count(), 1);
      assert.match(decodeURIComponent(String(await filledForm.getAttribute("href"))), /\/viewform\?/);
      assert.doesNotMatch(decodeURIComponent(String(await filledForm.getAttribute("href"))), /entry\.1318284482=安倢/);
      assert.equal(await filledBackoffice.getAttribute("href"), "/admin?view=form");
      assert.doesNotMatch(await filledSheet.innerText(), /submissionId/);
      await capture(page, "sheet-filled-links-390");
      await capture(page, "roster-from-command-390");
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("mobile recruiter quick-fill uses viewform prefill and drops recruited students", async () => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", async (route) => {
        if (new URL(route.request().url()).origin !== origin) {
          await route.fulfill({ status: 200, body: "", contentType: "application/javascript" });
        } else await route.continue();
      });
      await page.route("**/api/result", (route) => route.fulfill({ json: { ok: true, saved: false } }));
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      const pendingStudent = {
        姓名: "待跟進甲",
        電話: "0911111111",
        科系: "歷史學系",
        年級: "大一",
        遊戲關主: "安倢",
        分數: 600,
        答對: 5,
        答錯: 0,
        正確率: 100,
        最佳連續: 5,
        遊戲秒數: 60,
        遊戲時間: "2026-09-14T06:32:00.000Z",
        _submissionId: "11111111-1111-4111-8111-111111111111",
        _kind: "official",
        _skipSave: false,
      };
      const submitted = [];
      await page.route("**/api/admin/recruitment**", async (route) => {
        if (route.request().method() === "POST") {
          submitted.push(route.request().postDataJSON());
          return route.fulfill({ json: { ok: true, duplicate: false, pending: [] } });
        }
        const date = new URL(route.request().url()).searchParams.get("date");
        const data = buildRecruitmentDashboard({
          date,
          gameRows: submitted.length ? [] : [pendingStudent],
          recruitmentRows: submitted.length ? [{
            同學的姓名: pendingStudent.姓名,
            "同學電話/LINE": pendingStudent.電話,
            _gameSubmissionId: pendingStudent._submissionId,
          }] : [],
          masterRows: [],
        });
        return route.fulfill({ json: data });
      });
      await page.goto(`${origin}/follow-up`);
      await page.getByRole("heading", { name: /這位有緣人的接引人/ }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.getByRole("button", { name: "柏能", exact: true }).click();
      await page.getByRole("status").getByText(/目前沒有與「柏能」相關/).waitFor();
      assert.equal(await page.getByRole("button", { name: "填寫正式資料" }).count(), 0);
      await page.getByRole("button", { name: "看全部尚未填表" }).click();
      await page.getByRole("button", { name: "填寫正式資料" }).click();
      assert.equal(await page.locator('[aria-label="submissionId"]').count(), 0);
      const href = await page.locator("[data-quickfill=open-form]").getAttribute("href");
      assert.match(String(href), /\/viewform\?/);
      assert.doesNotMatch(String(href), /forms\.gle/);
      assert.match(decodeURIComponent(String(href)), /同學|王小明|待跟進甲|entry\.887514514/);
      assert.match(decodeURIComponent(String(href)), /遊戲關主：安倢/);
      assert.match(decodeURIComponent(String(href)), /entry\.1318284482=柏能/);
      assert.doesNotMatch(decodeURIComponent(String(href)), /entry\.1318284482=安倢/);
      await page.getByRole("button", { name: "這位同學報名了哪個活動？ 9/30茶會" }).click();
      await page.getByRole("button", { name: "是否入社 否" }).click();
      await page.getByRole("button", { name: "保證金是否繳費 否" }).click();
      const submit = page.locator("[data-quickfill=submit]");
      const tap = await submit.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { height: box.height, width: box.width };
      });
      assert.ok(tap.height >= 44);
      await submit.click();
      await page.getByRole("status").filter({ hasText: "已送出招生資料" }).waitFor();
      assert.equal(submitted.length, 1);
      assert.equal(submitted[0].recruiter, "柏能");
      assert.equal(submitted[0].submissionId, pendingStudent._submissionId);
      assert.equal(submitted[0].gameGatekeeper, "安倢");
      assert.equal(submitted[0].tier, undefined);
      assert.ok(submitted[0].activities.includes("9/30茶會"));
      assert.equal(await page.getByRole("button", { name: "填寫正式資料" }).count(), 0);
      const formLink = page.locator("[data-quickfill=open-form]");
      assert.equal(await formLink.count(), 1);
      const afterHref = decodeURIComponent(String(await formLink.getAttribute("href")));
      assert.match(afterHref, /\/viewform\?/);
      assert.doesNotMatch(afterHref, /forms\.gle/);
      assert.match(afterHref, /entry\.1318284482=柏能/);
      assert.match(afterHref, /遊戲關主：安倢/);
      assert.doesNotMatch(afterHref, /entry\.1318284482=安倢/);
      assert.doesNotMatch(await formLink.innerText(), /submissionId/);
      const backoffice = page.locator("[data-quickfill=open-backoffice]");
      assert.equal(await backoffice.count(), 1);
      assert.equal(await backoffice.getAttribute("href"), "/admin?view=form");
      await capture(page, "follow-up-390");
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test(
      "warmup, pointer-only scoring, expiry, retry and reload keep a single entry ID",
      async () => {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        });
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
        await page.locator("[data-screen=tutorial]").waitFor();
        await capture(page, "tutorial-meaning-mobile");
        await page.locator('[data-color="red"]').click();
        await page.locator(".tutorial-wrong").waitFor();
        assert.equal(submissions.length, 0);
        await page.locator('[data-color="blue"]').click();
        await page.locator('[data-tutorial-step="1"]').waitFor();
        await capture(page, "tutorial-visual-mobile");
        await page.locator('[data-color="yellow"]').click();
        await page.locator("[data-screen=game]").waitFor();
        await capture(page, "game-mobile");
        assert.equal(submissions.length, 0);
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
        const correctLabel = await page.locator(".stroop").innerText();
        const colors = { 紅: "red", 藍: "blue", 綠: "green", 黃: "yellow" };
        const initial = await state();
        for (const key of ["1", "2", "3", "4"]) await page.keyboard.press(key);
        assert.deepEqual(await state(), initial, "number keys must not answer");
        await page.locator(".ans").first().click({ button: "right" });
        await page.locator(".ans").first().click({ button: "middle" });
        assert.deepEqual(await state(), initial, "non-primary pointer buttons must not answer");
        await page.locator(".ans").first().focus();
        await page.keyboard.press("Enter");
        assert.deepEqual(await state(), initial, "button keys must not answer");
        const correctAnswer = page.locator(`.ans[data-color="${colors[correctLabel]}"]`);
        await correctAnswer.dispatchEvent("pointerdown", {
          button: 0,
          isPrimary: true,
          pointerId: 41,
          pointerType: "touch",
        });
        await page.locator(".ans").first().dispatchEvent("pointerdown", {
          button: 0,
          isPrimary: false,
          pointerId: 42,
          pointerType: "touch",
        });
        await page.locator(".ans").first().dispatchEvent("pointerup", {
          button: 0,
          isPrimary: false,
          pointerId: 42,
          pointerType: "touch",
        });
        await correctAnswer.dispatchEvent("pointerup", {
          button: 0,
          isPrimary: true,
          pointerId: 41,
          pointerType: "touch",
        });
        assert.equal((await state()).score, 100);
        await page.clock.runFor(100);
        const touchLabel = await page.locator(".stroop").innerText();
        const beforeTouch = await state();
        await page.locator(`.ans[data-color="${colors[touchLabel]}"]`).tap();
        const afterTouch = await state();
        assert.equal(afterTouch.seq, beforeTouch.seq + 1, "touch must answer");
        await page.clock.runFor(100);
        const beforeClick = await state();
        await page.locator(".ans").first().click();
        assert.equal((await state()).seq, beforeClick.seq + 1, "primary mouse click must answer");
        await page.clock.runFor(100);
        const before = await state();
        const box = await page.locator(".ans").first().boundingBox();
        assert.ok(box);
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        const after = await state();
        assert.equal(after.seq, before.seq + 1, "double tap cannot score a second time");
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
