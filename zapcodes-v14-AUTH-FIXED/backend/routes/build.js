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
  // New keys pass through
  'gemini-3.1-pro': 'gemini-3.1-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'haiku-4.5': 'haiku-4.5',
  'sonnet-4.6': 'sonnet-4.6',
};

function normalizeModelKey(key) {
  return NORMALIZE_MODEL_KEY[key] || key;
}

const RESERVED = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'cdn', 'dev', 'staging', 'test', 'blog', 'docs', 'status', 'support', 'help', 'zapcodes', 'blendlink'];

// ══════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS — Written for ALL AI models (Groq, Gemini, Haiku, Sonnet)
// These prompts use simple, direct language with zero ambiguity.
// Every instruction is explicit. Nothing is implied.
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
- You do NOT change any colors, fonts, or spacing.
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

// ══════════════════════════════════════════════════════════════════
// EDIT_PROMPT — The most important prompt. Used when user edits
// their existing website. AI must preserve everything the user
// did not ask to change. This is explained step by step.
// ══════════════════════════════════════════════════════════════════
const EDIT_PROMPT = `You are ZapCodes AI. The user has an EXISTING website and wants to make changes to it. You will receive their current website code and their change request.

YOUR #1 RULE: DO NOT CHANGE ANYTHING THE USER DID NOT ASK YOU TO CHANGE.

This means:
- If the user says "add a booking form" — you add a booking form. You do NOT touch ANYTHING else on the page. The header stays the same. The footer stays the same. The colors stay the same. The fonts stay the same. Every section stays the same. Every image stays the same. You ONLY add the booking form.
- If the user says "change the hero text" — you change ONLY the hero text. The navigation stays the same. The contact form stays the same. The about section stays the same. Everything else is identical to the original.
- If the user says "make it dark theme" — you change ONLY the colors. You do NOT remove sections. You do NOT rewrite text. You do NOT delete forms. You do NOT change images. You ONLY change background colors, text colors, and border colors.

STEP BY STEP — WHAT YOU MUST DO:

Step 1: READ the existing code. Count how many <section> elements there are. Remember this number.
Step 2: READ the user's request. Identify EXACTLY what they want changed. Make a mental list.
Step 3: Go through the code line by line.
  - For each line: Is this line related to what the user asked to change?
    - YES → Make the change the user requested.
    - NO → Copy this line EXACTLY as it is. Do not modify it. Do not "improve" it. Do not delete it.
Step 4: When you are done, count the <section> elements in your output. It MUST be the same number as Step 1 (unless the user asked to add or remove a section).
Step 5: Verify your output has the SAME number of CSS classes, the SAME color values, the SAME font names, and the SAME text content as the original — except for what the user asked to change.

THINGS YOU MUST NEVER DO (even if you think it would be "better"):

1. NEVER remove a <section> that exists in the original code.
   WRONG: "I removed the testimonials section to simplify the page."
   RIGHT: Keep the testimonials section exactly as it was.

2. NEVER change colors that the user did not mention.
   WRONG: Changing --primary from #6366f1 to #3b82f6 because you think it looks better.
   RIGHT: Keep --primary as #6366f1.

3. NEVER rewrite text content.
   WRONG: Changing "Welcome to Our Restaurant" to "Welcome to the Finest Dining Experience."
   RIGHT: Keep "Welcome to Our Restaurant" exactly as it is.

4. NEVER remove JavaScript functions that are working.
   WRONG: "I simplified the code by removing the scroll animation."
   RIGHT: Keep the scroll animation code exactly as it was.

5. NEVER change image URLs.
   WRONG: Changing https://picsum.photos/600/400 to https://picsum.photos/800/500.
   RIGHT: Keep https://picsum.photos/600/400.

6. NEVER reorganize the HTML structure.
   WRONG: Moving the footer above the contact section.
   RIGHT: Keep the same order of sections.

7. NEVER change CSS class names or IDs.
   WRONG: Renaming .hero-section to .main-hero.
   RIGHT: Keep .hero-section.

8. NEVER delete comments in the code.
   WRONG: Removing <!-- Navigation --> comments.
   RIGHT: Keep all comments.

9. NEVER change fonts.
   WRONG: Switching from "Inter" to "Poppins" because you prefer it.
   RIGHT: Keep "Inter".

10. NEVER remove hover effects or animations.
    WRONG: "I removed the hover animation for cleaner code."
    RIGHT: Keep all hover effects and animations.

WHAT YOU MUST AUTOMATICALLY FIX (without the user asking):

While making the user's requested changes, also fix these if you see them:

1. If any <a href="#something"> link does not scroll to the right section, fix the href to match the correct section ID.
2. If any CSS class is used in HTML but has no styles in <style>, add the missing styles. Match the existing design style.
3. If any HTML tag is not closed, close it.
4. If any <input> is missing a name attribute, add one.
5. If any form does not submit data, add the form submission JavaScript:
   - Submit to: https://api.zapcodes.net/api/forms/submit
   - Send: { subdomain: window.location.hostname.split('.')[0], formType: 'Contact Form', formData: {all fields} }
   - Show "Sending..." on the button while submitting.
   - Show "✓ Sent!" in green when successful.
   - Show "✗ Failed" in red if it fails.
6. If the page does not have smooth scrolling, add: html { scroll-behavior: smooth; }
7. If any section is not responsive on mobile, add media queries for it.
8. If any image is missing an alt attribute, add a descriptive alt.
9. If any button or link has no hover effect, add: transition: all 0.3s ease; and a hover state.

These fixes are silent. Do not tell the user you fixed them. Just do it.

WHEN ADDING NEW SECTIONS:
If the user asks you to add something new (like "add a testimonials section"):
1. Look at the existing CSS variables (--primary, --bg, --text, etc.) and use the SAME variables.
2. Look at the existing card styles, border radius, shadows, and spacing. Match them EXACTLY.
3. Look at the existing heading font sizes and weights. Use the SAME sizes.
4. Place the new section in a logical position (e.g., testimonials before footer, after the main content).
5. Add smooth entrance animation using Intersection Observer, matching the existing animation style.

OUTPUT FORMAT:
\`\`\`filepath:index.html
(the COMPLETE updated file — every single line — not just the changed parts)
\`\`\`

The file must be self-contained. ALL CSS in <style>. ALL JS in <script>. No external files.

FINAL CHECK BEFORE YOU OUTPUT:
1. Count the <section> elements. Same number as original? (unless user asked to add/remove one)
2. Are all original colors still there? (unless user asked to change colors)
3. Are all original text paragraphs still there? (unless user asked to change text)
4. Are all original navigation links still there?
5. Are all original forms still there and working?
6. Are all original images still there?
7. Are all original JavaScript functions still there?
8. Did you make the changes the user asked for?
9. Did you apply the automatic fixes listed above?
If any answer is NO (and the user didn't ask for that change), you made a mistake. Fix it before outputting.`;

const CLONE_PROMPT = `Analyze the website and return JSON: {"title":"...","type":"...","sections":[...],"colors":{"primary":"#hex","secondary":"#hex","bg":"#hex","text":"#hex"},"fonts":"...","features":[...],"layout":"...","content":"..."}`;

// ══════════ SMART MODEL SELECTION — Updated for new 5-model system ══════════
function getEffectiveModel(user, requestedModel) {
  // Admin: can use any model
  if (user.role === 'super-admin') {
    if (requestedModel) return normalizeModelKey(requestedModel);
    return 'gemini-3.1-pro';
  }

  const config = user.getTierConfig();
  const chain = config.modelChain || ['groq'];

  // Normalize the requested model key (handle old frontend sending 'gemini-flash' etc.)
  const normalized = requestedModel ? normalizeModelKey(requestedModel) : null;

  // If user requested a specific model, check if it's available
  if (normalized && normalized !== 'auto') {
    if (chain.includes(normalized)) {
      const limit = config.monthlyLimits?.[normalized];

      // Check if it's a one-time trial model
      if (config.trialModels && config.trialModels.includes(normalized)) {
        if (!user.isTrialExhausted(normalized, limit)) return normalized;
      } else {
        // Monthly limit check
        const used = user.getModelUsageCount(normalized);
        if (limit === Infinity || used < limit) return normalized;
      }
    }
  }

  // Auto-select: walk the chain and pick first available model
  for (const model of chain) {
    const limit = config.monthlyLimits?.[model];

    if (config.trialModels && config.trialModels.includes(model)) {
      if (!user.isTrialExhausted(model, limit)) return model;
    } else {
      const used = user.getModelUsageCount(model);
      if (limit === Infinity || used < limit) return model;
    }
  }

  // Everything exhausted
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

// ══════════ AI-POWERED PROGRESS MESSAGES — Sounds like a real person talking ══════════
async function generateProgressMessages(prompt, template, projectName, modelLabel) {
  const name = projectName || 'your website';
  try {
    const result = await callAI(
      `You are ZapCodes AI assistant giving live build updates to a user. Write exactly 25 short progress messages (one per line) that describe what you're doing while building their website/app. 

RULES:
- Sound like a friendly, enthusiastic human developer talking directly to the user
- Be specific to what THEY asked for — reference their project by name, mention specific features from their description
- Each message should be different and describe a NEW thing you're working on
- Use casual, warm language like "Alright, working on..." or "This is going to look great — adding..." or "Almost there! Just polishing..."
- Include relevant emojis naturally (not at the start of every line)
- Mix technical details with excitement: "The navigation is coming together nicely — added smooth scroll and a slick hamburger menu for mobile"
- Progress from planning → structure → design → features → polish → final checks
- Never say "Step 1" or number them
- Keep each message under 120 characters
- Don't use generic filler — every message should feel like real progress
- Reference the AI model: "${modelLabel}"

OUTPUT: Return ONLY the 25 messages, one per line. No numbering, no quotes, no extra text.`,
      `Building: "${name}" — User's description: "${(prompt || '').slice(0, 500)}" — Template: ${template || 'custom'}`,
      'groq',
      1500
    );
    if (result) {
      const lines = result.split('\n').map(l => l.trim()).filter(l => l.length > 10 && l.length < 200);
      if (lines.length >= 8) return lines;
    }
  } catch (err) {
    console.log(`[ProgressMsgs] AI generation failed, using fallback: ${err.message}`);
  }

  // Fallback if Groq is unavailable — still conversational
  return [
    `Alright, let me take a look at what you want for ${name}... 🧠`,
    `Got it! I can see exactly what you're going for. Let me start building this out.`,
    `First things first — I'm setting up the overall page structure and layout.`,
    `Working on the design system now — picking the right colors, fonts, and spacing to match your vision.`,
    `${modelLabel} is doing some heavy lifting here — writing all the HTML structure from scratch.`,
    `The header and navigation are taking shape. Added smooth scrolling between sections.`,
    `Making this fully responsive — it needs to look perfect on phones, tablets, and desktop.`,
    `Adding the main content sections now. This is where ${name} really starts to come alive.`,
    `Writing the CSS — gradients, shadows, hover effects, the works. Going for that premium feel.`,
    `The interactive parts are next — JavaScript for animations, form validation, and user interactions.`,
    `Almost there! Just polishing the micro-interactions and making sure everything flows smoothly.`,
    `Running through a final check — making sure no styles are missing and all buttons actually work.`,
    `Looking good! Wrapping everything into a clean, single-file package for you.`,
    `Just about done — doing one last pass to make sure it's production-ready. Hang tight!`,
  ];
}

// ══════════ GET /api/build/costs ══════════
router.get('/costs', (req, res) => res.json({ costs: BL_COSTS }));

// ══════════ GET /api/build/system-prompts — Returns default prompts for the editor ══════════
router.get('/system-prompts', auth, (req, res) => {
  res.json({
    gen_prompt: GEN_PROMPT,
    edit_prompt: EDIT_PROMPT,
    fix_prompt: FIX_PROMPT,
  });
});

// ══════════ GET /api/build/available-models — Updated for 5 AI models ══════════
router.get('/available-models', auth, (req, res) => {
  const tier = req.user.subscription_tier;
  const config = req.user.getTierConfig();
  const chain = config.modelChain || ['groq'];
  const isAdmin = req.user.role === 'super-admin';

  const models = chain.map(m => {
    const limit = config.monthlyLimits?.[m];
    const isTrial = config.trialModels && config.trialModels.includes(m);
    let used = 0;

    if (isTrial) {
      used = (req.user.trials_used && req.user.trials_used[m]) || 0;
    } else {
      used = req.user.getModelUsageCount(m);
    }

    return {
      id: m,
      name: getModelDisplayName(m),
      cost: BL_COSTS.generation[m] || 5000,
      monthlyLimit: limit === Infinity ? 'Unlimited' : limit,
      monthlyUsed: used,
      available: isTrial ? !req.user.isTrialExhausted(m, limit) : (limit === Infinity || used < limit),
      primary: chain.indexOf(m) === 0,
      type: isTrial ? 'one_time_trial' : 'monthly',
    };
  });

  // Admin gets all models if not already in chain
  if (isAdmin) {
    const allModels = ['sonnet-4.6', 'gemini-3.1-pro', 'gemini-2.5-flash', 'haiku-4.5', 'groq'];
    for (const m of allModels) {
      if (!chain.includes(m)) {
        models.push({
          id: m,
          name: getModelDisplayName(m) + ' (Admin)',
          cost: BL_COSTS.generation[m] || 5000,
          monthlyLimit: 'Unlimited',
          monthlyUsed: 0,
          available: true,
          primary: false,
          type: 'unlimited',
        });
      }
    }
  }

  // Also include list of ALL models with availability status for the UI
  const allModelsList = ['sonnet-4.6', 'gemini-3.1-pro', 'gemini-2.5-flash', 'haiku-4.5', 'groq'];
  const allModelsInfo = allModelsList.map(m => ({
    id: m,
    name: getModelDisplayName(m),
    cost: BL_COSTS.generation[m] || 5000,
    available: chain.includes(m) || isAdmin,
    tier_required: !chain.includes(m),
  }));

  res.json({
    models,
    allModels: allModelsInfo,
    plan: tier,
    subscription_tier: tier,
    monthlyUsage: req.user.getMonthlyUsage(),
    bl_coins: req.user.bl_coins || 0,
  });
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

    // Select model with fallback chain (handles both old and new model keys)
    const model = getEffectiveModel(user, requestedModel);
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

    // Deduct coins + track usage (uses User model's built-in methods)
    user.spendCoins(cost, 'generation', `Website generation (${getModelDisplayName(model)})`, model);
    user.incrementMonthlyUsage(model, 'generation');

    // If one-time trial model, also track trial usage
    if (config.trialModels && config.trialModels.includes(model)) {
      user.incrementTrial(model);
    }

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

    // ── AI-Powered Progress Messages — sounds like a real person talking ──
    sendProgress('building', `Hey! Let me take a look at what you want to build... 🧠`);
    const progressMsgs = await generateProgressMessages(prompt || description || '', template, projectName, modelLabel);
    let progressIdx = 0;
    progressTicker = setInterval(() => {
      if (!connectionAlive || aborted || progressIdx >= progressMsgs.length) {
        clearInterval(progressTicker);
        return;
      }
      sendProgress('building', progressMsgs[progressIdx]);
      progressIdx++;
    }, 8000); // New message every 8 seconds — feels more natural, like someone typing

    const aiOpts = { onProgress: (msg) => { if (!aborted && connectionAlive) sendProgress('generating', msg); } };

    let files;
    let usedModel = model; // Track which model actually generated the files
    let systemPrompt = GEN_PROMPT;
    let userPrompt = '';

    if (template && template !== 'custom') {
      // Template mode — use custom prompt if provided, else GEN_PROMPT
      if (customSystemPrompt && customSystemPrompt.trim().length > 50) systemPrompt = customSystemPrompt;
      sendProgress('generating_html', `Building ${template} project: "${projectName || 'My Project'}"...`);
      files = await generateProjectMultiStep(template, projectName || 'My Project', description || prompt, colorScheme, features, model, aiOpts);
    } else {
      if (existingFiles && existingFiles.length > 0) {
        // ── EDITING EXISTING WEBSITE ──
        sendProgress('generating_html', `Carefully modifying your existing website using ${modelLabel}...`);
        // Use custom prompt if provided, otherwise use EDIT_PROMPT
        systemPrompt = (customSystemPrompt && customSystemPrompt.trim().length > 50) ? customSystemPrompt : EDIT_PROMPT;
        const existingCode = existingFiles.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
        userPrompt = `<existing_website>
${existingCode}
</existing_website>

<user_request>
${prompt}
</user_request>

Project name: ${projectName || 'My Website'}
${colorScheme && colorScheme !== 'keep existing' ? `Color scheme change requested: ${colorScheme}` : 'Color scheme: DO NOT CHANGE — keep existing colors'}
${features ? `Additional features requested: ${features.join(', ')}` : ''}

Remember: Return the COMPLETE updated file. Every line of the original must be present unless the user specifically asked to remove it.`;
      } else {
        // ── CREATING NEW WEBSITE ──
        sendProgress('generating_html', `Generating website using ${modelLabel}...`);
        // Use custom prompt if provided, otherwise use GEN_PROMPT
        systemPrompt = (customSystemPrompt && customSystemPrompt.trim().length > 50) ? customSystemPrompt : GEN_PROMPT;
        userPrompt = `Create a complete, production-ready website: ${prompt}\n\nProject name: ${projectName || 'My Website'}\nColor scheme: ${colorScheme || 'modern dark theme'}\n${features ? `Features: ${features.join(', ')}` : ''}\n\nIMPORTANT: index.html must be self-contained with ALL CSS inside <style> and ALL JS inside <script>.`;
      }
      const result = await callAI(systemPrompt, userPrompt, model, undefined, aiOpts);
      files = result ? parseFilesFromResponse(result) : [];
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
      // ── FALLBACK: Try next model when current model's output couldn't be parsed ──
      const FALLBACK_ORDER = ['sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];
      const currentIdx = FALLBACK_ORDER.indexOf(normalizeModelKey(model));
      let fallbackFiles = null;
      let fallbackModel = null;

      for (let fi = currentIdx + 1; fi < FALLBACK_ORDER.length; fi++) {
        if (aborted || !connectionAlive) break;
        const nextModel = FALLBACK_ORDER[fi];
        const nextLabel = getModelDisplayName(nextModel);
        const nextCost = BL_COSTS.generation[nextModel] || 5000;

        // Check if user has enough BL for fallback model
        if (user.role !== 'super-admin' && user.bl_coins < nextCost) continue;

        sendProgress('generating', `${modelLabel} output couldn't be processed. Trying ${nextLabel}...`);
        console.log(`[Build Fallback] ${model} produced 0 parseable files → trying ${nextModel}`);

        try {
          // Reuse the same prompt — if editing, keep the edit context
          const fbResult = await callAI(systemPrompt, userPrompt, nextModel, undefined, aiOpts);
          fallbackFiles = fbResult ? parseFilesFromResponse(fbResult) : [];
          if (fallbackFiles && fallbackFiles.length > 0) {
            fallbackModel = nextModel;
            // Refund original model, charge fallback model
            user.creditCoins(cost, 'generation', `Refund: ${modelLabel} output failed, used ${nextLabel}`);
            user.spendCoins(nextCost, 'generation', `Website generation fallback (${nextLabel})`, nextModel);
            await user.save();
            files = fallbackFiles;
            usedModel = nextModel;
            sendProgress('generating', `${nextLabel} generated ${files.length} file(s) successfully!`);
            break;
          }
        } catch (fbErr) {
          console.error(`[Build Fallback] ${nextModel} also failed: ${fbErr.message}`);
          continue;
        }
      }

      // If all fallbacks failed too
      if (!files || files.length === 0) {
        if (keepaliveInterval) clearInterval(keepaliveInterval);
        clearInterval(progressTicker);
        user.creditCoins(cost, 'generation', `Refund: generation failed (${model})`);
        user.decrementMonthlyUsage(model, 'generation');
        await user.save();
        sendProgress('error', `All AI models couldn't generate parseable code. Coins refunded. Try a simpler or shorter prompt.`);
        safeSend(res, { type: 'error', error: 'Generation failed. Coins refunded.', suggestion: 'Try a simpler prompt or different template.' });
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
        if (err.message === 'Generation cancelled') safeSend(res, { type: 'stopped', message: 'Stopped.' });
        else safeSend(res, { type: 'error', error: err.message || 'Generation failed', suggestion: 'Try Groq AI for faster results.' });
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

// ══════════ POST /api/build/generate (non-SSE, kept for compatibility) ══════════
router.post('/generate', auth, async (req, res) => {
  try {
    const user = req.user;
    const { prompt, template, projectName, description, colorScheme, features, model: requestedModel } = req.body;
    const model = getEffectiveModel(user, requestedModel);
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
      const userPrompt = `Create a complete, production-ready website: ${prompt}\n\nProject name: ${projectName || 'My Website'}\nColor scheme: ${colorScheme || 'modern dark theme'}\n${features ? `Features: ${features.join(', ')}` : ''}\n\nIMPORTANT: index.html must be self-contained with ALL CSS in <style> and ALL JS in <script>.`;
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
    const { projectId, name, files, preview, template, description } = req.body;
    if (!files || !files.length) return res.status(400).json({ error: 'No files to save' });
    if (projectId) {
      const idx = (user.saved_projects || []).findIndex(p => p.projectId === projectId);
      if (idx >= 0) { user.saved_projects[idx].name = name || user.saved_projects[idx].name; user.saved_projects[idx].files = files; user.saved_projects[idx].preview = (preview || '').slice(0, 500000); user.saved_projects[idx].updatedAt = new Date(); user.saved_projects[idx].version = (user.saved_projects[idx].version || 1) + 1; user.saved_projects[idx].description = description || user.saved_projects[idx].description; }
      else return res.status(404).json({ error: 'Project not found' });
    } else {
      if (!user.saved_projects) user.saved_projects = [];
      user.saved_projects.push({ projectId: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: name || 'Untitled Project', files, preview: (preview || '').slice(0, 500000), template: template || 'custom', description: description || '', version: 1, createdAt: new Date(), updatedAt: new Date() });
    }
    await user.save();
    const proj = projectId ? user.saved_projects.find(p => p.projectId === projectId) : user.saved_projects[user.saved_projects.length - 1];
    res.json({ project: { projectId: proj.projectId, name: proj.name, version: proj.version, fileCount: proj.files.length, updatedAt: proj.updatedAt }, message: 'Project saved!' });
  } catch (err) { res.status(500).json({ error: 'Failed to save' }); }
});

router.get('/projects', auth, (req, res) => {
  const projects = (req.user.saved_projects || []).map(p => ({ projectId: p.projectId, name: p.name, template: p.template, description: p.description, fileCount: (p.files || []).length, version: p.version || 1, createdAt: p.createdAt, updatedAt: p.updatedAt }));
  res.json({ projects: projects.reverse() });
});

router.get('/project/:projectId', auth, (req, res) => {
  const proj = (req.user.saved_projects || []).find(p => p.projectId === req.params.projectId);
  if (!proj) return res.status(404).json({ error: 'Not found' });
  res.json({ project: proj });
});

router.delete('/project/:projectId', auth, async (req, res) => {
  try { const user = req.user; const idx = (user.saved_projects || []).findIndex(p => p.projectId === req.params.projectId); if (idx === -1) return res.status(404).json({ error: 'Not found' }); user.saved_projects.splice(idx, 1); await user.save(); res.json({ success: true }); }
  catch { res.status(500).json({ error: 'Failed' }); }
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
    await user.save();
    res.json({ url: `https://${sub}.zapcodes.net`, subdomain: sub, deployed: true, hasBadge: shouldBadge, sites: user.deployed_sites.length, maxSites: config.maxSites });
  } catch (err) { res.status(500).json({ error: 'Deploy failed' }); }
});

// ══════════ Code Fix — Updated for new model keys ══════════
router.post('/code-fix', auth, async (req, res) => {
  try {
    const user = req.user; const { files, description, model: requestedModel } = req.body;
    const config = user.getTierConfig(); const mu = user.getMonthlyUsage();

    // Check fix limit
    if (config.monthlyFixCap !== Infinity) {
      if (config.monthlyFixType === 'one_time_trial') {
        const trialUsed = (user.trials_used && user.trials_used['fixes']) || 0;
        if (trialUsed >= config.monthlyFixCap) return res.status(403).json({ error: 'Your one-time trial fix has been used. Upgrade for more.', upgrade: true });
      } else if ((mu.code_fixes || 0) >= config.monthlyFixCap) {
        return res.status(403).json({ error: 'Monthly code fix limit reached', upgrade: true });
      }
    }

    const model = getEffectiveModel(user, requestedModel) || 'groq';
    const cost = BL_COSTS.codeFix[model] || 5000;
    if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient BL coins' });

    user.spendCoins(cost, 'code_fix', `Code fix (${getModelDisplayName(model)})`, model);
    user.incrementMonthlyUsage(model, 'code_fix');
    if (config.monthlyFixType === 'one_time_trial') user.incrementTrial('fixes');
    await user.save();

    const fileContent = (files || []).map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
    const result = await callAI(FIX_PROMPT, `Fix:\n\n${fileContent}\n\nIssue: ${description || 'Fix all bugs'}`, model);
    const fixedFiles = result ? parseFilesFromResponse(result) : [];
    if (!fixedFiles.length) { user.creditCoins(cost, 'code_fix', 'Refund: fix failed'); user.decrementMonthlyUsage(model, 'code_fix'); await user.save(); return res.status(500).json({ error: 'Fix failed. Coins refunded.' }); }
    const preview = generatePreviewHTML(fixedFiles);
    res.json({ files: fixedFiles, preview, model, blSpent: cost, balanceRemaining: user.bl_coins });
  } catch (err) { res.status(500).json({ error: 'Fix failed' }); }
});

// ══════════ GitHub Push — Updated for new model keys ══════════
router.post('/github-push', auth, async (req, res) => {
  try {
    const user = req.user; const config = user.getTierConfig(); const mu = user.getMonthlyUsage();

    // Check push limit
    if (config.monthlyPushCap !== Infinity) {
      if (config.monthlyPushType === 'one_time_trial') {
        const trialUsed = (user.trials_used && user.trials_used['github_pushes']) || 0;
        if (trialUsed >= config.monthlyPushCap) return res.status(403).json({ error: 'Your one-time trial GitHub push has been used. Upgrade for more.' });
      } else if ((mu.github_pushes || 0) >= config.monthlyPushCap) {
        return res.status(403).json({ error: 'Monthly push limit reached' });
      }
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
    user.spendCoins(BL_COSTS.pwaBuild, 'pwa_build', `PWA for ${subdomain}`);
    site.isPWA = true; await user.save();
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
    user.spendCoins(BL_COSTS.badgeRemoval, 'badge_removal', `Badge removal ${req.body.subdomain}`);
    site.hasBadge = false; await user.save();
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
    const user = req.user; const model = getEffectiveModel(user, req.body.model) || 'groq';
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

router.get('/sites', auth, (req, res) => res.json({ sites: req.user.deployed_sites || [] }));
router.delete('/site/:subdomain', auth, async (req, res) => {
  try { const user = req.user; const idx = user.deployed_sites.findIndex(s => s.subdomain === req.params.subdomain); if (idx === -1) return res.status(404).json({ error: 'Not found' }); user.deployed_sites.splice(idx, 1); await user.save(); res.json({ success: true }); }
  catch { res.status(500).json({ error: 'Failed' }); }
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
