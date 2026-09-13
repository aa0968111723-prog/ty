import { COLORS } from "@/lib/club/runtime.mjs";
import {
  TEXT,
  TUTORIAL_LESSONS,
  colorName,
  type ColorId,
  type Language,
} from "./presentation";

function colorHex(id: ColorId) {
  return COLORS.find((color) => color.id === id)?.hex ?? "currentColor";
}

export function HowToPlay({ language }: { language: Language }) {
  const ui = TEXT[language];
  const zh = language === "zh";

  return (
    <section className="how-to-play" aria-labelledby="how-to-title" data-howto="rules">
      <h2 id="how-to-title">{ui.howToTitle}</h2>
      <ol className="how-to-flow">
        <li>
          <span className="how-to-step" aria-hidden="true">
            1
          </span>
          <span>{ui.flowFill}</span>
        </li>
        <li>
          <span className="how-to-step" aria-hidden="true">
            2
          </span>
          <span>{ui.flowTutorial}</span>
        </li>
        <li>
          <span className="how-to-step" aria-hidden="true">
            3
          </span>
          <span>{ui.flowOfficial}</span>
        </li>
      </ol>
      <div className="how-to-lessons">
        {TUTORIAL_LESSONS.map((lesson) => {
          const pick = lesson.mode === "meaning" ? lesson.meaning : lesson.visual;
          return (
            <article
              key={lesson.mode}
              className={"how-to-card mode-" + lesson.mode}
              data-lesson={lesson.mode}
            >
              <p className="how-to-mode">
                {lesson.mode === "meaning" ? ui.howToMeaningTitle : ui.howToVisualTitle}
              </p>
              <p className="how-to-word" style={{ color: colorHex(lesson.visual) }}>
                {colorName(lesson.meaning, language)}
              </p>
              <p className="how-to-hint">
                {lesson.mode === "meaning" ? ui.howToMeaningHint : ui.howToVisualHint}
              </p>
              <p className="how-to-pick">
                <span>{ui.howToPick}</span>
                <span className={"ans-swatch ans-" + pick} aria-hidden="true" />
                <strong>{colorName(pick, language)}</strong>
              </p>
            </article>
          );
        })}
      </div>
      <p className="how-to-switch">
        {zh ? "答完一題，任務就會換成另一種。" : "After each answer, the task switches."}
      </p>
    </section>
  );
}
