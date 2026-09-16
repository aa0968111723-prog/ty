/**
 * Partner-visible sync copy. Home strip clock is rendered separately as 「最後同步」.
 * Status words must include 成功 / 等待 / 失敗 — never 正常.
 *
 * @param {boolean} [hasLastData]
 */
export function partnerSyncFailure(hasLastData) {
  return hasLastData ? "同步失敗，仍顯示上次資料" : "同步失敗，請重新整理";
}

/**
 * @param {{ gameResults?: { ok?: boolean, stale?: boolean }, recruitmentResponses?: { ok?: boolean, stale?: boolean }, recruitmentMaster?: { ok?: boolean, stale?: boolean }, form?: { ok?: boolean, stale?: boolean } }} [sync]
 * @param {string} [error]
 */
export function recruitmentSyncLabel(sync = {}, error) {
  const flags = [
    sync.gameResults,
    sync.recruitmentResponses,
    sync.recruitmentMaster,
    sync.form,
  ];
  if (error) return { tone: "fail", text: partnerSyncFailure(true) };
  if (flags.every((flag) => flag?.ok)) return { tone: "ok", text: "同步成功" };
  if (flags.some((flag) => flag?.stale)) return { tone: "wait", text: "等待同步 · 顯示上次資料" };
  return { tone: "fail", text: partnerSyncFailure(true) };
}
