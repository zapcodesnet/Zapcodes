// backend/routes/usage.js
// Returns the user's current usage stats for the dashboard
// Route: GET /api/usage/stats (requires auth)

const express = require('express');
const router = express.Router();
const { SUBSCRIPTION_TIERS } = require('../config/tiers');
const { BL_COIN_COSTS } = require('../config/blCoins');
const { AI_MODELS } = require('../config/aiModels');
const { resetMonthlyUsageIfNeeded } = require('../middleware/tierCheck');

router.get('/stats', async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Reset counters if month changed
    resetMonthlyUsageIfNeeded(user);

    const tierName = user.subscription_tier || 'free';
    const tier = SUBSCRIPTION_TIERS[tierName];
    if (!tier) return res.status(500).json({ error: 'Invalid tier' });

    const currentMonth = new Date().toISOString().slice(0, 7);

    // Build per-model usage stats
    const modelStats = [];
    for (const [modelKey, modelConfig] of Object.entries(tier.ai_models)) {
      const modelInfo = AI_MODELS[modelKey];
      let used = 0;

      if (modelConfig.type === 'one_time_trial') {
        used = (user.trials_used && user.trials_used[modelKey]) || 0;
      } else {
        used = (user.usage && user.usage[modelKey] && user.usage[modelKey][currentMonth]) || 0;
      }

      const limit = modelConfig.limit === Infinity ? 'unlimited' : modelConfig.limit;
      const remaining = modelConfig.limit === Infinity ? 'unlimited' : Math.max(0, modelConfig.limit - used);

      modelStats.push({
        model: modelKey,
        label: modelInfo ? modelInfo.label : modelKey,
        description: modelInfo ? modelInfo.description : '',
        used: used,
        limit: limit,
        remaining: remaining,
        type: modelConfig.type,
        bl_cost_gen: BL_COIN_COSTS.generation[modelKey] || 0,
        bl_cost_fix: BL_COIN_COSTS.code_fix[modelKey] || 0
      });
    }

    // Save any reset changes
    await user.save();

    // Calculate next month reset date
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    res.json({
      tier: tierName,
      tier_name: tier.name,
      tier_price: tier.price,
      bl_coins: user.bl_coins || 0,
      daily_bl_claim: tier.daily_bl_claim,
      models: modelStats,
      fixes: {
        used: user.monthly_fixes_used || 0,
        limit: tier.fixes_per_month === Infinity ? 'unlimited' : tier.fixes_per_month,
        type: tier.fixes_type
      },
      github_pushes: {
        used: user.monthly_github_pushes_used || 0,
        limit: tier.github_pushes_per_month === Infinity ? 'unlimited' : tier.github_pushes_per_month,
        type: tier.github_pushes_type
      },
      current_month: currentMonth,
      resets_on: nextMonth.toISOString().slice(0, 10),
      max_characters: tier.max_characters,
      max_deployed_sites: tier.max_deployed_sites === Infinity ? 'unlimited' : tier.max_deployed_sites,
      file_upload_max_kb: tier.file_upload_max_kb,
      pro_developer: tier.pro_developer,
      badge_removable: tier.badge_removable,
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
