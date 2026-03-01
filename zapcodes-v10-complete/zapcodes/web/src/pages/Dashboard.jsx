import { useState, useEffect, useContext, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

const TIER_COLORS = { free: '#888', bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' };

function formatCountdown(seconds) {
  if (seconds <= 0) return 'Ready!';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

function formatBL(n) { return n >= 999999999 ? '∞' : n?.toLocaleString() || '0'; }

export default function Dashboard() {
  const { user, setUser } = useContext(AuthContext);
  const [coinData, setCoinData] = useState(null);
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

  // Live countdown timer
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
      alert(`✅ Claimed ${data.claimed.toLocaleString()} BL!`);
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

  const plan = coinData?.plan || user?.plan || 'free';
  const du = coinData?.dailyUsage || {};
  const tc = coinData?.tierConfig || {};

  const s = {
    page: { padding: '24px 20px', maxWidth: 1100, margin: '0 auto' },
    h1: { fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 },
    tierBadge: { padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, color: '#000', background: TIER_COLORS[plan] || '#888' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 },
    card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 },
    cardTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
    bigNum: { fontSize: 36, fontWeight: 800, color: '#f59e0b', marginBottom: 4 },
    claimBtn: (ready) => ({
      width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', cursor: ready ? 'pointer' : 'default',
      fontWeight: 700, fontSize: 16, transition: 'all .3s',
      background: ready ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'var(--bg-elevated)',
      color: ready ? '#fff' : 'var(--text-secondary)',
      animation: ready ? 'glow-ready 2s ease-in-out infinite' : 'none',
    }),
    progressBar: { height: 6, borderRadius: 3, background: 'var(--bg-elevated)', marginTop: 6, overflow: 'hidden' },
    progressFill: (pct, color) => ({ height: '100%', borderRadius: 3, width: `${Math.min(100, pct)}%`, background: color || '#6366f1', transition: 'width .5s' }),
    usageRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' },
    siteCard: { background: 'var(--bg-elevated)', borderRadius: 10, padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    siteUrl: { color: '#6366f1', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
    txRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
    txAmount: (positive) => ({ fontWeight: 700, color: positive ? '#22c55e' : '#ef4444' }),
    refBox: { background: 'var(--bg-elevated)', borderRadius: 10, padding: 14, display: 'flex', gap: 8, alignItems: 'center' },
    refLink: { flex: 1, fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-all', fontFamily: 'monospace' },
    copyBtn: { padding: '6px 14px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 },
    miniBtn: (color) => ({ padding: '4px 10px', borderRadius: 6, border: 'none', background: color || '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }),
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading dashboard...</div>;

  const referralLink = `https://zapcodes.net/register?ref=${user?.referralCode || ''}`;
  const canClaim = coinData?.canClaim && countdown <= 0;
  const genPct = tc.dailyGenCap ? ((du.generations || 0) / (tc.dailyGenCap === Infinity ? 100 : tc.dailyGenCap)) * 100 : 0;
  const fixPct = tc.dailyFixCap ? ((du.codeFixes || 0) / (tc.dailyFixCap === Infinity ? 100 : tc.dailyFixCap)) * 100 : 0;

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Dashboard <span style={s.tierBadge}>{plan.toUpperCase()}</span></h1>

      <div style={s.grid}>
        {/* BL Balance */}
        <div style={s.card}>
          <div style={s.cardTitle}>🪙 BL Coin Balance</div>
          <div style={s.bigNum}>{formatBL(coinData?.balance)}</div>
          <button style={s.claimBtn(canClaim)} onClick={canClaim ? handleClaim : undefined} disabled={!canClaim || claiming}>
            {claiming ? 'Claiming...' : canClaim ? `🎉 Claim ${(tc.dailyClaim || 0).toLocaleString()} BL!` : `Next claim in ${formatCountdown(countdown)}`}
          </button>
        </div>

        {/* Today's Usage */}
        <div style={s.card}>
          <div style={s.cardTitle}>📊 Today's Usage</div>
          <div style={s.usageRow}><span>Generations</span><span>{du.generations || 0}/{tc.dailyGenCap === Infinity ? '∞' : tc.dailyGenCap || 0}</span></div>
          <div style={s.progressBar}><div style={s.progressFill(genPct, '#6366f1')} /></div>
          <div style={{ ...s.usageRow, marginTop: 12 }}><span>Code Fixes</span><span>{du.codeFixes || 0}/{tc.dailyFixCap === Infinity ? '∞' : tc.dailyFixCap || 0}</span></div>
          <div style={s.progressBar}><div style={s.progressFill(fixPct, '#8b5cf6')} /></div>
          <div style={{ ...s.usageRow, marginTop: 12 }}><span>GitHub Pushes</span><span>{du.githubPushes || 0}/{tc.dailyPushCap === Infinity ? '∞' : tc.dailyPushCap || 0}</span></div>
        </div>

        {/* Referral */}
        <div style={s.card}>
          <div style={s.cardTitle}>🔗 Referrals ({user?.referralCount || 0})</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Share & earn 50,000 BL each!</p>
          <div style={s.refBox}>
            <span style={s.refLink}>{referralLink}</span>
            <button style={s.copyBtn} onClick={() => { navigator.clipboard.writeText(referralLink); alert('Copied!'); }}>Copy</button>
          </div>
        </div>
      </div>

      {/* Deployed Sites */}
      <div style={{ ...s.card, marginBottom: 24 }}>
        <div style={s.cardTitle}>🌐 Deployed Sites ({sites.length}/{tc.maxSites === Infinity ? '∞' : tc.maxSites || 0})</div>
        {sites.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No sites deployed yet. <a href="/build" style={{ color: '#6366f1' }}>Build one →</a></p>
        ) : (
          <div className="site-list">
            {sites.map(site => (
              <div key={site.subdomain} style={s.siteCard}>
                <div>
                  <a href={`https://${site.subdomain}.zapcodes.net`} target="_blank" rel="noreferrer" style={s.siteUrl}>{site.subdomain}.zapcodes.net</a>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{site.title || site.subdomain} · {site.hasBadge ? 'Badge' : 'No badge'}{site.isPWA ? ' · PWA' : ''}</div>
                </div>
                <button style={s.miniBtn('#ef4444')} onClick={() => handleDeleteSite(site.subdomain)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div style={s.card}>
        <div style={s.cardTitle}>📜 Recent Transactions</div>
        <div className="transaction-list">
          {transactions.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No transactions yet.</p>
          ) : transactions.slice(0, 10).map((tx, i) => (
            <div key={i} style={s.txRow}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tx.description || tx.type}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(tx.createdAt).toLocaleString()}</div>
              </div>
              <div style={s.txAmount(tx.amount > 0)}>{tx.amount > 0 ? '+' : ''}{tx.amount?.toLocaleString()} BL</div>
            </div>
          ))}
        </div>
      </div>

      {/* Upgrade prompt */}
      {plan !== 'diamond' && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <a href="/pricing" style={{ color: '#6366f1', fontWeight: 600, fontSize: 14 }}>⬆️ Upgrade for more features & BL coins →</a>
        </div>
      )}
    </div>
  );
}
