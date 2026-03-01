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

RULES:
1. Output COMPLETE file contents — never use placeholders like "// rest of code here"
2. Use modern CSS (variables, flexbox/grid, animations, responsive)
3. Professional design with gradients, shadows, smooth transitions
4. Mobile-first responsive design
5. Dark mode support where appropriate
6. Include ALL sections the user describes
7. Format each file as: \`\`\`filepath:filename.ext\n(content)\n\`\`\`
8. Always include index.html, style.css, and script.js at minimum
9. Use semantic HTML5 elements
10. Include meta viewport tag for mobile`;

const FIX_PROMPT = `You are ZapCodes AI, an expert code debugger. Fix the provided code.

RULES:
1. Identify and fix ALL bugs, errors, and issues
2. Explain what was wrong and how you fixed it
3. Return the COMPLETE fixed files (not just snippets)
4. Format: \`\`\`filepath:filename.ext\n(content)\n\`\`\`
5. Maintain the original structure and style
6. Add error handling where missing`;

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

function generatePreviewHTML(files) {
  const html = files.find(f => f.name.endsWith('.html') || f.name === 'index.html');
  const css = files.find(f => f.name.endsWith('.css') || f.name === 'style.css');
  const js = files.find(f => f.name.endsWith('.js') && !f.name.includes('service-worker') || f.name === 'script.js');
  if (!html) return '<html><body><h1>No preview available</h1></body></html>';
  let content = html.content;
  if (css && !content.includes(css.content.slice(0, 50))) {
    content = content.replace('</head>', `<style>${css.content}</style></head>`);
  }
  if (js && !content.includes(js.content.slice(0, 50))) {
    content = content.replace('</body>', `<script>${js.content}</script></body>`);
  }
  return content;
}

const BADGE_SCRIPT = `<div id="zc-badge" style="position:fixed;bottom:10px;right:10px;z-index:99999;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:6px 14px;border-radius:20px;font-family:-apple-system,sans-serif;font-size:12px;font-weight:600;box-shadow:0 2px 10px rgba(99,102,241,.3);cursor:pointer;text-decoration:none;display:flex;align-items:center;gap:4px" onclick="window.open('https://zapcodes.net?ref=badge','_blank')">⚡ Made with ZapCodes</div>`;

// ══════════ GET /api/build/costs ══════════
router.get('/costs', (req, res) => {
  res.json({ costs: BL_COSTS });
});

// ══════════ POST /api/build/generate ══════════
router.post('/generate', auth, async (req, res) => {
  try {
    const user = req.user;
    const { prompt, template, projectName, description, colorScheme, features, model: requestedModel } = req.body;

    // Check daily cap
    if (!user.canPerformAction('generation')) {
      const config = user.getTierConfig();
      return res.status(403).json({ error: 'Daily generation limit reached', limit: config.dailyGenCap, used: user.dailyUsage?.generations || 0, upgrade: true });
    }

    // Determine model
    const model = getEffectiveModel(user, requestedModel);

    // Check character limit
    const config = user.getTierConfig();
    const inputText = prompt || description || '';
    if (config.maxChars !== Infinity && inputText.length > config.maxChars) {
      return res.status(400).json({ error: `Message too long. Your plan allows ${config.maxChars} characters.`, maxChars: config.maxChars, current: inputText.length });
    }

    // Check BL balance
    const cost = BL_COSTS.generation[model];
    if (user.role !== 'super-admin' && user.blCoins < cost) {
      return res.status(402).json({ error: 'Insufficient BL coins', required: cost, balance: user.blCoins, topup: true });
    }

    // Deduct coins
    user.spendCoins(cost, 'generation', `Website generation (${model})`, model);
    const today = new Date().toISOString().split('T')[0];
    if (!user.dailyUsage || user.dailyUsage.date !== today) user.dailyUsage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    user.dailyUsage.generations += 1;
    await user.save();

    // Generate
    let files;
    if (template && template !== 'custom') {
      files = await generateProjectMultiStep(template, projectName || 'My Project', description || prompt, colorScheme, features, model);
    } else {
      const userPrompt = `Create a website: ${prompt}\n\nProject name: ${projectName || 'My Website'}\nColor scheme: ${colorScheme || 'modern dark theme'}\n${features ? `Features: ${features.join(', ')}` : ''}`;
const result = await callAI(GEN_PROMPT, userPrompt, model);
      files = result ? parseFilesFromResponse(result) : [];
      // Fallback: if parser found nothing, extract raw code blocks
      if ((!files || files.length === 0) && result) {
        const htmlMatch = result.match(/```html\n([\s\S]*?)```/);
        const cssMatch = result.match(/```css\n([\s\S]*?)```/);
        const jsMatch = result.match(/```(?:javascript|js)\n([\s\S]*?)```/);
        if (htmlMatch) {
          files = [{ name: 'index.html', content: htmlMatch[1].trim() }];
          if (cssMatch) files.push({ name: 'style.css', content: cssMatch[1].trim() });
          if (jsMatch) files.push({ name: 'script.js', content: jsMatch[1].trim() });
        } else {
          const stripped = result.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
          if (stripped.includes('<') && stripped.includes('>')) {
            files = [{ name: 'index.html', content: stripped }];
          }
        }
      }
      // Fallback: if parser found nothing, extract raw code blocks
      if ((!files || files.length === 0) && result) {
        const htmlMatch = result.match(/```html\n([\s\S]*?)```/);
        const cssMatch = result.match(/```css\n([\s\S]*?)```/);
        const jsMatch = result.match(/```(?:javascript|js)\n([\s\S]*?)```/);
        if (htmlMatch) {
          files = [{ name: 'index.html', content: htmlMatch[1].trim() }];
          if (cssMatch) files.push({ name: 'style.css', content: cssMatch[1].trim() });
          if (jsMatch) files.push({ name: 'script.js', content: jsMatch[1].trim() });
        } else {
          // Last resort: treat entire response as HTML
          const stripped = result.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
          if (stripped.includes('<') && stripped.includes('>')) {
            files = [{ name: 'index.html', content: stripped }];
          }
        }
      }
    }

    if (!files || files.length === 0) {
      // Refund on failure
      user.creditCoins(cost, 'generation', `Refund: generation failed (${model})`);
      user.dailyUsage.generations = Math.max(0, user.dailyUsage.generations - 1);
      await user.save();
      return res.status(500).json({ error: 'AI generation failed. Coins refunded.' });
    }

    const preview = generatePreviewHTML(files);
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

    user.spendCoins(cost, 'generation', `Stream generation (${model})`, model);
    const today = new Date().toISOString().split('T')[0];
    if (!user.dailyUsage || user.dailyUsage.date !== today) user.dailyUsage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    user.dailyUsage.generations += 1;
    await user.save();

    // SSE headers
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });

    const fullText = await streamAI(GEN_PROMPT, `Create a website: ${prompt}`, model, res);
    if (fullText) {
      const files = parseFilesFromResponse(fullText);
      const preview = generatePreviewHTML(files);
      res.write(`data: ${JSON.stringify({ type: 'files', files, preview })}\n\n`);
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

    // Validate subdomain
    const sub = (subdomain || '').toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(sub)) {
      return res.status(400).json({ error: 'Subdomain must be 3-50 alphanumeric characters and hyphens' });
    }
    if (RESERVED.includes(sub)) return res.status(400).json({ error: 'This subdomain is reserved' });

    // Check site limit
    const existingSite = user.deployedSites.find(s => s.subdomain === sub);
    if (!existingSite && user.deployedSites.length >= config.maxSites) {
      return res.status(403).json({ error: `Site limit reached (${config.maxSites}). Upgrade for more.`, upgrade: true });
    }

    // Check subdomain availability (not owned by another user)
    if (!existingSite) {
      const taken = await User.findOne({ 'deployedSites.subdomain': sub, _id: { $ne: user._id } });
      if (taken) return res.status(409).json({ error: 'Subdomain already taken' });
    }

    // Inject badge (unless diamond or badge removed)
    let deployFiles = files;
    const isDiamond = user.plan === 'diamond';
    const hasBadge = !isDiamond;
    if (hasBadge && deployFiles) {
      deployFiles = deployFiles.map(f => {
        if (f.name === 'index.html' || f.name.endsWith('.html')) {
          return { ...f, content: f.content.replace('</body>', `${BADGE_SCRIPT}</body>`) };
        }
        return f;
      });
    }

    // TODO: Upload to Cloudflare R2
    // const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    // Upload each file to projects/{subdomain}/filename

    // Update deployedSites
    if (existingSite) {
      existingSite.title = title || existingSite.title;
      existingSite.lastUpdated = new Date();
      existingSite.hasBadge = hasBadge;
      existingSite.fileSize = JSON.stringify(files).length;
    } else {
      user.deployedSites.push({
        subdomain: sub, title: title || sub, hasBadge,
        fileSize: JSON.stringify(files).length,
      });
    }
    await user.save();

    res.json({
      url: `https://${sub}.zapcodes.net`,
      subdomain: sub,
      deployed: true,
      hasBadge,
      sites: user.deployedSites.length,
      maxSites: config.maxSites,
    });
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

    user.spendCoins(cost, 'code_fix', `Code fix (${model})`, model);
    const today = new Date().toISOString().split('T')[0];
    if (!user.dailyUsage || user.dailyUsage.date !== today) user.dailyUsage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    user.dailyUsage.codeFixes += 1;
    await user.save();

    const fileContent = (files || []).map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
    const userPrompt = `Fix these files:\n\n${fileContent}\n\nIssue: ${description || 'Fix all bugs and errors'}`;
    const result = await callAI(FIX_PROMPT, userPrompt, model);
    const fixedFiles = result ? parseFilesFromResponse(result) : [];

    if (!fixedFiles.length) {
      user.creditCoins(cost, 'code_fix', 'Refund: code fix failed');
      user.dailyUsage.codeFixes = Math.max(0, user.dailyUsage.codeFixes - 1);
      await user.save();
      return res.status(500).json({ error: 'Code fix failed. Coins refunded.' });
    }

    const preview = generatePreviewHTML(fixedFiles);
    res.json({ files: fixedFiles, preview, model, blSpent: cost, balanceRemaining: user.blCoins });
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

    // Get GitHub user
    const ghUser = await axios.get('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}` } });
    const owner = ghUser.data.login;

    // Create or get repo
    let repo;
    try {
      const r = await axios.get(`https://api.github.com/repos/${owner}/${repoName}`, { headers: { Authorization: `Bearer ${token}` } });
      repo = r.data;
    } catch {
      const r = await axios.post('https://api.github.com/user/repos', { name: repoName, private: false, auto_init: true, description: 'Built with ZapCodes AI ⚡' }, { headers: { Authorization: `Bearer ${token}` } });
      repo = r.data;
    }

    // Push files
    for (const file of (files || [])) {
      const content = Buffer.from(file.content).toString('base64');
      const path = file.name.startsWith('/') ? file.name.slice(1) : file.name;
      let sha;
      try { const existing = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, { headers: { Authorization: `Bearer ${token}` } }); sha = existing.data.sha; } catch {}
      await axios.put(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, { message: message || 'Deploy via ZapCodes ⚡', content, sha }, { headers: { Authorization: `Bearer ${token}` } });
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
    const site = user.deployedSites.find(s => s.subdomain === subdomain);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    user.spendCoins(BL_COSTS.pwaBuild, 'pwa_build', `PWA build for ${subdomain}`);
    site.isPWA = true;
    await user.save();

    const manifest = {
      name: appName || site.title || subdomain,
      short_name: (appName || subdomain).slice(0, 12),
      start_url: '/',
      display: 'standalone',
      background_color: '#000000',
      theme_color: themeColor || '#6366f1',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    };

    const sw = `const CACHE='zapcodes-${subdomain}-v1';const ASSETS=['/','/index.html','/style.css','/script.js'];self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));`;

    res.json({ manifest, serviceWorker: sw, blSpent: BL_COSTS.pwaBuild, balanceRemaining: user.blCoins });
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
    const site = user.deployedSites.find(s => s.subdomain === subdomain);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    if (!site.hasBadge) return res.json({ message: 'Badge already removed' });

    user.spendCoins(BL_COSTS.badgeRemoval, 'badge_removal', `Badge removal for ${subdomain}`);
    site.hasBadge = false;
    await user.save();

    res.json({ success: true, subdomain, hasBadge: false, blSpent: BL_COSTS.badgeRemoval, balanceRemaining: user.blCoins });
  } catch (err) {
    console.error('[Build] Badge removal error:', err);
    res.status(500).json({ error: 'Badge removal failed' });
  }
});

// ══════════ POST /api/build/clone-analyze ══════════
router.post('/clone-analyze', auth, async (req, res) => {
  try {
    const { url, code } = req.body;
    let content = code || '';
    if (url) {
      try {
        const r = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'ZapCodes-Analyzer/1.0' } });
        content = r.data;
      } catch (err) {
        return res.status(400).json({ error: `Could not fetch URL: ${err.message}` });
      }
    }
    if (!content) return res.status(400).json({ error: 'Provide a URL or code to analyze' });

    const analysis = await callAI(CLONE_PROMPT, content.slice(0, 30000), 'groq');
    let parsed;
    try { parsed = JSON.parse(analysis); } catch { parsed = { title: 'Website', type: 'other', sections: [], colors: {}, layout: analysis }; }

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
    const user = req.user;
    const combined = `Rebuild this website based on the analysis:\n\n${JSON.stringify(analysis)}\n\nUser modifications:\n${modifications || 'Keep faithful to original'}`;
    // Route through normal generation
    req.body.prompt = combined;
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
    const idx = user.deployedSites.findIndex(s => s.subdomain === req.params.subdomain);
    if (idx === -1) return res.status(404).json({ error: 'Site not found' });
    user.deployedSites.splice(idx, 1);
    await user.save();
    // TODO: Delete from R2
    res.json({ success: true, remaining: user.deployedSites.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete site' });
  }
});

// ══════════ GET /api/build/templates ══════════
router.get('/templates', (req, res) => {
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
