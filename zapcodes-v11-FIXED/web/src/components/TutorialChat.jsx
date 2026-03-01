import React, { useState, useRef, useEffect } from 'react';
import api from '../api';

const WELCOME = `👋 Welcome to **ZapCodes Help**! I'm your AI assistant — powered by Claude Opus-level intelligence to help you build, fix, and deploy websites & mobile apps.

**What I can help with:**
• Using ZapCodes features (Build, Repair, Scan, Deploy)
• Debugging code — paste errors and I'll help fix them
• Deployment guides (Vercel, Render, Netlify, etc.)
• Security, performance, UI/UX best practices
• Architecture design, complex algorithms, any dev question

**Quick links:**
🏗️ [Build a project](/build) · 🔧 [Repair code](/dashboard) · ⚙️ [Settings](/settings) · 💎 [Pricing](/pricing)

Type your question below!`;

export default function TutorialChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: WELCOME },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [escalationCount, setEscalationCount] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      // Step 1: Try ZapCodes-specific solution first (2-3 attempts)
      const zapcodesSolution = getZapCodesSolution(msg);

      if (zapcodesSolution && escalationCount < 2) {
        setMessages(prev => [...prev, { role: 'assistant', content: zapcodesSolution }]);
        setEscalationCount(prev => prev + 1);
      } else {
        // Step 2: Escalate to full AI — build conversation history for multi-turn
        const conversationHistory = messages.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

        const { data } = await api.post('/api/files/analyze', {
          files: [{ name: 'conversation.txt', content: msg, language: 'text' }],
          prompt: `You are ZapCodes Help, an elite AI assistant (Claude Opus-level intelligence) for a platform that helps users build and fix websites & mobile apps.

CONTEXT: ZapCodes has these features:
- Build page (/build): Create projects from templates, upload files for AI analysis, import GitHub repos
- Dashboard (/dashboard): Scan repos for bugs, "Scan a File" for uploaded code analysis, auto-fix via ZapCodes AI
- Settings (/settings): GitHub token management for ZapCodes AI auto-push
- ZapCodes AI: AI bot that can auto-push code fixes to GitHub repos

PRIORITY: First try to solve using ZapCodes features. If the problem is too complex or niche, use your full AI knowledge.

CONVERSATION HISTORY:
${conversationHistory}

CURRENT QUESTION: ${msg}

Provide accurate, real solutions with step-by-step instructions. Include code examples when helpful. Be specific and practical. If relevant, link to ZapCodes features with markdown links like [Build page](/build).`,
          mode: 'build',
        });
        setMessages(prev => [...prev, { role: 'assistant', content: data.analysis || "I couldn't process that. Please try rephrasing your question." }]);
        setEscalationCount(0); // Reset after AI answer
      }
    } catch (err) {
      const fallback = getLocalAnswer(msg);
      setMessages(prev => [...prev, { role: 'assistant', content: fallback }]);
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={st.fab} title="ZapCodes Help">
        <span style={{ fontSize: '1.4rem' }}>💬</span>
      </button>
    );
  }

  return (
    <div style={st.container}>
      {/* Header */}
      <div style={st.header}>
        <div>
          <strong style={{ fontSize: '0.9rem' }}>⚡ ZapCodes Help</strong>
          <span style={{ fontSize: '0.7rem', color: '#00e5a0', marginLeft: 8 }}>AI-Powered</span>
        </div>
        <button onClick={() => setOpen(false)} style={st.closeBtn}>✕</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={st.messages}>
        {messages.map((m, i) => (
          <div key={i} style={{ ...st.msg, ...(m.role === 'user' ? st.userMsg : st.aiMsg) }}>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.83rem', lineHeight: 1.7 }}
              dangerouslySetInnerHTML={{ __html: formatMessage(m.content) }} />
          </div>
        ))}
        {loading && <div style={{ ...st.msg, ...st.aiMsg, opacity: 0.6 }}>⚡ Thinking...</div>}
      </div>

      {/* Input */}
      <div style={st.inputRow}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask anything about web/app dev..." style={st.input} onKeyDown={e => e.key === 'Enter' && send()} disabled={loading} autoFocus />
        <button onClick={send} disabled={loading || !input.trim()} style={st.sendBtn}>→</button>
      </div>
    </div>
  );
}

function formatMessage(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(0,229,160,0.1);padding:1px 5px;border-radius:3px;font-size:0.8rem">$1</code>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" style="color:#00e5a0;text-decoration:none">$1</a>')
    .replace(/\n/g, '<br/>');
}

function getZapCodesSolution(query) {
  const q = query.toLowerCase();

  if (q.includes('build') && (q.includes('website') || q.includes('app') || q.includes('project'))) {
    return `Great question! Here's how to **build a project** with ZapCodes:\n\n1. Go to the **[Build page](/build)**\n2. Choose a template (Portfolio, E-Commerce, SaaS, etc.) or import a GitHub repo\n3. Enter your project name and description\n4. Click **"Generate"** — ZapCodes AI creates all the code\n5. Download the files or use the **iteration chatbox** to refine\n\n💡 **Tip:** Pro users can build unlimited projects including Full-Stack + Mobile companions!\n\nNeed help with something specific about your build?`;
  }
  if (q.includes('fix') || q.includes('bug') || q.includes('error') || q.includes('scan')) {
    return `To **fix bugs** in your code:\n\n**Option 1: Scan a Repository**\n1. Go to **[Dashboard](/dashboard)**\n2. Paste your GitHub repo URL\n3. ZapCodes AI scans for bugs, security issues, and improvements\n4. Choose "Apply Fix" to auto-fix via GitHub, or download the fixed files\n\n**Option 2: Scan a File**\n1. On the **[Dashboard](/dashboard)**, use "Scan a File"\n2. Upload or drag-and-drop your file(s)\n3. AI analyzes and suggests fixes with severity levels\n4. Select fixes → Generate new file → Download or push to GitHub\n\n**Option 3: Build Page Chat**\n1. Upload files on **[Build](/build)**\n2. Describe what to fix in the AI chatbox\n3. AI generates improved code\n\nWhich option works best for your situation?`;
  }
  if (q.includes('deploy') || q.includes('host') || q.includes('live') || q.includes('vercel') || q.includes('render')) {
    return `Here's how to **deploy your project** and make it live:\n\n**Frontend (Vercel — free):**\n1. Push code to GitHub\n2. Go to [vercel.com](https://vercel.com) → Import project\n3. Connect your GitHub repo\n4. Vercel auto-detects the framework → Click Deploy\n5. Live URL ready in ~60 seconds!\n\n**Backend (Render — free tier):**\n1. Go to [render.com](https://render.com) → New Web Service\n2. Connect your GitHub repo\n3. Set build command: \`npm install\`\n4. Set start command: \`npm start\`\n5. Add environment variables (DB URL, API keys)\n6. Deploy!\n\n**Database (MongoDB Atlas — free):**\n1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)\n2. Create a free cluster\n3. Add your connection string to backend env vars\n\nNeed help with a specific platform?`;
  }
  if (q.includes('github') && q.includes('token')) {
    return `To connect your **GitHub token** for ZapCodes AI auto-fixes:\n\n1. Go to **[Settings](/settings)** → GitHub Integration\n2. Click the link to generate a token at GitHub\n3. Select scopes: \`repo\` and \`workflow\`\n4. Copy the token → Paste it in Settings\n5. Click "Save Token"\n6. Use "Test Connection" to verify it works!\n\n🔒 Your token is encrypted and stored securely. It's only used by ZapCodes AI to push code fixes to your repos.`;
  }
  if (q.includes('pricing') || q.includes('plan') || q.includes('upgrade') || q.includes('subscription')) {
    return `**ZapCodes Plans:**\n\n🆓 **Free** — 3 builds/mo, 5 scans/mo, basic templates\n⭐ **Starter ($9/mo)** — 25 builds, 50 scans, all templates\n🚀 **Pro ($29/mo)** — Unlimited everything, Mobile companion, priority support\n\n→ **[View Pricing](/pricing)** to upgrade\n\nAll plans include AI-powered code analysis and ZapCodes AI fixes!`;
  }

  return null; // Not a ZapCodes-specific question — escalate to AI
}

function getLocalAnswer(query) {
  return `I'm having trouble connecting to the AI right now, but here are some general tips:\n\n1. **For building:** Go to [Build](/build) to create a new project\n2. **For fixing:** Go to [Dashboard](/dashboard) to scan repos or files\n3. **For deployment:** Most projects can be deployed free on Vercel (frontend) and Render (backend)\n4. **For GitHub:** Connect your token in [Settings](/settings)\n\nTry rephrasing your question or check back in a moment!`;
}

const st = {
  fab: { position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #00e5a0, #00b880)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,229,160,0.3)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  container: { position: 'fixed', bottom: 24, right: 24, width: 380, maxWidth: 'calc(100vw - 32px)', height: 520, maxHeight: 'calc(100vh - 48px)', background: '#0a0a14', border: '1px solid #1a1a2a', borderRadius: 16, zIndex: 999, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #1a1a2a', background: '#06060b' },
  closeBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1rem', padding: '4px 8px' },
  messages: { flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  msg: { padding: '10px 14px', borderRadius: 12, maxWidth: '90%', wordBreak: 'break-word' },
  userMsg: { alignSelf: 'flex-end', background: '#00e5a0', color: '#06060b', borderBottomRightRadius: 3 },
  aiMsg: { alignSelf: 'flex-start', background: '#11111b', border: '1px solid #1a1a2a', color: '#e8e8f0', borderBottomLeftRadius: 3 },
  inputRow: { display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid #1a1a2a', background: '#06060b' },
  input: { flex: 1, background: '#11111b', border: '1px solid #2a2a3a', borderRadius: 8, padding: '10px 14px', color: '#e8e8f0', fontSize: '0.85rem', outline: 'none' },
  sendBtn: { width: 40, background: '#00e5a0', border: 'none', borderRadius: 8, color: '#06060b', fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer' },
};
