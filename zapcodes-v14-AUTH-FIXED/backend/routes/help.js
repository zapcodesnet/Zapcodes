const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { callAI } = require('../services/ai');
const User = require('../models/User');

// ══════════════════════════════════════════════════════════════
// ZapCodes Help AI — Tier-based chat + code file delivery
// - Persistent conversations in MongoDB
// - AI returns downloadable complete code files
// - Real-time sync via Socket.IO (web ↔ mobile)
// - Admin default: Claude Opus 4.6
// ══════════════════════════════════════════════════════════════

const HELP_AI_CONFIG = {
  free:    { primary: 'groq',             fallback: 'gemini-2.5-flash', maxFileSize: 0,                canUpload: false, maxHistory: 20,  maxStored: 200,  maxOut: 2048 },
  bronze:  { primary: 'groq',             fallback: 'gemini-2.5-flash', maxFileSize: 2 * 1024 * 1024,  canUpload: true,  maxHistory: 30,  maxStored: 300,  maxOut: 4096 },
  silver:  { primary: 'gemini-2.5-flash', fallback: 'gemini-3.1-pro',   maxFileSize: 5 * 1024 * 1024,  canUpload: true,  maxHistory: 40,  maxStored: 400,  maxOut: 8192 },
  gold:    { primary: 'gemini-2.5-flash', fallback: 'gemini-3.1-pro',   maxFileSize: 10 * 1024 * 1024, canUpload: true,  maxHistory: 40,  maxStored: 500,  maxOut: 16384 },
  diamond: { primary: 'gemini-3.1-pro',   fallback: 'sonnet-4.6',       maxFileSize: 25 * 1024 * 1024, canUpload: true,  maxHistory: 50,  maxStored: 1000, maxOut: 16384 },
};

const ADMIN_CONFIG = {
  primary: 'opus-4.6', fallback: 'sonnet-4.6',
  maxFileSize: 100 * 1024 * 1024, canUpload: true,
  maxHistory: 100, maxStored: Infinity, maxOut: 32000,
};

const MODEL_DISPLAY = {
  'groq': 'Groq AI', 'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3.1-pro': 'Gemini 3.1 Pro', 'sonnet-4.6': 'Sonnet 4.6',
  'haiku-4.5': 'Haiku 4.5', 'opus-4.6': 'Claude Opus 4.6',
};

const ADMIN_MODELS = ['opus-4.6', 'sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];

// ── Code file instructions (appended to all system prompts) ──
const CODE_RULES = `
WHEN TO RETURN CODE FILES:
ONLY return code files when the user EXPLICITLY asks you to:
- Fix, update, or debug their code
- Build or create something (a component, page, feature, script)
- Modify an existing file they uploaded
- Generate a new file

Do NOT return code files when the user is:
- Asking a question ("how do I deploy?", "what is BL coins?")
- Having a normal conversation
- Asking for explanations or advice
- Asking about pricing, features, or account issues

When you DO return code files, format them as:
\`\`\`filepath:filename.ext
(entire file content — every single line)
\`\`\`

Code file rules:
1. Return the ENTIRE file — not snippets, not diffs, not "add this after line 42"
2. NEVER use "// ... rest of code" or "// unchanged" or any placeholder
3. The user copies your file and pastes it into GitHub. Partial code = useless
4. Multiple files = multiple filepath blocks
5. After code blocks, briefly explain what changed and why
6. For normal questions — just answer in plain text, NO code blocks with filepath`;

const HELP_SYSTEM_PROMPT = `You are ZapCodes Help AI — a friendly support assistant and coding partner for ZapCodes.net (AI website builder) and BlendLink.net (social commerce platform).

Personality: Warm, helpful, conversational. Explain simply. Use emojis sparingly. Remember past conversations.

You help with:
- Building/editing/fixing websites with ZapCodes AI
- Deploying sites to .zapcodes.net subdomains
- Subscriptions: Free, Bronze ($4.99), Silver ($14.99), Gold ($39.99), Diamond ($99.99)
- BL Coins: daily claims (Free=2K, Bronze=20K, Silver=80K, Gold=200K, Diamond=500K)
- AI models, edit mode, fix bugs, form submissions, BlendLink features, account settings
- Code help — when users ask for fixes or new features, return complete ready-to-paste files

${CODE_RULES}

Stay focused on ZapCodes/BlendLink help. For unrelated topics, briefly answer then redirect.`;

const ADMIN_SYSTEM_PROMPT = `You are ZapCodes Admin AI — the admin's senior development partner. You work as a team. No restrictions on topics.

Your approach:
- When asked to build, fix, or update code — return COMPLETE ready-to-paste files
- For questions and conversations — just answer naturally, no code files needed
- Be direct, technical, thorough — like a real senior dev teammate
- Give honest opinions, push back when something won't work
- Remember all past conversations and build on previous work
- Recommend external tools/services when appropriate

${CODE_RULES}

Platform knowledge:
- Stack: Node.js/Express backend, React 19/Vite frontend, MongoDB Atlas, Render + Cloudflare Pages
- AI: Groq, Gemini Flash, Gemini Pro, Haiku 4.5, Sonnet 4.6, Opus 4.6
- Repo: github.com/zapcodesnet/Zapcodes/tree/main/zapcodes-v14-AUTH-FIXED
- 5 subscription tiers, BL Coin economy, Stripe payments, referral system
- The admin does not write code — you return complete files, admin pastes into GitHub`;

// ── Extract code files from AI response ──
function extractCodeFiles(text) {
  const files = [];
  const p1 = /```filepath:([^\n]+)\n([\s\S]*?)```/g;
  let m;
  while ((m = p1.exec(text)) !== null) {
    if (m[1].trim() && m[2].trim().length > 5) files.push({ name: m[1].trim(), content: m[2].trim() });
  }
  if (files.length) return files;
  const p2 = /```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|python|py|bash|sh|text|markdown|md)?\s+([^\n`]+\.[a-z]{1,6})\n([\s\S]*?)```/g;
  while ((m = p2.exec(text)) !== null) {
    if (m[1].trim() && m[2].trim().length > 5) files.push({ name: m[1].trim(), content: m[2].trim() });
  }
  return files;
}

function stripCodeBlocks(text) {
  return text
    .replace(/```filepath:[^\n]+\n[\s\S]*?```/g, '[📄 File attached below]')
    .replace(/```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|python|py|bash|sh|text|markdown|md)?\s+[^\n`]+\.[a-z]{1,6}\n[\s\S]*?```/g, '[📄 File attached below]')
    .replace(/\[📄 File attached below\](\s*\[📄 File attached below\])+/g, '[📄 Files attached below]')
    .trim();
}

// ══════════ GET /api/help/config ══════════
router.get('/config', auth, (req, res) => {
  const tier = req.user.subscription_tier || 'free';
  const isAdmin = req.user.role === 'super-admin';
  const config = isAdmin ? ADMIN_CONFIG : (HELP_AI_CONFIG[tier] || HELP_AI_CONFIG.free);
  res.json({
    tier, isAdmin,
    canUpload: config.canUpload,
    maxFileSize: config.maxFileSize,
    maxFileSizeMB: Math.round(config.maxFileSize / (1024 * 1024)),
    primaryModel: MODEL_DISPLAY[config.primary] || config.primary,
    defaultModel: isAdmin ? 'opus-4.6' : null,
    availableModels: isAdmin ? ADMIN_MODELS.map(m => ({ id: m, name: MODEL_DISPLAY[m] || m })) : null,
  });
});

// ══════════ GET /api/help/history ══════════
router.get('/history', auth, (req, res) => {
  res.json({ messages: req.user.help_chat_history || [] });
});

// ══════════ DELETE /api/help/history ══════════
router.delete('/history', auth, async (req, res) => {
  try { req.user.help_chat_history = []; await req.user.save(); res.json({ success: true }); }
  catch { res.status(500).json({ error: 'Failed to clear history' }); }
});

// ══════════ POST /api/help/chat ══════════
router.post('/chat', auth, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'super-admin';
    const tier = user.subscription_tier || 'free';
    const config = isAdmin ? ADMIN_CONFIG : (HELP_AI_CONFIG[tier] || HELP_AI_CONFIG.free);
    const { message, model: requestedModel, fileData, fileType, fileName } = req.body;

    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

    // ── Model selection (admin defaults to Opus 4.6) ──
    let primaryModel = config.primary;
    let fallbackModel = config.fallback;
    if (isAdmin && requestedModel && ADMIN_MODELS.includes(requestedModel)) {
      primaryModel = requestedModel;
      fallbackModel = null;
    }

    const maxTokens = config.maxOut || 4096;
    const systemPrompt = isAdmin ? ADMIN_SYSTEM_PROMPT : HELP_SYSTEM_PROMPT;

    // ── Persistent history ──
    const recentHistory = (user.help_chat_history || []).slice(-config.maxHistory);
    let userMessage = message;

    // ── File upload ──
    if (fileData && fileType && fileName) {
      if (!config.canUpload) return res.status(403).json({ error: 'File uploads require Bronze tier or higher.' });
      const rawSize = Math.round(fileData.length * 0.75);
      if (rawSize > config.maxFileSize) return res.status(413).json({ error: `File too large. Max ${Math.round(config.maxFileSize / (1024 * 1024))}MB for ${tier}.` });

      if (fileType.startsWith('image/')) {
        if (primaryModel === 'groq') { primaryModel = 'gemini-2.5-flash'; fallbackModel = 'gemini-3.1-pro'; }
        userMessage = `[User uploaded image: ${fileName}]\n\n${message}`;
      } else {
        try {
          const text = Buffer.from(fileData, 'base64').toString('utf-8');
          userMessage = `[User uploaded file: ${fileName}]\n\nFile contents:\n\`\`\`\n${text.slice(0, 80000)}\n\`\`\`\n\nUser's request: ${message}`;
        } catch { userMessage = `[User uploaded file: ${fileName} — could not read]\n\n${message}`; }
      }
    }

    // ── Build context ──
    let contextPrompt = '';
    if (recentHistory.length > 0) {
      contextPrompt = 'Previous conversation:\n\n' +
        recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 800)}`).join('\n\n') +
        `\n\n---\nCurrent message:\nUser: ${userMessage}`;
    } else {
      contextPrompt = userMessage;
    }

    // ── Call AI ──
    let response = null;
    let usedModel = primaryModel;

    try { response = await callAI(systemPrompt, contextPrompt, primaryModel, maxTokens); }
    catch (err) { console.error(`[HelpAI] Primary ${primaryModel} failed: ${err.message}`); }

    if (!response && fallbackModel) {
      usedModel = fallbackModel;
      console.log(`[HelpAI] Falling back ${primaryModel} → ${fallbackModel}`);
      try { response = await callAI(systemPrompt, contextPrompt, fallbackModel, maxTokens); }
      catch (err) { console.error(`[HelpAI] Fallback also failed: ${err.message}`); }
    }

    if (!response) return res.status(500).json({ error: "I'm having trouble right now. Please try again in a moment." });

    // ── Extract code files ──
    const codeFiles = extractCodeFiles(response);
    const textReply = codeFiles.length > 0 ? stripCodeBlocks(response) : response;

    // ── Save history ──
    if (!user.help_chat_history) user.help_chat_history = [];
    user.help_chat_history.push({ role: 'user', content: message + (fileName ? ` [📎 ${fileName}]` : ''), timestamp: new Date() });
    user.help_chat_history.push({ role: 'assistant', content: response, model: MODEL_DISPLAY[usedModel] || usedModel, timestamp: new Date() });

    const maxStored = isAdmin ? Infinity : (config.maxStored || 200);
    if (maxStored !== Infinity && user.help_chat_history.length > maxStored) {
      user.help_chat_history = user.help_chat_history.slice(-maxStored);
    }
    await user.save();

    // ── Real-time sync to all user devices via Socket.IO ──
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user-${user._id}`).emit('help-ai-message', {
          role: 'assistant', content: textReply,
          model: MODEL_DISPLAY[usedModel] || usedModel,
          files: codeFiles, timestamp: new Date(),
        });
      }
    } catch {}

    res.json({
      reply: textReply,
      fullReply: response,
      model: MODEL_DISPLAY[usedModel] || usedModel,
      files: codeFiles,
    });
  } catch (err) {
    console.error('[HelpAI] Error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
