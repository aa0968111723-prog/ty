export const PENDING_HANDLED_STORAGE_KEY = "club-admin-pending-handled";

/** @param {unknown} value */
function keysFrom(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((key) => typeof key === "string" && key.trim()))];
}

/** @param {{ getItem?: (key: string) => string | null }} [storage] */
export function readHandledPersonKeys(storage) {
  const store = storage || (typeof localStorage === "undefined" ? null : localStorage);
  if (!store?.getItem) return [];
  try {
    return keysFrom(JSON.parse(store.getItem(PENDING_HANDLED_STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
}

/**
 * @param {string} personKey
 * @param {{ getItem?: (key: string) => string | null, setItem?: (key: string, value: string) => void }} [storage]
 */
export function markPersonHandled(personKey, storage) {
  const key = typeof personKey === "string" ? personKey.trim() : "";
  const store = storage || (typeof localStorage === "undefined" ? null : localStorage);
  const next = key ? [...new Set([...readHandledPersonKeys(store), key])] : readHandledPersonKeys(store);
  try {
    store?.setItem?.(PENDING_HANDLED_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep the in-memory list even if this device blocks storage.
  }
  return next;
}

/** @param {string} personKey @param {string[]} keys */
export function isPersonHandled(personKey, keys) {
  return Boolean(personKey) && Array.isArray(keys) && keys.includes(personKey);
}
