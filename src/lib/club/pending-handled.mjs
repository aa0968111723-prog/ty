/** @typedef {{ getItem?: (key: string) => string | null, setItem?: (key: string, value: string) => void } | null} HandledStorage */

export const PENDING_HANDLED_STORAGE_KEY = "club-admin-pending-handled";

function defaultStorage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

/** @param {unknown} value */
function keysFrom(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((key) => typeof key === "string" && key.trim()))];
}

/** @param {HandledStorage} [storage] */
export function readHandledPersonKeys(storage = defaultStorage()) {
  if (!storage?.getItem) return [];
  try {
    return keysFrom(JSON.parse(storage.getItem(PENDING_HANDLED_STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
}

/**
 * @param {string} personKey
 * @param {HandledStorage} [storage]
 */
export function markPersonHandled(personKey, storage = defaultStorage()) {
  const key = typeof personKey === "string" ? personKey.trim() : "";
  const next = key ? [...new Set([...readHandledPersonKeys(storage), key])] : readHandledPersonKeys(storage);
  try {
    storage?.setItem?.(PENDING_HANDLED_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep the in-memory list even if this device blocks storage.
  }
  return next;
}

/** @param {string} personKey @param {string[]} keys */
export function isPersonHandled(personKey, keys) {
  return Boolean(personKey) && Array.isArray(keys) && keys.includes(personKey);
}
