// backend/models/WidgetSite.js
// Stores AI widget configuration and visitor session memory per deployed site.
// One WidgetSite document per subdomain. Visitor sessions are embedded and
// auto-cleaned when inactive > 30 minutes.

const mongoose = require('mongoose');
const crypto   = require('crypto');

const rawMessageSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user', 'assistant'], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  sessionId:   { type: String, required: true },
  rawMessages: { type: [rawMessageSchema], default: [] }, // max 20
  summary:     { type: String, default: '' },             // 1 summary max
  lastActive:  { type: Date, default: Date.now },
}, { _id: false });

const widgetSiteSchema = new mongoose.Schema({
  // ── Identity ────────────────────────────────────────────────────────────
  siteToken:  {
    type:    String,
    unique:  true,
    default: () => crypto.randomBytes(24).toString('hex'),
  },
  ownerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subdomain:  { type: String, required: true, lowercase: true, trim: true },

  // ── Widget Config ────────────────────────────────────────────────────────
  // model: groq for all chat/task, gemini-2.5-flash for image/video (Silver+)
  model:       { type: String, default: 'groq' },
  // task: what the AI does on this site
  task:        {
    type:    String,
    enum:    ['customer-support', 'booking', 'faq', 'product-recommender',
              'order-assistant', 'general', 'image-gen', 'photo-edit', 'video-gen'],
    default: 'customer-support',
  },
  // persona: auto-generated from site HTML, editable by owner
  persona:     { type: String, default: '' },
  // position: where the chat bubble appears on site
  position:    {
    type:    String,
    enum:    ['bottom-right', 'bottom-left', 'bottom-center', 'auto'],
    default: 'auto',
  },
  // widgetTitle: shown in chat bubble header
  widgetTitle: { type: String, default: 'Ask Us Anything' },
  // greetingMsg: first message visitor sees
  greetingMsg: { type: String, default: 'Hi! How can I help you today?' },
  // themeColor: hex color matching site design (auto-detected or owner set)
  themeColor:  { type: String, default: '#6366f1' },

  // ── Status & Limits ─────────────────────────────────────────────────────
  isActive:     { type: Boolean, default: true },
  // dailyBLCap: 0 = no cap, otherwise max BL per day
  dailyBLCap:   { type: Number, default: 0 },
  blSpentToday: { type: Number, default: 0 },
  blSpentTotal: { type: Number, default: 0 },
  messageCount: { type: Number, default: 0 },
  // Track which date blSpentToday was last reset
  blResetDate:  { type: String, default: '' },

  // ── Tier at time of creation (for permission checks) ────────────────────
  ownerTier: { type: String, default: 'free' },

  // ── Visitor Sessions (auto-cleaned, max 100 active at once) ─────────────
  // Each session holds up to 20 raw messages + 1 Groq summary
  sessions: { type: [sessionSchema], default: [] },

  // ── Optional: last 50 conversation logs for dashboard ────────────────────
  enableLogging: { type: Boolean, default: false },
  conversationLog: [{
    visitorSessionId: String,
    messages: [rawMessageSchema],
    startedAt: { type: Date, default: Date.now },
  }],

}, { timestamps: true });

// Index for fast token lookup (most common query)
widgetSiteSchema.index({ siteToken: 1 });
widgetSiteSchema.index({ ownerId: 1 });
widgetSiteSchema.index({ subdomain: 1 });

// ── Helper: get or create visitor session ──────────────────────────────────
widgetSiteSchema.methods.getSession = function (sessionId) {
  // Clean up sessions inactive > 30 minutes
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  this.sessions = this.sessions.filter(s => s.lastActive > cutoff);

  let session = this.sessions.find(s => s.sessionId === sessionId);
  if (!session) {
    this.sessions.push({ sessionId, rawMessages: [], summary: '', lastActive: new Date() });
    session = this.sessions[this.sessions.length - 1];
  }
  return session;
};

// ── Helper: reset daily BL spend if new day ───────────────────────────────
widgetSiteSchema.methods.checkDailyReset = function () {
  const today = new Date().toISOString().slice(0, 10);
  if (this.blResetDate !== today) {
    this.blSpentToday = 0;
    this.blResetDate  = today;
  }
};

module.exports = mongoose.model('WidgetSite', widgetSiteSchema);
