import { Timer, Gauge, ArrowRightLeft } from "lucide-react";
import { TEXT, type Language } from "./presentation";

export function ChallengeHero({ language }: { language: Language }) {
  const zh = language === "zh";
  return (
    <section className="challenge-intro" aria-labelledby="challenge-title">
      <p className="eyebrow">{zh ? "淡江禪學社 · 115-1 社團博覽會" : "TKU Zen Club · Club Expo"}</p>
      <h1 className="hero-title" id="challenge-title">
        {TEXT[language].title}
      </h1>
      <p className="hero-subtitle">
        {zh ? "先看任務，再選顏色。每題會隨機是字面意思或視覺顏色。" : "Read the task, then tap a color. Each question is randomly word meaning or ink color."}
      </p>
      <div className="challenge-rules" aria-label={zh ? "挑戰規則" : "Challenge rules"}>
        <span className="rule-chip">
          <Timer size={16} />
          {zh ? "60 秒" : "60 seconds"}
        </span>
        <span className="rule-chip">
          <Gauge size={16} />
          {zh ? "一般速度" : "Normal speed"}
        </span>
        <span className="rule-chip">
          <ArrowRightLeft size={16} />
          {zh ? "每題隨機" : "Random each question"}
        </span>
      </div>
      <p className="rule-score">
        {zh
          ? "答對 +100 · 連對 5 題起 +200 · 答錯 −50"
          : "Correct +100 · From 5 in a row +200 · Mistake −50"}
      </p>
    </section>
  );
}
