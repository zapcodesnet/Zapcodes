/**
 * GuestBuilder.jsx — Simplified for non-tech users
 * Clean: just a text box, build button, and preview
 * No confusing options — AI handles everything
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSpeechToText } from '../hooks/useSpeechToText';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.zapcodes.net';

function getIsLoggedIn() {
  try { const token = localStorage.getItem('token'); if (!token) return false; const payload = JSON.parse(atob(token.split('.')[1])); return payload.exp > Date.now() / 1000; } catch { return false; }
}
function getAuthToken() { try { return localStorage.getItem('token') || ''; } catch { return ''; } }
function getDeviceId() {
  try { let id = localStorage.getItem('zc_device_id'); if (!id) { id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); localStorage.setItem('zc_device_id', id); } return id; } catch { return 'unknown'; }
}

export default function GuestBuilder() {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [progressMsgs, setProgressMsgs] = useState([]);
  const [progressPct, setProgressPct] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [buildResult, setBuildResult] = useState(null);
  const [buildError, setBuildError] = useState(null);
  const [existingSite, setExistingSite] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  const abortRef = useRef(null);
  const progressEndRef = useRef(null);
  const iframeRef = useRef(null);

  useEffect(() => { setIsLoggedIn(getIsLoggedIn()); }, []);
  useEffect(() => { try { const saved = localStorage.getItem('zc_guest_site'); if (saved) { const site = JSON.parse(saved); if (site.subdomain && site.expiresAt && new Date(site.expiresAt) > new Date()) { setExistingSite(site); } else { localStorage.removeItem('zc_guest_site'); } } } catch {} }, []);
  useEffect(() => { progressEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [progressMsgs]);

  const { isListening, isSupported: voiceSupported, toggleListening, error: voiceError } = useSpeechToText({ onResult: (text) => setPrompt(text), silenceTimeoutMs: 5000 });

  const handleClaimLoggedIn = async () => {
    if (!buildResult?.claimCode) return;
    setClaiming(true);
    try {
      const res = await fetch(`${API_URL}/api/guest/claim-code`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` }, body: JSON.stringify({ claimCode: buildResult.claimCode }) });
      const data = await res.json();
      if (data.success) { setClaimSuccess(data); try { localStorage.removeItem('zc_guest_site'); } catch {} }
      else { alert(data.error || 'Claim failed.'); }
    } catch (err) { alert('Claim failed: ' + err.message); }
    finally { setClaiming(false); }
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { setBuildError('Please describe what you want to build.'); return; }
    setBuildError(null); setBuildResult(null); setPreviewHtml(''); setProgressMsgs([]); setProgressPct(0); setCurrentStep('analyzing'); setGenerating(true); setShowPreview(true);
    const deviceId = getDeviceId();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`${API_URL}/api/guest/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, template: 'custom', projectName: '', siteType: 'website', deviceId }), signal: controller.signal });
      if (response.status === 429) {
        const data = await response.json();
        if (data.existingSite) { setExistingSite(data.existingSite); setShowPreview(false); try { localStorage.setItem('zc_guest_site', JSON.stringify({ ...data.existingSite, expiresAt: new Date(Date.now() + data.existingSite.daysLeft * 86400000).toISOString() })); } catch {} }
        else { setBuildError(data.error || 'Too many requests.'); setShowPreview(false); }
        setGenerating(false); return;
      }
      if (!response.ok) { const data = await response.json().catch(() => ({})); setBuildError(data.error || `Server error ${response.status}`); setShowPreview(false); setGenerating(false); return; }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'progress') { setCurrentStep(data.step || ''); setProgressPct(data.pct || 0); setProgressMsgs(p => [...p.slice(-15), { msg: data.message, pct: data.pct || 0 }]); }
            else if (data.type === 'complete') { setPreviewHtml(data.preview || ''); setProgressPct(100); setBuildResult({ subdomain: data.subdomain, url: data.url, claimCode: data.claimCode, daysLeft: data.daysLeft, preview: data.preview || '' }); setProgressMsgs(p => [...p, { msg: '🎉 Your site is ready!', pct: 100 }]); try { localStorage.setItem('zc_guest_site', JSON.stringify({ subdomain: data.subdomain, url: data.url, claimCode: data.claimCode, daysLeft: data.daysLeft, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() })); } catch {} }
            else if (data.type === 'error') { setBuildError(data.error || 'Generation failed.'); setShowPreview(false); }
          } catch {}
        }
      }
    } catch (err) { if (err.name !== 'AbortError') { setBuildError(err.message || 'Connection failed.'); setShowPreview(false); } }
    finally { abortRef.current = null; setGenerating(false); }
  }, [prompt]);

  const handleStop = () => { if (abortRef.current) abortRef.current.abort(); setGenerating(false); setProgressMsgs(p => [...p, { msg: '⛔ Stopped.', pct: progressPct }]); };

  const accent = '#00E5A0';
  const bg2 = '#0D1117';
  const bg3 = '#131820';
  const border = '#1E2A36';
  const border2 = '#243040';
  const muted = '#7A8EA0';
  const muted2 = '#4A5E70';

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
        .gb-inp:focus { border-color: #00E5A0 !important; }
        .gb-btn-primary { background: #00E5A0; color: #07090B; width: 100%; padding: 14px; border-radius: 12px; border: none; font-size: 16px; font-weight: 800; cursor: pointer; transition: all 0.2s; font-family: inherit; letter-spacing: -0.3px; }
        .gb-btn-primary:hover { background: #00C48A; transform: translateY(-1px); }
        .gb-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
      `}</style>

      {/* Animated arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, animation: 'bounceDown 1.4s ease-in-out infinite', flexShrink: 0 }}>
          {[1, 0.5, 0.2].map((op, i) => (<div key={i} style={{ width: 12, height: 7, borderRight: `2px solid ${accent}`, borderBottom: `2px solid ${accent}`, transform: 'rotate(45deg)', marginTop: i === 0 ? 0 : -3, opacity: op }} />))}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: 0.8, textTransform: 'uppercase' }}>Try it free — type what you want to build</span>
      </div>

      {/* Builder shell */}
      <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>

        {/* Top bar */}
        <div style={{ background: bg3, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {['#FF5F56', '#FFBD2E', '#27C93F'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: muted, marginLeft: 6 }}>AI Website &amp; App Builder</span>
          </div>
          <span style={{ background: `rgba(0,229,160,0.1)`, border: `1px solid rgba(0,229,160,0.25)`, color: accent, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>✦ Free — No Account Needed</span>
        </div>

        {/* ── PREVIEW PANEL ── */}
        {showPreview && (
          <div style={{ animation: 'slideDown 0.35s ease', borderBottom: `1px solid ${border}` }}>
            <div style={{ background: bg3, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${border}` }}>
              {['#FF5F56', '#FFBD2E', '#27C93F'].map((c, i) => <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: buildResult ? 1 : 0.4 }} />)}
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '3px 10px', fontSize: 11, color: muted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{buildResult ? `${buildResult.subdomain}.zapcodes.net` : 'building your site…'}</div>
              {buildResult?.preview && (<button onClick={() => { const html = buildResult?.preview || previewHtml; if (!html) return; const blob = new Blob([html], { type: 'text/html; charset=utf-8' }); const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 5000); }} style={{ background: 'rgba(0,229,160,0.12)', border: `1px solid rgba(0,229,160,0.3)`, color: accent, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>⛶ Full</button>)}
              {generating && (<button onClick={handleStop} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>⛔ Stop</button>)}
            </div>

            {!buildResult || generating ? (
              <div style={{ background: '#07090B', minHeight: 280, display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
                <div style={{ flex: 1, border: `1px solid ${border}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 200 }}>
                  <div style={{ background: '#1a1f2e', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ width: 70, height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }} />
                    <div style={{ display: 'flex', gap: 6 }}>{[50,44,48].map((w,i) => <div key={i} style={{ width: w, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} />)}</div>
                  </div>
                  <div style={{ flex: 1, background: 'linear-gradient(180deg,#1a1f2e,#0f1520)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(0,229,160,0.04),transparent)', animation: 'shimmer 2s infinite' }} />
                    <div style={{ width: '100%', height: 70, background: 'linear-gradient(135deg,rgba(0,229,160,0.08),rgba(0,100,200,0.08))', borderRadius: 7, border: `1px dashed rgba(255,255,255,0.06)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(0,229,160,0.06),transparent)', animation: 'shimmer 2s infinite' }} />
                      Generating images with Imagen 4…
                    </div>
                    {[90,60,75].map((w,i) => <div key={i} style={{ width: `${w}%`, height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4 }} />)}
                    <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,229,160,0.15)', border: `1px solid rgba(0,229,160,0.3)`, color: accent, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 100, display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 5, height: 5, background: accent, borderRadius: '50%', animation: 'pulse 1.5s infinite' }} /> Building live…</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {progressMsgs.map((m, i) => (<div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: i === progressMsgs.length - 1 ? '#F0F4F8' : muted2 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: i === progressMsgs.length - 1 ? accent : muted2, flexShrink: 0, marginTop: 4 }} /><span>{m.msg}</span></div>))}
                  <div ref={progressEndRef} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: muted2, marginBottom: 5 }}><span>{progressMsgs[progressMsgs.length - 1]?.msg || 'Starting…'}</span><span style={{ color: accent }}>{progressPct}%</span></div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 4, overflow: 'hidden' }}><div style={{ height: '100%', background: accent, borderRadius: 4, width: `${progressPct}%`, transition: 'width 0.5s ease' }} /></div>
                </div>
              </div>
            ) : (
              <div style={{ height: 340, position: 'relative', background: '#fff' }}>
                <iframe ref={iframeRef} srcDoc={previewHtml} style={{ width: '100%', height: '100%', border: 'none' }} title="Preview" sandbox="allow-scripts allow-same-origin" />
              </div>
            )}

            {/* Claim bar */}
            {buildResult && !generating && (
              <div style={{ background: 'linear-gradient(90deg,rgba(0,229,160,0.08),rgba(0,100,200,0.06))', borderTop: `1px solid rgba(0,229,160,0.2)`, padding: '14px 16px', animation: 'slideDown 0.3s ease' }}>
                {claimSuccess ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>🎉</div>
                    <div style={{ fontSize: 14, color: '#F0F4F8', fontWeight: 700, marginBottom: 4 }}>Site claimed successfully!</div>
                    <div style={{ fontSize: 12, color: muted, marginBottom: 12 }}>Now pick your permanent subdomain in your <Link to="/dashboard" style={{ color: accent, textDecoration: 'none', fontWeight: 700 }}>Dashboard →</Link></div>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 14, color: '#F0F4F8', fontWeight: 600, marginBottom: 3 }}>🎉 Live at <a href={buildResult.url} target="_blank" rel="noreferrer" style={{ color: accent, fontWeight: 800 }}>{buildResult.subdomain}.zapcodes.net</a></div>
                      <div style={{ fontSize: 12, color: muted2 }}>⏰ <strong style={{ color: '#FFBD2E' }}>{buildResult.daysLeft} days</strong> left to claim{buildResult.claimCode && <> · Code: <strong style={{ color: accent, fontFamily: 'monospace' }}>{buildResult.claimCode}</strong></>}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {isLoggedIn ? (
                        <button onClick={handleClaimLoggedIn} disabled={claiming} style={{ flex: 1, minWidth: 160, padding: '10px 16px', borderRadius: 10, background: claiming ? muted2 : accent, color: '#07090B', fontSize: 13, fontWeight: 800, border: 'none', cursor: claiming ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{claiming ? '⏳ Claiming...' : '⚡ Claim This Site — Add to Dashboard'}</button>
                      ) : (
                        <Link to="/register" style={{ flex: 1, minWidth: 160, display: 'block', textAlign: 'center', padding: '10px 16px', borderRadius: 10, background: accent, color: '#07090B', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>⚡ Claim It Free — Register Now →</Link>
                      )}
                      <button onClick={() => { const html = buildResult?.preview || previewHtml; if (!html) return; const blob = new Blob([html], { type: 'text/html; charset=utf-8' }); window.open(URL.createObjectURL(blob), '_blank'); }} style={{ flex: 1, minWidth: 100, padding: '10px 16px', borderRadius: 10, border: `1px solid ${border2}`, background: 'transparent', color: muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>🔗 Full Preview</button>
                    </div>
                    {isLoggedIn && <div style={{ marginTop: 8, fontSize: 11, color: muted2, textAlign: 'center' }}>✓ Signed in — click above to claim instantly</div>}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── SIMPLE INPUT — just a text box and build button ── */}
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ position: 'relative' }}>
            {voiceSupported && (
              <button onClick={() => toggleListening(prompt)} style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', background: isListening ? 'rgba(255,80,80,0.2)' : 'rgba(0,229,160,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }} title="Tap to speak">{isListening ? '🔴' : '🎙️'}</button>
            )}
            <textarea
              className="gb-inp"
              style={{ width: '100%', padding: '14px 16px', paddingRight: voiceSupported ? 50 : 16, borderRadius: 12, border: `1.5px solid ${border2}`, background: 'rgba(255,255,255,0.03)', color: '#F0F4F8', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', minHeight: 120, resize: 'none', lineHeight: 1.6 }}
              placeholder="Describe your website or app... e.g. A modern restaurant website with menu, online ordering, and contact form"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={5}
            />
          </div>
          {isListening && <div style={{ fontSize: 12, color: '#FFBD2E', textAlign: 'center' }}>🔴 Listening… (5s silence stops)</div>}
          {voiceError && <div style={{ fontSize: 12, color: '#ef4444' }}>{voiceError}</div>}

          {buildError && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13 }}>{buildError}</div>
          )}

          {!generating ? (
            <button className="gb-btn-primary" onClick={handleGenerate} disabled={generating}>⚡ Build My Site — It's Free</button>
          ) : (
            <button onClick={handleStop} style={{ width: '100%', padding: 14, borderRadius: 12, border: '2px solid #ef4444', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>⛔ Stop Generation</button>
          )}
        </div>
      </div>
    </div>
  );
}
