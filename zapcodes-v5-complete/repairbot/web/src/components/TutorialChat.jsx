import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const quickQuestions = [
  'How to scan a repo?',
  'What does Moltbot do?',
  'What platforms are supported?',
  'How to connect GitHub?',
];

// Client-side fallback responses so help always works
function getLocalAnswer(question) {
  const q = question.toLowerCase();
  if (q.includes('scan') || q.includes('repo')) {
    return "**How to Scan a Repository**\n\n1. Go to **Dashboard**\n2. Paste your GitHub URL (e.g. `https://github.com/user/repo`)\n3. Choose an AI engine (Ollama is free)\n4. Click **Scan** — AI analyzes your code\n5. Review detected issues sorted by severity\n\n💡 Public repos work instantly. For private repos, add your GitHub token in Profile settings.";
  }
  if (q.includes('moltbot') || q.includes('fix') || q.includes('apply')) {
    return "**How Moltbot Applies Fixes**\n\n1. Click on any detected issue\n2. Review the code diff and explanation\n3. Click **\"Apply Fix via Moltbot\"**\n4. Moltbot creates a GitHub Pull Request\n5. Review the PR on GitHub and merge it!\n\n🤖 Moltbot edits the files, commits changes, and opens the PR automatically.";
  }
  if (q.includes('price') || q.includes('plan') || q.includes('cost') || q.includes('upgrade')) {
    return "**ZapCodes Plans**\n\n• **Free** — 5 scans/month, 3 fixes/month, Ollama engine\n• **Starter ($9/mo)** — 50 scans, 20 fixes, Ollama + Claude engines\n• **Pro ($29/mo)** — Unlimited scans & fixes, all engines, team features\n\nUpgrade anytime from the Pricing page!";
  }
  if (q.includes('platform') || q.includes('support') || q.includes('language')) {
    return "**Supported Platforms**\n\n• ⚛️ React Native\n• 🦋 Flutter\n• 🍎 Swift / iOS\n• 🤖 Kotlin / Android\n• ☕ Java / Android\n• 🌐 Web Apps (React, Vue, Angular, etc.)\n\nZapCodes analyzes source code files in JavaScript, TypeScript, Python, Java, Kotlin, Swift, Dart, and more.";
  }
  if (q.includes('github') || q.includes('connect') || q.includes('token')) {
    return "**Connecting GitHub**\n\n**For public repos:** Just paste the URL — no setup needed!\n\n**For private repos:**\n1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens\n2. Generate a token with `repo` scope\n3. In ZapCodes, go to Profile → paste your token\n4. Now you can scan private repos!\n\n**For OAuth login:** Click \"GitHub\" on the login page (when available).";
  }
  if (q.includes('hello') || q.includes('hi') || q.includes('hey')) {
    return "Hey there! 👋 I'm the ZapCodes assistant. I can help you with:\n\n• **Scanning repos** for bugs\n• **Applying fixes** with Moltbot\n• **Pricing & plans**\n• **Connecting GitHub**\n• **Supported platforms**\n\nJust ask me anything!";
  }
  return "**Welcome to ZapCodes!** ⚡\n\nZapCodes is an AI-powered code repair tool that scans your GitHub repos for bugs and fixes them automatically.\n\n**Quick Start:**\n1. Sign up or log in\n2. Paste a GitHub repo URL on the Dashboard\n3. AI scans and finds issues\n4. Click to apply fixes via Moltbot\n\nTry asking me: *\"How to scan a repo?\"* or *\"What does Moltbot do?\"*";
}

// Simple markdown-to-HTML renderer (no dependency needed)
function SimpleMarkdown({ children }) {
  if (!children) return null;
  const html = children
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(0,229,160,0.1);padding:2px 6px;border-radius:4px;font-size:0.8rem">$1</code>')
    .replace(/^• (.+)$/gm, '<div style="padding-left:12px">• $1</div>')
    .replace(/^\d+\. (.+)$/gm, (match, p1, offset, str) => {
      const num = str.substring(0, offset).split('\n').filter(l => /^\d+\./.test(l)).length + 1;
      return `<div style="padding-left:12px">${num}. ${p1}</div>`;
    })
    .replace(/💡|🤖|⚡|👋|⚛️|🦋|🍎|☕|🌐/g, (match) => `<span>${match}</span>`)
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function TutorialChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'bot', content: "👋 Hi! I'm the ZapCodes assistant. Ask me anything about how to use ZapCodes — scanning repos, applying fixes, pricing, and more!" },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // Try to get askTutorial from context, but don't crash if unavailable
  let askTutorial = null;
  try {
    const auth = useAuth();
    askTutorial = auth?.askTutorial;
  } catch (e) {
    // Not in AuthProvider context, use local fallback only
  }

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
      let response;
      if (askTutorial) {
        try {
          response = await askTutorial(q);
        } catch (apiErr) {
          // API failed, use local fallback
          response = getLocalAnswer(q);
        }
      } else {
        response = getLocalAnswer(q);
      }
      setMessages(prev => [...prev, { role: 'bot', content: response }]);
    } catch (err) {
      // Ultimate fallback
      setMessages(prev => [...prev, { role: 'bot', content: getLocalAnswer(q) }]);
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
          ...(open ? { background: 'var(--bg-elevated)', borderColor: 'var(--accent)', color: 'var(--accent)' } : {}),
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
                    <SimpleMarkdown>{msg.content}</SimpleMarkdown>
                  </div>
                ) : (
                  <span>{msg.content}</span>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ ...styles.message, ...styles.botMsg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
    borderRadius: 16, overflow: 'hidden',
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
