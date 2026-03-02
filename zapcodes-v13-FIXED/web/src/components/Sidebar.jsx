import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const menuItems = [
  { path: '/dashboard', label: 'Repair Code', icon: '🔧' },
  { path: '/build', label: 'Build Project', icon: '🏗️' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
  { path: '/pricing', label: 'Upgrade Plan', icon: '💎' },
];

export default function Sidebar() {
  const { user, logout, repos } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        style={styles.mobileToggle}
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      <aside style={{ ...styles.sidebar, ...(mobileOpen ? styles.sidebarOpen : {}) }}>
        <div>
          {/* Logo */}
          <Link to="/" style={styles.logo}>
            <span style={{ fontSize: '1.3rem' }}>⚡</span>
            <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>ZapCodes</span>
          </Link>

          {/* Menu */}
          <nav style={{ marginTop: 32 }}>
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                style={{
                  ...styles.menuItem,
                  ...(location.pathname === item.path ? styles.menuItemActive : {}),
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* Repos */}
          {repos.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={styles.sectionLabel}>Recent Repos</div>
              {repos.slice(0, 5).map((r) => (
                <Link
                  key={r._id}
                  to={`/repo/${r._id}`}
                  onClick={() => setMobileOpen(false)}
                  style={{
                    ...styles.menuItem,
                    ...(location.pathname === `/repo/${r._id}` ? styles.menuItemActive : {}),
                  }}
                >
                  <span>📁</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}
                  </span>
                  {r.stats?.critical > 0 && (
                    <span className="badge badge-critical" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>
                      {r.stats.critical}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* User */}
        <div style={styles.userSection}>
          <div style={styles.planBadge}>{user?.plan?.toUpperCase() || 'FREE'}</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{user?.name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.email}</div>
          <button onClick={() => { logout(); navigate('/'); }} className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 12 }}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {mobileOpen && <div style={styles.overlay} onClick={() => setMobileOpen(false)} />}
    </>
  );
}

const styles = {
  sidebar: {
    position: 'fixed', top: 0, left: 0, bottom: 0, width: 260,
    background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    padding: '20px 12px', zIndex: 50, overflowY: 'auto',
    transition: 'transform 0.3s ease',
  },
  sidebarOpen: {},
  mobileToggle: {
    position: 'fixed', top: 16, left: 16, zIndex: 60,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
    fontSize: '1.2rem', display: 'none',
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    zIndex: 40, display: 'none',
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 8,
    color: 'var(--text-primary)', padding: '8px 12px',
  },
  menuItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', borderRadius: 8,
    color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500,
    transition: '0.15s ease',
    textDecoration: 'none',
  },
  menuItemActive: {
    background: 'var(--accent-glow)',
    color: 'var(--accent)',
  },
  sectionLabel: {
    fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '1px',
    padding: '0 12px', marginBottom: 8,
  },
  userSection: {
    borderTop: '1px solid var(--border)',
    paddingTop: 16, textAlign: 'center',
  },
  planBadge: {
    display: 'inline-block', padding: '2px 10px', borderRadius: 100,
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px',
    background: 'var(--accent-glow)', color: 'var(--accent)',
    border: '1px solid rgba(0, 229, 160, 0.3)', marginBottom: 8,
  },
};

// Responsive: add media query via style tag
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 768px) {
      aside[style] { transform: translateX(-100%); }
      button[style*="mobileToggle"] { display: block !important; }
      div[style*="overlay"] { display: block !important; }
    }
  `;
  document.head.appendChild(style);
}
