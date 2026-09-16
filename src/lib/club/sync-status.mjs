/**
 * Home sync strip. The clock is rendered separately as 「最後同步」.
 * Status copy must include 成功 / 等待 / 失敗.
 *
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
  if (error) return { tone: "fail", text: "同步失敗，仍顯示上次資料" };
  if (flags.every((flag) => flag?.ok)) return { tone: "ok", text: "同步成功" };
  if (flags.some((flag) => flag?.stale)) return { tone: "wait", text: "等待同步 · 顯示上次資料" };
  return { tone: "fail", text: "同步失敗，仍顯示上次資料" };
}
