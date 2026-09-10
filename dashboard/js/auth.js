import { state, BACKEND_URL } from './state.js';
import { refreshFromBackend } from './clients.js';
import { showView } from './nav.js';

export function showScreen(name){
  document.getElementById('auth-screen').hidden = name !== 'auth';
  document.getElementById('app-shell').hidden = name !== 'app';
}
export function showAuthPanel(name){
  ['login','register','forgot','setpin'].forEach(function(p){
    document.getElementById(p + '-panel').hidden = (p !== name);
  });
}
export function showAuthError(panel, msg){
  var el = document.getElementById(panel + '-error');
  el.textContent = msg; el.hidden = false;
}
export function hideAuthError(panel){
  document.getElementById(panel + '-error').hidden = true;
}

export function enterApp(token, user){
  state.auth.token = token; state.auth.user = user;
  document.getElementById('me-name').textContent = user.fullName;
  document.getElementById('me-role').textContent = user.role === 'admin' ? 'Admin' : 'Employee';
  var isAdmin = user.role === 'admin';
  document.getElementById('team-nav-label').hidden = !isAdmin;
  document.getElementById('team-nav-group').hidden = !isAdmin;
  showScreen('app');
  showView('overview');
  refreshFromBackend();
}

export function doLogout(){
  var tok = state.auth.token;
  if (tok){
    fetch(BACKEND_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'logout', token: tok })
    }).catch(function(){});
  }
  state.auth.token = null; state.auth.user = null;
  state.clients = []; state.selectedId = null;
  state.folders = []; state.files = []; state.accessModalFileId = null;
  document.getElementById('login-username').value = '';
  document.getElementById('login-pin').value = '';
  showScreen('auth');
  showAuthPanel('login');
}

/* ---------- desktop auto-update (no-op outside the Electron app) ---------- */
export function setUpUpdateButton(){
  if (!window.electronAPI || !window.electronAPI.onUpdateReady) return;
  window.electronAPI.onUpdateReady(function(info){
    var btn = document.getElementById('update-btn');
    btn.hidden = false;
    btn.textContent = 'Update ' + (info && info.version ? 'v' + info.version + ' ' : '') + 'ready — restart to install';
  });
  document.getElementById('update-btn').addEventListener('click', function(){
    window.electronAPI.installUpdate();
  });
}
