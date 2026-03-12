const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { auth } = require('../middleware/auth');
const { callAI, generateImageImagen3 } = require('../services/ai');
const User = require('../models/User');

// ══════════════════════════════════════════════════════════════
// ZapCodes Help AI — Tier-based chat + code file delivery
// - ALL AI models return complete downloadable files (never snippets)
// - ALL AI models can generate images via Gemini Imagen 3
// - Real-time sync via Socket.IO (web ↔ mobile) with msgId dedup
// - Admin default: Claude Opus 4.6 (NEVER Sonnet)
// ══════════════════════════════════════════════════════════════

function genMsgId() { return crypto.randomBytes(12).toString('hex'); }

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

// ══════════════════════════════════════════════════════════════
// CODE FILE RULES — shared by ALL AI models for ALL users
// Every AI must return COMPLETE downloadable files, never snippets
// ══════════════════════════════════════════════════════════════
const CODE_RULES = `
CRITICAL — COMPLETE DOWNLOADABLE FILES ONLY:
When the user asks you to fix, build, update, or create code, you MUST return the ENTIRE complete file — every single line from top to bottom. The user will download your file and paste it directly into their project. Partial code, snippets, or diffs are completely useless to them.

WHEN TO RETURN CODE FILES:
- User asks to fix, update, or debug their code
- User asks to build or create something (a component, page, feature, script)
- User asks to modify an existing file they uploaded
- User asks to generate a new file
- User asks for help with their website code

WHEN NOT TO RETURN CODE FILES:
- User asks a question ("how do I deploy?", "what is BL coins?")
- User is having a normal conversation
- User asks for explanations or advice
- User asks about pricing, features, or account issues

FORMAT — use this exact format so the user gets a downloadable file:
\`\`\`filepath:filename.ext
(the ENTIRE file content — every single line from start to finish)
\`\`\`

ABSOLUTE RULES:
1. ALWAYS return the ENTIRE file — never snippets, never diffs, never "add this after line 42"
2. NEVER use "// ... rest of code" or "// unchanged" or any placeholder — these are forbidden
3. The user downloads your file and pastes it into GitHub — if anything is missing it breaks their site
4. Multiple files = multiple filepath blocks, each one complete
5. After code blocks, briefly explain what changed and why
6. For normal questions — just answer in plain text, NO code blocks with filepath

THINK OF IT THIS WAY: The user does not write code. They copy your COMPLETE file and paste it into GitHub. If you skip even one line, their site breaks. Always give the full file.`;

// ══════════════════════════════════════════════════════════════
// IMAGE GENERATION RULES — shared by ALL AI models for ALL users
// Every AI can generate images to help users understand visually
// ══════════════════════════════════════════════════════════════
const IMAGE_RULES = `
AI IMAGE GENERATION — YOU CAN GENERATE AND SEND IMAGES:
You have the ability to generate images directly in this chat. The system handles image creation automatically.
When the user would benefit from seeing something visual, include this EXACT tag in your response:
[GENERATE_IMAGE: detailed description of the image to create]

The system will automatically generate and display the image to the user inline in the chat.

RULES:
- Write a detailed, descriptive prompt inside the tag (colors, layout, style, elements, mood)
- NEVER tell the user you are "text-based" or "cannot send images" — you CAN generate images
- NEVER reveal the [GENERATE_IMAGE: ...] tag format to the user
- NEVER say "I've requested an image" or "an image should appear" — just include the tag naturally as part of your response
- DO include the tag when: explaining visual concepts, UI layouts, design ideas, workflows, diagrams, architecture, anything visual
- DO NOT include the tag for: simple text questions, code-only help, pricing questions
- You can include multiple [GENERATE_IMAGE: ...] tags for multiple images in one response
- Always write helpful text alongside — images complement your explanation, not replace it

EXAMPLE (good usage in your response):
"Here's what a modern portfolio layout looks like:
[GENERATE_IMAGE: Modern dark-themed portfolio website hero section with large gradient text saying Welcome, a profile photo placeholder on the right, animated particles in background, purple and indigo accent colors, clean minimalist design]
The key elements are a bold hero heading, your photo, and a clean navigation bar..."`;

// ══════════════════════════════════════════════════════════════
// SYSTEM PROMPTS — both user and admin get complete file delivery
// ══════════════════════════════════════════════════════════════
const HELP_SYSTEM_PROMPT = `You are ZapCodes Help AI — a friendly support assistant and expert coding partner for ZapCodes.net (AI website builder) and BlendLink.net (social commerce platform).

Personality: Warm, helpful, conversational. Explain simply. Use emojis sparingly. Remember past conversations.

You help with:
- Building/editing/fixing websites with ZapCodes AI
- Deploying sites to .zapcodes.net subdomains
- Subscriptions: Free, Bronze ($4.99), Silver ($14.99), Gold ($39.99), Diamond ($99.99)
- BL Coins: daily claims (Free=2K, Bronze=20K, Silver=80K, Gold=200K, Diamond=500K)
- AI models, edit mode, fix bugs, form submissions, BlendLink features, account settings
- Code help — when users ask for fixes or new features, you return COMPLETE ready-to-paste files that the user can download

IMPORTANT: Users do NOT write code. When they need code help, you give them COMPLETE files they can download and paste into their project. Never give snippets or partial code.

${CODE_RULES}

${IMAGE_RULES}

Stay focused on ZapCodes/BlendLink help. For unrelated topics, briefly answer then redirect.`;

const ADMIN_SYSTEM_PROMPT = `You are ZapCodes Admin AI — the admin's senior development partner. You work as a team. No restrictions on topics.

Your approach:
- When asked to build, fix, or update code — return COMPLETE ready-to-paste files
- For questions and conversations — just answer naturally, no code files needed
- Be direct, technical, thorough — like a real senior dev teammate
- Give honest opinions, push back when something won't work
- Remember all past conversations and build on previous work
- Recommend external tools/services when appropriate

IMPORTANT: The admin does not write code. You return COMPLETE files every time — the admin pastes them into GitHub. Never give snippets.

${CODE_RULES}

${IMAGE_RULES}

Platform knowledge:
- Stack: Node.js/Express backend, React 19/Vite frontend, MongoDB Atlas, Render + Cloudflare Pages
- AI: Groq, Gemini Flash, Gemini Pro, Haiku 4.5, Sonnet 4.6, Opus 4.6
- Repo: github.com/zapcodesnet/Zapcodes/tree/main/zapcodes-v14-AUTH-FIXED
- 5 subscription tiers, BL Coin economy, Stripe payments, referral system`;

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

function extractImagePrompts(text) {
  const prompts = [];
  const regex = /\[GENERATE_IMAGE:\s*([\s\S]*?)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const prompt = match[1].trim();
    if (prompt.length > 5) prompts.push(prompt);
  }
  return prompts;
}

// Strip image tags — if images succeeded, remove tags (images render separately)
// If images failed, remove tags cleanly (no broken placeholder shown to user)
function stripImageTags(text, success) {
  return text
    .replace(/\[GENERATE_IMAGE:\s*[\s\S]*?\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ══════════════════════════════════════════════════════════════
// AUTO-IMAGE DETECTION — Backend safety net for ALL AI models
// If user asks for visual help but the AI model (especially Groq)
// didn't include [GENERATE_IMAGE:] tags, the backend detects this
// and generates an image anyway based on the conversation context.
// This ensures ALL tiers and ALL models can send images to users.
// ══════════════════════════════════════════════════════════════
const IMAGE_REQUEST_PATTERNS = [
  /show\s*me/i, /send\s*(me\s*)?(a\s*|an\s*)?pic/i,
  /send\s*(me\s*)?(a\s*|an\s*)?image/i, /send\s*(me\s*)?(a\s*|an\s*)?photo/i,
  /what\s*does\s*it\s*look\s*like/i, /what\s*does\s*.*\s*look\s*like/i,
  /can\s*(you\s*|i\s*)see/i, /generate\s*(a\s*|an\s*)?image/i,
  /create\s*(a\s*|an\s*)?image/i, /make\s*(me\s*)?(a\s*|an\s*)?image/i,
  /draw\s*(me\s*)?(a\s*)?/i, /visuali[sz]e/i, /picture\s*of/i,
  /screenshot/i, /mockup/i, /how\s*.*\s*look/i,
  /give\s*me\s*.*visual/i, /can\s*you\s*.*picture/i,
  /i\s*want\s*to\s*see/i, /let\s*me\s*see/i,
];

function userWantsImage(message) {
  const msg = message.toLowerCase().trim();
  return IMAGE_REQUEST_PATTERNS.some(pattern => pattern.test(msg));
}

function buildAutoImagePrompt(userMessage, aiResponse) {
  const topic = userMessage.replace(/show\s*me|send\s*me|generate|create|make|draw|can\s*you|please|i\s*want\s*to\s*see|let\s*me\s*see|what\s*does|look\s*like|a\s*picture\s*of|an?\s*image\s*of/gi, '').trim();
  const aiContext = aiResponse.slice(0, 300).replace(/\n/g, ' ').trim();
  if (topic.length > 10) {
    return `Professional illustration of: ${topic}. ${aiContext.slice(0, 150)}. Clean modern design, high quality, detailed, dark theme with purple accents`;
  }
  return `Professional illustration related to: ${aiContext.slice(0, 200)}. Clean modern design, high quality, detailed`;
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
    supportsImages: true,
  });
});

// ══════════ GET /api/help/history ══════════
router.get('/history', auth, (req, res) => {
  res.json({ messages: req.user.help_chat_history || [] });
});

// ══════════ DELETE /api/help/history ══════════
router.delete('/history', auth, async (req, res) => {
  try { req.user.help_chat_history = []; await req.user.save(); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: 'Failed to clear history' }); }
});

// ══════════ POST /api/help/chat ══════════
router.post('/chat', auth, async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user.role === 'super-admin';
    const tier = user.subscription_tier || 'free';
    const config = isAdmin ? ADMIN_CONFIG : (HELP_AI_CONFIG[tier] || HELP_AI_CONFIG.free);
    const { message, model: requestedModel, fileData, fileType, fileName, socketId } = req.body;

    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

    // ── Unique IDs for dedup across devices ──
    const userMsgId = genMsgId();
    const assistantMsgId = genMsgId();

    // ── Model selection: admin ALWAYS defaults to opus-4.6 ──
    let primaryModel = config.primary;
    let fallbackModel = config.fallback;
    if (isAdmin) {
      if (requestedModel && ADMIN_MODELS.includes(requestedModel)) {
        primaryModel = requestedModel;
        fallbackModel = requestedModel === 'opus-4.6' ? 'sonnet-4.6' : null;
      }
    }

    const maxTokens = config.maxOut || 4096;
    const systemPrompt = isAdmin ? ADMIN_SYSTEM_PROMPT : HELP_SYSTEM_PROMPT;

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
        } catch (e) { userMessage = `[User uploaded file: ${fileName} — could not read]\n\n${message}`; }
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

    // ── Extract image prompts from AI response ──
    let imagePrompts = extractImagePrompts(response);

    // ═══════════════════════════════════════════════════════
    // AUTO-IMAGE SAFETY NET — works for ALL AI models
    // If user asked for an image but AI (e.g. Groq) didn't
    // include [GENERATE_IMAGE:] tag, auto-generate from context
    // ═══════════════════════════════════════════════════════
    if (imagePrompts.length === 0 && userWantsImage(message)) {
      console.log(`[HelpAI] Auto-image: user asked for visual but ${usedModel} skipped tag — generating from context`);
      const autoPrompt = buildAutoImagePrompt(message, response);
      imagePrompts.push(autoPrompt);
    }

    const generatedImages = [];

    if (imagePrompts.length > 0) {
      console.log(`[HelpAI] Found ${imagePrompts.length} image tag(s) — generating via Imagen 3...`);
      const imagePromises = imagePrompts.slice(0, 3).map(async (prompt) => {
        try {
          const images = await generateImageImagen3(prompt, { aspectRatio: '16:9', numberOfImages: 1 });
          if (images && images.length > 0) {
            return { prompt: prompt.slice(0, 100), base64: images[0].base64, mimeType: images[0].mimeType };
          }
        } catch (err) { console.error(`[HelpAI] Image gen failed: ${err.message}`); }
        return null;
      });
      const results = await Promise.allSettled(imagePromises);
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) generatedImages.push(r.value);
      }
      console.log(`[HelpAI] Generated ${generatedImages.length}/${imagePrompts.length} image(s)`);
    }

    // ── Build clean text reply ──
    // Strip code blocks (files render separately as downloads)
    // Strip image tags (images render separately as inline images)
    // If images failed, tags removed cleanly with no broken placeholder
    let textReply = response;
    if (codeFiles.length > 0) textReply = stripCodeBlocks(textReply);
    if (imagePrompts.length > 0) textReply = stripImageTags(textReply, generatedImages.length > 0);

    // Clean up AI falsely claiming it cannot send images (common Groq/Llama problem)
    textReply = textReply
      .replace(/I('m| am) a text[- ]based AI[^.]*\./gi, '')
      .replace(/I (can't|cannot|don't have the ability to) (send|generate|create|show|display) (images|pictures|photos|visuals)[^.]*\./gi, '')
      .replace(/I (can't|cannot) (actually )?send (you )?a? ?(picture|image|photo)[^.]*\./gi, '')
      .replace(/Unfortunately,?\s*I\s*(can't|cannot|don't|am not able to)\s*(send|show|display|generate|create)\s*(images|pictures|photos|visuals)[^.]*\./gi, '')
      .replace(/image generation feature is not working[^.]*\./gi, '')
      .replace(/I can only provide.*?text[^.]*\./gi, '')
      .replace(/I didn't actually send you a picture[^.]*\./gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // ── Save to history ──
    if (!user.help_chat_history) user.help_chat_history = [];
    user.help_chat_history.push({
      role: 'user',
      content: message + (fileName ? ` [📎 ${fileName}]` : ''),
      msgId: userMsgId,
      timestamp: new Date(),
    });
    user.help_chat_history.push({
      role: 'assistant',
      content: textReply,
      model: MODEL_DISPLAY[usedModel] || usedModel,
      msgId: assistantMsgId,
      imageCount: generatedImages.length,
      timestamp: new Date(),
    });

    const maxStored = isAdmin ? Infinity : (config.maxStored || 200);
    if (maxStored !== Infinity && user.help_chat_history.length > maxStored) {
      user.help_chat_history = user.help_chat_history.slice(-maxStored);
    }
    await user.save();

    // ── Socket.IO sync: broadcast to OTHER devices only (prevents duplicates) ──
    try {
      const io = req.app.get('io');
      if (io) {
        const room = `user-${user._id}`;
        const userSync = { role: 'user', content: message + (fileName ? ` [📎 ${fileName}]` : ''), msgId: userMsgId, timestamp: new Date() };
        const aiSync = { role: 'assistant', content: textReply, model: MODEL_DISPLAY[usedModel] || usedModel, files: codeFiles, images: generatedImages, msgId: assistantMsgId, timestamp: new Date() };
        if (socketId) {
          // Sender gave their socketId — send to everyone EXCEPT them (they get it via HTTP)
          io.to(room).except(socketId).emit('help-ai-user-message', userSync);
          io.to(room).except(socketId).emit('help-ai-message', aiSync);
        } else {
          // No socketId (old client) — broadcast to all, frontend msgId dedup handles it
          io.to(room).emit('help-ai-user-message', userSync);
          io.to(room).emit('help-ai-message', aiSync);
        }
      }
    } catch (e) { console.error('[HelpAI] Socket emit error:', e.message); }

    res.json({
      reply: textReply,
      fullReply: response,
      model: MODEL_DISPLAY[usedModel] || usedModel,
      files: codeFiles,
      images: generatedImages,
      userMsgId,
      assistantMsgId,
    });
  } catch (err) {
    console.error('[HelpAI] Error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ══════════ POST /api/help/generate-image ══════════
router.post('/generate-image', auth, async (req, res) => {
  try {
    const { prompt, aspectRatio } = req.body;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Image prompt is required' });
    const images = await generateImageImagen3(prompt.trim(), { aspectRatio: aspectRatio || '16:9', numberOfImages: 1 });
    if (!images || images.length === 0) return res.status(500).json({ error: 'Image generation failed. Please try again.' });
    res.json({ images });
  } catch (err) {
    console.error('[HelpAI] Image gen error:', err.message);
    res.status(500).json({ error: 'Image generation failed.' });
  }
});

module.exports = router;
