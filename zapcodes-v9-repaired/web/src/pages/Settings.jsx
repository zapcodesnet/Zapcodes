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
        <div style={{ height: 80 }} />
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
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.get('/user/github-token/status').then(r => setStatus(r.data)).catch(() => {});
  }, []);

  const saveToken = async () => {
    if (!token.trim()) return;
    setLoading(true); setMsg('');
    try {
      await api.put('/user/github-token', { token: token.trim(), keepPermanent });
      setStatus({ connected: true, permanent: keepPermanent });
      setToken(''); setMsg('GitHub token saved successfully!');
    } catch (err) { setMsg(err.response?.data?.error || 'Failed to save token'); }
    setLoading(false);
  };

  const deleteToken = async () => {
    setLoading(true);
    try {
      await api.delete('/user/github-token');
      setStatus({ connected: false, permanent: false });
      setShowDeleteConfirm(false); setTestResult(null);
      setMsg('GitHub token removed');
    } catch (err) { setMsg('Failed to remove token'); }
    setLoading(false);
  };

  const testConnection = async () => {
    setTesting(true); setTestResult(null);
    try {
      const { data } = await api.post('/user/github-token/test');
      setTestResult(data);
    } catch (err) { setTestResult({ valid: false, error: 'Connection test failed' }); }
    setTesting(false);
  };

  return (
    <div style={st.card} id="github-integration-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.5rem' }}>🔗</span>
        <h2 style={{ ...st.cardTitle, marginBottom: 0 }}>GitHub Integration</h2>
        <span style={{ ...st.badge, background: status.connected ? 'rgba(0,229,160,0.1)' : 'rgba(255,170,0,0.1)', color: status.connected ? '#00e5a0' : '#ffaa00' }}>
          {status.connected ? '✓ Connected' : 'Not Connected'}
        </span>
      </div>

      <div style={st.infoBox}>
        <p style={{ fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          Connect your GitHub PAT so <strong>Moltbot can auto-apply fixes</strong> to your repos, enable version control, auto-commits, and one-click deployments.
        </p>
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(0,229,160,0.05)', borderRadius: 8, border: '1px solid rgba(0,229,160,0.1)' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#00e5a0', marginBottom: 6 }}>How to generate a token:</p>
          <ol style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
            <li>Go to <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" style={st.link}>github.com/settings/tokens</a></li>
            <li>Click <strong>"Generate new token (classic)"</strong></li>
            <li>Select scopes: <code style={st.code}>repo</code> and <code style={st.code}>workflow</code></li>
            <li>Click "Generate token" → Copy it</li>
          </ol>
        </div>
      </div>

      {!status.connected ? (
        <div style={{ marginTop: 20 }}>
          <label style={st.label}>Paste your GitHub Personal Access Token</label>
          <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="ghp_xxxx... or github_pat_xxxx..." style={st.input} />

          <label style={{ ...st.label, marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={keepPermanent} onChange={e => setKeepPermanent(e.target.checked)} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'none', letterSpacing: 0 }}>
              Keep token permanently <span style={{ color: '#ffaa00' }}>(not recommended)</span>
            </span>
          </label>

          {!keepPermanent && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8, background: 'rgba(255,170,0,0.05)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,170,0,0.1)' }}>
              ℹ️ Token auto-deletes on logout or build completion. Re-add anytime.
            </p>
          )}

          <button onClick={saveToken} disabled={loading || !token.trim()} style={{ ...st.btn, ...st.btnPrimary, marginTop: 16, width: '100%' }}>
            {loading ? 'Saving...' : 'Save Token'}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Token: <code style={st.code}>ghp_****</code> {status.permanent ? '(permanent)' : '(auto-delete on logout)'}
            </span>
          </div>

          {/* Test Connection */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={testConnection} disabled={testing} style={{ ...st.btn, ...st.btnSecondary }}>
              {testing ? '⏳ Testing...' : '🔌 Test Connection'}
            </button>
            {!showDeleteConfirm && (
              <button onClick={() => setShowDeleteConfirm(true)} style={{ ...st.btn, ...st.btnDanger }}>Delete Token</button>
            )}
          </div>

          {testResult && (
            <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: testResult.valid ? 'rgba(0,229,160,0.05)' : 'rgba(255,68,102,0.05)', border: `1px solid ${testResult.valid ? 'rgba(0,229,160,0.2)' : 'rgba(255,68,102,0.2)'}` }}>
              {testResult.valid ? (
                <div style={{ fontSize: '0.85rem' }}>
                  <p style={{ color: '#00e5a0', fontWeight: 600 }}>✅ Connected to GitHub</p>
                  <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Username: <strong>{testResult.username}</strong> · Repos: {testResult.publicRepos}</p>
                </div>
              ) : (
                <p style={{ color: '#ff4466', fontSize: '0.85rem' }}>❌ {testResult.error}</p>
              )}
            </div>
          )}

          {showDeleteConfirm && (
            <div style={{ marginTop: 12, background: 'rgba(255,68,102,0.05)', border: '1px solid rgba(255,68,102,0.2)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontSize: '0.85rem', color: '#ff4466' }}>Remove GitHub token? Moltbot won't be able to push fixes until re-added.</p>
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

function ProfileSection({ user }) {
  const [name, setName] = useState(user?.name || '');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const save = async () => {
    setLoading(true);
    try { await api.put('/user/profile', { name }); setMsg('Profile updated!'); }
    catch { setMsg('Failed to update'); }
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

function PlanSection({ user }) {
  return (
    <div style={st.card}>
      <h2 style={st.cardTitle}>Subscription</h2>
      <div style={st.row}><span style={st.rowLabel}>Plan:</span> <strong style={{ textTransform: 'capitalize', color: user?.plan === 'pro' ? '#00e5a0' : user?.plan === 'starter' ? '#6366f1' : 'var(--text-secondary)' }}>{user?.plan || 'Free'}</strong></div>
      <div style={st.row}><span style={st.rowLabel}>Builds:</span> <strong>{user?.buildsUsed || 0} / {user?.buildsLimit || 3}</strong></div>
      <div style={st.row}><span style={st.rowLabel}>Scans:</span> <strong>{user?.scansUsed || 0} / {user?.scansLimit || 5}</strong></div>
    </div>
  );
}

const st = {
  main: {
    flex: 1,
    padding: '32px 24px',
    maxWidth: 800,
    overflowY: 'auto',
    height: '100vh',
    boxSizing: 'border-box',
    WebkitOverflowScrolling: 'touch',
  },
  title: { fontSize: '1.6rem', fontWeight: 800, marginBottom: 24 },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '24px 20px',
    marginBottom: 20,
    display: 'block',
    visibility: 'visible',
    opacity: 1,
    overflow: 'visible',
    maxHeight: 'none',
    position: 'relative',
  },
  cardTitle: { fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 },
  infoBox: { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 },
  input: { width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', marginTop: 6, boxSizing: 'border-box' },
  label: { fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  btn: { padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' },
  btnPrimary: { background: '#00e5a0', color: '#06060b', borderColor: '#00e5a0' },
  btnSecondary: { background: 'rgba(99,102,241,0.1)', color: '#6366f1', borderColor: 'rgba(99,102,241,0.3)' },
  btnDanger: { background: 'rgba(255,68,102,0.1)', color: '#ff4466', borderColor: 'rgba(255,68,102,0.3)' },
  badge: { fontSize: '0.7rem', fontWeight: 600, padding: '3px 10px', borderRadius: 100 },
  code: { background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' },
  link: { color: '#00e5a0', textDecoration: 'none' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.9rem' },
  rowLabel: { color: 'var(--text-muted)' },
};