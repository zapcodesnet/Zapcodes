import { useState, useContext, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

const UNLIMITED = 999999999;
function isUnlimited(n) { return n >= UNLIMITED; }

export default function RepairCode() {
  const { user } = useContext(AuthContext);
  const [files, setFiles] = useState([]);
  const [fixedFiles, setFixedFiles] = useState([]);
  const [preview, setPreview] = useState('');
  const [description, setDescription] = useState('');
  const [fixing, setFixing] = useState(false);
  const [selectedModel, setSelectedModel] = useState(null);
  const [coinData, setCoinData] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const iframeRef = useRef(null);

  useState(() => {
    api.get('/api/coins/balance').then(r => setCoinData(r.data)).catch(() => {});
  }, []);

  const plan = coinData?.plan || user?.plan || 'free';
  const tc = coinData?.tierConfig || {};
  const du = coinData?.dailyUsage || {};

  const effectiveModel = (() => {
    if (plan === 'diamond') return selectedModel || 'haiku';
    if (plan === 'gold' || plan === 'silver') return selectedModel === 'groq' ? 'groq' : 'haiku';
    return 'groq';
  })();

  const BL_COSTS = { groq: 5000, haiku: 10000, opus: 50000 };
  const cost = BL_COSTS[effectiveModel] || 5000;

  const handleFileUpload = (fileList) => {
    const uploaded = Array.from(fileList);
    const zipFiles = uploaded.filter(f => f.name.endsWith('.zip'));
    const textFiles = uploaded.filter(f => !f.name.endsWith('.zip'));

    // Process ZIP files via backend (#4)
    if (zipFiles.length > 0) {
      const formData = new FormData();
      zipFiles.forEach(f => formData.append('files', f));
      api.post('/api/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then(({ data }) => {
          setFiles(prev => [...prev, ...data.files]);
          if (data.skippedFiles?.length) {
            alert(`ZIP extracted: ${data.totalFiles} files loaded, ${data.skippedFiles.length} skipped`);
          } else {
            alert(`ZIP extracted successfully — ${data.totalFiles} files ready for use`);
          }
        })
        .catch(err => alert(err.response?.data?.error || 'Unable to extract ZIP — please check the file and try again'));
    }

    // Process text files locally
    if (textFiles.length > 0) {
      Promise.all(textFiles.map(f => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve({ name: f.name, content: ev.target.result });
        reader.readAsText(f);
      }))).then(parsed => setFiles(prev => [...prev, ...parsed]));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) handleFileUpload(e.dataTransfer.files);
  };

  const handleCodeFix = async () => {
    if (!files.length) return alert('Upload files first');
    setFixing(true); setFixedFiles([]); setPreview('');
    try {
      const { data } = await api.post('/api/build/code-fix', {
        files, description: description || 'Fix all bugs and errors', model: effectiveModel,
      });
      setFixedFiles(data.files || []);
      setPreview(data.preview || '');
      setCoinData(prev => ({ ...prev, balance: data.balanceRemaining }));
      if (iframeRef.current && data.preview) iframeRef.current.srcdoc = data.preview;
    } catch (err) {
      alert(err.response?.data?.error || 'Fix failed');
    } finally { setFixing(false); }
  };

  return (
    <div style={s.page}>
      <div style={s.main}>
        {/* Left Panel */}
        <div style={s.left}>
          <h1 style={s.h1}>🔧 Repair Code</h1>
          <p style={s.subtitle}>Upload your files, describe the issue, and AI will fix everything.</p>

          {/* Model selector for Silver+ */}
          {(plan === 'silver' || plan === 'gold' || plan === 'diamond') && (
            <div style={s.modelRow}>
              <span style={s.modelLabel}>AI Model:</span>
              {plan === 'diamond' && (
                <button style={s.modelBtn(effectiveModel === 'opus')} onClick={() => setSelectedModel('opus')}>
                  Opus ({BL_COSTS.opus.toLocaleString()} BL)
                </button>
              )}
              <button style={s.modelBtn(effectiveModel === 'haiku')} onClick={() => setSelectedModel('haiku')}>
                Haiku ({BL_COSTS.haiku.toLocaleString()} BL)
              </button>
              <button style={s.modelBtn(effectiveModel === 'groq')} onClick={() => setSelectedModel('groq')}>
                Groq ({BL_COSTS.groq.toLocaleString()} BL)
              </button>
            </div>
          )}

          {/* File Upload with drag-and-drop (#4) */}
          <div
            style={{ ...s.dropZone, ...(dragActive ? s.dropZoneActive : {}) }}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".html,.css,.js,.jsx,.ts,.tsx,.json,.py,.zip"
              onChange={(e) => handleFileUpload(e.target.files)}
              style={{ display: 'none' }}
            />
            <div style={s.dropIcon}>📁</div>
            <p style={s.dropText}>
              {dragActive ? 'Drop files here!' : 'Drag & drop files here, or click to browse'}
            </p>
            <p style={s.dropHint}>Supports HTML, CSS, JS, JSON, Python, ZIP files</p>
          </div>

          {/* Uploaded files list */}
          {files.length > 0 && (
            <div style={s.fileList}>
              <div style={s.fileListHeader}>
                <span>{files.length} file(s) loaded</span>
                <button style={s.clearBtn} onClick={() => setFiles([])}>Clear all</button>
              </div>
              {files.slice(0, 15).map((f, i) => (
                <div key={i} style={s.fileItem}>
                  <span>📄 {f.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{(f.content?.length || 0).toLocaleString()} chars</span>
                </div>
              ))}
              {files.length > 15 && <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>...and {files.length - 15} more</p>}
            </div>
          )}

          {/* Description */}
          <textarea
            style={s.textarea}
            placeholder="Describe what needs to be fixed (optional)..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />

          {/* Fix button */}
          <div style={s.fixRow}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Cost: <strong style={{ color: '#f59e0b' }}>{cost.toLocaleString()} BL</strong>
              {' · '}{du.codeFixes || 0}/{isUnlimited(tc.dailyFixCap) ? '∞' : tc.dailyFixCap || 0} fixes today
            </span>
            <button
              style={s.fixBtn(!files.length || fixing || tc.dailyFixCap === 0)}
              onClick={handleCodeFix}
              disabled={!files.length || fixing || tc.dailyFixCap === 0}
            >
              {fixing ? '⚡ Fixing...' : tc.dailyFixCap === 0 ? '🔒 Upgrade to fix' : `Fix Code (${cost.toLocaleString()} BL)`}
            </button>
          </div>

          {/* Fixed files */}
          {fixedFiles.length > 0 && (
            <div style={{ ...s.fileList, borderColor: 'rgba(34,197,94,.3)' }}>
              <div style={s.fileListHeader}>
                <span style={{ color: '#22c55e' }}>✅ {fixedFiles.length} fixed file(s)</span>
                <button style={{ ...s.clearBtn, color: '#6366f1' }} onClick={() => {
                  const html = fixedFiles.find(f => f.name.endsWith('.html'));
                  if (html) { const blob = new Blob([html.content], { type: 'text/html' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = html.name; a.click(); URL.revokeObjectURL(url); }
                }}>💾 Download</button>
              </div>
              {fixedFiles.map((f, i) => (
                <div key={i} style={s.fileItem}>
                  <span>✅ {f.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{(f.content?.length || 0).toLocaleString()} chars</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Panel — Preview */}
        <div style={s.right}>
          {preview ? (
            <iframe ref={iframeRef} srcDoc={preview} style={s.iframe} title="Preview" sandbox="allow-scripts allow-same-origin" />
          ) : (
            <div style={s.emptyPreview}>
              {fixing ? '⚡ Fixing your code...' : 'Fixed code preview will appear here'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { height: 'calc(100vh - 52px)', overflow: 'hidden' },
  main: { display: 'flex', height: '100%' },
  left: { width: '45%', minWidth: 360, padding: 20, overflowY: 'auto', borderRight: '1px solid var(--border)' },
  right: { flex: 1, display: 'flex', flexDirection: 'column', background: '#1a1a2e' },
  h1: { fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 },
  modelRow: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' },
  modelLabel: { fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 },
  modelBtn: (active) => ({
    padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600,
    background: active ? '#6366f1' : 'var(--bg-elevated)', color: active ? '#fff' : 'var(--text-secondary)',
  }),
  dropZone: {
    border: '2px dashed var(--border)', borderRadius: 12, padding: 32, textAlign: 'center',
    cursor: 'pointer', transition: 'all .2s', marginBottom: 12,
  },
  dropZoneActive: { borderColor: '#6366f1', background: 'rgba(99,102,241,.05)' },
  dropIcon: { fontSize: 32, marginBottom: 8 },
  dropText: { fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, margin: 0 },
  dropHint: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },
  fileList: {
    border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12,
    background: 'var(--bg-elevated)',
  },
  fileListHeader: { display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 },
  clearBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  fileItem: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: 'var(--text-primary)' },
  textarea: {
    width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--border)',
    background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14,
    resize: 'vertical', minHeight: 60, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12,
  },
  fixRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  fixBtn: (disabled) => ({
    padding: '12px 24px', borderRadius: 10, border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14,
    background: disabled ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    color: disabled ? 'var(--text-muted)' : '#fff', opacity: disabled ? .5 : 1,
  }),
  iframe: { width: '100%', height: '100%', border: 'none', background: '#fff' },
  emptyPreview: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1,
    color: 'rgba(255,255,255,.3)', fontSize: 16, textAlign: 'center', padding: 40,
  },
};
