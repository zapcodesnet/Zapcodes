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
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return Math.floor(n / 1000) + 'K';
  return n.toLocaleString();
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activePromo, setActivePromo] = useState(null);

  // Fetch active promo for banner
  useEffect(() => {
    api.get('/api/pricing/active-promo')
      .then(({ data }) => { if (data.promo) setActivePromo(data.promo); })
      .catch(() => {});
  }, []);

  // Don't show navbar on landing, login, register
  const hidePaths = ['/', '/login', '/register', '/auth/callback', '/privacy', '/terms'];
  if (!user || hidePaths.includes(location.pathname)) return null;

  const plan = user.subscription_tier || user.plan || 'free';
  const tierColor = TIER_COLORS[plan] || '#888';
  const balance = user.bl_coins || user.blCoins || 0;

  return (
    <>
      <nav style={s.nav}>
        {/* Promo banner — shown on all logged-in pages */}
        {activePromo && (
          <Link to="/pricing" style={s.promoBanner}>
            <span style={s.promoBannerText}>🎉 {activePromo.description || activePromo.discountText} — Code: <strong>{activePromo.code}</strong></span>
            <span style={s.promoBannerCta}>Pricing →</span>
          </Link>
        )}
        <div style={s.inner}>
          {/* Logo */}
          <Link to="/dashboard" style={s.logo}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <span style={s.logoText}>ZapCodes</span>
          </Link>

          {/* Desktop links */}
          <div style={s.links} data-nav-links="true">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  ...s.link,
                  ...(location.pathname === item.path ? s.linkActive : {}),
                }}
              >
                <span style={{ fontSize: 13 }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div style={s.right} data-nav-right="true">
            {/* BL Coin Balance */}
            <Link to="/dashboard" style={s.blCoinBox}>
              <span style={{ fontSize: 13 }}>🪙</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>{formatBL(balance)}</span>
            </Link>

            {/* Tier Badge */}
            <span style={{
              padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 800,
              letterSpacing: '.5px', background: tierColor,
              color: (plan === 'gold' || plan === 'diamond' || plan === 'bronze') ? '#000' : '#fff',
            }}>
              {plan.toUpperCase()}
            </span>

            <button
              style={s.logoutBtn}
              onClick={() => { logout(); navigate('/'); }}
            >
              Sign Out
            </button>
          </div>

          {/* Mobile hamburger */}
          <button style={s.hamburger} data-nav-hamburger="true" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div style={s.mobileMenu}>
            {/* Mobile BL + Tier */}
            <div style={{ padding: '8px 12px', marginBottom: 8, borderRadius: 10, background: 'var(--bg-elevated, #1a1a2e)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <span>🪙</span>
              <span style={{ fontWeight: 800, color: '#f59e0b' }}>{formatBL(balance)} BL</span>
              <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: tierColor, color: (plan === 'gold' || plan === 'diamond' || plan === 'bronze') ? '#000' : '#fff' }}>
                {plan.toUpperCase()}
              </span>
            </div>

            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                style={{
                  ...s.mobileLink,
                  ...(location.pathname === item.path ? s.mobileLinkActive : {}),
                }}
              >
                <span>{item.icon}</span> {item.label}
              </Link>
            ))}
            <button
              style={s.mobileLogout}
              onClick={() => { logout(); navigate('/'); setMobileOpen(false); }}
            >
              Sign Out
            </button>
          </div>
        )}
      </nav>
      {/* Spacer so content isn't hidden behind fixed nav */}
      <div style={{ height: activePromo ? 84 : 52 }} />
    </>
  );
}

const s = {
  promoBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: '6px 16px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    textDecoration: 'none', flexWrap: 'wrap', textAlign: 'center',
  },
  promoBannerText: {
    fontSize: '0.78rem', color: 'rgba(255,255,255,0.9)', fontWeight: 500,
  },
  promoBannerCta: {
    fontSize: '0.72rem', color: '#fff', fontWeight: 700,
    background: 'rgba(255,255,255,0.15)', padding: '2px 10px', borderRadius: 100,
  },
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    background: 'var(--bg-card, #111)', borderBottom: '1px solid var(--border, #222)',
    backdropFilter: 'blur(12px)',
  },
  inner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px', height: 52, maxWidth: 1400, margin: '0 auto',
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 6,
    textDecoration: 'none', color: 'var(--text-primary, #fff)',
  },
  logoText: { fontWeight: 800, fontSize: 16 },
  links: {
    display: 'flex', gap: 2, alignItems: 'center',
  },
  link: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '6px 12px', borderRadius: 8,
    fontSize: 13, fontWeight: 500, color: 'var(--text-secondary, #999)',
    textDecoration: 'none', transition: 'all .15s',
    whiteSpace: 'nowrap',
  },
  linkActive: {
    background: 'rgba(99,102,241,.12)', color: '#6366f1', fontWeight: 700,
  },
  right: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  blCoinBox: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '4px 10px', borderRadius: 10,
    background: 'rgba(245,158,11,.1)', textDecoration: 'none',
  },
  logoutBtn: {
    padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border, #333)',
    background: 'transparent', color: 'var(--text-secondary, #888)', cursor: 'pointer',
    fontSize: 12, fontWeight: 600,
  },
  hamburger: {
    display: 'none', background: 'transparent', border: 'none',
    color: 'var(--text-primary, #fff)', fontSize: 22, cursor: 'pointer',
    padding: 4,
  },
  mobileMenu: {
    padding: '8px 16px 16px', borderTop: '1px solid var(--border, #222)',
    background: 'var(--bg-card, #111)',
  },
  mobileLink: {
    display: 'block', padding: '10px 12px', borderRadius: 8,
    fontSize: 14, fontWeight: 500, color: 'var(--text-secondary, #999)',
    textDecoration: 'none', transition: 'all .15s',
  },
  mobileLinkActive: {
    background: 'rgba(99,102,241,.12)', color: '#6366f1', fontWeight: 700,
  },
  mobileLogout: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid var(--border, #333)', background: 'transparent',
    color: 'var(--text-secondary, #888)', cursor: 'pointer',
    fontSize: 14, fontWeight: 600, marginTop: 8, textAlign: 'left',
  },
};

// Responsive CSS
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
