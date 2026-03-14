/**
 * GuestBuilder.jsx
 * Embedded guest builder for the landing page.
 * Mirrors the existing /build page UI — guests use the same experience without logging in.
 * Calls /api/guest/generate (SSE) — no JWT required.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  { id: 'remove-bg',    label: 'Remove Background' },
  { id: 'luxury',       label: 'Luxury Feel' },
  { id: 'cyberpunk',    label: 'Cyberpunk' },
  { id: 'studio',       label: 'Studio Lighting' },
  { id: 'oil-painting', label: 'Oil Painting' },
  { id: 'minimalist',   label: 'Minimalist Product' },
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

// Get or create a persistent device UUID
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
  const navigate = useNavigate();

  // ── Build state ───────────────────────────────────────────────────────────
  const [siteType,     setSiteType]     = useState('website');
  const [template,     setTemplate]     = useState('custom');
  const [projectName,  setProjectName]  = useState('');
  const [prompt,       setPrompt]       = useState('');
  const [generating,   setGenerating]   = useState(false);
  const [progressMsgs, setProgressMsgs] = useState([]);
  const [progressPct,  setProgressPct]  = useState(0);
  const [buildResult,  setBuildResult]  = useState(null); // { subdomain, url, claimCode, daysLeft, preview }
  const [buildError,   setBuildError]   = useState(null);
  const [existingSite, setExistingSite] = useState(null); // fingerprint already has a site

  // ── AI Media state ────────────────────────────────────────────────────────
  const [mediaTab,       setMediaTab]       = useState('images'); // 'images' | 'photo' | 'video'
  const [imgPrompt,      setImgPrompt]      = useState('');
  const [imgAspect,      setImgAspect]      = useState('16:9');
  const [imgResults,     setImgResults]     = useState([]);
  const [imgGenerating,  setImgGenerating]  = useState(false);
  const [uploadedPhoto,  setUploadedPhoto]  = useState(null); // { base64, mimeType, preview }
  const [vibePreset,     setVibePreset]     = useState('professional');
  const [vibeResult,     setVibeResult]     = useState(null);
  const [vibeGenerating, setVibeGenerating] = useState(false);
  const [videoPrompt,    setVideoPrompt]    = useState('');
  const [videoDuration,  setVideoDuration]  = useState(8);
  const [videoResult,    setVideoResult]    = useState(null);
  const [videoGenerating,setVideoGenerating]= useState(false);
  const [showMediaPanel, setShowMediaPanel] = useState(false);

  const progressEndRef = useRef(null);
  const photoInputRef  = useRef(null);
  const abortRef       = useRef(null);

  // ── Check for existing guest site on mount ────────────────────────────────
  useEffect(() => {
    const deviceId = getDeviceId();
    const ip = ''; // We can't get IP client-side; server checks by fingerprint on generate
    // Instead check via hash built client-side — we'll check on first Build click
    // For now, check localStorage for a previously returned subdomain
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

  // ── Voice to text ─────────────────────────────────────────────────────────
  const { isListening, isSupported: voiceSupported, toggleListening, error: voiceError } = useSpeechToText({
    onResult: (text, isInterim) => {
      if (!isInterim) setPrompt(text);
      else setPrompt(text); // show interim too
    },
    silenceTimeoutMs: 5000,
  });

  // ── Auto-scroll progress ──────────────────────────────────────────────────
  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [progressMsgs]);

  // ── Generate site ─────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setBuildError('Please describe what you want to build.');
      return;
    }

    setBuildError(null);
    setBuildResult(null);
    setGenerating(true);
    setProgressMsgs([{ msg: BUILD_STEPS[0].msg, pct: 5 }]);
    setProgressPct(5);
    setExistingSite(null);

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

      // Check for rate limit / existing site
      if (response.status === 429) {
        const data = await response.json();
        if (data.existingSite) {
          setExistingSite(data.existingSite);
          try { localStorage.setItem('zc_guest_site', JSON.stringify({ ...data.existingSite, expiresAt: new Date(Date.now() + data.existingSite.daysLeft * 86400000).toISOString() })); } catch {}
        } else {
          setBuildError(data.error || 'Too many requests. Try again later.');
        }
        setGenerating(false);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setBuildError(data.error || `Server error ${response.status}`);
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
              setProgressMsgs(p => [...p.slice(-12), { msg: data.message, pct: data.pct || 0 }]);
              setProgressPct(data.pct || 0);
            } else if (data.type === 'complete') {
              const siteData = {
                subdomain: data.subdomain,
                url: data.url,
                claimCode: data.claimCode,
                daysLeft: data.daysLeft,
                preview: data.preview,
              };
              setBuildResult(siteData);
              setProgressPct(100);
              setProgressMsgs(p => [...p, { msg: '🎉 Your site is ready!', pct: 100 }]);
              // Save to localStorage so we can show it on return visits
              try {
                localStorage.setItem('zc_guest_site', JSON.stringify({ ...siteData, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }));
              } catch {}
            } else if (data.type === 'error') {
              setBuildError(data.error || 'Generation failed. Please try again.');
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setBuildError(err.message || 'Connection failed. Please try again.');
      }
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  }, [prompt, template, projectName, siteType]);

  const handleStop = () => {
    if (abortRef.current) abortRef.current.abort();
    setGenerating(false);
    setProgressMsgs(p => [...p, { msg: '⛔ Generation stopped.', pct: progressPct }]);
  };

  // ── AI Image Generator ────────────────────────────────────────────────────
  const handleGenerateImages = async () => {
    if (!imgPrompt.trim()) return;
    setImgGenerating(true);
    setImgResults([]);
    try {
      const res = await fetch(`${API_URL}/api/build/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imgPrompt, aspectRatio: imgAspect, count: 2 }),
      });
      // Note: endpoint requires auth for registered users.
      // For guests, show login prompt if 401
      if (res.status === 401) {
        alert('Sign up free to use AI image generation!');
        return;
      }
      const data = await res.json();
      if (data.images?.length) setImgResults(data.images);
      else alert('Image generation failed. Please try again.');
    } catch (err) {
      alert('Image generation failed.');
    } finally {
      setImgGenerating(false);
    }
  };

  // ── Vibe Photo Editor ─────────────────────────────────────────────────────
  const handlePhotoUpload = (files) => {
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      const mimeType = file.type || 'image/jpeg';
      setUploadedPhoto({ base64, mimeType, preview: e.target.result });
      setVibeResult(null);
    };
    reader.readAsDataURL(file);
  };

  const handleVibeTransform = async () => {
    if (!uploadedPhoto) return;
    setVibeGenerating(true);
    setVibeResult(null);
    try {
      const res = await fetch(`${API_URL}/api/build/edit-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: { base64: uploadedPhoto.base64, mimeType: uploadedPhoto.mimeType }, preset: vibePreset }),
      });
      if (res.status === 401) { alert('Sign up free to use the AI Photo Editor!'); return; }
      const data = await res.json();
      if (data.images?.length) {
        setVibeResult(`data:${data.images[0].mimeType};base64,${data.images[0].base64}`);
      } else {
        alert('Photo transformation failed. Please try again.');
      }
    } catch { alert('Photo transformation failed.'); }
    finally { setVibeGenerating(false); }
  };

  // ── Video Generator ───────────────────────────────────────────────────────
  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) return;
    setVideoGenerating(true);
    setVideoResult(null);
    try {
      const res = await fetch(`${API_URL}/api/build/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: videoPrompt, durationSeconds: videoDuration, aspectRatio: '16:9' }),
      });
      if (res.status === 401) { alert('Sign up free to use AI video generation!'); return; }
      const data = await res.json();
      if (data.video) setVideoResult(data.video);
      else alert(data.error || 'Video generation failed.');
    } catch { alert('Video generation failed.'); }
    finally { setVideoGenerating(false); }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const accent = '#00E5A0';
  const bg2 = '#0D1117';
  const bg3 = '#131820';
  const border = '#1E2A36';
  const border2 = '#243040';
  const muted = '#7A8EA0';
  const muted2 = '#4A5E70';

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${border2}`, background: 'rgba(255,255,255,0.03)', color: '#F0F4F8', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s' };
  const pillStyle = (active) => ({ padding: '5px 12px', borderRadius: 100, border: `1px solid ${active ? accent : border}`, cursor: 'pointer', fontWeight: 600, fontSize: 12, background: active ? `rgba(0,229,160,0.08)` : 'transparent', color: active ? accent : muted, transition: 'all 0.2s', fontFamily: 'inherit' });
  const btnPrimary = { width: '100%', padding: 13, borderRadius: 10, background: accent, color: '#07090B', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit' };

  // ── Existing site banner ──────────────────────────────────────────────────
  if (existingSite && !buildResult) {
    return (
      <div style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ background: `rgba(0,229,160,0.06)`, border: `1px solid rgba(0,229,160,0.25)`, borderRadius: 16, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>🎉</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#F0F4F8' }}>You already have a free site!</h3>
          <p style={{ color: muted, marginBottom: 16 }}>
            <a href={existingSite.url} target="_blank" rel="noreferrer" style={{ color: accent, fontWeight: 700 }}>{existingSite.url}</a>
            {' '}— <span style={{ color: '#FFBD2E' }}>{existingSite.daysLeft} day{existingSite.daysLeft !== 1 ? 's' : ''} left to claim it</span>
          </p>
          {existingSite.claimCode && (
            <p style={{ color: muted2, fontSize: 13, marginBottom: 20 }}>
              Claim code: <strong style={{ color: accent, fontFamily: 'monospace' }}>{existingSite.claimCode}</strong>
            </p>
          )}
          <Link to="/register" style={{ ...btnPrimary, display: 'inline-block', textDecoration: 'none', padding: '12px 28px', width: 'auto' }}>
            ⚡ Register Free to Claim It →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 1000, margin: '0 auto', padding: '0 16px' }}>

      {/* Animated arrow + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, animation: 'bounceDown 1.4s ease-in-out infinite' }}>
          {[1, 0.5, 0.2].map((op, i) => (
            <div key={i} style={{ width: 14, height: 8, borderRight: `2px solid ${accent}`, borderBottom: `2px solid ${accent}`, transform: 'rotate(45deg)', marginTop: i === 0 ? 0 : -4, opacity: op }} />
          ))}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: 1, textTransform: 'uppercase' }}>
          Try it free — type what you want to build
        </span>
      </div>

      <style>{`
        @keyframes bounceDown { 0%,100%{transform:translateY(0)} 50%{transform:translateY(6px)} }
        @keyframes shimmer { from{transform:translateX(-100%)} to{transform:translateX(100%)} }
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.5);opacity:0.5} }
        .gb-textarea:focus { border-color: #00E5A0 !important; }
        .gb-pill:hover { border-color: #00E5A0 !important; color: #00E5A0 !important; }
        .gb-btn-primary:hover { background: #00C48A !important; transform: translateY(-1px); box-shadow: 0 6px 24px rgba(0,229,160,0.2); }
      `}</style>

      {/* Builder shell */}
      <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.5)' }}>
        {/* Top bar */}
        <div style={{ background: bg3, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {['#FF5F56', '#FFBD2E', '#27C93F'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: muted, marginLeft: 8 }}>AI Website &amp; App Builder</span>
          </div>
          <span style={{ background: `rgba(0,229,160,0.1)`, border: `1px solid rgba(0,229,160,0.25)`, color: accent, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100 }}>
            ✦ Free — No Account Needed
          </span>
        </div>

        {/* Main layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'clamp(280px,340px,340px) 1fr', minHeight: 540 }}>

          {/* LEFT: Controls */}
          <div style={{ borderRight: `1px solid ${border}`, display: 'flex', flexDirection: 'column', padding: 20, gap: 14, background: bg2, overflowY: 'auto' }}>

            {/* Site type */}
            <div>
              <div style={{ fontSize: 11, color: muted2, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>What are you building?</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[{ val: 'website', label: '🌐 Website' }, { val: 'mobile-app', label: '📱 Mobile App' }].map(({ val, label }) => (
                  <button key={val} className="gb-pill" style={{ ...pillStyle(siteType === val), padding: '9px 8px', borderRadius: 8 }} onClick={() => setSiteType(val)}>{label}</button>
                ))}
              </div>
            </div>

            {/* Prompt */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, color: muted2, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Describe what you want</div>
              <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Mic button inside textarea */}
                {voiceSupported && (
                  <button
                    onClick={toggleListening}
                    style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', background: isListening ? 'rgba(255,80,80,0.2)' : 'rgba(0,229,160,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, transition: 'all 0.2s' }}
                    title={isListening ? 'Stop listening (5s silence auto-stops)' : 'Click to speak your prompt'}
                  >
                    {isListening ? '🔴' : '🎙️'}
                  </button>
                )}
                <textarea
                  className="gb-textarea"
                  style={{ ...inputStyle, minHeight: 100, resize: 'none', paddingRight: voiceSupported ? 44 : 14, lineHeight: 1.6 }}
                  placeholder="e.g. A modern restaurant website for my Filipino BBQ place with a menu, online ordering, and contact form…"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={5}
                />
                {isListening && <div style={{ fontSize: 11, color: '#FFBD2E', marginTop: 4 }}>🔴 Listening… speak now (5s silence stops recording)</div>}
                {voiceError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{voiceError}</div>}
              </div>
              <p style={{ fontSize: 12, color: muted2 }}>💡 Don't worry about details — AI fills in the rest for you.</p>
            </div>

            {/* Templates */}
            <div>
              <div style={{ fontSize: 11, color: muted2, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Template</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {TEMPLATES.map(t => (
                  <button key={t.id} className="gb-pill" style={pillStyle(template === t.id)} onClick={() => setTemplate(t.id)}>{t.icon} {t.name}</button>
                ))}
              </div>
            </div>

            {/* AI Media toggle */}
            <button
              onClick={() => setShowMediaPanel(!showMediaPanel)}
              style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${showMediaPanel ? accent : border}`, background: showMediaPanel ? `rgba(0,229,160,0.06)` : 'transparent', color: showMediaPanel ? accent : muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.2s' }}
            >
              {showMediaPanel ? '▼' : '▶'} 🎨 AI Media (Images · Photo Editor · Video)
            </button>

            {/* AI Media Panel */}
            {showMediaPanel && (
              <div style={{ border: `1px solid ${border}`, borderRadius: 10, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
                {/* Media tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                  {[['images', '🖼️ Images'], ['photo', '✏️ Photo Editor'], ['video', '🎬 Video']].map(([id, label]) => (
                    <button key={id} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${mediaTab === id ? accent : border}`, background: mediaTab === id ? `rgba(0,229,160,0.08)` : 'transparent', color: mediaTab === id ? accent : muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setMediaTab(id)}>{label}</button>
                  ))}
                </div>

                {/* Images tab */}
                {mediaTab === 'images' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input style={{ ...inputStyle, fontSize: 12, padding: '8px 10px' }} placeholder="Describe the image (e.g. 'hero banner for BBQ restaurant at sunset')" value={imgPrompt} onChange={e => setImgPrompt(e.target.value)} />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['16:9', '1:1', '4:3', '9:16'].map(r => (
                        <button key={r} style={{ ...pillStyle(imgAspect === r), fontSize: 10, padding: '3px 8px' }} onClick={() => setImgAspect(r)}>{r}</button>
                      ))}
                    </div>
                    <button className="gb-btn-primary" style={{ ...btnPrimary, fontSize: 12, padding: '8px 12px' }} onClick={handleGenerateImages} disabled={imgGenerating}>
                      {imgGenerating ? '⏳ Generating...' : '⚡ Generate with Imagen 4'}
                    </button>
                    {imgResults.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {imgResults.map((img, i) => (
                          <img key={i} src={`data:${img.mimeType};base64,${img.base64}`} alt={`Generated ${i}`} style={{ width: '100%', borderRadius: 6, border: `1px solid ${border}` }} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Photo editor tab */}
                {mediaTab === 'photo' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div
                      style={{ border: `2px dashed ${uploadedPhoto ? accent : border}`, borderRadius: 8, padding: 16, textAlign: 'center', cursor: 'pointer', background: uploadedPhoto ? `rgba(0,229,160,0.04)` : 'transparent', transition: 'all 0.2s' }}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handlePhotoUpload(e.target.files)} />
                      {uploadedPhoto
                        ? <img src={uploadedPhoto.preview} alt="Uploaded" style={{ width: '100%', maxHeight: 100, objectFit: 'contain', borderRadius: 4 }} />
                        : <><div style={{ fontSize: 20, marginBottom: 4 }}>📸</div><div style={{ fontSize: 12, color: muted }}>Upload your photo, logo, or product</div></>
                      }
                    </div>
                    {uploadedPhoto && (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {VIBE_PRESETS.map(p => (
                            <button key={p.id} style={{ ...pillStyle(vibePreset === p.id), fontSize: 10, padding: '3px 8px' }} onClick={() => setVibePreset(p.id)}>{p.label}</button>
                          ))}
                        </div>
                        <button className="gb-btn-primary" style={{ ...btnPrimary, fontSize: 12, padding: '8px 12px' }} onClick={handleVibeTransform} disabled={vibeGenerating}>
                          {vibeGenerating ? '⏳ Transforming...' : '✨ Transform Photo'}
                        </button>
                        {vibeResult && <img src={vibeResult} alt="Transformed" style={{ width: '100%', borderRadius: 6, border: `1px solid ${border}` }} />}
                      </>
                    )}
                  </div>
                )}

                {/* Video tab */}
                {mediaTab === 'video' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input style={{ ...inputStyle, fontSize: 12, padding: '8px 10px' }} placeholder="Describe the video (e.g. 'drone shot over a modern BBQ restaurant at golden hour')" value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} />
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: muted2 }}>Duration:</span>
                      {[4, 6, 8].map(d => (
                        <button key={d} style={{ ...pillStyle(videoDuration === d), fontSize: 10, padding: '3px 8px' }} onClick={() => setVideoDuration(d)}>{d}s</button>
                      ))}
                    </div>
                    <button className="gb-btn-primary" style={{ ...btnPrimary, fontSize: 12, padding: '8px 12px' }} onClick={handleGenerateVideo} disabled={videoGenerating}>
                      {videoGenerating ? '⏳ Generating... (1-3 min)' : '🎬 Generate with Veo'}
                    </button>
                    {videoResult && (
                      <div style={{ background: `rgba(0,229,160,0.06)`, borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 11, color: accent, fontWeight: 600, marginBottom: 4 }}>✅ Video generated!</div>
                        <div style={{ fontSize: 11, color: muted2 }}>GCS URI: {videoResult.gcsUri}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Build / progress */}
            {!generating && !buildResult && (
              <button className="gb-btn-primary" style={btnPrimary} onClick={handleGenerate}>
                ⚡ Build My Site — It's Free
              </button>
            )}
            {generating && (
              <button onClick={handleStop} style={{ width: '100%', padding: 13, borderRadius: 10, border: '2px solid #ef4444', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                ⛔ Stop Generation
              </button>
            )}
            {buildError && (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13 }}>
                {buildError}
              </div>
            )}
          </div>

          {/* RIGHT: Live preview */}
          <div style={{ display: 'flex', flexDirection: 'column', background: '#07090B', overflow: 'hidden' }}>
            {/* Preview top bar */}
            <div style={{ background: bg3, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
              {['#FF5F56', '#FFBD2E', '#27C93F'].map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: buildResult ? 1 : 0.4 }} />)}
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: muted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {buildResult ? `${buildResult.subdomain}.zapcodes.net` : 'preview will appear here'}
              </div>
            </div>

            {/* Preview content */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 480 }}>

              {/* Default placeholder */}
              {!generating && !buildResult && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: muted2 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: `rgba(0,229,160,0.06)`, border: `1px dashed rgba(0,229,160,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🖥️</div>
                  <p style={{ fontSize: 14, textAlign: 'center', maxWidth: 220, lineHeight: 1.5, color: muted2 }}>Your live preview will appear here as AI builds your site</p>
                </div>
              )}

              {/* Progress overlay during build */}
              {generating && (
                <div style={{ position: 'absolute', inset: 0, background: '#07090B', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Animated site skeleton */}
                  <div style={{ flex: 1, border: `1px solid ${border}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ background: '#1a1f2e', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ width: 80, height: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[60, 50, 55].map((w, i) => <div key={i} style={{ width: w, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} />)}
                      </div>
                    </div>
                    <div style={{ flex: 1, background: 'linear-gradient(180deg,#1a1f2e,#0f1520)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(0,229,160,0.04),transparent)', animation: 'shimmer 2s infinite' }} />
                      <div style={{ width: '100%', height: 80, background: 'linear-gradient(135deg,rgba(0,229,160,0.08),rgba(0,100,200,0.08))', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', border: `1px dashed rgba(255,255,255,0.06)`, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(0,229,160,0.06),transparent)', animation: 'shimmer 2s infinite' }} />
                        Generating images with Imagen 4…
                      </div>
                      {[120, 80, 100].map((w, i) => (
                        <div key={i} style={{ width: w, height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 4, animation: `shimmer ${1.5 + i * 0.3}s infinite` }} />
                      ))}
                      {/* Live badge */}
                      <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,229,160,0.15)', border: `1px solid rgba(0,229,160,0.3)`, color: accent, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 100, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 5, height: 5, background: accent, borderRadius: '50%', animation: 'pulse 1.5s infinite' }} /> Building live…
                      </div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: accent, borderRadius: 4, width: `${progressPct}%`, transition: 'width 0.5s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: muted2 }}>
                    <span style={{ maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {progressMsgs[progressMsgs.length - 1]?.msg || 'Starting…'}
                    </span>
                    <span style={{ color: accent }}>{progressPct}%</span>
                  </div>
                  <div ref={progressEndRef} />
                </div>
              )}

              {/* Site preview after build */}
              {buildResult && (
                <iframe
                  srcDoc={buildResult.preview}
                  style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', inset: 0 }}
                  title="Site Preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              )}
            </div>

            {/* Claim bar (shown after build) */}
            {buildResult && (
              <div style={{ background: 'linear-gradient(90deg,rgba(0,229,160,0.08),rgba(0,100,200,0.06))', borderTop: `1px solid rgba(0,229,160,0.2)`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14, color: '#F0F4F8', fontWeight: 500, marginBottom: 2 }}>
                    🎉 Your site is live at <a href={buildResult.url} target="_blank" rel="noreferrer" style={{ color: accent, fontWeight: 700 }}>{buildResult.subdomain}.zapcodes.net</a>
                  </div>
                  <div style={{ fontSize: 12, color: muted2 }}>
                    ⏰ Expires in <strong style={{ color: '#FFBD2E' }}>{buildResult.daysLeft} days</strong>
                    {buildResult.claimCode && <> · Code: <strong style={{ color: accent, fontFamily: 'monospace' }}>{buildResult.claimCode}</strong></>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link
                    to="/register"
                    style={{ padding: '9px 20px', borderRadius: 8, background: accent, color: '#07090B', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
                  >
                    ⚡ Claim It Free — Register Now →
                  </Link>
                  <a
                    href={buildResult.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ padding: '9px 16px', borderRadius: 8, background: 'transparent', color: muted, fontSize: 13, border: `1px solid ${border2}`, textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    View Full Preview
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile responsive override */}
      <style>{`
        @media(max-width:768px){
          .gb-layout{grid-template-columns:1fr!important}
          .gb-right{min-height:300px}
        }
      `}</style>
    </div>
  );
}
