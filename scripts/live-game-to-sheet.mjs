#!/usr/bin/env node
/**
 * Live booth path: finish an official game in the browser and confirm the row
 * landed on the game-results tab (sheetId 896311128), not 招生狀況表 / 總表.
 *
 * Run: CLUB_LIVE_SHEETS=1 node scripts/live-game-to-sheet.mjs
 * Requires a running app (npm run dev) and Google Sheet credentials.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { google } from "googleapis";
import { chromium } from "playwright";

const GAME_SHEET_ID = 896311128;
const RECRUIT_SHEET_ID = 1921679351;
const MASTER_SHEET_ID = 0;
const origin = process.env.CLUB_BROWSER_URL || "http://127.0.0.1:8080/";
const qaDir = process.env.CLUB_QA_DIR || "/workspace/screenshots";

function screenshotPath(name) {
  mkdirSync(qaDir, { recursive: true });
  return `${qaDir.replace(/\/$/, "")}/${name}`;
}

const player = {
  name: "畫面連動",
  department: "歷史學系",
  grade: "大一",
  gatekeeper: "柏能",
  phone: "0900111333",
};

function sheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!raw || !spreadsheetId) throw new Error("Google Sheets is not configured");
  const credentials = JSON.parse(raw);
  credentials.private_key = String(credentials.private_key).replace(/\\n/g, "\n");
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return { spreadsheetId, sheets: google.sheets({ version: "v4", auth }) };
}

async function listTabs(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(title,sheetId)",
  });
  return (meta.data.sheets || []).map((sheet) => ({
    title: String(sheet.properties.title),
    sheetId: Number(sheet.properties.sheetId),
  }));
}

async function findSubmission(sheets, spreadsheetId, title, submissionId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${title.replace(/'/g, "''")}'`,
    majorDimension: "ROWS",
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const values = response.data.values || [];
  const headers = (values[0] || []).map((value) => String(value));
  const idIdx = headers.findIndex((header) => header === "_submissionId" || header === "submissionId");
  const nameIdx = headers.findIndex((header) => header === "姓名" || header === "name");
  const row = values.slice(1).find((cells) => String(cells[idIdx] || "").toLowerCase() === submissionId);
  return {
    title,
    found: Boolean(row),
    name: row && nameIdx >= 0 ? String(row[nameIdx]) : null,
  };
}

export async function runLiveGameToSheet() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_SHEET_ID) {
    return { skipped: true, reason: "sheets-unconfigured" };
  }
  const { spreadsheetId, sheets } = sheetsClient();
  const tabs = await listTabs(sheets, spreadsheetId);
  const gameTab = tabs.find((tab) => tab.sheetId === GAME_SHEET_ID);
  if (!gameTab) throw new Error("game tab 896311128 is missing");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const posts = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/result") {
      posts.push(request.postDataJSON());
    }
  });
  try {
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.locator("[data-register=official]").waitFor();
    await page.getByRole("button", { name: "柏能", exact: true }).click();
    await page.locator("#name").fill(player.name);
    await page.locator("#department").selectOption(player.department);
    await page.getByRole("button", { name: "大一", exact: true }).click();
    await page.locator("#phone").fill(player.phone);
    await page.getByRole("button", { name: "開始練習", exact: true }).click();
    await page.locator("[data-screen=tutorial]").waitFor();
    await page.locator('[data-color="blue"]').click();
    await page.locator('[data-tutorial-step="1"]').waitFor();
    await page.locator('[data-color="yellow"]').click();
    await page.locator("[data-screen=game][data-session=warmup]").waitFor();
    await page.waitForFunction(() => Boolean(window.__focusChallenge));
    await page.evaluate(() => window.__focusChallenge.endNow());
    await page.locator("[data-screen=warmup-result]").waitFor();
    await page.getByRole("button", { name: /開始正式 60 秒/ }).click();
    await page.locator("[data-screen=game][data-session=official]").waitFor();
    const submissionId = await page.evaluate(() => window.__focusChallenge.getState().submissionId);
    await page.evaluate(() => window.__focusChallenge.endNow());
    await page.locator("[data-screen=result]").waitFor();
    await page.locator('[data-save="ok"]').waitFor({ timeout: 20000 });
    await page.screenshot({ path: screenshotPath("live-game-result.png") });
    const saveText = await page.locator(".save-note").innerText();
    await browser.close();

    const officialPosts = posts.filter((row) => row?.kind === "official" && row?.skipSave === false);
    const gameRead = await findSubmission(sheets, spreadsheetId, gameTab.title, String(submissionId).toLowerCase());
    const recruitTab = tabs.find((tab) => tab.sheetId === RECRUIT_SHEET_ID);
    const masterTab = tabs.find((tab) => tab.sheetId === MASTER_SHEET_ID);
    const recruitRead = recruitTab
      ? await findSubmission(sheets, spreadsheetId, recruitTab.title, String(submissionId).toLowerCase())
      : { found: false };
    const masterRead = masterTab
      ? await findSubmission(sheets, spreadsheetId, masterTab.title, String(submissionId).toLowerCase())
      : { found: false };

    return {
      skipped: false,
      submissionId,
      officialPosts: officialPosts.length,
      saveText,
      gameRead,
      recruitFound: recruitRead.found,
      masterFound: masterRead.found,
      leftoverEnvTab: process.env.GOOGLE_SHEET_TAB || null,
    };
  } catch (error) {
    await page.screenshot({ path: screenshotPath("live-game-result-fail.png") }).catch(() => {});
    await browser.close();
    throw error;
  }
}

if (process.argv[1]?.endsWith("live-game-to-sheet.mjs")) {
  if (process.env.CLUB_LIVE_SHEETS !== "1") {
    console.log(JSON.stringify({ skipped: true, reason: "set CLUB_LIVE_SHEETS=1" }));
    process.exit(0);
  }
  const result = await runLiveGameToSheet();
  writeFileSync(screenshotPath("live-game-to-sheet.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (result.skipped) process.exit(0);
  if (!result.gameRead.found || result.officialPosts < 1 || result.recruitFound || result.masterFound) {
    process.exit(1);
  }
}
