import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOnce(content, from, to, label) {
  if (!content.includes(from)) {
    throw new Error(`Patch target not found: ${label}`);
  }
  return content.replace(from, to);
}

// 1) Registration UI + bilingual copy + gatekeeper selector.
{
  const path = "src/routes/index.tsx";
  let s = read(path);

  s = replaceOnce(
    s,
    'type Player = { name: string; department: string; grade: string; phone: string };',
    'type Player = { name: string; department: string; grade: string; phone: string; gatekeeper: string };',
    "Player type",
  );

  s = replaceOnce(
    s,
    '    mobile: "Mobile number",\n    selectDepartment: "Select your Tamkang department",',
    '    mobile: "Mobile number",\n    gatekeeper: "Booth leader",\n    chooseGatekeeper: "Choose the booth leader guiding you",\n    customGatekeeper: "Custom",\n    customGatekeeperPlaceholder: "Enter the booth leader name",\n    selectDepartment: "Select your Tamkang department",',
    "English gatekeeper copy",
  );

  s = replaceOnce(
    s,
    '    mobile: "電話",\n    selectDepartment: "請選擇淡江科系",',
    '    mobile: "電話",\n    gatekeeper: "關主",\n    chooseGatekeeper: "請選擇帶你闖關的關主",\n    customGatekeeper: "自訂",\n    customGatekeeperPlaceholder: "輸入關主姓名",\n    selectDepartment: "請選擇淡江科系",',
    "Chinese gatekeeper copy",
  );

  s = replaceOnce(
    s,
    'const COLOR_NAMES: Record<ColorId, { en: string; zh: string }> = {',
    'const GATEKEEPERS = ["柏能", "安倢", "小哲", "振泰"];\n\nconst COLOR_NAMES: Record<ColorId, { en: string; zh: string }> = {',
    "gatekeeper options",
  );

  s = replaceOnce(
    s,
    '  請選擇年級: "Please select your year.",\n  請填寫手機: "Please enter your mobile number.",',
    '  請選擇年級: "Please select your year.",\n  請選擇關主: "Please choose your booth leader.",\n  "請填 1–20 字的關主姓名": "Please enter a booth leader name between 1 and 20 characters.",\n  請填寫手機: "Please enter your mobile number.",',
    "validation translations",
  );

  s = replaceOnce(
    s,
    '  const [openSettings, setOpenSettings] = useState(false);\n\n  return (',
    '  const [openSettings, setOpenSettings] = useState(false);\n  const [gatekeeperChoice, setGatekeeperChoice] = useState(() =>\n    GATEKEEPERS.includes(player.gatekeeper)\n      ? player.gatekeeper\n      : player.gatekeeper\n        ? "__custom__"\n        : "",\n  );\n\n  return (',
    "gatekeeper local state",
  );

  const nameFieldMarker = '        <div className={"field" + (errors.name ? " is-invalid" : "")}>';
  const gatekeeperField = `        <div className={"field gatekeeper-field" + (errors.gatekeeper ? " is-invalid" : "")}>
          <span id="gatekeeper-label" className="field-label">
            {ui.gatekeeper} <span className="req">*</span>
            <ZhHelper language={language}>關主</ZhHelper>
          </span>
          <p className="field-hint">{ui.chooseGatekeeper}</p>
          <div className="gatekeeper-picks" role="radiogroup" aria-labelledby="gatekeeper-label">
            {GATEKEEPERS.map((name) => (
              <button
                key={name}
                type="button"
                className={"gatekeeper-pick" + (gatekeeperChoice === name ? " is-on" : "")}
                aria-pressed={gatekeeperChoice === name}
                onClick={() => {
                  setGatekeeperChoice(name);
                  onChange("gatekeeper", name);
                }}
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              className={"gatekeeper-pick" + (gatekeeperChoice === "__custom__" ? " is-on" : "")}
              aria-pressed={gatekeeperChoice === "__custom__"}
              onClick={() => {
                setGatekeeperChoice("__custom__");
                if (GATEKEEPERS.includes(player.gatekeeper)) onChange("gatekeeper", "");
              }}
            >
              {ui.customGatekeeper}
            </button>
          </div>
          {gatekeeperChoice === "__custom__" ? (
            <input
              id="gatekeeper-custom"
              name="gatekeeper"
              value={player.gatekeeper}
              maxLength={20}
              autoComplete="off"
              onChange={(e) => onChange("gatekeeper", e.target.value.slice(0, 20))}
              placeholder={ui.customGatekeeperPlaceholder}
              aria-label={ui.customGatekeeperPlaceholder}
            />
          ) : null}
          <span className="field-err">{validationText(errors.gatekeeper, language)}</span>
        </div>
`;
  s = replaceOnce(s, nameFieldMarker, gatekeeperField + nameFieldMarker, "gatekeeper field");

  write(path, s);
}

// 2) Runtime validation/result payload.
{
  const path = "src/lib/club/runtime.mjs";
  let s = read(path);

  s = replaceOnce(
    s,
    'export function emptyPlayer() {\n  return { name: "", department: "", grade: "", phone: "" };\n}',
    'export function emptyPlayer() {\n  return { name: "", department: "", grade: "", phone: "", gatekeeper: "" };\n}',
    "emptyPlayer",
  );

  s = replaceOnce(
    s,
    '  grade: "其他",\n  phone: "0900000000",\n};',
    '  grade: "其他",\n  phone: "0900000000",\n  gatekeeper: "試玩",\n};',
    "guest gatekeeper",
  );

  s = replaceOnce(
    s,
    'const NAME_RE = /^[\\u4e00-\\u9fffA-Za-z·．\\s]{1,20}$/;',
    'const NAME_RE = /^[\\u4e00-\\u9fffA-Za-z·．\\s]{1,20}$/;\nconst GATEKEEPER_RE = /^[\\u4e00-\\u9fffA-Za-z·．\\s]{1,20}$/;',
    "gatekeeper regex",
  );

  s = replaceOnce(
    s,
    '  const grade = String(player?.grade ?? "").trim();\n  const phone = String(player?.phone ?? "").replace(/\\s+/g, "");',
    '  const grade = String(player?.grade ?? "").trim();\n  const phone = String(player?.phone ?? "").replace(/\\s+/g, "");\n  const gatekeeper = String(player?.gatekeeper ?? "").trim();',
    "gatekeeper parse",
  );

  s = replaceOnce(
    s,
    '  if (!grade) errors.grade = "請選擇年級";\n  else if (!GRADE_LIST.includes(grade)) errors.grade = "請選擇年級";\n  if (!phone) errors.phone = "請填寫手機";',
    '  if (!grade) errors.grade = "請選擇年級";\n  else if (!GRADE_LIST.includes(grade)) errors.grade = "請選擇年級";\n  if (!gatekeeper) errors.gatekeeper = "請選擇關主";\n  else if (!GATEKEEPER_RE.test(gatekeeper)) errors.gatekeeper = "請填 1–20 字的關主姓名";\n  if (!phone) errors.phone = "請填寫手機";',
    "gatekeeper validation",
  );

  s = replaceOnce(
    s,
    '  return { ok: true, data: { name, department, grade, phone }, errors: {} };',
    '  return { ok: true, data: { name, department, grade, phone, gatekeeper }, errors: {} };',
    "validated player data",
  );

  s = replaceOnce(
    s,
    '    grade: player.grade,\n    score: game.score,',
    '    grade: player.grade,\n    gatekeeper: player.gatekeeper,\n    score: game.score,',
    "public result gatekeeper",
  );

  write(path, s);
}

// 3) Type declarations.
{
  const path = "src/lib/club/runtime.d.ts";
  let s = read(path);
  s = s.replace(
    'export const GUEST_PLAYER: { name: string; department: string; grade: string; phone: string };',
    'export const GUEST_PLAYER: { name: string; department: string; grade: string; phone: string; gatekeeper: string };',
  );
  s = s.replace(
    'export function emptyPlayer(): { name: string; department: string; grade: string; phone: string };',
    'export function emptyPlayer(): { name: string; department: string; grade: string; phone: string; gatekeeper: string };',
  );
  s = s.replace(
    '  player: { name: string; department: string; grade: string; phone: string },',
    '  player: { name: string; department: string; grade: string; phone: string; gatekeeper: string },',
  );
  s = s.replace(
    '      data: { name: string; department: string; grade: string; phone: string };',
    '      data: { name: string; department: string; grade: string; phone: string; gatekeeper: string };',
  );
  write(path, s);
}

// 4) Send gatekeeper through the server-side sheet connector.
{
  const path = "src/lib/club/api.mjs";
  let s = read(path);
  s = replaceOnce(
    s,
    '      grade: row.grade,\n      phone: row.phone,',
    '      grade: row.grade,\n      gatekeeper: row.gatekeeper,\n      phone: row.phone,',
    "sheet payload gatekeeper",
  );
  write(path, s);
}

// 5) Keep existing tests valid and verify the sheet payload carries the new field.
for (const path of ["src/lib/club/api.test.mjs", "src/lib/club/runtime.test.mjs"]) {
  let s = read(path);
  s = s.replace(/grade: "大一",\n(\s*)phone:/g, 'grade: "大一",\n$1gatekeeper: "柏能",\n$1phone:');
  write(path, s);
}
{
  const path = "src/lib/club/api.test.mjs";
  let s = read(path);
  s = replaceOnce(
    s,
    '      assert.equal(sent.row.phone, "0968111723");',
    '      assert.equal(sent.row.gatekeeper, "柏能");\n      assert.equal(sent.row.phone, "0968111723");',
    "sheet test gatekeeper",
  );
  write(path, s);
}

// 6) Mobile-first CSS fixes. The register screen becomes one natural scroll surface,
//    the CTA loses the oversized 88px phone padding, and keyboard mode hides the hero.
{
  const path = "src/styles.css";
  let s = read(path);
  const marker = "/* Mobile registration + gatekeeper patch */";
  if (!s.includes(marker)) {
    s += `\n\n${marker}\n.field-hint {\n  margin: -1px 0 2px;\n  color: var(--color-muted);\n  font-size: 12px;\n  line-height: 1.4;\n}\n.gatekeeper-field {\n  padding: 10px;\n  border: 1px solid rgba(44, 36, 22, 0.08);\n  border-radius: 16px;\n  background: rgba(255, 253, 248, 0.72);\n}\n.gatekeeper-picks {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 8px;\n}\n.gatekeeper-pick {\n  min-height: 44px;\n  padding: 8px 10px;\n  border: 1.5px solid rgba(44, 36, 22, 0.14);\n  border-radius: 12px;\n  background: #fffdf8;\n  color: var(--color-ink);\n  font-size: 15px;\n  font-weight: 800;\n}\n.gatekeeper-pick.is-on {\n  border-color: var(--color-moss);\n  background: #e7f5e4;\n  color: #24532c;\n  box-shadow: 0 0 0 2px rgba(63, 122, 74, 0.08);\n}\n.gatekeeper-field > input {\n  width: 100%;\n  margin-top: 8px;\n}\n\n@media (min-width: 560px) {\n  .gatekeeper-field { grid-column: 1 / -1; }\n  .gatekeeper-picks { grid-template-columns: repeat(5, minmax(0, 1fr)); }\n}\n\n@media (max-width: 559px) {\n  .app-root[data-screen=\"register\"] .shell {\n    height: auto;\n    min-height: var(--app-h, 100dvh);\n    max-height: none;\n    overflow-y: auto;\n    overscroll-behavior-y: contain;\n    scroll-padding-bottom: 84px;\n  }\n  .register-layout {\n    flex: none;\n    min-height: var(--app-h, 100dvh);\n  }\n  .scene-hero {\n    height: 184px;\n  }\n  .scene-hero-overlay {\n    gap: 3px;\n    padding: 54px 14px 12px;\n  }\n  .hero-title {\n    font-size: clamp(25px, 7.6vw, 30px);\n  }\n  .hero-facts {\n    flex-wrap: nowrap;\n    max-width: 100%;\n    overflow-x: auto;\n    scrollbar-width: none;\n  }\n  .hero-facts::-webkit-scrollbar { display: none; }\n  .hero-facts span {\n    flex: 0 0 auto;\n    white-space: nowrap;\n  }\n  .sheet-register {\n    flex: none;\n    min-height: auto;\n    overflow: visible;\n    padding: 12px 16px 8px;\n  }\n  .form-kicker {\n    align-items: flex-start;\n    margin-bottom: 8px;\n  }\n  .field { margin-bottom: 8px; }\n  .field input,\n  .field select { height: 46px; }\n  .grade-picks { gap: 6px; }\n  .grade-pick {\n    min-height: 42px;\n    padding: 7px 11px;\n    font-size: 14px;\n  }\n  .cta-dock {\n    position: sticky;\n    bottom: 0;\n    gap: 4px;\n    padding: 9px 16px calc(12px + env(safe-area-inset-bottom));\n    background: rgba(255, 248, 236, 0.96);\n    -webkit-backdrop-filter: blur(12px);\n    backdrop-filter: blur(12px);\n    box-shadow: 0 -6px 18px rgba(44, 36, 22, 0.08);\n  }\n  .cta {\n    height: 52px;\n    min-height: 52px;\n  }\n  .privacy {\n    font-size: 11px;\n    line-height: 1.4;\n  }\n  .guest-link { min-height: 36px; }\n\n  html.is-keyboard .scene-hero { display: none; }\n  html.is-keyboard .sheet-register { padding-top: 10px; }\n  html.is-keyboard .cta-dock {\n    position: static;\n    padding-bottom: 8px;\n    box-shadow: none;\n    -webkit-backdrop-filter: none;\n    backdrop-filter: none;\n  }\n}\n`;
  }
  write(path, s);
}

// One-shot patch files should not remain in the product branch.
for (const path of [
  "scripts/apply-mobile-ui-gatekeeper.mjs",
  ".github/workflows/apply-mobile-ui-gatekeeper.yml",
]) {
  if (fs.existsSync(path)) fs.rmSync(path);
}

console.log("Applied mobile UI + gatekeeper patch.");
