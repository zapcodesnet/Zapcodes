// web/src/utils/tierConstants.js
// Shared tier constants for frontend UI rendering
// NOTE: This is for display only — actual enforcement is backend-only.
// The pricing page fetches live data from GET /api/pricing/tiers

export const TIER_ORDER = ['free', 'bronze', 'silver', 'gold', 'diamond'];

export const TIER_COLORS = {
  free: '#888888',
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  diamond: '#b9f2ff'
};

export const TIER_LABELS = {
  free: 'Free',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  diamond: 'Diamond'
};

export const TIER_PRICES = {
  free: '$0',
  bronze: '$4.99',
  silver: '$14.99',
  gold: '$39.99',
  diamond: '$99.99'
};

export const TIER_BADGES = {
  gold: 'MOST POPULAR',
  diamond: 'BEST VALUE'
};

// All 5 AI models in display order
export const AI_MODEL_ORDER = [
  'gemini-3.1-pro',
  'sonnet-4.6',
  'gemini-2.5-flash',
  'haiku-4.5',
  'groq'
];

export const AI_MODEL_LABELS = {
  'groq': 'Groq AI',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3.1-pro': 'Gemini 3.1 Pro',
  'haiku-4.5': 'Haiku 4.5',
  'sonnet-4.6': 'Sonnet 4.6'
};

// Minimum tier required for each model (for showing lock icons)
export const MODEL_MIN_TIER = {
  'groq': 'free',
  'gemini-2.5-flash': 'free',
  'gemini-3.1-pro': 'bronze',
  'haiku-4.5': 'silver',
  'sonnet-4.6': 'gold'
};

// Format BL coin amounts for display
export function formatBL(amount) {
  if (amount === null || amount === undefined) return '0';
  if (amount >= 1000000) return (amount / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (amount >= 1000) return Math.floor(amount / 1000) + 'K';
  return amount.toLocaleString();
}

// Format limit values (handles 'unlimited' and Infinity)
export function formatLimit(value) {
  if (value === 'unlimited' || value === Infinity || value === null) return 'Unlimited';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

// Format file size
export function formatFileSize(kb) {
  if (kb === null || kb === 0) return 'None';
  if (kb >= 1024) return (kb / 1024) + 'MB';
  return kb + 'KB';
}

// Check if a user's tier can access a specific model
export function canAccessModel(userTier, modelKey) {
  const tierLevel = TIER_ORDER.indexOf(userTier || 'free');
  const requiredLevel = TIER_ORDER.indexOf(MODEL_MIN_TIER[modelKey] || 'free');
  return tierLevel >= requiredLevel;
}

// Get the next tier up from current
export function getNextTier(currentTier) {
  const idx = TIER_ORDER.indexOf(currentTier || 'free');
  if (idx < TIER_ORDER.length - 1) return TIER_ORDER[idx + 1];
  return null;
}
