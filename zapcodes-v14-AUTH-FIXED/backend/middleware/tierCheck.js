// backend/middleware/tierCheck.js
// Middleware that enforces subscription tier limits AND BL coin balance checks
// before allowing AI generations, fixes, GitHub pushes, and badge removal.
//
// Every action has TWO gates:
//   1. Plan generation limit (monthly cap or one-time trial)
//   2. BL Coin balance (must have enough coins for the action)

const { SUBSCRIPTION_TIERS } = require('../config/tiers');
const { BL_COIN_COSTS } = require('../config/blCoins');
const { AI_MODELS } = require('../config/aiModels');

// ─── Helper: Reset monthly counters if month changed ───
function resetMonthlyUsageIfNeeded(user) {
  const currentMonth = new Date().toISOString().slice(0, 7); // "2026-03"
  if (user.usage_reset_month !== currentMonth) {
    user.usage = {};
    user.monthly_fixes_used = 0;
    user.monthly_github_pushes_used = 0;
    user.usage_reset_month = currentMonth;
  }
}

// ─── Middleware: Check if user can generate with a specific AI model ───
function checkCanGenerate(req, res, next) {
  const modelKey = req.body.model || req.query.model;
  if (!modelKey) {
    return res.status(400).json({
      error: 'No AI model specified. Include "model" in your request (e.g., "groq", "gemini-2.5-flash").'
    });
  }

  const user = req.user;
  resetMonthlyUsageIfNeeded(user);

  const tierName = user.subscription_tier || 'free';
  const tier = SUBSCRIPTION_TIERS[tierName];
  if (!tier) {
    return res.status(500).json({ error: 'Invalid subscription tier.' });
  }

  const modelConfig = tier.ai_models[modelKey];
  const modelInfo = AI_MODELS[modelKey];

  // Unknown model?
  if (!modelInfo) {
    return res.status(400).json({ error: 'Unknown model: ' + modelKey });
  }

  // 1. Is this model available on the user's tier?
  if (!modelConfig) {
    return res.status(403).json({
      error: modelInfo.label + ' is not available on the ' + tier.name + ' plan. Upgrade to access this model.',
      upgrade_required: true,
      min_tier: modelInfo.tier_min
    });
  }

  // 2. Check generation limit
  if (modelConfig.limit !== Infinity) {
    const currentMonth = new Date().toISOString().slice(0, 7);

    if (modelConfig.type === 'one_time_trial') {
      // One-time trials never reset — tracked in trials_used
      const totalUsed = (user.trials_used && user.trials_used[modelKey]) || 0;
      if (totalUsed >= modelConfig.limit) {
        return res.status(403).json({
          error: 'Your one-time trial of ' + modelConfig.limit + ' ' + modelInfo.label + ' generation(s) has been used.',
          trial_exhausted: true
        });
      }
    } else {
      // Monthly limit — tracked in usage[modelKey][currentMonth]
      const monthlyUsed = (user.usage && user.usage[modelKey] && user.usage[modelKey][currentMonth]) || 0;
      if (monthlyUsed >= modelConfig.limit) {
        return res.status(403).json({
          error: 'Monthly limit reached for ' + modelInfo.label + ' (' + modelConfig.limit + '/mo). Resets next month.',
          limit_reached: true,
          used: monthlyUsed,
          limit: modelConfig.limit
        });
      }
    }
  }

  // 3. Check BL Coin balance
  const blCost = BL_COIN_COSTS.generation[modelKey];
  if (blCost === undefined) {
    return res.status(500).json({ error: 'No BL cost defined for model: ' + modelKey });
  }
  const userCoins = user.bl_coins || 0;
  if (userCoins < blCost) {
    return res.status(403).json({
      error: 'Not enough BL Coins. Need ' + blCost.toLocaleString() + ' BL for ' + modelInfo.label + '. You have ' + userCoins.toLocaleString() + ' BL.',
      insufficient_bl: true,
      bl_needed: blCost,
      bl_current: userCoins
    });
  }

  // Attach info for the route handler to use AFTER successful generation
  req.blCoinCost = blCost;
  req.modelKey = modelKey;
  req.aiModelConfig = modelConfig;
  next();
}

// ─── After successful generation: deduct BL and increment counters ───
async function recordGeneration(user, modelKey, blCost) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const tierName = user.subscription_tier || 'free';
  const tier = SUBSCRIPTION_TIERS[tierName];
  const modelConfig = tier ? tier.ai_models[modelKey] : null;

  // Deduct BL coins
  user.bl_coins = Math.max(0, (user.bl_coins || 0) - blCost);

  // Increment monthly usage counter
  if (!user.usage) user.usage = {};
  if (!user.usage[modelKey]) user.usage[modelKey] = {};
  user.usage[modelKey][currentMonth] = (user.usage[modelKey][currentMonth] || 0) + 1;

  // If this is a one-time trial, also track in trials_used (never resets)
  if (modelConfig && modelConfig.type === 'one_time_trial') {
    if (!user.trials_used) user.trials_used = {};
    user.trials_used[modelKey] = (user.trials_used[modelKey] || 0) + 1;
    user.markModified('trials_used');
  }

  // Tell Mongoose these nested objects changed
  user.markModified('usage');
  await user.save();
}

// ─── Middleware: Check if user can perform a code fix ───
function checkCanFix(req, res, next) {
  const modelKey = req.body.model || req.body.fix_model || 'groq';
  const user = req.user;
  resetMonthlyUsageIfNeeded(user);

  const tierName = user.subscription_tier || 'free';
  const tier = SUBSCRIPTION_TIERS[tierName];

  // Check fix count limit
  if (tier.fixes_per_month !== Infinity) {
    if (tier.fixes_type === 'one_time_trial') {
      const totalFixesUsed = (user.trials_used && user.trials_used['fixes']) || 0;
      if (totalFixesUsed >= tier.fixes_per_month) {
        return res.status(403).json({
          error: 'Your one-time trial fix has been used. Upgrade to get more fixes.',
          trial_exhausted: true
        });
      }
    } else {
      if ((user.monthly_fixes_used || 0) >= tier.fixes_per_month) {
        return res.status(403).json({
          error: 'Monthly fix limit reached (' + tier.fixes_per_month + '/mo). Resets next month.',
          limit_reached: true
        });
      }
    }
  }

  // Check BL balance for fix
  const blCost = BL_COIN_COSTS.code_fix[modelKey] || BL_COIN_COSTS.code_fix['groq'];
  const userCoins = user.bl_coins || 0;
  if (userCoins < blCost) {
    return res.status(403).json({
      error: 'Not enough BL Coins for fix. Need ' + blCost.toLocaleString() + ' BL. You have ' + userCoins.toLocaleString() + ' BL.',
      insufficient_bl: true,
      bl_needed: blCost,
      bl_current: userCoins
    });
  }

  req.blCoinCost = blCost;
  req.fixModelKey = modelKey;
  next();
}

// ─── After successful fix: deduct BL and increment counter ───
async function recordFix(user, modelKey, blCost) {
  user.bl_coins = Math.max(0, (user.bl_coins || 0) - blCost);
  user.monthly_fixes_used = (user.monthly_fixes_used || 0) + 1;

  const tierName = user.subscription_tier || 'free';
  const tier = SUBSCRIPTION_TIERS[tierName];
  if (tier && tier.fixes_type === 'one_time_trial') {
    if (!user.trials_used) user.trials_used = {};
    user.trials_used['fixes'] = (user.trials_used['fixes'] || 0) + 1;
    user.markModified('trials_used');
  }

  await user.save();
}

// ─── Middleware: Check if user can push to GitHub ───
function checkCanPushGitHub(req, res, next) {
  const user = req.user;
  resetMonthlyUsageIfNeeded(user);

  const tierName = user.subscription_tier || 'free';
  const tier = SUBSCRIPTION_TIERS[tierName];

  // Check push count limit
  if (tier.github_pushes_per_month !== Infinity) {
    if (tier.github_pushes_type === 'one_time_trial') {
      const totalPushes = (user.trials_used && user.trials_used['github_pushes']) || 0;
      if (totalPushes >= tier.github_pushes_per_month) {
        return res.status(403).json({
          error: 'Your one-time trial GitHub push has been used. Upgrade for more.',
          trial_exhausted: true
        });
      }
    } else {
      if ((user.monthly_github_pushes_used || 0) >= tier.github_pushes_per_month) {
        return res.status(403).json({
          error: 'Monthly GitHub push limit reached (' + tier.github_pushes_per_month + '/mo). Resets next month.',
          limit_reached: true
        });
      }
    }
  }

  // Check BL balance
  const blCost = BL_COIN_COSTS.github_push;
  const userCoins = user.bl_coins || 0;
  if (userCoins < blCost) {
    return res.status(403).json({
      error: 'Not enough BL Coins for GitHub push. Need ' + blCost.toLocaleString() + ' BL. You have ' + userCoins.toLocaleString() + ' BL.',
      insufficient_bl: true,
      bl_needed: blCost,
      bl_current: userCoins
    });
  }

  req.blCoinCost = blCost;
  next();
}

// ─── After successful GitHub push: deduct BL and increment counter ───
async function recordGitHubPush(user) {
  const blCost = BL_COIN_COSTS.github_push;
  user.bl_coins = Math.max(0, (user.bl_coins || 0) - blCost);
  user.monthly_github_pushes_used = (user.monthly_github_pushes_used || 0) + 1;

  const tierName = user.subscription_tier || 'free';
  const tier = SUBSCRIPTION_TIERS[tierName];
  if (tier && tier.github_pushes_type === 'one_time_trial') {
    if (!user.trials_used) user.trials_used = {};
    user.trials_used['github_pushes'] = (user.trials_used['github_pushes'] || 0) + 1;
    user.markModified('trials_used');
  }

  await user.save();
}

// ─── Middleware: Check if user can remove badge ───
function checkCanRemoveBadge(req, res, next) {
  const user = req.user;
  const tierName = user.subscription_tier || 'free';
  const tier = SUBSCRIPTION_TIERS[tierName];

  if (!tier.badge_removable) {
    return res.status(403).json({
      error: 'Badge removal is available on Silver plan and above. Upgrade to remove the badge.',
      upgrade_required: true
    });
  }

  const blCost = BL_COIN_COSTS.badge_removal;
  const userCoins = user.bl_coins || 0;
  if (userCoins < blCost) {
    return res.status(403).json({
      error: 'Not enough BL Coins. Badge removal costs ' + blCost.toLocaleString() + ' BL. You have ' + userCoins.toLocaleString() + ' BL.',
      insufficient_bl: true,
      bl_needed: blCost,
      bl_current: userCoins
    });
  }

  req.blCoinCost = blCost;
  next();
}

// ─── After successful badge removal: deduct BL ───
async function recordBadgeRemoval(user) {
  const blCost = BL_COIN_COSTS.badge_removal;
  user.bl_coins = Math.max(0, (user.bl_coins || 0) - blCost);
  await user.save();
}

module.exports = {
  checkCanGenerate,
  recordGeneration,
  checkCanFix,
  recordFix,
  checkCanPushGitHub,
  recordGitHubPush,
  checkCanRemoveBadge,
  recordBadgeRemoval,
  resetMonthlyUsageIfNeeded
};
