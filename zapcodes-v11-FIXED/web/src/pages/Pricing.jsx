import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

const TIERS = [
  {
    id: 'free', name: 'FREE', price: 0, color: '#888', badge: null, icon: '🆓',
    rows: [
      { label: 'AI Model', value: 'Groq AI' },
      { label: 'Generations', value: '1 gen/day' },
      { label: 'Char Limit', value: '2,000 chars' },
      { label: 'Code Fixes', value: 'No fixes' },
      { label: 'Deployed Sites', value: '1 site' },
      { label: 'GitHub Push', value: 'No GitHub' },
      { label: 'PWA', value: 'No PWA', dim: true },
      { label: 'File Uploads', value: 'No uploads', dim: true },
      { label: 'Pro Developer', value: '—', dim: true },
      { label: 'Badge', value: 'Badge on sites', dim: true },
      { label: 'Daily BL Claim', value: '2K BL/day', highlight: true },
    ],
  },
  {
    id: 'bronze', name: 'BRONZE', price: 4.99, color: '#cd7f32', badge: null, icon: '🥉',
    rows: [
      { label: 'AI Model', value: 'Groq AI' },
      { label: 'Generations', value: '5 gens/day' },
      { label: 'Char Limit', value: '3,000 chars' },
      { label: 'Code Fixes', value: '3 fixes/day' },
      { label: 'Deployed Sites', value: '3 sites' },
      { label: 'GitHub Push', value: '3 push/day' },
      { label: 'PWA', value: 'No PWA', dim: true },
      { label: 'File Uploads', value: '200KB' },
      { label: 'Pro Developer', value: '—', dim: true },
      { label: 'Badge', value: 'Badge on sites', dim: true },
      { label: 'Daily BL Claim', value: '20K BL/day', highlight: true },
    ],
  },
  {
    id: 'silver', name: 'SILVER ⭐', price: 14.99, color: '#6366f1', badge: 'BEST VALUE', icon: '⭐',
    rows: [
      { label: 'AI Model', value: 'Haiku 4.5 ⚡', highlight: true },
      { label: 'Generations', value: '7 gens/day' },
      { label: 'Char Limit', value: '4,000 chars' },
      { label: 'Code Fixes', value: '10 fixes/day' },
      { label: 'Deployed Sites', value: '5 sites' },
      { label: 'GitHub Push', value: '10 push/day' },
      { label: 'PWA', value: 'No PWA', dim: true },
      { label: 'File Uploads', value: '500KB' },
      { label: 'Pro Developer', value: '—', dim: true },
      { label: 'Badge', value: 'Badge on sites', dim: true },
      { label: 'Daily BL Claim', value: '80K BL/day', highlight: true },
    ],
  },
  {
    id: 'gold', name: 'GOLD', price: 29.99, color: '#f59e0b', badge: null, icon: '👑',
    rows: [
      { label: 'AI Model', value: 'Haiku 4.5', highlight: true },
      { label: 'Generations', value: '15 gens/day' },
      { label: 'Char Limit', value: '5,000 chars' },
      { label: 'Code Fixes', value: '50 fixes/day' },
      { label: 'Deployed Sites', value: '15 sites' },
      { label: 'GitHub Push', value: '50 push/day' },
      { label: 'PWA', value: '✅ PWA', highlight: true },
      { label: 'File Uploads', value: '1MB' },
      { label: 'Pro Developer', value: '✅ Pro Dev', highlight: true },
      { label: 'Badge', value: 'Badge remove', highlight: true },
      { label: 'Daily BL Claim', value: '250K BL/day', highlight: true },
    ],
  },
  {
    id: 'diamond', name: 'DIAMOND', price: 99.99, color: '#06b6d4', badge: '💎 ULTIMATE', icon: '💎',
    rows: [
      { label: 'AI Model', value: 'Haiku + Opus 🧠', highlight: true },
      { label: 'Generations', value: 'Unlimited', highlight: true },
      { label: 'Char Limit', value: 'Model max', highlight: true },
      { label: 'Code Fixes', value: 'Unlimited', highlight: true },
      { label: 'Deployed Sites', value: 'Unlimited', highlight: true },
      { label: 'GitHub Push', value: 'Unlimited', highlight: true },
      { label: 'PWA', value: '✅ PWA', highlight: true },
      { label: 'File Uploads', value: 'Model max', highlight: true },
      { label: 'Pro Developer', value: '✅ Pro Dev', highlight: true },
      { label: 'Badge', value: 'Badge remove', highlight: true },
      { label: 'Daily BL Claim', value: '500K BL/day', highlight: true },
    ],
  },
];

const TOPUPS = [
  { id: '30k', coins: 30000, label: '30,000 BL', price: 4.99 },
  { id: '80k', coins: 80000, label: '80,000 BL', price: 9.99 },
  { id: '400k', coins: 400000, label: '400,000 BL', price: 14.99 },
  { id: '1m', coins: 1000000, label: '1,000,000 BL', price: 29.99 },
];

export default function Pricing() {
  const { user } = useContext(AuthContext);
  const [billing, setBilling] = useState('monthly');
  const [loading, setLoading] = useState(null);
  const [payProvider, setPayProvider] = useState('stripe');

  const handleSubscribe = async (plan) => {
    if (!user) return (window.location.href = '/register');
    if (plan === 'free' || plan === user?.plan) return;
    setLoading(plan);
    try {
      const { data } = await api.post('/api/stripe/create-checkout', { plan, interval: billing });
      if (data.url) window.location.href = data.url;
    } catch (err) { alert(err.response?.data?.error || 'Checkout failed'); }
    finally { setLoading(null); }
  };

  const handleTopup = async (pkgId) => {
    if (!user) return (window.location.href = '/register');
    setLoading(`topup-${pkgId}`);
    try {
      const { data } = await api.post('/api/coins/topup', { package: pkgId, provider: payProvider });
      if (data.url) window.location.href = data.url;
    } catch (err) { alert(err.response?.data?.error || 'Top-up failed'); }
    finally { setLoading(null); }
  };

  const displayPrice = (t) => {
    if (t.price === 0) return '$0';
    if (billing === 'yearly') return `$${(t.price * 10).toFixed(2)}`;
    return `$${t.price.toFixed(2)}`;
  };

  const isCurrent = (id) => user?.plan === id;

  return (
    <div style={st.page}>
      <div style={st.header}>
        <h1 style={st.h1}>Choose Your Plan</h1>
        <p style={st.subtitle}>Build unlimited websites with AI. Deploy instantly. Scale with BL coins.</p>
      </div>

      <div style={st.toggleWrap}>
        <button style={st.toggleBtn(billing === 'monthly')} onClick={() => setBilling('monthly')}>Monthly</button>
        <button style={st.toggleBtn(billing === 'yearly')} onClick={() => setBilling('yearly')}>Yearly</button>
        {billing === 'yearly' && <span style={st.saveBadge}>Save 17%</span>}
      </div>

      <div style={st.payToggle}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13, marginRight: 8 }}>Pay with:</span>
        <button style={st.payBtn(payProvider === 'stripe')} onClick={() => setPayProvider('stripe')}>💳 Stripe</button>
        <button style={st.payBtn(payProvider === 'xendit')} onClick={() => setPayProvider('xendit')}>🏦 Xendit</button>
      </div>

      <div style={st.tiersScroll}>
        <div style={st.tiersRow}>
          {TIERS.map((t) => {
            const current = isCurrent(t.id);
            const best = t.id === 'silver';
            return (
              <div key={t.id} style={st.card(best, current)}>
                {t.badge && <div style={st.cardBadge(t.id === 'silver' ? '#6366f1' : '#06b6d4')}>{t.badge}</div>}
                <div style={{ fontSize: 28, marginBottom: 6, textAlign: 'center' }}>{t.icon}</div>
                <div style={st.planName(t.color)}>{t.name}</div>
                <div style={st.planPrice}>{displayPrice(t)}</div>
                <div style={st.planPeriod}>{t.price === 0 ? 'forever' : `per ${billing === 'yearly' ? 'year' : 'month'}`}</div>

                <div style={st.featureList}>
                  {t.rows.map((r, i) => (
                    <div key={i} style={st.featureRow}>
                      <span style={st.featureLabel}>{r.label}</span>
                      <span style={st.featureValue(r.highlight, r.dim)}>{r.value}</span>
                    </div>
                  ))}
                </div>

                <button
                  style={st.ctaBtn(best, current, t.id === 'free')}
                  onClick={() => handleSubscribe(t.id)}
                  disabled={current || t.id === 'free' || loading === t.id}
                >
                  {loading === t.id ? '⏳ Loading...' : current ? '✓ Current Plan' : t.id === 'free' ? 'Free Forever' : best ? '⭐ Best Value' : '⬆️ Upgrade'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={st.topupSection}>
        <h2 style={st.topupH2}>🪙 BL Coin Top-Up</h2>
        <p style={st.topupSub}>Need more coins? Buy instantly. No subscription required.</p>
        <div style={st.topupGrid}>
          {TOPUPS.map((pkg) => (
            <div
              key={pkg.id}
              style={st.topupCard}
              onClick={() => handleTopup(pkg.id)}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={st.topupCoins}>{pkg.label}</div>
              <div style={st.topupPrice}>{loading === `topup-${pkg.id}` ? '⏳...' : `$${pkg.price.toFixed(2)}`}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Math.round(pkg.coins / pkg.price).toLocaleString()} BL/$</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 0' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          All plans include email support. Subscriptions can be cancelled anytime via the billing portal.
          <br />BL coins never expire and carry over between plan changes.
        </p>
      </div>
    </div>
  );
}

const st = {
  page: { padding: '40px 20px 60px', maxWidth: 1400, margin: '0 auto' },
  header: { textAlign: 'center', marginBottom: 28 },
  h1: { fontSize: 36, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.5px' },
  subtitle: { color: 'var(--text-secondary)', fontSize: 16, maxWidth: 500, margin: '0 auto' },
  toggleWrap: { display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16, alignItems: 'center' },
  toggleBtn: (active) => ({
    padding: '10px 24px', borderRadius: 24, border: 'none', cursor: 'pointer',
    fontWeight: 700, fontSize: 14, transition: 'all .2s',
    background: active ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--text-secondary)',
    boxShadow: active ? '0 2px 12px rgba(99,102,241,.3)' : 'none',
  }),
  saveBadge: { background: '#22c55e', color: '#fff', padding: '5px 12px', borderRadius: 14, fontSize: 12, fontWeight: 700, marginLeft: 4 },
  payToggle: { display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 28, alignItems: 'center' },
  payBtn: (active) => ({
    padding: '6px 16px', borderRadius: 16, border: active ? '1px solid #6366f1' : '1px solid var(--border)',
    cursor: 'pointer', fontWeight: 600, fontSize: 13,
    background: active ? 'rgba(99,102,241,.1)' : 'transparent',
    color: active ? '#6366f1' : 'var(--text-muted)', transition: 'all .2s',
  }),
  tiersScroll: { overflowX: 'auto', paddingBottom: 16, marginBottom: 48, WebkitOverflowScrolling: 'touch' },
  tiersRow: { display: 'flex', gap: 14, minWidth: 'max-content', justifyContent: 'center', padding: '16px 4px 4px' },
  card: (isBest, isCurrent) => ({
    width: 235, minWidth: 235, flexShrink: 0,
    background: isBest ? 'linear-gradient(165deg, rgba(99,102,241,.06), rgba(139,92,246,.06))' : 'var(--bg-card)',
    border: isBest ? '2px solid #6366f1' : isCurrent ? '2px solid #22c55e' : '1px solid var(--border)',
    borderRadius: 18, padding: '28px 18px 20px', position: 'relative', transition: 'transform .2s, box-shadow .2s',
    boxShadow: isBest ? '0 4px 24px rgba(99,102,241,.15)' : 'none',
  }),
  cardBadge: (bg) => ({
    position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
    background: `linear-gradient(135deg, ${bg}, ${bg}cc)`, color: '#fff',
    padding: '5px 18px', borderRadius: 14, fontSize: 11, fontWeight: 800,
    whiteSpace: 'nowrap', letterSpacing: '0.5px', boxShadow: `0 2px 10px ${bg}40`,
  }),
  planName: (c) => ({ fontSize: 16, fontWeight: 800, color: c, marginBottom: 4, textAlign: 'center', letterSpacing: '1px' }),
  planPrice: { fontSize: 34, fontWeight: 900, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1 },
  planPeriod: { color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginBottom: 16 },
  featureList: { display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 },
  featureRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  featureLabel: { color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 },
  featureValue: (hl, dim) => ({
    fontWeight: hl ? 700 : 500, fontSize: 12, textAlign: 'right',
    color: dim ? 'var(--text-muted)' : hl ? '#22c55e' : 'var(--text-primary)',
    opacity: dim ? 0.5 : 1,
  }),
  ctaBtn: (isBest, isCurrent, isFree) => ({
    width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
    cursor: isCurrent || isFree ? 'default' : 'pointer',
    fontWeight: 800, fontSize: 14, transition: 'all .2s',
    opacity: isCurrent ? 0.6 : 1,
    background: isBest ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : isCurrent ? 'rgba(34,197,94,.15)' : 'var(--bg-elevated)',
    color: isBest ? '#fff' : isCurrent ? '#22c55e' : 'var(--text-primary)',
    boxShadow: isBest ? '0 2px 12px rgba(99,102,241,.3)' : 'none',
  }),
  topupSection: { textAlign: 'center', marginBottom: 40 },
  topupH2: { fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 },
  topupSub: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 },
  topupGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, maxWidth: 820, margin: '0 auto' },
  topupCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
    padding: '22px 16px', cursor: 'pointer', transition: 'all .2s', textAlign: 'center',
  },
  topupCoins: { fontSize: 20, fontWeight: 800, color: '#f59e0b', marginBottom: 4 },
  topupPrice: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 },
};
