const express = require('express');
const router = express.Router();
const { auth, optionalAuth } = require('../middleware/auth');
const { callAI, streamAI, parseFilesFromResponse, generateProjectMultiStep, MODELS } = require('../services/ai');
const User = require('../models/User');
const axios = require('axios');

// ══════════ BL COIN COSTS ══════════
const BL_COSTS = {
  generation: { groq: 5000, haiku: 10000, opus: 50000 },
  codeFix:    { groq: 5000, haiku: 10000, opus: 50000 },
  githubPush: 2000,
  pwaBuild:   20000,
  badgeRemoval: 100000,
  deploy: 0,
};

// Reserved subdomains
const RESERVED = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'cdn', 'dev', 'staging', 'test', 'blog', 'docs', 'status', 'support', 'help', 'zapcodes', 'blendlink'];

// ══════════ SYSTEM PROMPTS ══════════
const GEN_PROMPT = `You are ZapCodes AI, an expert full-stack web developer. Generate COMPLETE, production-quality websites.

CRITICAL OUTPUT RULES:
1. Output a SINGLE, COMPLETE index.html file containing ALL code
2. Put ALL CSS inside <style> tags in the <head>
3. Put ALL JavaScript inside <script> tags before </body>
4. NEVER output separate files — everything goes in ONE index.html
5. Start your code with <!DOCTYPE html> — NO text before it
6. Do NOT include any explanation, commentary, or markdown — ONLY the HTML code
7. Do NOT wrap the code in backticks or code blocks — output raw HTML directly

DESIGN RULES:
1. Use modern CSS (variables, flexbox/grid, animations, responsive)
2. Professional design with gradients, shadows, smooth transitions
3. Mobile-first responsive design with media queries
4. Dark mode by default with rich colors
5. Include ALL sections the user describes
6. Use semantic HTML5 elements
7. Include meta viewport tag for mobile
8. Use Google Fonts via CDN link when appropriate
9. Include hover effects, transitions, and micro-animations
10. Use emoji or SVG icons — never rely on external icon libraries`;

const FIX_PROMPT = `You are ZapCodes AI, an expert code debugger. Fix the provided code.

CRITICAL OUTPUT RULES:
1. Output a SINGLE, COMPLETE index.html file with ALL fixes applied
2. Put ALL CSS inside <style> tags in the <head>
3. Put ALL JavaScript inside <script> tags before </body>
4. Start with <!DOCTYPE html> — NO text or explanation before it
5. Do NOT wrap in backticks or code blocks — output raw HTML only

FIX RULES:
1. Identify and fix ALL bugs, errors, and issues
2. Return the COMPLETE fixed code (not just snippets)
3. Maintain the original structure and style
4. Add error handling where missing`;

const CLONE_PROMPT = `You are ZapCodes AI website analyzer. Analyze the provided website structure and content.

Return a JSON object with:
{
  "title": "Site title",
  "type": "portfolio/landing/blog/ecommerce/dashboard/other",
  "sections": ["hero", "about", "features", ...],
  "colors": { "primary": "#hex", "secondary": "#hex", "bg": "#hex", "text": "#hex" },
  "fonts": "font description",
  "features": ["responsive", "animations", ...],
  "layout": "description of layout",
  "content": "brief content summary"
}`;

// ══════════ HELPERS ══════════
function getEffectiveModel(user, requestedModel) {
  if (user.role === 'super-admin') return requestedModel || 'haiku';
  const plan = user.plan;
  if (plan === 'free' || plan === 'bronze') return 'groq';
  if (plan === 'silver' || plan === 'gold') return 'haiku';
  if (plan === 'diamond') {
    if (requestedModel === 'opus') return 'opus';
    return requestedModel || 'haiku';
  }
  return 'groq';
}

// ══════════ EXTRACT CLEAN HTML FROM AI RESPONSE ══════════
function extractHTML(response) {
  if (!response) return null;

  // Method 1: Find HTML inside ```html or ``` code blocks
  const codeBlockMatch = response.match(/```(?:html)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    const code = codeBlockMatch[1].trim();
    if (code.includes('<!DOCTYPE') || code.includes('<html') || code.includes('<head')) {
      return code;
    }
  }

  // Method 2: Find <!DOCTYPE html> and take everything from there
  const doctypeIndex = response.indexOf('<!DOCTYPE');
  if (doctypeIndex !== -1) {
    let html = response.slice(doctypeIndex);
    html = html.replace(/```\s*$/, '').trim();
    return html;
  }

  // Method 3: Find <html and take everything from there
  const htmlIndex = response.indexOf('<html');
  if (htmlIndex !== -1) {
    let html = response.slice(htmlIndex);
    html = html.replace(/```\s*$/, '').trim();
    return html;
  }

  // Method 4: Try parseFilesFromResponse for multi-file format
  const files = parseFilesFromResponse(response);
  if (files.length > 0) {
    const htmlFile = files.find(f => f.name.endsWith('.html'));
    const cssFile = files.find(f => f.name.endsWith('.css'));
    const jsFile = files.find(f => f.name.endsWith('.js') && !f.name.includes('service-worker'));
    if (htmlFile) {
      let content = htmlFile.content;
      if (cssFile && !content.includes(cssFile.content.slice(0, 50))) {
        content = content.replace('</head>', '<style>' + cssFile.content + '</style></head>');
      }
      if (jsFile && !content.includes(jsFile.content.slice(0, 50))) {
        content = content.replace('</body>', '<script>' + jsFile.content + '</script></body>');
      }
      return content;
    }
  }

  // Method 5: Find first HTML-like tag
  const firstTag = response.indexOf('<');
  if (firstTag !== -1) {
    const snippet = response.slice(firstTag, firstTag + 30).toLowerCase();
    if (snippet.includes('<head') || snippet.includes('<body') || snippet.includes('<div') || snippet.includes('<style') || snippet.includes('<meta')) {
      let html = response.slice(firstTag);
      html = html.replace(/```\s*$/, '').trim();
      if (!html.includes('<html')) {
        html = '<!DOCTYPE html>\n<html lang="en">\n' + html + '\n</html>';
      }
      return html;
    }
  }

  return null;
}

function generatePreviewHTML(files) {
  if (!files || files.length === 0) return '<html><body><h1>No preview available</h1></body></html>';
  const html = files.find(f => f.name.endsWith('.html') || f.name === 'index.html');
  const css = files.find(f => f.name.endsWith('.css') || f.name === 'style.css');
  const js = files.find(f => f.name.endsWith('.js') && !f.name.includes('service-worker') || f.name === 'script.js');
  if (!html) return '<html><body><h1>No preview available</h1></body></html>';
  let content = html.content;
  if (css && !content.includes(css.content.slice(0, 50))) {
    content = content.replace('</head>', '<style>' + css.content + '</style></head>');
  }
  if (js && !content.includes(js.content.slice(0, 50))) {
    content = content.replace('</body>', '<script>' + js.content + '</script></body>');
  }
  return content;
}

const BADGE_SCRIPT = '<div id="zc-badge" style="position:fixed;bottom:10px;right:10px;z-index:99999;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:6px 14px;border-radius:20px;font-family:-apple-system,sans-serif;font-size:12px;font-weight:600;box-shadow:0 2px 10px rgba(99,102,241,.3);cursor:pointer;text-decoration:none;display:flex;align-items:center;gap:4px" onclick="window.open(\'https://zapcodes.net?ref=badge\',\'_blank\')">⚡ Made with ZapCodes</div>';

// ══════════ GET /api/build/costs ══════════
router.get('/costs', (req, res) => {
  res.json({ costs: BL_COSTS });
});

// ══════════ POST /api/build/generate ══════════
router.post('/generate', auth, async (req, res) => {
  try {
    const user = req.user;
    const { prompt, template, projectName, description, colorScheme, features, model: requestedModel } = req.body;

    if (!user.canPerformAction('generation')) {
      const config = user.getTierConfig();
      return res.status(403).json({ error: 'Daily generation limit reached', limit: config.dailyGenCap, used: user.dailyUsage?.generations || 0, upgrade: true });
    }

    const model = getEffectiveModel(user, requestedModel);
    const config = user.getTierConfig();
    const inputText = prompt || description || '';
    if (config.maxChars !== Infinity && inputText.length > config.maxChars) {
      return res.status(400).json({ error: 'Message too long. Your plan allows ' + config.maxChars + ' characters.', maxChars: config.maxChars, current: inputText.length });
    }

    const cost = BL_COSTS.generation[model];
    if (user.role !== 'super-admin' && user.blCoins < cost) {
      return res.status(402).json({ error: 'Insufficient BL coins', required: cost, balance: user.blCoins, topup: true });
    }

    user.spendCoins(cost, 'generation', 'Website generation (' + model + ')', model);
    const today = new Date().toISOString().split('T')[0];
    if (!user.dailyUsage || user.dailyUsage.date !== today) user.dailyUsage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    user.dailyUsage.generations += 1;
    await user.save();

    let files;
    let preview;

    if (template && template !== 'custom') {
      files = await generateProjectMultiStep(template, projectName || 'My Project', description || prompt, colorScheme, features, model);
      preview = generatePreviewHTML(files);
    } else {
      const userPrompt = 'Create a website: ' + prompt + '\n\nProject name: ' + (projectName || 'My Website') + '\nColor scheme: ' + (colorScheme || 'modern dark theme') + (features ? '\nFeatures: ' + features.join(', ') : '');
      const result = await callAI(GEN_PROMPT, userPrompt, model);

      // Smart HTML extraction
      const cleanHTML = extractHTML(result);
      if (cleanHTML) {
        files = [{ name: 'index.html', content: cleanHTML }];
        preview = cleanHTML;
        console.log('[Build] Extracted HTML (' + cleanHTML.length + ' chars) from ' + model);
      } else {
        files = result ? parseFilesFromResponse(result) : [];
        preview = files.length > 0 ? generatePreviewHTML(files) : '';
      }
    }

    if (!files || files.length === 0) {
      user.creditCoins(cost, 'generation', 'Refund: generation failed (' + model + ')');
      user.dailyUsage.generations = Math.max(0, user.dailyUsage.generations - 1);
      await user.save();
      return res.status(500).json({ error: 'AI generation failed. Coins refunded.' });
    }

    res.json({
      files,
      preview,
      model,
      blSpent: cost,
      balanceRemaining: user.blCoins,
      dailyUsage: user.dailyUsage,
      fileCount: files.length,
    });
  } catch (err) {
    console.error('[Build] Generate error:', err);
    res.status(500).json({ error: err.message || 'Generation failed' });
  }
});

// ══════════ POST /api/build/generate-stream ══════════
router.post('/generate-stream', auth, async (req, res) => {
  try {
    const user = req.user;
    const { prompt, model: requestedModel } = req.body;
    if (!user.canPerformAction('generation')) return res.status(403).json({ error: 'Daily limit reached' });
    const model = getEffectiveModel(user, requestedModel);
    const cost = BL_COSTS.generation[model];
    if (user.role !== 'super-admin' && user.blCoins < cost) return res.status(402).json({ error: 'Insufficient BL coins' });
    user.spendCoins(cost, 'generation', 'Stream generation (' + model + ')', model);
    const today = new Date().toISOString().split('T')[0];
    if (!user.dailyUsage || user.dailyUsage.date !== today) user.dailyUsage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    user.dailyUsage.generations += 1;
    await user.save();
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    const fullText = await streamAI(GEN_PROMPT, 'Create a website: ' + prompt, model, res);
    if (fullText) {
      const cleanHTML = extractHTML(fullText);
      const files = cleanHTML ? [{ name: 'index.html', content: cleanHTML }] : parseFilesFromResponse(fullText);
      const preview = cleanHTML || generatePreviewHTML(files);
      res.write('data: ' + JSON.stringify({ type: 'files', files, preview }) + '\n\n');
    }
    res.end();
  } catch (err) {
    console.error('[Build] Stream error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Stream failed' });
    else res.end();
  }
});

// ══════════ POST /api/build/deploy ══════════
router.post('/deploy', auth, async (req, res) => {
  try {
    const user = req.user;
    const { subdomain, files, title } = req.body;
    const config = user.getTierConfig();
    const sub = (subdomain || '').toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(sub)) {
      return res.status(400).json({ error: 'Subdomain must be 3-50 alphanumeric characters and hyphens' });
    }
    if (RESERVED.includes(sub)) return res.status(400).json({ error: 'This subdomain is reserved' });
    const existingSite = user.deployedSites.find(function(s) { return s.subdomain === sub; });
    if (!existingSite && user.deployedSites.length >= config.maxSites) {
      return res.status(403).json({ error: 'Site limit reached (' + config.maxSites + '). Upgrade for more.', upgrade: true });
    }
    if (!existingSite) {
      const taken = await User.findOne({ 'deployedSites.subdomain': sub, _id: { $ne: user._id } });
      if (taken) return res.status(409).json({ error: 'Subdomain already taken' });
    }
    var deployFiles = files;
    var isDiamond = user.plan === 'diamond';
    var hasBadge = !isDiamond;
    if (hasBadge && deployFiles) {
      deployFiles = deployFiles.map(function(f) {
        if (f.name === 'index.html' || f.name.endsWith('.html')) {
          return { name: f.name, content: f.content.replace('</body>', BADGE_SCRIPT + '</body>') };
        }
        return f;
      });
    }
    if (existingSite) {
      existingSite.title = title || existingSite.title;
      existingSite.lastUpdated = new Date();
      existingSite.hasBadge = hasBadge;
      existingSite.fileSize = JSON.stringify(files).length;
    } else {
      user.deployedSites.push({ subdomain: sub, title: title || sub, hasBadge: hasBadge, fileSize: JSON.stringify(files).length });
    }
    await user.save();
    res.json({ url: 'https://' + sub + '.zapcodes.net', subdomain: sub, deployed: true, hasBadge: hasBadge, sites: user.deployedSites.length, maxSites: config.maxSites });
  } catch (err) {
    console.error('[Build] Deploy error:', err);
    res.status(500).json({ error: 'Deploy failed' });
  }
});

// ══════════ POST /api/build/code-fix ══════════
router.post('/code-fix', auth, async (req, res) => {
  try {
    const user = req.user;
    const { files, description, model: requestedModel } = req.body;
    if (!user.canPerformAction('codeFix')) {
      return res.status(403).json({ error: 'Daily code fix limit reached', upgrade: true });
    }
    const model = getEffectiveModel(user, requestedModel);
    const cost = BL_COSTS.codeFix[model];
    if (user.role !== 'super-admin' && user.blCoins < cost) {
      return res.status(402).json({ error: 'Insufficient BL coins', required: cost, balance: user.blCoins });
    }
    user.spendCoins(cost, 'code_fix', 'Code fix (' + model + ')', model);
    const today = new Date().toISOString().split('T')[0];
    if (!user.dailyUsage || user.dailyUsage.date !== today) user.dailyUsage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    user.dailyUsage.codeFixes += 1;
    await user.save();
    const fileContent = (files || []).map(function(f) { return '--- ' + f.name + ' ---\n' + f.content; }).join('\n\n');
    const userPrompt = 'Fix these files:\n\n' + fileContent + '\n\nIssue: ' + (description || 'Fix all bugs and errors');
    const result = await callAI(FIX_PROMPT, userPrompt, model);
    var cleanHTML = extractHTML(result);
    var fixedFiles, preview;
    if (cleanHTML) {
      fixedFiles = [{ name: 'index.html', content: cleanHTML }];
      preview = cleanHTML;
    } else {
      fixedFiles = result ? parseFilesFromResponse(result) : [];
      preview = fixedFiles.length > 0 ? generatePreviewHTML(fixedFiles) : '';
    }
    if (!fixedFiles.length) {
      user.creditCoins(cost, 'code_fix', 'Refund: code fix failed');
      user.dailyUsage.codeFixes = Math.max(0, user.dailyUsage.codeFixes - 1);
      await user.save();
      return res.status(500).json({ error: 'Code fix failed. Coins refunded.' });
    }
    res.json({ files: fixedFiles, preview: preview, model: model, blSpent: cost, balanceRemaining: user.blCoins });
  } catch (err) {
    console.error('[Build] Fix error:', err);
    res.status(500).json({ error: 'Code fix failed' });
  }
});

// ══════════ POST /api/build/github-push ══════════
router.post('/github-push', auth, async (req, res) => {
  try {
    const user = req.user;
    if (!user.canPerformAction('githubPush')) return res.status(403).json({ error: 'Daily GitHub push limit reached' });
    if (user.role !== 'super-admin' && user.blCoins < BL_COSTS.githubPush) return res.status(402).json({ error: 'Insufficient BL coins' });
    const { files, repoName, message } = req.body;
    const token = user.githubToken;
    if (!token) return res.status(400).json({ error: 'Connect GitHub first in Settings' });
    user.spendCoins(BL_COSTS.githubPush, 'github_push', 'GitHub push');
    const today = new Date().toISOString().split('T')[0];
    if (!user.dailyUsage || user.dailyUsage.date !== today) user.dailyUsage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    user.dailyUsage.githubPushes += 1;
    await user.save();
    const ghUser = await axios.get('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + token } });
    const owner = ghUser.data.login;
    var repo;
    try {
      var r = await axios.get('https://api.github.com/repos/' + owner + '/' + repoName, { headers: { Authorization: 'Bearer ' + token } });
      repo = r.data;
    } catch (e) {
      var r2 = await axios.post('https://api.github.com/user/repos', { name: repoName, private: false, auto_init: true, description: 'Built with ZapCodes AI' }, { headers: { Authorization: 'Bearer ' + token } });
      repo = r2.data;
    }
    for (var i = 0; i < (files || []).length; i++) {
      var file = files[i];
      var content = Buffer.from(file.content).toString('base64');
      var path = file.name.startsWith('/') ? file.name.slice(1) : file.name;
      var sha;
      try { var existing = await axios.get('https://api.github.com/repos/' + owner + '/' + repoName + '/contents/' + path, { headers: { Authorization: 'Bearer ' + token } }); sha = existing.data.sha; } catch (e2) {}
      await axios.put('https://api.github.com/repos/' + owner + '/' + repoName + '/contents/' + path, { message: message || 'Deploy via ZapCodes', content: content, sha: sha }, { headers: { Authorization: 'Bearer ' + token } });
    }
    res.json({ success: true, repoUrl: repo.html_url, blSpent: BL_COSTS.githubPush, balanceRemaining: user.blCoins });
  } catch (err) {
    console.error('[Build] GitHub push error:', err);
    res.status(500).json({ error: 'GitHub push failed' });
  }
});

// ══════════ POST /api/build/pwa ══════════
router.post('/pwa', auth, async (req, res) => {
  try {
    const user = req.user;
    const config = user.getTierConfig();
    if (!config.canPWA) return res.status(403).json({ error: 'PWA requires Gold or Diamond plan', upgrade: true });
    if (user.role !== 'super-admin' && user.blCoins < BL_COSTS.pwaBuild) return res.status(402).json({ error: 'Insufficient BL coins' });
    const { subdomain, appName, themeColor } = req.body;
    const site = user.deployedSites.find(function(s) { return s.subdomain === subdomain; });
    if (!site) return res.status(404).json({ error: 'Site not found' });
    user.spendCoins(BL_COSTS.pwaBuild, 'pwa_build', 'PWA build for ' + subdomain);
    site.isPWA = true;
    await user.save();
    var manifest = { name: appName || site.title || subdomain, short_name: (appName || subdomain).slice(0, 12), start_url: '/', display: 'standalone', background_color: '#000000', theme_color: themeColor || '#6366f1', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] };
    var sw = "const CACHE='zapcodes-" + subdomain + "-v1';const ASSETS=['/','/index.html'];self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));";
    res.json({ manifest: manifest, serviceWorker: sw, blSpent: BL_COSTS.pwaBuild, balanceRemaining: user.blCoins });
  } catch (err) {
    console.error('[Build] PWA error:', err);
    res.status(500).json({ error: 'PWA build failed' });
  }
});

// ══════════ POST /api/build/remove-badge ══════════
router.post('/remove-badge', auth, async (req, res) => {
  try {
    const user = req.user;
    const config = user.getTierConfig();
    if (!config.canRemoveBadge) return res.status(403).json({ error: 'Badge removal requires Gold or Diamond plan', upgrade: true });
    if (user.role !== 'super-admin' && user.blCoins < BL_COSTS.badgeRemoval) return res.status(402).json({ error: 'Insufficient BL coins', required: BL_COSTS.badgeRemoval });
    const { subdomain } = req.body;
    const site = user.deployedSites.find(function(s) { return s.subdomain === subdomain; });
    if (!site) return res.status(404).json({ error: 'Site not found' });
    if (!site.hasBadge) return res.json({ message: 'Badge already removed' });
    user.spendCoins(BL_COSTS.badgeRemoval, 'badge_removal', 'Badge removal for ' + subdomain);
    site.hasBadge = false;
    await user.save();
    res.json({ success: true, subdomain: subdomain, hasBadge: false, blSpent: BL_COSTS.badgeRemoval, balanceRemaining: user.blCoins });
  } catch (err) {
    console.error('[Build] Badge removal error:', err);
    res.status(500).json({ error: 'Badge removal failed' });
  }
});

// ══════════ POST /api/build/clone-analyze ══════════
router.post('/clone-analyze', auth, async (req, res) => {
  try {
    const { url, code } = req.body;
    var content = code || '';
    if (url) {
      try {
        var r = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'ZapCodes-Analyzer/1.0' } });
        content = r.data;
      } catch (err2) {
        return res.status(400).json({ error: 'Could not fetch URL: ' + err2.message });
      }
    }
    if (!content) return res.status(400).json({ error: 'Provide a URL or code to analyze' });
    const analysis = await callAI(CLONE_PROMPT, content.slice(0, 30000), 'groq');
    var parsed;
    try { parsed = JSON.parse(analysis); } catch (e) { parsed = { title: 'Website', type: 'other', sections: [], colors: {}, layout: analysis }; }
    res.json({ analysis: parsed });
  } catch (err) {
    console.error('[Build] Clone analyze error:', err);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// ══════════ POST /api/build/clone-rebuild ══════════
router.post('/clone-rebuild', auth, async (req, res) => {
  try {
    const { analysis, modifications } = req.body;
    req.body.prompt = 'Rebuild this website based on the analysis:\n\n' + JSON.stringify(analysis) + '\n\nUser modifications:\n' + (modifications || 'Keep faithful to original');
    req.body.template = 'custom';
    return router.handle(Object.assign(req, { url: '/generate', method: 'POST' }), res);
  } catch (err) {
    res.status(500).json({ error: 'Clone rebuild failed' });
  }
});

// ══════════ GET /api/build/sites ══════════
router.get('/sites', auth, async (req, res) => {
  try {
    res.json({ sites: req.user.deployedSites || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get sites' });
  }
});

// ══════════ DELETE /api/build/site/:subdomain ══════════
router.delete('/site/:subdomain', auth, async (req, res) => {
  try {
    const user = req.user;
    const idx = user.deployedSites.findIndex(function(s) { return s.subdomain === req.params.subdomain; });
    if (idx === -1) return res.status(404).json({ error: 'Site not found' });
    user.deployedSites.splice(idx, 1);
    await user.save();
    res.json({ success: true, remaining: user.deployedSites.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete site' });
  }
});

// ══════════ GET /api/build/templates ══════════
router.get('/templates', function(req, res) {
  res.json({ templates: [
    { id: 'custom', name: 'Custom (AI Chat)', icon: '💬', desc: 'Describe anything' },
    { id: 'portfolio', name: 'Portfolio', icon: '👤', desc: 'Personal portfolio' },
    { id: 'landing', name: 'Landing Page', icon: '🚀', desc: 'Product landing' },
    { id: 'blog', name: 'Blog', icon: '📝', desc: 'Blog template' },
    { id: 'ecommerce', name: 'E-Commerce', icon: '🛒', desc: 'Online store' },
    { id: 'dashboard', name: 'Dashboard', icon: '📊', desc: 'Admin dashboard' },
    { id: 'webapp', name: 'Full-Stack App', icon: '⚡', desc: 'Frontend + backend' },
    { id: 'saas', name: 'SaaS', icon: '💎', desc: 'SaaS with auth' },
    { id: 'mobile', name: 'Mobile App', icon: '📱', desc: 'React Native app' },
  ]});
});

module.exports = router;
