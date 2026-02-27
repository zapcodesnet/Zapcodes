import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    features: [
      { text: '3 project builds/month', category: 'build' },
      { text: '5 code scans/month', category: 'repair' },
      { text: '3 basic templates', category: 'build' },
      { text: '3 Moltbot fixes/month', category: 'repair' },
      { text: 'Ollama AI engine', category: 'repair' },
      { text: 'Public repos only', category: 'repair' },
      { text: 'Community support', category: 'both' },
    ],
    cta: 'Get Started Free',
    id: 'free',
    popular: false,
  },
  {
    name: 'Starter',
    price: '$9',
    period: '/month',
    features: [
      { text: '25 project builds/month', category: 'build' },
      { text: '50 code scans/month', category: 'repair' },
      { text: 'All 8 templates', category: 'build' },
      { text: '7 color schemes', category: 'build' },
      { text: '20 Moltbot fixes/month', category: 'repair' },
      { text: 'Ollama + Claude engines', category: 'repair' },
      { text: 'Private repos', category: 'repair' },
      { text: 'Priority support', category: 'both' },
      { text: 'Export projects as ZIP', category: 'build' },
    ],
    cta: 'Upgrade to Starter',
    id: 'starter',
    popular: true,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    features: [
      { text: 'Unlimited project builds', category: 'build' },
      { text: 'Unlimited code scans', category: 'repair' },
      { text: 'All templates + custom themes', category: 'build' },
      { text: 'AI-powered customization', category: 'build' },
      { text: 'Unlimited Moltbot fixes', category: 'repair' },
      { text: 'All AI engines', category: 'repair' },
      { text: 'Private repos + team collab', category: 'repair' },
      { text: 'Custom rules & webhooks', category: 'repair' },
      { text: 'Priority support + Slack', category: 'both' },
      { text: 'Commercial license', category: 'both' },
    ],
    cta: 'Upgrade to Pro',
    id: 'pro',
    popular: false,
  },
];

const categoryIcons = { build: '🏗️', repair: '🔧', both: '⚡' };

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);

  const handleUpgrade = async (planId) => {
    if (!user) return navigate('/register');
    if (planId === 'free') return;
    setLoading(planId);
    try {
      const { data } = await api.post('/stripe/create-checkout', { plan: planId });
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Payment setup failed. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Nav */}
      <nav style={styles.nav}>
        <div className="container flex items-center justify-between" style={{ height: 72 }}>
          <Link to="/" className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <span style={{ fontSize: '1.5rem' }}>⚡</span>
            <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>ZapCodes</span>
          </Link>
          <div className="flex items-center gap-2" style={{ gap: 16 }}>
            <Link to="/build" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>Build</Link>
            {user ? (
              <Link to="/dashboard" className="btn btn-ghost">Dashboard</Link>
            ) : (
              <Link to="/login" className="btn btn-ghost">Sign In</Link>
            )}
          </div>
        </div>
      </nav>

      <section style={{ paddingTop: 140, paddingBottom: 60 }}>
        <div className="container text-center">
          <span style={styles.badge}>⚡ Build + Repair Platform</span>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: 12, marginTop: 16 }}>
            Simple, Transparent Pricing
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: 56 }}>
            One plan covers everything — build new projects and repair existing code.
          </p>

          <div style={styles.grid}>
            {plans.map(plan => (
              <div key={plan.id} style={{
                ...styles.planCard,
                ...(plan.popular ? styles.planPopular : {}),
              }}>
                {plan.popular && <div style={styles.popularBadge}>Most Popular</div>}
                <h3 style={{ fontSize: '1.3rem', fontWeight: 700 }}>{plan.name}</h3>
                <div style={{ margin: '16px 0' }}>
                  <span style={{ fontSize: '3rem', fontWeight: 900, fontFamily: 'var(--font-mono)' }}>{plan.price}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{plan.period}</span>
                </div>
                <ul style={styles.featureList}>
                  {plan.features.map(f => (
                    <li key={f.text} style={styles.featureItem}>
                      <span style={{ fontSize: '0.8rem' }}>{categoryIcons[f.category]}</span>
                      <span>{f.text}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  className={`btn ${plan.popular ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ width: '100%', marginTop: 'auto' }}
                  disabled={loading === plan.id || (user?.plan === plan.id)}
                >
                  {loading === plan.id ? <span className="spinner" /> :
                    user?.plan === plan.id ? '✓ Current Plan' : plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Revenue breakdown section */}
      <section style={{ padding: '60px 0 100px' }}>
        <div className="container text-center">
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 12 }}>What's Included in Every Plan</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 40 }}>Two powerful tools, one subscription</p>
          <div style={styles.compareGrid}>
            <div style={styles.compareCard}>
              <span style={{ fontSize: '2.5rem' }}>🏗️</span>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '12px 0 8px' }}>Build</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                Create websites and mobile apps from 8 professional templates. Choose your style, download the code, deploy for free on Vercel. You own 100% of everything you build.
              </p>
            </div>
            <div style={styles.compareCard}>
              <span style={{ fontSize: '2.5rem' }}>🔧</span>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '12px 0 8px' }}>Repair</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                Scan any GitHub repo for bugs, crashes, memory leaks, and security issues. AI finds the problems, Moltbot creates a Pull Request with the fix. One click to merge.
              </p>
            </div>
          </div>

          {/* FAQ */}
          <div style={{ maxWidth: 600, margin: '60px auto 0', textAlign: 'left' }}>
            <h3 style={{ textAlign: 'center', fontSize: '1.3rem', fontWeight: 700, marginBottom: 24 }}>Frequently Asked Questions</h3>

            <div style={styles.faqItem}>
              <strong>Do I own the code I build?</strong>
              <p style={styles.faqAnswer}>Yes, 100%. Code generated by ZapCodes belongs entirely to you. Use it for personal or commercial projects — no attribution required on paid plans.</p>
            </div>
            <div style={styles.faqItem}>
              <strong>Can I cancel anytime?</strong>
              <p style={styles.faqAnswer}>Yes. No contracts, no hidden fees. Cancel from your profile page and you'll keep access until the end of your billing period.</p>
            </div>
            <div style={styles.faqItem}>
              <strong>Is the free tier really free?</strong>
              <p style={styles.faqAnswer}>Yes — forever. Build up to 3 projects and scan 5 repos per month at no cost. No credit card required to sign up.</p>
            </div>
            <div style={styles.faqItem}>
              <strong>Do I need to know how to code?</strong>
              <p style={styles.faqAnswer}>Not for the Build feature! Choose a template, customize it, and we give you the code + step-by-step deploy instructions. For Repair, you'll need a GitHub repo with existing code.</p>
            </div>
            <div style={styles.faqItem}>
              <strong>Where is my data stored?</strong>
              <p style={styles.faqAnswer}>Your account data is stored encrypted on MongoDB Atlas (AWS). Code you build is generated on-the-fly and downloaded to your device — we don't keep copies. Code you scan is analyzed and immediately purged.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <div className="container flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '1.2rem' }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>ZapCodes</span>
          </div>
          <div className="flex items-center gap-2" style={{ gap: 24 }}>
            <Link to="/privacy" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/terms" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Terms of Service</Link>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>©2026 ZapCodes. All rights reserved.</span>
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
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 16px', borderRadius: 100,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)',
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 24, maxWidth: 960, margin: '0 auto', alignItems: 'stretch',
  },
  planCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: 36,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', position: 'relative',
  },
  planPopular: {
    borderColor: 'var(--accent)', boxShadow: '0 0 40px rgba(0, 229, 160, 0.1)',
  },
  popularBadge: {
    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--accent)', color: '#06060b', padding: '4px 16px',
    borderRadius: 100, fontSize: '0.75rem', fontWeight: 700,
  },
  featureList: {
    listStyle: 'none', padding: 0, margin: '24px 0', width: '100%',
    display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left',
  },
  featureItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: '0.9rem', color: 'var(--text-secondary)',
  },
  compareGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 24, maxWidth: 700, margin: '0 auto',
  },
  compareCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: 32, textAlign: 'center',
  },
  faqItem: {
    padding: '16px 0', borderBottom: '1px solid var(--border)',
  },
  faqAnswer: {
    color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, marginTop: 8,
  },
  footer: {
    padding: '32px 0', borderTop: '1px solid var(--border)',
    position: 'relative', zIndex: 1,
  },
};
