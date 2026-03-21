import { useState, useEffect, useContext, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

const TIER_COLORS = { free: '#888', bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' };
const TIER_LABELS = { free: 'FREE', bronze: 'BRONZE', silver: 'SILVER', gold: 'GOLD 👑', diamond: 'DIAMOND 💎' };
const TIER_PRICES = { free: '$0', bronze: '$4.99', silver: '$14.99', gold: '$39.99', diamond: '$99.99' };
const TIER_COMMISSIONS = {
  free: { l1: 2, l2: 1 }, bronze: { l1: 3, l2: 2 }, silver: { l1: 3, l2: 2 },
  gold: { l1: 3, l2: 2 }, diamond: { l1: 4, l2: 3 },
};

function formatCountdown(seconds) {
  if (seconds <= 0) return 'Ready!';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), sec = seconds % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`;
}
function formatBL(n) { if (n == null) return '0'; if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`; if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`; return n.toLocaleString(); }
function formatCap(n) { if (n == null || n === 0) return '0'; if (n === 'unlimited' || n >= 999999999 || !isFinite(n)) return '∞'; return n.toLocaleString(); }

// ═══ Collapsible Section Component ═══
function CollapsibleSection({ title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={s.card}>
      <button onClick={() => setOpen(!open)} style={s.collapsibleHeader}>
        <span style={s.cardTitle}>{title}{count !== undefined ? ` (${count})` : ''}</span>
        <span style={{ fontSize: 14, color: 'var(--text-muted)', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}

// ═══ Referral Tree Node Component ═══
function TreeNode({ node, depth = 0, onExpand }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);

  const toggle = async () => {
    if (expanded) { setExpanded(false); return; }
    if (children.length > 0) { setExpanded(true); return; }
    if (!node.hasChildren || !node.referral_code) return;
    setLoadingChildren(true);
    try {
      const { data } = await api.get(`/api/referrals/children/${node.referral_code}`);
      setChildren(data.children || []);
      setExpanded(true);
    } catch (e) { console.error('Failed to load children'); }
    finally { setLoadingChildren(false); }
  };

  const tierColor = TIER_COLORS[node.subscription_tier] || '#888';
  const indent = depth * 24;

  return (
    <div>
      <div style={{ ...s.treeNode, marginLeft: indent }}>
        {node.hasChildren ? (
          <button onClick={toggle} style={s.treeExpandBtn}>
            {loadingChildren ? '⏳' : expanded ? '▼' : '▶'}
          </button>
        ) : (
          <span style={{ width: 20, display: 'inline-block', textAlign: 'center', color: 'var(--text-muted)', fontSize: 10 }}>•</span>
        )}
        <span style={{ ...s.treeTierDot, background: tierColor }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{node.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{node.email}</span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: tierColor, color: node.subscription_tier === 'free' ? '#fff' : '#000', marginLeft: 8, fontWeight: 700 }}>
          {(node.subscription_tier || 'free').toUpperCase()}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          L{node.level}{node.l2Count > 0 ? ` · ${node.l2Count} downlines` : ''}
        </span>
      </div>
      {expanded && children.map(child => (
        <TreeNode key={child._id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  const [coinData, setCoinData] = useState(null);
  const [usageData, setUsageData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [sites, setSites] = useState([]);
  const [projects, setProjects] = useState([]);
  const [countdown, setCountdown] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claimCode, setClaimCode] = useState('');
  const [claimingCode, setClaimingCode] = useState(false);
  const [claimResult, setClaimResult] = useState(null);
  const [chooseSubdomain, setChooseSubdomain] = useState('');
  const [renamingSubdomain, setRenamingSubdomain] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [claimedOldSub, setClaimedOldSub] = useState('');
  const [pendingRename, setPendingRename] = useState(false);
  const [widgetBanner, setWidgetBanner] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Referral tree state
  const [refTree, setRefTree] = useState([]);
  const [refStats, setRefStats] = useState({});
  const [refCommissions, setRefCommissions] = useState({});
  const [refTreeLoading, setRefTreeLoading] = useState(false);
  const [showTree, setShowTree] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [balRes, txRes, siteRes, projRes] = await Promise.all([
        api.get('/api/coins/balance'), api.get('/api/coins/transactions'),
        api.get('/api/build/sites'), api.get('/api/build/projects'),
      ]);
      setCoinData(balRes.data); setCountdown(balRes.data.nextClaimIn || 0);
      setTransactions(txRes.data.transactions || []); setSites(siteRes.data.sites || []);
      setProjects(projRes.data.projects || []);
    } catch (err) { console.error('Dashboard fetch error:', err); }
    finally { setLoading(false); }
  }, []);

  const fetchRefTree = useCallback(async () => {
    setRefTreeLoading(true);
    try {
      const { data } = await api.get('/api/referrals/my-tree');
      setRefTree(data.tree || []);
      setRefStats(data.stats || {});
      setRefCommissions(data.commissions || {});
    } catch (e) { console.error('Referral tree fetch error:', e); }
    finally { setRefTreeLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (countdown <= 0) return; const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000); return () => clearInterval(t); }, [countdown]);
  useEffect(() => {
    if (!coinData || bannerDismissed) return;
    if (sessionStorage.getItem('zc_widget_banner_dismissed')) return;
    const hasWidget = user?.widgetSites?.some(w => w.isActive) || false;
    if (!hasWidget) return;
    const bal = coinData?.balance ?? 0;
    if (bal === 0) setWidgetBanner('paused'); else if (bal < 1000) setWidgetBanner('critical'); else if (bal < 5000) setWidgetBanner('low');
  }, [coinData, bannerDismissed, user]);

  // Load referral tree when section is opened
  useEffect(() => { if (showTree && refTree.length === 0 && !refTreeLoading) fetchRefTree(); }, [showTree]);

  const dismissBanner = () => { setBannerDismissed(true); sessionStorage.setItem('zc_widget_banner_dismissed', '1'); };

  const handleClaim = async () => {
    setClaiming(true);
    try { const { data } = await api.post('/api/coins/claim'); setCoinData(prev => ({ ...prev, balance: data.balance, canClaim: false })); setCountdown(data.nextClaimIn || 86400); if (data.bonus) alert(`🎉 Signup bonus: +${data.bonus.toLocaleString()} BL!`); alert(`✅ Claimed ${(data.claimed || 0).toLocaleString()} BL!`); fetchData(); }
    catch (err) { alert(err.response?.data?.error || 'Claim failed'); } finally { setClaiming(false); }
  };

  const handleClaimCode = async () => {
    if (!claimCode.trim()) return;
    setClaimingCode(true); setClaimResult(null); setRenameError('');
    try {
      const { data } = await api.post('/api/build/claim-guest-site', { claimCode: claimCode.trim() });
      setClaimResult({ success: true, message: data.message, url: data.url, subdomain: data.subdomain });
      setClaimedOldSub(data.subdomain || '');
      setClaimCode('');
      setPendingRename(true);
    } catch (err) { setClaimResult({ success: false, message: err.response?.data?.error || 'Claim failed.' }); }
    finally { setClaimingCode(false); }
  };

  const handleRenameSubdomain = async () => {
    const clean = chooseSubdomain.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    if (clean.length < 2) { setRenameError('Subdomain must be at least 2 characters'); return; }
    setRenamingSubdomain(true); setRenameError('');
    try {
      const { data } = await api.post('/api/build/rename-subdomain', { oldSubdomain: claimedOldSub, newSubdomain: clean });
      setClaimResult({ success: true, message: data.message, url: data.url, subdomain: data.newSubdomain, renamed: true });
      setChooseSubdomain(''); setPendingRename(false); fetchData();
    } catch (err) { setRenameError(err.response?.data?.error || 'Rename failed'); }
    finally { setRenamingSubdomain(false); }
  };

  const handleSkipRename = () => {
    setPendingRename(false);
    setClaimResult(prev => prev ? { ...prev, renamed: true, message: `Site claimed as ${claimedOldSub}.zapcodes.net` } : prev);
    fetchData();
  };

  const handleShutdown = async (subdomain) => { if (!confirm(`Shut down ${subdomain}.zapcodes.net?`)) return; try { await api.post('/api/build/site/shutdown', { subdomain }); setSites(s => s.filter(site => site.subdomain !== subdomain)); } catch { alert('Shutdown failed'); } };
  const handleDeleteProject = async (projectId, linkedSubdomain) => { const msg = linkedSubdomain ? `Delete this project and shut down ${linkedSubdomain}.zapcodes.net?` : 'Delete this project?'; if (!confirm(msg)) return; try { const { data } = await api.delete(`/api/build/project/${projectId}`); setProjects(p => p.filter(proj => proj.projectId !== projectId)); if (data.shutdownSite) setSites(s => s.filter(site => site.subdomain !== data.shutdownSite)); } catch { alert('Delete failed'); } };
  const handleManageBilling = async () => { try { const { data } = await api.post('/api/stripe/portal'); if (data.url) window.location.href = data.url; } catch (err) { alert(err.response?.data?.error || 'Could not open billing portal'); } };

  const plan = usageData?.tier || coinData?.plan || user?.subscription_tier || user?.plan || 'free';
  const tc = coinData?.tierConfig || {};
  const balance = usageData?.bl_coins ?? coinData?.balance ?? 0;
  const dailyClaim = usageData?.daily_bl_claim || tc.dailyClaim || 0;
  const models = usageData?.models || [];
  const fixesUsed = usageData?.fixes?.used || 0, fixesLimit = usageData?.fixes?.limit || 0;
  const pushesUsed = usageData?.github_pushes?.used || 0, pushesLimit = usageData?.github_pushes?.limit || 0;
  const resetsOn = usageData?.resets_on || '';
  const maxChars = usageData?.max_characters || tc.maxChars || 2000;
  const maxSites = usageData?.max_deployed_sites || tc.maxSites || 1;
  const canPWA = usageData?.can_pwa ?? tc.canPWA ?? false;
  const canProDev = usageData?.pro_developer ?? tc.canProDev ?? false;
  const badgeRemovable = usageData?.badge_removable ?? tc.canRemoveBadge ?? false;
  const canClaim = usageData?.can_claim_daily ?? (coinData?.canClaim && countdown <= 0);
  const referralLink = `https://zapcodes.net/register?ref=${user?.referralCode || user?.referral_code || ''}`;
  const comm = TIER_COMMISSIONS[plan] || TIER_COMMISSIONS.free;

  const showClaimCodeInput = !pendingRename && !sites.some(si => si.subdomain?.startsWith('preview-')) && !projects.some(p => p.linkedSubdomain?.startsWith('preview-'));

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading dashboard...</div>;

  return (<>
    {widgetBanner && !bannerDismissed && (<div style={{ position: 'sticky', top: 0, zIndex: 100, padding: '12px 20px', background: widgetBanner === 'paused' ? 'rgba(239,68,68,0.12)' : widgetBanner === 'critical' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', borderBottom: `1px solid ${widgetBanner === 'paused' ? 'rgba(239,68,68,0.3)' : widgetBanner === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.25)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}><span style={{ fontSize: 18 }}>{widgetBanner === 'paused' ? '🔴' : '⚠️'}</span><div><div style={{ fontWeight: 700, fontSize: 13, color: widgetBanner === 'paused' || widgetBanner === 'critical' ? '#ef4444' : '#f59e0b' }}>{widgetBanner === 'paused' ? 'Your AI widget has paused' : widgetBanner === 'critical' ? 'AI widget will pause very soon' : 'Your AI widget balance is running low'}</div><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{widgetBanner === 'paused' ? 'Your BL balance reached 0.' : `Balance: ${balance.toLocaleString()} BL`}</div></div></div>
      <div style={{ display: 'flex', gap: 8 }}><a href="/pricing" style={{ padding: '7px 16px', borderRadius: 8, background: widgetBanner === 'paused' ? '#ef4444' : '#f59e0b', color: '#000', fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>{widgetBanner === 'paused' ? 'Top Up Now' : 'Top Up BL'}</a><button onClick={dismissBanner} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Dismiss</button></div>
    </div>)}

    <div style={s.page}>
      <div style={s.headerRow}>
        <h1 style={s.h1}>Dashboard</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={s.tierBadge(plan)}>{TIER_LABELS[plan] || plan.toUpperCase()}</span>
          <span style={s.priceBadge}>{TIER_PRICES[plan] || '$0'}/mo</span>
          {plan !== 'free' && <button style={s.billingBtn} onClick={handleManageBilling}>Manage Billing</button>}
        </div>
      </div>

      {/* ══ CLAIM CODE INPUT ══ */}
      {showClaimCodeInput && (
      <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(255,59,136,0.06))', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>🎟️</span>
          <div><div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Have a claim code?</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Built a site as a guest? Enter your code to import it into your account.</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 3, textTransform: 'uppercase', textAlign: 'center', maxWidth: 200 }} placeholder="ABC123" value={claimCode} onChange={e => { setClaimCode(e.target.value.toUpperCase()); setClaimResult(null); }} onKeyDown={e => { if (e.key === 'Enter') handleClaimCode(); }} maxLength={10} />
          <button style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: claimCode.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--bg-elevated)', color: claimCode.trim() ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 14, cursor: claimCode.trim() ? 'pointer' : 'default', transition: 'all .2s' }} onClick={handleClaimCode} disabled={!claimCode.trim() || claimingCode}>{claimingCode ? '⏳ Claiming...' : '🎉 Claim My Site'}</button>
        </div>
        {claimResult && !claimResult.success && (<div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#ef4444', fontWeight: 600 }}>❌ {claimResult.message}</div>)}
      </div>
      )}

      {/* ══ RENAME SUBDOMAIN UI ══ */}
      {pendingRename && claimedOldSub && (
        <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(99,102,241,0.06))', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 16, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e', marginBottom: 4 }}>✅ Site claimed successfully!</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>Choose a custom subdomain for your site, or keep the default.</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: renameError ? '1px solid #ef4444' : '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, minWidth: 120 }} placeholder="mybusiness" value={chooseSubdomain} onChange={e => { setChooseSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setRenameError(''); }} onKeyDown={e => { if (e.key === 'Enter') handleRenameSubdomain(); }} maxLength={30} />
            <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>.zapcodes.net</span>
            <button style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: chooseSubdomain.trim().length >= 2 ? '#22c55e' : 'var(--bg-elevated)', color: chooseSubdomain.trim().length >= 2 ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: chooseSubdomain.trim().length >= 2 ? 'pointer' : 'default', whiteSpace: 'nowrap' }} onClick={handleRenameSubdomain} disabled={chooseSubdomain.trim().length < 2 || renamingSubdomain}>{renamingSubdomain ? '⏳...' : '✅ Confirm'}</button>
          </div>
          {renameError && <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>❌ {renameError}</div>}
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Letters, numbers, and hyphens only. At least 2 characters.</div>
            <button style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={handleSkipRename}>Skip — keep {claimedOldSub}</button>
          </div>
        </div>
      )}

      {claimResult && claimResult.success && claimResult.renamed && !pendingRename && (
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 12, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
          ✅ {claimResult.message} — <a href={claimResult.url || `https://${claimResult.subdomain}.zapcodes.net`} target="_blank" rel="noreferrer" style={{ color: '#22c55e' }}>Visit your site ↗</a>
        </div>
      )}

      {/* ═══ TOP CARDS: Balance + AI Usage + Referrals ═══ */}
      <div style={s.grid}>
        {/* BL Coin Balance */}
        <div style={s.card}>
          <div style={s.cardTitle}>🪙 BL Coin Balance</div>
          <div style={s.bigNum}>{balance.toLocaleString()}</div>
          <div style={s.claimInfo}>Daily claim: <strong style={{ color: '#f59e0b' }}>{formatBL(dailyClaim)} BL</strong></div>
          <button style={s.claimBtn(canClaim)} onClick={canClaim ? handleClaim : undefined} disabled={!canClaim || claiming}>
            {claiming ? '⏳ Claiming...' : canClaim ? `🎉 Claim ${formatBL(dailyClaim)} BL!` : `Next claim in ${formatCountdown(countdown)}`}
          </button>
          <a href="/pricing" style={{ display: 'block', marginTop: 10, textAlign: 'center', color: '#f59e0b', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🪙 Buy more BL Coins →</a>
        </div>

        {/* Monthly AI Usage — per model */}
        <div style={s.card}>
          <div style={s.cardTitle}>📊 Monthly AI Usage</div>
          {resetsOn && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>Resets on {resetsOn}</div>}

          {models.length > 0 ? models.map((m, i) => {
            const pct = m.limit === 'unlimited' ? 0 : (m.used / (m.limit || 1)) * 100;
            const isTrialExhausted = m.type === 'one_time_trial' && m.remaining === 0;
            return (
              <div key={i} style={{ marginBottom: i < models.length - 1 ? 14 : 0 }}>
                <div style={s.usageRow}>
                  <span>{m.label}{m.type === 'one_time_trial' && <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 4 }}>(trial)</span>}</span>
                  <span style={{ fontWeight: 700, color: isTrialExhausted ? '#ef4444' : 'var(--text-primary)' }}>{m.used} / {formatCap(m.limit)}</span>
                </div>
                <div style={s.progressBar}><div style={s.progressFill(pct, isTrialExhausted ? '#ef4444' : '#6366f1')} /></div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{formatBL(m.bl_cost_gen)} BL/gen</span>
                  <span>{formatCap(m.remaining)} remaining</span>
                </div>
              </div>
            );
          }) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No model usage data available</div>
          )}

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={s.usageRow}><span>Code Fixes</span><span style={{ fontWeight: 700 }}>{fixesUsed} / {formatCap(fixesLimit)}</span></div>
            <div style={s.progressBar}><div style={s.progressFill(fixesLimit === 'unlimited' ? 0 : (fixesUsed / (fixesLimit || 1)) * 100, '#8b5cf6')} /></div>
            <div style={{ ...s.usageRow, marginTop: 14 }}><span>GitHub Pushes</span><span style={{ fontWeight: 700 }}>{pushesUsed} / {formatCap(pushesLimit)}</span></div>
            <div style={s.progressBar}><div style={s.progressFill(pushesLimit === 'unlimited' ? 0 : (pushesUsed / (pushesLimit || 1)) * 100, '#22c55e')} /></div>
          </div>

          <div style={s.limitsBox}>
            <div style={s.limitRow}><span>Max chars</span><span>{formatCap(maxChars)}</span></div>
            <div style={s.limitRow}><span>Max sites</span><span>{formatCap(maxSites)}</span></div>
            <div style={s.limitRow}><span>PWA</span><span>{canPWA ? '✅' : '—'}</span></div>
            <div style={s.limitRow}><span>Pro Dev</span><span>{canProDev ? '✅' : '—'}</span></div>
            <div style={s.limitRow}><span>Badge Remove</span><span>{badgeRemovable ? '✅' : '—'}</span></div>
          </div>
        </div>

        {/* Referrals — with commissions and tree toggle */}
        <div style={s.card}>
          <div style={s.cardTitle}>🔗 Referrals</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Share your link — both earn <strong style={{ color: '#f59e0b' }}>50,000 BL</strong>!</p>
          <div style={s.refBox}>
            <span style={s.refLink}>{referralLink}</span>
            <button style={s.copyBtn} onClick={() => { navigator.clipboard.writeText(referralLink); alert('Copied!'); }}>Copy</button>
          </div>

          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Commission Rates ({plan.toUpperCase()} tier)</div>
            <div style={s.limitRow}><span>Direct (Level 1)</span><span style={{ fontWeight: 700, color: '#22c55e' }}>{refCommissions.l1_percent || comm.l1}%</span></div>
            <div style={s.limitRow}><span>Indirect (Level 2)</span><span style={{ fontWeight: 700, color: '#6366f1' }}>{refCommissions.l2_percent || comm.l2}%</span></div>
            <div style={{ ...s.limitRow, borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 6 }}>
              <span>Direct referrals (L1)</span><span style={{ fontWeight: 700 }}>{refStats.totalL1 || user?.direct_referrals || 0}</span>
            </div>
            <div style={s.limitRow}><span>Indirect referrals (L2)</span><span style={{ fontWeight: 700 }}>{refStats.totalL2 || user?.indirect_referrals || 0}</span></div>
            <div style={s.limitRow}><span>Total bonuses earned</span><span style={{ fontWeight: 700, color: '#f59e0b' }}>{formatBL(refStats.referral_bonuses_paid || user?.referral_bonuses_paid || 0)} BL</span></div>
          </div>

          <button onClick={() => { setShowTree(!showTree); if (!showTree && refTree.length === 0) fetchRefTree(); }} style={{ ...s.billingBtn, width: '100%', marginTop: 12, textAlign: 'center' }}>
            {showTree ? '▼ Hide' : '▶ Show'} Referral Tree
          </button>

          {plan !== 'diamond' && <a href="/pricing" style={s.upgradeLink}>⬆️ Upgrade for higher commissions →</a>}
        </div>
      </div>

      {/* ═══ REFERRAL GENEALOGY TREE ═══ */}
      {showTree && (
        <div style={{ ...s.card, marginBottom: 24 }}>
          <div style={s.cardTitle}>🌳 Referral Genealogy Tree</div>
          {refTreeLoading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading referral tree...</div>
          ) : refTree.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <span style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>🌱</span>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No referrals yet. Share your link to start growing your tree!</p>
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto', padding: '8px 0' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
                <strong>You</strong> → {refStats.totalL1 || 0} direct (L1) · {refStats.totalL2 || 0} indirect (L2) · Click ▶ to expand
              </div>
              {refTree.map(node => (
                <TreeNode key={node._id} node={node} depth={0} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ COLLAPSIBLE: Live Sites ═══ */}
      <div style={{ marginBottom: 16 }}>
        <CollapsibleSection title={`🌐 Live Sites`} count={`${sites.length} / ${formatCap(maxSites)}`} defaultOpen={sites.length > 0 && sites.length <= 5}>
          {sites.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No sites live yet. <a href="/build" style={{ color: '#6366f1', fontWeight: 600 }}>Build one →</a></p>
          ) : (
            <div>{sites.map(site => (
              <div key={site.subdomain} style={s.siteCard}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: '#22c55e', display: 'inline-block' }} />
                    <a href={`https://${site.subdomain}.zapcodes.net`} target="_blank" rel="noreferrer" style={s.siteUrl}>{site.subdomain}.zapcodes.net</a>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, marginLeft: 14 }}>
                    {site.title || site.subdomain}{site.lastUpdated ? ` · Updated ${new Date(site.lastUpdated).toLocaleDateString()}` : ''}{site.hasBadge ? ' · Badge' : ''}
                  </div>
                </div>
                <button style={{ ...s.miniBtn, color: '#ef4444', borderColor: '#ef444433' }} onClick={() => handleShutdown(site.subdomain)}>⛔ Shut Down</button>
              </div>
            ))}</div>
          )}
        </CollapsibleSection>
      </div>

      {/* ═══ COLLAPSIBLE: Saved Projects ═══ */}
      <div style={{ marginBottom: 16 }}>
        <CollapsibleSection title="📁 Saved Projects" count={projects.length} defaultOpen={projects.length > 0 && projects.length <= 3}>
          {projects.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No saved projects yet. Projects are auto-saved when you deploy a site.</p>
          ) : (
            <div>{projects.map(proj => {
              const isLive = sites.some(si => si.subdomain === proj.linkedSubdomain);
              return (
                <div key={proj.projectId} style={s.siteCard}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {proj.linkedSubdomain && <span style={{ width: 8, height: 8, borderRadius: 4, background: isLive ? '#22c55e' : '#6b7280', display: 'inline-block' }} />}
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{proj.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, marginLeft: proj.linkedSubdomain ? 14 : 0 }}>
                      {proj.linkedSubdomain ? (<span>{proj.linkedSubdomain}.zapcodes.net · {isLive ? <span style={{ color: '#22c55e' }}>Live</span> : <span style={{ color: '#6b7280' }}>Offline</span>} · </span>) : null}
                      {proj.fileCount} file{proj.fileCount !== 1 ? 's' : ''} · v{proj.version || 1}{proj.updatedAt ? ` · ${new Date(proj.updatedAt).toLocaleDateString()}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <a href={`/build?project=${proj.projectId}&action=edit`} style={s.siteActionBtn('#6366f1')}>✏️ Edit</a>
                      <a href={`/build?project=${proj.projectId}&action=fix`} style={s.siteActionBtn('#f59e0b')}>🔧 Fix Bugs</a>
                      {proj.linkedSubdomain ? <a href={`/build?project=${proj.projectId}&action=redeploy&subdomain=${proj.linkedSubdomain}`} style={s.siteActionBtn('#22c55e')}>🚀 {isLive ? 'Re-deploy' : 'Go Live'}</a> : <a href={`/build?project=${proj.projectId}&action=deploy`} style={s.siteActionBtn('#22c55e')}>🚀 Deploy</a>}
                    </div>
                  </div>
                  <button style={s.miniBtn} onClick={() => handleDeleteProject(proj.projectId, proj.linkedSubdomain)}>Delete</button>
                </div>
              );
            })}</div>
          )}
        </CollapsibleSection>
      </div>

      {/* ═══ COLLAPSIBLE: Recent Transactions ═══ */}
      <div style={{ marginBottom: 16 }}>
        <CollapsibleSection title="📜 Recent Transactions" count={transactions.length} defaultOpen={false}>
          {transactions.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No transactions yet.</p>
          ) : (
            <div>{transactions.slice(0, 20).map((tx, i) => (
              <div key={i} style={s.txRow}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{tx.description || tx.type}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(tx.createdAt).toLocaleString()}
                    {tx.aiModel && <span style={{ marginLeft: 8, color: '#6366f1' }}>· {tx.aiModel}</span>}
                  </div>
                </div>
                <div style={s.txAmount(tx.amount > 0)}>{tx.amount > 0 ? '+' : ''}{tx.amount?.toLocaleString()} BL</div>
              </div>
            ))}</div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  </>);
}

const s = {
  page: { padding: '24px 20px', maxWidth: 1100, margin: '0 auto' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  h1: { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: 0 },
  tierBadge: (p) => ({ padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 800, color: (p === 'gold' || p === 'diamond' || p === 'bronze') ? '#000' : '#fff', background: TIER_COLORS[p] || '#888', letterSpacing: '0.5px' }),
  priceBadge: { padding: '4px 12px', borderRadius: 14, fontSize: 12, fontWeight: 600, background: 'rgba(99,102,241,.12)', color: '#6366f1' },
  billingBtn: { padding: '5px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 22 },
  cardTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 0, textTransform: 'uppercase', letterSpacing: '0.5px' },
  collapsibleHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' },
  bigNum: { fontSize: 38, fontWeight: 900, color: '#f59e0b', marginBottom: 2, letterSpacing: '-1px' },
  claimInfo: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 },
  claimBtn: (ready) => ({ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', cursor: ready ? 'pointer' : 'default', fontWeight: 700, fontSize: 15, transition: 'all .3s', background: ready ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'var(--bg-elevated)', color: ready ? '#fff' : 'var(--text-secondary)' }),
  usageRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 },
  progressBar: { height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden' },
  progressFill: (pct, color) => ({ height: '100%', borderRadius: 3, width: `${Math.min(100, pct)}%`, background: color, transition: 'width .5s' }),
  limitsBox: { marginTop: 16, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10 },
  limitRow: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', padding: '3px 0' },
  refBox: { background: 'var(--bg-elevated)', borderRadius: 10, padding: 12, display: 'flex', gap: 8, alignItems: 'center' },
  refLink: { flex: 1, fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all', fontFamily: 'monospace' },
  copyBtn: { padding: '6px 14px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 },
  upgradeLink: { display: 'block', marginTop: 14, color: '#6366f1', fontWeight: 600, fontSize: 13, textDecoration: 'none' },
  siteCard: { background: 'var(--bg-elevated)', borderRadius: 10, padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  siteUrl: { color: '#6366f1', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  siteActionBtn: (color) => ({ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, color, border: `1px solid ${color}33`, background: `${color}11`, textDecoration: 'none', cursor: 'pointer', display: 'inline-block' }),
  miniBtn: { padding: '5px 12px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  txRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' },
  txAmount: (pos) => ({ fontWeight: 700, fontSize: 14, color: pos ? '#22c55e' : '#ef4444', whiteSpace: 'nowrap' }),
  // Tree styles
  treeNode: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, fontSize: 13, transition: 'background .15s', marginBottom: 2 },
  treeExpandBtn: { width: 20, height: 20, borderRadius: 4, border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  treeTierDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
};
