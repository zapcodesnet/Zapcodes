import { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import api, { API_URL } from '../api';

// ══════════════════════════════════════════════════════════════
// JSZip CDN loader — loads on demand for ZIP downloads
// ══════════════════════════════════════════════════════════════
let jsZipPromise = null;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (jsZipPromise) return jsZipPromise;
  jsZipPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => { jsZipPromise = null; reject(new Error('Failed to load JSZip')); };
    document.head.appendChild(script);
  });
  return jsZipPromise;
}

// ══════════════════════════════════════════════════════════════
// SpeechRecognition browser compat
// ══════════════════════════════════════════════════════════════
const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export default function HelpAI() {
  const { user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [iconPos, setIconPos] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [imageZoom, setImageZoom] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [switchNotice, setSwitchNotice] = useState(null);
  const [copiedMsgId, setCopiedMsgId] = useState(null);

  // ── Voice feature states ──
  const [micActive, setMicActive] = useState(false);
  const [fullSttMode, setFullSttMode] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const iconRef = useRef(null);
  const dragStartTime = useRef(0);
  const dragMoved = useRef(false);
  const socketRef = useRef(null);
  const socketIdRef = useRef(null);
  const seenMsgIds = useRef(new Set());

  // ── Voice refs ──
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const inputBeforeMicRef = useRef('');
  const interimRef = useRef('');
  const ttsUtteranceRef = useRef(null);

  const SILENCE_TIMEOUT = 10000; // 10 seconds

  const addMessageIfNew = useCallback((msg) => {
    if (msg.msgId) { if (seenMsgIds.current.has(msg.msgId)) return false; seenMsgIds.current.add(msg.msgId); }
    setMessages(prev => [...prev, msg]);
    return true;
  }, []);

  // ── Check STT support on mount ──
  useEffect(() => {
    setSttSupported(!!SpeechRecognition);
  }, []);

  useEffect(() => { const c = () => setIsMobile(window.innerWidth < 768); c(); window.addEventListener('resize', c); return () => window.removeEventListener('resize', c); }, []);

  useEffect(() => {
    if (user) api.get('/api/help/config').then(r => {
      setConfig(r.data);
      if (r.data.isAdmin && r.data.defaultModel) setSelectedModel(r.data.defaultModel);
    }).catch(() => {});
  }, [user?.subscription_tier]);

  useEffect(() => {
    if (!user) return;
    let socket = null;
    import('socket.io-client').then(mod => {
      const io = mod.default || mod.io;
      socket = io(API_URL, { transports: ['websocket', 'polling'] });
      socketRef.current = socket;
      socket.on('connect', () => { socketIdRef.current = socket.id; socket.emit('join-user-room', user._id || user.id); });
      socket.on('help-ai-user-message', (msg) => {
        if (config?.isAdmin && msg.activeModel && msg.activeModel !== selectedModel) return;
        addMessageIfNew({ role: 'user', content: msg.content, msgId: msg.msgId, timestamp: msg.timestamp });
      });
      socket.on('help-ai-message', (msg) => {
        if (msg.autoSwitched && config?.isAdmin) { setSelectedModel(msg.activeModel); setMessages([]); setHistoryLoaded(false); seenMsgIds.current.clear(); return; }
        if (config?.isAdmin && msg.activeModel && msg.activeModel !== selectedModel) return;
        addMessageIfNew({ role: 'assistant', content: msg.content, model: msg.model, files: msg.files || [], images: msg.images || [], msgId: msg.msgId, timestamp: msg.timestamp });
        setLoading(false);
      });
    }).catch(() => {});
    return () => { if (socket) socket.disconnect(); socketRef.current = null; socketIdRef.current = null; };
  }, [user, addMessageIfNew, config?.isAdmin, selectedModel]);

  const loadHistory = useCallback(async (modelKey) => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const params = config?.isAdmin && modelKey ? `?model=${modelKey}` : '';
      const r = await api.get(`/api/help/history${params}`);
      const saved = r.data.messages || [];
      seenMsgIds.current.clear();
      const loaded = saved.map(m => { if (m.msgId) seenMsgIds.current.add(m.msgId); return { role: m.role, content: m.content, model: m.model || null, msgId: m.msgId || null, timestamp: m.timestamp }; });
      setMessages(loaded.length > 0 ? loaded : []);
    } catch (e) { setMessages([]); }
    setHistoryLoaded(true); setLoadingHistory(false);
  }, [user, config?.isAdmin]);

  useEffect(() => {
    if (open && !historyLoaded && user && selectedModel !== null) loadHistory(selectedModel);
  }, [open, historyLoaded, user, selectedModel, loadHistory]);

  const switchModel = useCallback((modelId) => {
    if (modelId === selectedModel) return;
    setSelectedModel(modelId);
    setMessages([]); setHistoryLoaded(false); seenMsgIds.current.clear();
    setSwitchNotice(null);
    if (open && user) loadHistory(modelId);
  }, [selectedModel, open, user, loadHistory]);

  useEffect(() => {
    if (open && historyLoaded && messages.length === 0 && user && !loadingHistory) {
      const name = user?.name || user?.email?.split('@')[0] || 'there';
      const mn = config?.isAdmin ? (config.availableModels?.find(m => m.id === selectedModel)?.name || 'AI') : (config?.primaryModel || 'AI');
      setMessages([{ role: 'assistant', content: `Hey ${name}! 👋 I'm your ZapCodes Help AI${config?.isAdmin ? ` (${mn})` : ''}.\n\nI can help you build websites, fix code, deploy sites, and answer questions about ZapCodes and BlendLink.\n\nNeed code fixed? Just tell me what's wrong — I'll return a complete file you can download.\n\n🎤 Tap the mic to talk to me!\n\nWhat can I help you with?`, model: mn }]);
    }
  }, [open, historyLoaded, messages.length, user, config, selectedModel, loadingHistory]);

  useEffect(() => { if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => { if (switchNotice) { const t = setTimeout(() => setSwitchNotice(null), 5000); return () => clearTimeout(t); } }, [switchNotice]);

  // ══════════════════════════════════════════════════════════════
  // SPEECH-TO-TEXT (STT)
  // ══════════════════════════════════════════════════════════════
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      // Silence detected — stop mic
      stopMic(true); // true = silence triggered
    }, SILENCE_TIMEOUT);
  }, []);

  const stopMic = useCallback((silenceTriggered = false) => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* already stopped */ }
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setMicActive(false);
    interimRef.current = '';

    // If Full STT Mode + silence triggered + there's text → auto-send
    if (silenceTriggered && fullSttMode) {
      // Use a small delay so the final transcript settles
      setTimeout(() => {
        setInput(prev => {
          const trimmed = prev.trim();
          if (trimmed) {
            // Trigger send programmatically
            triggerAutoSend(trimmed);
          }
          return prev;
        });
      }, 300);
    }
  }, [fullSttMode]);

  // Auto-send helper for Full STT Mode
  const autoSendRef = useRef(null);
  const triggerAutoSend = useCallback((text) => {
    if (autoSendRef.current) autoSendRef.current(text);
  }, []);

  const startMic = useCallback(() => {
    if (!SpeechRecognition) return;
    if (micActive) { stopMic(false); return; }

    // Remember what text was already in input (for continuation)
    inputBeforeMicRef.current = input;
    interimRef.current = '';

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setMicActive(true);
      resetSilenceTimer();
    };

    recognition.onresult = (event) => {
      resetSilenceTimer();

      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Build the combined text: existing text + final results so far + current interim
      if (finalTranscript) {
        // Append finalized text to the base
        const separator = inputBeforeMicRef.current && !inputBeforeMicRef.current.endsWith(' ') ? ' ' : '';
        inputBeforeMicRef.current = inputBeforeMicRef.current + separator + finalTranscript;
        interimRef.current = '';
      }

      interimRef.current = interimTranscript;

      // Update input field: base text + interim
      const separator = inputBeforeMicRef.current && interimRef.current && !inputBeforeMicRef.current.endsWith(' ') ? ' ' : '';
      setInput(inputBeforeMicRef.current + separator + interimRef.current);
    };

    recognition.onerror = (event) => {
      console.warn('[STT] Error:', event.error);
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access in your browser settings.');
      }
      stopMic(false);
    };

    recognition.onend = () => {
      // If mic should still be active (e.g., recognition auto-stopped), restart it
      // But only if we haven't manually stopped
      if (micActive && recognitionRef.current === recognition) {
        try { recognition.start(); } catch (e) { stopMic(false); }
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.error('[STT] Start error:', e);
      setMicActive(false);
    }
  }, [micActive, input, resetSilenceTimer, stopMic]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch (e) {}
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    };
  }, []);

  // ══════════════════════════════════════════════════════════════
  // TEXT-TO-SPEECH (TTS)
  // ══════════════════════════════════════════════════════════════
  const speakText = useCallback((text) => {
    if (!ttsEnabled || typeof speechSynthesis === 'undefined') return;

    // Stop any current speech
    speechSynthesis.cancel();

    // Clean text for speech: remove code blocks, file references, image tags, markdown
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code file attached.')
      .replace(/\[📄 Files? below\]/g, 'Files attached.')
      .replace(/\[GENERATE_IMAGE:[\s\S]*?\]/g, 'Image generated.')
      .replace(/[*_#`~]/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to pick a good voice
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
                      voices.find(v => v.lang.startsWith('en-US')) ||
                      voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setTtsSpeaking(true);
    utterance.onend = () => setTtsSpeaking(false);
    utterance.onerror = () => setTtsSpeaking(false);

    ttsUtteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, [ttsEnabled]);

  const stopSpeaking = useCallback(() => {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
    setTtsSpeaking(false);
  }, []);

  // Auto-speak new AI messages when TTS enabled
  useEffect(() => {
    if (!ttsEnabled || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === 'assistant' && !last.isError && last.content) {
      speakText(last.content);
    }
  }, [messages.length, ttsEnabled, speakText]);

  // ══════════════════════════════════════════════════════════════
  // SEND MESSAGE
  // ══════════════════════════════════════════════════════════════
  const sendMessage = useCallback(async (overrideText) => {
    const messageText = overrideText || input;
    if (loading || (!messageText.trim() && !uploadFile)) return;

    // Stop mic if active
    if (micActive) stopMic(false);

    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    seenMsgIds.current.add(localId);
    setMessages(prev => [...prev, { role: 'user', content: messageText, file: uploadFile?.name || null, msgId: localId }]);
    const currentInput = messageText;
    setInput(''); setLoading(true); setSwitchNotice(null);
    inputBeforeMicRef.current = '';
    interimRef.current = '';
    try {
      const body = { message: currentInput };
      if (selectedModel) body.model = selectedModel;
      if (uploadFile) { body.fileData = uploadFile.data; body.fileType = uploadFile.type; body.fileName = uploadFile.name; }
      if (socketIdRef.current) body.socketId = socketIdRef.current;
      const { data } = await api.post('/api/help/chat', body);
      if (data.userMsgId) seenMsgIds.current.add(data.userMsgId);
      if (data.assistantMsgId) seenMsgIds.current.add(data.assistantMsgId);
      setMessages(prev => { const updated = [...prev]; const idx = updated.findLastIndex(m => m.msgId === localId); if (idx !== -1 && data.userMsgId) updated[idx] = { ...updated[idx], msgId: data.userMsgId }; return updated; });
      if (data.autoSwitched) {
        if (config?.isAdmin) { const newModel = data.activeModel; const newModelName = config.availableModels?.find(m => m.id === newModel)?.name || newModel; const oldModelName = config.availableModels?.find(m => m.id === data.switchedFrom)?.name || data.switchedFrom; setSwitchNotice(`${oldModelName} unavailable — switched to ${newModelName}`); setSelectedModel(newModel); seenMsgIds.current.clear(); setHistoryLoaded(false); setTimeout(() => loadHistory(newModel), 100); }
        else { setSwitchNotice(data.switchReason || 'Switched to backup AI'); setMessages(prev => [...prev, { role: 'assistant', content: data.reply, model: data.model, files: data.files || [], images: data.images || [], msgId: data.assistantMsgId }]); }
      } else { setMessages(prev => [...prev, { role: 'assistant', content: data.reply, model: data.model, files: data.files || [], images: data.images || [], msgId: data.assistantMsgId }]); }
    } catch (err) { setMessages(prev => [...prev, { role: 'assistant', content: err.response?.data?.error || 'Something went wrong.', isError: true }]); }
    finally { setLoading(false); setUploadFile(null); }
  }, [input, selectedModel, uploadFile, loading, config, loadHistory, micActive, stopMic]);

  // Auto-send ref for Full STT Mode
  useEffect(() => {
    autoSendRef.current = (text) => {
      if (text && text.trim() && !loading) {
        sendMessage(text.trim());
      }
    };
  }, [sendMessage, loading]);

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const handleFileSelect = (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > (config?.maxFileSize || 0)) { alert(`File too large. Max ${config?.maxFileSizeMB || 0}MB.`); return; } const reader = new FileReader(); reader.onload = () => setUploadFile({ name: file.name, type: file.type, data: reader.result.split(',')[1] }); reader.readAsDataURL(file); e.target.value = ''; };

  // ══════════════════════════════════════════════════════════════
  // FILE DOWNLOADS — Single files + ZIP for multiple
  // ══════════════════════════════════════════════════════════════
  const downloadFile = (f) => { const b = new Blob([f.content], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = f.name; a.click(); URL.revokeObjectURL(u); };

  const downloadAllFilesAsZip = async (files) => {
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();

      // Group files into folders by directory path if they have paths
      files.forEach(f => {
        // If filename has a path separator, create folder structure
        zip.file(f.name, f.content);
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zapcodes-files.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[ZIP] Error creating zip:', err);
      // Fallback: download files individually
      files.forEach(f => downloadFile(f));
    }
  };

  const copyFile = (f) => navigator.clipboard.writeText(f.content);
  const copyMessage = (text, msgId) => { navigator.clipboard.writeText(text).then(() => { setCopiedMsgId(msgId || 'temp'); setTimeout(() => setCopiedMsgId(null), 1500); }).catch(() => {}); };

  const retryMessage = useCallback(async () => {
    if (loading) return;
    const lastUserIdx = messages.findLastIndex(m => m.role === 'user');
    if (lastUserIdx === -1) return;
    const retryContent = messages[lastUserIdx].content;
    setMessages(prev => prev.slice(0, lastUserIdx));
    setLoading(true); setSwitchNotice(null);
    const localId = `retry-${Date.now()}`;
    seenMsgIds.current.add(localId);
    setMessages(prev => [...prev, { role: 'user', content: retryContent, msgId: localId }]);
    try {
      const body = { message: retryContent };
      if (selectedModel) body.model = selectedModel;
      if (socketIdRef.current) body.socketId = socketIdRef.current;
      const { data } = await api.post('/api/help/chat', body);
      if (data.userMsgId) seenMsgIds.current.add(data.userMsgId);
      if (data.assistantMsgId) seenMsgIds.current.add(data.assistantMsgId);
      setMessages(prev => { const updated = [...prev]; const idx = updated.findLastIndex(m => m.msgId === localId); if (idx !== -1 && data.userMsgId) updated[idx] = { ...updated[idx], msgId: data.userMsgId }; return [...updated, { role: 'assistant', content: data.reply, model: data.model, files: data.files || [], images: data.images || [], msgId: data.assistantMsgId }]; });
      if (data.autoSwitched) setSwitchNotice(data.switchReason || 'Switched to backup AI');
    } catch (err) { setMessages(prev => [...prev, { role: 'assistant', content: err.response?.data?.error || 'Something went wrong.', isError: true }]); }
    finally { setLoading(false); }
  }, [messages, loading, selectedModel]);

  const downloadImage = (img, idx) => { try { const ext = (img.mimeType || 'image/png').split('/')[1] || 'png'; const b = atob(img.base64); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); const bl = new Blob([a], { type: img.mimeType || 'image/png' }); const u = URL.createObjectURL(bl); const el = document.createElement('a'); el.href = u; el.download = `zapcodes-ai-image-${idx + 1}.${ext}`; el.click(); URL.revokeObjectURL(u); } catch (e) {} };
  const clearHistory = async () => { const mn = config?.isAdmin ? (config.availableModels?.find(m => m.id === selectedModel)?.name || selectedModel) : 'all'; if (!confirm(`Clear ${config?.isAdmin ? mn : 'all'} conversation history?`)) return; try { await api.delete(`/api/help/history${config?.isAdmin ? `?model=${selectedModel}` : ''}`); setMessages([]); setHistoryLoaded(false); seenMsgIds.current.clear(); } catch (e) {} };

  const handleDragStart = (e) => { e.preventDefault(); const t = e.touches?.[0] || e; const r = iconRef.current?.getBoundingClientRect(); if (!r) return; setDragOffset({ x: t.clientX - r.left, y: t.clientY - r.top }); setDragging(true); dragStartTime.current = Date.now(); dragMoved.current = false; };
  const handleDragMove = useCallback((e) => { if (!dragging) return; e.preventDefault(); const t = e.touches?.[0] || e; setIconPos({ x: Math.max(0, Math.min(window.innerWidth - 52, t.clientX - dragOffset.x)), y: Math.max(0, Math.min(window.innerHeight - 52, t.clientY - dragOffset.y)) }); dragMoved.current = true; }, [dragging, dragOffset]);
  const handleDragEnd = useCallback(() => { setDragging(false); if (!dragMoved.current || Date.now() - dragStartTime.current < 200) setOpen(prev => !prev); }, []);
  useEffect(() => { if (dragging) { const o = { passive: false }; window.addEventListener('mousemove', handleDragMove); window.addEventListener('mouseup', handleDragEnd); window.addEventListener('touchmove', handleDragMove, o); window.addEventListener('touchend', handleDragEnd); return () => { window.removeEventListener('mousemove', handleDragMove); window.removeEventListener('mouseup', handleDragEnd); window.removeEventListener('touchmove', handleDragMove); window.removeEventListener('touchend', handleDragEnd); }; } }, [dragging, handleDragMove, handleDragEnd]);

  if (!user) return null;
  const defaultPos = isMobile ? { x: window.innerWidth - 58, y: 60 } : { x: window.innerWidth - 72, y: 8 };
  const pos = iconPos || defaultPos;
  const isFullView = fullScreen || isMobile;
  const canUpload = config?.canUpload;
  const activeName = config?.isAdmin ? (config.availableModels?.find(m => m.id === selectedModel)?.name || 'AI') : (config?.primaryModel || 'AI');

  return (
    <>
      {!open && (
        <div ref={iconRef} style={{ position: 'fixed', left: pos.x, top: pos.y, width: 48, height: 48, borderRadius: 24, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: dragging ? 'grabbing' : 'grab', zIndex: 10000, boxShadow: '0 4px 20px rgba(99,102,241,.5)', transition: dragging ? 'none' : 'box-shadow .2s', userSelect: 'none', touchAction: 'none' }} onMouseDown={handleDragStart} onTouchStart={handleDragStart} title="ZapCodes Help AI">
          <span style={{ color: '#fff', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>?</span>
          <div style={{ position: 'absolute', inset: -4, borderRadius: 28, border: '2px solid rgba(99,102,241,.4)', animation: 'zcPulse 3s infinite', pointerEvents: 'none' }} />
        </div>
      )}

      {open && (
        <div style={{ position: 'fixed', ...(isFullView ? { inset: 0, borderRadius: 0 } : { bottom: 80, right: 20, width: 420, height: 600, borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,.6)' }), zIndex: 10001, display: 'flex', flexDirection: 'column', background: '#09091a', border: isFullView ? 'none' : '1px solid rgba(99,102,241,.25)', overflow: 'hidden' }}>

          {/* ── Header ── */}
          <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, #6366f1, #7c3aed)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>?</span></div>
              <div><div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>ZapCodes Help AI</div><div style={{ fontSize: 10, color: 'rgba(255,255,255,.65)' }}>{loading ? '● Typing...' : `Powered by ${activeName}`}</div></div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {/* TTS Toggle */}
              <button
                onClick={() => { if (ttsEnabled) { stopSpeaking(); setTtsEnabled(false); } else { setTtsEnabled(true); } }}
                style={{ ...hBtn, background: ttsEnabled ? 'rgba(34,197,94,.35)' : 'rgba(255,255,255,.12)', position: 'relative' }}
                title={ttsEnabled ? 'Voice responses ON — click to disable' : 'Enable voice responses'}
              >
                {ttsEnabled ? '🔊' : '🔇'}
                {ttsSpeaking && <div style={{ position: 'absolute', inset: -2, borderRadius: 17, border: '2px solid #22c55e', animation: 'zcPulse 1.5s infinite', pointerEvents: 'none' }} />}
              </button>
              {/* Full STT Mode Toggle */}
              {sttSupported && (
                <button
                  onClick={() => setFullSttMode(prev => !prev)}
                  style={{ ...hBtn, background: fullSttMode ? 'rgba(239,68,68,.35)' : 'rgba(255,255,255,.12)', fontSize: 10, fontWeight: 700 }}
                  title={fullSttMode ? 'Full Voice Mode ON — auto-sends after silence' : 'Enable Full Voice Mode (auto-send)'}
                >
                  {fullSttMode ? '🗣️' : 'STT'}
                </button>
              )}
              {!isMobile && <button onClick={() => setFullScreen(!fullScreen)} style={hBtn}>{fullScreen ? '⊡' : '⊞'}</button>}
              <button onClick={clearHistory} style={hBtn} title={`Clear ${activeName} history`}>🗑</button>
              <button onClick={() => { setOpen(false); setFullScreen(false); stopSpeaking(); if (micActive) stopMic(false); }} style={hBtn}>✕</button>
            </div>
          </div>

          {/* ── Full STT Mode banner ── */}
          {fullSttMode && (
            <div style={{ padding: '4px 12px', background: 'rgba(239,68,68,.1)', borderBottom: '1px solid rgba(239,68,68,.2)', fontSize: 10, color: '#f87171', textAlign: 'center', fontWeight: 600 }}>
              🗣️ Full Voice Mode — Speak freely, message auto-sends after 10s silence
            </div>
          )}

          {/* ── Admin model selector ── */}
          {config?.isAdmin && config?.availableModels && (
            <div style={{ padding: '6px 12px', background: 'rgba(99,102,241,.06)', borderBottom: '1px solid rgba(99,102,241,.15)', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 700 }}>AI:</span>
              {config.availableModels.map(m => (<button key={m.id} onClick={() => switchModel(m.id)} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: selectedModel === m.id ? '1px solid #6366f1' : '1px solid rgba(255,255,255,.08)', background: selectedModel === m.id ? 'rgba(99,102,241,.2)' : 'transparent', color: selectedModel === m.id ? '#a5b4fc' : 'rgba(255,255,255,.4)', transition: 'all .15s' }}>{m.name}</button>))}
            </div>
          )}

          {switchNotice && (<div style={{ padding: '6px 12px', background: 'rgba(234,179,8,.1)', borderBottom: '1px solid rgba(234,179,8,.2)', fontSize: 11, color: '#eab308', textAlign: 'center', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>⚡ {switchNotice}</span><button onClick={() => setSwitchNotice(null)} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button></div>)}

          {/* ── Messages area ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadingHistory && <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'rgba(255,255,255,.3)' }}>Loading {activeName} conversation...</div>}
            {!loadingHistory && messages.length > 0 && messages[0].timestamp && <div style={{ textAlign: 'center', padding: '4px 0', fontSize: 10, color: 'rgba(255,255,255,.2)' }}>{activeName} • {messages.length} messages</div>}

            {messages.map((m, i) => (
              <div key={m.msgId || `msg-${i}`}>
                <div style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
                  {m.role === 'assistant' && <div style={{ width: 28, height: 28, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>?</span></div>}
                  <div style={{ maxWidth: isFullView ? '70%' : '82%', padding: '10px 14px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: m.role === 'user' ? 'linear-gradient(135deg, #6366f1, #7c3aed)' : m.isError ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.05)', color: m.isError ? '#f87171' : '#e0e0f0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.content}
                    {m.file && <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>📎 {m.file}</div>}
                    {m.model && m.role === 'assistant' && !m.isError && <div style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', marginTop: 4, textAlign: 'right' }}>{m.model}</div>}
                  </div>
                </div>
                {/* ── Message action buttons ── */}
                <div style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginLeft: m.role === 'assistant' ? 36 : 0, marginTop: 2, gap: 4, opacity: 0.35 }} className="zcMsgActions" onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.35'}>
                  <button onClick={() => copyMessage(m.content, m.msgId || `msg-${i}`)} title="Copy message" style={tinyBtn}>{copiedMsgId === (m.msgId || `msg-${i}`) ? '\u2713' : '\ud83d\udccb'}</button>
                  {/* Per-message TTS play button */}
                  {m.role === 'assistant' && !m.isError && (
                    <button onClick={() => speakText(m.content)} title="Read aloud" style={tinyBtn}>🔊</button>
                  )}
                  {m.role === 'user' && i === messages.findLastIndex(x => x.role === 'user') && <button onClick={retryMessage} title="Retry this message" style={tinyBtn}>{'\u21bb'}</button>}
                  {m.isError && <button onClick={retryMessage} title="Retry" style={{ ...tinyBtn, color: '#f87171' }}>{'\u21bb'}</button>}
                </div>
                {/* ── Images ── */}
                {m.images?.length > 0 && (<div style={{ marginLeft: 36, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>{m.images.map((img, ii) => (<div key={ii} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(99,102,241,.25)', background: '#0a0a1a', maxWidth: isFullView ? '70%' : '82%' }}><img src={`data:${img.mimeType || 'image/png'};base64,${img.base64}`} alt={img.prompt || 'AI generated'} style={{ width: '100%', display: 'block', cursor: 'pointer', borderRadius: 12 }} onClick={() => setImageZoom(img)} /><div style={{ display: 'flex', gap: 4, padding: '6px 8px', background: 'rgba(0,0,0,.5)', position: 'absolute', bottom: 0, right: 0, borderTopLeftRadius: 10 }}><button onClick={() => downloadImage(img, ii)} style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>⬇ Save</button></div></div>))}</div>)}
                {/* ── Code files — ZIP download for multiple ── */}
                {m.files?.length > 0 && (<div style={{ marginLeft: 36, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {m.files.length > 1 && (
                    <button onClick={() => downloadAllFilesAsZip(m.files)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,.3)', background: 'rgba(34,197,94,.08)', color: '#22c55e', cursor: 'pointer', fontSize: 11, fontWeight: 700, alignSelf: 'flex-start' }}>
                      📦 Download ZIP ({m.files.length} files)
                    </button>
                  )}
                  {m.files.map((f, fi) => (<div key={fi} style={{ background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)', borderRadius: 10, overflow: 'hidden' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid rgba(99,102,241,.15)' }}><span style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc' }}>📄 {f.name}</span><div style={{ display: 'flex', gap: 4 }}><button onClick={() => copyFile(f)} style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: 'rgba(99,102,241,.2)', color: '#a5b4fc', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>📋 Copy</button><button onClick={() => downloadFile(f)} style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>⬇ Download</button></div></div><pre style={{ margin: 0, padding: 8, fontSize: 10, lineHeight: 1.4, color: '#c0c0d0', background: '#0a0a1a', maxHeight: 150, overflowY: 'auto', fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{f.content.slice(0, 2000)}{f.content.length > 2000 ? `\n\n... (${Math.round(f.content.length / 1000)}K chars — download for full file)` : ''}</pre></div>))}
                </div>)}
              </div>
            ))}
            {loading && (<div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><div style={{ width: 28, height: 28, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>?</span></div><div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: 'rgba(255,255,255,.05)' }}><div style={{ display: 'flex', gap: 5 }}>{[0, 1, 2].map(n => <span key={n} style={{ width: 7, height: 7, borderRadius: 4, background: '#6366f1', display: 'inline-block', animation: 'zcDot 1.4s infinite both', animationDelay: `${n * 0.2}s` }} />)}</div></div></div>)}
            <div ref={chatEndRef} />
          </div>

          {/* ── Upload file indicator ── */}
          {uploadFile && (<div style={{ padding: '6px 14px', background: 'rgba(99,102,241,.08)', borderTop: '1px solid rgba(99,102,241,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 600 }}>📎 {uploadFile.name}</span><button onClick={() => setUploadFile(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button></div>)}

          {/* ── Input area with mic button ── */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,.06)', background: '#07071a', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
            {canUpload && (<><button onClick={() => fileInputRef.current?.click()} style={{ width: 36, height: 36, borderRadius: 18, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📎</button><input ref={fileInputRef} type="file" accept="image/*,.txt,.html,.css,.js,.jsx,.json,.py,.md,.csv,.pdf,.ts,.tsx" onChange={handleFileSelect} style={{ display: 'none' }} /></>)}

            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={config?.isAdmin ? `Ask ${activeName}...` : 'Ask about ZapCodes...'} rows={4} style={{ flex: 1, padding: '9px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,.08)', background: micActive ? 'rgba(239,68,68,.05)' : 'rgba(255,255,255,.03)', color: '#e0e0f0', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', minHeight: 80, maxHeight: 200, overflow: 'auto', lineHeight: 1.5, transition: 'background .2s' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              {/* Mic button */}
              {sttSupported && (
                <button
                  onClick={startMic}
                  style={{
                    width: 36, height: 36, borderRadius: 18, border: 'none',
                    background: micActive
                      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                      : 'linear-gradient(135deg, #374151, #4b5563)',
                    color: '#fff', cursor: 'pointer', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                    transition: 'all .2s',
                  }}
                  title={micActive ? 'Stop listening' : 'Start voice input'}
                >
                  🎤
                  {micActive && <div style={{ position: 'absolute', inset: -3, borderRadius: 21, border: '2px solid rgba(239,68,68,.6)', animation: 'zcPulse 1.5s infinite', pointerEvents: 'none' }} />}
                </button>
              )}

              {/* Send button */}
              <button onClick={() => sendMessage()} disabled={loading || (!input.trim() && !uploadFile)} style={{ width: 36, height: 36, borderRadius: 18, border: 'none', background: loading || (!input.trim() && !uploadFile) ? 'rgba(255,255,255,.04)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↑</button>
            </div>
          </div>

          {/* ── Mic status indicator ── */}
          {micActive && (
            <div style={{ padding: '3px 12px 6px', background: '#07071a', fontSize: 10, color: '#ef4444', textAlign: 'center', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: '#ef4444', display: 'inline-block', animation: 'zcDot 1s infinite' }} />
              Listening... {fullSttMode ? '(auto-send on silence)' : '(stops after 10s silence)'}
            </div>
          )}

          {!canUpload && !micActive && <div style={{ padding: '3px 12px 6px', background: '#07071a', fontSize: 10, color: 'rgba(255,255,255,.2)', textAlign: 'center' }}>📎 File upload available on Bronze+ plans</div>}
        </div>
      )}

      {/* ── Image zoom overlay ── */}
      {imageZoom && (<div onClick={() => setImageZoom(null)} style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 20 }}><img src={`data:${imageZoom.mimeType || 'image/png'};base64,${imageZoom.base64}`} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.8)' }} onClick={e => e.stopPropagation()} /><div style={{ display: 'flex', gap: 10, marginTop: 16 }} onClick={e => e.stopPropagation()}><button onClick={() => downloadImage(imageZoom, 0)} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>⬇ Download</button><button onClick={() => setImageZoom(null)} style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>✕ Close</button></div></div>)}

      <style>{`
        @keyframes zcPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 0; } }
        @keyframes zcDot { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.1); } }
      `}</style>
    </>
  );
}

const hBtn = { width: 30, height: 30, borderRadius: 15, border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const tinyBtn = { width: 22, height: 22, borderRadius: 11, border: 'none', background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1, transition: 'background .15s, color .15s' };
