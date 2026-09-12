import { google } from "googleapis";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEET_TIMEOUT_MS = 8_000;

export const RESULT_COLUMNS = [
  "submissionId", "name", "department", "grade", "gatekeeper", "phone",
  "score", "correct", "wrong", "accuracy", "maxCombo", "title", "duration",
  "kind", "skipSave", "settings", "completedAt",
];

let cachedCredentialsJson;
let cachedAuth;
let writeQueue = Promise.resolve();

function configuredValue(name) {
  const value = String(process.env[name] ?? "").trim();
  return value || null;
}

function serviceAccountJson() {
  const value = configuredValue("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!value) throw new Error("Google Sheets is not configured");
  return value;
}

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
  return {
    ...credentials,
    ...(typeof credentials.private_key === "string"
      ? { private_key: credentials.private_key.replace(/\\n/g, "\n") }
      : {}),
  };
}

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

function sheetConfig(action = "results") {
  const spreadsheetId = configuredValue("GOOGLE_SHEET_ID");
  const tab = configuredValue(action === "formResponses" ? "GOOGLE_FORM_SHEET_TAB" : "GOOGLE_SHEET_TAB");
  if (!spreadsheetId || !tab) throw new Error("Google Sheets is not configured");
  return { spreadsheetId, tab };
}

export function sheetsConfigured(action = "results") {
  const tabName = action === "formResponses" ? "GOOGLE_FORM_SHEET_TAB" : "GOOGLE_SHEET_TAB";
  return Boolean(
    configuredValue("GOOGLE_SERVICE_ACCOUNT_JSON") &&
    configuredValue("GOOGLE_SHEET_ID") &&
    configuredValue(tabName),
  );
}

function quotedSheetName(tab) {
  return `'${tab.replace(/'/g, "''")}'`;
}

function columnName(index) {
  let name = "";
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

function rowRange(tab, row, width) {
  return `${quotedSheetName(tab)}!A${row}:${columnName(width)}${row}`;
}

function cellValue(value) {
  return typeof value === "string" && value.startsWith("'") ? value.slice(1) : value;
}

function rowsFromValues(values) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) return [];
  const headers = values[0].map((value) => String(cellValue(value) ?? ""));
  return values.slice(1)
    .filter((cells) => Array.isArray(cells) && cells.some((value) => value !== "" && value != null))
    .map((cells) => {
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

function sheetCell(value) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function normalizedResult(row) {
  const normalized = {};
  for (const column of RESULT_COLUMNS) normalized[column] = cellValue(row[column]);
  if (typeof normalized.submissionId === "string") {
    normalized.submissionId = normalized.submissionId.toLowerCase();
  }
  if (typeof normalized.settings === "string") {
    try { normalized.settings = JSON.parse(normalized.settings); } catch { /* Keep invalid legacy settings invalid. */ }
  }
  return normalized;
}

function sameResult(left, right) {
  return JSON.stringify(normalizedResult(left)) === JSON.stringify(normalizedResult(right));
}

async function getValues(sheets, spreadsheetId, tab) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: quotedSheetName(tab),
    majorDimension: "ROWS",
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  }, { timeout: SHEET_TIMEOUT_MS });
  return Array.isArray(response.data.values) ? response.data.values : [];
}

export async function readSheetRows(action) {
  if (action !== "results" && action !== "formResponses") throw new TypeError("Invalid sheet action");
  const { spreadsheetId, tab } = sheetConfig(action);
  const values = await getValues(sheetsClient(), spreadsheetId, tab);
  return rowsFromValues(values);
}

async function saveOfficialResult(row) {
  const { spreadsheetId, tab } = sheetConfig();
  const sheets = sheetsClient();
  const values = await getValues(sheets, spreadsheetId, tab);
  const currentHeaders = Array.isArray(values[0])
    ? values[0].map((value) => String(cellValue(value) ?? ""))
    : [];
  const rows = rowsFromValues(values);
  const submissionId = String(row.submissionId).toLowerCase();
  const matches = rows.filter((existing) =>
    typeof existing.submissionId === "string" &&
    existing.submissionId.toLowerCase() === submissionId);
  if (matches.length) {
    const duplicate = matches.every((existing) => sameResult(existing, row));
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
        values: [headers.map((header) => sheetCell(row[header]))],
      }],
    },
  }, { timeout: SHEET_TIMEOUT_MS });
  return { saved: true, duplicate: false };
}

export function appendOfficialResult(row) {
  const task = writeQueue.then(
    () => saveOfficialResult(row),
    () => saveOfficialResult(row),
  );
  writeQueue = task.catch(() => {});
  return task;
}
