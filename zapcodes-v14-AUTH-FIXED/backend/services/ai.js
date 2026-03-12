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
  opus: { model: 'claude-opus-4-6-20260312', maxOutput: 32768, contextLimit: 200000 }
};

// ══════════════════════════════════════════════════════════════
// callAI — Main text generation for all models
// ══════════════════════════════════════════════════════════════
async function callAI(provider, messages, maxTokens = 4096, options = {}) {
  const { temperature = 0.7, systemPrompt } = options;

  // ── GROQ ──
  if (provider === 'groq') {
    const models = MODELS.groq.models;
    let lastError = null;
    for (const model of models) {
      try {
        const msgs = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;
        const res = await axios.post(GROQ_API_URL, {
          model,
          messages: msgs,
          max_tokens: Math.min(maxTokens, MODELS.groq.maxOutput),
          temperature
        }, {
          headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          timeout: 60000
        });
        const content = res.data?.choices?.[0]?.message?.content;
        if (content) return content;
      } catch (err) {
        lastError = err;
        console.error(`[Groq] ${model} failed:`, err.response?.data?.error?.message || err.message);
      }
    }
    throw lastError || new Error('All Groq models failed');
  }

  // ── GEMINI (Flash & Pro) ──
  if (provider === 'gemini-flash' || provider === 'gemini-pro') {
    const cfg = MODELS[provider];
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    const contents = [];
    let sysInstruction = systemPrompt || '';

    for (const m of messages) {
      if (m.role === 'system') {
        sysInstruction = m.content;
      } else {
        contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
      }
    }

    const body = {
      contents,
      generationConfig: {
        maxOutputTokens: Math.min(maxTokens, cfg.maxOutput),
        temperature
      }
    };
    if (sysInstruction) body.systemInstruction = { parts: [{ text: sysInstruction }] };

    // Try with thinking budget for capable models
    if (provider === 'gemini-flash' || provider === 'gemini-pro') {
      body.generationConfig.thinkingConfig = { thinkingBudget: provider === 'gemini-pro' ? 8192 : 4096 };
    }

    try {
      const res = await axios.post(
        `${GEMINI_API_URL}/${cfg.model}:generateContent?key=${apiKey}`,
        body,
        { headers: { 'Content-Type': 'application/json' }, timeout: 120000 }
      );

      const parts = res.data?.candidates?.[0]?.content?.parts || [];
      let text = '';
      for (const p of parts) {
        if (p.text && !p.thought) text += p.text;
      }
      if (text) return text;
      throw new Error('Empty Gemini response');
    } catch (err) {
      // Retry without thinking config if it fails
      if (body.generationConfig.thinkingConfig) {
        delete body.generationConfig.thinkingConfig;
        try {
          const res = await axios.post(
            `${GEMINI_API_URL}/${cfg.model}:generateContent?key=${apiKey}`,
            body,
            { headers: { 'Content-Type': 'application/json' }, timeout: 120000 }
          );
          const parts = res.data?.candidates?.[0]?.content?.parts || [];
          let text = '';
          for (const p of parts) {
            if (p.text) text += p.text;
          }
          if (text) return text;
        } catch (e) { /* fall through */ }
      }
      throw err;
    }
  }

  // ── ANTHROPIC (Haiku, Sonnet, Opus) ──
  if (['haiku', 'sonnet', 'opus'].includes(provider)) {
    const cfg = MODELS[provider];
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const filtered = messages.filter(m => m.role !== 'system');
    const body = {
      model: cfg.model,
      max_tokens: Math.min(maxTokens, cfg.maxOutput),
      temperature,
      messages: filtered
    };
    if (systemPrompt) body.system = systemPrompt;

    // Extended thinking for Opus
    if (provider === 'opus') {
      body.temperature = 1;
      body.thinking = { type: 'enabled', budget_tokens: Math.min(10000, cfg.maxOutput - 1000) };
    }

    const res = await axios.post(ANTHROPIC_API_URL, body, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 180000
    });

    const blocks = res.data?.content || [];
    let text = '';
    for (const b of blocks) {
      if (b.type === 'text') text += b.text;
    }
    if (text) return text;
    throw new Error('Empty Anthropic response');
  }

  throw new Error(`Unknown provider: ${provider}`);
}

// ══════════════════════════════════════════════════════════════
// callAIWithImage — Vision: analyze uploaded images
// ══════════════════════════════════════════════════════════════
async function callAIWithImage(provider, messages, imageData, maxTokens = 4096, options = {}) {
  const { temperature = 0.7, systemPrompt } = options;
  const { base64, mimeType } = imageData;

  // ── GROQ with vision ──
  if (provider === 'groq') {
    const visionModels = ['llama-3.3-70b-versatile', 'llama3-70b-8192'];
    let lastError = null;
    for (const model of visionModels) {
      try {
        const msgs = messages.map(m => {
          if (m === messages[messages.length - 1]) {
            return {
              role: 'user',
              content: [
                { type: 'text', text: m.content },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
              ]
            };
          }
          return m;
        });
        if (systemPrompt) msgs.unshift({ role: 'system', content: systemPrompt });

        const res = await axios.post(GROQ_API_URL, {
          model, messages: msgs,
          max_tokens: Math.min(maxTokens, 4096),
          temperature
        }, {
          headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          timeout: 60000
        });
        const content = res.data?.choices?.[0]?.message?.content;
        if (content) return content;
      } catch (err) {
        lastError = err;
        console.error(`[Groq Vision] ${model} failed:`, err.response?.data?.error?.message || err.message);
      }
    }
    throw lastError || new Error('Groq vision failed');
  }

  // ── GEMINI with vision ──
  if (provider === 'gemini-flash' || provider === 'gemini-pro') {
    const cfg = MODELS[provider];
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    const contents = [];
    let sysInstruction = systemPrompt || '';

    for (const m of messages) {
      if (m.role === 'system') {
        sysInstruction = m.content;
      } else if (m === messages[messages.length - 1]) {
        contents.push({
          role: 'user',
          parts: [
            { text: m.content },
            { inlineData: { mimeType, data: base64 } }
          ]
        });
      } else {
        contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
      }
    }

    const body = {
      contents,
      generationConfig: { maxOutputTokens: Math.min(maxTokens, cfg.maxOutput), temperature }
    };
    if (sysInstruction) body.systemInstruction = { parts: [{ text: sysInstruction }] };

    const res = await axios.post(
      `${GEMINI_API_URL}/${cfg.model}:generateContent?key=${apiKey}`,
      body,
      { headers: { 'Content-Type': 'application/json' }, timeout: 120000 }
    );

    const parts = res.data?.candidates?.[0]?.content?.parts || [];
    let text = '';
    for (const p of parts) {
      if (p.text) text += p.text;
    }
    if (text) return text;
    throw new Error('Empty Gemini vision response');
  }

  // ── ANTHROPIC with vision ──
  if (['haiku', 'sonnet', 'opus'].includes(provider)) {
    const cfg = MODELS[provider];
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const filtered = messages.filter(m => m.role !== 'system').map(m => {
      if (m === messages[messages.length - 1]) {
        return {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: m.content }
          ]
        };
      }
      return { role: m.role, content: m.content };
    });

    const body = {
      model: cfg.model,
      max_tokens: Math.min(maxTokens, cfg.maxOutput),
      temperature,
      messages: filtered
    };
    if (systemPrompt) body.system = systemPrompt;

    if (provider === 'opus') {
      body.temperature = 1;
      body.thinking = { type: 'enabled', budget_tokens: Math.min(10000, cfg.maxOutput - 1000) };
    }

    const res = await axios.post(ANTHROPIC_API_URL, body, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 180000
    });

    const blocks = res.data?.content || [];
    let text = '';
    for (const b of blocks) {
      if (b.type === 'text') text += b.text;
    }
    if (text) return text;
    throw new Error('Empty Anthropic vision response');
  }

  throw new Error(`Unknown provider for vision: ${provider}`);
}

// ══════════════════════════════════════════════════════════════
// generateImageImagen3 — Image generation with multi-tier fallback
// Uses VERTEX_AI_API_KEY with gemini-3.1-flash-image-preview
// ══════════════════════════════════════════════════════════════
async function generateImageImagen3(prompt) {
  const errors = [];

  // ── Tier 1: Gemini 3.1 Flash Image Preview (PRIMARY — your activated model) ──
  try {
    const apiKey = process.env.VERTEX_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (apiKey) {
      console.log('[ImageGen] Tier 1: gemini-3.1-flash-image-preview');
      const res = await axios.post(
        `${GEMINI_API_URL}/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            temperature: 0.8
          }
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
      );

      const parts = res.data?.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        if (p.inlineData && p.inlineData.data) {
          console.log('[ImageGen] ✅ Tier 1 SUCCESS — gemini-3.1-flash-image-preview');
          return { base64: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' };
        }
      }
      errors.push('Tier 1: No image in response parts');
    } else {
      errors.push('Tier 1: No VERTEX_AI_API_KEY or GEMINI_API_KEY');
    }
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    errors.push(`Tier 1: ${msg}`);
    console.error('[ImageGen] Tier 1 failed:', msg);
  }

  // ── Tier 2: Gemini 2.5 Flash with image generation ──
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      console.log('[ImageGen] Tier 2: gemini-2.5-flash with responseModalities');
      const res = await axios.post(
        `${GEMINI_API_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            temperature: 0.8
          }
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
      );

      const parts = res.data?.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        if (p.inlineData && p.inlineData.data) {
          console.log('[ImageGen] ✅ Tier 2 SUCCESS — gemini-2.5-flash');
          return { base64: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' };
        }
      }
      errors.push('Tier 2: No image in response');
    }
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    errors.push(`Tier 2: ${msg}`);
    console.error('[ImageGen] Tier 2 failed:', msg);
  }

  // ── Tier 3: Imagen 3 via Gemini API ──
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VERTEX_AI_API_KEY;
    if (apiKey) {
      console.log('[ImageGen] Tier 3: imagen-3.0-generate-002');
      const res = await axios.post(
        `${GEMINI_API_URL}/imagen-3.0-generate-002:predict?key=${apiKey}`,
        {
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: '1:1' }
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
      );

      const predictions = res.data?.predictions || [];
      if (predictions.length > 0 && predictions[0].bytesBase64Encoded) {
        console.log('[ImageGen] ✅ Tier 3 SUCCESS — imagen-3.0-generate-002');
        return { base64: predictions[0].bytesBase64Encoded, mimeType: 'image/png' };
      }
      errors.push('Tier 3: No predictions');
    }
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    errors.push(`Tier 3: ${msg}`);
    console.error('[ImageGen] Tier 3 failed:', msg);
  }

  // ── Tier 4: Gemini 2.0 Flash experimental image gen ──
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const expModels = ['gemini-2.0-flash-exp', 'gemini-2.0-flash'];
      for (const model of expModels) {
        try {
          console.log(`[ImageGen] Tier 4: ${model}`);
          const res = await axios.post(
            `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`,
            {
              contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
              generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
          );

          const parts = res.data?.candidates?.[0]?.content?.parts || [];
          for (const p of parts) {
            if (p.inlineData && p.inlineData.data) {
              console.log(`[ImageGen] ✅ Tier 4 SUCCESS — ${model}`);
              return { base64: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' };
            }
          }
        } catch (e) {
          errors.push(`Tier 4 ${model}: ${e.response?.data?.error?.message || e.message}`);
        }
      }
    }
  } catch (err) {
    errors.push(`Tier 4: ${err.message}`);
  }

  // ── Tier 5: SVG placeholder fallback ──
  console.log('[ImageGen] All tiers failed, generating SVG placeholder');
  console.log('[ImageGen] Errors:', errors.join(' | '));

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#667eea"/>
        <stop offset="100%" style="stop-color:#764ba2"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="url(#bg)" rx="20"/>
    <text x="256" y="200" text-anchor="middle" fill="white" font-size="28" font-family="Arial,sans-serif" font-weight="bold">🎨 Image Generation</text>
    <text x="256" y="260" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="16" font-family="Arial,sans-serif">Temporarily Unavailable</text>
    <text x="256" y="300" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-size="13" font-family="Arial,sans-serif">${prompt.substring(0, 60)}</text>
    <text x="256" y="400" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="11" font-family="Arial,sans-serif">ZapCodes AI • Retrying soon</text>
  </svg>`;

  const base64Svg = Buffer.from(svgContent).toString('base64');
  return { base64: base64Svg, mimeType: 'image/svg+xml' };
}

// ══════════════════════════════════════════════════════════════
// testImageGeneration — Diagnostic function
// ══════════════════════════════════════════════════════════════
async function testImageGeneration() {
  const results = {};

  // Test which API keys are available
  results.keys = {
    VERTEX_AI_API_KEY: !!process.env.VERTEX_AI_API_KEY,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY
  };

  // Test Gemini 3.1 Flash Image Preview
  try {
    const apiKey = process.env.VERTEX_AI_API_KEY || process.env.GEMINI_API_KEY;
    const res = await axios.post(
      `${GEMINI_API_URL}/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: 'Generate a simple red circle on white background' }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    results.tier1 = { status: 'success', hasImage: !!(res.data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)) };
  } catch (err) {
    results.tier1 = { status: 'failed', error: err.response?.data?.error?.message || err.message };
  }

  return results;
}

module.exports = { callAI, callAIWithImage, generateImageImagen3, testImageGeneration, MODELS };
