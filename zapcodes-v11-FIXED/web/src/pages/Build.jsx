import { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import api, { API_URL } from '../api';

const TIER_COLORS = { free: '#888', bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' };
const MODEL_LABELS = { groq: 'Groq Llama', haiku: 'Claude Haiku 4.5', opus: 'Claude Opus 4.6' };
const BL_COSTS = { groq: 5000, haiku: 10000, opus: 50000 };

function formatBL(n) { return n >= 999999999 ? '∞' : n?.toLocaleString() || '0'; }

export default function Build() {
  const { user } = useContext(AuthContext);
  const [tab, setTab] = useState('build');
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState('');
  const [generating, setGenerating] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [subdomain, setSubdomain] = useState('');
  const [deployUrl, setDeployUrl] = useState('');
  const [coinData, setCoinData] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [template, setTemplate] = useState('custom');
  const [projectName, setProjectName] = useState('');
  // Clone state
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneAnalysis, setCloneAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  // Code fix state
  const [fixFiles, setFixFiles] = useState([]);
  const [fixDescription, setFixDescription] = useState('');
  const [fixing, setFixing] = useState(false);

  const iframeRef = useRef(null);

  useEffect(() => {
    api.get('/api/coins/balance').then(r => setCoinData(r.data)).catch(() => {});
  }, []);

  const plan = coinData?.plan || user?.plan || 'free';
  const tc = coinData?.tierConfig || {};
  const du = coinData?.dailyUsage || {};
  const balance = coinData?.balance || 0;

  const effectiveModel = (() => {
    if (plan === 'free' || plan === 'bronze') return 'groq';
    if (plan === 'silver' || plan === 'gold') return 'haiku';
    if (plan === 'diamond') return selectedModel || 'haiku';
    return 'groq';
  })();

  const cost = BL_COSTS[effectiveModel] || 5000;
  const maxChars = tc.maxChars || 2000;
  const charsUsed = prompt.length;
  const charPct = maxChars === Infinity ? 0 : (charsUsed / maxChars) * 100;
  const genCap = tc.dailyGenCap || 1;
  const gensUsed = du.generations || 0;
  const canGenerate = gensUsed < genCap && balance >= cost && charsUsed <= (maxChars === Infinity ? 999999 : maxChars);

  // ══════════ GENERATE ══════════
  const handleGenerate = async () => {
    if (!prompt.trim()) return alert('Enter a description');
    if (!canGenerate) return alert(gensUsed >= genCap ? 'Daily limit reached' : balance < cost ? 'Insufficient BL coins' : 'Message too long');
    setGenerating(true); setFiles([]); setPreview(''); setDeployUrl('');
    try {
      const { data } = await api.post('/api/build/generate', { prompt, model: effectiveModel, template, projectName: projectName || 'My Website' });
      setFiles(data.files || []);
      setPreview(data.preview || '');
      setCoinData(prev => ({ ...prev, balance: data.balanceRemaining, dailyUsage: data.dailyUsage }));
      if (iframeRef.current && data.preview) {
        iframeRef.current.srcdoc = data.preview;
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Generation failed');
    } finally { setGenerating(false); }
  };

  // ══════════ DEPLOY ══════════
  const handleDeploy = async () => {
    if (!subdomain.trim()) return alert('Enter a subdomain');
    if (!files.length) return alert('Generate a site first');
    setDeploying(true);
    try {
      const { data } = await api.post('/api/build/deploy', { subdomain: subdomain.toLowerCase(), files, title: projectName || subdomain });
      setDeployUrl(data.url);
      alert(`Deployed to ${data.url}`);
    } catch (err) { alert(err.response?.data?.error || 'Deploy failed'); }
    finally { setDeploying(false); }
  };

  // ══════════ CLONE ANALYZE ══════════
  const handleCloneAnalyze = async () => {
    if (!cloneUrl.trim()) return alert('Enter a URL');
    setAnalyzing(true); setCloneAnalysis(null);
    try {
      const { data } = await api.post('/api/build/clone-analyze', { url: cloneUrl });
      setCloneAnalysis(data.analysis);
    } catch (err) { alert(err.response?.data?.error || 'Analysis failed'); }
    finally { setAnalyzing(false); }
  };

  const handleCloneRebuild = () => {
    if (!cloneAnalysis) return;
    setPrompt(`Rebuild this website:\n${JSON.stringify(cloneAnalysis, null, 2)}`);
    setTab('build');
  };

  // ══════════ CODE FIX ══════════
  const handleCodeFix = async () => {
    if (!fixFiles.length) return alert('Upload files first');
    setFixing(true);
    try {
      const { data } = await api.post('/api/build/code-fix', { files: fixFiles, description: fixDescription, model: effectiveModel });
      setFiles(data.files || []);
      setPreview(data.preview || '');
      setCoinData(prev => ({ ...prev, balance: data.balanceRemaining }));
      if (iframeRef.current && data.preview) iframeRef.current.srcdoc = data.preview;
      setTab('build');
    } catch (err) { alert(err.response?.data?.error || 'Fix failed'); }
    finally { setFixing(false); }
  };

  const handleFileUpload = (e) => {
    const uploadedFiles = Array.from(e.target.files);
    Promise.all(uploadedFiles.map(f => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve({ name: f.name, content: ev.target.result });
      reader.readAsText(f);
    }))).then(setFixFiles);
  };

  // ══════════ STYLES ══════════
  const s = {
    page: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden' },
    topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', flexWrap: 'wrap', gap: 8 },
    tabs: { display: 'flex', gap: 4 },
    tab: (active) => ({ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: active ? '#6366f1' : 'transparent', color: active ? '#fff' : 'var(--text-secondary)', transition: 'all .2s' }),
    stats: { display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 },
    stat: { display: 'flex', alignItems: 'center', gap: 4 },
    coinBadge: { background: 'rgba(245,158,11,.15)', color: '#f59e0b', padding: '4px 10px', borderRadius: 12, fontWeight: 700, fontSize: 13 },
    tierBadge: { padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, color: '#000', background: TIER_COLORS[plan] },
    modelBadge: { padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: effectiveModel === 'opus' ? 'rgba(6,182,212,.2)' : effectiveModel === 'haiku' ? 'rgba(99,102,241,.2)' : 'rgba(136,136,136,.2)', color: effectiveModel === 'opus' ? '#06b6d4' : effectiveModel === 'haiku' ? '#6366f1' : '#888' },
    main: { display: 'flex', flex: 1, overflow: 'hidden' },
    leftPanel: { width: '40%', minWidth: 340, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--bg-surface)' },
    rightPanel: { flex: 1, display: 'flex', flexDirection: 'column', background: '#1a1a2e' },
    chatArea: { flex: 1, padding: 16, overflowY: 'auto' },
    inputArea: { padding: 16, borderTop: '1px solid var(--border)', background: 'var(--bg-card)' },
    textarea: { width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, resize: 'vertical', minHeight: 80, fontFamily: 'inherit', boxSizing: 'border-box' },
    charCounter: (pct) => ({ fontSize: 11, textAlign: 'right', marginTop: 4, color: pct > 100 ? '#ef4444' : pct > 90 ? '#f59e0b' : 'var(--text-muted)' }),
    costRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 13 },
    genBtn: (disabled) => ({ padding: '12px 24px', borderRadius: 10, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, background: disabled ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: disabled ? 'var(--text-muted)' : '#fff', opacity: disabled ? .5 : 1, transition: 'all .2s', flex: 1 }),
    iframe: { width: '100%', height: '100%', border: 'none', background: '#fff' },
    deployBar: { padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', gap: 8, alignItems: 'center' },
    subInput: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 },
    deployBtn: (disabled) => ({ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, background: disabled ? 'var(--bg-elevated)' : '#22c55e', color: '#fff', opacity: disabled ? .5 : 1 }),
    emptyPreview: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'rgba(255,255,255,.3)', fontSize: 18, textAlign: 'center', padding: 40 },
    fileList: { padding: 16 },
    fileItem: { padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)', marginBottom: 4, fontSize: 13, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 },
    cloneInput: { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' },
    analysisBox: { background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, marginTop: 12, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' },
    actionBtn: (bg) => ({ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: bg, color: '#fff', transition: 'all .2s' }),
  };

  // Mobile responsive
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  if (isMobile) {
    s.main = { ...s.main, flexDirection: 'column' };
    s.leftPanel = { ...s.leftPanel, width: '100%', minWidth: 'unset', borderRight: 'none', borderBottom: '1px solid var(--border)', maxHeight: '50vh' };
    s.rightPanel = { ...s.rightPanel, minHeight: '40vh' };
  }

  return (
    <div style={s.page}>
      {/* Top Bar */}
      <div style={s.topBar}>
        <div style={s.tabs}>
          <button style={s.tab(tab === 'build')} onClick={() => setTab('build')}>💬 AI Builder</button>
          <button style={s.tab(tab === 'clone')} onClick={() => setTab('clone')}>🔄 Clone</button>
          <button style={s.tab(tab === 'fix')} onClick={() => setTab('fix')}>🔧 Code Fix</button>
          {tc.canProDev && <button style={s.tab(tab === 'pro')} onClick={() => setTab('pro')}>⚡ Pro Dev</button>}
        </div>
        <div style={s.stats}>
          <span style={s.tierBadge}>{plan.toUpperCase()}</span>
          <span style={s.modelBadge}>{MODEL_LABELS[effectiveModel]}</span>
          <span style={s.coinBadge}>🪙 {formatBL(balance)}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{gensUsed}/{genCap === Infinity ? '∞' : genCap} gens</span>
        </div>
      </div>

      {/* Main Content */}
      <div style={s.main}>
        {/* Left Panel */}
        <div style={s.leftPanel}>
          {/* ═══ AI Builder Tab ═══ */}
          {tab === 'build' && (
            <>
              <div style={s.chatArea} className="chat-messages">
                <div style={s.sectionTitle}>Describe your website</div>
                {plan === 'diamond' && (
                  <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                    <button style={{ ...s.tab(effectiveModel === 'haiku'), fontSize: 12 }} onClick={() => setSelectedModel('haiku')}>Haiku ($10K BL)</button>
                    <button style={{ ...s.tab(effectiveModel === 'opus'), fontSize: 12 }} onClick={() => setSelectedModel('opus')}>Opus ($50K BL)</button>
                  </div>
                )}
                <input style={s.cloneInput} placeholder="Project name (optional)" value={projectName} onChange={e => setProjectName(e.target.value)} />
                {files.length > 0 && (
                  <div style={s.fileList}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Generated Files ({files.length})</span>
                      <button
                        style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                        onClick={() => {
                          // Download all files as a combined HTML
                          const html = files.find(f => f.name === 'index.html' || f.name.endsWith('.html'));
                          if (html) {
                            const blob = new Blob([html.content], { type: 'text/html' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = 'index.html'; a.click();
                            URL.revokeObjectURL(url);
                          }
                        }}
                      >💾 Download HTML</button>
                    </div>
                    {files.map((f, i) => (
                      <div key={i} style={s.fileItem}>
                        <span>{f.name}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{(f.content?.length || 0).toLocaleString()} chars</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={s.inputArea}>
                <textarea style={s.textarea} placeholder="Describe the website you want to build..." value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={maxChars === Infinity ? undefined : maxChars + 100} />
                <div style={s.charCounter(charPct)}>
                  {maxChars === Infinity ? `${charsUsed} chars` : `${charsUsed}/${maxChars} chars`}
                </div>
                <div style={s.costRow}>
                  <span style={{ color: 'var(--text-muted)' }}>Cost: <strong style={{ color: '#f59e0b' }}>{cost.toLocaleString()} BL</strong></span>
                  <button style={s.genBtn(!canGenerate || generating)} onClick={handleGenerate} disabled={!canGenerate || generating}>
                    {generating ? '⚡ Generating...' : `Generate (${cost.toLocaleString()} BL)`}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ═══ Clone Tab ═══ */}
          {tab === 'clone' && (
            <div style={s.chatArea}>
              <div style={s.sectionTitle}>🔄 Clone a Website</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>Enter a URL to analyze and rebuild.</p>
              <input style={s.cloneInput} placeholder="https://example.com" value={cloneUrl} onChange={e => setCloneUrl(e.target.value)} />
              <button style={s.actionBtn('#6366f1')} onClick={handleCloneAnalyze} disabled={analyzing}>
                {analyzing ? 'Analyzing...' : 'Analyze Website'}
              </button>
              {cloneAnalysis && (
                <>
                  <div style={s.analysisBox}>{JSON.stringify(cloneAnalysis, null, 2)}</div>
                  <button style={{ ...s.actionBtn('#22c55e'), marginTop: 12 }} onClick={handleCloneRebuild}>
                    Rebuild with AI →
                  </button>
                </>
              )}
            </div>
          )}

          {/* ═══ Code Fix Tab ═══ */}
          {tab === 'fix' && (
            <div style={s.chatArea}>
              <div style={s.sectionTitle}>🔧 Fix Your Code</div>
              {tc.dailyFixCap === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <p style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 8 }}>🔒 Code fixes not available on Free plan</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Upgrade to Bronze or higher to use code fixes.</p>
                  <a href="/pricing" style={s.actionBtn('#6366f1')}>View Plans →</a>
                </div>
              ) : (
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
                    Upload files and describe the issue. ({du.codeFixes || 0}/{tc.dailyFixCap === Infinity ? '∞' : tc.dailyFixCap} fixes used today)
                  </p>
              <input type="file" multiple accept=".html,.css,.js,.jsx,.ts,.tsx,.json,.py" onChange={handleFileUpload} style={{ marginBottom: 12 }} />
              {fixFiles.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {fixFiles.map((f, i) => <div key={i} style={s.fileItem}>{f.name}</div>)}
                </div>
              )}
              <textarea style={s.textarea} placeholder="Describe what needs to be fixed..." value={fixDescription} onChange={e => setFixDescription(e.target.value)} />
              <button style={{ ...s.actionBtn('#8b5cf6'), marginTop: 12 }} onClick={handleCodeFix} disabled={fixing}>
                {fixing ? 'Fixing...' : `Fix Code (${cost.toLocaleString()} BL)`}
              </button>
                </>
              )}
            </div>
          )}

          {/* ═══ Pro Dev Tab ═══ */}
          {tab === 'pro' && (
            <div style={s.chatArea}>
              <div style={s.sectionTitle}>⚡ Pro Developer</div>
              {tc.canProDev ? (
                <div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>Advanced developer tools for Gold & Diamond members.</p>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <p>🚧 Coming soon:</p>
                    <p>• Full terminal interface</p>
                    <p>• Environment variables</p>
                    <p>• Custom domain connections</p>
                    <p>• Manual deployment controls</p>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <p style={{ fontSize: 18, marginBottom: 12, color: 'var(--text-primary)' }}>🔒 Pro Developer requires Gold or Diamond</p>
                  <a href="/pricing" style={s.actionBtn('#6366f1')}>Upgrade →</a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel — Preview */}
        <div style={s.rightPanel}>
          {preview ? (
            <>
              <iframe ref={iframeRef} srcDoc={preview} style={s.iframe} title="Preview" sandbox="allow-scripts allow-same-origin" />
              <div style={s.deployBar}>
                <input style={s.subInput} placeholder="subdomain" value={subdomain} onChange={e => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>.zapcodes.net</span>
                <button style={s.deployBtn(deploying || !subdomain)} onClick={handleDeploy} disabled={deploying || !subdomain}>
                  {deploying ? 'Deploying...' : '🚀 Deploy (Free)'}
                </button>
              </div>
              {deployUrl && (
                <div style={{ padding: '8px 16px', background: 'rgba(34,197,94,.1)', borderTop: '1px solid rgba(34,197,94,.3)', fontSize: 13 }}>
                  ✅ Live at <a href={deployUrl} target="_blank" rel="noreferrer" style={{ color: '#22c55e', fontWeight: 600 }}>{deployUrl}</a>
                </div>
              )}
            </>
          ) : (
            <div style={s.emptyPreview}>
              {generating ? '⚡ Generating your website...' : 'Your website preview will appear here.\nDescribe what you want to build!'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
