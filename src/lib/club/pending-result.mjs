const KEY = "club-focus-pending-result-v1";
const MAX_AGE_MS = 8 * 60 * 60 * 1000;

/** @param {Storage} storage @param {number} [now] */
export function readPendingResult(storage, now = Date.now()) {
  try {
    const entry = JSON.parse(storage.getItem(KEY) || "null");
    if (!entry) return null;
    if (entry.version !== 1 || !Number.isFinite(entry.savedAt) ||
      now < entry.savedAt || now - entry.savedAt >= MAX_AGE_MS ||
      entry.payload?.kind !== "official" || entry.payload?.skipSave !== false ||
      typeof entry.payload?.submissionId !== "string") {
      storage.removeItem(KEY);
      return null;
    }
    return entry.payload;
  } catch { return null; }
}

/** @param {Storage} storage @param {Record<string, unknown>} payload @param {number} [now] */
export function storePendingResult(storage, payload, now = Date.now()) {
  try {
    storage.setItem(KEY, JSON.stringify({ version: 1, savedAt: now, payload }));
    return true;
  } catch { return false; }
}

/** @param {Storage} storage @param {string} submissionId */
export function clearPendingResult(storage, submissionId) {
  try {
    if (readPendingResult(storage)?.submissionId === submissionId) storage.removeItem(KEY);
  } catch { /* Storage can be unavailable in private browsing. */ }
}
