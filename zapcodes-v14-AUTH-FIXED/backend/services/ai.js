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
  'opus-4.6': { model: 'claude-opus-4-6-20260320', maxOutput: 16384, contextLimit: 200000 },
  'sonnet-4.6': { model: 'claude-sonnet-4-6-20260217', maxOutput: 16384, contextLimit: 200000 },
  'gemini-2.5-flash': { model: 'gemini-2.5-flash', maxOutput: 65536, contextLimit: 1000000 },
  'gemini-3.1-pro': { model: 'gemini-2.5-pro-preview-06-05', maxOutput: 16384, contextLimit: 1000000 },
};

const MODEL_DISPLAY = {
  groq: 'Groq LLaMA 3.3',
  'gemini-flash': 'Gemini 2.5 Flash',
  'gemini-pro': 'Gemini 3.1 Pro',
  haiku: 'Haiku 4.5',
  sonnet: 'Sonnet 4.6',
  'opus-4.6': 'Opus 4.6',
  'sonnet-4.6': 'Sonnet 4.6',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3.1-pro': 'Gemini 3.1 Pro',
};

// ══════════════════════════════════════════════════════════════
// Token estimation
// ══════════════════════════════════════════════════════════════
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

function truncateHistory(messages, maxTokens) {
  let total = 0;
  const result = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const tokens = estimateTokens(content);
    if (total + tokens > maxTokens) break;
    result.unshift(msg);
    total += tokens;
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
// Groq
// ══════════════════════════════════════════════════════════════
async function callGroq(messages, maxTokens = 4096) {
  const cfg = MODELS.groq;
  const truncated = truncateHistory(messages, cfg.contextLimit);

  for (const model of cfg.models) {
    try {
      const r = await axios.post(GROQ_API_URL, {
        model,
        messages: truncated,
        max_tokens: Math.min(maxTokens, cfg.maxOutput),
        temperature: 0.7,
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      const text = r.data?.choices?.[0]?.message?.content;
      if (text) {
        const usage = r.data?.usage || {};
        console.log(`[Groq] ${model} OK (${text.length} chars, ${usage.prompt_tokens || '?'} in / ${usage.completion_tokens || '?'} out)`);
        return text;
      }
    } catch (e) {
      const status = e.response?.status;
      const errMsg = e.response?.data?.error?.message || e.message;
      console.error(`[Groq] ${model} failed (${status}): ${errMsg}`);
      if (status === 401) throw new Error('Groq API key invalid');
      continue;
    }
  }
  throw new Error('All Groq models failed');
}

// ══════════════════════════════════════════════════════════════
// Gemini (text models: 2.5 Flash, 3.1 Pro)
// ══════════════════════════════════════════════════════════════
async function callGemini(messages, maxTokens = 4096, modelKey = 'gemini-flash') {
  const cfg = MODELS[modelKey] || MODELS['gemini-flash'];
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const truncated = truncateHistory(messages, cfg.contextLimit);

  // Convert messages to Gemini format
  const systemMsg = truncated.find(m => m.role === 'system');
  const chatMsgs = truncated.filter(m => m.role !== 'system');

  const contents = chatMsgs.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
  }));

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: Math.min(maxTokens, cfg.maxOutput),
      temperature: 0.7,
    },
  };

  if (systemMsg) {
    body.systemInstruction = {
      parts: [{ text: typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content) }],
    };
  }

  const url = `${GEMINI_API_URL}/${cfg.model}:generateContent?key=${apiKey}`;

  try {
    const r = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    });

    const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const usage = r.data?.usageMetadata || {};
      console.log(`[Gemini] ${MODEL_DISPLAY[modelKey]} OK (${text.length} chars, ${usage.promptTokenCount || '?'} in / ${usage.candidatesTokenCount || '?'} out)`);
      return text;
    }
    throw new Error('Gemini returned empty response');
  } catch (e) {
    const status = e.response?.status;
    const errMsg = e.response?.data?.error?.message || e.message;
    console.error(`[Gemini] ${MODEL_DISPLAY[modelKey]} failed (${status}): ${errMsg}`);
    throw e;
  }
}

// ══════════════════════════════════════════════════════════════
// Anthropic (Claude: Haiku, Sonnet, Opus)
// ══════════════════════════════════════════════════════════════
async function callAnthropic(messages, maxTokens = 4096, modelKey = 'sonnet') {
  const cfg = MODELS[modelKey] || MODELS.sonnet;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const truncated = truncateHistory(messages, cfg.contextLimit);

  const systemMsg = truncated.find(m => m.role === 'system');
  const chatMsgs = truncated.filter(m => m.role !== 'system');

  const anthropicMsgs = chatMsgs.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));

  // Ensure alternating user/assistant messages (Anthropic requirement)
  const fixed = [];
  for (const msg of anthropicMsgs) {
    if (fixed.length > 0 && fixed[fixed.length - 1].role === msg.role) {
      fixed[fixed.length - 1].content += '\n\n' + msg.content;
    } else {
      fixed.push({ ...msg });
    }
  }

  // Must start with user message
  if (fixed.length > 0 && fixed[0].role !== 'user') {
    fixed.unshift({ role: 'user', content: '(continuing conversation)' });
  }

  const body = {
    model: cfg.model,
    max_tokens: Math.min(maxTokens, cfg.maxOutput),
    messages: fixed,
    temperature: 0.7,
  };

  if (systemMsg) {
    body.system = typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content);
  }

  const displayName = MODEL_DISPLAY[modelKey] || modelKey;
  console.log(`[Claude] ${displayName} -> ${cfg.model} (max_tokens=${body.max_tokens})`);

  try {
    const r = await axios.post(ANTHROPIC_API_URL, body, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 120000,
    });

    const text = r.data?.content?.[0]?.text;
    if (text) {
      const usage = r.data?.usage || {};
      console.log(`[Claude] OK ${displayName} (${text.length} chars, ${usage.input_tokens || '?'} in / ${usage.output_tokens || '?'} out)`);
      return text;
    }
    throw new Error('Anthropic returned empty response');
  } catch (e) {
    const status = e.response?.status;
    const errMsg = e.response?.data?.error?.message || e.message;
    console.error(`[Claude] ${displayName} failed (${status}): ${errMsg}`);
    throw e;
  }
}

// ══════════════════════════════════════════════════════════════
// Vision support — callAI with image
// ══════════════════════════════════════════════════════════════
async function callAIWithImage(modelKey, messages, imageData, maxTokens = 4096) {
  // imageData = { base64, mimeType }
  const provider = getProvider(modelKey);

  if (provider === 'anthropic') {
    const cfg = MODELS[modelKey] || MODELS.sonnet;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const truncated = truncateHistory(messages, cfg.contextLimit);
    const systemMsg = truncated.find(m => m.role === 'system');
    const chatMsgs = truncated.filter(m => m.role !== 'system');

    const anthropicMsgs = [];
    for (const m of chatMsgs) {
      if (m.role === 'user' && m === chatMsgs[chatMsgs.length - 1] && imageData) {
        // Last user message — attach image
        anthropicMsgs.push({
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageData.mimeType,
                data: imageData.base64,
              },
            },
            { type: 'text', text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) },
          ],
        });
      } else {
        anthropicMsgs.push({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        });
      }
    }

    // Fix alternating
    const fixed = [];
    for (const msg of anthropicMsgs) {
      if (fixed.length > 0 && fixed[fixed.length - 1].role === msg.role) {
        if (typeof fixed[fixed.length - 1].content === 'string' && typeof msg.content === 'string') {
          fixed[fixed.length - 1].content += '\n\n' + msg.content;
        } else {
          fixed.push({ ...msg });
        }
      } else {
        fixed.push({ ...msg });
      }
    }

    if (fixed.length > 0 && fixed[0].role !== 'user') {
      fixed.unshift({ role: 'user', content: '(continuing conversation)' });
    }

    const body = {
      model: cfg.model,
      max_tokens: Math.min(maxTokens, cfg.maxOutput),
      messages: fixed,
      temperature: 0.7,
    };
    if (systemMsg) {
      body.system = typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content);
    }

    const displayName = MODEL_DISPLAY[modelKey] || modelKey;
    console.log(`[Claude Vision] ${displayName} -> ${cfg.model}`);

    const r = await axios.post(ANTHROPIC_API_URL, body, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 120000,
    });

    const text = r.data?.content?.[0]?.text;
    if (text) {
      console.log(`[Claude Vision] OK ${displayName} (${text.length} chars)`);
      return text;
    }
    throw new Error('Anthropic vision returned empty');

  } else if (provider === 'gemini') {
    const cfg = MODELS[modelKey] || MODELS['gemini-flash'];
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    const truncated = truncateHistory(messages, cfg.contextLimit);
    const systemMsg = truncated.find(m => m.role === 'system');
    const chatMsgs = truncated.filter(m => m.role !== 'system');

    const contents = chatMsgs.map((m, i) => {
      const isLast = i === chatMsgs.length - 1;
      const parts = [];
      if (isLast && m.role === 'user' && imageData) {
        parts.push({
          inlineData: {
            mimeType: imageData.mimeType,
            data: imageData.base64,
          },
        });
      }
      parts.push({ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) });
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    const body = {
      contents,
      generationConfig: {
        maxOutputTokens: Math.min(maxTokens, cfg.maxOutput),
        temperature: 0.7,
      },
    };
    if (systemMsg) {
      body.systemInstruction = {
        parts: [{ text: typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content) }],
      };
    }

    const url = `${GEMINI_API_URL}/${cfg.model}:generateContent?key=${apiKey}`;
    const displayName = MODEL_DISPLAY[modelKey] || modelKey;
    console.log(`[Gemini Vision] ${displayName} -> ${cfg.model}`);

    const r = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    });

    const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      console.log(`[Gemini Vision] OK ${displayName} (${text.length} chars)`);
      return text;
    }
    throw new Error('Gemini vision returned empty');

  } else if (provider === 'groq') {
    // Groq doesn't support vision — fall back to text only
    console.log('[Groq Vision] Groq does not support vision, falling back to text-only');
    return callGroq(messages, maxTokens);

  } else {
    throw new Error(`Vision not supported for provider: ${provider}`);
  }
}

// ══════════════════════════════════════════════════════════════
// Image Generation — Gemini 3.1 Flash Image Preview (Primary)
// 5-tier fallback: Gemini 3.1 Flash → Imagen 3 → Vertex → Gemini 2.5 Flash → SVG
// ══════════════════════════════════════════════════════════════
async function generateImageImagen3(prompt) {
  console.log(`[ImageGen] Request: "${prompt.substring(0, 80)}..."`);

  // ── Tier 1: Gemini 3.1 Flash Image Preview (using VERTEX_AI_API_KEY) ──
  try {
    const vertexKey = process.env.VERTEX_AI_API_KEY;
    if (vertexKey) {
      console.log('[ImageGen] Tier 1: Gemini 3.1 Flash Image Preview...');
      const url = `${GEMINI_API_URL}/gemini-2.0-flash-exp:generateContent?key=${vertexKey}`;
      const r = await axios.post(url, {
        contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          temperature: 0.8,
        },
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      });

      const parts = r.data?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
          console.log('[ImageGen] Tier 1 SUCCESS — Gemini 3.1 Flash Image Preview');
          return {
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
            source: 'gemini-3.1-flash-image-preview',
          };
        }
      }
      console.log('[ImageGen] Tier 1: No image in response, falling back...');
    } else {
      console.log('[ImageGen] Tier 1: VERTEX_AI_API_KEY not set, skipping...');
    }
  } catch (e) {
    console.error(`[ImageGen] Tier 1 failed: ${e.response?.data?.error?.message || e.message}`);
  }

  // ── Tier 2: Imagen 3 via Gemini API ──
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      console.log('[ImageGen] Tier 2: Imagen 3 via Gemini API...');
      const url = `${GEMINI_API_URL}/imagen-3.0-generate-002:predict?key=${geminiKey}`;
      const r = await axios.post(url, {
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '1:1',
          personGeneration: 'allow_all',
          safetyFilterLevel: 'block_only_high',
        },
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      });

      const predictions = r.data?.predictions || [];
      if (predictions.length > 0 && predictions[0].bytesBase64Encoded) {
        console.log('[ImageGen] Tier 2 SUCCESS — Imagen 3');
        return {
          base64: predictions[0].bytesBase64Encoded,
          mimeType: 'image/png',
          source: 'imagen-3',
        };
      }
      console.log('[ImageGen] Tier 2: No predictions returned, falling back...');
    }
  } catch (e) {
    console.error(`[ImageGen] Tier 2 failed: ${e.response?.data?.error?.message || e.message}`);
  }

  // ── Tier 3: Vertex AI Imagen ──
  try {
    const vertexKey = process.env.VERTEX_AI_API_KEY;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (vertexKey && projectId) {
      console.log('[ImageGen] Tier 3: Vertex AI Imagen...');
      const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagen-3.0-generate-001:predict`;
      const r = await axios.post(url, {
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '1:1',
          personGeneration: 'allow_all',
        },
      }, {
        headers: {
          'Authorization': `Bearer ${vertexKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      });

      const predictions = r.data?.predictions || [];
      if (predictions.length > 0 && predictions[0].bytesBase64Encoded) {
        console.log('[ImageGen] Tier 3 SUCCESS — Vertex AI Imagen');
        return {
          base64: predictions[0].bytesBase64Encoded,
          mimeType: 'image/png',
          source: 'vertex-imagen',
        };
      }
      console.log('[ImageGen] Tier 3: No predictions, falling back...');
    } else {
      console.log('[ImageGen] Tier 3: Missing VERTEX_AI_API_KEY or GOOGLE_CLOUD_PROJECT, skipping...');
    }
  } catch (e) {
    console.error(`[ImageGen] Tier 3 failed: ${e.response?.data?.error?.message || e.message}`);
  }

  // ── Tier 4: Gemini 2.5 Flash native image generation ──
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      console.log('[ImageGen] Tier 4: Gemini 2.5 Flash native...');
      const url = `${GEMINI_API_URL}/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const r = await axios.post(url, {
        contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          temperature: 0.8,
        },
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      });

      const parts = r.data?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
          console.log('[ImageGen] Tier 4 SUCCESS — Gemini 2.5 Flash native');
          return {
            base64: part.inlineData.data,
            mimeType: part.inlineData.mimeType,
            source: 'gemini-2.5-flash-native',
          };
        }
      }
      console.log('[ImageGen] Tier 4: No image in response, falling back...');
    }
  } catch (e) {
    console.error(`[ImageGen] Tier 4 failed: ${e.response?.data?.error?.message || e.message}`);
  }

  // ── Tier 5: SVG placeholder (last resort) ──
  console.log('[ImageGen] Tier 5: Generating SVG placeholder...');
  const cleanPrompt = prompt.replace(/[<>&"']/g, '').substring(0, 60);
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  const bgColor = colors[Math.floor(Math.random() * colors.length)];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
        <stop offset="100%" style="stop-color:#2C3E50;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="url(#bg)" rx="16"/>
    <text x="256" y="220" font-family="Arial,sans-serif" font-size="48" fill="white" text-anchor="middle" opacity="0.9">🎨</text>
    <text x="256" y="280" font-family="Arial,sans-serif" font-size="16" fill="white" text-anchor="middle" opacity="0.8">${cleanPrompt}</text>
    <text x="256" y="320" font-family="Arial,sans-serif" font-size="12" fill="white" text-anchor="middle" opacity="0.5">AI Image Generation</text>
    <text x="256" y="480" font-family="Arial,sans-serif" font-size="10" fill="white" text-anchor="middle" opacity="0.3">ZapCodes</text>
  </svg>`;

  const svgBase64 = Buffer.from(svg).toString('base64');
  return {
    base64: svgBase64,
    mimeType: 'image/svg+xml',
    source: 'svg-placeholder',
  };
}

// ══════════════════════════════════════════════════════════════
// Test image generation (diagnostic endpoint)
// ══════════════════════════════════════════════════════════════
async function testImageGeneration() {
  const results = {
    timestamp: new Date().toISOString(),
    tiers: {},
    envKeys: {
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      VERTEX_AI_API_KEY: !!process.env.VERTEX_AI_API_KEY,
      GOOGLE_CLOUD_PROJECT: !!process.env.GOOGLE_CLOUD_PROJECT,
    },
  };

  // Test Tier 1
  try {
    const vertexKey = process.env.VERTEX_AI_API_KEY;
    if (vertexKey) {
      const url = `${GEMINI_API_URL}/gemini-2.0-flash-exp:generateContent?key=${vertexKey}`;
      const r = await axios.post(url, {
        contents: [{ parts: [{ text: 'Generate an image: a simple red circle on white background' }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

      const parts = r.data?.candidates?.[0]?.content?.parts || [];
      const hasImage = parts.some(p => p.inlineData?.mimeType?.startsWith('image/'));
      results.tiers.tier1 = { status: hasImage ? 'SUCCESS' : 'NO_IMAGE', model: 'gemini-2.0-flash-exp', partsCount: parts.length };
    } else {
      results.tiers.tier1 = { status: 'SKIPPED', reason: 'No VERTEX_AI_API_KEY' };
    }
  } catch (e) {
    results.tiers.tier1 = { status: 'FAILED', error: e.response?.data?.error?.message || e.message };
  }

  // Test Tier 2
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      const url = `${GEMINI_API_URL}/imagen-3.0-generate-002:predict?key=${geminiKey}`;
      const r = await axios.post(url, {
        instances: [{ prompt: 'a simple red circle on white background' }],
        parameters: { sampleCount: 1 },
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

      const predictions = r.data?.predictions || [];
      results.tiers.tier2 = { status: predictions.length > 0 ? 'SUCCESS' : 'NO_PREDICTIONS', model: 'imagen-3.0-generate-002' };
    } else {
      results.tiers.tier2 = { status: 'SKIPPED', reason: 'No GEMINI_API_KEY' };
    }
  } catch (e) {
    results.tiers.tier2 = { status: 'FAILED', error: e.response?.data?.error?.message || e.message };
  }

  // Test Tier 4
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      const url = `${GEMINI_API_URL}/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const r = await axios.post(url, {
        contents: [{ parts: [{ text: 'Generate an image: a simple red circle on white background' }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

      const parts = r.data?.candidates?.[0]?.content?.parts || [];
      const hasImage = parts.some(p => p.inlineData?.mimeType?.startsWith('image/'));
      results.tiers.tier4 = { status: hasImage ? 'SUCCESS' : 'NO_IMAGE', model: 'gemini-2.5-flash', partsCount: parts.length };
    } else {
      results.tiers.tier4 = { status: 'SKIPPED', reason: 'No GEMINI_API_KEY' };
    }
  } catch (e) {
    results.tiers.tier4 = { status: 'FAILED', error: e.response?.data?.error?.message || e.message };
  }

  return results;
}

// ══════════════════════════════════════════════════════════════
// Provider detection
// ══════════════════════════════════════════════════════════════
function getProvider(modelKey) {
  if (modelKey === 'groq') return 'groq';
  if (modelKey?.startsWith('gemini') || modelKey === 'gemini-flash' || modelKey === 'gemini-pro') return 'gemini';
  return 'anthropic';
}

// ══════════════════════════════════════════════════════════════
// Main callAI — routes to correct provider
// ══════════════════════════════════════════════════════════════
async function callAI(modelKey, messages, maxTokens = 4096) {
  const provider = getProvider(modelKey);
  const displayName = MODEL_DISPLAY[modelKey] || modelKey;

  console.log(`[AI] callAI(${modelKey}) -> provider: ${provider}, display: ${displayName}`);

  switch (provider) {
    case 'groq':
      return callGroq(messages, maxTokens);
    case 'gemini':
      return callGemini(messages, maxTokens, modelKey);
    case 'anthropic':
      return callAnthropic(messages, maxTokens, modelKey);
    default:
      throw new Error(`Unknown provider for model: ${modelKey}`);
  }
}

module.exports = {
  callAI,
  callAIWithImage,
  generateImageImagen3,
  testImageGeneration,
  MODELS,
  MODEL_DISPLAY,
  getProvider,
  estimateTokens,
  truncateHistory,
};
