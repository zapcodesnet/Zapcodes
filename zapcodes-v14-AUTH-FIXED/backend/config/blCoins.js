// backend/config/blCoins.js
// BL Coin economy constants — costs per action, top-up packs, and bonuses
// BL Coins are non-convertible virtual currency shared across Zapcodes + BlendLink

const BL_COIN_COSTS = {
  generation: {
    'sonnet-4.6': 60000,
    'gemini-3.1-pro': 50000,
    'haiku-4.5': 20000,
    'gemini-2.5-flash': 10000,
    'groq': 5000
  },
  code_fix: {
    'sonnet-4.6': 60000,
    'gemini-3.1-pro': 50000,
    'haiku-4.5': 20000,
    'gemini-2.5-flash': 10000,
    'groq': 5000
  },
  github_push: 2000,
  badge_removal: 50000
};

const BL_TOPUP_PACKS = [
  {
    id: 'starter',
    price: 4.99,
    coins: 50000,
    label: 'Starter',
    stripePriceId: process.env.STRIPE_BL_STARTER_PRICE_ID || null
  },
  {
    id: 'popular',
    price: 9.99,
    coins: 150000,
    label: 'Popular',
    stripePriceId: process.env.STRIPE_BL_POPULAR_PRICE_ID || null
  },
  {
    id: 'best_value',
    price: 14.99,
    coins: 400000,
    label: 'Best Value',
    stripePriceId: process.env.STRIPE_BL_BESTVALUE_PRICE_ID || null
  },
  {
    id: 'ultimate',
    price: 29.99,
    coins: 1000000,
    label: 'Ultimate',
    stripePriceId: process.env.STRIPE_BL_ULTIMATE_PRICE_ID || null,
    multiplier: true  // allows quantity > 1 (up to 10x)
  }
];

// Sign-up bonus: awarded to BOTH new member AND the member who referred them
const SIGNUP_BONUS_BL = 50000;

module.exports = { BL_COIN_COSTS, BL_TOPUP_PACKS, SIGNUP_BONUS_BL };
