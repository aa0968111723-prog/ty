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
                遊戲時間: `${date}T09:00:00+08:00`,
                _submissionId: result.submissionId,
              }],
              recruitmentRows: [],
              masterRows: [],
            }),
          });
        });
        await page.goto(`${origin}/admin`);
        await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
        assert.equal(await page.getByLabel("查詢日期").count(), 0);
        await page.locator("[data-battle-kpi=today]").waitFor();
        const homeText = await page.locator(".battle-home").innerText();
        assert.equal(homeText.includes("分級"), false);
        assert.equal(/S（已報名）|A（有興趣|B（還好/.test(homeText), false);
        assert.match(homeText, /最後同步/);
        assert.match(homeText, /同步成功|等待同步|同步失敗/);
        assert.doesNotMatch(homeText, /同步正常/);
        await capture(page, `recruitment-${width}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "待處理", exact: true }).click();
        await page.getByRole("heading", { level: 1, name: "待處理" }).waitFor();
        await page.getByRole("link", { name: "填寫正式資料" }).waitFor();
        assert.equal(await page.locator('[aria-label="submissionId"]').count(), 0);
        assert.match(await page.locator(".recruitment-pending").innerText(), /遊戲關主/);
        assert.ok(await page.getByRole("link", { name: /開啟正式招生表單/ }).count());
        assert.ok(await page.getByRole("button", { name: "查看詳細資料" }).count());
        assert.match(await page.getByRole("heading", { name: "這位有緣人的接引人" }).innerText(), /這位有緣人的接引人/);
        assert.equal(await page.locator(".recruiter-compact select").count(), 1);
        assert.ok(
          await page.evaluate(() => {
            const link = document.querySelector(".recruitment-pending a.admin-primary");
            if (!link) return false;
            const box = link.getBoundingClientRect();
            const nav = document.querySelector(".admin-bottom-nav");
            const navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
            return box.top >= 0 && box.bottom <= navTop + 1;
          }),
          "填寫正式資料 must sit in the first thumb viewport",
        );
        const pendingBefore = await page.locator(".recruitment-pending article").count();
        assert.ok(pendingBefore >= 1);
        await page.getByRole("button", { name: "標記已處理" }).first().click();
        await page.waitForFunction(
          (count) => document.querySelectorAll(".recruitment-pending article").length === count - 1
            || document.body.innerText.includes("目前沒有待處理同學"),
          pendingBefore,
        );
        assert.equal(await page.locator(".recruitment-pending article").count(), pendingBefore - 1);
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "名單", exact: true }).click();
        await page.getByRole("heading", { level: 1, name: "名單" }).waitFor();
        await page.getByLabel("搜尋姓名或電話").waitFor();
        assert.equal(await page.getByRole("button", { name: "全部", exact: true }).count(), 0);
        assert.equal(await page.locator(".recruitment-filters").evaluate((el) => getComputedStyle(el).display), "none");
        await page.getByRole("button", { name: "篩選" }).click();
        await page.getByRole("button", { name: "全部", exact: true }).waitFor();
        await page.getByLabel("篩選遊戲關主").waitFor({ state: "visible" });
        await page.getByLabel("正式表單是否已填").waitFor({ state: "visible" });
        assert.ok(
          await page.evaluate(() => {
            const nav = document.querySelector(".admin-bottom-nav");
            const filters = document.querySelector(".recruitment-filters");
            if (!filters) return false;
            const navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
            return filters.getBoundingClientRect().bottom <= navTop + 1
              && document.documentElement.scrollWidth <= innerWidth + 1;
          }),
          "expanded roster filters must sit above the tab bar",
        );
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "更多", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "我的釘選", exact: true }).click();
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
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "更多", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "表單資料", exact: true }).click();
        await page.getByLabel("查詢日期").fill("2026-09-12");
        await page.getByLabel("篩選來源").selectOption("Google Form");
        await page.locator(".admin-person-list article").waitFor();
        assert.equal(await page.locator(".admin-person-list article").count(), 1);
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "更多", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "比賽成績", exact: true }).click();
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
        assert.equal(await page.getByLabel("篩選遊戲關主").inputValue(), "柏能");
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "更多", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "表單資料", exact: true }).click();
        await page.getByLabel("查詢日期").fill("2026-09-11");
        await page.getByText("沒有符合條件的紀錄").waitFor();
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
      await page.route("**/api/admin/session", route => route.fulfill({ json: { authenticated: true } }));
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
      await page.getByRole("heading", { level: 1, name: "名單" }).waitFor();
      assert.equal(await page.getByLabel("篩選來源").count(), 0);
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("recruitment HTTP failure is 同步失敗, not empty-as-zero, and 401 returns to login", async () => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin !== origin
          ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
          : route.continue(),
      );
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
      await page.route("**/api/admin/dashboard**", (route) =>
        route.fulfill({
          json: buildDashboard({
            date: today,
            results: [],
            forms: [{ name: "表單同學", timestamp: `${today.replaceAll("-", "/")} 09:00`, gatekeeper: "小哲" }],
          }),
        }),
      );
      let recruitmentMode = "down";
      const student = {
        name: "同步甲",
        phone: "0912000000",
        department: "歷史學系",
        grade: "大一",
        gatekeeper: "柏能",
        completedAt: `${today}T01:00:00Z`,
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
      await page.route("**/api/admin/recruitment**", (route) => {
        if (recruitmentMode === "down") {
          return route.fulfill({ status: 502, json: { error: "無法讀取資料，請稍後重試" } });
        }
        if (recruitmentMode === "expired") {
          return route.fulfill({ status: 401, json: { error: "請先登入管理後台" } });
        }
        return route.fulfill({
          json: buildRecruitmentDashboard({
            date: today,
            gameRows: [{
              ...student,
              姓名: student.name,
              電話: student.phone,
              科系: student.department,
              年級: student.grade,
              遊戲關主: student.gatekeeper,
              遊戲時間: `${today}T09:00:00+08:00`,
              _submissionId: student.submissionId,
            }],
            recruitmentRows: [],
            masterRows: [],
          }),
        });
      });
      await page.goto(`${origin}/admin`);
      await page.getByRole("alert").waitFor();
      const firstFail = await page.locator("body").innerText();
      assert.match(firstFail, /同步失敗/);
      assert.doesNotMatch(firstFail, /目前沒有招生資料/);
      assert.equal(await page.locator(".battle-home").count(), 0);
      recruitmentMode = "ok";
      await page.getByRole("button", { name: "更新資料" }).click();
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      await page.locator("[data-battle-kpi=today]").waitFor();
      assert.match(await page.locator(".battle-home").innerText(), /同步成功/);
      recruitmentMode = "down";
      await page.getByRole("button", { name: "更新資料" }).click();
      await page.getByRole("alert").waitFor();
      const afterFail = await page.locator(".battle-home").innerText();
      assert.match(afterFail, /同步失敗/);
      assert.match(afterFail, /今日接觸/);
      assert.match(await page.locator("[data-battle-kpi=today]").innerText(), /1/);
      recruitmentMode = "expired";
      await page.getByRole("button", { name: "更新資料" }).click();
      await page.getByRole("heading", { name: "管理員登入" }).waitFor();
      assert.match(await page.locator("body").innerText(), /管理員登入/);
      assert.equal(await page.locator(".battle-home").count(), 0);
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
      assert.equal(await page.locator(".recruiter-compact select").count(), 1);
      assert.equal(await page.locator(".quickfill-partners button").count(), 0);
      assert.doesNotMatch(await page.locator("body").innerText(), /我是那一個接引人/);
      assert.match(await page.getByRole("heading", { name: "這位有緣人的接引人" }).innerText(), /^這位有緣人的接引人$/);
      const selectHeight = await page.locator(".recruiter-compact select").evaluate((el) => el.getBoundingClientRect().height);
      assert.ok(selectHeight >= 44, `recruiter select must be at least 44px, got ${selectHeight}`);
      await page.getByLabel("選擇接引夥伴").selectOption("柏能");
      await page.getByRole("button", { name: "填寫正式資料" }).click();
      assert.equal(await page.locator('[aria-label="submissionId"]').count(), 0);
      const href = await page.locator("[data-quickfill=open-form]").getAttribute("href");
      assert.match(String(href), /\/viewform\?/);
      assert.doesNotMatch(String(href), /forms\.gle/);
      assert.match(decodeURIComponent(String(href)), /同學|王小明|待跟進甲|entry\.887514514/);
      assert.match(decodeURIComponent(String(href)), /遊戲關主：安倢/);
      assert.match(String(href), /entry\.1318284482=/);
      const backofficeWhileFilling = page.locator("[data-quickfill=open-backoffice]");
      assert.equal(await backofficeWhileFilling.count(), 1);
      assert.match(
        String(await backofficeWhileFilling.getAttribute("href")),
        /docs\.google\.com\/forms\/d\/12fk5ubMY0fnCSSTEljFJ1l-gcao1hDMkw7F8I8qTlOw\/edit/,
      );
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
      await page.getByRole("status").waitFor();
      assert.equal(submitted.length, 1);
      assert.equal(submitted[0].recruiter, "柏能");
      assert.equal(submitted[0].submissionId, pendingStudent._submissionId);
      assert.equal(submitted[0].gameGatekeeper, "安倢");
      assert.equal(submitted[0].tier, undefined);
      assert.ok(submitted[0].activities.includes("9/30茶會"));
      assert.equal(await page.getByRole("button", { name: "填寫正式資料" }).count(), 0);
      assert.equal(await page.locator("[data-quickfill=open-form]").count(), 1);
      const backoffice = page.locator("[data-quickfill=open-backoffice]");
      assert.equal(await backoffice.count(), 1);
      assert.match(String(await backoffice.getAttribute("href")), /docs\.google\.com\/forms\/d\//);
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
