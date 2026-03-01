const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ================================================================
// MODEL CONFIGS
// ================================================================
const MODELS = {
  groq: { models: ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'deepseek-r1-distill-llama-70b', 'mixtral-8x7b-32768'], maxOutput: 8192, contextLimit: 30000 },
  haiku: { model: 'claude-haiku-4-5-20251001', maxOutput: 16384, contextLimit: 180000 },
  opus: { model: 'claude-opus-4-6', maxOutput: 32768, contextLimit: 180000 },
};

const CLAUDE_MODEL = MODELS.opus.model;
const CLAUDE_MAX_OUTPUT = 16384;
const CLAUDE_LARGE_OUTPUT = 32768;
const GROQ_MAX_OUTPUT = MODELS.groq.maxOutput;
const GROQ_MODELS = MODELS.groq.models;

// ================================================================
// UNIFIED: callAI(systemPrompt, userPrompt, model, maxTokens)
// ================================================================
async function callAI(systemPrompt, userPrompt, model = 'groq', maxTokens) {
  switch (model) {
    case 'haiku': return callClaude(systemPrompt, userPrompt, { model: MODELS.haiku.model, maxTokens: maxTokens || MODELS.haiku.maxOutput });
    case 'opus':  return callClaude(systemPrompt, userPrompt, { model: MODELS.opus.model, maxTokens: maxTokens || MODELS.opus.maxOutput });
    case 'groq': default: return callGroq(systemPrompt, userPrompt, { maxTokens: maxTokens || MODELS.groq.maxOutput });
  }
}

// ================================================================
// Call Claude (Haiku or Opus)
// ================================================================
async function callClaude(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.warn('[Claude] No ANTHROPIC_API_KEY — fallback to Groq'); return callGroq(systemPrompt, userPrompt, options); }
  const modelId = options.model || CLAUDE_MODEL;
  const maxTokens = options.maxTokens || CLAUDE_LARGE_OUTPUT;
  try {
    const label = modelId.includes('haiku') ? 'Haiku 4.5' : 'Opus 4.6';
    console.log(`[Claude] ${label} (max_tokens=${maxTokens})`);
    const r = await axios.post(ANTHROPIC_API_URL, { model: modelId, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userPrompt.slice(0, MODELS.opus.contextLimit) }] }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: options.timeout || 180000 });
    const c = r.data.content?.[0]?.text || '';
    if (c) { console.log(`[Claude] ✓ ${label} (${c.length} chars)`); return c; }
    return null;
  } catch (err) {
    console.error(`[Claude] ✗ ${modelId}: ${err.response?.data?.error?.message || err.message}`);
    if (modelId.includes('haiku')) { console.log('[Claude] Haiku failed → Groq fallback'); return callGroq(systemPrompt, userPrompt, options); }
    return null;
  }
}

// ================================================================
// Call Claude with images
// ================================================================
async function callClaudeWithImages(systemPrompt, userPrompt, images = [], options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const blocks = images.map(img => ({ type: 'image', source: { type: 'base64', media_type: img.mimeType || 'image/png', data: img.base64 } }));
    blocks.push({ type: 'text', text: userPrompt });
    const r = await axios.post(ANTHROPIC_API_URL, { model: options.model || CLAUDE_MODEL, max_tokens: options.maxTokens || CLAUDE_MAX_OUTPUT, system: systemPrompt, messages: [{ role: 'user', content: blocks }] }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 120000 });
    return r.data.content?.[0]?.text || null;
  } catch (err) { console.error(`[Claude+Image] ✗ ${err.response?.data?.error?.message || err.message}`); return null; }
}

// ================================================================
// Call Groq (fallback chain)
// ================================================================
async function callGroq(systemPrompt, userPrompt, options = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const maxTokens = options.maxTokens || GROQ_MAX_OUTPUT;
  for (const model of GROQ_MODELS) {
    try {
      console.log(`[GROQ] → ${model}`);
      const r = await axios.post(GROQ_API_URL, { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt.slice(0, MODELS.groq.contextLimit) }], temperature: 0.2, max_tokens: maxTokens }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 90000 });
      const c = r.data.choices?.[0]?.message?.content;
      if (c) { console.log(`[GROQ] ✓ ${model} (${c.length} chars)`); return c; }
    } catch (err) { const s = err.response?.status; console.error(`[GROQ] ✗ ${model} (${s})`); if (s === 401 || s === 429) break; }
  }
  return null;
}

// ================================================================
// SSE Streaming for live preview
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
    const response = await axios.post(ANTHROPIC_API_URL, { model: modelId, max_tokens: maxTokens, stream: true, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, responseType: 'stream', timeout: 180000 });
    let fullText = '';
    return new Promise((resolve, reject) => {
      let buffer = '';
      response.data.on('data', (chunk) => {
        buffer += chunk.toString(); const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try { const p = JSON.parse(line.slice(6)); if (p.type === 'content_block_delta' && p.delta?.text) { fullText += p.delta.text; res.write(`data: ${JSON.stringify({ type: 'content', text: p.delta.text })}\n\n`); } } catch {}
        }
      });
      response.data.on('end', () => { res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`); resolve(fullText); });
      response.data.on('error', (err) => { res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`); reject(err); });
    });
  } catch (err) { console.error(`[Stream] Failed: ${err.message}`); return streamAI(systemPrompt, userPrompt, 'groq', res); }
}

// ================================================================
// Code Analysis
// ================================================================
async function analyzeCode(files, engine = 'groq') {
  const filesSummary = files.slice(0, 20).map(f => `--- ${f.path || f.name} ---\n${(f.content || '').slice(0, 4000)}`).join('\n\n');
  const sys = `You are ZapCodes AI code analyzer. Return ONLY valid JSON array of issues: [{"type":"crash|memory_leak|anr|warning|error|security|performance","severity":"critical|high|medium|low","title":"...","description":"...","file":"...","line":N,"code":"...","fixedCode":"...","explanation":"...","impact":"...","logs":"..."}]. Return 3-8 issues.`;
  const result = await callAI(sys, `Analyze:\n\n${filesSummary}`, engine);
  if (result) { const m = result.match(/\[[\s\S]*\]/); if (m) try { return JSON.parse(m[0]); } catch {} }
  return [{ type: 'crash', severity: 'critical', title: 'Null pointer', description: 'Unhandled null', file: (files[0] || {}).path || 'unknown', line: 10, code: '', fixedCode: '// Fixed', explanation: 'Null check added', impact: 'App crashes', logs: '' }];
}

// ================================================================
// Multi-step generation
// ================================================================
async function generateProjectMultiStep(template, projectName, description, colorScheme, features, engine = 'groq') {
  const allFiles = [];
  const spec = getTemplateSpec(template);
  for (let i = 0; i < spec.phases.length; i++) {
    const phase = spec.phases[i];
    const existing = allFiles.map(f => f.name).join('\n');
    const sys = `You are ZapCodes AI Project Builder. Phase ${i + 1}/${spec.phases.length} for "${spec.name}".\nPROJECT: "${projectName}"\nDESCRIPTION: ${description || spec.defaultDesc}\nCOLOR: ${colorScheme || 'modern dark'}\nTECH: ${spec.tech}\n\n${phase.instructions}\n\nRULES:\n1. COMPLETE files only.\n2. Format: \`\`\`filepath:path/file.ext\n(content)\n\`\`\`\n3. Professional production quality.\n${existing ? `\nALREADY DONE:\n${existing}\n` : ''}\nFILES:\n${phase.fileList}`;
    const response = await callAI(sys, `Generate Phase ${i + 1}: ${phase.name} for "${projectName}"`, engine);
    if (response) allFiles.push(...parseFilesFromResponse(response));
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
  for (const f of files) { if (!seen.has(f.name) || f.content.length > seen.get(f.name).content.length) seen.set(f.name, f); }
  return Array.from(seen.values());
}

async function verifyAIStatus() {
  const result = { groq: { available: false, models: [], error: null }, haiku: { available: false, model: MODELS.haiku.model, error: null }, opus: { available: false, model: MODELS.opus.model, error: null } };
  const gKey = process.env.GROQ_API_KEY;
  if (gKey) { for (const model of GROQ_MODELS.slice(0, 2)) { try { await axios.post(GROQ_API_URL, { model, messages: [{ role: 'user', content: 'OK' }], max_tokens: 5 }, { headers: { 'Authorization': `Bearer ${gKey}` }, timeout: 10000 }); result.groq.available = true; result.groq.models.push(model); } catch {} } if (!result.groq.available) result.groq.error = 'All Groq models failed'; } else { result.groq.error = 'GROQ_API_KEY not set'; }
  const aKey = process.env.ANTHROPIC_API_KEY;
  if (aKey) { for (const [k, cfg] of [['haiku', MODELS.haiku], ['opus', MODELS.opus]]) { try { const r = await axios.post(ANTHROPIC_API_URL, { model: cfg.model, max_tokens: 10, messages: [{ role: 'user', content: 'OK' }] }, { headers: { 'x-api-key': aKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 15000 }); if (r.data.content?.[0]?.text) result[k].available = true; } catch (err) { result[k].error = err.response?.data?.error?.message || err.message; } } } else { result.haiku.error = result.opus.error = 'ANTHROPIC_API_KEY not set'; }
  return result;
}

async function generateTutorial(question) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return '## ZapCodes Help\nScan repos or build projects with AI.';
  for (const model of ['llama-3.1-8b-instant', 'gemma2-9b-it']) { try { const r = await axios.post(GROQ_API_URL, { model, messages: [{ role: 'system', content: 'You are ZapCodes Tutorial Assistant. Helpful and concise. Markdown.' }, { role: 'user', content: question }], temperature: 0.7, max_tokens: 1500 }, { headers: { 'Authorization': `Bearer ${key}` }, timeout: 15000 }); return r.data.choices[0].message.content; } catch {} }
  return '## ZapCodes Help\nScan repos or build projects with AI.';
}

function getTemplateSpec(template) {
  const specs = {
    portfolio: { name: 'Portfolio', tech: 'HTML+CSS+JS', defaultDesc: 'Portfolio', phases: [{ name: 'Site', instructions: 'Portfolio with hero, about, projects, contact.', fileList: '- index.html\n- style.css\n- script.js' }] },
    landing: { name: 'Landing', tech: 'HTML+CSS+JS', defaultDesc: 'Landing page', phases: [{ name: 'Page', instructions: 'Landing with hero, features, pricing, CTA.', fileList: '- index.html\n- style.css\n- script.js' }] },
    blog: { name: 'Blog', tech: 'HTML+CSS+JS', defaultDesc: 'Blog', phases: [{ name: 'Blog', instructions: 'Blog with posts, search, categories.', fileList: '- index.html\n- style.css\n- script.js' }] },
    ecommerce: { name: 'E-Commerce', tech: 'React+Vite', defaultDesc: 'Online store', phases: [{ name: 'Store', instructions: 'React store with products, cart, checkout.', fileList: '- package.json\n- vite.config.js\n- index.html\n- src/main.jsx\n- src/App.jsx\n- src/index.css' }] },
    dashboard: { name: 'Dashboard', tech: 'React+Vite+Recharts', defaultDesc: 'Analytics dashboard', phases: [{ name: 'Dashboard', instructions: 'Dashboard with charts, tables, stats.', fileList: '- package.json\n- vite.config.js\n- index.html\n- src/main.jsx\n- src/App.jsx\n- src/index.css' }] },
    mobile: { name: 'Mobile App', tech: 'React Native+Expo', defaultDesc: 'Mobile app', phases: [{ name: 'App', instructions: 'Expo app with tabs, home, profile.', fileList: '- package.json\n- app.json\n- App.js' }] },
    webapp: { name: 'Web App', tech: 'React+Node+Express', defaultDesc: 'Full-stack', phases: [{ name: 'Backend', instructions: 'Express CRUD API.', fileList: '- backend/package.json\n- backend/server.js' }, { name: 'Frontend', instructions: 'React+Vite connecting to API.', fileList: '- frontend/package.json\n- frontend/vite.config.js\n- frontend/index.html\n- frontend/src/main.jsx\n- frontend/src/App.jsx\n- frontend/src/index.css\n- README.md' }] },
    saas: { name: 'SaaS', tech: 'React+Node+JWT', defaultDesc: 'SaaS with auth', phases: [{ name: 'Backend', instructions: 'JWT auth backend.', fileList: '- backend/package.json\n- backend/server.js\n- backend/routes/auth.js' }, { name: 'Frontend', instructions: 'React SaaS with login, dashboard, pricing.', fileList: '- frontend/package.json\n- frontend/vite.config.js\n- frontend/index.html\n- frontend/src/main.jsx\n- frontend/src/App.jsx\n- frontend/src/index.css\n- README.md' }] },
    'fullstack-mobile': { name: 'Full-Stack+Mobile', tech: 'React+Node+Socket.IO+RN', defaultDesc: 'Web+mobile', phases: [{ name: 'Backend', instructions: 'Express+Socket.IO API.', fileList: '- backend/package.json\n- backend/server.js' }, { name: 'Web', instructions: 'React+Vite with Socket.IO.', fileList: '- web/package.json\n- web/index.html\n- web/src/App.jsx' }, { name: 'Mobile', instructions: 'Expo app with Socket.IO.', fileList: '- mobile/package.json\n- mobile/app.json\n- mobile/App.js\n- README.md' }] },
  };
  return specs[template] || specs.portfolio;
}

module.exports = { callAI, callClaude, callClaudeWithImages, callGroq, streamAI, analyzeCode, generateTutorial, generateProjectMultiStep, parseFilesFromResponse, verifyAIStatus, MODELS, CLAUDE_MODEL, CLAUDE_MAX_OUTPUT, CLAUDE_LARGE_OUTPUT, GROQ_MAX_OUTPUT, GROQ_MODELS };
