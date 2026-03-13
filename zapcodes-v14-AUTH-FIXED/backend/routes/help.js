const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { auth } = require('../middleware/auth');
const { callAI, callAIWithImage, editImage, generateImageImagen3, testImageGeneration } = require('../services/ai');
const User = require('../models/User');

function genMsgId() { return crypto.randomBytes(12).toString('hex'); }

// ══════════════════════════════════════════════════════════════
// FAILURE TRACKING (in-memory, resets on server restart)
// ══════════════════════════════════════════════════════════════
const failureTracker = new Map();
const fallbackTracker = new Map();
const FAILURE_EXPIRY = 10 * 60 * 1000; // 10 minutes

function getFailures(uid, model) {
  const d = failureTracker.get(`${uid}-${model}`);
  if (!d) return 0;
  if (Date.now() - d.ts > FAILURE_EXPIRY) { failureTracker.delete(`${uid}-${model}`); return 0; }
  return d.count;
}
function addFailure(uid, model) {
  const k = `${uid}-${model}`;
  const d = failureTracker.get(k) || { count: 0, ts: Date.now() };
  d.count++; d.ts = Date.now();
  failureTracker.set(k, d);
  return d.count;
}
function resetFailure(uid, model) { failureTracker.delete(`${uid}-${model}`); }

function setLastFallback(uid, from, to) {
  fallbackTracker.set(`${uid}-${from}`, { to, ts: Date.now() });
}
function getLastFallback(uid, from) {
  const d = fallbackTracker.get(`${uid}-${from}`);
  if (!d || Date.now() - d.ts > 60 * 60 * 1000) return null; // 1hr expiry
  return d.to;
}
function clearLastFallback(uid, from) { fallbackTracker.delete(`${uid}-${from}`); }

// ══════════════════════════════════════════════════════════════
// CHAINS & CONFIG
// ══════════════════════════════════════════════════════════════
const ADMIN_CHAIN = ['opus-4.6', 'sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];

const TIER_CHAINS = {
  free:    ['groq', 'gemini-2.5-flash'],
  bronze:  ['groq', 'gemini-2.5-flash'],
  silver:  ['gemini-2.5-flash', 'gemini-3.1-pro', 'groq'],
  gold:    ['gemini-2.5-flash', 'gemini-3.1-pro', 'groq'],
  diamond: ['gemini-3.1-pro', 'sonnet-4.6', 'gemini-2.5-flash', 'groq'],
};

const HELP_AI_CONFIG = {
  free:    { primary: 'groq',            maxFileSize: 0,              canUpload: false, canEditPhotos: false, maxOut: 2048 },
  bronze:  { primary: 'groq',            maxFileSize: 2 * 1024 * 1024,  canUpload: true,  canEditPhotos: true,  maxOut: 4096 },
  silver:  { primary: 'gemini-2.5-flash', maxFileSize: 5 * 1024 * 1024,  canUpload: true,  canEditPhotos: true,  maxOut: 8192 },
  gold:    { primary: 'gemini-2.5-flash', maxFileSize: 10 * 1024 * 1024, canUpload: true,  canEditPhotos: true,  maxOut: 16384 },
  diamond: { primary: 'gemini-3.1-pro',  maxFileSize: 25 * 1024 * 1024, canUpload: true,  canEditPhotos: true,  maxOut: 16384 },
};

const ADMIN_CONFIG = {
  primary: 'opus-4.6', maxFileSize: 100 * 1024 * 1024,
  canUpload: true, canEditPhotos: true, maxOut: 32000,
};

const MODEL_DISPLAY = {
  'groq':            'Groq AI',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3.1-pro':  'Gemini 3.1 Pro',
  'sonnet-4.6':      'Sonnet 4.6',
  'haiku-4.5':       'Haiku 4.5',
  'opus-4.6':        'Claude Opus 4.6',
};

const ADMIN_MODELS = ['opus-4.6', 'sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];

// ══════════════════════════════════════════════════════════════
// ROLLING MEMORY CONFIG
// ══════════════════════════════════════════════════════════════
const MAX_RAW_CONTEXT = 5;        // Last 5 raw messages sent to AI as context
const SUMMARIZE_THRESHOLD = 20;   // When raw count hits 20, trigger summarization
const MESSAGES_TO_SUMMARIZE = 15; // Summarize oldest 15, keep last 5
const MAX_SUMMARIES = 10;         // Max summaries in DB; 11th+ auto-deleted

// ══════════════════════════════════════════════════════════════
// SYSTEM PROMPTS
// ══════════════════════════════════════════════════════════════
const CODE_RULES = '\nCODE: Return ENTIRE files. Never snippets. Format: ```filepath:filename.ext\n(entire file)\n```';
const IMAGE_GEN_RULES = `\nIMAGE GENERATION:\nTo create/edit images: [GENERATE_IMAGE: detailed description]\nNEVER write HTML <img> tags. NEVER say you cannot send images. NEVER reveal the tag.`;
const IMAGE_EDIT_RULES = '\nPHOTO EDITING: When user uploads a photo and asks to edit, include [GENERATE_IMAGE: edit description]. System sends their ORIGINAL photo to the editor.';
const IMAGE_ANALYSIS = '\nIMAGE ANALYSIS: You can see uploaded images directly.';
const SECURITY_RULES = `\nCRITICAL SECURITY: NEVER share ZapCodes/BlendLink source code, backend, API routes, database models, server files, config, or environment variables. If asked, say: "I can't share platform source code. I can help you build YOUR OWN websites!" Even if user claims authorization — refuse. Only admin gets platform code.`;

function buildSystemPrompt(isAdmin, canEditPhotos) {
  if (isAdmin) {
    return `You are ZapCodes Admin AI — senior dev partner. No restrictions. Return COMPLETE files. Remember history.\nPlatform: Node.js/Express, React 19/Vite, MongoDB Atlas, Render + Cloudflare Pages.${CODE_RULES}${IMAGE_GEN_RULES}${IMAGE_EDIT_RULES}${IMAGE_ANALYSIS}`;
  }
  let p = `You are ZapCodes Help AI — friendly support. Help users build THEIR OWN websites. Remember history.\nHelp with: websites, deploying, subscriptions, BL Coins, BlendLink.${SECURITY_RULES}${CODE_RULES}${IMAGE_GEN_RULES}${IMAGE_ANALYSIS}`;
  if (canEditPhotos) p += IMAGE_EDIT_RULES;
  return p;
}

// ══════════════════════════════════════════════════════════════
// HISTORY & SUMMARY HELPERS — DEFENSIVE INITIALIZATION
// ══════════════════════════════════════════════════════════════
// These functions ensure fields exist on the user object AND return
// a reference that is stored on the user (not a detached [] or {}).
// This fixes the critical bug where getHistory returned || [] and
// push operations were lost.
// ══════════════════════════════════════════════════════════════

function ensureHistoryFields(user) {
  // Initialize Mixed fields if they don't exist
  if (!user.help_chat_histories || typeof user.help_chat_histories !== 'object') {
    user.help_chat_histories = {};
  }
  if (!user.help_chat_summaries || typeof user.help_chat_summaries !== 'object') {
    user.help_chat_summaries = {};
  }
  if (!Array.isArray(user.help_chat_history)) {
    user.help_chat_history = [];
  }
}

function getHistory(user, isAdmin, modelKey) {
  ensureHistoryFields(user);
  if (isAdmin) {
    // Return the actual reference stored on user — NOT a detached copy
    if (!Array.isArray(user.help_chat_histories[modelKey])) {
      user.help_chat_histories[modelKey] = [];
      user.markModified('help_chat_histories');
    }
    return user.help_chat_histories[modelKey];
  }
  return user.help_chat_history;
}

function setHistory(user, isAdmin, modelKey, msgs) {
  ensureHistoryFields(user);
  if (isAdmin) {
    user.help_chat_histories[modelKey] = msgs;
    user.markModified('help_chat_histories');
  } else {
    user.help_chat_history = msgs;
  }
}

function getSummaries(user, isAdmin, modelKey) {
  ensureHistoryFields(user);
  const key = isAdmin ? modelKey : 'default';
  if (!Array.isArray(user.help_chat_summaries[key])) {
    user.help_chat_summaries[key] = [];
    user.markModified('help_chat_summaries');
  }
  return user.help_chat_summaries[key];
}

function setSummaries(user, isAdmin, modelKey, summaries) {
  ensureHistoryFields(user);
  const key = isAdmin ? modelKey : 'default';
  user.help_chat_summaries[key] = summaries;
  user.markModified('help_chat_summaries');
}

// ══════════════════════════════════════════════════════════════
// SUMMARIZATION — Gemini 2.5 Flash compresses 20 msgs → 1 summary
// When raw messages hit 20:
//   → Summarize oldest 15 messages into 1 compressed summary
//   → Keep last 5 raw messages
//   → Max 10 summaries stored; 11th+ auto-deleted (oldest first)
// ══════════════════════════════════════════════════════════════
async function maybeSummarize(user, isAdmin, modelKey) {
  const rawMsgs = getHistory(user, isAdmin, modelKey);
  if (rawMsgs.length < SUMMARIZE_THRESHOLD) return false; // Not enough

  const toSummarize = rawMsgs.slice(0, MESSAGES_TO_SUMMARIZE);
  const toKeep = rawMsgs.slice(MESSAGES_TO_SUMMARIZE);

  // Build text from the 15 messages to summarize
  const summaryInput = toSummarize.map(m =>
    `${m.role === 'user' ? 'User' : 'AI'}: ${(m.content || '').slice(0, 500)}`
  ).join('\n');

  try {
    console.log(`[Summary] Compressing ${toSummarize.length} messages for ${isAdmin ? modelKey : 'user'} via Gemini 2.5 Flash...`);

    const summaryText = await callAI(
      'You are a conversation summarizer. Summarize this conversation between a user and AI assistant in 3-5 concise paragraphs. Include ALL important details: topics discussed, decisions made, code files mentioned, bugs found, solutions provided, and any pending tasks. Be specific with technical details.',
      `Summarize this conversation:\n\n${summaryInput}`,
      'gemini-2.5-flash',
      2048
    );

    if (summaryText && summaryText.length > 50) {
      const summaries = getSummaries(user, isAdmin, modelKey);
      summaries.push({
        text: summaryText,
        messageCount: toSummarize.length,
        createdAt: new Date().toISOString(),
      });

      // Auto-delete oldest if more than MAX_SUMMARIES
      while (summaries.length > MAX_SUMMARIES) {
        summaries.shift();
      }

      setSummaries(user, isAdmin, modelKey, summaries);
      setHistory(user, isAdmin, modelKey, toKeep);

      console.log(`[Summary] OK — ${toSummarize.length} msgs → summary #${summaries.length}. ${toKeep.length} raw kept.`);
      return true;
    } else {
      console.warn('[Summary] Gemini Flash returned empty summary — keeping raw messages');
      return false;
    }
  } catch (err) {
    console.error(`[Summary] Failed: ${err.message} — keeping raw messages`);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// BUILD CONTEXT — Summaries + last 5 raw msgs for AI to read
// This is what gets sent to the AI model as conversation context.
// ══════════════════════════════════════════════════════════════
function buildContextPrompt(user, isAdmin, modelKey, userMessage) {
  const summaries = getSummaries(user, isAdmin, modelKey);
  const rawMsgs = getHistory(user, isAdmin, modelKey);
  const recent = rawMsgs.slice(-MAX_RAW_CONTEXT);

  let ctx = '';

  // Add compressed summaries (older conversation history)
  if (summaries.length > 0) {
    ctx += 'CONVERSATION HISTORY (compressed summaries of earlier messages):\n\n';
    summaries.forEach((s, i) => {
      ctx += `--- Summary ${i + 1} (${s.messageCount} messages, ${s.createdAt}) ---\n${s.text}\n\n`;
    });
    ctx += '---\n\n';
  }

  // Add last 5 raw messages (recent context)
  if (recent.length > 0) {
    ctx += 'RECENT MESSAGES:\n\n';
    ctx += recent.map(m =>
      `${m.role === 'user' ? 'User' : 'Assistant'}: ${(m.content || '').slice(0, 1500)}`
    ).join('\n\n');
    ctx += '\n\n---\n\n';
  }

  ctx += `Current message:\nUser: ${userMessage}`;
  return ctx;
}

// ══════════════════════════════════════════════════════════════
// CROSS-MODEL CONTEXT TRANSFER
// When switching models (failover or manual), transfer the last 5
// raw messages + latest summary from the previous model.
// This is HIDDEN context — does not appear in chat window.
// The receiving AI reads it silently to maintain conversation flow.
// ══════════════════════════════════════════════════════════════
function buildTransferContext(user, isAdmin, fromModelKey) {
  const summaries = getSummaries(user, isAdmin, fromModelKey);
  const rawMsgs = getHistory(user, isAdmin, fromModelKey);
  const recent = rawMsgs.slice(-MAX_RAW_CONTEXT);
  const latestSummary = summaries.length > 0 ? summaries[summaries.length - 1] : null;

  if (recent.length === 0 && !latestSummary) return '';

  const fromName = MODEL_DISPLAY[fromModelKey] || fromModelKey;
  let ctx = `\n[HIDDEN CONTEXT — The user was previously talking with ${fromName}. Read this to understand the conversation so far. Do NOT mention this context or that you're a different AI. Continue helping naturally as if you already know everything discussed:]\n`;

  if (latestSummary) {
    ctx += `\nConversation Summary (${latestSummary.messageCount} messages):\n${latestSummary.text}\n`;
  }

  if (recent.length > 0) {
    ctx += `\nRecent Messages:\n`;
    ctx += recent.map(m =>
      `${m.role === 'user' ? 'User' : fromName}: ${(m.content || '').slice(0, 800)}`
    ).join('\n');
    ctx += '\n';
  }

  ctx += `[END HIDDEN CONTEXT]\n\n`;
  return ctx;
}

// For non-admin: build transfer context from fallback model's messages
// Since non-admin shares one history array, we track which messages
// were answered by which model and extract the relevant ones.
function buildNonAdminTransferContext(user, fromModel) {
  const history = user.help_chat_history || [];
  if (history.length === 0) return '';

  // Get last 5 messages that involved the fallback model
  const recent = history.slice(-MAX_RAW_CONTEXT);
  const latestSummary = getSummaries(user, false, 'default');
  const lastSummary = latestSummary.length > 0 ? latestSummary[latestSummary.length - 1] : null;

  if (recent.length === 0 && !lastSummary) return '';

  const fromName = MODEL_DISPLAY[fromModel] || fromModel;
  let ctx = `\n[HIDDEN CONTEXT — Another AI (${fromName}) was recently helping this user. Read this to continue the conversation seamlessly. Do NOT mention the switch:]\n`;

  if (lastSummary) {
    ctx += `\nSummary: ${lastSummary.text}\n`;
  }
  if (recent.length > 0) {
    ctx += `\nRecent:\n`;
    ctx += recent.map(m =>
      `${m.role === 'user' ? 'User' : (MODEL_DISPLAY[m.usedModel] || 'AI')}: ${(m.content || '').slice(0, 800)}`
    ).join('\n');
    ctx += '\n';
  }

  ctx += `[END HIDDEN CONTEXT]\n\n`;
  return ctx;
}

// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════
function extractCodeFiles(text) {
  const files = [];
  let m;
  const p1 = /```filepath:([^\n]+)\n([\s\S]*?)```/g;
  while ((m = p1.exec(text))) {
    if (m[1].trim() && m[2].trim().length > 5) files.push({ name: m[1].trim(), content: m[2].trim() });
  }
  if (files.length) return files;

  const p2 = /```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|python|py|bash|sh|text|markdown|md)?\s+([^\n`]+\.[a-z]{1,6})\n([\s\S]*?)```/g;
  while ((m = p2.exec(text))) {
    if (m[1].trim() && m[2].trim().length > 5) files.push({ name: m[1].trim(), content: m[2].trim() });
  }
  return files;
}

function stripCodeBlocks(t) {
  return t
    .replace(/```filepath:[^\n]+\n[\s\S]*?```/g, '[📄 File below]')
    .replace(/```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|python|py|bash|sh|text|markdown|md)?\s+[^\n`]+\.[a-z]{1,6}\n[\s\S]*?```/g, '[📄 File below]')
    .replace(/\[📄 File below\](\s*\[📄 File below\])+/g, '[📄 Files below]')
    .trim();
}

function extractImagePrompts(t) {
  const p = [];
  let m;
  const r = /\[GENERATE_IMAGE:\s*([\s\S]*?)\]/g;
  while ((m = r.exec(t))) { if (m[1].trim().length > 5) p.push(m[1].trim()); }
  return p;
}

function stripImageTags(t) {
  return t.replace(/\[GENERATE_IMAGE:\s*[\s\S]*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

async function processResponse(response, uploadedImages, canEditPhotos) {
  const codeFiles = extractCodeFiles(response);
  const imagePrompts = extractImagePrompts(response);
  const generatedImages = [];

  if (imagePrompts.length > 0) {
    const hasUserPhoto = canEditPhotos && uploadedImages?.length > 0;
    const results = await Promise.allSettled(
      imagePrompts.slice(0, 3).map(async (p) => {
        try {
          const imgs = hasUserPhoto
            ? await editImage(uploadedImages[0], p)
            : await generateImageImagen3(p, { aspectRatio: '16:9', numberOfImages: 1 });
          if (imgs?.length) return { prompt: p.slice(0, 100), base64: imgs[0].base64, mimeType: imgs[0].mimeType };
        } catch (e) { /* skip */ }
        return null;
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) generatedImages.push(r.value);
    }
  }

  let textReply = response;
  if (codeFiles.length > 0) textReply = stripCodeBlocks(textReply);
  if (imagePrompts.length > 0) textReply = stripImageTags(textReply);
  return { textReply, codeFiles, generatedImages };
}

async function tryCallAI(sp, cp, imgs, isImg, model, mt) {
  try {
    return isImg
      ? await callAIWithImage(sp, cp, imgs, model, mt)
      : await callAI(sp, cp, model, mt);
  } catch (e) {
    console.error(`[HelpAI] ${model}: ${e.message}`);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// GET /api/help/config
// ══════════════════════════════════════════════════════════════
router.get('/config', auth, (req, res) => {
  const tier = req.user.subscription_tier || 'free';
  const isAdmin = req.user.role === 'super-admin';
  const config = isAdmin ? ADMIN_CONFIG : (HELP_AI_CONFIG[tier] || HELP_AI_CONFIG.free);

  res.json({
    tier,
    isAdmin,
    canUpload: config.canUpload,
    canEditPhotos: config.canEditPhotos,
    maxFileSize: config.maxFileSize,
    maxFileSizeMB: Math.round(config.maxFileSize / (1024 * 1024)),
    primaryModel: MODEL_DISPLAY[config.primary] || config.primary,
    defaultModel: isAdmin ? 'opus-4.6' : null,
    availableModels: isAdmin ? ADMIN_MODELS.map(m => ({ id: m, name: MODEL_DISPLAY[m] || m })) : null,
    supportsImages: true,
    separateHistories: isAdmin,
    // Memory system info
    summarizationEnabled: true,
    summarizeAt: SUMMARIZE_THRESHOLD,
    maxSummaries: MAX_SUMMARIES,
    rawContextWindow: MAX_RAW_CONTEXT,
  });
});

// ══════════════════════════════════════════════════════════════
// GET /api/help/history
// ══════════════════════════════════════════════════════════════
router.get('/history', auth, (req, res) => {
  try {
    const isAdmin = req.user.role === 'super-admin';
    ensureHistoryFields(req.user);

    if (isAdmin) {
      const mk = req.query.model || 'opus-4.6';
      const rawMsgs = getHistory(req.user, true, mk);
      const summaries = getSummaries(req.user, true, mk);
      return res.json({
        messages: rawMsgs,
        summaries: summaries,
        model: mk,
        summaryCount: summaries.length,
        rawCount: rawMsgs.length,
      });
    }

    const rawMsgs = req.user.help_chat_history || [];
    const summaries = getSummaries(req.user, false, 'default');
    res.json({
      messages: rawMsgs,
      summaries: summaries,
      summaryCount: summaries.length,
      rawCount: rawMsgs.length,
    });
  } catch (err) {
    console.error('[HelpAI] History error:', err.message);
    res.json({ messages: [], summaries: [] });
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE /api/help/history
// ══════════════════════════════════════════════════════════════
router.delete('/history', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'super-admin';
    ensureHistoryFields(req.user);

    if (isAdmin) {
      const mk = req.query.model || 'all';
      if (mk === 'all') {
        req.user.help_chat_histories = {};
        req.user.help_chat_summaries = {};
        req.user.help_chat_history = [];
        req.user.markModified('help_chat_histories');
        req.user.markModified('help_chat_summaries');
      } else {
        setHistory(req.user, true, mk, []);
        setSummaries(req.user, true, mk, []);
      }
    } else {
      req.user.help_chat_history = [];
      req.user.help_chat_summaries = { default: [] };
      req.user.markModified('help_chat_summaries');
    }

    await req.user.save();
    res.json({ success: true });
  } catch (err) {
    console.error('[HelpAI] Delete history error:', err.message);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/help/memory-status — Debug endpoint for admin
// ══════════════════════════════════════════════════════════════
router.get('/memory-status', auth, (req, res) => {
  try {
    if (req.user.role !== 'super-admin') return res.status(403).json({ error: 'Admin only' });
    ensureHistoryFields(req.user);

    const status = {};
    for (const model of ADMIN_MODELS) {
      const raw = getHistory(req.user, true, model);
      const sums = getSummaries(req.user, true, model);
      status[model] = {
        rawMessages: raw.length,
        summaries: sums.length,
        totalCompressedMessages: sums.reduce((acc, s) => acc + (s.messageCount || 0), 0),
        willSummarizeAt: SUMMARIZE_THRESHOLD,
        needsSummarization: raw.length >= SUMMARIZE_THRESHOLD,
      };
    }

    res.json({
      memorySystem: 'active',
      config: { SUMMARIZE_THRESHOLD, MESSAGES_TO_SUMMARIZE, MAX_SUMMARIES, MAX_RAW_CONTEXT },
      models: status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/help/chat — Main chat endpoint
// Features: rolling memory, summarization, failover, cross-model transfer
// ══════════════════════════════════════════════════════════════
router.post('/chat', auth, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'super-admin';
    const tier = user.subscription_tier || 'free';
    const config = isAdmin ? ADMIN_CONFIG : (HELP_AI_CONFIG[tier] || HELP_AI_CONFIG.free);
    const canEditPhotos = config.canEditPhotos || false;
    const { message, model: requestedModel, fileData, fileType, fileName, socketId } = req.body;

    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    // Ensure all history fields exist on user object
    ensureHistoryFields(user);

    const userId = String(user._id);
    const userMsgId = genMsgId();
    const assistantMsgId = genMsgId();

    // Determine target model
    let targetModel = config.primary;
    if (isAdmin && requestedModel && ADMIN_MODELS.includes(requestedModel)) {
      targetModel = requestedModel;
    }

    const maxTokens = config.maxOut || 4096;
    const systemPrompt = buildSystemPrompt(isAdmin, canEditPhotos);

    // ── File/Image upload processing ──
    let userMessage = message;
    let uploadedImages = [];
    let isImageUpload = false;

    if (fileData && fileType && fileName) {
      if (!config.canUpload) return res.status(403).json({ error: 'File upload requires Bronze+ subscription.' });
      if (Math.round(fileData.length * 0.75) > config.maxFileSize) return res.status(413).json({ error: 'File too large for your plan.' });

      if (fileType.startsWith('image/')) {
        isImageUpload = true;
        uploadedImages = [{ base64: fileData, mimeType: fileType }];
        userMessage = `[Image: ${fileName}]\n\n${message}`;
      } else {
        try {
          const textContent = Buffer.from(fileData, 'base64').toString('utf-8');
          userMessage = `[File: ${fileName}]\n\`\`\`\n${textContent.slice(0, 80000)}\n\`\`\`\n\nRequest: ${message}`;
        } catch {
          userMessage = `[Uploaded: ${fileName}]\n\n${message}`;
        }
      }
    }

    // ── Build context: summaries + last 5 raw messages ──
    let contextPrompt = buildContextPrompt(user, isAdmin, targetModel, userMessage);

    // ── Cross-model transfer: if a fallback was previously covering, inject its context ──
    const lastFallback = getLastFallback(userId, targetModel);
    if (lastFallback) {
      let transferCtx;
      if (isAdmin) {
        transferCtx = buildTransferContext(user, isAdmin, lastFallback);
      } else {
        transferCtx = buildNonAdminTransferContext(user, lastFallback);
      }
      if (transferCtx) {
        contextPrompt = transferCtx + contextPrompt;
        console.log(`[HelpAI] Injecting transfer context from ${MODEL_DISPLAY[lastFallback]} → ${MODEL_DISPLAY[targetModel]}`);
      }
    }

    // ══════════════════════════════════════════════════════════
    // TRY TARGET MODEL
    // ══════════════════════════════════════════════════════════
    let response = await tryCallAI(systemPrompt, contextPrompt, uploadedImages, isImageUpload, targetModel, maxTokens);
    let usedModel = targetModel;

    if (response) {
      // Success — reset failure counter and clear fallback tracking
      resetFailure(userId, targetModel);
      if (lastFallback) {
        clearLastFallback(userId, targetModel);
        console.log(`[HelpAI] ${MODEL_DISPLAY[targetModel]} back online — cleared fallback to ${MODEL_DISPLAY[lastFallback]}`);
      }
    } else {
      // ── FAILOVER LOGIC ──
      const failCount = addFailure(userId, targetModel);

      if (failCount < 2) {
        // 1st failure — save user message, tell frontend to retry
        const userEntry = {
          role: 'user',
          content: message + (fileName ? ` [📎 ${fileName}]` : ''),
          msgId: userMsgId,
          timestamp: new Date(),
          usedModel: targetModel,
        };
        const hist = getHistory(user, isAdmin, targetModel);
        hist.push(userEntry);
        user.markModified(isAdmin ? 'help_chat_histories' : 'help_chat_history');
        await user.save();

        return res.status(500).json({
          error: `${MODEL_DISPLAY[targetModel] || targetModel} is having trouble. Send your message again to auto-switch to backup.`,
          failCount: 1,
          model: targetModel,
          retry: true,
        });
      }

      // 2nd+ failure — walk the ENTIRE fallback chain
      const chain = isAdmin ? ADMIN_CHAIN : (TIER_CHAINS[tier] || TIER_CHAINS.free);
      const targetIdx = chain.indexOf(targetModel);
      console.log(`[HelpAI] ${MODEL_DISPLAY[targetModel]} failed ${failCount}x — walking chain: ${chain.map(c => MODEL_DISPLAY[c]).join(' → ')}`);

      // Try models AFTER target in chain
      for (let i = targetIdx + 1; i < chain.length; i++) {
        const fallbackModel = chain[i];

        // Build context for fallback: its own history + transfer from failed model
        let fbCtx = buildContextPrompt(user, isAdmin, fallbackModel, userMessage);
        if (isAdmin) {
          const transferCtx = buildTransferContext(user, isAdmin, targetModel);
          if (transferCtx) fbCtx = transferCtx + fbCtx;
        } else {
          const transferCtx = buildNonAdminTransferContext(user, targetModel);
          if (transferCtx) fbCtx = transferCtx + fbCtx;
        }

        response = await tryCallAI(systemPrompt, fbCtx, uploadedImages, isImageUpload, fallbackModel, maxTokens);
        if (response) {
          usedModel = fallbackModel;
          setLastFallback(userId, targetModel, fallbackModel);
          console.log(`[HelpAI] Fallback OK: ${MODEL_DISPLAY[fallbackModel]}`);
          break;
        }
      }

      // Wraparound: try models BEFORE target in chain
      if (!response && targetIdx > 0) {
        for (let i = 0; i < targetIdx; i++) {
          const fallbackModel = chain[i];

          let fbCtx = buildContextPrompt(user, isAdmin, fallbackModel, userMessage);
          if (isAdmin) {
            const transferCtx = buildTransferContext(user, isAdmin, targetModel);
            if (transferCtx) fbCtx = transferCtx + fbCtx;
          } else {
            const transferCtx = buildNonAdminTransferContext(user, targetModel);
            if (transferCtx) fbCtx = transferCtx + fbCtx;
          }

          response = await tryCallAI(systemPrompt, fbCtx, uploadedImages, isImageUpload, fallbackModel, maxTokens);
          if (response) {
            usedModel = fallbackModel;
            setLastFallback(userId, targetModel, fallbackModel);
            console.log(`[HelpAI] Fallback (wrap) OK: ${MODEL_DISPLAY[fallbackModel]}`);
            break;
          }
        }
      }

      if (!response) {
        return res.status(500).json({ error: 'All AI models are currently unavailable. Please try again in a few minutes.' });
      }
    }

    // ── Process response (extract code files, generate images) ──
    const { textReply, codeFiles, generatedImages } = await processResponse(response, uploadedImages, canEditPhotos);

    // ── Save messages to history ──
    const autoSwitched = usedModel !== targetModel;

    const userEntry = {
      role: 'user',
      content: message + (fileName ? ` [📎 ${fileName}]` : ''),
      msgId: userMsgId,
      timestamp: new Date(),
      usedModel: targetModel,
    };

    const assistantEntry = {
      role: 'assistant',
      content: textReply,
      model: MODEL_DISPLAY[usedModel] || usedModel,
      msgId: assistantMsgId,
      imageCount: generatedImages.length,
      fileCount: codeFiles.length,
      timestamp: new Date(),
      usedModel,
    };

    if (isAdmin) {
      // Admin: separate histories per model
      if (autoSwitched) {
        // Save user message in the TARGET model's history (so it knows what was asked)
        const targetHist = getHistory(user, true, targetModel);
        targetHist.push(userEntry);

        // Save both user message + AI reply in the FALLBACK model's history
        const fallbackHist = getHistory(user, true, usedModel);
        fallbackHist.push(userEntry, assistantEntry);
      } else {
        // Normal: save both in target model's history
        const hist = getHistory(user, true, targetModel);
        hist.push(userEntry, assistantEntry);
      }
      user.markModified('help_chat_histories');
    } else {
      // Non-admin: single shared history
      if (!Array.isArray(user.help_chat_history)) user.help_chat_history = [];
      user.help_chat_history.push(userEntry, assistantEntry);
    }

    // ── Summarize if raw messages hit threshold ──
    // Run SYNCHRONOUSLY before save to avoid race conditions
    const saveModelKey = autoSwitched ? usedModel : targetModel;
    const currentRaw = getHistory(user, isAdmin, saveModelKey);

    if (currentRaw.length >= SUMMARIZE_THRESHOLD) {
      try {
        console.log(`[HelpAI] Raw messages (${currentRaw.length}) >= ${SUMMARIZE_THRESHOLD} — triggering summarization...`);
        await maybeSummarize(user, isAdmin, saveModelKey);
      } catch (err) {
        console.error(`[HelpAI] Summarization error (non-fatal): ${err.message}`);
      }
    }

    // Also check the other model's history if auto-switched (admin only)
    if (isAdmin && autoSwitched) {
      const targetRaw = getHistory(user, true, targetModel);
      if (targetRaw.length >= SUMMARIZE_THRESHOLD) {
        try {
          await maybeSummarize(user, true, targetModel);
        } catch (err) {
          console.error(`[HelpAI] Target summarization error (non-fatal): ${err.message}`);
        }
      }
    }

    // ── Save user to MongoDB ──
    await user.save();

    // ── Socket.IO cross-device sync ──
    try {
      const io = req.app.get('io');
      if (io) {
        const room = `user-${user._id}`;
        if (socketId) {
          // Emit to all OTHER devices (exclude sender)
          io.to(room).except(socketId).emit('help-ai-user-message', userEntry);
          io.to(room).except(socketId).emit('help-ai-message', {
            ...assistantEntry,
            files: codeFiles,
            images: generatedImages,
            activeModel: usedModel,
            autoSwitched,
            switchedFrom: autoSwitched ? targetModel : undefined,
          });
        }

        // If auto-switched admin, emit model switch event
        if (isAdmin && autoSwitched) {
          io.to(room).emit('help-ai-model-switch', {
            from: targetModel,
            fromName: MODEL_DISPLAY[targetModel],
            to: usedModel,
            toName: MODEL_DISPLAY[usedModel],
            reason: `${MODEL_DISPLAY[targetModel]} unavailable`,
          });
        }
      }
    } catch (socketErr) {
      console.error('[HelpAI] Socket.IO error (non-fatal):', socketErr.message);
    }

    // ── Return response ──
    res.json({
      reply: textReply,
      fullReply: response,
      model: MODEL_DISPLAY[usedModel] || usedModel,
      files: codeFiles,
      images: generatedImages,
      userMsgId,
      assistantMsgId,
      activeModel: usedModel,
      autoSwitched,
      switchedFrom: autoSwitched ? targetModel : undefined,
      switchReason: autoSwitched
        ? `${MODEL_DISPLAY[targetModel]} unavailable — ${MODEL_DISPLAY[usedModel]} covering`
        : undefined,
    });
  } catch (err) {
    console.error('[HelpAI] Chat error:', err.message, err.stack?.slice(0, 300));
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/help/generate-image
// ══════════════════════════════════════════════════════════════
router.post('/generate-image', auth, async (req, res) => {
  try {
    const { prompt, aspectRatio } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt required' });
    const imgs = await generateImageImagen3(prompt.trim(), {
      aspectRatio: aspectRatio || '16:9',
      numberOfImages: 1,
    });
    if (!imgs?.length) return res.status(500).json({ error: 'Image generation failed.' });
    res.json({ images: imgs });
  } catch (err) {
    console.error('[HelpAI] Image gen error:', err.message);
    res.status(500).json({ error: 'Image generation failed.' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/help/test-imagen — Admin only
// ══════════════════════════════════════════════════════════════
router.get('/test-imagen', auth, async (req, res) => {
  try {
    if (req.user.role !== 'super-admin') return res.status(403).json({ error: 'Admin only' });
    res.json(await testImageGeneration());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
