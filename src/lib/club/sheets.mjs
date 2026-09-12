import { google } from "googleapis";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEET_TIMEOUT_MS = 8_000;

export const RESULT_COLUMNS = [
  "submissionId", "name", "department", "grade", "gatekeeper", "phone",
  "score", "correct", "wrong", "accuracy", "maxCombo", "title", "duration",
  "kind", "skipSave", "settings", "completedAt",
];
const RESULT_SETTING_KEYS = [
  "duration", "switchMs", "speed", "comboEvery", "tapLockMs", "startMode", "sound", "vibrate",
];

/** @typedef {{ saved: boolean, duplicate: boolean, conflict?: boolean }} SaveResult */

/** @type {string | undefined} */
let cachedCredentialsJson;
/** @type {InstanceType<typeof google.auth.GoogleAuth> | undefined} */
let cachedAuth;
let writeQueue = Promise.resolve();

/** @param {string} name */
function configuredValue(name) {
  const value = String(process.env[name] ?? "").trim();
  return value || null;
}

/** @returns {string} */
function serviceAccountJson() {
  const value = configuredValue("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!value) throw new Error("Google Sheets is not configured");
  return value;
}

/** @param {string} value @returns {Record<string, any>} */
function serviceAccountCredentials(value) {
  let credentials;
  try {
    credentials = JSON.parse(value);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is invalid");
  }
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is invalid");
  }
  if (
    typeof credentials.client_email !== "string" || !credentials.client_email.trim() ||
    typeof credentials.private_key !== "string" || !credentials.private_key.trim()
  ) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is invalid");
  }
  return {
    ...credentials,
    private_key: credentials.private_key.replace(/\\n/g, "\n"),
  };
}

/** @returns {import("googleapis").sheets_v4.Sheets} */
function sheetsClient() {
  const credentialsJson = serviceAccountJson();
  if (!cachedAuth || cachedCredentialsJson !== credentialsJson) {
    cachedAuth = new google.auth.GoogleAuth({
      credentials: serviceAccountCredentials(credentialsJson),
      scopes: [SHEETS_SCOPE],
    });
    cachedCredentialsJson = credentialsJson;
  }
  return google.sheets({ version: "v4", auth: cachedAuth });
}

/** @param {"results" | "formResponses"} [action] */
function sheetConfig(action = "results") {
  const spreadsheetId = configuredValue("GOOGLE_SHEET_ID");
  const tab = configuredValue(action === "formResponses" ? "GOOGLE_FORM_SHEET_TAB" : "GOOGLE_SHEET_TAB");
  if (!spreadsheetId || !tab) throw new Error("Google Sheets is not configured");
  return { spreadsheetId, tab };
}

/** @param {"results" | "formResponses"} [action] */
export function sheetsConfigured(action = "results") {
  const tabName = action === "formResponses" ? "GOOGLE_FORM_SHEET_TAB" : "GOOGLE_SHEET_TAB";
  const credentialsJson = configuredValue("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!credentialsJson || !configuredValue("GOOGLE_SHEET_ID") || !configuredValue(tabName)) return false;
  try {
    serviceAccountCredentials(credentialsJson);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} tab */
function quotedSheetName(tab) {
  return `'${tab.replace(/'/g, "''")}'`;
}

/** @param {number} index */
function columnName(index) {
  let name = "";
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

/** @param {string} tab @param {number} row @param {number} width */
function rowRange(tab, row, width) {
  return `${quotedSheetName(tab)}!A${row}:${columnName(width)}${row}`;
}

/** @param {unknown} value */
function cellValue(value) {
  return typeof value === "string" && value.startsWith("'") ? value.slice(1) : value;
}

/** @param {unknown[][]} values @returns {Record<string, unknown>[]} */
function rowsFromValues(values) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return [];
  const headers = values[0].map((value) => String(cellValue(value) ?? ""));
  return values.slice(1)
    .filter((cells) => Array.isArray(cells) && cells.some((value) => value !== "" && value != null))
    .map((cells) => {
      /** @type {Record<string, unknown>} */
      const row = {};
      headers.forEach((header, index) => {
        if (!header) return;
        let value = cellValue(cells[index] ?? "");
        if (header === "settings" && typeof value === "string") {
          try { value = JSON.parse(value); } catch { /* Invalid legacy settings remain invalid. */ }
        }
        row[header] = value;
      });
      return row;
    });
}

/** @param {unknown} value @returns {string | number | boolean} */
function sheetCell(value) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : String(value);
}

/** @param {unknown} value */
function normalizedSettings(value) {
  let settings = value;
  if (typeof settings === "string") {
    try { settings = JSON.parse(settings); } catch { return settings; }
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return settings;
  const record = /** @type {Record<string, unknown>} */ (settings);
  return Object.fromEntries(RESULT_SETTING_KEYS.map((key) => [key, record[key]]));
}

/** @param {Record<string, unknown>} row */
function normalizedResult(row) {
  /** @type {Record<string, unknown>} */
  const normalized = {};
  for (const column of RESULT_COLUMNS) normalized[column] = cellValue(row[column]);
  if (typeof normalized.submissionId === "string") {
    normalized.submissionId = normalized.submissionId.toLowerCase();
  }
  normalized.settings = normalizedSettings(normalized.settings);
  return normalized;
}

/** @param {Record<string, unknown>} left @param {Record<string, unknown>} right */
function sameResult(left, right) {
  return JSON.stringify(normalizedResult(left)) === JSON.stringify(normalizedResult(right));
}

/**
 * @param {import("googleapis").sheets_v4.Sheets} sheets
 * @param {string} spreadsheetId
 * @param {string} tab
 * @returns {Promise<unknown[][]>}
 */
async function getValues(sheets, spreadsheetId, tab) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: quotedSheetName(tab),
    majorDimension: "ROWS",
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  }, { timeout: SHEET_TIMEOUT_MS });
  return Array.isArray(response.data.values)
    ? /** @type {unknown[][]} */ (response.data.values)
    : [];
}

/** @param {"results" | "formResponses"} action */
export async function readSheetRows(action) {
  if (action !== "results" && action !== "formResponses") throw new TypeError("Invalid sheet action");
  const { spreadsheetId, tab } = sheetConfig(action);
  const values = await getValues(sheetsClient(), spreadsheetId, tab);
  return rowsFromValues(values);
}

/** @param {Record<string, unknown>} row @returns {Promise<SaveResult>} */
async function saveOfficialResult(row) {
  const { spreadsheetId, tab } = sheetConfig();
  const sheets = sheetsClient();
  const values = await getValues(sheets, spreadsheetId, tab);
  const normalized = normalizedResult(row);
  const currentHeaders = Array.isArray(values[0])
    ? values[0].map((value) => String(cellValue(value) ?? ""))
    : [];
  const rows = rowsFromValues(values);
  const submissionId = String(normalized.submissionId).toLowerCase();
  const matches = rows.filter((existing) =>
    typeof existing.submissionId === "string" &&
    existing.submissionId.toLowerCase() === submissionId);
  if (matches.length) {
    const duplicate = matches.every((existing) => sameResult(existing, normalized));
    return duplicate
      ? { saved: true, duplicate: true }
      : { saved: false, duplicate: false, conflict: true };
  }

  const headers = [...currentHeaders];
  for (const column of RESULT_COLUMNS) if (!headers.includes(column)) headers.push(column);
  if (headers.length !== currentHeaders.length) {
    const range = rowRange(tab, 1, headers.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { range, majorDimension: "ROWS", values: [headers] },
    }, { timeout: SHEET_TIMEOUT_MS });
  }

  const nextRow = Math.max(values.length + 1, 2);
  const range = rowRange(tab, nextRow, headers.length);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [{
        range,
        majorDimension: "ROWS",
        values: [headers.map((header) => sheetCell(normalized[header]))],
      }],
    },
  }, { timeout: SHEET_TIMEOUT_MS });
  return { saved: true, duplicate: false };
}

/** @param {Record<string, unknown>} row @returns {Promise<SaveResult>} */
export function appendOfficialResult(row) {
  const task = writeQueue.then(
    () => saveOfficialResult(row),
    () => saveOfficialResult(row),
  );
  writeQueue = task.then(() => undefined, () => undefined);
  return task;
}
