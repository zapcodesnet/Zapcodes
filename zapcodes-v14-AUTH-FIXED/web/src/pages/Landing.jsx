import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GuestBuilder from '../components/GuestBuilder';

export default function Landing() {
  const { user } = useAuth();

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>

      {/* ── Nav (unchanged from original) ──────────────────────────────── */}
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

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section style={styles.hero}>
        <div className="container" style={{ textAlign: 'center' }}>

          {/* Badge */}
          <div className="animate-in stagger-1">
            <span style={styles.heroBadge}>
              <span style={{ color: 'var(--accent)', animation: 'pulse 2s infinite', display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} /> Powered by the latest and most advanced AI
            </span>
          </div>

          {/* Headline */}
          <h1 className="animate-in stagger-2" style={styles.heroTitle}>
            Type It.<br />
            <span style={{ color: 'var(--accent)' }}>Watch It Build.</span><br />
            Go Live.
          </h1>

          <p className="animate-in stagger-3" style={styles.heroSub}>
            No code. No setup. No experience needed.<br />
            Describe what you want — AI builds your site and deploys it live.
          </p>

          {/* Embedded Guest Builder */}
          <div className="animate-in stagger-4" style={{ marginTop: 40, marginBottom: 0 }}>
            <GuestBuilder />
          </div>
        </div>
      </section>

      {/* ── Stats Bar ──────────────────────────────────────────────────────── */}
      <div style={styles.statsBar}>
        {[
          { num: '10K+',  label: 'Sites Deployed' },
          { num: '~2 min', label: 'Prompt to Live Site' },
          { num: 'Free',  label: 'First Site on Us' },
          { num: 'Zero',  label: 'Coding Required' },
        ].map(({ num, label }) => (
          <div key={label} style={styles.statItem}>
            <div style={styles.statNum}>{num}</div>
            <div style={styles.statLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── How It Works ───────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ ...styles.section, background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(99,102,241,0.05) 0%, transparent 60%)' }}>
        <div className="container text-center">
          <span style={{ ...styles.heroBadge, marginBottom: 16 }}>How It Works</span>
          <h2 style={styles.sectionTitle}>Three steps. That's it.</h2>
          <p style={styles.sectionSub}>No tutorials to watch. No account needed to start. Just describe what you want.</p>

          <div style={styles.stepsGrid}>
            {[
              { num: '01', icon: '✍️', title: 'Describe What You Want', desc: "Type it like you'd explain it to a friend. 'A bakery website with an online order form and gallery.' That's enough." },
              { num: '02', icon: '🤖', title: 'Watch AI Build It Live', desc: 'See your site come to life section by section — the preview updates in real time as AI writes the code and generates your images.' },
              { num: '03', icon: '🚀', title: 'Claim It and Go Live', desc: 'Register, pick your subdomain (yourbusiness.zapcodes.net), and hit Deploy. Your site is live on the internet instantly.' },
            ].map(s => (
              <div key={s.num} style={styles.stepCard}>
                <div style={styles.stepNum}>{s.num}</div>
                <span style={{ fontSize: '2.5rem', margin: '16px 0', display: 'block' }}>{s.icon}</span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>{s.title}</h3>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Everything Included ────────────────────────────────────────────── */}
      <section style={{ ...styles.section, background: 'var(--bg-secondary)' }}>
        <div className="container text-center">
          <span style={{ ...styles.heroBadge, marginBottom: 16 }}>Everything Included</span>
          <h2 style={styles.sectionTitle}>Your site comes fully loaded.</h2>

          <div style={styles.featuresGrid}>
            {[
              { icon: '🖼️', title: 'AI-Generated Images', desc: 'Custom photos created for your site. No stock photos. No blank placeholders.' },
              { icon: '📧', title: 'Contact Forms Ready', desc: 'Every inquiry goes straight to your email. No setup — just register and your inbox is connected.' },
              { icon: '💳', title: 'Accept Payments', desc: 'Connect your Stripe account in one click. Start accepting payments on day one. Skip it anytime.' },
              { icon: '🌐', title: 'Free Hosting Included', desc: 'yourbusiness.zapcodes.net — live, secure, and fast. No Vercel, no Render needed.' },
              { icon: '📱', title: 'Works on Every Device', desc: 'Mobile, tablet, desktop — every site AI builds is fully responsive right out of the box.' },
              { icon: '✏️', title: 'Edit Anytime', desc: 'Want to change something? Describe the update in plain English. AI rewrites only what you need.' },
            ].map(f => (
              <div key={f.title} style={styles.featureCard}>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: 12 }}>{f.icon}</span>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>{f.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section style={{ ...styles.section, paddingBottom: 100, background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(0,229,160,0.04) 0%, transparent 60%)' }}>
        <div className="container text-center">
          <h2 style={styles.sectionTitle}>Build your first site right now — free.</h2>
          <p style={styles.sectionSub}>No account needed to start. Just type what you want above.</p>
          <a
            href="#"
            onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => document.querySelector('.gb-textarea')?.focus(), 600); }}
            className="btn btn-primary btn-lg"
          >
            ⚡ Start Building — Scroll Up to Try
          </a>
          <p style={{ marginTop: 14, fontSize: '0.8rem', color: 'var(--text-muted)' }}>No credit card. No signup. No catch.</p>
        </div>
      </section>

      {/* ── Footer (original — 100% untouched) ─────────────────────────────── */}
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
            ©2026 ZapCodes. Build &amp; repair with AI. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}

const styles = {
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    background: 'rgba(6,6,11,0.88)', backdropFilter: 'blur(16px)',
    borderBottom: '1px solid var(--border)',
  },
  logoIcon: { fontSize: '1.5rem' },
  logoText: { fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.5px' },
  hero: {
    paddingTop: 100, paddingBottom: 64,
    background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,229,160,0.06) 0%, transparent 60%)',
    position: 'relative', overflow: 'hidden',
  },
  heroBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 16px', borderRadius: 100,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)',
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 'clamp(2.4rem, 6vw, 4.5rem)',
    fontWeight: 900, lineHeight: 1.07, letterSpacing: '-2px', marginBottom: 20,
  },
  heroSub: {
    fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 0,
    maxWidth: 500, margin: '0 auto 0',
  },
  statsBar: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
    borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
    background: 'rgba(13,17,23,0.5)',
  },
  statItem: {
    flex: '1 1 130px', maxWidth: 200, display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '20px 16px', textAlign: 'center',
    borderRight: '1px solid var(--border)',
  },
  statNum: { fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 },
  statLabel: { fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 },
  section: { padding: '96px 0', position: 'relative', zIndex: 1 },
  sectionTitle: { fontSize: '2.1rem', fontWeight: 800, marginBottom: 12 },
  sectionSub: { fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: 48, maxWidth: 480, margin: '0 auto 48px' },
  stepsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 24, maxWidth: 960, margin: '0 auto',
  },
  stepCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: 32, textAlign: 'center',
    transition: 'all 0.3s', cursor: 'default',
  },
  stepNum: {
    fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700,
    color: 'var(--accent)', letterSpacing: '2px',
  },
  featuresGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: 20, maxWidth: 960, margin: '0 auto', textAlign: 'left',
  },
  featureCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: 24, transition: 'all 0.2s',
  },
  footer: {
    padding: '32px 0', borderTop: '1px solid var(--border)',
    position: 'relative', zIndex: 1,
  },
};
