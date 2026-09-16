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
  const card = page.locator(".recruitment-pending article").first();
  await card.waitFor();
  await page.waitForFunction(() => {
    const nav = document.querySelector(".admin-bottom-nav");
    const article = document.querySelector(".recruitment-pending article");
    if (!article) return false;
    const actions = [...article.querySelectorAll(".recruitment-actions a, .recruitment-actions button")];
    if (actions.length < 4) return false;
    if (!nav || getComputedStyle(nav).display === "none") return true;
    const navTop = nav.getBoundingClientRect().top;
    return actions.every((el) => {
      const box = el.getBoundingClientRect();
      return box.height >= 44 && box.bottom <= navTop + 1;
    });
  });
  const actionMetrics = await page.evaluate(() => {
    const nav = document.querySelector(".admin-bottom-nav");
    const navHidden = !nav || getComputedStyle(nav).display === "none";
    const navTop = navHidden ? null : nav.getBoundingClientRect().top;
    const article = document.querySelector(".recruitment-pending article");
    return [...(article?.querySelectorAll(".recruitment-actions a, .recruitment-actions button") ?? [])].map((el) => {
      const box = el.getBoundingClientRect();
      const parent = el.parentElement?.getBoundingClientRect();
      const label = el.querySelector("span");
      const labelBox = label?.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        height: box.height,
        width: box.width,
        top: box.top,
        bottom: box.bottom,
        parentWidth: parent?.width ?? 0,
        labelHeight: labelBox?.height ?? 0,
        nowrap: style.whiteSpace === "nowrap",
        text: (label?.textContent || el.textContent || "").replace(/\s+/g, ""),
        navTop,
        clearsNav: navTop == null || box.bottom <= navTop + 1,
        fullyOnScreen: box.top >= 0 && box.bottom <= innerHeight + 1,
      };
    });
  });
  assert.deepEqual(
    actionMetrics.map((row) => row.text),
    ["填寫正式資料", "開啟表單", "標記已處理", "查看詳細資料"],
  );
  for (const row of actionMetrics) {
    assert.ok(row.height >= 44, `${row.text} height ${row.height}`);
    assert.ok(row.width + 1 >= row.parentWidth, `${row.text} width ${row.width} / ${row.parentWidth}`);
    assert.ok(row.labelHeight <= 28, `${row.text} wrapped at ${row.labelHeight}px`);
    assert.equal(row.nowrap, true);
    assert.equal(row.clearsNav, true, `${row.text} overlaps tab bar ${row.bottom} > ${row.navTop}`);
  }
  const last = actionMetrics.at(-1);
  assert.ok(last, "missing 查看詳細資料");
  assert.equal(last.clearsNav, true, `查看詳細資料 overlaps tab bar ${last.bottom} > ${last.navTop}`);
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
              topThree: [
                { rank: 1, displayName: "王○明", score: 3600, accuracy: 100, title: "Lv.4 卓越領袖", time: "18:00" },
                { rank: 2, displayName: "李○", score: 2500, accuracy: 90, title: "Lv.3 穩定領航者", time: "17:00" },
                { rank: 3, displayName: "陳○安", score: 1800, accuracy: 80, title: "Lv.2 潛力領袖", time: "16:00" },
              ],
              rows: [
                { rank: 1, displayName: "王○明", score: 3600, accuracy: 100, title: "Lv.4 卓越領袖", time: "18:00" },
                { rank: 2, displayName: "李○", score: 2500, accuracy: 90, title: "Lv.3 穩定領航者", time: "17:00" },
                { rank: 3, displayName: "陳○安", score: 1800, accuracy: 80, title: "Lv.2 潛力領袖", time: "16:00" },
                { rank: 4, displayName: "林○", score: 1600, accuracy: 78, title: "Lv.2 潛力領袖", time: "15:00" },
                { rank: 5, displayName: "黃○", score: 1400, accuracy: 70, title: "Lv.1 心靈修煉者", time: "14:00" },
                { rank: 6, displayName: "張○", score: 1200, accuracy: 66, title: "Lv.1 心靈修煉者", time: "13:00" },
              ],
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
        await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
        await page.locator(".war-kpis").waitFor();
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "戰情", exact: true }).click();
        await capture(page, `recruitment-${width}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.equal(await page.getByText("分級", { exact: false }).count(), 0);
        assert.equal(await page.getByText("S/A/B").count(), 0);
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "待處理", exact: true }).click();
        await page.getByRole("heading", { name: "待處理有緣人" }).waitFor();
        await page.getByRole("button", { name: "柏能", exact: true }).click();
        const fill = page.getByRole("link", { name: "填寫正式資料" }).first();
        await fill.waitFor();
        const navBox = await page.getByRole("navigation", { name: "手機後台導覽" }).boundingBox();
        const actions = [
          fill,
          page.getByRole("link", { name: /開啟表單/ }).first(),
          page.getByRole("button", { name: "標記已處理", exact: true }),
          page.getByRole("button", { name: "查看詳細資料", exact: true }),
        ];
        for (const action of actions) {
          const box = await action.boundingBox();
          const label = (await action.innerText()).replace(/\s+/g, " ");
          assert.ok(box && navBox, label);
          assert.ok(box.height >= 44, `${label} height ${box.height}`);
          assert.ok(
            box.y >= 0 && box.y + box.height <= navBox.y + 1,
            `${label} must sit above the bottom nav: action=${JSON.stringify(box)} nav=${JSON.stringify(navBox)}`,
          );
        }
        assert.ok(await page.getByText("這位有緣人的接引人").count());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await capture(page, `admin-${width}`);
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "更多", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "我的釘選", exact: true }).click();
        await page.getByRole("heading", { name: "我的釘選" }).first().waitFor();
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
        await page.getByRole("heading", { name: "表單資料" }).first().waitFor();
        await Promise.all([
          page.waitForResponse((response) =>
            response.url().includes("/api/admin/dashboard") && response.url().includes("date=2026-09-12"),
          ),
          page.getByLabel("查詢日期").fill("2026-09-12"),
        ]);
        await page.getByLabel("篩選來源").selectOption("Google Form");
        await page.locator(".admin-person-list article").waitFor();
        assert.equal(await page.locator(".admin-person-list article").count(), 1);
        assert.equal(await page.getByText("submissionId").count(), 0);
        await page.getByRole("navigation", { name: "手機後台導覽" }).getByRole("button", { name: "更多", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "比賽成績", exact: true }).click();
        assert.equal(
          await page.locator(".admin-person-list article").count(),
          1,
          "hidden form-source filter must not hide results",
        );
        await page.getByRole("button", { name: "查看今日排行榜" }).click();
        await page.getByRole("heading", { name: "今日排行榜" }).first().waitFor();
        await page.goto(`${origin}/admin?view=pinned`);
        await page.getByRole("heading", { name: "我的釘選" }).first().waitFor();
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
      let sessionAuthenticated = false;
      await page.route("**/api/admin/session", route => route.fulfill({
        json: { authenticated: sessionAuthenticated, passwordEnabled: true, googleEnabled: true },
      }));
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
      await page.route("**/api/admin/dashboard**", route => {
        const date = new URL(route.request().url()).searchParams.get("date");
        return route.fulfill({ json: buildDashboard({
          date, results: [], forms: [
            { name: "介面測試 A", timestamp: `${date} 09:00`, gatekeeper: "柏能" },
            { name: "介面測試 B", timestamp: `${date} 10:00`, gatekeeper: "小哲" },
          ],
        }) });
      });
      await page.route("**/api/admin/recruitment**", route => {
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
      sessionAuthenticated = true;
      await page.getByRole("button", { name: "登入後台" }).click();
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      await page.locator(".war-kpis").waitFor();
      assert.equal(
        (await page.locator("[data-kpi=today-contacts] .war-num").innerText()).trim(),
        "0",
        "empty successful sync must show 0, not a missing mark",
      );
      assert.equal((await page.locator("[data-kpi=pending] .war-num").innerText()).trim(), "0");
      assert.equal(await page.locator(".admin-widget-tools").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await capture(page, "admin-desktop");
      await page.getByRole("navigation", { name: "更多後台導覽", exact: true }).getByRole("button", { name: "表單資料" }).click();
      assert.equal(await page.getByLabel("篩選來源").inputValue(), "Google Form");
      await page.getByRole("navigation", { name: "後台導覽", exact: true }).getByRole("button", { name: "名單" }).click();
      await page.getByRole("heading", { name: "名單" }).first().waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("recruitment sync failure still shows 今日招生戰情", async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route((url) => {
        try { return new URL(url).origin !== origin; } catch { return false; }
      }, async (route) => {
        await route.fulfill({ status: 200, body: "", contentType: "application/javascript" });
      });
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard**", (route) => {
        const date = new URL(route.request().url()).searchParams.get("date") || "2026-09-16";
        return route.fulfill({ json: buildDashboard({
          date,
          results: [{
            name: "部分資料",
            phone: "0900000001",
            department: "歷史學系",
            grade: "大一",
            gatekeeper: "柏能",
            completedAt: `${date}T04:00:00.000Z`,
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
          }],
          forms: [],
        }) });
      });
      await page.route("**/api/admin/recruitment**", (route) =>
        route.fulfill({ status: 503, json: { error: "同步失敗" } }),
      );
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      await page.locator(".war-kpis").waitFor();
      await page.getByRole("alert").waitFor();
      assert.match(await page.getByRole("alert").innerText(), /同步失敗/);
      assert.equal(
        (await page.locator("[data-kpi=today-contacts] .war-num").innerText()).trim(),
        "—",
        "sync failure must not look like zero contacts",
      );
      assert.equal((await page.locator("[data-kpi=all-contacts] .war-num").innerText()).trim(), "—");
      assert.equal((await page.locator("[data-kpi=pending] .war-num").innerText()).trim(), "—");
      const pendingKpi = await page.locator("[data-kpi=pending]").boundingBox();
      const navBox = await page.getByRole("navigation", { name: "手機後台導覽" }).boundingBox();
      assert.ok(pendingKpi && navBox);
      assert.ok(
        pendingKpi.y + pendingKpi.height <= navBox.y + 1,
        `待填 KPI must sit above the bottom nav: kpi=${JSON.stringify(pendingKpi)} nav=${JSON.stringify(navBox)}`,
      );
      assert.ok(await page.getByText("漏斗數字暫缺，不是 0 人").count());
      assert.ok(await page.getByText("今日接觸人數").count());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await capture(page, "admin-sync-failure-390");
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("war-room KPI click expands names then collapses", async () => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route((url) => {
        try { return new URL(url).origin !== origin; } catch { return false; }
      }, async (route) => {
        await route.fulfill({ status: 200, body: "", contentType: "application/javascript" });
      });
      const taipeiToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
      const student = {
        name: "測試同學",
        phone: "0900000000",
        department: "歷史學系",
        grade: "大一",
        gatekeeper: "柏能",
        completedAt: `${taipeiToday}T04:00:00.000Z`,
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
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard**", (route) => {
        const date = new URL(route.request().url()).searchParams.get("date") || taipeiToday;
        return route.fulfill({ json: buildDashboard({ date, results: [student], forms: [] }) });
      });
      await page.route("**/api/admin/recruitment**", (route) => {
        const date = new URL(route.request().url()).searchParams.get("date") || taipeiToday;
        return route.fulfill({
          json: buildRecruitmentDashboard({
            date,
            now: new Date(`${taipeiToday}T12:00:00+08:00`),
            gameRows: [{
              姓名: student.name,
              電話: student.phone,
              科系: student.department,
              年級: student.grade,
              遊戲關主: student.gatekeeper,
              遊戲時間: student.completedAt,
              _submissionId: student.submissionId,
              _kind: "official",
              _skipSave: false,
            }],
            recruitmentRows: [],
            masterRows: [],
          }),
        });
      });
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      const hit = page.locator("[data-kpi=today-contacts] .war-card-hit");
      const detail = page.locator("#today-contacts-detail");
      await hit.waitFor();
      assert.equal(await hit.getAttribute("aria-expanded"), "false");
      assert.equal(await detail.isVisible(), false);
      if (process.env.CLUB_QA_DIR) {
        await page.screenshot({ path: join(process.env.CLUB_QA_DIR, "war-kpi-today-closed-390-viewport.png") });
      }
      await capture(page, "war-kpi-today-closed-390");
      await hit.click();
      assert.equal(await hit.getAttribute("aria-expanded"), "true");
      assert.equal(await detail.isVisible(), true);
      assert.equal(await detail.getByText("測試同學", { exact: true }).count(), 1);
      const roster = detail.getByRole("button", { name: "到名單", exact: true });
      assert.equal(await roster.count(), 1);
      const rosterBox = await roster.boundingBox();
      assert.ok(rosterBox && rosterBox.height >= 44);
      assert.equal(await detail.getByText("0900000000").count(), 0);
      assert.equal(await detail.getByText("submissionId").count(), 0);
      assert.equal(await detail.getByText("分級").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (process.env.CLUB_QA_DIR) {
        await page.screenshot({ path: join(process.env.CLUB_QA_DIR, "war-kpi-today-open-390-viewport.png") });
      }
      await capture(page, "war-kpi-today-open-390");
      await hit.click();
      assert.equal(await hit.getAttribute("aria-expanded"), "false");
      assert.equal(await detail.isVisible(), false);
      const pendingHit = page.locator("[data-kpi=pending] .war-card-hit");
      const pendingDetail = page.locator("#pending-detail");
      await pendingHit.click();
      await pendingDetail.waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const btn = document.querySelector("#pending-detail .admin-primary");
        const nav = document.querySelector(".admin-bottom-nav");
        if (!btn || !nav) return false;
        const box = btn.getBoundingClientRect();
        const navBox = nav.getBoundingClientRect();
        return box.height >= 44 && box.bottom <= navBox.top + 1;
      });
      assert.equal(await pendingHit.getAttribute("aria-expanded"), "true");
      assert.equal(await pendingDetail.isVisible(), true);
      assert.equal(await pendingDetail.getByText("測試同學", { exact: true }).count(), 1);
      const goPending = pendingDetail.getByRole("button", { name: "去待處理", exact: true });
      assert.equal(await goPending.count(), 1);
      const pendingBtn = await goPending.boundingBox();
      const navBox = await page.getByRole("navigation", { name: "手機後台導覽" }).boundingBox();
      assert.ok(pendingBtn && navBox && pendingBtn.height >= 44);
      assert.ok(
        pendingBtn.y + pendingBtn.height <= navBox.y + 1,
        `去待處理 must sit above the bottom nav: action=${JSON.stringify(pendingBtn)} nav=${JSON.stringify(navBox)}`,
      );
      if (process.env.CLUB_QA_DIR) {
        await page.screenshot({ path: join(process.env.CLUB_QA_DIR, "war-kpi-pending-open-390-viewport.png") });
      }
      await capture(page, "war-kpi-pending-open-390");
      await pendingHit.click();
      assert.equal(await pendingHit.getAttribute("aria-expanded"), "false");
      assert.equal(await pendingDetail.isVisible(), false);
      assert.deepEqual(errors, []);
      await context.close();
    });
    await t.test("war-room 7-day trend shows visible counts on 390", async () => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route((url) => {
        try { return new URL(url).origin !== origin; } catch { return false; }
      }, async (route) => {
        await route.fulfill({ status: 200, body: "", contentType: "application/javascript" });
      });
      const taipeiToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
      const [year, month, day] = taipeiToday.split("-").map(Number);
      const yesterdayUtc = new Date(Date.UTC(year, month - 1, day - 1));
      const yesterday = `${yesterdayUtc.getUTCFullYear()}-${String(yesterdayUtc.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterdayUtc.getUTCDate()).padStart(2, "0")}`;
      const recruitedAt = `${Number(month)}/${Number(day)}`;
      const todayStudent = {
        name: "測試同學",
        phone: "0900000000",
        department: "歷史學系",
        grade: "大一",
        gatekeeper: "柏能",
        completedAt: `${taipeiToday}T04:00:00.000Z`,
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
      const yesterdayA = { ...todayStudent, name: "昨日甲", phone: "0900000002", completedAt: `${yesterday}T04:00:00.000Z`, submissionId: crypto.randomUUID() };
      const yesterdayB = { ...todayStudent, name: "昨日乙", phone: "0900000003", completedAt: `${yesterday}T05:00:00.000Z`, submissionId: crypto.randomUUID() };
      await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/admin/dashboard**", (route) => {
        const date = new URL(route.request().url()).searchParams.get("date") || taipeiToday;
        return route.fulfill({ json: buildDashboard({ date, results: [todayStudent, yesterdayA, yesterdayB], forms: [] }) });
      });
      await page.route("**/api/admin/recruitment**", (route) => {
        const date = new URL(route.request().url()).searchParams.get("date") || taipeiToday;
        return route.fulfill({
          json: buildRecruitmentDashboard({
            date,
            now: new Date(`${taipeiToday}T12:00:00+08:00`),
            gameRows: [
              {
                姓名: todayStudent.name,
                電話: todayStudent.phone,
                科系: todayStudent.department,
                年級: todayStudent.grade,
                遊戲關主: todayStudent.gatekeeper,
                遊戲時間: todayStudent.completedAt,
                _submissionId: todayStudent.submissionId,
                _kind: "official",
                _skipSave: false,
              },
              {
                姓名: yesterdayA.name,
                電話: yesterdayA.phone,
                科系: yesterdayA.department,
                年級: yesterdayA.grade,
                遊戲關主: yesterdayA.gatekeeper,
                遊戲時間: yesterdayA.completedAt,
                _submissionId: yesterdayA.submissionId,
                _kind: "official",
                _skipSave: false,
              },
              {
                姓名: yesterdayB.name,
                電話: yesterdayB.phone,
                科系: yesterdayB.department,
                年級: yesterdayB.grade,
                遊戲關主: yesterdayB.gatekeeper,
                遊戲時間: yesterdayB.completedAt,
                _submissionId: yesterdayB.submissionId,
                _kind: "official",
                _skipSave: false,
              },
            ],
            recruitmentRows: [{
              時間戳記: `${taipeiToday.replaceAll("-", "/")} 10:00:00`,
              "接引人(可複選)": "安倢",
              接引日期: recruitedAt,
              同學的姓名: todayStudent.name,
              "同學電話/LINE": todayStudent.phone,
              系級: "歷史學系大一",
              報名了那個活動: "9/30茶會",
              是否入社: "是",
              _gameSubmissionId: todayStudent.submissionId,
            }],
            masterRows: [],
          }),
        });
      });
      await page.goto(`${origin}/admin`);
      await page.getByRole("heading", { name: "今日招生戰情" }).waitFor();
      assert.equal(await page.locator("[data-kpi=today-contacts] .war-card-hit").getAttribute("aria-expanded"), "false");
      const trend = page.locator(".war-trend");
      await trend.waitFor();
      await trend.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const readout = page.locator(".war-trend-readout");
      assert.equal(await readout.count(), 7);
      assert.equal(await readout.first().isVisible(), true);
      const trendText = await trend.innerText();
      assert.match(trendText, /接\s*接觸/);
      assert.match(trendText, /報\s*活動報名/);
      assert.match(trendText, /社\s*入社/);
      assert.match(trendText, /接\s*\d/);
      assert.match(trendText, /報\s*\d/);
      assert.match(trendText, /社\s*\d/);
      assert.equal(await page.locator(".war-trend-cols [title]").count(), 0);
      const labels = await page.locator(".war-trend-day").evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label") || ""),
      );
      assert.equal(labels.length, 7);
      assert.ok(labels.every((label) => /接觸 \d/.test(label) && /活動報名 \d/.test(label) && /入社 \d/.test(label)));
      const todayLabel = labels.find((label) => label.startsWith(taipeiToday));
      assert.match(todayLabel, new RegExp(`${taipeiToday} 接觸 1、活動報名 1、入社 1`));
      const yesterdayLabel = labels.find((label) => label.startsWith(yesterday));
      assert.match(yesterdayLabel, new RegExp(`${yesterday} 接觸 2`));
      const readoutVisible = await readout.last().evaluate((el) => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return {
          visible: style.visibility !== "hidden" && Number(style.opacity) !== 0 && box.height >= 12 && box.width >= 12,
          top: box.top,
          bottom: box.bottom,
          text: el.textContent.replace(/\s+/g, ""),
        };
      });
      assert.equal(readoutVisible.visible, true, JSON.stringify(readoutVisible));
      assert.match(readoutVisible.text, /接\d/);
      assert.match(readoutVisible.text, /報\d/);
      assert.match(readoutVisible.text, /社\d/);
      assert.ok(readoutVisible.top >= 0 && readoutVisible.bottom <= 844);
      assert.equal(await page.getByText("submissionId").count(), 0);
      assert.equal(await page.getByText("分級").count(), 0);
      assert.equal(await page.getByText("0900000000").count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (process.env.CLUB_QA_DIR) {
        await page.screenshot({ path: join(process.env.CLUB_QA_DIR, "war-trend-390-viewport.png") });
      }
      await capture(page, "war-trend-390");
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
      await page.getByRole("button", { name: "填寫正式資料" }).click();
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
      assert.ok(submitted[0].activities.includes("9/30茶會"));
      assert.equal(await page.getByRole("button", { name: "填寫正式資料" }).count(), 0);
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
