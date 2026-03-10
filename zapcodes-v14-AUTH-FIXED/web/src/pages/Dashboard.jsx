import { useState, useEffect, useContext, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

const TIER_COLORS = { free: '#888', bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' };
const TIER_LABELS = { free: 'FREE', bronze: 'BRONZE', silver: 'SILVER', gold: 'GOLD 👑', diamond: 'DIAMOND 💎' };
const TIER_PRICES = { free: '$0', bronze: '$4.99', silver: '$14.99', gold: '$39.99', diamond: '$99.99' };

function formatCountdown(seconds) {
  if (seconds <= 0) return 'Ready!';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), sec = seconds % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`;
}

function formatBL(n) {
  if (n == null) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return n.toLocaleString();
}

function formatCap(n) {
  if (n == null || n === 0) return '0';
  if (n === 'unlimited' || n >= 999999999 || !isFinite(n)) return '∞';
  return n.toLocaleString();
}

export default function Dashboard() {
  const { user, setUser } = useContext(AuthContext);
  const [coinData, setCoinData] = useState(null);
  const [usageData, setUsageData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [sites, setSites] = useState([]);
  const [countdown, setCountdown] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [balRes, txRes, siteRes] = await Promise.all([
        api.get('/api/coins/balance'),
        api.get('/api/coins/transactions'),
        api.get('/api/build/sites'),
      ]);
      setCoinData(balRes.data);
      setCountdown(balRes.data.nextClaimIn || 0);
      setTransactions(txRes.data.transactions || []);
      setSites(siteRes.data.sites || []);
    } catch (err) { console.error('Dashboard fetch error:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const { data } = await api.post('/api/coins/claim');
      setCoinData(prev => ({ ...prev, balance: data.balance, canClaim: false }));
      setCountdown(data.nextClaimIn || 86400);
      if (data.bonus) alert(`🎉 Signup bonus: +${data.bonus.toLocaleString()} BL!`);
      alert(`✅ Claimed ${(data.claimed || 0).toLocaleString()} BL!`);
      fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Claim failed'); }
    finally { setClaiming(false); }
  };

  const handleDeleteSite = async (subdomain) => {
    if (!confirm(`Delete ${subdomain}.zapcodes.net?`)) return;
    try {
      await api.delete(`/api/build/site/${subdomain}`);
      setSites(s => s.filter(site => site.subdomain !== subdomain));
    } catch (err) { alert('Delete failed'); }
  };

  const handleManageBilling = async () => {
    try {
      const { data } = await api.post('/api/stripe/portal');
      if (data.url) window.location.href = data.url;
    } catch (err) { alert(err.response?.data?.error || 'Could not open billing portal'); }
  };

  const plan = usageData?.tier || coinData?.plan || user?.subscription_tier || user?.plan || 'free';
  const tc = coinData?.tierConfig || {};
  const balance = usageData?.bl_coins ?? coinData?.balance ?? 0;
  const dailyClaim = usageData?.daily_bl_claim || tc.dailyClaim || 0;

  // Monthly usage from new usage endpoint
  const models = usageData?.models || [];
  const fixesUsed = usageData?.fixes?.used || 0;
  const fixesLimit = usageData?.fixes?.limit || 0;
  const pushesUsed = usageData?.github_pushes?.used || 0;
  const pushesLimit = usageData?.github_pushes?.limit || 0;
  const resetsOn = usageData?.resets_on || '';
  const maxChars = usageData?.max_characters || tc.maxChars || 2000;
  const maxSites = usageData?.max_deployed_sites || tc.maxSites || 1;
  const canPWA = usageData?.can_pwa ?? tc.canPWA ?? false;
  const canProDev = usageData?.pro_developer ?? tc.canProDev ?? false;
  const badgeRemovable = usageData?.badge_removable ?? tc.canRemoveBadge ?? false;

  const canClaim = usageData?.can_claim_daily ?? (coinData?.canClaim && countdown <= 0);

  const referralLink = `https://zapcodes.net/register?ref=${user?.referralCode || user?.referral_code || ''}`;

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading dashboard...</div>;

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.headerRow}>
        <h1 style={s.h1}>Dashboard</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={s.tierBadge(plan)}>{TIER_LABELS[plan] || plan.toUpperCase()}</span>
          <span style={s.priceBadge}>{TIER_PRICES[plan] || '$0'}/mo</span>
          {plan !== 'free' && (
            <button style={s.billingBtn} onClick={handleManageBilling}>Manage Billing</button>
          )}
        </div>
      </div>

      {/* Top Cards Grid */}
      <div style={s.grid}>
        {/* BL Balance Card */}
        <div style={s.card}>
          <div style={s.cardTitle}>🪙 BL Coin Balance</div>
          <div style={s.bigNum}>{balance.toLocaleString()}</div>
          <div style={s.claimInfo}>
            Daily claim: <strong style={{ color: '#f59e0b' }}>{formatBL(dailyClaim)} BL</strong>
          </div>
          <button
            style={s.claimBtn(canClaim)}
            onClick={canClaim ? handleClaim : undefined}
            disabled={!canClaim || claiming}
          >
            {claiming
              ? '⏳ Claiming...'
              : canClaim
                ? `🎉 Claim ${formatBL(dailyClaim)} BL!`
                : `Next claim in ${formatCountdown(countdown)}`}
          </button>
          <a href="/pricing" style={{ display: 'block', marginTop: 10, textAlign: 'center', color: '#f59e0b', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
            🪙 Buy more BL Coins →
          </a>
        </div>

        {/* Monthly AI Usage Card */}
        <div style={s.card}>
          <div style={s.cardTitle}>📊 Monthly AI Usage</div>
          {resetsOn && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>Resets on {resetsOn}</div>}

          {models.length > 0 ? (
            models.map((m, i) => {
              const pct = m.limit === 'unlimited' ? 0 : (m.used / (m.limit || 1)) * 100;
              const isTrialExhausted = m.type === 'one_time_trial' && m.remaining === 0;
              return (
                <div key={i} style={{ marginBottom: i < models.length - 1 ? 14 : 0 }}>
                  <div style={s.usageRow}>
                    <span>
                      {m.label}
                      {m.type === 'one_time_trial' && <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 4 }}>(trial)</span>}
                    </span>
                    <span style={{ fontWeight: 700, color: isTrialExhausted ? '#ef4444' : 'var(--text-primary)' }}>
                      {m.used} / {formatCap(m.limit)}
                    </span>
                  </div>
                  <div style={s.progressBar}>
                    <div style={s.progressFill(pct, isTrialExhausted ? '#ef4444' : '#6366f1')} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{formatBL(m.bl_cost_gen)} BL/gen</span>
                    <span>{formatCap(m.remaining)} remaining</span>
                  </div>
                </div>
              );
            })
          ) : (
            <>
              <div style={s.usageRow}><span>Generations</span><span style={{ fontWeight: 700 }}>{coinData?.dailyUsage?.generations || 0}</span></div>
              <div style={s.progressBar}><div style={s.progressFill(0, '#6366f1')} /></div>
            </>
          )}

          {/* Fixes & Pushes */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={s.usageRow}>
              <span>Code Fixes</span>
              <span style={{ fontWeight: 700 }}>{fixesUsed} / {formatCap(fixesLimit)}</span>
            </div>
            <div style={s.progressBar}><div style={s.progressFill(fixesLimit === 'unlimited' ? 0 : (fixesUsed / (fixesLimit || 1)) * 100, '#8b5cf6')} /></div>

            <div style={{ ...s.usageRow, marginTop: 14 }}>
              <span>GitHub Pushes</span>
              <span style={{ fontWeight: 700 }}>{pushesUsed} / {formatCap(pushesLimit)}</span>
            </div>
            <div style={s.progressBar}><div style={s.progressFill(pushesLimit === 'unlimited' ? 0 : (pushesUsed / (pushesLimit || 1)) * 100, '#22c55e')} /></div>
          </div>

          {/* Tier limits summary */}
          <div style={s.limitsBox}>
            <div style={s.limitRow}><span>Max chars</span><span>{formatCap(maxChars)}</span></div>
            <div style={s.limitRow}><span>Max sites</span><span>{formatCap(maxSites)}</span></div>
            <div style={s.limitRow}><span>PWA</span><span>{canPWA ? '✅' : '—'}</span></div>
            <div style={s.limitRow}><span>Pro Dev</span><span>{canProDev ? '✅' : '—'}</span></div>
            <div style={s.limitRow}><span>Badge Remove</span><span>{badgeRemovable ? '✅' : '—'}</span></div>
          </div>
        </div>

        {/* Referral Card */}
        <div style={s.card}>
          <div style={s.cardTitle}>🔗 Referrals ({user?.referralCount || user?.referral_count || 0})</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Share your link — both earn <strong style={{ color: '#f59e0b' }}>50,000 BL</strong>!</p>
          <div style={s.refBox}>
            <span style={s.refLink}>{referralLink}</span>
            <button style={s.copyBtn} onClick={() => { navigator.clipboard.writeText(referralLink); alert('Copied!'); }}>Copy</button>
          </div>
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10 }}>
            <div style={s.limitRow}><span>Direct referrals</span><span style={{ fontWeight: 700 }}>{user?.direct_referrals || 0}</span></div>
            <div style={s.limitRow}><span>Commissions (L1)</span><span style={{ fontWeight: 700 }}>{plan === 'diamond' ? '4%' : plan === 'free' ? '2%' : '3%'}</span></div>
            <div style={s.limitRow}><span>Commissions (L2)</span><span style={{ fontWeight: 700 }}>{plan === 'diamond' ? '3%' : plan === 'free' ? '1%' : '2%'}</span></div>
          </div>
          {plan !== 'diamond' && (
            <a href="/pricing" style={s.upgradeLink}>⬆️ Upgrade for more BL & features →</a>
          )}
        </div>
      </div>

      {/* Deployed Sites */}
      <div style={{ ...s.card, marginBottom: 24 }}>
        <div style={s.cardTitle}>🌐 Deployed Sites ({sites.length} / {formatCap(maxSites)})</div>
        {sites.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            No sites deployed yet. <a href="/build" style={{ color: '#6366f1', fontWeight: 600 }}>Build one →</a>
          </p>
        ) : (
          <div>
            {sites.map(site => (
              <div key={site.subdomain} style={s.siteCard}>
                <div>
                  <a href={`https://${site.subdomain}.zapcodes.net`} target="_blank" rel="noreferrer" style={s.siteUrl}>
                    {site.subdomain}.zapcodes.net
                  </a>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {site.title || site.subdomain}
                    {site.hasBadge ? ' · Badge' : ' · No badge'}
                    {site.isPWA ? ' · PWA' : ''}
                    {site.lastUpdated ? ` · Updated ${new Date(site.lastUpdated).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <button style={s.miniBtn} onClick={() => handleDeleteSite(site.subdomain)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div style={s.card}>
        <div style={s.cardTitle}>📜 Recent Transactions</div>
        {transactions.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No transactions yet.</p>
        ) : (
          <div>
            {transactions.slice(0, 15).map((tx, i) => (
              <div key={i} style={s.txRow}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{tx.description || tx.type}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(tx.createdAt).toLocaleString()}
                    {tx.aiModel && <span style={{ marginLeft: 8, color: '#6366f1' }}>· {tx.aiModel}</span>}
                  </div>
                </div>
                <div style={s.txAmount(tx.amount > 0)}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount?.toLocaleString()} BL
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { padding: '24px 20px', maxWidth: 1100, margin: '0 auto' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  h1: { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: 0 },
  tierBadge: (p) => ({
    padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 800,
    color: (p === 'gold' || p === 'diamond' || p === 'bronze') ? '#000' : '#fff',
    background: TIER_COLORS[p] || '#888',
    letterSpacing: '0.5px',
  }),
  priceBadge: {
    padding: '4px 12px', borderRadius: 14, fontSize: 12, fontWeight: 600,
    background: 'rgba(99,102,241,.12)', color: '#6366f1',
  },
  billingBtn: {
    padding: '5px 14px', borderRadius: 10, border: '1px solid var(--border)',
    background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, transition: 'all .2s',
  },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 22 },
  cardTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' },

  bigNum: { fontSize: 38, fontWeight: 900, color: '#f59e0b', marginBottom: 2, letterSpacing: '-1px' },
  claimInfo: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 },
  claimBtn: (ready) => ({
    width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
    cursor: ready ? 'pointer' : 'default', fontWeight: 700, fontSize: 15, transition: 'all .3s',
    background: ready ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'var(--bg-elevated)',
    color: ready ? '#fff' : 'var(--text-secondary)',
  }),

  usageRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 },
  progressBar: { height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' },
  progressFill: (pct, color) => ({ height: '100%', borderRadius: 3, width: `${Math.min(100, pct)}%`, background: color, transition: 'width .5s' }),

  limitsBox: { marginTop: 16, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10 },
  limitRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', padding: '3px 0' },

  refBox: { background: 'var(--bg-elevated)', borderRadius: 10, padding: 12, display: 'flex', gap: 8, alignItems: 'center' },
  refLink: { flex: 1, fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all', fontFamily: 'monospace' },
  copyBtn: { padding: '6px 14px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 },
  upgradeLink: { display: 'block', marginTop: 14, color: '#6366f1', fontWeight: 600, fontSize: 13, textDecoration: 'none' },

  siteCard: {
    background: 'var(--bg-elevated)', borderRadius: 10, padding: 14, marginBottom: 8,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  siteUrl: { color: '#6366f1', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  miniBtn: {
    padding: '5px 12px', borderRadius: 6, border: 'none', background: '#ef4444',
    color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },

  txRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: '1px solid var(--border)',
  },
  txAmount: (pos) => ({ fontWeight: 700, fontSize: 14, color: pos ? '#22c55e' : '#ef4444', whiteSpace: 'nowrap' }),
};
