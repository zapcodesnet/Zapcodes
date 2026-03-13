const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const MODELS = {
  groq: { models: ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'deepseek-r1-distill-llama-70b', 'mixtral-8x7b-32768'], maxOutput: 8192, contextLimit: 30000 },
  'gemini-2.5-flash': { model: 'gemini-2.5-flash', maxOutput: 65536, contextLimit: 1000000 },
  'gemini-3.1-pro': { model: 'gemini-2.5-pro-preview-06-05', maxOutput: 16384, contextLimit: 1000000 },
  'haiku-4.5': { model: 'claude-haiku-4-5-20251001', maxOutput: 16384, contextLimit: 180000 },
  'sonnet-4.6': { model: 'claude-sonnet-4-6-20260217', maxOutput: 16384, contextLimit: 200000 },
  'opus-4.6': { model: 'claude-opus-4-6', maxOutput: 128000, contextLimit: 200000 },
  // Legacy aliases
  'gemini-flash': { model: 'gemini-2.5-flash', maxOutput: 65536, contextLimit: 1000000 },
  'gemini-pro': { model: 'gemini-2.5-pro-preview-06-05', maxOutput: 16384, contextLimit: 1000000 },
  haiku: { model: 'claude-haiku-4-5-20251001', maxOutput: 16384, contextLimit: 180000 },
  sonnet: { model: 'claude-sonnet-4-6-20260217', maxOutput: 16384, contextLimit: 200000 },
};
const GROQ_MAX_OUTPUT = MODELS.groq.maxOutput;
const GROQ_MODELS = MODELS.groq.models;
const GROQ_VISION_MODELS = ['llama-3.2-90b-vision-preview', 'llama-3.2-11b-vision-preview'];

async function withRetry(fn, { maxRetries = 1, baseDelay = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(attempt); } catch (err) {
      lastErr = err; if (err.message === 'Generation cancelled') throw err;
      const s = err.response?.status;
      if (s && s !== 429 && s !== 503 && s !== 529 && s < 500) throw err;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt) + Math.random() * 500));
    }
  }
  throw lastErr;
}

function extractClaudeText(data) { if (!data?.content) return ''; return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n') || ''; }
function systemPromptToString(sp) { if (typeof sp === 'string') return sp; if (Array.isArray(sp)) return sp.map(b => b.text || '').join('\n'); return String(sp); }

// ================================================================
// callAI — Text-only
// ================================================================
async function callAI(systemPrompt, userPrompt, model = 'groq', maxTokens, opts = {}) {
  if (opts.signal?.aborted) throw new Error('Generation cancelled');
  switch (model) {
    case 'gemini-pro': case 'gemini-3.1-pro': return callGemini(systemPrompt, userPrompt, { model: MODELS['gemini-3.1-pro'].model, maxTokens: maxTokens || MODELS['gemini-3.1-pro'].maxOutput, label: 'Gemini 3.1 Pro', signal: opts.signal });
    case 'gemini-flash': case 'gemini-2.5-flash': return callGemini(systemPrompt, userPrompt, { model: MODELS['gemini-2.5-flash'].model, maxTokens: maxTokens || MODELS['gemini-2.5-flash'].maxOutput, label: 'Gemini 2.5 Flash', signal: opts.signal });
    case 'haiku': case 'haiku-4.5': return callClaude(systemPrompt, userPrompt, { model: MODELS['haiku-4.5'].model, maxTokens: maxTokens || MODELS['haiku-4.5'].maxOutput, label: 'Haiku 4.5', signal: opts.signal });
    case 'sonnet': case 'sonnet-4.6': return callClaude(systemPrompt, userPrompt, { model: MODELS['sonnet-4.6'].model, maxTokens: maxTokens || MODELS['sonnet-4.6'].maxOutput, label: 'Sonnet 4.6', signal: opts.signal });
    case 'opus': case 'opus-4.6': return callClaude(systemPrompt, userPrompt, { model: MODELS['opus-4.6'].model, maxTokens: maxTokens || 4096, label: 'Opus 4.6', signal: opts.signal });
    case 'groq': default: return callGroq(systemPrompt, userPrompt, { maxTokens: maxTokens || GROQ_MAX_OUTPUT, signal: opts.signal });
  }
}

// ================================================================
// callAIWithImage — Send image to ANY model's vision API
// ================================================================
async function callAIWithImage(systemPrompt, userPrompt, images, model = 'groq', maxTokens, opts = {}) {
  if (!images || images.length === 0) return callAI(systemPrompt, userPrompt, model, maxTokens, opts);
  const sysText = systemPromptToString(systemPrompt);

  // ── CLAUDE vision ──
  if (['opus', 'opus-4.6', 'sonnet', 'sonnet-4.6', 'haiku', 'haiku-4.5'].includes(model)) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return callGroqWithImage(sysText, userPrompt, images, { maxTokens: maxTokens || GROQ_MAX_OUTPUT });
    let modelId; switch (model) { case 'opus': case 'opus-4.6': modelId = MODELS['opus-4.6'].model; break; case 'sonnet': case 'sonnet-4.6': modelId = MODELS['sonnet-4.6'].model; break; default: modelId = MODELS['haiku-4.5'].model; }
    try {
      console.log(`[Claude+Vision] ${model} -> ${modelId} (${images.length} img)`);
      const blocks = []; for (const img of images) blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType || 'image/png', data: img.base64 } }); blocks.push({ type: 'text', text: userPrompt });
      const r = await axios.post(ANTHROPIC_API_URL, { model: modelId, max_tokens: maxTokens || 4096, system: [{ type: 'text', text: sysText, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: blocks }] }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 120000 });
      const c = extractClaudeText(r.data); if (c) { console.log(`[Claude+Vision] OK (${c.length}c)`); return c; } throw new Error('Empty');
    } catch (err) { if (err.message === 'Generation cancelled') throw err; console.error(`[Claude+Vision] X: ${err.response?.data?.error?.message || err.message}`); throw err; }
  }

  // ── GEMINI vision ──
  if (['gemini-flash', 'gemini-2.5-flash', 'gemini-pro', 'gemini-3.1-pro'].includes(model)) {
    const apiKey = process.env.GEMINI_API_KEY; if (!apiKey) return callGroqWithImage(sysText, userPrompt, images, { maxTokens: maxTokens || GROQ_MAX_OUTPUT });
    let modelId; switch (model) { case 'gemini-pro': case 'gemini-3.1-pro': modelId = MODELS['gemini-3.1-pro'].model; break; default: modelId = MODELS['gemini-2.5-flash'].model; }
    try {
      console.log(`[Gemini+Vision] ${model} -> ${modelId} (${images.length} img)`);
      const parts = []; for (const img of images) parts.push({ inlineData: { mimeType: img.mimeType || 'image/png', data: img.base64 } }); parts.push({ text: userPrompt });
      const r = await axios.post(`${GEMINI_API_URL}/${modelId}:generateContent?key=${apiKey}`, { contents: [{ role: 'user', parts }], systemInstruction: { parts: [{ text: sysText }] }, generationConfig: { maxOutputTokens: maxTokens || 65536, temperature: 0.2 } }, { headers: { 'Content-Type': 'application/json' }, timeout: 180000 });
      const text = r.data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || ''; if (text) { console.log(`[Gemini+Vision] OK (${text.length}c)`); return text; } throw new Error('Empty');
    } catch (err) { if (err.message === 'Generation cancelled') throw err; console.error(`[Gemini+Vision] X: ${err.response?.data?.error?.message || err.message}`); throw err; }
  }

  // ── GROQ vision ──
  return callGroqWithImage(sysText, userPrompt, images, { maxTokens: maxTokens || GROQ_MAX_OUTPUT, signal: opts.signal });
}

async function callGroqWithImage(systemText, userPrompt, images, options = {}) {
  const key = process.env.GROQ_API_KEY; if (!key) throw new Error('No GROQ_API_KEY');
  const blocks = []; for (const img of images) blocks.push({ type: 'image_url', image_url: { url: `data:${img.mimeType || 'image/png'};base64,${img.base64}` } }); blocks.push({ type: 'text', text: userPrompt });
  for (const vm of GROQ_VISION_MODELS) {
    try { console.log(`[Groq+Vision] ${vm}`); const r = await axios.post(GROQ_API_URL, { model: vm, messages: [{ role: 'system', content: systemText }, { role: 'user', content: blocks }], temperature: 0.2, max_tokens: options.maxTokens || GROQ_MAX_OUTPUT }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 120000 }); const c = r.data.choices?.[0]?.message?.content; if (c) { console.log(`[Groq+Vision] OK (${c.length}c)`); return c; } }
    catch (err) { const s = err.response?.status; console.error(`[Groq+Vision] X ${vm}: ${s}`); if (s === 401) break; }
  }
  throw new Error('All Groq vision models failed');
}

// ================================================================
// Text-only model calls
// ================================================================
async function callGemini(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY; if (!apiKey) return callGroq(systemPrompt, userPrompt, { maxTokens: GROQ_MAX_OUTPUT, signal: options.signal });
  const modelId = options.model || MODELS['gemini-2.5-flash'].model; const maxTokens = options.maxTokens || 65536; const label = options.label || 'Gemini';
  try {
    return await withRetry(async (attempt) => {
      if (options.signal?.aborted) throw new Error('Generation cancelled');
      console.log(`[Gemini] ${label} -> ${modelId}${attempt > 0 ? ' retry#' + attempt : ''}`);
      const r = await axios.post(`${GEMINI_API_URL}/${modelId}:generateContent?key=${apiKey}`, { contents: [{ role: 'user', parts: [{ text: userPrompt.slice(0, 900000) }] }], systemInstruction: { parts: [{ text: systemPromptToString(systemPrompt) }] }, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 } }, { headers: { 'Content-Type': 'application/json' }, timeout: 180000 });
      const c = r.data?.candidates?.[0]; if (!c) throw new Error('No candidates'); if (c.finishReason === 'SAFETY') throw new Error('Blocked');
      const text = c.content?.parts?.map(p => p.text || '').join('\n') || ''; if (text) { console.log(`[Gemini] OK ${label} (${text.length}c)`); return text; } throw new Error('Empty');
    }, { maxRetries: 1 });
  } catch (err) { if (err.message === 'Generation cancelled') throw err; console.error(`[Gemini] X ${modelId}: ${err.message}`); throw err; }
}

async function callClaude(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) return callGroq(systemPrompt, userPrompt, { maxTokens: GROQ_MAX_OUTPUT, signal: options.signal });
  const modelId = options.model || MODELS['haiku-4.5'].model; const maxTokens = options.maxTokens || 16384; const label = options.label || 'Claude';
  try {
    return await withRetry(async (attempt) => {
      if (options.signal?.aborted) throw new Error('Generation cancelled');
      console.log(`[Claude] ${label} -> ${modelId}${attempt > 0 ? ' retry#' + attempt : ''}`);
      const r = await axios.post(ANTHROPIC_API_URL, { model: modelId, max_tokens: maxTokens, system: [{ type: 'text', text: systemPromptToString(systemPrompt), cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: userPrompt.slice(0, 180000) }] }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 120000 });
      const c = extractClaudeText(r.data); if (c) { console.log(`[Claude] OK ${label} (${c.length}c)`); return c; } throw new Error('Empty');
    }, { maxRetries: 1 });
  } catch (err) { if (err.message === 'Generation cancelled') throw err; console.error(`[Claude] X ${modelId}: ${err.message}`); throw err; }
}

async function callGroq(systemPrompt, userPrompt, options = {}) {
  const key = process.env.GROQ_API_KEY; if (!key) return null;
  const sysText = systemPromptToString(systemPrompt);
  for (const model of GROQ_MODELS) {
    try {
      if (options.signal?.aborted) throw new Error('Generation cancelled');
      const result = await withRetry(async () => {
        const r = await axios.post(GROQ_API_URL, { model, messages: [{ role: 'system', content: sysText }, { role: 'user', content: userPrompt.slice(0, MODELS.groq.contextLimit) }], temperature: 0.2, max_tokens: options.maxTokens || GROQ_MAX_OUTPUT }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 120000 });
        const c = r.data.choices?.[0]?.message?.content; if (c) return c; throw new Error('Empty');
      }, { maxRetries: 1 });
      return result;
    } catch (err) { if (err.message === 'Generation cancelled') throw err; const s = err.response?.status; if (s === 401) break; if (s === 429) continue; throw err; }
  }
  return null;
}

// ================================================================
// IMAGE GENERATION
//
// VERTEX_AI_API_KEY = billing-enabled key for image generation
// GEMINI_API_KEY = text-only key (no billing, no image gen)
//
// Strategy (VERTEX_AI_API_KEY):
//   1. gemini-3.1-flash-image-preview — THE model from Vertex AI Studio
//   2. Imagen 3 (imagen-3.0-generate-002) — Vertex body format
//   3. Imagen 3 — Google AI body format
//   4. GEMINI_API_KEY fallback (if billing added later)
// ================================================================
async function generateImageImagen3(prompt, options = {}) {
  const vertexKey = process.env.VERTEX_AI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!vertexKey && !geminiKey) { console.warn('[ImageGen] No API keys'); return null; }

  const cleanPrompt = prompt.slice(0, 1000);
  const errors = [];

  // ══════════════════════════════════════════════════════════
  // ATTEMPT 1: gemini-3.1-flash-image-preview via VERTEX_AI_API_KEY
  // This is the EXACT model shown working in Vertex AI Studio
  // Uses generateContent with responseModalities: ['TEXT', 'IMAGE']
  // ══════════════════════════════════════════════════════════
  if (vertexKey) {
    try {
      console.log(`[ImageGen] ATTEMPT 1: gemini-3.1-flash-image-preview + VERTEX_AI_API_KEY`);
      const url = `${GEMINI_API_URL}/gemini-3.1-flash-image-preview:generateContent?key=${vertexKey}`;
      const r = await axios.post(url, {
        contents: [{ role: 'user', parts: [{ text: `Generate an image: ${cleanPrompt}` }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.8 },
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 90000 });

      const parts = r.data?.candidates?.[0]?.content?.parts || [];
      const imgParts = parts.filter(p => p.inlineData?.data && p.inlineData?.mimeType?.startsWith('image/'));
      if (imgParts.length > 0) {
        console.log(`[ImageGen] SUCCESS — gemini-3.1-flash-image-preview (${imgParts.length} image(s))`);
        return imgParts.map(p => ({ base64: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' }));
      }
      // Check if there's inlineData without explicit mimeType check
      const anyInline = parts.filter(p => p.inlineData?.data);
      if (anyInline.length > 0) {
        console.log(`[ImageGen] SUCCESS — gemini-3.1-flash-image-preview (${anyInline.length} inline data)`);
        return anyInline.map(p => ({ base64: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' }));
      }
      errors.push({ model: 'gemini-3.1-flash-image-preview', status: 200, note: `No images. Parts: ${parts.map(p => p.text ? 'text' : p.inlineData ? 'data' : 'other').join(',')}` });
    } catch (err) {
      const s = err.response?.status; const msg = (err.response?.data?.error?.message || err.message).slice(0, 200);
      errors.push({ model: 'gemini-3.1-flash-image-preview', status: s, error: msg });
      console.error(`[ImageGen] ATTEMPT 1 FAIL: ${s} — ${msg}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // ATTEMPT 2: Imagen 3 via VERTEX_AI_API_KEY (Vertex body format)
  // ══════════════════════════════════════════════════════════
  if (vertexKey) {
    for (const mid of ['imagen-3.0-generate-002', 'imagen-3.0-generate-001']) {
      try {
        console.log(`[ImageGen] ATTEMPT 2: ${mid} + VERTEX_AI_API_KEY (vertex format)`);
        const r = await axios.post(`${GEMINI_API_URL}/${mid}:predict?key=${vertexKey}`, {
          instances: [{ prompt: cleanPrompt }],
          parameters: { sampleCount: options.numberOfImages || 1, aspectRatio: options.aspectRatio || '1:1', personGeneration: 'dont_allow' },
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 90000 });
        if (r.data?.predictions?.length) {
          const imgs = r.data.predictions.filter(p => p.bytesBase64Encoded).map(p => ({ base64: p.bytesBase64Encoded, mimeType: p.mimeType || 'image/png' }));
          if (imgs.length) { console.log(`[ImageGen] SUCCESS — ${mid} (vertex format)`); return imgs; }
        }
        errors.push({ model: mid, method: 'vertex-fmt', status: 200, note: 'Empty predictions' });
      } catch (err) {
        const s = err.response?.status; errors.push({ model: mid, method: 'vertex-fmt', status: s, error: (err.response?.data?.error?.message || err.message).slice(0, 150) });
        console.error(`[ImageGen] ATTEMPT 2 ${mid}: ${s} — ${(err.response?.data?.error?.message || err.message).slice(0, 100)}`);
        if (s === 429 || (s && s >= 500)) break;
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // ATTEMPT 3: Imagen 3 via VERTEX_AI_API_KEY (Google AI body format)
  // ══════════════════════════════════════════════════════════
  if (vertexKey) {
    try {
      console.log(`[ImageGen] ATTEMPT 3: imagen-3.0-generate-002 + VERTEX_AI_API_KEY (google-ai format)`);
      const r = await axios.post(`${GEMINI_API_URL}/imagen-3.0-generate-002:predict?key=${vertexKey}`, {
        prompt: cleanPrompt,
        config: { numberOfImages: options.numberOfImages || 1, aspectRatio: options.aspectRatio || '1:1', personGeneration: 'DONT_ALLOW', outputOptions: { mimeType: 'image/png' } },
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 90000 });
      if (r.data?.predictions?.length) {
        const imgs = r.data.predictions.filter(p => p.bytesBase64Encoded).map(p => ({ base64: p.bytesBase64Encoded, mimeType: 'image/png' }));
        if (imgs.length) { console.log(`[ImageGen] SUCCESS — imagen google-ai format`); return imgs; }
      }
      if (r.data?.generatedImages?.length) {
        const imgs = r.data.generatedImages.filter(g => g.image?.imageBytes).map(g => ({ base64: g.image.imageBytes, mimeType: 'image/png' }));
        if (imgs.length) { console.log(`[ImageGen] SUCCESS — imagen generatedImages`); return imgs; }
      }
    } catch (err) { errors.push({ model: 'imagen-google-fmt', status: err.response?.status, error: (err.response?.data?.error?.message || err.message).slice(0, 150) }); }
  }

  // ══════════════════════════════════════════════════════════
  // ATTEMPT 4: Imagen 3 via GEMINI_API_KEY (fallback)
  // ══════════════════════════════════════════════════════════
  if (geminiKey && geminiKey !== vertexKey) {
    try {
      console.log(`[ImageGen] ATTEMPT 4: imagen + GEMINI_API_KEY`);
      const r = await axios.post(`${GEMINI_API_URL}/imagen-3.0-generate-002:predict?key=${geminiKey}`, {
        instances: [{ prompt: cleanPrompt }], parameters: { sampleCount: 1 },
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 });
      if (r.data?.predictions?.length) {
        const imgs = r.data.predictions.filter(p => p.bytesBase64Encoded).map(p => ({ base64: p.bytesBase64Encoded, mimeType: 'image/png' }));
        if (imgs.length) { console.log(`[ImageGen] SUCCESS — gemini-key imagen`); return imgs; }
      }
    } catch (err) { errors.push({ model: 'imagen-gemini-key', status: err.response?.status, error: (err.response?.data?.error?.message || err.message).slice(0, 100) }); }
  }

  console.warn(`[ImageGen] ALL ${errors.length} attempts failed:`);
  errors.forEach((e, i) => console.warn(`  ${i + 1}. ${e.model}: ${e.status || 'net'} — ${e.error || e.note}`));
  return null;
}

// ── Diagnostic endpoint ──
async function testImageGeneration() {
  const vertexKey = process.env.VERTEX_AI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const results = []; const tp = 'a blue circle on white background';

  // Test gemini-3.1-flash-image-preview with VERTEX_AI_API_KEY
  if (vertexKey) {
    try {
      const r = await axios.post(`${GEMINI_API_URL}/gemini-3.1-flash-image-preview:generateContent?key=${vertexKey}`, {
        contents: [{ role: 'user', parts: [{ text: `Generate image: ${tp}` }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }, { timeout: 60000 });
      const parts = r.data?.candidates?.[0]?.content?.parts || [];
      const hasImage = parts.some(p => p.inlineData);
      results.push({ method: 'gemini-3.1-flash-image-preview+VERTEX_KEY', status: 200, hasImage, partTypes: parts.map(p => p.text ? 'text' : p.inlineData ? 'IMAGE' : 'other') });
    } catch (e) { results.push({ method: 'gemini-3.1-flash-image-preview+VERTEX_KEY', status: e.response?.status, error: (e.response?.data?.error?.message || e.message).slice(0, 200) }); }

    // Test Imagen 3 with VERTEX_AI_API_KEY
    try {
      const r = await axios.post(`${GEMINI_API_URL}/imagen-3.0-generate-002:predict?key=${vertexKey}`, {
        instances: [{ prompt: tp }], parameters: { sampleCount: 1 },
      }, { timeout: 30000 });
      results.push({ method: 'imagen-3+VERTEX_KEY', status: 200, hasImage: !!r.data?.predictions?.length });
    } catch (e) { results.push({ method: 'imagen-3+VERTEX_KEY', status: e.response?.status, error: (e.response?.data?.error?.message || e.message).slice(0, 200) }); }
  }

  if (geminiKey) {
    try {
      const r = await axios.post(`${GEMINI_API_URL}/imagen-3.0-generate-002:predict?key=${geminiKey}`, {
        instances: [{ prompt: tp }], parameters: { sampleCount: 1 },
      }, { timeout: 30000 });
      results.push({ method: 'imagen-3+GEMINI_KEY', status: 200, hasImage: !!r.data?.predictions?.length });
    } catch (e) { results.push({ method: 'imagen-3+GEMINI_KEY', status: e.response?.status, error: (e.response?.data?.error?.message || e.message).slice(0, 200) }); }
  }

  return { vertexKeyPresent: !!vertexKey, geminiKeyPresent: !!geminiKey, results };
}

// ── Utilities ──
async function streamAI(sp, up, model, res) { const r = await callAI(sp, up, model); if (r) res.write(`data: ${JSON.stringify({ type: 'content', text: r })}\n\n`); res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`); return r; }
async function analyzeCode(files, engine = 'groq') { const fs = files.slice(0, 20).map(f => `--- ${f.path || f.name} ---\n${(f.content || '').slice(0, 4000)}`).join('\n\n'); const r = await callAI('Return ONLY valid JSON array of issues.', `Analyze:\n\n${fs}`, engine); if (r) { const m = r.match(/\[[\s\S]*\]/); if (m) try { return JSON.parse(m[0]); } catch {} } return []; }
async function verifyAndFix(files, model, opts = {}) { if (model === 'groq' || !files.length) return files; try { const r = await callAI('Return ONLY complete fixed files.', `Fix:\n\n${files.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n')}`, model, undefined, opts); const f = r ? parseFilesFromResponse(r) : []; if (f.length) return f; } catch {} return files; }
async function generateProjectMultiStep(template, projectName, desc, color, features, engine = 'groq', opts = {}) { const all = []; const spec = getTemplateSpec(template); for (let i = 0; i < spec.phases.length; i++) { if (opts.signal?.aborted) throw new Error('Generation cancelled'); const ph = spec.phases[i]; if (opts.onProgress) opts.onProgress(`Building ${ph.name}...`); const r = await callAI(`Project Builder. "${projectName}". ${spec.tech}. ${ph.instructions} COMPLETE files only.`, `Generate: ${ph.name}`, engine, undefined, opts); if (r) all.push(...parseFilesFromResponse(r)); } return all; }

function parseFilesFromResponse(response) {
  const files = []; let m;
  const p1 = /```filepath:([^\n]+)\n([\s\S]*?)```/g; while ((m = p1.exec(response))) { if (m[1].trim() && m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() }); } if (files.length) return dedup(files);
  const p2 = /```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|bash|sh|text|markdown|md)?\s+([^\n`]+\.[a-z]{1,6})\n([\s\S]*?)```/g; while ((m = p2.exec(response))) { if (m[1].trim() && m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() }); } if (files.length) return dedup(files);
  if (response.includes('<!DOCTYPE') || response.includes('<html')) { const h = response.match(/(<!DOCTYPE[\s\S]*<\/html>)/i); if (h?.[1]?.length > 100) files.push({ name: 'index.html', content: h[1].trim() }); }
  return dedup(files);
}
function dedup(files) { const s = new Map(); for (const f of files) { if (!s.has(f.name) || f.content.length > s.get(f.name).content.length) s.set(f.name, f); } return Array.from(s.values()); }

async function verifyAIStatus() { return { groq: { available: !!process.env.GROQ_API_KEY }, 'gemini-2.5-flash': { available: !!process.env.GEMINI_API_KEY }, 'gemini-3.1-pro': { available: !!process.env.GEMINI_API_KEY }, 'haiku-4.5': { available: !!process.env.ANTHROPIC_API_KEY }, 'sonnet-4.6': { available: !!process.env.ANTHROPIC_API_KEY }, 'opus-4.6': { available: !!process.env.ANTHROPIC_API_KEY }, 'imagen-3': { available: !!process.env.VERTEX_AI_API_KEY } }; }
async function generateTutorial(q) { const k = process.env.GROQ_API_KEY; if (!k) return '## ZapCodes Help'; for (const m of ['llama-3.1-8b-instant', 'gemma2-9b-it']) { try { const r = await axios.post(GROQ_API_URL, { model: m, messages: [{ role: 'system', content: 'Tutorial assistant.' }, { role: 'user', content: q }], temperature: 0.7, max_tokens: 1500 }, { headers: { 'Authorization': `Bearer ${k}` }, timeout: 15000 }); return r.data.choices[0].message.content; } catch {} } return '## ZapCodes Help'; }
function getTemplateSpec(t) { const s = { portfolio: { name: 'Portfolio', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Site', instructions: 'Portfolio. ALL inlined.', fileList: '- index.html' }] }, landing: { name: 'Landing', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Page', instructions: 'Landing page. ALL inlined.', fileList: '- index.html' }] }, blog: { name: 'Blog', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Blog', instructions: 'Blog. ALL inlined.', fileList: '- index.html' }] }, ecommerce: { name: 'E-Commerce', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Store', instructions: 'Store. ALL inlined.', fileList: '- index.html' }] }, dashboard: { name: 'Dashboard', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Dashboard', instructions: 'Dashboard. ALL inlined.', fileList: '- index.html' }] } }; return s[t] || s.portfolio; }

module.exports = { callAI, callAIWithImage, callGemini, callClaude, callGroq, callGroqWithImage, streamAI, analyzeCode, generateTutorial, generateProjectMultiStep, parseFilesFromResponse, verifyAndFix, verifyAIStatus, generateImageImagen3, testImageGeneration, MODELS, GROQ_MAX_OUTPUT, GROQ_MODELS };
