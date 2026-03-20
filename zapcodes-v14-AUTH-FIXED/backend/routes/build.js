const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { callAI, callAIWithImage, parseFilesFromResponse, generateProjectMultiStep, verifyAndFix, generateImageImagen4, editPhotoVibeEditor, generateVideoVeo, summarizeProjectMessages, checkPromptClarity } = require('../services/ai');
const User = require('../models/User');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ══════════════════════════════════════════════════════════════════
// PREBUILT TEMPLATE AUTO-LOADER
// ══════════════════════════════════════════════════════════════════
const TEMPLATE_DIR = path.join(__dirname, '..', 'prebuilt-templates');
const prebuiltTemplates = [];

function loadPrebuiltTemplates() {
  try {
    if (!fs.existsSync(TEMPLATE_DIR)) { console.log('[Templates] No prebuilt-templates folder found'); return; }
    const files = fs.readdirSync(TEMPLATE_DIR).filter(f => f.endsWith('.html')).sort();
    files.forEach(filename => {
      const html = fs.readFileSync(path.join(TEMPLATE_DIR, filename), 'utf-8');
      const keywords = filename.replace(/^\d+-/, '').replace('.html', '').split('-').filter(Boolean);
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : keywords.join(' ');
      prebuiltTemplates.push({ filename, keywords, title, html, size: html.length });
    });
    console.log(`[Templates] Loaded ${prebuiltTemplates.length} prebuilt template(s): ${prebuiltTemplates.map(t => t.filename).join(', ')}`);
  } catch (err) {
    console.warn('[Templates] Failed to load:', err.message);
  }
}
loadPrebuiltTemplates();

const TEMPLATE_KEYWORD_MAP = {
  'restaurant':   ['restaurant','food','menu','dining','cafe','bistro','pizza','sushi','bar','grill','bakery','coffee','diner','kitchen','chef','catering'],
  'ecommerce':    ['ecommerce','store','shop','product','buy','sell','cart','checkout','marketplace','retail','merchandise','clothing','fashion'],
  'portfolio':    ['portfolio','agency','freelance','creative','designer','photographer','artist','resume','cv','personal site','showcase'],
  'saas':         ['saas','startup','software','platform','pricing','subscription','app landing','feature','testimonial','waitlist','beta'],
  'real-estate':  ['real estate','property','house','apartment','listing','rent','mortgage','realtor','home','condo','realty','broker'],
  'fitness':      ['fitness','gym','workout','exercise','training','yoga','crossfit','health','muscle','personal trainer','sport'],
  'medical':      ['medical','dental','doctor','clinic','hospital','health','patient','appointment','dentist','therapy','wellness','nurse'],
  'salon':        ['salon','beauty','hair','spa','nail','makeup','barber','skincare','facial','massage','cosmetic','stylist'],
  'construction': ['construction','building','contractor','architecture','renovation','plumbing','electric','roofing','engineering','home improvement'],
  'blog':         ['blog','article','post','write','journal','news','magazine','content','author','editorial','story','publish'],
  'candy-crush':  ['candy','crush','match 3','match-3','puzzle game','gem','jewel','swap','tile','match three','bejeweled','sweet'],
};

function matchPrebuiltTemplate(prompt) {
  if (!prompt || prebuiltTemplates.length === 0) return null;
  const promptLower = prompt.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;
  for (const tmpl of prebuiltTemplates) {
    let score = 0;
    for (const [category, keywords] of Object.entries(TEMPLATE_KEYWORD_MAP)) {
      if (tmpl.filename.toLowerCase().includes(category.replace('-', ''))) {
        for (const kw of keywords) {
          if (promptLower.includes(kw)) score += kw.includes(' ') ? 3 : 2;
        }
      }
    }
    for (const kw of tmpl.keywords) {
      if (promptLower.includes(kw)) score += 2;
    }
    if (promptLower.includes(tmpl.title.toLowerCase())) score += 5;
    if (score > bestScore) { bestScore = score; bestMatch = tmpl; }
  }
  return bestScore >= 3 ? bestMatch : null;
}

router.get('/prebuilt-templates', (req, res) => {
  res.json({ templates: prebuiltTemplates.map(t => ({ filename: t.filename, title: t.title, keywords: t.keywords, size: t.size })) });
});

// ══════════ BL COIN COSTS ══════════
const { BL_COIN_COSTS } = require('../config/blCoins');

const BL_COSTS = {
  generation: {
    'sonnet-4.6': BL_COIN_COSTS.generation['sonnet-4.6'],
    'gemini-3.1-pro': BL_COIN_COSTS.generation['gemini-3.1-pro'],
    'haiku-4.5': BL_COIN_COSTS.generation['haiku-4.5'],
    'gemini-2.5-flash': BL_COIN_COSTS.generation['gemini-2.5-flash'],
    'groq': BL_COIN_COSTS.generation['groq'],
    'gemini-pro': BL_COIN_COSTS.generation['gemini-3.1-pro'],
    'gemini-flash': BL_COIN_COSTS.generation['gemini-2.5-flash'],
    'haiku': BL_COIN_COSTS.generation['haiku-4.5'],
    'sonnet': BL_COIN_COSTS.generation['sonnet-4.6'],
  },
  codeFix: {
    'sonnet-4.6': BL_COIN_COSTS.code_fix['sonnet-4.6'],
    'gemini-3.1-pro': BL_COIN_COSTS.code_fix['gemini-3.1-pro'],
    'haiku-4.5': BL_COIN_COSTS.code_fix['haiku-4.5'],
    'gemini-2.5-flash': BL_COIN_COSTS.code_fix['gemini-2.5-flash'],
    'groq': BL_COIN_COSTS.code_fix['groq'],
    'gemini-pro': BL_COIN_COSTS.code_fix['gemini-3.1-pro'],
    'gemini-flash': BL_COIN_COSTS.code_fix['gemini-2.5-flash'],
    'haiku': BL_COIN_COSTS.code_fix['haiku-4.5'],
    'sonnet': BL_COIN_COSTS.code_fix['sonnet-4.6'],
  },
  githubPush: BL_COIN_COSTS.github_push,
  pwaBuild: 20000,
  badgeRemoval: BL_COIN_COSTS.badge_removal,
  deploy: 0,
};

const MODEL_DISPLAY = { 'gemini-3.1-pro': 'Gemini 3.1 Pro', 'gemini-2.5-flash': 'Gemini 2.5 Flash', 'haiku-4.5': 'Haiku 4.5', 'sonnet-4.6': 'Sonnet 4.6', 'groq': 'Groq AI', 'gemini-pro': 'Gemini 3.1 Pro', 'gemini-flash': 'Gemini 2.5 Flash', 'haiku': 'Haiku 4.5', 'sonnet': 'Sonnet 4.6' };
const NORMALIZE_MODEL_KEY = { 'gemini-pro': 'gemini-3.1-pro', 'gemini-flash': 'gemini-2.5-flash', 'haiku': 'haiku-4.5', 'sonnet': 'sonnet-4.6', 'groq': 'groq', 'gemini-3.1-pro': 'gemini-3.1-pro', 'gemini-2.5-flash': 'gemini-2.5-flash', 'haiku-4.5': 'haiku-4.5', 'sonnet-4.6': 'sonnet-4.6' };
function normalizeModelKey(key) { return NORMALIZE_MODEL_KEY[key] || key; }

const TIER_FALLBACK_CHAINS = {
  free:    { new_website: ['gemini-2.5-flash'], edit: ['gemini-2.5-flash', 'groq'], fix: ['gemini-2.5-flash', 'groq'] },
  bronze:  { new_website: ['gemini-3.1-pro', 'gemini-2.5-flash'], edit: ['gemini-3.1-pro', 'gemini-2.5-flash', 'groq'], fix: ['gemini-3.1-pro', 'gemini-2.5-flash', 'groq'] },
  silver:  { new_website: ['gemini-3.1-pro', 'gemini-2.5-flash', 'haiku-4.5'], edit: ['gemini-3.1-pro', 'gemini-2.5-flash', 'haiku-4.5', 'groq'], fix: ['gemini-3.1-pro', 'gemini-2.5-flash', 'haiku-4.5', 'groq'] },
  gold:    { new_website: ['gemini-3.1-pro', 'sonnet-4.6', 'gemini-2.5-flash', 'haiku-4.5'], edit: ['gemini-3.1-pro', 'sonnet-4.6', 'gemini-2.5-flash', 'haiku-4.5', 'groq'], fix: ['gemini-3.1-pro', 'sonnet-4.6', 'gemini-2.5-flash', 'haiku-4.5', 'groq'] },
  diamond: { new_website: ['gemini-3.1-pro', 'sonnet-4.6', 'gemini-2.5-flash', 'haiku-4.5'], edit: ['gemini-3.1-pro', 'sonnet-4.6', 'gemini-2.5-flash', 'haiku-4.5', 'groq'], fix: ['gemini-3.1-pro', 'sonnet-4.6', 'gemini-2.5-flash', 'haiku-4.5', 'groq'] },
};
function getTierFallbackChain(tier, operationType) {
  const t = (tier || 'free').toLowerCase();
  const op = operationType || 'new_website';
  return (TIER_FALLBACK_CHAINS[t] || TIER_FALLBACK_CHAINS.free)[op] || ['groq'];
}
function isGroqFallback(tier, model, operationType) { return model === 'groq' && operationType !== 'new_website'; }
function isLastFallback(tier, model, operationType) { const chain = getTierFallbackChain(tier, operationType); return chain[chain.length - 1] === model; }

const RESERVED = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'cdn', 'dev', 'staging', 'test', 'blog', 'docs', 'status', 'support', 'help', 'zapcodes', 'blendlink'];

const BUILD_FALLBACK_PAID = ['sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash'];
const BUILD_FALLBACK_FREE = ['gemini-2.5-flash', 'groq'];
const BUILD_FALLBACK_ADMIN = ['sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];
function getBuildFallbackChain(user) { if (user.role === 'super-admin') return BUILD_FALLBACK_ADMIN; const t = user.subscription_tier || 'free'; return t === 'free' ? BUILD_FALLBACK_FREE : BUILD_FALLBACK_PAID; }

const GEN_PROMPT = `You are ZapCodes AI. You build websites. You write complete, working code. You never write placeholder code. You never write "// rest of code here" or "..." or "// similar to above". You write every single line.

CRITICAL: Every website you build MUST be visually complete and visible when opened in a browser. All text must be readable (proper contrast). All sections must have visible content. No blank pages. No invisible text. No broken layouts.

WHAT YOU MUST DO:
Step 1: Read what the user wants. If they uploaded reference images/screenshots, study them carefully — match the layout, colors, design, and structure you see.
Step 2: Write a COMPLETE index.html file.
Step 3: Put ALL CSS inside a <style> tag in the <head>.
Step 4: Put ALL JavaScript inside a <script> tag before </body>.
Step 5: Do NOT create separate .css or .js files. Everything goes in ONE index.html file.
Step 6: The file must work when opened in a browser. No setup needed.

REFERENCE IMAGES: If the user uploaded screenshots or reference images, you MUST:
- Analyze the layout, colors, fonts, spacing, and structure shown in the image
- Recreate the design as closely as possible in HTML/CSS
- Match the color scheme, typography, and overall visual style
- Include all visible sections, navigation elements, and interactive components
- Use the image as your primary design guide

FORMAT YOUR OUTPUT EXACTLY LIKE THIS:
\`\`\`filepath:index.html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Website Title</title>
  <style>
    /* ALL CSS GOES HERE */
  </style>
</head>
<body>
  <!-- ALL HTML GOES HERE -->
  <script>
    // ALL JAVASCRIPT GOES HERE
  </script>
</body>
</html>
\`\`\`

DESIGN RULES:
1. Use CSS custom properties for colors. Example: --bg: #0a0a0a; --text: #f0f0f0; --accent: #6366f1;
2. Use flexbox and CSS grid. Never float.
3. Add hover effects with transition: all 0.3s ease;
4. Add media queries for mobile (768px) and tablet (1024px).
5. Use Google Fonts via <link> in <head>.
6. Dark background (#0a0a0a to #1a1a2e range) with LIGHT text (#e0e0e0 to #ffffff). NEVER use dark text on dark background. NEVER use light text on light background.
7. Scroll animations: ALL elements MUST be visible by default (opacity: 1). Only add subtle entrance animations AFTER the element is already visible. Never set initial opacity to 0. Never hide content behind JavaScript animations.
8. html { scroll-behavior: smooth; }
9. Hamburger menu for mobile.
10. IMAGES: Do NOT add images unless the user specifically asks for them. If the user requests images, use https://placehold.co/WIDTHxHEIGHT/1a1a2e/aaa?text=Placeholder as placeholder (e.g. https://placehold.co/800x400/1a1a2e/aaa?text=Hero+Image). If the user did NOT mention images, use CSS gradients, SVG icons, or emoji instead. Never add random stock photos the user didn't ask for. NEVER change, replace, or remove existing images on the site unless the user explicitly asks.
11. At least 500 lines of code with real visible content in every section.
12. Semantic HTML: header, nav, main, section, article, footer. Every section needs min-height: 200px and visible text.
13. ZERO TOLERANCE FOR BLANK PAGES: If your CSS has opacity: 0, transform: translateY, visibility: hidden, or display: none on ANY content section — the site is broken. All content MUST be visible without JavaScript. JavaScript animations should only ENHANCE already-visible content.

FORM RULES:
Every form MUST submit data using this JavaScript:
const forms = document.querySelectorAll('form');
forms.forEach(form => {
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
    const originalText = btn.textContent;
    btn.textContent = 'Sending...'; btn.disabled = true;
    const formData = {};
    new FormData(form).forEach((value, key) => { formData[key] = value; });
    const subdomain = window.location.hostname.split('.')[0];
    try {
      const response = await fetch('https://api.zapcodes.net/api/forms/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subdomain, formType: form.dataset.formtype || 'Contact Form', formData }) });
      const result = await response.json();
      if (result.success) { btn.textContent = '✓ Sent!'; btn.style.background = '#22c55e'; form.reset(); setTimeout(() => { btn.textContent = originalText; btn.disabled = false; btn.style.background = ''; }, 3000); }
      else throw new Error('Failed');
    } catch { btn.textContent = '✗ Failed'; btn.style.background = '#ef4444'; setTimeout(() => { btn.textContent = originalText; btn.disabled = false; btn.style.background = ''; }, 3000); }
  });
});

Every <form> needs data-formtype. Every <input>/<textarea> needs name attribute.

IMPORTANT — DO NOT BUILD FAKE AI CHAT:
If the user asks for a chatbot, AI assistant, or live chat on their site, do NOT build a static HTML/CSS/JavaScript chat widget. Do NOT include any fake chat UI that pretends to respond but has no real AI backend. The real AI widget will be injected automatically after your HTML is generated. Just build the rest of the website normally.`;

const FIX_PROMPT = `You are ZapCodes AI. You fix bugs in websites. ONLY fix what the user describes. Do NOT change colors, text, layout, or anything else unless asked.

If the user uploaded a screenshot showing the bug, analyze it carefully to understand what's wrong.

RULES:
1. ONLY fix the reported issue
2. Do NOT change colors, text, layout unless asked
3. Do NOT rename CSS classes or JS functions
4. Do NOT delete working code
5. Auto-fix: missing name attrs, missing CSS, unclosed tags, broken form submissions

OUTPUT: \`\`\`filepath:index.html\n(COMPLETE fixed file)\n\`\`\``;

const EDIT_PROMPT = `You are ZapCodes AI. The user has an EXISTING website and wants changes.

YOUR #1 RULE: DO NOT CHANGE ANYTHING THE USER DID NOT ASK TO CHANGE.

If the user uploaded reference images, use them to understand what design changes they want. Match the visual style shown in any reference images.

STEP BY STEP:
1. READ existing code. Count <section> elements.
2. Identify EXACTLY what user wants changed.
3. Go line by line. Only modify what's requested. Copy everything else exactly.
4. Verify same section count (unless user asked to add/remove).

NEVER: remove sections, change colors, rewrite text, remove JS functions, change image URLs, reorganize HTML, change class names, change fonts, remove animations — unless user asked.

MEDIA PRESERVATION — CRITICAL:
- NEVER delete, remove, or modify any existing <video>, <iframe>, or <img> tags UNLESS the user EXPLICITLY asks to remove them
- If a video embed exists in the HTML, it MUST remain in the exact same position with the exact same URL
- If an image has a broken src (placeholder URL or "Image removed to save space"), and the user uploaded a replacement photo, replace ONLY that specific broken image src — do not touch any other images or videos
- Count all <video>, <iframe>, and <img> tags BEFORE editing. The count must be the same or higher AFTER editing (never lower, unless user asked to remove something)

AUTO-FIX: broken links, missing CSS, unclosed tags, missing input names, broken forms, missing smooth scroll, non-responsive sections, missing alt attrs, missing hover effects.

OUTPUT: \`\`\`filepath:index.html\n(COMPLETE updated file — every line)\n\`\`\``;

const CLONE_PROMPT = `Analyze the website and return JSON: {"title":"...","type":"...","sections":[...],"colors":{"primary":"#hex","secondary":"#hex","bg":"#hex","text":"#hex"},"fonts":"...","features":[...],"layout":"...","content":"..."}`;

function getEffectiveModel(user, requestedModel, isBuildOperation = false, operationType = 'new_website') {
  if (user.role === 'super-admin') { if (requestedModel) return normalizeModelKey(requestedModel); return 'gemini-3.1-pro'; }
  const tier = user.subscription_tier || 'free';
  const normalized = requestedModel ? normalizeModelKey(requestedModel) : null;
  const chain = getTierFallbackChain(tier, operationType);
  if (normalized && normalized !== 'auto' && chain.includes(normalized)) {
    const config = user.getTierConfig();
    const limit = config.monthlyLimits?.[normalized];
    const isTrial = config.trialModels?.includes(normalized);
    if (isTrial) { if (!user.isTrialExhausted(normalized, limit)) return normalized; }
    else { const used = user.getModelUsageCount(normalized); if (limit === Infinity || used < limit) return normalized; }
  }
  const config = user.getTierConfig();
  for (const model of chain) {
    const limit = config.monthlyLimits?.[model];
    const isTrial = config.trialModels?.includes(model);
    if (isTrial) { if (!user.isTrialExhausted(model, limit)) return model; }
    else { const used = user.getModelUsageCount(model); if (limit === Infinity || used < limit) return model; }
  }
  return null;
}

function getModelDisplayName(model) { return MODEL_DISPLAY[model] || MODEL_DISPLAY[normalizeModelKey(model)] || model; }

const activeSessions = new Map();
function safeSend(res, data) { try { if (!res.writableEnded && !res.destroyed) { res.write(`data: ${JSON.stringify(data)}\n\n`); return true; } return false; } catch (err) { return false; } }

function generatePreviewHTML(files) {
  const html = files.find(f => f.name === 'index.html') || files.find(f => f.name.endsWith('.html'));
  const css = files.find(f => f.name === 'style.css') || files.find(f => f.name.endsWith('.css'));
  const js = files.find(f => f.name === 'script.js') || files.find(f => f.name.endsWith('.js') && !f.name.includes('service-worker'));
  if (!html) return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Preview</title>${css ? '<style>' + css.content + '</style>' : ''}</head><body><h1>Preview</h1><p>No index.html.</p>${js ? '<script>' + js.content + '</script>' : ''}</body></html>`;
  let content = html.content;
  if (!content.includes('<!DOCTYPE')) content = `<!DOCTYPE html>\n${content}`;
  if (css?.content?.trim()) { const snip = css.content.trim().substring(0, 60); if (!content.includes(snip)) { content = content.replace(/<link[^>]*style\.css[^>]*\/?>/gi, ''); if (content.includes('</head>')) content = content.replace('</head>', `<style>\n${css.content}\n</style>\n</head>`); } }
  if (js?.content?.trim()) { const snip = js.content.trim().substring(0, 60); if (!content.includes(snip)) { content = content.replace(/<script[^>]*script\.js[^>]*><\/script>/gi, ''); if (content.includes('</body>')) content = content.replace('</body>', `<script>\n${js.content}\n</script>\n</body>`); } }
  if (!content.includes('viewport')) content = content.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  return content;
}

const BADGE_SCRIPT = `<div id="zc-badge" style="position:fixed;bottom:10px;right:10px;z-index:99999;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:6px 14px;border-radius:20px;font-family:-apple-system,sans-serif;font-size:12px;font-weight:600;box-shadow:0 2px 10px rgba(99,102,241,.3);cursor:pointer;text-decoration:none;display:flex;align-items:center;gap:4px" onclick="window.open('https://zapcodes.net?ref=badge','_blank')">⚡ Made with ZapCodes</div>`;

async function callAISmart(systemPrompt, userPrompt, model, maxTokens, referenceImages, aiOpts) {
  if (referenceImages && referenceImages.length > 0) {
    let visionModel = model;
    if (model === 'groq') {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
      if (apiKey) visionModel = 'gemini-2.5-flash';
    }
    return callAIWithImage(systemPrompt, userPrompt, referenceImages, visionModel, maxTokens, aiOpts);
  }
  return callAI(systemPrompt, userPrompt, model, maxTokens, aiOpts);
}

async function generateProgressMessages(prompt, template, projectName, modelLabel) {
  const name = projectName || 'your website';
  try {
    const result = await callAI(`Write 25 short build progress messages (one per line). Friendly developer tone. Specific to "${name}". Emojis. Under 120 chars. No numbering. Reference "${modelLabel}".`, `Building: "${name}" — "${(prompt || '').slice(0, 500)}" — Template: ${template || 'custom'}`, 'groq', 1500);
    if (result) { const lines = result.split('\n').map(l => l.trim()).filter(l => l.length > 10 && l.length < 200); if (lines.length >= 8) return lines; }
  } catch {}
  return [`Analyzing what you want for ${name}... 🧠`, 'Got it! Starting the build.', 'Setting up page structure.', 'Working on colors and fonts.', `${modelLabel} is writing HTML.`, 'Navigation and smooth scrolling done.', 'Making it responsive.', 'Adding content sections.', 'CSS polish — gradients, shadows, effects.', 'JavaScript for interactivity.', 'Almost done! Final polish.', 'Checking styles and buttons.', 'Wrapping up the package.', 'One last pass — hang tight!'];
}

router.get('/costs', (req, res) => res.json({ costs: BL_COSTS }));
router.get('/system-prompts', auth, (req, res) => res.json({ gen_prompt: GEN_PROMPT, edit_prompt: EDIT_PROMPT, fix_prompt: FIX_PROMPT }));

router.get('/available-models', auth, (req, res) => {
  const tier = req.user.subscription_tier; const config = req.user.getTierConfig(); const chain = config.modelChain || ['groq']; const isAdmin = req.user.role === 'super-admin'; const isPaidTier = ['bronze', 'silver', 'gold', 'diamond'].includes(tier);
  const models = chain.map(m => {
    const limit = config.monthlyLimits?.[m]; const isTrial = config.trialModels?.includes(m); let used = isTrial ? ((req.user.trials_used?.[m]) || 0) : req.user.getModelUsageCount(m);
    const groqBlocked = (m === 'groq' && isPaidTier);
    return { id: m, name: getModelDisplayName(m), cost: BL_COSTS.generation[m] || 5000, monthlyLimit: limit === Infinity ? 'Unlimited' : limit, monthlyUsed: used, available: groqBlocked ? false : (isTrial ? !req.user.isTrialExhausted(m, limit) : (limit === Infinity || used < limit)), primary: chain.indexOf(m) === 0, type: isTrial ? 'one_time_trial' : 'monthly', blockedReason: groqBlocked ? 'Groq unavailable for builds on paid plans.' : undefined };
  });
  if (isAdmin) { for (const m of ['sonnet-4.6', 'gemini-3.1-pro', 'gemini-2.5-flash', 'haiku-4.5', 'groq']) { if (!chain.includes(m)) models.push({ id: m, name: getModelDisplayName(m) + ' (Admin)', cost: BL_COSTS.generation[m] || 5000, monthlyLimit: 'Unlimited', monthlyUsed: 0, available: true, primary: false, type: 'unlimited' }); } }
  const allModelsInfo = ['sonnet-4.6', 'gemini-3.1-pro', 'gemini-2.5-flash', 'haiku-4.5', 'groq'].map(m => ({ id: m, name: getModelDisplayName(m), cost: BL_COSTS.generation[m] || 5000, available: chain.includes(m) || isAdmin, tier_required: !chain.includes(m), blockedForBuild: m === 'groq' && isPaidTier }));
  res.json({ models, allModels: allModelsInfo, plan: tier, subscription_tier: tier, monthlyUsage: req.user.getMonthlyUsage(), bl_coins: req.user.bl_coins || 0 });
});

router.post('/generate-with-progress', auth, async (req, res) => {
  const sessionId = `gen-${req.user._id}-${Date.now()}`;
  let keepaliveInterval = null; let progressTicker = null; let connectionAlive = true;
  try {
    const user = req.user;
    const { prompt, template, projectName, description, colorScheme, features, model: requestedModel, existingFiles, customSystemPrompt, referenceImages } = req.body;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', 'Access-Control-Allow-Origin': '*' });
    const sendProgress = (step, message, extra = {}) => { if (connectionAlive) safeSend(res, { type: 'progress', step, message, ...extra }); };
    let aborted = false;
    activeSessions.set(sessionId, { abort: () => { aborted = true; } });
    res.on('close', () => { aborted = true; connectionAlive = false; if (keepaliveInterval) clearInterval(keepaliveInterval); activeSessions.delete(sessionId); });
    sendProgress('validating', 'Validating your request...');
    const model = getEffectiveModel(user, requestedModel, true);
    if (!model) { sendProgress('error', 'All AI model limits reached.'); safeSend(res, { type: 'error', error: 'Limits reached', upgrade: true }); return res.end(); }
    const config = user.getTierConfig();
    const inputText = prompt || description || '';
    if (config.maxChars !== Infinity && inputText.length > config.maxChars) { sendProgress('error', 'Message too long.'); safeSend(res, { type: 'error', error: 'Message too long' }); return res.end(); }
    const cost = BL_COSTS.generation[model] || 5000;
    if (user.role !== 'super-admin' && user.bl_coins < cost) { sendProgress('error', `Need ${cost.toLocaleString()} BL coins.`); safeSend(res, { type: 'error', error: 'Insufficient BL coins', required: cost, balance: user.bl_coins }); return res.end(); }
    user.spendCoins(cost, 'generation', `Website generation (${getModelDisplayName(model)})`, model);
    user.incrementMonthlyUsage(model, 'generation');
    if (config.trialModels?.includes(model)) user.incrementTrial(model);
    await user.save();
    sendProgress('analyzing', 'Analyzing your prompt...', { model, cost, sessionId });
    if (aborted) { user.creditCoins(cost, 'generation', 'Refund: stopped'); user.decrementMonthlyUsage(model, 'generation'); await user.save(); safeSend(res, { type: 'stopped' }); return res.end(); }
    const modelLabel = getModelDisplayName(model);
    const visionImages = (referenceImages || []).filter(img => img.base64 && img.mimeType).map(img => ({ base64: img.base64, mimeType: img.mimeType }));
    if (visionImages.length > 0) { sendProgress('analyzing', `Analyzing ${visionImages.length} reference image(s) — AI will match the design...`); }
    const speed = model.includes('gemini') ? '~30-60s' : model.includes('haiku') ? '~1-2 min' : model.includes('sonnet') ? '~1-2 min' : '~15-30s';
    sendProgress('connecting', `Connecting to ${modelLabel}... (${speed})`);
    keepaliveInterval = setInterval(() => { if (!connectionAlive) { clearInterval(keepaliveInterval); return; } try { if (!res.writableEnded) res.write(`: keepalive\n\n`); else { clearInterval(keepaliveInterval); connectionAlive = false; } } catch { clearInterval(keepaliveInterval); connectionAlive = false; } }, 10000);
    sendProgress('building', `Let me take a look at what you want to build... 🧠`);
    const progressMsgs = await generateProgressMessages(prompt || description || '', template, projectName, modelLabel);
    let progressIdx = 0;
    progressTicker = setInterval(() => { if (!connectionAlive || aborted || progressIdx >= progressMsgs.length) { clearInterval(progressTicker); return; } sendProgress('building', progressMsgs[progressIdx]); progressIdx++; }, 8000);
    const aiOpts = { onProgress: (msg) => { if (!aborted && connectionAlive) sendProgress('generating', msg); } };
    let files; let usedModel = model; let systemPrompt = GEN_PROMPT; let userPrompt = '';
    if (template && template !== 'custom') {
      if (customSystemPrompt?.trim().length > 50) systemPrompt = customSystemPrompt;
      sendProgress('generating_html', `Building ${template}: "${projectName || 'My Project'}"...`);
      files = await generateProjectMultiStep(template, projectName || 'My Project', description || prompt, colorScheme, features, model, aiOpts);
    } else {
      if (existingFiles?.length > 0) {
        sendProgress('generating_html', `Modifying your website using ${modelLabel}...`);
        systemPrompt = EDIT_PROMPT;
        const existingCode = existingFiles.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
        const existingCodeSize = existingCode.length;
        userPrompt = `<existing_website>\n${existingCode}\n</existing_website>\n\n<user_request>\n${prompt}\n</user_request>\n\nProject: ${projectName || 'My Website'}\n${colorScheme && colorScheme !== 'keep existing' ? `Color change: ${colorScheme}` : 'Colors: DO NOT CHANGE'}\n${features ? `Features: ${features.join(', ')}` : ''}\n${visionImages.length > 0 ? 'REFERENCE IMAGES ATTACHED: Study them carefully and apply the design changes shown.' : ''}\n\nReturn the COMPLETE updated file.`;
        if (model === 'groq' && existingCodeSize > 5000) {
          for (const um of ['gemini-2.5-flash', 'haiku-4.5', 'gemini-3.1-pro']) {
            const uc = BL_COSTS.generation[um] || 10000;
            if (user.role === 'super-admin' || user.bl_coins >= uc) {
              sendProgress('generating', `File too large for Groq. Upgrading to ${getModelDisplayName(um)}...`);
              const result = await callAISmart(systemPrompt, userPrompt, um, undefined, visionImages, aiOpts);
              files = result ? parseFilesFromResponse(result) : [];
              if (files?.length) { usedModel = um; const diff = uc - cost; if (diff > 0) { user.spendCoins(diff, 'generation', `Edit upgrade: Groq → ${getModelDisplayName(um)}`); await user.save(); } break; }
            }
          }
          if (!files?.length) { const result = await callAISmart(systemPrompt, userPrompt, model, undefined, visionImages, aiOpts); files = result ? parseFilesFromResponse(result) : []; }
        } else {
          const result = await callAISmart(systemPrompt, userPrompt, model, undefined, visionImages, aiOpts);
          files = result ? parseFilesFromResponse(result) : [];
        }
      } else {
        const matchedTemplate = matchPrebuiltTemplate(prompt || description || projectName || '');
        if (matchedTemplate) {
          sendProgress('generating_html', `Found "${matchedTemplate.title}" template — customizing with ${modelLabel}...`);
          console.log(`[Templates] Matched "${matchedTemplate.filename}" (prompt: "${(prompt || '').slice(0, 60)}")`);
          systemPrompt = (customSystemPrompt?.trim().length > 50) ? customSystemPrompt : GEN_PROMPT;
          userPrompt = `You have a PREBUILT HTML template below. The user wants to build: "${prompt}"\n\nYour job:\n1. Use this template as a STARTING BASE — keep its structure, animations, and functionality\n2. CUSTOMIZE it based on the user's specific request (change text, colors, branding, features as needed)\n3. Keep ALL working JavaScript functionality intact\n4. Keep ALL CSS animations and transitions\n5. Update text content, colors, and branding to match what the user described\n6. If the user's request is very different from the template, still use the template's layout/structure as inspiration\n\nProject name: ${projectName || 'My Project'}\nColors: ${colorScheme || 'keep template colors or modern dark theme'}\n${features ? `Extra features: ${features.join(', ')}` : ''}\n\nIMPORTANT: Return a COMPLETE self-contained index.html. Do NOT strip any working JS or CSS.\n\n<prebuilt_template>\n${matchedTemplate.html}\n</prebuilt_template>`;
          const result = await callAISmart(systemPrompt, userPrompt, model, undefined, visionImages, aiOpts);
          files = result ? parseFilesFromResponse(result) : [];
          if (!files?.length) { sendProgress('generating', 'Using template directly...'); files = [{ name: 'index.html', content: matchedTemplate.html }]; }
        } else {
          sendProgress('generating_html', `Generating website using ${modelLabel}...`);
          systemPrompt = (customSystemPrompt?.trim().length > 50) ? customSystemPrompt : GEN_PROMPT;
          userPrompt = `Create a complete, production-ready website: ${prompt}\n\nProject: ${projectName || 'My Website'}\nColors: ${colorScheme || 'modern dark theme'}\n${features ? `Features: ${features.join(', ')}` : ''}\n${visionImages.length > 0 ? 'REFERENCE IMAGES ATTACHED: Study them carefully. Recreate the design, layout, colors, and structure as closely as possible.' : ''}\n\nIMPORTANT: Self-contained index.html with ALL CSS in <style> and ALL JS in <script>.`;
          const result = await callAISmart(systemPrompt, userPrompt, model, undefined, visionImages, aiOpts);
          files = result ? parseFilesFromResponse(result) : [];
        }
      }
    }
    if (aborted || !connectionAlive) {
      if (keepaliveInterval) clearInterval(keepaliveInterval); clearInterval(progressTicker);
      user.creditCoins(cost, 'generation', 'Refund: stopped'); user.decrementMonthlyUsage(model, 'generation'); await user.save();
      if (connectionAlive) { safeSend(res, { type: 'stopped' }); res.end(); } return;
    }
    if (!files?.length) {
      sendProgress('generating', `${modelLabel} had an issue — retrying once...`);
      try { const retryResult = await callAISmart(systemPrompt, userPrompt, model, undefined, visionImages, aiOpts); const retryFiles = retryResult ? parseFilesFromResponse(retryResult) : []; if (retryFiles?.length) { files = retryFiles; sendProgress('generating', `${modelLabel} retry succeeded!`); } } catch (retryErr) { console.warn(`[Retry] ${model}: ${retryErr.message}`); }
    }
    if (!files?.length) {
      const opType = existingFiles?.length > 0 ? 'edit' : 'new_website';
      const fallbackChain = getTierFallbackChain(user.subscription_tier || 'free', opType);
      const currentIdx = fallbackChain.indexOf(normalizeModelKey(model));
      const nextModel = fallbackChain[currentIdx + 1] || null;
      const isGroqWarn = nextModel === 'groq';
      const noMoreModels = !nextModel;
      user.creditCoins(cost, 'generation', `Refund: ${modelLabel} failed`); user.decrementMonthlyUsage(model, 'generation'); await user.save();
      if (keepaliveInterval) clearInterval(keepaliveInterval); clearInterval(progressTicker);
      safeSend(res, { type: 'fallback_needed', currentModel: modelLabel, nextModel: nextModel ? getModelDisplayName(nextModel) : null, nextModelId: nextModel, nextCost: nextModel ? (BL_COSTS.generation[nextModel] || 5000) : 0, balance: user.bl_coins, isGroqWarn, noMoreModels, error: noMoreModels ? 'All AI models are currently unresponsive.' : null });
      return res.end();
    }
    sendProgress('preview', 'Building live preview...');
    const preview = generatePreviewHTML(files);
    const actualLabel = getModelDisplayName(usedModel); const actualCost = BL_COSTS.generation[usedModel] || cost;
    sendProgress('done', `Done! ${files.length} file(s) using ${actualLabel}.`);
    safeSend(res, { type: 'complete', files, preview, model: usedModel, blSpent: actualCost, balanceRemaining: user.bl_coins, monthlyUsage: user.getMonthlyUsage(), fileCount: files.length });
    if (keepaliveInterval) clearInterval(keepaliveInterval); clearInterval(progressTicker);
    res.end(); activeSessions.delete(sessionId);
  } catch (err) {
    if (keepaliveInterval) clearInterval(keepaliveInterval); if (progressTicker) clearInterval(progressTicker);
    console.error('[Build] Error:', err.message);
    if (connectionAlive) { try { safeSend(res, { type: 'error', error: err.message || 'Failed' }); res.end(); } catch {} }
    activeSessions.delete(sessionId);
  }
});

router.post('/stop', auth, (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && activeSessions.has(sessionId)) { activeSessions.get(sessionId).abort(); activeSessions.delete(sessionId); return res.json({ stopped: true }); }
  for (const [id, s] of activeSessions) { if (id.includes(req.user._id.toString())) { s.abort(); activeSessions.delete(id); return res.json({ stopped: true }); } }
  res.json({ stopped: false });
});

router.post('/generate', auth, async (req, res) => {
  try {
    const user = req.user;
    const { prompt, template, projectName, description, colorScheme, features, model: requestedModel, referenceImages } = req.body;
    const model = getEffectiveModel(user, requestedModel, true);
    if (!model) return res.status(403).json({ error: 'Limits reached', upgrade: true });
    const config = user.getTierConfig();
    if (config.maxChars !== Infinity && (prompt || description || '').length > config.maxChars) return res.status(400).json({ error: 'Message too long' });
    const cost = BL_COSTS.generation[model] || 5000;
    if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient BL coins', required: cost, balance: user.bl_coins });
    user.spendCoins(cost, 'generation', `Website generation (${getModelDisplayName(model)})`, model);
    user.incrementMonthlyUsage(model, 'generation');
    if (config.trialModels?.includes(model)) user.incrementTrial(model);
    await user.save();
    const visionImages = (referenceImages || []).filter(img => img.base64 && img.mimeType);
    let files;
    if (template && template !== 'custom') { files = await generateProjectMultiStep(template, projectName || 'My Project', description || prompt, colorScheme, features, model); }
    else {
      const userPrompt = `Create website: ${prompt}\n\nProject: ${projectName || 'My Website'}\nColors: ${colorScheme || 'modern dark theme'}\n${features ? `Features: ${features.join(', ')}` : ''}\n${visionImages.length > 0 ? 'REFERENCE IMAGES ATTACHED: Recreate the design shown.' : ''}\nSelf-contained index.html.`;
      const result = await callAISmart(GEN_PROMPT, userPrompt, model, undefined, visionImages, {});
      files = result ? parseFilesFromResponse(result) : [];
    }
    if (!files?.length) { user.creditCoins(cost, 'generation', 'Refund: failed'); user.decrementMonthlyUsage(model, 'generation'); await user.save(); return res.status(500).json({ error: 'Failed. Coins refunded.' }); }
    res.json({ files, preview: generatePreviewHTML(files), model, blSpent: cost, balanceRemaining: user.bl_coins, monthlyUsage: user.getMonthlyUsage(), fileCount: files.length });
  } catch (err) { res.status(500).json({ error: err.message || 'Failed' }); }
});

// ── Helper: strip huge base64 data URLs from HTML before saving to MongoDB ──
// ONLY used for saved_projects — NEVER for deployed_sites (visitors need images)
function sanitizeFilesForSave(files) {
  if (!files?.length) return files;
  return files.map(f => {
    if (!f.name?.endsWith('.html') || !f.content) return f;
    let html = f.content;
    const b64Regex = /data:(image|video)\/[^;]+;base64,[A-Za-z0-9+/=]{500,}/g;
    const matches = html.match(b64Regex);
    if (matches) {
      matches.forEach((match, i) => {
        html = html.replace(match, `https://placehold.co/800x400/1a1a2e/666?text=Image+removed+to+save+space`);
      });
      console.log(`[SaveGuard] Stripped ${matches.length} base64 image(s) from ${f.name}`);
    }
    return { ...f, content: html };
  });
}

// ── Trim user document when approaching MongoDB 16MB limit ──
function trimUserDocumentSize(user) {
  const MAX_SIZE = 12 * 1024 * 1024;
  const estimateSize = () => {
    let size = 0;
    (user.deployed_sites || []).forEach(s => {
      (s.files || []).forEach(f => { size += (f.content?.length || 0); });
    });
    (user.saved_projects || []).forEach(p => {
      (p.files || []).forEach(f => { size += (f.content?.length || 0); });
      size += (p.preview?.length || 0);
    });
    return size;
  };

  let currentSize = estimateSize();
  if (currentSize <= MAX_SIZE) return;

  console.log(`[TrimDoc] User document content ~${(currentSize / 1024 / 1024).toFixed(1)}MB — trimming...`);

  // Step 1: Strip base64 from ALL saved projects (editor loads from deployed_sites instead)
  // Do NOT strip deployed site images — live visitors need them AND editor reads from them
  (user.saved_projects || []).forEach(p => {
    p.files = sanitizeFilesForSave(p.files || []);
    p.preview = '';
  });
  user.markModified('deployed_sites');
  user.markModified('saved_projects');

  currentSize = estimateSize();
  if (currentSize <= MAX_SIZE) { console.log(`[TrimDoc] After base64 strip: ~${(currentSize / 1024 / 1024).toFixed(1)}MB — OK`); return; }

  // Step 2: Enforce max 2 clones per project
  const rootIds = new Set();
  (user.saved_projects || []).forEach(p => { if (p.cloneOf) rootIds.add(p.cloneOf); });
  rootIds.forEach(rootId => enforceMaxClones(user, rootId));

  currentSize = estimateSize();
  if (currentSize <= MAX_SIZE) { console.log(`[TrimDoc] After clone cleanup: ~${(currentSize / 1024 / 1024).toFixed(1)}MB — OK`); return; }

  // Step 3: Trim deployed sites — keep full content only for 2 most recent
  const sites = [...(user.deployed_sites || [])];
  sites.sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));
  sites.forEach((s, i) => {
    if (i >= 2) {
      s.files = [{ name: 'index.html', content: '<!-- Site trimmed. Re-deploy from project to restore. -->' }];
    }
  });

  currentSize = estimateSize();
  if (currentSize <= MAX_SIZE) { console.log(`[TrimDoc] After site trim: ~${(currentSize / 1024 / 1024).toFixed(1)}MB — OK`); return; }

  // Step 4: Truncate large root project HTML files (keep first 80KB)
  (user.saved_projects || []).forEach(p => {
    if (!p.cloneOf && p.cloneVersion == null) {
      (p.files || []).forEach(f => {
        if (f.content && f.content.length > 80000) {
          f.content = f.content.slice(0, 80000) + '\n<!-- Truncated to save space --></body></html>';
        }
      });
    }
  });

  currentSize = estimateSize();
  if (currentSize <= MAX_SIZE) { console.log(`[TrimDoc] After root truncate: ~${(currentSize / 1024 / 1024).toFixed(1)}MB — OK`); return; }

  // Step 5: Last resort — trim oldest root projects (keep newest 3)
  const roots = (user.saved_projects || []).filter(p => !p.cloneOf && p.cloneVersion == null);
  roots.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  roots.forEach((p, i) => {
    if (i >= 3) {
      p.files = [{ name: 'index.html', content: '<!-- Project archived. Rebuild to restore. -->' }];
    }
  });

  currentSize = estimateSize();
  console.log(`[TrimDoc] Final size: ~${(currentSize / 1024 / 1024).toFixed(1)}MB${currentSize > MAX_SIZE ? ' — STILL OVER' : ' — OK'}`);
}

router.post('/save-project', auth, async (req, res) => {
  const doSave = async (attempt = 0) => {
    const user = attempt === 0 ? req.user : await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { projectId, name, files: rawFiles, preview, template, description, subdomain, skipSanitize } = req.body;
    if (!rawFiles?.length) return res.status(400).json({ error: 'No files' });
    const files = skipSanitize ? rawFiles : sanitizeFilesForSave(rawFiles);
    if (projectId) { const idx = (user.saved_projects || []).findIndex(p => p.projectId === projectId); if (idx >= 0) { user.saved_projects[idx].name = name || user.saved_projects[idx].name; user.saved_projects[idx].files = files; user.saved_projects[idx].preview = (preview || '').slice(0, 500000); user.saved_projects[idx].updatedAt = new Date(); user.saved_projects[idx].version = (user.saved_projects[idx].version || 1) + 1; user.saved_projects[idx].description = description || user.saved_projects[idx].description; if (subdomain && !user.saved_projects[idx].linkedSubdomain) user.saved_projects[idx].linkedSubdomain = subdomain; } else return res.status(404).json({ error: 'Not found' }); }
    else { if (!user.saved_projects) user.saved_projects = []; user.saved_projects.push({ projectId: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: name || 'Untitled', files, preview: (preview || '').slice(0, 500000), template: template || 'custom', description: description || '', linkedSubdomain: subdomain || null, version: 1, createdAt: new Date(), updatedAt: new Date() }); }
    trimUserDocumentSize(user);
    user.markModified('saved_projects');
    await user.save();
    const proj = projectId ? user.saved_projects.find(p => p.projectId === projectId) : user.saved_projects[user.saved_projects.length - 1];
    res.json({ project: { projectId: proj.projectId, name: proj.name, version: proj.version, fileCount: proj.files.length, linkedSubdomain: proj.linkedSubdomain, updatedAt: proj.updatedAt }, message: 'Saved!' });
  };
  try { await doSave(0); } catch (err) {
    if (err.name === 'VersionError' || err.message?.includes('No matching document')) {
      console.log('[SaveProject] Version conflict, retrying with fresh user...');
      try { await doSave(1); } catch (retryErr) { console.error('[SaveProject] Retry failed:', retryErr.message); res.status(500).json({ error: 'Save failed: ' + (retryErr.message || '').slice(0, 100) }); }
    } else { console.error('[SaveProject]', err.message); res.status(500).json({ error: 'Save failed: ' + (err.message || '').slice(0, 100) }); }
  }
});

router.get('/projects', auth, (req, res) => {
  res.json({ projects: (req.user.saved_projects || []).map(p => ({ projectId: p.projectId, name: p.name, template: p.template, description: p.description, fileCount: (p.files || []).length, version: p.version || 1, linkedSubdomain: p.linkedSubdomain || null, cloneOf: p.cloneOf || null, cloneVersion: p.cloneVersion != null ? p.cloneVersion : null, deployedAt: p.deployedAt || null, hasMemory: ((p.projectMemory?.rawMessages?.length || 0) + (p.projectMemory?.summaries?.length || 0)) > 0, createdAt: p.createdAt, updatedAt: p.updatedAt })).reverse() });
});

router.get('/project/:projectId', auth, (req, res) => {
  const proj = (req.user.saved_projects || []).find(p => p.projectId === req.params.projectId);
  if (!proj) return res.status(404).json({ error: 'Not found' });
  // If project is linked to a deployed site, serve the deployed site's files (they have full images)
  // saved_projects are sanitized to save MongoDB space, but deployed_sites keep real images
  const sub = proj.linkedSubdomain;
  if (sub) {
    const site = (req.user.deployed_sites || []).find(s => s.subdomain === sub);
    if (site?.files?.length && !site.files[0]?.content?.includes('Site trimmed')) {
      const projObj = proj.toObject ? proj.toObject() : { ...proj };
      projObj.files = site.files;
      return res.json({ project: projObj });
    }
  }
  res.json({ project: proj });
});

router.delete('/project/:projectId', auth, async (req, res) => {
  try {
    const user = req.user;
    const projectId = req.params.projectId;
    const project = (user.saved_projects || []).find(p => p.projectId === projectId);
    if (!project) return res.status(404).json({ error: 'Not found' });
    const rootId = project.cloneOf || project.projectId;
    const rootProject = (user.saved_projects || []).find(p => p.projectId === rootId);
    const linkedSub = rootProject?.linkedSubdomain || project.linkedSubdomain;
    const relatedIds = new Set();
    (user.saved_projects || []).forEach(p => { if (p.projectId === rootId || p.cloneOf === rootId) relatedIds.add(p.projectId); });
    let shutdownSite = null;
    if (linkedSub) { const siteIdx = user.deployed_sites.findIndex(s => s.subdomain === linkedSub); if (siteIdx >= 0) { shutdownSite = linkedSub; user.deployed_sites.splice(siteIdx, 1); user.markModified('deployed_sites'); } }
    const beforeCount = user.saved_projects.length;
    user.saved_projects = (user.saved_projects || []).filter(p => !relatedIds.has(p.projectId));
    user.markModified('saved_projects');
    const deletedCount = beforeCount - user.saved_projects.length;
    console.log(`[Delete] Removed ${deletedCount} project(s) for root ${rootId}${shutdownSite ? ` + shutdown site ${shutdownSite}` : ''}`);
    await user.save();
    res.json({ success: true, shutdownSite, deletedCount });
  } catch (err) { console.error('[Delete] Error:', err.message); res.status(500).json({ error: 'Delete failed' }); }
});

// ══════════════════════════════════════════════════════════════════
// FIX: Deploy route — keep original files so live site visitors see images
// ══════════════════════════════════════════════════════════════════
router.post('/deploy', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { subdomain, files: rawFiles, title } = req.body; const config = user.getTierConfig();
    const sub = (subdomain || '').toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(sub)) return res.status(400).json({ error: 'Invalid subdomain' });
    if (RESERVED.includes(sub)) return res.status(400).json({ error: 'Reserved' });
    const existingSite = user.deployed_sites.find(s => s.subdomain === sub);
    if (!existingSite && user.deployed_sites.length >= config.maxSites) return res.status(403).json({ error: `Site limit (${config.maxSites})`, upgrade: true });
    if (!existingSite) { const taken = await User.findOne({ 'deployed_sites.subdomain': sub, _id: { $ne: user._id } }); if (taken) return res.status(409).json({ error: 'Subdomain taken' }); }
    // ── Keep original files — live site visitors need to see images ──
    const files = rawFiles;
    let deployFiles = files; const shouldBadge = !config.canRemoveBadge;
    if (shouldBadge && deployFiles) deployFiles = deployFiles.map(f => f.name.endsWith('.html') ? { ...f, content: f.content.replace('</body>', `${BADGE_SCRIPT}</body>`) } : f);
    if (existingSite) { existingSite.title = title || existingSite.title; existingSite.files = deployFiles; existingSite.lastUpdated = new Date(); existingSite.hasBadge = shouldBadge; existingSite.fileSize = JSON.stringify(files).length; }
    else user.deployed_sites.push({ subdomain: sub, title: title || sub, files: deployFiles, hasBadge: shouldBadge, fileSize: JSON.stringify(files).length });
    if (!user.saved_projects) user.saved_projects = [];
    const linkedProject = user.saved_projects.find(p => p.linkedSubdomain === sub);
    if (linkedProject) { linkedProject.name = title || sub; linkedProject.files = sanitizeFilesForSave(files); linkedProject.updatedAt = new Date(); linkedProject.version = (linkedProject.version || 1) + 1; }
    else { user.saved_projects.push({ projectId: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: title || sub, files: sanitizeFilesForSave(files), preview: '', template: 'custom', description: `Deployed: ${sub}.zapcodes.net`, linkedSubdomain: sub, version: 1, createdAt: new Date(), updatedAt: new Date() }); }
    const deployedProj = user.saved_projects.find(p => p.linkedSubdomain === sub);
    if (deployedProj) {
      const rootId = deployedProj.cloneOf || deployedProj.projectId;
      const alreadyHasClone = (user.saved_projects || []).some(p => (p.cloneOf === rootId || p.projectId === rootId) && p.cloneVersion != null);
      if (!alreadyHasClone) { const clone1 = createCloneSnapshot(deployedProj, 1); user.saved_projects.push(clone1); enforceMaxClones(user, rootId); user.markModified('saved_projects'); }
    }
    user.markModified('deployed_sites');
    trimUserDocumentSize(user);
    await user.save();
    res.json({ url: `https://${sub}.zapcodes.net`, subdomain: sub, deployed: true, hasBadge: shouldBadge, sites: user.deployed_sites.length, maxSites: config.maxSites, linkedProjectId: deployedProj?.projectId });
  } catch (err) { console.error('[Deploy] Error:', err.message, err.stack?.split('\n')[1]); res.status(500).json({ error: 'Deploy failed: ' + (err.message || '').slice(0, 100) }); }
});

router.post('/code-fix', auth, async (req, res) => {
  try {
    const user = req.user; const { files, description, model: requestedModel, referenceImages } = req.body;
    const config = user.getTierConfig(); const mu = user.getMonthlyUsage();
    if (config.monthlyFixCap !== Infinity) { if (config.monthlyFixType === 'one_time_trial') { if ((user.trials_used?.['fixes'] || 0) >= config.monthlyFixCap) return res.status(403).json({ error: 'Trial fix used.', upgrade: true }); } else if ((mu.code_fixes || 0) >= config.monthlyFixCap) return res.status(403).json({ error: 'Fix limit reached', upgrade: true }); }
    const model = getEffectiveModel(user, requestedModel, true) || 'gemini-2.5-flash';
    const cost = BL_COSTS.codeFix[model] || 5000;
    if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient BL coins' });
    user.spendCoins(cost, 'code_fix', `Code fix (${getModelDisplayName(model)})`, model); user.incrementMonthlyUsage(model, 'code_fix');
    if (config.monthlyFixType === 'one_time_trial') user.incrementTrial('fixes'); await user.save();
    const fileContent = (files || []).map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
    const visionImages = (referenceImages || []).filter(img => img.base64 && img.mimeType);
    let actualModel = model;
    if (model === 'groq' && fileContent.length > 5000) {
      for (const um of ['gemini-2.5-flash', 'haiku-4.5', 'gemini-3.1-pro']) { const uc = BL_COSTS.codeFix[um] || 10000; if (user.role === 'super-admin' || user.bl_coins >= uc) { actualModel = um; const diff = uc - cost; if (diff > 0) { user.spendCoins(diff, 'code_fix', `Fix upgrade: Groq → ${getModelDisplayName(um)}`); await user.save(); } break; } }
    }
    const fixPrompt = `Fix:\n\n${fileContent}\n\nIssue: ${description || 'Fix all bugs'}\n${visionImages.length > 0 ? 'BUG SCREENSHOT ATTACHED: Analyze the screenshot to understand the visual bug.' : ''}`;
    const result = await callAISmart(FIX_PROMPT, fixPrompt, actualModel, undefined, visionImages, {});
    const fixedFiles = result ? parseFilesFromResponse(result) : [];
    if (!fixedFiles.length) { user.creditCoins(cost, 'code_fix', 'Refund: fix failed'); user.decrementMonthlyUsage(model, 'code_fix'); await user.save(); return res.status(500).json({ error: 'Fix failed. Refunded.' }); }
    res.json({ files: fixedFiles, preview: generatePreviewHTML(fixedFiles), model, blSpent: cost, balanceRemaining: user.bl_coins });
  } catch { res.status(500).json({ error: 'Fix failed' }); }
});

router.post('/github-push', auth, async (req, res) => {
  try {
    const user = req.user; const config = user.getTierConfig(); const mu = user.getMonthlyUsage();
    if (config.monthlyPushCap !== Infinity) { if (config.monthlyPushType === 'one_time_trial') { if ((user.trials_used?.['github_pushes'] || 0) >= config.monthlyPushCap) return res.status(403).json({ error: 'Trial push used.' }); } else if ((mu.github_pushes || 0) >= config.monthlyPushCap) return res.status(403).json({ error: 'Push limit reached' }); }
    if (user.role !== 'super-admin' && user.bl_coins < BL_COSTS.githubPush) return res.status(402).json({ error: 'Insufficient BL coins' });
    const { files, repoName, message } = req.body; const token = user.githubToken; if (!token) return res.status(400).json({ error: 'Connect GitHub in Settings' });
    user.spendCoins(BL_COSTS.githubPush, 'github_push', 'GitHub push'); user.incrementMonthlyUsage(null, 'push');
    if (config.monthlyPushType === 'one_time_trial') user.incrementTrial('github_pushes'); await user.save();
    const ghUser = await axios.get('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}` } }); const owner = ghUser.data.login;
    let repo; try { repo = (await axios.get(`https://api.github.com/repos/${owner}/${repoName}`, { headers: { Authorization: `Bearer ${token}` } })).data; } catch { repo = (await axios.post('https://api.github.com/user/repos', { name: repoName, private: false, auto_init: true, description: 'Built with ZapCodes AI' }, { headers: { Authorization: `Bearer ${token}` } })).data; }
    for (const file of (files || [])) { const content = Buffer.from(file.content).toString('base64'); const path = file.name.startsWith('/') ? file.name.slice(1) : file.name; let sha; try { sha = (await axios.get(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, { headers: { Authorization: `Bearer ${token}` } })).data.sha; } catch {} await axios.put(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, { message: message || 'Deploy via ZapCodes', content, sha }, { headers: { Authorization: `Bearer ${token}` } }); }
    res.json({ success: true, repoUrl: repo.html_url, blSpent: BL_COSTS.githubPush, balanceRemaining: user.bl_coins });
  } catch { res.status(500).json({ error: 'GitHub push failed' }); }
});

router.post('/pwa', auth, async (req, res) => { try { const user = req.user; const config = user.getTierConfig(); if (!config.canPWA) return res.status(403).json({ error: 'PWA requires Gold+', upgrade: true }); if (user.role !== 'super-admin' && user.bl_coins < BL_COSTS.pwaBuild) return res.status(402).json({ error: 'Insufficient BL coins' }); const { subdomain, appName, themeColor } = req.body; const site = user.deployed_sites.find(s => s.subdomain === subdomain); if (!site) return res.status(404).json({ error: 'Not found' }); user.spendCoins(BL_COSTS.pwaBuild, 'pwa_build', `PWA for ${subdomain}`); site.isPWA = true; await user.save(); res.json({ manifest: { name: appName || site.title, short_name: (appName || subdomain).slice(0, 12), start_url: '/', display: 'standalone', background_color: '#000', theme_color: themeColor || '#6366f1', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, blSpent: BL_COSTS.pwaBuild, balanceRemaining: user.bl_coins }); } catch { res.status(500).json({ error: 'PWA failed' }); } });

router.post('/remove-badge', auth, async (req, res) => { try { const user = req.user; const config = user.getTierConfig(); if (!config.canRemoveBadge) return res.status(403).json({ error: 'Silver+ required', upgrade: true }); if (user.role !== 'super-admin' && user.bl_coins < BL_COSTS.badgeRemoval) return res.status(402).json({ error: 'Insufficient' }); const site = user.deployed_sites.find(s => s.subdomain === req.body.subdomain); if (!site) return res.status(404).json({ error: 'Not found' }); if (!site.hasBadge) return res.json({ message: 'Already removed' }); user.spendCoins(BL_COSTS.badgeRemoval, 'badge_removal', `Badge ${req.body.subdomain}`); site.hasBadge = false; await user.save(); res.json({ success: true, blSpent: BL_COSTS.badgeRemoval, balanceRemaining: user.bl_coins }); } catch { res.status(500).json({ error: 'Failed' }); } });

router.post('/clone-analyze', auth, async (req, res) => { try { let content = req.body.code || ''; if (req.body.url) { try { content = (await axios.get(req.body.url, { timeout: 15000, headers: { 'User-Agent': 'ZapCodes-Analyzer/1.0' } })).data; } catch (e) { return res.status(400).json({ error: `Could not fetch: ${e.message}` }); } } if (!content) return res.status(400).json({ error: 'Provide URL or code' }); const analysis = await callAI(CLONE_PROMPT, content.slice(0, 30000), 'groq'); let parsed; try { parsed = JSON.parse(analysis); } catch { parsed = { title: 'Website', type: 'other', sections: [], colors: {}, layout: analysis }; } res.json({ analysis: parsed }); } catch { res.status(500).json({ error: 'Analysis failed' }); } });

router.post('/clone-rebuild', auth, async (req, res) => { try { const user = req.user; const model = getEffectiveModel(user, req.body.model, true) || 'gemini-2.5-flash'; const cost = BL_COSTS.generation[model] || 5000; if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient' }); user.spendCoins(cost, 'generation', `Clone (${getModelDisplayName(model)})`, model); user.incrementMonthlyUsage(model, 'generation'); if (user.getTierConfig().trialModels?.includes(model)) user.incrementTrial(model); await user.save(); const result = await callAI(GEN_PROMPT, `Rebuild:\n${JSON.stringify(req.body.analysis)}\n\nMods: ${req.body.modifications || 'Keep faithful'}`, model); let files = result ? parseFilesFromResponse(result) : []; if (!files.length) { user.creditCoins(cost, 'generation', 'Refund'); user.decrementMonthlyUsage(model, 'generation'); await user.save(); return res.status(500).json({ error: 'Failed. Refunded.' }); } res.json({ files, preview: generatePreviewHTML(files), model, blSpent: cost, balanceRemaining: user.bl_coins, fileCount: files.length }); } catch { res.status(500).json({ error: 'Clone failed' }); } });

router.post('/claim-guest-site', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { claimCode: rawCode } = req.body;
    if (!rawCode?.trim()) return res.status(400).json({ error: 'Claim code required' });
    const code = rawCode.trim().toUpperCase();
    console.log(`[Claim] User ${user.email} attempting code: ${code}`);
    let GuestSite;
    try { GuestSite = require('../models/GuestSite'); } catch (e) { console.error('[Claim] GuestSite model not found:', e.message); return res.status(500).json({ error: 'Guest site system not available' }); }
    const isSuperAdmin = user.role === 'super-admin';
    let site = isSuperAdmin ? await GuestSite.findOne({ claimCode: code }) : await GuestSite.findOne({ claimCode: code, status: 'active', expiresAt: { $gt: new Date() } });
    if (!site) { console.log(`[Claim] Code "${code}" not found`); return res.status(404).json({ error: `Code "${code}" not found. Check the code and try again.` }); }
    if (site.status === 'claimed' && site.claimedBy && !isSuperAdmin) { if (site.claimedBy.toString() !== user._id.toString()) return res.status(409).json({ error: 'This site was already claimed by another user.' }); }
    site.status = 'claimed'; site.claimedBy = user._id; site.claimedAt = new Date(); site.claimedVia = 'zapcodes'; await site.save();
    const html = site.generatedHtml || ''; const siteSub = site.subdomain || ''; const siteName = site.projectName || site.title || siteSub || 'Guest Build';
    if (html && siteSub) {
      const siteFiles = [{ name: 'index.html', content: html }];
      const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!user.saved_projects) user.saved_projects = [];
      const alreadyImported = user.saved_projects.some(p => p.linkedSubdomain === siteSub);
      if (!alreadyImported) { user.saved_projects.push({ projectId, name: siteName, files: siteFiles, preview: html.slice(0, 50000), template: site.templateKey || 'custom', description: site.description || `Claimed from guest build (code: ${code})`, linkedSubdomain: siteSub, version: 1, createdAt: new Date(), updatedAt: new Date() }); }
      if (!user.deployed_sites.some(s => s.subdomain === siteSub)) { user.deployed_sites.push({ subdomain: siteSub, title: siteName, files: siteFiles, hasBadge: true, fileSize: html.length, lastUpdated: new Date() }); }
      user.markModified('saved_projects'); user.markModified('deployed_sites'); await user.save();
      console.log(`[Claim] SUCCESS — ${user.email} claimed ${siteSub} (${html.length} chars imported)`);
      return res.json({ success: true, subdomain: siteSub, url: `https://${siteSub}.zapcodes.net`, message: `Site claimed! Your site and project are now in your account.` });
    }
    console.log(`[Claim] ${user.email} claimed ${siteSub} but no HTML to import`);
    res.json({ success: true, subdomain: siteSub, url: siteSub ? `https://${siteSub}.zapcodes.net` : '', message: 'Site claimed but no content found.' });
  } catch (err) { console.error('[Claim] Error:', err.message); res.status(500).json({ error: 'Claim failed: ' + (err.message || '').slice(0, 150) }); }
});

router.post('/rename-subdomain', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { oldSubdomain, newSubdomain } = req.body;
    if (!oldSubdomain || !newSubdomain) return res.status(400).json({ error: 'Both old and new subdomain required' });
    const clean = newSubdomain.toLowerCase().trim().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 30);
    if (clean.length < 2) return res.status(400).json({ error: 'Subdomain must be at least 2 characters (letters, numbers, hyphens only)' });
    if (/^(www|api|admin|mail|ftp|preview|test|zapcodes|blendlink)$/i.test(clean)) return res.status(400).json({ error: 'That subdomain is reserved. Please choose another.' });
    const allUsers = await User.find({ 'deployed_sites.subdomain': clean, _id: { $ne: user._id } }).limit(1);
    if (allUsers.length > 0) return res.status(409).json({ error: `"${clean}.zapcodes.net" is already taken. Try another name.` });
    try { const GuestSite = require('../models/GuestSite'); const existingGuest = await GuestSite.findOne({ subdomain: clean, status: 'active' }); if (existingGuest) return res.status(409).json({ error: `"${clean}.zapcodes.net" is already taken. Try another name.` }); } catch {}
    const siteIdx = user.deployed_sites.findIndex(s => s.subdomain === oldSubdomain);
    const projIdx = (user.saved_projects || []).findIndex(p => p.linkedSubdomain === oldSubdomain);
    if (siteIdx < 0 && projIdx < 0) return res.status(404).json({ error: `Site "${oldSubdomain}" not found in your account.` });
    if (siteIdx >= 0) { user.deployed_sites[siteIdx].subdomain = clean; user.deployed_sites[siteIdx].title = user.deployed_sites[siteIdx].title?.replace(oldSubdomain, clean) || clean; }
    (user.saved_projects || []).forEach(p => { if (p.linkedSubdomain === oldSubdomain) p.linkedSubdomain = clean; });
    try { const GuestSite = require('../models/GuestSite'); await GuestSite.findOneAndUpdate({ subdomain: oldSubdomain }, { subdomain: clean }); } catch {}
    user.markModified('deployed_sites'); user.markModified('saved_projects'); await user.save();
    console.log(`[Rename] ${user.email}: ${oldSubdomain} → ${clean}`);
    res.json({ success: true, oldSubdomain, newSubdomain: clean, url: `https://${clean}.zapcodes.net`, message: `Your site is now live at ${clean}.zapcodes.net!` });
  } catch (err) { console.error('[Rename] Error:', err.message); res.status(500).json({ error: 'Rename failed: ' + (err.message || '').slice(0, 100) }); }
});

router.get('/sites', auth, (req, res) => { const sites = (req.user.deployed_sites || []).map(s => { const lp = (req.user.saved_projects || []).find(p => p.linkedSubdomain === s.subdomain); return { ...(s.toObject ? s.toObject() : s), linkedProjectId: lp?.projectId || null }; }); res.json({ sites }); });

router.post('/site/shutdown', auth, async (req, res) => {
  try {
    const user = req.user;
    const sub = (req.body.subdomain || '').toLowerCase().trim();
    const siteIdx = user.deployed_sites.findIndex(s => s.subdomain === sub);
    if (siteIdx === -1) return res.status(404).json({ error: 'Not found' });
    const site = user.deployed_sites[siteIdx];
    const rootProj = (user.saved_projects || []).find(p => p.linkedSubdomain === sub && !p.cloneVersion);
    if (rootProj && site?.files?.length) {
      const rootId = rootProj.cloneOf || rootProj.projectId;
      (user.saved_projects || []).forEach(p => { if ((p.cloneOf === rootId || p.projectId === rootId) && p.cloneVersion != null && p.cloneVersion >= 2) p.cloneVersion += 1; });
      const liveSnapshot = { projectId: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: rootProj.name, files: JSON.parse(JSON.stringify(site.files || [])), preview: rootProj.preview || '', template: rootProj.template || 'custom', description: `Live snapshot before shutdown on ${new Date().toLocaleDateString()}`, version: rootProj.version || 1, linkedSubdomain: sub, cloneOf: rootId, cloneVersion: 2, isLive: false, deployedAt: site.lastUpdated || new Date(), createdAt: new Date(), updatedAt: new Date(), projectMemory: rootProj.projectMemory ? JSON.parse(JSON.stringify(rootProj.projectMemory)) : { rawMessages: [], summaries: [], totalMessageCount: 0 } };
      user.saved_projects.push(liveSnapshot);
      enforceMaxClones(user, rootId);
      user.markModified('saved_projects');
    }
    user.deployed_sites.splice(siteIdx, 1);
    await user.save();
    res.json({ success: true, message: `${sub}.zapcodes.net offline. Live snapshot saved to version history.` });
  } catch (err) { console.error('[Shutdown]', err.message); res.status(500).json({ error: 'Shutdown failed' }); }
});

router.delete('/site/:subdomain', auth, async (req, res) => {
  try {
    const user = req.user; const sub = req.params.subdomain;
    const si = user.deployed_sites.findIndex(s => s.subdomain === sub);
    if (si >= 0) { user.deployed_sites.splice(si, 1); user.markModified('deployed_sites'); }
    const rootProject = (user.saved_projects || []).find(p => p.linkedSubdomain === sub && !p.cloneOf);
    if (rootProject) { const rootId = rootProject.projectId; const before = user.saved_projects.length; user.saved_projects = (user.saved_projects || []).filter(p => p.projectId !== rootId && p.cloneOf !== rootId); const removed = before - user.saved_projects.length; console.log(`[DeleteSite] Removed site ${sub} + ${removed} project(s)/clone(s)`); }
    else { user.saved_projects = (user.saved_projects || []).filter(p => p.linkedSubdomain !== sub); }
    user.markModified('saved_projects'); await user.save();
    res.json({ success: true });
  } catch (err) { console.error('[DeleteSite] Error:', err.message); res.status(500).json({ error: 'Failed' }); }
});

router.get('/templates', (req, res) => res.json({ templates: [{ id: 'custom', name: 'Custom (AI Chat)', icon: '💬', desc: 'Describe anything' }, { id: 'portfolio', name: 'Portfolio', icon: '👤', desc: 'Personal portfolio' }, { id: 'landing', name: 'Landing Page', icon: '🚀', desc: 'Product landing' }, { id: 'blog', name: 'Blog', icon: '📝', desc: 'Blog template' }, { id: 'ecommerce', name: 'E-Commerce', icon: '🛒', desc: 'Online store' }, { id: 'dashboard', name: 'Dashboard', icon: '📊', desc: 'Admin dashboard' }, { id: 'webapp', name: 'Full-Stack App', icon: '⚡', desc: 'Frontend + backend' }, { id: 'saas', name: 'SaaS', icon: '💎', desc: 'SaaS with auth' }, { id: 'mobile', name: 'Mobile App', icon: '📱', desc: 'React Native' }, { id: 'game', name: 'Mobile Game', icon: '🎮', desc: 'PWA game' }] }));

router.get('/site-content/:subdomain', async (req, res) => { try { const sub = req.params.subdomain.toLowerCase().trim(); const user = await User.findOne({ 'deployed_sites.subdomain': sub }); if (!user) return res.status(404).json({ error: 'Not found' }); const site = user.deployed_sites.find(s => s.subdomain === sub); if (!site?.files?.length) return res.status(404).json({ error: 'No content' }); const indexFile = site.files.find(f => f.name === 'index.html' || f.name.endsWith('.html')); if (req.query.raw && indexFile) { res.setHeader('Content-Type', 'text/html'); return res.send(indexFile.content); } res.json({ subdomain: sub, title: site.title, files: site.files, hasBadge: site.hasBadge }); } catch { res.status(500).json({ error: 'Failed' }); } });

router.get('/site-preview/:subdomain', async (req, res) => { try { const sub = req.params.subdomain.toLowerCase().trim(); const user = await User.findOne({ 'deployed_sites.subdomain': sub }); if (!user) return res.status(404).send('<h1>Not found</h1>'); const site = user.deployed_sites.find(s => s.subdomain === sub); if (!site?.files?.length) return res.status(404).send('<h1>Not found</h1>'); const f = site.files.find(f => f.name === 'index.html') || site.files.find(f => f.name.endsWith('.html')); if (!f) return res.status(404).send('<h1>No HTML</h1>'); res.setHeader('Content-Type', 'text/html'); res.send(f.content); } catch { res.status(500).send('<h1>Error</h1>'); } });

// ══════════════════════════════════════════════════════════════════
// AI Image Generator
// ══════════════════════════════════════════════════════════════════
router.post('/generate-image', auth, async (req, res) => {
  try {
    const user = req.user;
    const { prompt, style, aspectRatio, count } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: 'Image prompt required' });
    const cost = 5000;
    if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient BL coins', required: cost, balance: user.bl_coins });
    const styleMap = { photorealistic: 'photorealistic, ultra detailed, 8K resolution, professional photography', illustration: 'digital illustration, vibrant colors, clean lines, modern design', minimalist: 'minimalist design, clean, simple, white background, elegant', luxury: 'luxury aesthetic, gold accents, sophisticated, high-end editorial photography', cyberpunk: 'cyberpunk style, neon colors, dark futuristic aesthetic, glowing effects', watercolor: 'watercolor painting style, soft brushstrokes, artistic, beautiful colors' };
    const enhancedPrompt = style && styleMap[style] ? `${prompt}. Style: ${styleMap[style]}` : prompt;
    const images = await generateImageImagen4(enhancedPrompt, { aspectRatio: aspectRatio || '1:1', numberOfImages: Math.min(count || 1, 4) });
    if (!images?.length) return res.status(500).json({ error: 'Image generation failed. Please try again.' });
    if (user.role !== 'super-admin') { user.spendCoins(cost, 'generation', `AI Image (Imagen 4): ${prompt.slice(0, 50)}`); await user.save(); }
    res.json({ images, blSpent: user.role === 'super-admin' ? 0 : cost, balanceRemaining: user.bl_coins });
  } catch (err) { console.error('[Build/generate-image]', err.message); res.status(500).json({ error: err.message || 'Image generation failed' }); }
});

// ══════════════════════════════════════════════════════════════════
// AI Vibe Photo Editor
// ══════════════════════════════════════════════════════════════════
router.post('/edit-photo', auth, async (req, res) => {
  try {
    const user = req.user;
    const { image, preset, customPrompt } = req.body;
    if (!image?.base64) return res.status(400).json({ error: 'Image required (base64)' });
    if (!preset && !customPrompt) return res.status(400).json({ error: 'Preset or custom prompt required' });
    const cost = 5000;
    if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient BL coins', required: cost, balance: user.bl_coins });
    const results = await editPhotoVibeEditor(image, preset, customPrompt);
    if (!results?.length) return res.status(500).json({ error: 'Photo transformation failed. Please try again.' });
    if (user.role !== 'super-admin') { user.spendCoins(cost, 'generation', `AI Photo Edit: ${preset || customPrompt?.slice(0, 30)}`); await user.save(); }
    res.json({ images: results, blSpent: user.role === 'super-admin' ? 0 : cost, balanceRemaining: user.bl_coins });
  } catch (err) { console.error('[Build/edit-photo]', err.message); res.status(500).json({ error: err.message || 'Photo edit failed' }); }
});

// ══════════════════════════════════════════════════════════════════
// AI Video Generator
// ══════════════════════════════════════════════════════════════════
router.post('/generate-video', auth, async (req, res) => {
  try {
    const user = req.user;
    const { prompt, durationSeconds, aspectRatio, referenceImage, injectIntoSite, existingHtml } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: 'Video prompt required' });
    const cost = 50000;
    if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient BL coins', required: cost, balance: user.bl_coins });
    const result = await generateVideoVeo(prompt, { durationSeconds: durationSeconds || 8, aspectRatio: aspectRatio || '16:9', referenceImage: referenceImage || null });
    if (!result) return res.status(500).json({ error: 'Video generation failed. All Veo models were unavailable. Try again in a few minutes.' });
    if (result.error && result.filtered) return res.status(400).json({ error: result.message || 'Video was blocked by safety filters. Try a different prompt without people or faces.' });
    if (user.role !== 'super-admin') { user.spendCoins(cost, 'generation', `AI Video (Veo): ${prompt.slice(0, 50)}`); await user.save(); }
    let updatedHtml = null;
    if (injectIntoSite && existingHtml && result.publicUrl) { updatedHtml = injectVideoIntoHTML(existingHtml, result.publicUrl); }
    res.json({ video: result, publicUrl: result.publicUrl, updatedHtml, blSpent: user.role === 'super-admin' ? 0 : cost, balanceRemaining: user.bl_coins });
  } catch (err) { console.error('[Build/generate-video]', err.message); res.status(500).json({ error: err.message || 'Video generation failed' }); }
});

function injectVideoIntoHTML(html, videoUrl) {
  const videoTag = `\n<div id="zc-video-hero" style="position:relative;width:100%;overflow:hidden;max-height:600px;"><video autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;display:block;" src="${videoUrl}"><source src="${videoUrl}" type="video/mp4"></video></div>`;
  if (/<video[^>]*>/i.test(html)) return html.replace(/<video[^>]*src=["'][^"']*["'][^>]*>/i, `<video autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;display:block;" src="${videoUrl}">`);
  if (/<body[^>]*>/i.test(html)) return html.replace(/(<body[^>]*>)/i, '$1' + videoTag);
  return html;
}

// ══════════════════════════════════════════════════════════════════
// MEMORY ENDPOINTS
// ══════════════════════════════════════════════════════════════════
router.post('/save-message', auth, async (req, res) => {
  try {
    const user = req.user;
    const { projectId, message } = req.body;
    if (!projectId || !message) return res.status(400).json({ error: 'projectId and message required' });
    const projIdx = (user.saved_projects || []).findIndex(p => p.projectId === projectId);
    if (projIdx === -1) return res.status(404).json({ error: 'Project not found' });
    const proj = user.saved_projects[projIdx];
    if (!proj.projectMemory) proj.projectMemory = { rawMessages: [], summaries: [], totalMessageCount: 0 };
    const mem = proj.projectMemory;
    if (message.role === 'system') return res.json({ ok: true, skipped: true });
    mem.rawMessages.push({ role: message.role || 'user', content: (message.content || '').slice(0, 2000), mediaPrompts: message.mediaPrompts || {}, timestamp: message.timestamp || new Date().toISOString() });
    mem.totalMessageCount = (mem.totalMessageCount || 0) + 1;
    if (mem.rawMessages.length >= 20) {
      const messagesToSummarize = [...mem.rawMessages];
      const messageRange = `${Math.max(1, mem.totalMessageCount - 19)}-${mem.totalMessageCount}`;
      summarizeProjectMessages(messagesToSummarize).then(async (summary) => {
        if (!summary) return;
        try {
          const freshUser = await User.findById(user._id);
          const pi = (freshUser.saved_projects || []).findIndex(p => p.projectId === projectId);
          if (pi === -1) return;
          const m = freshUser.saved_projects[pi].projectMemory;
          if (!m) return;
          m.summaries.push({ content: summary, messageRange, createdAt: new Date() });
          if (m.summaries.length > 5) m.summaries = m.summaries.slice(-5);
          m.rawMessages = m.rawMessages.slice(messagesToSummarize.length);
          freshUser.markModified('saved_projects'); await freshUser.save();
          console.log(`[Memory] Summarized ${messagesToSummarize.length} messages for project ${projectId}`);
        } catch (err) { console.warn('[Memory] Summarize save failed:', err.message); }
      }).catch(err => console.warn('[Memory] Summarize failed:', err.message));
      mem.rawMessages = mem.rawMessages.slice(-20);
    }
    user.markModified('saved_projects'); await user.save();
    res.json({ ok: true, rawCount: mem.rawMessages.length, summaryCount: mem.summaries.length });
  } catch (err) { console.error('[Memory/save-message]', err.message); res.status(500).json({ error: 'Failed to save message' }); }
});

router.post('/groq-pre-check', auth, async (req, res) => {
  try {
    const { prompt, activeMedia } = req.body;
    if (!prompt?.trim() || !activeMedia?.length) return res.json({ suggestion: null });
    const mediaList = activeMedia.join(', ');
    const checkPrompt = `You are a helpful assistant for a website builder. The user is about to send this prompt to the AI builder:\n\n"${prompt.slice(0, 500)}"\n\nThe user currently has these media items ready to insert: ${mediaList}\n\nYour job: Does the user's prompt include clear instructions about WHERE to place the media on their website and HOW to style it (size, position, etc)?\n\nRules:\n- If the prompt clearly says where to put the media (e.g. "hero section", "replace the banner", "in the gallery", "make it full width background"), respond with ONLY: OK\n- If the prompt does NOT mention placement or location for the media, respond with a SHORT friendly suggestion (1-2 sentences max) asking where they want the media placed. Be specific about what media they have.\n- If the prompt is about something unrelated to the media (e.g. "change the font color"), respond with ONLY: OK\n- Never respond with more than 2 sentences.`;
    const { callGroq } = require('../services/ai');
    const response = await callGroq('You are a helpful assistant for a website builder. Keep responses under 2 sentences.', checkPrompt, { maxTokens: 100, temperature: 0.3 });
    const answer = (response || '').trim();
    if (answer === 'OK' || answer.toUpperCase() === 'OK' || answer.length < 5) return res.json({ suggestion: null });
    res.json({ suggestion: answer });
  } catch (err) { res.json({ suggestion: null }); }
});

router.post('/check-clarity', auth, async (req, res) => {
  try {
    const { prompt, projectId, isEditMode } = req.body;
    if (!prompt) return res.json({ needsClarification: false });
    let recentMessages = [];
    if (projectId) { const proj = (req.user.saved_projects || []).find(p => p.projectId === projectId); recentMessages = proj?.projectMemory?.rawMessages?.slice(-3) || []; }
    const result = await checkPromptClarity(prompt, isEditMode, recentMessages);
    res.json({ needsClarification: !result.clear, question: result.question || null });
  } catch (err) { res.json({ needsClarification: false }); }
});

// ══════════════════════════════════════════════════════════════════
// CLONE / ROLLBACK ENDPOINTS
// ══════════════════════════════════════════════════════════════════
function createCloneSnapshot(sourceProject, cloneVersion) {
  return {
    projectId: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: sourceProject.name,
    files: JSON.parse(JSON.stringify(sourceProject.files || [])),
    preview: sourceProject.preview || '',
    template: sourceProject.template || 'custom',
    description: sourceProject.description || '',
    version: sourceProject.version || 1,
    linkedSubdomain: sourceProject.linkedSubdomain || null,
    cloneOf: sourceProject.cloneOf || sourceProject.projectId,
    cloneVersion,
    isLive: false,
    deployedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    projectMemory: sourceProject.projectMemory ? JSON.parse(JSON.stringify(sourceProject.projectMemory)) : { rawMessages: [], summaries: [], totalMessageCount: 0 },
  };
}

function enforceMaxClones(user, rootProjectId) {
  const MAX_CLONES = 2;
  const clones = (user.saved_projects || []).filter(p => (p.cloneOf === rootProjectId || p.projectId === rootProjectId) && p.cloneVersion != null).sort((a, b) => (b.cloneVersion || 0) - (a.cloneVersion || 0));
  if (clones.length > MAX_CLONES) {
    const toDelete = clones.slice(MAX_CLONES).map(c => c.projectId);
    user.saved_projects = user.saved_projects.filter(p => !toDelete.includes(p.projectId));
    user.markModified('saved_projects');
    console.log(`[Clone] Fully deleted ${toDelete.length} old clone(s) for root ${rootProjectId} — keeping newest ${MAX_CLONES}`);
  }
}

router.post('/redeploy-from-project', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { projectId, currentFiles, name } = req.body;
    if (!projectId) return res.status(400).json({ error: 'Missing projectId' });
    const proj = (user.saved_projects || []).find(p => p.projectId === projectId);
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    if (!proj.linkedSubdomain) return res.status(400).json({ error: 'Project not linked to a subdomain' });
    const sourceFiles = (currentFiles && currentFiles.length > 0) ? currentFiles : proj.files;
    if (!sourceFiles || !sourceFiles.length) return res.status(400).json({ error: 'No files to deploy' });
    if (currentFiles && currentFiles.length > 0) { proj.files = sanitizeFilesForSave(currentFiles); if (name) proj.name = name; }
    const sub = proj.linkedSubdomain;
    let site = user.deployed_sites.find(s => s.subdomain === sub);
    if (!site) {
      const config = user.getTierConfig();
      if (user.deployed_sites.length >= config.maxSites) return res.status(403).json({ error: `Site limit (${config.maxSites})`, upgrade: true });
      const taken = await User.findOne({ 'deployed_sites.subdomain': sub, _id: { $ne: user._id } });
      if (taken) return res.status(409).json({ error: 'Subdomain taken by another user' });
      user.deployed_sites.push({ subdomain: sub, title: proj.name || sub, files: [], hasBadge: !user.getTierConfig().canRemoveBadge, fileSize: 0 });
      site = user.deployed_sites.find(s => s.subdomain === sub);
    }
    const config = user.getTierConfig();
    const shouldBadge = !config.canRemoveBadge;
    const rootId = proj.cloneOf || proj.projectId;
    (user.saved_projects || []).forEach(p => { if ((p.cloneOf === rootId || p.projectId === rootId) && p.cloneVersion != null) p.cloneVersion += 1; });
    // Create clone from unsanitized source files so editor shows images
    const cloneSource = { ...proj, files: sourceFiles };
    const newClone = createCloneSnapshot(cloneSource, 1);
    if (!user.saved_projects) user.saved_projects = [];
    user.saved_projects.push(newClone);
    enforceMaxClones(user, rootId);
    // Deploy with original files — keep images for live site visitors
    let deployFiles = sourceFiles.map(f => ({ ...f }));
    if (shouldBadge) deployFiles = deployFiles.map(f => f.name.endsWith('.html') ? { ...f, content: f.content.replace('</body>', `${BADGE_SCRIPT}</body>`) } : f);
    site.files = deployFiles; // Keep base64 images so live site visitors can see them
    site.title = proj.name || site.title;
    site.lastUpdated = new Date();
    site.hasBadge = shouldBadge;
    site.fileSize = JSON.stringify(site.files).length;
    proj.updatedAt = new Date();
    proj.version = (proj.version || 1) + 1;
    proj.deployedAt = new Date();
    user.markModified('saved_projects');
    user.markModified('deployed_sites');
    trimUserDocumentSize(user);
    await user.save();
    res.json({ success: true, url: `https://${sub}.zapcodes.net`, subdomain: sub, version: proj.version, cloneId: newClone.projectId });
  } catch (err) { console.error('[Redeploy] Error:', err.message, err.stack?.split('\n')[1]); res.status(500).json({ error: err.message || 'Re-deploy failed' }); }
});

// ══════════════════════════════════════════════════════════════════
// FIX: Rollback route — keep images for live site visitors
// ══════════════════════════════════════════════════════════════════
router.post('/rollback', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { cloneProjectId } = req.body;
    if (!cloneProjectId) return res.status(400).json({ error: 'cloneProjectId required' });
    const clone = (user.saved_projects || []).find(p => p.projectId === cloneProjectId);
    if (!clone) return res.status(404).json({ error: 'Clone not found' });
    if (!clone.files?.length || clone.files[0]?.content?.includes('<!-- Clone trimmed')) return res.status(400).json({ error: 'This rollback version has no content. It may have been trimmed to save space.' });
    const sub = clone.linkedSubdomain;
    if (!sub) return res.status(400).json({ error: 'Clone has no linked subdomain' });
    const rootId = clone.cloneOf || clone.projectId;
    const config = user.getTierConfig();
    const shouldBadge = !config.canRemoveBadge;
    let site = user.deployed_sites.find(s => s.subdomain === sub);
    if (!site) {
      if (user.deployed_sites.length >= config.maxSites) return res.status(403).json({ error: `Site limit (${config.maxSites})`, upgrade: true });
      const taken = await User.findOne({ 'deployed_sites.subdomain': sub, _id: { $ne: user._id } });
      if (taken) return res.status(409).json({ error: 'Subdomain taken by another user' });
      user.deployed_sites.push({ subdomain: sub, title: clone.name || sub, files: [], hasBadge: shouldBadge, fileSize: 0 });
      site = user.deployed_sites.find(s => s.subdomain === sub);
    }
    // Keep images for live site — don't sanitize
    let deployFiles = (clone.files || []).map(f => ({ ...f }));
    if (shouldBadge) deployFiles = deployFiles.map(f => f.name.endsWith('.html') ? { ...f, content: f.content.replace('</body>', `${BADGE_SCRIPT}</body>`) } : f);
    site.files = deployFiles;
    site.title = clone.name || site.title;
    site.lastUpdated = new Date();
    site.hasBadge = shouldBadge;
    site.fileSize = JSON.stringify(deployFiles).length;
    const rootProj = (user.saved_projects || []).find(p => p.projectId === rootId);
    if (rootProj) { rootProj.files = clone.files.map(f => ({ ...f })); rootProj.updatedAt = new Date(); rootProj.version = (rootProj.version || 1) + 1; rootProj.deployedAt = new Date(); }
    user.saved_projects = (user.saved_projects || []).filter(p => { if (p.projectId === rootId) return true; if (p.cloneOf === rootId && p.cloneVersion != null) return false; return true; });
    const newClone = createCloneSnapshot(rootProj || clone, 1);
    newClone.name = `${clone.name || sub} (Rollback)`;
    user.saved_projects.push(newClone);
    user.markModified('saved_projects');
    user.markModified('deployed_sites');
    trimUserDocumentSize(user);
    await user.save();
    console.log(`[Rollback] Rolled back ${sub} to clone ${cloneProjectId} → new live site + fresh clone ${newClone.projectId}`);
    res.json({ success: true, url: `https://${sub}.zapcodes.net`, subdomain: sub, cloneId: newClone.projectId, message: `Rolled back successfully! The site is now live and a fresh editable version has been created.` });
  } catch (err) { console.error('[Rollback] Error:', err.message, err.stack?.split('\n')[1]); res.status(500).json({ error: err.message || 'Rollback failed' }); }
});

router.get('/project-clones/:rootId', auth, (req, res) => {
  try {
    const rootId = req.params.rootId;
    const allProjects = req.user.saved_projects || [];
    const clones = allProjects.filter(p => (p.cloneOf === rootId || p.projectId === rootId) && p.cloneVersion != null).sort((a, b) => (a.cloneVersion || 0) - (b.cloneVersion || 0)).map(p => ({ projectId: p.projectId, cloneVersion: p.cloneVersion, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, deployedAt: p.deployedAt, fileCount: (p.files || []).length, hasMemory: (p.projectMemory?.rawMessages?.length || 0) + (p.projectMemory?.summaries?.length || 0) > 0 }));
    res.json({ clones });
  } catch (err) { res.status(500).json({ error: 'Failed to get clones' }); }
});

function stripFakeChatFromHTML(html) {
  if (!html) return html;
  let cleaned = html;
  cleaned = cleaned.replace(/<div[^>]*(?:id|class)=["'][^"']*(?:chatbot|chat-bot|chat-widget|ai-chat|live-chat|livechat|chat-box|chatbox)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '<!-- AI widget injected separately -->');
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?(?:chatInput|chat-input|sendMessage|chatResponse|greetingMessage)[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<(?:section|article|aside)[^>]*(?:id|class)=["'][^"']*(?:chat|chatbot|ai-assistant)[^"']*["'][^>]*>[\s\S]*?<\/(?:section|article|aside)>/gi, '');
  return cleaned;
}

module.exports = router;
