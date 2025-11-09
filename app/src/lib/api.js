import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';

function parseHostFromString(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    // If it's a full URL, URL() will parse host nicely
    const u = new URL(url);
    return u.hostname || null;
  } catch (_) {
    // Fallback regex: ://<host>
    const m = url.match(/:\/\/(\[[^\]]+\]|[^/:]+)/);
    return m ? m[1] : null;
  }
}

function resolveApiBase() {
  if (process.env.EXPO_PUBLIC_API_BASE) return process.env.EXPO_PUBLIC_API_BASE;
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:4000`;
      return 'http://localhost:4000';
    }
    // Prefer Expo host metadata if available (SDK 49+)
    const hostUri = Constants?.expoConfig?.hostUri || Constants?.manifest2?.extra?.expoClient?.hostUri || null;
    const linkUri = Constants?.linkingUri || null;
    const scriptURL = NativeModules?.SourceCode?.scriptURL || '';

    const candidates = [hostUri, linkUri, scriptURL].filter(Boolean);
    for (const c of candidates) {
      // linkingUri may embed a dev URL as a query param; try to decode
      let h = parseHostFromString(c);
      if (!h && c.includes('url=')) {
        const parsed = new URLSearchParams(c.split('?')[1] || '');
        const inner = parsed.get('url');
        h = parseHostFromString(inner);
      }
      if (h && h !== 'localhost' && h !== '127.0.0.1') {
        return `http://${h}:4000`;
      }
    }
  } catch (_) {}
  return 'http://localhost:4000';
}

export const API_BASE = resolveApiBase();

let authToken = null;
export function setAuthToken(token) {
  authToken = token;
}

async function http(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options
  });
  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
      // Try to extract a meaningful JSON error if present
      try {
        const json = JSON.parse(bodyText);
        if (json && (json.error || json.message)) {
          throw new Error(json.error || json.message);
        }
      } catch (_) {}
    } catch (_) {}
    throw new Error(bodyText || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => http('/health'),
  users: {
    list: () => http('/users'),
    create: (data) => http('/users', { method: 'POST', body: JSON.stringify(data) })
  },
  groups: {
    list: () => http('/groups'),
    create: (data) => http('/groups', { method: 'POST', body: JSON.stringify(data) }),
    members: (groupId) => http(`/groups/${groupId}/members`),
    addMember: (groupId, payload) => http(`/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteMember: (groupId, userId) => http(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
    balances: (groupId) => http(`/groups/${groupId}/balances`),
    createInvite: (groupId) => http(`/groups/${groupId}/invites`, { method: 'POST' }),
    suggestedSettlements: (groupId) => http(`/groups/${groupId}/settlements/suggested`)
  },
  expenses: {
    create: (data) => http('/expenses', { method: 'POST', body: JSON.stringify(data) }),
    listByGroup: (groupId) => http(`/expenses/group/${groupId}`),
    settle: (groupId, data) => http(`/expenses/group/${groupId}/settlements`, { method: 'POST', body: JSON.stringify(data) }),
    listSettlements: (groupId) => http(`/expenses/group/${groupId}/settlements`),
    get: (id) => http(`/expenses/${id}`),
    delete: (id) => http(`/expenses/${id}`, { method: 'DELETE' }),
    update: (id, data) => http(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },
  invites: {
    validate: (token) => http(`/invites/${token}`),
    redeem: (data) => http('/invites/redeem', { method: 'POST', body: JSON.stringify(data) })
  }
};

export const auth = {
  signup: (data) => http('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  verifyEmail: (token) => http('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
  requestVerification: (email) => http('/auth/request-verification', { method: 'POST', body: JSON.stringify({ email }) }),
  login: (email, password) => http('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  forgotPassword: (email) => http('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (email, token, new_password) => http('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, token, new_password }) }),
  changePassword: (old_password, new_password) => http('/auth/change-password', { method: 'POST', body: JSON.stringify({ old_password, new_password }) }),
  deleteAccount: async () => {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    // Try DELETE first
    const urlDelete = `${API_BASE}/auth/account`;
    console.log('[auth.deleteAccount] DELETE', urlDelete);
    let res = await fetch(urlDelete, { method: 'DELETE', headers });
    console.log('[auth.deleteAccount] DELETE status', res.status);
    if (res.ok) return res.json();
    // Fallback to POST alias (some hosts block DELETE)
    const urlPost = `${API_BASE}/auth/account/delete`;
    console.log('[auth.deleteAccount] POST', urlPost);
    res = await fetch(urlPost, { method: 'POST', headers });
    console.log('[auth.deleteAccount] POST status', res.status);
    if (!res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        throw new Error(json.error || json.message || text);
      } catch (_) {
        throw new Error(text || 'Failed to delete account');
      }
    }
    return res.json();
  },
  me: () => http('/auth/me')
};
