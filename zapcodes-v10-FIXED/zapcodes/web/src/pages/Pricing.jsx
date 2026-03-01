import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

const TIERS = [
  { id: 'free', name: 'Free', price: 0, color: '#888', badge: null, features: ['Groq AI (Llama)', '1 generation/day', '1,500 char limit', 'No code fixes', '1 deployed site', 'No GitHub push', 'No PWA', 'No file uploads', '—', 'Badge on sites', '2,000 BL/day'] },
  { id: 'bronze', name: 'Bronze', price: 4.99, color: '#cd7f32', badge: null, features: ['Groq AI (Llama)', '5 generations/day', '3,000 char limit', '3 code fixes/day', '3 deployed sites', '3 GitHub push/day', 'No PWA', '200KB uploads', '—', 'Badge on sites', '20,000 BL/day'] },
  { id: 'silver', name: 'Silver', price: 14.99, color: '#6366f1', badge: '⭐ BEST VALUE', features: ['Claude Haiku 4.5 ⚡', '7 generations/day', '4,000 char limit', '10 code fixes/day', '5 deployed sites', '10 GitHub push/day', 'No PWA', '500KB uploads', '—', 'Badge on sites', '80,000 BL/day'] },
  { id: 'gold', name: 'Gold', price: 29.99, color: '#f59e0b', badge: null, features: ['Claude Haiku 4.5', '15 generations/day', '5,000 char limit', '50 code fixes/day', '15 deployed sites', '50 GitHub push/day', '✅ PWA builds', '1MB uploads', '✅ Pro Developer', 'Badge removal (100K BL)', '250,000 BL/day'] },
  { id: 'diamond', name: 'Diamond', price: 99.99, color: '#06b6d4', badge: '💎 ULTIMATE', features: ['Haiku + Opus 4.6 🧠', 'Unlimited generations', 'Model maximum', 'Unlimited fixes', 'Unlimited sites', 'Unlimited pushes', '✅ PWA builds', 'Model max', '✅ Pro Developer', 'No badge', '500,000 BL/day'] },
];

const LABELS = ['AI Model', 'Generations', 'Char Limit', 'Code Fixes', 'Deployed Sites', 'GitHub Push', 'PWA', 'File Uploads', 'Pro Developer', 'Badge', 'Daily BL Claim'];

const TOPUPS = [
  { id: '30k', coins: '30,000 BL', price: '$4.99' },
  { id: '80k', coins: '80,000 BL', price: '$9.99' },
  { id: '400k', coins: '400,000 BL', price: '$14.99' },
  { id: '1m', coins: '1,000,000 BL', price: '$29.99' },
];

export default function Pricing() {
  const { user } = useContext(AuthContext);
  const [billing, setBilling] = useState('monthly');
  const [loading, setLoading] = useState(null);

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

  const handleTopup = async (pkg) => {
    if (!user) return (window.location.href = '/register');
    setLoading(`topup-${pkg}`);
    try {
      const { data } = await api.post('/api/coins/topup', { package: pkg, provider: 'stripe' });
      if (data.url) window.location.href = data.url;
    } catch (err) { alert(err.response?.data?.error || 'Top-up failed'); }
    finally { setLoading(null); }
  };

  const displayPrice = (t) => t.price === 0 ? '$0' : billing === 'yearly' ? `$${(t.price * 10).toFixed(2)}` : `$${t.price}`;

  const s = {
    page: { padding: '40px 20px', maxWidth: 1300, margin: '0 auto' },
    h1: { fontSize: 32, fontWeight: 700, textAlign: 'center', marginBottom: 8, color: 'var(--text-primary)' },
    sub: { textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 32, fontSize: 16 },
    toggle: { display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 32, alignItems: 'center' },
    tBtn: (a) => ({ padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: a ? 'var(--accent)' : 'var(--bg-card)', color: a ? '#fff' : 'var(--text-secondary)', transition: 'all .2s' }),
    save: { background: '#22c55e', color: '#fff', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 48 },
    card: (t, cur) => ({ background: t.badge === '⭐ BEST VALUE' ? 'linear-gradient(135deg, rgba(99,102,241,.08), rgba(139,92,246,.08))' : 'var(--bg-card)', border: t.badge === '⭐ BEST VALUE' ? '2px solid #6366f1' : cur ? '2px solid var(--accent)' : '1px solid var(--border)', borderRadius: 16, padding: 24, position: 'relative', transition: 'transform .2s' }),
    badge: (c) => ({ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: c === '#6366f1' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'linear-gradient(135deg, #06b6d4, #0ea5e9)', color: '#fff', padding: '4px 16px', borderRadius: 12, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }),
    name: (c) => ({ fontSize: 20, fontWeight: 700, color: c, marginBottom: 4 }),
    price: { fontSize: 36, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 },
    period: { color: 'var(--text-secondary)', fontSize: 13 },
    ul: { listStyle: 'none', padding: 0, margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 10 },
    li: (hl) => ({ fontSize: 13, color: hl ? 'var(--text-primary)' : 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', gap: 8 }),
    lbl: { color: 'var(--text-muted)', fontSize: 12 },
    val: { fontWeight: 600, textAlign: 'right' },
    btn: (pr, dis) => ({ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', cursor: dis ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, transition: 'all .2s', opacity: dis ? .5 : 1, background: pr ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--bg-elevated)', color: pr ? '#fff' : 'var(--text-primary)' }),
    topH: { fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 8, color: 'var(--text-primary)', marginTop: 16 },
    topS: { textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 },
    topG: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, maxWidth: 900, margin: '0 auto' },
    topC: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, textAlign: 'center', cursor: 'pointer', transition: 'all .2s' },
    topCoins: { fontSize: 18, fontWeight: 700, color: '#f59e0b', marginBottom: 4 },
    topPrice: { fontSize: 14, color: 'var(--text-secondary)' },
  };

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Choose Your Plan</h1>
      <p style={s.sub}>Build unlimited websites with AI. Deploy instantly.</p>
      <div style={s.toggle}>
        <button style={s.tBtn(billing === 'monthly')} onClick={() => setBilling('monthly')}>Monthly</button>
        <button style={s.tBtn(billing === 'yearly')} onClick={() => setBilling('yearly')}>Yearly</button>
        {billing === 'yearly' && <span style={s.save}>Save 17%</span>}
      </div>
      <div style={s.grid}>
        {TIERS.map(t => {
          const cur = user?.plan === t.id;
          return (
            <div key={t.id} style={s.card(t, cur)}>
              {t.badge && <div style={s.badge(t.color)}>{t.badge}</div>}
              <div style={s.name(t.color)}>{t.name}</div>
              <div style={s.price}>{displayPrice(t)}</div>
              <div style={s.period}>{t.price === 0 ? 'forever' : `per ${billing === 'yearly' ? 'year' : 'month'}`}</div>
              <ul style={s.ul}>
                {t.features.map((f, i) => (
                  <li key={i} style={s.li(f.startsWith('✅') || f.includes('⚡') || f.includes('🧠'))}>
                    <span style={s.lbl}>{LABELS[i]}</span>
                    <span style={s.val}>{f}</span>
                  </li>
                ))}
              </ul>
              <button style={s.btn(t.badge === '⭐ BEST VALUE' || t.id === 'diamond', cur || t.id === 'free')} onClick={() => handleSubscribe(t.id)} disabled={cur || t.id === 'free' || loading === t.id}>
                {loading === t.id ? 'Loading...' : cur ? '✓ Current Plan' : t.id === 'free' ? 'Free Forever' : 'Upgrade'}
              </button>
            </div>
          );
        })}
      </div>
      <h2 style={s.topH}>🪙 BL Coin Top-Up</h2>
      <p style={s.topS}>Need more coins? Buy instantly.</p>
      <div style={s.topG}>
        {TOPUPS.map(p => (
          <div key={p.id} style={s.topC} onClick={() => handleTopup(p.id)}>
            <div style={s.topCoins}>{p.coins}</div>
            <div style={s.topPrice}>{loading === `topup-${p.id}` ? 'Loading...' : p.price}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
