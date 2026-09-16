const SECRET = /key|secret|token|credential|password|private|BEGIN |GOOGLE_|AIza|ya29|sk-|api[_-]?key/i;

/**
 * Surface a short, non-sensitive error for admin UI. Never print keys or upstream dumps.
 * @param {unknown} cause
 * @param {string} [fallback]
 */
export function publicError(cause, fallback = "同步失敗") {
  if (cause instanceof Error && cause.message === "AUTH") return fallback;
  const raw = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  if (SECRET.test(text)) return fallback;
  if (/JSON|Unexpected token|fetch failed|ECONN|ENOTFOUND/i.test(text)) return fallback;
  if (text.length > 80) return fallback;
  return text;
}
