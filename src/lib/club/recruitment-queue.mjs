// @ts-nocheck -- Queue membership is covered by recruitment-queue.test.mjs.
/** Queue defaults: only people related to the selected recruiter. */

/**
 * @param {{ recruiterList?: string[], recruiters?: string, gameGatekeeper?: string }} row
 * @param {string} self
 */
export function isRelatedToPartner(row, self) {
  const name = String(self || "").trim();
  if (!name || !row) return false;
  const listed = Array.isArray(row.recruiterList)
    ? row.recruiterList
    : String(row.recruiters || "").split(/[,，、]/).map((part) => part.trim()).filter(Boolean);
  if (listed.includes(name) || String(row.recruiters || "").trim() === name) return true;
  return String(row.gameGatekeeper || "").trim() === name;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {{
 *   self?: string,
 *   showAll?: boolean,
 *   handled?: Set<string>,
 *   includeHandled?: boolean,
 *   gameGatekeeper?: string,
 *   query?: string,
 * }} [options]
 */
export function filterPendingQueue(rows, options = {}) {
  const self = String(options.self || "").trim();
  const showAll = Boolean(options.showAll);
  const handled = options.handled instanceof Set ? options.handled : new Set();
  const includeHandled = Boolean(options.includeHandled);
  const gameGatekeeper = String(options.gameGatekeeper || "").trim();
  const needle = String(options.query || "").trim();
  return (rows || []).filter((row) => {
    if (handled.has(row.personKey) && !includeHandled) return false;
    if (gameGatekeeper && row.gameGatekeeper !== gameGatekeeper) return false;
    if (!showAll && !isRelatedToPartner(row, self)) return false;
    if (!needle) return true;
    return `${row.name || ""} ${row.phone || ""} ${row.department || ""} ${row.grade || ""}`.includes(needle);
  }).sort((a, b) => {
    const wait = Number(b.waitMinutes || 0) - Number(a.waitMinutes || 0);
    if (wait) return wait;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant");
  });
}
