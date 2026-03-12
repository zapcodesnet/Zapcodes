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
// Groq vision models — used when user sends images
const GROQ_VISION_MODELS = ['llama-3.2-90b-vision-preview', 'llama-3.2-11b-vision-preview'];

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

// ================================================================
// callAI — Text-only AI call (no images)
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
// callAIWithImage — Send image + text to ANY AI model
// All models have vision: Claude, Gemini, Groq (Llama 3.2 Vision)
// images = [{ base64, mimeType }]
// ================================================================
async function callAIWithImage(systemPrompt, userPrompt, images, model = 'groq', maxTokens, opts = {}) {
  if (!images || images.length === 0) return callAI(systemPrompt, userPrompt, model, maxTokens, opts);
  if (opts.signal?.aborted) throw new Error('Generation cancelled');

  const sysText = systemPromptToString(systemPrompt);

  // ── CLAUDE (Opus, Sonnet, Haiku) — native vision ──
  if (['opus', 'opus-4.6', 'sonnet', 'sonnet-4.6', 'haiku', 'haiku-4.5'].includes(model)) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return callGroqWithImage(sysText, userPrompt, images, { maxTokens: maxTokens || GROQ_MAX_OUTPUT });

    let modelId;
    switch (model) {
      case 'opus': case 'opus-4.6': modelId = MODELS['opus-4.6'].model; break;
      case 'sonnet': case 'sonnet-4.6': modelId = MODELS['sonnet-4.6'].model; break;
      default: modelId = MODELS['haiku-4.5'].model;
    }
    const mt = maxTokens || 4096;

    try {
      console.log(`[Claude+Vision] ${model} -> ${modelId} (${images.length} image(s))`);
      const contentBlocks = [];
      for (const img of images) {
        contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType || 'image/png', data: img.base64 } });
      }
      contentBlocks.push({ type: 'text', text: userPrompt });

      const r = await axios.post(ANTHROPIC_API_URL, {
        model: modelId, max_tokens: mt,
        system: [{ type: 'text', text: sysText, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: contentBlocks }],
      }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 120000 });

      const c = extractClaudeText(r.data);
      if (c) { console.log(`[Claude+Vision] OK ${model} (${c.length}c)`); return c; }
      throw new Error('Empty response');
    } catch (err) {
      if (err.message === 'Generation cancelled') throw err;
      console.error(`[Claude+Vision] X ${model}: ${err.response?.data?.error?.message || err.message}`);
      throw err;
    }
  }

  // ── GEMINI (Flash, Pro) — native vision ──
  if (['gemini-flash', 'gemini-2.5-flash', 'gemini-pro', 'gemini-3.1-pro'].includes(model)) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return callGroqWithImage(sysText, userPrompt, images, { maxTokens: maxTokens || GROQ_MAX_OUTPUT });

    let modelId;
    switch (model) {
      case 'gemini-pro': case 'gemini-3.1-pro': modelId = MODELS['gemini-3.1-pro'].model; break;
      default: modelId = MODELS['gemini-2.5-flash'].model;
    }
    const mt = maxTokens || 65536;

    try {
      console.log(`[Gemini+Vision] ${model} -> ${modelId} (${images.length} image(s))`);
      const parts = [];
      for (const img of images) {
        parts.push({ inlineData: { mimeType: img.mimeType || 'image/png', data: img.base64 } });
      }
      parts.push({ text: userPrompt });

      const url = `${GEMINI_API_URL}/${modelId}:generateContent?key=${apiKey}`;
      const r = await axios.post(url, {
        contents: [{ role: 'user', parts }],
        systemInstruction: { parts: [{ text: sysText }] },
        generationConfig: { maxOutputTokens: mt, temperature: 0.2 },
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 180000 });

      const candidate = r.data?.candidates?.[0];
      if (!candidate) throw new Error('No candidates');
      if (candidate.finishReason === 'SAFETY') throw new Error('Content blocked by safety');
      const text = candidate.content?.parts?.map(p => p.text || '').join('\n') || '';
      if (text) { console.log(`[Gemini+Vision] OK ${model} (${text.length}c)`); return text; }
      throw new Error('Empty response');
    } catch (err) {
      if (err.message === 'Generation cancelled') throw err;
      console.error(`[Gemini+Vision] X ${model}: ${err.response?.data?.error?.message || err.message}`);
      throw err;
    }
  }

  // ── GROQ (Llama 3.2 Vision) ──
  return callGroqWithImage(sysText, userPrompt, images, { maxTokens: maxTokens || GROQ_MAX_OUTPUT, signal: opts.signal });
}

// ── Groq vision helper ──
async function callGroqWithImage(systemText, userPrompt, images, options = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('No GROQ_API_KEY');

  const contentBlocks = [];
  for (const img of images) {
    contentBlocks.push({ type: 'image_url', image_url: { url: `data:${img.mimeType || 'image/png'};base64,${img.base64}` } });
  }
  contentBlocks.push({ type: 'text', text: userPrompt });

  for (const visionModel of GROQ_VISION_MODELS) {
    try {
      console.log(`[Groq+Vision] -> ${visionModel} (${images.length} image(s))`);
      const r = await axios.post(GROQ_API_URL, {
        model: visionModel,
        messages: [
          { role: 'system', content: systemText },
          { role: 'user', content: contentBlocks },
        ],
        temperature: 0.2,
        max_tokens: options.maxTokens || GROQ_MAX_OUTPUT,
      }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 120000 });

      const c = r.data.choices?.[0]?.message?.content;
      if (c) { console.log(`[Groq+Vision] OK ${visionModel} (${c.length}c)`); return c; }
    } catch (err) {
      const s = err.response?.status;
      console.error(`[Groq+Vision] X ${visionModel}: ${s || 'net'} - ${err.response?.data?.error?.message || err.message}`);
      if (s === 401) break;
      if (s === 429) continue;
    }
  }
  throw new Error('All Groq vision models failed');
}

// ================================================================
// Standard text-only model calls
// ================================================================
async function callGemini(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return callGroq(systemPrompt, userPrompt, { maxTokens: GROQ_MAX_OUTPUT, signal: options.signal });
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
  if (!apiKey) return callGroq(systemPrompt, userPrompt, { maxTokens: GROQ_MAX_OUTPUT, signal: options.signal });
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

// ================================================================
// Image Generation — Gemini Imagen 3 with 5-tier fallback
// ================================================================
async function generateImageImagen3(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) { console.warn('[Imagen3] No API key'); return null; }
  const cleanPrompt = prompt.slice(0, 1000);
  const aspectRatio = options.aspectRatio || '1:1';
  const numberOfImages = options.numberOfImages || 1;
  const errors = [];

  // ATTEMPT 1: Imagen 3 — Google AI format
  for (const mid of ['imagen-3.0-generate-002', 'imagen-3.0-generate-001']) {
    try {
      console.log(`[Imagen3] ${mid} google-ai...`);
      const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${mid}:predict?key=${apiKey}`, { prompt: cleanPrompt, config: { numberOfImages, aspectRatio, personGeneration: 'DONT_ALLOW', outputOptions: { mimeType: 'image/png' } } }, { headers: { 'Content-Type': 'application/json' }, timeout: 90000 });
      if (r.data?.predictions?.length) { const imgs = r.data.predictions.filter(p => p.bytesBase64Encoded).map(p => ({ base64: p.bytesBase64Encoded, mimeType: p.mimeType || 'image/png' })); if (imgs.length) { console.log(`[Imagen3] OK ${mid}`); return imgs; } }
      if (r.data?.generatedImages?.length) { const imgs = r.data.generatedImages.filter(g => g.image?.imageBytes).map(g => ({ base64: g.image.imageBytes, mimeType: 'image/png' })); if (imgs.length) { console.log(`[Imagen3] OK ${mid}`); return imgs; } }
      errors.push({ model: mid, method: 'google-ai', status: 200, note: `Empty. Keys: ${Object.keys(r.data || {}).join(',')}` });
    } catch (err) { const s = err.response?.status; errors.push({ model: mid, method: 'google-ai', status: s, error: err.response?.data?.error?.message || err.message }); if (s === 404 || s === 400 || s === 403) continue; if (s === 429 || (s && s >= 500)) break; }
  }

  // ATTEMPT 2: Vertex format
  for (const mid of ['imagen-3.0-generate-002', 'imagen-3.0-generate-001']) {
    try {
      console.log(`[Imagen3] ${mid} vertex...`);
      const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${mid}:predict?key=${apiKey}`, { instances: [{ prompt: cleanPrompt }], parameters: { sampleCount: numberOfImages, aspectRatio, personGeneration: 'dont_allow' } }, { headers: { 'Content-Type': 'application/json' }, timeout: 90000 });
      if (r.data?.predictions?.length) { const imgs = r.data.predictions.filter(p => p.bytesBase64Encoded).map(p => ({ base64: p.bytesBase64Encoded, mimeType: 'image/png' })); if (imgs.length) { console.log(`[Imagen3] OK vertex ${mid}`); return imgs; } }
      errors.push({ model: mid, method: 'vertex', status: 200, note: 'Empty' });
    } catch (err) { const s = err.response?.status; errors.push({ model: mid, method: 'vertex', status: s, error: err.response?.data?.error?.message || err.message }); if (s === 404 || s === 400 || s === 403) continue; break; }
  }

  // ATTEMPT 3: generateImages endpoint
  for (const mid of ['imagen-3.0-generate-002', 'imagen-3.0-generate-001']) {
    try {
      console.log(`[Imagen3] ${mid} generateImages...`);
      const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${mid}:generateImages?key=${apiKey}`, { prompt: cleanPrompt, config: { numberOfImages, aspectRatio } }, { headers: { 'Content-Type': 'application/json' }, timeout: 90000 });
      if (r.data?.generatedImages?.length) { const imgs = r.data.generatedImages.filter(g => g.image?.imageBytes).map(g => ({ base64: g.image.imageBytes, mimeType: 'image/png' })); if (imgs.length) { console.log(`[Imagen3] OK generateImages ${mid}`); return imgs; } }
      if (r.data?.predictions?.length) { const imgs = r.data.predictions.filter(p => p.bytesBase64Encoded).map(p => ({ base64: p.bytesBase64Encoded, mimeType: 'image/png' })); if (imgs.length) return imgs; }
      errors.push({ model: mid, method: 'generateImages', status: 200, note: 'Empty' });
    } catch (err) { const s = err.response?.status; errors.push({ model: mid, method: 'generateImages', status: s, error: err.response?.data?.error?.message || err.message }); if (s === 404 || s === 400 || s === 403) continue; break; }
  }

  // ATTEMPT 4: Gemini Flash native TEXT+IMAGE
  for (const fm of ['gemini-2.0-flash-preview-image-generation', 'gemini-2.0-flash-exp', 'gemini-2.0-flash']) {
    try {
      console.log(`[Imagen3] ${fm} native...`);
      const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${fm}:generateContent?key=${apiKey}`, { contents: [{ role: 'user', parts: [{ text: `Generate an image with no text overlay: ${cleanPrompt}` }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }, { headers: { 'Content-Type': 'application/json' }, timeout: 90000 });
      const parts = r.data?.candidates?.[0]?.content?.parts || [];
      const ip = parts.filter(p => p.inlineData?.data);
      if (ip.length) { console.log(`[Imagen3] OK ${fm} native`); return ip.map(p => ({ base64: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' })); }
      errors.push({ model: fm, method: 'native', status: 200, note: `Parts: ${parts.map(p => p.text ? 'text' : 'other').join(',')}` });
    } catch (err) { const s = err.response?.status; errors.push({ model: fm, method: 'native', status: s, error: err.response?.data?.error?.message || err.message }); if (s === 404 || s === 400) continue; break; }
  }

  // ATTEMPT 5: IMAGE-only modality
  for (const fm of ['gemini-2.0-flash-preview-image-generation', 'gemini-2.0-flash-exp']) {
    try {
      console.log(`[Imagen3] ${fm} IMAGE-only...`);
      const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${fm}:generateContent?key=${apiKey}`, { contents: [{ role: 'user', parts: [{ text: `Create: ${cleanPrompt}` }] }], generationConfig: { responseModalities: ['IMAGE'] } }, { headers: { 'Content-Type': 'application/json' }, timeout: 90000 });
      const parts = r.data?.candidates?.[0]?.content?.parts || [];
      const ip = parts.filter(p => p.inlineData?.data);
      if (ip.length) { console.log(`[Imagen3] OK ${fm} IMAGE-only`); return ip.map(p => ({ base64: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' })); }
      errors.push({ model: fm, method: 'IMAGE-only', status: 200, note: 'No image' });
    } catch (err) { const s = err.response?.status; errors.push({ model: fm, method: 'IMAGE-only', status: s, error: err.response?.data?.error?.message || err.message }); if (s === 404 || s === 400) continue; break; }
  }

  console.warn(`[Imagen3] ALL ${errors.length} attempts failed`);
  errors.forEach((e, i) => console.warn(`  ${i + 1}. ${e.model}/${e.method}: ${e.status || 'net'} — ${e.error || e.note}`));
  return null;
}

// ── Diagnostic: test all image gen methods ──
async function testImageGeneration() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { error: 'No GEMINI_API_KEY', keyPresent: false };
  const results = []; const tp = 'A simple blue circle on white background';

  const tests = [
    { method: 'imagen-002-google-ai', url: `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`, body: { prompt: tp, config: { numberOfImages: 1 } } },
    { method: 'imagen-002-vertex', url: `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`, body: { instances: [{ prompt: tp }], parameters: { sampleCount: 1 } } },
    { method: 'imagen-002-generateImages', url: `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:generateImages?key=${apiKey}`, body: { prompt: tp, config: { numberOfImages: 1 } } },
    { method: 'flash-preview-image-gen', url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${apiKey}`, body: { contents: [{ role: 'user', parts: [{ text: `Generate image: ${tp}` }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } } },
    { method: 'flash-exp-TEXT+IMAGE', url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, body: { contents: [{ role: 'user', parts: [{ text: `Generate image: ${tp}` }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } } },
    { method: 'flash-exp-IMAGE-only', url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, body: { contents: [{ role: 'user', parts: [{ text: `Create: ${tp}` }] }], generationConfig: { responseModalities: ['IMAGE'] } } },
  ];

  for (const t of tests) {
    try {
      const r = await axios.post(t.url, t.body, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
      const hasImg = !!(r.data?.predictions?.length || r.data?.generatedImages?.length || r.data?.candidates?.[0]?.content?.parts?.some(p => p.inlineData));
      results.push({ method: t.method, status: 200, hasImage: hasImg, keys: Object.keys(r.data || {}) });
    } catch (err) { results.push({ method: t.method, status: err.response?.status, error: err.response?.data?.error?.message || err.message }); }
  }
  return { keyPresent: true, keyPrefix: apiKey.slice(0, 8) + '...', results };
}

// ── Standard Groq text-only ──
async function callGroq(systemPrompt, userPrompt, options = {}) {
  const key = process.env.GROQ_API_KEY; if (!key) return null;
  const maxTokens = options.maxTokens || GROQ_MAX_OUTPUT; const sysText = systemPromptToString(systemPrompt);
  for (const model of GROQ_MODELS) {
    try {
      if (options.signal?.aborted) throw new Error('Generation cancelled');
      const result = await withRetry(async () => {
        if (options.signal?.aborted) throw new Error('Generation cancelled');
        const r = await axios.post(GROQ_API_URL, { model, messages: [{ role: 'system', content: sysText }, { role: 'user', content: userPrompt.slice(0, MODELS.groq.contextLimit) }], temperature: 0.2, max_tokens: maxTokens }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 120000 });
        const c = r.data.choices?.[0]?.message?.content; if (c) return c; throw new Error('Empty');
      }, { maxRetries: 1 });
      return result;
    } catch (err) { if (err.message === 'Generation cancelled') throw err; const s = err.response?.status; if (s === 401) break; if (s === 429) continue; throw err; }
  }
  return null;
}

// ── Utility exports ──
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

async function verifyAIStatus() { return { groq: { available: !!process.env.GROQ_API_KEY }, 'gemini-2.5-flash': { available: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) }, 'gemini-3.1-pro': { available: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) }, 'haiku-4.5': { available: !!process.env.ANTHROPIC_API_KEY }, 'sonnet-4.6': { available: !!process.env.ANTHROPIC_API_KEY }, 'opus-4.6': { available: !!process.env.ANTHROPIC_API_KEY }, 'imagen-3': { available: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) } }; }
async function generateTutorial(q) { const k = process.env.GROQ_API_KEY; if (!k) return '## ZapCodes Help'; for (const m of ['llama-3.1-8b-instant', 'gemma2-9b-it']) { try { const r = await axios.post(GROQ_API_URL, { model: m, messages: [{ role: 'system', content: 'Tutorial assistant.' }, { role: 'user', content: q }], temperature: 0.7, max_tokens: 1500 }, { headers: { 'Authorization': `Bearer ${k}` }, timeout: 15000 }); return r.data.choices[0].message.content; } catch {} } return '## ZapCodes Help'; }
function getTemplateSpec(t) { const s = { portfolio: { name: 'Portfolio', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Site', instructions: 'Portfolio. ALL inlined.', fileList: '- index.html' }] }, landing: { name: 'Landing', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Page', instructions: 'Landing page. ALL inlined.', fileList: '- index.html' }] }, blog: { name: 'Blog', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Blog', instructions: 'Blog. ALL inlined.', fileList: '- index.html' }] }, ecommerce: { name: 'E-Commerce', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Store', instructions: 'Store. ALL inlined.', fileList: '- index.html' }] }, dashboard: { name: 'Dashboard', tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Dashboard', instructions: 'Dashboard. ALL inlined.', fileList: '- index.html' }] } }; return s[t] || s.portfolio; }

module.exports = { callAI, callAIWithImage, callGemini, callClaude, callClaudeWithImages, callGroq, callGroqWithImage, streamAI, analyzeCode, generateTutorial, generateProjectMultiStep, parseFilesFromResponse, verifyAndFix, verifyAIStatus, generateImageImagen3, testImageGeneration, MODELS, GROQ_MAX_OUTPUT, GROQ_MODELS };
