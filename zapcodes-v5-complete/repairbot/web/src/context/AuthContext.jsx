import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { connectSocket, disconnectSocket } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [repos, setRepos] = useState([]);
  const [stats, setStats] = useState(null);
  const [currentRepo, setCurrentRepo] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);

  // Initialize from localStorage
  useEffect(() => {
    const token = localStorage.getItem('zapcodes_token');
    const savedUser = localStorage.getItem('zapcodes_user');
    if (token && savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        const socket = connectSocket(parsed._id);

        // Listen for admin force-logout
        socket.on('force-logout', (data) => {
          alert(data?.reason || 'Your session has been terminated by an administrator.');
          logout();
          window.location.href = '/';
        });
      } catch (e) {
        localStorage.removeItem('zapcodes_token');
        localStorage.removeItem('zapcodes_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('zapcodes_token', data.token);
    localStorage.setItem('zapcodes_user', JSON.stringify(data.user));
    setUser(data.user);
    connectSocket(data.user._id);
    return data;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('zapcodes_token', data.token);
    localStorage.setItem('zapcodes_user', JSON.stringify(data.user));
    setUser(data.user);
    connectSocket(data.user._id);
    return data;
  };

  const logout = () => {
    // Server-side cleanup (auto-delete ephemeral GitHub token, etc.)
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('zapcodes_token');
    localStorage.removeItem('zapcodes_user');
    localStorage.removeItem('zc_admin_session');
    setUser(null);
    setRepos([]);
    setStats(null);
    setCurrentRepo(null);
    disconnectSocket();
  };

  const handleAuthCallback = (token) => {
    localStorage.setItem('zapcodes_token', token);
    api.get('/auth/me').then(({ data }) => {
      localStorage.setItem('zapcodes_user', JSON.stringify(data.user));
      setUser(data.user);
      connectSocket(data.user._id);
    });
  };

  const fetchRepos = useCallback(async () => {
    try {
      const { data } = await api.get('/scan/repos');
      setRepos(data.repos);
    } catch (e) {
      console.error('Failed to fetch repos:', e);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/user/stats');
      setStats(data.stats);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
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
    if (currentRepo && currentRepo._id === repoId) {
      const updated = { ...currentRepo };
      const issue = updated.issues.find(i => i.id === issueId);
      if (issue) {
        issue.status = 'fixed';
        issue.prUrl = data.prUrl;
      }
      setCurrentRepo(updated);
    }
    return data;
  };

  const dismissIssue = async (repoId, issueId) => {
    await api.post('/fix/dismiss', { repoId, issueId });
    if (currentRepo && currentRepo._id === repoId) {
      const updated = { ...currentRepo };
      const issue = updated.issues.find(i => i.id === issueId);
      if (issue) issue.status = 'dismissed';
      setCurrentRepo(updated);
    }
  };

  const askTutorial = async (question) => {
    const { data } = await api.post('/tutorial', { question });
    return data.response;
  };

  return (
    <AuthContext.Provider value={{
      user, loading, repos, stats, currentRepo, scanStatus,
      login, register, logout, handleAuthCallback,
      fetchRepos, fetchStats, scanRepo, applyFix, dismissIssue, askTutorial,
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
