export function rawApiCall(backendUrl, token, action, payload){
  const body = Object.assign({ action }, token ? { token } : {}, payload || {});
  return fetch(backendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  }).then((res) => res.json());
}

export function isAuthErrorMessage(msg){
  return /Session expired|Not logged in|access has been removed/i.test(msg || '');
}
