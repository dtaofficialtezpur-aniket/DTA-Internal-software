import { state } from './state.js';
import { apiCall, isLoggedIn } from './api.js';
import { showToast } from './toast.js';
import { esc, statusPillHTML } from './utils.js';

export function renderTeam(){
  if (!isLoggedIn() || state.auth.user.role !== 'admin') return;
  apiCall('listTeam').then(function(data){
    var users = data.users;
    renderResetTable(users.filter(function(u){ return u.status === 'active' && u.pinResetRequested; }));
    renderTeamTable(users);
  }).catch(function(err){ showToast('Could not load team: ' + err.message); });
}

function renderResetTable(list){
  var tbody = document.querySelector('#reset-requests-table tbody');
  if (!list.length){ tbody.innerHTML = '<tr><td colspan="3" class="empty">No pending PIN reset requests.</td></tr>'; return; }
  tbody.innerHTML = list.map(function(u){
    return '<tr>' +
      '<td class="cell-name">' + esc(u.fullName) + '</td>' +
      '<td>' + esc(u.username) + '</td>' +
      '<td class="row-actions"><button class="btn btn-secondary btn-sm" data-approve-reset="' + u.id + '">Approve reset</button></td>' +
      '</tr>';
  }).join('');
}

function renderTeamTable(list){
  var tbody = document.querySelector('#team-table tbody');
  if (!list.length){ tbody.innerHTML = '<tr><td colspan="5" class="empty">No team members yet.</td></tr>'; return; }
  tbody.innerHTML = list.map(function(u){
    var removeBtn = (u.role === 'admin' || u.status !== 'active')
      ? ''
      : '<button class="btn btn-danger btn-sm" data-remove-user="' + u.id + '">Remove</button>';
    return '<tr>' +
      '<td class="cell-name">' + esc(u.fullName) + '</td>' +
      '<td>' + esc(u.username) + '</td>' +
      '<td>' + (u.role === 'admin' ? 'Admin' : 'Employee') + '</td>' +
      '<td>' + statusPillHTML(u.status) + '</td>' +
      '<td class="row-actions">' + removeBtn + '</td>' +
      '</tr>';
  }).join('');
}
