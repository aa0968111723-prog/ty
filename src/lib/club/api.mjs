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
  isOfficialSettings,
  settingsAreValid,
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

function configuredValue(name) {
  const value = String(process.env[name] ?? "").trim();
  return value || null;
}

function normalizeScriptUrl(value) {
  if (!value) return null;
  const markdown = value.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
  if (markdown && markdown[1] === markdown[2]) return markdown[2];
  return value;
}

function sheetConfig() {
  return {
    url: normalizeScriptUrl(configuredValue("GOOGLE_SCRIPT_URL")),
    password: configuredValue("PASSWORD"),
    sheetId: configuredValue("GOOGLE_SHEET_ID"),
    sheetTab: configuredValue("GOOGLE_SHEET_TAB"),
  };
}

function sheetsConfigured() {
  const config = sheetConfig();
  return Boolean(config.url && config.password && config.sheetId && config.sheetTab);
}

async function appendOfficialResult(row) {
  const config = sheetConfig();
  const failed = { saved: false, duplicate: false };
  if (!sheetsConfigured()) return failed;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
  try {
    const rowPayload = {
      name: row.name,
      department: row.department,
      grade: row.grade,
      gatekeeper: row.gatekeeper,
      phone: row.phone,
      score: row.score,
      correct: row.correct,
      wrong: row.wrong,
      accuracy: row.accuracy,
      maxCombo: row.maxCombo,
      title: row.title,
      duration: row.duration,
      submissionId: row.submissionId,
      kind: row.kind,
      skipSave: row.skipSave,
      settings: row.settings,
      completedAt: row.completedAt,
    };
    const payload = { row: rowPayload };
    if (config.password) payload.password = config.password;
    if (config.sheetId) payload.sheetId = config.sheetId;
    if (config.sheetTab) payload.sheetTab = config.sheetTab;

    const response = await fetch(config.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return failed;
    const result = await response.json().catch(() => ({}));
    if (result?.ok === false && result?.conflict === true) return { ...failed, conflict: true };
    const saved = result?.ok === true && (result?.saved === true || result?.duplicate === true);
    return { saved, duplicate: saved && result?.duplicate === true };
  } catch (error) {
    console.error("[sheets] failed to append official result", error);
    return failed;
  } finally {
    clearTimeout(timer);
  }
}

function validResultBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "格式不對" };
  }
  const player = validatePlayer(body);
  if (!player.ok) return { ok: false, error: "請檢查欄位", errors: player.errors };
  const { score, correct, wrong, maxCombo, duration, skipSave, submissionId, settings, kind, completedAt } = body;
  const total = correct + wrong;
  if (!scoreIsConsistent({ score, correct, wrong, maxCombo })) {
    return { ok: false, error: "分數與答題紀錄不一致" };
  }
  if (
    !Number.isSafeInteger(duration) || duration < DURATION_MIN || duration > DURATION_MAX ||
    !settingsAreValid(settings) || settings.duration !== duration ||
    total > Math.min(MAX_ANSWERS, Math.ceil(duration * 1000 / settings.tapLockMs)) ||
    (body.total !== undefined && body.total !== total) ||
    typeof skipSave !== "boolean" ||
    typeof submissionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)
  ) return { ok: false, error: "這局資料不合理" };
  const official = kind === "official" && skipSave === false &&
    duration === GAME_DURATION && isOfficialSettings(settings);
  if (
    (!skipSave && !official) ||
    (skipSave && !["practice", "warmup"].includes(kind)) ||
    (official && (typeof completedAt !== "string" ||
      !Number.isFinite(Date.parse(completedAt)) ||
      new Date(completedAt).toISOString() !== completedAt))
  ) return { ok: false, error: "這局資料不合理" };
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
      submissionId: submissionId.toLowerCase(),
      kind,
      settings: { ...settings },
      completedAt: completedAt ?? null,
    },
  };
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
  const result = row.skipSave ? { saved: false, duplicate: false } : await appendOfficialResult(row);
  if (result.conflict) return json({ ok: false, saved: false, error: "這局資料與已儲存紀錄不一致" }, 409);
  return json({
    ok: true,
    saved: result.saved,
    duplicate: result.duplicate,
    sheetsConfigured: sheetsConfigured(),
    sheetsOk: result.saved,
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
