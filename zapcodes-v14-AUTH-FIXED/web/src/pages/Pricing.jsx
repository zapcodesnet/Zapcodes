import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

const TIERS = [
  {
    id: 'free', name: 'FREE', price: 0, color: '#888', badge: null, icon: '🆓',
    rows: [
      { label: 'AI Models', value: '', header: true },
      { label: '• Gemini 2.5 Flash', value: '3 gen (trial)', dim: true },
      { label: '• Groq AI', value: '20 gen/mo' },
      { label: 'Char Limit', value: '2,000 chars' },
      { label: 'Features', value: '', header: true },
      { label: 'Deployed Sites', value: '1 site' },
      { label: 'Code Fixes', value: '1 (trial)', dim: true },
      { label: 'GitHub Push', value: '1 (trial)', dim: true },
      { label: 'File Uploads', value: 'None', dim: true },
      { label: 'Pro Developer', value: '—', dim: true },
      { label: 'Badge Remove', value: '—', dim: true },
      { label: 'Daily BL Claim', value: '2K BL/day', highlight: true },
      { label: 'BlendLink', value: '', header: true },
      { label: 'Photo Minting', value: '5/day' },
      { label: 'Member Pages', value: '1 page' },
      { label: 'Listings', value: '300/mo' },
      { label: 'Referral', value: '2% / 1%' },
      { label: 'XP Multiplier', value: '×1' },
    ],
  },
  {
    id: 'bronze', name: 'BRONZE', price: 4.99, color: '#cd7f32', badge: null, icon: '🥉',
    rows: [
      { label: 'AI Models', value: '', header: true },
      { label: '• Gemini 3.1 Pro', value: '3 gen (trial)', dim: true },
      { label: '• Gemini 2.5 Flash', value: '200 gen/mo' },
      { label: '• Groq AI', value: '500 gen/mo' },
      { label: 'Char Limit', value: '3,000 chars' },
      { label: 'Features', value: '', header: true },
      { label: 'Deployed Sites', value: '3 sites' },
      { label: 'Code Fixes', value: '90/mo' },
      { label: 'GitHub Push', value: '90/mo' },
      { label: 'File Uploads', value: '200KB' },
      { label: 'Pro Developer', value: '—', dim: true },
      { label: 'Badge Remove', value: '—', dim: true },
      { label: 'Daily BL Claim', value: '20K BL/day', highlight: true },
      { label: 'BlendLink', value: '', header: true },
      { label: 'Photo Minting', value: '20/day' },
      { label: 'Member Pages', value: '3 pages' },
      { label: 'Listings', value: '2,000/mo' },
      { label: 'Referral', value: '3% / 2%' },
      { label: 'XP Multiplier', value: '×2' },
    ],
  },
  {
    id: 'silver', name: 'SILVER', price: 14.99, color: '#c0c0c0', badge: null, icon: '⭐',
    rows: [
      { label: 'AI Models', value: '', header: true },
      { label: '• Gemini 3.1 Pro', value: '50 gen/mo', highlight: true },
      { label: '• Gemini 2.5 Flash', value: '500 gen/mo' },
      { label: '• Haiku 4.5', value: '400 gen/mo', highlight: true },
      { label: '• Groq AI', value: '1,000 gen/mo' },
      { label: 'Char Limit', value: '4,000 chars' },
      { label: 'Features', value: '', header: true },
      { label: 'Deployed Sites', value: '5 sites' },
      { label: 'Code Fixes', value: '300/mo' },
      { label: 'GitHub Push', value: '300/mo' },
      { label: 'File Uploads', value: '500KB' },
      { label: 'Pro Developer', value: '—', dim: true },
      { label: 'Badge Remove', value: '✅ Yes', highlight: true },
      { label: 'Daily BL Claim', value: '80K BL/day', highlight: true },
      { label: 'BlendLink', value: '', header: true },
      { label: 'Photo Minting', value: '50/day' },
      { label: 'Member Pages', value: '10 pages' },
      { label: 'Listings', value: '10,000/mo' },
      { label: 'Referral', value: '3% / 2%' },
      { label: 'XP Multiplier', value: '×3' },
    ],
  },
  {
    id: 'gold', name: 'GOLD', price: 39.99, color: '#f59e0b', badge: '🔥 MOST POPULAR', icon: '👑',
    rows: [
      { label: 'AI Models', value: '', header: true },
      { label: '• Gemini 3.1 Pro', value: '120 gen/mo', highlight: true },
      { label: '• Sonnet 4.6 🧠', value: '100 gen/mo', highlight: true },
      { label: '• Gemini 2.5 Flash', value: '1,000 gen/mo' },
      { label: '• Haiku 4.5', value: '800 gen/mo', highlight: true },
      { label: '• Groq AI', value: '2,000 gen/mo' },
      { label: 'Char Limit', value: '5,000 chars' },
      { label: 'Features', value: '', header: true },
      { label: 'Deployed Sites', value: '15 sites' },
      { label: 'Code Fixes', value: '1,500/mo', highlight: true },
      { label: 'GitHub Push', value: '1,500/mo', highlight: true },
      { label: 'File Uploads', value: '1MB' },
      { label: 'Pro Developer', value: '✅ Pro Dev', highlight: true },
      { label: 'Badge Remove', value: '✅ Yes', highlight: true },
      { label: 'Daily BL Claim', value: '200K BL/day', highlight: true },
      { label: 'BlendLink', value: '', header: true },
      { label: 'Photo Minting', value: '150/day' },
      { label: 'Member Pages', value: '25 pages' },
      { label: 'Listings', value: '25,000/mo' },
      { label: 'Referral', value: '3% / 2%' },
      { label: 'XP Multiplier', value: '×4' },
    ],
  },
  {
    id: 'diamond', name: 'DIAMOND', price: 99.99, color: '#06b6d4', badge: '💎 BEST VALUE', icon: '💎',
    rows: [
      { label: 'AI Models', value: '', header: true },
      { label: '• Gemini 3.1 Pro', value: 'Unlimited', highlight: true },
      { label: '• Sonnet 4.6 🧠', value: 'Unlimited', highlight: true },
      { label: '• Gemini 2.5 Flash', value: 'Unlimited', highlight: true },
      { label: '• Haiku 4.5', value: 'Unlimited', highlight: true },
      { label: '• Groq AI', value: 'Unlimited', highlight: true },
      { label: 'Char Limit', value: 'Model max', highlight: true },
      { label: 'Features', value: '', header: true },
      { label: 'Deployed Sites', value: 'Unlimited', highlight: true },
      { label: 'Code Fixes', value: 'Unlimited', highlight: true },
      { label: 'GitHub Push', value: 'Unlimited', highlight: true },
      { label: 'File Uploads', value: 'Model max', highlight: true },
      { label: 'Pro Developer', value: '✅ Pro Dev', highlight: true },
      { label: 'Badge Remove', value: '✅ Yes', highlight: true },
      { label: 'Daily BL Claim', value: '500K BL/day', highlight: true },
      { label: 'BlendLink', value: '', header: true },
      { label: 'Photo Minting', value: 'Unlimited', highlight: true },
      { label: 'Member Pages', value: 'Unlimited', highlight: true },
      { label: 'Listings', value: 'Unlimited', highlight: true },
      { label: 'Referral', value: '4% / 3%', highlight: true },
      { label: 'XP Multiplier', value: '×5', highlight: true },
    ],
  },
];

const TOPUPS = [
  { id: 'starter', coins: 50000, label: '50,000 BL', price: 4.99 },
  { id: 'popular', coins: 150000, label: '150,000 BL', price: 9.99 },
  { id: 'best_value', coins: 400000, label: '400,000 BL', price: 14.99 },
  { id: 'ultimate', coins: 1000000, label: '1,000,000 BL', price: 29.99, multiplier: true },
];

const BL_COSTS_INFO = [
  { model: 'Sonnet 4.6', gen: '60,000 BL', fix: '60,000 BL' },
  { model: 'Gemini 3.1 Pro', gen: '50,000 BL', fix: '50,000 BL' },
  { model: 'Haiku 4.5', gen: '20,000 BL', fix: '20,000 BL' },
  { model: 'Gemini 2.5 Flash', gen: '10,000 BL', fix: '10,000 BL' },
  { model: 'Groq AI', gen: '5,000 BL', fix: '5,000 BL' },
  { model: 'GitHub Push', gen: '2,000 BL', fix: '—' },
  { model: 'Badge Removal', gen: '50,000 BL', fix: '—' },
];

export default function Pricing() {
  const { user } = useContext(AuthContext);
  const [billing, setBilling] = useState('monthly');
  const [loading, setLoading] = useState(null);
  const [payProvider, setPayProvider] = useState('stripe');
  const [ultimateQty, setUltimateQty] = useState(1);
  const [showBLCosts, setShowBLCosts] = useState(false);

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

  // FIX: Now sends quantity for the ultimate package multiplier
  const handleTopup = async (pkg) => {
    if (!user) return (window.location.href = '/register');
    const topupId = pkg.id;
    const qty = pkg.multiplier ? ultimateQty : 1;
    setLoading(`topup-${topupId}`);
    try {
      const { data } = await api.post('/api/coins/topup', { package: topupId, quantity: qty, provider: payProvider });
      if (data.url) window.location.href = data.url;
    } catch (err) { alert(err.response?.data?.error || 'Top-up failed'); }
    finally { setLoading(null); }
  };

  const displayPrice = (t) => {
    if (t.price === 0) return '$0';
    if (billing === 'yearly') return `$${(t.price * 12).toFixed(2)}`;
    return `$${t.price.toFixed(2)}`;
  };

  const isCurrent = (id) => (user?.plan === id || user?.subscription_tier === id);

  return (
    <div style={st.page}>
      <div style={st.header}>
        <h1 style={st.h1}>Choose Your Plan</h1>
        <p style={st.subtitle}>Build unlimited websites with AI. Deploy instantly. One subscription covers both ZapCodes + BlendLink.</p>
        <p style={st.signupBonus}>🎁 New members receive <span style={{ color: '#f59e0b', fontWeight: 800 }}>50,000 BL</span> sign-up bonus!</p>
      </div>

      <div style={st.toggleWrap}>
        <button style={st.toggleBtn(billing === 'monthly')} onClick={() => setBilling('monthly')}>Monthly</button>
        <button style={st.toggleBtn(billing === 'yearly')} onClick={() => setBilling('yearly')}>Yearly</button>
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
            const best = t.id === 'gold';
            return (
              <div key={t.id} style={st.card(best, current)}>
                {t.badge && <div style={st.cardBadge(t.id === 'gold' ? '#f59e0b' : '#06b6d4')}>{t.badge}</div>}
                <div style={{ fontSize: 28, marginBottom: 6, textAlign: 'center' }}>{t.icon}</div>
                <div style={st.planName(t.color)}>{t.name}</div>
                <div style={st.planPrice}>{displayPrice(t)}</div>
                <div style={st.planPeriod}>{t.price === 0 ? 'forever' : `per ${billing === 'yearly' ? 'year' : 'month'}`}</div>

                <div style={st.featureList}>
                  {t.rows.map((r, i) => (
                    r.header ? (
                      <div key={i} style={st.sectionHeader}>{r.label}</div>
                    ) : (
                      <div key={i} style={st.featureRow}>
                        <span style={st.featureLabel}>{r.label}</span>
                        <span style={st.featureValue(r.highlight, r.dim)}>{r.value}</span>
                      </div>
                    )
                  ))}
                </div>

                <button
                  style={st.ctaBtn(best, current, t.id === 'free')}
                  onClick={() => handleSubscribe(t.id)}
                  disabled={current || t.id === 'free' || loading === t.id}
                >
                  {loading === t.id ? '⏳ Loading...' : current ? '✓ Current Plan' : t.id === 'free' ? 'Free Forever' : best ? '🔥 Most Popular' : '⬆️ Upgrade'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── BL Coin Top-Up Section ── */}
      <div style={st.topupSection}>
        <h2 style={st.topupH2}>🪙 BL Coin Top-Up</h2>
        <p style={st.topupSub}>Need more AI generations? Buy BL Coins instantly. No subscription required.</p>
        <p style={st.topupNote}>All AI generations, fixes, and pushes consume BL Coins.</p>
        <div style={st.topupGrid}>
          {TOPUPS.map((pkg) => (
            <div
              key={pkg.id}
              style={st.topupCard}
              onClick={() => handleTopup(pkg)}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {pkg.id === 'best_value' && <div style={{ ...st.cardBadge('#22c55e'), fontSize: 10, padding: '3px 10px' }}>BEST VALUE</div>}
              <div style={st.topupCoins}>{pkg.label}</div>
              <div style={st.topupPrice}>{loading === `topup-${pkg.id}` ? '⏳...' : `$${pkg.price.toFixed(2)}`}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Math.round(pkg.coins / pkg.price).toLocaleString()} BL/$</div>
              {pkg.multiplier && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Qty:</span>
                  <select
                    value={ultimateQty}
                    onChange={(e) => { e.stopPropagation(); setUltimateQty(parseInt(e.target.value)); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px', fontSize: 12 }}
                  >
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <option key={n} value={n}>{n}× ({(n * pkg.coins / 1000000).toFixed(1)}M BL)</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── BL Coin Costs Table ── */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <button
          onClick={() => setShowBLCosts(!showBLCosts)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 20px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          {showBLCosts ? '▼ Hide' : '▶ Show'} BL Coin Costs Per Action
        </button>
        {showBLCosts && (
          <div style={{ maxWidth: 500, margin: '16px auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', flex: 1 }}>Action</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', width: 90, textAlign: 'right' }}>Generation</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', width: 90, textAlign: 'right' }}>Code Fix</span>
            </div>
            {BL_COSTS_INFO.map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < BL_COSTS_INFO.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1 }}>{row.model}</span>
                <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, width: 90, textAlign: 'right' }}>{row.gen}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 90, textAlign: 'right' }}>{row.fix}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 0' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          One subscription covers both <strong>ZapCodes</strong> (AI website builder) and <strong>BlendLink</strong> (social commerce).
          <br />All plans include email support. Subscriptions can be cancelled anytime via the billing portal.
          <br />BL coins never expire and carry over between plan changes.
          <br />AI generation counts reset monthly. One-time trials never reset.
        </p>
      </div>
    </div>
  );
}

const st = {
  page: { padding: '40px 20px 60px', maxWidth: 1400, margin: '0 auto' },
  header: { textAlign: 'center', marginBottom: 28 },
  h1: { fontSize: 36, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.5px' },
  subtitle: { color: 'var(--text-secondary)', fontSize: 16, maxWidth: 560, margin: '0 auto', marginBottom: 8 },
  signupBonus: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 0 },
  toggleWrap: { display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16, alignItems: 'center' },
  toggleBtn: (active) => ({
    padding: '10px 24px', borderRadius: 24, border: 'none', cursor: 'pointer',
    fontWeight: 700, fontSize: 14, transition: 'all .2s',
    background: active ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--text-secondary)',
    boxShadow: active ? '0 2px 12px rgba(99,102,241,.3)' : 'none',
  }),
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
    background: isBest ? 'linear-gradient(165deg, rgba(245,158,11,.04), rgba(245,158,11,.08))' : 'var(--bg-card)',
    border: isBest ? '2px solid #f59e0b' : isCurrent ? '2px solid #22c55e' : '1px solid var(--border)',
    borderRadius: 18, padding: '28px 18px 20px', position: 'relative', transition: 'transform .2s, box-shadow .2s',
    boxShadow: isBest ? '0 4px 24px rgba(245,158,11,.15)' : 'none',
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
  sectionHeader: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: 8, marginBottom: 2, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 4 },
  featureList: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 18 },
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
    background: isBest ? 'linear-gradient(135deg, #f59e0b, #d97706)' : isCurrent ? 'rgba(34,197,94,.15)' : 'var(--bg-elevated)',
    color: isBest ? '#fff' : isCurrent ? '#22c55e' : 'var(--text-primary)',
    boxShadow: isBest ? '0 2px 12px rgba(245,158,11,.3)' : 'none',
  }),
  topupSection: { textAlign: 'center', marginBottom: 40 },
  topupH2: { fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 },
  topupSub: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 4 },
  topupNote: { color: 'var(--text-muted)', fontSize: 12, marginBottom: 24 },
  topupGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, maxWidth: 820, margin: '0 auto' },
  topupCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
    padding: '22px 16px', cursor: 'pointer', transition: 'all .2s', textAlign: 'center', position: 'relative',
  },
  topupCoins: { fontSize: 20, fontWeight: 800, color: '#f59e0b', marginBottom: 4 },
  topupPrice: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 },
};
