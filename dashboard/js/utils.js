// Pure formatting/status helpers — no DOM access, no network calls.
import { state, TODAY } from './state.js';

var DAY = 86400000;
export function addDays(d, n){ var r = new Date(d.getTime()); r.setDate(r.getDate() + n); return r; }
export function diffDays(a, b){ return Math.round((startOfDay(a) - startOfDay(b)) / DAY); }
export function startOfDay(d){ var r = new Date(d.getTime()); r.setHours(0,0,0,0); return r; }
export function fmtDate(d){ return d.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'}); }
export function fmtDateTime(d){ return d.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'}) + ', ' + d.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'}); }
export function fmtMoney(n){ return '₹' + Number(n).toLocaleString('en-IN'); }
export function fmtBytes(n){
  if (n < 1024) return n + ' B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
  return (n/1024/1024).toFixed(1) + ' MB';
}

var ESC_MAP = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
export function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return ESC_MAP[c]; }); }

export function timeAgo(d){
  var mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  var hrs = Math.round(mins/60);
  if (hrs < 24) return hrs + ' hr' + (hrs>1?'s':'') + ' ago';
  var days = Math.round(hrs/24);
  if (days < 30) return days + ' day' + (days>1?'s':'') + ' ago';
  return fmtDate(d);
}

export function computeStatus(c){
  if (c.status === 'paused') return 'paused';
  var d = diffDays(c.nextDue, TODAY);
  if (d < 0) return 'overdue';
  if (d <= state.settings.lead) return 'due';
  return 'active';
}
export function statusMeta(s){
  return {
    active:  {cls:'pill-active',  label:'Active'},
    due:     {cls:'pill-due',     label:'Due soon'},
    overdue: {cls:'pill-overdue', label:'Overdue'},
    paused:  {cls:'pill-paused',  label:'Paused'}
  }[s];
}
export function pillHTML(s){
  var m = statusMeta(s);
  return '<span class="pill ' + m.cls + '">' + m.label + '</span>';
}
export function actionColor(action){
  if (action === 'paused') return 'var(--crit)';
  if (action === 'reminder') return 'var(--warn)';
  return 'var(--good)';
}
export function statusPillHTML(status){
  var labels = { active:'Active', removed:'Removed' };
  return '<span class="pill pill-' + status + '">' + (labels[status] || status) + '</span>';
}
export function maskKey(k){ return k.slice(0,8) + '••••••••' + k.slice(-4); }
