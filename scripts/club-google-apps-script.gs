/*
 * Deploy as an Apps Script web app executing as the spreadsheet owner.
 * Set Script Properties PASSWORD, GOOGLE_SHEET_ID, GOOGLE_SHEET_TAB and
 * GOOGLE_FORM_SHEET_TAB. Keep PASSWORD server-side; an unset value denies access.
 * The result sheet itself is the durable submission ledger. Never delete its
 * submissionId column or reuse this deployment for untrusted script editors.
 */
var CLUB_RESULT_COLUMNS = [
  "submissionId", "name", "department", "grade", "gatekeeper", "phone",
  "score", "correct", "wrong", "accuracy", "maxCombo", "title", "duration",
  "kind", "skipSave", "settings", "completedAt"
];

function clubJson(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return clubJson({ ok: false, error: "unauthorized" });
}

function clubSettings(settings) {
  var expected = {
    duration: 60, switchMs: 3000, speed: "normal", comboEvery: 3,
    tapLockMs: 64, startMode: "meaning"
  };
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  var normalized = {};
  for (var key in expected) {
    if (settings[key] !== expected[key]) return null;
    normalized[key] = settings[key];
  }
  if (typeof settings.sound !== "boolean" || typeof settings.vibrate !== "boolean") return null;
  normalized.sound = settings.sound;
  normalized.vibrate = settings.vibrate;
  return normalized;
}

function clubCanonicalRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  var settings = clubSettings(row.settings);
  if (!settings || row.kind !== "official" || row.skipSave !== false || row.duration !== 60) return null;
  if (typeof row.submissionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.submissionId)) return null;
  if (typeof row.completedAt !== "string" || !Number.isFinite(Date.parse(row.completedAt)) ||
      new Date(row.completedAt).toISOString() !== row.completedAt) return null;
  var numeric = ["score", "correct", "wrong", "maxCombo"];
  for (var i = 0; i < numeric.length; i++) {
    if (!Number.isSafeInteger(row[numeric[i]]) || row[numeric[i]] < 0) return null;
  }
  if (row.correct + row.wrong > 938 || row.maxCombo > row.correct ||
      row.score > 100 * Math.min(row.correct, 4) + 200 * Math.max(0, row.correct - 4) ||
      row.score % 50 !== 0 || !Number.isFinite(row.accuracy) ||
      row.accuracy !== (row.correct + row.wrong === 0 ? 0 :
        Math.round(1000 * row.correct / (row.correct + row.wrong)) / 10)) return null;
  var text = ["name", "department", "grade", "gatekeeper", "phone", "title"];
  for (var j = 0; j < text.length; j++) {
    if (typeof row[text[j]] !== "string" || !row[text[j]].trim() || row[text[j]].length > 100) return null;
  }
  if (!/^09\d{8}$/.test(row.phone)) return null;
  var normalized = {};
  CLUB_RESULT_COLUMNS.forEach(function (column) { normalized[column] = row[column]; });
  normalized.submissionId = row.submissionId.toLowerCase();
  normalized.settings = settings;
  return normalized;
}

function clubReadRows(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return [];
  var values = sheet.getDataRange().getValues();
  var headers = values.shift();
  return values.filter(function (cells) {
    return cells.some(function (cell) { return cell !== ""; });
  }).map(function (cells) {
    var row = {};
    headers.forEach(function (header, index) {
      if (!header) return;
      var value = cells[index];
      if (value instanceof Date) value = value.toISOString();
      if (typeof value === "string" && value.charAt(0) === "'") value = value.slice(1);
      if (header === "settings" && typeof value === "string") {
        try { value = JSON.parse(value); } catch (_) { /* Invalid legacy settings remain invalid. */ }
      }
      row[header] = value;
    });
    return row;
  });
}

function clubCell(value) {
  if (value && typeof value === "object") return JSON.stringify(value);
  // Prevent sheet formulas and preserve leading zeros in phone numbers.
  if (typeof value === "string" && /^[=+\-@\t\r\n0-9]/.test(value)) return "'" + value;
  return value;
}

function clubAppend(sheet, row) {
  var headers = sheet.getLastRow() > 0 ? sheet.getDataRange().getValues()[0] : [];
  var missing = CLUB_RESULT_COLUMNS.filter(function (column) { return headers.indexOf(column) < 0; });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
  }
  var cells = headers.map(function (column) {
    return Object.prototype.hasOwnProperty.call(row, column) ? clubCell(row[column]) : "";
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, cells.length).setValues([cells]);
  SpreadsheetApp.flush();
}

function doPost(event) {
  var lock;
  var locked = false;
  try {
    var body = JSON.parse(event.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var password = props.getProperty("PASSWORD");
    if (!password || !body || typeof body.password !== "string" || body.password !== password) {
      return clubJson({ ok: false, error: "unauthorized" });
    }
    var sheetId = props.getProperty("GOOGLE_SHEET_ID");
    var sheetTab = props.getProperty("GOOGLE_SHEET_TAB");
    var formSheetTab = props.getProperty("GOOGLE_FORM_SHEET_TAB");
    if (!sheetId || !sheetTab ||
        (body.sheetId !== undefined && body.sheetId !== sheetId) ||
        (body.sheetTab !== undefined && body.sheetTab !== sheetTab) ||
        (body.formSheetTab !== undefined && body.formSheetTab !== formSheetTab)) {
      return clubJson({ ok: false, error: "configuration" });
    }
    if (body.action !== undefined && body.action !== "results" && body.action !== "formResponses") {
      return clubJson({ ok: false, error: "invalid_action" });
    }
    lock = LockService.getScriptLock();
    locked = lock.tryLock(10000);
    if (!locked) return clubJson({ ok: false, error: "busy" });
    var spreadsheet = SpreadsheetApp.openById(sheetId);
    if (body.action) {
      var tab = body.action === "formResponses" ? formSheetTab : sheetTab;
      if (!tab) return clubJson({ ok: false, error: "configuration" });
      var readSheet = spreadsheet.getSheetByName(tab);
      if (!readSheet) return clubJson({ ok: false, error: "sheet_missing" });
      return clubJson({ ok: true, rows: clubReadRows(readSheet) });
    }
    var row = clubCanonicalRow(body.row);
    if (!row) return clubJson({ ok: false, error: "invalid_result" });
    var sheet = spreadsheet.getSheetByName(sheetTab);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetTab);
    var matches = clubReadRows(sheet).filter(function (existing) {
      return typeof existing.submissionId === "string" &&
        existing.submissionId.toLowerCase() === row.submissionId;
    });
    if (matches.length) {
      var identical = matches.every(function (existing) {
        var canonical = clubCanonicalRow(existing);
        return canonical && JSON.stringify(canonical) === JSON.stringify(row);
      });
      return identical
        ? clubJson({ ok: true, saved: true, duplicate: true })
        : clubJson({ ok: false, saved: false, conflict: true, error: "submission_conflict" });
    }
    clubAppend(sheet, row);
    return clubJson({ ok: true, saved: true, duplicate: false });
  } catch (_) {
    return clubJson({ ok: false, saved: false, error: "request_failed" });
  } finally {
    if (locked) lock.releaseLock();
  }
}
