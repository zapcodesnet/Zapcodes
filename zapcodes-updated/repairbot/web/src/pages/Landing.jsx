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

const steps = [
  { num: '01', title: 'Paste GitHub URL', desc: 'Drop your repo link — public or private. ZapCodes clones and indexes every file.', icon: '🔗' },
  { num: '02', title: 'AI Scans & Fixes', desc: 'Our AI engine (Ollama free / Claude Pro) deep-scans for crashes, leaks, ANRs, and security holes.', icon: '🧠' },
  { num: '03', title: 'Moltbot Applies It', desc: 'One click — Moltbot edits files, commits, and opens a GitHub PR. You just merge.', icon: '🤖' },
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
          <div className="flex items-center gap-2">
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
              <span style={{ color: 'var(--accent)' }}>●</span> AI-Powered Code Repair
            </span>
          </div>
          <h1 className="animate-in stagger-2" style={styles.heroTitle}>
            Fix Code Bugs &<br />
            Errors <span style={{ color: 'var(--accent)', position: 'relative' }}>Instantly</span>
          </h1>
          <p className="animate-in stagger-3" style={styles.heroSub}>
            Paste a GitHub URL. AI scans your entire codebase for crashes, memory leaks,<br />
            and security holes. Moltbot applies the fix in one click.
          </p>
          <div className="flex items-center justify-center gap-2 animate-in stagger-4">
            <Link to="/register" className="btn btn-primary btn-lg">
              Get Started Free →
            </Link>
            <Link to="/pricing" className="btn btn-secondary btn-lg">
              View Pricing
            </Link>
          </div>

          {/* Terminal preview */}
          <div className="animate-in stagger-5" style={styles.terminal}>
            <div style={styles.terminalBar}>
              <div style={styles.terminalDots}>
                <span style={{ ...styles.dot, background: '#ff5f57' }} />
                <span style={{ ...styles.dot, background: '#febc2e' }} />
                <span style={{ ...styles.dot, background: '#28c840' }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>zapcodes scan</span>
            </div>
            <pre style={styles.terminalCode}>
{`$ zapcodes scan https://github.com/user/my-app

⚡ Scanning repository...
📁 Found 147 files across 23 directories
🧠 AI analyzing with deepseek-coder-v2...

╔══════════════════════════════════════════════╗
║  `}<span style={{ color: 'var(--danger)' }}>✗ 2 Critical</span>{`  `}<span style={{ color: 'var(--warning)' }}>⚠ 5 Warnings</span>{`  `}<span style={{ color: 'var(--accent)' }}>✓ 3 Auto-fixable</span>{`  ║
╚══════════════════════════════════════════════╝

`}<span style={{ color: 'var(--danger)' }}>CRITICAL</span>{` NullPointerException in UserService.java:142
  → Fix: Add null check before .getData() call
  → `}<span style={{ color: 'var(--accent)' }}>[Apply Fix via Moltbot]</span>{` → PR #47 created ✓`}
            </pre>
          </div>
        </div>
      </section>

      {/* Platforms */}
      <section style={styles.section}>
        <div className="container text-center">
          <h2 style={styles.sectionTitle}>Supported Platforms</h2>
          <p style={styles.sectionSub}>Scan and fix code across all major mobile and web frameworks</p>
          <div style={styles.platformGrid}>
            {platforms.map((p) => (
              <div key={p.name} className="card" style={styles.platformCard}>
                <span style={{ fontSize: '2rem' }}>{p.icon}</span>
                <span style={{ fontWeight: 600, marginTop: 8 }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 Steps */}
      <section style={{ ...styles.section, background: 'var(--bg-secondary)' }}>
        <div className="container text-center">
          <h2 style={styles.sectionTitle}>How It Works</h2>
          <p style={styles.sectionSub}>Three steps from broken code to working PR</p>
          <div style={styles.stepsGrid}>
            {steps.map((s) => (
              <div key={s.num} style={styles.stepCard}>
                <div style={styles.stepNum}>{s.num}</div>
                <span style={{ fontSize: '2.5rem', margin: '16px 0' }}>{s.icon}</span>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8 }}>{s.title}</h3>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ ...styles.section, paddingBottom: 120 }}>
        <div className="container text-center">
          <h2 style={styles.sectionTitle}>Ready to Fix Your Code?</h2>
          <p style={styles.sectionSub}>Start with 5 free scans. No credit card required.</p>
          <Link to="/register" className="btn btn-primary btn-lg" style={{ marginTop: 24 }}>
            Get Started Free →
          </Link>
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
            <Link to="/privacy" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/terms" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Terms of Service</Link>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            ©2026 ZapCodes. AI-powered code repair. All rights reserved.
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
  terminal: {
    maxWidth: 700, margin: '60px auto 0',
    background: '#0a0a12', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', overflow: 'hidden',
    textAlign: 'left', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5)',
  },
  terminalBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', background: 'var(--bg-elevated)',
    borderBottom: '1px solid var(--border)',
  },
  terminalDots: { display: 'flex', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: '50%', display: 'block' },
  terminalCode: {
    padding: 20, fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
    lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0,
  },
  section: { padding: '100px 0', position: 'relative', zIndex: 1 },
  sectionTitle: { fontSize: '2.2rem', fontWeight: 800, marginBottom: 12 },
  sectionSub: { fontSize: '1.05rem', color: 'var(--text-secondary)', marginBottom: 48 },
  platformGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 16, maxWidth: 800, margin: '0 auto',
  },
  platformCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: 24, cursor: 'default',
  },
  stepsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 32, maxWidth: 1000, margin: '0 auto',
  },
  stepCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: 40, textAlign: 'center',
  },
  stepNum: {
    fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700,
    color: 'var(--accent)', letterSpacing: '2px',
  },
  footer: {
    padding: '32px 0', borderTop: '1px solid var(--border)',
    position: 'relative', zIndex: 1,
  },
};
