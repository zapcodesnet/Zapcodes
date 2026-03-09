// backend/config/aiModels.js
// AI model provider configurations — connection details for each model
// Each model key matches the keys used in tier ai_models and BL_COIN_COSTS

const AI_MODELS = {
  'groq': {
    provider: 'groq',
    apiKeyEnv: 'GROQ_API_KEY',
    model: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
    label: 'Groq AI',
    description: 'Ultra-fast inference',
    tier_min: 'free'
  },
  'gemini-2.5-flash': {
    provider: 'google',
    apiKeyEnv: 'GOOGLE_AI_API_KEY',
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    label: 'Gemini 2.5 Flash',
    description: 'Fast & efficient',
    tier_min: 'free'
  },
  'gemini-3.1-pro': {
    provider: 'google',
    apiKeyEnv: 'GOOGLE_AI_API_KEY',
    // NOTE: Check Google AI Studio for the current model string.
    // As of March 2026, use the latest available Gemini Pro preview model.
    // If 'gemini-3.1-pro-preview' is not yet in the API, use 'gemini-2.5-pro-preview-06-05'
    model: 'gemini-2.5-pro-preview-06-05',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    label: 'Gemini 3.1 Pro',
    description: 'Advanced reasoning',
    tier_min: 'bronze'
  },
  'haiku-4.5': {
    provider: 'anthropic',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    model: 'claude-haiku-4-5-20251001',
    baseUrl: 'https://api.anthropic.com/v1',
    label: 'Haiku 4.5',
    description: 'Fast & capable',
    tier_min: 'silver'
  },
  'sonnet-4.6': {
    provider: 'anthropic',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    model: 'claude-sonnet-4-6-20260217',
    baseUrl: 'https://api.anthropic.com/v1',
    label: 'Sonnet 4.6',
    description: 'Near-flagship intelligence',
    tier_min: 'gold'
  }
};

module.exports = { AI_MODELS };
