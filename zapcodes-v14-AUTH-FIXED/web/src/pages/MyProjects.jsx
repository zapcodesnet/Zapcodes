import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

export default function MyProjects() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [shuttingDown, setShuttingDown] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/api/build/projects').then(r => setProjects(r.data.projects || [])).catch(() => {}),
      api.get('/api/build/sites').then(r => setSites(r.data.sites || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  // ── Shut Down: removes from live, keeps project with subdomain ──
  const handleShutdown = async (subdomain) => {
    if (!confirm(`Shut down ${subdomain}.zapcodes.net?\n\nThe site will go offline but your project is still saved.\nYou can re-deploy anytime from Saved Projects.`)) return;
    setShuttingDown(subdomain);
    try {
      await api.post('/api/build/site/shutdown', { subdomain });
      setSites(s => s.filter(site => site.subdomain !== subdomain));
    } catch (err) { alert(err.response?.data?.error || 'Shutdown failed'); }
    finally { setShuttingDown(null); }
  };

  // ── Delete Project: also shuts down linked live site, frees subdomain ──
  const handleDeleteProject = async (projectId, linkedSubdomain) => {
    const msg = linkedSubdomain
      ? `Delete this project?\n\nThis will also SHUT DOWN ${linkedSubdomain}.zapcodes.net and free the subdomain for others.`
      : 'Delete this project? This cannot be undone.';
    if (!confirm(msg)) return;
    setDeleting(projectId);
    try {
      const { data } = await api.delete(`/api/build/project/${projectId}`);
      setProjects(p => p.filter(proj => proj.projectId !== projectId));
      // If the backend also shut down a live site, remove it from the list
      if (data.shutdownSite) {
        setSites(s => s.filter(site => site.subdomain !== data.shutdownSite));
      }
    } catch (err) { alert(err.response?.data?.error || 'Delete failed'); }
    finally { setDeleting(null); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading projects...</div>;

  return (
    <div style={s.page}>
      <h1 style={s.h1}>My Projects</h1>
      <p style={s.subtitle}>Edit and fix bugs on your saved projects. Live sites stay online until you shut them down.</p>

      {/* ═══════════ LIVE SITES — URL + Shut Down only ═══════════ */}
      <div style={s.section}>
        <h2 style={s.h2}>🌐 Live Sites ({sites.length})</h2>
        {sites.length === 0 ? (
          <div style={s.empty}>
            <p>No sites live yet. Deploy from Saved Projects below.</p>
          </div>
        ) : (
          <div style={s.grid}>
            {sites.map(site => {
              const isShuttingDown = shuttingDown === site.subdomain;
              return (
                <div key={site.subdomain} style={s.liveCard}>
                  <div style={s.liveCardTop}>
                    <div style={s.liveIndicator}>
                      <span style={s.liveDot} />
                      <span style={s.liveLabel}>LIVE</span>
                    </div>
                    <a href={`https://${site.subdomain}.zapcodes.net`} target="_blank" rel="noreferrer" style={s.siteUrl}>
                      {site.subdomain}.zapcodes.net ↗
                    </a>
                  </div>
                  <div style={s.liveMeta}>
                    <span>{site.title || site.subdomain}</span>
                    <span>·</span>
                    <span>{site.lastUpdated ? new Date(site.lastUpdated).toLocaleDateString() : ''}</span>
                    {site.hasBadge && <><span>·</span><span>Badge</span></>}
                  </div>
                  <div style={s.liveActions}>
                    <button
                      style={s.shutdownBtn}
                      onClick={() => handleShutdown(site.subdomain)}
                      disabled={isShuttingDown}
                    >
                      {isShuttingDown ? 'Shutting down...' : '⛔ Shut Down'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════ SAVED PROJECTS — Edit, Fix Bugs, Deploy/Re-deploy ═══════════ */}
      <div style={s.section}>
        <h2 style={s.h2}>📁 Saved Projects ({projects.length})</h2>
        <p style={s.sectionDesc}>All edits and bug fixes happen here. Your live site is never touched until you re-deploy.</p>
        {projects.length === 0 ? (
          <div style={s.empty}>
            <p>No saved projects yet. Projects are auto-saved when you deploy a site.</p>
            <button style={s.ctaBtn} onClick={() => navigate('/build')}>Build your first project →</button>
          </div>
        ) : (
          <div style={s.grid}>
            {projects.map(proj => {
              const isLive = proj.linkedSubdomain && sites.some(s => s.subdomain === proj.linkedSubdomain);
              const isOffline = proj.linkedSubdomain && !isLive;
              const isNew = !proj.linkedSubdomain;

              return (
                <div key={proj.projectId} style={s.card}>
                  {/* Header: name + status */}
                  <div style={s.cardHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      {proj.linkedSubdomain && (
                        <span style={{ ...s.statusDot, background: isLive ? '#22c55e' : '#6b7280' }} title={isLive ? 'Live' : 'Offline'} />
                      )}
                      <span style={s.cardTitle}>{proj.name}</span>
                    </div>
                    <span style={s.versionBadge}>v{proj.version || 1}</span>
                  </div>

                  {/* Subdomain + status label */}
                  {proj.linkedSubdomain && (
                    <div style={s.subdomainRow}>
                      <span style={s.subdomainText}>{proj.linkedSubdomain}.zapcodes.net</span>
                      <span style={{ ...s.statusLabel, color: isLive ? '#22c55e' : '#6b7280', background: isLive ? 'rgba(34,197,94,.1)' : 'rgba(107,114,128,.1)' }}>
                        {isLive ? '● Live' : '○ Offline'}
                      </span>
                    </div>
                  )}

                  {/* Description */}
                  {proj.description && !proj.description.startsWith('Deployed site:') && (
                    <p style={s.cardDesc}>{proj.description.slice(0, 120)}</p>
                  )}

                  {/* Meta */}
                  <div style={s.cardMeta}>
                    <span>{proj.fileCount || 0} file{(proj.fileCount || 0) !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>{proj.template || 'custom'}</span>
                    <span>·</span>
                    <span>{proj.updatedAt ? new Date(proj.updatedAt).toLocaleDateString() : 'N/A'}</span>
                  </div>

                  {/* Action Buttons */}
                  <div style={s.cardActions}>
                    <button
                      style={s.actionBtn('#6366f1')}
                      onClick={() => navigate(`/build?project=${proj.projectId}&action=edit`)}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      style={s.actionBtn('#f59e0b')}
                      onClick={() => navigate(`/build?project=${proj.projectId}&action=fix`)}
                    >
                      🔧 Fix Bugs
                    </button>

                    {/* Deploy / Re-deploy / Go Live */}
                    {isLive ? (
                      <button
                        style={s.actionBtn('#22c55e')}
                        onClick={() => navigate(`/build?project=${proj.projectId}&action=redeploy&subdomain=${proj.linkedSubdomain}`)}
                      >
                        🚀 Re-deploy
                      </button>
                    ) : isOffline ? (
                      <button
                        style={s.actionBtn('#22c55e')}
                        onClick={() => navigate(`/build?project=${proj.projectId}&action=redeploy&subdomain=${proj.linkedSubdomain}`)}
                      >
                        🚀 Go Live
                      </button>
                    ) : (
                      <button
                        style={s.actionBtn('#8b5cf6')}
                        onClick={() => navigate(`/build?project=${proj.projectId}&action=deploy`)}
                      >
                        🚀 Deploy
                      </button>
                    )}

                    {/* Delete — pushed to far right */}
                    <button
                      style={s.deleteBtn}
                      onClick={() => handleDeleteProject(proj.projectId, proj.linkedSubdomain)}
                      disabled={deleting === proj.projectId}
                    >
                      {deleting === proj.projectId ? '...' : 'Delete'}
                    </button>
                  </div>
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
  page: { padding: '24px 20px', maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' },
  subtitle: { fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 },
  section: { marginBottom: 36 },
  sectionDesc: { fontSize: 12, color: 'var(--text-muted)', marginTop: -10, marginBottom: 16 },
  h2: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 },

  // ── Live Site Cards ──
  liveCard: {
    background: 'linear-gradient(135deg, rgba(34,197,94,.06), rgba(34,197,94,.02))',
    border: '1px solid rgba(34,197,94,.2)',
    borderRadius: 14, padding: 18,
  },
  liveCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  liveIndicator: { display: 'flex', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, background: '#22c55e', display: 'inline-block', animation: 'pulse 2s infinite' },
  liveLabel: { fontSize: 10, fontWeight: 800, color: '#22c55e', letterSpacing: 1 },
  liveMeta: { display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 },
  liveActions: { display: 'flex', justifyContent: 'flex-end' },
  shutdownBtn: {
    padding: '6px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)',
    background: 'rgba(239,68,68,.06)', color: '#ef4444', cursor: 'pointer',
    fontSize: 12, fontWeight: 700, transition: 'all .15s',
  },

  // ── Project Cards ──
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: 18,
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  versionBadge: {
    padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
    background: 'rgba(99,102,241,.12)', color: '#6366f1', flexShrink: 0,
  },
  subdomainRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  subdomainText: { fontSize: 12, color: '#6366f1', fontWeight: 600 },
  statusLabel: {
    padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, display: 'inline-block', flexShrink: 0 },
  cardDesc: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 },
  cardMeta: {
    display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-muted)',
    marginBottom: 12,
  },
  cardActions: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },

  // ── Buttons ──
  actionBtn: (color) => ({
    padding: '6px 14px', borderRadius: 8, border: `1px solid ${color}33`,
    background: `${color}11`, color: color, cursor: 'pointer',
    fontSize: 12, fontWeight: 700, transition: 'all .15s',
  }),
  deleteBtn: {
    padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)',
    background: 'transparent', color: '#ef4444', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, marginLeft: 'auto',
  },
  siteUrl: { color: '#22c55e', fontWeight: 700, fontSize: 14, textDecoration: 'none' },
  empty: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14,
  },
  ctaBtn: {
    marginTop: 12, padding: '10px 24px', borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
    cursor: 'pointer', fontWeight: 700, fontSize: 14,
  },
};
