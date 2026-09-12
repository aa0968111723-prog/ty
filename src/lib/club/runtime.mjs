// @ts-nocheck
/** Single source of truth: Stroop rules, titles, departments, validation. */

export const GAME_DURATION = 60;
export const WARMUP_DURATION = 15;
export const TAP_LOCK_MS = 48;
export const MODE_SWITCH_MS = 3000;
export const COMBO_BONUS_AT = 5;
export const HIT_SCORE = 100;
export const COMBO_SCORE = 200;
export const MISS_PENALTY = 50;
export const MAX_ANSWERS = 1250;

export const DURATION_MIN = 15;
export const DURATION_MAX = 90;
export const SWITCH_MIN = 1400;
export const SWITCH_MAX = 4500;

export const SPEED_PRESETS = [
  { id: "slow", label: "慢", hint: "每答一題換規則", switchMs: 4500, comboEvery: 5, tapLockMs: 90 },
  {
    id: "normal",
    label: "一般",
    hint: "每答一題換規則",
    switchMs: 3000,
    comboEvery: 3,
    tapLockMs: 64,
  },
  { id: "fast", label: "快", hint: "每答一題換規則", switchMs: 2000, comboEvery: 3, tapLockMs: 55 },
  {
    id: "rush",
    label: "極快",
    hint: "每答一題換規則",
    switchMs: 1400,
    comboEvery: 2,
    tapLockMs: 48,
  },
];
export const SPEED_OPTIONS = SPEED_PRESETS;
export const START_MODE_OPTIONS = [
  { id: "meaning", label: "字面意思" },
  { id: "visual", label: "視覺顏色" },
  { id: "random", label: "隨機" },
];

function snap(n, min, max, step) {
  const x = Math.min(max, Math.max(min, Number(n)));
  if (!Number.isFinite(x)) return min;
  return Math.round(x / step) * step;
}

export function nearestSpeedPreset(raw) {
  if (raw && typeof raw.speed === "string") {
    const byId = SPEED_PRESETS.find((p) => p.id === raw.speed);
    if (byId) return byId;
  }
  const ms = Number(raw?.switchMs);
  if (!Number.isFinite(ms)) return SPEED_PRESETS.find((p) => p.id === "normal");
  return SPEED_PRESETS.reduce((best, p) =>
    Math.abs(p.switchMs - ms) < Math.abs(best.switchMs - ms) ? p : best,
  );
}

export function clampSettings(raw) {
  let duration = Number(raw?.duration);
  if (!Number.isFinite(duration)) duration = GAME_DURATION;
  duration = snap(duration, DURATION_MIN, DURATION_MAX, 5);
  const preset = nearestSpeedPreset(raw);
  const startMode = START_MODE_OPTIONS.some((s) => s.id === raw?.startMode)
    ? raw.startMode
    : "meaning";
  return {
    duration,
    switchMs: preset.switchMs,
    speed: preset.id,
    comboEvery: preset.comboEvery,
    tapLockMs: preset.tapLockMs,
    startMode,
    sound: raw?.sound !== false,
    vibrate: raw?.vibrate !== false,
  };
}

export const DEFAULT_SETTINGS = clampSettings(null);

export function isOfficialSettings(raw) {
  const s = clampSettings(raw);
  return s.duration === GAME_DURATION && s.speed === "normal" && s.startMode === "meaning";
}

export function speedMs(speed) {
  return SPEED_PRESETS.find((s) => s.id === speed)?.switchMs ?? MODE_SWITCH_MS;
}

export function pointsForHit(combo) {
  return combo >= COMBO_BONUS_AT ? COMBO_SCORE : HIT_SCORE;
}
export const CLUB_NAME = "淡江大學禪學社";
export const CONTACT_EMAIL = "tkuzen@example.com";
export const PRIVACY_COPY =
  "成績與有沒有拿到手搖杯，都不會在網站公開。電話只用來聯絡得獎。資料只用於本次活動。試玩不登記、不抽獎。";

export const COLORS = [
  { id: "red", label: "紅", hex: "#DC2626", key: ["1", "r"] },
  { id: "blue", label: "藍", hex: "#2563EB", key: ["2", "b"] },
  { id: "green", label: "綠", hex: "#059669", key: ["3", "g"] },
  { id: "yellow", label: "黃", hex: "#CA8A04", key: ["4", "y"] },
];

export const GRADE_LIST = ["大一", "大二", "大三", "大四", "碩士班", "博士班", "其他"];

export const DEPARTMENT_GROUPS = [
  {
    college: "文學院",
    items: ["中國文學學系", "歷史學系", "資訊與圖書館學系", "大眾傳播學系", "資訊傳播學系"],
  },
  {
    college: "教育學院",
    items: ["教育科技學系", "教育與未來設計學系"],
  },
  {
    college: "外國語文學院",
    items: [
      "英文學系",
      "英文學系全英語學士班",
      "日本語文學系",
      "法國語文學系",
      "德國語文學系",
      "西班牙語文學系",
      "俄國語文學系",
    ],
  },
  {
    college: "商管學院",
    items: [
      "國際企業學系",
      "國際企業學系全英語學士班",
      "經濟學系",
      "產業經濟學系",
      "會計學系",
      "企業管理學系",
      "企業管理學系全英語學士班",
      "財務金融學系",
      "風險管理與保險學系",
      "統計學系",
      "資訊管理學系",
      "公共行政學系",
      "運輸管理學系",
    ],
  },
  {
    college: "國際學院",
    items: ["國際觀光管理學系全英語學士班", "全球政治經濟學系全英語學士班"],
  },
  {
    college: "理學院",
    items: ["數學學系資訊與數據科學組", "數學學系應數統計組", "物理學系", "化學學系"],
  },
  {
    college: "工學院",
    items: [
      "建築學系",
      "土木工程學系",
      "水資源及環境工程學系",
      "機械與機電工程學系",
      "化學工程與材料工程學系",
      "電機工程學系",
      "資訊工程學系",
      "航空太空工程學系",
    ],
  },
  {
    college: "人工智慧學院",
    items: ["人工智慧學系"],
  },
];

export const DEPARTMENT_LIST = DEPARTMENT_GROUPS.flatMap((g) => g.items);

export const TITLE_THRESHOLDS = [
  { min: 3500, title: "Lv.4 卓越領袖", blurb: "這 60 秒裡，你幾乎一直盯著規則，很少被顏色帶走。" },
  { min: 2500, title: "Lv.3 穩定領航者", blurb: "這次挑戰中，你能在規則切換時很快找回節奏。" },
  { min: 1500, title: "Lv.2 潛力領袖", blurb: "這次專注表現已經站穩，再多一點節奏會更穩。" },
  { min: 0, title: "Lv.1 心靈修煉者", blurb: "這次是起點。多玩一次，眼睛會更跟得上指令。" },
];

export function colorById(id) {
  return COLORS.find((c) => c.id === id) ?? COLORS[0];
}

export function colorByKey(key) {
  const k = String(key).toLowerCase();
  return COLORS.find((c) => c.key.includes(k))?.id ?? null;
}

export function nextQuestion(prev) {
  const pool = COLORS;
  let meaning = pool[Math.floor(Math.random() * pool.length)];
  let visual = pool[Math.floor(Math.random() * pool.length)];
  let guard = 0;
  while (visual.id === meaning.id && guard < 12) {
    visual = pool[Math.floor(Math.random() * pool.length)];
    guard += 1;
  }
  if (visual.id === meaning.id) {
    visual = pool.find((c) => c.id !== meaning.id) ?? pool[1];
  }
  if (prev && meaning.id === prev.meaning.id && visual.id === prev.visual.id) {
    meaning = pool.find((c) => c.id !== meaning.id) ?? meaning;
    if (visual.id === meaning.id) {
      visual = pool.find((c) => c.id !== meaning.id) ?? visual;
    }
  }
  return { meaning, visual };
}

export function correctId(game) {
  return game.mode === "meaning" ? game.question.meaning.id : game.question.visual.id;
}

export function titleThresholdsFor(duration = GAME_DURATION) {
  const d = Number(duration) > 0 ? Number(duration) : GAME_DURATION;
  return TITLE_THRESHOLDS.map((t) => ({
    ...t,
    min: t.min === 0 ? 0 : Math.round((t.min * d) / GAME_DURATION / 50) * 50,
    blurb: String(t.blurb).replaceAll("60 秒", `${d} 秒`),
  }));
}

export function titleForScore(score, duration = GAME_DURATION) {
  const n = Math.max(0, Number(score) || 0);
  const rows = titleThresholdsFor(duration);
  return rows.find((t) => n >= t.min)?.title ?? rows.at(-1).title;
}

export function blurbForTitle(title, duration = GAME_DURATION) {
  const rows = titleThresholdsFor(duration);
  return rows.find((t) => t.title === title)?.blurb ?? rows.at(-1).blurb;
}

export function accuracyOf(correct, total) {
  if (!total) return 0;
  return Math.round((1000 * correct) / total) / 10;
}

export function remainingSeconds(game, now = Date.now()) {
  const duration = Number(game.duration) > 0 ? Number(game.duration) : GAME_DURATION;
  const elapsed = (now - game.startTime) / 1000;
  return Math.max(0, duration - elapsed);
}

export function createLiveGame(now = Date.now(), opts = {}) {
  const s = clampSettings(opts.settings);
  const skipSave = Boolean(opts.skipSave) || !isOfficialSettings(s);
  const mode =
    s.startMode === "random" ? (Math.random() < 0.5 ? "visual" : "meaning") : s.startMode;
  const question = nextQuestion(null);
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    correct: 0,
    wrong: 0,
    mode,
    lastModeSwitch: now,
    lastAnswerAt: 0,
    questionSeq: 1,
    startTime: now,
    ended: false,
    resultSubmitted: false,
    skipSave,
    kind: skipSave ? "practice" : "official",
    submissionId: crypto.randomUUID(),
    duration: s.duration,
    modeSwitchMs: s.switchMs,
    comboEvery: s.comboEvery,
    tapLockMs: s.tapLockMs,
    settings: s,
    question,
  };
}

export function createWarmupGame(now = Date.now(), settings = {}) {
  return {
    ...createLiveGame(now, {
      skipSave: true,
      settings: {
        ...DEFAULT_SETTINGS,
        duration: WARMUP_DURATION,
        sound: settings.sound,
        vibrate: settings.vibrate,
      },
    }),
    kind: "warmup",
  };
}

function switchModeAfterAnswer(game, now) {
  if (game.ended) return false;
  game.mode = game.mode === "meaning" ? "visual" : "meaning";
  game.lastModeSwitch = now;
  return true;
}

export function judgeAnswer(game, chosen, snapshot, now = Date.now()) {
  if (game.ended) return { ok: false, reason: "ended" };
  const lock = Number(game.tapLockMs) > 0 ? Number(game.tapLockMs) : TAP_LOCK_MS;
  if (now - game.lastAnswerAt < lock) return { ok: false, reason: "lock" };
  const seq = snapshot?.seq ?? game.questionSeq;
  if (seq !== game.questionSeq) return { ok: false, reason: "stale" };
  const elapsed = (now - game.startTime) / 1000;
  const duration = Number(game.duration) > 0 ? Number(game.duration) : GAME_DURATION;
  if (elapsed >= duration) {
    game.ended = true;
    return { ok: false, reason: "expired" };
  }
  const mode = snapshot?.mode ?? game.mode;
  const expected = mode === "meaning" ? game.question.meaning.id : game.question.visual.id;
  game.lastAnswerAt = now;
  const hit = chosen === expected;
  let delta = 0;
  if (hit) {
    game.correct += 1;
    game.combo += 1;
    if (game.combo > game.maxCombo) game.maxCombo = game.combo;
    delta = pointsForHit(game.combo);
    game.score += delta;
  } else {
    game.wrong += 1;
    game.combo = 0;
    delta = -Math.min(MISS_PENALTY, game.score);
    game.score += delta;
  }
  game.questionSeq += 1;
  game.question = nextQuestion(game.question);
  const switched = switchModeAfterAnswer(game, now);
  return { ok: true, hit, expected, score: game.score, combo: game.combo, delta, switched };
}

export function tickGame(game, now = Date.now()) {
  const remaining = remainingSeconds(game, now);
  const expired = remaining <= 0;
  if (expired) game.ended = true;
  return { remaining, switched: false, expired };
}

export function emptyPlayer() {
  return { name: "", department: "", grade: "", phone: "", gatekeeper: "" };
}

export const GUEST_PLAYER = {
  name: "試玩同學",
  department: "現場試玩",
  grade: "其他",
  phone: "0900000000",
  gatekeeper: "試玩",
};

const PHONE_RE = /^09\d{8}$/;
const NAME_RE = /^[\u4e00-\u9fffA-Za-z·．\s]{1,20}$/;
const GATEKEEPER_RE = /^[\u4e00-\u9fffA-Za-z·．\s]{1,20}$/;

export function validatePlayer(player) {
  const errors = {};
  const name = String(player?.name ?? "").trim();
  const department = String(player?.department ?? "").trim();
  const grade = String(player?.grade ?? "").trim();
  const phone = String(player?.phone ?? "").replace(/\s+/g, "");
  const gatekeeper = String(player?.gatekeeper ?? "").trim();
  if (!name) errors.name = "請填寫姓名";
  else if (!NAME_RE.test(name)) errors.name = "請填 1–20 字的真實姓名";
  if (!department) errors.department = "請選擇淡江科系";
  else if (!DEPARTMENT_LIST.includes(department) && department !== "現場試玩")
    errors.department = "請從名單選擇淡江科系";
  if (!grade) errors.grade = "請選擇年級";
  else if (!GRADE_LIST.includes(grade)) errors.grade = "請選擇年級";
  if (!gatekeeper) errors.gatekeeper = "請選擇關主";
  else if (!GATEKEEPER_RE.test(gatekeeper)) errors.gatekeeper = "請填 1–20 字的關主姓名";
  if (!phone) errors.phone = "請填寫手機";
  else if (!PHONE_RE.test(phone)) errors.phone = "請填 09 開頭的 10 碼手機";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { name, department, grade, phone, gatekeeper }, errors: {} };
}

export function sanitizeLeaderboard(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      name: String(r?.name ?? "").slice(0, 20),
      department: String(r?.department ?? "").slice(0, 24),
      score: Math.max(0, Number(r?.score) || 0),
    }))
    .filter((r) => r.name)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-Hant"))
    .slice(0, 5);
}

export function publicResult(game, player) {
  const total = game.correct + game.wrong;
  const duration = Number(game.duration) > 0 ? Number(game.duration) : GAME_DURATION;
  const title = titleForScore(game.score, duration);
  return {
    name: player.name,
    department: player.department,
    grade: player.grade,
    phone: player.phone,
    gatekeeper: player.gatekeeper,
    score: game.score,
    correct: game.correct,
    wrong: game.wrong,
    total,
    accuracy: accuracyOf(game.correct, total),
    maxCombo: game.maxCombo,
    title,
    blurb: blurbForTitle(title, duration),
    duration,
    skipSave: Boolean(game.skipSave),
    submissionId: game.submissionId,
  };
}

export function theoreticalMaxScore(correct) {
  const n = Math.max(0, Math.floor(Number(correct) || 0));
  if (n <= 0) return 0;
  const warmup = Math.min(n, COMBO_BONUS_AT - 1);
  const boosted = n - warmup;
  return warmup * HIT_SCORE + boosted * COMBO_SCORE;
}

export function scoreIsConsistent({ score, correct, wrong, maxCombo }) {
  const s = Math.max(0, Number(score) || 0);
  const c = Math.max(0, Math.floor(Number(correct) || 0));
  const w = Math.max(0, Math.floor(Number(wrong) || 0));
  const m = Math.max(0, Math.floor(Number(maxCombo) || 0));
  if (!Number.isInteger(s) || s % 50 !== 0) return false;
  if (s > theoreticalMaxScore(c)) return false;
  if (m > c) return false;
  if (c === 0 && s !== 0) return false;
  if (w === 0 && (s !== theoreticalMaxScore(c) || m !== c)) return false;
  return true;
}
