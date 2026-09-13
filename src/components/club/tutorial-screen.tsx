import { useState } from "react";
import { COLORS } from "@/lib/club/runtime.mjs";
import { ClubHeader } from "./club-header";
import {
  TEXT,
  TUTORIAL_LESSONS,
  colorName,
  tutorialCorrectId,
  type ColorId,
  type Language,
} from "./presentation";

export function TutorialScreen({
  language,
  onLanguage,
  onFinished,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  onFinished: () => void;
}) {
  const ui = TEXT[language];
  const [step, setStep] = useState(0);
  const [wrong, setWrong] = useState(false);
  const lesson = TUTORIAL_LESSONS[step];
  const visual = COLORS.find((color) => color.id === lesson.visual);

  function pick(id: ColorId) {
    if (id !== tutorialCorrectId(lesson)) {
      setWrong(true);
      return;
    }
    setWrong(false);
    if (step + 1 >= TUTORIAL_LESSONS.length) {
      onFinished();
      return;
    }
    setStep(step + 1);
  }

  return (
    <section className="screen screen-tutorial active" data-tutorial="1">
      <ClubHeader language={language} onLanguage={onLanguage} />
      <div className="tutorial-board">
        <p className="eyebrow">
          {ui.tutorialTitle}
          {" · "}
          {language === "zh"
            ? `${ui.tutorialProgress}${step + 1} 題`
            : `${ui.tutorialProgress} ${step + 1}`}
        </p>
        <div className={"mode-card mode-" + lesson.mode} data-mode={lesson.mode} data-tutorial-step={step}>
          <small>
            {lesson.mode === "meaning" ? ui.tutorialCoachMeaning : ui.tutorialCoachVisual}
          </small>
          <strong>
            {lesson.mode === "meaning" ? ui.meaningMode : ui.visualMode}
          </strong>
        </div>
        <div className="play-area">
          <div className="stroop-card">
            <div className="stroop" style={{ color: visual?.hex }}>
              {colorName(lesson.meaning, language)}
            </div>
          </div>
        </div>
        {wrong ? (
          <p className="tutorial-wrong" role="status" aria-live="polite">
            {ui.tutorialWrong}
          </p>
        ) : (
          <p className="tutorial-next">
            {step === 0 ? ui.tutorialNext : ui.tutorialStartWarmup}
          </p>
        )}
        <div className="deck-tray">
          <div className="answers">
            {COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                className={"ans ans-" + color.id}
                aria-label={colorName(color.id as ColorId, language)}
                data-color={color.id}
                onClick={() => pick(color.id as ColorId)}
              >
                {colorName(color.id as ColorId, language)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
