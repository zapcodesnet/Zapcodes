const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { callAI, parseFilesFromResponse, generateProjectMultiStep, verifyAndFix } = require('../services/ai');
const User = require('../models/User');
const axios = require('axios');

// ══════════ BL COIN COSTS — Now imported from config (single source of truth) ══════════
const { BL_COIN_COSTS } = require('../config/blCoins');

// Unified cost lookup that works with both old and new model keys
const BL_COSTS = {
  generation: {
    'sonnet-4.6': BL_COIN_COSTS.generation['sonnet-4.6'],
    'gemini-3.1-pro': BL_COIN_COSTS.generation['gemini-3.1-pro'],
    'haiku-4.5': BL_COIN_COSTS.generation['haiku-4.5'],
    'gemini-2.5-flash': BL_COIN_COSTS.generation['gemini-2.5-flash'],
    'groq': BL_COIN_COSTS.generation['groq'],
    // Legacy aliases (so old frontend calls still work during migration)
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

// ══════════ MODEL DISPLAY NAMES — Updated with new model keys ══════════
const MODEL_DISPLAY = {
  'gemini-3.1-pro': 'Gemini 3.1 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'haiku-4.5': 'Haiku 4.5',
  'sonnet-4.6': 'Sonnet 4.6',
  'groq': 'Groq AI',
  // Legacy aliases
  'gemini-pro': 'Gemini 3.1 Pro',
  'gemini-flash': 'Gemini 2.5 Flash',
  'haiku': 'Haiku 4.5',
  'sonnet': 'Sonnet 4.6',
};

// ══════════ Map old model keys → new model keys ══════════
const NORMALIZE_MODEL_KEY = {
  'gemini-pro': 'gemini-3.1-pro',
  'gemini-flash': 'gemini-2.5-flash',
  'haiku': 'haiku-4.5',
  'sonnet': 'sonnet-4.6',
  'groq': 'groq',
  'gemini-3.1-pro': 'gemini-3.1-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'haiku-4.5': 'haiku-4.5',
  'sonnet-4.6': 'sonnet-4.6',
};

function normalizeModelKey(key) {
  return NORMALIZE_MODEL_KEY[key] || key;
}

const RESERVED = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'cdn', 'dev', 'staging', 'test', 'blog', 'docs', 'status', 'support', 'help', 'zapcodes', 'blendlink'];

// ══════════════════════════════════════════════════════════════
// BUILD FALLBACK CHAINS — Groq blocked for paid tiers
//
// Paid tiers (Bronze+): Sonnet → Gemini Pro → Haiku → Gemini Flash
//   Groq creates ugly, non-functional websites — blocked for paid users
//
// Free tier: Gemini Flash (3 trials) → Groq (after trials exhausted)
//   Groq is only for free users as last resort
//
// Admin: Sonnet → Gemini Pro → Haiku → Gemini Flash → Groq (admin can use anything)
// ══════════════════════════════════════════════════════════════
const BUILD_FALLBACK_PAID = ['sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash'];
const BUILD_FALLBACK_FREE = ['gemini-2.5-flash', 'groq'];
const BUILD_FALLBACK_ADMIN = ['sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];

function getBuildFallbackChain(user) {
  if (user.role === 'super-admin') return BUILD_FALLBACK_ADMIN;
  const tier = user.subscription_tier || 'free';
  if (tier === 'free') return BUILD_FALLBACK_FREE;
  return BUILD_FALLBACK_PAID;
}

// ══════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS
// ══════════════════════════════════════════════════════════════════

const GEN_PROMPT = `You are ZapCodes AI. You build websites. You write complete, working code. You never write placeholder code. You never write "// rest of code here" or "..." or "// similar to above". You write every single line.

WHAT YOU MUST DO:

Step 1: Read what the user wants.
Step 2: Write a COMPLETE index.html file.
Step 3: Put ALL CSS inside a <style> tag in the <head>.
Step 4: Put ALL JavaScript inside a <script> tag before </body>.
Step 5: Do NOT create separate .css or .js files. Everything goes in ONE index.html file.
Step 6: The file must work when opened in a browser. No setup needed.

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

DESIGN RULES (follow all of these):
1. Use CSS custom properties for colors. Example: --primary: #6366f1; --bg: #0f0f1a; --text: #ffffff;
2. Use flexbox and CSS grid for layouts. Never use float.
3. Add hover effects to all buttons and links. Use transition: all 0.3s ease;
4. Add media queries for mobile (max-width: 768px) and tablet (max-width: 1024px).
5. Use Google Fonts. Add the link tag in <head>. Example: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
6. Use dark background colors by default. Light text on dark backgrounds.
7. Add scroll animations using Intersection Observer.
8. Add smooth scrolling: html { scroll-behavior: smooth; }
9. Make a hamburger menu for mobile. Hide desktop nav on small screens. Show hamburger icon.
10. For images, use: https://picsum.photos/WIDTH/HEIGHT (example: https://picsum.photos/600/400)
11. Write at least 500 lines of code.
12. Use semantic HTML: <header>, <nav>, <main>, <section>, <article>, <footer>.

FORM RULES (very important — follow exactly):
Every form on the page MUST actually send data. Use this exact JavaScript code for each form:

const forms = document.querySelectorAll('form');
forms.forEach(form => {
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
    const originalText = btn.textContent;
    btn.textContent = 'Sending...';
    btn.disabled = true;
    const formData = {};
    new FormData(form).forEach((value, key) => { formData[key] = value; });
    const subdomain = window.location.hostname.split('.')[0];
    try {
      const response = await fetch('https://api.zapcodes.net/api/forms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: subdomain, formType: form.dataset.formtype || 'Contact Form', formData: formData })
      });
      const result = await response.json();
      if (result.success) {
        btn.textContent = '✓ Sent!';
        btn.style.background = '#22c55e';
        form.reset();
        setTimeout(function() { btn.textContent = originalText; btn.disabled = false; btn.style.background = ''; }, 3000);
      } else { throw new Error('Failed'); }
    } catch (err) {
      btn.textContent = '✗ Failed';
      btn.style.background = '#ef4444';
      setTimeout(function() { btn.textContent = originalText; btn.disabled = false; btn.style.background = ''; }, 3000);
    }
  });
});

Every <form> tag must have data-formtype attribute. Example: <form data-formtype="Booking Request">
Every <input> and <textarea> must have a name attribute. Example: <input name="email" type="email" required>

BEFORE YOU FINISH, CHECK:
- Does every CSS class in the HTML have styles in the <style> tag? If not, add them.
- Does every button have a click handler or form submit? If not, add one.
- Does the hamburger menu work on mobile? If not, add the JavaScript.
- Are there media queries for mobile? If not, add them.
- Do all forms have the submission JavaScript above? If not, add it.
- Is there smooth scrolling? If not, add it.
- Are there hover effects on buttons and links? If not, add them.`;

const FIX_PROMPT = `You are ZapCodes AI. You fix bugs in websites. You are very careful. You only change what is broken. You do not change anything else.

CRITICAL RULES — READ CAREFULLY:

Rule 1: ONLY fix what the user describes as broken. Nothing else.
Rule 2: Do NOT change any colors unless the user said "fix the colors."
Rule 3: Do NOT change any text content unless the user said "fix the text."
Rule 4: Do NOT remove any sections unless the user said "remove this section."
Rule 5: Do NOT change the layout unless the user said "fix the layout."
Rule 6: Do NOT rename any CSS classes or JavaScript function names.
Rule 7: Do NOT delete any code that is working correctly.

Example: If the user says "the contact form is not working":
- You fix ONLY the contact form JavaScript.
- You do NOT touch the header, footer, hero section, navigation, or any other part.
- You return the COMPLETE file with the form fixed and everything else exactly the same.

ALSO FIX THESE AUTOMATICALLY (the user does not need to ask):
- If you see an <input> without a name attribute, add a name attribute.
- If you see a CSS class used in HTML but missing from <style>, add the CSS.
- If you see an unclosed HTML tag, close it.
- If you see a JavaScript variable used but never defined, fix it.
- If forms do not submit to https://api.zapcodes.net/api/forms/submit, add the submission code.

OUTPUT FORMAT:
\`\`\`filepath:index.html
(the COMPLETE fixed file — every line, not just the changed parts)
\`\`\`

The file must be self-contained. ALL CSS in <style>. ALL JS in <script>. No external files.`;

const EDIT_PROMPT = `You are ZapCodes AI. The user has an EXISTING website and wants to make changes to it. You will receive their current website code and their change request.

YOUR #1 RULE: DO NOT CHANGE ANYTHING THE USER DID NOT ASK YOU TO CHANGE.

This means:
- If the user says "add a booking form" — you add a booking form. You do NOT touch ANYTHING else.
- If the user says "change the hero text" — you change ONLY the hero text. Everything else identical.
- If the user says "make it dark theme" — you change ONLY colors. No sections removed, no text rewritten.

STEP BY STEP:
Step 1: READ the existing code. Count <section> elements. Remember this number.
Step 2: Identify EXACTLY what the user wants changed.
Step 3: Go through code line by line. Only modify lines related to the request. Copy everything else exactly.
Step 4: Verify same number of <section> elements (unless user asked to add/remove).

THINGS YOU MUST NEVER DO:
1. NEVER remove a <section> that exists in the original.
2. NEVER change colors the user did not mention.
3. NEVER rewrite text content.
4. NEVER remove working JavaScript functions.
5. NEVER change image URLs.
6. NEVER reorganize HTML structure.
7. NEVER change CSS class names or IDs.
8. NEVER change fonts.
9. NEVER remove hover effects or animations.

AUTOMATICALLY FIX (without user asking):
1. Broken <a href="#"> links — fix to match section IDs.
2. Missing CSS for HTML classes — add matching styles.
3. Unclosed HTML tags — close them.
4. Missing input name attributes — add them.
5. Forms without submission code — add it (submit to https://api.zapcodes.net/api/forms/submit).
6. Missing smooth scrolling — add html { scroll-behavior: smooth; }
7. Non-responsive sections — add media queries.
8. Missing alt attributes — add descriptive alt text.
9. Missing hover effects — add transition and hover state.

OUTPUT:
\`\`\`filepath:index.html
(the COMPLETE updated file — every single line)
\`\`\`

Self-contained. ALL CSS in <style>. ALL JS in <script>. No external files.`;

const CLONE_PROMPT = `Analyze the website and return JSON: {"title":"...","type":"...","sections":[...],"colors":{"primary":"#hex","secondary":"#hex","bg":"#hex","text":"#hex"},"fonts":"...","features":[...],"layout":"...","content":"..."}`;

// ══════════ SMART MODEL SELECTION ══════════
// Now blocks Groq for paid tiers on build/edit/fix operations
function getEffectiveModel(user, requestedModel, isBuildOperation = false) {
  // Admin: can use any model
  if (user.role === 'super-admin') {
    if (requestedModel) return normalizeModelKey(requestedModel);
    return 'gemini-3.1-pro';
  }

  const tier = user.subscription_tier || 'free';
  const config = user.getTierConfig();
  const chain = config.modelChain || ['groq'];
  const normalized = requestedModel ? normalizeModelKey(requestedModel) : null;

  // ══════════════════════════════════════════════════════════
  // GROQ RESTRICTION FOR BUILD OPERATIONS:
  // Paid tiers (Bronze+): Groq CANNOT build/edit/fix websites
  // Groq creates ugly, non-functional code — not acceptable for paying users
  // ══════════════════════════════════════════════════════════
  const isPaidTier = ['bronze', 'silver', 'gold', 'diamond'].includes(tier);
  const groqBlockedForBuild = isBuildOperation && isPaidTier;

  // If user explicitly requested Groq but it's blocked for this operation
  if (normalized === 'groq' && groqBlockedForBuild) {
    console.log(`[Model] Groq blocked for ${tier} build operation — auto-selecting better model`);
    // Fall through to auto-select below
  } else if (normalized && normalized !== 'auto') {
    // Check if requested model is available
    if (chain.includes(normalized)) {
      const limit = config.monthlyLimits?.[normalized];
      if (config.trialModels && config.trialModels.includes(normalized)) {
        if (!user.isTrialExhausted(normalized, limit)) return normalized;
      } else {
        const used = user.getModelUsageCount(normalized);
        if (limit === Infinity || used < limit) return normalized;
      }
    }
  }

  // Auto-select: walk the chain and pick first available model
  for (const model of chain) {
    // Skip Groq for paid tier build operations
    if (model === 'groq' && groqBlockedForBuild) continue;

    const limit = config.monthlyLimits?.[model];
    if (config.trialModels && config.trialModels.includes(model)) {
      if (!user.isTrialExhausted(model, limit)) return model;
    } else {
      const used = user.getModelUsageCount(model);
      if (limit === Infinity || used < limit) return model;
    }
  }

  // Everything exhausted (including Groq for free tier)
  // For free tier: if Gemini Flash trials are done, allow Groq for builds
  if (tier === 'free' && isBuildOperation) {
    const groqUsed = user.getModelUsageCount('groq');
    const groqLimit = config.monthlyLimits?.['groq'];
    if (groqLimit === Infinity || groqUsed < groqLimit) return 'groq';
  }

  return null;
}

function getModelDisplayName(model) {
  return MODEL_DISPLAY[model] || MODEL_DISPLAY[normalizeModelKey(model)] || model;
}

// ══════════ HELPERS ══════════
const activeSessions = new Map();

function safeSend(res, data) {
  try {
    if (!res.writableEnded && !res.destroyed) { res.write(`data: ${JSON.stringify(data)}\n\n`); return true; }
    return false;
  } catch (err) { console.error(`[SSE] Write failed: ${err.message}`); return false; }
}

function generatePreviewHTML(files) {
  const html = files.find(f => f.name === 'index.html') || files.find(f => f.name.endsWith('.html'));
  const css = files.find(f => f.name === 'style.css') || files.find(f => f.name.endsWith('.css'));
  const js = files.find(f => f.name === 'script.js') || files.find(f => f.name.endsWith('.js') && !f.name.includes('service-worker'));
  if (!html) return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Preview</title>${css ? '<style>' + css.content + '</style>' : ''}</head><body><h1>Preview</h1><p>No index.html generated.</p>${js ? '<script>' + js.content + '</script>' : ''}</body></html>`;
  let content = html.content;
  if (!content.includes('<!DOCTYPE')) content = `<!DOCTYPE html>\n${content}`;
  if (css && css.content.trim()) { const snip = css.content.trim().substring(0, 60); if (!content.includes(snip)) { content = content.replace(/<link[^>]*style\.css[^>]*\/?>/gi, ''); if (content.includes('</head>')) content = content.replace('</head>', `<style>\n${css.content}\n</style>\n</head>`); } }
  if (js && js.content.trim()) { const snip = js.content.trim().substring(0, 60); if (!content.includes(snip)) { content = content.replace(/<script[^>]*script\.js[^>]*><\/script>/gi, ''); if (content.includes('</body>')) content = content.replace('</body>', `<script>\n${js.content}\n</script>\n</body>`); } }
  if (!content.includes('viewport')) content = content.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  return content;
}

const BADGE_SCRIPT = `<div id="zc-badge" style="position:fixed;bottom:10px;right:10px;z-index:99999;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:6px 14px;border-radius:20px;font-family:-apple-system,sans-serif;font-size:12px;font-weight:600;box-shadow:0 2px 10px rgba(99,102,241,.3);cursor:pointer;text-decoration:none;display:flex;align-items:center;gap:4px" onclick="window.open('https://zapcodes.net?ref=badge','_blank')">⚡ Made with ZapCodes</div>`;

// ══════════ AI-POWERED PROGRESS MESSAGES ══════════
async function generateProgressMessages(prompt, template, projectName, modelLabel) {
  const name = projectName || 'your website';
  try {
    const result = await callAI(
      `You are ZapCodes AI assistant giving live build updates. Write exactly 25 short progress messages (one per line). Sound like a friendly developer talking to the user. Be specific to their project. Use emojis naturally. Progress from planning → structure → design → features → polish. Keep under 120 chars each. No numbering. Reference "${modelLabel}".`,
      `Building: "${name}" — Description: "${(prompt || '').slice(0, 500)}" — Template: ${template || 'custom'}`,
      'groq', 1500
    );
    if (result) { const lines = result.split('\n').map(l => l.trim()).filter(l => l.length > 10 && l.length < 200); if (lines.length >= 8) return lines; }
  } catch (err) { console.log(`[ProgressMsgs] Fallback: ${err.message}`); }
  return [
    `Alright, let me take a look at what you want for ${name}... 🧠`,
    `Got it! Let me start building this out.`,
    `Setting up the overall page structure and layout.`,
    `Working on the design system — colors, fonts, spacing.`,
    `${modelLabel} is writing all the HTML structure from scratch.`,
    `Header and navigation are taking shape. Added smooth scrolling.`,
    `Making this fully responsive — phones, tablets, and desktop.`,
    `Adding the main content sections now.`,
    `Writing the CSS — gradients, shadows, hover effects.`,
    `Interactive parts next — JavaScript for animations and validation.`,
    `Almost there! Polishing the micro-interactions.`,
    `Running through a final check — styles and buttons.`,
    `Looking good! Wrapping everything into a clean package.`,
    `Just about done — one last pass. Hang tight!`,
  ];
}

// ══════════ GET /api/build/costs ══════════
router.get('/costs', (req, res) => res.json({ costs: BL_COSTS }));

// ══════════ GET /api/build/system-prompts ══════════
router.get('/system-prompts', auth, (req, res) => {
  res.json({ gen_prompt: GEN_PROMPT, edit_prompt: EDIT_PROMPT, fix_prompt: FIX_PROMPT });
});

// ══════════ GET /api/build/available-models ══════════
router.get('/available-models', auth, (req, res) => {
  const tier = req.user.subscription_tier;
  const config = req.user.getTierConfig();
  const chain = config.modelChain || ['groq'];
  const isAdmin = req.user.role === 'super-admin';
  const isPaidTier = ['bronze', 'silver', 'gold', 'diamond'].includes(tier);

  const models = chain.map(m => {
    const limit = config.monthlyLimits?.[m];
    const isTrial = config.trialModels && config.trialModels.includes(m);
    let used = isTrial ? ((req.user.trials_used && req.user.trials_used[m]) || 0) : req.user.getModelUsageCount(m);

    // Mark Groq as unavailable for builds on paid tiers
    const groqBlockedForBuild = (m === 'groq' && isPaidTier);

    return {
      id: m, name: getModelDisplayName(m),
      cost: BL_COSTS.generation[m] || 5000,
      monthlyLimit: limit === Infinity ? 'Unlimited' : limit,
      monthlyUsed: used,
      available: groqBlockedForBuild ? false : (isTrial ? !req.user.isTrialExhausted(m, limit) : (limit === Infinity || used < limit)),
      primary: chain.indexOf(m) === 0,
      type: isTrial ? 'one_time_trial' : 'monthly',
      blockedReason: groqBlockedForBuild ? 'Groq is not available for website building on paid plans. Use a higher-quality AI model.' : undefined,
    };
  });

  if (isAdmin) {
    const allModels = ['sonnet-4.6', 'gemini-3.1-pro', 'gemini-2.5-flash', 'haiku-4.5', 'groq'];
    for (const m of allModels) {
      if (!chain.includes(m)) {
        models.push({ id: m, name: getModelDisplayName(m) + ' (Admin)', cost: BL_COSTS.generation[m] || 5000, monthlyLimit: 'Unlimited', monthlyUsed: 0, available: true, primary: false, type: 'unlimited' });
      }
    }
  }

  const allModelsList = ['sonnet-4.6', 'gemini-3.1-pro', 'gemini-2.5-flash', 'haiku-4.5', 'groq'];
  const allModelsInfo = allModelsList.map(m => ({
    id: m, name: getModelDisplayName(m), cost: BL_COSTS.generation[m] || 5000,
    available: chain.includes(m) || isAdmin,
    tier_required: !chain.includes(m),
    blockedForBuild: m === 'groq' && isPaidTier,
  }));

  res.json({ models, allModels: allModelsInfo, plan: tier, subscription_tier: tier, monthlyUsage: req.user.getMonthlyUsage(), bl_coins: req.user.bl_coins || 0 });
});

// ══════════ POST /api/build/generate-with-progress (SSE) ══════════
router.post('/generate-with-progress', auth, async (req, res) => {
  const sessionId = `gen-${req.user._id}-${Date.now()}`;
  let keepaliveInterval = null;
  let progressTicker = null;
  let connectionAlive = true;

  try {
    const user = req.user;
    const { prompt, template, projectName, description, colorScheme, features, model: requestedModel, existingFiles, customSystemPrompt } = req.body;

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', 'Access-Control-Allow-Origin': '*' });

    const sendProgress = (step, message, extra = {}) => { if (connectionAlive) safeSend(res, { type: 'progress', step, message, ...extra }); };

    let aborted = false;
    activeSessions.set(sessionId, { abort: () => { aborted = true; } });
    res.on('close', () => { aborted = true; connectionAlive = false; if (keepaliveInterval) clearInterval(keepaliveInterval); activeSessions.delete(sessionId); });

    sendProgress('validating', 'Validating your request and checking limits...');

    // ═══════════════════════════════════════════════════════
    // isBuildOperation = true → Groq blocked for paid tiers
    // ═══════════════════════════════════════════════════════
    const model = getEffectiveModel(user, requestedModel, true);
    if (!model) {
      sendProgress('error', 'All AI model limits reached for this month. Upgrade your plan for more generations.');
      safeSend(res, { type: 'error', error: 'Monthly generation limits reached', upgrade: true });
      return res.end();
    }

    const config = user.getTierConfig();
    const inputText = prompt || description || '';
    if (config.maxChars !== Infinity && inputText.length > config.maxChars) {
      sendProgress('error', `Message too long. Your plan allows ${config.maxChars} characters.`);
      safeSend(res, { type: 'error', error: 'Message too long' });
      return res.end();
    }

    const cost = BL_COSTS.generation[model] || 5000;
    if (user.role !== 'super-admin' && user.bl_coins < cost) {
      sendProgress('error', `Insufficient BL coins. Need ${cost.toLocaleString()}, have ${user.bl_coins.toLocaleString()}.`);
      safeSend(res, { type: 'error', error: 'Insufficient BL coins', required: cost, balance: user.bl_coins });
      return res.end();
    }

    user.spendCoins(cost, 'generation', `Website generation (${getModelDisplayName(model)})`, model);
    user.incrementMonthlyUsage(model, 'generation');
    if (config.trialModels && config.trialModels.includes(model)) user.incrementTrial(model);
    await user.save();

    sendProgress('analyzing', 'Analyzing your prompt...', { model, cost, sessionId });

    if (aborted) {
      user.creditCoins(cost, 'generation', 'Refund: stopped by user');
      user.decrementMonthlyUsage(model, 'generation');
      await user.save();
      safeSend(res, { type: 'stopped' });
      return res.end();
    }

    const modelLabel = getModelDisplayName(model);
    const speed = model.includes('gemini') ? '~30-60s' : model.includes('haiku') ? '~1-2 min' : model.includes('sonnet') ? '~1-2 min' : '~15-30s';
    sendProgress('connecting', `Connecting to ${modelLabel}... (${speed})`);

    keepaliveInterval = setInterval(() => {
      if (!connectionAlive) { clearInterval(keepaliveInterval); return; }
      try { if (!res.writableEnded) res.write(`: keepalive\n\n`); else { clearInterval(keepaliveInterval); connectionAlive = false; } }
      catch { clearInterval(keepaliveInterval); connectionAlive = false; }
    }, 10000);

    sendProgress('building', `Hey! Let me take a look at what you want to build... 🧠`);
    const progressMsgs = await generateProgressMessages(prompt || description || '', template, projectName, modelLabel);
    let progressIdx = 0;
    progressTicker = setInterval(() => {
      if (!connectionAlive || aborted || progressIdx >= progressMsgs.length) { clearInterval(progressTicker); return; }
      sendProgress('building', progressMsgs[progressIdx]);
      progressIdx++;
    }, 8000);

    const aiOpts = { onProgress: (msg) => { if (!aborted && connectionAlive) sendProgress('generating', msg); } };

    let files;
    let usedModel = model;
    let systemPrompt = GEN_PROMPT;
    let userPrompt = '';

    if (template && template !== 'custom') {
      if (customSystemPrompt && customSystemPrompt.trim().length > 50) systemPrompt = customSystemPrompt;
      sendProgress('generating_html', `Building ${template} project: "${projectName || 'My Project'}"...`);
      files = await generateProjectMultiStep(template, projectName || 'My Project', description || prompt, colorScheme, features, model, aiOpts);
    } else {
      if (existingFiles && existingFiles.length > 0) {
        // ── EDITING EXISTING WEBSITE ──
        sendProgress('generating_html', `Carefully modifying your existing website using ${modelLabel}...`);
        systemPrompt = EDIT_PROMPT;
        const existingCode = existingFiles.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
        const existingCodeSize = existingCode.length;

        // Auto-upgrade Groq for edits (shouldn't happen for paid tiers anymore, but safety net)
        if (model === 'groq' && existingCodeSize > 5000) {
          const upgradeChain = ['gemini-2.5-flash', 'haiku-4.5', 'gemini-3.1-pro'];
          for (const upgradeModel of upgradeChain) {
            const upgradeCost = BL_COSTS.generation[upgradeModel] || 10000;
            if (user.role === 'super-admin' || user.bl_coins >= upgradeCost) {
              sendProgress('generating', `Your website is ${Math.round(existingCodeSize / 1000)}K chars — too large for Groq. Auto-upgrading to ${getModelDisplayName(upgradeModel)}...`);
              userPrompt = `<existing_website>\n${existingCode}\n</existing_website>\n\n<user_request>\n${prompt}\n</user_request>\n\nProject name: ${projectName || 'My Website'}\n${colorScheme && colorScheme !== 'keep existing' ? `Color scheme change requested: ${colorScheme}` : 'Color scheme: DO NOT CHANGE'}\n${features ? `Additional features: ${features.join(', ')}` : ''}\n\nReturn the COMPLETE updated file.`;
              const result = await callAI(systemPrompt, userPrompt, upgradeModel, undefined, aiOpts);
              files = result ? parseFilesFromResponse(result) : [];
              if (files && files.length > 0) {
                usedModel = upgradeModel;
                const diff = upgradeCost - cost;
                if (diff > 0) { user.spendCoins(diff, 'generation', `Edit upgrade: ${getModelDisplayName(model)} → ${getModelDisplayName(upgradeModel)}`); await user.save(); }
                break;
              }
            }
          }
          if (!files || files.length === 0) {
            sendProgress('generating', `No larger model available — trying with Groq...`);
            userPrompt = `<existing_website>\n${existingCode}\n</existing_website>\n\n<user_request>\n${prompt}\n</user_request>\n\nProject name: ${projectName || 'My Website'}\n${colorScheme && colorScheme !== 'keep existing' ? `Color scheme change: ${colorScheme}` : 'Color scheme: DO NOT CHANGE'}\n${features ? `Features: ${features.join(', ')}` : ''}\n\nReturn the COMPLETE updated file.`;
            const result = await callAI(systemPrompt, userPrompt, model, undefined, aiOpts);
            files = result ? parseFilesFromResponse(result) : [];
          }
        } else {
          userPrompt = `<existing_website>\n${existingCode}\n</existing_website>\n\n<user_request>\n${prompt}\n</user_request>\n\nProject name: ${projectName || 'My Website'}\n${colorScheme && colorScheme !== 'keep existing' ? `Color scheme change: ${colorScheme}` : 'Color scheme: DO NOT CHANGE'}\n${features ? `Features: ${features.join(', ')}` : ''}\n\nReturn the COMPLETE updated file.`;
          const result = await callAI(systemPrompt, userPrompt, model, undefined, aiOpts);
          files = result ? parseFilesFromResponse(result) : [];
        }
      } else {
        // ── CREATING NEW WEBSITE ──
        sendProgress('generating_html', `Generating website using ${modelLabel}...`);
        systemPrompt = (customSystemPrompt && customSystemPrompt.trim().length > 50) ? customSystemPrompt : GEN_PROMPT;
        userPrompt = `Create a complete, production-ready website: ${prompt}\n\nProject name: ${projectName || 'My Website'}\nColor scheme: ${colorScheme || 'modern dark theme'}\n${features ? `Features: ${features.join(', ')}` : ''}\n\nIMPORTANT: index.html must be self-contained with ALL CSS in <style> and ALL JS in <script>.`;
        const result = await callAI(systemPrompt, userPrompt, model, undefined, aiOpts);
        files = result ? parseFilesFromResponse(result) : [];
      }
    }

    if (aborted || !connectionAlive) {
      if (keepaliveInterval) clearInterval(keepaliveInterval);
      clearInterval(progressTicker);
      user.creditCoins(cost, 'generation', 'Refund: stopped by user');
      user.decrementMonthlyUsage(model, 'generation');
      await user.save();
      if (connectionAlive) { safeSend(res, { type: 'stopped' }); res.end(); }
      return;
    }

    if (!files || files.length === 0) {
      // ═══════════════════════════════════════════════════════
      // FALLBACK — Use tier-appropriate chain (Groq excluded for paid)
      // ═══════════════════════════════════════════════════════
      const fallbackChain = getBuildFallbackChain(user);
      const currentIdx = fallbackChain.indexOf(normalizeModelKey(model));
      let fallbackFiles = null;
      let fallbackModel = null;

      for (let fi = currentIdx + 1; fi < fallbackChain.length; fi++) {
        if (aborted || !connectionAlive) break;
        const nextModel = fallbackChain[fi];
        const nextLabel = getModelDisplayName(nextModel);
        const nextCost = BL_COSTS.generation[nextModel] || 5000;
        if (user.role !== 'super-admin' && user.bl_coins < nextCost) continue;

        sendProgress('generating', `${modelLabel} couldn't process. Trying ${nextLabel}...`);
        console.log(`[Build Fallback] ${model} → ${nextModel}`);

        try {
          const fbResult = await callAI(systemPrompt, userPrompt, nextModel, undefined, aiOpts);
          fallbackFiles = fbResult ? parseFilesFromResponse(fbResult) : [];
          if (fallbackFiles && fallbackFiles.length > 0) {
            fallbackModel = nextModel;
            user.creditCoins(cost, 'generation', `Refund: ${modelLabel} failed, used ${nextLabel}`);
            user.spendCoins(nextCost, 'generation', `Website generation fallback (${nextLabel})`, nextModel);
            await user.save();
            files = fallbackFiles;
            usedModel = nextModel;
            sendProgress('generating', `${nextLabel} generated ${files.length} file(s) successfully!`);
            break;
          }
        } catch (fbErr) { console.error(`[Build Fallback] ${nextModel} failed: ${fbErr.message}`); continue; }
      }

      if (!files || files.length === 0) {
        if (keepaliveInterval) clearInterval(keepaliveInterval);
        clearInterval(progressTicker);
        user.creditCoins(cost, 'generation', `Refund: generation failed (${model})`);
        user.decrementMonthlyUsage(model, 'generation');
        await user.save();
        sendProgress('error', `All AI models couldn't generate code. Coins refunded. Try a simpler prompt.`);
        safeSend(res, { type: 'error', error: 'Generation failed. Coins refunded.', suggestion: 'Try a simpler prompt.' });
        return res.end();
      }
    }

    sendProgress('preview', 'Building live preview...');
    const preview = generatePreviewHTML(files);
    const actualModel = usedModel;
    const actualLabel = getModelDisplayName(actualModel);
    const actualCost = BL_COSTS.generation[actualModel] || cost;

    sendProgress('done', `Done! ${files.length} file(s) generated using ${actualLabel}.`);
    safeSend(res, { type: 'complete', files, preview, model: actualModel, blSpent: actualCost, balanceRemaining: user.bl_coins, monthlyUsage: user.getMonthlyUsage(), fileCount: files.length });

    if (keepaliveInterval) clearInterval(keepaliveInterval);
    clearInterval(progressTicker);
    res.end();
    activeSessions.delete(sessionId);
  } catch (err) {
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    if (progressTicker) clearInterval(progressTicker);
    console.error('[Build] Error:', err.message);
    if (connectionAlive) {
      try {
        if (err.message === 'Generation cancelled') safeSend(res, { type: 'stopped' });
        else safeSend(res, { type: 'error', error: err.message || 'Generation failed' });
        res.end();
      } catch {}
    }
    activeSessions.delete(sessionId);
  }
});

// ══════════ POST /api/build/stop ══════════
router.post('/stop', auth, (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && activeSessions.has(sessionId)) { activeSessions.get(sessionId).abort(); activeSessions.delete(sessionId); return res.json({ stopped: true }); }
  for (const [id, s] of activeSessions) { if (id.includes(req.user._id.toString())) { s.abort(); activeSessions.delete(id); return res.json({ stopped: true }); } }
  res.json({ stopped: false });
});

// ══════════ POST /api/build/generate (non-SSE compatibility) ══════════
router.post('/generate', auth, async (req, res) => {
  try {
    const user = req.user;
    const { prompt, template, projectName, description, colorScheme, features, model: requestedModel } = req.body;
    const model = getEffectiveModel(user, requestedModel, true); // isBuildOperation = true
    if (!model) return res.status(403).json({ error: 'Monthly generation limits reached', upgrade: true });
    const config = user.getTierConfig();
    const inputText = prompt || description || '';
    if (config.maxChars !== Infinity && inputText.length > config.maxChars) return res.status(400).json({ error: 'Message too long' });
    const cost = BL_COSTS.generation[model] || 5000;
    if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient BL coins', required: cost, balance: user.bl_coins });
    user.spendCoins(cost, 'generation', `Website generation (${getModelDisplayName(model)})`, model);
    user.incrementMonthlyUsage(model, 'generation');
    if (config.trialModels && config.trialModels.includes(model)) user.incrementTrial(model);
    await user.save();
    let files;
    if (template && template !== 'custom') { files = await generateProjectMultiStep(template, projectName || 'My Project', description || prompt, colorScheme, features, model); }
    else {
      const userPrompt = `Create a complete website: ${prompt}\n\nProject: ${projectName || 'My Website'}\nColors: ${colorScheme || 'modern dark theme'}\n${features ? `Features: ${features.join(', ')}` : ''}\n\nSelf-contained index.html.`;
      const result = await callAI(GEN_PROMPT, userPrompt, model);
      files = result ? parseFilesFromResponse(result) : [];
    }
    if (!files || !files.length) { user.creditCoins(cost, 'generation', 'Refund: failed'); user.decrementMonthlyUsage(model, 'generation'); await user.save(); return res.status(500).json({ error: 'Generation failed. Coins refunded.' }); }
    const preview = generatePreviewHTML(files);
    res.json({ files, preview, model, blSpent: cost, balanceRemaining: user.bl_coins, monthlyUsage: user.getMonthlyUsage(), fileCount: files.length });
  } catch (err) { console.error('[Build] Error:', err.message); res.status(500).json({ error: err.message || 'Failed' }); }
});

// ══════════ Save/Load Projects ══════════
router.post('/save-project', auth, async (req, res) => {
  try {
    const user = req.user;
    const { projectId, name, files, preview, template, description, subdomain } = req.body;
    if (!files || !files.length) return res.status(400).json({ error: 'No files to save' });
    if (projectId) {
      const idx = (user.saved_projects || []).findIndex(p => p.projectId === projectId);
      if (idx >= 0) { user.saved_projects[idx].name = name || user.saved_projects[idx].name; user.saved_projects[idx].files = files; user.saved_projects[idx].preview = (preview || '').slice(0, 500000); user.saved_projects[idx].updatedAt = new Date(); user.saved_projects[idx].version = (user.saved_projects[idx].version || 1) + 1; user.saved_projects[idx].description = description || user.saved_projects[idx].description; if (subdomain && !user.saved_projects[idx].linkedSubdomain) user.saved_projects[idx].linkedSubdomain = subdomain; }
      else return res.status(404).json({ error: 'Project not found' });
    } else {
      if (!user.saved_projects) user.saved_projects = [];
      user.saved_projects.push({ projectId: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: name || 'Untitled Project', files, preview: (preview || '').slice(0, 500000), template: template || 'custom', description: description || '', linkedSubdomain: subdomain || null, version: 1, createdAt: new Date(), updatedAt: new Date() });
    }
    await user.save();
    const proj = projectId ? user.saved_projects.find(p => p.projectId === projectId) : user.saved_projects[user.saved_projects.length - 1];
    res.json({ project: { projectId: proj.projectId, name: proj.name, version: proj.version, fileCount: proj.files.length, linkedSubdomain: proj.linkedSubdomain, updatedAt: proj.updatedAt }, message: 'Project saved!' });
  } catch (err) { res.status(500).json({ error: 'Failed to save' }); }
});

router.get('/projects', auth, (req, res) => {
  const projects = (req.user.saved_projects || []).map(p => ({ projectId: p.projectId, name: p.name, template: p.template, description: p.description, fileCount: (p.files || []).length, version: p.version || 1, linkedSubdomain: p.linkedSubdomain || null, createdAt: p.createdAt, updatedAt: p.updatedAt }));
  res.json({ projects: projects.reverse() });
});

router.get('/project/:projectId', auth, (req, res) => {
  const proj = (req.user.saved_projects || []).find(p => p.projectId === req.params.projectId);
  if (!proj) return res.status(404).json({ error: 'Not found' });
  res.json({ project: proj });
});

router.delete('/project/:projectId', auth, async (req, res) => {
  try {
    const user = req.user;
    const idx = (user.saved_projects || []).findIndex(p => p.projectId === req.params.projectId);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const project = user.saved_projects[idx];
    let shutdownSite = null;
    if (project.linkedSubdomain) { const siteIdx = user.deployed_sites.findIndex(s => s.subdomain === project.linkedSubdomain); if (siteIdx >= 0) { shutdownSite = project.linkedSubdomain; user.deployed_sites.splice(siteIdx, 1); } }
    user.saved_projects.splice(idx, 1);
    await user.save();
    res.json({ success: true, shutdownSite });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ══════════ Deploy ══════════
router.post('/deploy', auth, async (req, res) => {
  try {
    const user = req.user; const { subdomain, files, title } = req.body; const config = user.getTierConfig();
    const sub = (subdomain || '').toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(sub)) return res.status(400).json({ error: 'Invalid subdomain' });
    if (RESERVED.includes(sub)) return res.status(400).json({ error: 'Reserved' });
    const existingSite = user.deployed_sites.find(s => s.subdomain === sub);
    if (!existingSite && user.deployed_sites.length >= config.maxSites) return res.status(403).json({ error: `Site limit (${config.maxSites})`, upgrade: true });
    if (!existingSite) { const taken = await User.findOne({ 'deployed_sites.subdomain': sub, _id: { $ne: user._id } }); if (taken) return res.status(409).json({ error: 'Subdomain taken' }); }
    let deployFiles = files;
    const shouldBadge = !config.canRemoveBadge;
    if (shouldBadge && deployFiles) deployFiles = deployFiles.map(f => f.name.endsWith('.html') ? { ...f, content: f.content.replace('</body>', `${BADGE_SCRIPT}</body>`) } : f);
    if (existingSite) { existingSite.title = title || existingSite.title; existingSite.files = deployFiles; existingSite.lastUpdated = new Date(); existingSite.hasBadge = shouldBadge; existingSite.fileSize = JSON.stringify(files).length; }
    else user.deployed_sites.push({ subdomain: sub, title: title || sub, files: deployFiles, hasBadge: shouldBadge, fileSize: JSON.stringify(files).length });
    if (!user.saved_projects) user.saved_projects = [];
    const linkedProject = user.saved_projects.find(p => p.linkedSubdomain === sub);
    if (linkedProject) { linkedProject.name = title || sub; linkedProject.files = files; linkedProject.updatedAt = new Date(); linkedProject.version = (linkedProject.version || 1) + 1; linkedProject.description = `Deployed: ${sub}.zapcodes.net`; }
    else { user.saved_projects.push({ projectId: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: title || sub, files, preview: '', template: 'custom', description: `Deployed: ${sub}.zapcodes.net`, linkedSubdomain: sub, version: 1, createdAt: new Date(), updatedAt: new Date() }); }
    await user.save();
    const savedProj = user.saved_projects.find(p => p.linkedSubdomain === sub);
    res.json({ url: `https://${sub}.zapcodes.net`, subdomain: sub, deployed: true, hasBadge: shouldBadge, sites: user.deployed_sites.length, maxSites: config.maxSites, linkedProjectId: savedProj?.projectId });
  } catch (err) { res.status(500).json({ error: 'Deploy failed' }); }
});

router.post('/redeploy-from-project', auth, async (req, res) => {
  try {
    const user = req.user; const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'Missing projectId' });
    const project = (user.saved_projects || []).find(p => p.projectId === projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.linkedSubdomain) return res.status(400).json({ error: 'Project not linked to a site.' });
    const sub = project.linkedSubdomain;
    const site = user.deployed_sites.find(s => s.subdomain === sub);
    if (!site) return res.status(404).json({ error: `${sub}.zapcodes.net not found.` });
    const config = user.getTierConfig(); const shouldBadge = !config.canRemoveBadge;
    let deployFiles = project.files || [];
    if (shouldBadge) deployFiles = deployFiles.map(f => f.name.endsWith('.html') ? { ...f, content: f.content.replace('</body>', `${BADGE_SCRIPT}</body>`) } : f);
    site.files = deployFiles; site.title = project.name || site.title; site.lastUpdated = new Date(); site.hasBadge = shouldBadge; site.fileSize = JSON.stringify(project.files).length;
    project.updatedAt = new Date(); project.version = (project.version || 1) + 1;
    await user.save();
    res.json({ success: true, url: `https://${sub}.zapcodes.net`, subdomain: sub, version: project.version });
  } catch (err) { res.status(500).json({ error: 'Re-deploy failed' }); }
});

// ══════════ Code Fix — Groq blocked for paid tiers ══════════
router.post('/code-fix', auth, async (req, res) => {
  try {
    const user = req.user; const { files, description, model: requestedModel } = req.body;
    const config = user.getTierConfig(); const mu = user.getMonthlyUsage();
    if (config.monthlyFixCap !== Infinity) {
      if (config.monthlyFixType === 'one_time_trial') { const trialUsed = (user.trials_used && user.trials_used['fixes']) || 0; if (trialUsed >= config.monthlyFixCap) return res.status(403).json({ error: 'Trial fix used. Upgrade for more.', upgrade: true }); }
      else if ((mu.code_fixes || 0) >= config.monthlyFixCap) return res.status(403).json({ error: 'Monthly fix limit reached', upgrade: true });
    }

    // isBuildOperation = true → Groq blocked for paid tiers
    const model = getEffectiveModel(user, requestedModel, true) || 'gemini-2.5-flash';
    const cost = BL_COSTS.codeFix[model] || 5000;
    if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient BL coins' });

    user.spendCoins(cost, 'code_fix', `Code fix (${getModelDisplayName(model)})`, model);
    user.incrementMonthlyUsage(model, 'code_fix');
    if (config.monthlyFixType === 'one_time_trial') user.incrementTrial('fixes');
    await user.save();

    const fileContent = (files || []).map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
    const fileSize = fileContent.length;

    // Auto-upgrade Groq for large files (safety net — shouldn't trigger for paid tiers)
    let actualModel = model;
    if (model === 'groq' && fileSize > 5000) {
      const upgradeChain = ['gemini-2.5-flash', 'haiku-4.5', 'gemini-3.1-pro'];
      for (const upgradeModel of upgradeChain) {
        const upgradeCost = BL_COSTS.codeFix[upgradeModel] || 10000;
        if (user.role === 'super-admin' || user.bl_coins >= upgradeCost) {
          actualModel = upgradeModel;
          const diff = upgradeCost - cost;
          if (diff > 0) { user.spendCoins(diff, 'code_fix', `Fix upgrade: Groq → ${getModelDisplayName(upgradeModel)}`); await user.save(); }
          break;
        }
      }
    }

    const result = await callAI(FIX_PROMPT, `Fix:\n\n${fileContent}\n\nIssue: ${description || 'Fix all bugs'}`, actualModel);
    const fixedFiles = result ? parseFilesFromResponse(result) : [];
    if (!fixedFiles.length) { user.creditCoins(cost, 'code_fix', 'Refund: fix failed'); user.decrementMonthlyUsage(model, 'code_fix'); await user.save(); return res.status(500).json({ error: 'Fix failed. Coins refunded.' }); }
    const preview = generatePreviewHTML(fixedFiles);
    res.json({ files: fixedFiles, preview, model, blSpent: cost, balanceRemaining: user.bl_coins });
  } catch (err) { res.status(500).json({ error: 'Fix failed' }); }
});

// ══════════ GitHub Push ══════════
router.post('/github-push', auth, async (req, res) => {
  try {
    const user = req.user; const config = user.getTierConfig(); const mu = user.getMonthlyUsage();
    if (config.monthlyPushCap !== Infinity) {
      if (config.monthlyPushType === 'one_time_trial') { const trialUsed = (user.trials_used && user.trials_used['github_pushes']) || 0; if (trialUsed >= config.monthlyPushCap) return res.status(403).json({ error: 'Trial push used. Upgrade.' }); }
      else if ((mu.github_pushes || 0) >= config.monthlyPushCap) return res.status(403).json({ error: 'Monthly push limit reached' });
    }
    if (user.role !== 'super-admin' && user.bl_coins < BL_COSTS.githubPush) return res.status(402).json({ error: 'Insufficient BL coins' });
    const { files, repoName, message } = req.body;
    const token = user.githubToken;
    if (!token) return res.status(400).json({ error: 'Connect GitHub in Settings' });
    user.spendCoins(BL_COSTS.githubPush, 'github_push', 'GitHub push');
    user.incrementMonthlyUsage(null, 'push');
    if (config.monthlyPushType === 'one_time_trial') user.incrementTrial('github_pushes');
    await user.save();
    const ghUser = await axios.get('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}` } });
    const owner = ghUser.data.login;
    let repo;
    try { repo = (await axios.get(`https://api.github.com/repos/${owner}/${repoName}`, { headers: { Authorization: `Bearer ${token}` } })).data; }
    catch { repo = (await axios.post('https://api.github.com/user/repos', { name: repoName, private: false, auto_init: true, description: 'Built with ZapCodes AI' }, { headers: { Authorization: `Bearer ${token}` } })).data; }
    for (const file of (files || [])) { const content = Buffer.from(file.content).toString('base64'); const path = file.name.startsWith('/') ? file.name.slice(1) : file.name; let sha; try { sha = (await axios.get(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, { headers: { Authorization: `Bearer ${token}` } })).data.sha; } catch {} await axios.put(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, { message: message || 'Deploy via ZapCodes', content, sha }, { headers: { Authorization: `Bearer ${token}` } }); }
    res.json({ success: true, repoUrl: repo.html_url, blSpent: BL_COSTS.githubPush, balanceRemaining: user.bl_coins });
  } catch (err) { res.status(500).json({ error: 'GitHub push failed' }); }
});

// ══════════ PWA, Badge, Clone, Sites ══════════
router.post('/pwa', auth, async (req, res) => {
  try {
    const user = req.user; const config = user.getTierConfig();
    if (!config.canPWA) return res.status(403).json({ error: 'PWA requires Gold or Diamond', upgrade: true });
    if (user.role !== 'super-admin' && user.bl_coins < BL_COSTS.pwaBuild) return res.status(402).json({ error: 'Insufficient BL coins' });
    const { subdomain, appName, themeColor } = req.body;
    const site = user.deployed_sites.find(s => s.subdomain === subdomain);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    user.spendCoins(BL_COSTS.pwaBuild, 'pwa_build', `PWA for ${subdomain}`); site.isPWA = true; await user.save();
    res.json({ manifest: { name: appName || site.title, short_name: (appName || subdomain).slice(0, 12), start_url: '/', display: 'standalone', background_color: '#000', theme_color: themeColor || '#6366f1', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, serviceWorker: `const C='zc-${subdomain}-v1';self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(['/']))));self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));`, blSpent: BL_COSTS.pwaBuild, balanceRemaining: user.bl_coins });
  } catch { res.status(500).json({ error: 'PWA failed' }); }
});

router.post('/remove-badge', auth, async (req, res) => {
  try {
    const user = req.user; const config = user.getTierConfig();
    if (!config.canRemoveBadge) return res.status(403).json({ error: 'Badge removal requires Silver+', upgrade: true });
    if (user.role !== 'super-admin' && user.bl_coins < BL_COSTS.badgeRemoval) return res.status(402).json({ error: 'Insufficient BL coins' });
    const site = user.deployed_sites.find(s => s.subdomain === req.body.subdomain);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    if (!site.hasBadge) return res.json({ message: 'Already removed' });
    user.spendCoins(BL_COSTS.badgeRemoval, 'badge_removal', `Badge removal ${req.body.subdomain}`); site.hasBadge = false; await user.save();
    res.json({ success: true, blSpent: BL_COSTS.badgeRemoval, balanceRemaining: user.bl_coins });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

router.post('/clone-analyze', auth, async (req, res) => {
  try {
    let content = req.body.code || '';
    if (req.body.url) { try { content = (await axios.get(req.body.url, { timeout: 15000, headers: { 'User-Agent': 'ZapCodes-Analyzer/1.0' } })).data; } catch (e) { return res.status(400).json({ error: `Could not fetch: ${e.message}` }); } }
    if (!content) return res.status(400).json({ error: 'Provide URL or code' });
    const analysis = await callAI(CLONE_PROMPT, content.slice(0, 30000), 'groq');
    let parsed; try { parsed = JSON.parse(analysis); } catch { parsed = { title: 'Website', type: 'other', sections: [], colors: {}, layout: analysis }; }
    res.json({ analysis: parsed });
  } catch { res.status(500).json({ error: 'Analysis failed' }); }
});

router.post('/clone-rebuild', auth, async (req, res) => {
  try {
    const user = req.user;
    const model = getEffectiveModel(user, req.body.model, true) || 'gemini-2.5-flash'; // isBuildOperation = true
    const cost = BL_COSTS.generation[model] || 5000;
    if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient BL coins' });
    user.spendCoins(cost, 'generation', `Clone rebuild (${getModelDisplayName(model)})`, model);
    user.incrementMonthlyUsage(model, 'generation');
    const config = user.getTierConfig();
    if (config.trialModels && config.trialModels.includes(model)) user.incrementTrial(model);
    await user.save();
    const prompt = `Rebuild this website:\n${JSON.stringify(req.body.analysis)}\n\nModifications: ${req.body.modifications || 'Keep faithful to original'}`;
    const result = await callAI(GEN_PROMPT, prompt, model);
    let files = result ? parseFilesFromResponse(result) : [];
    if (!files.length) { user.creditCoins(cost, 'generation', 'Refund: failed'); user.decrementMonthlyUsage(model, 'generation'); await user.save(); return res.status(500).json({ error: 'Failed. Coins refunded.' }); }
    res.json({ files, preview: generatePreviewHTML(files), model, blSpent: cost, balanceRemaining: user.bl_coins, fileCount: files.length });
  } catch { res.status(500).json({ error: 'Clone rebuild failed' }); }
});

router.get('/sites', auth, (req, res) => {
  const sites = (req.user.deployed_sites || []).map(s => {
    const linkedProject = (req.user.saved_projects || []).find(p => p.linkedSubdomain === s.subdomain);
    return { ...s.toObject ? s.toObject() : s, linkedProjectId: linkedProject?.projectId || null };
  });
  res.json({ sites });
});

router.post('/site/shutdown', auth, async (req, res) => {
  try {
    const user = req.user; const sub = (req.body.subdomain || '').toLowerCase().trim();
    const idx = user.deployed_sites.findIndex(s => s.subdomain === sub);
    if (idx === -1) return res.status(404).json({ error: 'Site not found' });
    user.deployed_sites.splice(idx, 1); await user.save();
    res.json({ success: true, message: `${sub}.zapcodes.net is now offline. Project still saved.` });
  } catch { res.status(500).json({ error: 'Shutdown failed' }); }
});

router.delete('/site/:subdomain', auth, async (req, res) => {
  try {
    const user = req.user; const sub = req.params.subdomain;
    const siteIdx = user.deployed_sites.findIndex(s => s.subdomain === sub);
    if (siteIdx >= 0) user.deployed_sites.splice(siteIdx, 1);
    const projIdx = (user.saved_projects || []).findIndex(p => p.linkedSubdomain === sub);
    if (projIdx >= 0) user.saved_projects.splice(projIdx, 1);
    await user.save(); res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

router.get('/templates', (req, res) => res.json({ templates: [
  { id: 'custom', name: 'Custom (AI Chat)', icon: '💬', desc: 'Describe anything' },
  { id: 'portfolio', name: 'Portfolio', icon: '👤', desc: 'Personal portfolio' },
  { id: 'landing', name: 'Landing Page', icon: '🚀', desc: 'Product landing' },
  { id: 'blog', name: 'Blog', icon: '📝', desc: 'Blog template' },
  { id: 'ecommerce', name: 'E-Commerce', icon: '🛒', desc: 'Online store' },
  { id: 'dashboard', name: 'Dashboard', icon: '📊', desc: 'Admin dashboard' },
  { id: 'webapp', name: 'Full-Stack App', icon: '⚡', desc: 'Frontend + backend' },
  { id: 'saas', name: 'SaaS', icon: '💎', desc: 'SaaS with auth' },
  { id: 'mobile', name: 'Mobile App', icon: '📱', desc: 'React Native app' },
]}));

// ══════════ PUBLIC: Serve sites ══════════
router.get('/site-content/:subdomain', async (req, res) => {
  try {
    const sub = req.params.subdomain.toLowerCase().trim();
    const user = await User.findOne({ 'deployed_sites.subdomain': sub });
    if (!user) return res.status(404).json({ error: 'Not found' });
    const site = user.deployed_sites.find(s => s.subdomain === sub);
    if (!site?.files?.length) return res.status(404).json({ error: 'No content' });
    const indexFile = site.files.find(f => f.name === 'index.html' || f.name.endsWith('.html'));
    if (req.query.raw && indexFile) { res.setHeader('Content-Type', 'text/html'); return res.send(indexFile.content); }
    res.json({ subdomain: sub, title: site.title, files: site.files, hasBadge: site.hasBadge });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

router.get('/site-preview/:subdomain', async (req, res) => {
  try {
    const sub = req.params.subdomain.toLowerCase().trim();
    const user = await User.findOne({ 'deployed_sites.subdomain': sub });
    if (!user) return res.status(404).send('<h1>Not found</h1>');
    const site = user.deployed_sites.find(s => s.subdomain === sub);
    if (!site?.files?.length) return res.status(404).send('<h1>Not found</h1>');
    const f = site.files.find(f => f.name === 'index.html') || site.files.find(f => f.name.endsWith('.html'));
    if (!f) return res.status(404).send('<h1>No HTML</h1>');
    res.setHeader('Content-Type', 'text/html'); res.send(f.content);
  } catch { res.status(500).send('<h1>Error</h1>'); }
});

module.exports = router;
