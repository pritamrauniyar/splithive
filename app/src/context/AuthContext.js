import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth as authApi, setAuthToken } from '../lib/api';
import { connectSocket, disconnectSocket } from '../realtime/socket';

const STORAGE_TOKEN = 'auth.token';
const STORAGE_USER = 'auth.user';

const AuthContext = createContext({
  user: null,
  token: null,
  ready: false,
  login: async (_email, _password) => {},
  signup: async (_name, _email, _password) => ({ verify_token: null }),
  verifyEmail: async (_token) => {},
  requestVerification: async (_email) => {},
  logout: async () => {}
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([
          AsyncStorage.getItem(STORAGE_TOKEN),
          AsyncStorage.getItem(STORAGE_USER)
        ]);
        if (t) {
          setToken(t);
          setAuthToken(t);
          connectSocket(t);
        }
        if (u) setUser(JSON.parse(u));
      } catch {}
      setReady(true);
    })();
  }, []);

  async function login(email, password) {
    const res = await authApi.login(email, password);
    setToken(res.token);
    setUser(res.user);
    setAuthToken(res.token);
    connectSocket(res.token);
    await AsyncStorage.setItem(STORAGE_TOKEN, res.token);
    await AsyncStorage.setItem(STORAGE_USER, JSON.stringify(res.user));
  }

  async function signup(name, email, password) {
    const res = await authApi.signup({ name, email, password });
    return res; // includes verify_token for dev
  }

  async function verifyEmail(token) {
    const res = await authApi.verifyEmail(token);
    setToken(res.token);
    setUser(res.user);
    setAuthToken(res.token);
    connectSocket(res.token);
    await AsyncStorage.setItem(STORAGE_TOKEN, res.token);
    await AsyncStorage.setItem(STORAGE_USER, JSON.stringify(res.user));
  }

  async function requestVerification(email) {
    return authApi.requestVerification(email);
  }

  async function logout() {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    disconnectSocket();
    await AsyncStorage.multiRemove([STORAGE_TOKEN, STORAGE_USER]);
  }

  const value = useMemo(() => ({ user, token, login, signup, verifyEmail, requestVerification, logout, ready }), [user, token, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
