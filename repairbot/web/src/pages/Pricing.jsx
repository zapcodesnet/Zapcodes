import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    features: ['5 scans/month', 'Ollama engine', '3 Moltbot fixes/month', 'Community support', 'Public repos only'],
    cta: 'Current Plan',
    id: 'free',
    popular: false,
  },
  {
    name: 'Starter',
    price: '$9',
    period: '/month',
    features: ['50 scans/month', 'Ollama + Claude engines', '20 Moltbot fixes/month', 'Priority support', 'Private repos', 'Issue export (CSV)'],
    cta: 'Upgrade to Starter',
    id: 'starter',
    popular: true,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    features: ['Unlimited scans', 'All AI engines', 'Unlimited Moltbot fixes', 'Priority support', 'Private repos', 'Team collaboration', 'Custom rules', 'Webhook integrations'],
    cta: 'Upgrade to Pro',
    id: 'pro',
    popular: false,
  },
];

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
            <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>RepairBot</span>
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/dashboard" className="btn btn-ghost">Dashboard</Link>
            ) : (
              <Link to="/login" className="btn btn-ghost">Sign In</Link>
            )}
          </div>
        </div>
      </nav>

      <section style={{ paddingTop: 140, paddingBottom: 100 }}>
        <div className="container text-center">
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: 12 }}>
            Simple, Transparent Pricing
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: 56 }}>
            Start free. Upgrade when you need more power.
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
                    <li key={f} style={styles.featureItem}>
                      <span style={{ color: 'var(--accent)' }}>✓</span> {f}
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
    </div>
  );
}

const styles = {
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    background: 'rgba(6, 6, 11, 0.85)', backdropFilter: 'blur(16px)',
    borderBottom: '1px solid var(--border)',
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 24, maxWidth: 960, margin: '0 auto', alignItems: 'stretch',
  },
  planCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: 36,
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
};
