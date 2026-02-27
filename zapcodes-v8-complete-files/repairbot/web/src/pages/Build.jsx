import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const colorSchemes = [
  { id: 'modern', name: 'Modern Purple', color: '#6366f1' },
  { id: 'green', name: 'ZapCodes Green', color: '#00e5a0' },
  { id: 'blue', name: 'Ocean Blue', color: '#3b82f6' },
  { id: 'purple', name: 'Deep Purple', color: '#a855f7' },
  { id: 'orange', name: 'Sunset Orange', color: '#f97316' },
  { id: 'red', name: 'Bold Red', color: '#ef4444' },
  { id: 'clean', name: 'Clean Light', color: '#2563eb' },
];

const freeTemplates = ['portfolio', 'landing', 'blog'];

export default function Build() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [colorScheme, setColorScheme] = useState('modern');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const userPlan = user?.plan || 'free';
  const buildsUsed = user?.buildsUsed || 0;
  const buildsLimit = userPlan === 'pro' ? '∞' : userPlan === 'starter' ? 25 : 3;

  useEffect(() => {
    api.get('/build/templates').then(({ data }) => {
      setTemplates(data.templates);
    }).catch(() => {
      // Fallback templates
      setTemplates({
        portfolio: { name: 'Portfolio / Personal Site', icon: '🎨', description: 'A beautiful personal portfolio', tech: 'HTML + CSS + JS' },
        landing: { name: 'Business Landing Page', icon: '🚀', description: 'Professional landing page', tech: 'HTML + CSS + JS' },
        blog: { name: 'Blog / Content Site', icon: '📝', description: 'Clean blog with posts', tech: 'HTML + CSS + JS' },
        ecommerce: { name: 'E-Commerce Store', icon: '🛒', description: 'Online store', tech: 'React + Vite' },
        dashboard: { name: 'Admin Dashboard', icon: '📊', description: 'Data dashboard', tech: 'React + Vite' },
        mobile: { name: 'Mobile App', icon: '📱', description: 'iOS & Android app', tech: 'React Native + Expo' },
        webapp: { name: 'Full-Stack Web App', icon: '⚡', description: 'Frontend + Backend + DB', tech: 'React + Node.js' },
        saas: { name: 'SaaS Starter', icon: '💎', description: 'Auth + Payments + Dashboard', tech: 'React + Node + Stripe' },
      });
    });
  }, []);

  const handleGenerate = async () => {
    if (!selectedTemplate || !projectName) return;
    setLoading(true);
    try {
      const { data } = await api.post('/build/generate', {
        template: selectedTemplate,
        projectName,
        description,
        colorScheme,
      });
      setResult(data);
      setStep(4);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Generation failed. Please try again.';
      const errDetail = err.response?.data?.message || '';
      if (err.response?.status === 403) {
        setStep(1);
        setError(errDetail || errMsg);
      } else {
        alert(errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadProject = () => {
    if (!result) return;
    // Create a zip-like download with all files
    const content = result.files.map(f =>
      `========== ${f.path} ==========\n${f.content}`
    ).join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.projectName}-zapcodes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadFile = (file) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Nav */}
      <nav style={styles.nav}>
        <div className="container flex items-center justify-between" style={{ height: 72 }}>
          <Link to="/" className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <span style={{ fontSize: '1.5rem' }}>⚡</span>
            <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>ZapCodes</span>
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/dashboard" className="btn btn-ghost">Dashboard</Link>
            ) : (
              <Link to="/register" className="btn btn-primary">Get Started Free</Link>
            )}
          </div>
        </div>
      </nav>

      <section style={{ paddingTop: 120, paddingBottom: 80, minHeight: '100vh' }}>
        <div className="container" style={{ maxWidth: 900 }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <span style={styles.badge}>🏗️ AI Website & App Builder</span>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginTop: 16, marginBottom: 12 }}>
              Build Your Project
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
              Choose a template, customize it, and get deployment-ready code in seconds.
              <br />You control 100% of your code and privacy.
            </p>
          </div>

          {/* Progress bar */}
          <div style={styles.progressBar}>
            {[1, 2, 3, 4].map(s => (
              <div key={s} style={{ ...styles.progressStep, ...(step >= s ? styles.progressActive : {}) }}>
                <div style={{ ...styles.progressDot, ...(step >= s ? styles.progressDotActive : {}) }}>{s}</div>
                <span style={{ fontSize: '0.75rem', marginTop: 4 }}>
                  {s === 1 ? 'Template' : s === 2 ? 'Details' : s === 3 ? 'Style' : 'Download'}
                </span>
              </div>
            ))}
          </div>

          {/* Step 1: Choose Template */}
          {step === 1 && (
            <div>
              <h2 style={styles.stepTitle}>What do you want to build?</h2>
              {user && (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 24 }}>
                  Builds used: <strong style={{ color: 'var(--accent)' }}>{buildsUsed}</strong> / {buildsLimit} this month
                  {userPlan === 'free' && <span> · <Link to="/pricing" style={{ color: 'var(--accent)' }}>Upgrade for more</Link></span>}
                </p>
              )}
              {error && <div style={{ background: 'rgba(255,68,102,0.1)', border: '1px solid rgba(255,68,102,0.3)', borderRadius: 10, padding: 12, color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 16, textAlign: 'center' }}>{error}</div>}

              {/* GitHub Import Section */}
              <RepoImport />

              {/* File Upload + AI Analysis */}
              <FileUploadChat />

              <div style={{ textAlign: 'center', margin: '24px 0 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>— or start from a template —</div>

              <div style={styles.templateGrid}>
                {Object.entries(templates).map(([key, tmpl]) => {
                  const isPremium = !freeTemplates.includes(key);
                  const isLocked = isPremium && userPlan === 'free';
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        if (isLocked) {
                          setError(`${tmpl.name} requires a Starter or Pro plan. Upgrade to unlock all 8 templates!`);
                          return;
                        }
                        setError('');
                        setSelectedTemplate(key);
                        setStep(2);
                      }}
                      style={{
                        ...styles.templateCard,
                        ...(selectedTemplate === key ? styles.templateSelected : {}),
                        ...(isLocked ? { opacity: 0.6 } : {}),
                      }}
                    >
                      <span style={{ fontSize: '2.5rem' }}>{tmpl.icon}</span>
                      <strong style={{ fontSize: '1rem', marginTop: 8 }}>{tmpl.name}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>{tmpl.description}</span>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <span style={styles.techBadge}>{tmpl.tech}</span>
                        {isPremium ? (
                          <span style={{ ...styles.techBadge, background: 'rgba(255, 170, 0, 0.1)', color: '#ffaa00', borderColor: 'rgba(255, 170, 0, 0.2)' }}>
                            {isLocked ? '🔒 Starter+' : '⭐ Premium'}
                          </span>
                        ) : (
                          <span style={{ ...styles.techBadge, background: 'rgba(0, 229, 160, 0.1)', color: 'var(--accent)', borderColor: 'rgba(0, 229, 160, 0.2)' }}>Free</span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* LOCKED PREMIUM: Full-Stack + Mobile */}
                <button
                  onClick={() => {
                    if (userPlan === 'pro') {
                      setSelectedTemplate('fullstack-mobile');
                      setStep(2);
                    } else {
                      setError('');
                      setShowUpgradeModal(true);
                    }
                  }}
                  style={{
                    ...styles.templateCard,
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    background: userPlan === 'pro' ? 'var(--bg-card)' : 'linear-gradient(135deg, rgba(168,85,247,0.05), rgba(99,102,241,0.05))',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {userPlan !== 'pro' && (
                    <div style={{ position: 'absolute', top: 0, right: 0, background: 'linear-gradient(135deg, #a855f7, #6366f1)', padding: '4px 14px 4px 20px', borderRadius: '0 0 0 12px', fontSize: '0.65rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>
                      🔒 Pro Only
                    </div>
                  )}
                  <span style={{ fontSize: '2.5rem' }}>🚀📱</span>
                  <strong style={{ fontSize: '1rem', marginTop: 8 }}>Full-Stack + Mobile Companion</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4, textAlign: 'center', lineHeight: 1.5 }}>
                    Complete web app (React) + fully synced React Native iOS/Android companion. Shared auth, real-time data, unified backend.
                  </span>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={styles.techBadge}>React + Node.js</span>
                    <span style={styles.techBadge}>React Native</span>
                    <span style={styles.techBadge}>Socket.IO</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Project Details */}
          {step === 2 && (
            <div style={{ maxWidth: 500, margin: '0 auto' }}>
              <h2 style={styles.stepTitle}>Tell us about your project</h2>
              <div style={styles.formGroup}>
                <label style={styles.label}>Project Name *</label>
                <input
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="My Awesome Project"
                  style={styles.input}
                  autoFocus
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Description (optional)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="A brief description of what your project does..."
                  style={{ ...styles.input, minHeight: 100, resize: 'vertical' }}
                  rows={3}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button onClick={() => setStep(1)} className="btn btn-secondary" style={{ flex: 1 }}>← Back</button>
                <button onClick={() => projectName && setStep(3)} className="btn btn-primary" style={{ flex: 2 }} disabled={!projectName}>
                  Next: Choose Style →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Color Scheme */}
          {step === 3 && (
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
              <h2 style={styles.stepTitle}>Choose your style</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 32 }}>
                {colorSchemes.map(scheme => (
                  <button
                    key={scheme.id}
                    onClick={() => setColorScheme(scheme.id)}
                    style={{
                      ...styles.colorCard,
                      borderColor: colorScheme === scheme.id ? scheme.color : 'var(--border)',
                      boxShadow: colorScheme === scheme.id ? `0 0 20px ${scheme.color}33` : 'none',
                    }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: scheme.color, marginBottom: 8 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{scheme.name}</span>
                  </button>
                ))}
              </div>

              {/* Summary */}
              <div style={styles.summaryCard}>
                <h3 style={{ marginBottom: 12, fontSize: '1rem' }}>📋 Project Summary</h3>
                <div style={styles.summaryRow}><span>Template:</span><strong>{templates[selectedTemplate]?.name}</strong></div>
                <div style={styles.summaryRow}><span>Name:</span><strong>{projectName}</strong></div>
                <div style={styles.summaryRow}><span>Tech:</span><strong>{templates[selectedTemplate]?.tech}</strong></div>
                <div style={styles.summaryRow}><span>Style:</span><strong>{colorSchemes.find(c => c.id === colorScheme)?.name}</strong></div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button onClick={() => setStep(2)} className="btn btn-secondary" style={{ flex: 1 }}>← Back</button>
                <button onClick={handleGenerate} className="btn btn-primary" style={{ flex: 2 }} disabled={loading}>
                  {loading ? '⚡ Generating...' : '⚡ Generate My Project'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Results & Download */}
          {step === 4 && result && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <span style={{ fontSize: '3rem' }}>🎉</span>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 12 }}>Your project is ready!</h2>
                <p style={{ color: 'var(--text-secondary)' }}>{result.totalFiles} files generated</p>
              </div>

              {/* File list */}
              <div style={styles.fileList}>
                <h3 style={{ marginBottom: 16, fontSize: '1rem' }}>📁 Project Files</h3>
                {result.files.map((file, i) => (
                  <div key={i} style={styles.fileItem}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1.2rem' }}>📄</span>
                      <div>
                        <strong style={{ fontSize: '0.9rem' }}>{file.path}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{file.content.split('\n').length} lines</div>
                      </div>
                    </div>
                    <button onClick={() => downloadFile(file)} style={styles.downloadBtn}>Download</button>
                  </div>
                ))}
                <button onClick={downloadProject} className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}>
                  📥 Download All Files
                </button>
              </div>

              {/* Deploy Guide */}
              {result.deployGuide && (
                <div style={styles.deployGuide}>
                  <h3 style={{ marginBottom: 20, fontSize: '1.2rem' }}>🚀 {result.deployGuide.title}</h3>
                  {result.deployGuide.steps.map(step => (
                    <div key={step.step} style={styles.guideStep}>
                      <div style={styles.guideNum}>{step.step}</div>
                      <div>
                        <strong style={{ fontSize: '0.95rem' }}>{step.title}</strong>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>{step.detail}</p>
                      </div>
                    </div>
                  ))}
                  {result.deployGuide.tips && (
                    <div style={{ marginTop: 24, padding: 16, background: 'rgba(0, 229, 160, 0.06)', borderRadius: 10, border: '1px solid rgba(0, 229, 160, 0.15)' }}>
                      <strong style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>💡 Pro Tips:</strong>
                      {result.deployGuide.tips.map((tip, i) => (
                        <p key={i} style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 6 }}>• {tip}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Iteration Chatbox */}
              <BuildChat projectId={result.projectId} projectName={result.projectName} template={selectedTemplate} user={user} />

              {/* CTA */}
              <div style={{ textAlign: 'center', marginTop: 24, padding: 32, background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Need to fix bugs in your code?</p>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Use ZapCodes Repair to scan and auto-fix issues</p>
                <Link to="/dashboard" className="btn btn-primary">Go to Repair Dashboard →</Link>
              </div>

              <button onClick={() => { setStep(1); setResult(null); setProjectName(''); setDescription(''); }}
                className="btn btn-ghost" style={{ width: '100%', marginTop: 16 }}>
                ← Build Another Project
              </button>
            </div>
          )}

        </div>
      </section>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setShowUpgradeModal(false)}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '40px 36px', maxWidth: 440, width: '90%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <span style={{ fontSize: '3rem' }}>🚀📱</span>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 12 }}>Full-Stack + Mobile Companion</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 10, lineHeight: 1.7 }}>
              Generate a complete web app with a fully synced React Native iOS/Android companion. Shared auth, real-time data, unified backend — everything stays in sync across platforms.
            </p>
            <div style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 12, padding: 16, marginTop: 20, fontSize: '0.85rem', color: '#a855f7' }}>
              🔒 Requires <strong>Pro Subscription</strong> — unlimited builds, mobile sync & more.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'center' }}>
              <Link to="/pricing" style={{ padding: '12px 28px', borderRadius: 10, background: 'linear-gradient(135deg, #a855f7, #6366f1)', color: '#fff', fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none' }}>
                Upgrade to Pro — $29/mo
              </Link>
              <button onClick={() => setShowUpgradeModal(false)} style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer' }}>
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={styles.footer}>
        <div className="container flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '1.2rem' }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>ZapCodes</span>
          </div>
          <div className="flex items-center gap-2" style={{ gap: 24 }}>
            <Link to="/privacy" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/terms" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Terms of Service</Link>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            ©2026 ZapCodes. AI-powered code repair. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}

// ===== FILE UPLOAD + AI CHAT =====
function FileUploadChat() {
  const [files, setFiles] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [showTree, setShowTree] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(-1);
  const [repoUrlForPush, setRepoUrlForPush] = useState('');
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushResult, setPushResult] = useState(null);
  const fileRef = React.useRef(null);
  const chatRef = React.useRef(null);

  React.useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages, generatedFiles]);

  const handleUpload = async (fileList) => {
    const formData = new FormData();
    for (const f of fileList) formData.append('files', f);
    setLoading(true);
    try {
      const { data } = await api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFiles(data.files);
      setShowChat(true);
      setGeneratedFiles([]);
      const treePreview = data.tree.slice(0, 15).join('\n');
      setChatMessages([{
        role: 'assistant',
        content: `📁 **${data.totalFiles} file(s) loaded!**${data.skippedFiles?.length ? ` (${data.skippedFiles.length} binary/large files skipped)` : ''}\n\n**Tell me what to fix or improve.** I will return **complete, ready-to-deploy files** — not snippets.\n\nExamples:\n• "Fix the Settings page — GitHub token section is cut off"\n• "Add dark mode to the Dashboard"\n• "Fix the login API — it returns 500 on invalid email"\n• "analyze" — full code scan for bugs\n\n📂 **Files loaded:**\n\`\`\`\n${treePreview}${data.tree.length > 15 ? `\n... and ${data.tree.length - 15} more` : ''}\n\`\`\``,
      }]);
    } catch (err) {
      setChatMessages([{ role: 'system', content: '❌ Upload failed: ' + (err.response?.data?.error || err.message) }]);
    }
    setLoading(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || loading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    setGeneratedFiles([]);

    try {
      const mode = msg.toLowerCase().includes('scan') || msg.toLowerCase() === 'analyze' ? 'scan' : 'improve';
      const { data } = await api.post('/files/analyze', { files, prompt: msg, mode });

      if (mode === 'scan' && data.issues?.length > 0) {
        const response = `Found **${data.issues.length} issues:**\n\n` + data.issues.map((i, idx) =>
          `**${idx + 1}. [${i.severity.toUpperCase()}] ${i.title}** (${i.file})\n${i.description}\n💡 ${i.fix}`
        ).join('\n\n');
        setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
      } else {
        // Fix/improve mode — show analysis + extracted files
        if (data.generatedFiles?.length > 0) {
          setGeneratedFiles(data.generatedFiles);
          setChatMessages(prev => [...prev, {
            role: 'assistant',
            content: `✅ **${data.generatedFiles.length} complete file(s) generated!**${data.summary ? `\n\n${data.summary}` : ''}\n\n⬇️ Scroll down to see all files. Each is the **complete file** — copy-paste directly into your repo.`,
          }]);
        } else {
          setChatMessages(prev => [...prev, { role: 'assistant', content: data.analysis || 'Analysis complete but no files generated.' }]);
        }
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'system', content: '❌ ' + (err.response?.data?.error || 'Analysis failed. Please try again.') }]);
    }
    setLoading(false);
  };

  const generateFiles = async () => {
    setLoading(true);
    try {
      const prompts = chatMessages.filter(m => m.role === 'user').map(m => m.content).join('; ');
      const { data } = await api.post('/files/generate', { files, prompt: prompts });
      if (data.generatedFiles?.length > 0) {
        setGeneratedFiles(data.generatedFiles);
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `✅ **${data.generatedFiles.length} complete file(s) ready!**${data.summary ? `\n\n${data.summary}` : ''}`,
        }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'system', content: '❌ Generation failed' }]);
    }
    setLoading(false);
  };

  const copyFile = (idx) => {
    navigator.clipboard.writeText(generatedFiles[idx].content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(-1), 2000);
  };

  const downloadFile = (f) => {
    const blob = new Blob([f.content], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f.name.split('/').pop(); a.click();
  };

  const downloadAllZip = async () => {
    // Build a simple multi-file download
    for (const f of generatedFiles) downloadFile(f);
    setChatMessages(prev => [...prev, { role: 'assistant', content: `⬇️ **${generatedFiles.length} files downloaded.** Replace them at their exact paths in your repo, then \`git push\`.` }]);
  };

  const pushToGitHub = async () => {
    if (!repoUrlForPush.trim()) return;
    setLoading(true); setPushResult(null);
    try {
      const filesToPush = generatedFiles.length > 0 ? generatedFiles : (await api.post('/files/generate', { files, prompt: chatMessages.filter(m => m.role === 'user').map(m => m.content).join('; ') })).data.generatedFiles;
      const { data } = await api.post('/files/push-to-github', { repoUrl: repoUrlForPush, files: filesToPush, commitMessage: 'Apply fixes via ZapCodes Moltbot' });
      setPushResult(data);
      setChatMessages(prev => [...prev, { role: 'assistant', content: `🤖 **Moltbot pushed to GitHub!** ${data.message}\n\n${data.results.map(r => `${r.status === 'success' ? '✅' : '❌'} ${r.name}: ${r.action || r.error}`).join('\n')}\n\n🚀 Auto-deploy should trigger on Vercel/Render within ~60s.` }]);
      setShowPushModal(false);
    } catch (err) {
      setPushResult({ error: err.response?.data?.error || 'Push failed — check GitHub token in Settings' });
    }
    setLoading(false);
  };

  const fcS = {
    card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 8 },
    drop: (active) => ({ border: `2px dashed ${active ? '#00e5a0' : 'var(--border)'}`, borderRadius: 12, padding: 28, textAlign: 'center', cursor: 'pointer', background: active ? 'rgba(0,229,160,0.03)' : 'transparent', transition: '0.2s' }),
    msg: (role) => ({
      padding: '10px 14px', borderRadius: 10, fontSize: '0.83rem', maxWidth: '92%', lineHeight: 1.7, whiteSpace: 'pre-wrap',
      ...(role === 'user' ? { alignSelf: 'flex-end', background: 'var(--accent)', color: '#06060b' } :
          role === 'assistant' ? { alignSelf: 'flex-start', background: 'var(--bg-elevated)', border: '1px solid var(--border)' } :
          { alignSelf: 'center', background: 'rgba(255,68,102,0.08)', color: '#ff4466', fontSize: '0.8rem' }),
    }),
    fileCard: { border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 10 },
    fileHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0,229,160,0.04)', borderBottom: '1px solid var(--border)' },
    fileCode: { padding: '12px 14px', background: 'var(--bg-elevated)', fontSize: '0.75rem', fontFamily: 'monospace', maxHeight: 250, overflowY: 'auto', whiteSpace: 'pre', color: 'var(--text-secondary)', lineHeight: 1.5 },
    btn: { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem' },
    btnAccent: { padding: '5px 10px', borderRadius: 6, border: 'none', background: '#00e5a0', color: '#06060b', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 },
  };

  const fmtMsg = (c) => c.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code style="background:rgba(0,229,160,0.08);padding:1px 5px;border-radius:3px;font-size:0.78rem">$1</code>').replace(/```([\s\S]*?)```/g, '<pre style="background:var(--bg-elevated);padding:8px;border-radius:6px;font-size:0.75rem;overflow:auto;margin:6px 0">$1</pre>').replace(/\n/g, '<br/>');

  return (
    <div style={fcS.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: '1.3rem' }}>📤</span>
        <strong style={{ fontSize: '1rem' }}>Upload Files for AI Analysis</strong>
        <span style={{ fontSize: '0.7rem', color: '#00e5a0', background: 'rgba(0,229,160,0.08)', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>Returns complete files</span>
      </div>

      {!showChat ? (
        <>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
            Upload your entire repo (ZIP) or individual files. When you ask for a fix, Moltbot returns <strong>complete, ready-to-deploy files</strong> — not snippets. Copy-paste directly into your repo.
          </p>
          <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }} onClick={() => fileRef.current?.click()} style={fcS.drop(dragOver)}>
            {loading ? <p style={{ color: 'var(--accent)' }}>⚡ Processing...</p> : (
              <>
                <p style={{ fontSize: '1.5rem', marginBottom: 4 }}>📁</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Drag & drop your repo ZIP, or <strong style={{ color: 'var(--accent)' }}>click to browse</strong></p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 4 }}>Supports .zip .js .jsx .ts .py .html .css .json and more</p>
              </>
            )}
            <input ref={fileRef} type="file" multiple onChange={e => handleUpload(e.target.files)} style={{ display: 'none' }} accept=".js,.jsx,.ts,.tsx,.py,.html,.css,.json,.md,.zip,.java,.rb,.go,.php,.vue,.svelte,.yml,.yaml,.sh,.txt" />
          </div>
        </>
      ) : (
        <>
          {/* File tree toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>📁 {files.length} files loaded</span>
            <button onClick={() => setShowTree(!showTree)} style={fcS.btn}>{showTree ? 'Hide' : 'Show'} file tree</button>
          </div>
          {showTree && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 12, maxHeight: 150, overflowY: 'auto', fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
              {files.map(f => f.name).sort().map((n, i) => <div key={i}>{n}</div>)}
            </div>
          )}

          {/* Chat messages */}
          <div ref={chatRef} style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chatMessages.map((m, i) => (
              <div key={i} style={fcS.msg(m.role)} dangerouslySetInnerHTML={{ __html: fmtMsg(m.content) }} />
            ))}
            {loading && <div style={{ alignSelf: 'flex-start', fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 0' }}>⚡ Moltbot is working... (may take 15-30s)</div>}
          </div>

          {/* Generated files display */}
          {generatedFiles.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ fontSize: '0.9rem' }}>📄 {generatedFiles.length} Complete File(s) Ready</strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={downloadAllZip} style={fcS.btn}>⬇️ Download All</button>
                  <button onClick={() => setShowPushModal(true)} style={fcS.btnAccent}>🤖 Push to GitHub</button>
                </div>
              </div>
              {generatedFiles.map((f, i) => (
                <div key={i} style={fcS.fileCard}>
                  <div style={fcS.fileHeader}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary)' }}>📄 {f.name}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => copyFile(i)} style={fcS.btn}>{copiedIdx === i ? '✅ Copied!' : '📋 Copy'}</button>
                      <button onClick={() => downloadFile(f)} style={fcS.btn}>⬇️</button>
                    </div>
                  </div>
                  <div style={fcS.fileCode}>{f.content.length > 3000 ? f.content.slice(0, 3000) + '\n\n... (' + (f.content.length - 3000) + ' more chars — use Copy to get full file)' : f.content}</div>
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Describe what to fix — I'll return complete files..." style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text-primary)', fontSize: '0.85rem' }} onKeyDown={e => e.key === 'Enter' && sendChat()} disabled={loading} />
            <button onClick={sendChat} disabled={loading || !chatInput.trim()} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#06060b', fontWeight: 700, cursor: 'pointer' }}>Send</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {generatedFiles.length === 0 && chatMessages.some(m => m.role === 'user') && (
              <button onClick={generateFiles} disabled={loading} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(0,229,160,0.3)', background: 'rgba(0,229,160,0.08)', color: '#00e5a0', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>⚡ Generate Fixed Files</button>
            )}
            <button onClick={() => { setShowChat(false); setFiles([]); setChatMessages([]); setGeneratedFiles([]); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}>← Upload new files</button>
          </div>

          {/* Push modal */}
          {showPushModal && (
            <div style={{ marginTop: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>🤖 Push {generatedFiles.length} file(s) to GitHub via Moltbot</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10 }}>Files will be committed directly to your repo. Make sure your GitHub token is connected in Settings.</p>
              <input value={repoUrlForPush} onChange={e => setRepoUrlForPush(e.target.value)} placeholder="https://github.com/owner/repo" style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={pushToGitHub} disabled={loading || !repoUrlForPush.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#00e5a0', color: '#06060b', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>{loading ? 'Pushing...' : 'Push to GitHub'}</button>
                <button onClick={() => setShowPushModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
              </div>
              {pushResult?.error && <p style={{ fontSize: '0.8rem', color: '#ff4466', marginTop: 8 }}>❌ {pushResult.error}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ===== REPO IMPORT =====
function RepoImport() {
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const importRepo = async () => {
    if (!repoUrl.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const { data } = await api.post('/build/import-repo', { repoUrl: repoUrl.trim() });
      setResult(data);
      setExpanded(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed');
    }
    setLoading(false);
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: '1.3rem' }}>📦</span>
        <strong style={{ fontSize: '1rem' }}>Import GitHub Repository</strong>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
        Paste a GitHub URL to analyze the project, detect the tech stack, and get tailored hosting instructions.
        For private repos, connect your GitHub token in <Link to="/settings" style={{ color: 'var(--accent)' }}>Settings</Link>.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text-primary)', fontSize: '0.85rem' }} onKeyDown={e => e.key === 'Enter' && importRepo()} />
        <button onClick={importRepo} disabled={loading || !repoUrl.trim()} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#06060b', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {loading ? 'Analyzing...' : 'Import & Analyze'}
        </button>
      </div>
      {error && <p style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: 10 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 16 }}>
          {/* Repo summary */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: '0.95rem' }}>{result.repo.name}</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>⭐ {result.repo.stars} · {result.repo.language}</span>
            </div>
            {result.repo.description && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 10 }}>{result.repo.description}</p>}

            {/* Detection badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {result.detection.frontend && <span style={badgeStyle('🌐', '#00e5a0')}>{result.detection.frontend}</span>}
              {result.detection.backend && <span style={badgeStyle('⚙️', '#6366f1')}>{result.detection.backend}</span>}
              {result.detection.database && <span style={badgeStyle('🗄️', '#ffaa00')}>{result.detection.database}</span>}
              {result.detection.mobile && <span style={badgeStyle('📱', '#a855f7')}>Mobile</span>}
              {result.detection.hasPayments && <span style={badgeStyle('💳', '#00e5a0')}>Stripe</span>}
            </div>

            {/* Dependencies */}
            {result.dependencies.length > 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <strong>Dependencies:</strong> {result.dependencies.slice(0, 12).join(', ')}{result.dependencies.length > 12 ? ` +${result.dependencies.length - 12} more` : ''}
              </div>
            )}

            {/* File tree toggle */}
            <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.8rem', cursor: 'pointer', marginTop: 8, padding: 0 }}>
              {expanded ? '▼ Hide details' : '▶ Show file tree & hosting instructions'}
            </button>
          </div>

          {expanded && (
            <>
              {/* File tree */}
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 12, maxHeight: 200, overflowY: 'auto' }}>
                <strong style={{ fontSize: '0.85rem', marginBottom: 8, display: 'block' }}>📁 File Tree</strong>
                {result.fileTree.map((f, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', padding: '3px 0', color: f.type === 'dir' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                    {f.type === 'dir' ? '📁' : '📄'} {f.name}
                  </div>
                ))}
              </div>

              {/* Hosting instructions */}
              {result.instructions.map((inst, i) => (
                <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: '1.2rem' }}>{inst.icon}</span>
                    <div>
                      <strong style={{ fontSize: '0.9rem' }}>{inst.category}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>{inst.platform}</span>
                    </div>
                  </div>
                  {inst.steps.map((s, j) => (
                    <div key={j} style={{ display: 'flex', gap: 10, padding: '6px 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 700, minWidth: 20 }}>{j + 1}.</span>
                      <span>{s}</span>
                    </div>
                  ))}
                  {inst.tips && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(0,229,160,0.05)', borderRadius: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      💡 {inst.tips.join(' · ')}
                    </div>
                  )}
                  {inst.docsUrl && (
                    <a href={inst.docsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: '0.75rem', color: 'var(--accent)' }}>
                      📖 Official docs →
                    </a>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function badgeStyle(icon, color) {
  return { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 100, fontSize: '0.72rem', fontWeight: 600, background: color + '15', color, border: `1px solid ${color}30` };
}

// ===== BUILD CHAT (Iteration) =====
function BuildChat({ projectId, projectName, template, user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [buildsUsed, setBuildsUsed] = useState(user?.buildsUsed || 0);
  const plan = user?.plan || 'free';
  const buildsLimit = plan === 'pro' ? '∞' : plan === 'starter' ? 25 : 3;
  const scrollRef = React.useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Load existing chat history
  useEffect(() => {
    if (!projectId) return;
    api.get(`/user/chats/${projectId}`).then(({ data }) => {
      if (data.chat?.messages) setMessages(data.chat.messages);
    }).catch(() => {});
  }, [projectId]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    const tokenEst = Math.ceil(msg.length / 4);
    const totalTokens = messages.reduce((s, m) => s + (m.tokenEstimate || 0), 0) + tokenEst;
    const MAX = 200000;

    if (totalTokens > MAX * 0.8 && totalTokens <= MAX * 0.95) {
      if (!window.confirm('⚠️ Context is getting large — AI may forget earlier details. Continue or use "fork new chat"?')) return;
    }
    if (totalTokens > MAX * 0.95) {
      alert('Context limit reached! Please fork to a new chat to continue with a summary of your progress.');
      return;
    }

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg, tokenEstimate: tokenEst }]);
    setLoading(true);

    try {
      const { data } = await api.post(`/user/chats/${projectId}/message`, { content: msg, projectName, template });
      setMessages(prev => [...prev, { role: 'assistant', content: data.message, tokenEstimate: Math.ceil(data.message.length / 4) }]);
      setBuildsUsed(data.buildsUsed);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed';
      setMessages(prev => [...prev, { role: 'system', content: `❌ ${errMsg}: ${err.response?.data?.message || ''}` }]);
    }
    setLoading(false);
  };

  const forkChat = async () => {
    try {
      await api.post(`/user/chats/${projectId}/fork`);
      setMessages([{ role: 'system', content: '✅ Chat forked! A new conversation has been created with a summary of your build. Refresh to continue.' }]);
    } catch (err) { alert('Fork failed'); }
  };

  return (
    <div style={{ marginTop: 24, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <button onClick={() => setExpanded(!expanded)} style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 700 }}>
        <span>💬 Iterate on this build</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Builds: {buildsUsed}/{buildsLimit} · {expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div>
          {/* Pinned instructions */}
          <div style={{ padding: '0 16px 12px', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.7, borderBottom: '1px solid var(--border)' }}>
            This chat is for follow-up prompts: improve features, fix bugs, add functionality.
            Each message = 1 build. Max context: ~200K tokens. Reply "fork new chat" to start fresh with a summary.
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ maxHeight: 300, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.filter(m => m.role !== 'system' || m.content?.includes('Welcome') === false).map((m, i) => (
              <div key={i} style={{
                padding: '10px 14px', borderRadius: 10, fontSize: '0.85rem', maxWidth: '85%', lineHeight: 1.6,
                ...(m.role === 'user' ? { alignSelf: 'flex-end', background: 'var(--accent)', color: '#06060b' } :
                    m.role === 'assistant' ? { alignSelf: 'flex-start', background: 'var(--bg-elevated)', border: '1px solid var(--border)' } :
                    { alignSelf: 'center', background: 'rgba(255,170,0,0.08)', color: '#ffaa00', fontSize: '0.8rem' }),
              }}>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{m.content}</pre>
              </div>
            ))}
            {loading && <div style={{ alignSelf: 'flex-start', fontSize: '0.8rem', color: 'var(--text-muted)' }}>⚡ Generating...</div>}
          </div>

          {/* Input */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Improve features, fix bugs, add functionality..." style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text-primary)', fontSize: '0.85rem' }} onKeyDown={e => e.key === 'Enter' && send()} disabled={loading} />
            <button onClick={send} disabled={loading || !input.trim()} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#06060b', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Send</button>
            <button onClick={forkChat} title="Fork to new chat" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>🔀</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    background: 'rgba(6, 6, 11, 0.85)', backdropFilter: 'blur(16px)',
    borderBottom: '1px solid var(--border)',
  },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 16px', borderRadius: 100,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)',
  },
  progressBar: {
    display: 'flex', justifyContent: 'center', gap: 40, marginBottom: 48,
  },
  progressStep: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-muted)',
  },
  progressActive: { color: 'var(--accent)' },
  progressDot: {
    width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-elevated)', border: '2px solid var(--border)', fontWeight: 700, fontSize: '0.8rem',
  },
  progressDotActive: {
    background: 'var(--accent)', color: '#06060b', borderColor: 'var(--accent)',
  },
  stepTitle: {
    fontSize: '1.4rem', fontWeight: 700, textAlign: 'center', marginBottom: 32,
  },
  templateGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16,
  },
  templateCard: {
    background: 'var(--bg-card)', border: '2px solid var(--border)', borderRadius: 16, padding: 24,
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    cursor: 'pointer', transition: '0.2s', color: 'var(--text-primary)',
  },
  templateSelected: {
    borderColor: 'var(--accent)', boxShadow: '0 0 30px rgba(0, 229, 160, 0.1)',
  },
  techBadge: {
    marginTop: 10, padding: '3px 10px', borderRadius: 100, fontSize: '0.7rem', fontWeight: 600,
    background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)',
  },
  formGroup: { marginBottom: 20 },
  label: { display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' },
  input: {
    width: '100%', padding: '12px 16px', borderRadius: 10,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', fontSize: '0.95rem', fontFamily: 'inherit',
  },
  colorCard: {
    background: 'var(--bg-card)', border: '2px solid var(--border)', borderRadius: 12, padding: 16,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    cursor: 'pointer', transition: '0.2s', color: 'var(--text-primary)',
  },
  summaryCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
  },
  summaryRow: {
    display: 'flex', justifyContent: 'space-between', padding: '6px 0',
    fontSize: '0.9rem', color: 'var(--text-secondary)',
  },
  fileList: {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 24,
  },
  fileItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 0', borderBottom: '1px solid var(--border)',
  },
  downloadBtn: {
    padding: '6px 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--accent)', cursor: 'pointer',
  },
  deployGuide: {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 24,
  },
  guideStep: {
    display: 'flex', gap: 16, marginBottom: 20,
  },
  guideNum: {
    width: 32, height: 32, minWidth: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--accent)', color: '#06060b', fontWeight: 800, fontSize: '0.85rem',
  },
  footer: {
    padding: '32px 0', borderTop: '1px solid var(--border)',
    position: 'relative', zIndex: 1,
  },
};
