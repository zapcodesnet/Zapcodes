import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GuestBuilder from '../components/GuestBuilder';

export default function Landing() {
  const { user } = useAuth();

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>

      {/* ── Nav — mobile-safe, no overflow ───────────────────────────────── */}
      <nav style={styles.nav}>
        <div style={styles.navInner}>
          {/* Logo */}
          <Link to="/" style={styles.navLogo}>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <span style={styles.logoText}>ZapCodes</span>
          </Link>

          {/* Desktop links */}
          <div className="zc-nav-desktop" style={styles.navLinks}>
            <Link to="/build" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>Build</Link>
            <Link to="/pricing" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>Pricing</Link>
            {user ? (
              <Link to="/dashboard" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>Sign In</Link>
                <Link to="/register" className="btn btn-primary" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Get Started Free</Link>
              </>
            )}
          </div>

          {/* Mobile — compact right side */}
          <div className="zc-nav-mobile" style={styles.navMobile}>
            {user ? (
              <Link to="/dashboard" style={styles.mobileBtn}>Dash</Link>
            ) : (
              <>
                <Link to="/login" style={{ ...styles.mobileBtn, background: 'transparent', border: '1px solid #1E2A36', color: '#7A8EA0', marginRight: 6 }}>Login</Link>
                <Link to="/register" style={styles.mobileBtn}>Free</Link>
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
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 2s infinite', verticalAlign: 'middle', marginRight: 6 }} />
              Powered by the latest and most advanced AI
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

          {/* Embedded builder */}
          <div className="animate-in stagger-4" style={{ marginTop: 36 }}>
            <GuestBuilder />
          </div>
        </div>
      </section>

      {/* ── Stats Bar ──────────────────────────────────────────────────────── */}
      <div style={styles.statsBar}>
        {[
          { num: '10K+',  label: 'Sites Deployed' },
          { num: '~2 min', label: 'Prompt to Live' },
          { num: 'Free',  label: 'First Site Free' },
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
          <p style={styles.sectionSub}>No tutorials. No account needed to start. Just describe what you want.</p>

          <div style={styles.stepsGrid}>
            {[
              { num: '01', icon: '✍️', title: 'Describe What You Want', desc: "Type it like you'd explain it to a friend. That's enough." },
              { num: '02', icon: '🤖', title: 'Watch AI Build It Live', desc: 'See your site come to life section by section in real time.' },
              { num: '03', icon: '🚀', title: 'Claim It and Go Live', desc: 'Register, pick your subdomain, hit Deploy. Live in seconds.' },
            ].map(s => (
              <div key={s.num} style={styles.stepCard}>
                <div style={styles.stepNum}>{s.num}</div>
                <span style={{ fontSize: '2.2rem', margin: '14px 0', display: 'block' }}>{s.icon}</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>{s.title}</h3>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.9rem' }}>{s.desc}</p>
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
              { icon: '🖼️', title: 'AI-Generated Images',    desc: 'Custom photos created for your site. No stock photos.' },
              { icon: '📧', title: 'Contact Forms Ready',     desc: 'Inquiries go straight to your email. Zero setup.' },
              { icon: '💳', title: 'Accept Payments',         desc: 'Connect your Stripe in one click. Skip anytime.' },
              { icon: '🌐', title: 'Free Hosting Included',   desc: 'yourbusiness.zapcodes.net — live, secure, fast.' },
              { icon: '📱', title: 'Works on Every Device',   desc: 'Fully responsive on mobile, tablet, and desktop.' },
              { icon: '✏️', title: 'Edit Anytime',            desc: 'Describe changes in plain English. AI handles the rest.' },
            ].map(f => (
              <div key={f.title} style={styles.featureCard}>
                <span style={{ fontSize: '1.8rem', display: 'block', marginBottom: 10 }}>{f.icon}</span>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 5 }}>{f.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section style={{ ...styles.section, paddingBottom: 100, background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(0,229,160,0.04) 0%, transparent 60%)' }}>
        <div className="container text-center">
          <h2 style={styles.sectionTitle}>Build your first site right now — free.</h2>
          <p style={styles.sectionSub}>No account needed. Just type what you want above.</p>
          <a
            href="#"
            onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => document.querySelector('.gb-inp')?.focus(), 700); }}
            className="btn btn-primary btn-lg"
          >
            ⚡ Start Building — Scroll Up to Try
          </a>
          <p style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-muted)' }}>No credit card. No signup. No catch.</p>
        </div>
      </section>

      {/* ── Footer (original — 100% untouched) ─────────────────────────────── */}
      <footer style={styles.footer}>
        <div className="container flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>ZapCodes</span>
          </div>
          <div className="flex items-center gap-2" style={{ gap: 24, flexWrap: 'wrap' }}>
            <Link to="/build"    style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Build</Link>
            <Link to="/pricing"  style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Pricing</Link>
            <Link to="/privacy"  style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/terms"    style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Terms of Service</Link>
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
    background: 'rgba(6,6,11,0.90)', backdropFilter: 'blur(16px)',
    borderBottom: '1px solid var(--border)',
  },
  navInner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 16px',
    height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  navLogo: {
    display: 'flex', alignItems: 'center', gap: 6,
    textDecoration: 'none', color: 'var(--text-primary)',
    flexShrink: 0,
  },
  logoText: { fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.5px' },
  // Desktop nav links — hidden on mobile via media query simulation (use CSS class)
  navLinks: {
    display: 'flex', alignItems: 'center', gap: 8,
    // Hidden on mobile — we use navMobile instead
    // Can't use @media in inline styles, but the mobile version is controlled
    // via navMobile visibility — both render, CSS in <style> hides/shows them
  },
  // Mobile compact buttons — shown only on small screens
  navMobile: {
    display: 'none', // overridden by style tag below
    alignItems: 'center',
  },
  mobileBtn: {
    display: 'inline-block',
    background: 'var(--accent, #00E5A0)',
    color: '#07090B',
    padding: '7px 14px',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 13,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  hero: {
    paddingTop: 96, paddingBottom: 60,
    background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,229,160,0.06) 0%, transparent 60%)',
    position: 'relative', overflow: 'hidden',
  },
  heroBadge: {
    display: 'inline-flex', alignItems: 'center',
    padding: '6px 16px', borderRadius: 100,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)',
    marginBottom: 22,
  },
  heroTitle: {
    fontSize: 'clamp(2.2rem, 8vw, 4.5rem)',
    fontWeight: 900, lineHeight: 1.07, letterSpacing: '-2px', marginBottom: 18,
  },
  heroSub: {
    fontSize: 'clamp(0.95rem, 3vw, 1.1rem)',
    color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 0,
    maxWidth: 480, margin: '0 auto',
  },
  statsBar: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
    borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
    background: 'rgba(13,17,23,0.5)',
  },
  statItem: {
    flex: '1 1 100px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '18px 12px', textAlign: 'center',
    borderRight: '1px solid var(--border)',
  },
  statNum: { fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 },
  statLabel: { fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 },
  section: { padding: '80px 0', position: 'relative', zIndex: 1 },
  sectionTitle: { fontSize: 'clamp(1.6rem, 5vw, 2.1rem)', fontWeight: 800, marginBottom: 12 },
  sectionSub: { fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: 40, maxWidth: 440, margin: '0 auto 40px' },
  stepsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 20, maxWidth: 900, margin: '0 auto',
  },
  stepCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '28px 24px', textAlign: 'center',
  },
  stepNum: { fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '2px' },
  featuresGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16, maxWidth: 900, margin: '0 auto', textAlign: 'left',
  },
  featureCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '20px 18px',
  },
  footer: {
    padding: '28px 0', borderTop: '1px solid var(--border)',
    position: 'relative', zIndex: 1,
  },
};

// Inject responsive CSS for nav
if (typeof document !== 'undefined') {
  const existing = document.getElementById('zc-landing-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'zc-landing-styles';
    style.textContent = `
      @media (max-width: 640px) {
        .zc-nav-desktop { display: none !important; }
        .zc-nav-mobile  { display: flex !important; }
      }
      @media (min-width: 641px) {
        .zc-nav-desktop { display: flex !important; }
        .zc-nav-mobile  { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }
}
