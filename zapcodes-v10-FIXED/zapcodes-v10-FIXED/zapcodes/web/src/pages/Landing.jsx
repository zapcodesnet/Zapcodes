import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const platforms = [
  { name: 'React Native', icon: '⚛️' },
  { name: 'Flutter', icon: '🦋' },
  { name: 'Swift / iOS', icon: '🍎' },
  { name: 'Kotlin / Android', icon: '🤖' },
  { name: 'Java / Android', icon: '☕' },
  { name: 'Web Apps', icon: '🌐' },
];

const buildTemplates = [
  { name: 'Portfolio Site', icon: '🎨' },
  { name: 'Landing Page', icon: '🚀' },
  { name: 'E-Commerce', icon: '🛒' },
  { name: 'Blog', icon: '📝' },
  { name: 'Dashboard', icon: '📊' },
  { name: 'Mobile App', icon: '📱' },
  { name: 'Web App', icon: '⚡' },
  { name: 'SaaS Starter', icon: '💎' },
];

const repairSteps = [
  { num: '01', title: 'Paste GitHub URL', desc: 'Drop your repo link — public or private. ZapCodes clones and indexes every file.', icon: '🔗' },
  { num: '02', title: 'AI Scans & Fixes', desc: 'Our AI engine deep-scans for crashes, leaks, ANRs, and security holes.', icon: '🧠' },
  { num: '03', title: 'Moltbot Applies It', desc: 'One click — Moltbot edits files, commits, and opens a GitHub PR. You just merge.', icon: '🤖' },
];

const buildSteps = [
  { num: '01', title: 'Choose a Template', desc: 'Pick from 8 project types — portfolio, store, blog, mobile app, SaaS, and more.', icon: '📋' },
  { num: '02', title: 'Customize Your Project', desc: 'Name it, describe it, pick your color scheme. AI generates all the code for you.', icon: '🎨' },
  { num: '03', title: 'Download & Deploy', desc: 'Get your files + step-by-step guide to deploy on Vercel for free. You own 100% of the code.', icon: '🚀' },
];

export default function Landing() {
  const { user } = useAuth();

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Nav */}
      <nav style={styles.nav}>
        <div className="container flex items-center justify-between" style={{ height: 72 }}>
          <div className="flex items-center gap-2">
            <span style={styles.logoIcon}>⚡</span>
            <span style={styles.logoText}>ZapCodes</span>
          </div>
          <div className="flex items-center gap-2" style={{ gap: 16 }}>
            <Link to="/build" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>Build</Link>
            <Link to="/pricing" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>Pricing</Link>
            {user ? (
              <Link to="/dashboard" className="btn btn-primary">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost">Sign In</Link>
                <Link to="/register" className="btn btn-primary">Get Started Free</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={styles.hero}>
        <div className="container text-center">
          <div className="animate-in stagger-1">
            <span style={styles.heroBadge}>
              <span style={{ color: 'var(--accent)' }}>●</span> AI-Powered Build & Repair Platform
            </span>
          </div>
          <h1 className="animate-in stagger-2" style={styles.heroTitle}>
            Build From Scratch.<br />
            Fix <span style={{ color: 'var(--accent)' }}>Instantly</span>.
          </h1>
          <p className="animate-in stagger-3" style={styles.heroSub}>
            Create websites and mobile apps with AI — or scan existing code for bugs.<br />
            You own 100% of your code. Your privacy. Your project. Your rules.
          </p>
          <div className="flex items-center justify-center gap-2 animate-in stagger-4" style={{ flexWrap: 'wrap' }}>
            <Link to="/build" className="btn btn-primary btn-lg">
              🏗️ Build a Project →
            </Link>
            <Link to="/register" className="btn btn-secondary btn-lg">
              🔧 Repair Code →
            </Link>
          </div>

          {/* Two-card preview */}
          <div className="animate-in stagger-5" style={styles.twoCards}>
            <div style={styles.previewCard}>
              <div style={styles.previewHeader}>
                <span style={{ fontSize: '1.3rem' }}>🏗️</span>
                <strong>Build</strong>
              </div>
              <pre style={styles.previewCode}>
{`> Choose template: Portfolio
> Name: my-portfolio
> Style: Modern Purple
> Generating 3 files...

✓ index.html
✓ style.css
✓ script.js

🚀 Ready to deploy on Vercel!`}
              </pre>
            </div>
            <div style={styles.previewCard}>
              <div style={{ ...styles.previewHeader, borderColor: 'rgba(0, 229, 160, 0.2)' }}>
                <span style={{ fontSize: '1.3rem' }}>🔧</span>
                <strong>Repair</strong>
              </div>
              <pre style={styles.previewCode}>
{`$ zapcodes scan github.com/user/app

⚡ Scanning 147 files...
🧠 AI analyzing code...

`}<span style={{ color: '#ff4466' }}>✗ 2 Critical</span>{`  `}<span style={{ color: '#ffaa00' }}>⚠ 5 Warnings</span>{`
`}<span style={{ color: '#00e5a0' }}>✓ 3 Auto-fixable via Moltbot</span>{`

→ PR #47 created ✓`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* BUILD Section */}
      <section style={{ ...styles.section, background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(99, 102, 241, 0.05) 0%, transparent 60%)' }}>
        <div className="container text-center">
          <span style={{ ...styles.heroBadge, marginBottom: 20 }}>🏗️ Build</span>
          <h2 style={styles.sectionTitle}>Create Websites & Apps From Scratch</h2>
          <p style={styles.sectionSub}>Choose a template, customize it, download the code. Deploy for free. No coding experience required.</p>

          {/* Template grid */}
          <div style={styles.templateGrid}>
            {buildTemplates.map((t) => (
              <Link to="/build" key={t.name} style={styles.templateItem}>
                <span style={{ fontSize: '2rem' }}>{t.icon}</span>
                <span style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: 6 }}>{t.name}</span>
              </Link>
            ))}
          </div>

          {/* Build steps */}
          <div style={styles.stepsGrid}>
            {buildSteps.map((s) => (
              <div key={s.num} style={styles.stepCard}>
                <div style={styles.stepNum}>{s.num}</div>
                <span style={{ fontSize: '2.5rem', margin: '16px 0' }}>{s.icon}</span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>{s.title}</h3>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>{s.desc}</p>
              </div>
            ))}
          </div>

          <Link to="/build" className="btn btn-primary btn-lg" style={{ marginTop: 40 }}>
            Start Building Free →
          </Link>
        </div>
      </section>

      {/* REPAIR Section */}
      <section style={{ ...styles.section, background: 'var(--bg-secondary)' }}>
        <div className="container text-center">
          <span style={{ ...styles.heroBadge, marginBottom: 20 }}>🔧 Repair</span>
          <h2 style={styles.sectionTitle}>Fix Code Bugs & Errors Instantly</h2>
          <p style={styles.sectionSub}>Paste a GitHub URL. AI scans your entire codebase. Moltbot applies the fix in one click.</p>

          {/* Repair steps */}
          <div style={styles.stepsGrid}>
            {repairSteps.map((s) => (
              <div key={s.num} style={styles.stepCard}>
                <div style={styles.stepNum}>{s.num}</div>
                <span style={{ fontSize: '2.5rem', margin: '16px 0' }}>{s.icon}</span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>{s.title}</h3>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>{s.desc}</p>
              </div>
            ))}
          </div>

          {/* Supported platforms */}
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 48, marginBottom: 20 }}>Supported Platforms</h3>
          <div style={styles.platformGrid}>
            {platforms.map((p) => (
              <div key={p.name} className="card" style={styles.platformCard}>
                <span style={{ fontSize: '2rem' }}>{p.icon}</span>
                <span style={{ fontWeight: 600, marginTop: 8, fontSize: '0.85rem' }}>{p.name}</span>
              </div>
            ))}
          </div>

          <Link to="/register" className="btn btn-primary btn-lg" style={{ marginTop: 40 }}>
            Start Scanning Free →
          </Link>
        </div>
      </section>

      {/* Privacy & Trust Section */}
      <section style={styles.section}>
        <div className="container text-center">
          <h2 style={styles.sectionTitle}>🔒 Your Privacy. Your Code. 100%.</h2>
          <p style={styles.sectionSub}>Everything you build or fix on ZapCodes belongs to you. We never store, share, or sell your code.</p>
          <div style={styles.trustGrid}>
            <div style={styles.trustCard}>
              <span style={{ fontSize: '2rem' }}>🔐</span>
              <strong>End-to-End Encrypted</strong>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>All data encrypted in transit and at rest</p>
            </div>
            <div style={styles.trustCard}>
              <span style={{ fontSize: '2rem' }}>🗑️</span>
              <strong>Auto-Deleted</strong>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Code is analyzed then purged — never stored permanently</p>
            </div>
            <div style={styles.trustCard}>
              <span style={{ fontSize: '2rem' }}>👤</span>
              <strong>You Own Everything</strong>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>100% ownership of code you build or fix</p>
            </div>
            <div style={styles.trustCard}>
              <span style={{ fontSize: '2rem' }}>🚫</span>
              <strong>No Data Selling</strong>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>We will never sell or share your data. Period.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ ...styles.section, paddingBottom: 120, background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(0, 229, 160, 0.04) 0%, transparent 60%)' }}>
        <div className="container text-center">
          <h2 style={styles.sectionTitle}>Ready to Build or Fix?</h2>
          <p style={styles.sectionSub}>Start free. No credit card required. Create a website or scan code in 60 seconds.</p>
          <div className="flex items-center justify-center gap-2" style={{ marginTop: 24, flexWrap: 'wrap' }}>
            <Link to="/build" className="btn btn-primary btn-lg">🏗️ Build a Project</Link>
            <Link to="/register" className="btn btn-secondary btn-lg">🔧 Repair Code</Link>
            <Link to="/pricing" className="btn btn-ghost btn-lg">View Pricing</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <div className="container flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div className="flex items-center gap-2">
            <span style={styles.logoIcon}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>ZapCodes</span>
          </div>
          <div className="flex items-center gap-2" style={{ gap: 24 }}>
            <Link to="/build" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Build</Link>
            <Link to="/pricing" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Pricing</Link>
            <Link to="/privacy" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/terms" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Terms of Service</Link>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            ©2026 ZapCodes. Build & repair with AI. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}

const styles = {
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    background: 'rgba(6, 6, 11, 0.85)', backdropFilter: 'blur(16px)',
    borderBottom: '1px solid var(--border)',
  },
  logoIcon: { fontSize: '1.5rem' },
  logoText: { fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.5px' },
  hero: {
    paddingTop: 160, paddingBottom: 80,
    background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0, 229, 160, 0.06) 0%, transparent 60%)',
  },
  heroBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 16px', borderRadius: 100,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)',
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
    fontWeight: 900, lineHeight: 1.1, letterSpacing: '-2px', marginBottom: 24,
  },
  heroSub: {
    fontSize: '1.15rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 40,
  },
  twoCards: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 20, maxWidth: 750, margin: '60px auto 0', textAlign: 'left',
  },
  previewCard: {
    background: '#0a0a12', border: '1px solid var(--border)',
    borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
  },
  previewHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-elevated)', fontSize: '0.9rem',
  },
  previewCode: {
    padding: 16, fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
    lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0,
  },
  section: { padding: '100px 0', position: 'relative', zIndex: 1 },
  sectionTitle: { fontSize: '2.2rem', fontWeight: 800, marginBottom: 12 },
  sectionSub: { fontSize: '1.05rem', color: 'var(--text-secondary)', marginBottom: 48 },
  templateGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 12, maxWidth: 700, margin: '0 auto 48px',
  },
  templateItem: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16,
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
    textDecoration: 'none', color: 'var(--text-primary)', transition: '0.2s',
  },
  platformGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 12, maxWidth: 700, margin: '0 auto',
  },
  platformCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: 20, cursor: 'default',
  },
  stepsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 24, maxWidth: 1000, margin: '0 auto',
  },
  stepCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: 32, textAlign: 'center',
  },
  stepNum: {
    fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700,
    color: 'var(--accent)', letterSpacing: '2px',
  },
  trustGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16, maxWidth: 900, margin: '0 auto',
  },
  trustCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: 28, textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  footer: {
    padding: '32px 0', borderTop: '1px solid var(--border)',
    position: 'relative', zIndex: 1,
  },
};
