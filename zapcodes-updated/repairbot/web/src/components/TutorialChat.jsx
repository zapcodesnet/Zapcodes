import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../context/AuthContext';

const quickQuestions = [
  'How to scan a repo?',
  'What does Moltbot do?',
  'What platforms are supported?',
  'How to connect GitHub?',
];

export default function TutorialChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'bot', content: "👋 Hi! I'm the ZapCodes assistant. Ask me anything about how to use ZapCodes — scanning repos, applying fixes, pricing, and more!" },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { askTutorial } = useAuth();
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    const q = text.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const response = await askTutorial(q);
      setMessages(prev => [...prev, { role: 'bot', content: response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', content: "Sorry, I couldn't process that. Please try again!" }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* FAB button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          ...styles.fab,
          ...(open ? { background: 'var(--bg-elevated)', borderColor: 'var(--accent)' } : {}),
        }}
        title="Help & Tutorials"
      >
        {open ? '✕' : '❓'}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={styles.panel}>
          {/* Header */}
          <div style={styles.header}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>🤖 ZapCodes Help</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AI-powered tutorials</div>
            </div>
            <button onClick={() => setOpen(false)} style={styles.closeBtn}>✕</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={styles.messages}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                ...styles.message,
                ...(msg.role === 'user' ? styles.userMsg : styles.botMsg),
              }}>
                {msg.role === 'bot' ? (
                  <div style={styles.markdown}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span>{msg.content}</span>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ ...styles.message, ...styles.botMsg }}>
                <div className="flex items-center gap-1">
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Thinking...</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick questions */}
          {messages.length <= 2 && (
            <div style={styles.quickRow}>
              {quickQuestions.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  style={styles.quickBtn}
                  disabled={loading}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} style={styles.inputRow}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              style={styles.input}
              disabled={loading}
            />
            <button type="submit" style={styles.sendBtn} disabled={loading || !input.trim()}>
              →
            </button>
          </form>
        </div>
      )}
    </>
  );
}

const styles = {
  fab: {
    position: 'fixed', bottom: 24, right: 24, zIndex: 200,
    width: 56, height: 56, borderRadius: '50%',
    background: 'var(--accent)', color: '#06060b',
    border: '2px solid transparent',
    fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', boxShadow: '0 4px 20px rgba(0, 229, 160, 0.3)',
    transition: '0.2s ease',
  },
  panel: {
    position: 'fixed', bottom: 92, right: 24, zIndex: 200,
    width: 380, maxHeight: 520,
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-card)',
  },
  closeBtn: {
    background: 'none', border: 'none', color: 'var(--text-muted)',
    fontSize: '1.1rem', cursor: 'pointer',
  },
  messages: {
    flex: 1, overflowY: 'auto', padding: 16,
    display: 'flex', flexDirection: 'column', gap: 12,
    maxHeight: 320,
  },
  message: {
    maxWidth: '85%', padding: '10px 14px',
    borderRadius: 12, fontSize: '0.85rem', lineHeight: 1.6,
  },
  userMsg: {
    alignSelf: 'flex-end', background: 'var(--accent)',
    color: '#06060b', borderBottomRightRadius: 4,
  },
  botMsg: {
    alignSelf: 'flex-start', background: 'var(--bg-card)',
    border: '1px solid var(--border)', borderBottomLeftRadius: 4,
  },
  markdown: {
    fontSize: '0.85rem', lineHeight: 1.7,
  },
  quickRow: {
    display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 12px',
  },
  quickBtn: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 100, padding: '6px 12px', fontSize: '0.75rem',
    color: 'var(--text-secondary)', cursor: 'pointer',
    transition: '0.15s ease',
  },
  inputRow: {
    display: 'flex', gap: 8, padding: '12px 16px',
    borderTop: '1px solid var(--border)', background: 'var(--bg-card)',
  },
  input: {
    flex: 1, padding: '10px 14px', borderRadius: 100,
    fontSize: '0.85rem', fontFamily: 'var(--font-display)',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: '50%',
    background: 'var(--accent)', color: '#06060b',
    fontWeight: 700, fontSize: '1.1rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', border: 'none',
  },
};
