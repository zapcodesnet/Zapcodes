import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

export default function MyProjects() {
  const { user }   = useContext(AuthContext);
  const navigate   = useNavigate();
  const [projects,      setProjects]      = useState([]);
  const [sites,         setSites]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [deleting,      setDeleting]      = useState(null);
  const [shuttingDown,  setShuttingDown]  = useState(null);
  const [redeploying,   setRedeploying]   = useState(null);
  const [rollingBack,   setRollingBack]   = useState(null);
  // cloneMap: { [rootProjectId]: [clone1, clone2, ...] }
  const [cloneMap,      setCloneMap]      = useState({});
  const [expandedClones,setExpandedClones]= useState({});

  useEffect(() => {
    Promise.all([
      api.get('/api/build/projects').then(r => setProjects(r.data.projects || [])).catch(() => {}),
      api.get('/api/build/sites').then(r => setSites(r.data.sites || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  // Load clones for a project
  const loadClones = async (rootId) => {
    if (cloneMap[rootId]) return; // already loaded
    try {
      const { data } = await api.get(`/api/build/project-clones/${rootId}`);
      setCloneMap(prev => ({ ...prev, [rootId]: data.clones || [] }));
    } catch {}
  };

  const toggleClones = (rootId) => {
    setExpandedClones(prev => ({ ...prev, [rootId]: !prev[rootId] }));
    if (!cloneMap[rootId]) loadClones(rootId);
  };

  // Refresh everything after an action
  const refresh = async () => {
    setLoading(true);
    await Promise.all([
      api.get('/api/build/projects').then(r => setProjects(r.data.projects || [])).catch(() => {}),
      api.get('/api/build/sites').then(r => setSites(r.data.sites || [])).catch(() => {}),
    ]);
    setCloneMap({}); // reset so clones reload fresh
    setLoading(false);
  };

  const handleShutdown = async (subdomain, rootProjectId) => {
    if (!confirm(`Shut down ${subdomain}.zapcodes.net?\n\nYour live site will go offline. Its current content will be auto-saved as Clone 2 so you can always roll back.`)) return;
    setShuttingDown(subdomain);
    try {
      await api.post('/api/build/site/shutdown', { subdomain });
      setSites(s => s.filter(site => site.subdomain !== subdomain));
      // Refresh clone list so Clone 2 appears immediately
      if (rootProjectId) {
        const { data } = await api.get(`/api/build/project-clones/${rootProjectId}`);
        setCloneMap(prev => ({ ...prev, [rootProjectId]: data.clones || [] }));
        // Auto-expand clones so user sees Clone 2 right away
        setExpandedClones(prev => ({ ...prev, [rootProjectId]: true }));
      }
    } catch (err) { alert(err.response?.data?.error || 'Shutdown failed'); }
    finally { setShuttingDown(null); }
  };

  const handleDeleteProject = async (projectId, linkedSubdomain) => {
    const msg = linkedSubdomain
      ? `Delete this project?\n\nThis will also SHUT DOWN ${linkedSubdomain}.zapcodes.net and free the subdomain.`
      : 'Delete this project? This cannot be undone.';
    if (!confirm(msg)) return;
    setDeleting(projectId);
    try {
      const { data } = await api.delete(`/api/build/project/${projectId}`);
      setProjects(p => p.filter(proj => proj.projectId !== projectId));
      if (data.shutdownSite) setSites(s => s.filter(site => site.subdomain !== data.shutdownSite));
    } catch (err) { alert(err.response?.data?.error || 'Delete failed'); }
    finally { setDeleting(null); }
  };

  const handleDeleteClone = async (cloneProjectId) => {
    if (!confirm('Delete this clone snapshot?\n\nThis cannot be undone. Your live site is not affected.')) return;
    setDeleting(cloneProjectId);
    try {
      await api.delete(`/api/build/project/${cloneProjectId}`);
      // Remove from local cloneMap
      setCloneMap(prev => {
        const updated = { ...prev };
        for (const rootId in updated) {
          updated[rootId] = (updated[rootId] || []).filter(c => c.projectId !== cloneProjectId);
        }
        return updated;
      });
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const handleRedeploy = async (projectId, subdomain) => {
    if (!confirm(`Re-deploy to ${subdomain}.zapcodes.net?\n\nThis will auto-save a clone snapshot and replace your live site.`)) return;
    setRedeploying(projectId);
    try {
      await api.post('/api/build/redeploy-from-project', { projectId });
      alert(`✅ Re-deployed! ${subdomain}.zapcodes.net is now live.`);
      await refresh();
    } catch (err) { alert(err.response?.data?.error || 'Re-deploy failed'); }
    finally { setRedeploying(null); }
  };

  const handleRollback = async (cloneProjectId, subdomain, cloneDate) => {
    if (!confirm(`Roll back to version from ${cloneDate}?\n\nThis will replace your live site at ${subdomain}.zapcodes.net and auto-save a new clone.`)) return;
    setRollingBack(cloneProjectId);
    try {
      const { data } = await api.post('/api/build/rollback', { cloneProjectId });
      alert(`✅ Rolled back! ${data.message}`);
      await refresh();
    } catch (err) { alert(err.response?.data?.error || 'Rollback failed'); }
    finally { setRollingBack(null); }
  };

  const fmt = (d) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 15 }}>
      <div style={{ fontSize: 24, marginBottom: 12 }}>⚡</div>
      Loading your projects...
    </div>
  );

  return (
    <div style={s.page}>
      <h1 style={s.h1}>My Projects</h1>
      <p style={s.subtitle}>
        All edits happen on clones — your live site is never touched until you re-deploy.
        Up to 5 clone snapshots are kept per project.
      </p>

      {/* ═══════════ LIVE SITES ═══════════ */}
      <div style={s.section}>
        <h2 style={s.h2}>🟢 Live Sites ({sites.length})</h2>
        {sites.length === 0 ? (
          <div style={s.empty}><p>No live sites yet. Deploy from Saved Projects below.</p></div>
        ) : (
          <div style={s.grid}>
            {sites.map(site => (
              <div key={site.subdomain} style={s.liveCard}>
                <div style={s.liveCardTop}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={s.liveDot} />
                    <span style={s.liveLabel}>LIVE</span>
                  </div>
                  <a href={`https://${site.subdomain}.zapcodes.net`} target="_blank" rel="noreferrer" style={s.siteUrl}>
                    {site.subdomain}.zapcodes.net ↗
                  </a>
                </div>
                <div style={s.liveMeta}>
                  <span>{site.title || site.subdomain}</span>
                  {site.lastUpdated && <><span>·</span><span>Updated {fmt(site.lastUpdated)}</span></>}
                  {site.hasBadge && <><span>·</span><span style={{ fontSize: 10 }}>Badge on</span></>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button style={s.shutdownBtn} onClick={() => handleShutdown(site.subdomain)} disabled={shuttingDown === site.subdomain}>
                    {shuttingDown === site.subdomain ? 'Shutting down...' : '⛔ Shut Down'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════ SAVED PROJECTS WITH CLONE TIMELINE ═══════════ */}
      <div style={s.section}>
        <h2 style={s.h2}>📁 Saved Projects ({projects.filter(p => !p.cloneVersion).length})</h2>
        <p style={s.sectionDesc}>
          Clone 1 is always your latest editable version. Clones 2-5 are rollback points.
          Re-deploying auto-creates a new clone snapshot.
        </p>

        {projects.filter(p => !p.cloneVersion).length === 0 ? (
          <div style={s.empty}>
            <p>No saved projects yet. Deploy a site to get started.</p>
            <button style={s.ctaBtn} onClick={() => navigate('/build')}>Build your first project →</button>
          </div>
        ) : (
          <div style={s.projectList}>
            {projects.filter(p => !p.cloneVersion).map(proj => {
              const isLive    = proj.linkedSubdomain && sites.some(s => s.subdomain === proj.linkedSubdomain);
              const isOffline = proj.linkedSubdomain && !isLive;
              const liveSite  = sites.find(s => s.subdomain === proj.linkedSubdomain);
              const clones    = cloneMap[proj.projectId] || [];
              const clonesOpen = expandedClones[proj.projectId];

              return (
                <div key={proj.projectId} style={s.projectBlock}>

                  {/* ── Live site card — Shut Down only ── */}
                  {proj.linkedSubdomain && isLive && (
                    <div style={s.liveTimelineCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ ...s.liveDot, width: 10, height: 10 }} />
                          <span style={{ fontWeight: 800, fontSize: 13, color: '#22c55e' }}>LIVE</span>
                          <a href={`https://${proj.linkedSubdomain}.zapcodes.net`} target="_blank" rel="noreferrer" style={{ color: '#22c55e', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                            {proj.linkedSubdomain}.zapcodes.net ↗
                          </a>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {liveSite?.lastUpdated && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last deployed: {fmt(liveSite.lastUpdated)}</span>
                          )}
                          {/* Shut Down is the ONLY action on the live card */}
                          <button
                            style={s.shutdownBtn}
                            onClick={() => handleShutdown(proj.linkedSubdomain, proj.projectId)}
                            disabled={shuttingDown === proj.linkedSubdomain}
                          >
                            {shuttingDown === proj.linkedSubdomain ? 'Shutting down...' : '⛔ Shut Down'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Timeline connector line */}
                  {proj.linkedSubdomain && (
                    <div style={s.timelineLine}>
                      <div style={s.timelineVert} />
                      <span style={s.timelineLabel}>↑ live from Clone 1{proj.deployedAt ? ` · ${fmt(proj.deployedAt)}` : ''}</span>
                    </div>
                  )}

                  {/* ── Main project card (Clone 1 equivalent — most editable) ── */}
                  <div style={s.card}>
                    <div style={s.cardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        {proj.linkedSubdomain && (
                          <span style={{ ...s.statusDot, background: isLive ? '#22c55e' : '#6b7280' }} />
                        )}
                        <span style={s.cardTitle}>{proj.name}</span>
                        {proj.projectMemory?.rawMessages?.length > 0 || proj.projectMemory?.summaries?.length > 0 ? (
                          <span title="Has AI memory" style={{ fontSize: 12, background: 'rgba(99,102,241,0.15)', color: '#6366f1', padding: '1px 6px', borderRadius: 6, flexShrink: 0 }}>🧠 Memory</span>
                        ) : null}
                      </div>
                      <span style={s.versionBadge}>v{proj.version || 1}</span>
                    </div>

                    {proj.linkedSubdomain && (
                      <div style={s.subdomainRow}>
                        <span style={s.subdomainText}>{proj.linkedSubdomain}.zapcodes.net</span>
                        <span style={{ ...s.statusLabel, color: isLive ? '#22c55e' : '#6b7280', background: isLive ? 'rgba(34,197,94,.1)' : 'rgba(107,114,128,.1)' }}>
                          {isLive ? '● Live' : '○ Offline'}
                        </span>
                      </div>
                    )}

                    {proj.description && !proj.description.startsWith('Deployed site:') && (
                      <p style={s.cardDesc}>{proj.description.slice(0, 100)}</p>
                    )}

                    <div style={s.cardMeta}>
                      <span>{proj.fileCount || 0} file{(proj.fileCount||0) !== 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>{proj.template || 'custom'}</span>
                      <span>·</span>
                      <span>{fmt(proj.updatedAt) || 'N/A'}</span>
                    </div>

                    {/* Main project card — no edit buttons here.
                         All editing happens on Clone 1 to protect the live site.
                         First-time deploy shows Deploy button before any clones exist. */}
                    <div style={s.cardActions}>
                      {/* Only show Deploy if not yet linked to any subdomain */}
                      {!proj.linkedSubdomain && (
                        <button style={s.actionBtn('#8b5cf6')} onClick={() => navigate(`/build?project=${proj.projectId}&action=deploy`)}>
                          🚀 Deploy
                        </button>
                      )}
                      {/* Delete the whole project */}
                      <button style={s.deleteBtn} onClick={() => handleDeleteProject(proj.projectId, proj.linkedSubdomain)} disabled={deleting === proj.projectId}>
                        {deleting === proj.projectId ? '...' : 'Delete'}
                      </button>
                    </div>

                    {/* Toggle clones */}
                    {proj.linkedSubdomain && (
                      <button
                        style={{ marginTop: 10, background: 'none', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '5px 12px', width: '100%' }}
                        onClick={() => toggleClones(proj.projectId)}
                      >
                        {clonesOpen ? '▲ Hide clone history' : `▼ Show clone history${clones.length > 0 ? ` (${clones.length} snapshots)` : ''}`}
                      </button>
                    )}
                  </div>

                  {/* ── Clone Timeline ── */}
                  {clonesOpen && (
                    <div style={s.cloneTimeline}>
                      {clones.length === 0 ? (
                        <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No clone snapshots yet. Snapshots are auto-created when you re-deploy.
                        </div>
                      ) : (
                        clones.map((clone, idx) => {
                          const isClone1   = clone.cloneVersion === 1;
                          const cloneDate  = fmt(clone.createdAt || clone.updatedAt);
                          const isRolling  = rollingBack === clone.projectId;

                          return (
                            <div key={clone.projectId}>
                              {/* Timeline connector */}
                              <div style={s.timelineLine}>
                                <div style={s.timelineVert} />
                                <span style={s.timelineLabel}>
                                  {isClone1 ? '📦 Latest snapshot' : `📦 Clone ${clone.cloneVersion}`}
                                  {cloneDate ? ` · ${cloneDate}` : ''}
                                </span>
                              </div>

                              {/* Clone card */}
                              <div style={{ ...s.cloneCard, borderColor: isClone1 ? 'rgba(99,102,241,0.3)' : 'var(--border)', background: isClone1 ? 'rgba(99,102,241,0.04)' : 'var(--bg-card)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: isClone1 ? '#6366f1' : 'var(--text-secondary)' }}>
                                      {isClone1 ? '📦 Clone 1 (latest snapshot)' : `📦 Clone ${clone.cloneVersion}`}
                                    </span>
                                    {(clone.hasMemory) && (
                                      <span style={{ fontSize: 10, background: 'rgba(99,102,241,0.12)', color: '#6366f1', padding: '1px 6px', borderRadius: 5 }}>🧠</span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    {clone.fileCount || 0} file{(clone.fileCount||0) !== 1 ? 's' : ''}
                                    {cloneDate ? ` · ${cloneDate}` : ''}
                                  </span>
                                </div>

                                {/* Buttons:
                                     Clone 1 = Edit + Fix Bugs + Re-deploy + Delete
                                     Clone 2-5 = Rollback + Delete
                                     Editing always on Clone 1 — live site stays online */}
                                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                  {isClone1 ? (
                                    <>
                                      <button
                                        style={s.actionBtn('#6366f1')}
                                        onClick={() => navigate(`/build?project=${clone.projectId}&action=edit`)}
                                      >
                                        ✏️ Edit
                                      </button>
                                      <button
                                        style={s.actionBtn('#f59e0b')}
                                        onClick={() => navigate(`/build?project=${clone.projectId}&action=fix`)}
                                      >
                                        🔧 Fix Bugs
                                      </button>
                                      <button
                                        style={s.actionBtn('#22c55e')}
                                        onClick={() => handleRedeploy(clone.projectId, proj.linkedSubdomain)}
                                        disabled={redeploying === clone.projectId}
                                      >
                                        {redeploying === clone.projectId ? 'Deploying...' : '🚀 Re-deploy'}
                                      </button>
                                      <button
                                        style={{ ...s.deleteBtn, marginLeft: 'auto' }}
                                        onClick={() => handleDeleteClone(clone.projectId)}
                                        disabled={deleting === clone.projectId}
                                      >
                                        {deleting === clone.projectId ? '...' : '🗑️ Delete'}
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        style={s.actionBtn('#f59e0b')}
                                        onClick={() => handleRollback(clone.projectId, proj.linkedSubdomain, cloneDate)}
                                        disabled={isRolling}
                                      >
                                        {isRolling ? 'Rolling back...' : '↩️ Rollback to this version'}
                                      </button>
                                      <button
                                        style={{ ...s.deleteBtn, marginLeft: 'auto' }}
                                        onClick={() => handleDeleteClone(clone.projectId)}
                                        disabled={deleting === clone.projectId}
                                      >
                                        {deleting === clone.projectId ? '...' : '🗑️ Delete'}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page:     { padding: '24px 20px', maxWidth: 1100, margin: '0 auto' },
  h1:       { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' },
  subtitle: { fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28 },
  section:  { marginBottom: 40 },
  sectionDesc: { fontSize: 12, color: 'var(--text-muted)', marginTop: -10, marginBottom: 16 },
  h2:       { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 },
  grid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 },
  projectList: { display: 'flex', flexDirection: 'column', gap: 28 },

  // Live site card
  liveCard: {
    background: 'linear-gradient(135deg, rgba(34,197,94,.06), rgba(34,197,94,.02))',
    border: '1px solid rgba(34,197,94,.2)', borderRadius: 14, padding: 18,
  },
  liveCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  liveDot:  { width: 8, height: 8, borderRadius: 4, background: '#22c55e', display: 'inline-block', animation: 'pulse 2s infinite' },
  liveLabel:{ fontSize: 10, fontWeight: 800, color: '#22c55e', letterSpacing: 1 },
  liveMeta: { display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' },
  siteUrl:  { color: '#22c55e', fontWeight: 700, fontSize: 13, textDecoration: 'none' },
  shutdownBtn: {
    padding: '6px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)',
    background: 'rgba(239,68,68,.06)', color: '#ef4444', cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
  },

  // Project + clone layout
  projectBlock: { display: 'flex', flexDirection: 'column' },
  liveTimelineCard: {
    background: 'linear-gradient(135deg, rgba(34,197,94,.06), rgba(34,197,94,.02))',
    border: '1px solid rgba(34,197,94,.25)', borderRadius: 12, padding: '12px 16px',
  },
  timelineLine: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 18px',
  },
  timelineVert: {
    width: 2, height: 28, background: 'linear-gradient(180deg, rgba(99,102,241,0.4), rgba(99,102,241,0.1))',
    borderRadius: 2, flexShrink: 0,
  },
  timelineLabel: { fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' },
  cloneTimeline: { paddingLeft: 0 },

  // Project card
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18,
  },
  cloneCard: {
    border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle:  { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  versionBadge: {
    padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
    background: 'rgba(99,102,241,.12)', color: '#6366f1', flexShrink: 0,
  },
  subdomainRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  subdomainText:{ fontSize: 12, color: '#6366f1', fontWeight: 600 },
  statusLabel: { padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700 },
  statusDot:   { width: 8, height: 8, borderRadius: 4, display: 'inline-block', flexShrink: 0 },
  cardDesc:    { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 },
  cardMeta:    { display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, flexWrap: 'wrap' },
  cardActions: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },

  actionBtn: (color) => ({
    padding: '6px 14px', borderRadius: 8, border: `1px solid ${color}33`,
    background: `${color}11`, color: color, cursor: 'pointer',
    fontSize: 12, fontWeight: 700, transition: 'all .15s', fontFamily: 'inherit',
  }),
  deleteBtn: {
    padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)',
    background: 'transparent', color: '#ef4444', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, marginLeft: 'auto', fontFamily: 'inherit',
  },
  empty: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14,
  },
  ctaBtn: {
    marginTop: 12, padding: '10px 24px', borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
    cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
  },
};
