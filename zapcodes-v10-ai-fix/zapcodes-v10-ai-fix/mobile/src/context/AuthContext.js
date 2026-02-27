import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { connectSocket, disconnectSocket } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [repos, setRepos] = useState([]);
  const [stats, setStats] = useState(null);
  const [currentRepo, setCurrentRepo] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('zapcodes_token');
        const savedUser = await AsyncStorage.getItem('zapcodes_user');
        if (token && savedUser) {
          const parsed = JSON.parse(savedUser);
          setUser(parsed);
          connectSocket(parsed._id);
        }
      } catch (e) {
        console.error('Auth init error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    await AsyncStorage.setItem('zapcodes_token', data.token);
    await AsyncStorage.setItem('zapcodes_user', JSON.stringify(data.user));
    setUser(data.user);
    connectSocket(data.user._id);
    return data;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    await AsyncStorage.setItem('zapcodes_token', data.token);
    await AsyncStorage.setItem('zapcodes_user', JSON.stringify(data.user));
    setUser(data.user);
    connectSocket(data.user._id);
    return data;
  };

  const logout = async () => {
    await AsyncStorage.removeItem('zapcodes_token');
    await AsyncStorage.removeItem('zapcodes_user');
    setUser(null);
    setRepos([]);
    setStats(null);
    disconnectSocket();
  };

  const fetchRepos = useCallback(async () => {
    try {
      const { data } = await api.get('/scan/repos');
      setRepos(data.repos);
    } catch (e) { console.error(e); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/user/stats');
      setStats(data.stats);
    } catch (e) { console.error(e); }
  }, []);

  const scanRepo = async (url, engine = 'ollama') => {
    setScanStatus({ status: 'scanning', message: 'Starting scan...' });
    try {
      const { data } = await api.post('/scan', { url, engine });
      setCurrentRepo(data.repo);
      setScanStatus({ status: 'complete', message: data.message });
      await fetchRepos();
      await fetchStats();
      return data;
    } catch (err) {
      const msg = err.response?.data?.error || 'Scan failed';
      setScanStatus({ status: 'error', message: msg });
      throw err;
    }
  };

  const applyFix = async (repoId, issueId) => {
    const { data } = await api.post('/fix', { repoId, issueId });
    return data;
  };

  const askTutorial = async (question) => {
    const { data } = await api.post('/tutorial', { question });
    return data.response;
  };

  return (
    <AuthContext.Provider value={{
      user, loading, repos, stats, currentRepo, scanStatus,
      login, register, logout,
      fetchRepos, fetchStats, scanRepo, applyFix, askTutorial,
      setCurrentRepo, setScanStatus,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
