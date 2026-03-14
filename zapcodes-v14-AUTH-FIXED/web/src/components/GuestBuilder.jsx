/**
 * GuestBuilder.jsx — Mobile portrait fixed
 * - Single column layout on mobile, no overflow
 * - After clicking Build: preview expands above the prompt area
 * - AI progress visible as live updates inside the preview panel
 * - Voice input, AI Media panel, claim bar all work on mobile
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSpeechToText } from '../hooks/useSpeechToText';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.zapcodes.net';

const TEMPLATES = [
  { id: 'custom',     name: 'AI Custom',    icon: '✨' },
  { id: 'restaurant', name: 'Restaurant',   icon: '🍽️' },
  { id: 'ecommerce',  name: 'E-Commerce',   icon: '🛍️' },
  { id: 'portfolio',  name: 'Portfolio',    icon: '💼' },
  { id: 'blog',       name: 'Blog',         icon: '📝' },
  { id: 'saas',       name: 'SaaS',         icon: '🏢' },
  { id: 'landing',    name: 'Landing Page', icon: '🚀' },
  { id: 'dashboard',  name: 'Dashboard',    icon: '📊' },
];

const VIBE_PRESETS = [
  { id: 'professional', label: 'Professional' },
  { id: 'remove-bg',    label: 'Remove BG' },
  { id: 'luxury',       label: 'Luxury' },
  { id: 'cyberpunk',    label: 'Cyberpunk' },
  { id: 'studio',       label: 'Studio Lighting' },
  { id: 'oil-painting', label: 'Oil Painting' },
  { id: 'minimalist',   label: 'Minimalist' },
];

const BUILD_STEPS = [
  { step: 'analyzing',  msg: '🧠 Understanding what you want to build...' },
  { step: 'layout',     msg: '🎨 Choosing the perfect layout...' },
  { step: 'structure',  msg: '🏗️ Building your page structure...' },
  { step: 'hero',       msg: '✨ Designing your hero section...' },
  { step: 'images',     msg: '📸 Generating custom AI images...' },
  { step: 'content',    msg: '✍️ Writing your content...' },
  { step: 'forms',      msg: '📬 Setting up your contact form...' },
  { step: 'email',      msg: '📧 Connecting form to your email...' },
  { step: 'finalizing', msg: '🚀 Finalizing your site...' },
];

// Check if user is already logged in (has a valid token in localStorage)
function getIsLoggedIn() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return false;
    // Basic JWT expiry check (decode payload, check exp)
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp > Date.now() / 1000;
  } catch { return false; }
}

function getAuthToken() {
  try { return localStorage.getItem('token') || ''; }
  catch { return ''; }
}

function getDeviceId() {
  try {
    let id = localStorage.getItem('zc_device_id');
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      localStorage.setItem('zc_device_id', id);
    }
    return id;
  } catch { return 'unknown'; }
}

export default function GuestBuilder() {
  const [siteType,       setSiteType]       = useState('website');
  const [template,       setTemplate]       = useState('custom');
  const [projectName,    setProjectName]    = useState('');
  const [prompt,         setPrompt]         = useState('');
  const [generating,     setGenerating]     = useState(false);
  const [progressMsgs,   setProgressMsgs]   = useState([]);
  const [progressPct,    setProgressPct]    = useState(0);
  const [currentStep,    setCurrentStep]    = useState('');
  const [buildResult,    setBuildResult]    = useState(null);
  const [buildError,     setBuildError]     = useState(null);
  const [existingSite,   setExistingSite]   = useState(null);
  const [isLoggedIn,     setIsLoggedIn]     = useState(false);
  const [claiming,       setClaiming]       = useState(false);
  const [claimSuccess,   setClaimSuccess]   = useState(null);

  // Preview panel state — shown above prompt after Build is clicked
  const [showPreview,    setShowPreview]    = useState(false);
  const [previewHtml,    setPreviewHtml]    = useState('');

  // AI Media
  const [showMediaPanel,  setShowMediaPanel]  = useState(false);
  const [mediaTab,        setMediaTab]        = useState('images');
  const [imgPrompt,       setImgPrompt]       = useState('');
  const [imgAspect,       setImgAspect]       = useState('16:9');
  const [imgResults,      setImgResults]      = useState([]);
  const [imgGenerating,   setImgGenerating]   = useState(false);
  const [uploadedPhoto,   setUploadedPhoto]   = useState(null);
  const [vibePreset,      setVibePreset]      = useState('professional');
  const [vibeResult,      setVibeResult]      = useState(null);
  const [vibeGenerating,  setVibeGenerating]  = useState(false);
  const [videoPrompt,     setVideoPrompt]     = useState('');
  const [videoDuration,   setVideoDuration]   = useState(8);
  const [videoResult,     setVideoResult]     = useState(null);
  const [videoGenerating, setVideoGenerating] = useState(false);

  const photoInputRef  = useRef(null);
  const abortRef       = useRef(null);
  const progressEndRef = useRef(null);
  const iframeRef      = useRef(null);

  useEffect(() => {
    setIsLoggedIn(getIsLoggedIn());
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('zc_guest_site');
      if (saved) {
        const site = JSON.parse(saved);
        if (site.subdomain && site.expiresAt && new Date(site.expiresAt) > new Date()) {
          setExistingSite(site);
        } else {
          localStorage.removeItem('zc_guest_site');
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [progressMsgs]);

  // Voice to text
  const { isListening, isSupported: voiceSupported, toggleListening, error: voiceError } = useSpeechToText({
    onResult: (text) => setPrompt(text),
    silenceTimeoutMs: 5000,
  });

  // Claim site directly if user is already logged in
  const handleClaimLoggedIn = async () => {
    if (!buildResult?.claimCode) return;
    setClaiming(true);
    try {
      const res = await fetch(`${API_URL}/api/guest/claim-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ claimCode: buildResult.claimCode }),
      });
      const data = await res.json();
      if (data.success) {
        setClaimSuccess(data);
        try { localStorage.removeItem('zc_guest_site'); } catch {}
      } else {
        alert(data.error || 'Claim failed. Please try again.');
      }
    } catch (err) {
      alert('Claim failed: ' + err.message);
    } finally {
      setClaiming(false);
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setBuildError('Please describe what you want to build.');
      return;
    }
    setBuildError(null);
    setBuildResult(null);
    setPreviewHtml('');
    setProgressMsgs([]);
    setProgressPct(0);
    setCurrentStep('analyzing');
    setGenerating(true);
    setShowPreview(true); // ← expand preview panel immediately above prompt

    const deviceId = getDeviceId();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_URL}/api/guest/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, template, projectName, siteType, deviceId }),
        signal: controller.signal,
      });

      if (response.status === 429) {
        const data = await response.json();
        if (data.existingSite) {
          setExistingSite(data.existingSite);
          setShowPreview(false);
          try { localStorage.setItem('zc_guest_site', JSON.stringify({ ...data.existingSite, expiresAt: new Date(Date.now() + data.existingSite.daysLeft * 86400000).toISOString() })); } catch {}
        } else {
          setBuildError(data.error || 'Too many requests. Try again later.');
          setShowPreview(false);
        }
        setGenerating(false);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setBuildError(data.error || `Server error ${response.status}`);
        setShowPreview(false);
        setGenerating(false);
        return;
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
              setCurrentStep(data.step || '');
              setProgressPct(data.pct || 0);
              setProgressMsgs(p => [...p.slice(-15), { msg: data.message, pct: data.pct || 0 }]);
            } else if (data.type === 'complete') {
              setPreviewHtml(data.preview || '');
              setProgressPct(100);
              setBuildResult({ subdomain: data.subdomain, url: data.url, claimCode: data.claimCode, daysLeft: data.daysLeft });
              setProgressMsgs(p => [...p, { msg: '🎉 Your site is ready!', pct: 100 }]);
              try { localStorage.setItem('zc_guest_site', JSON.stringify({ subdomain: data.subdomain, url: data.url, claimCode: data.claimCode, daysLeft: data.daysLeft, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() })); } catch {}
            } else if (data.type === 'error') {
              setBuildError(data.error || 'Generation failed. Please try again.');
              setShowPreview(false);
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setBuildError(err.message || 'Connection failed. Please try again.');
        setShowPreview(false);
      }
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  }, [prompt, template, projectName, siteType]);

  const handleStop = () => {
    if (abortRef.current) abortRef.current.abort();
    setGenerating(false);
    setProgressMsgs(p => [...p, { msg: '⛔ Stopped.', pct: progressPct }]);
  };

  // AI Media handlers
  const handleGenerateImages = async () => {
    if (!imgPrompt.trim()) return;
    setImgGenerating(true); setImgResults([]);
    try {
      const res = await fetch(`${API_URL}/api/build/generate-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: imgPrompt, aspectRatio: imgAspect, count: 2 }) });
      if (res.status === 401) { alert('Sign up free to use AI image generation!'); return; }
      const data = await res.json();
      if (data.images?.length) setImgResults(data.images);
      else alert('Image generation failed. Please try again.');
    } catch { alert('Image generation failed.'); }
    finally { setImgGenerating(false); }
  };

  const handlePhotoUpload = (files) => {
    const file = files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { const base64 = e.target.result.split(',')[1]; setUploadedPhoto({ base64, mimeType: file.type || 'image/jpeg', preview: e.target.result }); setVibeResult(null); };
    reader.readAsDataURL(file);
  };

  const handleVibeTransform = async () => {
    if (!uploadedPhoto) return;
    setVibeGenerating(true); setVibeResult(null);
    try {
      const res = await fetch(`${API_URL}/api/build/edit-photo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: { base64: uploadedPhoto.base64, mimeType: uploadedPhoto.mimeType }, preset: vibePreset }) });
      if (res.status === 401) { alert('Sign up free to use the AI Photo Editor!'); return; }
      const data = await res.json();
      if (data.images?.length) setVibeResult(`data:${data.images[0].mimeType};base64,${data.images[0].base64}`);
      else alert('Photo transformation failed.');
    } catch { alert('Transformation failed.'); }
    finally { setVibeGenerating(false); }
  };

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) return;
    setVideoGenerating(true); setVideoResult(null);
    try {
      const res = await fetch(`${API_URL}/api/build/generate-video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: videoPrompt, durationSeconds: videoDuration, aspectRatio: '16:9' }) });
      if (res.status === 401) { alert('Sign up free to use AI video generation!'); return; }
      const data = await res.json();
      if (data.video) setVideoResult(data.video);
      else alert(data.error || 'Video generation failed.');
    } catch { alert('Video generation failed.'); }
    finally { setVideoGenerating(false); }
  };

  // Styles
  const accent = '#00E5A0';
  const bg2 = '#0D1117';
  const bg3 = '#131820';
  const border = '#1E2A36';
  const border2 = '#243040';
  const muted = '#7A8EA0';
  const muted2 = '#4A5E70';

  const inp = { width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${border2}`, background: 'rgba(255,255,255,0.03)', color: '#F0F4F8', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };
  const pill = (active) => ({ padding: '6px 14px', borderRadius: 100, border: `1px solid ${active ? accent : border}`, cursor: 'pointer', fontWeight: 600, fontSize: 13, background: active ? `rgba(0,229,160,0.08)` : 'transparent', color: active ? accent : muted, transition: 'all 0.2s', fontFamily: 'inherit', whiteSpace: 'nowrap' });
  const smallPill = (active) => ({ padding: '4px 10px', borderRadius: 100, border: `1px solid ${active ? accent : border}`, cursor: 'pointer', fontWeight: 600, fontSize: 11, background: active ? `rgba(0,229,160,0.06)` : 'transparent', color: active ? accent : muted2, transition: 'all 0.2s', fontFamily: 'inherit', whiteSpace: 'nowrap' });

  // Existing site banner
  if (existingSite && !buildResult) {
    return (
      <div style={{ width: '100%', maxWidth: 700, margin: '0 auto', padding: '0 12px', boxSizing: 'border-box' }}>
        <div style={{ background: `rgba(0,229,160,0.06)`, border: `1px solid rgba(0,229,160,0.25)`, borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>🎉</div>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: '#F0F4F8' }}>You already have a free site!</h3>
          <p style={{ color: muted, marginBottom: 16, fontSize: 14 }}>
            <a href={existingSite.url} target="_blank" rel="noreferrer" style={{ color: accent, fontWeight: 700 }}>{existingSite.url}</a>
            <br /><span style={{ color: '#FFBD2E' }}>{existingSite.daysLeft} day{existingSite.daysLeft !== 1 ? 's' : ''} left to claim</span>
          </p>
          {existingSite.claimCode && <p style={{ color: muted2, fontSize: 12, marginBottom: 20 }}>Claim code: <strong style={{ color: accent, fontFamily: 'monospace' }}>{existingSite.claimCode}</strong></p>}
          <Link to="/register" style={{ display: 'inline-block', background: accent, color: '#07090B', padding: '12px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>⚡ Register Free to Claim →</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 1000, margin: '0 auto', padding: '0 12px', boxSizing: 'border-box' }}>

      <style>{`
        @keyframes bounceDown { 0%,100%{transform:translateY(0)} 50%{transform:translateY(6px)} }
        @keyframes shimmer { from{transform:translateX(-100%)} to{transform:translateX(100%)} }
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.5);opacity:0.5} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes progressFill { from{width:0%} to{width:var(--target-pct)} }
        .gb-inp:focus { border-color: #00E5A0 !important; }
        .gb-btn-primary { background: #00E5A0; color: #07090B; width: 100%; padding: 14px; border-radius: 12px; border: none; font-size: 16px; font-weight: 800; cursor: pointer; transition: all 0.2s; font-family: inherit; letter-spacing: -0.3px; }
        .gb-btn-primary:hover { background: #00C48A; transform: translateY(-1px); }
        .gb-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
      `}</style>

      {/* Animated arrow label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, animation: 'bounceDown 1.4s ease-in-out infinite', flexShrink: 0 }}>
          {[1, 0.5, 0.2].map((op, i) => (
            <div key={i} style={{ width: 12, height: 7, borderRight: `2px solid ${accent}`, borderBottom: `2px solid ${accent}`, transform: 'rotate(45deg)', marginTop: i === 0 ? 0 : -3, opacity: op }} />
          ))}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: 0.8, textTransform: 'uppercase' }}>
          Try it free — type what you want to build
        </span>
      </div>

      {/* Builder shell */}
      <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>

        {/* Top bar */}
        <div style={{ background: bg3, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {['#FF5F56', '#FFBD2E', '#27C93F'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: muted, marginLeft: 6 }}>AI Website &amp; App Builder</span>
          </div>
          <span style={{ background: `rgba(0,229,160,0.1)`, border: `1px solid rgba(0,229,160,0.25)`, color: accent, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>
            ✦ Free — No Account Needed
          </span>
        </div>

        {/* ── PREVIEW PANEL — slides in above prompt after Build is clicked ── */}
        {showPreview && (
          <div style={{ animation: 'slideDown 0.35s ease', borderBottom: `1px solid ${border}` }}>

            {/* Preview address bar */}
            <div style={{ background: bg3, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${border}` }}>
              {['#FF5F56', '#FFBD2E', '#27C93F'].map((c, i) => <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: buildResult ? 1 : 0.4 }} />)}
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '3px 10px', fontSize: 11, color: muted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {buildResult ? `${buildResult.subdomain}.zapcodes.net` : 'building your site…'}
              </div>
              {generating && (
                <button onClick={handleStop} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>⛔ Stop</button>
              )}
            </div>

            {/* Progress feed OR live iframe */}
            {!buildResult || generating ? (
              <div style={{ background: '#07090B', minHeight: 280, display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
                {/* Skeleton preview */}
                <div style={{ flex: 1, border: `1px solid ${border}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 200 }}>
                  <div style={{ background: '#1a1f2e', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ width: 70, height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[50,44,48].map((w,i) => <div key={i} style={{ width: w, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} />)}
                    </div>
                  </div>
                  <div style={{ flex: 1, background: 'linear-gradient(180deg,#1a1f2e,#0f1520)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(0,229,160,0.04),transparent)', animation: 'shimmer 2s infinite' }} />
                    <div style={{ width: '100%', height: 70, background: 'linear-gradient(135deg,rgba(0,229,160,0.08),rgba(0,100,200,0.08))', borderRadius: 7, border: `1px dashed rgba(255,255,255,0.06)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(0,229,160,0.06),transparent)', animation: 'shimmer 2s infinite' }} />
                      Generating images with Imagen 4…
                    </div>
                    {[90,60,75].map((w,i) => <div key={i} style={{ width: `${w}%`, height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4 }} />)}
                    <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,229,160,0.15)', border: `1px solid rgba(0,229,160,0.3)`, color: accent, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 100, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 5, height: 5, background: accent, borderRadius: '50%', animation: 'pulse 1.5s infinite' }} /> Building live…
                    </div>
                  </div>
                </div>

                {/* AI progress messages */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {progressMsgs.map((m, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: i === progressMsgs.length - 1 ? '#F0F4F8' : muted2 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: i === progressMsgs.length - 1 ? accent : muted2, flexShrink: 0, marginTop: 4 }} />
                      <span>{m.msg}</span>
                    </div>
                  ))}
                  <div ref={progressEndRef} />
                </div>

                {/* Progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: muted2, marginBottom: 5 }}>
                    <span>{progressMsgs[progressMsgs.length - 1]?.msg || 'Starting…'}</span>
                    <span style={{ color: accent }}>{progressPct}%</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: accent, borderRadius: 4, width: `${progressPct}%`, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              </div>
            ) : (
              /* Live iframe preview after build completes */
              <div style={{ height: 340, position: 'relative', background: '#fff' }}>
                <iframe
                  ref={iframeRef}
                  srcDoc={previewHtml}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title="Preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            )}

            {/* Claim bar — shown after build completes */}
            {buildResult && !generating && (
              <div style={{ background: 'linear-gradient(90deg,rgba(0,229,160,0.08),rgba(0,100,200,0.06))', borderTop: `1px solid rgba(0,229,160,0.2)`, padding: '14px 16px', animation: 'slideDown 0.3s ease' }}>

                {/* Claim success state */}
                {claimSuccess ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>🎉</div>
                    <div style={{ fontSize: 14, color: '#F0F4F8', fontWeight: 700, marginBottom: 4 }}>Site claimed successfully!</div>
                    <div style={{ fontSize: 12, color: muted, marginBottom: 12 }}>
                      Now pick your permanent subdomain in your <Link to="/dashboard" style={{ color: accent, textDecoration: 'none', fontWeight: 700 }}>Dashboard →</Link>
                    </div>
                    <a href={buildResult.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 8, border: `1px solid ${border2}`, color: muted, fontSize: 12, textDecoration: 'none' }}>
                      View Preview
                    </a>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 14, color: '#F0F4F8', fontWeight: 600, marginBottom: 3 }}>
                        🎉 Live at <a href={buildResult.url} target="_blank" rel="noreferrer" style={{ color: accent, fontWeight: 800 }}>{buildResult.subdomain}.zapcodes.net</a>
                      </div>
                      <div style={{ fontSize: 12, color: muted2 }}>
                        ⏰ <strong style={{ color: '#FFBD2E' }}>{buildResult.daysLeft} days</strong> left to claim
                        {buildResult.claimCode && <> · Code: <strong style={{ color: accent, fontFamily: 'monospace' }}>{buildResult.claimCode}</strong></>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {isLoggedIn ? (
                        /* Already logged in — claim directly without re-registering */
                        <button
                          onClick={handleClaimLoggedIn}
                          disabled={claiming}
                          style={{ flex: 1, minWidth: 160, padding: '10px 16px', borderRadius: 10, background: claiming ? muted2 : accent, color: '#07090B', fontSize: 13, fontWeight: 800, border: 'none', cursor: claiming ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                        >
                          {claiming ? '⏳ Claiming...' : '⚡ Claim This Site — Add to Dashboard'}
                        </button>
                      ) : (
                        /* Not logged in — go register to claim */
                        <Link to="/register" style={{ flex: 1, minWidth: 160, display: 'block', textAlign: 'center', padding: '10px 16px', borderRadius: 10, background: accent, color: '#07090B', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
                          ⚡ Claim It Free — Register Now →
                        </Link>
                      )}
                      <a href={buildResult.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 100, display: 'block', textAlign: 'center', padding: '10px 16px', borderRadius: 10, border: `1px solid ${border2}`, color: muted, fontSize: 13, textDecoration: 'none' }}>
                        View Full Site
                      </a>
                    </div>
                    {isLoggedIn && (
                      <div style={{ marginTop: 8, fontSize: 11, color: muted2, textAlign: 'center' }}>
                        ✓ Signed in — click above to claim instantly, no re-registration needed
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── BUILDER CONTROLS (below preview when visible) ── */}
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Site type */}
          <div>
            <div style={{ fontSize: 11, color: muted2, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>What are you building?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[{ val: 'website', label: '🌐 Website' }, { val: 'mobile-app', label: '📱 Mobile App' }].map(({ val, label }) => (
                <button key={val} style={{ ...pill(siteType === val), borderRadius: 10, padding: '10px 8px', display: 'block', width: '100%' }} onClick={() => setSiteType(val)}>{label}</button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <div style={{ fontSize: 11, color: muted2, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Describe what you want</div>
            <div style={{ position: 'relative' }}>
              {voiceSupported && (
                <button onClick={toggleListening} style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', background: isListening ? 'rgba(255,80,80,0.2)' : 'rgba(0,229,160,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }} title="Tap to speak">
                  {isListening ? '🔴' : '🎙️'}
                </button>
              )}
              <textarea
                className="gb-inp"
                style={{ ...inp, minHeight: 110, resize: 'none', paddingRight: voiceSupported ? 50 : 14, lineHeight: 1.6, borderRadius: 12 }}
                placeholder="e.g. A modern restaurant website for my Filipino BBQ place with a menu, online ordering, and contact form…"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={5}
              />
            </div>
            {isListening && <div style={{ fontSize: 12, color: '#FFBD2E', marginTop: 5, textAlign: 'center' }}>🔴 Listening… (5s silence stops)</div>}
            {voiceError && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 5 }}>{voiceError}</div>}
            <p style={{ fontSize: 12, color: muted2, marginTop: 6 }}>💡 Don't worry about details — AI fills in the rest for you.</p>
          </div>

          {/* Templates */}
          <div>
            <div style={{ fontSize: 11, color: muted2, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Template</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {TEMPLATES.map(t => (
                <button key={t.id} style={smallPill(template === t.id)} onClick={() => setTemplate(t.id)}>{t.icon} {t.name}</button>
              ))}
            </div>
          </div>

          {/* AI Media toggle */}
          <button onClick={() => setShowMediaPanel(!showMediaPanel)} style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${showMediaPanel ? accent : border}`, background: showMediaPanel ? `rgba(0,229,160,0.06)` : 'transparent', color: showMediaPanel ? accent : muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{showMediaPanel ? '▼' : '▶'}</span>
            <span>🎨 AI Media (Images · Photo Editor · Video)</span>
          </button>

          {/* AI Media Panel */}
          {showMediaPanel && (
            <div style={{ border: `1px solid ${border}`, borderRadius: 12, padding: 14, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
                {[['images','🖼️ Images'],['photo','✏️ Photo'],['video','🎬 Video']].map(([id, label]) => (
                  <button key={id} style={{ ...smallPill(mediaTab === id), borderRadius: 8 }} onClick={() => setMediaTab(id)}>{label}</button>
                ))}
              </div>

              {mediaTab === 'images' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input style={{ ...inp, fontSize: 13, padding: '9px 12px', borderRadius: 10 }} placeholder="Describe the image (e.g. 'hero banner for BBQ restaurant at sunset')" value={imgPrompt} onChange={e => setImgPrompt(e.target.value)} />
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {['16:9','1:1','4:3','9:16'].map(r => <button key={r} style={smallPill(imgAspect === r)} onClick={() => setImgAspect(r)}>{r}</button>)}
                  </div>
                  <button style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={handleGenerateImages} disabled={imgGenerating}>{imgGenerating ? '⏳ Generating...' : '⚡ Generate with Imagen 4'}</button>
                  {imgResults.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {imgResults.map((img, i) => <img key={i} src={`data:${img.mimeType};base64,${img.base64}`} alt="" style={{ width: '100%', borderRadius: 7, border: `1px solid ${border}` }} />)}
                    </div>
                  )}
                </div>
              )}

              {mediaTab === 'photo' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ border: `2px dashed ${uploadedPhoto ? accent : border}`, borderRadius: 10, padding: 16, textAlign: 'center', cursor: 'pointer' }} onClick={() => photoInputRef.current?.click()}>
                    <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handlePhotoUpload(e.target.files)} />
                    {uploadedPhoto ? <img src={uploadedPhoto.preview} alt="Uploaded" style={{ width: '100%', maxHeight: 100, objectFit: 'contain', borderRadius: 5 }} /> : <><div style={{ fontSize: 22, marginBottom: 4 }}>📸</div><div style={{ fontSize: 13, color: muted }}>Tap to upload photo, logo, or product</div></>}
                  </div>
                  {uploadedPhoto && (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {VIBE_PRESETS.map(p => <button key={p.id} style={smallPill(vibePreset === p.id)} onClick={() => setVibePreset(p.id)}>{p.label}</button>)}
                      </div>
                      <button style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: '#8b5cf6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={handleVibeTransform} disabled={vibeGenerating}>{vibeGenerating ? '⏳ Transforming...' : '✨ Transform Photo'}</button>
                      {vibeResult && <img src={vibeResult} alt="Transformed" style={{ width: '100%', borderRadius: 7, border: `1px solid ${border}` }} />}
                    </>
                  )}
                </div>
              )}

              {mediaTab === 'video' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input style={{ ...inp, fontSize: 13, padding: '9px 12px', borderRadius: 10 }} placeholder="Describe the video (e.g. 'drone shot over restaurant at golden hour')" value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} />
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: muted2 }}>Duration:</span>
                    {[4,6,8].map(d => <button key={d} style={smallPill(videoDuration === d)} onClick={() => setVideoDuration(d)}>{d}s</button>)}
                  </div>
                  <button style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#0f766e,#0891b2)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={handleGenerateVideo} disabled={videoGenerating}>{videoGenerating ? '⏳ Generating... (~1-3 min)' : '🎬 Generate with Veo'}</button>
                  {videoResult && <div style={{ padding: '8px 10px', background: 'rgba(0,229,160,0.06)', borderRadius: 8, fontSize: 12, color: accent }}>✅ Video generated!</div>}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {buildError && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13 }}>
              {buildError}
            </div>
          )}

          {/* Build button */}
          {!generating ? (
            <button className="gb-btn-primary" onClick={handleGenerate} disabled={generating}>
              ⚡ Build My Site — It's Free
            </button>
          ) : (
            <button onClick={handleStop} style={{ width: '100%', padding: 14, borderRadius: 12, border: '2px solid #ef4444', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              ⛔ Stop Generation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
