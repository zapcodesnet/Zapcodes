const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { callAI, callAIWithImage, parseFilesFromResponse, generateProjectMultiStep, verifyAndFix } = require('../services/ai');
const User = require('../models/User');
const axios = require('axios');

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

const RESERVED = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'cdn', 'dev', 'staging', 'test', 'blog', 'docs', 'status', 'support', 'help', 'zapcodes', 'blendlink'];

// ── BUILD FALLBACK CHAINS — Groq blocked for paid tiers ──
const BUILD_FALLBACK_PAID = ['sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash'];
const BUILD_FALLBACK_FREE = ['gemini-2.5-flash', 'groq'];
const BUILD_FALLBACK_ADMIN = ['sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];
function getBuildFallbackChain(user) { if (user.role === 'super-admin') return BUILD_FALLBACK_ADMIN; const t = user.subscription_tier || 'free'; return t === 'free' ? BUILD_FALLBACK_FREE : BUILD_FALLBACK_PAID; }

// ══════════ SYSTEM PROMPTS ══════════

const GEN_PROMPT = `You are ZapCodes AI. You build websites. You write complete, working code. You never write placeholder code. You never write "// rest of code here" or "..." or "// similar to above". You write every single line.

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
1. Use CSS custom properties for colors.
2. Use flexbox and CSS grid. Never float.
3. Add hover effects with transition: all 0.3s ease;
4. Add media queries for mobile (768px) and tablet (1024px).
5. Use Google Fonts via <link> in <head>.
6. Dark background by default. Light text on dark.
7. Scroll animations using Intersection Observer.
8. html { scroll-behavior: smooth; }
9. Hamburger menu for mobile.
10. Images: https://picsum.photos/WIDTH/HEIGHT
11. At least 500 lines of code.
12. Semantic HTML: header, nav, main, section, article, footer.

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

Every <form> needs data-formtype. Every <input>/<textarea> needs name attribute.`;

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

AUTO-FIX: broken links, missing CSS, unclosed tags, missing input names, broken forms, missing smooth scroll, non-responsive sections, missing alt attrs, missing hover effects.

OUTPUT: \`\`\`filepath:index.html\n(COMPLETE updated file — every line)\n\`\`\``;

const CLONE_PROMPT = `Analyze the website and return JSON: {"title":"...","type":"...","sections":[...],"colors":{"primary":"#hex","secondary":"#hex","bg":"#hex","text":"#hex"},"fonts":"...","features":[...],"layout":"...","content":"..."}`;

// ══════════ SMART MODEL SELECTION — Groq blocked for paid tiers ══════════
function getEffectiveModel(user, requestedModel, isBuildOperation = false) {
  if (user.role === 'super-admin') { if (requestedModel) return normalizeModelKey(requestedModel); return 'gemini-3.1-pro'; }
  const tier = user.subscription_tier || 'free';
  const config = user.getTierConfig();
  const chain = config.modelChain || ['groq'];
  const normalized = requestedModel ? normalizeModelKey(requestedModel) : null;
  const isPaidTier = ['bronze', 'silver', 'gold', 'diamond'].includes(tier);
  const groqBlockedForBuild = isBuildOperation && isPaidTier;

  if (normalized === 'groq' && groqBlockedForBuild) { /* fall through */ }
  else if (normalized && normalized !== 'auto') {
    if (chain.includes(normalized)) {
      const limit = config.monthlyLimits?.[normalized];
      if (config.trialModels?.includes(normalized)) { if (!user.isTrialExhausted(normalized, limit)) return normalized; }
      else { const used = user.getModelUsageCount(normalized); if (limit === Infinity || used < limit) return normalized; }
    }
  }

  for (const model of chain) {
    if (model === 'groq' && groqBlockedForBuild) continue;
    const limit = config.monthlyLimits?.[model];
    if (config.trialModels?.includes(model)) { if (!user.isTrialExhausted(model, limit)) return model; }
    else { const used = user.getModelUsageCount(model); if (limit === Infinity || used < limit) return model; }
  }

  if (tier === 'free' && isBuildOperation) { const groqUsed = user.getModelUsageCount('groq'); const groqLimit = config.monthlyLimits?.['groq']; if (groqLimit === Infinity || groqUsed < groqLimit) return 'groq'; }
  return null;
}

function getModelDisplayName(model) { return MODEL_DISPLAY[model] || MODEL_DISPLAY[normalizeModelKey(model)] || model; }

// ══════════ HELPERS ══════════
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

// ══════════════════════════════════════════════════════════════
// VISION-AWARE AI CALL HELPER
// If referenceImages are provided, uses callAIWithImage so the AI
// can actually SEE screenshots/mockups/reference photos.
// Falls back to callAI for text-only if no images.
// ══════════════════════════════════════════════════════════════
async function callAISmart(systemPrompt, userPrompt, model, maxTokens, referenceImages, aiOpts) {
  if (referenceImages && referenceImages.length > 0) {
    // Groq vision models have limited capability — auto-upgrade for vision tasks
    let visionModel = model;
    if (model === 'groq') {
      // Groq vision works but output is limited; for builds, try Gemini Flash first
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
      if (apiKey) visionModel = 'gemini-2.5-flash';
    }
    console.log(`[Build+Vision] Using ${visionModel} with ${referenceImages.length} image(s)`);
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

// ══════════ ROUTES ══════════

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

// ══════════ POST /api/build/generate-with-progress (SSE) ══════════
router.post('/generate-with-progress', auth, async (req, res) => {
  const sessionId = `gen-${req.user._id}-${Date.now()}`;
  let keepaliveInterval = null; let progressTicker = null; let connectionAlive = true;

  try {
    const user = req.user;
    const { prompt, template, projectName, description, colorScheme, features, model: requestedModel, existingFiles, customSystemPrompt, referenceImages } = req.body;

    // referenceImages = [{ base64, mimeType, fileName }] — user-uploaded screenshots/mockups

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

    // ── Log reference images ──
    const visionImages = (referenceImages || []).filter(img => img.base64 && img.mimeType).map(img => ({ base64: img.base64, mimeType: img.mimeType }));
    if (visionImages.length > 0) {
      sendProgress('analyzing', `Analyzing ${visionImages.length} reference image(s) — AI will match the design...`);
      console.log(`[Build] ${visionImages.length} reference image(s) uploaded — using vision API`);
    }

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
        // ── EDITING EXISTING WEBSITE ──
        sendProgress('generating_html', `Modifying your website using ${modelLabel}...`);
        systemPrompt = EDIT_PROMPT;
        const existingCode = existingFiles.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
        const existingCodeSize = existingCode.length;

        userPrompt = `<existing_website>\n${existingCode}\n</existing_website>\n\n<user_request>\n${prompt}\n</user_request>\n\nProject: ${projectName || 'My Website'}\n${colorScheme && colorScheme !== 'keep existing' ? `Color change: ${colorScheme}` : 'Colors: DO NOT CHANGE'}\n${features ? `Features: ${features.join(', ')}` : ''}\n${visionImages.length > 0 ? 'REFERENCE IMAGES ATTACHED: Study them carefully and apply the design changes shown.' : ''}\n\nReturn the COMPLETE updated file.`;

        // Auto-upgrade Groq for edits
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
          if (!files?.length) {
            sendProgress('generating', 'Trying with Groq...');
            const result = await callAISmart(systemPrompt, userPrompt, model, undefined, visionImages, aiOpts);
            files = result ? parseFilesFromResponse(result) : [];
          }
        } else {
          const result = await callAISmart(systemPrompt, userPrompt, model, undefined, visionImages, aiOpts);
          files = result ? parseFilesFromResponse(result) : [];
        }
      } else {
        // ── CREATING NEW WEBSITE ──
        sendProgress('generating_html', `Generating website using ${modelLabel}...`);
        systemPrompt = (customSystemPrompt?.trim().length > 50) ? customSystemPrompt : GEN_PROMPT;
        userPrompt = `Create a complete, production-ready website: ${prompt}\n\nProject: ${projectName || 'My Website'}\nColors: ${colorScheme || 'modern dark theme'}\n${features ? `Features: ${features.join(', ')}` : ''}\n${visionImages.length > 0 ? 'REFERENCE IMAGES ATTACHED: Study them carefully. Recreate the design, layout, colors, and structure as closely as possible.' : ''}\n\nIMPORTANT: Self-contained index.html with ALL CSS in <style> and ALL JS in <script>.`;
        const result = await callAISmart(systemPrompt, userPrompt, model, undefined, visionImages, aiOpts);
        files = result ? parseFilesFromResponse(result) : [];
      }
    }

    if (aborted || !connectionAlive) {
      if (keepaliveInterval) clearInterval(keepaliveInterval); clearInterval(progressTicker);
      user.creditCoins(cost, 'generation', 'Refund: stopped'); user.decrementMonthlyUsage(model, 'generation'); await user.save();
      if (connectionAlive) { safeSend(res, { type: 'stopped' }); res.end(); } return;
    }

    if (!files?.length) {
      // ── FALLBACK chain ──
      const fallbackChain = getBuildFallbackChain(user);
      const currentIdx = fallbackChain.indexOf(normalizeModelKey(model));
      for (let fi = currentIdx + 1; fi < fallbackChain.length; fi++) {
        if (aborted || !connectionAlive) break;
        const nextModel = fallbackChain[fi]; const nextLabel = getModelDisplayName(nextModel); const nextCost = BL_COSTS.generation[nextModel] || 5000;
        if (user.role !== 'super-admin' && user.bl_coins < nextCost) continue;
        sendProgress('generating', `${modelLabel} couldn't process. Trying ${nextLabel}...`);
        try {
          const fbResult = await callAISmart(systemPrompt, userPrompt, nextModel, undefined, visionImages, aiOpts);
          const fbFiles = fbResult ? parseFilesFromResponse(fbResult) : [];
          if (fbFiles?.length) {
            user.creditCoins(cost, 'generation', `Refund: ${modelLabel} failed`); user.spendCoins(nextCost, 'generation', `Fallback (${nextLabel})`, nextModel); await user.save();
            files = fbFiles; usedModel = nextModel;
            sendProgress('generating', `${nextLabel} generated ${files.length} file(s)!`); break;
          }
        } catch (fbErr) { console.error(`[Fallback] ${nextModel}: ${fbErr.message}`); }
      }

      if (!files?.length) {
        if (keepaliveInterval) clearInterval(keepaliveInterval); clearInterval(progressTicker);
        user.creditCoins(cost, 'generation', `Refund: failed (${model})`); user.decrementMonthlyUsage(model, 'generation'); await user.save();
        sendProgress('error', 'All AI models failed. Coins refunded.');
        safeSend(res, { type: 'error', error: 'Generation failed. Coins refunded.' }); return res.end();
      }
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

// ══════════ Save/Load Projects ══════════
router.post('/save-project', auth, async (req, res) => {
  try {
    const user = req.user; const { projectId, name, files, preview, template, description, subdomain } = req.body;
    if (!files?.length) return res.status(400).json({ error: 'No files' });
    if (projectId) { const idx = (user.saved_projects || []).findIndex(p => p.projectId === projectId); if (idx >= 0) { user.saved_projects[idx].name = name || user.saved_projects[idx].name; user.saved_projects[idx].files = files; user.saved_projects[idx].preview = (preview || '').slice(0, 500000); user.saved_projects[idx].updatedAt = new Date(); user.saved_projects[idx].version = (user.saved_projects[idx].version || 1) + 1; user.saved_projects[idx].description = description || user.saved_projects[idx].description; if (subdomain && !user.saved_projects[idx].linkedSubdomain) user.saved_projects[idx].linkedSubdomain = subdomain; } else return res.status(404).json({ error: 'Not found' }); }
    else { if (!user.saved_projects) user.saved_projects = []; user.saved_projects.push({ projectId: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: name || 'Untitled', files, preview: (preview || '').slice(0, 500000), template: template || 'custom', description: description || '', linkedSubdomain: subdomain || null, version: 1, createdAt: new Date(), updatedAt: new Date() }); }
    await user.save();
    const proj = projectId ? user.saved_projects.find(p => p.projectId === projectId) : user.saved_projects[user.saved_projects.length - 1];
    res.json({ project: { projectId: proj.projectId, name: proj.name, version: proj.version, fileCount: proj.files.length, linkedSubdomain: proj.linkedSubdomain, updatedAt: proj.updatedAt }, message: 'Saved!' });
  } catch { res.status(500).json({ error: 'Save failed' }); }
});

router.get('/projects', auth, (req, res) => { res.json({ projects: (req.user.saved_projects || []).map(p => ({ projectId: p.projectId, name: p.name, template: p.template, description: p.description, fileCount: (p.files || []).length, version: p.version || 1, linkedSubdomain: p.linkedSubdomain || null, createdAt: p.createdAt, updatedAt: p.updatedAt })).reverse() }); });
router.get('/project/:projectId', auth, (req, res) => { const proj = (req.user.saved_projects || []).find(p => p.projectId === req.params.projectId); if (!proj) return res.status(404).json({ error: 'Not found' }); res.json({ project: proj }); });

router.delete('/project/:projectId', auth, async (req, res) => {
  try { const user = req.user; const idx = (user.saved_projects || []).findIndex(p => p.projectId === req.params.projectId); if (idx === -1) return res.status(404).json({ error: 'Not found' }); const project = user.saved_projects[idx]; let shutdownSite = null; if (project.linkedSubdomain) { const siteIdx = user.deployed_sites.findIndex(s => s.subdomain === project.linkedSubdomain); if (siteIdx >= 0) { shutdownSite = project.linkedSubdomain; user.deployed_sites.splice(siteIdx, 1); } } user.saved_projects.splice(idx, 1); await user.save(); res.json({ success: true, shutdownSite }); } catch { res.status(500).json({ error: 'Failed' }); }
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
    let deployFiles = files; const shouldBadge = !config.canRemoveBadge;
    if (shouldBadge && deployFiles) deployFiles = deployFiles.map(f => f.name.endsWith('.html') ? { ...f, content: f.content.replace('</body>', `${BADGE_SCRIPT}</body>`) } : f);
    if (existingSite) { existingSite.title = title || existingSite.title; existingSite.files = deployFiles; existingSite.lastUpdated = new Date(); existingSite.hasBadge = shouldBadge; existingSite.fileSize = JSON.stringify(files).length; }
    else user.deployed_sites.push({ subdomain: sub, title: title || sub, files: deployFiles, hasBadge: shouldBadge, fileSize: JSON.stringify(files).length });
    if (!user.saved_projects) user.saved_projects = [];
    const linkedProject = user.saved_projects.find(p => p.linkedSubdomain === sub);
    if (linkedProject) { linkedProject.name = title || sub; linkedProject.files = files; linkedProject.updatedAt = new Date(); linkedProject.version = (linkedProject.version || 1) + 1; }
    else { user.saved_projects.push({ projectId: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: title || sub, files, preview: '', template: 'custom', description: `Deployed: ${sub}.zapcodes.net`, linkedSubdomain: sub, version: 1, createdAt: new Date(), updatedAt: new Date() }); }
    await user.save();
    const savedProj = user.saved_projects.find(p => p.linkedSubdomain === sub);
    res.json({ url: `https://${sub}.zapcodes.net`, subdomain: sub, deployed: true, hasBadge: shouldBadge, sites: user.deployed_sites.length, maxSites: config.maxSites, linkedProjectId: savedProj?.projectId });
  } catch { res.status(500).json({ error: 'Deploy failed' }); }
});

router.post('/redeploy-from-project', auth, async (req, res) => {
  try {
    const user = req.user; const { projectId } = req.body; if (!projectId) return res.status(400).json({ error: 'Missing projectId' });
    const project = (user.saved_projects || []).find(p => p.projectId === projectId); if (!project) return res.status(404).json({ error: 'Not found' }); if (!project.linkedSubdomain) return res.status(400).json({ error: 'Not linked.' });
    const sub = project.linkedSubdomain; const site = user.deployed_sites.find(s => s.subdomain === sub); if (!site) return res.status(404).json({ error: `${sub}.zapcodes.net not found.` });
    const config = user.getTierConfig(); const shouldBadge = !config.canRemoveBadge;
    let deployFiles = project.files || []; if (shouldBadge) deployFiles = deployFiles.map(f => f.name.endsWith('.html') ? { ...f, content: f.content.replace('</body>', `${BADGE_SCRIPT}</body>`) } : f);
    site.files = deployFiles; site.title = project.name || site.title; site.lastUpdated = new Date(); site.hasBadge = shouldBadge; site.fileSize = JSON.stringify(project.files).length;
    project.updatedAt = new Date(); project.version = (project.version || 1) + 1; await user.save();
    res.json({ success: true, url: `https://${sub}.zapcodes.net`, subdomain: sub, version: project.version });
  } catch { res.status(500).json({ error: 'Re-deploy failed' }); }
});

// ══════════ Code Fix — with vision support for bug screenshots ══════════
router.post('/code-fix', auth, async (req, res) => {
  try {
    const user = req.user; const { files, description, model: requestedModel, referenceImages } = req.body;
    const config = user.getTierConfig(); const mu = user.getMonthlyUsage();
    if (config.monthlyFixCap !== Infinity) {
      if (config.monthlyFixType === 'one_time_trial') { if ((user.trials_used?.['fixes'] || 0) >= config.monthlyFixCap) return res.status(403).json({ error: 'Trial fix used.', upgrade: true }); }
      else if ((mu.code_fixes || 0) >= config.monthlyFixCap) return res.status(403).json({ error: 'Fix limit reached', upgrade: true });
    }
    const model = getEffectiveModel(user, requestedModel, true) || 'gemini-2.5-flash';
    const cost = BL_COSTS.codeFix[model] || 5000;
    if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient BL coins' });
    user.spendCoins(cost, 'code_fix', `Code fix (${getModelDisplayName(model)})`, model); user.incrementMonthlyUsage(model, 'code_fix');
    if (config.monthlyFixType === 'one_time_trial') user.incrementTrial('fixes'); await user.save();

    const fileContent = (files || []).map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
    const visionImages = (referenceImages || []).filter(img => img.base64 && img.mimeType);

    // Auto-upgrade Groq for large files
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

// ══════════ GitHub Push ══════════
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

// ══════════ PWA, Badge, Clone, Sites ══════════
router.post('/pwa', auth, async (req, res) => { try { const user = req.user; const config = user.getTierConfig(); if (!config.canPWA) return res.status(403).json({ error: 'PWA requires Gold+', upgrade: true }); if (user.role !== 'super-admin' && user.bl_coins < BL_COSTS.pwaBuild) return res.status(402).json({ error: 'Insufficient BL coins' }); const { subdomain, appName, themeColor } = req.body; const site = user.deployed_sites.find(s => s.subdomain === subdomain); if (!site) return res.status(404).json({ error: 'Not found' }); user.spendCoins(BL_COSTS.pwaBuild, 'pwa_build', `PWA for ${subdomain}`); site.isPWA = true; await user.save(); res.json({ manifest: { name: appName || site.title, short_name: (appName || subdomain).slice(0, 12), start_url: '/', display: 'standalone', background_color: '#000', theme_color: themeColor || '#6366f1', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, blSpent: BL_COSTS.pwaBuild, balanceRemaining: user.bl_coins }); } catch { res.status(500).json({ error: 'PWA failed' }); } });

router.post('/remove-badge', auth, async (req, res) => { try { const user = req.user; const config = user.getTierConfig(); if (!config.canRemoveBadge) return res.status(403).json({ error: 'Silver+ required', upgrade: true }); if (user.role !== 'super-admin' && user.bl_coins < BL_COSTS.badgeRemoval) return res.status(402).json({ error: 'Insufficient' }); const site = user.deployed_sites.find(s => s.subdomain === req.body.subdomain); if (!site) return res.status(404).json({ error: 'Not found' }); if (!site.hasBadge) return res.json({ message: 'Already removed' }); user.spendCoins(BL_COSTS.badgeRemoval, 'badge_removal', `Badge ${req.body.subdomain}`); site.hasBadge = false; await user.save(); res.json({ success: true, blSpent: BL_COSTS.badgeRemoval, balanceRemaining: user.bl_coins }); } catch { res.status(500).json({ error: 'Failed' }); } });

router.post('/clone-analyze', auth, async (req, res) => { try { let content = req.body.code || ''; if (req.body.url) { try { content = (await axios.get(req.body.url, { timeout: 15000, headers: { 'User-Agent': 'ZapCodes-Analyzer/1.0' } })).data; } catch (e) { return res.status(400).json({ error: `Could not fetch: ${e.message}` }); } } if (!content) return res.status(400).json({ error: 'Provide URL or code' }); const analysis = await callAI(CLONE_PROMPT, content.slice(0, 30000), 'groq'); let parsed; try { parsed = JSON.parse(analysis); } catch { parsed = { title: 'Website', type: 'other', sections: [], colors: {}, layout: analysis }; } res.json({ analysis: parsed }); } catch { res.status(500).json({ error: 'Analysis failed' }); } });

router.post('/clone-rebuild', auth, async (req, res) => { try { const user = req.user; const model = getEffectiveModel(user, req.body.model, true) || 'gemini-2.5-flash'; const cost = BL_COSTS.generation[model] || 5000; if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient' }); user.spendCoins(cost, 'generation', `Clone (${getModelDisplayName(model)})`, model); user.incrementMonthlyUsage(model, 'generation'); if (user.getTierConfig().trialModels?.includes(model)) user.incrementTrial(model); await user.save(); const result = await callAI(GEN_PROMPT, `Rebuild:\n${JSON.stringify(req.body.analysis)}\n\nMods: ${req.body.modifications || 'Keep faithful'}`, model); let files = result ? parseFilesFromResponse(result) : []; if (!files.length) { user.creditCoins(cost, 'generation', 'Refund'); user.decrementMonthlyUsage(model, 'generation'); await user.save(); return res.status(500).json({ error: 'Failed. Refunded.' }); } res.json({ files, preview: generatePreviewHTML(files), model, blSpent: cost, balanceRemaining: user.bl_coins, fileCount: files.length }); } catch { res.status(500).json({ error: 'Clone failed' }); } });

router.get('/sites', auth, (req, res) => { const sites = (req.user.deployed_sites || []).map(s => { const lp = (req.user.saved_projects || []).find(p => p.linkedSubdomain === s.subdomain); return { ...(s.toObject ? s.toObject() : s), linkedProjectId: lp?.projectId || null }; }); res.json({ sites }); });

router.post('/site/shutdown', auth, async (req, res) => { try { const user = req.user; const sub = (req.body.subdomain || '').toLowerCase().trim(); const idx = user.deployed_sites.findIndex(s => s.subdomain === sub); if (idx === -1) return res.status(404).json({ error: 'Not found' }); user.deployed_sites.splice(idx, 1); await user.save(); res.json({ success: true, message: `${sub}.zapcodes.net offline. Project saved.` }); } catch { res.status(500).json({ error: 'Shutdown failed' }); } });

router.delete('/site/:subdomain', auth, async (req, res) => { try { const user = req.user; const sub = req.params.subdomain; const si = user.deployed_sites.findIndex(s => s.subdomain === sub); if (si >= 0) user.deployed_sites.splice(si, 1); const pi = (user.saved_projects || []).findIndex(p => p.linkedSubdomain === sub); if (pi >= 0) user.saved_projects.splice(pi, 1); await user.save(); res.json({ success: true }); } catch { res.status(500).json({ error: 'Failed' }); } });

router.get('/templates', (req, res) => res.json({ templates: [{ id: 'custom', name: 'Custom (AI Chat)', icon: '💬', desc: 'Describe anything' }, { id: 'portfolio', name: 'Portfolio', icon: '👤', desc: 'Personal portfolio' }, { id: 'landing', name: 'Landing Page', icon: '🚀', desc: 'Product landing' }, { id: 'blog', name: 'Blog', icon: '📝', desc: 'Blog template' }, { id: 'ecommerce', name: 'E-Commerce', icon: '🛒', desc: 'Online store' }, { id: 'dashboard', name: 'Dashboard', icon: '📊', desc: 'Admin dashboard' }, { id: 'webapp', name: 'Full-Stack App', icon: '⚡', desc: 'Frontend + backend' }, { id: 'saas', name: 'SaaS', icon: '💎', desc: 'SaaS with auth' }, { id: 'mobile', name: 'Mobile App', icon: '📱', desc: 'React Native' }] }));

// ══════════ PUBLIC: Serve sites ══════════
router.get('/site-content/:subdomain', async (req, res) => { try { const sub = req.params.subdomain.toLowerCase().trim(); const user = await User.findOne({ 'deployed_sites.subdomain': sub }); if (!user) return res.status(404).json({ error: 'Not found' }); const site = user.deployed_sites.find(s => s.subdomain === sub); if (!site?.files?.length) return res.status(404).json({ error: 'No content' }); const indexFile = site.files.find(f => f.name === 'index.html' || f.name.endsWith('.html')); if (req.query.raw && indexFile) { res.setHeader('Content-Type', 'text/html'); return res.send(indexFile.content); } res.json({ subdomain: sub, title: site.title, files: site.files, hasBadge: site.hasBadge }); } catch { res.status(500).json({ error: 'Failed' }); } });

router.get('/site-preview/:subdomain', async (req, res) => { try { const sub = req.params.subdomain.toLowerCase().trim(); const user = await User.findOne({ 'deployed_sites.subdomain': sub }); if (!user) return res.status(404).send('<h1>Not found</h1>'); const site = user.deployed_sites.find(s => s.subdomain === sub); if (!site?.files?.length) return res.status(404).send('<h1>Not found</h1>'); const f = site.files.find(f => f.name === 'index.html') || site.files.find(f => f.name.endsWith('.html')); if (!f) return res.status(404).send('<h1>No HTML</h1>'); res.setHeader('Content-Type', 'text/html'); res.send(f.content); } catch { res.status(500).send('<h1>Error</h1>'); } });

module.exports = router;
