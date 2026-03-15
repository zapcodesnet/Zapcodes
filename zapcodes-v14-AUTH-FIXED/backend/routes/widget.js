// backend/routes/widget.js
// ZapCodes AI Widget — API for visitor chat on user-deployed sites.
// Auth: siteToken (no user JWT — visitors don't have accounts).
// BL coins deducted from site OWNER's account per visitor message.

const express    = require('express');
const rateLimit  = require('express-rate-limit');
const router     = express.Router();
const User       = require('../models/User');
const WidgetSite = require('../models/WidgetSite');
const auth       = require('../middleware/auth');

// Try to use aiService.js (cleaner unified caller), fall back to ai.js
let callAI;
try {
  const aiService = require('../services/aiService');
  callAI = aiService.callAI;
} catch {
  // Fallback — wrap ai.js callGroq/callGemini into same interface
  const ai = require('../services/ai');
  callAI = async (modelKey, systemPrompt, userPrompt, maxTokens) => {
    let result;
    if (modelKey === 'groq') {
      result = await ai.callGroq(systemPrompt, userPrompt, { maxTokens: maxTokens || 1024 });
    } else {
      result = await ai.callGemini(systemPrompt, userPrompt, { model: modelKey, maxTokens });
    }
    return { content: typeof result === 'string' ? result : result?.content || '' };
  };
}

// ── Rate limiter for visitor messages (10/min per IP) ─────────────────────
const visitorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many messages. Please wait a moment.' },
  keyGenerator: (req) => req.ip + ':' + (req.body?.siteToken || ''),
});

// ── Widget tier permissions ───────────────────────────────────────────────
const WIDGET_TIERS = {
  free:    { chat: true,  image: false, video: false },
  bronze:  { chat: true,  image: false, video: false },
  silver:  { chat: true,  image: true,  video: false },
  gold:    { chat: true,  image: true,  video: true  },
  diamond: { chat: true,  image: true,  video: true  },
};

// BL cost per widget action
const WIDGET_BL_COSTS = {
  groq:              100,
  'gemini-2.5-flash': 200,
  image:             200,
  photo:             200,
  video:           50000,
};

// ── Summarize session using Groq (free — uses your quota) ─────────────────
async function summarizeSession(messages) {
  if (!messages || messages.length === 0) return '';
  const formatted = messages.map((m, i) =>
    `${i + 1}. [${m.role.toUpperCase()}] ${m.content}`
  ).join('\n');

  try {
    const result = await callAI(
      'groq',
      'You summarize visitor conversations on a business website. Be concise (max 150 words). Cover what the visitor asked about and what was answered. Third person.',
      `Summarize this conversation:\n\n${formatted}`,
      512
    );
    return result?.content?.trim() || '';
  } catch {
    return `Visitor asked ${messages.filter(m => m.role === 'user').length} questions about the business.`;
  }
}

// ── Detect what kind of AI task the message needs ─────────────────────────
function detectMessageTask(message) {
  const msg = (message || '').toLowerCase();
  if (/generate.*image|create.*image|make.*image|image.*of|picture.*of|photo.*of|draw/.test(msg)) return 'image';
  if (/edit.*photo|transform.*photo|change.*photo|modify.*photo|vibe.*edit/.test(msg)) return 'photo';
  if (/generate.*video|create.*video|make.*video|video.*of/.test(msg)) return 'video';
  return 'chat';
}

// ── Auto-detect widget position from HTML ─────────────────────────────────
function detectWidgetPosition(html) {
  if (!html) return 'bottom-right';
  const h = html.toLowerCase();
  // If there's already something fixed at bottom-right (cart, back-to-top, etc.)
  if (/bottom.*right.*fixed|fixed.*bottom.*right|position.*fixed.*right.*bottom/.test(h) ||
      /cart.*button|shopping.*cart|back.to.top/.test(h)) {
    return 'bottom-left';
  }
  // If there's a fixed bottom nav bar
  if (/nav.*bottom.*fixed|fixed.*nav.*bottom|bottom.*navbar.*fixed/.test(h)) {
    return 'bottom-right-above-nav';
  }
  // Mobile-first single column
  if (/max-width.*600|max-width.*480|viewport.*mobile/.test(h)) {
    return 'bottom-center';
  }
  return 'bottom-right';
}

// ── Auto-generate persona from site HTML ──────────────────────────────────
function generatePersonaFromHTML(html, subdomain) {
  if (!html) return `You are the AI assistant for this website. Help visitors with their questions.`;

  // Extract business name
  let name = subdomain;
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) name = titleMatch[1].replace(/\s*[-|]\s*.*/,'').trim();
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match && h1Match[1].length < 60) name = h1Match[1].trim();

  // Detect business type
  let businessType = 'business';
  const bodyText = html.toLowerCase();
  if (/restaurant|menu|food|dining|cuisine|bbq|pizza|burger|sushi/.test(bodyText)) businessType = 'restaurant';
  else if (/shop|store|product|cart|price|buy|order|shipping/.test(bodyText)) businessType = 'online store';
  else if (/clinic|hospital|doctor|dental|medical|health|patient/.test(bodyText)) businessType = 'clinic';
  else if (/salon|spa|beauty|hair|nail|massage/.test(bodyText)) businessType = 'salon or spa';
  else if (/hotel|resort|accommodation|room|book.*stay/.test(bodyText)) businessType = 'hotel or resort';
  else if (/service|repair|plumb|electric|clean|install/.test(bodyText)) businessType = 'service business';
  else if (/real.*estate|property|house|condo|apartment/.test(bodyText)) businessType = 'real estate office';
  else if (/school|tutor|class|course|learn|education/.test(bodyText)) businessType = 'educational service';

  // Extract hours if present
  let hoursHint = '';
  const hoursMatch = html.match(/(?:hours|open)[^>]*>([^<]*(?:am|pm|mon|tue|wed|thu|fri|sat|sun)[^<]*)/i);
  if (hoursMatch) hoursHint = ` Operating hours: ${hoursMatch[1].trim()}.`;

  return `You are the friendly AI assistant for ${name}, a ${businessType}. ` +
    `Help visitors with questions about products, services, hours, prices, location, and bookings. ` +
    `Be warm, helpful, and concise.${hoursHint} ` +
    `If you don't know the answer to something specific, suggest the visitor contact the business directly.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/widget/chat — visitor sends a message
// Body: { siteToken, message, sessionId }
// ═══════════════════════════════════════════════════════════════════════════
router.post('/chat', visitorLimiter, async (req, res) => {
  try {
    const { siteToken, message, sessionId } = req.body;
    if (!siteToken) return res.status(400).json({ error: 'Missing siteToken' });
    if (!message?.trim()) return res.status(400).json({ error: 'Message is empty' });
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

    // Find widget config
    const widget = await WidgetSite.findOne({ siteToken, isActive: true });
    if (!widget) return res.status(404).json({ error: 'Widget not found or inactive' });

    // Find site owner
    const owner = await User.findById(widget.ownerId).select('+password');
    if (!owner) return res.status(404).json({ error: 'Site owner not found' });

    // Check daily BL cap if set
    widget.checkDailyReset();
    if (widget.dailyBLCap > 0 && widget.blSpentToday >= widget.dailyBLCap) {
      return res.json({
        reply: "Our AI assistant has reached its daily limit. Please check back tomorrow or contact us directly.",
        sessionId,
        paused: true,
      });
    }

    // Detect task type
    const taskType = detectMessageTask(message);
    const tier = owner.subscription_tier || 'free';
    const tierPerms = WIDGET_TIERS[tier] || WIDGET_TIERS.free;

    // Check tier permissions for non-chat tasks
    if (taskType === 'image' && !tierPerms.image) {
      return res.json({
        reply: "Image generation isn't available on this site's current plan. I can still answer questions — what would you like to know?",
        sessionId,
      });
    }
    if (taskType === 'video' && !tierPerms.video) {
      return res.json({
        reply: "Video generation isn't available on this plan. Is there anything else I can help you with?",
        sessionId,
      });
    }

    // Determine model to use
    let model = widget.model || 'groq';
    if (taskType === 'image' || taskType === 'photo') model = 'gemini-2.5-flash';
    if (taskType === 'video') model = 'veo';

    // Calculate BL cost
    const blCost = taskType === 'video'
      ? WIDGET_BL_COSTS.video
      : model === 'gemini-2.5-flash'
        ? WIDGET_BL_COSTS['gemini-2.5-flash']
        : WIDGET_BL_COSTS.groq;

    // Check owner BL balance
    if (owner.bl_coins < 500) {
      return res.json({
        reply: "Our AI assistant is temporarily unavailable. Please check back later.",
        sessionId,
        paused: true,
      });
    }
    if (owner.bl_coins < blCost) {
      return res.json({
        reply: "Our AI assistant is temporarily unavailable. Please check back later.",
        sessionId,
        paused: true,
      });
    }

    // Get or create visitor session
    const session = widget.getSession(sessionId);
    session.lastActive = new Date();

    // Build context for AI
    let systemPrompt = widget.persona ||
      `You are the AI assistant for this website. Help visitors with their questions. Be friendly and concise.`;

    // Add summary context if exists
    let contextPrompt = '';
    if (session.summary) {
      contextPrompt += `Previous conversation summary: ${session.summary}\n\n`;
    }
    // Add recent messages as context
    if (session.rawMessages.length > 0) {
      const recent = session.rawMessages.slice(-10).map(m =>
        `${m.role === 'user' ? 'Visitor' : 'AI'}: ${m.content}`
      ).join('\n');
      contextPrompt += `Recent conversation:\n${recent}\n\n`;
    }
    contextPrompt += `Current visitor message: ${message.trim()}`;

    // Call AI
    let reply = '';
    try {
      if (model === 'groq' || model === 'gemini-2.5-flash') {
        const result = await callAI(model, systemPrompt, contextPrompt, 1024);
        reply = result?.content?.trim() || "I'm not sure about that. Please contact us directly for help.";
      } else {
        // Video/image handled separately — for now return placeholder
        reply = "Video generation is being processed. Please check back shortly.";
      }
    } catch (aiErr) {
      console.error('[Widget/chat] AI error:', aiErr.message);
      reply = "I'm having trouble right now. Please try again or contact us directly.";
    }

    // Save messages to session
    session.rawMessages.push({ role: 'user', content: message.trim() });
    session.rawMessages.push({ role: 'assistant', content: reply });

    // Trigger summarization at 20 messages
    if (session.rawMessages.length >= 20) {
      const toSummarize = [...session.rawMessages];
      // Summarize in background
      summarizeSession(toSummarize).then(summary => {
        WidgetSite.findOne({ siteToken }).then(w => {
          if (!w) return;
          const s = w.sessions.find(s => s.sessionId === sessionId);
          if (s) {
            s.summary = summary;
            s.rawMessages = [];
            w.markModified('sessions');
            w.save().catch(() => {});
          }
        }).catch(() => {});
      }).catch(() => {});

      // Clear locally too (will be saved below)
      session.summary = session.summary; // keep existing until new one arrives
      session.rawMessages = [];
    }

    // Deduct BL coins from owner
    try {
      owner.spendCoins(blCost, 'generation', `AI Widget: ${widget.subdomain}.zapcodes.net (${model})`);
      owner.markModified('bl_transactions');
      await owner.save();
    } catch (coinErr) {
      console.warn('[Widget/chat] Coin deduction failed:', coinErr.message);
    }

    // Update widget stats
    widget.blSpentToday  = (widget.blSpentToday  || 0) + blCost;
    widget.blSpentTotal  = (widget.blSpentTotal   || 0) + blCost;
    widget.messageCount  = (widget.messageCount   || 0) + 1;
    widget.markModified('sessions');
    await widget.save();

    // Optional: append to conversation log
    if (widget.enableLogging) {
      widget.conversationLog = widget.conversationLog || [];
      let log = widget.conversationLog.find(l => l.visitorSessionId === sessionId);
      if (!log) {
        widget.conversationLog.push({ visitorSessionId: sessionId, messages: [], startedAt: new Date() });
        log = widget.conversationLog[widget.conversationLog.length - 1];
      }
      log.messages.push({ role: 'user', content: message.trim() });
      log.messages.push({ role: 'assistant', content: reply });
      // Keep only last 50 conversations
      if (widget.conversationLog.length > 50) {
        widget.conversationLog = widget.conversationLog.slice(-50);
      }
      widget.markModified('conversationLog');
      await widget.save();
    }

    res.json({ reply, sessionId, model });

  } catch (err) {
    console.error('[Widget/chat]', err.message);
    res.status(500).json({ error: 'Widget chat failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/widget/config/:token — widget JS fetches its own config
// Called by zap-ai.js on page load
// ═══════════════════════════════════════════════════════════════════════════
router.get('/config/:token', async (req, res) => {
  try {
    const widget = await WidgetSite.findOne({
      siteToken: req.params.token,
      isActive: true,
    }).select('model task persona position widgetTitle greetingMsg themeColor subdomain');

    if (!widget) return res.status(404).json({ error: 'Widget not found' });

    // Check owner still has coins
    const owner = await User.findById(
      (await WidgetSite.findOne({ siteToken: req.params.token }))?.ownerId
    ).select('bl_coins');

    if (!owner || owner.bl_coins < 100) {
      return res.json({ paused: true, message: 'AI assistant temporarily unavailable.' });
    }

    res.json({
      model:       widget.model,
      task:        widget.task,
      position:    widget.position,
      widgetTitle: widget.widgetTitle  || 'Ask Us Anything',
      greetingMsg: widget.greetingMsg  || 'Hi! How can I help you today?',
      themeColor:  widget.themeColor   || '#6366f1',
      subdomain:   widget.subdomain,
      paused:      false,
    });
  } catch (err) {
    console.error('[Widget/config]', err.message);
    res.status(500).json({ error: 'Failed to load widget config' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/widget/configure — site owner configures widget (requires auth)
// Body: { subdomain, persona, task, position, widgetTitle, greetingMsg,
//         themeColor, dailyBLCap, enableLogging, siteHTML }
// ═══════════════════════════════════════════════════════════════════════════
router.post('/configure', auth, async (req, res) => {
  try {
    const user = req.user;
    const {
      subdomain, persona, task, position,
      widgetTitle, greetingMsg, themeColor,
      dailyBLCap, enableLogging, siteHTML,
    } = req.body;

    if (!subdomain) return res.status(400).json({ error: 'subdomain required' });

    // Verify user owns this subdomain
    const ownsSite = user.deployed_sites?.some(s => s.subdomain === subdomain) ||
                     user.saved_projects?.some(p => p.linkedSubdomain === subdomain);
    if (!ownsSite && user.role !== 'super-admin') {
      return res.status(403).json({ error: 'You do not own this subdomain' });
    }

    // Find or create widget for this subdomain
    let widget = await WidgetSite.findOne({ ownerId: user._id, subdomain });

    const autoPersona = persona || generatePersonaFromHTML(siteHTML || '', subdomain);
    const autoPosition = position || (siteHTML ? detectWidgetPosition(siteHTML) : 'bottom-right');

    if (!widget) {
      widget = new WidgetSite({
        ownerId:   user._id,
        subdomain,
        ownerTier: user.subscription_tier || 'free',
      });
    }

    widget.persona     = autoPersona;
    widget.task        = task        || widget.task;
    widget.position    = autoPosition;
    widget.widgetTitle = widgetTitle || widget.widgetTitle;
    widget.greetingMsg = greetingMsg || widget.greetingMsg;
    widget.themeColor  = themeColor  || widget.themeColor;
    widget.dailyBLCap  = dailyBLCap !== undefined ? Number(dailyBLCap) : widget.dailyBLCap;
    widget.enableLogging = enableLogging !== undefined ? Boolean(enableLogging) : widget.enableLogging;
    widget.ownerTier   = user.subscription_tier || 'free';
    widget.isActive    = true;

    await widget.save();

    // Also store siteToken in user's widgetSites[] for quick balance checks
    if (!user.widgetSites) user.widgetSites = [];
    const existing = user.widgetSites.find(w => w.subdomain === subdomain);
    if (existing) {
      existing.siteToken   = widget.siteToken;
      existing.model       = widget.model;
      existing.task        = widget.task;
      existing.persona     = widget.persona;
      existing.position    = widget.position;
      existing.isActive    = true;
      existing.updatedAt   = new Date();
    } else {
      user.widgetSites.push({
        subdomain,
        siteToken:   widget.siteToken,
        model:       widget.model,
        task:        widget.task,
        persona:     widget.persona,
        position:    widget.position,
        isActive:    true,
        dailyBLCap:  widget.dailyBLCap,
        blSpentToday: 0,
        blSpentTotal: 0,
        messageCount: 0,
        createdAt:   new Date(),
        updatedAt:   new Date(),
      });
    }
    user.markModified('widgetSites');
    await user.save();

    res.json({
      success:    true,
      siteToken:  widget.siteToken,
      position:   widget.position,
      persona:    widget.persona,
      widgetHTML: generateWidgetHTML(widget.siteToken, widget.position),
    });
  } catch (err) {
    console.error('[Widget/configure]', err.message);
    res.status(500).json({ error: 'Failed to configure widget' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/widget/toggle — enable or disable widget on a site
// ═══════════════════════════════════════════════════════════════════════════
router.post('/toggle', auth, async (req, res) => {
  try {
    const { subdomain, isActive } = req.body;
    const widget = await WidgetSite.findOne({ ownerId: req.user._id, subdomain });
    if (!widget) return res.status(404).json({ error: 'Widget not found' });
    widget.isActive = Boolean(isActive);
    await widget.save();
    res.json({ success: true, isActive: widget.isActive });
  } catch (err) {
    res.status(500).json({ error: 'Toggle failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/widget/stats/:subdomain — owner views widget usage stats
// ═══════════════════════════════════════════════════════════════════════════
router.get('/stats/:subdomain', auth, async (req, res) => {
  try {
    const widget = await WidgetSite.findOne({
      ownerId: req.user._id,
      subdomain: req.params.subdomain,
    });
    if (!widget) return res.status(404).json({ error: 'Widget not found' });

    res.json({
      subdomain:     widget.subdomain,
      isActive:      widget.isActive,
      model:         widget.model,
      task:          widget.task,
      position:      widget.position,
      widgetTitle:   widget.widgetTitle,
      greetingMsg:   widget.greetingMsg,
      themeColor:    widget.themeColor,
      persona:       widget.persona,
      dailyBLCap:    widget.dailyBLCap,
      blSpentToday:  widget.blSpentToday,
      blSpentTotal:  widget.blSpentTotal,
      messageCount:  widget.messageCount,
      enableLogging: widget.enableLogging,
      siteToken:     widget.siteToken,
      recentLogs:    widget.enableLogging
        ? (widget.conversationLog || []).slice(-10)
        : [],
      createdAt:     widget.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/widget/my-widgets — list all widgets for logged-in user
// ═══════════════════════════════════════════════════════════════════════════
router.get('/my-widgets', auth, async (req, res) => {
  try {
    const widgets = await WidgetSite.find({ ownerId: req.user._id })
      .select('subdomain model task position isActive blSpentToday blSpentTotal messageCount themeColor widgetTitle createdAt siteToken')
      .sort({ createdAt: -1 });
    res.json({ widgets });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get widgets' });
  }
});

// ── Helper: generate the HTML snippet to inject into user's site ──────────
function generateWidgetHTML(siteToken, position) {
  const apiBase = process.env.RENDER_EXTERNAL_URL ||
                  process.env.API_URL ||
                  'https://zapcodes-api.onrender.com';
  return `<!-- ZapCodes AI Widget -->
<script>
  window.ZapAI = {
    siteToken: "${siteToken}",
    position: "${position || 'bottom-right'}",
    apiBase: "${apiBase}"
  };
</script>
<script src="${apiBase}/widget/zap-ai.js" defer></script>`;
}

// Export helper for use in build.js
module.exports = router;
module.exports.generateWidgetHTML      = generateWidgetHTML;
module.exports.generatePersonaFromHTML = generatePersonaFromHTML;
module.exports.detectWidgetPosition    = detectWidgetPosition;
