const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// ================================================================
// MODEL CONFIGS — FIXED: using correct, verified model IDs
// ================================================================
const MODELS = {
  groq: { models: ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'deepseek-r1-distill-llama-70b', 'mixtral-8x7b-32768'], maxOutput: 8192, contextLimit: 30000 },
  'gemini-flash': { model: 'gemini-2.5-flash', maxOutput: 65536, contextLimit: 1000000 },
  'gemini-pro': { model: 'gemini-3.1-pro-preview', maxOutput: 16384, contextLimit: 1000000 },
  haiku: { model: 'claude-haiku-4-5-20251001', maxOutput: 16384, contextLimit: 180000 },
  sonnet: { model: 'claude-sonnet-4-6', maxOutput: 32768, contextLimit: 200000 },
  // New key aliases
  'gemini-2.5-flash': { model: 'gemini-2.5-flash', maxOutput: 65536, contextLimit: 1000000 },
  'gemini-3.1-pro': { model: 'gemini-3.1-pro-preview', maxOutput: 16384, contextLimit: 1000000 },
  'haiku-4.5': { model: 'claude-haiku-4-5-20251001', maxOutput: 16384, contextLimit: 180000 },
  'sonnet-4.6': { model: 'claude-sonnet-4-6', maxOutput: 32768, contextLimit: 200000 },
};
const GROQ_MAX_OUTPUT = MODELS.groq.maxOutput;
const GROQ_MODELS = MODELS.groq.models;

// ================================================================
// FALLBACK CHAIN — ordered from best to fastest
// When a model fails, try the next one in line instead of jumping to Groq
// ================================================================
const FALLBACK_CHAIN = ['sonnet-4.6', 'gemini-3.1-pro', 'haiku-4.5', 'gemini-2.5-flash', 'groq'];

function getNextFallback(failedModel) {
  // Normalize to new keys
  const normalize = { 'sonnet': 'sonnet-4.6', 'gemini-pro': 'gemini-3.1-pro', 'haiku': 'haiku-4.5', 'gemini-flash': 'gemini-2.5-flash' };
  const key = normalize[failedModel] || failedModel;
  const idx = FALLBACK_CHAIN.indexOf(key);
  if (idx >= 0 && idx < FALLBACK_CHAIN.length - 1) return FALLBACK_CHAIN[idx + 1];
  return 'groq'; // Last resort
}

async function withRetry(fn, { maxRetries = 1, baseDelay = 1000, onRetry } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(attempt); } catch (err) {
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

function extractClaudeText(data) {
  if (!data?.content) return '';
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n') || '';
}

function systemPromptToString(sp) {
  if (typeof sp === 'string') return sp;
  if (Array.isArray(sp)) return sp.map(b => b.text || '').join('\n');
  return String(sp);
}

// ================================================================
// UNIFIED: callAI — supports both old and new keys, with smart fallback
// Returns { text, model } so caller knows which model actually generated
// ================================================================
async function callAI(systemPrompt, userPrompt, model = 'groq', maxTokens, opts = {}) {
  if (opts.signal?.aborted) throw new Error('Generation cancelled');

  // Try the requested model first
  const result = await _callModel(systemPrompt, userPrompt, model, maxTokens, opts);
  if (result) return result;

  // If it failed, walk the fallback chain from the failed model
  let nextModel = getNextFallback(model);
  while (nextModel) {
    if (opts.onProgress) opts.onProgress(`Trying ${getModelLabel(nextModel)}...`);
    console.log(`[Fallback] ${model} failed → trying ${nextModel}`);
    const fallbackResult = await _callModel(systemPrompt, userPrompt, nextModel, maxTokens, opts);
    if (fallbackResult) return fallbackResult;
    nextModel = getNextFallback(nextModel);
    if (nextModel === 'groq') {
      // Last resort — Groq with full model rotation
      const groqResult = await callGroq(systemPrompt, userPrompt, { maxTokens: maxTokens || GROQ_MAX_OUTPUT, onProgress: opts.onProgress, signal: opts.signal });
      return groqResult;
    }
  }

  return null;
}

function getModelLabel(model) {
  const labels = {
    'sonnet-4.6': 'Sonnet 4.6', 'sonnet': 'Sonnet 4.6',
    'gemini-3.1-pro': 'Gemini Pro', 'gemini-pro': 'Gemini Pro',
    'haiku-4.5': 'Haiku 4.5', 'haiku': 'Haiku 4.5',
    'gemini-2.5-flash': 'Gemini Flash', 'gemini-flash': 'Gemini Flash',
    'groq': 'Groq AI',
  };
  return labels[model] || model;
}

// Internal: try a single model, return text or null (no fallback)
async function _callModel(systemPrompt, userPrompt, model, maxTokens, opts) {
  try {
    switch (model) {
      case 'gemini-pro':
      case 'gemini-3.1-pro':
        return await callGemini(systemPrompt, userPrompt, { model: MODELS['gemini-3.1-pro'].model, maxTokens: maxTokens || MODELS['gemini-3.1-pro'].maxOutput, label: 'Gemini Pro', onProgress: opts.onProgress, signal: opts.signal, noFallback: true });

      case 'gemini-flash':
      case 'gemini-2.5-flash':
        return await callGemini(systemPrompt, userPrompt, { model: MODELS['gemini-2.5-flash'].model, maxTokens: maxTokens || MODELS['gemini-2.5-flash'].maxOutput, label: 'Gemini Flash', onProgress: opts.onProgress, signal: opts.signal, noFallback: true });

      case 'haiku':
      case 'haiku-4.5':
        return await callClaude(systemPrompt, userPrompt, { model: MODELS['haiku-4.5'].model, maxTokens: maxTokens || MODELS['haiku-4.5'].maxOutput, label: 'Haiku 4.5', onProgress: opts.onProgress, signal: opts.signal, noFallback: true });

      case 'sonnet':
      case 'sonnet-4.6':
        return await callClaude(systemPrompt, userPrompt, { model: MODELS['sonnet-4.6'].model, maxTokens: maxTokens || MODELS['sonnet-4.6'].maxOutput, label: 'Sonnet 4.6', onProgress: opts.onProgress, signal: opts.signal, noFallback: true });

      case 'groq':
      default:
        return await callGroq(systemPrompt, userPrompt, { maxTokens: maxTokens || GROQ_MAX_OUTPUT, onProgress: opts.onProgress, signal: opts.signal });
    }
  } catch (err) {
    if (err.message === 'Generation cancelled') throw err;
    console.error(`[_callModel] ${model} failed: ${err.message}`);
    return null;
  }
}

// ================================================================
// Call Gemini (Flash or Pro) — noFallback option prevents auto-Groq
// ================================================================
async function callGemini(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn('[Gemini] No GEMINI_API_KEY');
    if (options.noFallback) return null;
    return callGroq(systemPrompt, userPrompt, { maxTokens: GROQ_MAX_OUTPUT, onProgress: options.onProgress, signal: options.signal });
  }
  const modelId = options.model || MODELS['gemini-2.5-flash'].model;
  const maxTokens = options.maxTokens || 65536;
  const label = options.label || 'Gemini';
  const onProgress = options.onProgress;
  const signal = options.signal;
  try {
    const result = await withRetry(async (attempt) => {
      if (signal?.aborted) throw new Error('Generation cancelled');
      if (attempt > 0 && onProgress) onProgress(`Retrying ${label} (attempt ${attempt + 1})...`);
      console.log(`[Gemini] ${label} -> ${modelId} (max_tokens=${maxTokens})${attempt > 0 ? ' retry #' + attempt : ''}`);
      const url = `${GEMINI_API_URL}/${modelId}:generateContent?key=${apiKey}`;
      const r = await axios.post(url, {
        contents: [{ role: 'user', parts: [{ text: userPrompt.slice(0, 900000) }] }],
        systemInstruction: { parts: [{ text: systemPromptToString(systemPrompt) }] },
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 300000 });
      const candidate = r.data?.candidates?.[0];
      if (!candidate) throw new Error('No candidates in Gemini response');
      if (candidate.finishReason === 'SAFETY') throw new Error('Content blocked by safety filter');
      const text = candidate.content?.parts?.map(p => p.text || '').join('\n') || '';
      if (text) { console.log(`[Gemini] OK ${label} (${text.length} chars, ${r.data.usageMetadata?.promptTokenCount || 0} in / ${r.data.usageMetadata?.candidatesTokenCount || 0} out)`); return text; }
      throw new Error('Empty response from Gemini');
    }, { maxRetries: 1, onRetry: (a, m, d) => { console.log(`[Gemini] Retry ${a}/${m} in ${Math.round(d)}ms`); if (onProgress) onProgress(`${label} retry ${a}/${m}...`); } });
    return result;
  } catch (err) {
    if (err.message === 'Generation cancelled') throw err;
    const status = err.response?.status; const msg = err.response?.data?.error?.message || err.message;
    console.error(`[Gemini] X ${modelId}: ${status || 'network'} - ${msg}`);
    if (options.noFallback) return null; // Let callAI handle fallback chain
    if (onProgress) onProgress(`${label} unavailable (${msg}) — switching to Groq...`);
    return callGroq(systemPrompt, userPrompt, { maxTokens: GROQ_MAX_OUTPUT, onProgress: options.onProgress, signal: options.signal });
  }
}

// ================================================================
// Call Claude (Haiku or Sonnet) — noFallback option prevents auto-Groq
// ================================================================
async function callClaude(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[Claude] No ANTHROPIC_API_KEY');
    if (options.noFallback) return null;
    return callGroq(systemPrompt, userPrompt, { maxTokens: GROQ_MAX_OUTPUT, onProgress: options.onProgress, signal: options.signal });
  }
  const modelId = options.model || MODELS['haiku-4.5'].model;
  const maxTokens = options.maxTokens || 16384;
  const label = options.label || 'Claude';
  const onProgress = options.onProgress;
  const signal = options.signal;
  // All models get maximum timeout (300s = Render's connection limit)
  const timeoutMs = 300000;
  try {
    const result = await withRetry(async (attempt) => {
      if (signal?.aborted) throw new Error('Generation cancelled');
      if (attempt > 0 && onProgress) onProgress(`Retrying ${label} (attempt ${attempt + 1})...`);
      console.log(`[Claude] ${label} -> ${modelId} (max_tokens=${maxTokens}, timeout=${timeoutMs/1000}s)${attempt > 0 ? ' retry #' + attempt : ''}`);
      const r = await axios.post(ANTHROPIC_API_URL, {
        model: modelId, max_tokens: maxTokens,
        system: [{ type: 'text', text: systemPromptToString(systemPrompt), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt.slice(0, 180000) }],
      }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: timeoutMs });
      const c = extractClaudeText(r.data);
      if (c) { console.log(`[Claude] OK ${label} (${c.length} chars, ${r.data.usage?.input_tokens || 0} in / ${r.data.usage?.output_tokens || 0} out)`); return c; }
      throw new Error('Empty response from Claude');
    }, { maxRetries: 0, onRetry: (a, m, d) => { console.log(`[Claude] Retry ${a}/${m} in ${Math.round(d)}ms`); if (onProgress) onProgress(`${label} retry ${a}/${m}...`); } });
    return result;
  } catch (err) {
    if (err.message === 'Generation cancelled') throw err;
    const status = err.response?.status; const msg = err.response?.data?.error?.message || err.message;
    console.error(`[Claude] X ${modelId}: ${status || 'network'} - ${msg}`);
    if (options.noFallback) return null; // Let callAI handle fallback chain
    if (onProgress) onProgress(`${label} unavailable (${msg}) — switching to Groq...`);
    return callGroq(systemPrompt, userPrompt, { maxTokens: GROQ_MAX_OUTPUT, onProgress: options.onProgress, signal: options.signal });
  }
}

async function callClaudeWithImages(systemPrompt, userPrompt, images = [], options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const blocks = images.map(img => ({ type: 'image', source: { type: 'base64', media_type: img.mimeType || 'image/png', data: img.base64 } }));
    blocks.push({ type: 'text', text: userPrompt });
    const r = await axios.post(ANTHROPIC_API_URL, { model: options.model || MODELS['haiku-4.5'].model, max_tokens: options.maxTokens || 16384, system: [{ type: 'text', text: systemPromptToString(systemPrompt), cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: blocks }] }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 300000 });
    return extractClaudeText(r.data);
  } catch (err) { console.error(`[Claude+Image] X ${err.response?.data?.error?.message || err.message}`); return null; }
}

// ================================================================
// Call Groq
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
      console.log(`[GROQ] -> ${model} (max_tokens=${maxTokens})`);
      const result = await withRetry(async (attempt) => {
        if (signal?.aborted) throw new Error('Generation cancelled');
        if (attempt > 0 && onProgress) onProgress(`Retrying Groq ${model} (attempt ${attempt + 1})...`);
        const r = await axios.post(GROQ_API_URL, { model, messages: [{ role: 'system', content: sysText }, { role: 'user', content: userPrompt.slice(0, MODELS.groq.contextLimit) }], temperature: 0.2, max_tokens: maxTokens }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 300000 });
        const c = r.data.choices?.[0]?.message?.content;
        if (c) { console.log(`[GROQ] OK ${model} (${c.length} chars)`); return c; }
        throw new Error('Empty Groq response');
      }, { maxRetries: 1 });
      return result;
    } catch (err) {
      if (err.message === 'Generation cancelled') throw err;
      const s = err.response?.status;
      console.error(`[GROQ] X ${model} (${s || 'network'}): ${err.response?.data?.error?.message || err.message}`);
      if (s === 401) break;
      if (s === 429) { if (onProgress) onProgress(`Groq rate limited — trying next model...`); continue; }
    }
  }
  return null;
}

async function streamAI(systemPrompt, userPrompt, model, res) {
  const result = await callAI(systemPrompt, userPrompt, model);
  if (result) res.write(`data: ${JSON.stringify({ type: 'content', text: result })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  return result;
}

async function analyzeCode(files, engine = 'groq') {
  const filesSummary = files.slice(0, 20).map(f => `--- ${f.path || f.name} ---\n${(f.content || '').slice(0, 4000)}`).join('\n\n');
  const sys = 'You are ZapCodes AI code analyzer. Return ONLY valid JSON array of issues: [{"type":"crash|memory_leak|anr|warning|error|security|performance","severity":"critical|high|medium|low","title":"...","description":"...","file":"...","line":N,"code":"...","fixedCode":"...","explanation":"...","impact":"...","logs":"..."}]. Return 3-8 issues.';
  const result = await callAI(sys, `Analyze:\n\n${filesSummary}`, engine);
  if (result) { const m = result.match(/\[[\s\S]*\]/); if (m) try { return JSON.parse(m[0]); } catch {} }
  return [{ type: 'crash', severity: 'critical', title: 'Null pointer', description: 'Unhandled null', file: (files[0] || {}).path || 'unknown', line: 10, code: '', fixedCode: '// Fixed', explanation: 'Null check added', impact: 'App crashes', logs: '' }];
}

async function verifyAndFix(files, model, opts = {}) {
  if (model === 'groq' || !files.length) return files;
  const onProgress = opts.onProgress;
  if (onProgress) onProgress('Verifying code completeness...');
  const fileContent = files.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');
  const verifyPrompt = `Review this generated website code and fix ALL issues:\n\n${fileContent}\n\nCHECK: 1. No placeholders 2. All CSS defined 3. All JS working 4. Responsive 5. All interactions working\n\nReturn COMPLETE fixed files using \`\`\`filepath:filename.ext format.`;
  try {
    const fixResult = await callAI('You are ZapCodes AI code quality checker. Return ONLY complete, fixed source files. Format: ```filepath:filename.ext\\n(content)\\n```', verifyPrompt, model, undefined, { onProgress: opts.onProgress, signal: opts.signal });
    const fixedFiles = fixResult ? parseFilesFromResponse(fixResult) : [];
    if (fixedFiles.length > 0) { console.log(`[Verify] OK ${fixedFiles.length} fixed files`); return fixedFiles; }
  } catch (err) { console.error(`[Verify] X ${err.message}`); }
  return files;
}

async function generateProjectMultiStep(template, projectName, description, colorScheme, features, engine = 'groq', opts = {}) {
  const allFiles = []; const spec = getTemplateSpec(template);
  for (let i = 0; i < spec.phases.length; i++) {
    if (opts.signal?.aborted) throw new Error('Generation cancelled');
    const phase = spec.phases[i];
    if (opts.onProgress) opts.onProgress(`Building ${phase.name} (phase ${i + 1}/${spec.phases.length})...`);
    const existing = allFiles.map(f => f.name).join('\n');
    const sys = `You are ZapCodes AI Project Builder. Phase ${i + 1}/${spec.phases.length} for "${spec.name}".\nPROJECT: "${projectName}"\nDESCRIPTION: ${description || spec.defaultDesc}\nCOLOR: ${colorScheme || 'modern dark theme with purple/indigo accents'}\nTECH: ${spec.tech}\n\n${phase.instructions}\n\nCRITICAL: Output COMPLETE files only. Format: \`\`\`filepath:path/file.ext\\n(content)\\n\`\`\`\nAll CSS in <style>, all JS in <script>. Min 600 lines. No placeholders.\n${existing ? 'ALREADY DONE:\\n' + existing + '\\n' : ''}FILES:\\n${phase.fileList}`;
    const response = await callAI(sys, `Generate Phase ${i + 1}: ${phase.name} for "${projectName}"`, engine, undefined, opts);
    if (response) allFiles.push(...parseFilesFromResponse(response));
  }
  return allFiles;
}

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
  if (files.length === 0 && (response.includes('<!DOCTYPE') || response.includes('<html'))) {
    const htmlMatch = response.match(/(<!DOCTYPE[\s\S]*<\/html>)/i);
    if (htmlMatch && htmlMatch[1].length > 100) files.push({ name: 'index.html', content: htmlMatch[1].trim() });
  }
  return dedup(files);
}

function dedup(files) { const seen = new Map(); for (const f of files) { if (!seen.has(f.name) || f.content.length > seen.get(f.name).content.length) seen.set(f.name, f); } return Array.from(seen.values()); }

async function verifyAIStatus() {
  const result = {
    groq: { available: false, models: [], error: null },
    'gemini-2.5-flash': { available: false, error: null },
    'gemini-3.1-pro': { available: false, error: null },
    'haiku-4.5': { available: false, error: null },
    'sonnet-4.6': { available: false, error: null },
  };
  const gKey = process.env.GROQ_API_KEY;
  if (gKey) { for (const model of GROQ_MODELS.slice(0, 2)) { try { await axios.post(GROQ_API_URL, { model, messages: [{ role: 'user', content: 'OK' }], max_tokens: 5 }, { headers: { 'Authorization': `Bearer ${gKey}` }, timeout: 10000 }); result.groq.available = true; result.groq.models.push(model); } catch {} } if (!result.groq.available) result.groq.error = 'All Groq models failed'; } else { result.groq.error = 'GROQ_API_KEY not set'; }
  const gemKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (gemKey) {
    for (const [newKey, cfg] of [['gemini-2.5-flash', MODELS['gemini-2.5-flash']], ['gemini-3.1-pro', MODELS['gemini-3.1-pro']]]) {
      try { const r = await axios.post(`${GEMINI_API_URL}/${cfg.model}:generateContent?key=${gemKey}`, { contents: [{ role: 'user', parts: [{ text: 'OK' }] }], generationConfig: { maxOutputTokens: 5 } }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }); if (r.data?.candidates?.[0]) result[newKey].available = true; } catch (err) { result[newKey].error = err.response?.data?.error?.message || err.message; }
    }
  } else { result['gemini-2.5-flash'].error = result['gemini-3.1-pro'].error = 'GEMINI_API_KEY not set'; }
  const aKey = process.env.ANTHROPIC_API_KEY;
  if (aKey) {
    for (const [newKey, cfg] of [['haiku-4.5', MODELS['haiku-4.5']], ['sonnet-4.6', MODELS['sonnet-4.6']]]) {
      try { const r = await axios.post(ANTHROPIC_API_URL, { model: cfg.model, max_tokens: 10, messages: [{ role: 'user', content: 'OK' }] }, { headers: { 'x-api-key': aKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 15000 }); if (r.data.content?.[0]?.text) result[newKey].available = true; } catch (err) { result[newKey].error = err.response?.data?.error?.message || err.message; }
    }
  } else { result['haiku-4.5'].error = result['sonnet-4.6'].error = 'ANTHROPIC_API_KEY not set'; }
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
    portfolio: { name: 'Portfolio', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'Personal portfolio website', phases: [{ name: 'Site', instructions: 'Create a stunning portfolio with: hero section (animated name/title with typing effect or gradient text, photo placeholder via picsum.photos), about section with bio and stats, skills/tech stack with animated progress bars, projects grid (6+ cards with image, title, description, hover overlay with links), testimonials section with cards, working contact form with validation and success/error feedback, and a footer. Use smooth scroll navigation with active states, Intersection Observer fade-in animations, and a modern dark theme with accent color. Navigation must include a hamburger menu on mobile. ALL CSS and JS must be inlined in the index.html file inside <style> and <script> tags. Include at least 8 full sections.', fileList: '- index.html (self-contained with inline CSS and JS)' }] },
    landing: { name: 'Landing Page', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'Product landing page', phases: [{ name: 'Page', instructions: 'Create a high-converting landing page with: animated hero section with gradient background and floating shapes, feature showcase (6+ cards with SVG icons), how-it-works steps, pricing table with 3 tiers and hover lift effects, testimonials carousel, FAQ accordion, newsletter signup form with validation, trust badges section, and CTA footer. Include smooth scroll, Intersection Observer animations, and full responsive design. ALL CSS and JS must be inlined.', fileList: '- index.html (self-contained with inline CSS and JS)' }] },
    blog: { name: 'Blog', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'Blog website', phases: [{ name: 'Blog', instructions: 'Create a blog with: featured post hero, post grid with cards (8+ posts), sidebar with categories and search filter, individual post view, category filtering, search filtering, back-to-top button, and responsive design. ALL CSS and JS must be inlined.', fileList: '- index.html (self-contained with inline CSS and JS)' }] },
    ecommerce: { name: 'E-Commerce', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'Online store', phases: [{ name: 'Store', instructions: 'Create an e-commerce storefront with: product grid (12+ products), product quick-view modal, shopping cart sidebar, category filter, price range filter, sorting options, checkout form with validation, and responsive design. ALL CSS and JS must be inlined.', fileList: '- index.html (self-contained with inline CSS and JS)' }] },
    dashboard: { name: 'Dashboard', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'Analytics dashboard', phases: [{ name: 'Dashboard', instructions: 'Create an admin dashboard with: collapsible sidebar, 4+ stat cards, CSS-only charts, data table with sorting/search/pagination, activity feed, notification dropdown, dark theme, and responsive design. ALL CSS and JS must be inlined.', fileList: '- index.html (self-contained with inline CSS and JS)' }] },
    mobile: { name: 'Mobile App', tech: 'React Native+Expo', defaultDesc: 'Mobile app', phases: [{ name: 'App', instructions: 'Create an Expo app with tab navigation, home screen, profile screen, and settings screen.', fileList: '- package.json\n- app.json\n- App.js' }] },
    webapp: { name: 'Web App', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'Full-stack web application', phases: [{ name: 'App', instructions: 'Create a full-featured web app with: login/register forms, dashboard, CRUD with localStorage, settings page, sidebar navigation, and responsive design. ALL CSS and JS must be inlined.', fileList: '- index.html (self-contained with inline CSS and JS)' }] },
    saas: { name: 'SaaS', tech: 'HTML+CSS+JS (all inlined in single index.html)', defaultDesc: 'SaaS landing with auth', phases: [{ name: 'SaaS', instructions: 'Create a SaaS app with: landing page, login/register modals, dashboard with CRUD, profile/settings, sidebar navigation, and responsive design. ALL CSS and JS must be inlined.', fileList: '- index.html (self-contained with inline CSS and JS)' }] },
    'fullstack-mobile': { name: 'Full-Stack+Mobile', tech: 'React+Node+Socket.IO+RN', defaultDesc: 'Web+mobile', phases: [{ name: 'Backend', instructions: 'Express+Socket.IO API.', fileList: '- backend/package.json\n- backend/server.js' }, { name: 'Web', instructions: 'React+Vite with Socket.IO.', fileList: '- web/package.json\n- web/index.html\n- web/src/App.jsx' }, { name: 'Mobile', instructions: 'Expo app with Socket.IO.', fileList: '- mobile/package.json\n- mobile/app.json\n- mobile/App.js\n- README.md' }] },
  };
  return specs[template] || specs.portfolio;
}

module.exports = { callAI, callGemini, callClaude, callClaudeWithImages, callGroq, streamAI, analyzeCode, generateTutorial, generateProjectMultiStep, parseFilesFromResponse, verifyAndFix, verifyAIStatus, MODELS, GROQ_MAX_OUTPUT, GROQ_MODELS };
