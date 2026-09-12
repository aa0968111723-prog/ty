import { useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { AdminLogin } from "@/components/admin-login";
import { ClubHeader } from "./club-header";
import { ChallengeHero } from "./challenge-hero";
import { LeaderSelector } from "./leader-selector";
import { DEPARTMENT_GROUPS, GRADE_LIST, isOfficialSettings } from "@/lib/club/runtime.mjs";
import {
  TEXT,
  gradeName,
  collegeName,
  departmentName,
  validationText,
  type Language,
  type Player,
  type GameSettings,
} from "./presentation";

export function RegisterScreen({
  language,
  onLanguage,
  player,
  errors,
  busy,
  settings,
  onChange,
  onStart,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  player: Player;
  errors: Record<string, string | undefined>;
  busy: boolean;
  settings: GameSettings;
  onChange: (key: keyof Player, value: string) => void;
  onStart: () => void;
}) {
  const ui = TEXT[language];
  const official = isOfficialSettings(settings);
  const [openAdmin, setOpenAdmin] = useState(false);

  return (
    <>
      <form
        className="register-layout"
        data-register="official"
        noValidate
        autoComplete="on"
        onSubmit={(e) => {
          e.preventDefault();
          onStart();
        }}
      >
        <ClubHeader
          language={language}
          onLanguage={onLanguage}
          onAdmin={() => setOpenAdmin(true)}
        />
        <div className="registration-content">
          <ChallengeHero language={language} />
          <div className="sheet-register">
            <LeaderSelector
              language={language}
              player={player}
              error={errors.gatekeeper}
              onChange={onChange}
            />
            <div className="form-kicker">
              <div>
                <h2>{language === "zh" ? "參賽資料" : "Your details"}</h2>
                <p>
                  {language === "zh"
                    ? "填妥資料，先暖身 15 秒，再挑戰正式 60 秒。"
                    : "Enter your details. Warm up for 15 seconds, then take the 60-second challenge."}
                </p>
              </div>
            </div>
            <div className="registration-fields">
              <div className={"field" + (errors.name ? " is-invalid" : "")}>
                <label htmlFor="name">{ui.name}</label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  maxLength={20}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "name-error" : undefined}
                  value={player.name}
                  onChange={(e) => onChange("name", e.target.value)}
                  placeholder={ui.namePlaceholder}
                />
                <span id="name-error" className="field-err">
                  {validationText(errors.name, language)}
                </span>
              </div>
              <div className={"field" + (errors.department ? " is-invalid" : "")}>
                <label htmlFor="department">{ui.department}</label>
                <select
                  id="department"
                  name="department"
                  aria-invalid={Boolean(errors.department)}
                  aria-describedby={errors.department ? "department-error" : undefined}
                  value={player.department}
                  onChange={(e) => onChange("department", e.target.value)}
                >
                  <option value="">{ui.selectDepartment}</option>
                  {DEPARTMENT_GROUPS.map((g) => (
                    <optgroup key={g.college} label={collegeName(g.college, language)}>
                      {g.items.map((d) => (
                        <option key={d} value={d}>
                          {departmentName(d, language)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <span id="department-error" className="field-err">
                  {validationText(errors.department, language)}
                </span>
              </div>
              <div className={"field" + (errors.grade ? " is-invalid" : "")}>
                <span id="grade-label" className="field-label">
                  {ui.year}
                </span>
                <select
                  id="grade"
                  className="sr-only"
                  aria-labelledby="grade-label"
                  tabIndex={-1}
                  aria-hidden="true"
                  value={player.grade}
                  onChange={(e) => onChange("grade", e.target.value)}
                >
                  <option value="">{ui.selectYear}</option>
                  {GRADE_LIST.map((g) => (
                    <option key={g} value={g}>
                      {gradeName(g, language)}
                    </option>
                  ))}
                </select>
                <div className="grade-picks" role="group" aria-labelledby="grade-label">
                  {GRADE_LIST.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={"grade-pick" + (player.grade === g ? " is-on" : "")}
                      data-grade={g}
                      aria-pressed={player.grade === g}
                      onClick={() => onChange("grade", g)}
                    >
                      {gradeName(g, language)}
                    </button>
                  ))}
                </div>
                <span className="field-err">{validationText(errors.grade, language)}</span>
              </div>
              <div className={"field" + (errors.phone ? " is-invalid" : "")}>
                <label htmlFor="phone">{ui.mobile}</label>
                <input
                  id="phone"
                  name="tel"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? "phone-error" : undefined}
                  maxLength={10}
                  value={player.phone}
                  onChange={(e) =>
                    onChange("phone", e.target.value.replace(/[^\d]/g, "").slice(0, 10))
                  }
                  placeholder={ui.phonePlaceholder}
                />
                <span id="phone-error" className="field-err">
                  {validationText(errors.phone, language)}
                </span>
              </div>
            </div>
          </div>
          <div className="cta-dock">
            <button type="submit" className="cta" data-cta="official" disabled={busy}>
              {busy
                ? ui.preparing
                : official
                  ? ui.officialStart
                  : ui.practiceStartPrefix + settings.duration + ui.practiceStartSuffix}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <p className="privacy-note">
              <LockKeyhole size={14} aria-hidden="true" />
              {language === "zh"
                ? "資料僅供本次活動聯絡使用，成績不公開。"
                : "Your details are only used for this event. Scores stay private."}
            </p>
          </div>
        </div>
      </form>
      {openAdmin ? (
        <AdminLogin
          onClose={() => setOpenAdmin(false)}
          onSuccess={() => window.location.assign("/admin")}
        />
      ) : null}
    </>
  );
}
