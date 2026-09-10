import { state, BACKEND_URL } from './state.js';
import { apiCall } from './api.js';
import { showToast } from './toast.js';
import { esc, fmtDate, fmtBytes } from './utils.js';

export function folderPathById(id){
  var parts = [];
  var guard = 0;
  while (id !== null && id !== undefined && guard++ < 50){
    var f = state.folders.filter(function(x){ return x.id === id; })[0];
    if (!f) break;
    parts.unshift(f.name);
    id = f.parentId;
  }
  return parts.length ? parts.join(' / ') : '(root)';
}

function buildFolderOptions(){
  var byParent = {};
  state.folders.forEach(function(f){
    var key = f.parentId === null ? 'root' : f.parentId;
    (byParent[key] = byParent[key] || []).push(f);
  });
  var out = [];
  function walk(parentKey, depth){
    (byParent[parentKey] || []).forEach(function(f){
      out.push({ id: f.id, label: '— '.repeat(depth) + f.name });
      walk(f.id, depth + 1);
    });
  }
  walk('root', 0);
  return out;
}

function renderFolderSelects(){
  var html = '<option value="">(root)</option>' + buildFolderOptions().map(function(o){
    return '<option value="' + o.id + '">' + esc(o.label) + '</option>';
  }).join('');
  document.getElementById('cf-parent').innerHTML = html;
  document.getElementById('uf-folder').innerHTML = html;
}

function renderFoldersTable(){
  var tbody = document.querySelector('#folders-table tbody');
  if (!state.folders.length){ tbody.innerHTML = '<tr><td colspan="3" class="empty">No folders yet.</td></tr>'; return; }
  tbody.innerHTML = state.folders.slice().sort(function(a,b){ return folderPathById(a.id).localeCompare(folderPathById(b.id)); }).map(function(f){
    return '<tr>' +
      '<td class="cell-name">' + esc(f.name) + '</td>' +
      '<td>' + esc(folderPathById(f.id)) + '</td>' +
      '<td class="row-actions"><button class="btn btn-danger btn-sm" data-delete-folder="' + f.id + '">Delete</button></td>' +
      '</tr>';
  }).join('');
}

function renderFilesTable(){
  var isAdmin = state.auth.user && state.auth.user.role === 'admin';
  var tbody = document.querySelector('#files-table tbody');
  if (!state.files.length){ tbody.innerHTML = '<tr><td colspan="5" class="empty">No files yet.</td></tr>'; return; }
  tbody.innerHTML = state.files.map(function(f){
    var path = isAdmin ? folderPathById(f.folderId) : (f.folderPath || '(root)');
    var actions = '<button class="btn btn-secondary btn-sm" data-download-file="' + f.id + '">Download</button>';
    if (isAdmin){
      actions += ' <button class="btn btn-secondary btn-sm" data-manage-access="' + f.id + '">Manage access</button>' +
        ' <button class="btn btn-danger btn-sm" data-delete-file="' + f.id + '">Delete</button>';
    }
    return '<tr>' +
      '<td class="cell-name">' + esc(f.filename) + '</td>' +
      '<td>' + esc(path) + '</td>' +
      '<td class="tabular">' + fmtBytes(f.sizeBytes) + '</td>' +
      '<td>' + fmtDate(new Date(f.uploadedAt)) + '</td>' +
      '<td class="row-actions">' + actions + '</td>' +
      '</tr>';
  }).join('');
}

export function loadFolders(){
  return apiCall('listFolders').then(function(data){
    state.folders = data.folders;
    renderFoldersTable();
    renderFolderSelects();
  }).catch(function(err){ showToast('Could not load folders: ' + err.message); });
}

export function loadFiles(){
  return apiCall('listFiles').then(function(data){
    state.files = data.files;
    renderFilesTable();
  }).catch(function(err){ showToast('Could not load files: ' + err.message); });
}

export function renderFilesPage(){
  var isAdmin = state.auth.user && state.auth.user.role === 'admin';
  document.getElementById('files-admin-tools').hidden = !isAdmin;
  document.getElementById('files-page-sub').textContent = isAdmin
    ? 'Upload files into folders and choose which employees can access each one.'
    : 'Files your admin has shared with you.';
  if (isAdmin) loadFolders();
  loadFiles();
}

export function downloadFile(f){
  fetch(BACKEND_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'downloadFile', token: state.auth.token, fileId: f.id })
  }).then(function(res){
    var ct = res.headers.get('Content-Type') || '';
    if (ct.indexOf('application/json') > -1){
      return res.json().then(function(data){ throw new Error(data.error || 'Download failed.'); });
    }
    return res.blob().then(function(blob){
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = f.filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    });
  }).catch(function(err){ showToast('Download failed: ' + err.message); });
}

export function openAccessModal(file){
  state.accessModalFileId = file.id;
  document.getElementById('access-modal-title').textContent = 'Manage access — ' + file.filename;
  apiCall('listTeam').then(function(data){
    var employees = data.users.filter(function(u){ return u.role === 'employee' && u.status === 'active'; });
    var list = document.getElementById('access-modal-list');
    if (!employees.length){
      list.innerHTML = '<div class="empty">No employees yet.</div>';
    } else {
      list.innerHTML = employees.map(function(u){
        var checked = file.accessUserIds && file.accessUserIds.indexOf(u.id) > -1 ? 'checked' : '';
        return '<label style="display:flex;align-items:center;gap:8px;font-size:.85rem;">' +
          '<input type="checkbox" value="' + u.id + '" ' + checked + '> ' + esc(u.fullName) + ' (' + esc(u.username) + ')</label>';
      }).join('');
    }
    document.getElementById('access-modal-wrap').classList.add('open');
    document.getElementById('backdrop').classList.add('open');
  }).catch(function(err){ showToast('Could not load team: ' + err.message); });
}
export function closeAccessModal(){
  document.getElementById('access-modal-wrap').classList.remove('open');
  if (!state.selectedId) document.getElementById('backdrop').classList.remove('open');
  state.accessModalFileId = null;
}
