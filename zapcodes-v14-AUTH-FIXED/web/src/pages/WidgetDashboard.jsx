import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

export default function WidgetDashboard() {
  const { user } = useContext(AuthContext);
  const [widgets,  setWidgets]   = useState([]);
  const [loading,  setLoading]   = useState(true);
  const [editing,  setEditing]   = useState(null);   // subdomain being edited
  const [saving,   setSaving]    = useState(false);
  const [toggling, setToggling]  = useState(null);

  // Edit form state
  const [editPersona,    setEditPersona]    = useState('');
  const [editTitle,      setEditTitle]      = useState('');
  const [editGreeting,   setEditGreeting]   = useState('');
  const [editThemeColor, setEditThemeColor] = useState('#6366f1');
  const [editDailyBLCap, setEditDailyBLCap] = useState(0);
  const [editLogging,    setEditLogging]    = useState(false);
  const [editPosition,   setEditPosition]   = useState('bottom-right');

  useEffect(() => {
    api.get('/api/widget/my-widgets')
      .then(r => setWidgets(r.data.widgets || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleEdit = (widget) => {
    setEditing(widget.subdomain);
    setEditPersona(widget.persona || '');
    setEditTitle(widget.widgetTitle || 'Ask Us Anything');
    setEditGreeting(widget.greetingMsg || 'Hi! How can I help you today?');
    setEditThemeColor(widget.themeColor || '#6366f1');
    setEditDailyBLCap(widget.dailyBLCap || 0);
    setEditLogging(widget.enableLogging || false);
    setEditPosition(widget.position || 'bottom-right');
  };

  const handleSave = async (subdomain) => {
    setSaving(true);
    try {
      await api.post('/api/widget/configure', {
        subdomain,
        persona:      editPersona,
        widgetTitle:  editTitle,
        greetingMsg:  editGreeting,
        themeColor:   editThemeColor,
        dailyBLCap:   editDailyBLCap,
        enableLogging: editLogging,
        position:     editPosition,
      });
      // Refresh
      const r = await api.get('/api/widget/my-widgets');
      setWidgets(r.data.widgets || []);
      setEditing(null);
      alert('✅ Widget settings saved!');
    } catch (err) {
      alert(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (subdomain, currentActive) => {
    setToggling(subdomain);
    try {
      await api.post('/api/widget/toggle', { subdomain, isActive: !currentActive });
      setWidgets(prev => prev.map(w =>
        w.subdomain === subdomain ? { ...w, isActive: !currentActive } : w
      ));
    } catch {
      alert('Toggle failed');
    } finally {
      setToggling(null);
    }
  };

  const copySnippet = (token) => {
    const apiBase = import.meta.env.VITE_API_URL?.replace('/api', '') ||
                    'https://zapcodes-api.onrender.com';
    const snippet = `<!-- ZapCodes AI Widget -->\n<script>\n  window.ZapAI = { siteToken: "${token}" };\n</script>\n<script src="${apiBase}/widget/zap-ai.js" defer></script>`;
    navigator.clipboard.writeText(snippet).then(() => alert('✅ Widget code copied!'));
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
      Loading widgets...
    </div>
  );

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <div>
          <h1 style={s.h1}>🤖 AI Widget Dashboard</h1>
          <p style={s.subtitle}>
            Manage the AI assistants running on your live websites.
            BL coins are deducted from your account per visitor message.
          </p>
        </div>
        <a href="/dashboard" style={s.backBtn}>← Dashboard</a>
      </div>

      {/* Cost reminder */}
      <div style={s.infoBox}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div><span style={s.costLabel}>Groq chat (all tiers)</span><span style={s.costVal}>100 BL / visitor message</span></div>
          <div><span style={s.costLabel}>Gemini Flash (Silver+)</span><span style={s.costVal}>200 BL / visitor message</span></div>
          <div><span style={s.costLabel}>Image generation (Silver+)</span><span style={s.costVal}>200 BL / image</span></div>
          <div><span style={s.costLabel}>Video generation (Gold+)</span><span style={s.costVal}>50,000 BL / 8s video</span></div>
        </div>
      </div>

      {widgets.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
            No AI widgets yet
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
            When you build or edit a site in the ZapCodes builder and ask for an AI assistant,
            the widget is automatically added to your site and will appear here.
          </p>
          <a href="/build" style={s.ctaBtn}>Build a site with AI →</a>
        </div>
      ) : (
        <div style={s.widgetList}>
          {widgets.map(widget => (
            <div key={widget.subdomain} style={s.card}>
              {/* Card header */}
              <div style={s.cardHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: widget.isActive ? '#22c55e' : '#6b7280',
                    display: 'inline-block', flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {widget.subdomain}.zapcodes.net
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {widget.task?.replace(/-/g, ' ')} · {widget.model} ·
                      <span style={{ color: widget.isActive ? '#22c55e' : '#6b7280', marginLeft: 4 }}>
                        {widget.isActive ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    style={{ ...s.actionBtn, background: widget.isActive ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: widget.isActive ? '#ef4444' : '#22c55e', border: `1px solid ${widget.isActive ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}` }}
                    onClick={() => handleToggle(widget.subdomain, widget.isActive)}
                    disabled={toggling === widget.subdomain}
                  >
                    {toggling === widget.subdomain ? '...' : widget.isActive ? '⏸ Pause' : '▶ Resume'}
                  </button>
                  <button style={s.actionBtn} onClick={() => editing === widget.subdomain ? setEditing(null) : handleEdit(widget)}>
                    {editing === widget.subdomain ? '✕ Cancel' : '⚙️ Edit'}
                  </button>
                </div>
              </div>

              {/* Stats row */}
              <div style={s.statsRow}>
                <div style={s.stat}>
                  <div style={s.statVal}>{(widget.messageCount || 0).toLocaleString()}</div>
                  <div style={s.statLbl}>Total messages</div>
                </div>
                <div style={s.stat}>
                  <div style={s.statVal}>{(widget.blSpentTotal || 0).toLocaleString()}</div>
                  <div style={s.statLbl}>BL spent total</div>
                </div>
                <div style={s.stat}>
                  <div style={s.statVal}>{(widget.blSpentToday || 0).toLocaleString()}</div>
                  <div style={s.statLbl}>BL spent today</div>
                </div>
                <div style={s.stat}>
                  <div style={s.statVal} style={{ color: widget.themeColor || '#6366f1' }}>●</div>
                  <div style={s.statLbl}>Theme color</div>
                </div>
              </div>

              {/* Widget snippet button */}
              <button
                style={{ ...s.snippetBtn, marginTop: 12 }}
                onClick={() => copySnippet(widget.siteToken)}
              >
                📋 Copy widget embed code (if needed for manual install)
              </button>

              {/* Edit form */}
              {editing === widget.subdomain && (
                <div style={s.editForm}>
                  <div style={s.formTitle}>Edit Widget Settings</div>

                  <div style={s.formGroup}>
                    <label style={s.label}>Widget title (shown in chat bubble)</label>
                    <input style={s.input} value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Ask Us Anything" />
                  </div>

                  <div style={s.formGroup}>
                    <label style={s.label}>Greeting message (first message visitors see)</label>
                    <input style={s.input} value={editGreeting} onChange={e => setEditGreeting(e.target.value)} placeholder="Hi! How can I help you today?" />
                  </div>

                  <div style={s.formGroup}>
                    <label style={s.label}>AI persona (what the AI knows about your business)</label>
                    <textarea
                      style={{ ...s.input, minHeight: 100, resize: 'vertical' }}
                      value={editPersona}
                      onChange={e => setEditPersona(e.target.value)}
                      placeholder="You are the AI assistant for [Business Name]. Help customers with..."
                    />
                    <div style={s.hint}>The AI reads this before every visitor conversation. Be specific about your hours, products, and services.</div>
                  </div>

                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ ...s.formGroup, flex: 1, minWidth: 160 }}>
                      <label style={s.label}>Widget position</label>
                      <select style={s.input} value={editPosition} onChange={e => setEditPosition(e.target.value)}>
                        <option value="bottom-right">Bottom Right (default)</option>
                        <option value="bottom-left">Bottom Left</option>
                        <option value="bottom-center">Bottom Center</option>
                        <option value="auto">Auto-detect</option>
                      </select>
                    </div>

                    <div style={{ ...s.formGroup, flex: 1, minWidth: 140 }}>
                      <label style={s.label}>Theme color</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="color" value={editThemeColor} onChange={e => setEditThemeColor(e.target.value)}
                          style={{ width: 44, height: 38, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'none', padding: 2 }} />
                        <input style={{ ...s.input, flex: 1 }} value={editThemeColor} onChange={e => setEditThemeColor(e.target.value)} placeholder="#6366f1" />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ ...s.formGroup, flex: 1 }}>
                      <label style={s.label}>Daily BL spending cap (0 = no cap)</label>
                      <input type="number" style={s.input} value={editDailyBLCap} onChange={e => setEditDailyBLCap(Number(e.target.value))} min={0} step={1000} />
                      <div style={s.hint}>Set a limit to prevent unexpected spending. e.g. 10,000 BL = 100 Groq messages per day.</div>
                    </div>

                    <div style={{ ...s.formGroup, flex: 1 }}>
                      <label style={s.label}>Conversation logging</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                        <input type="checkbox" id="logging-toggle" checked={editLogging}
                          onChange={e => setEditLogging(e.target.checked)}
                          style={{ width: 18, height: 18, cursor: 'pointer' }} />
                        <label htmlFor="logging-toggle" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                          Save last 50 visitor conversations for review
                        </label>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
                      onClick={() => handleSave(widget.subdomain)}
                      disabled={saving}
                    >
                      {saving ? '⏳ Saving...' : '✅ Save Changes'}
                    </button>
                    <button style={s.cancelBtn} onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  page:      { padding: '24px 20px', maxWidth: 900, margin: '0 auto' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap' },
  h1:        { fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' },
  subtitle:  { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 },
  backBtn:   { padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, textDecoration: 'none', flexShrink: 0 },

  infoBox: {
    background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
    borderRadius: 12, padding: '12px 16px', marginBottom: 24, fontSize: 12,
  },
  costLabel: { color: 'var(--text-muted)', marginRight: 6 },
  costVal:   { fontWeight: 700, color: 'var(--text-primary)' },

  empty: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: 48, textAlign: 'center',
  },
  ctaBtn: {
    display: 'inline-block', padding: '10px 24px', borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
    cursor: 'pointer', fontWeight: 700, fontSize: 14, textDecoration: 'none',
  },

  widgetList: { display: 'flex', flexDirection: 'column', gap: 16 },
  card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 },

  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 },

  statsRow: { display: 'flex', gap: 0, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '10px 0', flexWrap: 'wrap' },
  stat:     { flex: 1, minWidth: 80, textAlign: 'center', padding: '4px 8px' },
  statVal:  { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' },
  statLbl:  { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 },

  snippetBtn: {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px dashed var(--border)', background: 'transparent',
    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
    fontFamily: 'inherit',
  },

  actionBtn: {
    padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
    cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
  },

  editForm:  { marginTop: 16, padding: 16, background: 'var(--bg-elevated)', borderRadius: 10 },
  formTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 },
  formGroup: { marginBottom: 14 },
  label:     { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 },
  input: {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none',
  },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 },

  saveBtn: {
    flex: 1, padding: '10px 20px', borderRadius: 8, border: 'none',
    background: '#22c55e', color: '#fff', fontWeight: 700, fontSize: 13,
    fontFamily: 'inherit',
  },
  cancelBtn: {
    padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600,
    fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
  },
};
