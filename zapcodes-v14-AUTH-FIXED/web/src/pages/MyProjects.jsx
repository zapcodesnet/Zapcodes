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
  const [cloneMap,      setCloneMap]      = useState({});
  const [expandedHistory, setExpandedHistory] = useState({});

  useEffect(() => {
    Promise.all([
      api.get('/api/build/projects').then(r => {
        const allProjects = r.data.projects || [];
        setProjects(allProjects);
        // Auto-load clones for all linked projects so Edit/Fix buttons work immediately
        const rootProjects = allProjects.filter(p => !p.cloneVersion && p.linkedSubdomain);
        rootProjects.forEach(rp => {
          api.get(`/api/build/project-clones/${rp.projectId}`).then(cr => {
            setCloneMap(prev => ({ ...prev, [rp.projectId]: cr.data.clones || [] }));
          }).catch(() => {});
        });
      }).catch(() => {}),
      api.get('/api/build/sites').then(r => setSites(r.data.sites || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const loadClones = async (rootId) => {
    if (cloneMap[rootId]) return;
    try {
      const { data } = await api.get(`/api/build/project-clones/${rootId}`);
      setCloneMap(prev => ({ ...prev, [rootId]: data.clones || [] }));
    } catch {}
  };

  const toggleHistory = (rootId) => {
    setExpandedHistory(prev => ({ ...prev, [rootId]: !prev[rootId] }));
    if (!cloneMap[rootId]) loadClones(rootId);
  };

  const refresh = async () => {
    setLoading(true);
    const [projRes] = await Promise.all([
      api.get('/api/build/projects').then(r => r.data.projects || []).catch(() => []),
      api.get('/api/build/sites').then(r => setSites(r.data.sites || [])).catch(() => {}),
    ]);
    setProjects(projRes);
    // Reload clones for linked projects
    setCloneMap({});
    const rootProjects = projRes.filter(p => !p.cloneVersion && p.linkedSubdomain);
    rootProjects.forEach(rp => {
      api.get(`/api/build/project-clones/${rp.projectId}`).then(cr => {
        setCloneMap(prev => ({ ...prev, [rp.projectId]: cr.data.clones || [] }));
      }).catch(() => {});
    });
    setLoading(false);
  };

  const handleShutdown = async (subdomain, rootProjectId) => {
    if (!confirm(`Shut down ${subdomain}.zapcodes.net?\n\nYour live site will go offline. A snapshot of the current live version will be saved so you can roll back anytime.`)) return;
    setShuttingDown(subdomain);
    try {
      await api.post('/api/build/site/shutdown', { subdomain });
      setSites(s => s.filter(site => site.subdomain !== subdomain));
      if (rootProjectId) {
        const { data } = await api.get(`/api/build/project-clones/${rootProjectId}`);
        setCloneMap(prev => ({ ...prev, [rootProjectId]: data.clones || [] }));
      }
    } catch (err) { alert(err.response?.data?.error || 'Shutdown failed'); }
    finally { setShuttingDown(null); }
  };

  const handleDeleteProject = async (projectId, linkedSubdomain) => {
    const msg = linkedSubdomain
      ? `Delete this project and all its version history?\n\nThis will also shut down ${linkedSubdomain}.zapcodes.net.`
      : 'Delete this project and all its version history?\n\nThis cannot be undone.';
    if (!confirm(msg)) return;
    setDeleting(projectId);
    try {
      const { data } = await api.delete(`/api/build/project/${projectId}`);
      setProjects(p => p.filter(proj => proj.projectId !== projectId));
      if (data.shutdownSite) setSites(s => s.filter(site => site.subdomain !== data.shutdownSite));
    } catch (err) { alert(err.response?.data?.error || 'Delete failed'); }
    finally { setDeleting(null); }
  };

  const handleDeleteClone = async (cloneProjectId, rootId) => {
    if (!confirm('Delete this version snapshot?\n\nThis cannot be undone. Your live site is not affected.')) return;
    setDeleting(cloneProjectId);
    try {
      await api.delete(`/api/build/project/${cloneProjectId}`);
      setCloneMap(prev => {
        const updated = { ...prev };
        for (const rid in updated) {
          updated[rid] = (updated[rid] || []).filter(c => c.projectId !== cloneProjectId);
        }
        return updated;
      });
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const handleRedeploy = async (cloneProjectId, subdomain) => {
    if (!confirm(`Deploy to ${subdomain}.zapcodes.net?\n\nYour current live version will be auto-saved to version history.`)) return;
    setRedeploying(cloneProjectId);
    try {
      await api.post('/api/build/redeploy-from-project', { projectId: cloneProjectId });
      alert(`✅ Deployed! ${subdomain}.zapcodes.net is now live.`);
      await refresh();
    } catch (err) { alert(err.response?.data?.error || 'Deploy failed'); }
    finally { setRedeploying(null); }
  };

  const handleRollback = async (cloneProjectId, subdomain, cloneDate) => {
    if (!confirm(`Roll back to version from ${cloneDate}?\n\nThis will replace your live site and save the current version to history.`)) return;
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

  // ── Merge root projects with their Clone 1 for display ──
  // Root projects = no cloneVersion. Each gets its Clone 1 looked up for Edit/Fix actions.
  const rootProjects = projects.filter(p => !p.cloneVersion);

  return (
    <div style={s.page}>
      <h1 style={s.h1}>My Projects</h1>
      <p style={s.subtitle}>
        Your sites and version history — edit safely, deploy when ready.
      </p>

      {rootProjects.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>No projects yet</p>
          <p style={{ margin: '0 0 16px', fontSize: 13 }}>Build your first website with AI in minutes.</p>
          <button style={s.ctaBtn} onClick={() => navigate('/build')}>Build your first project →</button>
        </div>
      ) : (
        <div style={s.projectList}>
          {rootProjects.map(proj => {
            const isLive       = proj.linkedSubdomain && sites.some(si => si.subdomain === proj.linkedSubdomain);
            const liveSite     = sites.find(si => si.subdomain === proj.linkedSubdomain);
            const clones       = cloneMap[proj.projectId] || [];
            const clone1       = clones.find(c => c.cloneVersion === 1);
            const olderClones  = clones.filter(c => c.cloneVersion > 1);
            const historyOpen  = expandedHistory[proj.projectId];

            // For Edit/Fix/Redeploy — use Clone 1 if it exists, else root project
            const editTarget   = clone1?.projectId || proj.projectId;

            return (
              <div key={proj.projectId} style={s.card}>

                {/* ── Top: Name + Status ── */}
                <div style={s.cardTop}>
                  <div style={s.cardTopLeft}>
                    <span style={s.cardTitle}>{proj.name}</span>
                    <span style={{ ...s.versionBadge }}>v{proj.version || 1}</span>
                    {proj.hasMemory && (
                      <span title="Has AI memory" style={s.memoryBadge}>🧠</span>
                    )}
                  </div>
                  <div style={{
                    ...s.statusBadge,
                    background: isLive ? 'rgba(34,197,94,.1)' : 'rgba(107,114,128,.08)',
                    color: isLive ? '#22c55e' : '#6b7280',
                    borderColor: isLive ? 'rgba(34,197,94,.25)' : 'rgba(107,114,128,.15)',
                  }}>
                    <span style={{ ...s.statusDot, background: isLive ? '#22c55e' : '#6b7280' }} />
                    {isLive ? 'Live' : proj.linkedSubdomain ? 'Offline' : 'Draft'}
                  </div>
                </div>

                {/* ── URL row ── */}
                {proj.linkedSubdomain && (
                  <div style={s.urlRow}>
                    <a
                      href={`https://${proj.linkedSubdomain}.zapcodes.net`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...s.urlLink, color: isLive ? '#22c55e' : '#6b7280' }}
                    >
                      {proj.linkedSubdomain}.zapcodes.net ↗
                    </a>
                    {isLive && liveSite?.lastUpdated && (
                      <span style={s.metaText}>Last deployed {fmt(liveSite.lastUpdated)}</span>
                    )}
                  </div>
                )}

                {/* ── Meta row ── */}
                <div style={s.metaRow}>
                  <span>{proj.fileCount || 0} file{(proj.fileCount || 0) !== 1 ? 's' : ''}</span>
                  <span style={s.metaDot}>·</span>
                  <span>{proj.template || 'custom'}</span>
                  <span style={s.metaDot}>·</span>
                  <span>Updated {fmt(proj.updatedAt) || 'N/A'}</span>
                </div>

                {/* ── Action buttons ── */}
                <div style={s.actions}>
                  {/* If project has clones (was deployed before) — show Edit/Fix/Deploy */}
                  {proj.linkedSubdomain && clone1 ? (
                    <>
                      <button
                        style={s.btn('#6366f1')}
                        onClick={() => navigate(`/build?project=${editTarget}&action=edit`)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        style={s.btn('#f59e0b')}
                        onClick={() => navigate(`/build?project=${editTarget}&action=fix`)}
                      >
                        🔧 Fix Bugs
                      </button>
                      <button
                        style={s.btn('#22c55e')}
                        onClick={() => handleRedeploy(editTarget, proj.linkedSubdomain)}
                        disabled={redeploying === editTarget}
                      >
                        {redeploying === editTarget ? 'Deploying...' : '🚀 Deploy'}
                      </button>
                      {isLive && (
                        <button
                          style={s.shutdownBtn}
                          onClick={() => handleShutdown(proj.linkedSubdomain, proj.projectId)}
                          disabled={shuttingDown === proj.linkedSubdomain}
                        >
                          {shuttingDown === proj.linkedSubdomain ? 'Shutting down...' : '⛔ Shut Down'}
                        </button>
                      )}
                    </>
                  ) : proj.linkedSubdomain && !clone1 ? (
                    /* Clones still loading — use root project ID as fallback */
                    <>
                      <button
                        style={s.btn('#6366f1')}
                        onClick={() => navigate(`/build?project=${proj.projectId}&action=edit`)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        style={s.btn('#f59e0b')}
                        onClick={() => navigate(`/build?project=${proj.projectId}&action=fix`)}
                      >
                        🔧 Fix Bugs
                      </button>
                      <button
                        style={s.btn('#22c55e')}
                        onClick={() => handleRedeploy(proj.projectId, proj.linkedSubdomain)}
                        disabled={redeploying === proj.projectId}
                      >
                        {redeploying === proj.projectId ? 'Deploying...' : '🚀 Deploy'}
                      </button>
                      {isLive && (
                        <button
                          style={s.shutdownBtn}
                          onClick={() => handleShutdown(proj.linkedSubdomain, proj.projectId)}
                          disabled={shuttingDown === proj.linkedSubdomain}
                        >
                          {shuttingDown === proj.linkedSubdomain ? 'Shutting down...' : '⛔ Shut Down'}
                        </button>
                      )}
                    </>
                  ) : (
                    /* Never deployed — first-time deploy */
                    <button
                      style={s.btn('#8b5cf6')}
                      onClick={() => navigate(`/build?project=${proj.projectId}&action=deploy`)}
                    >
                      🚀 Deploy
                    </button>
                  )}

                  {/* Delete always available, pushed to the right */}
                  <button
                    style={s.deleteBtn}
                    onClick={() => handleDeleteProject(proj.projectId, proj.linkedSubdomain)}
                    disabled={deleting === proj.projectId}
                  >
                    {deleting === proj.projectId ? '...' : '🗑️'}
                  </button>
                </div>

                {/* ── Version History (collapsible) ── */}
                {proj.linkedSubdomain && (
                  <button
                    style={s.historyToggle}
                    onClick={() => toggleHistory(proj.projectId)}
                  >
                    {historyOpen
                      ? '▲ Hide version history'
                      : `▼ Version history${olderClones.length > 0 ? ` (${olderClones.length})` : ''}`
                    }
                  </button>
                )}

                {historyOpen && (
                  <div style={s.historyList}>
                    {olderClones.length === 0 ? (
                      <div style={s.historyEmpty}>
                        No older versions yet. Versions are auto-saved when you deploy.
                      </div>
                    ) : (
                      olderClones.map(clone => {
                        const cloneDate = fmt(clone.createdAt || clone.updatedAt);
                        const isRolling = rollingBack === clone.projectId;

                        return (
                          <div key={clone.projectId} style={s.historyRow}>
                            <div style={s.historyRowLeft}>
                              <span style={s.historyIcon}>📦</span>
                              <div>
                                <span style={s.historyLabel}>
                                  {clone.deployedAt ? 'Deployed version' : 'Saved version'}
                                </span>
                                <span style={s.historyDate}>
                                  {cloneDate}
                                  {clone.fileCount != null && ` · ${clone.fileCount} file${clone.fileCount !== 1 ? 's' : ''}`}
                                  {clone.hasMemory && ' · 🧠'}
                                </span>
                              </div>
                            </div>
                            <div style={s.historyRowActions}>
                              <button
                                style={s.historyBtn('#f59e0b')}
                                onClick={() => handleRollback(clone.projectId, proj.linkedSubdomain, cloneDate)}
                                disabled={isRolling}
                              >
                                {isRolling ? '...' : '↩️ Rollback'}
                              </button>
                              <button
                                style={s.historyBtn('#ef4444')}
                                onClick={() => handleDeleteClone(clone.projectId, proj.projectId)}
                                disabled={deleting === clone.projectId}
                              >
                                {deleting === clone.projectId ? '...' : '🗑️'}
                              </button>
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
  );
}

const s = {
  page:     { padding: '24px 20px', maxWidth: 900, margin: '0 auto' },
  h1:       { fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, marginTop: 0 },

  projectList: { display: 'flex', flexDirection: 'column', gap: 16 },

  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 20px',
  },

  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 10,
  },
  cardTopLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  versionBadge: {
    padding: '2px 7px',
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 700,
    background: 'rgba(99,102,241,.1)',
    color: '#6366f1',
    flexShrink: 0,
  },
  memoryBadge: {
    fontSize: 11,
    background: 'rgba(99,102,241,0.1)',
    padding: '1px 5px',
    borderRadius: 5,
    flexShrink: 0,
  },

  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 10px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 700,
    border: '1px solid',
    flexShrink: 0,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    display: 'inline-block',
  },

  urlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  urlLink: {
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  },
  metaText: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },

  metaRow: {
    display: 'flex',
    gap: 5,
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  metaDot: { color: 'var(--text-muted)', opacity: 0.4 },

  actions: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
  },

  btn: (color) => ({
    padding: '7px 14px',
    borderRadius: 8,
    border: `1px solid ${color}30`,
    background: `${color}0d`,
    color: color,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'inherit',
    transition: 'all .15s',
  }),
  shutdownBtn: {
    padding: '7px 14px',
    borderRadius: 8,
    border: '1px solid rgba(239,68,68,.25)',
    background: 'rgba(239,68,68,.06)',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  deleteBtn: {
    padding: '7px 10px',
    borderRadius: 8,
    border: '1px solid rgba(239,68,68,.2)',
    background: 'transparent',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    marginLeft: 'auto',
    fontFamily: 'inherit',
  },

  /* ── Version History ── */
  historyToggle: {
    marginTop: 12,
    background: 'none',
    border: '1px dashed var(--border)',
    borderRadius: 8,
    color: 'var(--text-muted)',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '6px 12px',
    width: '100%',
    fontFamily: 'inherit',
  },
  historyList: {
    marginTop: 8,
    borderTop: '1px solid var(--border)',
    paddingTop: 8,
  },
  historyEmpty: {
    padding: '10px 0',
    fontSize: 12,
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  historyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 4px',
    borderBottom: '1px solid var(--border)',
    gap: 8,
    flexWrap: 'wrap',
  },
  historyRowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  historyIcon: { fontSize: 14, flexShrink: 0 },
  historyLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  historyDate: {
    display: 'block',
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  historyRowActions: {
    display: 'flex',
    gap: 4,
    flexShrink: 0,
  },
  historyBtn: (color) => ({
    padding: '4px 10px',
    borderRadius: 6,
    border: `1px solid ${color}30`,
    background: `${color}0a`,
    color: color,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'inherit',
  }),

  /* ── Empty state ── */
  empty: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '48px 32px',
    textAlign: 'center',
    color: 'var(--text-secondary)',
    fontSize: 14,
  },
  ctaBtn: {
    padding: '10px 24px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 14,
    fontFamily: 'inherit',
  },
};
