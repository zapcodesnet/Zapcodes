import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import VisitorWorldMap from '../components/VisitorWorldMap';

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'security', label: 'Security', icon: '🛡️' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
  { id: 'finances', label: 'Finances', icon: '💰' },
  { id: 'promos', label: 'Promo Codes', icon: '🎟️' },
  { id: 'referrals', label: 'Referrals', icon: '🔗' },
  { id: 'ai', label: 'AI Chatbox', icon: '🤖' },
  { id: 'logs', label: 'Audit Logs', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function Admin() {
  const [section, setSection] = useState('dashboard');
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accessState, setAccessState] = useState('checking');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [adminSession, setAdminSession] = useState(() => localStorage.getItem('admin_session') || '');
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 768);
  const navigate = useNavigate();

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
        localStorage.setItem('admin_session', data.adminSessionToken);
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

  // ═══════════════════════════════════════════════════════════
  // CRITICAL FIX: adminApi must prefix ALL paths with /api
  // This was the root cause of all 404 errors. The backend
  // mounts admin routes at /api/admin, but the old code
  // called /admin/... which resolved to the wrong path.
  // ═══════════════════════════════════════════════════════════
  const adminApi = {
    get: (url, config = {}) => api.get(`/api${url}`, { ...config, headers: { ...config.headers, 'x-admin-session': adminSession } }),
    post: (url, data, config = {}) => api.post(`/api${url}`, data, { ...config, headers: { ...config.headers, 'x-admin-session': adminSession } }),
    put: (url, data, config = {}) => api.put(`/api${url}`, data, { ...config, headers: { ...config.headers, 'x-admin-session': adminSession } }),
    delete: (url, config = {}) => api.delete(url.startsWith('/api') ? url : `/api${url}`, { ...config, headers: { ...config.headers, 'x-admin-session': adminSession } }),
  };

  // ═══ Verification screens ═══
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

  if (accessState === 'not_authorized' || accessState === 'needs_verification') {
    return (
      <div style={s.verifyPage}>
        <div style={s.verifyCard}>
          <div style={s.verifyIconWrap}><span style={{ fontSize: '2rem' }}>🔐</span></div>
          <h2 style={s.verifyTitle}>Admin Verification</h2>
          <p style={s.verifyDesc}>{accessState === 'not_authorized' ? 'Enter the 6-digit verification code sent to your admin email.' : 'For security, verify your identity to access the admin panel.'}</p>
          {!verifyMsg ? (
            <button onClick={sendCode} style={s.verifyBtnPrimary} disabled={verifyLoading}>
              {verifyLoading ? '⏳ Sending...' : '📧 Send Verification Code'}
            </button>
          ) : (
            <>
              <div style={s.verifySuccessBanner}><span style={{ fontSize: '0.85rem' }}>✅ {verifyMsg}</span></div>
              <div style={s.verifyCodeWrap}>
                <label style={s.verifyLabel}>Verification Code</label>
                <input value={verifyCode} onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="0 0 0 0 0 0" style={s.verifyCodeInput} maxLength={6} autoFocus onKeyDown={e => e.key === 'Enter' && verifyCode.length === 6 && submitCode()} />
              </div>
              <button onClick={submitCode} style={s.verifyBtnPrimary} disabled={verifyLoading || verifyCode.length < 6}>
                {verifyLoading ? '⏳ Verifying...' : '🔓 Verify & Access'}
              </button>
              <button onClick={sendCode} disabled={verifyLoading} style={s.verifyResendBtn}>Resend code</button>
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
      {/* ═══ Mobile hamburger bar ═══ */}
      <div style={s.mobileBar} data-admin-mobile-bar>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.1rem' }}>⚡</span>
          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#00e5a0' }}>Admin</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.7rem', color: '#888' }}>{section}</span>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={s.hamburgerBtn} data-admin-hamburger>
            {sidebarOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* ═══ Sidebar overlay (mobile) + fixed sidebar (desktop) ═══ */}
      {sidebarOpen && <div style={s.sidebarOverlay} data-admin-overlay onClick={() => setSidebarOpen(false)} />}
      <aside style={{ ...s.sidebar, ...(sidebarOpen ? {} : {}), }} data-admin-sidebar className={sidebarOpen ? 'admin-sidebar-open' : 'admin-sidebar-closed'}>
        <div style={s.sidebarLogo}>⚡ <span style={{ fontWeight: 800 }}>Admin</span></div>
        <div style={s.sidebarUser}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#00e5a0' }}>{adminUser.isSuperAdmin ? 'SUPER ADMIN' : 'ADMIN'}</div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>{adminUser.user?.email}</div>
        </div>
        <nav style={{ flex: 1, marginTop: 16, overflowY: 'auto' }}>
          {SECTIONS.map(sec => (
            <button key={sec.id} onClick={() => { setSection(sec.id); setSidebarOpen(false); }} style={{ ...s.navItem, ...(section === sec.id ? s.navItemActive : {}) }}>
              <span>{sec.icon}</span> {sec.label}
            </button>
          ))}
        </nav>
        <button onClick={() => navigate('/')} style={{ ...s.navItem, color: '#ff4466', marginTop: 'auto' }}>← Exit Admin</button>
      </aside>

      {/* ═══ Main content ═══ */}
      <main style={s.main} data-admin-main>
        {section === 'dashboard' && <DashboardSection api={adminApi} />}
        {section === 'users' && <UsersSection adminUser={adminUser} api={adminApi} />}
        {section === 'security' && <SecuritySection api={adminApi} />}
        {section === 'analytics' && <AnalyticsSection api={adminApi} />}
        {section === 'finances' && <FinancesSection api={adminApi} />}
        {section === 'promos' && <PromosSection api={adminApi} />}
        {section === 'referrals' && <ReferralsSection api={adminApi} />}
        {section === 'ai' && <AISection adminUser={adminUser} api={adminApi} />}
        {section === 'logs' && <LogsSection api={adminApi} />}
        {section === 'settings' && <SettingsSection adminUser={adminUser} api={adminApi} />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
function DashboardSection({ api: a }) {
  const [data, setData] = useState(null);
  useEffect(() => { a.get('/admin/dashboard').then(r => setData(r.data)).catch(e => console.error('Dashboard load failed:', e)); }, []);
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
          <div style={{ display: 'flex', gap: 12 }}>
            <PlanBar label="Free" count={data.plans.free} total={data.users.total} color="#888" />
            <PlanBar label="Bronze" count={data.plans.bronze} total={data.users.total} color="#cd7f32" />
            <PlanBar label="Silver" count={data.plans.silver} total={data.users.total} color="#6366f1" />
            <PlanBar label="Gold" count={data.plans.gold} total={data.users.total} color="#f59e0b" />
            <PlanBar label="Diamond" count={data.plans.diamond} total={data.users.total} color="#06b6d4" />
          </div>
        </div>
        <div style={s.card}>
          <h3 style={s.cardTitle}>BL Coin Economy</h3>
          <div style={s.settingRow}><span>Total BL in circulation:</span> <strong style={{ color: '#00e5a0' }}>{(data.blEconomy?.totalBL || 0).toLocaleString()}</strong></div>
          <div style={s.settingRow}><span>Users with coins:</span> <strong>{data.blEconomy?.usersWithCoins || 0}</strong></div>
          <div style={s.settingRow}><span>Average balance:</span> <strong>{Math.round(data.blEconomy?.avgBL || 0).toLocaleString()}</strong></div>
          <div style={s.settingRow}><span>Active promo codes:</span> <strong style={{ color: '#a855f7' }}>{data.activePromos || 0}</strong></div>
          <div style={s.settingRow}><span>Total referrals:</span> <strong>{data.referralStats?.totalReferrals || 0}</strong></div>
        </div>
      </div>
      <div style={s.card}>
        <h3 style={s.cardTitle}>Recent Activity</h3>
        {data.recentLogs?.slice(0, 8).map((log, i) => (
          <div key={i} style={s.logRow}>
            <span style={{ color: '#00e5a0', fontSize: '0.7rem' }}>{new Date(log.timestamp).toLocaleString()}</span>
            <span style={{ fontSize: '0.8rem' }}>{log.description?.slice(0, 100)}</span>
          </div>
        ))}
        {(!data.recentLogs || data.recentLogs.length === 0) && <p style={{ color: '#666', fontSize: '0.85rem' }}>No recent activity</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// USERS (with BL Coins Add/Deduct + Tier Editing)
// ═══════════════════════════════════════════════════════════
function UsersSection({ adminUser, api: a }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  // BL coins modal
  const [blModal, setBlModal] = useState(null);
  const [blAmount, setBlAmount] = useState('');
  const [blReason, setBlReason] = useState('');
  const [blMode, setBlMode] = useState('add'); // 'add' or 'deduct'

  // Subscription modal
  const [subModal, setSubModal] = useState(null);
  const [subForm, setSubForm] = useState({});

  const fetchUsers = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterStatus) params.set('status', filterStatus);
    if (filterPlan) params.set('plan', filterPlan);
    params.set('limit', '100');
    a.get(`/admin/users?${params}`).then(r => { setUsers(r.data.users); setTotal(r.data.total); }).catch(() => {});
  }, [search, filterStatus, filterPlan]);

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
    } catch (err) { alert(err.response?.data?.error || 'Action failed'); }
    setActionLoading('');
  };

  const changeRole = async (userId, role) => {
    try { await a.post(`/admin/users/${userId}/role`, { role }); fetchUsers(); alert('Role updated'); }
    catch (err) { alert(err.response?.data?.error || 'Role change failed'); }
  };

  const changePlan = async (userId, plan) => {
    try { await a.post(`/admin/users/${userId}/subscription`, { plan }); fetchUsers(); alert('Plan updated'); }
    catch (err) { alert(err.response?.data?.error || 'Plan change failed'); }
  };

  // BL Coins adjustment
  const submitBLAdjustment = async () => {
    if (!blModal || !blAmount || !blReason) return;
    const amt = blMode === 'deduct' ? -Math.abs(Number(blAmount)) : Math.abs(Number(blAmount));
    try {
      const { data } = await a.put(`/admin/users/${blModal._id}/bl`, { amount: amt, reason: blReason });
      alert(`BL Coins adjusted! Old: ${data.oldBalance?.toLocaleString()} → New: ${data.newBalance?.toLocaleString()}`);
      setBlModal(null); setBlAmount(''); setBlReason('');
      fetchUsers();
    } catch (err) { alert(err.response?.data?.error || 'BL adjustment failed'); }
  };

  // Subscription modal
  const openSubModal = (user) => {
    setSubModal(user);
    setSubForm({
      plan: user.subscription_tier || user.plan, customPrice: user.customPrice || '', freeForever: user.freeForever || false,
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
      setSubModal(null); fetchUsers(); alert('Subscription updated!');
    } catch (err) { alert(err.response?.data?.error || 'Update failed'); }
  };

  const tierColor = (t) => t === 'diamond' ? '#06b6d4' : t === 'gold' ? '#f59e0b' : t === 'silver' ? '#6366f1' : t === 'bronze' ? '#cd7f32' : '#888';

  return (
    <div>
      <h1 style={s.pageTitle}>User Management <span style={{ fontSize: '0.9rem', color: '#888', fontWeight: 400 }}>({total} total)</span></h1>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search email or name..." style={{ ...s.input, minWidth: 200 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...s.input, maxWidth: 140 }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} style={{ ...s.input, maxWidth: 140 }}>
          <option value="">All Plans</option>
          <option value="free">Free</option>
          <option value="bronze">Bronze</option>
          <option value="silver">Silver</option>
          <option value="gold">Gold</option>
          <option value="diamond">Diamond</option>
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ ...s.table, minWidth: 900 }}>
          <div style={s.tableHeader}>
            <span style={{ flex: 2 }}>User</span>
            <span style={{ flex: 1 }}>Plan</span>
            <span style={{ flex: 1 }}>BL Coins</span>
            <span style={{ flex: 1 }}>Role</span>
            <span style={{ flex: 1 }}>Status</span>
            <span style={{ flex: 1.5 }}>Actions</span>
          </div>
          {users.map(u => (
            <div key={u._id} style={s.tableRow}>
              <span style={{ flex: 2 }}>
                <strong style={{ fontSize: '0.85rem' }}>{u.name}</strong>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>{u.email}</div>
              </span>
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                <select value={u.subscription_tier || u.plan} onChange={e => changePlan(u._id, e.target.value)} style={{ ...s.miniSelect, color: tierColor(u.subscription_tier || u.plan) }}>
                  <option value="free">Free</option><option value="bronze">Bronze</option><option value="silver">Silver</option><option value="gold">Gold</option><option value="diamond">Diamond</option>
                </select>
                <MiniBtn text="⚙" color="#888" onClick={() => openSubModal(u)} title="Advanced subscription" />
              </span>
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '0.8rem', color: '#00e5a0', fontFamily: 'monospace' }}>{(u.bl_coins || 0).toLocaleString()}</span>
                <MiniBtn text="±" color="#a855f7" onClick={() => { setBlModal(u); setBlMode('add'); }} title="Add/Deduct BL Coins" />
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
              <span style={{ flex: 1.5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {u.status === 'active' && <MiniBtn text="Ban" color="#ff4466" onClick={() => doAction('ban', u._id)} loading={actionLoading === 'ban' + u._id} />}
                {u.status === 'active' && <MiniBtn text="Suspend" color="#ffaa00" onClick={() => doAction('suspend', u._id)} loading={actionLoading === 'suspend' + u._id} />}
                {u.status !== 'active' && <MiniBtn text="Unban" color="#00e5a0" onClick={() => doAction('unban', u._id)} loading={actionLoading === 'unban' + u._id} />}
                <MiniBtn text="🚪" color="#888" onClick={() => doAction('force-logout', u._id)} title="Force Logout" />
                {adminUser.isSuperAdmin && <MiniBtn text="🗑️" color="#ff4466" onClick={() => doAction('delete', u._id)} title="Delete" />}
              </span>
            </div>
          ))}
          {users.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>No users found</div>}
        </div>
      </div>

      {/* BL Coins Modal */}
      {blModal && (
        <Modal onClose={() => setBlModal(null)} title="Adjust BL Coins" subtitle={`${blModal.name} (${blModal.email}) — Current: ${(blModal.bl_coins || 0).toLocaleString()} BL`}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button onClick={() => setBlMode('add')} style={{ ...s.btn, flex: 1, background: blMode === 'add' ? '#00e5a0' : '#1a1a2a', color: blMode === 'add' ? '#06060b' : '#888' }}>+ Add</button>
            <button onClick={() => setBlMode('deduct')} style={{ ...s.btn, flex: 1, background: blMode === 'deduct' ? '#ff4466' : '#1a1a2a', color: blMode === 'deduct' ? '#fff' : '#888' }}>- Deduct</button>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={ml}>Amount (BL Coins)</label>
            <input type="number" value={blAmount} onChange={e => setBlAmount(e.target.value)} placeholder="e.g. 50000" style={mi} min="1" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={ml}>Reason (audit log)</label>
            <input value={blReason} onChange={e => setBlReason(e.target.value)} placeholder="Why this adjustment?" style={mi} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={submitBLAdjustment} style={{ flex: 1, padding: '10px 20px', borderRadius: 8, border: 'none', background: blMode === 'add' ? '#00e5a0' : '#ff4466', color: blMode === 'add' ? '#06060b' : '#fff', fontWeight: 700, cursor: 'pointer' }} disabled={!blAmount || !blReason}>
              {blMode === 'add' ? `+ Add ${Number(blAmount || 0).toLocaleString()} BL` : `- Deduct ${Number(blAmount || 0).toLocaleString()} BL`}
            </button>
            <button onClick={() => setBlModal(null)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #2a2a3a', background: 'none', color: '#888', cursor: 'pointer' }}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* Advanced Subscription Modal */}
      {subModal && (
        <Modal onClose={() => setSubModal(null)} title="Manage Subscription" subtitle={`${subModal.name} (${subModal.email})`}>
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
              <input type="number" value={subForm.subscriptionDays} onChange={e => setSubForm({ ...subForm, subscriptionDays: e.target.value })} placeholder="e.g. 30, 365" style={mi} min="1" />
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
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SECURITY
// ═══════════════════════════════════════════════════════════
function SecuritySection({ api: a }) {
  const [flags, setFlags] = useState([]);
  const [total, setTotal] = useState(0);
  const [filterSeverity, setFilterSeverity] = useState('');
  useEffect(() => {
    const params = filterSeverity ? `?severity=${filterSeverity}` : '';
    a.get(`/admin/security${params}`).then(r => { setFlags(r.data.flags); setTotal(r.data.total); }).catch(() => {});
  }, [filterSeverity]);

  const ack = async (id, resolution) => {
    await a.post(`/admin/security/${id}/acknowledge`, { resolution: resolution || 'Reviewed by admin' });
    setFlags(prev => prev.map(f => f._id === id ? { ...f, status: 'acknowledged' } : f));
  };

  return (
    <div>
      <h1 style={s.pageTitle}>Security Monitoring <span style={{ fontSize: '0.9rem', color: '#888', fontWeight: 400 }}>({total} flags)</span></h1>
      <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={{ ...s.input, width: 200, marginBottom: 16 }}>
        <option value="">All Severity</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      {flags.length === 0 ? (
        <div style={{ ...s.card, textAlign: 'center', padding: 60 }}>
          <span style={{ fontSize: '3rem' }}>🛡️</span>
          <p style={{ color: '#888', marginTop: 12 }}>No security flags. All systems nominal.</p>
        </div>
      ) : flags.map(f => (
        <div key={f._id} style={{ ...s.card, marginBottom: 12, borderLeft: `4px solid ${f.severity === 'critical' ? '#ff4466' : f.severity === 'high' ? '#ffaa00' : '#888'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: f.severity === 'critical' ? '#ff4466' : f.severity === 'high' ? '#ffaa00' : '#888' }}>{f.severity}</span>
              <span style={{ fontSize: '0.7rem', color: '#555', marginLeft: 12 }}>{f.type}</span>
            </div>
            <span style={{ fontSize: '0.7rem', color: '#555' }}>{new Date(f.timestamp).toLocaleString()}</span>
          </div>
          <p style={{ fontSize: '0.85rem', marginTop: 8 }}>{f.description}</p>
          {f.ip && <p style={{ fontSize: '0.75rem', color: '#666', marginTop: 4 }}>IP: {f.ip} {f.geoLocation?.city ? `(${f.geoLocation.city}, ${f.geoLocation.country})` : ''}</p>}
          {f.status === 'new' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <MiniBtn text="✓ Acknowledge" color="#00e5a0" onClick={() => ack(f._id)} />
              <MiniBtn text="🚫 False Positive" color="#888" onClick={() => ack(f._id, 'false_positive')} />
            </div>
          )}
          {f.status !== 'new' && <span style={{ fontSize: '0.7rem', color: '#00e5a0', marginTop: 8, display: 'block' }}>✓ {f.status}</span>}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ANALYTICS (ENHANCED)
// ═══════════════════════════════════════════════════════════
function AnalyticsSection({ api: a }) {
  const [data, setData] = useState(null);
  const [visitorData, setVisitorData] = useState(null);
  useEffect(() => {
    a.get('/admin/analytics').then(r => setData(r.data)).catch(() => {});
    a.get('/admin/visitors').then(r => setVisitorData(r.data)).catch(() => {});
  }, []);
  if (!data) return <Loading />;

  return (
    <div>
      <h1 style={s.pageTitle}>Analytics</h1>

      {/* ═══ INTERACTIVE WORLD MAP ═══ */}
      <div style={{ ...s.card, marginBottom: 20 }}>
        <h3 style={s.cardTitle}>🌍 Global Visitor Map</h3>
        <VisitorWorldMap
          visitorData={visitorData?.byCountry || data?.visitorData?.byCountry || []}
          style={{ marginTop: 12 }}
        />
        {visitorData && (
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: '0.8rem', color: '#888', flexWrap: 'wrap' }}>
            <span>Total visitors: <strong style={{ color: '#e8e8f0' }}>{visitorData.total?.toLocaleString() || 0}</strong></span>
            <span>Registered: <strong style={{ color: '#00e5a0' }}>{visitorData.byCountry?.reduce((s, c) => s + c.count, 0) || 0}</strong></span>
            <span>Countries: <strong style={{ color: '#6366f1' }}>{visitorData.byCountry?.length || 0}</strong></span>
          </div>
        )}
      </div>

      <div style={s.cardGrid}>
        <div style={s.card}>
          <h3 style={s.cardTitle}>Signups (Last 30 Days)</h3>
          {data.dailySignups?.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, padding: '16px 0' }}>
              {data.dailySignups.map((d, i) => {
                const maxCount = Math.max(...data.dailySignups.map(x => x.count), 1);
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ background: '#00e5a0', width: '100%', maxWidth: 20, height: Math.max(4, (d.count / maxCount) * 100), borderRadius: 3, transition: '0.2s' }} title={`${d._id}: ${d.count}`} />
                  </div>
                );
              })}
            </div>
          ) : <p style={{ color: '#666' }}>No signups in last 30 days</p>}
        </div>

        <div style={s.card}>
          <h3 style={s.cardTitle}>Plan Distribution</h3>
          {data.planDistribution?.map(p => (
            <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1a2a' }}>
              <span style={{ textTransform: 'capitalize' }}>{p._id || 'unknown'}</span>
              <strong>{p.count}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Registrations */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>Recent Registrations (with details)</h3>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {data.recentRegistrations?.map((u, i) => (
            <div key={u._id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1a2a', fontSize: '0.85rem', flexWrap: 'wrap', gap: 8 }}>
              <span><strong>{u.name}</strong> <span style={{ color: '#888' }}>({u.email})</span></span>
              <span style={{ display: 'flex', gap: 12, fontSize: '0.75rem', color: '#888' }}>
                <span style={{ textTransform: 'capitalize', color: u.subscription_tier === 'free' ? '#888' : '#00e5a0' }}>{u.subscription_tier}</span>
                {u.referred_by && <span style={{ color: '#a855f7' }}>ref: {u.referred_by}</span>}
                <span>{new Date(u.createdAt).toLocaleString()}</span>
              </span>
            </div>
          ))}
          {(!data.recentRegistrations || data.recentRegistrations.length === 0) && <p style={{ color: '#666' }}>No recent registrations</p>}
        </div>
      </div>

      {/* Top Users */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>Top Users (by BL Coins)</h3>
        {data.topUsers?.map((u, i) => (
          <div key={u._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1a2a', fontSize: '0.85rem' }}>
            <span>#{i + 1} {u.name} ({u.email})</span>
            <span><strong style={{ color: '#00e5a0' }}>{(u.bl_coins || 0).toLocaleString()}</strong> BL  |  Referrals: {u.referral_count || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FINANCES (Fixed 5-tier pricing)
// ═══════════════════════════════════════════════════════════
function FinancesSection({ api: a }) {
  const [data, setData] = useState(null);
  useEffect(() => { a.get('/admin/dashboard').then(r => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <Loading />;

  const costs = { render: 7, domain: 1, groqApi: 5, geminiApi: 15, anthropicApi: 20, resendEmail: 3 };
  const totalCosts = Object.values(costs).reduce((a, b) => a + b, 0);
  const revenue = parseFloat(data.revenue.monthly) || 0;
  const profit = revenue - totalCosts;

  return (
    <div>
      <h1 style={s.pageTitle}>Financial Dashboard</h1>
      <div style={s.statGrid}>
        <StatCard label="Monthly Revenue" value={`$${revenue.toFixed(2)}`} icon="💰" color="#00e5a0" />
        <StatCard label="Bronze Income" value={`$${data.revenue.bronze}`} icon="🥉" color="#cd7f32" />
        <StatCard label="Silver Income" value={`$${data.revenue.silver}`} icon="🥈" color="#6366f1" />
        <StatCard label="Gold Income" value={`$${data.revenue.gold}`} icon="🥇" color="#f59e0b" />
        <StatCard label="Diamond Income" value={`$${data.revenue.diamond}`} icon="💎" color="#06b6d4" />
        <StatCard label="Est. Monthly Costs" value={`$${totalCosts}`} icon="📉" color="#ffaa00" />
        <StatCard label="Est. Monthly Profit" value={`$${profit.toFixed(2)}`} icon={profit >= 0 ? '📈' : '📉'} color={profit >= 0 ? '#00e5a0' : '#ff4466'} />
        <StatCard label="Annual Projection" value={`$${(revenue * 12).toFixed(2)}`} icon="🎯" color="#00e5a0" />
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
      <div style={s.card}>
        <h3 style={s.cardTitle}>Revenue per Tier</h3>
        <div style={s.settingRow}><span>Bronze ({data.plans.bronze} users × $4.99):</span> <strong>${data.revenue.bronze}</strong></div>
        <div style={s.settingRow}><span>Silver ({data.plans.silver} users × $14.99):</span> <strong>${data.revenue.silver}</strong></div>
        <div style={s.settingRow}><span>Gold ({data.plans.gold} users × $39.99):</span> <strong>${data.revenue.gold}</strong></div>
        <div style={s.settingRow}><span>Diamond ({data.plans.diamond} users × $99.99):</span> <strong>${data.revenue.diamond}</strong></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PROMO CODES (NEW)
// ═══════════════════════════════════════════════════════════
function PromosSection({ api: a }) {
  const [promos, setPromos] = useState([]);
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    code: '', description: '', discountType: 'percentage', discountValue: '',
    tierUpgradeTo: '', durationDays: '30', expiresAt: '', maxUses: '0',
    applicableTiers: [], specificUsers: '',
  });

  const fetchPromos = () => {
    a.get('/admin/promos').then(r => { setPromos(r.data.promos); setTotal(r.data.total); }).catch(() => {});
  };
  useEffect(() => { fetchPromos(); }, []);

  const createPromo = async () => {
    if (!form.code || !form.discountValue || !form.expiresAt) return alert('Code, value, and expiry date are required');
    try {
      await a.post('/admin/promos', {
        ...form,
        discountValue: Number(form.discountValue),
        durationDays: Number(form.durationDays) || 30,
        maxUses: Number(form.maxUses) || 0,
        applicableTiers: form.applicableTiers,
        specificUsers: form.specificUsers ? form.specificUsers.split(',').map(e => e.trim()) : [],
        tierUpgradeTo: form.tierUpgradeTo || null,
      });
      setShowCreate(false);
      setForm({ code: '', description: '', discountType: 'percentage', discountValue: '', tierUpgradeTo: '', durationDays: '30', expiresAt: '', maxUses: '0', applicableTiers: [], specificUsers: '' });
      fetchPromos();
      alert('Promo code created!');
    } catch (err) { alert(err.response?.data?.error || 'Create failed'); }
  };

  const toggleActive = async (promo) => {
    try {
      await a.put(`/admin/promos/${promo._id}`, { isActive: !promo.isActive });
      fetchPromos();
    } catch (err) { alert('Update failed'); }
  };

  const deletePromo = async (promo) => {
    if (!window.confirm(`Delete promo code ${promo.code}?`)) return;
    try { await a.delete(`/admin/promos/${promo._id}`); fetchPromos(); }
    catch (err) { alert('Delete failed'); }
  };

  const isExpired = (p) => new Date(p.expiresAt) < new Date();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ ...s.pageTitle, marginBottom: 0 }}>Promo Codes <span style={{ fontSize: '0.9rem', color: '#888', fontWeight: 400 }}>({total})</span></h1>
        <button onClick={() => setShowCreate(!showCreate)} style={{ ...s.btn, background: '#00e5a0', color: '#06060b' }}>+ Create Promo Code</button>
      </div>

      {showCreate && (
        <div style={{ ...s.card, marginBottom: 20 }}>
          <h3 style={s.cardTitle}>New Promo Code</h3>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label style={ml}>Code</label>
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. WELCOME50" style={mi} />
            </div>
            <div>
              <label style={ml}>Description</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What is this promo for?" style={mi} />
            </div>
            <div>
              <label style={ml}>Discount Type</label>
              <select value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value })} style={mi}>
                <option value="percentage">Percentage Off</option>
                <option value="fixed">Fixed Amount ($)</option>
                <option value="bl_coins">BL Coins Grant</option>
                <option value="tier_upgrade">Tier Upgrade</option>
              </select>
            </div>
            <div>
              <label style={ml}>{form.discountType === 'percentage' ? 'Discount (%)' : form.discountType === 'bl_coins' ? 'BL Coins Amount' : form.discountType === 'tier_upgrade' ? 'Duration Days' : 'Amount ($)'}</label>
              <input type="number" value={form.discountValue} onChange={e => setForm({ ...form, discountValue: e.target.value })} placeholder="e.g. 50" style={mi} />
            </div>
            {form.discountType === 'tier_upgrade' && (
              <div>
                <label style={ml}>Upgrade To Tier</label>
                <select value={form.tierUpgradeTo} onChange={e => setForm({ ...form, tierUpgradeTo: e.target.value })} style={mi}>
                  <option value="">Select tier</option>
                  <option value="bronze">Bronze</option><option value="silver">Silver</option><option value="gold">Gold</option><option value="diamond">Diamond</option>
                </select>
              </div>
            )}
            <div>
              <label style={ml}>Duration (days)</label>
              <input type="number" value={form.durationDays} onChange={e => setForm({ ...form, durationDays: e.target.value })} style={mi} />
            </div>
            <div>
              <label style={ml}>Expires At</label>
              <input type="datetime-local" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} style={mi} />
            </div>
            <div>
              <label style={ml}>Max Uses (0 = unlimited)</label>
              <input type="number" value={form.maxUses} onChange={e => setForm({ ...form, maxUses: e.target.value })} style={mi} min="0" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={ml}>Specific Users (comma-separated emails, blank = all)</label>
              <input value={form.specificUsers} onChange={e => setForm({ ...form, specificUsers: e.target.value })} placeholder="user1@email.com, user2@email.com" style={mi} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={createPromo} style={{ flex: 1, padding: '10px 20px', borderRadius: 8, border: 'none', background: '#00e5a0', color: '#06060b', fontWeight: 700, cursor: 'pointer' }}>Create Promo Code</button>
            <button onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #2a2a3a', background: 'none', color: '#888', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {promos.length === 0 ? (
        <div style={{ ...s.card, textAlign: 'center', padding: 60 }}>
          <span style={{ fontSize: '3rem' }}>🎟️</span>
          <p style={{ color: '#888', marginTop: 12 }}>No promo codes yet. Create one to get started.</p>
        </div>
      ) : promos.map(p => (
        <div key={p._id} style={{ ...s.card, marginBottom: 12, opacity: (!p.isActive || isExpired(p)) ? 0.6 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: '#00e5a0', letterSpacing: 2 }}>{p.code}</span>
              {p.description && <p style={{ fontSize: '0.8rem', color: '#888', marginTop: 4 }}>{p.description}</p>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 100, background: p.isActive && !isExpired(p) ? 'rgba(0,229,160,0.1)' : 'rgba(255,68,102,0.1)', color: p.isActive && !isExpired(p) ? '#00e5a0' : '#ff4466' }}>
                {isExpired(p) ? 'Expired' : p.isActive ? 'Active' : 'Inactive'}
              </span>
              <MiniBtn text={p.isActive ? 'Deactivate' : 'Activate'} color={p.isActive ? '#ffaa00' : '#00e5a0'} onClick={() => toggleActive(p)} />
              <MiniBtn text="🗑️" color="#ff4466" onClick={() => deletePromo(p)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: '0.8rem', color: '#888', flexWrap: 'wrap' }}>
            <span>Type: <strong style={{ color: '#e8e8f0' }}>{p.discountType === 'percentage' ? `${p.discountValue}% off` : p.discountType === 'fixed' ? `$${p.discountValue} off` : p.discountType === 'bl_coins' ? `${p.discountValue.toLocaleString()} BL coins` : `Upgrade to ${p.tierUpgradeTo}`}</strong></span>
            <span>Duration: <strong style={{ color: '#e8e8f0' }}>{p.durationDays} days</strong></span>
            <span>Used: <strong style={{ color: '#e8e8f0' }}>{p.usedCount}{p.maxUses > 0 ? `/${p.maxUses}` : '/∞'}</strong></span>
            <span>Expires: <strong style={{ color: isExpired(p) ? '#ff4466' : '#e8e8f0' }}>{new Date(p.expiresAt).toLocaleDateString()}</strong></span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// REFERRALS (NEW)
// ═══════════════════════════════════════════════════════════
function ReferralsSection({ api: a }) {
  const [data, setData] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [treeData, setTreeData] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);

  useEffect(() => { a.get('/admin/referrals').then(r => setData(r.data)).catch(() => {}); }, []);

  const viewTree = async (user) => {
    setSelectedUser(user);
    setTreeLoading(true);
    try {
      const { data } = await a.get(`/admin/users/${user._id}`);
      // Use the referralTree endpoint via admin API
      const treeRes = await a.get(`/admin/users/${user._id}`);
      // Build tree from direct downlines
      const downlines = treeRes.data.directDownlines || [];
      setTreeData({ user: treeRes.data.user, downlines, stats: { l1: downlines.length } });
    } catch (e) { console.error('Tree load failed'); }
    finally { setTreeLoading(false); }
  };

  const loadL2Children = async (referralCode) => {
    try {
      const { data } = await a.get(`/admin/referrals`); // reuse existing endpoint
      return (data.referredUsers || []).filter(u => u.referred_by === referralCode);
    } catch { return []; }
  };

  if (!data) return <Loading />;

  const TIER_COLORS_MAP = { free: '#888', bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' };
  const TIER_COMM = { free: { l1: 2, l2: 1 }, bronze: { l1: 3, l2: 2 }, silver: { l1: 3, l2: 2 }, gold: { l1: 3, l2: 2 }, diamond: { l1: 4, l2: 3 } };

  return (
    <div>
      <h1 style={s.pageTitle}>Referral Management</h1>

      <div style={s.statGrid}>
        <StatCard label="Total Referrals" value={data.stats?.total || 0} icon="🔗" color="#a855f7" />
        <StatCard label="Total Bonuses Paid" value={`${(data.stats?.totalBonuses || 0).toLocaleString()} BL`} icon="💰" color="#00e5a0" />
        <StatCard label="Top Referrers" value={data.topReferrers?.length || 0} icon="🏆" color="#f59e0b" />
      </div>

      {/* ═══ TOP REFERRERS with View Tree button ═══ */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>Top Referrers — Leaderboard & Genealogy</h3>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {data.topReferrers?.map((u, i) => {
            const tier = u.subscription_tier || 'free';
            const comm = TIER_COMM[tier] || TIER_COMM.free;
            return (
              <div key={u._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1a1a2a', fontSize: '0.85rem', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: i < 3 ? '#f59e0b' : '#2a2a3a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: i < 3 ? '#06060b' : '#888', flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <div>
                    <strong>{u.name}</strong> <span style={{ color: '#888', fontSize: '0.8rem' }}>({u.email})</span>
                    <div style={{ fontSize: '0.7rem', color: '#666', marginTop: 2 }}>
                      <span style={{ padding: '1px 6px', borderRadius: 6, background: TIER_COLORS_MAP[tier], color: tier === 'free' ? '#fff' : '#000', fontWeight: 700, fontSize: '0.65rem', marginRight: 6 }}>{tier.toUpperCase()}</span>
                      L1: {comm.l1}% · L2: {comm.l2}% · Code: <span style={{ color: '#a855f7', fontWeight: 600 }}>{u.referral_code}</span>
                    </div>
                  </div>
                </span>
                <span style={{ display: 'flex', gap: 10, fontSize: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>Direct: <strong style={{ color: '#00e5a0' }}>{u.direct_referrals || u.referral_count || 0}</strong></span>
                  <span>Indirect: <strong style={{ color: '#6366f1' }}>{u.indirect_referrals || 0}</strong></span>
                  <span>Bonuses: <strong style={{ color: '#f59e0b' }}>{(u.referral_bonuses_paid || 0).toLocaleString()} BL</strong></span>
                  <button onClick={() => viewTree(u)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #a855f733', background: 'none', color: '#a855f7', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                    🌳 View Tree
                  </button>
                </span>
              </div>
            );
          })}
          {(!data.topReferrers || data.topReferrers.length === 0) && <p style={{ color: '#666' }}>No referrers yet</p>}
        </div>
      </div>

      {/* ═══ GENEALOGY TREE MODAL ═══ */}
      {selectedUser && (
        <div style={{ ...s.card, marginBottom: 16, border: '1px solid rgba(168,85,247,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ ...s.cardTitle, marginBottom: 0, color: '#a855f7' }}>
              🌳 Genealogy Tree — {selectedUser.name}
            </h3>
            <button onClick={() => { setSelectedUser(null); setTreeData(null); }} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #2a2a3a', background: 'none', color: '#888', cursor: 'pointer', fontSize: '0.75rem' }}>✕ Close</button>
          </div>

          {treeLoading ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>Loading genealogy tree...</div>
          ) : treeData ? (
            <div>
              {/* Root user card */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 16 }}>
                  {selectedUser.name?.[0] || '?'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{selectedUser.name} <span style={{ color: '#888', fontWeight: 400 }}>({selectedUser.email})</span></div>
                  <div style={{ fontSize: '0.75rem', color: '#888' }}>
                    Code: <span style={{ color: '#a855f7' }}>{selectedUser.referral_code}</span> · {treeData.downlines?.length || 0} direct referrals
                  </div>
                </div>
              </div>

              {/* Tree nodes */}
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {treeData.downlines?.length > 0 ? treeData.downlines.map((node, i) => (
                  <AdminTreeNode key={node._id} node={node} api={a} depth={0} isLast={i === treeData.downlines.length - 1} />
                )) : (
                  <div style={{ padding: 30, textAlign: 'center', color: '#666' }}>
                    <span style={{ fontSize: 30, display: 'block', marginBottom: 8 }}>🌱</span>
                    No referrals yet for this user.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ═══ ALL REFERRED USERS ═══ */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>All Referred Users</h3>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {data.referredUsers?.map((u, i) => (
            <div key={u._id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1a2a', fontSize: '0.85rem', flexWrap: 'wrap', gap: 4 }}>
              <span><strong>{u.name}</strong> <span style={{ color: '#888' }}>({u.email})</span></span>
              <span style={{ display: 'flex', gap: 12, fontSize: '0.8rem', color: '#888' }}>
                <span>Referred by: <strong style={{ color: '#a855f7' }}>{u.referred_by}</strong></span>
                <span style={{ textTransform: 'capitalize' }}>{u.subscription_tier}</span>
                <span>{new Date(u.createdAt).toLocaleDateString()}</span>
              </span>
            </div>
          ))}
          {(!data.referredUsers || data.referredUsers.length === 0) && <p style={{ color: '#666' }}>No referred users yet</p>}
        </div>
      </div>
    </div>
  );
}

// Admin Tree Node with lazy-loading children
function AdminTreeNode({ node, api: a, depth, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [childCount, setChildCount] = useState(0);

  const tierColor = { free: '#888', bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' }[node.subscription_tier || 'free'] || '#888';

  useEffect(() => {
    // Check if this user has referrals
    if (node.referral_code) {
      a.get(`/admin/users?search=${encodeURIComponent(node.referral_code)}&limit=0`).catch(() => {});
    }
  }, []);

  const toggle = async () => {
    if (expanded) { setExpanded(false); return; }
    if (children.length > 0) { setExpanded(true); return; }
    if (!node.referral_code) return;
    setLoading(true);
    try {
      // Fetch users referred by this node
      const { data } = await a.get(`/admin/users?limit=100`);
      const myDownlines = (data.users || []).filter(u => u.referred_by === node.referral_code);
      setChildren(myDownlines);
      setChildCount(myDownlines.length);
      setExpanded(true);
    } catch (e) { console.error('Failed to load children'); }
    finally { setLoading(false); }
  };

  const indent = depth * 28;

  return (
    <div>
      <div style={{ marginLeft: indent, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, marginBottom: 2, transition: 'background .15s' }}>
        {/* Tree connector lines */}
        <span style={{ color: '#2a2a3a', fontSize: 12, width: 16, textAlign: 'center', flexShrink: 0 }}>
          {isLast ? '└' : '├'}
        </span>
        {/* Expand button */}
        {node.referral_code ? (
          <button onClick={toggle} style={{ width: 20, height: 20, borderRadius: 4, border: 'none', background: '#1a1a2a', color: '#888', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {loading ? '⏳' : expanded ? '▼' : '▶'}
          </button>
        ) : (
          <span style={{ width: 20, textAlign: 'center', color: '#333', fontSize: 8 }}>●</span>
        )}
        {/* Tier dot */}
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: tierColor, flexShrink: 0 }} />
        {/* User info */}
        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{node.name}</span>
        <span style={{ fontSize: '0.7rem', color: '#666' }}>{node.email}</span>
        <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 6, background: tierColor, color: (node.subscription_tier === 'free') ? '#fff' : '#000', fontWeight: 700, marginLeft: 4 }}>
          {(node.subscription_tier || 'free').toUpperCase()}
        </span>
        <span style={{ fontSize: '0.7rem', color: '#555', marginLeft: 'auto' }}>
          {new Date(node.createdAt).toLocaleDateString()}
        </span>
        {childCount > 0 && <span style={{ fontSize: '0.65rem', color: '#a855f7' }}>({childCount})</span>}
      </div>
      {expanded && children.map((child, i) => (
        <AdminTreeNode key={child._id} node={child} api={a} depth={depth + 1} isLast={i === children.length - 1} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AI CHATBOX
// ═══════════════════════════════════════════════════════════
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
    try { const { data } = await a.post('/admin/2fa/setup'); setSetupData(data); setShowSetup(true); }
    catch (err) { alert(err.response?.data?.error || '2FA setup failed'); }
  };

  const verify2FA = async () => {
    try {
      const { data } = await a.post('/admin/2fa/verify', { code: codeInput });
      setTwoFAToken(data.twoFAToken);
      setMessages(prev => [...prev, { role: 'system', text: '✅ 2FA verified. AI commands unlocked. Session expires after 5 min inactivity.' }]);
      setShowSetup(false); setCodeInput('');
    } catch (err) { alert(err.response?.data?.error || 'Invalid code'); }
  };

  const sendCommand = async () => {
    if (!input.trim() || !twoFAToken) return;
    const cmd = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: cmd }]);
    setLoading(true);
    try {
      const { data } = await a.post('/admin/ai/command', { command: cmd }, { headers: { 'x-2fa-token': twoFAToken } });
      setMessages(prev => [...prev, { role: 'ai', text: data.message }]);
      if (data.twoFAToken) setTwoFAToken(data.twoFAToken);
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
      <h1 style={s.pageTitle}>🤖 AI Command Center</h1>
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
          {loading && <div style={{ ...s.chatMsg, ...s.chatSystem }}>Processing...</div>}
        </div>
        <div style={s.chatInput}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder={twoFAToken ? 'Enter command for ZapCodes AI...' : '2FA required'} style={s.input} disabled={!twoFAToken || loading} onKeyDown={e => e.key === 'Enter' && sendCommand()} />
          <button onClick={sendCommand} style={{ ...s.btn, background: '#00e5a0', color: '#06060b' }} disabled={!twoFAToken || loading || !input.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════════════════════
function LogsSection({ api: a }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    const params = filter ? `?action=${filter}` : '';
    a.get(`/admin/logs${params}`).then(r => { setLogs(r.data.logs); setTotal(r.data.total); }).catch(() => {});
  }, [filter]);

  const actions = ['role_change', 'user_ban', 'user_suspend', 'user_unban', 'user_delete', 'ai_command', 'ai_action', '2fa_verify', 'price_override', 'bl_adjustment', 'tier_change', 'promo_create', 'promo_delete'];

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
      {logs.length === 0 && <div style={{ ...s.card, textAlign: 'center', padding: 40, color: '#666' }}>No logs found</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════
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
        <div style={s.settingRow}><span>AI Engine:</span> <strong>Multi-Model (Gemini, Groq, Anthropic)</strong></div>
        <div style={s.settingRow}><span>Payments:</span> <strong>Stripe</strong></div>
        <div style={s.settingRow}><span>Hosting:</span> <strong>Render (API) + Cloudflare Pages (Web)</strong></div>
        <div style={s.settingRow}><span>Database:</span> <strong>MongoDB Atlas (shared with BlendLink)</strong></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════
function Loading() { return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>; }

function Modal({ onClose, title, subtitle, children }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={onClose}>
      <div style={{ background: '#11111b', border: '1px solid #2a2a3a', borderRadius: 16, padding: 28, maxWidth: 520, width: '90%', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: 20 }}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

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

// ═══ Form styles ═══
const ml = { fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 4, display: 'block', letterSpacing: 0.5 };
const mi = { width: '100%', background: '#0a0a14', border: '1px solid #2a2a3a', borderRadius: 6, padding: '8px 12px', color: '#e8e8f0', fontSize: '0.85rem', boxSizing: 'border-box' };

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const s = {
  layout: { display: 'flex', minHeight: '100vh', background: '#06060b', color: '#e8e8f0' },
  mobileBar: {
    display: 'none', /* shown on mobile via CSS */
    position: 'fixed', top: 0, left: 0, right: 0, height: 48, zIndex: 60,
    background: '#0a0a14', borderBottom: '1px solid #1a1a2a',
    padding: '0 16px', alignItems: 'center', justifyContent: 'space-between',
  },
  hamburgerBtn: {
    width: 36, height: 36, borderRadius: 8, border: '1px solid #2a2a3a',
    background: '#11111b', color: '#e8e8f0', cursor: 'pointer',
    fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 70,
  },
  sidebarOverlay: {
    display: 'none', /* shown on mobile via CSS */
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)', zIndex: 55,
  },
  sidebar: { width: 220, background: '#0a0a14', borderRight: '1px solid #1a1a2a', display: 'flex', flexDirection: 'column', padding: 16, position: 'fixed', top: 0, bottom: 0, overflowY: 'auto', zIndex: 60 },
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

// ═══ Responsive CSS for Admin page ═══
if (typeof document !== 'undefined') {
  const existing = document.getElementById('zc-admin-responsive');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'zc-admin-responsive';
    style.textContent = `
      /* Desktop: show sidebar, hide mobile bar */
      @media (min-width: 769px) {
        [data-admin-mobile-bar] { display: none !important; }
        [data-admin-overlay] { display: none !important; }
        [data-admin-sidebar] { display: flex !important; left: 0 !important; }
        [data-admin-main] { margin-left: 220px !important; }
      }

      /* Mobile: hide sidebar by default, show mobile bar */
      @media (max-width: 768px) {
        [data-admin-mobile-bar] { display: flex !important; }
        [data-admin-sidebar] {
          position: fixed !important; top: 0 !important; bottom: 0 !important;
          left: -260px !important; width: 240px !important;
          transition: left 0.25s ease !important; z-index: 65 !important;
          box-shadow: 4px 0 24px rgba(0,0,0,0.5) !important;
        }
        [data-admin-sidebar].admin-sidebar-open {
          left: 0 !important;
        }
        [data-admin-sidebar].admin-sidebar-closed {
          left: -260px !important;
        }
        [data-admin-overlay] { display: block !important; }
        .admin-sidebar-closed ~ [data-admin-overlay] { display: none !important; }
        [data-admin-main] {
          margin-left: 0 !important;
          padding: 64px 16px 24px 16px !important;
        }

        /* Move HelpAI question mark button so it doesn't block hamburger */
        .help-ai-trigger, [class*="helpAI"], [class*="help-float"],
        div[style*="position: fixed"][style*="bottom:"][style*="right:"] > button:first-child,
        div[style*="position:fixed"][style*="bottom"][style*="right"] {
          right: auto !important;
          left: 16px !important;
          bottom: 16px !important;
          z-index: 40 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
