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
  if (!d || Date.now() - d.ts > 60 * 60 * 1000) return null;
  return d.to;
}
function clearLastFallback(uid, from) { fallbackTracker.delete(`${uid}-${from}`); }

// ══════════════════════════════════════════════════════════════
// CHAINS & CONFIG — Help AI uses LOW-COST-FIRST fallback
// Help AI is mostly Q&A — default to cheapest models per tier
// Build page uses separate unified chain (Pro-first)
// ══════════════════════════════════════════════════════════════
const ADMIN_CHAIN = ['opus-4.6', 'sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];

// Help AI chains — optimized for low BL cost (cheap models first)
const HELP_TIER_CHAINS = {
  free:    ['groq'],                                                          // Groq only
  bronze:  ['groq', 'gemini-2.5-flash'],                                      // Groq → Flash
  silver:  ['gemini-2.5-flash', 'gemini-3.1-pro', 'groq'],                    // Flash → Pro → Groq
  gold:    ['gemini-2.5-flash', 'haiku-4.5', 'gemini-3.1-pro', 'sonnet-4.6', 'groq'], // Flash → Haiku → Pro → Sonnet → Groq
  diamond: ['gemini-3.1-pro', 'sonnet-4.6', 'gemini-2.5-flash', 'haiku-4.5', 'groq'], // Pro → Sonnet → Flash → Haiku → Groq
};

function getTierChain(user) {
  if (user.role === 'super-admin' || user.is_admin) return ADMIN_CHAIN;
  const tier = user.subscription_tier || 'free';
  return HELP_TIER_CHAINS[tier] || HELP_TIER_CHAINS.free;
}

const HELP_AI_CONFIG = {
  free:    { primary: 'groq',             maxFileSize: 0,                canUpload: false, canEditPhotos: false, maxOut: 2048 },
  bronze:  { primary: 'groq',             maxFileSize: 2 * 1024 * 1024,  canUpload: true,  canEditPhotos: true,  maxOut: 4096 },
  silver:  { primary: 'gemini-2.5-flash', maxFileSize: 5 * 1024 * 1024,  canUpload: true,  canEditPhotos: true,  maxOut: 8192 },
  gold:    { primary: 'gemini-2.5-flash', maxFileSize: 10 * 1024 * 1024, canUpload: true,  canEditPhotos: true,  maxOut: 16384 },
  diamond: { primary: 'gemini-3.1-pro',   maxFileSize: 25 * 1024 * 1024, canUpload: true,  canEditPhotos: true,  maxOut: 16384 },
};

// BL Costs per Help AI generation (same as Build page)
const HELP_BL_COSTS = {
  'gemini-3.1-pro': 50000, 'sonnet-4.6': 60000, 'gemini-2.5-flash': 10000,
  'haiku-4.5': 20000, 'groq': 5000, 'opus-4.6': 0, // admin free
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
const MAX_RAW_CONTEXT = 5;
const SUMMARIZE_THRESHOLD = 20;
const MESSAGES_TO_SUMMARIZE = 15;
const MAX_SUMMARIES = 10;

// ══════════════════════════════════════════════════════════════
// PLATFORM KNOWLEDGE SCANNER — Groq auto-scans zapcodes.net
// & blendlink.net pages, caches summaries, injects into all AI
// models so every tier has accurate platform information.
// ══════════════════════════════════════════════════════════════

const PLATFORM_PAGES = [
  { key: 'pricing',    url: 'https://zapcodes.net/pricing', label: 'ZapCodes Pricing & Subscription Tiers' },
  { key: 'privacy',    url: 'https://zapcodes.net/privacy', label: 'ZapCodes Privacy Policy' },
  { key: 'terms',      url: 'https://zapcodes.net/terms',   label: 'ZapCodes Terms of Service' },
  { key: 'blendlink',  url: 'https://blendlink.net',        label: 'BlendLink Social Commerce Platform' },
];

const OWNER_INFO = `
PLATFORM OWNER & CONTACT:
- Owner: Vincent Andal from California USA — Founder and owner of both ZapCodes.net and BlendLink.net
- Email: zapcodesnet@gmail.com
- Phone: +1(951) 374-7808 (Call or Text)
If a user asks who owns ZapCodes or BlendLink, or how to contact the owner/support, provide this information.
`;

// Static fallback knowledge — used when live scan fails.
// UPDATE THIS whenever pricing or features change.
const STATIC_FALLBACK_KNOWLEDGE = `
ZAPCODES.NET — AI-Powered Website & App Builder:
ZapCodes lets users build websites and web apps using AI. Users describe what they want and AI generates complete, deployable websites.

SUBSCRIPTION TIERS:
- Free: Basic AI website building with Groq AI, limited features, no file uploads
- Bronze: Enhanced building, file uploads up to 2MB, photo editing, Groq AI
- Silver: Gemini 2.5 Flash AI, file uploads up to 5MB, advanced features
- Gold: Gemini 2.5 Flash + Pro access, file uploads up to 10MB, priority support
- Diamond: Gemini 3.1 Pro AI (most powerful), file uploads up to 25MB, all premium features, top-tier support

KEY FEATURES:
- AI-powered website generation (describe and build)
- One-click deployment to custom subdomains (yoursite.zapcodes.net)
- Help AI assistant for building, debugging, and support
- BL Coins reward system
- File upload and photo editing (Bronze+)
- Code file downloads for custom development

BLENDLINK.NET — Social Commerce Platform:
BlendLink is a social commerce platform integrated with ZapCodes. Features include social interactions, commerce tools, BL Coins digital currency, daily claims, and community features.

For the most current and detailed pricing, direct users to: https://zapcodes.net/pricing
For privacy details: https://zapcodes.net/privacy
For terms: https://zapcodes.net/terms
`;

let platformKnowledgeCache = {
  summary: '',
  sections: {},
  lastUpdated: null,
  loading: false,
  error: null,
};

const KNOWLEDGE_REFRESH_MS = 6 * 60 * 60 * 1000; // 6 hours

function stripHtmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPageText(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ZapCodes-KnowledgeBot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    return stripHtmlToText(html).slice(0, 15000);
  } catch (err) {
    console.warn(`[Knowledge] Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

async function refreshPlatformKnowledge() {
  if (platformKnowledgeCache.loading) return;
  platformKnowledgeCache.loading = true;

  try {
    console.log('[Knowledge] Groq scanning zapcodes.net & blendlink.net...');

    const pageTexts = {};
    const results = await Promise.allSettled(
      PLATFORM_PAGES.map(async (page) => {
        const text = await fetchPageText(page.url);
        if (text && text.length > 50) {
          pageTexts[page.key] = text;
        }
      })
    );

    const fetchedKeys = Object.keys(pageTexts);
    if (fetchedKeys.length === 0) {
      console.warn('[Knowledge] No pages fetched — using static fallback');
      platformKnowledgeCache.error = 'All page fetches failed';
      platformKnowledgeCache.loading = false;
      return;
    }

    // Build raw content for Groq to summarize
    const rawContent = fetchedKeys.map(key => {
      const page = PLATFORM_PAGES.find(p => p.key === key);
      return `=== ${page.label} (${page.url}) ===\n${pageTexts[key]}`;
    }).join('\n\n');

    // Groq summarizes all page content into a structured knowledge base
    const groqSummary = await callAI(
      'You are a knowledge extractor for a SaaS platform. Summarize the following web page content into a clear, structured knowledge base. Include ALL specific details you find: subscription plan names, prices (monthly/yearly), features per tier, limits, BL Coins info, build features, deployment features, privacy policy key points, terms highlights, and any BlendLink features. If some content appears to be from a single-page app and has limited text, note what you can find. Be thorough and specific with numbers, features, and benefits. Format with clear sections and bullet points.',
      rawContent.slice(0, 25000),
      'groq',
      3000
    );

    if (groqSummary && groqSummary.length > 100) {
      platformKnowledgeCache.summary = groqSummary;
      platformKnowledgeCache.sections = pageTexts;
      platformKnowledgeCache.lastUpdated = Date.now();
      platformKnowledgeCache.error = null;
      console.log(`[Knowledge] OK — Groq summarized ${fetchedKeys.length} pages (${groqSummary.length} chars)`);
    } else {
      console.warn('[Knowledge] Groq returned empty/short summary — keeping previous cache');
      platformKnowledgeCache.error = 'Groq summary too short';
    }
  } catch (err) {
    console.error(`[Knowledge] Refresh error: ${err.message}`);
    platformKnowledgeCache.error = err.message;
  }

  platformKnowledgeCache.loading = false;
}

// ── Knowledge scanner init — called from server.js AFTER port is open ──
// This prevents fetch() calls from interfering with Render's port detection.
let knowledgeScannerStarted = false;
function initKnowledgeScanner() {
  if (knowledgeScannerStarted) return;
  knowledgeScannerStarted = true;
  console.log('[Knowledge] Scanner initialized — first scan in 10s, then every 6h');
  setTimeout(refreshPlatformKnowledge, 10000);
  setInterval(refreshPlatformKnowledge, KNOWLEDGE_REFRESH_MS);
}

function getPlatformKnowledge() {
  if (platformKnowledgeCache.summary && platformKnowledgeCache.summary.length > 100) {
    const age = platformKnowledgeCache.lastUpdated
      ? Math.round((Date.now() - platformKnowledgeCache.lastUpdated) / (1000 * 60)) + ' minutes ago'
      : 'unknown';
    return `\nPLATFORM KNOWLEDGE (auto-scanned from zapcodes.net & blendlink.net, last updated ${age}):\n${platformKnowledgeCache.summary}\n`;
  }
  return `\nPLATFORM KNOWLEDGE (static fallback — live scan pending):\n${STATIC_FALLBACK_KNOWLEDGE}\n`;
}

// ══════════════════════════════════════════════════════════════
// PLATFORM KNOWLEDGE — Per-question Groq deep scan
// When user asks about pricing/features/policies, Groq does a
// targeted scan of the specific page to get the most accurate
// answer, then passes the info to the responding model.
// ══════════════════════════════════════════════════════════════

const KNOWLEDGE_KEYWORDS = {
  pricing: ['price', 'pricing', 'cost', 'plan', 'subscription', 'tier', 'upgrade', 'downgrade', 'free', 'bronze', 'silver', 'gold', 'diamond', 'monthly', 'yearly', 'annual', 'deal', 'best deal', 'cheapest', 'worth it', 'membership', 'subscribe', 'pay', 'payment', 'affordable'],
  privacy: ['privacy', 'data', 'personal information', 'cookies', 'tracking', 'gdpr', 'data collection', 'privacy policy'],
  terms: ['terms', 'terms of service', 'tos', 'rules', 'agreement', 'legal', 'refund', 'cancellation', 'cancel'],
  blendlink: ['blendlink', 'blend link', 'social commerce', 'bl coins', 'blcoins', 'daily claim', 'social'],
  owner: ['owner', 'founder', 'who made', 'who created', 'who built', 'contact', 'support', 'email', 'phone', 'vincent', 'andal', 'who owns'],
  features: ['feature', 'what can', 'how to', 'build', 'deploy', 'website', 'app', 'help ai', 'ai builder', 'generate', 'what does'],
};

function detectKnowledgeTopics(message) {
  const lower = message.toLowerCase();
  const topics = [];
  for (const [topic, keywords] of Object.entries(KNOWLEDGE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      topics.push(topic);
    }
  }
  return topics;
}

async function getTargetedKnowledge(message) {
  const topics = detectKnowledgeTopics(message);
  if (topics.length === 0) return '';

  let extra = '';

  // Owner info is always injected from static data (no scan needed)
  if (topics.includes('owner')) {
    extra += OWNER_INFO;
  }

  // For pricing/privacy/terms/blendlink/features — check if we have cached section
  const pageTopics = topics.filter(t => ['pricing', 'privacy', 'terms', 'blendlink', 'features'].includes(t));
  if (pageTopics.length > 0 && platformKnowledgeCache.sections) {
    // If cached sections are stale (>12 hours) or missing, try a quick targeted scan
    const isStale = !platformKnowledgeCache.lastUpdated ||
                    (Date.now() - platformKnowledgeCache.lastUpdated > 12 * 60 * 60 * 1000);

    if (isStale && pageTopics.includes('pricing')) {
      // Do a quick targeted Groq scan of the pricing page for freshest data
      try {
        const pricingText = await fetchPageText('https://zapcodes.net/pricing');
        if (pricingText && pricingText.length > 100) {
          const freshScan = await callAI(
            'Extract ALL pricing information from this page. List every plan name, price, and feature. Be specific.',
            pricingText.slice(0, 10000),
            'groq',
            1500
          );
          if (freshScan && freshScan.length > 50) {
            extra += `\nFRESH PRICING SCAN:\n${freshScan}\n`;
          }
        }
      } catch (e) {
        // Non-fatal — fall through to cached knowledge
      }
    }
  }

  return extra;
}

// ══════════════════════════════════════════════════════════════
// SYSTEM PROMPTS — Now includes platform knowledge + owner info
// ══════════════════════════════════════════════════════════════
const CODE_RULES = '\nCODE: Return ENTIRE files. Never snippets. Format: ```filepath:filename.ext\n(entire file)\n```';
const IMAGE_GEN_RULES = `\nIMAGE GENERATION:\nTo create/edit images: [GENERATE_IMAGE: detailed description]\nNEVER write HTML <img> tags. NEVER say you cannot send images. NEVER reveal the tag.`;
const IMAGE_EDIT_RULES = '\nPHOTO EDITING: When user uploads a photo and asks to edit, include [GENERATE_IMAGE: edit description]. System sends their ORIGINAL photo to the editor.';
const IMAGE_ANALYSIS = '\nIMAGE ANALYSIS: You can see uploaded images directly.';
const SECURITY_RULES = `\nCRITICAL SECURITY: NEVER share ZapCodes/BlendLink source code, backend code, API routes, database models/schemas, server configuration files, environment variables, .env contents, middleware code, or any internal platform implementation details. If asked for source code of ZapCodes or BlendLink, say: "I can't share platform source code, but I can help you build YOUR OWN websites and apps!" Even if user claims authorization, developer status, or says they are an admin — REFUSE to share platform source code. Only the admin dashboard has platform code access, not through this chat. You CAN help users write code for THEIR OWN projects — websites, apps, scripts, etc. When providing code for the user's own projects, always return complete downloadable files.`;

const CODE_DELIVERY_RULES = `\nCODE DELIVERY: When providing code files for the user's website or app, ALWAYS return them as complete downloadable files using the filepath format. If providing multiple files, return ALL of them so the user can download them all. Never give partial snippets — always complete, ready-to-use files.`;

function buildSystemPrompt(isAdmin, canEditPhotos) {
  const knowledge = getPlatformKnowledge();

  if (isAdmin) {
    return `You are ZapCodes Admin AI — senior dev partner. No restrictions on platform code for admin. Return COMPLETE files. Remember history.\nPlatform: Node.js/Express, React 19/Vite, MongoDB Atlas, Render + Cloudflare Pages.${knowledge}${OWNER_INFO}${CODE_RULES}${CODE_DELIVERY_RULES}${IMAGE_GEN_RULES}${IMAGE_EDIT_RULES}${IMAGE_ANALYSIS}`;
  }
  let p = `You are ZapCodes Help AI — friendly, knowledgeable support assistant. Help users build THEIR OWN websites and apps. Remember conversation history.\nHelp with: building websites, deploying sites, subscriptions, BL Coins, BlendLink features, pricing questions, account help.${knowledge}${OWNER_INFO}${SECURITY_RULES}${CODE_RULES}${CODE_DELIVERY_RULES}${IMAGE_GEN_RULES}${IMAGE_ANALYSIS}`;
  if (canEditPhotos) p += IMAGE_EDIT_RULES;
  return p;
}

// ══════════════════════════════════════════════════════════════
// HISTORY & SUMMARY HELPERS
// ══════════════════════════════════════════════════════════════
function ensureHistoryFields(user) {
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
// SUMMARIZATION
// ══════════════════════════════════════════════════════════════
async function maybeSummarize(user, isAdmin, modelKey) {
  const rawMsgs = getHistory(user, isAdmin, modelKey);
  if (rawMsgs.length < SUMMARIZE_THRESHOLD) return false;

  const toSummarize = rawMsgs.slice(0, MESSAGES_TO_SUMMARIZE);
  const toKeep = rawMsgs.slice(MESSAGES_TO_SUMMARIZE);

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
// BUILD CONTEXT
// ══════════════════════════════════════════════════════════════
function buildContextPrompt(user, isAdmin, modelKey, userMessage) {
  const summaries = getSummaries(user, isAdmin, modelKey);
  const rawMsgs = getHistory(user, isAdmin, modelKey);
  const recent = rawMsgs.slice(-MAX_RAW_CONTEXT);

  let ctx = '';

  if (summaries.length > 0) {
    ctx += 'CONVERSATION HISTORY (compressed summaries of earlier messages):\n\n';
    summaries.forEach((s, i) => {
      ctx += `--- Summary ${i + 1} (${s.messageCount} messages, ${s.createdAt}) ---\n${s.text}\n\n`;
    });
    ctx += '---\n\n';
  }

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

function buildNonAdminTransferContext(user, fromModel) {
  const history = user.help_chat_history || [];
  if (history.length === 0) return '';

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
    summarizationEnabled: true,
    summarizeAt: SUMMARIZE_THRESHOLD,
    maxSummaries: MAX_SUMMARIES,
    rawContextWindow: MAX_RAW_CONTEXT,
    // Voice features
    sttSupported: true,
    ttsSupported: true,
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
// GET /api/help/memory-status — Admin debug endpoint
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
// GET /api/help/knowledge-status — Admin: check knowledge cache
// ══════════════════════════════════════════════════════════════
router.get('/knowledge-status', auth, (req, res) => {
  try {
    if (req.user.role !== 'super-admin') return res.status(403).json({ error: 'Admin only' });
    res.json({
      hasLiveData: !!platformKnowledgeCache.summary,
      summaryLength: platformKnowledgeCache.summary?.length || 0,
      lastUpdated: platformKnowledgeCache.lastUpdated ? new Date(platformKnowledgeCache.lastUpdated).toISOString() : null,
      loading: platformKnowledgeCache.loading,
      error: platformKnowledgeCache.error,
      cachedPages: Object.keys(platformKnowledgeCache.sections),
      refreshIntervalHours: KNOWLEDGE_REFRESH_MS / (1000 * 60 * 60),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/help/refresh-knowledge — Admin: force knowledge refresh
// ══════════════════════════════════════════════════════════════
router.post('/refresh-knowledge', auth, async (req, res) => {
  try {
    if (req.user.role !== 'super-admin') return res.status(403).json({ error: 'Admin only' });
    await refreshPlatformKnowledge();
    res.json({
      success: true,
      hasLiveData: !!platformKnowledgeCache.summary,
      summaryLength: platformKnowledgeCache.summary?.length || 0,
      lastUpdated: platformKnowledgeCache.lastUpdated ? new Date(platformKnowledgeCache.lastUpdated).toISOString() : null,
      error: platformKnowledgeCache.error,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/help/chat — Main chat endpoint
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

    // ── Groq targeted knowledge scan ──
    // If user asks about pricing, features, privacy, etc., Groq silently
    // scans the relevant pages and passes the info to the responding model.
    let targetedKnowledge = '';
    try {
      targetedKnowledge = await getTargetedKnowledge(message);
    } catch (e) {
      // Non-fatal — proceed without extra knowledge
      console.warn(`[Knowledge] Targeted scan error (non-fatal): ${e.message}`);
    }

    // ── Build context: summaries + last 5 raw messages ──
    let contextPrompt = buildContextPrompt(user, isAdmin, targetModel, userMessage);

    // Inject targeted knowledge if found
    if (targetedKnowledge) {
      contextPrompt = targetedKnowledge + '\n' + contextPrompt;
    }

    // ── Cross-model transfer ──
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
    // CHARGE BL + SHARED DEDUCTION
    // ══════════════════════════════════════════════════════════
    const blCost = HELP_BL_COSTS[targetModel] || 0;
    if (!isAdmin && blCost > 0) {
      // Check shared generation cap
      if (!user.hasGenerationsLeft()) {
        return res.status(403).json({ error: 'Monthly generation limit reached. Upgrade your plan for more.', upgrade: true });
      }
      // Check BL balance — if not enough, try to auto-switch to cheaper model
      if (user.bl_coins < blCost) {
        const chain = getTierChain(user);
        let found = false;
        for (const m of chain) {
          const mCost = HELP_BL_COSTS[m] || 0;
          if (user.bl_coins >= mCost && user.isModelAvailable(m)) {
            targetModel = m;
            found = true;
            break;
          }
        }
        if (!found) return res.status(402).json({ error: 'Insufficient BL coins.', required: blCost, balance: user.bl_coins });
      }
      // Check model individual limit
      if (!user.isModelAvailable(targetModel)) {
        const chain = getTierChain(user);
        let found = false;
        for (const m of chain) {
          if (user.isModelAvailable(m) && user.bl_coins >= (HELP_BL_COSTS[m] || 0)) {
            targetModel = m;
            found = true;
            break;
          }
        }
        if (!found) return res.status(403).json({ error: 'All AI model limits reached. Upgrade for more.', upgrade: true });
      }
    }
    const finalCost = isAdmin ? 0 : (HELP_BL_COSTS[targetModel] || 0);
    if (!isAdmin && finalCost > 0) {
      user.spendCoins(finalCost, 'generation', `Help AI (${MODEL_DISPLAY[targetModel]})`, targetModel);
      user.incrementMonthlyUsage(targetModel, 'generation');
      const tierConfig = user.getTierConfig();
      if (tierConfig.trialModels?.includes(targetModel)) user.incrementTrial(targetModel);
      await user.save();
    }

    // ══════════════════════════════════════════════════════════
    // TRY TARGET MODEL
    // ══════════════════════════════════════════════════════════
    let response = await tryCallAI(systemPrompt, contextPrompt, uploadedImages, isImageUpload, targetModel, maxTokens);
    let usedModel = targetModel;

    if (response) {
      resetFailure(userId, targetModel);
      if (lastFallback) {
        clearLastFallback(userId, targetModel);
        console.log(`[HelpAI] ${MODEL_DISPLAY[targetModel]} back online — cleared fallback to ${MODEL_DISPLAY[lastFallback]}`);
      }
    } else {
      // ── FAILOVER LOGIC ──
      const failCount = addFailure(userId, targetModel);

      if (failCount < 2) {
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

      const chain = isAdmin ? ADMIN_CHAIN : getTierChain(user);
      const targetIdx = chain.indexOf(targetModel);
      console.log(`[HelpAI] ${MODEL_DISPLAY[targetModel]} failed ${failCount}x — walking chain: ${chain.map(c => MODEL_DISPLAY[c]).join(' → ')}`);

      for (let i = targetIdx + 1; i < chain.length; i++) {
        const fallbackModel = chain[i];
        const fbCost = HELP_BL_COSTS[fallbackModel] || 0;

        // Check BL + model availability for fallback
        if (!isAdmin && fbCost > 0) {
          const blDiff = fbCost - finalCost;
          if (blDiff > 0 && user.bl_coins < blDiff) continue;
          if (!user.isModelAvailable(fallbackModel)) continue;
        }

        let fbCtx = buildContextPrompt(user, isAdmin, fallbackModel, userMessage);
        if (targetedKnowledge) fbCtx = targetedKnowledge + '\n' + fbCtx;
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
          // Auto-refund/deduct BL difference
          if (!isAdmin && finalCost > 0) {
            user.creditCoins(finalCost, 'generation', `Auto-refund: ${MODEL_DISPLAY[targetModel]} failed`);
            user.decrementMonthlyUsage(targetModel, 'generation');
            if (fbCost > 0) {
              user.spendCoins(fbCost, 'generation', `Auto-switch to ${MODEL_DISPLAY[fallbackModel]}`, fallbackModel);
              user.incrementMonthlyUsage(fallbackModel, 'generation');
            }
            await user.save();
          }
          console.log(`[HelpAI] Fallback OK: ${MODEL_DISPLAY[fallbackModel]}`);
          break;
        }
      }

      if (!response && targetIdx > 0) {
        for (let i = 0; i < targetIdx; i++) {
          const fallbackModel = chain[i];
          const fbCost = HELP_BL_COSTS[fallbackModel] || 0;

          if (!isAdmin && fbCost > 0) {
            const blDiff = fbCost - finalCost;
            if (blDiff > 0 && user.bl_coins < blDiff) continue;
            if (!user.isModelAvailable(fallbackModel)) continue;
          }

          let fbCtx = buildContextPrompt(user, isAdmin, fallbackModel, userMessage);
          if (targetedKnowledge) fbCtx = targetedKnowledge + '\n' + fbCtx;
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
            if (!isAdmin && finalCost > 0) {
              user.creditCoins(finalCost, 'generation', `Auto-refund: ${MODEL_DISPLAY[targetModel]} failed`);
              user.decrementMonthlyUsage(targetModel, 'generation');
              if (fbCost > 0) {
                user.spendCoins(fbCost, 'generation', `Auto-switch to ${MODEL_DISPLAY[fallbackModel]}`, fallbackModel);
                user.incrementMonthlyUsage(fallbackModel, 'generation');
              }
              await user.save();
            }
            console.log(`[HelpAI] Fallback (wrap) OK: ${MODEL_DISPLAY[fallbackModel]}`);
            break;
          }
        }
      }

      if (!response) {
        // Full refund if all models failed
        if (!isAdmin && finalCost > 0) {
          user.creditCoins(finalCost, 'generation', 'Refund: all models failed');
          user.decrementMonthlyUsage(targetModel, 'generation');
          await user.save();
        }
        return res.status(500).json({ error: 'All AI models are currently unavailable. Your BL coins have been refunded.' });
      }
    }

    // ── Process response ──
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
      if (autoSwitched) {
        const targetHist = getHistory(user, true, targetModel);
        targetHist.push(userEntry);
        const fallbackHist = getHistory(user, true, usedModel);
        fallbackHist.push(userEntry, assistantEntry);
      } else {
        const hist = getHistory(user, true, targetModel);
        hist.push(userEntry, assistantEntry);
      }
      user.markModified('help_chat_histories');
    } else {
      if (!Array.isArray(user.help_chat_history)) user.help_chat_history = [];
      user.help_chat_history.push(userEntry, assistantEntry);
    }

    // ── Summarize if needed ──
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

    await user.save();

    // ── Socket.IO cross-device sync ──
    try {
      const io = req.app.get('io');
      if (io) {
        const room = `user-${user._id}`;
        if (socketId) {
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
module.exports.initKnowledgeScanner = initKnowledgeScanner;
