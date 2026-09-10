// @ts-nocheck
import {
  CLUB_NAME,
  GAME_DURATION,
  DURATION_MAX,
  DURATION_MIN,
  GRADE_LIST,
  MAX_ANSWERS,
  accuracyOf,
  publicResult,
  sanitizeLeaderboard,
  scoreIsConsistent,
  titleForScore,
  validatePlayer,
} from "./runtime.mjs";

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "X-DNS-Prefetch-Control": "off",
  "Content-Security-Policy":
    "base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors *",
};

const buckets = new Map();
const seenIds = new Map();
const board = [];
const SHEET_TIMEOUT_MS = 8_000;

function rateOk(ip, key, limit, windowMs = 60_000) {
  const id = `${key}:${ip}`;
  const now = Date.now();
  const hit = buckets.get(id);
  if (!hit || now - hit.t > windowMs) {
    buckets.set(id, { n: 1, t: now });
    return true;
  }
  if (hit.n >= limit) return false;
  hit.n += 1;
  return true;
}

function clientIp(req) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim().slice(0, 64);
  return "local";
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...SECURITY_HEADERS,
    },
  });
}

export async function handleHealth() {
  return json({
    status: "ok",
    club: CLUB_NAME,
    sheets: Boolean(process.env.GOOGLE_SCRIPT_URL),
    smtp: Boolean(process.env.SMTP_HOST),
  });
}

export async function handleRegister(request) {
  const ip = clientIp(request);
  if (!rateOk(ip, "register", 40)) return json({ error: "請稍後再試" }, 429);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "格式不對" }, 400);
  }
  const parsed = validatePlayer(body);
  if (!parsed.ok) return json({ error: "請檢查欄位", errors: parsed.errors }, 400);
  return json({ ok: true, clubName: CLUB_NAME, player: parsed.data });
}

function sheetUrl() {
  const value = String(process.env.GOOGLE_SCRIPT_URL ?? "").trim();
  return value || null;
}

async function appendOfficialResult(row) {
  const url = sheetUrl();
  if (!url) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: row.name,
        department: row.department,
        grade: row.grade,
        phone: row.phone,
        score: row.score,
        correct: row.correct,
        wrong: row.wrong,
        accuracy: row.accuracy,
        maxCombo: row.maxCombo,
        title: row.title,
        duration: row.duration,
        submissionId: row.submissionId,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const result = await response.json().catch(() => ({}));
    return result?.ok !== false;
  } catch (error) {
    console.error("[sheets] failed to append official result", error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function validResultBody(body) {
  const player = validatePlayer(body);
  if (!player.ok) return { ok: false, error: "請檢查欄位", errors: player.errors };
  const correct = Math.max(0, Number(body.correct) || 0);
  const wrong = Math.max(0, Number(body.wrong) || 0);
  const total = correct + wrong;
  if (total > MAX_ANSWERS) return { ok: false, error: "這局資料不合理" };
  const score = Math.max(0, Number(body.score) || 0);
  const maxCombo = Math.max(0, Math.min(total, Number(body.maxCombo) || 0));
  if (!scoreIsConsistent({ score, correct, wrong, maxCombo })) {
    return { ok: false, error: "分數與答題紀錄不一致" };
  }
  const skipSave = Boolean(body.skipSave);
  const submissionId = String(body.submissionId || "").slice(0, 80);
  const durationRaw = Number(body.duration);
  const duration = Number.isFinite(durationRaw)
    ? Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(durationRaw)))
    : GAME_DURATION;
  const official = !skipSave && duration === GAME_DURATION;
  return {
    ok: true,
    data: {
      ...player.data,
      score,
      correct,
      wrong,
      total,
      accuracy: accuracyOf(correct, total),
      maxCombo,
      title: titleForScore(score, duration),
      duration,
      skipSave: !official,
      submissionId,
    },
  };
}

function sweepSeenIds() {
  const now = Date.now();
  for (const [k, t] of seenIds) if (now - t > 30 * 60_000) seenIds.delete(k);
}

function wasSeen(id) {
  if (!id) return false;
  sweepSeenIds();
  return seenIds.has(id);
}

function rememberId(id) {
  if (!id) return;
  sweepSeenIds();
  seenIds.set(id, Date.now());
}

export async function handleResult(request) {
  const ip = clientIp(request);
  if (!rateOk(ip, "result", 80)) return json({ error: "請稍後再試" }, 429);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "格式不對" }, 400);
  }
  const parsed = validResultBody(body);
  if (!parsed.ok) return json({ error: parsed.error, errors: parsed.errors }, 400);
  const row = parsed.data;
  const duplicate = wasSeen(row.submissionId);
  let sheetsOk = false;
  if (!row.skipSave && !duplicate) {
    sheetsOk = await appendOfficialResult(row);
    if (sheetsOk) {
      rememberId(row.submissionId);
      board.push({
        name: row.name,
        department: row.department,
        score: row.score,
        at: Date.now(),
      });
    }
  } else if (!row.skipSave && duplicate) {
    sheetsOk = true;
  }
  return json({
    ok: true,
    saved: !row.skipSave,
    duplicate: duplicate && !row.skipSave,
    sheetsConfigured: Boolean(sheetUrl()),
    sheetsOk,
    smtpConfigured: Boolean(process.env.SMTP_HOST),
    emailSent: false,
    clubName: CLUB_NAME,
    title: row.title,
    accuracy: row.accuracy,
  });
}

export async function handleLeaderboard(request) {
  const ip = clientIp(request);
  if (!rateOk(ip, "lb", 180)) return json({ error: "請稍後再試" }, 429);
  return json({
    ok: true,
    public: false,
    source: "private",
    rows: [],
  });
}

export { GRADE_LIST, publicResult };
