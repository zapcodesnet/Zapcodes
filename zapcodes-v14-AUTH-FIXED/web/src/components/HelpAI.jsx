import { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

// ══════════════════════════════════════════════════════════════════
// ZapCodes Help AI — Floating chat widget
// - Draggable ? icon (movable anywhere, mobile: top-right by burger)
// - Mini chat box expandable to full screen
// - Tier-based AI: Free/Bronze=Groq→Flash, Silver/Gold=Flash→Pro, Diamond=Pro→Opus
// - File upload for Bronze+ (tier-based size limits)
// - Persistent conversation memory across sessions (stored in MongoDB)
// - Admin: can select any AI model, unrestricted topics
// ══════════════════════════════════════════════════════════════════

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

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const iconRef = useRef(null);
  const dragStartTime = useRef(0);
  const dragMoved = useRef(false);

  // ── Detect mobile ──
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Fetch config ──
  useEffect(() => {
    api.get('/api/help/config').then(r => setConfig(r.data)).catch(() => {});
  }, [user?.subscription_tier]);

  // ── Load persistent history when chat opens ──
  useEffect(() => {
    if (open && !historyLoaded) {
      api.get('/api/help/history').then(r => {
        const saved = r.data.messages || [];
        if (saved.length > 0) {
          setMessages(saved.map(m => ({
            role: m.role,
            content: m.content,
            model: m.model || null,
            timestamp: m.timestamp,
          })));
        }
        setHistoryLoaded(true);
      }).catch(() => setHistoryLoaded(true));
    }
  }, [open, historyLoaded]);

  // ── Welcome message (only if no history) ──
  useEffect(() => {
    if (open && historyLoaded && messages.length === 0) {
      const name = user?.name || user?.email?.split('@')[0] || 'there';
      setMessages([{
        role: 'assistant',
        content: `Hey ${name}! 👋 I'm your ZapCodes Help AI.\n\nI can help you build websites, deploy sites, manage BL Coins, understand your subscription, and anything about ZapCodes or BlendLink.\n\nWhat can I help you with?`,
        model: config?.primaryModel || 'AI',
      }]);
    }
  }, [open, historyLoaded, messages.length]);

  // ── Auto-scroll ──
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Send message ──
  const sendMessage = useCallback(async () => {
    if (loading) return;
    if (!input.trim() && !uploadFile) return;

    const userMsg = { role: 'user', content: input, file: uploadFile?.name || null };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      const body = { message: currentInput };
      if (selectedModel && config?.isAdmin) body.model = selectedModel;
      if (uploadFile) {
        body.fileData = uploadFile.data;
        body.fileType = uploadFile.type;
        body.fileName = uploadFile.name;
      }

      const { data } = await api.post('/api/help/chat', body);
      setMessages(prev => [...prev, {
        role: 'assistant', content: data.reply, model: data.model,
      }]);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Something went wrong. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg, isError: true }]);
    } finally {
      setLoading(false);
      setUploadFile(null);
    }
  }, [input, selectedModel, config, uploadFile, loading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── File upload ──
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxSize = config?.isAdmin ? 100 * 1024 * 1024 : (config?.maxFileSize || 0);
    if (file.size > maxSize) {
      alert(`File too large. Your ${config?.tier || 'free'} plan allows up to ${config?.maxFileSizeMB || 0}MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadFile({ name: file.name, type: file.type, data: reader.result.split(',')[1] });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Clear chat history ──
  const clearHistory = async () => {
    if (!confirm('Clear all conversation history? This cannot be undone.')) return;
    try {
      await api.delete('/api/help/history');
      setMessages([]);
      setHistoryLoaded(false); // Will reload welcome on next open
    } catch {}
  };

  // ── Dragging logic ──
  const handleDragStart = (e) => {
    e.preventDefault();
    const touch = e.touches?.[0] || e;
    const rect = iconRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragOffset({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
    setDragging(true);
    dragStartTime.current = Date.now();
    dragMoved.current = false;
  };

  const handleDragMove = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();
    const touch = e.touches?.[0] || e;
    const x = Math.max(0, Math.min(window.innerWidth - 52, touch.clientX - dragOffset.x));
    const y = Math.max(0, Math.min(window.innerHeight - 52, touch.clientY - dragOffset.y));
    setIconPos({ x, y });
    dragMoved.current = true;
  }, [dragging, dragOffset]);

  const handleDragEnd = useCallback(() => {
    setDragging(false);
    // Short tap without movement = toggle chat
    if (!dragMoved.current || Date.now() - dragStartTime.current < 200) {
      setOpen(prev => !prev);
    }
  }, []);

  useEffect(() => {
    if (dragging) {
      const opts = { passive: false };
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove, opts);
      window.addEventListener('touchend', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
        window.removeEventListener('touchmove', handleDragMove);
        window.removeEventListener('touchend', handleDragEnd);
      };
    }
  }, [dragging, handleDragMove, handleDragEnd]);

  // Don't render if not logged in (must be AFTER all hooks — React Rules of Hooks)
  if (!user) return null;

  // ── Positions ──
  const defaultPos = isMobile
    ? { x: window.innerWidth - 56, y: 6 } // Mobile: top-right next to burger
    : { x: window.innerWidth - 72, y: window.innerHeight - 72 }; // Desktop: bottom-right
  const pos = iconPos || defaultPos;

  const isFullView = fullScreen || isMobile; // Mobile always full when open
  const canUpload = config?.canUpload || config?.isAdmin;

  // ── Format timestamp ──
  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 60000) return 'just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffMs < 604800000) return d.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <>
      {/* ══════════ Floating ? Icon (draggable) ══════════ */}
      {!open && (
        <div
          ref={iconRef}
          style={{
            position: 'fixed', left: pos.x, top: pos.y,
            width: 48, height: 48, borderRadius: 24,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: dragging ? 'grabbing' : 'grab',
            zIndex: 10000,
            boxShadow: '0 4px 20px rgba(99,102,241,.5)',
            transition: dragging ? 'none' : 'box-shadow .2s',
            userSelect: 'none', touchAction: 'none',
          }}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          title="ZapCodes Help AI"
        >
          <span style={{ color: '#fff', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>?</span>
          <div style={{
            position: 'absolute', inset: -4, borderRadius: 28,
            border: '2px solid rgba(99,102,241,.4)',
            animation: 'zcHelpPulse 3s infinite',
            pointerEvents: 'none',
          }} />
        </div>
      )}

      {/* ══════════ Chat Window ══════════ */}
      {open && (
        <div style={{
          position: 'fixed',
          ...(isFullView
            ? { inset: 0, borderRadius: 0 }
            : { bottom: 80, right: 20, width: 400, height: 560, borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,.6)' }
          ),
          zIndex: 10001, display: 'flex', flexDirection: 'column',
          background: '#09091a',
          border: isFullView ? 'none' : '1px solid rgba(99,102,241,.25)',
          overflow: 'hidden',
        }}>

          {/* ── Header ── */}
          <div style={{
            padding: '12px 16px',
            background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>?</span>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>ZapCodes Help AI</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.65)' }}>
                  {loading ? '● Typing...' : `Powered by ${config?.primaryModel || 'AI'}`}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {!isMobile && (
                <button onClick={() => setFullScreen(!fullScreen)} style={hBtn} title={fullScreen ? 'Minimize' : 'Full screen'}>
                  {fullScreen ? '⊡' : '⊞'}
                </button>
              )}
              <button onClick={clearHistory} style={hBtn} title="Clear history">🗑</button>
              <button onClick={() => { setOpen(false); setFullScreen(false); }} style={hBtn}>✕</button>
            </div>
          </div>

          {/* ── Admin model selector ── */}
          {config?.isAdmin && config?.availableModels && (
            <div style={{ padding: '6px 12px', background: 'rgba(99,102,241,.06)', borderBottom: '1px solid rgba(99,102,241,.15)', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 700 }}>ADMIN AI:</span>
              {config.availableModels.map(m => (
                <button key={m.id} onClick={() => setSelectedModel(m.id)} style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  border: selectedModel === m.id ? '1px solid #6366f1' : '1px solid rgba(255,255,255,.08)',
                  background: selectedModel === m.id ? 'rgba(99,102,241,.2)' : 'transparent',
                  color: selectedModel === m.id ? '#a5b4fc' : 'rgba(255,255,255,.4)',
                }}>{m.name}</button>
              ))}
            </div>
          )}

          {/* ── Messages ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Date separator if history has old messages */}
            {messages.length > 0 && messages[0].timestamp && (
              <div style={{ textAlign: 'center', padding: '4px 0', fontSize: 10, color: 'rgba(255,255,255,.2)' }}>
                Conversation history loaded • {messages.length} messages
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
                {/* AI avatar */}
                {m.role === 'assistant' && (
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>?</span>
                  </div>
                )}
                <div style={{
                  maxWidth: isFullView ? '70%' : '82%',
                  padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: m.role === 'user'
                    ? 'linear-gradient(135deg, #6366f1, #7c3aed)'
                    : m.isError ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.05)',
                  color: m.isError ? '#f87171' : '#e0e0f0',
                  fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.content}
                  {m.file && <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>📎 {m.file}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    {m.timestamp && <span style={{ fontSize: 9, color: 'rgba(255,255,255,.2)' }}>{formatTime(m.timestamp)}</span>}
                    {m.model && m.role === 'assistant' && !m.isError && (
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,.2)' }}>{m.model}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>?</span>
                </div>
                <div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: 'rgba(255,255,255,.05)' }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[0, 1, 2].map(n => (
                      <span key={n} style={{
                        width: 7, height: 7, borderRadius: 4, background: '#6366f1',
                        display: 'inline-block', animation: `zcHelpDot 1.4s infinite both`,
                        animationDelay: `${n * 0.2}s`,
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* ── File preview bar ── */}
          {uploadFile && (
            <div style={{ padding: '6px 14px', background: 'rgba(99,102,241,.08)', borderTop: '1px solid rgba(99,102,241,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 600 }}>📎 {uploadFile.name}</span>
              <button onClick={() => setUploadFile(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
            </div>
          )}

          {/* ── Input area ── */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,.06)', background: '#07071a', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
            {canUpload && (
              <>
                <button onClick={() => fileInputRef.current?.click()} style={{
                  width: 36, height: 36, borderRadius: 18, border: '1px solid rgba(255,255,255,.1)',
                  background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }} title={`Upload file (max ${config?.maxFileSizeMB || 0}MB)`}>📎</button>
                <input ref={fileInputRef} type="file" accept="image/*,.txt,.html,.css,.js,.jsx,.json,.py,.md,.csv,.pdf,.ts,.tsx" onChange={handleFileSelect} style={{ display: 'none' }} />
              </>
            )}
            <textarea
              value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={config?.isAdmin ? 'Ask anything (admin mode)...' : 'Ask about ZapCodes...'}
              rows={1}
              style={{
                flex: 1, padding: '9px 14px', borderRadius: 14,
                border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)',
                color: '#e0e0f0', fontSize: 13, fontFamily: 'inherit',
                resize: 'none', outline: 'none', maxHeight: 100, overflow: 'auto',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading || (!input.trim() && !uploadFile)}
              style={{
                width: 36, height: 36, borderRadius: 18, border: 'none',
                background: loading || (!input.trim() && !uploadFile) ? 'rgba(255,255,255,.04)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >↑</button>
          </div>

          {/* Upload notice for Free tier */}
          {!canUpload && (
            <div style={{ padding: '3px 12px 6px', background: '#07071a', fontSize: 10, color: 'rgba(255,255,255,.2)', textAlign: 'center' }}>
              📎 File upload available on Bronze+ plans
            </div>
          )}
        </div>
      )}

      {/* ── Animations ── */}
      <style>{`
        @keyframes zcHelpPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0; }
        }
        @keyframes zcHelpDot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </>
  );
}

// ── Shared styles ──
const hBtn = {
  width: 30, height: 30, borderRadius: 15, border: 'none',
  background: 'rgba(255,255,255,.12)', color: '#fff',
  cursor: 'pointer', fontSize: 14, display: 'flex',
  alignItems: 'center', justifyContent: 'center',
};
