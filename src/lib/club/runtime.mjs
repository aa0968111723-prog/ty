// @ts-nocheck -- Legacy mutable JavaScript engine; the client contract is typed in runtime.d.mts.
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

export const DEFAULT_SETTINGS = Object.freeze(clampSettings(null));

export function settingsAreValid(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const canonical = clampSettings(raw);
  return Object.keys(DEFAULT_SETTINGS).every((key) => raw[key] === canonical[key]);
}

export function isOfficialSettings(raw) {
  return (
    settingsAreValid(raw) &&
    ["duration", "switchMs", "speed", "comboEvery", "tapLockMs", "startMode"].every(
      (key) => raw[key] === DEFAULT_SETTINGS[key],
    )
  );
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

export function remainingSeconds(game, now = performance.now()) {
  const observed = Number.isFinite(now) ? Math.max(now, game.lastClockTime) : game.lastClockTime;
  return Math.max(0, game.duration - (observed - game.startTime) / 1000);
}

export function createLiveGame(now = performance.now(), opts = {}) {
  if (!Number.isFinite(now) || now < 0) throw new TypeError("Invalid game clock");
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
    lastClockTime: now,
    completedAt: null,
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
    answers: [],
  };
}

export function createWarmupGame(now = performance.now(), settings = {}) {
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

function finishGame(game) {
  game.ended = true;
  game.completedAt ??= new Date().toISOString();
}

export function judgeAnswer(game, chosen, snapshot, now = performance.now()) {
  if (game.ended) return { ok: false, reason: "ended" };
  if (!Number.isFinite(now) || now < game.lastClockTime) return { ok: false, reason: "clock" };
  game.lastClockTime = now;
  if (remainingSeconds(game, now) <= 0) {
    finishGame(game);
    return { ok: false, reason: "expired" };
  }
  if (game.questionSeq > 1 && now - game.lastAnswerAt < game.tapLockMs) {
    return { ok: false, reason: "lock" };
  }
  if (snapshot?.seq !== game.questionSeq || snapshot?.mode !== game.mode) {
    return { ok: false, reason: "stale" };
  }
  if (!COLORS.some((color) => color.id === chosen)) return { ok: false, reason: "invalid" };
  const expected = correctId(game);
  const previousAt = game.lastAnswerAt || game.startTime;
  const responseMs = Math.max(0, Math.round(now - previousAt));
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
    delta = game.score === 0 ? 0 : -Math.min(MISS_PENALTY, game.score);
    game.score += delta;
  }
  const colorLabel = (id) => COLORS.find((color) => color.id === id)?.label ?? id;
  if (!Array.isArray(game.answers)) game.answers = [];
  game.answers.push({
    sequence: game.correct + game.wrong,
    mode: game.mode,
    word: game.question.meaning.label,
    wordColorLabel: game.question.meaning.label,
    inkColorLabel: game.question.visual.label,
    selectedLabel: colorLabel(chosen),
    correct: hit,
    responseMs,
    elapsedMs: Math.max(0, Math.round(now - game.startTime)),
  });
  game.questionSeq += 1;
  game.question = nextQuestion(game.question);
  const switched = switchModeAfterAnswer(game, now);
  return { ok: true, hit, expected, score: game.score, combo: game.combo, delta, switched };
}

export function tickGame(game, now = performance.now()) {
  if (Number.isFinite(now)) game.lastClockTime = Math.max(game.lastClockTime, now);
  const remaining = remainingSeconds(game, now);
  const expired = remaining <= 0;
  if (expired) finishGame(game);
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

export function answerLogText(answers) {
  return (Array.isArray(answers) ? answers : []).map((row) => {
    const mode = row.mode === "visual" ? "判斷視覺顏色" : "判斷字面意思";
    return `${row.sequence}. ${mode}｜題目「${row.word}」／顯示色 ${row.inkColorLabel}｜選擇 ${row.selectedLabel}｜${row.correct ? "答對" : "答錯"}｜${row.responseMs} ms`;
  }).join("\n");
}

export function averageReactionMs(answers) {
  const rows = (Array.isArray(answers) ? answers : []).map((row) => Number(row.responseMs));
  const valid = rows.filter((value) => Number.isFinite(value) && value >= 0);
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

export function publicResult(game, player) {
  const total = game.correct + game.wrong;
  const duration = Number(game.duration) > 0 ? Number(game.duration) : GAME_DURATION;
  const title = titleForScore(game.score, duration);
  const answers = Array.isArray(game.answers) ? game.answers.map((row) => ({ ...row })) : [];
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
    kind: game.kind,
    settings: { ...game.settings },
    completedAt: game.completedAt,
    submissionId: game.submissionId,
    answers,
    answerLog: answerLogText(answers),
    avgReactionMs: averageReactionMs(answers),
  };
}

export function theoreticalMaxScore(correct) {
  const n = Math.max(0, Math.floor(Number(correct) || 0));
  if (n <= 0) return 0;
  const warmup = Math.min(n, COMBO_BONUS_AT - 1);
  const boosted = n - warmup;
  return warmup * HIT_SCORE + boosted * COMBO_SCORE;
}

export function scoreIsConsistent(row) {
  if (!row || typeof row !== "object") return false;
  const { score: s, correct: c, wrong: w, maxCombo: m } = row;
  if (![s, c, w, m].every((n) => Number.isSafeInteger(n) && n >= 0)) return false;
  if (c + w > MAX_ANSWERS || m > MAX_ANSWERS || s % MISS_PENALTY !== 0) return false;
  if (s > theoreticalMaxScore(c)) return false;
  if (m > c) return false;
  if (c === 0) return s === 0 && m === 0;
  if (m === 0 || c > m * (w + 1)) return false;
  if (w === 0 && (s !== theoreticalMaxScore(c) || m !== c)) return false;
  const unboosted = COMBO_BONUS_AT - 1;
  const minBoosts = Math.max(0, m - unboosted) + Math.max(0, c - m - unboosted * w);
  const maxBoosts =
    Math.floor(c / m) * Math.max(0, m - unboosted) + Math.max(0, (c % m) - unboosted);
  const minScore = Math.max(0, c * HIT_SCORE + minBoosts * (COMBO_SCORE - HIT_SCORE) - w * MISS_PENALTY);
  const minSeparators = Math.ceil(c / m) - 1;
  const maxScore = c * HIT_SCORE + maxBoosts * (COMBO_SCORE - HIT_SCORE) - minSeparators * MISS_PENALTY;
  if (s < minScore || s > maxScore) return false;
  return true;
}
