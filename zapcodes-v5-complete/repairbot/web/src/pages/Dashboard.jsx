import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';

export default function Dashboard() {
  const { user, repos, stats, scanStatus, fetchRepos, fetchStats, scanRepo } = useAuth();
  const [repoUrl, setRepoUrl] = useState('');
  const [engine, setEngine] = useState('ollama');
  const [scanning, setScanning] = useState(false);
  const [params] = useSearchParams();

  useEffect(() => {
    fetchRepos();
    fetchStats();
  }, [fetchRepos, fetchStats]);

  const upgraded = params.get('upgraded');

  const handleScan = async (e) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    setScanning(true);
    try {
      await scanRepo(repoUrl, engine);
      setRepoUrl('');
    } catch (err) {
      // Error handled in context
    } finally {
      setScanning(false);
    }
  };

  const statCards = [
    { label: 'Total Repos', value: stats?.totalRepos || 0, icon: '📁', color: 'var(--info)' },
    { label: 'Critical Bugs', value: stats?.criticalBugs || 0, icon: '🔴', color: 'var(--danger)' },
    { label: 'Issues Found', value: stats?.totalIssues || 0, icon: '⚠️', color: 'var(--warning)' },
    { label: 'Fixes Applied', value: stats?.fixedIssues || 0, icon: '✅', color: 'var(--accent)' },
  ];

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="page-content">
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 4 }}>
            Dashboard
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Welcome back, {user?.name}. {stats?.scansUsed || 0}/{stats?.scansLimit || 5} scans used this month.
          </p>
        </div>

        {upgraded && (
          <div style={styles.successBanner}>
            🎉 Successfully upgraded to <strong>{upgraded}</strong> plan!
          </div>
        )}

        {/* Stats Grid */}
        <div style={styles.statsGrid}>
          {statCards.map((s) => (
            <div key={s.label} className="card" style={styles.statCard}>
              <span style={{ fontSize: '1.5rem' }}>{s.icon}</span>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: s.color, fontFamily: 'var(--font-mono)' }}>
                {s.value}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Scan Form */}
        <div className="card" style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 16 }}>
            🔍 Scan a Repository
          </h2>
          <form onSubmit={handleScan}>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
                style={{ flex: 1, minWidth: 250 }}
                disabled={scanning}
              />
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value)}
                style={{ width: 180, fontFamily: 'var(--font-display)' }}
                disabled={scanning}
              >
                <option value="ollama">🧠 Ollama (Free)</option>
                <option value="claude-pro">⚡ Claude Pro</option>
              </select>
              <button type="submit" className="btn btn-primary" disabled={scanning}>
                {scanning ? (
                  <><span className="spinner" /> Scanning...</>
                ) : (
                  'Scan Repository'
                )}
              </button>
            </div>
          </form>

          {/* Scan Status */}
          {scanStatus && (
            <div style={{
              marginTop: 16, padding: 12, borderRadius: 'var(--radius-sm)',
              background: scanStatus.status === 'error' ? 'rgba(255,68,102,0.1)' : 'var(--accent-glow)',
              border: `1px solid ${scanStatus.status === 'error' ? 'rgba(255,68,102,0.3)' : 'rgba(0,229,160,0.3)'}`,
              color: scanStatus.status === 'error' ? 'var(--danger)' : 'var(--accent)',
              fontSize: '0.9rem',
            }}>
              {scanStatus.status === 'scanning' && <span className="spinner" style={{ marginRight: 8, display: 'inline-block' }} />}
              {scanStatus.message}
            </div>
          )}
        </div>

        {/* Recent Repos */}
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 16 }}>
            📁 Scanned Repositories
          </h2>
          {repos.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
              No repositories scanned yet. Paste a GitHub URL above to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {repos.map((repo) => (
                <Link
                  key={repo._id}
                  to={`/repo/${repo._id}`}
                  className="card"
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                >
                  <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{repo.owner}/{repo.name}</span>
                        <span className="badge" style={{
                          background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                          border: '1px solid var(--border)', fontSize: '0.65rem',
                        }}>
                          {repo.platform}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        {repo.issues?.length || 0} issues found • {repo.engine} engine
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {repo.stats?.critical > 0 && <span className="badge badge-critical">{repo.stats.critical} critical</span>}
                      {repo.stats?.high > 0 && <span className="badge badge-high">{repo.stats.high} high</span>}
                      {repo.stats?.medium > 0 && <span className="badge badge-medium">{repo.stats.medium} medium</span>}
                      {repo.stats?.low > 0 && <span className="badge badge-low">{repo.stats.low} low</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const styles = {
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16,
  },
  statCard: {
    textAlign: 'center', padding: 24,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  },
  successBanner: {
    background: 'var(--accent-glow)', border: '1px solid rgba(0,229,160,0.3)',
    borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 24,
    color: 'var(--accent)', fontSize: '0.95rem',
  },
};
