import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import api from '../api';

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

        {/* Scan a File */}
        <ScanFileSection />

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

// ===== SCAN A FILE =====
function ScanFileSection() {
  const [files, setFiles] = useState([]);
  const [issues, setIssues] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [selectedFixes, setSelectedFixes] = useState(new Set());
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const handleFiles = async (fileList) => {
    const formData = new FormData();
    for (const f of fileList) formData.append('files', f);

    setScanning(true); setIssues([]); setGenerated(null);
    try {
      const { data } = await api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFiles(data.files);

      // Auto-analyze
      const analysis = await api.post('/files/analyze', { files: data.files, mode: 'scan' });
      if (analysis.data.issues) setIssues(analysis.data.issues);
      else setIssues([{ id: 1, severity: 'info', title: 'Analysis complete', description: analysis.data.analysis, type: 'info' }]);
    } catch (err) {
      setIssues([{ id: 0, severity: 'high', title: 'Upload failed', description: err.response?.data?.error || err.message, type: 'error' }]);
    }
    setScanning(false);
  };

  const toggleFix = (id) => {
    const next = new Set(selectedFixes);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedFixes(next);
  };

  const generateFixed = async () => {
    const fixes = issues.filter(i => selectedFixes.has(i.id));
    setGenerating(true);
    try {
      const { data } = await api.post('/files/generate', { files, selectedFixes: fixes });
      setGenerated(data);
    } catch (err) { alert('Generation failed: ' + (err.response?.data?.error || err.message)); }
    setGenerating(false);
  };

  const downloadFile = (file) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  };

  const [repoUrl, setRepoUrl] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  const pushViaBot = async () => {
    if (!repoUrl.trim() || !generated?.generatedFiles?.length) return;
    setPushing(true); setPushResult(null);
    try {
      const { data } = await api.post('/files/push-to-github', { repoUrl, files: generated.generatedFiles, commitMessage: 'Apply fixes via ZapCodes Moltbot' });
      setPushResult(data);
    } catch (err) {
      setPushResult({ error: err.response?.data?.error || 'Push failed — connect your GitHub token in Settings first.' });
    }
    setPushing(false);
  };

  const sevColor = { critical: '#ff4466', high: '#ff8800', medium: '#ffaa00', low: '#888', info: '#6366f1' };

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 16 }}>📄 Scan a File</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
        Upload files (ZIP or individual) — Moltbot will scan for bugs, security issues, and improvements.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${dragOver ? '#00e5a0' : 'var(--border)'}`, borderRadius: 12, padding: 32, textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(0,229,160,0.03)' : 'transparent', transition: '0.2s' }}
      >
        <p style={{ fontSize: '1.2rem', marginBottom: 8 }}>📁</p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Drag & drop files here, or <strong style={{ color: 'var(--accent)' }}>click to browse</strong></p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 4 }}>Supports .js, .jsx, .ts, .py, .html, .css, .json, .zip and more</p>
        <input ref={fileRef} type="file" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} accept=".js,.jsx,.ts,.tsx,.py,.html,.css,.json,.md,.zip,.java,.rb,.go,.php,.vue,.svelte" />
      </div>

      {scanning && <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'var(--accent-glow)', color: 'var(--accent)', fontSize: '0.9rem' }}><span className="spinner" style={{ marginRight: 8, display: 'inline-block' }} />Analyzing files...</div>}

      {/* Results */}
      {issues.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>🔍 Analysis Results ({issues.length} issues)</h3>
          {issues.map(issue => (
            <div key={issue.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 8, borderLeft: `3px solid ${sevColor[issue.severity] || '#888'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input type="checkbox" checked={selectedFixes.has(issue.id)} onChange={() => toggleFix(issue.id)} />
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: (sevColor[issue.severity] || '#888') + '20', color: sevColor[issue.severity] }}>{issue.severity?.toUpperCase()}</span>
                <strong style={{ fontSize: '0.9rem' }}>{issue.title}</strong>
                {issue.file && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({issue.file})</span>}
              </div>
              <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{issue.description}</p>
              {issue.fix && <p style={{ fontSize: '0.8rem', color: 'var(--accent)', marginTop: 6 }}>💡 Fix: {issue.fix}</p>}
            </div>
          ))}

          {selectedFixes.size > 0 && (
            <div style={{ marginTop: 16, padding: 16, background: 'var(--accent-glow)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: 10 }}>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent)' }}>{selectedFixes.size} fix(es) selected</p>
              <button onClick={generateFixed} disabled={generating} className="btn btn-primary" style={{ marginTop: 10, width: '100%' }}>
                {generating ? '⚡ Generating...' : '⚡ Generate New File with Selected Fixes'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Generated Files */}
      {generated && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>✅ Fixed Files Ready</h3>
          {generated.generatedFiles.map((f, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.9rem' }}>📄 {f.name}</strong>
                <button onClick={() => downloadFile(f)} className="btn" style={{ fontSize: '0.8rem', padding: '6px 14px' }}>Download</button>
              </div>
              <pre style={{ marginTop: 8, padding: 12, background: 'var(--bg-elevated)', borderRadius: 8, fontSize: '0.75rem', maxHeight: 200, overflow: 'auto', color: 'var(--text-secondary)' }}>{f.content.slice(0, 1000)}{f.content.length > 1000 ? '\n...' : ''}</pre>
            </div>
          ))}

          {/* Instructions */}
          <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10 }}>📋 How to apply these fixes:</h4>
            {generated.instructions.github.map((s, i) => (
              <p key={i} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '3px 0' }}>{i + 1}. {s}</p>
            ))}
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: 16, marginBottom: 8 }}>🚀 Deploy:</h4>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>Frontend:</p>
            {generated.instructions.deploy.frontend.map((s, i) => <p key={i} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '2px 0' }}>• {s}</p>)}
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6366f1', marginTop: 8, marginBottom: 4 }}>Backend:</p>
            {generated.instructions.deploy.backend.map((s, i) => <p key={i} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '2px 0' }}>• {s}</p>)}
          </div>

          {/* Moltbot Push */}
          <div style={{ marginTop: 16, padding: 16, background: 'rgba(0,229,160,0.03)', borderRadius: 10, border: '1px solid rgba(0,229,160,0.15)' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8, color: 'var(--accent)' }}>🤖 Or: Apply via Moltbot (auto-push to GitHub)</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" style={{ flex: 1, minWidth: 200 }} />
              <button onClick={pushViaBot} disabled={pushing || !repoUrl.trim()} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                {pushing ? '🤖 Pushing...' : '🤖 Push via Moltbot'}
              </button>
            </div>
            {pushResult?.error && <p style={{ fontSize: '0.82rem', color: '#ff4466', marginTop: 8 }}>❌ {pushResult.error}</p>}
            {pushResult?.results && (
              <div style={{ marginTop: 10, fontSize: '0.82rem' }}>
                {pushResult.results.map((r, i) => <p key={i} style={{ padding: '2px 0', color: r.status === 'success' ? 'var(--accent)' : '#ff4466' }}>{r.status === 'success' ? '✅' : '❌'} {r.name}: {r.action || r.error}</p>)}
                <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.8rem' }}>🚀 If auto-deploy is set up (Vercel/Render), your changes will be live in ~60 seconds.</p>
              </div>
            )}
          </div>
        </div>
      )}
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
