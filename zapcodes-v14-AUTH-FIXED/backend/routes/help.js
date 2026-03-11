const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { callAI, callClaude } = require('../services/ai');
const User = require('../models/User');

// ══════════════════════════════════════════════════════════════
// ZapCodes Help AI — Tier-based chat support with memory
// Conversations persist in user's MongoDB document
// ══════════════════════════════════════════════════════════════

// Tier → AI model config
const HELP_AI_CONFIG = {
  free:    { primary: 'groq',             fallback: 'gemini-2.5-flash', maxFileSize: 0,                canUpload: false, maxHistory: 20,  maxStored: 200 },
  bronze:  { primary: 'groq',             fallback: 'gemini-2.5-flash', maxFileSize: 2 * 1024 * 1024,  canUpload: true,  maxHistory: 30,  maxStored: 300 },
  silver:  { primary: 'gemini-2.5-flash', fallback: 'gemini-3.1-pro',   maxFileSize: 5 * 1024 * 1024,  canUpload: true,  maxHistory: 40,  maxStored: 400 },
  gold:    { primary: 'gemini-2.5-flash', fallback: 'gemini-3.1-pro',   maxFileSize: 10 * 1024 * 1024, canUpload: true,  maxHistory: 40,  maxStored: 500 },
  diamond: { primary: 'gemini-3.1-pro',   fallback: 'sonnet-4.6',        maxFileSize: 25 * 1024 * 1024, canUpload: true,  maxHistory: 50,  maxStored: 1000 },
};

const MODEL_DISPLAY = {
  'groq': 'Groq AI', 'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3.1-pro': 'Gemini 3.1 Pro', 'sonnet-4.6': 'Sonnet 4.6',
  'haiku-4.5': 'Haiku 4.5', 'opus-4.6': 'Claude Opus 4.6',
};

// Admin gets all models including Opus 4.6 (Opus is ONLY available to admin)
const ADMIN_MODELS = ['groq', 'gemini-2.5-flash', 'gemini-3.1-pro', 'haiku-4.5', 'sonnet-4.6', 'opus-4.6'];

// ── System Prompts ──
const HELP_SYSTEM_PROMPT = `You are ZapCodes Help AI — a friendly, knowledgeable support assistant for ZapCodes.net (AI website builder) and BlendLink.net (social commerce platform).

Your personality:
- Warm, helpful, and conversational — talk like a friendly human support agent, not a robot
- Explain things simply. Avoid jargon unless the user is technical.
- Give direct, actionable answers — 2-4 paragraphs max unless user asks for detail
- Use occasional emojis naturally (not excessively)
- If you don't know something specific, say so honestly
- Remember past conversations — reference them naturally when relevant ("Last time you asked about...")

What you help with:
- Building websites with ZapCodes AI (prompts, templates, editing, fixing bugs)
- Deploying sites to .zapcodes.net subdomains
- Subscription tiers: Free, Bronze ($4.99/mo), Silver ($14.99/mo), Gold ($39.99/mo), Diamond ($99.99/mo)
- BL Coins: virtual currency for AI generations, code fixes, GitHub pushes
- Daily BL Coin claims: Free=2K, Bronze=20K, Silver=80K, Gold=200K, Diamond=500K
- AI models per tier (Free: Groq+Flash, Bronze: +Pro trial, Silver: +Haiku, Gold: +Sonnet, Diamond: all unlimited)
- Edit mode: preserves existing website, only changes what user asks
- Fix Bugs: goes to Build tab, AI fixes bugs without changing design
- Form submissions: contact forms on deployed sites email the site owner automatically
- BlendLink: marketplace, photo minting, casino games, referral program
- Account settings, GitHub integration, PWA installable app

Pricing details if asked:
- Free: 2K BL/day, Groq + Gemini Flash, 1 site, basic features
- Bronze ($4.99): 20K BL/day, + Gemini Pro trial, 3 sites, file uploads in Help AI
- Silver ($14.99): 80K BL/day, + Haiku 4.5, 10 sites, badge removal
- Gold ($39.99): 200K BL/day, + Sonnet 4.6, 25 sites, PWA support, priority
- Diamond ($99.99): 500K BL/day, all models unlimited, 100 sites, white-label ready

IMPORTANT: You are a ZapCodes/BlendLink specialist. Keep answers focused on helping users succeed with these platforms. If asked about unrelated topics, briefly answer but gently redirect to how you can help with their ZapCodes projects.`;

const ADMIN_SYSTEM_PROMPT = `You are ZapCodes Admin AI — an unrestricted advanced assistant for the platform administrator. You can:
- Answer ANY question on ANY topic (tech, business, strategy, coding, marketing, legal, etc.)
- Recommend external tools, services, and solutions outside ZapCodes/BlendLink
- Provide detailed technical analysis, architecture advice, code reviews
- Help with business strategy, competitor analysis, pricing, growth tactics
- Assist with debugging, deployment, server configuration, DevOps
- Discuss anything — no topic restrictions

Platform knowledge:
- Stack: Node.js/Express backend, React 19/Vite frontend, MongoDB Atlas, Render + Cloudflare Pages
- AI: Groq (llama-3.3-70b), Gemini 2.5 Flash, Gemini 3.1 Pro, Haiku 4.5, Sonnet 4.6
- Repo: github.com/zapcodesnet/Zapcodes/tree/main/zapcodes-v14-AUTH-FIXED
- Features: AI builder, staging architecture, form submissions, BL Coins, Stripe payments, referral system

Be direct, technical when appropriate, and give your honest opinions. The admin knows what they're doing.`;

// ══════════ GET /api/help/config ══════════
router.get('/config', auth, (req, res) => {
  const tier = req.user.subscription_tier || 'free';
  const isAdmin = req.user.role === 'super-admin';
  const config = HELP_AI_CONFIG[tier] || HELP_AI_CONFIG.free;

  res.json({
    tier, isAdmin,
    canUpload: config.canUpload || isAdmin,
    maxFileSize: isAdmin ? 100 * 1024 * 1024 : config.maxFileSize,
    maxFileSizeMB: isAdmin ? 100 : Math.round(config.maxFileSize / (1024 * 1024)),
    primaryModel: MODEL_DISPLAY[config.primary] || config.primary,
    availableModels: isAdmin ? ADMIN_MODELS.map(m => ({ id: m, name: MODEL_DISPLAY[m] || m })) : null,
  });
});

// ══════════ GET /api/help/history — Load saved conversations ══════════
router.get('/history', auth, (req, res) => {
  const history = req.user.help_chat_history || [];
  res.json({ messages: history });
});

// ══════════ DELETE /api/help/history — Clear conversation history ══════════
router.delete('/history', auth, async (req, res) => {
  try {
    req.user.help_chat_history = [];
    await req.user.save();
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to clear history' }); }
});

// ══════════ POST /api/help/chat — Main chat endpoint with memory ══════════
router.post('/chat', auth, async (req, res) => {
  try {
    const user = req.user;
    const tier = user.subscription_tier || 'free';
    const isAdmin = user.role === 'super-admin';
    const config = HELP_AI_CONFIG[tier] || HELP_AI_CONFIG.free;

    const { message, model: requestedModel, fileData, fileType, fileName } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // ── Select model ──
    let primaryModel = config.primary;
    let fallbackModel = config.fallback;

    // Only admin can override model
    if (isAdmin && requestedModel && ADMIN_MODELS.includes(requestedModel)) {
      primaryModel = requestedModel;
      fallbackModel = null;
    }

    // ── System prompt ──
    const systemPrompt = isAdmin ? ADMIN_SYSTEM_PROMPT : HELP_SYSTEM_PROMPT;

    // ── Load persistent history from DB ──
    const savedHistory = user.help_chat_history || [];
    const recentHistory = savedHistory.slice(-config.maxHistory);

    let userMessage = message;

    // ── Handle file/image upload ──
    if (fileData && fileType && fileName) {
      if (!config.canUpload && !isAdmin) {
        return res.status(403).json({ error: 'File uploads require Bronze tier or higher. Upgrade to unlock!' });
      }
      const rawSize = Math.round(fileData.length * 0.75);
      const maxSize = isAdmin ? 100 * 1024 * 1024 : config.maxFileSize;
      if (rawSize > maxSize) {
        const maxMB = Math.round(maxSize / (1024 * 1024));
        return res.status(413).json({ error: `File too large. Your ${tier} plan allows up to ${maxMB}MB.` });
      }

      if (fileType.startsWith('image/')) {
        if (primaryModel === 'groq') {
          primaryModel = 'gemini-2.5-flash';
          fallbackModel = 'gemini-3.1-pro';
        }
        userMessage = `[User uploaded image: ${fileName}]\n\n${message}`;
      } else {
        try {
          const textContent = Buffer.from(fileData, 'base64').toString('utf-8');
          userMessage = `[User uploaded file: ${fileName}]\n\nFile contents:\n\`\`\`\n${textContent.slice(0, 50000)}\n\`\`\`\n\nUser's question: ${message}`;
        } catch {
          userMessage = `[User uploaded file: ${fileName} — could not read as text]\n\n${message}`;
        }
      }
    }

    // ── Build context with persistent history ──
    let contextPrompt = '';
    if (recentHistory.length > 0) {
      contextPrompt = 'Previous conversation:\n\n';
      contextPrompt += recentHistory.map(m =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`
      ).join('\n\n');
      contextPrompt += `\n\n---\nCurrent message:\nUser: ${userMessage}`;
    } else {
      contextPrompt = userMessage;
    }

    // ── Call AI with fallback ──
    // Opus 4.6 is admin-only and not in callAI() — needs direct callClaude
    async function callHelpModel(model, sys, prompt) {
      if (model === 'opus-4.6') {
        return await callClaude(sys, prompt, {
          model: 'claude-opus-4-0-20250514', maxTokens: 4096,
          label: 'Opus 4.6', noFallback: true,
        });
      }
      return await callAI(sys, prompt, model, 4096);
    }

    let response = null;
    let usedModel = primaryModel;

    try {
      response = await callHelpModel(primaryModel, systemPrompt, contextPrompt);
    } catch (err) {
      console.error(`[HelpAI] Primary ${primaryModel} failed: ${err.message}`);
    }

    if (!response && fallbackModel) {
      usedModel = fallbackModel;
      console.log(`[HelpAI] Falling back ${primaryModel} → ${fallbackModel}`);
      try {
        response = await callHelpModel(fallbackModel, systemPrompt, contextPrompt);
      } catch (err) {
        console.error(`[HelpAI] Fallback ${fallbackModel} also failed: ${err.message}`);
      }
    }

    if (!response) {
      return res.status(500).json({ error: "I'm having trouble right now. Please try again in a moment." });
    }

    // ── Save to persistent history ──
    if (!user.help_chat_history) user.help_chat_history = [];

    // Save user message (without file data to keep DB small)
    user.help_chat_history.push({
      role: 'user',
      content: message + (fileName ? ` [📎 ${fileName}]` : ''),
      timestamp: new Date(),
    });

    // Save AI response
    user.help_chat_history.push({
      role: 'assistant',
      content: response,
      model: MODEL_DISPLAY[usedModel] || usedModel,
      timestamp: new Date(),
    });

    // Trim to max stored messages (admin = unlimited)
    const maxStored = isAdmin ? Infinity : (config.maxStored || 200);
    if (maxStored !== Infinity && user.help_chat_history.length > maxStored) {
      user.help_chat_history = user.help_chat_history.slice(-maxStored);
    }

    await user.save();

    res.json({
      reply: response,
      model: MODEL_DISPLAY[usedModel] || usedModel,
    });

  } catch (err) {
    console.error('[HelpAI] Error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
