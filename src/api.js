// API クライアント（fetch ラッパ）
const TOKEN_KEY = 'practice_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function call(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth) {
    const t = tokenStore.get();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    if (res.status === 401) {
      tokenStore.clear();
      window.dispatchEvent(new Event('auth:expired'));
    }
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  login: (pin) => call('/api/auth', { method: 'POST', body: { pin } }),

  listSurveys: () => call('/api/survey', { auth: true }),

  getSurveyPublic: (id) =>
    call(`/api/survey?id=${encodeURIComponent(id)}`),

  getSurveyFull: (id) =>
    call(`/api/survey?id=${encodeURIComponent(id)}&full=1`, { auth: true }),

  createSurvey: (data) =>
    call('/api/survey', { method: 'POST', auth: true, body: { action: 'create', ...data } }),

  respond: ({ id, name, grade, slots }) =>
    call('/api/survey', { method: 'POST', body: { action: 'respond', id, name, grade, slots } }),

  deleteSurvey: (id) =>
    call('/api/survey', { method: 'POST', auth: true, body: { action: 'delete', id } }),

  getGroups: () =>
    call('/api/survey?resource=groups', { auth: true }),

  updateGroups: (groups) =>
    call('/api/survey', { method: 'POST', auth: true, body: { action: 'updateGroups', groups } }),

  updateHorses: (id, horses) =>
    call('/api/survey', { method: 'POST', auth: true, body: { action: 'updateHorses', id, horses } }),

  updateAsaUndo: (id, date, names) =>
    call('/api/survey', { method: 'POST', auth: true, body: { action: 'updateAsaUndo', id, date, names } }),

  updateGozenAssign: (id, date, assign) =>
    call('/api/survey', { method: 'POST', auth: true, body: { action: 'updateGozenAssign', id, date, assign } }),
};
