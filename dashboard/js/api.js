import { state, BACKEND_URL } from './state.js';
import { showToast } from './toast.js';
import { doLogout } from './auth.js';

export function isLoggedIn(){ return !!(state.auth.token && state.auth.user); }
export function isAuthErrorMessage(msg){
  return /Session expired|Not logged in|access has been removed/i.test(msg || '');
}

export function apiCall(action, payload){
  var body = Object.assign({ action: action }, state.auth.token ? { token: state.auth.token } : {}, payload || {});
  return fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  }).then(function(res){ return res.json(); }).then(function(data){
    if (data && data.error){
      if (isAuthErrorMessage(data.error) && isLoggedIn()){
        doLogout();
        showToast('Please log in again.');
      }
      throw new Error(data.error);
    }
    return data;
  });
}
