// backend/routes/usage.js
// Returns the user's current usage stats for the dashboard
// Route: GET /api/usage/stats (requires auth)
// Uses User model's existing getTierConfig() and getMonthlyUsage() methods

const express = require('express');
const router = express.Router();
const { BL_COIN_COSTS } = require('../config/blCoins');

// Model display labels
const MODEL_LABELS = {
  'groq': 'Groq AI',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3.1-pro': 'Gemini 3.1 Pro',
  'haiku-4.5': 'Haiku 4.5',
  'sonnet-4.6': 'Sonnet 4.6',
};

// Map model keys to monthly_usage field names
const MODEL_TO_USAGE_FIELD = {
  'gemini-3.1-pro': 'gemini_pro_gens',
  'gemini-2.5-flash': 'gemini_flash_gens',
  'haiku-4.5': 'haiku_gens',
  'sonnet-4.6': 'sonnet_gens',
  'groq': 'groq_gens',
};

router.get('/stats', async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const config = user.getTierConfig();
    const mu = user.getMonthlyUsage();
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Build per-model usage stats
    const modelStats = [];
    for (const modelKey of config.modelChain) {
      const field = MODEL_TO_USAGE_FIELD[modelKey];
      const monthlyLimit = config.monthlyLimits[modelKey];
      const isTrial = config.trialModels && config.trialModels.includes(modelKey);

      let used = 0;
      if (isTrial) {
        // One-time trial: use trials_used counter
        used = (user.trials_used && user.trials_used[modelKey]) || 0;
      } else {
        // Monthly: use monthly_usage field
        used = field ? (mu[field] || 0) : 0;
      }

      const limit = monthlyLimit === Infinity ? 'unlimited' : monthlyLimit;
      const remaining = monthlyLimit === Infinity ? 'unlimited' : Math.max(0, monthlyLimit - used);

      modelStats.push({
        model: modelKey,
        label: MODEL_LABELS[modelKey] || modelKey,
        used: used,
        limit: limit,
        remaining: remaining,
        type: isTrial ? 'one_time_trial' : 'monthly',
        bl_cost_gen: BL_COIN_COSTS.generation[modelKey] || 0,
        bl_cost_fix: BL_COIN_COSTS.code_fix[modelKey] || 0
      });
    }

    // Save any monthly usage reset that may have happened
    user.markModified('monthly_usage');
    await user.save();

    // Calculate next month reset date
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    res.json({
      tier: user.subscription_tier || 'free',
      tier_name: config.price === 0 ? 'Free' : (user.subscription_tier || 'free').charAt(0).toUpperCase() + (user.subscription_tier || 'free').slice(1),
      tier_price: config.price,
      bl_coins: user.bl_coins || 0,
      daily_bl_claim: config.dailyClaim,
      can_claim_daily: user.canClaimDaily(),
      claim_countdown: user.getClaimCountdown(),
      models: modelStats,
      fixes: {
        used: mu.code_fixes || 0,
        limit: config.monthlyFixCap === Infinity ? 'unlimited' : config.monthlyFixCap,
        type: config.monthlyFixType
      },
      github_pushes: {
        used: mu.github_pushes || 0,
        limit: config.monthlyPushCap === Infinity ? 'unlimited' : config.monthlyPushCap,
        type: config.monthlyPushType
      },
      current_month: currentMonth,
      resets_on: nextMonth.toISOString().slice(0, 10),
      max_characters: config.maxChars === Infinity ? 'unlimited' : config.maxChars,
      max_deployed_sites: config.maxSites === Infinity ? 'unlimited' : config.maxSites,
      deployed_sites_count: (user.deployed_sites || []).length,
      file_upload_max_kb: config.maxFileSize === Infinity ? 'unlimited' : Math.floor(config.maxFileSize / 1024),
      pro_developer: config.canProDev,
      badge_removable: config.canRemoveBadge,
      can_pwa: config.canPWA,
      bl_costs: {
        github_push: BL_COIN_COSTS.github_push,
        badge_removal: BL_COIN_COSTS.badge_removal
      }
    });
  } catch (err) {
    console.error('Usage stats error:', err);
    res.status(500).json({ error: 'Failed to get usage stats' });
  }
});

module.exports = router;
