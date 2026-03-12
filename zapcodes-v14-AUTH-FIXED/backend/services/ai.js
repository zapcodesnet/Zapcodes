const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const MODELS = {
  groq: { models: ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'deepseek-r1-distill-llama-70b', 'mixtral-8x7b-32768'], maxOutput: 8192, contextLimit: 30000 },
  'gemini-flash': { model: 'gemini-2.5-flash', maxOutput: 65536, contextLimit: 1000000 },
  'gemini-pro': { model: 'gemini-2.5-pro-preview-06-05', maxOutput: 16384, contextLimit: 1000000 },
  haiku: { model: 'claude-haiku-4-5-20251001', maxOutput: 16384, contextLimit: 180000 },
  sonnet: { model: 'claude-sonnet-4-6-20260217', maxOutput: 16384, contextLimit: 200000 },
  'gemini-2.5-flash': { model: 'gemini-2.5-flash', maxOutput: 65536, contextLimit: 1000000 },
  'gemini-3.1-pro': { model: 'gemini-2.5-pro-preview-06-05', maxOutput: 16384, contextLimit: 1000000 },
  'haiku-4.5': { model: 'claude-haiku-4-5-20251001', maxOutput: 16384, contextLimit: 180000 },
  'sonnet-4.6': { model: 'claude-sonnet-4-6-20260217', maxOutput: 16384, contextLimit: 200000 },
  'opus-4.6': { model: 'claude-opus-4-6', maxOutput: 128000, contextLimit: 200000 },
};
const GROQ_MAX_OUTPUT = MODELS.groq.maxOutput;
const GROQ_MODELS = MODELS.groq.models;

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

function extractClaudeText(data) { if (!data?.content) return ''; return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n') || ''; }
function systemPromptToString(sp) { if (typeof sp === 'string') return sp; if (Array.isArray(sp)) return sp.map(b => b.text || '').join('\n'); return String(sp); }

async function callAI(systemPrompt, userPrompt, model = 'groq', maxTokens, opts = {}) {
  if (opts.signal?.aborted) throw new Error('Generation cancelled');
  switch (model) {
    case 'gemini-pro': case 'gemini-3.1-pro': return callGemini(systemPrompt, userPrompt, { model: MODELS['gemini-3.1-pro'].model, maxTokens: maxTokens || MODELS['gemini-3.1-pro'].maxOutput, label: 'Gemini 3.1 Pro', onProgress: opts.onProgress, signal: opts.signal });
    case 'gemini-flash': case 'gemini-2.5-flash': return callGemini(systemPrompt, userPrompt, { model: MODELS['gemini-2.5-flash'].model, maxTokens: maxTokens || MODELS['gemini-2.5-flash'].maxOutput, label: 'Gemini 2.5 Flash', onProgress: opts.onProgress, signal: opts.signal });
    case 'haiku': case 'haiku-4.5': return callClaude(systemPrompt, userPrompt, { model: MODELS['haiku-4.5'].model, maxTokens: maxTokens || MODELS['haiku-4.5'].maxOutput, label: 'Haiku 4.5', onProgress: opts.onProgress, signal: opts.signal });
    case 'sonnet': case 'sonnet-4.6': return callClaude(systemPrompt, userPrompt, { model: MODELS['sonnet-4.6'].model, maxTokens: maxTokens || MODELS['sonnet-4.6'].maxOutput, label: 'Sonnet 4.6', onProgress: opts.onProgress, signal: opts.signal });
    case 'opus': case 'opus-4.6': return callClaude(systemPrompt, userPrompt, { model: MODELS['opus-4.6'].model, maxTokens: maxTokens || 4096, label: 'Opus 4.6', onProgress: opts.onProgress, signal: opts.signal });
    case 'groq': default: return callGroq(systemPrompt, userPrompt, { maxTokens: maxTokens || GROQ_MAX_OUTPUT, onProgress: opts.onProgress, signal: opts.signal });
  }
}

async function callGemini(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return callGroq(systemPrompt, userPrompt, { maxTokens: GROQ_MAX_OUTPUT, onProgress: options.onProgress, signal: options.signal });
  const modelId = options.model || MODELS['gemini-2.5-flash'].model; const maxTokens = options.maxTokens || 65536; const label = options.label || 'Gemini';
  try {
    return await withRetry(async (attempt) => {
      if (options.signal?.aborted) throw new Error('Generation cancelled');
      console.log(`[Gemini] ${label} -> ${modelId}${attempt > 0 ? ' retry #' + attempt : ''}`);
      const r = await axios.post(`${GEMINI_API_URL}/${modelId}:generateContent?key=${apiKey}`, { contents: [{ role: 'user', parts: [{ text: userPrompt.slice(0, 900000) }] }], systemInstruction: { parts: [{ text: systemPromptToString(systemPrompt) }] }, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 } }, { headers: { 'Content-Type': 'application/json' }, timeout: 180000 });
      const c = r.data?.candidates?.[0]; if (!c) throw new Error('No candidates'); if (c.finishReason === 'SAFETY') throw new Error('Blocked');
      const text = c.content?.parts?.map(p => p.text || '').join('\n') || ''; if (text) { console.log(`[Gemini] OK ${label} (${text.length}c)`); return text; } throw new Error('Empty');
    }, { maxRetries: 1 });
  } catch (err) { if (err.message === 'Generation cancelled') throw err; console.error(`[Gemini] X ${modelId}: ${err.message}`); throw err; }
}

async function callClaude(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return callGroq(systemPrompt, userPrompt, { maxTokens: GROQ_MAX_OUTPUT, onProgress: options.onProgress, signal: options.signal });
  const modelId = options.model || MODELS['haiku-4.5'].model; const maxTokens = options.maxTokens || 16384; const label = options.label || 'Claude';
  try {
    return await withRetry(async (attempt) => {
      if (options.signal?.aborted) throw new Error('Generation cancelled');
      console.log(`[Claude] ${label} -> ${modelId}${attempt > 0 ? ' retry #' + attempt : ''}`);
      const r = await axios.post(ANTHROPIC_API_URL, { model: modelId, max_tokens: maxTokens, system: [{ type: 'text', text: systemPromptToString(systemPrompt), cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: userPrompt.slice(0, 180000) }] }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 120000 });
      const c = extractClaudeText(r.data); if (c) { console.log(`[Claude] OK ${label} (${c.length}c)`); return c; } throw new Error('Empty');
    }, { maxRetries: 1 });
  } catch (err) { if (err.message === 'Generation cancelled') throw err; console.error(`[Claude] X ${modelId}: ${err.message}`); throw err; }
}

async function callClaudeWithImages(systemPrompt, userPrompt, images = [], options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) return null;
  try { const blocks = images.map(img => ({ type: 'image', source: { type: 'base64', media_type: img.mimeType || 'image/png', data: img.base64 } })); blocks.push({ type: 'text', text: userPrompt }); const r = await axios.post(ANTHROPIC_API_URL, { model: options.model || MODELS['haiku-4.5'].model, max_tokens: options.maxTokens || 16384, system: [{ type: 'text', text: systemPromptToString(systemPrompt), cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: blocks }] }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 120000 }); return extractClaudeText(r.data); } catch (err) { return null; }
}

async function generateImageImagen3(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;
  const aspectRatio = options.aspectRatio || '1:1'; const numberOfImages = options.numberOfImages || 1; const cp = prompt.slice(0, 1000);
  for (const m of ['imagen-3.0-generate-002', 'imagen-3.0-generate-001']) {
    try { const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateImages?key=${apiKey}`, { instances: [{ prompt: cp }], parameters: { sampleCount: numberOfImages, aspectRatio } }, { headers: { 'Content-Type': 'application/json' }, timeout: 90000 }); const p = r.data?.predictions; if (p?.length) { const i = p.filter(x => x.bytesBase64Encoded).map(x => ({ base64: x.bytesBase64Encoded, mimeType: x.mimeType || 'image/png' })); if (i.length) return i; } const g = r.data?.generatedImages; if (g?.length) { const i = g.filter(x => x.image?.imageBytes).map(x => ({ base64: x.image.imageBytes, mimeType: 'image/png' })); if (i.length) return i; } } catch (e) { const s = e.response?.status; if (s === 404 || s === 400 || s === 403) continue; if (s === 429 || (s && s >= 500)) break; }
  }
  for (const m of ['imagen-3.0-generate-002', 'imagen-3.0-generate-001']) {
    try { const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${m}:predict?key=${apiKey}`, { instances: [{ prompt: cp }], parameters: { sampleCount: numberOfImages, aspectRatio, personGeneration: 'dont_allow' } }, { headers: { 'Content-Type': 'application/json' }, timeout: 90000 }); const p = r.data?.predictions; if (p?.length) { const i = p.filter(x => x.bytesBase64Encoded).map(x => ({ base64: x.bytesBase64Encoded, mimeType: x.mimeType || 'image/png' })); if (i.length) return i; } } catch (e) { const s = e.response?.status; if (s === 404 || s === 400 || s === 403) continue; break; }
  }
  for (const fm of ['gemini-2.0-flash-preview-image-generation', 'gemini-2.0-flash-exp', 'gemini-2.0-flash']) {
    try { const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${fm}:generateContent?key=${apiKey}`, { contents: [{ role: 'user', parts: [{ text: `Generate an image with no text overlay: ${cp}` }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }, { headers: { 'Content-Type': 'application/json' }, timeout: 90000 }); const parts = r.data?.candidates?.[0]?.content?.parts || []; const ip = parts.filter(p => p.inlineData?.data); if (ip.length) return ip.map(p => ({ base64: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' })); } catch (e) { const s = e.response?.status; if (s === 404 || s === 400) continue; break; }
  }
  return null;
}

async function callGroq(systemPrompt, userPrompt, options = {}) {
  const key = process.env.GROQ_API_KEY; if (!key) return null;
  const maxTokens = options.maxTokens || GROQ_MAX_OUTPUT; const sysText = systemPromptToString(systemPrompt);
  for (const model of GROQ_MODELS) {
    try { if (options.signal?.aborted) throw new Error('Generation cancelled'); const result = await withRetry(async () => { if (options.signal?.aborted) throw new Error('Generation cancelled'); const r = await axios.post(GROQ_API_URL, { model, messages: [{ role: 'system', content: sysText }, { role: 'user', content: userPrompt.slice(0, MODELS.groq.contextLimit) }], temperature: 0.2, max_tokens: maxTokens }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 120000 }); const c = r.data.choices?.[0]?.message?.content; if (c) return c; throw new Error('Empty'); }, { maxRetries: 1 }); return result; }
    catch (err) { if (err.message === 'Generation cancelled') throw err; const s = err.response?.status; if (s === 401) break; if (s === 429) continue; throw err; }
  }
  return null;
}

async function streamAI(sp, up, model, res) { const r = await callAI(sp, up, model); if (r) res.write(`data: ${JSON.stringify({ type: 'content', text: r })}\n\n`); res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`); return r; }
async function analyzeCode(files, engine = 'groq') { const fs = files.slice(0, 20).map(f => `--- ${f.path || f.name} ---\n${(f.content || '').slice(0, 4000)}`).join('\n\n'); const r = await callAI('You are ZapCodes AI code analyzer. Return ONLY valid JSON array.', `Analyze:\n\n${fs}`, engine); if (r) { const m = r.match(/\[[\s\S]*\]/); if (m) try { return JSON.parse(m[0]); } catch {} } return []; }
async function verifyAndFix(files, model, opts = {}) { if (model === 'groq' || !files.length) return files; try { const r = await callAI('Return ONLY complete fixed files.', `Fix:\n\n${files.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n')}`, model, undefined, opts); const f = r ? parseFilesFromResponse(r) : []; if (f.length) return f; } catch {} return files; }
async function generateProjectMultiStep(template, projectName, desc, color, features, engine = 'groq', opts = {}) { const all = []; const spec = getTemplateSpec(template); for (let i = 0; i < spec.phases.length; i++) { if (opts.signal?.aborted) throw new Error('Generation cancelled'); const ph = spec.phases[i]; if (opts.onProgress) opts.onProgress(`Building ${ph.name}...`); const r = await callAI(`Project Builder Phase ${i+1}. "${projectName}". ${spec.tech}. ${ph.instructions} COMPLETE files only.`, `Generate Phase ${i+1}: ${ph.name}`, engine, undefined, opts); if (r) all.push(...parseFilesFromResponse(r)); } return all; }

function parseFilesFromResponse(response) {
  const files = []; let m;
  const p1 = /```filepath:([^\n]+)\n([\s\S]*?)```/g; while ((m = p1.exec(response))) { if (m[1].trim() && m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() }); } if (files.length) return dedup(files);
  const p2 = /```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|bash|sh|text|markdown|md)?\s+([^\n`]+\.[a-z]{1,6})\n([\s\S]*?)```/g; while ((m = p2.exec(response))) { if (m[1].trim() && m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() }); } if (files.length) return dedup(files);
  if (response.includes('<!DOCTYPE') || response.includes('<html')) { const h = response.match(/(<!DOCTYPE[\s\S]*<\/html>)/i); if (h?.[1]?.length > 100) files.push({ name: 'index.html', content: h[1].trim() }); }
  return dedup(files);
}
function dedup(files) { const s = new Map(); for (const f of files) { if (!s.has(f.name) || f.content.length > s.get(f.name).content.length) s.set(f.name, f); } return Array.from(s.values()); }

async function verifyAIStatus() { const r = { groq: { available: false, models: [] }, 'gemini-2.5-flash': { available: false }, 'gemini-3.1-pro': { available: false }, 'haiku-4.5': { available: false }, 'sonnet-4.6': { available: false }, 'opus-4.6': { available: false }, 'imagen-3': { available: false }, 'gemini-flash': { available: false }, 'gemini-pro': { available: false }, haiku: { available: false }, sonnet: { available: false } }; return r; }
async function generateTutorial(q) { const k = process.env.GROQ_API_KEY; if (!k) return '## ZapCodes Help'; for (const m of ['llama-3.1-8b-instant', 'gemma2-9b-it']) { try { const r = await axios.post(GROQ_API_URL, { model: m, messages: [{ role: 'system', content: 'Tutorial assistant. Markdown.' }, { role: 'user', content: q }], temperature: 0.7, max_tokens: 1500 }, { headers: { 'Authorization': `Bearer ${k}` }, timeout: 15000 }); return r.data.choices[0].message.content; } catch {} } return '## ZapCodes Help'; }
function getTemplateSpec(t) { const s = { portfolio: { name: 'Portfolio', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Site', instructions: 'Portfolio. ALL inlined.', fileList: '- index.html' }] }, landing: { name: 'Landing', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Page', instructions: 'Landing page. ALL inlined.', fileList: '- index.html' }] }, blog: { name: 'Blog', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Blog', instructions: 'Blog. ALL inlined.', fileList: '- index.html' }] }, ecommerce: { name: 'E-Commerce', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Store', instructions: 'Store. ALL inlined.', fileList: '- index.html' }] }, dashboard: { name: 'Dashboard', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Dashboard', instructions: 'Dashboard. ALL inlined.', fileList: '- index.html' }] } }; return s[t] || s.portfolio; }

module.exports = { callAI, callGemini, callClaude, callClaudeWithImages, callGroq, streamAI, analyzeCode, generateTutorial, generateProjectMultiStep, parseFilesFromResponse, verifyAndFix, verifyAIStatus, generateImageImagen3, MODELS, GROQ_MAX_OUTPUT, GROQ_MODELS };
