import { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api, { API_URL } from '../api';

const TIER_COLORS = { free: '#888', bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff' };
const MODEL_LABELS = {
  'gemini-3.1-pro': 'Gemini 3.1 Pro', 'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'haiku-4.5': 'Haiku 4.5', 'sonnet-4.6': 'Sonnet 4.6', 'groq': 'Groq AI',
  'gemini-pro': 'Gemini 3.1 Pro', 'gemini-flash': 'Gemini 2.5 Flash',
  'haiku': 'Haiku 4.5', 'sonnet': 'Sonnet 4.6',
};
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
// No artificial timeouts — let every AI completely finish its work.
// Users can click "Stop" anytime. Backend keepalive detects dead connections.
const UNLIMITED = 999999999;
function isUnlimited(n) { return n >= UNLIMITED || n === Infinity; }
function formatBL(n) {
  if (n == null) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return n.toLocaleString();
}

const BL_COST_LABELS = {
  'sonnet-4.6': 60000, 'gemini-3.1-pro': 50000, 'haiku-4.5': 20000,
  'gemini-2.5-flash': 10000, 'groq': 5000,
  'sonnet': 60000, 'gemini-pro': 50000, 'haiku': 20000, 'gemini-flash': 10000,
};

const ALL_MODELS_DISPLAY = [
  { id: 'sonnet-4.6', name: 'Sonnet 4.6', tier: 'gold' },
  { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', tier: 'bronze' },
  { id: 'haiku-4.5', name: 'Haiku 4.5', tier: 'silver' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tier: 'free' },
  { id: 'groq', name: 'Groq AI', tier: 'free' },
];
const TIER_ORDER = ['free', 'bronze', 'silver', 'gold', 'diamond'];

export default function Build() {
  const { user } = useContext(AuthContext);
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('build');
  const [mobileView, setMobileView] = useState('build'); // 'build' or 'preview' — mobile only
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
  const [progressMessages, setProgressMessages] = useState([]);
  const [progressStep, setProgressStep] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [genResult, setGenResult] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [systemPromptText, setSystemPromptText] = useState('');
  const [autoAttachPrompt, setAutoAttachPrompt] = useState(true);
  const [defaultPrompts, setDefaultPrompts] = useState({ gen: '', edit: '', fix: '' });
  const [activePromptMode, setActivePromptMode] = useState('gen'); // 'gen', 'edit', 'fix'
  const [editingDeployedSite, setEditingDeployedSite] = useState(null); // subdomain string or null
  const iframeRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const progressEndRef = useRef(null);

  useEffect(() => { api.get('/api/coins/balance').then(r => setCoinData(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    api.get('/api/build/available-models').then(r => {
      setAvailableModels(r.data.models || []);
      if (r.data.bl_coins !== undefined) setCoinData(p => ({ ...p, balance: r.data.bl_coins }));
    }).catch(() => {});
  }, [coinData?.balance]);

  // Load system prompt settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('zc_system_prompt');
      const autoAttach = localStorage.getItem('zc_auto_attach_prompt');
      if (saved) setSystemPromptText(saved);
      if (autoAttach !== null) setAutoAttachPrompt(autoAttach !== 'false');
    } catch {}
    // Fetch default prompts from backend
    api.get('/api/build/system-prompts').then(r => {
      const prompts = { gen: r.data.gen_prompt || '', edit: r.data.edit_prompt || '', fix: r.data.fix_prompt || '' };
      setDefaultPrompts(prompts);
      // If no saved custom prompt, auto-select based on mode
      if (!localStorage.getItem('zc_system_prompt')) {
        setSystemPromptText(prompts.gen);
      }
    }).catch(() => {});
  }, []);
  useEffect(() => { const h = () => setIsMobile(window.innerWidth < 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);

  // Auto-select system prompt when mode changes (unless user has a custom saved prompt)
  useEffect(() => {
    if (!localStorage.getItem('zc_system_prompt') && defaultPrompts[activePromptMode]) {
      setSystemPromptText(defaultPrompts[activePromptMode]);
    }
  }, [activePromptMode, defaultPrompts]);

  // Auto-scroll progress messages to latest
  useEffect(() => {
    if (progressEndRef.current) {
      progressEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [progressMessages]);

  // Auto-refresh preview whenever files change
  useEffect(() => {
    if (files.length > 0) {
      const htmlFile = files.find(f => f.name === 'index.html') || files.find(f => f.name?.endsWith('.html'));
      if (htmlFile?.content) {
        setPreview(htmlFile.content);
        if (iframeRef.current) iframeRef.current.srcdoc = htmlFile.content;
      }
    }
  }, [files]);

  // Auto-set prompt mode to 'gen' when no files loaded
  useEffect(() => {
    if (!searchParams.get('project') && !searchParams.get('site') && files.length === 0 && !editingDeployedSite) {
      setActivePromptMode('gen');
    }
  }, [files, searchParams, editingDeployedSite]);

  useEffect(() => {
    const projId = searchParams.get('project');
    const action = searchParams.get('action') || 'edit';
    const linkedSub = searchParams.get('subdomain'); // For redeploy

    if (projId) {
      api.get(`/api/build/project/${projId}`).then(({ data }) => {
        const p = data.project;
        setCurrentProjectId(p.projectId);
        setProjectName(p.name || '');
        if (p.files?.length) setFiles(p.files);

        // If project is linked to a deployed site, lock subdomain
        const sub = p.linkedSubdomain || linkedSub;
        if (sub) {
          setSubdomain(sub);
          setEditingDeployedSite(sub);
        }

        if (action === 'fix') {
          setTab('fix');
          setFixFiles(p.files || []);
          setFixDescription('');
          setActivePromptMode('fix');
          setPrompt('');
        } else if (action === 'redeploy') {
          // Re-deploy mode — load files, show preview, user can deploy directly
          setTab('build');
          setPrompt('');
          setActivePromptMode('edit');
        } else if (action === 'deploy') {
          // Fresh deploy — no locked subdomain
          setTab('build');
          setPrompt('');
          setActivePromptMode('gen');
        } else {
          // Edit mode (default)
          setTab('build');
          setActivePromptMode('edit');
          setPrompt(`Here is my existing project "${p.name}".\n\nPlease make these changes:\n\n`);
        }
      }).catch(() => {});
      return; // Don't also try to load from 'site' param
    }

    // Legacy: Load from deployed site directly (backward compatibility)
    const siteSubdomain = searchParams.get('site');
    if (siteSubdomain) {
      api.get(`/api/build/site-content/${siteSubdomain}`).then(({ data }) => {
        if (data.files?.length) {
          setFiles(data.files);
          setProjectName(data.title || siteSubdomain);
          setSubdomain(siteSubdomain);
          setEditingDeployedSite(siteSubdomain);
          setActivePromptMode(action === 'fix' ? 'fix' : 'edit');
          if (action === 'fix') {
            setTab('fix');
            setFixFiles(data.files);
          } else {
            setTab('build');
            setPrompt(`Here is my existing website "${data.title || siteSubdomain}" deployed at ${siteSubdomain}.zapcodes.net.\n\nPlease make these changes:\n\n`);
          }
        }
      }).catch(() => {});
    }
  }, [searchParams]);

  const plan = coinData?.subscription_tier || coinData?.plan || user?.subscription_tier || user?.plan || 'free';
  const tc = coinData?.tierConfig || {};
  const balance = coinData?.balance ?? coinData?.bl_coins ?? user?.bl_coins ?? 0;

  const effectiveModel = (() => {
    if (selectedModel) { const m = availableModels.find(x => x.id === selectedModel && x.available); if (m) return m.id; }
    const primary = availableModels.find(x => x.available);
    return primary?.id || 'groq';
  })();

  const currentModelInfo = availableModels.find(m => m.id === effectiveModel) || {};
  const cost = currentModelInfo.cost || BL_COST_LABELS[effectiveModel] || 5000;
  const maxChars = tc.maxChars || 2000;
  const charsUsed = prompt.length;
  const charPct = isUnlimited(maxChars) ? 0 : (charsUsed / maxChars) * 100;

  // ── System Prompt Management ──
  const saveSystemPrompt = () => {
    try { localStorage.setItem('zc_system_prompt', systemPromptText); } catch {}
    alert('System prompt saved!');
  };
  const resetSystemPrompt = () => {
    setSystemPromptText(defaultPrompts[activePromptMode] || defaultPrompts.gen || '');
    try { localStorage.removeItem('zc_system_prompt'); } catch {}
  };
  const deleteSystemPrompt = () => {
    setSystemPromptText('');
    try { localStorage.removeItem('zc_system_prompt'); } catch {}
  };
  const toggleAutoAttach = () => {
    const next = !autoAttachPrompt;
    setAutoAttachPrompt(next);
    try { localStorage.setItem('zc_auto_attach_prompt', String(next)); } catch {}
  };
  const loadDefaultForMode = (mode) => {
    setActivePromptMode(mode);
    setSystemPromptText(defaultPrompts[mode] || '');
    try { localStorage.removeItem('zc_system_prompt'); } catch {} // Clear custom so auto-select works
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return alert('Enter a description');
    const editFiles = files.length > 0 ? [...files] : null;
    // When editing: keep preview visible. When new: clear everything.
    if (editFiles) {
      setGenerating(true); setGenResult(null); setDeployUrl(''); setProgressMessages([]); setProgressStep('validating');
    } else {
      setActivePromptMode('gen');
      setGenerating(true); setGenResult(null); setFiles([]); setPreview(''); setDeployUrl(''); setProgressMessages([]); setProgressStep('validating');
    }
    if (isMobile) setMobileView('build');
    const controller = new AbortController(); abortControllerRef.current = controller;
    try {
      const token = localStorage.getItem('token');
      const requestBody = { prompt, model: effectiveModel, template, projectName: projectName || 'My Website' };
      if (editFiles) requestBody.existingFiles = editFiles;
      // Attach system prompt if auto-attach is ON and prompt is not empty
      if (autoAttachPrompt && systemPromptText && systemPromptText.trim().length > 50) {
        requestBody.customSystemPrompt = systemPromptText;
      }
      const response = await fetch(`${API_URL}/api/build/generate-with-progress`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(requestBody), signal: controller.signal });
      if (!response.ok) { let msg = `Server error ${response.status}`; try { msg = (await response.json()).error || msg; } catch {} throw new Error(msg); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'progress') { setProgressStep(data.step); setProgressMessages(p => [...p.slice(-20), { step: data.step, message: data.message, time: new Date() }]); if (data.sessionId) setSessionId(data.sessionId); }
            else if (data.type === 'complete') {
              setFiles(data.files || []); setPreview(data.preview || '');
              setCoinData(p => ({ ...p, balance: data.balanceRemaining }));
              if (iframeRef.current && data.preview) iframeRef.current.srcdoc = data.preview;
              setProgressStep('done'); setGenResult('done');
              setProgressMessages(p => [...p, { step: 'done', message: `Done! ${data.fileCount} file(s) using ${MODEL_LABELS[data.model] || data.model}. Cost: ${(data.blSpent||0).toLocaleString()} BL.`, time: new Date() }]);
              api.get('/api/build/available-models').then(r => setAvailableModels(r.data.models || [])).catch(() => {});
              // On mobile, auto-switch to preview after generation
              if (isMobile) setTimeout(() => setMobileView('preview'), 1500);
            }
            else if (data.type === 'error') { setProgressStep('error'); setGenResult('error'); setProgressMessages(p => [...p, { step: 'error', message: data.error + (data.suggestion ? ` — ${data.suggestion}` : ''), time: new Date() }]); }
            else if (data.type === 'stopped') { setProgressStep('stopped'); setGenResult('stopped'); setProgressMessages(p => [...p, { step: 'stopped', message: data.message || 'Stopped. Coins refunded.', time: new Date() }]); }
          } catch (e) { console.warn('[SSE] Parse error:', e.message); }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') { if (!genResult) { setProgressStep('stopped'); setGenResult('stopped'); } }
      else { setProgressStep('error'); setGenResult('error'); setProgressMessages(p => [...p, { step: 'error', message: err.message || 'Connection failed', time: new Date() }]); }
    } finally { abortControllerRef.current = null; setGenerating(false); setSessionId(null); }
  }, [prompt, effectiveModel, template, projectName, isMobile, files, autoAttachPrompt, systemPromptText]);

  const handleStop = async () => { if (abortControllerRef.current) abortControllerRef.current.abort(); try { await api.post('/api/build/stop', { sessionId }); } catch {} setProgressStep('stopped'); setGenResult('stopped'); setProgressMessages(p => [...p, { step: 'stopped', message: 'Stopped. Coins refunded.', time: new Date() }]); setGenerating(false); };
  const handleDismissProgress = () => { setGenResult(null); setProgressMessages([]); setProgressStep(''); };
  const handleSaveProject = async () => {
    if (!files.length) return alert('No files');
    try {
      const payload = { projectId: currentProjectId, name: projectName || 'Untitled', files, preview, template, description: prompt };
      // Preserve linked subdomain if editing a deployed site's project
      if (editingDeployedSite) payload.subdomain = editingDeployedSite;
      const { data } = await api.post('/api/build/save-project', payload);
      setCurrentProjectId(data.project.projectId);
      alert(`Saved! (v${data.project.version})`);
    } catch (e) { alert(e.response?.data?.error || 'Save failed'); }
  };

  const handleDeploy = async () => {
    if (!files.length) return alert('Generate or load files first');
    setDeploying(true);
    try {
      if (editingDeployedSite && currentProjectId) {
        // Re-deploy from project — save project first, then push to live
        await api.post('/api/build/save-project', { projectId: currentProjectId, name: projectName || 'Untitled', files, preview, template, description: prompt });
        const { data } = await api.post('/api/build/redeploy-from-project', { projectId: currentProjectId });
        setDeployUrl(data.url);
        alert(`Re-deployed to ${data.url}!`);
      } else {
        // Normal deploy — backend auto-saves to project
        if (!subdomain.trim()) return alert('Enter a subdomain');
        const { data } = await api.post('/api/build/deploy', { subdomain: subdomain.toLowerCase(), files, title: projectName || subdomain });
        setDeployUrl(data.url);
        if (data.linkedProjectId) setCurrentProjectId(data.linkedProjectId);
        setEditingDeployedSite(data.subdomain);
        alert(`Deployed to ${data.url}!`);
      }
    } catch (e) { alert(e.response?.data?.error || 'Deploy failed'); }
    finally { setDeploying(false); }
  };
  const handleCloneAnalyze = async () => { if (!cloneUrl.trim()) return; setAnalyzing(true); try { const { data } = await api.post('/api/build/clone-analyze', { url: cloneUrl }); setCloneAnalysis(data.analysis); } catch (e) { alert(e.response?.data?.error || 'Failed'); } finally { setAnalyzing(false); } };
  const handleFileUpload = (fileList) => { const uploaded = Array.from(fileList); const zips = uploaded.filter(f => f.name.endsWith('.zip')); const texts = uploaded.filter(f => !f.name.endsWith('.zip')); if (zips.length) { const fd = new FormData(); zips.forEach(f => fd.append('files', f)); api.post('/api/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(({ data }) => { setFixFiles(p => [...p, ...data.files]); alert(`${data.totalFiles} files extracted`); }).catch(e => alert(e.response?.data?.error || 'ZIP failed')); } if (texts.length) Promise.all(texts.map(f => new Promise(r => { const rd = new FileReader(); rd.onload = e => r({ name: f.name, content: e.target.result }); rd.readAsText(f); }))).then(p => setFixFiles(prev => [...prev, ...p])); };
  const handleCodeFix = async () => { if (!fixFiles.length) return alert('Upload files first'); setFixing(true); try { const { data } = await api.post('/api/build/code-fix', { files: fixFiles, description: fixDescription, model: effectiveModel }); setFiles(data.files || []); setPreview(data.preview || ''); setCoinData(p => ({ ...p, balance: data.balanceRemaining })); if (iframeRef.current && data.preview) iframeRef.current.srcdoc = data.preview; setTab('build'); if (isMobile) setMobileView('preview'); } catch (e) { alert(e.response?.data?.error || 'Fix failed'); } finally { setFixing(false); } };

  const modelSelectorItems = (() => {
    const items = [];
    const availableIds = new Set(availableModels.map(m => m.id));
    for (const m of availableModels) items.push({ ...m, locked: false });
    for (const m of ALL_MODELS_DISPLAY) {
      if (!availableIds.has(m.id)) {
        items.push({ id: m.id, name: m.name, cost: BL_COST_LABELS[m.id] || 5000, available: false, locked: true, requiredTier: m.tier, monthlyLimit: '—', monthlyUsed: 0, type: 'locked' });
      }
    }
    return items;
  })();

  const showProgress = generating || (genResult && progressMessages.length > 0);
  const pColor = genResult === 'error' ? '#ef4444' : genResult === 'done' ? '#22c55e' : genResult === 'stopped' ? '#f59e0b' : '#6366f1';

  // ── System Prompt Editor Panel ──
  const SystemPromptPanel = () => (
    <div style={{ marginBottom: 10 }}>
      {/* Toggle bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: 'var(--bg-elevated)', cursor: 'pointer', marginBottom: showSystemPrompt ? 8 : 0 }} onClick={() => setShowSystemPrompt(!showSystemPrompt)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: autoAttachPrompt ? '#22c55e' : 'var(--text-muted)' }}>
            {showSystemPrompt ? '▼' : '▶'} System Prompt
          </span>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: autoAttachPrompt ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)', color: autoAttachPrompt ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
            {autoAttachPrompt ? 'ON' : 'OFF'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
          <button style={{ padding: '3px 8px', borderRadius: 4, border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer', background: autoAttachPrompt ? 'rgba(34,197,94,.2)' : 'rgba(255,255,255,.06)', color: autoAttachPrompt ? '#22c55e' : 'var(--text-muted)' }} onClick={toggleAutoAttach}>
            {autoAttachPrompt ? '✓ Auto' : '✗ Auto'}
          </button>
        </div>
      </div>

      {/* Editor (expanded) */}
      {showSystemPrompt && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--bg-card)' }}>
          {/* Mode buttons — active mode is green */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'gen', label: 'New Website' },
              { id: 'edit', label: 'Edit Website' },
              { id: 'fix', label: 'Fix Bugs' },
            ].map(m => (
              <button key={m.id} style={{
                padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                border: activePromptMode === m.id ? '1px solid #22c55e' : '1px solid var(--border)',
                background: activePromptMode === m.id ? 'rgba(34,197,94,.15)' : 'transparent',
                color: activePromptMode === m.id ? '#22c55e' : 'var(--text-secondary)',
              }} onClick={() => loadDefaultForMode(m.id)}>{m.label}</button>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            value={systemPromptText}
            onChange={e => setSystemPromptText(e.target.value)}
            placeholder="System prompt instructions for the AI..."
            style={{ width: '100%', minHeight: 150, maxHeight: 300, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'Consolas, monospace', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }}
          />

          {/* Info + actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {systemPromptText.length.toLocaleString()} chars · {autoAttachPrompt ? 'Will be sent with your next generation' : 'Auto-attach is OFF — prompt will NOT be sent'}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 10, fontWeight: 600 }} onClick={saveSystemPrompt}>💾 Save</button>
              <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontWeight: 600 }} onClick={resetSystemPrompt}>↺ Reset</button>
              <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 10, fontWeight: 600 }} onClick={deleteSystemPrompt}>✗ Clear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Progress Panel (shared between desktop right panel and mobile build view) ──
  const ProgressPanel = () => showProgress && progressMessages.length > 0 ? (
    <div style={{ padding: 12, background: `${pColor}11`, borderBottom: `1px solid ${pColor}33`, borderRadius: isMobile ? 10 : 0, margin: isMobile ? '0 0 10px 0' : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: pColor }}>{generating ? '⚡ Generating...' : genResult === 'done' ? '✅ Complete' : genResult === 'error' ? '❌ Failed' : '⛔ Stopped'}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {generating && <button style={{ padding: '5px 12px', borderRadius: 8, border: '2px solid #ef4444', background: 'rgba(239,68,68,.1)', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: 12 }} onClick={handleStop}>⛔ Stop</button>}
          {!generating && genResult && <button style={{ padding: '5px 12px', fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }} onClick={handleDismissProgress}>✕</button>}
        </div>
      </div>
      <div style={{ maxHeight: isMobile ? 200 : 250, overflowY: 'auto' }}>
        {progressMessages.map((m, i) => (
          <div key={i} style={{ padding: '4px 0', fontSize: 12, color: m.step === 'error' ? '#ef4444' : m.step === 'building' ? '#06b6d4' : 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <div style={{ width: 7, height: 7, borderRadius: 4, marginTop: 4, flexShrink: 0, background: m.step === 'error' ? '#ef4444' : m.step === 'done' ? '#22c55e' : m.step === 'stopped' ? '#f59e0b' : m.step === 'building' ? '#06b6d4' : '#6366f1' }} />
            <span>{m.message}</span>
          </div>
        ))}
        <div ref={progressEndRef} />
      </div>
      {genResult === 'error' && !generating && <button style={{ marginTop: 8, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }} onClick={() => { handleDismissProgress(); handleGenerate(); }}>🔄 Retry</button>}
      {/* Mobile: show "View Preview" button after generation completes */}
      {isMobile && genResult === 'done' && preview && (
        <button style={{ marginTop: 8, width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }} onClick={() => setMobileView('preview')}>
          👁️ View Preview & Deploy
        </button>
      )}
    </div>
  ) : null;

  // ── Deploy Bar (shared) ──
  // Deploy bar JSX is inlined directly where used (not as a component)
  // This prevents React from unmounting/remounting the input on every render

  // ── MOBILE LAYOUT ──
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', overflow: 'hidden' }}>
        {/* Mobile Top Bar — tabs + stats */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {[
              { id: 'build', label: '💬 Build', view: 'build' },
              { id: 'clone', label: '🔄 Clone', view: 'build' },
              { id: 'fix', label: '🔧 Fix', view: 'build' },
            ].map(t => (
              <button key={t.id} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: tab === t.id ? '#6366f1' : 'transparent', color: tab === t.id ? '#fff' : 'var(--text-secondary)' }} onClick={() => { setTab(t.id); setMobileView(t.view); }}>{t.label}</button>
            ))}
            {preview && (
              <button style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: mobileView === 'preview' ? '#22c55e' : 'transparent', color: mobileView === 'preview' ? '#fff' : '#22c55e' }} onClick={() => setMobileView('preview')}>
                👁️ Preview
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, color: '#000', background: TIER_COLORS[plan] }}>{plan.toUpperCase()}</span>
            <span style={{ background: 'rgba(245,158,11,.15)', color: '#f59e0b', padding: '3px 8px', borderRadius: 10, fontWeight: 700, fontSize: 12 }}>🪙 {formatBL(balance)}</span>
          </div>
        </div>

        {/* Mobile: Build View */}
        {mobileView === 'build' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {tab === 'build' && (
                <>
                  {/* Progress inline on mobile */}
                  <ProgressPanel />

                  {/* Model selector */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>AI Model:</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {modelSelectorItems.map(m => (
                        <button key={m.id} style={{ padding: '4px 8px', borderRadius: 6, border: effectiveModel === m.id ? '1px solid #6366f1' : m.locked ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--border)', cursor: m.available ? 'pointer' : 'default', fontWeight: 600, fontSize: 10, background: effectiveModel === m.id ? 'rgba(99,102,241,.2)' : 'transparent', color: effectiveModel === m.id ? '#6366f1' : m.locked ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: m.locked ? 0.5 : 1 }} onClick={() => m.available && !m.locked && setSelectedModel(m.id)} disabled={!m.available || m.locked}>
                          {m.locked ? '🔒 ' : ''}{m.name} {!m.locked && `(${formatBL(m.cost)})`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} placeholder="Project name (optional)" value={projectName} onChange={e => setProjectName(e.target.value)} />

                  {/* Templates */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Template:</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {TEMPLATES.map(t => <button key={t.id} style={{ padding: '4px 8px', borderRadius: 6, border: template === t.id ? '1px solid #6366f1' : '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, fontSize: 10, background: template === t.id ? 'rgba(99,102,241,.15)' : 'transparent', color: template === t.id ? '#6366f1' : 'var(--text-secondary)' }} onClick={() => setTemplate(t.id)}>{t.icon} {t.name}</button>)}
                    </div>
                  </div>

                  {/* System Prompt Editor */}
                  <SystemPromptPanel />

                  {/* Generated files */}
                  {files.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Files ({files.length})</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #22c55e', background: 'transparent', color: '#22c55e', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={handleSaveProject}>💾 Save</button>
                          <button style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={() => { const h = files.find(f => f.name.endsWith('.html')); if (h) { const b = new Blob([h.content], { type: 'text/html' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'index.html'; a.click(); } }}>💾 HTML</button>
                        </div>
                      </div>
                      {files.map((f, i) => <div key={i} style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--bg-elevated)', marginBottom: 3, fontSize: 12, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }} onClick={() => setCodeViewFile(f)}><span>📄 {f.name}</span><span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{(f.content?.length||0).toLocaleString()} chars</span></div>)}
                    </div>
                  )}
                </>
              )}
              {tab === 'clone' && (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>🔄 Clone a Website</div>
                  <input style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} placeholder="https://example.com" value={cloneUrl} onChange={e => setCloneUrl(e.target.value)} />
                  <button style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#6366f1', color: '#fff' }} onClick={handleCloneAnalyze} disabled={analyzing}>{analyzing ? 'Analyzing...' : 'Analyze'}</button>
                  {cloneAnalysis && <><pre style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: 12, marginTop: 8, fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>{JSON.stringify(cloneAnalysis, null, 2)}</pre><button style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#22c55e', color: '#fff', marginTop: 8 }} onClick={() => { setPrompt(`Rebuild:\n${JSON.stringify(cloneAnalysis, null, 2)}`); setTab('build'); }}>Rebuild →</button></>}
                </>
              )}
              {tab === 'fix' && (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>🔧 Fix Your Code</div>
                  <div style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 16, textAlign: 'center', cursor: 'pointer', marginBottom: 8, ...(dragActive ? { borderColor: '#6366f1' } : {}) }} onClick={() => fileInputRef.current?.click()}>
                    <input ref={fileInputRef} type="file" multiple accept=".html,.css,.js,.jsx,.ts,.tsx,.json,.py,.zip" onChange={e => handleFileUpload(e.target.files)} style={{ display: 'none' }} />
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>📁 Tap to upload files</p>
                  </div>
                  {fixFiles.length > 0 && <div style={{ marginBottom: 8 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fixFiles.length} file(s)</span><button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, marginLeft: 8 }} onClick={() => setFixFiles([])}>Clear</button></div>}
                  <textarea style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', minHeight: 60, fontFamily: 'inherit', boxSizing: 'border-box' }} placeholder="Describe what needs fixing..." value={fixDescription} onChange={e => setFixDescription(e.target.value)} />
                  <button style={{ padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#8b5cf6', color: '#fff', marginTop: 8, width: '100%' }} onClick={handleCodeFix} disabled={fixing}>{fixing ? 'Fixing...' : `Fix Code (${cost.toLocaleString()} BL)`}</button>
                </>
              )}
            </div>

            {/* Mobile Input Area — sticky bottom */}
            {tab === 'build' && (
              <div style={{ padding: 12, borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                <textarea style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, resize: 'none', height: 60, fontFamily: 'inherit', boxSizing: 'border-box' }} placeholder="Describe what you want to build..." value={prompt} onChange={e => setPrompt(e.target.value)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Cost: <strong style={{ color: '#f59e0b' }}>{cost.toLocaleString()} BL</strong></span>
                  {generating
                    ? <button style={{ padding: '10px 16px', borderRadius: 8, border: '2px solid #ef4444', background: 'rgba(239,68,68,.1)', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: 13 }} onClick={handleStop}>⛔ Stop</button>
                    : <button style={{ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: balance < cost ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, background: balance < cost ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: balance < cost ? 'var(--text-muted)' : '#fff', opacity: balance < cost ? 0.5 : 1, flex: 1 }} onClick={handleGenerate} disabled={balance < cost}>Generate</button>
                  }
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mobile: Preview View */}
        {mobileView === 'preview' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {preview ? (
              <>
                <iframe ref={iframeRef} srcDoc={preview} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} title="Preview" sandbox="allow-scripts allow-same-origin" />
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input style={{ flex: 1, minWidth: '100%', padding: '10px 12px', borderRadius: 8, border: editingDeployedSite ? '1px solid #22c55e' : '1px solid var(--border)', background: editingDeployedSite ? 'rgba(34,197,94,.08)' : 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' }} placeholder="Enter subdomain (.zapcodes.net)" value={subdomain} onChange={e => { if (!editingDeployedSite) setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }} readOnly={!!editingDeployedSite} />
                  {editingDeployedSite && <div style={{ fontSize: 10, color: '#22c55e', padding: '2px 0' }}>🔒 Subdomain locked — editing deployed site</div>}
                  <button style={{ padding: '12px 20px', borderRadius: 8, border: 'none', cursor: deploying ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, background: deploying ? 'var(--bg-elevated)' : '#22c55e', color: '#fff', opacity: deploying ? .5 : 1, width: '100%' }} onClick={handleDeploy} disabled={deploying}>{deploying ? 'Deploying...' : editingDeployedSite ? '🚀 Re-deploy to .zapcodes.net' : '🚀 Deploy to .zapcodes.net'}</button>
                </div>
                {deployUrl && <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,.1)', fontSize: 12 }}>✅ Live at <a href={deployUrl} target="_blank" rel="noreferrer" style={{ color: '#22c55e', fontWeight: 600 }}>{deployUrl}</a></div>}
                <button style={{ padding: '10px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }} onClick={() => setMobileView('build')}>← Back to Builder</button>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.3)', fontSize: 16, textAlign: 'center', padding: 30 }}>
                {generating ? '⚡ Generating...' : 'No preview yet.\nGenerate a website first!'}
                <br /><br />
                <button style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }} onClick={() => setMobileView('build')}>← Back to Builder</button>
              </div>
            )}
          </div>
        )}

        {/* Code viewer modal */}
        {codeViewFile && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }} onClick={() => setCodeViewFile(null)}>
            <div style={{ background: 'var(--bg-card, #1e1e2e)', border: '1px solid var(--border, #333)', borderRadius: 14, width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>📄 {codeViewFile.name}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={() => navigator.clipboard.writeText(codeViewFile.content)}>📋</button>
                  <button style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,.2)', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={() => setCodeViewFile(null)}>✕</button>
                </div>
              </div>
              <pre style={{ flex: 1, margin: 0, padding: 16, overflow: 'auto', fontSize: 11, lineHeight: 1.5, color: '#e0e0e0', background: '#0d0d1a', fontFamily: "Consolas, monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{codeViewFile.content}</pre>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── DESKTOP LAYOUT (unchanged) ──
  const s = {
    page: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', overflow: 'hidden' },
    topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', flexWrap: 'wrap', gap: 8 },
    tabs: { display: 'flex', gap: 4 },
    tab: (a) => ({ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: a ? '#6366f1' : 'transparent', color: a ? '#fff' : 'var(--text-secondary)', transition: 'all .2s' }),
    stats: { display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' },
    main: { display: 'flex', flex: 1, overflow: 'hidden' },
    leftPanel: { width: '40%', minWidth: 340, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--bg-surface)' },
    rightPanel: { flex: 1, display: 'flex', flexDirection: 'column', background: '#1a1a2e' },
    chatArea: { flex: 1, padding: 16, overflowY: 'auto' },
    inputArea: { padding: 16, borderTop: '1px solid var(--border)', background: 'var(--bg-card)' },
    textarea: { width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, resize: 'vertical', minHeight: 80, fontFamily: 'inherit', boxSizing: 'border-box' },
    genBtn: (d) => ({ padding: '12px 24px', borderRadius: 10, border: 'none', cursor: d ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, background: d ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: d ? 'var(--text-muted)' : '#fff', opacity: d ? .5 : 1, flex: 1 }),
    stopBtn: { padding: '12px 20px', borderRadius: 10, border: '2px solid #ef4444', background: 'rgba(239,68,68,.1)', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: 14 },
    iframe: { width: '100%', height: '100%', border: 'none', background: '#fff' },
    emptyPreview: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'rgba(255,255,255,.3)', fontSize: 18, textAlign: 'center', padding: 40 },
    fileItem: { padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)', marginBottom: 4, fontSize: 13, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' },
    dropZone: { border: '2px dashed var(--border)', borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer', marginBottom: 12 },
    modelBtn: (selected, available, locked) => ({
      padding: '6px 10px', borderRadius: 8, border: selected ? '1px solid #6366f1' : locked ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--border)',
      cursor: available ? 'pointer' : 'default', fontWeight: 600, fontSize: 11,
      background: selected ? 'rgba(99,102,241,.2)' : locked ? 'rgba(255,255,255,0.02)' : 'transparent',
      color: selected ? '#6366f1' : locked ? 'var(--text-muted)' : 'var(--text-secondary)',
      opacity: locked ? 0.5 : available ? 1 : 0.6, transition: 'all .2s',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 80,
    }),
  };

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <div style={s.tabs}>
          <button style={s.tab(tab === 'build')} onClick={() => setTab('build')}>💬 AI Builder</button>
          <button style={s.tab(tab === 'clone')} onClick={() => setTab('clone')}>🔄 Clone</button>
          <button style={s.tab(tab === 'fix')} onClick={() => setTab('fix')}>🔧 Code Fix</button>
          {tc.canProDev && <button style={s.tab(tab === 'pro')} onClick={() => setTab('pro')}>⚡ Pro Dev</button>}
        </div>
        <div style={s.stats}>
          <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, color: '#000', background: TIER_COLORS[plan] }}>{plan.toUpperCase()}</span>
          <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(99,102,241,.2)', color: '#6366f1' }}>{MODEL_LABELS[effectiveModel] || effectiveModel}</span>
          <span style={{ background: 'rgba(245,158,11,.15)', color: '#f59e0b', padding: '4px 10px', borderRadius: 12, fontWeight: 700, fontSize: 13 }}>🪙 {formatBL(balance)}</span>
        </div>
      </div>

      <div style={s.main}>
        <div style={s.leftPanel}>
          {tab === 'build' && (
            <>
              <div style={s.chatArea}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Describe your website</div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>AI Model:</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {modelSelectorItems.map(m => (
                      <button key={m.id} style={s.modelBtn(effectiveModel === m.id, m.available, m.locked)} onClick={() => m.available && !m.locked && setSelectedModel(m.id)} disabled={!m.available || m.locked} title={m.locked ? `Requires ${m.requiredTier?.charAt(0).toUpperCase() + m.requiredTier?.slice(1)}+` : `${m.name} — ${formatBL(m.cost)} BL`}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{m.locked ? '🔒 ' : ''}{m.name}</span>
                        {!m.locked && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatBL(m.cost)} BL{m.monthlyLimit && m.monthlyLimit !== 'Unlimited' && m.monthlyLimit !== '—' ? ` · ${m.monthlyUsed || 0}/${m.monthlyLimit}` : m.monthlyLimit === 'Unlimited' ? ' · ∞' : ''}{m.type === 'one_time_trial' ? ' (trial)' : ''}</span>}
                        {m.locked && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{m.requiredTier?.charAt(0).toUpperCase() + m.requiredTier?.slice(1)}+</span>}
                      </button>
                    ))}
                  </div>
                </div>
                <input style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} placeholder="Project name (optional)" value={projectName} onChange={e => setProjectName(e.target.value)} />
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Template:</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {TEMPLATES.map(t => <button key={t.id} style={{ padding: '5px 10px', borderRadius: 8, border: template === t.id ? '1px solid #6366f1' : '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, fontSize: 11, background: template === t.id ? 'rgba(99,102,241,.15)' : 'transparent', color: template === t.id ? '#6366f1' : 'var(--text-secondary)' }} onClick={() => setTemplate(t.id)}>{t.icon} {t.name}</button>)}
                  </div>
                </div>
                <SystemPromptPanel />
                {files.length > 0 && (
                  <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <span>Generated Files ({files.length})</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #22c55e', background: 'transparent', color: '#22c55e', cursor: 'pointer', fontWeight: 600, fontSize: 12 }} onClick={handleSaveProject}>💾 Save</button>
                        <button style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={() => { const h = files.find(f => f.name.endsWith('.html')); if (h) { const b = new Blob([h.content], { type: 'text/html' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'index.html'; a.click(); } }}>💾 HTML</button>
                        <button style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#f59e0b', color: '#000', cursor: 'pointer', fontSize: 11, fontWeight: 600 }} onClick={() => { const h = files.find(f => f.name.endsWith('.html')); if (h) window.open(URL.createObjectURL(new Blob([h.content], { type: 'text/html' })), '_blank'); }}>🔗 New Tab</button>
                      </div>
                    </div>
                    {files.map((f, i) => <div key={i} style={s.fileItem} onClick={() => setCodeViewFile(f)}><span>📄 {f.name}</span><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{(f.content?.length||0).toLocaleString()} chars</span></div>)}
                  </div>
                )}
              </div>
              <div style={s.inputArea}>
                <textarea style={s.textarea} placeholder="Describe the website you want to build..." value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={isUnlimited(maxChars) ? undefined : maxChars + 100} />
                <div style={{ fontSize: 11, textAlign: 'right', marginTop: 4, color: charPct > 100 ? '#ef4444' : 'var(--text-muted)' }}>{isUnlimited(maxChars) ? `${charsUsed} chars` : `${charsUsed}/${maxChars}`}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 13, gap: 8 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Cost: <strong style={{ color: '#f59e0b' }}>{cost.toLocaleString()} BL</strong> {balance < cost && <span style={{ color: '#ef4444', fontSize: 11 }}>(insufficient)</span>}</span>
                  {generating ? <button style={s.stopBtn} onClick={handleStop}>⛔ Stop</button> : <button style={s.genBtn(generating || balance < cost)} onClick={handleGenerate} disabled={generating || balance < cost}>Generate ({cost.toLocaleString()} BL)</button>}
                </div>
              </div>
            </>
          )}
          {tab === 'clone' && (
            <div style={s.chatArea}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>🔄 Clone a Website</div>
              <input style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} placeholder="https://example.com" value={cloneUrl} onChange={e => setCloneUrl(e.target.value)} />
              <button style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: '#6366f1', color: '#fff' }} onClick={handleCloneAnalyze} disabled={analyzing}>{analyzing ? 'Analyzing...' : 'Analyze'}</button>
              {cloneAnalysis && <><pre style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, marginTop: 12, fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>{JSON.stringify(cloneAnalysis, null, 2)}</pre><button style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: '#22c55e', color: '#fff', marginTop: 12 }} onClick={() => { setPrompt(`Rebuild:\n${JSON.stringify(cloneAnalysis, null, 2)}`); setTab('build'); }}>Rebuild with AI →</button></>}
            </div>
          )}
          {tab === 'fix' && (
            <div style={s.chatArea}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>🔧 Fix Your Code</div>
              <div style={{ ...s.dropZone, ...(dragActive ? { borderColor: '#6366f1' } : {}) }} onDragOver={e => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={e => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.length) handleFileUpload(e.dataTransfer.files); }} onClick={() => fileInputRef.current?.click()}>
                <input ref={fileInputRef} type="file" multiple accept=".html,.css,.js,.jsx,.ts,.tsx,.json,.py,.zip" onChange={e => handleFileUpload(e.target.files)} style={{ display: 'none' }} />
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{dragActive ? '📦 Drop here!' : '📁 Drag & drop or click'}</p>
              </div>
              {fixFiles.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fixFiles.length} file(s)</span><button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }} onClick={() => setFixFiles([])}>Clear</button></div>{fixFiles.slice(0, 10).map((f, i) => <div key={i} style={{ ...s.fileItem, cursor: 'default' }}>{f.name}</div>)}</div>}
              <textarea style={s.textarea} placeholder="Describe what needs fixing..." value={fixDescription} onChange={e => setFixDescription(e.target.value)} />
              <button style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: '#8b5cf6', color: '#fff', marginTop: 12 }} onClick={handleCodeFix} disabled={fixing}>{fixing ? 'Fixing...' : `Fix Code (${cost.toLocaleString()} BL)`}</button>
            </div>
          )}
          {tab === 'pro' && <div style={s.chatArea}><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>⚡ Pro Dev</div><p style={{ color: 'var(--text-secondary)' }}>🚧 Coming soon</p></div>}
        </div>

        <div style={s.rightPanel}>
          <ProgressPanel />
          {preview ? (
            <>
              <iframe ref={iframeRef} srcDoc={preview} style={s.iframe} title="Preview" sandbox="allow-scripts allow-same-origin" />
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: editingDeployedSite ? '1px solid #22c55e' : '1px solid var(--border)', background: editingDeployedSite ? 'rgba(34,197,94,.08)' : 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }} placeholder="subdomain" value={subdomain} onChange={e => { if (!editingDeployedSite) setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }} readOnly={!!editingDeployedSite} />
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>.zapcodes.net</span>
                  <button style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: deploying ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, background: deploying ? 'var(--bg-elevated)' : '#22c55e', color: '#fff', opacity: deploying ? .5 : 1 }} onClick={handleDeploy} disabled={deploying}>{deploying ? 'Deploying...' : editingDeployedSite ? '🚀 Re-deploy' : '🚀 Deploy'}</button>
                </div>
                {editingDeployedSite && <div style={{ fontSize: 10, color: '#22c55e', marginTop: 4 }}>🔒 Subdomain locked — editing deployed site</div>}
              </div>
              {deployUrl && <div style={{ padding: '8px 16px', background: 'rgba(34,197,94,.1)', fontSize: 13 }}>✅ Live at <a href={deployUrl} target="_blank" rel="noreferrer" style={{ color: '#22c55e', fontWeight: 600 }}>{deployUrl}</a></div>}
            </>
          ) : (
            <div style={s.emptyPreview}>{generating ? '⚡ Generating...' : genResult === 'error' ? '' : 'Your preview will appear here.\nDescribe what you want to build!'}</div>
          )}
        </div>
      </div>

      {codeViewFile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setCodeViewFile(null)}>
          <div style={{ background: 'var(--bg-card, #1e1e2e)', border: '1px solid var(--border, #333)', borderRadius: 16, width: '90%', maxWidth: 800, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>📄 {codeViewFile.name}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => navigator.clipboard.writeText(codeViewFile.content)}>📋 Copy</button>
                <button style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => { const b = new Blob([codeViewFile.content], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = codeViewFile.name; a.click(); }}>💾 Download</button>
                <button style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,.2)', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => setCodeViewFile(null)}>✕</button>
              </div>
            </div>
            <pre style={{ flex: 1, margin: 0, padding: 20, overflow: 'auto', fontSize: 12, lineHeight: 1.6, color: '#e0e0e0', background: '#0d0d1a', fontFamily: "Consolas, 'Fira Code', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{codeViewFile.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
