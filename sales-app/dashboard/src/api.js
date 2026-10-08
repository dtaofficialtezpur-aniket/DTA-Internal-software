export async function rawApiCall(backendUrl, token, action, payload){
  const body = Object.assign({ action }, token ? { token } : {}, payload || {});
  // text/plain keeps this a "simple" request, so no CORS preflight is needed.
  const res = await fetch(backendUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  let data;
  try { data = await res.json(); } catch { throw new Error('Could not reach the server.'); }
  if (!res.ok || data.error) throw Object.assign(new Error(data.error || 'Request failed.'), { status: res.status });
  return data;
}
