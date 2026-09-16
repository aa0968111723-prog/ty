/**
 * 2026招生狀況表單-上  ↔  09/14 後玩遊戲  ↔  招生狀況表
 *
 * Uses the script owner's Google authorization. Do NOT store a service-account
 * JSON key in this project. Set Script Properties:
 *   SPREADSHEET_ID
 *   FORM_ID
 * Optional:
 *   DRY_RUN=true
 *   GAME_TAB=09/14 後玩遊戲（無空白的分頁標題，sheetId 896311128）
 *   RECRUITMENT_TAB=招生狀況表
 *   GAME_SHEET_ID=896311128
 *   RECRUITMENT_SHEET_ID=1921679351
 */
var RECRUIT_FORM_TITLES = {
  gameGatekeeper: "本次遊戲關主",
  student: "選擇學生"
};
var PLACEHOLDER_CHOICE = "（目前沒有待跟進學生）";
var UNCLASSIFIED = "未分類";
var UNKNOWN_GATEKEEPER = "未知關主";
var PRESERVED_TITLES = [
  "接引人(可複選)", "接引日期", "同學的姓名", "同學電話/LINE", "系級",
  "這位同學是屬於那個分級呢:-)", "報名了那個活動", "同學生日", "備註",
  "生日", "學號", "興趣", "對甚麼有興趣", "是否入社", "保證金是否繳費", "繳了多少呢?"
];
var HELPER_HEADERS = ["_gameSubmissionId", "_gameGatekeeper", "_gameCompletedAt", "_syncVersion", "_duplicate"];
var OFFICIAL_VIEWFORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdzbqD9Bq4qaRu5HVfUS-pTNLSKiFcmGNs72w2lWuZ9u6TE7A/viewform";
var LIVE_PREFILL_ENTRIES = {
  recruiter: "entry.1318284482",
  recruitDate: "entry.526408341",
  name: "entry.887514514",
  phone: "entry.1668669667",
  departmentGrade: "entry.628075911",
  note: "entry.88032894"
};
var OFFICIAL_RECRUITERS = ["安倢", "小哲", "柏能", "宛臻老師", "宜晃", "柏憲", "振泰", "慕恩", "心宇", "瑀晴"];
var LAST_GOOD_KEY = "LAST_GOOD_CHOICES";
var SNAPSHOT_KEY = "FORM_STRUCTURE_SNAPSHOT";
var SYNC_VERSION = "1";

function recruitProps_() {
  var props = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: props.getProperty("SPREADSHEET_ID") || props.getProperty("GOOGLE_SHEET_ID"),
    formId: props.getProperty("FORM_ID"),
    dryRun: String(props.getProperty("DRY_RUN") || "").toLowerCase() === "true",
    gameTab: props.getProperty("GAME_TAB") || props.getProperty("GOOGLE_GAME_SHEET_TAB") || (["09", "14後玩遊戲"].join("/")),
    recruitmentTab: props.getProperty("RECRUITMENT_TAB") || "招生狀況表",
    expectedGameSheetId: Number(props.getProperty("GAME_SHEET_ID") || 896311128),
    expectedRecruitmentSheetId: Number(props.getProperty("RECRUITMENT_SHEET_ID") || 1921679351)
  };
}

function recruitText_(value) {
  return value == null ? "" : String(value).trim();
}

function recruitNormalizeName_(value) {
  return recruitText_(value).normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function recruitNormalizePhone_(value) {
  var raw = recruitText_(value).normalize("NFKC");
  if (!raw) return null;
  if (/[A-Za-z\u4e00-\u9fff]/.test(raw) && !/\d/.test(raw)) return null;
  var compact = raw.replace(/[()\s\-．.]/g, "").replace(/^(\+|＋)?886/, "0");
  if (/^09\d{8}$/.test(compact)) return compact;
  var digits = raw.replace(/\D/g, "");
  if (/^9\d{8}$/.test(digits) && !/[A-Za-z\u4e00-\u9fff]/.test(raw)) return "0" + digits;
  var matches = raw.match(/09[\d\-.\s]{8,14}/g) || [];
  var phones = [];
  for (var i = 0; i < matches.length; i++) {
    var phone = matches[i].replace(/\D/g, "");
    if (/^09\d{8}$/.test(phone) && phones.indexOf(phone) < 0) phones.push(phone);
  }
  return phones.length === 1 ? phones[0] : null;
}

function recruitSheetByTitleOrId_(spreadsheet, title, expectedId) {
  var sheets = spreadsheet.getSheets();
  var i;
  if (expectedId != null) {
    for (i = 0; i < sheets.length; i++) {
      if (sheets[i].getSheetId() === expectedId) return sheets[i];
    }
  }
  return spreadsheet.getSheetByName(title);
}

function recruitReadRows_(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return { headers: [], rows: [] };
  var values = sheet.getDataRange().getValues();
  var headers = values.shift() || [];
  var rows = [];
  for (var r = 0; r < values.length; r++) {
    var empty = true;
    var row = {};
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var value = values[r][c];
      if (value !== "" && value != null) empty = false;
      if (value instanceof Date) value = value.toISOString();
      if (typeof value === "string" && value.charAt(0) === "'") value = value.slice(1);
      row[headers[c]] = value;
    }
    if (!empty) rows.push(row);
  }
  return { headers: headers.map(function (h) { return String(h); }), rows: rows };
}

function recruitField_(row, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (recruitText_(row[keys[i]])) return recruitText_(row[keys[i]]);
  }
  return "";
}

function recruitIsDuplicate_(row) {
  var flag = recruitText_(row._duplicate).toLowerCase();
  return flag === "true" || flag === "1" || row._duplicate === true;
}

function recruitGameAttempts_(rows) {
  var attempts = [];
  var seen = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var submissionId = recruitField_(row, ["_submissionId", "submissionId"]).toLowerCase();
    var name = recruitField_(row, ["姓名", "name"]);
    var phone = recruitField_(row, ["電話", "phone"]);
    var gatekeeper = recruitField_(row, ["遊戲關主", "關主", "gatekeeper"]) || UNCLASSIFIED;
    if (submissionId && seen[submissionId]) continue;
    if (submissionId) seen[submissionId] = true;
    if (!name && !phone && !submissionId) continue;
    attempts.push({
      submissionId: submissionId,
      name: name,
      normalizedName: recruitNormalizeName_(name),
      phone: phone,
      normalizedPhone: recruitNormalizePhone_(phone),
      department: recruitField_(row, ["科系", "department"]),
      grade: recruitField_(row, ["年級", "grade"]),
      gatekeeper: gatekeeper,
      completedAt: recruitField_(row, ["遊戲時間", "completedAt"]),
      score: row["分數"] || row.score || ""
    });
  }
  return attempts;
}

function recruitPeople_(attempts) {
  var byPhone = {};
  var people = [];
  var i;
  for (i = 0; i < attempts.length; i++) {
    var attempt = attempts[i];
    if (attempt.normalizedPhone) {
      if (!byPhone[attempt.normalizedPhone]) byPhone[attempt.normalizedPhone] = [];
      byPhone[attempt.normalizedPhone].push(attempt);
    }
  }
  var used = {};
  Object.keys(byPhone).forEach(function (phone) {
    var group = byPhone[phone];
    group.forEach(function (attempt) { used[attempt.submissionId] = true; });
    people.push(recruitPersonFrom_(group, "phone:" + phone));
  });
  var byName = {};
  for (i = 0; i < attempts.length; i++) {
    if (used[attempts[i].submissionId] || !attempts[i].normalizedName) continue;
    if (!byName[attempts[i].normalizedName]) byName[attempts[i].normalizedName] = [];
    byName[attempts[i].normalizedName].push(attempts[i]);
  }
  Object.keys(byName).forEach(function (name) {
    var group = byName[name];
    var phoneHit = people.some(function (person) { return person.normalizedName === name; });
    if (phoneHit) return;
    if (group.length === 1) people.push(recruitPersonFrom_(group, "name:" + name));
    else {
      group.forEach(function (attempt) {
        people.push(recruitPersonFrom_([attempt], "attempt:" + (attempt.submissionId || name)));
      });
    }
  });
  for (i = 0; i < attempts.length; i++) {
    if (!attempts[i].normalizedName && !attempts[i].normalizedPhone) {
      people.push(recruitPersonFrom_([attempts[i]], "attempt:" + (attempts[i].submissionId || i)));
    }
  }
  return people;
}

function recruitPersonFrom_(group, personKey) {
  var latest = group[0];
  for (var i = 1; i < group.length; i++) {
    if (String(group[i].completedAt) > String(latest.completedAt)) latest = group[i];
  }
  return {
    personKey: personKey,
    name: latest.name,
    normalizedName: latest.normalizedName,
    phone: latest.phone,
    normalizedPhone: latest.normalizedPhone || group.map(function (row) { return row.normalizedPhone; }).filter(Boolean)[0] || null,
    department: latest.department,
    grade: latest.grade,
    gameGatekeeper: latest.gatekeeper || UNCLASSIFIED,
    completedAt: latest.completedAt,
    score: latest.score,
    submissionId: latest.submissionId,
    latestAttempt: latest,
    attempts: group
  };
}

function recruitRecruited_(people, responses) {
  var valid = responses.filter(function (row) { return !recruitIsDuplicate_(row); });
  return people.filter(function (person) {
    var ids = {};
    person.attempts.forEach(function (attempt) {
      if (attempt.submissionId) ids[attempt.submissionId] = true;
    });
    for (var i = 0; i < valid.length; i++) {
      var row = valid[i];
      var sid = recruitField_(row, ["_gameSubmissionId", "submissionId"]).toLowerCase();
      if (sid && ids[sid]) return true;
      var phone = recruitNormalizePhone_(recruitField_(row, ["同學電話/LINE", "電話"]));
      if (person.normalizedPhone && phone && person.normalizedPhone === phone) return true;
      var name = recruitNormalizeName_(recruitField_(row, ["同學的姓名", "姓名"]));
      if (person.normalizedName && name === person.normalizedName && person.personKey.indexOf("name:") === 0) {
        var sameName = valid.filter(function (item) {
          return recruitNormalizeName_(recruitField_(item, ["同學的姓名", "姓名"])) === name;
        });
        if (sameName.length === 1) return true;
      }
    }
    return false;
  });
}

function recruitEncodeChoice_(person) {
  var clock = recruitText_(person.completedAt);
  if (clock.length >= 16) clock = clock.slice(11, 16);
  else if (!clock) clock = "--:--";
  var deptGrade = (person.department || "") + (person.grade || "") || "系級未填";
  var phone = person.phone || person.normalizedPhone || "電話未填";
  return (person.name || "未填姓名") + "｜" + deptGrade + "｜" + phone + "｜" + clock
    + "|#p:" + person.personKey + "|#s:" + (person.submissionId || "");
}

function recruitDecodeChoice_(value) {
  var raw = recruitText_(value);
  var personKey = (raw.match(/#p:([^|#]+)/) || [])[1] || "";
  var submissionId = ((raw.match(/#s:([0-9a-f-]*)/i) || [])[1] || "").toLowerCase();
  return {
    label: raw.split("|#p:")[0],
    personKey: personKey,
    submissionId: submissionId,
    placeholder: raw.indexOf(PLACEHOLDER_CHOICE) === 0
  };
}

function snapshotFormStructure() {
  var cfg = recruitProps_();
  if (!cfg.formId) throw new Error("FORM_ID is not set");
  var form = FormApp.openById(cfg.formId);
  var items = form.getItems().map(function (item, index) {
    var title = item.getTitle();
    var choices = [];
    try {
      var mc = item.asMultipleChoiceItem();
      choices = mc.getChoices().map(function (choice) { return choice.getValue(); });
    } catch (err) { /* not a multiple-choice item */ }
    return {
      id: item.getId(),
      title: title,
      type: String(item.getType()),
      index: index,
      choices: choices,
      preserved: PRESERVED_TITLES.some(function (name) { return title.indexOf(name) === 0; })
    };
  });
  var snapshot = {
    id: form.getId(),
    title: form.getTitle(),
    itemCount: items.length,
    items: items,
    capturedAt: new Date().toISOString()
  };
  PropertiesService.getScriptProperties().setProperty(SNAPSHOT_KEY, JSON.stringify(snapshot));
  return snapshot;
}

function validateRecruitmentFormStructure() {
  var snapshot = snapshotFormStructure();
  var preserved = snapshot.items.filter(function (item) { return item.preserved; });
  return {
    ok: preserved.length > 0,
    snapshot: snapshot,
    preservedCount: preserved.length,
    missingPreserved: PRESERVED_TITLES.filter(function (title) {
      return !snapshot.items.some(function (item) { return item.title.indexOf(title) === 0; });
    })
  };
}

function buildPrefilledFormUrl(candidate, recruiter) {
  var url = OFFICIAL_VIEWFORM_URL;
  var params = ["usp=pp_url"];
  function add(entry, value) {
    if (!entry || !recruitText_(value)) return;
    params.push(encodeURIComponent(entry) + "=" + encodeURIComponent(value));
  }
  add(LIVE_PREFILL_ENTRIES.name, candidate.name);
  add(LIVE_PREFILL_ENTRIES.phone, candidate.phone || candidate.normalizedPhone);
  add(LIVE_PREFILL_ENTRIES.departmentGrade, (candidate.department || "") + (candidate.grade || ""));
  var partner = recruitText_(recruiter);
  if (partner) {
    if (OFFICIAL_RECRUITERS.indexOf(partner) >= 0) add(LIVE_PREFILL_ENTRIES.recruiter, partner);
    else {
      add(LIVE_PREFILL_ENTRIES.recruiter, "__other_option__");
      add(LIVE_PREFILL_ENTRIES.recruiter + ".other_option_response", partner);
    }
  }
  var now = new Date();
  var taipei = Utilities.formatDate(now, "Asia/Taipei", "M,d");
  var md = taipei.split(",");
  params.push(encodeURIComponent(LIVE_PREFILL_ENTRIES.recruitDate + "_month") + "=" + md[0]);
  params.push(encodeURIComponent(LIVE_PREFILL_ENTRIES.recruitDate + "_day") + "=" + md[1]);
  add(LIVE_PREFILL_ENTRIES.note, recruitMetadataNote_(candidate));
  return url + "?" + params.join("&");
}

function recruitMetadataNote_(candidate) {
  // Partner-visible 備註 only. submissionId stays on `_gameSubmissionId`.
  return "遊戲完成：" + recruitText_(candidate.completedAt)
    + "\n遊戲關主：" + recruitText_(candidate.gameGatekeeper);
}

function recruitParseMetadata_(value) {
  var raw = recruitText_(value);
  var completed = (raw.match(/遊戲完成[：:]\s*([^\n]+)/) || [])[1] || "";
  var gatekeeper = (raw.match(/遊戲關主[：:]\s*([^\n]+)/) || [])[1] || "";
  var submissionId = ((raw.match(/submissionId[：:]\s*([0-9a-f-]{8,})/i) || [])[1] || "").toLowerCase();
  return { completedAt: recruitText_(completed), gameGatekeeper: recruitText_(gatekeeper), submissionId: submissionId };
}

function recruitLoadLastGood_() {
  var raw = PropertiesService.getScriptProperties().getProperty(LAST_GOOD_KEY);
  if (!raw) return { gatekeepers: [], choices: {} };
  try { return JSON.parse(raw); } catch (err) { return { gatekeepers: [], choices: {} }; }
}

function recruitSaveLastGood_(payload) {
  PropertiesService.getScriptProperties().setProperty(LAST_GOOD_KEY, JSON.stringify(payload));
}

function recruitCandidateGroups_(people, recruitedKeys) {
  var groups = {};
  people.forEach(function (person) {
    if (recruitedKeys[person.personKey]) return;
    var key = person.gameGatekeeper || UNCLASSIFIED;
    if (!key) key = UNCLASSIFIED;
    if (!groups[key]) groups[key] = [];
    groups[key].push(person);
  });
  if (!groups[UNCLASSIFIED]) groups[UNCLASSIFIED] = groups[UNCLASSIFIED] || [];
  return groups;
}

function planRecruitmentFormSync() {
  var snapshot = snapshotFormStructure();
  var groups = recruitComputeGroups_();
  var lastGood = recruitLoadLastGood_();
  var gatekeepers = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, "zh-Hant"); });
  if (gatekeepers.indexOf(UNCLASSIFIED) < 0) gatekeepers.push(UNCLASSIFIED);
  return {
    dryRun: true,
    firstQuestion: RECRUIT_FORM_TITLES.gameGatekeeper,
    gatekeeperChoices: gatekeepers,
    sections: gatekeepers.map(function (name) {
      var live = (groups[name] || []).map(recruitEncodeChoice_);
      return {
        title: name + "｜待跟進",
        gatekeeper: name,
        question: RECRUIT_FORM_TITLES.student,
        choices: live.length ? live : [PLACEHOLDER_CHOICE],
        previous: lastGood.choices && lastGood.choices[name] ? lastGood.choices[name] : []
      };
    }),
    preservedCount: snapshot.items.filter(function (item) { return item.preserved; }).length,
    applySafe: snapshot.items.filter(function (item) { return item.preserved; }).length > 0
  };
}

function recruitComputeGroups_() {
  var cfg = recruitProps_();
  var spreadsheet = SpreadsheetApp.openById(cfg.spreadsheetId);
  var gameSheet = recruitSheetByTitleOrId_(spreadsheet, cfg.gameTab, cfg.expectedGameSheetId);
  var recSheet = recruitSheetByTitleOrId_(spreadsheet, cfg.recruitmentTab, cfg.expectedRecruitmentSheetId);
  var game = recruitReadRows_(gameSheet);
  var rec = recruitReadRows_(recSheet);
  var people = recruitPeople_(recruitGameAttempts_(game.rows));
  var recruited = recruitRecruited_(people, rec.rows);
  var recruitedKeys = {};
  recruited.forEach(function (person) { recruitedKeys[person.personKey] = true; });
  return recruitCandidateGroups_(people, recruitedKeys);
}

function rebuildGatekeeperSections() {
  return syncRecruitmentCandidates();
}

function syncRecruitmentCandidates() {
  var cfg = recruitProps_();
  var plan = planRecruitmentFormSync();
  if (cfg.dryRun) return plan;
  if (!plan.applySafe) return { ok: false, error: "preserved-questions-missing", plan: plan };
  var lastGood = recruitLoadLastGood_();
  try {
    var form = FormApp.openById(cfg.formId);
    recruitEnsureStructure_(form, plan);
    var good = { at: new Date().toISOString(), gatekeepers: plan.gatekeeperChoices, choices: {} };
    plan.sections.forEach(function (section) { good.choices[section.gatekeeper] = section.choices; });
    recruitSaveLastGood_(good);
    return { ok: true, dryRun: false, plan: plan };
  } catch (err) {
    var fallback = lastGood.choices && Object.keys(lastGood.choices).length ? lastGood : null;
    if (fallback) {
      try {
        recruitEnsureStructure_(FormApp.openById(cfg.formId), {
          gatekeeperChoices: fallback.gatekeepers,
          sections: fallback.gatekeepers.map(function (name) {
            return {
              title: name + "｜待跟進",
              gatekeeper: name,
              choices: fallback.choices[name] && fallback.choices[name].length ? fallback.choices[name] : [PLACEHOLDER_CHOICE]
            };
          })
        });
      } catch (ignored) { /* keep last visible choices */ }
    }
    return { ok: false, error: "sync-failed-kept-last-known-good" };
  }
}

function recruitFindItem_(form, title) {
  var items = form.getItems();
  for (var i = 0; i < items.length; i++) {
    if (items[i].getTitle() === title) return items[i];
  }
  return null;
}

function recruitStudentTitle_(sectionTitle) {
  return sectionTitle + "｜" + RECRUIT_FORM_TITLES.student;
}

function recruitEnsureStructure_(form, plan) {
  var items = form.getItems();
  var preservedStart = null;
  var i;
  for (i = 0; i < items.length; i++) {
    var title = items[i].getTitle();
    if (PRESERVED_TITLES.some(function (name) { return title.indexOf(name) === 0; })) {
      preservedStart = items[i];
      break;
    }
  }
  var recruitPage = recruitFindPage_(form, "招生資料");
  if (!recruitPage && preservedStart) {
    recruitPage = form.addPageBreakItem().setTitle("招生資料");
    try { form.moveItem(recruitPage.getIndex(), preservedStart.getIndex()); } catch (err) { /* keep order */ }
  }
  var gateItem = recruitFindItem_(form, RECRUIT_FORM_TITLES.gameGatekeeper);
  if (!gateItem) {
    gateItem = form.addMultipleChoiceItem().setTitle(RECRUIT_FORM_TITLES.gameGatekeeper).setRequired(true);
    try { form.moveItem(gateItem.getIndex(), 0); } catch (err) { /* keep order */ }
  }
  var pages = {};
  plan.sections.forEach(function (section) {
    var page = recruitFindPage_(form, section.title);
    if (!page) page = form.addPageBreakItem().setTitle(section.title);
    var studentTitle = recruitStudentTitle_(section.title);
    var student = recruitFindItem_(form, studentTitle) || recruitFindStudentByHelp_(form, section.title);
    if (!student) {
      student = form.addMultipleChoiceItem()
        .setTitle(studentTitle)
        .setHelpText(RECRUIT_FORM_TITLES.student)
        .setRequired(true);
    }
    var mc = student.asMultipleChoiceItem();
    var labels = section.choices && section.choices.length ? section.choices : [PLACEHOLDER_CHOICE];
    if (recruitPage) {
      try {
        mc.setChoices(labels.map(function (choice) {
          return mc.createChoice(choice, recruitPage);
        }));
      } catch (err) {
        mc.setChoiceValues(labels);
      }
    } else {
      mc.setChoiceValues(labels);
    }
    pages[section.gatekeeper] = page;
  });
  var gateMc = gateItem.asMultipleChoiceItem();
  var choices = plan.gatekeeperChoices.map(function (name) {
    return gateMc.createChoice(name, pages[name] || FormApp.PageNavigationType.CONTINUE);
  });
  if (choices.length) gateMc.setChoices(choices);
}

function recruitFindStudentByHelp_(form, sectionTitle) {
  var items = form.getItems();
  var i;
  for (i = 0; i < items.length; i++) {
    if (items[i].getTitle() !== RECRUIT_FORM_TITLES.student) continue;
    try {
      if (items[i].asMultipleChoiceItem().getHelpText() === sectionTitle) return items[i];
    } catch (err) { /* not a choice item */ }
  }
  return null;
}

function recruitFindPage_(form, title) {
  var items = form.getItems();
  for (var i = 0; i < items.length; i++) {
    if (String(items[i].getType()) === "PAGE_BREAK" && items[i].getTitle() === title) return items[i].asPageBreakItem();
  }
  return null;
}

function onRecruitmentFormSubmit(e) {
  var cfg = recruitProps_();
  var named = (e && e.namedValues) || {};
  var student = recruitNamedValue_(named, RECRUIT_FORM_TITLES.student);
  var decoded = recruitDecodeChoice_(student);
  var notes = recruitNamedValue_(named, "備註");
  var meta = recruitParseMetadata_(notes);
  var submissionId = decoded.submissionId || meta.submissionId;
  var gameGatekeeper = recruitNamedValue_(named, RECRUIT_FORM_TITLES.gameGatekeeper)
    || recruitNamedValue_(named, "遊戲關主")
    || meta.gameGatekeeper;
  var spreadsheet = SpreadsheetApp.openById(cfg.spreadsheetId);
  var sheet = recruitSheetByTitleOrId_(spreadsheet, cfg.recruitmentTab, cfg.expectedRecruitmentSheetId);
  var parsed = recruitReadRows_(sheet);
  recruitEnsureHelperHeaders_(sheet, parsed.headers);
  parsed = recruitReadRows_(sheet);
  var last = parsed.rows.length ? parsed.rows[parsed.rows.length - 1] : null;
  var existing = {};
  parsed.rows.forEach(function (row, index) {
    if (index === parsed.rows.length - 1) return;
    var sid = recruitField_(row, ["_gameSubmissionId"]).toLowerCase();
    if (sid) existing[sid] = true;
  });
  var duplicate = submissionId && existing[submissionId];
  var rowIndex = parsed.rows.length + 1;
  var headers = parsed.headers;
  function writeHelper(column, value) {
    var col = headers.indexOf(column);
    if (col >= 0) sheet.getRange(rowIndex, col + 1).setValue(value);
  }
  writeHelper("_gameSubmissionId", submissionId || "");
  writeHelper("_gameGatekeeper", gameGatekeeper);
  writeHelper("_gameCompletedAt", meta.completedAt || "");
  writeHelper("_syncVersion", SYNC_VERSION);
  writeHelper("_duplicate", duplicate ? "TRUE" : "FALSE");
  if (last && decoded.placeholder) writeHelper("_duplicate", "TRUE");
  syncRecruitmentCandidates();
  return { duplicate: Boolean(duplicate), submissionId: submissionId };
}

function recruitNamedValue_(named, fragment) {
  if (named[fragment]) return recruitText_((named[fragment] || [])[0]);
  var keys = Object.keys(named || {});
  var i;
  for (i = 0; i < keys.length; i++) {
    if (String(keys[i]).indexOf(fragment) >= 0) return recruitText_((named[keys[i]] || [])[0]);
  }
  return "";
}

function recruitEnsureHelperHeaders_(sheet, headers) {
  var missing = HELPER_HEADERS.filter(function (name) { return headers.indexOf(name) < 0; });
  if (!missing.length) return;
  sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
}

function installRecruitmentTriggers() {
  var cfg = recruitProps_();
  if (!cfg.formId) throw new Error("FORM_ID is not set");
  var existing = ScriptApp.getProjectTriggers();
  existing.forEach(function (trigger) {
    var fn = trigger.getHandlerFunction();
    if (fn === "onRecruitmentFormSubmit" || fn === "syncRecruitmentCandidates") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("onRecruitmentFormSubmit").forForm(cfg.formId).onFormSubmit().create();
  ScriptApp.newTrigger("syncRecruitmentCandidates").timeBased().everyMinutes(5).create();
  return { ok: true, dryRun: cfg.dryRun, formId: cfg.formId };
}
