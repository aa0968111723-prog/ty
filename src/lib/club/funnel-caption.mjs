/**
 * Funnel step note under the count. Never presents a >100% 「上一階」 conversion.
 * @param {{ id?: string, count?: number | null, fromPrevious?: number | null, missing?: boolean } | null | undefined} layer
 */
export function funnelStepCaption(layer) {
  if (!layer || layer.missing || layer.count == null) {
    return layer?.id === "played" ? "起點 · 歷史正式遊戲人數" : "資料不足";
  }
  if (layer.fromPrevious == null) {
    return layer.id === "played" ? "起點 · 歷史正式遊戲人數" : "資料不足";
  }
  if (layer.fromPrevious > 100) return "人數可多於前一階段";
  return `上一階 ${layer.fromPrevious}%`;
}
