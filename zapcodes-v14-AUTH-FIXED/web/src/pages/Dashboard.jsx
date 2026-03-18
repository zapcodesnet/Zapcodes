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
function formatBL(n) { if (n == null) return '0'; if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`; if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`; return n.toLocaleString(); }
function formatCap(n) { if (n == null || n === 0) return '0'; if (n === 'unlimited' || n >= 999999999 || !isFinite(n)) return '∞'; return n.toLocaleString(); }

export default function Dashboard() {
  const { user, setUser } = useContext(AuthContext);
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
  const [chooseSubdomain, setChooseSubdomain] = useState(''); // After claim — let user pick subdomain
  const [renamingSubdomain, setRenamingSubdomain] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [claimedOldSub, setClaimedOldSub] = useState(''); // preview-XXXXX that was claimed
  const [widgetBanner, setWidgetBanner] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

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
      setClaimedOldSub(data.subdomain || ''); // Store the preview-XXXXX subdomain
      setClaimCode('');
      fetchData();
    } catch (err) { setClaimResult({ success: false, message: err.response?.data?.error || 'Claim failed. Check the code and try again.' }); }
    finally { setClaimingCode(false); }
  };

  const handleRenameSubdomain = async () => {
    const clean = chooseSubdomain.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    if (clean.length < 2) { setRenameError('Subdomain must be at least 2 characters'); return; }
    setRenamingSubdomain(true); setRenameError('');
    try {
      const { data } = await api.post('/api/build/rename-subdomain', { oldSubdomain: claimedOldSub, newSubdomain: clean });
      setClaimResult({ success: true, message: data.message, url: data.url, subdomain: data.newSubdomain, renamed: true });
      setChooseSubdomain('');
      fetchData();
    } catch (err) { setRenameError(err.response?.data?.error || 'Rename failed'); }
    finally { setRenamingSubdomain(false); }
  };

  const handleDeleteSite = async (subdomain) => { if (!confirm(`Permanently delete ${subdomain}.zapcodes.net?`)) return; try { await api.delete(`/api/build/site/${subdomain}`); setSites(s => s.filter(site => site.subdomain !== subdomain)); setProjects(p => p.filter(proj => proj.linkedSubdomain !== subdomain)); } catch { alert('Delete failed'); } };
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

      {/* ══ CLAIM CODE SECTION — only show if user hasn't claimed a guest site yet ══ */}
      {!sites.some(s => s.subdomain?.startsWith('preview-')) && !projects.some(p => p.linkedSubdomain?.startsWith('preview-')) && (
      <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(255,59,136,0.06))', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>🎟️</span>
          <div><div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Have a claim code?</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Built a site as a guest? Enter your code to import it into your account.</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 3, textTransform: 'uppercase', textAlign: 'center', maxWidth: 200 }} placeholder="ABC123" value={claimCode} onChange={e => { setClaimCode(e.target.value.toUpperCase()); setClaimResult(null); }} onKeyDown={e => { if (e.key === 'Enter') handleClaimCode(); }} maxLength={10} />
          <button style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: claimCode.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--bg-elevated)', color: claimCode.trim() ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 14, cursor: claimCode.trim() ? 'pointer' : 'default', transition: 'all .2s' }} onClick={handleClaimCode} disabled={!claimCode.trim() || claimingCode}>{claimingCode ? '⏳ Claiming...' : '🎉 Claim My Site'}</button>
        </div>
        {claimResult && claimResult.success && !claimResult.renamed && claimedOldSub && (
          <div style={{ marginTop: 12, padding: '14px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>✅ Site claimed! Now choose your subdomain:</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: renameError ? '1px solid #ef4444' : '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, minWidth: 120 }} placeholder="mybusiness" value={chooseSubdomain} onChange={e => { setChooseSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setRenameError(''); }} onKeyDown={e => { if (e.key === 'Enter') handleRenameSubdomain(); }} maxLength={30} />
              <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>.zapcodes.net</span>
              <button style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: chooseSubdomain.trim().length >= 2 ? '#22c55e' : 'var(--bg-elevated)', color: chooseSubdomain.trim().length >= 2 ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: chooseSubdomain.trim().length >= 2 ? 'pointer' : 'default', whiteSpace: 'nowrap' }} onClick={handleRenameSubdomain} disabled={chooseSubdomain.trim().length < 2 || renamingSubdomain}>{renamingSubdomain ? '⏳...' : '✅ Confirm'}</button>
            </div>
            {renameError && <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>❌ {renameError}</div>}
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>Letters, numbers, and hyphens only. At least 2 characters.</div>
          </div>
        )}
        {claimResult && claimResult.success && claimResult.renamed && (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
            ✅ {claimResult.message} — <a href={claimResult.url} target="_blank" rel="noreferrer" style={{ color: '#22c55e' }}>Visit your site ↗</a> or <a href="/projects" style={{ color: '#6366f1' }}>My Projects</a>
          </div>
        )}
        {claimResult && !claimResult.success && (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#ef4444', fontWeight: 600 }}>
            ❌ {claimResult.message}
          </div>
        )}
      </div>
      )}

      <div style={s.grid}>
        <div style={s.card}><div style={s.cardTitle}>🪙 BL Coin Balance</div><div style={s.bigNum}>{balance.toLocaleString()}</div><div style={s.claimInfo}>Daily claim: <strong style={{ color: '#f59e0b' }}>{formatBL(dailyClaim)} BL</strong></div><button style={s.claimBtn(canClaim)} onClick={canClaim ? handleClaim : undefined} disabled={!canClaim || claiming}>{claiming ? '⏳ Claiming...' : canClaim ? `🎉 Claim ${formatBL(dailyClaim)} BL!` : `Next claim in ${formatCountdown(countdown)}`}</button><a href="/pricing" style={{ display: 'block', marginTop: 10, textAlign: 'center', color: '#f59e0b', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🪙 Buy more BL Coins →</a></div>

        <div style={s.card}><div style={s.cardTitle}>📊 Monthly AI Usage</div>{resetsOn && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>Resets on {resetsOn}</div>}{models.length > 0 ? models.map((m, i) => { const pct = m.limit === 'unlimited' ? 0 : (m.used / (m.limit || 1)) * 100; const isTrialExhausted = m.type === 'one_time_trial' && m.remaining === 0; return (<div key={i} style={{ marginBottom: i < models.length - 1 ? 14 : 0 }}><div style={s.usageRow}><span>{m.label}{m.type === 'one_time_trial' && <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 4 }}>(trial)</span>}</span><span style={{ fontWeight: 700, color: isTrialExhausted ? '#ef4444' : 'var(--text-primary)' }}>{m.used} / {formatCap(m.limit)}</span></div><div style={s.progressBar}><div style={s.progressFill(pct, isTrialExhausted ? '#ef4444' : '#6366f1')} /></div><div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}><span>{formatBL(m.bl_cost_gen)} BL/gen</span><span>{formatCap(m.remaining)} remaining</span></div></div>); }) : (<><div style={s.usageRow}><span>Generations</span><span style={{ fontWeight: 700 }}>{coinData?.dailyUsage?.generations || 0}</span></div><div style={s.progressBar}><div style={s.progressFill(0, '#6366f1')} /></div></>)}<div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}><div style={s.usageRow}><span>Code Fixes</span><span style={{ fontWeight: 700 }}>{fixesUsed} / {formatCap(fixesLimit)}</span></div><div style={s.progressBar}><div style={s.progressFill(fixesLimit === 'unlimited' ? 0 : (fixesUsed / (fixesLimit || 1)) * 100, '#8b5cf6')} /></div><div style={{ ...s.usageRow, marginTop: 14 }}><span>GitHub Pushes</span><span style={{ fontWeight: 700 }}>{pushesUsed} / {formatCap(pushesLimit)}</span></div><div style={s.progressBar}><div style={s.progressFill(pushesLimit === 'unlimited' ? 0 : (pushesUsed / (pushesLimit || 1)) * 100, '#22c55e')} /></div></div><div style={s.limitsBox}><div style={s.limitRow}><span>Max chars</span><span>{formatCap(maxChars)}</span></div><div style={s.limitRow}><span>Max sites</span><span>{formatCap(maxSites)}</span></div><div style={s.limitRow}><span>PWA</span><span>{canPWA ? '✅' : '—'}</span></div><div style={s.limitRow}><span>Pro Dev</span><span>{canProDev ? '✅' : '—'}</span></div><div style={s.limitRow}><span>Badge Remove</span><span>{badgeRemovable ? '✅' : '—'}</span></div></div></div>

        <div style={s.card}><div style={s.cardTitle}>🔗 Referrals ({user?.referralCount || user?.referral_count || 0})</div><p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Share your link — both earn <strong style={{ color: '#f59e0b' }}>50,000 BL</strong>!</p><div style={s.refBox}><span style={s.refLink}>{referralLink}</span><button style={s.copyBtn} onClick={() => { navigator.clipboard.writeText(referralLink); alert('Copied!'); }}>Copy</button></div><div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10 }}><div style={s.limitRow}><span>Direct referrals</span><span style={{ fontWeight: 700 }}>{user?.direct_referrals || 0}</span></div><div style={s.limitRow}><span>Commissions (L1)</span><span style={{ fontWeight: 700 }}>{plan === 'diamond' ? '4%' : plan === 'free' ? '2%' : '3%'}</span></div><div style={s.limitRow}><span>Commissions (L2)</span><span style={{ fontWeight: 700 }}>{plan === 'diamond' ? '3%' : plan === 'free' ? '1%' : '2%'}</span></div></div>{plan !== 'diamond' && <a href="/pricing" style={s.upgradeLink}>⬆️ Upgrade for more BL & features →</a>}</div>
      </div>

      <div style={{ ...s.card, marginBottom: 24 }}><div style={s.cardTitle}>🌐 Live Sites ({sites.length} / {formatCap(maxSites)})</div>{sites.length === 0 ? (<p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No sites live yet. <a href="/build" style={{ color: '#6366f1', fontWeight: 600 }}>Build one →</a></p>) : (<div>{sites.map(site => (<div key={site.subdomain} style={s.siteCard}><div style={{ flex: 1 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: '#22c55e', display: 'inline-block' }} /><a href={`https://${site.subdomain}.zapcodes.net`} target="_blank" rel="noreferrer" style={s.siteUrl}>{site.subdomain}.zapcodes.net</a></div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, marginLeft: 14 }}>{site.title || site.subdomain}{site.lastUpdated ? ` · Updated ${new Date(site.lastUpdated).toLocaleDateString()}` : ''}{site.hasBadge ? ' · Badge' : ''}</div></div><button style={{ ...s.miniBtn, color: '#ef4444', borderColor: '#ef444433' }} onClick={() => handleShutdown(site.subdomain)}>⛔ Shut Down</button></div>))}</div>)}</div>

      <div style={{ ...s.card, marginBottom: 24 }}><div style={s.cardTitle}>📁 Saved Projects ({projects.length})</div>{projects.length === 0 ? (<p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No saved projects yet. Projects are auto-saved when you deploy a site.</p>) : (<div>{projects.map(proj => { const isLive = sites.some(si => si.subdomain === proj.linkedSubdomain); return (<div key={proj.projectId} style={s.siteCard}><div style={{ flex: 1 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{proj.linkedSubdomain && <span style={{ width: 8, height: 8, borderRadius: 4, background: isLive ? '#22c55e' : '#6b7280', display: 'inline-block' }} />}<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{proj.name}</span></div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, marginLeft: proj.linkedSubdomain ? 14 : 0 }}>{proj.linkedSubdomain ? (<span>{proj.linkedSubdomain}.zapcodes.net · {isLive ? <span style={{ color: '#22c55e' }}>Live</span> : <span style={{ color: '#6b7280' }}>Offline</span>} · </span>) : null}{proj.fileCount} file{proj.fileCount !== 1 ? 's' : ''} · v{proj.version || 1}{proj.updatedAt ? ` · ${new Date(proj.updatedAt).toLocaleDateString()}` : ''}</div><div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}><a href={`/build?project=${proj.projectId}&action=edit`} style={s.siteActionBtn('#6366f1')}>✏️ Edit</a><a href={`/build?project=${proj.projectId}&action=fix`} style={s.siteActionBtn('#f59e0b')}>🔧 Fix Bugs</a>{proj.linkedSubdomain ? <a href={`/build?project=${proj.projectId}&action=redeploy&subdomain=${proj.linkedSubdomain}`} style={s.siteActionBtn('#22c55e')}>🚀 {isLive ? 'Re-deploy' : 'Go Live'}</a> : <a href={`/build?project=${proj.projectId}&action=deploy`} style={s.siteActionBtn('#22c55e')}>🚀 Deploy</a>}</div></div><button style={s.miniBtn} onClick={() => handleDeleteProject(proj.projectId, proj.linkedSubdomain)}>Delete</button></div>); })}</div>)}</div>

      <div style={s.card}><div style={s.cardTitle}>📜 Recent Transactions</div>{transactions.length === 0 ? (<p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No transactions yet.</p>) : (<div>{transactions.slice(0, 15).map((tx, i) => (<div key={i} style={s.txRow}><div><div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{tx.description || tx.type}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(tx.createdAt).toLocaleString()}{tx.aiModel && <span style={{ marginLeft: 8, color: '#6366f1' }}>· {tx.aiModel}</span>}</div></div><div style={s.txAmount(tx.amount > 0)}>{tx.amount > 0 ? '+' : ''}{tx.amount?.toLocaleString()} BL</div></div>))}</div>)}</div>
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
  cardTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' },
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
};
