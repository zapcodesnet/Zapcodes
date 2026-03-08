const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { callAI, parseFilesFromResponse, generateProjectMultiStep, verifyAndFix } = require('../services/ai');
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

const RESERVED = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'cdn', 'dev', 'staging', 'test', 'blog', 'docs', 'status', 'support', 'help', 'zapcodes', 'blendlink'];

// ══════════ SYSTEM PROMPTS — structured XML-tagged for best Claude output ══════════
const GEN_PROMPT = `<role>
You are ZapCodes AI — an expert full-stack web developer that creates fully functional, production-ready, visually stunning websites. You never produce placeholder or truncated code.
</role>

<output_rules>
1. Output COMPLETE file contents — NEVER use placeholders like "// rest of code here", "...", "/* more styles */", "// similar to above", "// add more items". Every function, every style, every element must be fully written out.
2. Format each file as: \`\`\`filepath:filename.ext
(full file content)
\`\`\`
3. The index.html file MUST be a fully self-contained HTML document with ALL CSS in a <style> tag inside <head> and ALL JavaScript in a <script> tag before </body>. Do NOT reference external files like style.css or script.js.
4. The output MUST work immediately when opened in a browser with zero modifications needed.
5. Include as many relevant features and interactions as possible. Go beyond the basics to create a fully-featured implementation.
6. Minimum 500 lines of code for any website — do NOT cut short.
</output_rules>

<design_standards>
- Use modern CSS: CSS custom properties (variables), flexbox/grid, gradients, backdrop-filter, smooth transitions, hover effects, box-shadows, border-radius
- Mobile-first responsive design with proper media queries at 768px and 1024px breakpoints
- Professional typography with system font stack or Google Fonts via CDN link
- Cohesive color palette using CSS custom properties (--primary, --secondary, --bg, --text, etc.)
- Include scroll animations using Intersection Observer, smooth scroll behavior, and micro-interactions
- Dark theme by default with accent colors. Vary your design aesthetics — avoid defaulting to the same fonts/colors every time
- Semantic HTML5 elements: header, nav, main, section, article, footer
- Forms must have working validation with visual feedback (success/error states)
- Navigation must work with smooth scroll to sections and active link highlighting
- Images: Use https://picsum.photos/WIDTH/HEIGHT for placeholder images
</design_standards>

<quality_checklist>
Before outputting your code, verify internally:
- All functions are complete (no stubs, no empty bodies)
- All CSS classes/IDs referenced in HTML have corresponding styles
- All interactive elements have working JavaScript event handlers
- Page is fully responsive (hamburger menu on mobile, stacked layouts)
- No external file references (everything is inlined in one HTML file)
- All data arrays (products, posts, team members, etc.) have real content, not "..."
- Code is production-quality, not a demo or skeleton
</quality_checklist>`;

const FIX_PROMPT = `<role>
You are ZapCodes AI — an expert code debugger and web developer. You fix code to make it fully functional, visually complete, and production-ready.
</role>

<fix_rules>
1. Identify and fix ALL bugs, errors, broken functionality, and missing features.
2. Return COMPLETE fixed files — every file must be 100% complete, never use "..." or "// rest of code".
3. The index.html MUST be self-contained with ALL CSS inlined in <style> and ALL JS inlined in <script>.
4. Format: \`\`\`filepath:filename.ext
(complete content)
\`\`\`
5. Maintain the original design intent but fix all issues.
6. Add proper error handling, responsive design, and accessibility if missing.
7. Ensure all interactive elements (buttons, forms, modals, navigation) work correctly.
8. Fix any broken layouts, missing styles, non-functional JavaScript, or incomplete data.
9. Every function must be complete — no stubs or empty handlers.
10. Every CSS class used in HTML must have styles defined.
</fix_rules>`;

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

// #6: AI Model Selection — uses subscription_tier (matches BlendLink)
function getEffectiveModel(user, requestedModel) {
  if (user.role === 'super-admin') return requestedModel || 'haiku';
  const tier = user.subscription_tier;

  // Diamond: can use any model they request
  if (tier === 'diamond') {
    if (['groq', 'haiku', 'opus'].includes(requestedModel)) return requestedModel;
    return 'haiku'; // default for Diamond
  }
  // Gold: haiku + groq
  if (tier === 'gold') {
    if (requestedModel === 'groq') return 'groq';
    return 'haiku';
  }
  // Silver: haiku + groq
  if (tier === 'silver') {
    if (requestedModel === 'groq') return 'groq';
    return 'haiku';
  }
  // Bronze and Free: groq only
  return 'groq';
}

// Progress messages for real-time updates
const PROGRESS_STEPS = {
  validating: 'Validating your request and checking limits...',
  analyzing: 'Analyzing your prompt for project structure...',
  connecting: 'Connecting to AI model...',
  generating_html: 'Generating HTML structure and content...',
  generating_css: 'Creating styles, animations, and responsive design...',
  generating_js: 'Writing JavaScript for interactivity...',
  assembling: 'Assembling all components into final files...',
  optimizing: 'Optimizing code and checking for completeness...',
  preview: 'Building live preview...',
  done: 'Generation complete!',
};

// Active generation sessions (for interrupt/stop)
const activeSessions = new Map();

function generatePreviewHTML(files) {
  const html = files.find(f => f.name === 'index.html') || files.find(f => f.name.endsWith('.html'));
  const css = files.find(f => f.name === 'style.css') || files.find(f => f.name.endsWith('.css'));
  const js = files.find(f => f.name === 'script.js') || files.find(f => f.name.endsWith('.js') && !f.name.includes('service-worker'));

  if (!html) {
    const cssContent = css ? css.content : '';
    const jsContent = js ? js.content : '';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Preview</title><style>${cssContent}</style></head><body><h1>Preview</h1><p>No index.html generated.</p><script>${jsContent}</script></body></html>`;
  }

  let content = html.content;
  if (!content.includes('<!DOCTYPE') && !content.includes('<!doctype')) content = `<!DOCTYPE html>\n${content}`;
  if (css && css.content.trim()) {
    const cssSnippet = css.content.trim().substring(0, 60);
    if (!content.includes(cssSnippet)) {
      content = content.replace(/<link[^>]*rel=["']stylesheet["'][^>]*href=["'][^"']*style\.css["'][^>]*\/?>/gi, '');
      content = content.replace(/<link[^>]*href=["'][^"']*style\.css["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi, '');
      if (content.includes('</head>')) content = content.replace('</head>', `<style>\n${css.content}\n</style>\n</head>`);
      else if (content.includes('<body')) content = content.replace(/<body/i, `<style>\n${css.content}\n</style>\n<body`);
    }
  }
  if (js && js.content.trim()) {
    const jsSnippet = js.content.trim().substring(0, 60);
    if (!content.includes(jsSnippet)) {
      content = content.replace(/<script[^>]*src=["'][^"']*script\.js["'][^>]*><\/script>/gi, '');
      if (content.includes('</body>')) content = content.replace('</body>', `<script>\n${js.content}\n</script>\n</body>`);
      else content += `\n<script>\n${js.content}\n</script>`;
    }
  }
  if (!content.includes('viewport')) content = content.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  return content;
}

const BADGE_SCRIPT = `<div id="zc-badge" style="position:fixed;bottom:10px;right:10px;z-index:99999;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:6px 14px;border-radius:20px;font-family:-apple-system,sans-serif;font-size:12px;font-weight:600;box-shadow:0 2px 10px rgba(99,102,241,.3);cursor:pointer;text-decoration:none;display:flex;align-items:center;gap:4px" onclick="window.open('https://zapcodes.net?ref=badge','_blank')">⚡ Made with ZapCodes</div>`;

// FIX: Safe SSE write helper — logs errors instead of swallowing them silently
function safeSend(res, data) {
  try {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[SSE] Write failed (connection likely closed): ${err.message}`);
    return false;
  }
}

// ══════════ GET /api/build/costs ══════════
router.get('/costs', (req, res) => {
  res.json({ costs: BL_COSTS });
});

// ══════════ GET /api/build/available-models — #6 model selection ══════════
router.get('/available-models', auth, (req, res) => {
  const tier = req.user.subscription_tier;
  let models = [];
  if (tier === 'diamond') {
    models = [
      { id: 'opus', name: 'Claude Sonnet 4.6', desc: 'Most advanced — best quality (may take 2-4 min)', cost: BL_COSTS.generation.opus },
      { id: 'haiku', name: 'Claude Haiku 4.5', desc: 'Fast and capable', cost: BL_COSTS.generation.haiku },
      { id: 'groq', name: 'Groq AI', desc: 'Efficient and quick', cost: BL_COSTS.generation.groq },
    ];
  } else if (tier === 'gold' || tier === 'silver') {
    models = [
      { id: 'haiku', name: 'Claude Haiku 4.5', desc: 'Fast and capable', cost: BL_COSTS.generation.haiku },
      { id: 'groq', name: 'Groq AI', desc: 'Efficient and quick', cost: BL_COSTS.generation.groq },
    ];
  } else {
    models = [
      { id: 'groq', name: 'Groq AI', desc: 'Efficient and quick', cost: BL_COSTS.generation.groq },
    ];
  }
  res.json({ models, plan: tier, subscription_tier: tier });
});

// ══════════ POST /api/build/generate-with-progress — #2 real-time progress ══════════
router.post('/generate-with-progress', auth, async (req, res) => {
  const sessionId = `gen-${req.user._id}-${Date.now()}`;
  let keepaliveInterval = null;
  let connectionAlive = true;

  try {
    const user = req.user;
    const { prompt, template, projectName, description, colorScheme, features, model: requestedModel } = req.body;

    // SSE headers
    // FIX: Added X-Accel-Buffering and proper timeout headers for Render/nginx proxies
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    const sendProgress = (step, message, extra = {}) => {
      if (!connectionAlive) return;
      safeSend(res, { type: 'progress', step, message, ...extra });
    };

    // Track session for interrupt
    let aborted = false;
    activeSessions.set(sessionId, { abort: () => { aborted = true; } });

    // FIX: Track connection state properly
    res.on('close', () => {
      aborted = true;
      connectionAlive = false;
      if (keepaliveInterval) clearInterval(keepaliveInterval);
      activeSessions.delete(sessionId);
      console.log(`[SSE] Connection closed for session ${sessionId}`);
    });

    sendProgress('validating', PROGRESS_STEPS.validating);

    // Check daily cap
    if (!user.canPerformAction('generation')) {
      const config = user.getTierConfig();
      sendProgress('error', `Daily generation limit reached (${user.daily_usage?.generations || 0}/${config.dailyGenCap}). Upgrade for more.`);
      safeSend(res, { type: 'error', error: 'Daily generation limit reached', upgrade: true });
      return res.end();
    }

    const model = getEffectiveModel(user, requestedModel);
    const config = user.getTierConfig();
    const inputText = prompt || description || '';
    if (config.maxChars !== Infinity && inputText.length > config.maxChars) {
      sendProgress('error', `Message too long. Your plan allows ${config.maxChars} characters.`);
      safeSend(res, { type: 'error', error: 'Message too long' });
      return res.end();
    }

    const cost = BL_COSTS.generation[model];
    if (user.role !== 'super-admin' && user.bl_coins < cost) {
      sendProgress('error', `Insufficient BL coins. Need ${cost.toLocaleString()}, have ${user.bl_coins.toLocaleString()}.`);
      safeSend(res, { type: 'error', error: 'Insufficient BL coins', required: cost, balance: user.bl_coins });
      return res.end();
    }

    // Deduct coins
    user.spendCoins(cost, 'generation', `Website generation (${model})`, model);
    const today = new Date().toISOString().split('T')[0];
    if (!user.daily_usage || user.daily_usage.date !== today) {
      user.daily_usage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    }
    user.daily_usage.generations += 1;
    await user.save();

    sendProgress('analyzing', PROGRESS_STEPS.analyzing, { model, cost, sessionId });

    if (aborted) {
      user.creditCoins(cost, 'generation', `Refund: generation stopped by user`);
      user.daily_usage.generations = Math.max(0, user.daily_usage.generations - 1);
      await user.save();
      sendProgress('stopped', 'Generation stopped as per your request.');
      safeSend(res, { type: 'stopped' });
      return res.end();
    }

    // FIX: More informative model connection message with estimated time
    const modelLabel = model === 'opus' ? 'Claude Sonnet 4.6 (~2-4 min)' : model === 'haiku' ? 'Claude Haiku 4.5 (~1-2 min)' : 'Groq AI (~30s)';
    sendProgress('connecting', `${PROGRESS_STEPS.connecting} (${modelLabel})`);

    // FIX: More frequent keepalive — every 10s instead of 15s
    // Render's proxy timeout is 30s, so 10s keepalive ensures we stay under that
    keepaliveInterval = setInterval(() => {
      if (!connectionAlive) {
        clearInterval(keepaliveInterval);
        return;
      }
      try {
        if (!res.writableEnded && !res.destroyed) {
          res.write(`: keepalive\n\n`);
        } else {
          clearInterval(keepaliveInterval);
          connectionAlive = false;
        }
      } catch (err) {
        console.error(`[SSE] Keepalive failed: ${err.message}`);
        clearInterval(keepaliveInterval);
        connectionAlive = false;
      }
    }, 10000);

    // Generate with progress callbacks
    const aiOpts = {
      onProgress: (msg) => {
        if (!aborted && connectionAlive) sendProgress('generating', msg);
      },
    };

    let files;
    if (template && template !== 'custom') {
      sendProgress('generating_html', `Building ${template} project: "${projectName || 'My Project'}"...`);
      files = await generateProjectMultiStep(template, projectName || 'My Project', description || prompt, colorScheme, features, model, aiOpts);
    } else {
      sendProgress('generating_html', 'Generating website from your description...');
      const userPrompt = `Create a complete, production-ready website: ${prompt}\n\nProject name: ${projectName || 'My Website'}\nColor scheme: ${colorScheme || 'modern dark theme'}\n${features ? `Features: ${features.join(', ')}` : ''}\n\nIMPORTANT: index.html must be self-contained with ALL CSS inside <style> and ALL JS inside <script>. Include as many features as possible. Go beyond the basics.`;
      const result = await callAI(GEN_PROMPT, userPrompt, model, undefined, aiOpts);
      files = result ? parseFilesFromResponse(result) : [];

      // Self-correction pass for Claude models
      if (model === 'haiku' && files.length > 0 && !aborted) {
        sendProgress('optimizing', 'Verifying code completeness and fixing any issues...');
        files = await verifyAndFix(files, model, aiOpts);
      }
    }

    if (aborted || !connectionAlive) {
      if (keepaliveInterval) clearInterval(keepaliveInterval);
      user.creditCoins(cost, 'generation', `Refund: generation stopped by user`);
      user.daily_usage.generations = Math.max(0, user.daily_usage.generations - 1);
      await user.save();
      if (connectionAlive) {
        sendProgress('stopped', 'Generation stopped as per your request.');
        safeSend(res, { type: 'stopped' });
        res.end();
      }
      return;
    }

    if (!files || files.length === 0) {
      if (keepaliveInterval) clearInterval(keepaliveInterval);
      user.creditCoins(cost, 'generation', `Refund: generation failed (${model})`);
      user.daily_usage.generations = Math.max(0, user.daily_usage.generations - 1);
      await user.save();
      // FIX: More helpful error message telling user what happened
      const errorMsg = model !== 'groq'
        ? `AI generation produced no files using ${model === 'opus' ? 'Claude Sonnet 4.6' : 'Claude Haiku 4.5'}. This may be due to temporary API issues. Coins refunded. Try again or switch to a different model.`
        : 'AI generation produced no files. Coins refunded. Try a different prompt.';
      sendProgress('error', errorMsg);
      safeSend(res, { type: 'error', error: 'Generation failed. Coins refunded.', model, suggestion: 'Try a different model or simplify your prompt.' });
      return res.end();
    }

    sendProgress('preview', PROGRESS_STEPS.preview);
    const preview = generatePreviewHTML(files);

    sendProgress('done', `${PROGRESS_STEPS.done} ${files.length} file(s) generated using ${model === 'opus' ? 'Claude Sonnet 4.6' : model === 'haiku' ? 'Claude Haiku 4.5' : 'Groq AI'}.`);

    safeSend(res, {
      type: 'complete',
      files,
      preview,
      model,
      blSpent: cost,
      balanceRemaining: user.bl_coins,
      dailyUsage: user.daily_usage,
      fileCount: files.length,
    });

    if (keepaliveInterval) clearInterval(keepaliveInterval);
    res.end();
    activeSessions.delete(sessionId);
  } catch (err) {
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    console.error('[Build] Generate-with-progress error:', err.message);
    // FIX: Log full error stack in non-production for debugging
    if (process.env.NODE_ENV !== 'production') console.error(err.stack);

    if (connectionAlive) {
      try {
        if (err.message === 'Generation cancelled') {
          safeSend(res, { type: 'stopped', message: 'Generation stopped.' });
        } else {
          // FIX: Include actionable error details
          safeSend(res, {
            type: 'error',
            error: err.message || 'Generation failed',
            details: err.response?.data?.error?.message || undefined,
            suggestion: 'If this keeps happening, try using Groq AI or contact support.',
          });
        }
        res.end();
      } catch (writeErr) {
        console.error(`[SSE] Failed to send error response: ${writeErr.message}`);
      }
    }
    activeSessions.delete(sessionId);
  }
});

// ══════════ POST /api/build/stop — #2 interrupt generation ══════════
router.post('/stop', auth, (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && activeSessions.has(sessionId)) {
    activeSessions.get(sessionId).abort();
    activeSessions.delete(sessionId);
    return res.json({ stopped: true, message: 'Generation stopped as per your request.' });
  }
  for (const [id, session] of activeSessions) {
    if (id.includes(req.user._id.toString())) {
      session.abort();
      activeSessions.delete(id);
      return res.json({ stopped: true, message: 'Generation stopped.' });
    }
  }
  res.json({ stopped: false, message: 'No active generation found.' });
});

// ══════════ POST /api/build/generate (original — kept for compatibility) ══════════
router.post('/generate', auth, async (req, res) => {
  try {
    const user = req.user;
    const { prompt, template, projectName, description, colorScheme, features, model: requestedModel } = req.body;

    if (!user.canPerformAction('generation')) {
      const config = user.getTierConfig();
      return res.status(403).json({ error: 'Daily generation limit reached', limit: config.dailyGenCap, used: user.daily_usage?.generations || 0, upgrade: true });
    }

    const model = getEffectiveModel(user, requestedModel);
    const config = user.getTierConfig();
    const inputText = prompt || description || '';
    if (config.maxChars !== Infinity && inputText.length > config.maxChars) {
      return res.status(400).json({ error: `Message too long. Your plan allows ${config.maxChars} characters.`, maxChars: config.maxChars, current: inputText.length });
    }

    const cost = BL_COSTS.generation[model];
    if (user.role !== 'super-admin' && user.bl_coins < cost) {
      return res.status(402).json({ error: 'Insufficient BL coins', required: cost, balance: user.bl_coins, topup: true });
    }

    user.spendCoins(cost, 'generation', `Website generation (${model})`, model);
    const today = new Date().toISOString().split('T')[0];
    if (!user.daily_usage || user.daily_usage.date !== today) {
      user.daily_usage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    }
    user.daily_usage.generations += 1;
    await user.save();

    let files;
    if (template && template !== 'custom') {
      files = await generateProjectMultiStep(template, projectName || 'My Project', description || prompt, colorScheme, features, model);
    } else {
      const userPrompt = `Create a complete, production-ready website with this description: ${prompt}\n\nProject name: ${projectName || 'My Website'}\nColor scheme: ${colorScheme || 'modern dark theme with purple/indigo accents'}\n${features ? `Features: ${features.join(', ')}` : ''}\n\nIMPORTANT: The index.html file MUST be completely self-contained with ALL CSS inside a <style> tag in <head> and ALL JavaScript inside a <script> tag before </body>. Include as many features as possible. Go beyond the basics.`;
      const result = await callAI(GEN_PROMPT, userPrompt, model);
      files = result ? parseFilesFromResponse(result) : [];

      if (model === 'haiku' && files.length > 0) {
        files = await verifyAndFix(files, model);
      }
    }

    if (!files || files.length === 0) {
      user.creditCoins(cost, 'generation', `Refund: generation failed (${model})`);
      user.daily_usage.generations = Math.max(0, user.daily_usage.generations - 1);
      await user.save();
      return res.status(500).json({ error: 'AI generation failed. Coins refunded.', model, suggestion: 'Try a different model or prompt.' });
    }

    const preview = generatePreviewHTML(files);
    res.json({ files, preview, model, blSpent: cost, balanceRemaining: user.bl_coins, dailyUsage: user.daily_usage, fileCount: files.length });
  } catch (err) {
    console.error('[Build] Generate error:', err.message);
    res.status(500).json({ error: err.message || 'Generation failed' });
  }
});

// ══════════ #3: POST /api/build/save-project ══════════
router.post('/save-project', auth, async (req, res) => {
  try {
    const user = req.user;
    const { projectId, name, files, preview, template, description } = req.body;
    if (!files || !files.length) return res.status(400).json({ error: 'No files to save' });

    if (projectId) {
      const idx = (user.saved_projects || []).findIndex(p => p.projectId === projectId);
      if (idx >= 0) {
        user.saved_projects[idx].name = name || user.saved_projects[idx].name;
        user.saved_projects[idx].files = files;
        user.saved_projects[idx].preview = (preview || '').slice(0, 500000);
        user.saved_projects[idx].updatedAt = new Date();
        user.saved_projects[idx].version = (user.saved_projects[idx].version || 1) + 1;
        user.saved_projects[idx].description = description || user.saved_projects[idx].description;
      } else {
        return res.status(404).json({ error: 'Project not found' });
      }
    } else {
      const newId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!user.saved_projects) user.saved_projects = [];
      user.saved_projects.push({
        projectId: newId,
        name: name || 'Untitled Project',
        files: files,
        preview: (preview || '').slice(0, 500000),
        template: template || 'custom',
        description: description || '',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    await user.save();
    const proj = projectId
      ? user.saved_projects.find(p => p.projectId === projectId)
      : user.saved_projects[user.saved_projects.length - 1];
    res.json({
      project: {
        projectId: proj.projectId,
        name: proj.name,
        version: proj.version,
        fileCount: proj.files.length,
        updatedAt: proj.updatedAt,
      },
      message: 'Project saved!',
    });
  } catch (err) {
    console.error('[Build] Save project error:', err);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

// ══════════ #3: GET /api/build/projects ══════════
router.get('/projects', auth, (req, res) => {
  const projects = (req.user.saved_projects || []).map(p => ({
    projectId: p.projectId,
    name: p.name,
    template: p.template,
    description: p.description,
    fileCount: (p.files || []).length,
    version: p.version || 1,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
  res.json({ projects: projects.reverse() });
});

// ══════════ #3: GET /api/build/project/:projectId ══════════
router.get('/project/:projectId', auth, (req, res) => {
  const proj = (req.user.saved_projects || []).find(p => p.projectId === req.params.projectId);
  if (!proj) return res.status(404).json({ error: 'Project not found' });
  res.json({ project: proj });
});

// ══════════ #3: DELETE /api/build/project/:projectId ══════════
router.delete('/project/:projectId', auth, async (req, res) => {
  try {
    const user = req.user;
    const idx = (user.saved_projects || []).findIndex(p => p.projectId === req.params.projectId);
    if (idx === -1) return res.status(404).json({ error: 'Project not found' });
    user.saved_projects.splice(idx, 1);
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ══════════ POST /api/build/deploy ══════════
router.post('/deploy', auth, async (req, res) => {
  try {
    const user = req.user;
    const { subdomain, files, title } = req.body;
    const config = user.getTierConfig();
    const sub = (subdomain || '').toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(sub)) return res.status(400).json({ error: 'Subdomain must be 3-50 alphanumeric characters and hyphens' });
    if (RESERVED.includes(sub)) return res.status(400).json({ error: 'This subdomain is reserved' });
    const existingSite = user.deployed_sites.find(s => s.subdomain === sub);
    if (!existingSite && user.deployed_sites.length >= config.maxSites) return res.status(403).json({ error: `Site limit reached (${config.maxSites}). Upgrade for more.`, upgrade: true });
    if (!existingSite) {
      const taken = await User.findOne({ 'deployed_sites.subdomain': sub, _id: { $ne: user._id } });
      if (taken) return res.status(409).json({ error: 'Subdomain already taken' });
    }
    let deployFiles = files;
    const shouldInjectBadge = !config.canRemoveBadge;
    if (shouldInjectBadge && deployFiles) {
      deployFiles = deployFiles.map(f => {
        if (f.name === 'index.html' || f.name.endsWith('.html')) {
          return { ...f, content: f.content.replace('</body>', `${BADGE_SCRIPT}</body>`) };
        }
        return f;
      });
    }
    if (existingSite) {
      existingSite.title = title || existingSite.title;
      existingSite.files = deployFiles;
      existingSite.lastUpdated = new Date();
      existingSite.hasBadge = shouldInjectBadge;
      existingSite.fileSize = JSON.stringify(files).length;
    } else {
      user.deployed_sites.push({
        subdomain: sub,
        title: title || sub,
        files: deployFiles,
        hasBadge: shouldInjectBadge,
        fileSize: JSON.stringify(files).length,
      });
    }
    await user.save();
    res.json({
      url: `https://${sub}.zapcodes.net`,
      subdomain: sub,
      deployed: true,
      hasBadge: shouldInjectBadge,
      sites: user.deployed_sites.length,
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
    if (!user.canPerformAction('codeFix')) return res.status(403).json({ error: 'Daily code fix limit reached', upgrade: true });
    const model = getEffectiveModel(user, requestedModel);
    const cost = BL_COSTS.codeFix[model];
    if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient BL coins', required: cost, balance: user.bl_coins });
    user.spendCoins(cost, 'code_fix', `Code fix (${model})`, model);
    const today = new Date().toISOString().split('T')[0];
    if (!user.daily_usage || user.daily_usage.date !== today) {
      user.daily_usage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    }
    user.daily_usage.codeFixes += 1;
    await user.save();
    const fileContent = (files || []).map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
    const userPrompt = `Fix these files:\n\n${fileContent}\n\nIssue: ${description || 'Fix all bugs and errors'}`;
    const result = await callAI(FIX_PROMPT, userPrompt, model);
    const fixedFiles = result ? parseFilesFromResponse(result) : [];
    if (!fixedFiles.length) {
      user.creditCoins(cost, 'code_fix', 'Refund: code fix failed');
      user.daily_usage.codeFixes = Math.max(0, user.daily_usage.codeFixes - 1);
      await user.save();
      return res.status(500).json({ error: 'Code fix failed. Coins refunded.' });
    }
    const preview = generatePreviewHTML(fixedFiles);
    res.json({ files: fixedFiles, preview, model, blSpent: cost, balanceRemaining: user.bl_coins });
  } catch (err) {
    console.error('[Build] Fix error:', err);
    res.status(500).json({ error: 'Code fix failed' });
  }
});

// ══════════ GitHub push, PWA, badge removal, clone, sites ══════════
router.post('/github-push', auth, async (req, res) => {
  try {
    const user = req.user;
    if (!user.canPerformAction('githubPush')) return res.status(403).json({ error: 'Daily GitHub push limit reached' });
    if (user.role !== 'super-admin' && user.bl_coins < BL_COSTS.githubPush) return res.status(402).json({ error: 'Insufficient BL coins' });
    const { files, repoName, message } = req.body;
    const token = user.githubToken;
    if (!token) return res.status(400).json({ error: 'Connect GitHub first in Settings' });
    user.spendCoins(BL_COSTS.githubPush, 'github_push', 'GitHub push');
    const today = new Date().toISOString().split('T')[0];
    if (!user.daily_usage || user.daily_usage.date !== today) {
      user.daily_usage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    }
    user.daily_usage.githubPushes += 1;
    await user.save();
    const ghUser = await axios.get('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}` } });
    const owner = ghUser.data.login;
    let repo;
    try {
      const r = await axios.get(`https://api.github.com/repos/${owner}/${repoName}`, { headers: { Authorization: `Bearer ${token}` } });
      repo = r.data;
    } catch {
      const r = await axios.post('https://api.github.com/user/repos', {
        name: repoName,
        private: false,
        auto_init: true,
        description: 'Built with ZapCodes AI',
      }, { headers: { Authorization: `Bearer ${token}` } });
      repo = r.data;
    }
    for (const file of (files || [])) {
      const content = Buffer.from(file.content).toString('base64');
      const path = file.name.startsWith('/') ? file.name.slice(1) : file.name;
      let sha;
      try {
        const existing = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, { headers: { Authorization: `Bearer ${token}` } });
        sha = existing.data.sha;
      } catch {}
      await axios.put(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, {
        message: message || 'Deploy via ZapCodes',
        content,
        sha,
      }, { headers: { Authorization: `Bearer ${token}` } });
    }
    res.json({ success: true, repoUrl: repo.html_url, blSpent: BL_COSTS.githubPush, balanceRemaining: user.bl_coins });
  } catch (err) {
    console.error('[Build] GitHub push error:', err);
    res.status(500).json({ error: 'GitHub push failed' });
  }
});

router.post('/pwa', auth, async (req, res) => {
  try {
    const user = req.user;
    const config = user.getTierConfig();
    if (!config.canPWA) return res.status(403).json({ error: 'PWA requires Gold or Diamond plan', upgrade: true });
    if (user.role !== 'super-admin' && user.bl_coins < BL_COSTS.pwaBuild) return res.status(402).json({ error: 'Insufficient BL coins' });
    const { subdomain, appName, themeColor } = req.body;
    const site = user.deployed_sites.find(s => s.subdomain === subdomain);
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
    const sw = `const CACHE='zapcodes-${subdomain}-v1';const ASSETS=['/','/index.html'];self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));`;
    res.json({ manifest, serviceWorker: sw, blSpent: BL_COSTS.pwaBuild, balanceRemaining: user.bl_coins });
  } catch (err) {
    res.status(500).json({ error: 'PWA build failed' });
  }
});

router.post('/remove-badge', auth, async (req, res) => {
  try {
    const user = req.user;
    const config = user.getTierConfig();
    if (!config.canRemoveBadge) return res.status(403).json({ error: 'Badge removal requires Gold or Diamond', upgrade: true });
    if (user.role !== 'super-admin' && user.bl_coins < BL_COSTS.badgeRemoval) return res.status(402).json({ error: 'Insufficient BL coins' });
    const { subdomain } = req.body;
    const site = user.deployed_sites.find(s => s.subdomain === subdomain);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    if (!site.hasBadge) return res.json({ message: 'Badge already removed' });
    user.spendCoins(BL_COSTS.badgeRemoval, 'badge_removal', `Badge removal for ${subdomain}`);
    site.hasBadge = false;
    await user.save();
    res.json({ success: true, subdomain, hasBadge: false, blSpent: BL_COSTS.badgeRemoval, balanceRemaining: user.bl_coins });
  } catch (err) {
    res.status(500).json({ error: 'Badge removal failed' });
  }
});

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
    try {
      parsed = JSON.parse(analysis);
    } catch {
      parsed = { title: 'Website', type: 'other', sections: [], colors: {}, layout: analysis };
    }
    res.json({ analysis: parsed });
  } catch (err) {
    res.status(500).json({ error: 'Analysis failed' });
  }
});

router.post('/clone-rebuild', auth, async (req, res) => {
  try {
    const { analysis, modifications } = req.body;
    const prompt = `Rebuild this website based on the analysis:\n\n${JSON.stringify(analysis)}\n\nUser modifications:\n${modifications || 'Keep faithful to original'}`;
    const user = req.user;
    const model = getEffectiveModel(user, req.body.model);
    const cost = BL_COSTS.generation[model];

    if (!user.canPerformAction('generation')) return res.status(403).json({ error: 'Daily generation limit reached', upgrade: true });
    if (user.role !== 'super-admin' && user.bl_coins < cost) return res.status(402).json({ error: 'Insufficient BL coins', required: cost, balance: user.bl_coins });

    user.spendCoins(cost, 'generation', `Clone rebuild (${model})`, model);
    const today = new Date().toISOString().split('T')[0];
    if (!user.daily_usage || user.daily_usage.date !== today) {
      user.daily_usage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    }
    user.daily_usage.generations += 1;
    await user.save();

    const result = await callAI(GEN_PROMPT, prompt, model);
    let files = result ? parseFilesFromResponse(result) : [];
    if (model !== 'groq' && files.length > 0) files = await verifyAndFix(files, model);

    if (!files || files.length === 0) {
      user.creditCoins(cost, 'generation', `Refund: clone rebuild failed (${model})`);
      user.daily_usage.generations = Math.max(0, user.daily_usage.generations - 1);
      await user.save();
      return res.status(500).json({ error: 'AI generation failed. Coins refunded.' });
    }
    const preview = generatePreviewHTML(files);
    res.json({ files, preview, model, blSpent: cost, balanceRemaining: user.bl_coins, dailyUsage: user.daily_usage, fileCount: files.length });
  } catch (err) {
    res.status(500).json({ error: 'Clone rebuild failed' });
  }
});

router.get('/sites', auth, async (req, res) => {
  try {
    res.json({ sites: req.user.deployed_sites || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.delete('/site/:subdomain', auth, async (req, res) => {
  try {
    const user = req.user;
    const idx = user.deployed_sites.findIndex(s => s.subdomain === req.params.subdomain);
    if (idx === -1) return res.status(404).json({ error: 'Site not found' });
    user.deployed_sites.splice(idx, 1);
    await user.save();
    res.json({ success: true, remaining: user.deployed_sites.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

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

// ══════════ PUBLIC: Serve deployed site by subdomain ══════════
router.get('/site-content/:subdomain', async (req, res) => {
  try {
    const sub = req.params.subdomain.toLowerCase().trim();
    const user = await User.findOne({ 'deployed_sites.subdomain': sub });
    if (!user) return res.status(404).json({ error: 'Site not found' });
    const site = user.deployed_sites.find(s => s.subdomain === sub);
    if (!site || !site.files?.length) return res.status(404).json({ error: 'Site not found or has no content' });
    const indexFile = site.files.find(f => f.name === 'index.html' || f.name.endsWith('.html'));
    if (req.query.raw && indexFile) {
      res.setHeader('Content-Type', 'text/html');
      return res.send(indexFile.content);
    }
    res.json({ subdomain: sub, title: site.title, files: site.files, hasBadge: site.hasBadge });
  } catch (err) {
    console.error('[Build] Site content error:', err);
    res.status(500).json({ error: 'Failed to load site' });
  }
});

// ══════════ PUBLIC: Serve raw HTML for iframe embedding ══════════
router.get('/site-preview/:subdomain', async (req, res) => {
  try {
    const sub = req.params.subdomain.toLowerCase().trim();
    const user = await User.findOne({ 'deployed_sites.subdomain': sub });
    if (!user) return res.status(404).send('<h1>Site not found</h1>');
    const site = user.deployed_sites.find(s => s.subdomain === sub);
    if (!site || !site.files?.length) return res.status(404).send('<h1>Site not found</h1>');
    const indexFile = site.files.find(f => f.name === 'index.html') || site.files.find(f => f.name.endsWith('.html'));
    if (!indexFile) return res.status(404).send('<h1>No HTML file found</h1>');
    res.setHeader('Content-Type', 'text/html');
    res.send(indexFile.content);
  } catch (err) {
    res.status(500).send('<h1>Error loading site</h1>');
  }
});

module.exports = router;
