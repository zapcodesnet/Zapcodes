import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import api from '../api';

export default function RepoDetail() {
  const { repoId } = useParams();
  const { user, applyFix, dismissIssue } = useAuth();
  const [repo, setRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [fixing, setFixing] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.get(`/api/scan/${repoId}`).then(({ data }) => {
      setRepo(data.repo);
      if (data.repo.issues?.length > 0) setSelectedIssue(data.repo.issues[0]);
    }).catch(console.error).finally(() => setLoading(false));
  }, [repoId]);

  const handleApplyFix = async (issueId) => {
    setFixing(issueId);
    try {
      const result = await applyFix(repoId, issueId);
      // Update local state
      setRepo(prev => ({
        ...prev,
        issues: prev.issues.map(i =>
          i.id === issueId ? { ...i, status: 'fixed', prUrl: result.prUrl } : i
        ),
      }));
      if (selectedIssue?.id === issueId) {
        setSelectedIssue(prev => ({ ...prev, status: 'fixed', prUrl: result.prUrl }));
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Fix failed');
    } finally {
      setFixing(null);
    }
  };

  const handleDismiss = async (issueId) => {
    await dismissIssue(repoId, issueId);
    setRepo(prev => ({
      ...prev,
      issues: prev.issues.map(i =>
        i.id === issueId ? { ...i, status: 'dismissed' } : i
      ),
    }));
    if (selectedIssue?.id === issueId) {
      setSelectedIssue(prev => ({ ...prev, status: 'dismissed' }));
    }
  };

  if (loading) return (
    <div className="page-layout">
      <Sidebar />
      <main className="page-content flex items-center justify-center">
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </main>
    </div>
  );

  if (!repo) return (
    <div className="page-layout">
      <Sidebar />
      <main className="page-content">
        <p>Repository not found. <Link to="/dashboard">Go back</Link></p>
      </main>
    </div>
  );

  const filteredIssues = repo.issues?.filter(i =>
    filter === 'all' ? true : i.severity === filter
  ) || [];

  return (
    <div className="page-layout">
      <Sidebar />
      <main className="page-content">
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Link to="/dashboard" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>← Back to Dashboard</Link>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 8 }}>
            {repo.owner}/{repo.name}
          </h1>
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              {repo.platform}
            </span>
            <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              {repo.engine}
            </span>
            {repo.stats?.critical > 0 && <span className="badge badge-critical">{repo.stats.critical} critical</span>}
            {repo.stats?.high > 0 && <span className="badge badge-high">{repo.stats.high} high</span>}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-1" style={{ marginBottom: 24, flexWrap: 'wrap' }}>
          {['all', 'critical', 'high', 'medium', 'low'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({
                f === 'all' ? repo.issues?.length : repo.issues?.filter(i => i.severity === f).length
              })
            </button>
          ))}
        </div>

        {/* Issue List + Detail */}
        <div style={styles.twoCol}>
          {/* Left: Issue list */}
          <div style={styles.issueList}>
            {filteredIssues.map(issue => (
              <div
                key={issue.id}
                onClick={() => setSelectedIssue(issue)}
                style={{
                  ...styles.issueItem,
                  ...(selectedIssue?.id === issue.id ? styles.issueItemActive : {}),
                  ...(issue.status === 'fixed' ? { opacity: 0.6 } : {}),
                }}
              >
                <div className="flex items-center gap-2">
                  <span className={`badge badge-${issue.severity}`} style={{ fontSize: '0.6rem' }}>
                    {issue.severity}
                  </span>
                  {issue.status === 'fixed' && <span className="badge badge-fixed" style={{ fontSize: '0.6rem' }}>fixed</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: 6 }}>{issue.title}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                  {issue.file}:{issue.line}
                </div>
              </div>
            ))}
            {filteredIssues.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                No issues match this filter.
              </div>
            )}
          </div>

          {/* Right: Issue detail */}
          <div style={styles.issueDetail}>
            {selectedIssue ? (
              <>
                <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
                  <span className={`badge badge-${selectedIssue.severity}`}>{selectedIssue.severity}</span>
                  <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {selectedIssue.type}
                  </span>
                </div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 12 }}>{selectedIssue.title}</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>{selectedIssue.description}</p>

                {/* File & Line */}
                <div style={styles.detailSection}>
                  <div style={styles.detailLabel}>📁 Location</div>
                  <code style={styles.codeInline}>{selectedIssue.file}:{selectedIssue.line}</code>
                </div>

                {/* Impact */}
                <div style={styles.detailSection}>
                  <div style={styles.detailLabel}>💥 Impact</div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{selectedIssue.impact}</p>
                </div>

                {/* Code Diff */}
                <div style={styles.detailSection}>
                  <div style={styles.detailLabel}>🔧 Fix</div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 12 }}>{selectedIssue.explanation}</p>
                  <div className="code-block">
                    <div style={styles.diffHeader}>Original</div>
                    <pre style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: 0, whiteSpace: 'pre-wrap' }}>
                      {selectedIssue.code?.split('\n').map((l, i) => `- ${l}`).join('\n')}
                    </pre>
                    <div style={{ ...styles.diffHeader, marginTop: 16 }}>Fixed</div>
                    <pre style={{ color: 'var(--accent)', fontSize: '0.8rem', margin: 0, whiteSpace: 'pre-wrap' }}>
                      {selectedIssue.fixedCode?.split('\n').map((l, i) => `+ ${l}`).join('\n')}
                    </pre>
                  </div>
                </div>

                {/* Logs */}
                {selectedIssue.logs && (
                  <div style={styles.detailSection}>
                    <div style={styles.detailLabel}>📋 Expected Logs</div>
                    <div className="code-block">
                      <pre style={{ fontSize: '0.8rem', margin: 0, color: 'var(--text-muted)' }}>{selectedIssue.logs}</pre>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2" style={{ marginTop: 24 }}>
                  {selectedIssue.status === 'fixed' ? (
                    <a href={selectedIssue.prUrl} target="_blank" rel="noopener" className="btn btn-primary">
                      View PR on GitHub →
                    </a>
                  ) : selectedIssue.status === 'dismissed' ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Issue dismissed</span>
                  ) : (
                    <>
                      <button
                        onClick={() => handleApplyFix(selectedIssue.id)}
                        className="btn btn-primary"
                        disabled={fixing === selectedIssue.id}
                      >
                        {fixing === selectedIssue.id ? (
                          <><span className="spinner" /> Applying...</>
                        ) : (
                          '🤖 Apply Fix via ZapCodes AI'
                        )}
                      </button>
                      <button onClick={() => handleDismiss(selectedIssue.id)} className="btn btn-ghost">
                        Dismiss
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 48 }}>
                Select an issue to view details
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

const styles = {
  twoCol: {
    display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24,
    '@media (max-width: 900px)': { gridTemplateColumns: '1fr' },
  },
  issueList: {
    display: 'flex', flexDirection: 'column', gap: 8,
    maxHeight: 'calc(100vh - 260px)', overflowY: 'auto',
  },
  issueItem: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: 16, cursor: 'pointer',
    transition: '0.15s ease',
  },
  issueItemActive: {
    borderColor: 'var(--accent)', background: 'var(--accent-glow)',
  },
  issueDetail: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: 32,
    maxHeight: 'calc(100vh - 260px)', overflowY: 'auto',
  },
  detailSection: { marginBottom: 20 },
  detailLabel: {
    fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8,
  },
  codeInline: {
    fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)',
    padding: '4px 10px', borderRadius: 6, fontSize: '0.85rem',
    border: '1px solid var(--border)',
  },
  diffHeader: {
    fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4,
  },
};
