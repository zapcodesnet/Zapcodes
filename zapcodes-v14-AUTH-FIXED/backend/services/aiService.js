// backend/services/aiService.js
// Unified AI service — dispatches to Groq, Google Gemini, or Anthropic Claude
// Returns normalized response format regardless of provider
//
// IMPORTANT: This file ADD support for new models. The existing Groq integration
// in the codebase should continue to work. This service wraps all providers
// into a single callAI() function that any route can use.
//
// INSTALL REQUIRED:
//   cd backend && npm install @anthropic-ai/sdk @google/generative-ai

const { AI_MODELS } = require('../config/aiModels');

// ─── Provider: Groq (OpenAI-compatible) ───
let groqClient = null;
function getGroqClient() {
  if (!groqClient) {
    const OpenAI = require('openai');
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1'
    });
  }
  return groqClient;
}

async function callGroq(modelName, systemPrompt, userPrompt, maxTokens) {
  const client = getGroqClient();
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  const completion = await client.chat.completions.create({
    model: modelName,
    messages: messages,
    max_tokens: maxTokens || 4096,
    temperature: 0.7
  });

  const choice = completion.choices[0];
  return {
    content: choice.message.content,
    model: modelName,
    tokens_used: {
      input: completion.usage?.prompt_tokens || 0,
      output: completion.usage?.completion_tokens || 0
    }
  };
}

// ─── Provider: Google Gemini ───
let genAI = null;
function getGoogleClient() {
  if (!genAI) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  }
  return genAI;
}

async function callGemini(modelName, systemPrompt, userPrompt, maxTokens) {
  const client = getGoogleClient();
  const modelConfig = {
    model: modelName
  };
  if (systemPrompt) {
    modelConfig.systemInstruction = systemPrompt;
  }
  const model = client.getGenerativeModel(modelConfig);

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens || 8192,
      temperature: 0.7
    }
  });

  const response = result.response;
  return {
    content: response.text(),
    model: modelName,
    tokens_used: {
      input: response.usageMetadata?.promptTokenCount || 0,
      output: response.usageMetadata?.candidatesTokenCount || 0
    }
  };
}

// ─── Provider: Anthropic (Claude Haiku / Sonnet) ───
let anthropicClient = null;
function getAnthropicClient() {
  if (!anthropicClient) {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropicClient;
}

async function callAnthropic(modelName, systemPrompt, userPrompt, maxTokens) {
  const client = getAnthropicClient();
  const params = {
    model: modelName,
    max_tokens: maxTokens || 4096,
    messages: [{ role: 'user', content: userPrompt }]
  };
  if (systemPrompt) {
    params.system = systemPrompt;
  }

  const message = await client.messages.create(params);

  // Extract text from content blocks
  let content = '';
  if (message.content && message.content.length > 0) {
    content = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  }

  return {
    content: content,
    model: modelName,
    tokens_used: {
      input: message.usage?.input_tokens || 0,
      output: message.usage?.output_tokens || 0
    }
  };
}

// ─── Unified Caller ───
// This is the main function all routes should use.
// modelKey: 'groq', 'gemini-2.5-flash', 'gemini-3.1-pro', 'haiku-4.5', 'sonnet-4.6'
// Returns: { content: string, model: string, tokens_used: { input: number, output: number } }
async function callAI(modelKey, systemPrompt, userPrompt, maxTokens) {
  const modelInfo = AI_MODELS[modelKey];
  if (!modelInfo) {
    throw new Error(`Unknown AI model key: ${modelKey}`);
  }

  // Check that API key is configured
  const apiKey = process.env[modelInfo.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`API key not configured for ${modelInfo.label}. Set ${modelInfo.apiKeyEnv} in environment variables.`);
  }

  try {
    switch (modelInfo.provider) {
      case 'groq':
        return await callGroq(modelInfo.model, systemPrompt, userPrompt, maxTokens);

      case 'google':
        return await callGemini(modelInfo.model, systemPrompt, userPrompt, maxTokens);

      case 'anthropic':
        return await callAnthropic(modelInfo.model, systemPrompt, userPrompt, maxTokens);

      default:
        throw new Error(`Unknown AI provider: ${modelInfo.provider}`);
    }
  } catch (error) {
    // Wrap provider errors with context
    const wrappedError = new Error(`${modelInfo.label} API error: ${error.message}`);
    wrappedError.originalError = error;
    wrappedError.provider = modelInfo.provider;
    wrappedError.model = modelInfo.model;
    throw wrappedError;
  }
}

// ─── Get available models for a tier ───
function getAvailableModels(tierName) {
  const { SUBSCRIPTION_TIERS } = require('../config/tiers');
  const tier = SUBSCRIPTION_TIERS[tierName] || SUBSCRIPTION_TIERS.free;
  const available = {};
  for (const [modelKey, config] of Object.entries(tier.ai_models)) {
    const modelInfo = AI_MODELS[modelKey];
    if (modelInfo) {
      available[modelKey] = {
        ...config,
        label: modelInfo.label,
        description: modelInfo.description,
        provider: modelInfo.provider
      };
    }
  }
  return available;
}

module.exports = { callAI, getAvailableModels, AI_MODELS };
