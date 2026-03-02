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

  useEffect(() => {
    Promise.all([
      api.get('/api/build/projects').then(r => setProjects(r.data.projects || [])).catch(() => {}),
      api.get('/api/build/sites').then(r => setSites(r.data.sites || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleEditProject = (projectId) => {
    navigate(`/build?project=${projectId}`);
  };

  const handleDeleteProject = async (projectId) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    setDeleting(projectId);
    try {
      await api.delete(`/api/build/project/${projectId}`);
      setProjects(p => p.filter(proj => proj.projectId !== projectId));
    } catch (err) { alert('Delete failed'); }
    finally { setDeleting(null); }
  };

  const handleDeleteSite = async (subdomain) => {
    if (!confirm(`Delete ${subdomain}.zapcodes.net?`)) return;
    try {
      await api.delete(`/api/build/site/${subdomain}`);
      setSites(s => s.filter(site => site.subdomain !== subdomain));
    } catch { alert('Delete failed'); }
  };

  const handleRedeploySite = (subdomain) => {
    const proj = projects.find(p => p.name && p.name.toLowerCase().includes(subdomain.toLowerCase()));
    if (proj) {
      navigate(`/build?project=${proj.projectId}&action=redeploy`);
    } else {
      navigate(`/build?redeploy=${subdomain}`);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading projects...</div>;

  return (
    <div style={s.page}>
      <h1 style={s.h1}>My Projects</h1>
      <p style={s.subtitle}>Manage your saved projects and deployed sites.</p>

      {/* Saved Projects */}
      <div style={s.section}>
        <h2 style={s.h2}>📁 Saved Projects ({projects.length})</h2>
        {projects.length === 0 ? (
          <div style={s.empty}>
            <p>No saved projects yet.</p>
            <button style={s.ctaBtn} onClick={() => navigate('/build')}>Build your first project →</button>
          </div>
        ) : (
          <div style={s.grid}>
            {projects.map(proj => (
              <div key={proj.projectId} style={s.card}>
                <div style={s.cardHeader}>
                  <span style={s.cardTitle}>{proj.name}</span>
                  <span style={s.versionBadge}>v{proj.version || 1}</span>
                </div>
                {proj.description && <p style={s.cardDesc}>{proj.description.slice(0, 120)}</p>}
                <div style={s.cardMeta}>
                  <span>{proj.fileCount || 0} files</span>
                  <span>·</span>
                  <span>{proj.template || 'custom'}</span>
                  <span>·</span>
                  <span>{proj.updatedAt ? new Date(proj.updatedAt).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div style={s.cardActions}>
                  <button style={s.editBtn} onClick={() => handleEditProject(proj.projectId)}>Edit</button>
                  <button style={s.editBtn} onClick={() => navigate(`/build?project=${proj.projectId}&action=fix`)}>Fix Bug</button>
                  <button style={s.editBtn} onClick={() => navigate(`/build?project=${proj.projectId}&action=feature`)}>Add Feature</button>
                  <button style={s.deleteBtn} onClick={() => handleDeleteProject(proj.projectId)} disabled={deleting === proj.projectId}>
                    {deleting === proj.projectId ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deployed Sites */}
      <div style={s.section}>
        <h2 style={s.h2}>🌐 Deployed Sites ({sites.length})</h2>
        {sites.length === 0 ? (
          <div style={s.empty}>
            <p>No deployed sites yet. Build and deploy from the Build page.</p>
          </div>
        ) : (
          <div style={s.grid}>
            {sites.map(site => (
              <div key={site.subdomain} style={s.card}>
                <div style={s.cardHeader}>
                  <a href={`https://${site.subdomain}.zapcodes.net`} target="_blank" rel="noreferrer" style={s.siteUrl}>
                    {site.subdomain}.zapcodes.net
                  </a>
                  {site.isPWA && <span style={s.pwaBadge}>PWA</span>}
                </div>
                <p style={s.cardDesc}>{site.title || site.subdomain}</p>
                <div style={s.cardMeta}>
                  <span>{site.hasBadge ? 'Badge' : 'No badge'}</span>
                  <span>·</span>
                  <span>{site.lastUpdated ? new Date(site.lastUpdated).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div style={s.cardActions}>
                  <button style={s.editBtn} onClick={() => handleRedeploySite(site.subdomain)}>Re-deploy</button>
                  <button style={s.editBtn} onClick={() => navigate(`/build?redeploy=${site.subdomain}&action=fix`)}>Fix Errors</button>
                  <button style={s.deleteBtn} onClick={() => handleDeleteSite(site.subdomain)}>Delete</button>
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
  h1: { fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' },
  subtitle: { fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 },
  section: { marginBottom: 32 },
  h2: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: 18,
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  versionBadge: {
    padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
    background: 'rgba(99,102,241,.12)', color: '#6366f1',
  },
  pwaBadge: {
    padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
    background: 'rgba(34,197,94,.12)', color: '#22c55e',
  },
  cardDesc: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 },
  cardMeta: {
    display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-muted)',
    marginBottom: 12,
  },
  cardActions: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  editBtn: {
    padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'transparent', color: '#6366f1', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, transition: 'all .15s',
  },
  deleteBtn: {
    padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)',
    background: 'transparent', color: '#ef4444', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, marginLeft: 'auto',
  },
  siteUrl: { color: '#6366f1', fontWeight: 600, fontSize: 14, textDecoration: 'none' },
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
