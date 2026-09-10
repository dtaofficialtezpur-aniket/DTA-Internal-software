import { state, BACKEND_URL } from './state.js';
import { apiCall } from './api.js';
import { showToast } from './toast.js';
import { showView } from './nav.js';
import {
  showScreen, showAuthPanel, showAuthError, hideAuthError,
  enterApp, doLogout, setUpUpdateButton
} from './auth.js';
import {
  findClient, openDetail, closeDetail, renderDetail, openAdd, closeAdd,
  markPaid, pauseClient, resumeClient, regenerateKey,
  renderClients, refreshFromBackend
} from './clients.js';
import { renderTeam } from './team.js';
import {
  loadFolders, loadFiles, downloadFile,
  openAccessModal, closeAccessModal
} from './files.js';

document.addEventListener('DOMContentLoaded', function(){
  showScreen('auth');
  showAuthPanel('login');
  setUpUpdateButton();

  document.querySelectorAll('.nav-btn').forEach(function(b){
    b.addEventListener('click', function(){ showView(b.dataset.view); });
  });

  document.body.addEventListener('click', function(e){
    var viewBtn = e.target.closest('[data-view-client]');
    if (viewBtn){ openDetail(viewBtn.dataset.viewClient); return; }
    var row = e.target.closest('#clients-table tbody tr[data-id], #attention-table tbody tr[data-id]');
    if (row && !e.target.closest('button')){ openDetail(row.dataset.id); return; }
    if (e.target.closest('[data-open-add]')){ openAdd(); return; }

    var approveReset = e.target.closest('[data-approve-reset]');
    if (approveReset){
      apiCall('approvePinReset', { userId: Number(approveReset.dataset.approveReset) })
        .then(function(){ showToast('PIN reset approved'); renderTeam(); })
        .catch(function(err){ showToast('Failed: ' + err.message); });
      return;
    }
    var removeUser = e.target.closest('[data-remove-user]');
    if (removeUser){
      if (removeUser.dataset.confirm === '1'){
        apiCall('removeEmployee', { userId: Number(removeUser.dataset.removeUser) })
          .then(function(){ showToast('Access removed'); renderTeam(); })
          .catch(function(err){ showToast('Failed: ' + err.message); });
      } else {
        removeUser.dataset.confirm = '1';
        removeUser.textContent = 'Click again to confirm';
      }
      return;
    }

    var deleteFolder = e.target.closest('[data-delete-folder]');
    if (deleteFolder){
      if (deleteFolder.dataset.confirm === '1'){
        apiCall('deleteFolder', { folderId: Number(deleteFolder.dataset.deleteFolder) })
          .then(function(){ showToast('Folder deleted'); loadFolders(); })
          .catch(function(err){ showToast('Failed: ' + err.message); });
      } else {
        deleteFolder.dataset.confirm = '1';
        deleteFolder.textContent = 'Click again to confirm';
      }
      return;
    }
    var deleteFileBtn = e.target.closest('[data-delete-file]');
    if (deleteFileBtn){
      if (deleteFileBtn.dataset.confirm === '1'){
        apiCall('deleteFile', { fileId: Number(deleteFileBtn.dataset.deleteFile) })
          .then(function(){ showToast('File deleted'); loadFiles(); })
          .catch(function(err){ showToast('Failed: ' + err.message); });
      } else {
        deleteFileBtn.dataset.confirm = '1';
        deleteFileBtn.textContent = 'Click again to confirm';
      }
      return;
    }
    var downloadBtn = e.target.closest('[data-download-file]');
    if (downloadBtn){
      var dlFile = state.files.filter(function(x){ return x.id === Number(downloadBtn.dataset.downloadFile); })[0];
      if (dlFile) downloadFile(dlFile);
      return;
    }
    var manageAccessBtn = e.target.closest('[data-manage-access]');
    if (manageAccessBtn){
      var maFile = state.files.filter(function(x){ return x.id === Number(manageAccessBtn.dataset.manageAccess); })[0];
      if (maFile) openAccessModal(maFile);
      return;
    }
  });

  document.getElementById('d-close').addEventListener('click', closeDetail);
  document.getElementById('backdrop').addEventListener('click', function(){ closeDetail(); closeAdd(); closeAccessModal(); });
  document.getElementById('access-cancel').addEventListener('click', closeAccessModal);
  document.getElementById('access-save').addEventListener('click', function(){
    var ids = Array.prototype.slice.call(document.querySelectorAll('#access-modal-list input:checked')).map(function(i){ return Number(i.value); });
    apiCall('setFileAccess', { fileId: state.accessModalFileId, userIds: ids }).then(function(){
      showToast('Access updated');
      closeAccessModal();
      loadFiles();
    }).catch(function(err){ showToast('Failed: ' + err.message); });
  });

  document.getElementById('create-folder-form').addEventListener('submit', function(e){
    e.preventDefault();
    var payload = { name: document.getElementById('cf-name').value.trim(), parentId: document.getElementById('cf-parent').value || null };
    apiCall('createFolder', payload).then(function(){
      showToast('Folder created');
      document.getElementById('create-folder-form').reset();
      loadFolders();
    }).catch(function(err){ showToast('Failed: ' + err.message); });
  });

  document.getElementById('upload-file-form').addEventListener('submit', function(e){
    e.preventDefault();
    var fileInput = document.getElementById('uf-file');
    if (!fileInput.files.length) return;
    var fd = new FormData();
    fd.append('action', 'uploadFile');
    fd.append('token', state.auth.token);
    fd.append('folderId', document.getElementById('uf-folder').value || '');
    fd.append('file', fileInput.files[0]);
    fetch(BACKEND_URL, { method: 'POST', body: fd }).then(function(res){ return res.json(); }).then(function(data){
      if (data.error) throw new Error(data.error);
      showToast('File uploaded');
      document.getElementById('upload-file-form').reset();
      loadFiles();
    }).catch(function(err){ showToast('Upload failed: ' + err.message); });
  });

  document.getElementById('client-search').addEventListener('input', renderClients);
  document.getElementById('status-filter').addEventListener('change', renderClients);

  document.getElementById('d-reveal').addEventListener('click', function(){
    var revealed = this.dataset.revealed === '1';
    this.dataset.revealed = revealed ? '' : '1';
    this.textContent = revealed ? 'Reveal' : 'Hide';
    renderDetail(state.selectedId);
  });
  document.getElementById('d-copy').addEventListener('click', function(){
    var c = findClient(state.selectedId); if (!c) return;
    try{ navigator.clipboard.writeText(c.apiKey); showToast('API key copied'); }
    catch(e){ showToast('Could not copy — select the key manually'); }
  });
  document.getElementById('d-markpaid').addEventListener('click', function(){ var c=findClient(state.selectedId); if(c) markPaid(c); });
  document.getElementById('d-resume').addEventListener('click', function(){ var c=findClient(state.selectedId); if(c) resumeClient(c); });
  document.getElementById('d-regen').addEventListener('click', function(){ var c=findClient(state.selectedId); if(c) regenerateKey(c); });
  document.getElementById('d-pause').addEventListener('click', function(){
    var c = findClient(state.selectedId); if (!c) return;
    if (this.dataset.confirm === '1'){ pauseClient(c); }
    else { this.dataset.confirm = '1'; this.textContent = 'Click again to confirm'; }
  });

  document.getElementById('a-cancel').addEventListener('click', closeAdd);
  document.getElementById('add-form').addEventListener('submit', function(e){
    e.preventDefault();
    var payload = {
      client: document.getElementById('a-client').value.trim(),
      software: document.getElementById('a-software').value.trim(),
      cycle: document.getElementById('a-cycle').value,
      amount: Number(document.getElementById('a-amount').value) || 0,
      start: document.getElementById('a-start').value,
      grace: Number(document.getElementById('a-grace').value) || state.settings.grace
    };
    apiCall('add', payload).then(function(){
      closeAdd(); showView('clients'); showToast(payload.client + ' added');
      return refreshFromBackend();
    }).catch(function(err){ showToast('Failed: ' + err.message); });
  });

  document.getElementById('settings-form').addEventListener('submit', function(e){
    e.preventDefault();
    var payload = {
      name: document.getElementById('set-name').value.trim() || 'DTA',
      lead: Number(document.getElementById('set-lead').value) || 7,
      grace: Number(document.getElementById('set-grace').value) || 5
    };
    apiCall('updateSettings', payload).then(function(){
      showToast('Settings saved');
      return refreshFromBackend();
    }).catch(function(err){ showToast('Failed: ' + err.message); });
  });

  document.getElementById('logout-btn').addEventListener('click', doLogout);

  document.getElementById('add-employee-form').addEventListener('submit', function(e){
    e.preventDefault();
    var payload = {
      fullName: document.getElementById('ae-fullname').value.trim(),
      username: document.getElementById('ae-username').value.trim()
    };
    apiCall('createEmployee', payload).then(function(){
      showToast(payload.fullName + ' added — they set their own PIN on first login.');
      document.getElementById('add-employee-form').reset();
      renderTeam();
    }).catch(function(err){ showToast('Failed: ' + err.message); });
  });

  document.querySelectorAll('[data-auth-switch]').forEach(function(b){
    b.addEventListener('click', function(){ showAuthPanel(b.dataset.authSwitch); });
  });

  document.getElementById('login-form').addEventListener('submit', function(e){
    e.preventDefault();
    hideAuthError('login');
    var username = document.getElementById('login-username').value.trim();
    var pin = document.getElementById('login-pin').value.trim();
    apiCall('login', { username: username, pin: pin }).then(function(data){
      if (data.needsPinSetup){
        state.pendingSetPinUsername = data.username;
        document.getElementById('setpin-sub').textContent = 'Your PIN was reset. Choose a new one to finish logging in.';
        showAuthPanel('setpin');
        return;
      }
      enterApp(data.token, data.user);
    }).catch(function(err){ showAuthError('login', err.message); });
  });

  document.getElementById('register-form').addEventListener('submit', function(e){
    e.preventDefault();
    hideAuthError('register');
    var payload = {
      fullName: document.getElementById('register-fullname').value.trim(),
      username: document.getElementById('register-username').value.trim(),
      pin: document.getElementById('register-pin').value.trim()
    };
    apiCall('register', payload).then(function(data){
      if (data.status === 'active'){
        enterApp(data.token, data.user);
      } else {
        showToast(data.message || 'Registered — waiting for admin approval.');
        document.getElementById('register-form').reset();
        showAuthPanel('login');
      }
    }).catch(function(err){ showAuthError('register', err.message); });
  });

  document.getElementById('forgot-form').addEventListener('submit', function(e){
    e.preventDefault();
    var username = document.getElementById('forgot-username').value.trim();
    apiCall('requestPinReset', { username: username }).then(function(data){
      showToast(data.message || 'Reset requested.');
      document.getElementById('forgot-form').reset();
      showAuthPanel('login');
    }).catch(function(err){ showToast('Failed: ' + err.message); });
  });

  document.getElementById('setpin-form').addEventListener('submit', function(e){
    e.preventDefault();
    hideAuthError('setpin');
    var newPin = document.getElementById('setpin-pin').value.trim();
    apiCall('setPin', { username: state.pendingSetPinUsername, newPin: newPin }).then(function(data){
      enterApp(data.token, data.user);
    }).catch(function(err){ showAuthError('setpin', err.message); });
  });

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ closeDetail(); closeAdd(); closeAccessModal(); }
  });
});
