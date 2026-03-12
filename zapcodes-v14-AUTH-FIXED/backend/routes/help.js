const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { auth } = require('../middleware/auth');
const { callAI, callAIWithImage, generateImageImagen3, testImageGeneration } = require('../services/ai');
const User = require('../models/User');

// ══════════════════════════════════════════════════════════════
// ZapCodes Help AI
// - Admin: separate chat per model + auto-failover + history migration
// - ALL AI can see uploaded images via vision API
// - Image generation via Imagen 3 (silent — no promises to user)
// ══════════════════════════════════════════════════════════════

function genMsgId() { return crypto.randomBytes(12).toString('hex'); }

// ── Failure tracking ──
const failureTracker = new Map();
const fallbackTracker = new Map();
const FAILURE_EXPIRY = 10 * 60 * 1000;
function getFailures(uid, m) { const d = failureTracker.get(`${uid}-${m}`); if (!d) return 0; if (Date.now() - d.ts > FAILURE_EXPIRY) { failureTracker.delete(`${uid}-${m}`); return 0; } return d.count; }
function addFailure(uid, m) { const k = `${uid}-${m}`; const d = failureTracker.get(k) || { count: 0, ts: Date.now() }; d.count++; d.ts = Date.now(); failureTracker.set(k, d); return d.count; }
function resetFailure(uid, m) { failureTracker.delete(`${uid}-${m}`); }
function setLastFallback(uid, from, to) { fallbackTracker.set(`${uid}-${from}`, { to, ts: Date.now() }); }
function getLastFallback(uid, from) { const d = fallbackTracker.get(`${uid}-${from}`); if (!d || Date.now() - d.ts > 30 * 60 * 1000) return null; return d.to; }
function clearLastFallback(uid, from) { fallbackTracker.delete(`${uid}-${from}`); }

const ADMIN_CHAIN = ['opus-4.6', 'sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];
const TIER_CHAINS = { free: ['groq', 'gemini-2.5-flash'], bronze: ['groq', 'gemini-2.5-flash'], silver: ['gemini-2.5-flash', 'gemini-3.1-pro'], gold: ['gemini-2.5-flash', 'gemini-3.1-pro'], diamond: ['gemini-3.1-pro', 'sonnet-4.6'] };
function getNextInChain(chain, cur) { const i = chain.indexOf(cur); return (i >= 0 && i < chain.length - 1) ? chain[i + 1] : null; }

// ── Per-tier config (maxHistory = context window, maxStored = total saved in DB) ──
const HELP_AI_CONFIG = {
  free:    { primary: 'groq',             maxFileSize: 0,                canUpload: false, maxHistory: 20,  maxStored: 200,  maxOut: 2048 },
  bronze:  { primary: 'groq',             maxFileSize: 2 * 1024 * 1024,  canUpload: true,  maxHistory: 30,  maxStored: 300,  maxOut: 4096 },
  silver:  { primary: 'gemini-2.5-flash', maxFileSize: 5 * 1024 * 1024,  canUpload: true,  maxHistory: 40,  maxStored: 400,  maxOut: 8192 },
  gold:    { primary: 'gemini-2.5-flash', maxFileSize: 10 * 1024 * 1024, canUpload: true,  maxHistory: 40,  maxStored: 500,  maxOut: 16384 },
  diamond: { primary: 'gemini-3.1-pro',   maxFileSize: 25 * 1024 * 1024, canUpload: true,  maxHistory: 50,  maxStored: 1000, maxOut: 16384 },
};
const ADMIN_CONFIG = { primary: 'opus-4.6', maxFileSize: 100 * 1024 * 1024, canUpload: true, maxHistory: 100, maxStored: 5000, maxOut: 32000 };
const MODEL_DISPLAY = { 'groq': 'Groq AI', 'gemini-2.5-flash': 'Gemini 2.5 Flash', 'gemini-3.1-pro': 'Gemini 3.1 Pro', 'sonnet-4.6': 'Sonnet 4.6', 'haiku-4.5': 'Haiku 4.5', 'opus-4.6': 'Claude Opus 4.6' };
const ADMIN_MODELS = ['opus-4.6', 'sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];

// ── System prompts — NO broken image promises ──
const CODE_RULES = `\nCRITICAL — COMPLETE DOWNLOADABLE FILES ONLY:\nWhen asked to fix/build/create code, return the ENTIRE file. Users download and paste into GitHub. Never snippets.\nFormat: \`\`\`filepath:filename.ext\n(entire file)\n\`\`\`\nRules: 1. ENTIRE file 2. NEVER "// ... rest of code" 3. Multiple files = multiple blocks 4. Normal questions = plain text`;

const HELP_SYSTEM_PROMPT = `You are ZapCodes Help AI — friendly support for ZapCodes.net and BlendLink.net. Users don't write code — give them COMPLETE downloadable files. Remember conversation history and build on previous discussions.${CODE_RULES}\n\nIMAGE ANALYSIS: When a user uploads an image/screenshot, you can see it directly. Analyze it, read text, find bugs, describe layouts.\n\nHelp with: websites, deploying, subscriptions (Free/Bronze $4.99/Silver $14.99/Gold $39.99/Diamond $99.99), BL Coins (Free=2K/Bronze=20K/Silver=80K/Gold=200K/Diamond=500K daily), AI models, BlendLink features.`;

const ADMIN_SYSTEM_PROMPT = `You are ZapCodes Admin AI — senior dev partner. No restrictions. Admin doesn't write code — return COMPLETE files. Remember all conversation history and build on previous work.${CODE_RULES}\n\nIMAGE ANALYSIS: When admin uploads images/screenshots, analyze them directly — read code, find bugs, describe UI.\n\nPlatform: Node.js/Express, React 19/Vite, MongoDB Atlas, Render + Cloudflare Pages. AI: Groq, Gemini Flash/Pro, Haiku, Sonnet, Opus. 5 tiers, BL Coins, Stripe.`;

// ── Helpers ──
function extractCodeFiles(text) { const files = []; let m; const p1 = /```filepath:([^\n]+)\n([\s\S]*?)```/g; while ((m = p1.exec(text))) { if (m[1].trim() && m[2].trim().length > 5) files.push({ name: m[1].trim(), content: m[2].trim() }); } if (files.length) return files; const p2 = /```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|python|py|bash|sh|text|markdown|md)?\s+([^\n`]+\.[a-z]{1,6})\n([\s\S]*?)```/g; while ((m = p2.exec(text))) { if (m[1].trim() && m[2].trim().length > 5) files.push({ name: m[1].trim(), content: m[2].trim() }); } return files; }
function stripCodeBlocks(t) { return t.replace(/```filepath:[^\n]+\n[\s\S]*?```/g, '[📄 File attached below]').replace(/```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|python|py|bash|sh|text|markdown|md)?\s+[^\n`]+\.[a-z]{1,6}\n[\s\S]*?```/g, '[📄 File attached below]').replace(/\[📄 File attached below\](\s*\[📄 File attached below\])+/g, '[📄 Files attached below]').trim(); }
function extractImagePrompts(t) { const p = []; let m; const r = /\[GENERATE_IMAGE:\s*([\s\S]*?)\]/g; while ((m = r.exec(t))) { if (m[1].trim().length > 5) p.push(m[1].trim()); } return p; }
function stripImageTags(t) { return t.replace(/\[GENERATE_IMAGE:\s*[\s\S]*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim(); }

function buildCrossModelContext(msgs, fromKey, limit) {
  const recent = msgs.slice(-(limit || 20));
  if (!recent.length) return '';
  const name = MODEL_DISPLAY[fromKey] || fromKey;
  return `\n[HIDDEN CONTEXT — Recent conversation with ${name}. Continue helping naturally:]\n` + recent.map(m => `${m.role === 'user' ? 'User' : name}: ${m.content.slice(0, 600)}`).join('\n') + `\n[END HIDDEN CONTEXT]\n\n`;
}

// ══════════════════════════════════════════════════════════════
// ADMIN HISTORY — Per-model with migration from old shared history
// Old data lives in user.help_chat_history (array)
// New data lives in user.help_chat_histories (object keyed by model)
// First access migrates old → new automatically
// ══════════════════════════════════════════════════════════════
function getAdminHistory(user, modelKey) {
  if (!user.help_chat_histories) user.help_chat_histories = {};

  // If this model has per-model history, return it
  if (user.help_chat_histories[modelKey] && user.help_chat_histories[modelKey].length > 0) {
    return user.help_chat_histories[modelKey];
  }

  // ── MIGRATION: If old shared history exists and no per-model history yet ──
  // Move old shared history to the default model (opus-4.6)
  if (modelKey === 'opus-4.6' && user.help_chat_history && user.help_chat_history.length > 0) {
    const hasAnyPerModel = Object.values(user.help_chat_histories).some(arr => arr && arr.length > 0);
    if (!hasAnyPerModel) {
      console.log(`[HelpAI] Migrating ${user.help_chat_history.length} old messages to opus-4.6 per-model history`);
      user.help_chat_histories['opus-4.6'] = [...user.help_chat_history];
      user.markModified('help_chat_histories');
      return user.help_chat_histories['opus-4.6'];
    }
  }

  return [];
}

function setAdminHistory(user, modelKey, msgs) {
  if (!user.help_chat_histories) user.help_chat_histories = {};
  user.help_chat_histories[modelKey] = msgs;
  user.markModified('help_chat_histories');
}

async function processResponse(response) {
  const codeFiles = extractCodeFiles(response);
  const imagePrompts = extractImagePrompts(response);
  const generatedImages = [];
  // Silently attempt image generation — don't promise anything to user
  if (imagePrompts.length > 0) {
    console.log(`[HelpAI] Found ${imagePrompts.length} image tag(s) — attempting Imagen 3...`);
    const results = await Promise.allSettled(imagePrompts.slice(0, 3).map(async (p) => {
      try { const imgs = await generateImageImagen3(p, { aspectRatio: '16:9', numberOfImages: 1 }); if (imgs?.length) return { prompt: p.slice(0, 100), base64: imgs[0].base64, mimeType: imgs[0].mimeType }; } catch (e) { console.error(`[HelpAI] Image gen error: ${e.message}`); }
      return null;
    }));
    for (const r of results) { if (r.status === 'fulfilled' && r.value) generatedImages.push(r.value); }
    if (generatedImages.length > 0) console.log(`[HelpAI] Generated ${generatedImages.length} image(s)`);
    else console.warn(`[HelpAI] Image generation failed for all ${imagePrompts.length} prompt(s)`);
  }
  let textReply = response;
  if (codeFiles.length > 0) textReply = stripCodeBlocks(textReply);
  if (imagePrompts.length > 0) textReply = stripImageTags(textReply);
  return { textReply, codeFiles, generatedImages };
}

// ══════════ ROUTES ══════════

router.get('/config', auth, (req, res) => {
  const tier = req.user.subscription_tier || 'free';
  const isAdmin = req.user.role === 'super-admin';
  const config = isAdmin ? ADMIN_CONFIG : (HELP_AI_CONFIG[tier] || HELP_AI_CONFIG.free);
  res.json({ tier, isAdmin, canUpload: config.canUpload, maxFileSize: config.maxFileSize, maxFileSizeMB: Math.round(config.maxFileSize / (1024 * 1024)), primaryModel: MODEL_DISPLAY[config.primary] || config.primary, defaultModel: isAdmin ? 'opus-4.6' : null, availableModels: isAdmin ? ADMIN_MODELS.map(m => ({ id: m, name: MODEL_DISPLAY[m] || m })) : null, supportsImages: true, separateHistories: isAdmin });
});

// ── GET /api/help/history — Admin: per-model with migration ──
router.get('/history', auth, (req, res) => {
  if (req.user.role === 'super-admin') {
    const mk = req.query.model || 'opus-4.6';
    const messages = getAdminHistory(req.user, mk);
    return res.json({ messages, model: mk });
  }
  // Non-admin: shared history (unchanged)
  res.json({ messages: req.user.help_chat_history || [] });
});

// ── DELETE /api/help/history — Admin: per-model or all ──
router.delete('/history', auth, async (req, res) => {
  try {
    if (req.user.role === 'super-admin') {
      const mk = req.query.model || 'all';
      if (mk === 'all') {
        req.user.help_chat_histories = {};
        req.user.markModified('help_chat_histories');
        // Also clear old shared history
        req.user.help_chat_history = [];
      } else {
        setAdminHistory(req.user, mk, []);
      }
    } else {
      req.user.help_chat_history = [];
    }
    await req.user.save(); res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ══════════ POST /api/help/chat ══════════
router.post('/chat', auth, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'super-admin';
    const tier = user.subscription_tier || 'free';
    const config = isAdmin ? ADMIN_CONFIG : (HELP_AI_CONFIG[tier] || HELP_AI_CONFIG.free);
    const { message, model: requestedModel, fileData, fileType, fileName, socketId } = req.body;

    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

    const userId = String(user._id);
    const userMsgId = genMsgId();
    const assistantMsgId = genMsgId();

    let targetModel = config.primary;
    if (isAdmin && requestedModel && ADMIN_MODELS.includes(requestedModel)) targetModel = requestedModel;

    const maxTokens = config.maxOut || 4096;
    const systemPrompt = isAdmin ? ADMIN_SYSTEM_PROMPT : HELP_SYSTEM_PROMPT;

    // ── Image upload handling ──
    let userMessage = message;
    let uploadedImages = [];
    let isImageUpload = false;

    if (fileData && fileType && fileName) {
      if (!config.canUpload) return res.status(403).json({ error: 'File uploads require Bronze+.' });
      if (Math.round(fileData.length * 0.75) > config.maxFileSize) return res.status(413).json({ error: 'File too large.' });

      if (fileType.startsWith('image/')) {
        isImageUpload = true;
        uploadedImages = [{ base64: fileData, mimeType: fileType }];
        userMessage = `[User uploaded image: ${fileName}]\n\n${message}`;
        console.log(`[HelpAI] Image: ${fileName} (${Math.round(fileData.length * 0.75 / 1024)}KB) → ${targetModel} vision`);
      } else {
        try { const text = Buffer.from(fileData, 'base64').toString('utf-8'); userMessage = `[User uploaded file: ${fileName}]\n\`\`\`\n${text.slice(0, 80000)}\n\`\`\`\n\nRequest: ${message}`; }
        catch (e) { userMessage = `[Uploaded: ${fileName}]\n\n${message}`; }
      }
    }

    // ── Get this model's history ──
    let ownHistory;
    if (isAdmin) { ownHistory = getAdminHistory(user, targetModel); }
    else { ownHistory = user.help_chat_history || []; }
    const recentHistory = ownHistory.slice(-config.maxHistory);

    // ── Cross-model context ──
    let crossCtx = '';
    const lastFb = getLastFallback(userId, targetModel);
    if (lastFb) {
      let fbMsgs = isAdmin ? getAdminHistory(user, lastFb) : (user.help_chat_history || []).filter(m => m.usedModel === lastFb);
      if (fbMsgs.length > 0) crossCtx = buildCrossModelContext(fbMsgs, lastFb, 20);
    }

    // ── Build context ──
    let contextPrompt = '';
    if (recentHistory.length > 0) {
      contextPrompt = 'Previous conversation:\n\n' + recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 800)}`).join('\n\n') + '\n\n---\n';
    }
    contextPrompt += crossCtx + `Current message:\nUser: ${userMessage}`;

    // ── Call AI ──
    let response = null;
    let usedModel = targetModel;

    try {
      if (isImageUpload) { response = await callAIWithImage(systemPrompt, contextPrompt, uploadedImages, targetModel, maxTokens); }
      else { response = await callAI(systemPrompt, contextPrompt, targetModel, maxTokens); }
    } catch (err) { console.error(`[HelpAI] ${targetModel} failed: ${err.message}`); }

    if (response) {
      resetFailure(userId, targetModel);
      if (lastFb) clearLastFallback(userId, targetModel);
    } else {
      const failCount = addFailure(userId, targetModel);
      if (failCount < 2) {
        const userEntry = { role: 'user', content: message + (fileName ? ` [📎 ${fileName}]` : ''), msgId: userMsgId, timestamp: new Date(), usedModel: targetModel };
        if (isAdmin) { const h = getAdminHistory(user, targetModel); h.push(userEntry); setAdminHistory(user, targetModel, h); }
        else { if (!user.help_chat_history) user.help_chat_history = []; user.help_chat_history.push(userEntry); }
        await user.save();
        return res.status(500).json({ error: `${MODEL_DISPLAY[targetModel] || targetModel} is having trouble. Send again to auto-switch.`, failCount: 1, model: targetModel });
      }

      const chain = isAdmin ? ADMIN_CHAIN : (TIER_CHAINS[tier] || TIER_CHAINS.free);
      let fallbackModel = getNextInChain(chain, targetModel);
      if (fallbackModel && getFailures(userId, fallbackModel) >= 2) fallbackModel = getNextInChain(chain, fallbackModel);
      if (!fallbackModel) return res.status(500).json({ error: 'All AI models unavailable.' });

      console.log(`[HelpAI] Fallback: ${targetModel} → ${fallbackModel}`);
      let transferMsgs = isAdmin ? getAdminHistory(user, targetModel) : (user.help_chat_history || []);
      const transferCtx = buildCrossModelContext(transferMsgs, targetModel, 20);

      let fbOwnHistory = isAdmin ? getAdminHistory(user, fallbackModel) : [];
      let fbContextPrompt = '';
      if (isAdmin && fbOwnHistory.length > 0) fbContextPrompt = 'Your previous conversation:\n\n' + fbOwnHistory.slice(-config.maxHistory).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 800)}`).join('\n\n') + '\n\n---\n';
      else if (!isAdmin && recentHistory.length > 0) fbContextPrompt = 'Previous conversation:\n\n' + recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 800)}`).join('\n\n') + '\n\n---\n';
      fbContextPrompt += transferCtx + `Current message:\nUser: ${userMessage}`;

      try {
        if (isImageUpload) { response = await callAIWithImage(systemPrompt, fbContextPrompt, uploadedImages, fallbackModel, maxTokens); }
        else { response = await callAI(systemPrompt, fbContextPrompt, fallbackModel, maxTokens); }
      } catch (err) { console.error(`[HelpAI] Fallback ${fallbackModel} failed: ${err.message}`); }

      if (!response) return res.status(500).json({ error: 'AI models currently unavailable.' });
      usedModel = fallbackModel;
      setLastFallback(userId, targetModel, fallbackModel);
    }

    // ── Process response ──
    const { textReply, codeFiles, generatedImages } = await processResponse(response);

    // ── Save to history ──
    const autoSwitched = usedModel !== targetModel;
    const userEntry = { role: 'user', content: message + (fileName ? ` [📎 ${fileName}]` : ''), msgId: userMsgId, timestamp: new Date(), usedModel: targetModel };
    const aiEntry = { role: 'assistant', content: textReply, model: MODEL_DISPLAY[usedModel] || usedModel, msgId: assistantMsgId, imageCount: generatedImages.length, timestamp: new Date(), usedModel };

    if (isAdmin) {
      if (autoSwitched) {
        const th = getAdminHistory(user, targetModel); th.push(userEntry); const maxS = ADMIN_CONFIG.maxStored; setAdminHistory(user, targetModel, th.length > maxS ? th.slice(-maxS) : th);
        const fh = getAdminHistory(user, usedModel); fh.push(userEntry, aiEntry); setAdminHistory(user, usedModel, fh.length > maxS ? fh.slice(-maxS) : fh);
      } else {
        const h = getAdminHistory(user, targetModel); h.push(userEntry, aiEntry); const maxS = ADMIN_CONFIG.maxStored; setAdminHistory(user, targetModel, h.length > maxS ? h.slice(-maxS) : h);
      }
    } else {
      if (!user.help_chat_history) user.help_chat_history = [];
      user.help_chat_history.push(userEntry, aiEntry);
      const maxS = config.maxStored || 200;
      if (user.help_chat_history.length > maxS) user.help_chat_history = user.help_chat_history.slice(-maxS);
    }
    await user.save();

    // ── Socket.IO sync ──
    try {
      const io = req.app.get('io');
      if (io) {
        const room = `user-${user._id}`;
        const uSync = { ...userEntry }; const aSync = { ...aiEntry, files: codeFiles, images: generatedImages, activeModel: usedModel, autoSwitched, switchedFrom: autoSwitched ? targetModel : undefined };
        if (socketId) { io.to(room).except(socketId).emit('help-ai-user-message', uSync); io.to(room).except(socketId).emit('help-ai-message', aSync); }
        else { io.to(room).emit('help-ai-user-message', uSync); io.to(room).emit('help-ai-message', aSync); }
      }
    } catch (e) {}

    res.json({
      reply: textReply, fullReply: response, model: MODEL_DISPLAY[usedModel] || usedModel,
      files: codeFiles, images: generatedImages, userMsgId, assistantMsgId,
      activeModel: usedModel, autoSwitched,
      switchedFrom: autoSwitched ? targetModel : undefined,
      switchReason: autoSwitched ? `${MODEL_DISPLAY[targetModel]} unavailable — ${MODEL_DISPLAY[usedModel]} is covering` : undefined,
    });
  } catch (err) {
    console.error('[HelpAI] Error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/generate-image', auth, async (req, res) => {
  try {
    const { prompt, aspectRatio } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt required' });
    const imgs = await generateImageImagen3(prompt.trim(), { aspectRatio: aspectRatio || '16:9', numberOfImages: 1 });
    if (!imgs?.length) return res.status(500).json({ error: 'Image generation failed.' });
    res.json({ images: imgs });
  } catch (e) { res.status(500).json({ error: 'Image generation failed.' }); }
});

router.get('/test-imagen', auth, async (req, res) => {
  try {
    if (req.user.role !== 'super-admin') return res.status(403).json({ error: 'Admin only' });
    const results = await testImageGeneration();
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
