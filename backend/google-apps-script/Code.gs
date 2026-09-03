/**
 * DTA Subscription Control — backend
 *
 * Runs as a Google Apps Script Web App attached to a Google Sheet.
 * The Sheet is the database. Deploy this as a Web App to get a public
 * URL that both the DTA dashboard and client software call.
 *
 * Sheets used (auto-created on first run by ensureSheets_()):
 *   Clients  - one row per client
 *   History  - one row per activity-log event
 *   Settings - key/value pairs (adminKey, agencyName, leadDays, defaultGrace)
 *
 * See SETUP.md for deployment steps.
 */

var CLIENTS_HEADERS = ['id','apiKey','client','software','cycle','amount','start','nextDue','grace','status','pausedAt'];
var HISTORY_HEADERS = ['clientId','timestamp','action','note'];

/* ---------------- entry points ---------------- */

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (action === 'status') return jsonOut(handleStatus_(e.parameter));
    return jsonOut({ error: 'Unknown or missing action for GET. Use POST for admin actions.' });
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    var action = body.action;

    ensureSheets_();

    if (action === 'status') return jsonOut(handleStatus_(body));

    // Everything below is an admin action and requires the admin key.
    if (!checkAdminKey_(body.adminKey)) {
      return jsonOut({ error: 'Invalid or missing admin key.' });
    }

    switch (action) {
      case 'list':            return jsonOut(handleList_());
      case 'add':              return jsonOut(handleAdd_(body));
      case 'pause':            return jsonOut(handlePause_(body));
      case 'resume':           return jsonOut(handleResume_(body));
      case 'markPaid':         return jsonOut(handleMarkPaid_(body));
      case 'regenerateKey':    return jsonOut(handleRegenerateKey_(body));
      case 'updateSettings':   return jsonOut(handleUpdateSettings_(body));
      case 'getSettings':      return jsonOut(getSettings_());
      default:                 return jsonOut({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

/* ---------------- client-facing: status check ---------------- */

function handleStatus_(params) {
  ensureSheets_();
  var clientId = params.client_id;
  var apiKey = params.api_key;
  if (!clientId || !apiKey) {
    return { status: 'unknown', message: 'Missing client_id or api_key.' };
  }

  var row = findClientRow_(clientId);
  if (!row || row.data.apiKey !== apiKey) {
    return { status: 'unknown', message: 'Client not found or API key mismatch.' };
  }

  var c = row.data;
  var settings = getSettings_();

  if (c.status === 'paused') {
    return {
      status: 'paused',
      client_id: c.id,
      paused_at: c.pausedAt || null,
      message: 'Subscription payment overdue. Contact DTA to resume access.'
    };
  }

  return {
    status: 'active',
    client_id: c.id,
    next_due_date: fmtDateOnly_(c.nextDue),
    grace_period_days: Number(c.grace) || settings.defaultGrace,
    message: null
  };
}

/* ---------------- admin actions ---------------- */

function handleList_() {
  var clients = getAllClients_();
  var history = getAllHistory_();
  clients.forEach(function (c) {
    c.history = history.filter(function (h) { return h.clientId === c.id; });
  });
  return { settings: getSettings_(), clients: clients };
}

function handleAdd_(body) {
  var sheet = getSheet_('Clients');
  var id = genClientId_();
  var apiKey = genApiKey_();
  var settings = getSettings_();
  var cycle = body.cycle === 'Annual' ? 'Annual' : 'Monthly';
  var start = body.start ? new Date(body.start) : new Date();
  var grace = body.grace != null ? Number(body.grace) : settings.defaultGrace;
  var nextDue = addDays_(start, cycle === 'Annual' ? 365 : 30);

  var row = {
    id: id, apiKey: apiKey,
    client: body.client || '', software: body.software || '',
    cycle: cycle, amount: Number(body.amount) || 0,
    start: start, nextDue: nextDue, grace: grace,
    status: 'active', pausedAt: ''
  };
  appendRow_(sheet, CLIENTS_HEADERS, row);
  logEvent_(id, 'onboarded', 'Client onboarded, license issued');
  return { ok: true, client: row };
}

function handlePause_(body) {
  var row = requireClientRow_(body.id);
  setCell_(row, 'status', 'paused');
  setCell_(row, 'pausedAt', new Date());
  logEvent_(body.id, 'paused', 'Paused by DTA Admin — access locked');
  return { ok: true };
}

function handleResume_(body) {
  var row = requireClientRow_(body.id);
  setCell_(row, 'status', 'active');
  setCell_(row, 'pausedAt', '');
  logEvent_(body.id, 'resumed', 'Resumed by DTA Admin — access restored');
  return { ok: true };
}

function handleMarkPaid_(body) {
  var row = requireClientRow_(body.id);
  var c = row.data;
  var cycleDays = c.cycle === 'Annual' ? 365 : 30;
  var base = new Date() > new Date(c.nextDue) ? new Date() : new Date(c.nextDue);
  var nextDue = addDays_(base, cycleDays);
  setCell_(row, 'nextDue', nextDue);
  logEvent_(body.id, 'paid', 'Marked as paid by DTA Admin — renewed to ' + fmtDateOnly_(nextDue));
  return { ok: true, nextDue: fmtDateOnly_(nextDue) };
}

function handleRegenerateKey_(body) {
  var row = requireClientRow_(body.id);
  var newKey = genApiKey_();
  setCell_(row, 'apiKey', newKey);
  logEvent_(body.id, 'keyRegenerated', 'API key regenerated by DTA Admin');
  return { ok: true, apiKey: newKey };
}

function handleUpdateSettings_(body) {
  var sheet = getSheet_('Settings');
  if (body.name != null) setSetting_(sheet, 'agencyName', body.name);
  if (body.lead != null) setSetting_(sheet, 'leadDays', body.lead);
  if (body.grace != null) setSetting_(sheet, 'defaultGrace', body.grace);
  return { ok: true, settings: getSettings_() };
}

/* ---------------- sheet helpers ---------------- */

function ensureSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  createIfMissing_(ss, 'Clients', CLIENTS_HEADERS);
  createIfMissing_(ss, 'History', HISTORY_HEADERS);
  var settingsSheet = createIfMissing_(ss, 'Settings', ['key', 'value']);
  if (settingsSheet.getLastRow() < 2) {
    settingsSheet.getRange(2, 1, 4, 2).setValues([
      ['adminKey', Utilities.getUuid()],
      ['agencyName', 'DTA'],
      ['leadDays', 7],
      ['defaultGrace', 5]
    ]);
  }
}

function createIfMissing_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getSheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getSettings_() {
  var sheet = getSheet_('Settings');
  var values = sheet.getDataRange().getValues();
  var out = {};
  for (var i = 1; i < values.length; i++) out[values[i][0]] = values[i][1];
  out.leadDays = Number(out.leadDays) || 7;
  out.defaultGrace = Number(out.defaultGrace) || 5;
  return out;
}

function setSetting_(sheet, key, value) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === key) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
  sheet.appendRow([key, value]);
}

function checkAdminKey_(key) {
  var settings = getSettings_();
  return key && settings.adminKey && key === settings.adminKey;
}

function appendRow_(sheet, headers, obj) {
  var row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sheet.appendRow(row);
}

function rowToObj_(headers, arr) {
  var obj = {};
  headers.forEach(function (h, i) { obj[h] = arr[i]; });
  return obj;
}

function findClientRow_(id) {
  var sheet = getSheet_('Clients');
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      return { sheet: sheet, rowIndex: i + 1, data: rowToObj_(CLIENTS_HEADERS, values[i]) };
    }
  }
  return null;
}

function requireClientRow_(id) {
  var row = findClientRow_(id);
  if (!row) throw new Error('Client not found: ' + id);
  return row;
}

function setCell_(row, field, value) {
  var col = CLIENTS_HEADERS.indexOf(field) + 1;
  row.sheet.getRange(row.rowIndex, col).setValue(value);
  row.data[field] = value;
}

function getAllClients_() {
  var sheet = getSheet_('Clients');
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) out.push(rowToObj_(CLIENTS_HEADERS, values[i]));
  return out;
}

function getAllHistory_() {
  var sheet = getSheet_('History');
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) out.push(rowToObj_(HISTORY_HEADERS, values[i]));
  return out;
}

function logEvent_(clientId, action, note) {
  var sheet = getSheet_('History');
  sheet.appendRow([clientId, new Date(), action, note]);
}

/* ---------------- id / key generation ---------------- */

function genClientId_() {
  var id;
  do { id = 'DTA-CL-' + (1000 + Math.floor(Math.random() * 8999)); } while (findClientRow_(id));
  return id;
}

function genApiKey_() {
  var chars = 'abcdef0123456789';
  var out = 'sk_live_';
  for (var i = 0; i < 20; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

/* ---------------- misc ---------------- */

function addDays_(date, n) {
  var d = new Date(date.getTime ? date.getTime() : new Date(date).getTime());
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDateOnly_(d) {
  d = new Date(d);
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM-dd');
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run this once manually from the Apps Script editor (select "setup" in the
 * function dropdown, click Run) to create the sheets and get your admin key
 * before you deploy the Web App. The key is shown in a popup and also saved
 * in the Settings sheet (row "adminKey") so you can find it again anytime.
 */
function setup() {
  ensureSheets_();
  var adminKey = getSettings_().adminKey;
  SpreadsheetApp.getUi().alert(
    'Setup complete',
    'Your admin key is:\n\n' + adminKey +
      '\n\nCopy it now — you\'ll paste it into the dashboard\'s Settings. ' +
      'You can also find it later in the Settings sheet tab, row "adminKey".',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
