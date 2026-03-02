import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/build', label: 'Build Project', icon: '🏗️' },
  { path: '/repair', label: 'Repair Code', icon: '🔧' },
  { path: '/projects', label: 'My Projects', icon: '📁' },
  { path: '/pricing', label: 'Pricing', icon: '💎' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Don't show navbar on landing, login, register
  const hidePaths = ['/', '/login', '/register', '/auth/callback', '/privacy', '/terms'];
  if (!user || hidePaths.includes(location.pathname)) return null;

  return (
    <>
      <nav style={s.nav}>
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
            <span style={s.planBadge}>{(user?.plan || 'free').toUpperCase()}</span>
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
      <div style={{ height: 52 }} />
    </>
  );
}

const s = {
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
  planBadge: {
    padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 800,
    background: 'rgba(99,102,241,.15)', color: '#6366f1', letterSpacing: '.5px',
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
