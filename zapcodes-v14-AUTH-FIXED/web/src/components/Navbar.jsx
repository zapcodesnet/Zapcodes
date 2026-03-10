import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const TIER_COLORS = { free: '#888', bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' };

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/build', label: 'Build Project', icon: '🏗️' },
  { path: '/repair', label: 'Repair Code', icon: '🔧' },
  { path: '/projects', label: 'My Projects', icon: '📁' },
  { path: '/pricing', label: 'Pricing', icon: '💎' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

function formatBL(n) {
  if (n == null) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.floor(n / 1000)}K`;
  return n.toLocaleString();
}

function formatCountdown(seconds) {
  if (seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const hidePaths = ['/', '/login', '/register', '/auth/callback', '/privacy', '/terms'];

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [blBalance, setBlBalance] = useState(null);
  const [canClaim, setCanClaim] = useState(false);
  const [claimCountdown, setClaimCountdown] = useState(0);
  const [claiming, setClaiming] = useState(false);

  // ALL hooks MUST be above any return statement — React Rules of Hooks
  useEffect(() => {
    if (!user) return;
    const fetchBalance = async () => {
      try {
        try {
          const { data } = await api.get('/api/bl-coins/status');
          setBlBalance(data.bl_coins);
          setCanClaim(data.can_claim);
          setClaimCountdown(data.seconds_remaining || 0);
        } catch {
          const { data } = await api.get('/api/coins/balance');
          setBlBalance(data.balance);
          setCanClaim(data.canClaim);
          setClaimCountdown(data.nextClaimIn || 0);
        }
      } catch {}
    };
    fetchBalance();
    const interval = setInterval(fetchBalance, 60000);
    return () => clearInterval(interval);
  }, [user, location.pathname]);

  useEffect(() => {
    if (claimCountdown <= 0) return;
    const timer = setInterval(() => {
      setClaimCountdown(c => {
        const next = c - 1;
        if (next <= 0) setCanClaim(true);
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [claimCountdown]);

  // Early return AFTER all hooks
  if (!user || hidePaths.includes(location.pathname)) return null;

  const plan = user?.subscription_tier || user?.plan || 'free';
  const tierColor = TIER_COLORS[plan] || '#888';
  const displayBalance = blBalance ?? user?.bl_coins ?? user?.blCoins ?? 0;

  const handleClaim = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canClaim || claiming) return;
    setClaiming(true);
    try {
      let data;
      try {
        const res = await api.post('/api/bl-coins/daily-claim');
        data = res.data;
      } catch {
        const res = await api.post('/api/coins/claim');
        data = res.data;
      }
      setBlBalance(data.new_balance || data.balance);
      setCanClaim(false);
      setClaimCountdown(data.seconds_remaining || data.nextClaimIn || 86400);
    } catch {}
    setClaiming(false);
  };

  return (
    <>
      <nav style={s.nav}>
        <div style={s.inner}>
          <Link to="/dashboard" style={s.logo}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <span style={s.logoText}>ZapCodes</span>
          </Link>

          <div style={s.links} data-nav-links="true">
            {navItems.map(item => (
              <Link key={item.path} to={item.path} style={{ ...s.link, ...(location.pathname === item.path ? s.linkActive : {}) }}>
                <span style={{ fontSize: 13 }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          <div style={s.right} data-nav-right="true">
            <Link to="/dashboard" style={s.blCoinBox} title="BL Coin Balance">
              <span style={{ fontSize: 13 }}>🪙</span>
              <span style={s.blAmount}>{formatBL(displayBalance)}</span>
            </Link>

            {canClaim ? (
              <button style={s.claimBtnReady} onClick={handleClaim} disabled={claiming} title="Claim your daily BL coins!">
                {claiming ? '⏳' : '🎁 Claim'}
              </button>
            ) : claimCountdown > 0 ? (
              <span style={s.claimTimer} title="Next daily claim">⏰ {formatCountdown(claimCountdown)}</span>
            ) : null}

            <span style={{ ...s.planBadge, background: tierColor, color: (plan === 'gold' || plan === 'diamond' || plan === 'bronze') ? '#000' : '#fff' }}>
              {plan.toUpperCase()}
            </span>

            <button style={s.logoutBtn} onClick={() => { logout(); navigate('/'); }}>Sign Out</button>
          </div>

          <button style={s.hamburger} data-nav-hamburger="true" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>

        {mobileOpen && (
          <div style={s.mobileMenu}>
            <div style={s.mobileBLRow}>
              <div style={s.mobileBLBox}>
                <span>🪙</span>
                <span style={{ fontWeight: 800, color: '#f59e0b' }}>{formatBL(displayBalance)} BL</span>
                <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: tierColor, color: (plan === 'gold' || plan === 'diamond' || plan === 'bronze') ? '#000' : '#fff' }}>
                  {plan.toUpperCase()}
                </span>
              </div>
              {canClaim && (
                <button style={s.mobileClaimBtn} onClick={handleClaim} disabled={claiming}>
                  {claiming ? '⏳' : '🎁 Claim Daily BL'}
                </button>
              )}
              {!canClaim && claimCountdown > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>
                  Next claim in {formatCountdown(claimCountdown)}
                </div>
              )}
            </div>

            {navItems.map(item => (
              <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)} style={{ ...s.mobileLink, ...(location.pathname === item.path ? s.mobileLinkActive : {}) }}>
                <span>{item.icon}</span> {item.label}
              </Link>
            ))}
            <button style={s.mobileLogout} onClick={() => { logout(); navigate('/'); setMobileOpen(false); }}>Sign Out</button>
          </div>
        )}
      </nav>
      <div style={{ height: 52 }} />
    </>
  );
}

const s = {
  nav: { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'var(--bg-card, #111)', borderBottom: '1px solid var(--border, #222)', backdropFilter: 'blur(12px)' },
  inner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 52, maxWidth: 1400, margin: '0 auto' },
  logo: { display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'var(--text-primary, #fff)' },
  logoText: { fontWeight: 800, fontSize: 16 },
  links: { display: 'flex', gap: 2, alignItems: 'center' },
  link: { display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary, #999)', textDecoration: 'none', transition: 'all .15s', whiteSpace: 'nowrap' },
  linkActive: { background: 'rgba(99,102,241,.12)', color: '#6366f1', fontWeight: 700 },
  right: { display: 'flex', alignItems: 'center', gap: 8 },
  blCoinBox: { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 10, background: 'rgba(245,158,11,.1)', textDecoration: 'none', transition: 'all .2s', cursor: 'pointer' },
  blAmount: { fontSize: 13, fontWeight: 800, color: '#f59e0b' },
  claimBtnReady: { padding: '4px 10px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, transition: 'all .2s' },
  claimTimer: { fontSize: 11, color: 'var(--text-muted, #666)', fontWeight: 600, padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' },
  planBadge: { padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 800, letterSpacing: '.5px' },
  logoutBtn: { padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border, #333)', background: 'transparent', color: 'var(--text-secondary, #888)', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  hamburger: { display: 'none', background: 'transparent', border: 'none', color: 'var(--text-primary, #fff)', fontSize: 22, cursor: 'pointer', padding: 4 },
  mobileMenu: { padding: '8px 16px 16px', borderTop: '1px solid var(--border, #222)', background: 'var(--bg-card, #111)' },
  mobileBLRow: { padding: '10px 12px', marginBottom: 8, borderRadius: 10, background: 'var(--bg-elevated, #1a1a2e)', border: '1px solid rgba(245,158,11,0.15)' },
  mobileBLBox: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 6 },
  mobileClaimBtn: { width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 },
  mobileLink: { display: 'block', padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500, color: 'var(--text-secondary, #999)', textDecoration: 'none', transition: 'all .15s' },
  mobileLinkActive: { background: 'rgba(99,102,241,.12)', color: '#6366f1', fontWeight: 700 },
  mobileLogout: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border, #333)', background: 'transparent', color: 'var(--text-secondary, #888)', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginTop: 8, textAlign: 'left' },
};

if (typeof document !== 'undefined') {
  const styleEl = document.getElementById('navbar-responsive') || document.createElement('style');
  styleEl.id = 'navbar-responsive';
  styleEl.textContent = `
    @media (max-width: 900px) {
      [data-nav-links] { display: none !important; }
      [data-nav-right] { display: none !important; }
      [data-nav-hamburger] { display: block !important; }
    }
  `;
  if (!document.getElementById('navbar-responsive')) document.head.appendChild(styleEl);
}
