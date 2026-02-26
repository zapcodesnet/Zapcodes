import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import api from '../api';

export default function Settings() {
  const { user } = useAuth();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar />
      <main style={st.main}>
        <h1 style={st.title}>Settings</h1>
        <GitHubSection />
        <ProfileSection user={user} />
        <PlanSection user={user} />
      </main>
    </div>
  );
}

// ===== GITHUB INTEGRATION =====
function GitHubSection() {
  const [status, setStatus] = useState({ connected: false, permanent: false });
  const [token, setToken] = useState('');
  const [keepPermanent, setKeepPermanent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    api.get('/user/github-token/status').then(r => setStatus(r.data)).catch(() => {});
  }, []);

  const saveToken = async () => {
    if (!token.trim()) return;
    setLoading(true); setMsg('');
    try {
      const { data } = await api.put('/user/github-token', { token: token.trim(), keepPermanent });
      setStatus({ connected: true, permanent: keepPermanent });
      setToken('');
      setMsg('GitHub token saved successfully!');
    } catch (err) {
      setMsg(err.response?.data?.error || 'Failed to save token');
    }
    setLoading(false);
  };

  const deleteToken = async () => {
    setLoading(true);
    try {
      await api.delete('/user/github-token');
      setStatus({ connected: false, permanent: false });
      setShowDeleteConfirm(false);
      setMsg('GitHub token removed');
    } catch (err) {
      setMsg('Failed to remove token');
    }
    setLoading(false);
  };

  return (
    <div style={st.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: '1.5rem' }}>🔗</span>
        <h2 style={st.cardTitle}>GitHub Integration</h2>
        <span style={{ ...st.badge, background: status.connected ? 'rgba(0,229,160,0.1)' : 'rgba(255,170,0,0.1)', color: status.connected ? '#00e5a0' : '#ffaa00' }}>
          {status.connected ? '✓ Connected' : 'Not Connected'}
        </span>
      </div>

      <div style={st.infoBox}>
        <p style={{ fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          Connect your GitHub Personal Access Token (PAT) to <strong>export generated code to your repositories</strong>, enable version control, auto-commits, and one-click deployments (Vercel, Netlify, GitHub Pages).
        </p>
        <p style={{ fontSize: '0.8rem', marginTop: 10, color: 'var(--text-muted)' }}>
          Required scopes: <code style={st.code}>repo</code> (full control).{' '}
          Generate at: <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" style={st.link}>github.com/settings/tokens</a> → Classic token → Select "repo" scope → Copy token.
        </p>
      </div>

      {!status.connected ? (
        <div style={{ marginTop: 20 }}>
          <label style={st.label}>Paste your GitHub PAT</label>
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            style={st.input}
          />

          <label style={{ ...st.label, marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={keepPermanent} onChange={e => setKeepPermanent(e.target.checked)} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Keep token permanently <span style={{ color: '#ffaa00' }}>(not recommended for security)</span>
            </span>
          </label>

          {!keepPermanent && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8, background: 'rgba(255,170,0,0.05)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,170,0,0.1)' }}>
              ℹ️ Token will be auto-deleted when you log out or when your current build session completes. You can re-add it anytime.
            </p>
          )}

          <button onClick={saveToken} disabled={loading || !token.trim()} style={{ ...st.btn, ...st.btnPrimary, marginTop: 16 }}>
            {loading ? 'Saving...' : 'Save Token'}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Token: <code style={st.code}>ghp_****{status.permanent ? ' (permanent)' : ' (auto-delete on logout)'}</code>
            </span>
          </div>
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} style={{ ...st.btn, ...st.btnDanger, marginTop: 16 }}>
              Delete Token
            </button>
          ) : (
            <div style={{ marginTop: 16, background: 'rgba(255,68,102,0.05)', border: '1px solid rgba(255,68,102,0.2)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontSize: '0.85rem', color: '#ff4466' }}>Remove GitHub token? This will disable repo exports until re-added.</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={deleteToken} disabled={loading} style={{ ...st.btn, ...st.btnDanger }}>{loading ? 'Removing...' : 'Yes, Remove'}</button>
                <button onClick={() => setShowDeleteConfirm(false)} style={st.btn}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {msg && <p style={{ fontSize: '0.8rem', marginTop: 12, color: msg.includes('success') || msg.includes('saved') ? '#00e5a0' : '#ffaa00' }}>{msg}</p>}
    </div>
  );
}

// ===== PROFILE =====
function ProfileSection({ user }) {
  const [name, setName] = useState(user?.name || '');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setLoading(true);
    try {
      await api.put('/user/profile', { name });
      setMsg('Profile updated!');
    } catch (err) { setMsg('Failed to update'); }
    setLoading(false);
  };

  return (
    <div style={st.card}>
      <h2 style={st.cardTitle}>Profile</h2>
      <div style={st.row}><span style={st.rowLabel}>Email:</span> <strong>{user?.email}</strong></div>
      <div style={{ marginTop: 12 }}>
        <label style={st.label}>Display Name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={st.input} />
        <button onClick={save} disabled={loading} style={{ ...st.btn, ...st.btnPrimary, marginTop: 12 }}>{loading ? 'Saving...' : 'Save'}</button>
      </div>
      {msg && <p style={{ fontSize: '0.8rem', color: '#00e5a0', marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

// ===== PLAN =====
function PlanSection({ user }) {
  return (
    <div style={st.card}>
      <h2 style={st.cardTitle}>Subscription</h2>
      <div style={st.row}><span style={st.rowLabel}>Plan:</span> <strong style={{ textTransform: 'capitalize', color: user?.plan === 'pro' ? '#00e5a0' : user?.plan === 'starter' ? '#6366f1' : 'var(--text-secondary)' }}>{user?.plan || 'Free'}</strong></div>
      <div style={st.row}><span style={st.rowLabel}>Builds Used:</span> <strong>{user?.buildsUsed || 0} / {user?.buildsLimit || 3}</strong></div>
      <div style={st.row}><span style={st.rowLabel}>Scans Used:</span> <strong>{user?.scansUsed || 0} / {user?.scansLimit || 5}</strong></div>
    </div>
  );
}

const st = {
  main: { flex: 1, padding: '32px 40px', maxWidth: 800 },
  title: { fontSize: '1.6rem', fontWeight: 800, marginBottom: 24 },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, marginBottom: 20 },
  cardTitle: { fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 },
  infoBox: { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 },
  input: { width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', marginTop: 6, boxSizing: 'border-box' },
  label: { fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  btn: { padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' },
  btnPrimary: { background: '#00e5a0', color: '#06060b', borderColor: '#00e5a0' },
  btnDanger: { background: 'rgba(255,68,102,0.1)', color: '#ff4466', borderColor: 'rgba(255,68,102,0.3)' },
  badge: { fontSize: '0.7rem', fontWeight: 600, padding: '3px 10px', borderRadius: 100 },
  code: { background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' },
  link: { color: '#00e5a0', textDecoration: 'none' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.9rem' },
  rowLabel: { color: 'var(--text-muted)' },
};
