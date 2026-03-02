const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ================================================================
// MODEL CONFIGS — Opus max output raised to 64k for full websites
// ================================================================
const MODELS = {
  groq:  { models: ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'deepseek-r1-distill-llama-70b', 'mixtral-8x7b-32768'], maxOutput: 8192, contextLimit: 30000 },
  haiku: { model: 'claude-haiku-4-5-20251001', maxOutput: 16384, contextLimit: 180000 },
  opus:  { model: 'claude-opus-4-6', maxOutput: 64000, contextLimit: 200000 },
};

const CLAUDE_MODEL = MODELS.opus.model;
const CLAUDE_MAX_OUTPUT = 16384;
const CLAUDE_LARGE_OUTPUT = 64000;
const GROQ_MAX_OUTPUT = MODELS.groq.maxOutput;
const GROQ_MODELS = MODELS.groq.models;

// ================================================================
// RETRY HELPER — exponential backoff with jitter
// ================================================================
async function withRetry(fn, { maxRetries = 2, baseDelay = 1000, onRetry } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (err.message === 'Generation cancelled') throw err;
      const status = err.response?.status;
      if (status && status !== 429 && status !== 503 && status !== 529 && status < 500) throw err;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        if (onRetry) onRetry(attempt + 1, maxRetries, delay);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ================================================================
// Extract text from Claude response — handles thinking blocks.
// When thinking is enabled, response.content contains both
// { type: 'thinking' } and { type: 'text' } blocks.
// We only want the text blocks concatenated.
// ================================================================
function extractClaudeText(data) {
  if (!data?.content) return '';
  const textBlocks = data.content.filter(b => b.type === 'text');
  return textBlocks.map(b => b.text).join('\n') || '';
}

// ================================================================
// Normalize system prompt to plain string (for Groq compatibility)
// ================================================================
function systemPromptToString(systemPrompt) {
  if (typeof systemPrompt === 'string') return systemPrompt;
  if (Array.isArray(systemPrompt)) return systemPrompt.map(b => b.text || '').join('\n');
  return String(systemPrompt);
}

// ================================================================
// UNIFIED: callAI — opts: { onProgress, signal }
// ================================================================
async function callAI(systemPrompt, userPrompt, model = 'groq', maxTokens, opts = {}) {
  if (opts.signal?.aborted) throw new Error('Generation cancelled');
  switch (model) {
    case 'haiku': return callClaude(systemPrompt, userPrompt, {
      model: MODELS.haiku.model,
      maxTokens: maxTokens || MODELS.haiku.maxOutput,
      onProgress: opts.onProgress, signal: opts.signal,
    });
    case 'opus': return callClaude(systemPrompt, userPrompt, {
      model: MODELS.opus.model,
      maxTokens: maxTokens || MODELS.opus.maxOutput,
      useThinking: true,
      onProgress: opts.onProgress, signal: opts.signal,
    });
    case 'groq': default: return callGroq(systemPrompt, userPrompt, {
      maxTokens: maxTokens || MODELS.groq.maxOutput,
      onProgress: opts.onProgress, signal: opts.signal,
    });
  }
}

// ================================================================
// Call Claude (Haiku or Opus) — prompt caching + adaptive thinking
// ================================================================
async function callClaude(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[Claude] No ANTHROPIC_API_KEY — fallback to Groq');
    return callGroq(systemPrompt, userPrompt, options);
  }

  const modelId = options.model || CLAUDE_MODEL;
  const maxTokens = options.maxTokens || CLAUDE_LARGE_OUTPUT;
  const isOpus = modelId.includes('opus');
  const label = isOpus ? 'Opus 4.6' : 'Haiku 4.5';
  const onProgress = options.onProgress;
  const signal = options.signal;
  const useThinking = options.useThinking && isOpus;
  const timeout = isOpus ? 240000 : (options.timeout || 180000);

  try {
    const result = await withRetry(async (attempt) => {
      if (signal?.aborted) throw new Error('Generation cancelled');
      if (attempt > 0 && onProgress) onProgress(`Retrying ${label} (attempt ${attempt + 1})...`);
      console.log(`[Claude] ${label} (max_tokens=${maxTokens}, thinking=${useThinking})${attempt > 0 ? ' retry #' + attempt : ''}`);

      const sysText = systemPromptToString(systemPrompt);
      const body = {
        model: modelId,
        max_tokens: maxTokens,
        // Prompt caching: cache_control gives ~90% cost savings on repeated system prompts
        system: [{
          type: 'text',
          text: sysText,
          cache_control: { type: 'ephemeral' },
        }],
        messages: [{
          role: 'user',
          content: userPrompt.slice(0, MODELS.opus.contextLimit),
        }],
      };

      // Adaptive thinking for Opus 4.6
      if (useThinking) {
        body.thinking = {
          type: 'enabled',
          budget_tokens: Math.min(16000, maxTokens - 1024),
        };
      }

      const r = await axios.post(ANTHROPIC_API_URL, body, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout,
      });

      const c = extractClaudeText(r.data);
      if (c) {
        const thinkingUsed = r.data.content?.some(b => b.type === 'thinking');
        console.log(`[Claude] ✓ ${label} (${c.length} chars${thinkingUsed ? ', used thinking' : ''})`);
        return c;
      }
      throw new Error('Empty response from Claude');
    }, {
      maxRetries: 2,
      onRetry: (attempt, max, delay) => {
        console.log(`[Claude] Retry ${attempt}/${max} in ${Math.round(delay)}ms`);
      },
    });
    return result;
  } catch (err) {
    if (err.message === 'Generation cancelled') throw err;
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`[Claude] ✗ ${modelId} (${status || 'network'}): ${msg}`);
    if (onProgress) onProgress(`${label} unavailable — switching to Groq...`);
    console.log(`[Claude] ${label} failed → Groq fallback`);
    return callGroq(systemPrompt, userPrompt, options);
  }
}

// ================================================================
// Call Claude with images
// ================================================================
async function callClaudeWithImages(systemPrompt, userPrompt, images = [], options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const blocks = images.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType || 'image/png', data: img.base64 },
    }));
    blocks.push({ type: 'text', text: userPrompt });

    const r = await axios.post(ANTHROPIC_API_URL, {
      model: options.model || CLAUDE_MODEL,
      max_tokens: options.maxTokens || CLAUDE_MAX_OUTPUT,
      system: [{
        type: 'text',
        text: systemPromptToString(systemPrompt),
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{ role: 'user', content: blocks }],
    }, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      timeout: 120000,
    });
    return extractClaudeText(r.data);
  } catch (err) {
    console.error(`[Claude+Image] ✗ ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
}

// ================================================================
// Call Groq (fallback chain) — with retry per model & progress
// ================================================================
async function callGroq(systemPrompt, userPrompt, options = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const maxTokens = options.maxTokens || GROQ_MAX_OUTPUT;
  const onProgress = options.onProgress;
  const signal = options.signal;
  const sysText = systemPromptToString(systemPrompt);

  for (const model of GROQ_MODELS) {
    try {
      if (signal?.aborted) throw new Error('Generation cancelled');
      console.log(`[GROQ] → ${model}`);

      const result = await withRetry(async (attempt) => {
        if (signal?.aborted) throw new Error('Generation cancelled');
        if (attempt > 0 && onProgress) onProgress(`Retrying Groq (attempt ${attempt + 1})...`);

        const r = await axios.post(GROQ_API_URL, {
          model,
          messages: [
            { role: 'system', content: sysText },
            { role: 'user', content: userPrompt.slice(0, MODELS.groq.contextLimit) },
          ],
          temperature: 0.2,
          max_tokens: maxTokens,
        }, {
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          timeout: 90000,
        });
        const c = r.data.choices?.[0]?.message?.content;
        if (c) { console.log(`[GROQ] ✓ ${model} (${c.length} chars)`); return c; }
        throw new Error('Empty Groq response');
      }, { maxRetries: 1 });

      return result;
    } catch (err) {
      if (err.message === 'Generation cancelled') throw err;
      const s = err.response?.status;
      console.error(`[GROQ] ✗ ${model} (${s || 'network'})`);
      if (s === 401) break;
      if (s === 429) { if (onProgress) onProgress('Groq rate limited — trying next model...'); continue; }
    }
  }
  return null;
}

// ================================================================
// SSE Streaming for live preview — with prompt caching
// ================================================================
async function streamAI(systemPrompt, userPrompt, model, res) {
  if (model === 'groq') {
    const result = await callGroq(systemPrompt, userPrompt);
    if (result) res.write(`data: ${JSON.stringify({ type: 'content', text: result })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    return result;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return streamAI(systemPrompt, userPrompt, 'groq', res);

  const modelId = model === 'haiku' ? MODELS.haiku.model : MODELS.opus.model;
  const maxTokens = model === 'haiku' ? MODELS.haiku.maxOutput : MODELS.opus.maxOutput;
  try {
    const response = await axios.post(ANTHROPIC_API_URL, {
      model: modelId,
      max_tokens: maxTokens,
      stream: true,
      system: [{
        type: 'text',
        text: systemPromptToString(systemPrompt),
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{ role: 'user', content: userPrompt }],
    }, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      responseType: 'stream',
      timeout: model === 'opus' ? 240000 : 180000,
    });

    let fullText = '';
    return new Promise((resolve, reject) => {
      let buffer = '';
      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.type === 'content_block_delta' && p.delta?.text) {
              fullText += p.delta.text;
              res.write(`data: ${JSON.stringify({ type: 'content', text: p.delta.text })}\n\n`);
            }
          } catch {}
        }
      });
      response.data.on('end', () => {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        resolve(fullText);
      });
      response.data.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
        reject(err);
      });
    });
  } catch (err) {
    console.error(`[Stream] Failed: ${err.message}`);
    return streamAI(systemPrompt, userPrompt, 'groq', res);
  }
}

// ================================================================
// Code Analysis
// ================================================================
async function analyzeCode(files, engine = 'groq') {
  const filesSummary = files.slice(0, 20).map(f => `--- ${f.path || f.name} ---\n${(f.content || '').slice(0, 4000)}`).join('\n\n');
  const sys = 'You are ZapCodes AI code analyzer. Return ONLY valid JSON array of issues: [{"type":"crash|memory_leak|anr|warning|error|security|performance","severity":"critical|high|medium|low","title":"...","description":"...","file":"...","line":N,"code":"...","fixedCode":"...","explanation":"...","impact":"...","logs":"..."}]. Return 3-8 issues.';
  const result = await callAI(sys, `Analyze:\n\n${filesSummary}`, engine);
  if (result) {
    const m = result.match(/\[[\s\S]*\]/);
    if (m) try { return JSON.parse(m[0]); } catch {}
  }
  return [{ type: 'crash', severity: 'critical', title: 'Null pointer', description: 'Unhandled null', file: (files[0] || {}).path || 'unknown', line: 10, code: '', fixedCode: '// Fixed', explanation: 'Null check added', impact: 'App crashes', logs: '' }];
}

// ================================================================
// SELF-CORRECTION CHAIN — verify & fix generated code
// Runs a second Claude pass to catch placeholders, missing styles,
// broken JS, etc. Only for Claude models (skip Groq to save cost).
// ================================================================
async function verifyAndFix(files, model, opts = {}) {
  if (model === 'groq' || !files.length) return files;

  const onProgress = opts.onProgress;
  if (onProgress) onProgress('Verifying code completeness and fixing any issues...');

  const fileContent = files.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
  const verifyPrompt = `Review this generated website code and fix ALL issues:

${fileContent}

CHECK FOR AND FIX ALL OF THESE:
1. Placeholder text: "...", "// rest here", "Lorem ipsum", "TODO", "add more", "similar to above"
2. Missing CSS: every class/ID used in HTML must have complete styles defined
3. Broken JavaScript: undefined functions, missing event handlers, syntax errors, incomplete logic
4. Non-responsive layouts: add proper media queries for mobile/tablet if missing
5. Missing hover effects, transitions, or animations described but not implemented
6. Empty or stub functions: fill them with real working code
7. Missing navigation: smooth scroll, active states, hamburger menu
8. Forms without validation or submit handlers
9. Incomplete data: product lists cut short, missing sections, truncated content
10. Missing accessibility: alt tags, aria labels, keyboard navigation

Return COMPLETE fixed files using \`\`\`filepath:filename.ext format.
Every file must be 100% complete with zero placeholders.
If everything is already perfect, return the files unchanged but still complete.`;

  try {
    const verifySystem = 'You are ZapCodes AI code quality checker. Return ONLY complete, fixed source files. No explanations outside code blocks. Format: ```filepath:filename.ext\n(complete content)\n```';

    const fixResult = await callAI(verifySystem, verifyPrompt, model, undefined, {
      onProgress: opts.onProgress,
      signal: opts.signal,
    });
    const fixedFiles = fixResult ? parseFilesFromResponse(fixResult) : [];
    if (fixedFiles.length > 0) {
      console.log(`[Verify] ✓ Self-correction produced ${fixedFiles.length} fixed files`);
      return fixedFiles;
    }
  } catch (err) {
    console.error(`[Verify] ✗ Self-correction failed: ${err.message}`);
  }

  return files;
}

// ================================================================
// Multi-step generation — with progress, abort, & verification
// ================================================================
async function generateProjectMultiStep(template, projectName, description, colorScheme, features, engine = 'groq', opts = {}) {
  const allFiles = [];
  const spec = getTemplateSpec(template);
  const onProgress = opts.onProgress;
  const signal = opts.signal;

  for (let i = 0; i < spec.phases.length; i++) {
    if (signal?.aborted) throw new Error('Generation cancelled');
    const phase = spec.phases[i];
    if (onProgress) onProgress(`Building ${phase.name} (phase ${i + 1}/${spec.phases.length})...`);

    const existing = allFiles.map(f => f.name).join('\n');
    const sys = `You are ZapCodes AI Project Builder. Phase ${i + 1}/${spec.phases.length} for "${spec.name}".
PROJECT: "${projectName}"
DESCRIPTION: ${description || spec.defaultDesc}
COLOR: ${colorScheme || 'modern dark theme with purple/indigo accents'}
TECH: ${spec.tech}

${phase.instructions}

CRITICAL RULES:
1. Output COMPLETE files only — no placeholders, no "...", no "// rest of code here", no "// similar to above".
2. Format: \`\`\`filepath:path/file.ext\n(content)\n\`\`\`
3. Professional production quality with modern design.
4. For HTML files: ALL CSS must be in <style> tags and ALL JS must be in <script> tags within the same HTML file.
5. The output must be a FULLY FUNCTIONAL website that works when opened in a browser.
6. Include as many relevant features and interactions as possible. Go beyond the basics.
7. Minimum 600 lines of code for any website — do NOT cut short.
8. Every JavaScript function must be complete and working. Every CSS class in HTML must be styled.
${existing ? '\nALREADY DONE:\n' + existing + '\n' : ''}
FILES:\n${phase.fileList}`;

    const response = await callAI(sys, `Generate Phase ${i + 1}: ${phase.name} for "${projectName}"`, engine, undefined, { onProgress, signal });
    if (response) allFiles.push(...parseFilesFromResponse(response));
  }

  // Self-correction pass for Claude models
  if (engine !== 'groq' && allFiles.length > 0) {
    return verifyAndFix(allFiles, engine, opts);
  }

  return allFiles;
}

// ================================================================
// Parse files from AI response
// ================================================================
function parseFilesFromResponse(response) {
  const files = []; let m;
  const p1 = /```filepath:([^\n]+)\n([\s\S]*?)```/g;
  while ((m = p1.exec(response))) { if (m[1].trim() && m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() }); }
  if (files.length) return dedup(files);
  const p2 = /```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|bash|sh|text|markdown|md)?\s+([^\n`]+\.[a-z]{1,6})\n([\s\S]*?)```/g;
  while ((m = p2.exec(response))) { if (m[1].trim() && m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() }); }
  if (files.length) return dedup(files);
  const p3 = /(?:\*\*|###?\s*)(?:File:?\s*)?`?([^\n`*]+\.[a-z]{1,6})`?\*{0,2}\s*\n+```[^\n]*\n([\s\S]*?)```/g;
  while ((m = p3.exec(response))) { if (m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() }); }
  if (files.length) return dedup(files);
  const p4 = /===\s*(?:FILE:\s*)?([^\n=]+?)\s*===\n([\s\S]*?)(?=\n===|$)/g;
  while ((m = p4.exec(response))) { if (m[1].trim() && m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() }); }
  return dedup(files);
}

function dedup(files) {
  const seen = new Map();
  for (const f of files) {
    if (!seen.has(f.name) || f.content.length > seen.get(f.name).content.length) seen.set(f.name, f);
  }
  return Array.from(seen.values());
}

async function verifyAIStatus() {
  const result = {
    groq: { available: false, models: [], error: null },
    haiku: { available: false, model: MODELS.haiku.model, error: null },
    opus: { available: false, model: MODELS.opus.model, error: null },
  };
  const gKey = process.env.GROQ_API_KEY;
  if (gKey) {
    for (const model of GROQ_MODELS.slice(0, 2)) {
      try {
        await axios.post(GROQ_API_URL, { model, messages: [{ role: 'user', content: 'OK' }], max_tokens: 5 }, { headers: { 'Authorization': `Bearer ${gKey}` }, timeout: 10000 });
        result.groq.available = true; result.groq.models.push(model);
      } catch {}
    }
    if (!result.groq.available) result.groq.error = 'All Groq models failed';
  } else { result.groq.error = 'GROQ_API_KEY not set'; }

  const aKey = process.env.ANTHROPIC_API_KEY;
  if (aKey) {
    for (const [k, cfg] of [['haiku', MODELS.haiku], ['opus', MODELS.opus]]) {
      try {
        const r = await axios.post(ANTHROPIC_API_URL, {
          model: cfg.model, max_tokens: 10,
          messages: [{ role: 'user', content: 'OK' }],
        }, {
          headers: { 'x-api-key': aKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          timeout: 15000,
        });
        if (r.data.content?.[0]?.text) result[k].available = true;
      } catch (err) { result[k].error = err.response?.data?.error?.message || err.message; }
    }
  } else { result.haiku.error = result.opus.error = 'ANTHROPIC_API_KEY not set'; }
  return result;
}

async function generateTutorial(question) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return '## ZapCodes Help\nScan repos or build projects with AI.';
  for (const model of ['llama-3.1-8b-instant', 'gemma2-9b-it']) {
    try {
      const r = await axios.post(GROQ_API_URL, {
        model,
        messages: [
          { role: 'system', content: 'You are ZapCodes Tutorial Assistant. Helpful and concise. Markdown.' },
          { role: 'user', content: question },
        ],
        temperature: 0.7, max_tokens: 1500,
      }, { headers: { 'Authorization': `Bearer ${key}` }, timeout: 15000 });
      return r.data.choices[0].message.content;
    } catch {}
  }
  return '## ZapCodes Help\nScan repos or build projects with AI.';
}

// ================================================================
// Template specs — enriched with detailed instructions
// ================================================================
function getTemplateSpec(template) {
  const specs = {
    portfolio: {
      name: 'Portfolio', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'Personal portfolio website',
      phases: [{ name: 'Site', instructions: 'Create a stunning portfolio with: hero section (animated name/title with typing effect or gradient text, photo placeholder via picsum.photos), about section with bio and stats, skills/tech stack with animated progress bars, projects grid (6+ cards with image, title, description, hover overlay with links), testimonials section with cards, working contact form with validation and success/error feedback, and a footer. Use smooth scroll navigation with active states, Intersection Observer fade-in animations, and a modern dark theme with accent color. Navigation must include a hamburger menu on mobile. ALL CSS and JS must be inlined in the index.html file inside <style> and <script> tags. Include at least 8 full sections.', fileList: '- index.html (self-contained with inline CSS and JS)' }],
    },
    landing: {
      name: 'Landing Page', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'Product landing page',
      phases: [{ name: 'Page', instructions: 'Create a high-converting landing page with: animated hero section with gradient background and floating shapes, feature showcase (6+ cards with SVG icons), how-it-works steps (3-4 steps with connecting lines), pricing table with 3 tiers and hover lift effects, testimonials carousel with auto-play and manual controls, FAQ accordion with smooth expand/collapse, newsletter signup form with validation, trust badges section, and CTA footer with gradient. Include smooth scroll, Intersection Observer animations, and full responsive design with mobile hamburger nav. ALL CSS and JS must be inlined.', fileList: '- index.html (self-contained with inline CSS and JS)' }],
    },
    blog: {
      name: 'Blog', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'Blog website',
      phases: [{ name: 'Blog', instructions: 'Create a blog with: featured post hero (large image via picsum.photos, title overlay), post grid with cards (8+ posts with image, title, excerpt, date, category tag, read time), sidebar with categories and working search filter, individual post view triggered by clicking any card (full content, author, date, back button), category filtering, search filtering, back-to-top button, and responsive design. Use CSS grid, smooth transitions, and reading-friendly typography. ALL CSS and JS must be inlined.', fileList: '- index.html (self-contained with inline CSS and JS)' }],
    },
    ecommerce: {
      name: 'E-Commerce', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'Online store',
      phases: [{ name: 'Store', instructions: 'Create an e-commerce storefront with: product grid (12+ products with images via picsum.photos, names, prices, star ratings, add-to-cart button), product quick-view modal, shopping cart sidebar (slides in, items with quantity controls, remove, subtotal, checkout button), category filter dropdown, price range filter, sorting options, checkout form with validation, empty cart state, cart badge count, and responsive design. Use JavaScript for all cart logic and filtering. ALL CSS and JS must be inlined.', fileList: '- index.html (self-contained with inline CSS and JS)' }],
    },
    dashboard: {
      name: 'Dashboard', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'Analytics dashboard',
      phases: [{ name: 'Dashboard', instructions: 'Create an admin dashboard with: collapsible sidebar navigation (6+ items with Unicode icons), 4+ stat cards with numbers and trend arrows, CSS-only bar chart (CSS grid/flexbox bars), CSS-only donut chart (conic-gradient), data table with 10+ rows, column sorting, search, and pagination, activity feed, notification dropdown with badge, user avatar menu, dark theme, and responsive design with sidebar collapse on mobile. Include working JavaScript for all interactions. ALL CSS and JS must be inlined.', fileList: '- index.html (self-contained with inline CSS and JS)' }],
    },
    mobile: {
      name: 'Mobile App', tech: 'React Native+Expo', defaultDesc: 'Mobile app',
      phases: [{ name: 'App', instructions: 'Create an Expo app with tab navigation, home screen with cards and action buttons, profile screen with avatar and settings, and a settings screen with toggle switches. Include proper styling.', fileList: '- package.json\n- app.json\n- App.js' }],
    },
    webapp: {
      name: 'Web App', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'Full-stack web application',
      phases: [{ name: 'App', instructions: 'Create a full-featured web application with: login/register forms with validation, dashboard view with stat cards, data management with full CRUD using localStorage, settings page with toggles and profile fields, responsive sidebar navigation with active states and mobile hamburger, search, and smooth transitions between views. Use JavaScript for SPA routing and localStorage for persistence. ALL CSS and JS must be inlined.', fileList: '- index.html (self-contained with inline CSS and JS)' }],
    },
    saas: {
      name: 'SaaS', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'SaaS landing with auth',
      phases: [{ name: 'SaaS', instructions: 'Create a SaaS application with: landing page (hero with gradient, features grid with 6+ cards, pricing table with 3 tiers and monthly/annual toggle, testimonials, FAQ accordion), login/register modals with validation, dashboard with stats and data table CRUD, profile/settings page, sidebar navigation, and responsive design. Use JavaScript for SPA routing, modal handling, and localStorage for auth/data. ALL CSS and JS must be inlined.', fileList: '- index.html (self-contained with inline CSS and JS)' }],
    },
    'fullstack-mobile': {
      name: 'Full-Stack+Mobile', tech: 'React+Node+Socket.IO+RN', defaultDesc: 'Web+mobile',
      phases: [
        { name: 'Backend', instructions: 'Express+Socket.IO API with error handling.', fileList: '- backend/package.json\n- backend/server.js' },
        { name: 'Web', instructions: 'React+Vite with Socket.IO client.', fileList: '- web/package.json\n- web/index.html\n- web/src/App.jsx' },
        { name: 'Mobile', instructions: 'Expo app with Socket.IO client.', fileList: '- mobile/package.json\n- mobile/app.json\n- mobile/App.js\n- README.md' },
      ],
    },
  };
  return specs[template] || specs.portfolio;
}

module.exports = {
  callAI, callClaude, callClaudeWithImages, callGroq, streamAI,
  analyzeCode, generateTutorial, generateProjectMultiStep,
  parseFilesFromResponse, verifyAndFix, verifyAIStatus,
  MODELS, CLAUDE_MODEL, CLAUDE_MAX_OUTPUT, CLAUDE_LARGE_OUTPUT,
  GROQ_MAX_OUTPUT, GROQ_MODELS,
};
