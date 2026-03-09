// backend/config/tiers.js
// SUBSCRIPTION TIERS — Single source of truth for the entire platform
// Both BlendLink and Zapcodes share these tiers (one subscription = both platforms)
// AI generation counts reset monthly. One-time trials never reset.

const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    price: 0,
    stripePriceId: null,
    ai_models: {
      'gemini-2.5-flash': { limit: 3, type: 'one_time_trial' },
      'groq': { limit: 20, type: 'monthly' }
    },
    max_characters: 2000,
    max_deployed_sites: 1,
    fixes_per_month: 1,
    fixes_type: 'one_time_trial',
    github_pushes_per_month: 1,
    github_pushes_type: 'one_time_trial',
    file_upload_max_kb: 0,
    pro_developer: false,
    badge_removable: false,
    daily_bl_claim: 2000,
    daily_photo_minting: 5,
    member_pages: 1,
    monthly_listing_limit: 300,
    referral_l1_percent: 2,
    referral_l2_percent: 1,
    photo_game_xp_multiplier: 1
  },

  bronze: {
    name: 'Bronze',
    price: 4.99,
    stripePriceId: process.env.STRIPE_BRONZE_PRICE_ID || null,
    ai_models: {
      'gemini-3.1-pro': { limit: 3, type: 'one_time_trial' },
      'gemini-2.5-flash': { limit: 200, type: 'monthly' },
      'groq': { limit: 500, type: 'monthly' }
    },
    max_characters: 3000,
    max_deployed_sites: 3,
    fixes_per_month: 90,
    fixes_type: 'monthly',
    github_pushes_per_month: 90,
    github_pushes_type: 'monthly',
    file_upload_max_kb: 200,
    pro_developer: false,
    badge_removable: false,
    daily_bl_claim: 20000,
    daily_photo_minting: 20,
    member_pages: 3,
    monthly_listing_limit: 2000,
    referral_l1_percent: 3,
    referral_l2_percent: 2,
    photo_game_xp_multiplier: 2
  },

  silver: {
    name: 'Silver',
    price: 14.99,
    stripePriceId: process.env.STRIPE_SILVER_PRICE_ID || null,
    ai_models: {
      'gemini-3.1-pro': { limit: 50, type: 'monthly' },
      'gemini-2.5-flash': { limit: 500, type: 'monthly' },
      'haiku-4.5': { limit: 400, type: 'monthly' },
      'groq': { limit: 1000, type: 'monthly' }
    },
    max_characters: 4000,
    max_deployed_sites: 5,
    fixes_per_month: 300,
    fixes_type: 'monthly',
    github_pushes_per_month: 300,
    github_pushes_type: 'monthly',
    file_upload_max_kb: 500,
    pro_developer: false,
    badge_removable: true,
    daily_bl_claim: 80000,
    daily_photo_minting: 50,
    member_pages: 10,
    monthly_listing_limit: 10000,
    referral_l1_percent: 3,
    referral_l2_percent: 2,
    photo_game_xp_multiplier: 3
  },

  gold: {
    name: 'Gold',
    price: 39.99,
    stripePriceId: process.env.STRIPE_GOLD_PRICE_ID || null,
    ai_models: {
      'gemini-3.1-pro': { limit: 120, type: 'monthly' },
      'sonnet-4.6': { limit: 100, type: 'monthly' },
      'gemini-2.5-flash': { limit: 1000, type: 'monthly' },
      'haiku-4.5': { limit: 800, type: 'monthly' },
      'groq': { limit: 2000, type: 'monthly' }
    },
    max_characters: 5000,
    max_deployed_sites: 15,
    fixes_per_month: 1500,
    fixes_type: 'monthly',
    github_pushes_per_month: 1500,
    github_pushes_type: 'monthly',
    file_upload_max_kb: 1024,
    pro_developer: true,
    badge_removable: true,
    daily_bl_claim: 200000,
    daily_photo_minting: 150,
    member_pages: 25,
    monthly_listing_limit: 25000,
    referral_l1_percent: 3,
    referral_l2_percent: 2,
    photo_game_xp_multiplier: 4
  },

  diamond: {
    name: 'Diamond',
    price: 99.99,
    stripePriceId: process.env.STRIPE_DIAMOND_PRICE_ID || null,
    ai_models: {
      'gemini-3.1-pro': { limit: Infinity, type: 'unlimited' },
      'sonnet-4.6': { limit: Infinity, type: 'unlimited' },
      'gemini-2.5-flash': { limit: Infinity, type: 'unlimited' },
      'haiku-4.5': { limit: Infinity, type: 'unlimited' },
      'groq': { limit: Infinity, type: 'unlimited' }
    },
    max_characters: null,
    max_deployed_sites: Infinity,
    fixes_per_month: Infinity,
    fixes_type: 'unlimited',
    github_pushes_per_month: Infinity,
    github_pushes_type: 'unlimited',
    file_upload_max_kb: null,
    pro_developer: true,
    badge_removable: true,
    daily_bl_claim: 500000,
    daily_photo_minting: Infinity,
    member_pages: Infinity,
    monthly_listing_limit: Infinity,
    referral_l1_percent: 4,
    referral_l2_percent: 3,
    photo_game_xp_multiplier: 5
  }
};

// Helper: get tier by name (defaults to free if invalid)
function getTier(tierName) {
  return SUBSCRIPTION_TIERS[tierName] || SUBSCRIPTION_TIERS.free;
}

// Tier order for upgrade/downgrade comparison
const TIER_ORDER = ['free', 'bronze', 'silver', 'gold', 'diamond'];

function getTierLevel(tierName) {
  const idx = TIER_ORDER.indexOf(tierName);
  return idx >= 0 ? idx : 0;
}

function isHigherTier(tierA, tierB) {
  return getTierLevel(tierA) > getTierLevel(tierB);
}

module.exports = { SUBSCRIPTION_TIERS, getTier, TIER_ORDER, getTierLevel, isHigherTier };
