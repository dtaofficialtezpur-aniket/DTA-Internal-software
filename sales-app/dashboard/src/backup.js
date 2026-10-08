// Builds backup downloads in the browser/desktop app from the admin's exportAll data.
const stamp = () => new Date().toLocaleDateString('en-CA');

function cell(v){
  if (v === null || v === undefined) return '';
  let t = String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // stop spreadsheet formula injection from typed notes
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function toCsv(columns, rows){
  const head = columns.map(([, label]) => cell(label)).join(',');
  return [head, ...rows.map((r) => columns.map(([key]) => cell(r[key])).join(','))].join('\r\n');
}
function save(filename, text, type){
  // BOM so Excel reads Hindi/Assamese etc. names correctly
  const blob = new Blob([type === 'csv' ? '\ufeff' + text : text], { type: type === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const LEAD_COLS = [['id', 'ID'], ['employee', 'Employee'], ['name', 'Lead / business'], ['contactPerson', 'Contact person'], ['phone', 'Phone'], ['email', 'Email'],
  ['state', 'State'], ['city', 'City'], ['productType', 'Product type'], ['productName', 'Product'], ['stage', 'Stage'], ['estValue', 'Expected value'],
  ['dealValue', 'Deal value'], ['nextFollowup', 'Next follow-up'], ['notes', 'Notes'], ['createdAt', 'Created'], ['wonAt', 'Won at']];
const ACT_COLS = [['id', 'ID'], ['createdAt', 'When'], ['employee', 'Employee'], ['state', 'State'], ['type', 'Type'], ['leadName', 'Lead'], ['note', 'Note']];
const EMP_COLS = [['fullName', 'Name'], ['username', 'Username'], ['state', 'State'], ['status', 'Status'], ['createdAt', 'Added'], ['lastLoginAt', 'Last login'], ['lastActiveAt', 'Last active']];

const DEMO_COLS = [['id', 'ID'], ['createdAt', 'Requested'], ['employee', 'Employee'], ['clientName', 'Client'], ['contactPerson', 'Contact person'], ['phone', 'Phone'],
  ['state', 'State'], ['city', 'City'], ['productType', 'Product type'], ['productName', 'Product'], ['mode', 'Mode'], ['preferredDate', 'Preferred date'],
  ['preferredTime', 'Preferred time'], ['status', 'Status'], ['scheduledAt', 'Scheduled'], ['notes', 'Notes'], ['adminNote', 'Admin note']];

export function downloadBackup(kind, data){
  const d = stamp();
  if (kind === 'leads') save(`dta-sales-leads-${d}.csv`, toCsv(LEAD_COLS, data.leads), 'csv');
  else if (kind === 'activities') save(`dta-sales-activity-${d}.csv`, toCsv(ACT_COLS, data.activities), 'csv');
  else if (kind === 'demos') save(`dta-sales-demo-requests-${d}.csv`, toCsv(DEMO_COLS, data.demoRequests), 'csv');
  else if (kind === 'employees') save(`dta-sales-employees-${d}.csv`, toCsv(EMP_COLS, data.employees), 'csv');
  else save(`dta-sales-full-backup-${d}.json`, JSON.stringify(data, null, 2), 'json');
}

// Generic CSV download used by report pages.
export function downloadRows(filename, columns, rows){ save(filename, toCsv(columns, rows), 'csv'); }
