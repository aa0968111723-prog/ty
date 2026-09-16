import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { buildDashboard } from "../src/lib/club/admin.mjs";
import { buildRecruitmentDashboard } from "../src/lib/club/recruitment.mjs";
import { DEFAULT_SETTINGS } from "../src/lib/club/runtime.mjs";

const base = process.env.CLUB_BROWSER_URL;
function paidDepositMasterRows() {
  return [
    {
      接引日期: "9/12",
      "接引人(可複選)": "安倢",
      同學的姓名: "已繳保證金甲",
      科系: "歷史學系",
      年級: "大一",
      是否入社: "否",
      保證金是否繳費: "是",
      繳了多少: "300",
      "同學電話/LINE": "0912000601",
    },
    {
      接引日期: "9/12",
      "接引人(可複選)": "安倢",
      同學的姓名: "已繳保證金乙",
      科系: "資訊工程學系",
      年級: "大二",
      是否入社: "否",
      保證金是否繳費: "是",
      繳了多少: "300",
      "同學電話/LINE": "0912000602",
    },
  ];
}
async function capture(page, name) {
  if (!process.env.CLUB_QA_DIR) return;
  mkdirSync(process.env.CLUB_QA_DIR, { recursive: true });
  await page.screenshot({ path: join(process.env.CLUB_QA_DIR, name + ".png"), fullPage: true });
}

async function assertPendingActionButtons(page) {
  const pendingActions = page.locator("[data-pending-action]");
  assert.equal(await pendingActions.count(), 2);
  const actionMetrics = await pendingActions.evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect();
      const parent = el.parentElement?.getBoundingClientRect();
      const label = el.querySelector("span");
      const labelBox = label?.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        height: box.height,
        width: box.width,
        parentWidth: parent?.width ?? 0,
        labelHeight: labelBox?.height ?? 0,
        nowrap: style.whiteSpace === "nowrap",
        text: label?.textContent || el.textContent || "",
      };
    }),
  );
  for (const row of actionMetrics) {
    assert.ok(row.height >= 44, `${row.text} height ${row.height}`);
    assert.ok(row.width + 1 >= row.parentWidth, `${row.text} width ${row.width} / ${row.parentWidth}`);
    assert.ok(row.labelHeight <= 28, `${row.text} wrapped at ${row.labelHeight}px`);
    assert.equal(row.nowrap, true);
  }
  assert.equal(actionMetrics.map((row) => row.text).join(), "接引人快速填表,打開正式表單");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
async function assertWarCardLabels(page) {
  const labels = page.locator(".war-card .war-card-label");
  await labels.first().waitFor();
  const metrics = await labels.evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        text: el.textContent?.trim() || "",
        height: box.height,
        nowrap: style.whiteSpace === "nowrap",
      };
    }),
  );
  assert.deepEqual(metrics.map((row) => row.text), ["接觸", "活動", "入社", "保證金"]);
  for (const row of metrics) {
    assert.ok(row.height <= 20, `${row.text} wrapped at ${row.height}px`);
    assert.equal(row.nowrap, true);
  }
  const hints = await page.locator(".war-card .war-card-hint").evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        text: el.textContent?.trim() || "",
        height: box.height,
        nowrap: style.whiteSpace === "nowrap",
        clipped: el.scrollWidth > el.clientWidth + 1,
      };
    }),
  );
  assert.equal(hints[1]?.text, "報名");
  assert.equal(hints[2]?.text, "招生表");
  assert.equal(hints[3]?.text, "$600");
  assert.notEqual(hints[3]?.text, "需確認");
  assert.equal(hints[3]?.nowrap, true);
  assert.equal(hints[3]?.clipped, false);
  for (const row of [hints[1], hints[2], hints[3]]) {
    assert.ok(row.height <= 20, `${row.text} hint wrapped at ${row.height}px`);
    assert.equal(row.nowrap, true);
    assert.equal(row.clipped, false, `${row.text} clipped`);
  }
  assert.ok(await page.getByText("保證金以正式表單勾選為準").count());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.equal(await page.getByText("分級").count(), 0);
  assert.equal(await page.getByText("S／A／B").count(), 0);
}
async function assertAdminSafeCopy(page) {
  const text = await page.locator("body").innerText();
  assert.equal(text.includes("分級"), false);
  assert.equal(text.includes("S／A／B"), false);
  assert.equal(/submissionId/i.test(text), false);
  assert.equal(text.includes("BEGIN PRIVATE"), false);
  assert.equal(text.includes("GOOGLE_PRIVATE_KEY"), false);
  assert.equal(text.includes("googleapis"), false);
}
async function mockAdminApis(page, { recruitmentMode }) {
  await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route("**/api/admin/dashboard**", (route) => {
    const date = new URL(route.request().url()).searchParams.get("date") || "2026-09-16";
    return route.fulfill({ json: buildDashboard({ date, results: [], forms: [] }) });
  });
  await page.route("**/api/admin/recruitment**", (route) => {
    const date = new URL(route.request().url()).searchParams.get("date") || "2026-09-16";
    if (recruitmentMode() === "fail") {
      return route.fulfill({
        status: 500,
        json: { error: "GOOGLE_PRIVATE_KEY -----BEGIN PRIVATE KEY----- leaked" },
      });
    }
    if (recruitmentMode() === "empty") {
      return route.fulfill({
        json: buildRecruitmentDashboard({
          date,
          gameRows: [],
          recruitmentRows: [],
          masterRows: [],
        }),
      });
    }
    return route.fulfill({ status: 401, json: { error: "請先登入管理後台" } });
  });
}
async function assertFailShell(page, navName) {
  await page.locator("[data-war-room=home][data-war-state=error]").waitFor();
  await page.locator("[data-sync-state=fail]").first().waitFor();
  assert.ok(await page.getByText("失敗", { exact: true }).count());
  assert.ok(await page.getByText(/最後同步/).count());
  assert.ok(await page.getByRole("button", { name: "再試一次" }).count());
  const nav = page.getByRole("navigation", { name: navName, exact: true });
  assert.equal(await nav.getByRole("button").count(), 4);
  await nav.getByRole("button", { name: "戰情", exact: true }).waitFor();
  await nav.getByRole("button", { name: "待處理", exact: true }).waitFor();
  await nav.getByRole("button", { name: "名單", exact: true }).waitFor();
  await nav.getByRole("button", { name: "更多", exact: true }).waitFor();
  const labels = await page.locator(".war-card .war-card-label").allTextContents();
  assert.deepEqual(labels.map((value) => value.trim()), ["接觸", "活動", "入社", "保證金"]);
  await assertAdminSafeCopy(page);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
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
              masterRows: paidDepositMasterRows(),
            }),
          });
        });
        await page.goto(`${origin}/admin`);
        await page.getByLabel("查詢日期").fill("2026-09-12");
        await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
        await page.locator("[data-war-room=home]").waitFor();
        await assertWarCardLabels(page);
        assert.equal(await page.getByText("分級").count(), 0);
        assert.equal(await page.getByText("S／已報名").count(), 0);
        assert.equal(await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button").count(), 4);
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "戰情", exact: true }).click();
        await page.getByRole("heading", { name: "各活動報名" }).waitFor();
        await capture(page, `recruitment-${width}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "待處理", exact: true }).click();
        await page.getByRole("heading", { name: "待填正式資料" }).waitFor();
        await page.locator("[data-pending-action=form]").scrollIntoViewIfNeeded();
        await assertPendingActionButtons(page);
        await capture(page, `pending-${width}`);
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "名單", exact: true }).click();
        await page.getByRole("heading", { name: "名單", level: 1 }).waitFor();
        await page.getByRole("button", { name: "更多", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "表單資料" }).click();
        await page.getByLabel("篩選來源").selectOption("Google Form");
        assert.equal(await page.locator(".admin-person-list article").count(), 1);
        await page.getByRole("button", { name: "更多", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "今日排行榜" }).click();
        assert.equal(await page.locator(".admin-podium li").count(), 1);
        if (width === 390) await capture(page, "admin-today-board-390");
        await page.getByLabel("查詢日期").fill("2026-09-11");
        await page.getByText("尚無正式挑戰紀錄").waitFor();
        await page.goto(`${origin}/admin?view=pinned`);
        await page.getByRole("heading", { name: "我的釘選" }).waitFor();
        await page.locator(".admin-pinned-grid [data-widget]").first().waitFor();
        assert.equal(new URL(page.url()).searchParams.get("view"), "pinned");
        assert.ok((await page.locator(".admin-pinned-grid [data-widget]").count()) > 0);
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
        await assertScroll("admin");
        await capture(page, `admin-${width}`);
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
      const session = { authenticated: false, passwordEnabled: true, googleEnabled: true };
      await page.route("**/api/admin/session", route => route.fulfill({ json: session }));
      await page.route("**/api/admin/login", route => route.fulfill({ status: 401, json: { error: "密碼錯誤" } }));
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "管理員登入" }).waitFor();
      await page.getByLabel("管理員密碼").waitFor();
      await page.getByRole("link", { name: "使用 Google 登入" }).waitFor();
      assert.equal(await page.locator(".admin-error").count(), 0);
      await page.getByLabel("管理員密碼").fill("ui-test-only");
      await page.getByRole("button", { name: "登入後台" }).click();
      await page.getByRole("alert").waitFor();
      session.authenticated = true;
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
      await page.route("**/api/admin/recruitment?*", route => {
        const date = new URL(route.request().url()).searchParams.get("date");
        return route.fulfill({ json: buildRecruitmentDashboard({
          date,
          gameRows: [{
            姓名: "介面測試待填",
            電話: "0910000000",
            科系: "歷史學系",
            年級: "大一",
            遊戲關主: "柏能",
            遊戲時間: `${date}T01:00:00.000Z`,
            _submissionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            _kind: "official",
            _skipSave: false,
          }],
          recruitmentRows: [],
          masterRows: paidDepositMasterRows(),
        }) });
      });
      await page.getByRole("button", { name: "登入後台" }).click();
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      await page.locator("[data-war-room=home]").waitFor();
      await assertWarCardLabels(page);
      assert.equal(await page.locator(".admin-widget-tools").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await capture(page, "admin-desktop");
      await page.getByRole("navigation", { name: "後台導覽", exact: true }).getByRole("button", { name: "待處理" }).click();
      await page.getByRole("heading", { name: "待填正式資料" }).waitFor();
      await page.locator("[data-pending-action=form]").scrollIntoViewIfNeeded();
      await assertPendingActionButtons(page);
      await capture(page, "pending-desktop");
      await page.getByRole("navigation", { name: "後台導覽", exact: true }).getByRole("button", { name: "更多" }).click();
      await page.getByRole("dialog").getByRole("heading", { name: "更多" }).waitFor();
      await capture(page, "admin-more-desktop");
      await page.getByRole("dialog").getByRole("button", { name: "今日排行榜" }).click();
      await page.getByRole("heading", { name: "今日排行榜", level: 1 }).waitFor();
      await capture(page, "admin-today-board-desktop");
      await page.getByRole("navigation", { name: "後台導覽", exact: true }).getByRole("button", { name: "更多" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "表單資料" }).click();
      assert.equal(await page.getByLabel("篩選來源").inputValue(), "Google Form");
      await page.getByRole("navigation", { name: "後台導覽", exact: true }).getByRole("button", { name: "名單" }).click();
      assert.equal(await page.getByRole("heading", { name: "名單", level: 1 }).count(), 1);
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("admin keeps war-room shell on recruitment failure, empty roster, and expired session", async () => {
      let recruitmentMode = "fail";
      const runViewport = async (width, height, navName, shots) => {
        const context = await browser.newContext({
          viewport: { width, height },
          ...(width <= 430 ? { isMobile: true, hasTouch: true } : {}),
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/*", (route) =>
          new URL(route.request().url()).origin !== origin
            ? route.fulfill({ status: 200, body: "", contentType: "application/javascript" })
            : route.continue(),
        );
        await mockAdminApis(page, { recruitmentMode: () => recruitmentMode });
        recruitmentMode = "fail";
        await page.goto(`${origin}/admin`);
        await assertFailShell(page, navName);
        await page.locator(".war-sync [data-sync-retry]").click();
        await page.locator("[data-war-room=home][data-war-state=error]").waitFor();
        await capture(page, shots.fail);
        recruitmentMode = "empty";
        await page.locator(".war-sync [data-sync-retry]").click();
        await page.locator("[data-war-room=home]:not([data-war-state])").waitFor();
        await page.getByRole("navigation", { name: navName, exact: true }).getByRole("button", { name: "名單", exact: true }).click();
        await page.locator("[data-empty=roster]").waitFor();
        assert.ok(await page.getByText("目前還沒有名單").count());
        await assertAdminSafeCopy(page);
        await capture(page, shots.empty);
        recruitmentMode = "auth";
        await page.route("**/api/admin/dashboard**", (route) =>
          route.fulfill({ status: 401, json: { error: "請先登入管理後台" } }),
        );
        await page.getByRole("button", { name: "更新資料" }).click();
        await page.locator("[data-login-state=expired]").waitFor();
        assert.match(await page.locator("[data-login-state=expired]").innerText(), /登入已失效，請重新登入/);
        await assertAdminSafeCopy(page);
        if (shots.expired) await capture(page, shots.expired);
        assert.deepEqual(errors, []);
        await context.close();
      };
      await runViewport(390, 844, "手機後台導覽", {
        fail: "admin-fail-390",
        empty: "admin-empty-390",
        expired: "admin-expired-390",
      });
      await runViewport(1280, 800, "後台導覽", {
        fail: "admin-fail-desktop",
        empty: "admin-empty-desktop",
      });
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
      await page.getByRole("button", { name: "跟進這位同學" }).click();
      assert.equal(await page.locator('[aria-label="submissionId"]').count(), 0);
      const href = await page.locator("[data-quickfill=open-form]").getAttribute("href");
      assert.match(String(href), /\/viewform\?/);
      assert.doesNotMatch(String(href), /forms\.gle/);
      assert.match(decodeURIComponent(String(href)), /同學|王小明|待跟進甲|entry\.887514514/);
      assert.match(decodeURIComponent(String(href)), /遊戲關主：安倢/);
      assert.match(String(href), /entry\.1318284482=/);
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
      assert.equal(await page.getByRole("button", { name: "跟進這位同學" }).count(), 0);
      assert.equal(await page.locator("[data-quickfill=open-form]").count(), 0);
      const backoffice = page.locator("[data-quickfill=open-backoffice]");
      assert.equal(await backoffice.count(), 1);
      assert.equal(await backoffice.getAttribute("href"), "/admin?view=today");
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
