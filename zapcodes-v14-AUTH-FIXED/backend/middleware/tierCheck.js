// backend/middleware/tierCheck.js
// Middleware that enforces subscription tier limits AND BL coin balance checks
// Uses the User model's existing methods: getTierConfig(), spendCoins(), 
// getMonthlyUsage(), incrementMonthlyUsage(), isTrialExhausted(), incrementTrial()

const { BL_COIN_COSTS } = require('../config/blCoins');

// Map model keys to the monthly_usage field names in User model
const MODEL_TO_USAGE_FIELD = {
  'gemini-3.1-pro': 'gemini_pro_gens',
  'gemini-2.5-flash': 'gemini_flash_gens',
  'haiku-4.5': 'haiku_gens',
  'sonnet-4.6': 'sonnet_gens',
  'groq': 'groq_gens',
};

// Model display labels
const MODEL_LABELS = {
  'groq': 'Groq AI',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3.1-pro': 'Gemini 3.1 Pro',
  'haiku-4.5': 'Haiku 4.5',
  'sonnet-4.6': 'Sonnet 4.6',
};

// ─── Middleware: Check if user can generate with a specific AI model ───
function checkCanGenerate(req, res, next) {
  try {
    const modelKey = req.body.model || req.query.model;
    if (!modelKey) {
      return res.status(400).json({
        error: 'No AI model specified. Include "model" in your request (e.g., "groq", "gemini-2.5-flash").'
      });
    }

    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Super admin bypasses all checks
    if (user.role === 'super-admin') {
      req.blCoinCost = 0;
      req.modelKey = modelKey;
      return next();
    }

    const config = user.getTierConfig();
    const label = MODEL_LABELS[modelKey] || modelKey;

    // 1. Is this model available on the user's tier?
    if (!config.modelChain.includes(modelKey)) {
      return res.status(403).json({
        error: label + ' is not available on your current plan. Upgrade to access this model.',
        upgrade_required: true
      });
    }

    // 2. Check generation limit
    const monthlyLimit = config.monthlyLimits[modelKey];
    if (monthlyLimit !== undefined && monthlyLimit !== Infinity) {
      // Check if this is a one-time trial model
      if (config.trialModels && config.trialModels.includes(modelKey)) {
        // One-time trial: check trials_used (never resets)
        if (user.isTrialExhausted(modelKey, monthlyLimit)) {
          return res.status(403).json({
            error: 'Your one-time trial of ' + monthlyLimit + ' ' + label + ' generation(s) has been used.',
            trial_exhausted: true
          });
        }
      } else {
        // Monthly limit: check monthly_usage
        const mu = user.getMonthlyUsage();
        const field = MODEL_TO_USAGE_FIELD[modelKey];
        const used = field ? (mu[field] || 0) : 0;
        if (used >= monthlyLimit) {
          return res.status(403).json({
            error: 'Monthly limit reached for ' + label + ' (' + monthlyLimit + '/mo). Resets next month.',
            limit_reached: true,
            used: used,
            limit: monthlyLimit
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
        error: 'Not enough BL Coins. Need ' + blCost.toLocaleString() + ' BL for ' + label + '. You have ' + userCoins.toLocaleString() + ' BL.',
        insufficient_bl: true,
        bl_needed: blCost,
        bl_current: userCoins
      });
    }

    // Pass cost info to route handler
    req.blCoinCost = blCost;
    req.modelKey = modelKey;
    next();
  } catch (err) {
    console.error('checkCanGenerate error:', err);
    res.status(500).json({ error: 'Failed to check generation permissions' });
  }
}

// ─── After successful generation: deduct BL and increment counters ───
async function recordGeneration(user, modelKey, blCost) {
  if (user.role === 'super-admin') return;

  const config = user.getTierConfig();
  const label = MODEL_LABELS[modelKey] || modelKey;

  // Deduct BL coins using existing spendCoins method
  user.spendCoins(blCost, 'generation', label + ' generation', modelKey);

  // Increment monthly usage
  user.incrementMonthlyUsage(modelKey, 'generation');

  // If one-time trial, also increment trial counter
  if (config.trialModels && config.trialModels.includes(modelKey)) {
    user.incrementTrial(modelKey);
  }

  await user.save();
}

// ─── Middleware: Check if user can perform a code fix ───
function checkCanFix(req, res, next) {
  try {
    const modelKey = req.body.model || req.body.fix_model || 'groq';
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (user.role === 'super-admin') { req.blCoinCost = 0; req.fixModelKey = modelKey; return next(); }

    const config = user.getTierConfig();
    const mu = user.getMonthlyUsage();

    // Check fix count limit
    if (config.monthlyFixCap !== Infinity) {
      if (config.monthlyFixType === 'one_time_trial') {
        if (user.isTrialExhausted('fixes', config.monthlyFixCap)) {
          return res.status(403).json({
            error: 'Your one-time trial fix has been used. Upgrade to get more fixes.',
            trial_exhausted: true
          });
        }
      } else {
        if ((mu.code_fixes || 0) >= config.monthlyFixCap) {
          return res.status(403).json({
            error: 'Monthly fix limit reached (' + config.monthlyFixCap + '/mo). Resets next month.',
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
  } catch (err) {
    console.error('checkCanFix error:', err);
    res.status(500).json({ error: 'Failed to check fix permissions' });
  }
}

// ─── After successful fix: deduct BL and increment counter ───
async function recordFix(user, modelKey, blCost) {
  if (user.role === 'super-admin') return;

  const config = user.getTierConfig();
  const label = MODEL_LABELS[modelKey] || modelKey;

  user.spendCoins(blCost, 'code_fix', label + ' code fix', modelKey);
  user.incrementMonthlyUsage(modelKey, 'code_fix');

  if (config.monthlyFixType === 'one_time_trial') {
    user.incrementTrial('fixes');
  }

  await user.save();
}

// ─── Middleware: Check if user can push to GitHub ───
function checkCanPushGitHub(req, res, next) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (user.role === 'super-admin') { req.blCoinCost = 0; return next(); }

    const config = user.getTierConfig();
    const mu = user.getMonthlyUsage();

    if (config.monthlyPushCap !== Infinity) {
      if (config.monthlyPushType === 'one_time_trial') {
        if (user.isTrialExhausted('github_pushes', config.monthlyPushCap)) {
          return res.status(403).json({
            error: 'Your one-time trial GitHub push has been used. Upgrade for more.',
            trial_exhausted: true
          });
        }
      } else {
        if ((mu.github_pushes || 0) >= config.monthlyPushCap) {
          return res.status(403).json({
            error: 'Monthly GitHub push limit reached (' + config.monthlyPushCap + '/mo). Resets next month.',
            limit_reached: true
          });
        }
      }
    }

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
  } catch (err) {
    console.error('checkCanPushGitHub error:', err);
    res.status(500).json({ error: 'Failed to check push permissions' });
  }
}

// ─── After successful push: deduct BL and increment counter ───
async function recordGitHubPush(user) {
  if (user.role === 'super-admin') return;

  const config = user.getTierConfig();
  user.spendCoins(BL_COIN_COSTS.github_push, 'github_push', 'GitHub push');
  user.incrementMonthlyUsage(null, 'push');

  if (config.monthlyPushType === 'one_time_trial') {
    user.incrementTrial('github_pushes');
  }

  await user.save();
}

// ─── Middleware: Check if user can remove badge ───
function checkCanRemoveBadge(req, res, next) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (user.role === 'super-admin') { req.blCoinCost = 0; return next(); }

    const config = user.getTierConfig();
    if (!config.canRemoveBadge) {
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
  } catch (err) {
    console.error('checkCanRemoveBadge error:', err);
    res.status(500).json({ error: 'Failed to check badge removal permissions' });
  }
}

// ─── After successful badge removal: deduct BL ───
async function recordBadgeRemoval(user) {
  if (user.role === 'super-admin') return;
  user.spendCoins(BL_COIN_COSTS.badge_removal, 'badge_removal', 'Badge removal');
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
};
