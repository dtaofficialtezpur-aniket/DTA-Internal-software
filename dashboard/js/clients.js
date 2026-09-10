import { state, TODAY } from './state.js';
import { apiCall } from './api.js';
import { showToast } from './toast.js';
import { esc, fmtDate, fmtDateTime, fmtMoney, diffDays, timeAgo, computeStatus, pillHTML, actionColor, maskKey } from './utils.js';

export function refreshFromBackend(){
  return apiCall('list').then(function(data){
    state.settings.name = data.settings.agencyName || 'DTA';
    state.settings.lead = Number(data.settings.leadDays) || 7;
    state.settings.grace = Number(data.settings.defaultGrace) || 5;
    state.clients = data.clients.map(function(c){
      return Object.assign({}, c, {
        start: new Date(c.start), nextDue: new Date(c.nextDue),
        pausedAt: c.pausedAt ? new Date(c.pausedAt) : null,
        history: (c.history||[]).map(function(h){ return Object.assign({}, h, {t: new Date(h.timestamp)}); })
          .sort(function(a,b){ return b.t - a.t; })
      });
    });
    renderAll();
  }).catch(function(err){
    showToast('Could not load data: ' + err.message);
  });
}

export function renderAll(){
  renderStats();
  renderAttention();
  renderClients();
  renderActivity();
  renderSettingsForm();
  if (state.selectedId) renderDetail(state.selectedId);
}

function renderStats(){
  var counts = {active:0, due:0, overdue:0, paused:0};
  var mrr = 0;
  state.clients.forEach(function(c){
    counts[computeStatus(c)]++;
    mrr += c.cycle === 'Annual' ? c.amount/12 : c.amount;
  });
  var tiles = [
    {label:'Total clients', value: state.clients.length, note: 'across all DTA builds'},
    {label:'Active', value: counts.active, note: 'in good standing', tone:''},
    {label:'Payment due / overdue', value: counts.due + counts.overdue, note: counts.overdue + ' overdue', tone:'tone-crit'},
    {label:'Paused', value: counts.paused, note: 'access currently locked', tone:'tone-warn'}
  ];
  document.getElementById('stat-grid').innerHTML = tiles.map(function(t){
    return '<div class="card stat-tile ' + (t.tone||'') + '"><div class="stat-label">' + t.label + '</div>' +
      '<div class="stat-value tabular">' + t.value + '</div><div class="stat-note">' + t.note + '</div></div>';
  }).join('') + '<div class="card stat-tile"><div class="stat-label">Est. monthly recurring</div>' +
    '<div class="stat-value tabular">' + fmtMoney(Math.round(mrr)) + '</div><div class="stat-note">from active + due plans</div></div>';
}

function renderAttention(){
  var rows = state.clients.filter(function(c){ var s = computeStatus(c); return s==='due' || s==='overdue'; })
    .sort(function(a,b){ return diffDays(a.nextDue, TODAY) - diffDays(b.nextDue, TODAY); });
  var tbody = document.querySelector('#attention-table tbody');
  if (!rows.length){
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Nothing needs attention — every client is current.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(function(c){
    var s = computeStatus(c);
    var d = diffDays(c.nextDue, TODAY);
    return '<tr data-id="' + esc(c.id) + '">' +
      '<td class="cell-name">' + esc(c.client) + '</td>' +
      '<td>' + esc(c.software) + '</td>' +
      '<td>' + pillHTML(s) + '</td>' +
      '<td class="tabular">' + fmtDate(c.nextDue) + '<div class="cell-sub">' + (d<0 ? Math.abs(d)+' days overdue' : d+' days left') + '</div></td>' +
      '<td class="row-actions"><button class="btn btn-secondary btn-sm" data-view-client="' + esc(c.id) + '">View</button></td>' +
      '</tr>';
  }).join('');
}

export function renderClients(){
  var q = (document.getElementById('client-search').value || '').toLowerCase();
  var filter = document.getElementById('status-filter').value;
  var rows = state.clients.filter(function(c){
    var s = computeStatus(c);
    var matchQ = !q || c.client.toLowerCase().indexOf(q)>-1 || c.software.toLowerCase().indexOf(q)>-1;
    var matchF = filter === 'all' || filter === s;
    return matchQ && matchF;
  });
  var tbody = document.querySelector('#clients-table tbody');
  if (!rows.length){
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No clients match this search.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(function(c){
    var s = computeStatus(c);
    return '<tr data-id="' + esc(c.id) + '">' +
      '<td><div class="cell-name">' + esc(c.client) + '</div><div class="cell-sub">' + esc(c.software) + '</div></td>' +
      '<td class="tabular">' + fmtMoney(c.amount) + ' <span style="color:var(--ink-faint);">/ ' + (c.cycle==='Monthly'?'mo':'yr') + '</span></td>' +
      '<td class="tabular">' + fmtDate(c.nextDue) + '</td>' +
      '<td>' + pillHTML(s) + '</td>' +
      '<td class="row-actions"><button class="btn btn-secondary btn-sm" data-view-client="' + esc(c.id) + '">View</button></td>' +
      '</tr>';
  }).join('');
}

function renderActivity(){
  var events = [];
  state.clients.forEach(function(c){
    c.history.forEach(function(h){ events.push(Object.assign({}, h, {client:c.client, software:c.software})); });
  });
  events.sort(function(a,b){ return b.t - a.t; });
  var list = document.getElementById('activity-list');
  if (!events.length){ list.innerHTML = '<div class="empty">No activity yet.</div>'; return; }
  list.innerHTML = events.map(function(e){
    return '<div class="log-row"><div class="log-dot" style="background:' + actionColor(e.action) + '"></div>' +
      '<div><div class="log-text"><b>' + esc(e.client) + '</b> — ' + esc(e.note) + '</div>' +
      '<div class="log-time">' + esc(e.software) + ' · ' + timeAgo(e.t) + '</div></div></div>';
  }).join('');
}

function renderSettingsForm(){
  document.getElementById('set-name').value = state.settings.name;
  document.getElementById('set-lead').value = state.settings.lead;
  document.getElementById('set-grace').value = state.settings.grace;
}

export function findClient(id){ return state.clients.filter(function(c){ return c.id === id; })[0]; }

export function renderDetail(id){
  var c = findClient(id);
  if (!c) return;
  var s = computeStatus(c);
  document.getElementById('d-id').textContent = c.id;
  document.getElementById('d-name').textContent = c.client;
  document.getElementById('d-software').textContent = c.software;
  document.getElementById('d-status-pill').innerHTML = pillHTML(s);
  document.getElementById('d-plan').textContent = fmtMoney(c.amount) + ' / ' + (c.cycle==='Monthly'?'month':'year');
  document.getElementById('d-start').textContent = fmtDate(c.start);
  document.getElementById('d-due').textContent = fmtDate(c.nextDue);
  document.getElementById('d-grace').textContent = c.grace + ' days';
  document.getElementById('d-clientid').textContent = c.id;

  var reveal = document.getElementById('d-reveal');
  var revealed = reveal.dataset.revealed === '1';
  document.getElementById('d-apikey').textContent = revealed ? c.apiKey : maskKey(c.apiKey);

  var pauseBtn = document.getElementById('d-pause');
  var resumeBtn = document.getElementById('d-resume');
  if (s === 'paused'){
    pauseBtn.setAttribute('hidden',''); resumeBtn.removeAttribute('hidden');
  } else {
    resumeBtn.setAttribute('hidden',''); pauseBtn.removeAttribute('hidden');
    pauseBtn.textContent = 'Pause access'; pauseBtn.dataset.confirm = '';
  }

  var hist = c.history.slice().sort(function(a,b){ return b.t - a.t; });
  document.getElementById('d-history').innerHTML = hist.map(function(h){
    return '<div class="log-row"><div class="log-dot" style="background:' + actionColor(h.action) + '"></div>' +
      '<div><div class="log-text">' + esc(h.note) + '</div><div class="log-time">' + fmtDateTime(h.t) + '</div></div></div>';
  }).join('');
}

export function openDetail(id){
  state.selectedId = id;
  renderDetail(id);
  document.getElementById('backdrop').classList.add('open');
  document.getElementById('detail-panel').classList.add('open');
}
export function closeDetail(){
  document.getElementById('backdrop').classList.remove('open');
  document.getElementById('detail-panel').classList.remove('open');
  state.selectedId = null;
  var reveal = document.getElementById('d-reveal');
  reveal.textContent = 'Reveal'; reveal.dataset.revealed = '';
}

export function markPaid(c){
  apiCall('markPaid', { id: c.id }).then(function(){
    showToast('Payment recorded for ' + c.client);
    return refreshFromBackend();
  }).catch(function(err){ showToast('Failed: ' + err.message); });
}
export function pauseClient(c){
  apiCall('pause', { id: c.id }).then(function(){
    showToast(c.client + ' paused');
    return refreshFromBackend();
  }).catch(function(err){ showToast('Failed: ' + err.message); });
}
export function resumeClient(c){
  apiCall('resume', { id: c.id }).then(function(){
    showToast(c.client + ' resumed');
    return refreshFromBackend();
  }).catch(function(err){ showToast('Failed: ' + err.message); });
}
export function regenerateKey(c){
  apiCall('regenerateKey', { id: c.id }).then(function(){
    showToast('API key regenerated for ' + c.client);
    return refreshFromBackend();
  }).catch(function(err){ showToast('Failed: ' + err.message); });
}

export function openAdd(){
  document.getElementById('a-start').value = new Date().toISOString().slice(0,10);
  document.getElementById('a-grace').value = state.settings.grace;
  document.getElementById('add-modal-wrap').classList.add('open');
  document.getElementById('backdrop').classList.add('open');
  document.getElementById('a-client').focus();
}
export function closeAdd(){
  document.getElementById('add-modal-wrap').classList.remove('open');
  if (!state.selectedId) document.getElementById('backdrop').classList.remove('open');
  document.getElementById('add-form').reset();
}
