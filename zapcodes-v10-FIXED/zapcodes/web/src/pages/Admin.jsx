import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'security', label: 'Security', icon: '🛡️' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
  { id: 'finances', label: 'Finances', icon: '💰' },
  { id: 'ai', label: 'AI Chatbox', icon: '🤖' },
  { id: 'logs', label: 'Audit Logs', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function Admin() {
  const [section, setSection] = useState('dashboard');
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accessState, setAccessState] = useState('checking'); // checking, not_logged_in, needs_verification, verified
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [adminSession, setAdminSession] = useState(() => localStorage.getItem('zc_admin_session') || '');
  const navigate = useNavigate();

  // Check access on load
  useEffect(() => {
    const headers = adminSession ? { 'x-admin-session': adminSession } : {};
    api.get('/api/admin/check-access', { headers }).then(({ data }) => {
      if (data.status === 'verified') {
        setAccessState('verified');
        loadAdminData();
      } else if (data.status === 'needs_verification') {
        setAccessState('needs_verification');
        setLoading(false);
      } else if (data.needsAuth) {
        setAccessState('not_logged_in');
        setLoading(false);
      } else {
        setAccessState('not_authorized');
        setLoading(false);
      }
    }).catch(() => {
      setAccessState('not_logged_in');
      setLoading(false);
    });
  }, [adminSession]);

  const loadAdminData = () => {
    const headers = adminSession ? { 'x-admin-session': adminSession } : {};
    api.get('/api/admin/me', { headers }).then(({ data }) => {
      setAdminUser(data);
      setLoading(false);
    }).catch(() => {
      setAccessState('needs_verification');
      setLoading(false);
    });
  };

  const sendCode = async () => {
    setVerifyLoading(true);
    setVerifyMsg(''); setVerifyError('');
    try {
      const { data } = await api.post('/api/admin/send-code');
      setVerifyMsg(data.devCode ? `Code sent! (Dev: ${data.devCode})` : (data.message || 'Code sent to your email!'));
    } catch (err) {
      setVerifyError(err.response?.data?.error || 'Failed to send code');
    }
    setVerifyLoading(false);
  };

  const submitCode = async () => {
    if (!verifyCode || verifyCode.length < 6) return;
    setVerifyLoading(true);
    setVerifyError('');
    try {
      const { data } = await api.post('/api/admin/verify-code', { code: verifyCode });
      if (data.adminSessionToken) {
        localStorage.setItem('zc_admin_session', data.adminSessionToken);
        setAdminSession(data.adminSessionToken);
        setAccessState('verified');
        setLoading(true);
        loadAdminData();
      }
    } catch (err) {
      setVerifyError(err.response?.data?.error || 'Invalid code');
      setVerifyCode('');
    }
    setVerifyLoading(false);
  };

  // Override api calls to include admin session header
  const adminApi = {
    get: (url, config = {}) => api.get(url, { ...config, headers: { ...config.headers, 'x-admin-session': adminSession } }),
    post: (url, data, config = {}) => api.post(url, data, { ...config, headers: { ...config.headers, 'x-admin-session': adminSession } }),
    delete: (url, config = {}) => api.delete(url, { ...config, headers: { ...config.headers, 'x-admin-session': adminSession } }),
  };

  // Not logged in screen
  if (accessState === 'not_logged_in') {
    return (
      <div style={s.verifyPage}>
        <div style={s.verifyCard}>
          <div style={s.verifyIconWrap}><span style={{ fontSize: '2rem' }}>🔐</span></div>
          <h2 style={s.verifyTitle}>Admin Panel</h2>
          <p style={s.verifyDesc}>Sign in to your ZapCodes account to continue.</p>
          <button onClick={() => navigate('/login')} style={s.verifyBtnPrimary}>Sign In →</button>
        </div>
      </div>
    );
  }

  // Not authorized (show verification flow for non-admins too — codes won't send)
  if (accessState === 'not_authorized') {
    return (
      <div style={s.verifyPage}>
        <div style={s.verifyCard}>
          <div style={s.verifyIconWrap}><span style={{ fontSize: '2rem' }}>🔐</span></div>
          <h2 style={s.verifyTitle}>Admin Verification</h2>
          <p style={s.verifyDesc}>Enter the 6-digit verification code sent to your admin email.</p>

          {!verifyMsg ? (
            <button onClick={sendCode} style={s.verifyBtnPrimary} disabled={verifyLoading}>
              {verifyLoading ? '⏳ Sending...' : '📧 Send Verification Code'}
            </button>
          ) : (
            <>
              <div style={s.verifySuccessBanner}>
                <span style={{ fontSize: '0.85rem' }}>✅ {verifyMsg}</span>
              </div>

              <div style={s.verifyCodeWrap}>
                <label style={s.verifyLabel}>Verification Code</label>
                <input
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="0 0 0 0 0 0"
                  style={s.verifyCodeInput}
                  maxLength={6}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && verifyCode.length === 6 && submitCode()}
                />
              </div>

              <button onClick={submitCode} style={s.verifyBtnPrimary} disabled={verifyLoading || verifyCode.length < 6}>
                {verifyLoading ? '⏳ Verifying...' : '🔓 Verify & Access'}
              </button>

              <button onClick={sendCode} disabled={verifyLoading} style={s.verifyResendBtn}>
                Resend code
              </button>
            </>
          )}

          {verifyError && <p style={s.verifyErrorText}>{verifyError}</p>}
        </div>
      </div>
    );
  }

  // Needs verification (is admin but session not verified)
  if (accessState === 'needs_verification') {
    return (
      <div style={s.verifyPage}>
        <div style={s.verifyCard}>
          <div style={s.verifyIconWrap}><span style={{ fontSize: '2rem' }}>🔐</span></div>
          <h2 style={s.verifyTitle}>Admin Verification</h2>
          <p style={s.verifyDesc}>For security, verify your identity to access the admin panel.</p>

          {!verifyMsg ? (
            <button onClick={sendCode} style={s.verifyBtnPrimary} disabled={verifyLoading}>
              {verifyLoading ? '⏳ Sending...' : '📧 Send Verification Code'}
            </button>
          ) : (
            <>
              <div style={s.verifySuccessBanner}>
                <span style={{ fontSize: '0.85rem' }}>✅ {verifyMsg}</span>
              </div>

              <div style={s.verifyCodeWrap}>
                <label style={s.verifyLabel}>Verification Code</label>
                <input
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="0 0 0 0 0 0"
                  style={s.verifyCodeInput}
                  maxLength={6}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && verifyCode.length === 6 && submitCode()}
                />
              </div>

              <button onClick={submitCode} style={s.verifyBtnPrimary} disabled={verifyLoading || verifyCode.length < 6}>
                {verifyLoading ? '⏳ Verifying...' : '🔓 Verify & Access'}
              </button>

              <button onClick={sendCode} disabled={verifyLoading} style={s.verifyResendBtn}>
                Resend code
              </button>
            </>
          )}

          {verifyError && <p style={s.verifyErrorText}>{verifyError}</p>}
        </div>
      </div>
    );
  }

  if (loading) return <div style={s.loadingPage}><div className="spinner" style={{ width: 40, height: 40 }} /></div>;
  if (!adminUser) return null;

  return (
    <div style={s.layout}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.sidebarLogo}>⚡ <span style={{ fontWeight: 800 }}>Admin</span></div>
        <div style={s.sidebarUser}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#00e5a0' }}>{adminUser.isSuperAdmin ? 'SUPER ADMIN' : 'ADMIN'}</div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>{adminUser.user?.email}</div>
        </div>
        <nav style={{ flex: 1, marginTop: 16 }}>
          {SECTIONS.map(sec => (
            <button key={sec.id} onClick={() => setSection(sec.id)} style={{ ...s.navItem, ...(section === sec.id ? s.navItemActive : {}) }}>
              <span>{sec.icon}</span> {sec.label}
            </button>
          ))}
        </nav>
        <button onClick={() => navigate('/')} style={{ ...s.navItem, color: '#ff4466', marginTop: 'auto' }}>← Exit Admin</button>
      </aside>

      {/* Main content */}
      <main style={s.main}>
        {section === 'dashboard' && <DashboardSection api={adminApi} />}
        {section === 'users' && <UsersSection adminUser={adminUser} api={adminApi} />}
        {section === 'security' && <SecuritySection api={adminApi} />}
        {section === 'analytics' && <AnalyticsSection api={adminApi} />}
        {section === 'finances' && <FinancesSection api={adminApi} />}
        {section === 'ai' && <AISection adminUser={adminUser} api={adminApi} />}
        {section === 'logs' && <LogsSection api={adminApi} />}
        {section === 'settings' && <SettingsSection adminUser={adminUser} api={adminApi} />}
      </main>
    </div>
  );
}

// ===== DASHBOARD =====
function DashboardSection({ api: a }) {
  const [data, setData] = useState(null);
  useEffect(() => { a.get('/admin/dashboard').then(r => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <Loading />;

  return (
    <div>
      <h1 style={s.pageTitle}>Dashboard</h1>
      <div style={s.statGrid}>
        <StatCard label="Total Users" value={data.users.total} icon="👥" />
        <StatCard label="Active" value={data.users.active} icon="✅" color="#00e5a0" />
        <StatCard label="Banned" value={data.users.banned} icon="🚫" color="#ff4466" />
        <StatCard label="Suspended" value={data.users.suspended} icon="⏸️" color="#ffaa00" />
        <StatCard label="New This Week" value={data.users.newThisWeek} icon="📈" color="#6366f1" />
        <StatCard label="Monthly Revenue" value={`$${data.revenue.monthly}`} icon="💰" color="#00e5a0" />
        <StatCard label="Total Repos" value={data.repos} icon="📁" />
        <StatCard label="Security Flags" value={data.securityFlags} icon="🚨" color={data.securityFlags > 0 ? '#ff4466' : '#00e5a0'} />
      </div>
      <div style={s.cardGrid}>
        <div style={s.card}>
          <h3 style={s.cardTitle}>Plan Distribution</h3>
          <div style={{ display: 'flex', gap: 16 }}>
            <PlanBar label="Free" count={data.plans.free} total={data.users.total} color="#888" />
            <PlanBar label="Starter" count={data.plans.starter} total={data.users.total} color="#6366f1" />
            <PlanBar label="Pro" count={data.plans.pro} total={data.users.total} color="#00e5a0" />
          </div>
        </div>
        <div style={s.card}>
          <h3 style={s.cardTitle}>Recent Activity</h3>
          {data.recentLogs?.slice(0, 5).map((log, i) => (
            <div key={i} style={s.logRow}>
              <span style={{ color: '#00e5a0', fontSize: '0.7rem' }}>{new Date(log.timestamp).toLocaleString()}</span>
              <span style={{ fontSize: '0.8rem' }}>{log.description?.slice(0, 80)}</span>
            </div>
          ))}
          {(!data.recentLogs || data.recentLogs.length === 0) && <p style={{ color: '#666', fontSize: '0.85rem' }}>No recent activity</p>}
        </div>
      </div>
    </div>
  );
}

// ===== USERS =====
function UsersSection({ adminUser, api: a }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [actionLoading, setActionLoading] = useState('');

  const fetchUsers = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterStatus) params.set('status', filterStatus);
    params.set('limit', '100');
    a.get(`/admin/users?${params}`).then(r => { setUsers(r.data.users); setTotal(r.data.total); }).catch(() => {});
  }, [search, filterStatus]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const doAction = async (action, userId, extra = {}) => {
    setActionLoading(action + userId);
    try {
      if (action === 'ban') await a.post(`/admin/users/${userId}/ban`, { reason: extra.reason || 'Admin action' });
      else if (action === 'suspend') await a.post(`/admin/users/${userId}/suspend`, { reason: extra.reason, days: extra.days || 7 });
      else if (action === 'unban') await a.post(`/admin/users/${userId}/unban`);
      else if (action === 'delete') { if (window.confirm('PERMANENTLY delete this user? This cannot be undone!')) await a.delete(`/admin/users/${userId}`); }
      else if (action === 'force-logout') await a.post(`/admin/users/${userId}/force-logout`);
      fetchUsers();
      setSelectedUser(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Action failed');
    }
    setActionLoading('');
  };

  const changeRole = async (userId, role) => {
    try {
      await a.post(`/admin/users/${userId}/role`, { role });
      fetchUsers();
      alert('Role updated');
    } catch (err) { alert(err.response?.data?.error || 'Role change failed'); }
  };

  const changePlan = async (userId, plan) => {
    try {
      await a.post(`/admin/users/${userId}/subscription`, { plan });
      fetchUsers();
      alert('Plan updated');
    } catch (err) { alert(err.response?.data?.error || 'Plan change failed'); }
  };

  const [subModal, setSubModal] = useState(null); // user object for subscription modal
  const [subForm, setSubForm] = useState({});

  const openSubModal = (user) => {
    setSubModal(user);
    setSubForm({
      plan: user.plan, customPrice: user.customPrice || '', freeForever: user.freeForever || false,
      billingInterval: user.billingInterval || 'monthly', subscriptionDays: '',
      discountPercent: user.discount?.percent || 0, discountExpiry: user.discount?.expiresAt?.split('T')[0] || '',
      discountReason: user.discount?.reason || '', customFeatures: (user.customFeatures || []).join(', '), reason: '',
    });
  };

  const saveSubscription = async () => {
    if (!subModal) return;
    try {
      await a.post(`/admin/users/${subModal._id}/subscription`, {
        ...subForm,
        customPrice: subForm.customPrice !== '' ? Number(subForm.customPrice) : null,
        subscriptionDays: subForm.subscriptionDays ? Number(subForm.subscriptionDays) : undefined,
        discountPercent: Number(subForm.discountPercent) || 0,
        discountExpiry: subForm.discountExpiry || null,
        customFeatures: subForm.customFeatures ? subForm.customFeatures.split(',').map(s => s.trim()).filter(Boolean) : [],
      });
      setSubModal(null);
      fetchUsers();
      alert('Subscription updated!');
    } catch (err) { alert(err.response?.data?.error || 'Update failed'); }
  };

  return (
    <div>
      <h1 style={s.pageTitle}>User Management <span style={{ fontSize: '0.9rem', color: '#888', fontWeight: 400 }}>({total} total)</span></h1>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search email or name..." style={s.input} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={s.input}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      <div style={s.table}>
        <div style={s.tableHeader}>
          <span style={{ flex: 2 }}>User</span>
          <span style={{ flex: 1 }}>Plan</span>
          <span style={{ flex: 1 }}>Role</span>
          <span style={{ flex: 1 }}>Status</span>
          <span style={{ flex: 1 }}>Last Login</span>
          <span style={{ flex: 1 }}>Actions</span>
        </div>
        {users.map(u => (
          <div key={u._id} style={s.tableRow}>
            <span style={{ flex: 2 }}>
              <strong style={{ fontSize: '0.85rem' }}>{u.name}</strong>
              <div style={{ fontSize: '0.75rem', color: '#888' }}>{u.email}</div>
            </span>
            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
              <select value={u.plan} onChange={e => changePlan(u._id, e.target.value)} style={{ ...s.miniSelect, color: u.plan === 'diamond' ? '#06b6d4' : u.plan === 'gold' ? '#f59e0b' : u.plan === 'silver' ? '#6366f1' : u.plan === 'bronze' ? '#cd7f32' : '#888' }}>
                <option value="free">Free</option><option value="bronze">Bronze</option><option value="silver">Silver</option><option value="gold">Gold</option><option value="diamond">Diamond</option>
              </select>
              <MiniBtn text="⚙" color="#888" onClick={() => openSubModal(u)} title="Advanced subscription" />
            </span>
            <span style={{ flex: 1 }}>
              {adminUser.isSuperAdmin ? (
                <select value={u.role} onChange={e => changeRole(u._id, e.target.value)} style={s.miniSelect}>
                  <option value="user">User</option><option value="moderator">Mod</option><option value="co-admin">Co-Admin</option>
                </select>
              ) : (
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: u.role === 'user' ? '#888' : '#00e5a0' }}>{u.role}</span>
              )}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 100, background: u.status === 'active' ? 'rgba(0,229,160,0.1)' : u.status === 'banned' ? 'rgba(255,68,102,0.1)' : 'rgba(255,170,0,0.1)', color: u.status === 'active' ? '#00e5a0' : u.status === 'banned' ? '#ff4466' : '#ffaa00' }}>
                {u.status}
              </span>
            </span>
            <span style={{ flex: 1, fontSize: '0.7rem', color: '#666' }}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}</span>
            <span style={{ flex: 1, display: 'flex', gap: 4 }}>
              {u.status === 'active' && <MiniBtn text="Ban" color="#ff4466" onClick={() => doAction('ban', u._id)} loading={actionLoading === 'ban' + u._id} />}
              {u.status === 'active' && <MiniBtn text="Suspend" color="#ffaa00" onClick={() => doAction('suspend', u._id)} loading={actionLoading === 'suspend' + u._id} />}
              {u.status !== 'active' && <MiniBtn text="Unban" color="#00e5a0" onClick={() => doAction('unban', u._id)} loading={actionLoading === 'unban' + u._id} />}
              <MiniBtn text="🚪" color="#888" onClick={() => doAction('force-logout', u._id)} title="Force Logout" />
              {adminUser.user?.permissions?.deleteUsers && <MiniBtn text="🗑️" color="#ff4466" onClick={() => doAction('delete', u._id)} title="Delete" />}
            </span>
          </div>
        ))}
      </div>

      {/* Advanced Subscription Modal */}
      {subModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setSubModal(null)}>
          <div style={{ background: '#11111b', border: '1px solid #2a2a3a', borderRadius: 16, padding: 28, maxWidth: 480, width: '90%', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>Manage Subscription</h3>
            <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: 20 }}>{subModal.name} ({subModal.email})</p>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={ml}>Plan</label>
                <select value={subForm.plan} onChange={e => setSubForm({ ...subForm, plan: e.target.value })} style={mi}>
                  <option value="free">Free</option><option value="bronze">Bronze</option><option value="silver">Silver</option><option value="gold">Gold</option><option value="diamond">Diamond</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={ml}>Custom Price ($)</label>
                  <input type="number" value={subForm.customPrice} onChange={e => setSubForm({ ...subForm, customPrice: e.target.value })} placeholder="Default" style={mi} min="0" step="0.01" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={ml}>Billing Interval</label>
                  <select value={subForm.billingInterval} onChange={e => setSubForm({ ...subForm, billingInterval: e.target.value })} style={mi}>
                    <option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="one-time">One-Time</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ ...ml, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={subForm.freeForever} onChange={e => setSubForm({ ...subForm, freeForever: e.target.checked })} />
                  Free Forever (overrides all pricing)
                </label>
              </div>

              <div>
                <label style={ml}>Subscription Duration (days, blank=indefinite)</label>
                <input type="number" value={subForm.subscriptionDays} onChange={e => setSubForm({ ...subForm, subscriptionDays: e.target.value })} placeholder="e.g. 30, 365, blank for no expiry" style={mi} min="1" />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={ml}>Discount (%)</label>
                  <input type="number" value={subForm.discountPercent} onChange={e => setSubForm({ ...subForm, discountPercent: e.target.value })} style={mi} min="0" max="100" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={ml}>Discount Expires</label>
                  <input type="date" value={subForm.discountExpiry} onChange={e => setSubForm({ ...subForm, discountExpiry: e.target.value })} style={mi} />
                </div>
              </div>

              <div>
                <label style={ml}>Custom Features (comma-separated)</label>
                <input value={subForm.customFeatures} onChange={e => setSubForm({ ...subForm, customFeatures: e.target.value })} placeholder="e.g. priority support, unlimited storage" style={mi} />
              </div>

              <div>
                <label style={ml}>Reason (audit log)</label>
                <input value={subForm.reason} onChange={e => setSubForm({ ...subForm, reason: e.target.value })} placeholder="Why this change?" style={mi} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={saveSubscription} style={{ flex: 1, padding: '10px 20px', borderRadius: 8, border: 'none', background: '#00e5a0', color: '#06060b', fontWeight: 700, cursor: 'pointer' }}>Save Changes</button>
              <button onClick={() => setSubModal(null)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #2a2a3a', background: 'none', color: '#888', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ml = { fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 4, display: 'block', letterSpacing: 0.5 };
const mi = { width: '100%', background: '#0a0a14', border: '1px solid #2a2a3a', borderRadius: 6, padding: '8px 12px', color: '#e8e8f0', fontSize: '0.85rem', boxSizing: 'border-box' };

// ===== SECURITY =====
function SecuritySection({ api: a }) {
  const [flags, setFlags] = useState([]);
  const [total, setTotal] = useState(0);
  useEffect(() => { a.get('/admin/security').then(r => { setFlags(r.data.flags); setTotal(r.data.total); }).catch(() => {}); }, []);

  const ack = async (id) => {
    await a.post(`/admin/security/${id}/acknowledge`, { resolution: 'Reviewed by admin' });
    setFlags(prev => prev.map(f => f._id === id ? { ...f, status: 'acknowledged' } : f));
  };

  return (
    <div>
      <h1 style={s.pageTitle}>Security Monitoring <span style={{ fontSize: '0.9rem', color: '#888', fontWeight: 400 }}>({total} flags)</span></h1>
      {flags.length === 0 ? (
        <div style={{ ...s.card, textAlign: 'center', padding: 60 }}>
          <span style={{ fontSize: '3rem' }}>🛡️</span>
          <p style={{ color: '#888', marginTop: 12 }}>No security flags. All systems nominal.</p>
        </div>
      ) : flags.map(f => (
        <div key={f._id} style={{ ...s.card, marginBottom: 12, borderLeftColor: f.severity === 'critical' ? '#ff4466' : f.severity === 'high' ? '#ffaa00' : '#888', borderLeftWidth: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: f.severity === 'critical' ? '#ff4466' : f.severity === 'high' ? '#ffaa00' : '#888' }}>{f.severity}</span>
              <span style={{ fontSize: '0.7rem', color: '#555', marginLeft: 12 }}>{f.type}</span>
            </div>
            <span style={{ fontSize: '0.7rem', color: '#555' }}>{new Date(f.timestamp).toLocaleString()}</span>
          </div>
          <p style={{ fontSize: '0.85rem', marginTop: 8 }}>{f.description}</p>
          {f.ip && <p style={{ fontSize: '0.75rem', color: '#666', marginTop: 4 }}>IP: {f.ip} {f.geoLocation?.city ? `(${f.geoLocation.city}, ${f.geoLocation.country})` : ''}</p>}
          {f.status === 'new' && <button onClick={() => ack(f._id)} style={{ ...s.miniBtn, marginTop: 8 }}>✓ Acknowledge</button>}
          {f.status !== 'new' && <span style={{ fontSize: '0.7rem', color: '#00e5a0', marginTop: 8, display: 'block' }}>✓ {f.status}</span>}
        </div>
      ))}
    </div>
  );
}

// ===== ANALYTICS =====
function AnalyticsSection({ api: a }) {
  const [data, setData] = useState(null);
  useEffect(() => { a.get('/admin/analytics').then(r => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <Loading />;

  return (
    <div>
      <h1 style={s.pageTitle}>Analytics</h1>
      <div style={s.cardGrid}>
        <div style={s.card}>
          <h3 style={s.cardTitle}>Signups (Last 30 Days)</h3>
          {data.dailySignups?.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, padding: '16px 0' }}>
              {data.dailySignups.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ background: '#00e5a0', width: '100%', maxWidth: 20, height: Math.max(4, d.count * 20), borderRadius: 3, transition: '0.2s' }} title={`${d._id}: ${d.count}`} />
                </div>
              ))}
            </div>
          ) : <p style={{ color: '#666' }}>No signups in last 30 days</p>}
        </div>
        <div style={s.card}>
          <h3 style={s.cardTitle}>Plan Distribution</h3>
          {data.planDistribution?.map(p => (
            <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1a2a' }}>
              <span style={{ textTransform: 'capitalize' }}>{p._id}</span>
              <strong>{p.count}</strong>
            </div>
          ))}
        </div>
      </div>
      <div style={s.card}>
        <h3 style={s.cardTitle}>Top Users (by scans)</h3>
        {data.topUsers?.map((u, i) => (
          <div key={u._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1a2a', fontSize: '0.85rem' }}>
            <span>#{i + 1} {u.name} ({u.email})</span>
            <span><strong>{u.scansUsed}</strong> scans, <strong>{u.buildsUsed}</strong> builds</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== FINANCES =====
function FinancesSection({ api: a }) {
  const [data, setData] = useState(null);
  useEffect(() => { a.get('/admin/dashboard').then(r => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <Loading />;

  const costs = { render: 7, domain: 1, groqApi: 5 }; // estimated monthly
  const totalCosts = Object.values(costs).reduce((a, b) => a + b, 0);
  const profit = data.revenue.monthly - totalCosts;

  return (
    <div>
      <h1 style={s.pageTitle}>Financial Dashboard</h1>
      <div style={s.statGrid}>
        <StatCard label="Monthly Revenue" value={`$${data.revenue.monthly}`} icon="💰" color="#00e5a0" />
        <StatCard label="Starter Income" value={`$${data.revenue.starter}`} icon="💳" color="#6366f1" />
        <StatCard label="Pro Income" value={`$${data.revenue.pro}`} icon="💎" color="#a855f7" />
        <StatCard label="Est. Monthly Costs" value={`$${totalCosts}`} icon="📉" color="#ffaa00" />
        <StatCard label="Est. Monthly Profit" value={`$${profit}`} icon={profit >= 0 ? '📈' : '📉'} color={profit >= 0 ? '#00e5a0' : '#ff4466'} />
        <StatCard label="Annual Projection" value={`$${data.revenue.monthly * 12}`} icon="🎯" color="#00e5a0" />
      </div>
      <div style={s.card}>
        <h3 style={s.cardTitle}>Cost Breakdown (Estimated)</h3>
        {Object.entries(costs).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1a2a' }}>
            <span style={{ textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</span>
            <strong>${v}/mo</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== AI CHATBOX =====
function AISection({ adminUser, api: a }) {
  const [messages, setMessages] = useState([
    { role: 'system', text: '🤖 ZapCodes AI Command Center. Verify 2FA to unlock commands.' }
  ]);
  const [input, setInput] = useState('');
  const [twoFAToken, setTwoFAToken] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [setupData, setSetupData] = useState(null);
  const [codeInput, setCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const setup2FA = async () => {
    try {
      const { data } = await a.post('/admin/2fa/setup');
      setSetupData(data);
      setShowSetup(true);
    } catch (err) { alert(err.response?.data?.error || '2FA setup failed'); }
  };

  const verify2FA = async () => {
    try {
      const { data } = await a.post('/admin/2fa/verify', { code: codeInput });
      setTwoFAToken(data.twoFAToken);
      setMessages(prev => [...prev, { role: 'system', text: '✅ 2FA verified. AI commands unlocked. Session expires after 5 min inactivity.' }]);
      setShowSetup(false);
      setCodeInput('');
    } catch (err) {
      alert(err.response?.data?.error || 'Invalid code');
    }
  };

  const sendCommand = async () => {
    if (!input.trim() || !twoFAToken) return;
    const cmd = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: cmd }]);
    setLoading(true);

    try {
      const { data } = await a.post('/admin/ai/command', { command: cmd }, {
        headers: { 'x-2fa-token': twoFAToken },
      });
      setMessages(prev => [...prev, { role: 'ai', text: data.message }]);
      if (data.twoFAToken) setTwoFAToken(data.twoFAToken); // Refresh session
    } catch (err) {
      if (err.response?.data?.requires2FA) {
        setTwoFAToken('');
        setMessages(prev => [...prev, { role: 'system', text: '⏰ 2FA session expired. Please verify again.' }]);
      } else {
        setMessages(prev => [...prev, { role: 'system', text: `❌ Error: ${err.response?.data?.error || 'Command failed'}` }]);
      }
    }
    setLoading(false);
  };

  return (
    <div>
      <h1 style={s.pageTitle}>🤖 AI Command Center (ZapCodes AI)</h1>

      {!twoFAToken && (
        <div style={{ ...s.card, textAlign: 'center', marginBottom: 20 }}>
          <p style={{ color: '#ffaa00', marginBottom: 16 }}>🔐 2FA verification required to access AI commands</p>
          {!showSetup ? (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={setup2FA} style={s.btn}>Setup 2FA (First Time)</button>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={codeInput} onChange={e => setCodeInput(e.target.value)} placeholder="Enter 6-digit code" style={{ ...s.input, width: 180 }} maxLength={6} />
                <button onClick={verify2FA} style={{ ...s.btn, background: '#00e5a0', color: '#06060b' }}>Verify</button>
              </div>
            </div>
          ) : setupData && (
            <div>
              <p style={{ fontSize: '0.85rem', marginBottom: 12 }}>Add this secret to Google Authenticator:</p>
              <code style={{ background: '#1a1a2a', padding: '8px 16px', borderRadius: 8, fontSize: '1.1rem', letterSpacing: 2 }}>{setupData.secret}</code>
              <p style={{ fontSize: '0.75rem', color: '#666', marginTop: 8 }}>Or scan: <a href={setupData.otpauthUrl} style={{ color: '#00e5a0' }}>Open in Authenticator</a></p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                <input value={codeInput} onChange={e => setCodeInput(e.target.value)} placeholder="Enter code to confirm" style={{ ...s.input, width: 180 }} maxLength={6} />
                <button onClick={verify2FA} style={{ ...s.btn, background: '#00e5a0', color: '#06060b' }}>Confirm Setup</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={s.chatPanel}>
        <div ref={scrollRef} style={s.chatMessages}>
          {messages.map((msg, i) => (
            <div key={i} style={{ ...s.chatMsg, ...(msg.role === 'user' ? s.chatUser : msg.role === 'ai' ? s.chatAI : s.chatSystem) }}>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{msg.text}</pre>
            </div>
          ))}
          {loading && <div style={{ ...s.chatMsg, ...s.chatSystem }}><span className="spinner" style={{ width: 14, height: 14 }} /> Processing...</div>}
        </div>
        <form onSubmit={e => { e.preventDefault(); sendCommand(); }} style={s.chatInput}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder={twoFAToken ? 'Enter command for ZapCodes AI...' : '2FA required'} style={s.input} disabled={!twoFAToken || loading} />
          <button type="submit" style={{ ...s.btn, background: '#00e5a0', color: '#06060b' }} disabled={!twoFAToken || loading || !input.trim()}>Send</button>
        </form>
      </div>
    </div>
  );
}

// ===== AUDIT LOGS =====
function LogsSection({ api: a }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    const params = filter ? `?action=${filter}` : '';
    a.get(`/admin/logs${params}`).then(r => { setLogs(r.data.logs); setTotal(r.data.total); }).catch(() => {});
  }, [filter]);

  const actions = ['role_change', 'user_ban', 'user_suspend', 'user_unban', 'user_delete', 'ai_command', 'ai_action', '2fa_verify', 'price_override'];

  return (
    <div>
      <h1 style={s.pageTitle}>Audit Logs <span style={{ fontSize: '0.9rem', color: '#888', fontWeight: 400 }}>({total})</span></h1>
      <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...s.input, width: 200, marginBottom: 16 }}>
        <option value="">All Actions</option>
        {actions.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
      </select>
      {logs.map((log, i) => (
        <div key={i} style={{ ...s.card, marginBottom: 8, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, background: log.severity === 'critical' ? 'rgba(255,68,102,0.1)' : log.severity === 'warning' ? 'rgba(255,170,0,0.1)' : 'rgba(0,229,160,0.1)', color: log.severity === 'critical' ? '#ff4466' : log.severity === 'warning' ? '#ffaa00' : '#00e5a0' }}>
              {log.action?.replace(/_/g, ' ')}
            </span>
            <span style={{ fontSize: '0.7rem', color: '#555' }}>{new Date(log.timestamp).toLocaleString()}</span>
          </div>
          <p style={{ fontSize: '0.85rem' }}>{log.description}</p>
          <p style={{ fontSize: '0.7rem', color: '#555', marginTop: 4 }}>By: {log.actor?.email || log.actorEmail} {log.targetEmail ? `→ ${log.targetEmail}` : ''}</p>
        </div>
      ))}
    </div>
  );
}

// ===== SETTINGS =====
function SettingsSection({ adminUser, api: a }) {
  return (
    <div>
      <h1 style={s.pageTitle}>Settings</h1>
      <div style={s.card}>
        <h3 style={s.cardTitle}>Admin Profile</h3>
        <div style={s.settingRow}><span>Email:</span> <strong>{adminUser.user?.email}</strong></div>
        <div style={s.settingRow}><span>Role:</span> <strong style={{ color: '#00e5a0' }}>{adminUser.user?.role}</strong></div>
        <div style={s.settingRow}><span>2FA:</span> <strong>{adminUser.twoFactorEnabled ? '✅ Enabled' : '❌ Not set up'}</strong></div>
      </div>
      <div style={s.card}>
        <h3 style={s.cardTitle}>Platform Config</h3>
        <div style={s.settingRow}><span>Super Admin:</span> <strong>zapcodesnet@gmail.com</strong></div>
        <div style={s.settingRow}><span>Backend:</span> <strong>Node.js + Express + MongoDB</strong></div>
        <div style={s.settingRow}><span>AI Engine:</span> <strong>Groq API (Llama 3.1)</strong></div>
        <div style={s.settingRow}><span>Payments:</span> <strong>Stripe</strong></div>
      </div>
    </div>
  );
}

// ===== SHARED COMPONENTS =====
function Loading() { return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>; }

function StatCard({ label, value, icon, color }) {
  return (
    <div style={s.statCard}>
      <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      <span style={{ fontSize: '1.5rem', fontWeight: 900, color: color || '#e8e8f0', fontFamily: 'var(--font-mono)' }}>{value}</span>
      <span style={{ fontSize: '0.75rem', color: '#888' }}>{label}</span>
    </div>
  );
}

function PlanBar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div style={{ width: '60%', height: `${Math.max(4, pct)}%`, background: color, borderRadius: 4 }} />
      </div>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: 8 }}>{count}</div>
      <div style={{ fontSize: '0.7rem', color: '#888' }}>{label}</div>
    </div>
  );
}

function MiniBtn({ text, color, onClick, loading, title }) {
  return (
    <button onClick={onClick} title={title} style={{ ...s.miniBtn, color, borderColor: color + '33' }} disabled={loading}>
      {loading ? '...' : text}
    </button>
  );
}

// ===== STYLES =====
const s = {
  layout: { display: 'flex', minHeight: '100vh', background: '#06060b', color: '#e8e8f0' },
  sidebar: { width: 220, background: '#0a0a14', borderRight: '1px solid #1a1a2a', display: 'flex', flexDirection: 'column', padding: 16, position: 'fixed', top: 0, bottom: 0, overflowY: 'auto', zIndex: 50 },
  sidebarLogo: { fontSize: '1.2rem', padding: '8px 12px', color: '#00e5a0' },
  sidebarUser: { padding: '8px 12px', borderBottom: '1px solid #1a1a2a', marginBottom: 8 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, fontSize: '0.85rem', color: '#888', cursor: 'pointer', width: '100%', textAlign: 'left', background: 'none', border: 'none', transition: '0.15s' },
  navItemActive: { background: 'rgba(0,229,160,0.08)', color: '#00e5a0' },
  main: { flex: 1, marginLeft: 220, padding: '32px 40px', maxWidth: 1200 },
  loadingPage: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#06060b' },
  pageTitle: { fontSize: '1.6rem', fontWeight: 800, marginBottom: 24 },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 },
  statCard: { background: '#11111b', border: '1px solid #1a1a2a', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 16 },
  card: { background: '#11111b', border: '1px solid #1a1a2a', borderRadius: 12, padding: 24, marginBottom: 16 },
  cardTitle: { fontSize: '1rem', fontWeight: 700, marginBottom: 16, color: '#ccc' },
  logRow: { display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0', borderBottom: '1px solid #1a1a2a' },
  input: { background: '#11111b', border: '1px solid #2a2a3a', borderRadius: 8, padding: '10px 14px', color: '#e8e8f0', fontSize: '0.85rem', flex: 1, fontFamily: 'inherit' },
  btn: { padding: '10px 20px', borderRadius: 8, border: '1px solid #2a2a3a', background: '#1a1a2a', color: '#e8e8f0', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' },
  miniBtn: { padding: '4px 10px', borderRadius: 6, border: '1px solid #2a2a3a', background: 'none', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' },
  miniSelect: { background: '#0a0a14', border: '1px solid #2a2a3a', borderRadius: 6, padding: '3px 6px', fontSize: '0.75rem', color: '#e8e8f0' },
  table: { background: '#11111b', border: '1px solid #1a1a2a', borderRadius: 12, overflow: 'hidden' },
  tableHeader: { display: 'flex', padding: '12px 16px', background: '#0a0a14', fontSize: '0.75rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1 },
  tableRow: { display: 'flex', padding: '12px 16px', borderBottom: '1px solid #1a1a2a', alignItems: 'center', fontSize: '0.85rem' },
  settingRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1a1a2a', fontSize: '0.9rem' },
  chatPanel: { background: '#0a0a14', border: '1px solid #1a1a2a', borderRadius: 12, overflow: 'hidden' },
  chatMessages: { padding: 20, maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
  chatMsg: { padding: '10px 14px', borderRadius: 10, fontSize: '0.85rem', maxWidth: '85%', lineHeight: 1.6 },
  chatUser: { alignSelf: 'flex-end', background: '#00e5a0', color: '#06060b', borderBottomRightRadius: 3 },
  chatAI: { alignSelf: 'flex-start', background: '#11111b', border: '1px solid #2a2a3a', borderBottomLeftRadius: 3 },
  chatSystem: { alignSelf: 'center', background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.15)', color: '#ffaa00', fontSize: '0.8rem', borderRadius: 8 },
  chatInput: { display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid #1a1a2a' },
  verifyPage: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#06060b', color: '#e8e8f0', padding: 20 },
  verifyCard: { background: '#11111b', border: '1px solid #2a2a3a', borderRadius: 20, padding: '48px 36px', maxWidth: 420, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' },
  verifyIconWrap: { width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  verifyTitle: { fontSize: '1.4rem', fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' },
  verifyDesc: { color: '#888', fontSize: '0.88rem', lineHeight: 1.6, margin: '0 0 24px', maxWidth: 300 },
  verifyBtnPrimary: { padding: '14px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #00e5a0, #00c888)', color: '#06060b', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', width: '100%', transition: 'opacity 0.2s' },
  verifySuccessBanner: { background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: 10, padding: '12px 16px', width: '100%', marginBottom: 20, boxSizing: 'border-box', color: '#00e5a0' },
  verifyCodeWrap: { width: '100%', marginBottom: 20, textAlign: 'left', boxSizing: 'border-box' },
  verifyLabel: { fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'block' },
  verifyCodeInput: { width: '100%', background: '#0a0a14', border: '2px solid #2a2a3a', borderRadius: 12, padding: '18px 20px', color: '#00e5a0', fontSize: '1.8rem', textAlign: 'center', letterSpacing: '14px', fontFamily: 'monospace', fontWeight: 700, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' },
  verifyResendBtn: { background: 'none', border: 'none', color: '#666', fontSize: '0.82rem', cursor: 'pointer', marginTop: 14, textDecoration: 'underline', padding: '4px 8px' },
  verifyErrorText: { color: '#ff4466', fontSize: '0.82rem', marginTop: 14, padding: '8px 14px', background: 'rgba(255,68,102,0.06)', border: '1px solid rgba(255,68,102,0.15)', borderRadius: 8, width: '100%', boxSizing: 'border-box' },
};
