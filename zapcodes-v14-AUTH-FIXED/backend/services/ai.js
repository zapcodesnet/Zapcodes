const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// ================================================================
// MODEL IDs — VERIFIED March 2026
// ================================================================
const MODELS = {
  groq: {
    models: ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'deepseek-r1-distill-llama-70b', 'mixtral-8x7b-32768'],
    maxOutput: 8192,
    contextLimit: 30000,
  },
  'gemini-2.5-flash': { model: 'gemini-2.5-flash', maxOutput: 65536, contextLimit: 1000000 },
  'gemini-3.1-pro':   { model: 'gemini-3.1-pro-preview', maxOutput: 65536, contextLimit: 1000000 },
  'haiku-4.5':        { model: 'claude-haiku-4-5-20251001', maxOutput: 16384, contextLimit: 180000 },
  'sonnet-4.6':       { model: 'claude-sonnet-4-6-20250514', maxOutput: 16384, contextLimit: 200000 },
  'opus-4.6':         { model: 'claude-opus-4-6', maxOutput: 128000, contextLimit: 200000 },
  // Legacy aliases
  'gemini-flash': { model: 'gemini-2.5-flash', maxOutput: 65536, contextLimit: 1000000 },
  'gemini-pro':   { model: 'gemini-3.1-pro-preview', maxOutput: 65536, contextLimit: 1000000 },
  haiku:          { model: 'claude-haiku-4-5-20251001', maxOutput: 16384, contextLimit: 180000 },
  sonnet:         { model: 'claude-sonnet-4-6-20250514', maxOutput: 16384, contextLimit: 200000 },
};

const GROQ_MAX_OUTPUT = MODELS.groq.maxOutput;
const GROQ_MODELS = MODELS.groq.models;
const GROQ_VISION_MODELS = ['llama-3.2-90b-vision-preview', 'llama-3.2-11b-vision-preview'];

// ================================================================
// RETRY HELPER
// ================================================================
async function withRetry(fn, { maxRetries = 1, baseDelay = 1000 } = {}) {
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
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt) + Math.random() * 500));
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
// callAI — Text-only routing
// ================================================================
async function callAI(systemPrompt, userPrompt, model = 'groq', maxTokens, opts = {}) {
  if (opts.signal?.aborted) throw new Error('Generation cancelled');
  switch (model) {
    case 'gemini-pro':
    case 'gemini-3.1-pro':
      return callGemini(systemPrompt, userPrompt, { model: MODELS['gemini-3.1-pro'].model, maxTokens: maxTokens || MODELS['gemini-3.1-pro'].maxOutput, label: 'Gemini 3.1 Pro', signal: opts.signal, onProgress: opts.onProgress });
    case 'gemini-flash':
    case 'gemini-2.5-flash':
      return callGemini(systemPrompt, userPrompt, { model: MODELS['gemini-2.5-flash'].model, maxTokens: maxTokens || MODELS['gemini-2.5-flash'].maxOutput, label: 'Gemini 2.5 Flash', signal: opts.signal, onProgress: opts.onProgress });
    case 'haiku':
    case 'haiku-4.5':
      return callClaude(systemPrompt, userPrompt, { model: MODELS['haiku-4.5'].model, maxTokens: maxTokens || MODELS['haiku-4.5'].maxOutput, label: 'Haiku 4.5', signal: opts.signal, onProgress: opts.onProgress });
    case 'sonnet':
    case 'sonnet-4.6':
      return callClaude(systemPrompt, userPrompt, { model: MODELS['sonnet-4.6'].model, maxTokens: maxTokens || MODELS['sonnet-4.6'].maxOutput, label: 'Sonnet 4.6', signal: opts.signal, onProgress: opts.onProgress });
    case 'opus':
    case 'opus-4.6':
      return callClaude(systemPrompt, userPrompt, { model: MODELS['opus-4.6'].model, maxTokens: maxTokens || 4096, label: 'Opus 4.6', signal: opts.signal, onProgress: opts.onProgress });
    case 'groq':
    default:
      return callGroq(systemPrompt, userPrompt, { maxTokens: maxTokens || GROQ_MAX_OUTPUT, signal: opts.signal, onProgress: opts.onProgress });
  }
}

// ================================================================
// callAIWithImage — Vision API for any model
// ================================================================
async function callAIWithImage(systemPrompt, userPrompt, images, model = 'groq', maxTokens, opts = {}) {
  if (!images || images.length === 0) return callAI(systemPrompt, userPrompt, model, maxTokens, opts);
  const sysText = systemPromptToString(systemPrompt);

  if (['opus', 'opus-4.6', 'sonnet', 'sonnet-4.6', 'haiku', 'haiku-4.5'].includes(model)) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return callGroqWithImage(sysText, userPrompt, images, { maxTokens: maxTokens || GROQ_MAX_OUTPUT });
    let modelId;
    switch (model) {
      case 'opus': case 'opus-4.6': modelId = MODELS['opus-4.6'].model; break;
      case 'sonnet': case 'sonnet-4.6': modelId = MODELS['sonnet-4.6'].model; break;
      default: modelId = MODELS['haiku-4.5'].model;
    }

    // ── FIX #2: Use proper maxTokens for vision calls (was hardcoded to 4096) ──
    const effectiveMaxTokens = maxTokens || MODELS['sonnet-4.6'].maxOutput;

    try {
      const blocks = images.map(img => ({ type: 'image', source: { type: 'base64', media_type: img.mimeType || 'image/png', data: img.base64 } }));
      blocks.push({ type: 'text', text: userPrompt });
      const r = await axios.post(ANTHROPIC_API_URL, {
        model: modelId,
        max_tokens: effectiveMaxTokens,
        system: [{ type: 'text', text: sysText, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: blocks }],
      }, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 180000, // FIX #4: increased from 120s
      });
      const content = extractClaudeText(r.data);
      if (content) return content;
      throw new Error('Empty response');
    } catch (err) {
      // ── FIX #1: Log actual API error for vision path ──
      if (err.message === 'Generation cancelled') throw err;
      const status = err.response?.status;
      const errMsg = err.response?.data?.error?.message || err.message;
      console.error(`[Claude Vision] ${modelId} FAILED: ${status || 'timeout'} — ${errMsg.slice(0, 300)}`);
      if (err.response?.data?.error?.type) console.error(`[Claude Vision] Error type: ${err.response.data.error.type}`);
      throw err;
    }
  }

  if (['gemini-flash', 'gemini-2.5-flash', 'gemini-pro', 'gemini-3.1-pro'].includes(model)) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return callGroqWithImage(sysText, userPrompt, images, { maxTokens: maxTokens || GROQ_MAX_OUTPUT });
    let modelId;
    switch (model) {
      case 'gemini-pro': case 'gemini-3.1-pro': modelId = MODELS['gemini-3.1-pro'].model; break;
      default: modelId = MODELS['gemini-2.5-flash'].model;
    }
    try {
      const parts = images.map(img => ({ inlineData: { mimeType: img.mimeType || 'image/png', data: img.base64 } }));
      parts.push({ text: userPrompt });
      const r = await axios.post(`${GEMINI_API_URL}/${modelId}:generateContent?key=${apiKey}`, { contents: [{ role: 'user', parts }], systemInstruction: { parts: [{ text: sysText }] }, generationConfig: { maxOutputTokens: maxTokens || 65536, temperature: 0.2 } }, { headers: { 'Content-Type': 'application/json' }, timeout: 180000 });
      const text = r.data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
      if (text) return text;
      throw new Error('Empty response');
    } catch (err) {
      if (err.message === 'Generation cancelled') throw err;
      console.error(`[Gemini Vision] ${modelId} FAILED: ${err.response?.status || 'timeout'} — ${(err.response?.data?.error?.message || err.message).slice(0, 300)}`);
      throw err;
    }
  }

  return callGroqWithImage(sysText, userPrompt, images, { maxTokens: maxTokens || GROQ_MAX_OUTPUT, signal: opts.signal });
}

// ================================================================
// Groq Vision
// ================================================================
async function callGroqWithImage(systemText, userPrompt, images, options = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('No GROQ_API_KEY');
  const blocks = images.map(img => ({ type: 'image_url', image_url: { url: `data:${img.mimeType || 'image/png'};base64,${img.base64}` } }));
  blocks.push({ type: 'text', text: userPrompt });
  for (const vm of GROQ_VISION_MODELS) {
    try {
      const r = await axios.post(GROQ_API_URL, { model: vm, messages: [{ role: 'system', content: systemText }, { role: 'user', content: blocks }], temperature: 0.2, max_tokens: options.maxTokens || GROQ_MAX_OUTPUT }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 120000 });
      const content = r.data.choices?.[0]?.message?.content;
      if (content) return content;
    } catch (err) {
      if (err.response?.status === 401) break;
    }
  }
  throw new Error('All Groq vision models failed');
}

// ================================================================
// Gemini text call
// ================================================================
async function callGemini(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return callGroq(systemPrompt, userPrompt, { maxTokens: GROQ_MAX_OUTPUT, signal: options.signal, onProgress: options.onProgress });
  const modelId = options.model || MODELS['gemini-2.5-flash'].model;
  const maxTokens = options.maxTokens || 65536;
  const label = options.label || 'Gemini';
  try {
    return await withRetry(async (attempt) => {
      if (options.signal?.aborted) throw new Error('Generation cancelled');
      if (attempt > 0 && options.onProgress) options.onProgress(`Retrying ${label}...`);
      const r = await axios.post(`${GEMINI_API_URL}/${modelId}:generateContent?key=${apiKey}`, { contents: [{ role: 'user', parts: [{ text: userPrompt.slice(0, 900000) }] }], systemInstruction: { parts: [{ text: systemPromptToString(systemPrompt) }] }, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 } }, { headers: { 'Content-Type': 'application/json' }, timeout: 180000 });
      const candidate = r.data?.candidates?.[0];
      if (!candidate) throw new Error('No candidates');
      if (candidate.finishReason === 'SAFETY') throw new Error('Blocked by safety filter');
      const text = candidate.content?.parts?.map(p => p.text || '').join('\n') || '';
      if (text) return text;
      throw new Error('Empty response');
    }, { maxRetries: 1 });
  } catch (err) {
    if (err.message === 'Generation cancelled') throw err;
    console.error(`[Gemini] ${modelId} FAILED: ${err.response?.status || 'timeout'} — ${(err.response?.data?.error?.message || err.message).slice(0, 300)}`);
    throw err;
  }
}

// ================================================================
// Claude text call
// ── FIX #1: Added detailed error logging
// ── FIX #4: Increased timeout from 120s to 180s
// ================================================================
async function callClaude(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[Claude] No ANTHROPIC_API_KEY — falling back to Groq');
    return callGroq(systemPrompt, userPrompt, { maxTokens: GROQ_MAX_OUTPUT, signal: options.signal, onProgress: options.onProgress });
  }
  const modelId = options.model || MODELS['haiku-4.5'].model;
  const maxTokens = options.maxTokens || 16384;
  const label = options.label || 'Claude';

  try {
    return await withRetry(async (attempt) => {
      if (options.signal?.aborted) throw new Error('Generation cancelled');
      if (attempt > 0 && options.onProgress) options.onProgress(`Retrying ${label}...`);

      console.log(`[Claude] Calling ${modelId} (${label}), max_tokens=${maxTokens}, attempt=${attempt}`);

      const r = await axios.post(ANTHROPIC_API_URL, {
        model: modelId,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: systemPromptToString(systemPrompt), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt.slice(0, 180000) }],
      }, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 180000, // FIX #4: was 120000
      });

      // Log response metadata for debugging
      const stopReason = r.data?.stop_reason;
      const usage = r.data?.usage;
      console.log(`[Claude] ${label} responded: stop_reason=${stopReason}, input_tokens=${usage?.input_tokens}, output_tokens=${usage?.output_tokens}`);

      const content = extractClaudeText(r.data);
      if (content) return content;
      throw new Error('Empty response');
    }, { maxRetries: 1 });
  } catch (err) {
    if (err.message === 'Generation cancelled') throw err;

    // ── FIX #1: Detailed error logging ──
    const status = err.response?.status;
    const errBody = err.response?.data;
    const errMsg = errBody?.error?.message || err.message;
    const errType = errBody?.error?.type || 'unknown';

    console.error(`[Claude] ${modelId} (${label}) FAILED:`);
    console.error(`[Claude]   Status: ${status || 'timeout/network'}`);
    console.error(`[Claude]   Type: ${errType}`);
    console.error(`[Claude]   Message: ${errMsg.slice(0, 500)}`);
    if (status === 400) console.error(`[Claude]   400 = bad request — check model ID, max_tokens, or message format`);
    if (status === 401) console.error(`[Claude]   401 = invalid API key`);
    if (status === 403) console.error(`[Claude]   403 = forbidden — key may lack permissions for ${modelId}`);
    if (status === 429) console.error(`[Claude]   429 = rate limited — Tier 2 limit is 1K req/min`);
    if (status === 529) console.error(`[Claude]   529 = API overloaded`);
    if (err.code === 'ECONNABORTED') console.error(`[Claude]   Timeout after 180s — response too slow`);

    throw err;
  }
}

// ================================================================
// Groq text call
// ================================================================
async function callGroq(systemPrompt, userPrompt, options = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const sysText = systemPromptToString(systemPrompt);
  for (const model of GROQ_MODELS) {
    try {
      if (options.signal?.aborted) throw new Error('Generation cancelled');
      const result = await withRetry(async () => {
        const r = await axios.post(GROQ_API_URL, { model, messages: [{ role: 'system', content: sysText }, { role: 'user', content: userPrompt.slice(0, MODELS.groq.contextLimit) }], temperature: 0.2, max_tokens: options.maxTokens || GROQ_MAX_OUTPUT }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 120000 });
        const content = r.data.choices?.[0]?.message?.content;
        if (content) return content;
        throw new Error('Empty response');
      }, { maxRetries: 1 });
      return result;
    } catch (err) {
      if (err.message === 'Generation cancelled') throw err;
      const status = err.response?.status;
      if (status === 401) break;
      if (status === 429) continue;
      throw err;
    }
  }
  return null;
}

// ================================================================
// IMAGE EDITING — Gemini Flash Image (Vibe Photo Editor)
// ================================================================
async function editImage(sourceImage, editPrompt) {
  const vertexKey = process.env.VERTEX_AI_API_KEY;
  if (!vertexKey || !sourceImage?.base64) { console.warn('[ImageEdit] No key or image'); return null; }
  try {
    const r = await axios.post(
      `${GEMINI_API_URL}/gemini-3.1-flash-image-preview:generateContent?key=${vertexKey}`,
      { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: sourceImage.mimeType || 'image/jpeg', data: sourceImage.base64 } }, { text: `Edit this exact photo: ${editPrompt}. Keep the same person, same background, same pose. Only apply the requested edit. Return the edited photo.` }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.8 } },
      { headers: { 'Content-Type': 'application/json' }, timeout: 120000 }
    );
    const parts = r.data?.candidates?.[0]?.content?.parts || [];
    const imgParts = parts.filter(p => p.inlineData?.data);
    if (imgParts.length > 0) return imgParts.map(p => ({ base64: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' }));
    return null;
  } catch (err) {
    console.error(`[ImageEdit] FAIL: ${err.response?.status} — ${(err.response?.data?.error?.message || err.message).slice(0, 200)}`);
    return null;
  }
}

// ── editPhotoVibeEditor — alias with preset support ─────────────────────
async function editPhotoVibeEditor(sourceImage, preset, customPrompt) {
  const PRESETS = {
    'professional':    'Transform this image to look professional: studio quality lighting, clean background, polished and business-ready aesthetic',
    'remove-bg':       'Remove the background completely and replace with a clean white or transparent background, keeping the subject perfectly intact',
    'luxury':          'Apply a luxury aesthetic: gold tones, soft bokeh lighting, high-end editorial style, sophisticated and premium look',
    'cyberpunk':       'Transform to cyberpunk style: neon colors, dark background, futuristic city aesthetic, glowing effects, electric blues and magentas',
    'studio':          'Apply professional studio lighting: soft box lighting, neutral background, professional portrait quality, even illumination',
    'oil-painting':    'Transform into a beautiful oil painting style: rich brushstrokes, artistic texture, painterly aesthetic with deep saturated colors',
    'minimalist':      'Transform into a minimalist product shot: completely white background, clean and simple, high contrast, e-commerce ready product photography',
  };
  const prompt = customPrompt || PRESETS[preset] || `Apply this transformation: ${preset}`;
  return editImage(sourceImage, prompt);
}

// ================================================================
// IMAGE GENERATION — Imagen 4 (GA) with Imagen 3 fallbacks
// ================================================================
async function generateImageImagen4(prompt, options = {}) {
  const vertexKey = process.env.VERTEX_AI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!vertexKey && !geminiKey) { console.warn('[ImageGen] No API keys for image generation'); return null; }
  const cleanPrompt = (prompt || '').slice(0, 1000);
  const sampleCount = options.numberOfImages || options.count || 1;
  const aspectRatio = options.aspectRatio || '1:1';

  // ATTEMPT 1: Imagen 4 GA via VERTEX_AI_API_KEY
  if (vertexKey) {
    for (const mid of ['imagen-4.0-generate-001', 'imagen-4.0-fast-generate-001']) {
      try {
        console.log(`[ImageGen] Trying ${mid}...`);
        const r = await axios.post(
          `${GEMINI_API_URL}/${mid}:predict?key=${vertexKey}`,
          { instances: [{ prompt: cleanPrompt }], parameters: { sampleCount, aspectRatio, personGeneration: 'dont_allow', enhancePrompt: true } },
          { headers: { 'Content-Type': 'application/json' }, timeout: 90000 }
        );
        if (r.data?.predictions?.length) {
          const imgs = r.data.predictions.filter(p => p.bytesBase64Encoded).map(p => ({ base64: p.bytesBase64Encoded, mimeType: 'image/png' }));
          if (imgs.length) { console.log(`[ImageGen] SUCCESS via ${mid}`); return imgs; }
        }
      } catch (err) {
        console.warn(`[ImageGen] ${mid} failed: ${err.response?.status || err.message}`);
        if (err.response?.status === 429) break;
      }
    }
  }

  // ATTEMPT 2: gemini-3.1-flash-image-preview (native image generation)
  if (vertexKey) {
    try {
      console.log('[ImageGen] Trying gemini-3.1-flash-image-preview...');
      const r = await axios.post(
        `${GEMINI_API_URL}/gemini-3.1-flash-image-preview:generateContent?key=${vertexKey}`,
        { contents: [{ role: 'user', parts: [{ text: `Generate a high quality image: ${cleanPrompt}` }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.8 } },
        { headers: { 'Content-Type': 'application/json' }, timeout: 90000 }
      );
      const parts = r.data?.candidates?.[0]?.content?.parts || [];
      const imgParts = parts.filter(p => p.inlineData?.data);
      if (imgParts.length) { console.log('[ImageGen] SUCCESS via flash-image-preview'); return imgParts.map(p => ({ base64: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' })); }
    } catch (err) {
      console.warn(`[ImageGen] flash-image-preview failed: ${err.response?.status || err.message}`);
    }
  }

  // ATTEMPT 3: Imagen 3 fallback via VERTEX_AI_API_KEY
  if (vertexKey) {
    for (const mid of ['imagen-3.0-generate-002', 'imagen-3.0-generate-001']) {
      try {
        const r = await axios.post(`${GEMINI_API_URL}/${mid}:predict?key=${vertexKey}`, { instances: [{ prompt: cleanPrompt }], parameters: { sampleCount: 1, aspectRatio, personGeneration: 'dont_allow' } }, { headers: { 'Content-Type': 'application/json' }, timeout: 90000 });
        if (r.data?.predictions?.length) {
          const imgs = r.data.predictions.filter(p => p.bytesBase64Encoded).map(p => ({ base64: p.bytesBase64Encoded, mimeType: 'image/png' }));
          if (imgs.length) return imgs;
        }
      } catch (err) {
        if (err.response?.status === 429) break;
      }
    }
  }

  // ATTEMPT 4: Imagen 3 via GEMINI_API_KEY
  if (geminiKey && geminiKey !== vertexKey) {
    try {
      const r = await axios.post(`${GEMINI_API_URL}/imagen-3.0-generate-002:predict?key=${geminiKey}`, { instances: [{ prompt: cleanPrompt }], parameters: { sampleCount: 1 } }, { timeout: 60000 });
      if (r.data?.predictions?.length) {
        const imgs = r.data.predictions.filter(p => p.bytesBase64Encoded).map(p => ({ base64: p.bytesBase64Encoded, mimeType: 'image/png' }));
        if (imgs.length) return imgs;
      }
    } catch (_) {}
  }

  console.warn('[ImageGen] ALL attempts failed — no images generated');
  return null;
}

// ── Legacy alias ──────────────────────────────────────────────────────────
const generateImageImagen3 = generateImageImagen4;

// ================================================================
// VIDEO GENERATION — Veo 3.1 preview → Veo 2 GA fallback
// ================================================================
async function generateVideoVeo(prompt, options = {}) {
  const vertexKey = process.env.VERTEX_AI_API_KEY;
  if (!vertexKey) { console.warn('[VideoGen] No VERTEX_AI_API_KEY'); return null; }

  const cleanPrompt = (prompt || '').slice(0, 1000);
  const durationSeconds = options.durationSeconds || 8;
  const aspectRatio = options.aspectRatio || '16:9';
  const bucketUri = options.storageUri || process.env.GCS_BUCKET_URI || 'gs://zapcodes-videos';
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0709668137';
  const location = 'us-central1';

  function gcsToPublicUrl(gcsUri) {
    if (!gcsUri) return null;
    const withoutGs = gcsUri.replace(/^gs:\/\//, '');
    return `https://storage.googleapis.com/${withoutGs}`;
  }

  const models = ['veo-3.0-generate-preview', 'veo-2.0-generate-001'];

  for (const modelId of models) {
    try {
      console.log(`[VideoGen] Trying ${modelId} with bucket ${bucketUri}...`);

      const body = {
        instances: [{
          prompt: cleanPrompt,
          ...(options.referenceImage ? {
            image: { bytesBase64Encoded: options.referenceImage.base64, mimeType: options.referenceImage.mimeType || 'image/png' }
          } : {}),
        }],
        parameters: {
          aspectRatio,
          durationSeconds,
          sampleCount: 1,
          storageUri: bucketUri,
          personGeneration: 'dont_allow',
        },
      };

      const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predictLongRunning`;

      const opRes = await axios.post(endpoint, body, {
        headers: {
          'Authorization': `Bearer ${vertexKey}`,
          'Content-Type': 'application/json',
          'x-goog-api-key': vertexKey,
        },
        timeout: 30000,
      });

      const operationName = opRes.data?.name;
      if (!operationName) {
        console.warn(`[VideoGen] ${modelId} returned no operation name`);
        continue;
      }

      console.log(`[VideoGen] Operation started: ${operationName}`);

      const maxPolls = 48;
      for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const pollRes = await axios.get(
            `https://${location}-aiplatform.googleapis.com/v1/${operationName}`,
            {
              headers: {
                'Authorization': `Bearer ${vertexKey}`,
                'x-goog-api-key': vertexKey,
              },
              timeout: 10000,
            }
          );

          if (pollRes.data?.done) {
            const predictions = pollRes.data?.response?.predictions;
            if (predictions?.length) {
              const gcsUri = predictions[0]?.gcsUri
                || predictions[0]?.videoUri
                || predictions[0]?.video?.gcsUri
                || predictions[0]?.generatedSamples?.[0]?.video?.uri;

              if (gcsUri) {
                const publicUrl = gcsToPublicUrl(gcsUri);
                console.log(`[VideoGen] SUCCESS via ${modelId}`);
                console.log(`[VideoGen] GCS: ${gcsUri}`);
                console.log(`[VideoGen] Public URL: ${publicUrl}`);
                return {
                  gcsUri,
                  publicUrl,
                  model: modelId,
                  durationSeconds,
                  aspectRatio,
                };
              }
            }
            console.warn(`[VideoGen] Operation done but no video URI found`);
            console.warn(`[VideoGen] Response:`, JSON.stringify(pollRes.data?.response || {}).slice(0, 500));
            break;
          }
        } catch (pollErr) {
          console.warn(`[VideoGen] Poll error (attempt ${i + 1}):`, pollErr.message);
        }
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.message;
      console.warn(`[VideoGen] ${modelId} failed: ${status} — ${msg.slice(0, 200)}`);
      if (status === 403) {
        console.warn(`[VideoGen] 403 — check that Veo API is enabled for project ${projectId}`);
      }
      if (status === 400) {
        console.warn(`[VideoGen] 400 — invalid request, trying next model`);
        continue;
      }
    }
  }

  console.warn('[VideoGen] All Veo models failed');
  return null;
}


// ================================================================
// Auto-generate site images (called during site generation)
// ================================================================
async function autoGenerateSiteImages(description, industry, count = 3) {
  const prompts = [
    `Professional hero banner for ${industry || 'business'} website: ${description}. High quality, modern design, cinematic lighting, 16:9 aspect ratio.`,
    `About section or team photo for ${industry || 'business'}: ${description}. Professional, warm, inviting atmosphere.`,
    `Products or services showcase for: ${description}. Clean, minimal, high-end product photography style.`,
  ];

  const results = [];
  for (let i = 0; i < Math.min(count, prompts.length); i++) {
    try {
      const imgs = await generateImageImagen4(prompts[i], { aspectRatio: i === 0 ? '16:9' : '4:3' });
      if (imgs?.length) results.push(imgs[0]);
    } catch (_) {}
  }
  return results;
}

// ================================================================
// Utilities
// ================================================================
async function streamAI(sp, up, model, res) {
  const r = await callAI(sp, up, model);
  if (r) res.write(`data: ${JSON.stringify({ type: 'content', text: r })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  return r;
}

async function analyzeCode(files, engine = 'groq') {
  const fs = files.slice(0, 20).map(f => `--- ${f.path || f.name} ---\n${(f.content || '').slice(0, 4000)}`).join('\n\n');
  const r = await callAI('Return ONLY valid JSON array of issues.', `Analyze:\n\n${fs}`, engine);
  if (r) { const m = r.match(/\[[\s\S]*\]/); if (m) try { return JSON.parse(m[0]); } catch { } }
  return [];
}

async function verifyAndFix(files, model, opts = {}) {
  if (model === 'groq' || !files.length) return files;
  try {
    const r = await callAI('Return ONLY complete fixed files.', `Fix:\n\n${files.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n')}`, model, undefined, opts);
    const f = r ? parseFilesFromResponse(r) : [];
    if (f.length) return f;
  } catch { }
  return files;
}

async function generateProjectMultiStep(template, projectName, desc, color, features, engine = 'groq', opts = {}) {
  const all = [];
  const spec = getTemplateSpec(template);
  for (let i = 0; i < spec.phases.length; i++) {
    if (opts.signal?.aborted) throw new Error('Generation cancelled');
    const ph = spec.phases[i];
    if (opts.onProgress) opts.onProgress(`Building ${ph.name}...`);
    const r = await callAI(`Project Builder. "${projectName}". ${spec.tech}. ${ph.instructions} COMPLETE files only.`, `Generate: ${ph.name}`, engine, undefined, opts);
    if (r) all.push(...parseFilesFromResponse(r));
  }
  return all;
}

// ================================================================
// parseFilesFromResponse
// ── FIX #3: Added fallback for truncated HTML (no closing tags)
// ================================================================
function parseFilesFromResponse(response) {
  const files = [];
  let m;

  // Pattern 1: ```filepath:filename\n...```
  const p1 = /```filepath:([^\n]+)\n([\s\S]*?)```/g;
  while ((m = p1.exec(response))) { if (m[1].trim() && m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() }); }
  if (files.length) return dedup(files);

  // Pattern 2: ```lang filename\n...```
  const p2 = /```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|bash|sh|text|markdown|md)?\s+([^\n`]+\.[a-z]{1,6})\n([\s\S]*?)```/g;
  while ((m = p2.exec(response))) { if (m[1].trim() && m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() }); }
  if (files.length) return dedup(files);

  // Pattern 3: Complete HTML document with closing </html>
  if (response.includes('<!DOCTYPE') || response.includes('<html')) {
    const h = response.match(/(<!DOCTYPE[\s\S]*<\/html>)/i);
    if (h?.[1]?.length > 100) {
      files.push({ name: 'index.html', content: h[1].trim() });
      return dedup(files);
    }
  }

  // ── FIX #3: Pattern 4 — Truncated HTML fallback ──
  // If AI response was cut off (no closing </html> or no closing ```),
  // salvage whatever HTML we got and close it properly.
  if (response.includes('<!DOCTYPE') || response.includes('<html')) {
    // Extract from <!DOCTYPE or <html to end of response
    const startIdx = response.indexOf('<!DOCTYPE') !== -1
      ? response.indexOf('<!DOCTYPE')
      : response.indexOf('<html');
    if (startIdx >= 0) {
      let html = response.slice(startIdx);
      // Strip trailing ``` if partially present
      html = html.replace(/`{1,3}\s*$/, '').trim();
      // Auto-close if truncated
      if (!html.includes('</html>')) {
        if (!html.includes('</body>')) html += '\n</body>';
        html += '\n</html>';
        console.warn('[Parser] HTML was truncated — auto-closed </body></html>');
      }
      if (html.length > 100) {
        files.push({ name: 'index.html', content: html });
        return dedup(files);
      }
    }
  }

  // ── FIX #3b: Pattern 5 — Content inside unclosed code fence ──
  // ```filepath:index.html\n<content>... (no closing ```)
  const unclosedFence = /```filepath:([^\n]+)\n([\s\S]+)$/;
  const um = unclosedFence.exec(response);
  if (um && um[1].trim() && um[2].trim().length > 100) {
    let content = um[2].trim().replace(/`{1,3}\s*$/, '').trim();
    // Auto-close HTML if needed
    if (content.includes('<html') && !content.includes('</html>')) {
      if (!content.includes('</body>')) content += '\n</body>';
      content += '\n</html>';
      console.warn('[Parser] Unclosed fence — auto-closed HTML');
    }
    files.push({ name: um[1].trim(), content });
    return dedup(files);
  }

  return dedup(files);
}

function dedup(files) {
  const seen = new Map();
  for (const f of files) { if (!seen.has(f.name) || f.content.length > seen.get(f.name).content.length) seen.set(f.name, f); }
  return Array.from(seen.values());
}

async function verifyAIStatus() {
  return {
    groq: { available: !!process.env.GROQ_API_KEY },
    'gemini-2.5-flash': { available: !!process.env.GEMINI_API_KEY },
    'gemini-3.1-pro': { available: !!process.env.GEMINI_API_KEY },
    'haiku-4.5': { available: !!process.env.ANTHROPIC_API_KEY },
    'sonnet-4.6': { available: !!process.env.ANTHROPIC_API_KEY },
    'opus-4.6': { available: !!process.env.ANTHROPIC_API_KEY },
    'imagen-4': { available: !!process.env.VERTEX_AI_API_KEY },
    'veo':      { available: !!process.env.VERTEX_AI_API_KEY },
    'vibe-editor': { available: !!process.env.VERTEX_AI_API_KEY },
  };
}

async function generateTutorial(q) {
  const k = process.env.GROQ_API_KEY;
  if (!k) return '## ZapCodes Help';
  for (const m of ['llama-3.1-8b-instant', 'gemma2-9b-it']) {
    try {
      const r = await axios.post(GROQ_API_URL, { model: m, messages: [{ role: 'system', content: 'Tutorial assistant.' }, { role: 'user', content: q }], temperature: 0.7, max_tokens: 1500 }, { headers: { 'Authorization': `Bearer ${k}` }, timeout: 15000 });
      return r.data.choices[0].message.content;
    } catch { }
  }
  return '## ZapCodes Help';
}

async function testImageGeneration() {
  const vertexKey = process.env.VERTEX_AI_API_KEY;
  const results = [];
  if (vertexKey) {
    for (const mid of ['imagen-4.0-generate-001', 'gemini-3.1-flash-image-preview']) {
      try {
        if (mid.includes('imagen')) {
          const r = await axios.post(`${GEMINI_API_URL}/${mid}:predict?key=${vertexKey}`, { instances: [{ prompt: 'blue circle' }], parameters: { sampleCount: 1 } }, { timeout: 30000 });
          results.push({ method: mid, status: 200, hasImage: !!(r.data?.predictions?.length) });
        } else {
          const r = await axios.post(`${GEMINI_API_URL}/${mid}:generateContent?key=${vertexKey}`, { contents: [{ role: 'user', parts: [{ text: 'Generate: blue circle' }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }, { timeout: 30000 });
          const parts = r.data?.candidates?.[0]?.content?.parts || [];
          results.push({ method: mid, status: 200, hasImage: parts.some(p => p.inlineData) });
        }
      } catch (e) {
        results.push({ method: mid, status: e.response?.status, error: (e.response?.data?.error?.message || e.message).slice(0, 200) });
      }
    }
  }
  return { vertexKeyPresent: !!vertexKey, geminiKeyPresent: !!process.env.GEMINI_API_KEY, results };
}

function getTemplateSpec(t) {
  const specs = {
    portfolio:  { name: 'Portfolio',   tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Site',      instructions: 'Portfolio. ALL inlined.', fileList: '- index.html' }] },
    landing:    { name: 'Landing',     tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Page',      instructions: 'Landing page. ALL inlined.', fileList: '- index.html' }] },
    blog:       { name: 'Blog',        tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Blog',      instructions: 'Blog. ALL inlined.', fileList: '- index.html' }] },
    ecommerce:  { name: 'E-Commerce',  tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Store',     instructions: 'Store. ALL inlined.', fileList: '- index.html' }] },
    dashboard:  { name: 'Dashboard',   tech: 'HTML+CSS+JS inlined', phases: [{ name: 'Dashboard', instructions: 'Dashboard. ALL inlined.', fileList: '- index.html' }] },
  };
  return specs[t] || specs.portfolio;
}


// ================================================================
// SUMMARIZE PROJECT MESSAGES — Gemini 2.5 Flash
// ================================================================
async function summarizeProjectMessages(messages) {
  if (!messages || messages.length === 0) return null;
  const formatted = messages.map((m, i) => {
    const media = [];
    if (m.mediaPrompts?.imagePrompt) media.push(`[Image: ${m.mediaPrompts.imagePrompt}]`);
    if (m.mediaPrompts?.vibePrompt)  media.push(`[Photo edit: ${m.mediaPrompts.vibePrompt}]`);
    if (m.mediaPrompts?.videoPrompt) media.push(`[Video: ${m.mediaPrompts.videoPrompt}]`);
    return `${i+1}. [${(m.role||'user').toUpperCase()}] ${m.content}${media.length ? ' '+media.join(' ') : ''}`;
  }).join('\n');

  const sysPrompt = `You summarize website/app building conversations for an AI called ZapCodes.
Create a concise summary (max 250 words) covering:
- What the user asked to build or change
- Key design decisions (colors, layout, features)
- Any AI-generated images, videos, or photo edits used
- Anything the user rejected or said they did NOT want
- Current state of the website/app
Write in third person. Be specific. Do NOT include system prompts.`;

  const userMsg = `Summarize these ${messages.length} messages:\n\n${formatted}`;

  try {
    const result = await callGemini(sysPrompt, userMsg, {
      model: 'gemini-2.5-flash',
      maxTokens: 1024,
      label: 'Summary',
    });
    return result?.trim() || null;
  } catch (err) {
    console.warn('[Summarize] Failed:', err.message);
    try {
      const result = await callGroq(sysPrompt, userMsg, { maxTokens: 1024 });
      return result?.trim() || null;
    } catch {
      return null;
    }
  }
}

// ================================================================
// CHECK PROMPT CLARITY
// ================================================================
async function checkPromptClarity(prompt, isEditMode, recentMessages = []) {
  if (!prompt || prompt.trim().length < 3) {
    return { clear: false, question: 'Could you describe what you want me to build or change?' };
  }
  const vaguePatterns = [
    /^(make it better|fix it|change it|update it|improve it|do it)\.?$/i,
    /^(yes|no|ok|okay|sure|fine|done|good|great|nice)\.?$/i,
    /^.{1,8}$/,
  ];
  for (const pattern of vaguePatterns) {
    if (pattern.test(prompt.trim())) {
      const question = isEditMode
        ? `I want to make sure I understand. Could you describe specifically what you want me to change or improve on your website?`
        : `Could you tell me more about what you want to build? For example, what type of site, what colors, what sections?`;
      return { clear: false, question };
    }
  }
  if (prompt.trim().split(' ').length < 5 && isEditMode) {
    try {
      const context = recentMessages.slice(-3).map(m => `[${m.role}] ${m.content}`).join('\n');
      const check = await callGroq(
        'You check if a website edit instruction is clear enough to act on. Reply ONLY with JSON: {"clear":true} or {"clear":false,"question":"your clarifying question here"}. Keep questions short and friendly.',
        `Recent context:\n${context}\n\nNew instruction: "${prompt}"\n\nIs this clear enough to edit the website?`,
        { maxTokens: 100 }
      );
      if (check) {
        const cleaned = check.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed.clear === 'boolean') return parsed;
      }
    } catch { /* proceed if check fails */ }
  }
  return { clear: true };
}

module.exports = {
  callAI, callAIWithImage, callGemini, callClaude, callGroq, callGroqWithImage,
  editImage, editPhotoVibeEditor,
  streamAI, analyzeCode, generateTutorial,
  generateProjectMultiStep, parseFilesFromResponse, verifyAndFix, verifyAIStatus,
  generateImageImagen3, generateImageImagen4, autoGenerateSiteImages,
  generateVideoVeo,
  testImageGeneration,
  summarizeProjectMessages,
  checkPromptClarity,
  MODELS, GROQ_MAX_OUTPUT, GROQ_MODELS,
};
