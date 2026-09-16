// @ts-nocheck -- Partner-facing copy is covered by public-error.test.mjs.

export const METHOD_NOT_ALLOWED = "此操作目前無法使用";
export const NOT_FOUND = "找不到這個功能";
export const PUBLIC_ERROR_FALLBACK = "操作失敗，請稍後再試";

const KNOWN = {
  "method not allowed": METHOD_NOT_ALLOWED,
  "not found": NOT_FOUND,
  "not-configured": "資料來源尚未設定",
  "something went wrong": "發生問題，請重新整理",
  "something went wrong. try again.": "發生問題，請再試一次。",
  "an unexpected error occurred. try reloading the page.": "頁面暫時無法顯示，請重新整理後再試一次。",
};

const TECHNICAL =
  /googleapis|google-auth|private_key|ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|TypeError|ReferenceError|Cannot read|undefined is not|status(?:Code)?\s*[:=]?\s*\d{3}|at\s+\S+\s+\(|submissionId|error stack/i;

/**
 * Map API / runtime failures to Chinese copy partners can act on.
 * Never echo stacks, googleapis, or bare English protocol text.
 * @param {unknown} raw
 * @param {string} [fallback]
 */
export function publicAdminError(raw, fallback = PUBLIC_ERROR_FALLBACK) {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  const mapped = KNOWN[text.toLowerCase()];
  if (mapped) return mapped;
  if (TECHNICAL.test(text)) return "資料暫時無法讀取，請稍後再試";
  const partner = text.replaceAll("PIN", "解鎖碼");
  if (!/[\u3400-\u9fff]/.test(partner) && /[A-Za-z]{4,}/.test(partner)) return fallback;
  return partner;
}
