import { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api, { API_URL } from '../api';

const TIER_COLORS = { free: '#888', bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' };
const MODEL_LABELS = { groq: 'Groq AI', haiku: 'Claude Haiku 4.5', opus: 'Claude Opus 4.6' };
const BL_COSTS = { groq: 5000, haiku: 10000, opus: 50000 };
const TEMPLATES = [
  { id: 'custom', name: 'Custom (AI Chat)', icon: '💬' },
  { id: 'portfolio', name: 'Portfolio', icon: '👤' },
  { id: 'landing', name: 'Landing Page', icon: '🚀' },
  { id: 'blog', name: 'Blog', icon: '📝' },
  { id: 'ecommerce', name: 'E-Commerce', icon: '🛒' },
  { id: 'dashboard', name: 'Dashboard', icon: '📊' },
  { id: 'webapp', name: 'Web App', icon: '⚡' },
  { id: 'saas', name: 'SaaS', icon: '💎' },
];

// FIX: Model-specific timeouts — Opus needs more time than Groq
const MODEL_TIMEOUTS = {
  groq: 180000,   // 3 minutes
  haiku: 360000,  // 6 minutes (generation + verifyAndFix)
  opus: 600000,   // 10 minutes (generation + thinking + verifyAndFix)
};

const UNLIMITED = 999999999;
function isUnlimited(n) { return n >= UNLIMITED; }
function formatBL(n) {
  if (n == null) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return n.toLocaleString();
}

export default function Build() {
  const { user } = useContext(AuthContext);
  const [searchParams] = useSearchParams();
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
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneAnalysis, setCloneAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [fixFiles, setFixFiles] = useState([]);
  const [fixDescription, setFixDescription] = useState('');
  const [fixing, setFixing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [codeViewFile, setCodeViewFile] = useState(null);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);

  // #2: Progress state
  const [progressMessages, setProgressMessages] = useState([]);
  const [progressStep, setProgressStep] = useState('');
  const [sessionId, setSessionId] = useState(null);

  // FIX #1: Track generation result state separately from generating spinner
  // so error/done messages persist after generation ends
  const [genResult, setGenResult] = useState(null); // 'done' | 'error' | 'stopped' | null

  const iframeRef = useRef(null);
  const fileInputRef = useRef(null);
  const genTimeoutRef = useRef(null);

  // FIX #2: AbortController ref for cancelling fetch
  const abortControllerRef = useRef(null);

  useEffect(() => {
    api.get('/api/coins/balance').then(r => setCoinData(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // #3: Load project if coming from My Projects
  useEffect(() => {
    const projId = searchParams.get('project');
    if (projId) {
      api.get(`/api/build/project/${projId}`).then(({ data }) => {
        const p = data.project;
        setCurrentProjectId(p.projectId);
        setProjectName(p.name || '');
        setPrompt(p.description || '');
        if (p.files?.length) {
          setFiles(p.files);
          setPreview(p.preview || '');
        }
        const action = searchParams.get('action');
        if (action === 'fix') { setTab('fix'); setFixFiles(p.files || []); }
        else if (action === 'feature') setPrompt(`Existing project: ${p.name}\n\nAdd new feature: `);
      }).catch(() => {});
    }
  }, [searchParams]);

  const plan = coinData?.plan || user?.plan || 'free';
  const tc = coinData?.tierConfig || {};
  const du = coinData?.dailyUsage || {};
  const balance = coinData?.balance || 0;

  const availableModels = (() => {
    if (plan === 'diamond') return ['opus', 'haiku', 'groq'];
    if (plan === 'gold' || plan === 'silver') return ['haiku', 'groq'];
    return ['groq'];
  })();

  const effectiveModel = (() => {
    if (selectedModel && availableModels.includes(selectedModel)) return selectedModel;
    return availableModels[0];
  })();

  const cost = BL_COSTS[effectiveModel] || 5000;
  const maxChars = tc.maxChars || 2000;
  const charsUsed = prompt.length;
  const charPct = isUnlimited(maxChars) ? 0 : (charsUsed / maxChars) * 100;
  const genCap = tc.dailyGenCap || 1;
  const gensUsed = du.generations || 0;

  const dataReady = coinData !== null;
  const canGenerate = dataReady
    ? (gensUsed < genCap && charsUsed <= (isUnlimited(maxChars) ? UNLIMITED : maxChars))
    : true;

  // ══════════ GENERATE WITH PROGRESS (SSE) ══════════
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return alert('Enter a description');
    if (dataReady && gensUsed >= genCap) return alert('Daily generation limit reached. Upgrade your plan for more.');
    if (dataReady && !isUnlimited(maxChars) && charsUsed > maxChars) return alert(`Message too long. Limit: ${maxChars.toLocaleString()} chars.`);

    setGenerating(true);
    setGenResult(null);
    setFiles([]);
    setPreview('');
    setDeployUrl('');
    setProgressMessages([]);
    setProgressStep('validating');

    // FIX #2: Create AbortController for this generation
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const token = localStorage.getItem('token');

      // FIX #3: Model-specific timeout with proper abort
      const timeoutMs = MODEL_TIMEOUTS[effectiveModel] || 360000;
      const timeoutLabel = Math.round(timeoutMs / 60000);

      genTimeoutRef.current = setTimeout(() => {
        console.warn(`[Build] Generation timed out after ${timeoutLabel} minutes`);
        controller.abort(); // FIX: Actually abort the fetch
        setProgressStep('error');
        setProgressMessages(prev => [...prev, {
          step: 'error',
          message: `Generation timed out after ${timeoutLabel} minutes. This can happen if the AI service is experiencing high load. Try again or switch to a faster model.`,
          time: new Date(),
        }]);
        setGenResult('error');
        setGenerating(false);
      }, timeoutMs);

      const response = await fetch(`${API_URL}/api/build/generate-with-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt, model: effectiveModel, template, projectName: projectName || 'My Website' }),
        signal: controller.signal, // FIX #2: Pass abort signal
      });

      // FIX: Check HTTP response status
      if (!response.ok) {
        let errorMsg = `Server returned ${response.status}`;
        try {
          const errorBody = await response.text();
          const parsed = JSON.parse(errorBody);
          errorMsg = parsed.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'progress') {
              setProgressStep(data.step);
              setProgressMessages(prev => [...prev.slice(-20), { step: data.step, message: data.message, time: new Date() }]);
              if (data.sessionId) setSessionId(data.sessionId);
            }
            else if (data.type === 'complete') {
              setFiles(data.files || []);
              setPreview(data.preview || '');
              setCoinData(prev => ({ ...prev, balance: data.balanceRemaining, dailyUsage: data.dailyUsage }));
              if (iframeRef.current && data.preview) iframeRef.current.srcdoc = data.preview;
              setProgressStep('done');
              setGenResult('done');
              setProgressMessages(prev => [...prev, {
                step: 'done',
                message: `Done! ${data.fileCount} file(s) generated using ${MODEL_LABELS[data.model] || data.model}. Cost: ${(data.blSpent || 0).toLocaleString()} BL.`,
                time: new Date(),
              }]);
            }
            else if (data.type === 'error') {
              setProgressStep('error');
              setGenResult('error');
              setProgressMessages(prev => [...prev, {
                step: 'error',
                message: data.error + (data.suggestion ? ` — ${data.suggestion}` : ''),
                time: new Date(),
              }]);
            }
            else if (data.type === 'stopped') {
              setProgressStep('stopped');
              setGenResult('stopped');
              setProgressMessages(prev => [...prev, {
                step: 'stopped',
                message: data.message || 'Generation stopped. Your coins have been refunded.',
                time: new Date(),
              }]);
            }
          } catch (parseErr) {
            console.warn('[SSE] Parse error:', parseErr.message, 'Line:', line.slice(0, 100));
          }
        }
      }
    } catch (err) {
      // FIX: Don't show error if it was an intentional abort
      if (err.name === 'AbortError') {
        console.log('[Build] Fetch aborted (user stop or timeout)');
        // Timeout handler already set the error message
        if (!genResult) {
          setProgressStep('stopped');
          setGenResult('stopped');
        }
      } else {
        setProgressStep('error');
        setGenResult('error');
        const errorMsg = err.name === 'TypeError' && err.message.includes('network')
          ? 'Connection lost. The server may still be generating — try refreshing in a minute, or switch to a faster model (Groq).'
          : (err.message || 'Connection failed. Please check your internet and try again.');
        setProgressMessages(prev => [...prev, { step: 'error', message: errorMsg, time: new Date() }]);
      }
    } finally {
      if (genTimeoutRef.current) clearTimeout(genTimeoutRef.current);
      genTimeoutRef.current = null;
      abortControllerRef.current = null;
      setGenerating(false);
      setSessionId(null);
    }
  }, [prompt, effectiveModel, template, projectName, dataReady, gensUsed, genCap, charsUsed, maxChars]);

  // FIX #2: Improved stop handler that actually aborts the fetch
  const handleStop = async () => {
    // Abort the fetch stream immediately
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Clear timeout
    if (genTimeoutRef.current) {
      clearTimeout(genTimeoutRef.current);
      genTimeoutRef.current = null;
    }
    // Tell backend to stop (for coin refund)
    try {
      await api.post('/api/build/stop', { sessionId });
    } catch {}
    setProgressStep('stopped');
    setGenResult('stopped');
    setProgressMessages(prev => [...prev, { step: 'stopped', message: 'Generation stopped. Your coins have been refunded.', time: new Date() }]);
    setGenerating(false);
  };

  // FIX: Clear previous results when starting new generation
  const handleDismissProgress = () => {
    setGenResult(null);
    setProgressMessages([]);
    setProgressStep('');
  };

  // #3: Save project
  const handleSaveProject = async () => {
    if (!files.length) return alert('No files to save');
    try {
      const { data } = await api.post('/api/build/save-project', {
        projectId: currentProjectId,
        name: projectName || 'Untitled Project',
        files, preview, template,
        description: prompt,
      });
      setCurrentProjectId(data.project.projectId);
      alert(`Project saved! (v${data.project.version})`);
    } catch (err) { alert(err.response?.data?.error || 'Save failed'); }
  };

  // Deploy
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

  // Clone
  const handleCloneAnalyze = async () => {
    if (!cloneUrl.trim()) return alert('Enter a URL');
    setAnalyzing(true); setCloneAnalysis(null);
    try { const { data } = await api.post('/api/build/clone-analyze', { url: cloneUrl }); setCloneAnalysis(data.analysis); }
    catch (err) { alert(err.response?.data?.error || 'Analysis failed'); }
    finally { setAnalyzing(false); }
  };

  const handleCloneRebuild = () => { if (!cloneAnalysis) return; setPrompt(`Rebuild this website:\n${JSON.stringify(cloneAnalysis, null, 2)}`); setTab('build'); };

  // #4: File upload
  const handleFileUpload = (fileList) => {
    const uploaded = Array.from(fileList);
    const zipFiles = uploaded.filter(f => f.name.endsWith('.zip'));
    const textFiles = uploaded.filter(f => !f.name.endsWith('.zip'));

    if (zipFiles.length > 0) {
      const formData = new FormData();
      zipFiles.forEach(f => formData.append('files', f));
      api.post('/api/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then(({ data }) => {
          setFixFiles(prev => [...prev, ...data.files]);
          alert(`ZIP file extracted — ${data.totalFiles} files ready`);
        })
        .catch(err => alert(err.response?.data?.error || 'Unable to extract ZIP'));
    }
    if (textFiles.length > 0) {
      Promise.all(textFiles.map(f => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve({ name: f.name, content: ev.target.result });
        reader.readAsText(f);
      }))).then(parsed => setFixFiles(prev => [...prev, ...parsed]));
    }
  };

  const handleDrop = (e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.length) handleFileUpload(e.dataTransfer.files); };

  // Code fix
  const handleCodeFix = async () => {
    if (!fixFiles.length) return alert('Upload files first');
    setFixing(true);
    try {
      const { data } = await api.post('/api/build/code-fix', { files: fixFiles, description: fixDescription, model: effectiveModel });
      setFiles(data.files || []); setPreview(data.preview || '');
      setCoinData(prev => ({ ...prev, balance: data.balanceRemaining }));
      if (iframeRef.current && data.preview) iframeRef.current.srcdoc = data.preview;
      setTab('build');
    } catch (err) { alert(err.response?.data?.error || 'Fix failed'); }
    finally { setFixing(false); }
  };

  // ══════════ STYLES ══════════
  const s = {
    page: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', overflow: 'hidden' },
    topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', flexWrap: 'wrap', gap: 8 },
    tabs: { display: 'flex', gap: 4 },
    tab: (active) => ({ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: active ? '#6366f1' : 'transparent', color: active ? '#fff' : 'var(--text-secondary)', transition: 'all .2s' }),
    stats: { display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' },
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
    costRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 13, gap: 8 },
    genBtn: (disabled) => ({ padding: '12px 24px', borderRadius: 10, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, background: disabled ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: disabled ? 'var(--text-muted)' : '#fff', opacity: disabled ? .5 : 1, transition: 'all .2s', flex: 1 }),
    stopBtn: { padding: '12px 20px', borderRadius: 10, border: '2px solid #ef4444', background: 'rgba(239,68,68,.1)', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: 14 },
    saveBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid #22c55e', background: 'transparent', color: '#22c55e', cursor: 'pointer', fontWeight: 600, fontSize: 12 },
    iframe: { width: '100%', height: '100%', border: 'none', background: '#fff' },
    deployBar: { padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', gap: 8, alignItems: 'center' },
    subInput: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 },
    deployBtn: (disabled) => ({ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, background: disabled ? 'var(--bg-elevated)' : '#22c55e', color: '#fff', opacity: disabled ? .5 : 1 }),
    emptyPreview: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'rgba(255,255,255,.3)', fontSize: 18, textAlign: 'center', padding: 40 },
    fileItem: { padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)', marginBottom: 4, fontSize: 13, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 },
    cloneInput: { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' },
    actionBtn: (bg) => ({ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: bg, color: '#fff', transition: 'all .2s' }),
    progressItem: (isError) => ({ padding: '6px 0', fontSize: 13, color: isError ? '#ef4444' : 'var(--text-secondary, #999)', display: 'flex', gap: 8, alignItems: 'flex-start' }),
    progressDot: (step) => ({ width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0, background: step === 'error' ? '#ef4444' : step === 'done' ? '#22c55e' : step === 'stopped' ? '#f59e0b' : '#6366f1' }),
    dropZone: { border: '2px dashed var(--border)', borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer', transition: 'all .2s', marginBottom: 12 },
    dropZoneActive: { borderColor: '#6366f1', background: 'rgba(99,102,241,.05)' },
  };

  if (isMobile) {
    s.main = { ...s.main, flexDirection: 'column' };
    s.leftPanel = { ...s.leftPanel, width: '100%', minWidth: 'unset', borderRight: 'none', borderBottom: '1px solid var(--border)', maxHeight: '50vh' };
    s.rightPanel = { ...s.rightPanel, minHeight: '40vh' };
  }

  // FIX #1: Determine whether to show the progress panel
  // Show when: actively generating OR when there's a result to show (error/done/stopped)
  const showProgress = generating || (genResult && progressMessages.length > 0);

  // FIX: Progress bar color based on state
  const progressBarColor = genResult === 'error' ? '#ef4444' : genResult === 'done' ? '#22c55e' : genResult === 'stopped' ? '#f59e0b' : '#6366f1';
  const progressBarBg = genResult === 'error' ? 'rgba(239,68,68,.1)' : genResult === 'done' ? 'rgba(34,197,94,.1)' : genResult === 'stopped' ? 'rgba(245,158,11,.1)' : 'rgba(0,0,0,.4)';

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
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{gensUsed}/{isUnlimited(genCap) ? '∞' : genCap} gens</span>
        </div>
      </div>

      <div style={s.main}>
        {/* Left Panel */}
        <div style={s.leftPanel}>
          {tab === 'build' && (
            <>
              <div style={s.chatArea}>
                <div style={s.sectionTitle}>Describe your website</div>

                {/* Model selector */}
                {availableModels.length > 1 && (
                  <div style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {availableModels.map(m => (
                      <button key={m} style={{ ...s.tab(effectiveModel === m), fontSize: 12 }} onClick={() => setSelectedModel(m)}>
                        {MODEL_LABELS[m]} ({formatBL(BL_COSTS[m])} BL)
                      </button>
                    ))}
                  </div>
                )}

                <input style={s.cloneInput} placeholder="Project name (optional)" value={projectName} onChange={e => setProjectName(e.target.value)} />

                {/* Template selector */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Template:</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {TEMPLATES.map(t => (
                      <button key={t.id} style={{ padding: '5px 10px', borderRadius: 8, border: template === t.id ? '1px solid #6366f1' : '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, fontSize: 11, background: template === t.id ? 'rgba(99,102,241,.15)' : 'transparent', color: template === t.id ? '#6366f1' : 'var(--text-secondary)', transition: 'all .2s' }} onClick={() => setTemplate(t.id)}>
                        {t.icon} {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                {files.length > 0 && (
                  <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <span>Generated Files ({files.length})</span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button style={s.saveBtn} onClick={handleSaveProject}>💾 Save Project</button>
                        <button style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={() => {
                          const html = files.find(f => f.name === 'index.html' || f.name.endsWith('.html'));
                          if (html) { const blob = new Blob([html.content], { type: 'text/html' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'index.html'; a.click(); URL.revokeObjectURL(url); }
                        }}>💾 HTML</button>
                        <button style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={() => {
                          let content = `/* ZapCodes Export — ${files.length} files */\n/* Project: ${projectName || 'My Website'} */\n/* Generated: ${new Date().toISOString()} */\n\n`;
                          files.forEach(f => { content += `\n${'='.repeat(60)}\n/* FILE: ${f.name} */\n${'='.repeat(60)}\n\n${f.content}\n`; });
                          const blob = new Blob([content], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url; a.download = `${(projectName || 'zapcodes-export').replace(/\s+/g, '-').toLowerCase()}.txt`; a.click(); URL.revokeObjectURL(url);
                        }}>📦 All Files</button>
                        <button style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#f59e0b', color: '#000', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={() => {
                          const html = files.find(f => f.name === 'index.html' || f.name.endsWith('.html'));
                          if (html) { const blob = new Blob([html.content], { type: 'text/html' }); const url = URL.createObjectURL(blob); window.open(url, '_blank'); }
                        }}>🔗 New Tab</button>
                      </div>
                    </div>
                    {files.map((f, i) => (
                      <div key={i} style={{ ...s.fileItem, cursor: 'pointer' }} onClick={() => setCodeViewFile(f)}>
                        <span>📄 {f.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{(f.content?.length || 0).toLocaleString()} chars — click to view</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={s.inputArea}>
                <textarea style={s.textarea} placeholder="Describe the website you want to build..." value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={isUnlimited(maxChars) ? undefined : maxChars + 100} />
                <div style={s.charCounter(charPct)}>
                  {isUnlimited(maxChars) ? `${charsUsed} chars (unlimited)` : `${charsUsed}/${maxChars.toLocaleString()} chars`}
                </div>
                <div style={s.costRow}>
                  <span style={{ color: 'var(--text-muted)' }}>Cost: <strong style={{ color: '#f59e0b' }}>{cost.toLocaleString()} BL</strong></span>
                  {generating ? (
                    <button style={s.stopBtn} onClick={handleStop}>⛔ Stop Generation</button>
                  ) : (
                    <button style={s.genBtn(!canGenerate || generating)} onClick={handleGenerate} disabled={!canGenerate || generating}>
                      Generate ({cost.toLocaleString()} BL)
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {tab === 'clone' && (
            <div style={s.chatArea}>
              <div style={s.sectionTitle}>🔄 Clone a Website</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>Enter a URL to analyze and rebuild.</p>
              <input style={s.cloneInput} placeholder="https://example.com" value={cloneUrl} onChange={e => setCloneUrl(e.target.value)} />
              <button style={s.actionBtn('#6366f1')} onClick={handleCloneAnalyze} disabled={analyzing}>{analyzing ? 'Analyzing...' : 'Analyze Website'}</button>
              {cloneAnalysis && (<><div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, marginTop: 12, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>{JSON.stringify(cloneAnalysis, null, 2)}</div><button style={{ ...s.actionBtn('#22c55e'), marginTop: 12 }} onClick={handleCloneRebuild}>Rebuild with AI →</button></>)}
            </div>
          )}

          {tab === 'fix' && (
            <div style={s.chatArea}>
              <div style={s.sectionTitle}>🔧 Fix Your Code</div>
              {tc.dailyFixCap === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <p style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 8 }}>🔒 Code fixes not available on Free plan</p>
                  <a href="/pricing" style={s.actionBtn('#6366f1')}>View Plans →</a>
                </div>
              ) : (
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
                    Upload files (including ZIPs) and describe the issue. ({du.codeFixes || 0}/{isUnlimited(tc.dailyFixCap) ? '∞' : tc.dailyFixCap} fixes used today)
                  </p>
                  <div
                    style={{ ...s.dropZone, ...(dragActive ? s.dropZoneActive : {}) }}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input ref={fileInputRef} type="file" multiple accept=".html,.css,.js,.jsx,.ts,.tsx,.json,.py,.zip" onChange={(e) => handleFileUpload(e.target.files)} style={{ display: 'none' }} />
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
                      {dragActive ? '📦 Drop files here!' : '📁 Drag & drop files or click to browse'}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Supports ZIP files — auto-extracted on upload</p>
                  </div>
                  {fixFiles.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fixFiles.length} file(s) loaded</span>
                        <button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }} onClick={() => setFixFiles([])}>Clear</button>
                      </div>
                      {fixFiles.slice(0, 10).map((f, i) => <div key={i} style={s.fileItem}>{f.name}</div>)}
                      {fixFiles.length > 10 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>...and {fixFiles.length - 10} more</p>}
                    </div>
                  )}
                  {availableModels.length > 1 && (
                    <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {availableModels.map(m => (
                        <button key={m} style={{ ...s.tab(effectiveModel === m), fontSize: 11 }} onClick={() => setSelectedModel(m)}>
                          {MODEL_LABELS[m]}
                        </button>
                      ))}
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

          {tab === 'pro' && (
            <div style={s.chatArea}>
              <div style={s.sectionTitle}>⚡ Pro Developer</div>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                <p>🚧 Coming soon: terminal, env vars, custom domains, manual deploys</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel — Preview + Progress */}
        <div style={s.rightPanel}>
          {/* FIX #1: Progress panel stays visible after generation ends (error/done/stopped) */}
          {showProgress && progressMessages.length > 0 && (
            <div style={{ padding: 16, background: progressBarBg, borderBottom: `1px solid ${progressBarColor}33` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: progressBarColor }}>
                  {generating ? '⚡ Generating...' : genResult === 'done' ? '✅ Generation Complete' : genResult === 'error' ? '❌ Generation Failed' : genResult === 'stopped' ? '⛔ Generation Stopped' : ''}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {generating && (
                    <button style={{ ...s.stopBtn, padding: '6px 14px', fontSize: 12 }} onClick={handleStop}>⛔ Stop</button>
                  )}
                  {!generating && genResult && (
                    <button style={{ padding: '6px 14px', fontSize: 12, borderRadius: 8, border: '1px solid var(--border, #333)', background: 'transparent', color: 'var(--text-secondary, #999)', cursor: 'pointer', fontWeight: 600 }} onClick={handleDismissProgress}>✕ Dismiss</button>
                  )}
                </div>
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {progressMessages.slice(-10).map((msg, i) => (
                  <div key={i} style={s.progressItem(msg.step === 'error')}>
                    <div style={s.progressDot(msg.step)} />
                    <span>{msg.message}</span>
                  </div>
                ))}
              </div>
              {/* FIX: Show helpful action buttons on error */}
              {genResult === 'error' && !generating && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }} onClick={() => { handleDismissProgress(); handleGenerate(); }}>
                    🔄 Retry
                  </button>
                  {effectiveModel !== 'groq' && (
                    <button style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#888', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }} onClick={() => { setSelectedModel('groq'); handleDismissProgress(); }}>
                      Switch to Groq (faster)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

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
              {generating
                ? '⚡ Generating your website...\nThis may take 1-4 minutes depending on the model.'
                : genResult === 'stopped'
                ? '⛔ Generation was stopped.\nEdit your prompt and try again.'
                : genResult === 'error'
                ? '' /* Error message is shown in the progress panel above */
                : 'Your website preview will appear here.\nDescribe what you want to build!'}
            </div>
          )}
        </div>
      </div>

      {/* Code Viewer Modal */}
      {codeViewFile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setCodeViewFile(null)}>
          <div style={{ background: 'var(--bg-card, #1e1e2e)', border: '1px solid var(--border, #333)', borderRadius: 16, width: '90%', maxWidth: 800, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border, #333)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary, #fff)' }}>📄 {codeViewFile.name} <span style={{ fontWeight: 400, color: 'var(--text-muted, #666)', fontSize: 12 }}>({(codeViewFile.content?.length || 0).toLocaleString()} chars)</span></span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => { navigator.clipboard.writeText(codeViewFile.content); }}>📋 Copy</button>
                <button style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => { const blob = new Blob([codeViewFile.content], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = codeViewFile.name; a.click(); URL.revokeObjectURL(url); }}>💾 Download</button>
                <button style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,.2)', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => setCodeViewFile(null)}>✕ Close</button>
              </div>
            </div>
            <pre style={{ flex: 1, margin: 0, padding: 20, overflow: 'auto', fontSize: 12, lineHeight: 1.6, color: '#e0e0e0', background: '#0d0d1a', fontFamily: "Consolas, 'Fira Code', 'Cascadia Code', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{codeViewFile.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
