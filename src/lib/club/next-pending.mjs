/** Same local key as the 待處理 queue. Game 關主 is never a 接引人. */
export const QUEUE_HANDLED_STORAGE_KEY = "club-handled-people";

/**
 * @typedef {{
 *   personKey?: string,
 *   name?: string,
 *   department?: string,
 *   grade?: string,
 *   waitMinutes?: number | null,
 *   completedAt?: string,
 *   gameCompletedAt?: string,
 *   gameGatekeeper?: string,
 *   recruiters?: string,
 *   recruiterList?: string[],
 * }} PendingPerson
 */

/**
 * Official 接引人 names only. Never treat 遊戲關主 as 接引人.
 * @param {PendingPerson | null | undefined} row
 * @returns {string[]}
 */
export function officialRecruiterNames(row) {
  const fromList = Array.isArray(row?.recruiterList) ? row.recruiterList : [];
  const fromText = String(row?.recruiters || "")
    .split(/[、,，]/)
    .map((name) => name.trim());
  return [...new Set([...fromList, ...fromText].map((name) => String(name || "").trim()).filter(Boolean))];
}

/**
 * @param {PendingPerson | null | undefined} row
 */
export function isUnassignedOfficialRecruiter(row) {
  return officialRecruiterNames(row).length === 0;
}

/**
 * @param {PendingPerson | null | undefined} row
 * @param {string} partner
 */
export function isAssignedToPartner(row, partner) {
  const name = typeof partner === "string" ? partner.trim() : "";
  return Boolean(name) && officialRecruiterNames(row).includes(name);
}

/**
 * Highest-priority unfilled person for the home next-action.
 * Prefers people already assigned to this partner as 正式招生接引人,
 * then unassigned 接引人. Skips people assigned to someone else.
 * Never ranks by 遊戲關主.
 *
 * @param {PendingPerson[] | null | undefined} pending
 * @param {{ partner?: string, handledKeys?: string[] }} [options]
 * @returns {PendingPerson | null}
 */
export function nextPendingPerson(pending, options = {}) {
  const partner = typeof options.partner === "string" ? options.partner.trim() : "";
  const handled = new Set(
    Array.isArray(options.handledKeys)
      ? options.handledKeys.filter((key) => typeof key === "string" && key.trim())
      : [],
  );
  const eligible = [];
  for (const row of Array.isArray(pending) ? pending : []) {
    if (!row || typeof row !== "object") continue;
    const personKey = typeof row.personKey === "string" ? row.personKey.trim() : "";
    if (!personKey || handled.has(personKey)) continue;
    const assignedToMe = isAssignedToPartner(row, partner);
    const unassigned = isUnassignedOfficialRecruiter(row);
    if (assignedToMe || unassigned) {
      eligible.push({ row, rank: assignedToMe ? 0 : 1, personKey });
    }
  }
  eligible.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const waitA = typeof a.row.waitMinutes === "number" ? a.row.waitMinutes : -1;
    const waitB = typeof b.row.waitMinutes === "number" ? b.row.waitMinutes : -1;
    if (waitA !== waitB) return waitB - waitA;
    const timeA = String(a.row.completedAt || a.row.gameCompletedAt || "");
    const timeB = String(b.row.completedAt || b.row.gameCompletedAt || "");
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return a.personKey.localeCompare(b.personKey);
  });
  return eligible[0]?.row || null;
}

/**
 * @param {PendingPerson | null | undefined} row
 * @param {string} [partner]
 * @returns {"assigned" | "unassigned" | ""}
 */
export function nextPendingReason(row, partner = "") {
  if (!row) return "";
  if (isAssignedToPartner(row, partner)) return "assigned";
  if (isUnassignedOfficialRecruiter(row)) return "unassigned";
  return "";
}
