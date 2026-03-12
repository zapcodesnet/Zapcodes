const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { auth } = require('../middleware/auth');
const { callAI, generateImageImagen3 } = require('../services/ai');
const User = require('../models/User');

// ══════════════════════════════════════════════════════════════
// ZapCodes Help AI — Tier-based chat + code file delivery
// - Persistent conversations in MongoDB
// - AI returns downloadable complete code files
// - AI generates images via Gemini Imagen 3 when helpful
// - Real-time sync via Socket.IO (web ↔ mobile) with msgId dedup
// - Admin default: Claude Opus 4.6 (NEVER Sonnet)
// ══════════════════════════════════════════════════════════════

// ── Generate unique message ID for dedup across devices ──
function genMsgId() {
  return crypto.randomBytes(12).toString('hex');
}

const HELP_AI_CONFIG = {
  free:    { primary: 'groq',             fallback: 'gemini-2.5-flash', maxFileSize: 0,                canUpload: false, maxHistory: 20,  maxStored: 200,  maxOut: 2048 },
  bronze:  { primary: 'groq',             fallback: 'gemini-2.5-flash', maxFileSize: 2 * 1024 * 1024,  canUpload: true,  maxHistory: 30,  maxStored: 300,  maxOut: 4096 },
  silver:  { primary: 'gemini-2.5-flash', fallback: 'gemini-3.1-pro',   maxFileSize: 5 * 1024 * 1024,  canUpload: true,  maxHistory: 40,  maxStored: 400,  maxOut: 8192 },
  gold:    { primary: 'gemini-2.5-flash', fallback: 'gemini-3.1-pro',   maxFileSize: 10 * 1024 * 1024, canUpload: true,  maxHistory: 40,  maxStored: 500,  maxOut: 16384 },
  diamond: { primary: 'gemini-3.1-pro',   fallback: 'sonnet-4.6',       maxFileSize: 25 * 1024 * 1024, canUpload: true,  maxHistory: 50,  maxStored: 1000, maxOut: 16384 },
};

// ── Admin config: Opus 4.6 is the ONLY default. NOT Sonnet. ──
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

// ── Image generation instructions ──
const IMAGE_RULES = `
AI IMAGE GENERATION:
You can generate images to help users understand concepts visually!
When the user seems confused, is asking "what does X look like", or would benefit from a visual:
- Include an image tag in your response: [GENERATE_IMAGE: detailed description of what to generate]
- The system will automatically generate the image using Gemini Imagen 3 and attach it
- Use descriptive prompts: colors, layout, style, what to show
- Great for: UI mockups, diagrams, visual explanations, design concepts, layouts, workflows
- Example: [GENERATE_IMAGE: A modern dark-themed dashboard layout with a sidebar navigation on the left, stat cards across the top showing revenue and users, and a line chart in the center, purple and indigo accent colors]
- You can include multiple [GENERATE_IMAGE: ...] tags if multiple visuals would help
- Always pair images with text explanation — images complement your answer, not replace it
- Do NOT generate images for simple text questions that don't need visuals`;

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

${CODE_RULES}

${IMAGE_RULES}

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

// ── Extract image generation prompts from AI response ──
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

// ── Strip image tags from text (replaced with placeholder after images generated) ──
function stripImageTags(text) {
  return text
    .replace(/\[GENERATE_IMAGE:\s*[\s\S]*?\]/g, '[🖼️ Image attached below]')
    .replace(/\[🖼️ Image attached below\](\s*\[🖼️ Image attached below\])+/g, '[🖼️ Images attached below]')
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
    // Admin ALWAYS defaults to opus-4.6 — never sonnet
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

    // ── Generate unique IDs for this exchange (prevents duplicate messages) ──
    const userMsgId = genMsgId();
    const assistantMsgId = genMsgId();

    // ── Model selection ──
    // Admin ALWAYS defaults to opus-4.6. Only override if admin explicitly picks a different model.
    let primaryModel = config.primary;
    let fallbackModel = config.fallback;
    if (isAdmin) {
      // Default is opus-4.6 (from ADMIN_CONFIG.primary)
      // Only change if admin explicitly selected a different model
      if (requestedModel && ADMIN_MODELS.includes(requestedModel)) {
        primaryModel = requestedModel;
        // If admin explicitly picked a model, no fallback — use exactly what they chose
        fallbackModel = requestedModel === 'opus-4.6' ? 'sonnet-4.6' : null;
      }
      // If no model requested, stays opus-4.6 with sonnet-4.6 fallback
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

    // ── Extract and generate images via Imagen 3 ──
    const imagePrompts = extractImagePrompts(response);
    const generatedImages = [];

    if (imagePrompts.length > 0) {
      console.log(`[HelpAI] Generating ${imagePrompts.length} image(s) via Imagen 3...`);
      // Generate images in parallel (max 3 to avoid rate limits)
      const imagePromises = imagePrompts.slice(0, 3).map(async (prompt) => {
        try {
          const images = await generateImageImagen3(prompt, { aspectRatio: '16:9', numberOfImages: 1 });
          if (images && images.length > 0) {
            return { prompt: prompt.slice(0, 100), base64: images[0].base64, mimeType: images[0].mimeType };
          }
        } catch (err) {
          console.error(`[HelpAI] Image gen failed: ${err.message}`);
        }
        return null;
      });

      const results = await Promise.allSettled(imagePromises);
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) generatedImages.push(r.value);
      }
      console.log(`[HelpAI] Generated ${generatedImages.length}/${imagePrompts.length} image(s)`);
    }

    // ── Build clean text reply (strip code blocks and image tags) ──
    let textReply = response;
    if (codeFiles.length > 0) textReply = stripCodeBlocks(textReply);
    if (imagePrompts.length > 0) textReply = stripImageTags(textReply);

    // ── Save to history ──
    if (!user.help_chat_history) user.help_chat_history = [];

    const userHistoryEntry = {
      role: 'user',
      content: message + (fileName ? ` [📎 ${fileName}]` : ''),
      msgId: userMsgId,
      timestamp: new Date(),
    };

    const assistantHistoryEntry = {
      role: 'assistant',
      content: response,
      model: MODEL_DISPLAY[usedModel] || usedModel,
      msgId: assistantMsgId,
      // Store image count (not full base64) in history to keep DB small
      imageCount: generatedImages.length,
      timestamp: new Date(),
    };

    user.help_chat_history.push(userHistoryEntry);
    user.help_chat_history.push(assistantHistoryEntry);

    const maxStored = isAdmin ? Infinity : (config.maxStored || 200);
    if (maxStored !== Infinity && user.help_chat_history.length > maxStored) {
      user.help_chat_history = user.help_chat_history.slice(-maxStored);
    }
    await user.save();

    // ── Real-time sync to OTHER devices via Socket.IO ──
    // KEY FIX: Emit to all sockets in the user room EXCEPT the sender's socketId
    // This prevents the duplicate: sender gets response via HTTP, other devices get it via socket
    try {
      const io = req.app.get('io');
      if (io) {
        const room = `user-${user._id}`;

        // Emit the user message to OTHER devices (so they see it appear)
        const userSyncPayload = {
          role: 'user',
          content: message + (fileName ? ` [📎 ${fileName}]` : ''),
          msgId: userMsgId,
          timestamp: new Date(),
        };

        // Emit the assistant message to OTHER devices
        const assistantSyncPayload = {
          role: 'assistant',
          content: textReply,
          model: MODEL_DISPLAY[usedModel] || usedModel,
          files: codeFiles,
          images: generatedImages,
          msgId: assistantMsgId,
          timestamp: new Date(),
        };

        if (socketId) {
          // Sender provided their socketId — broadcast to everyone EXCEPT them
          io.to(room).except(socketId).emit('help-ai-user-message', userSyncPayload);
          io.to(room).except(socketId).emit('help-ai-message', assistantSyncPayload);
        } else {
          // No socketId provided (e.g. old client) — broadcast to everyone
          // The frontend msgId dedup will prevent duplicates
          io.to(room).emit('help-ai-user-message', userSyncPayload);
          io.to(room).emit('help-ai-message', assistantSyncPayload);
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
// Standalone image generation endpoint (for manual "generate image" requests)
router.post('/generate-image', auth, async (req, res) => {
  try {
    const { prompt, aspectRatio } = req.body;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Image prompt is required' });

    console.log(`[HelpAI] Manual image gen: "${prompt.slice(0, 80)}..."`);
    const images = await generateImageImagen3(prompt.trim(), {
      aspectRatio: aspectRatio || '16:9',
      numberOfImages: 1,
    });

    if (!images || images.length === 0) {
      return res.status(500).json({ error: 'Image generation failed. Please try again.' });
    }

    res.json({ images });
  } catch (err) {
    console.error('[HelpAI] Image gen error:', err.message);
    res.status(500).json({ error: 'Image generation failed.' });
  }
});

module.exports = router;
