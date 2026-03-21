// backend/routes/pricing.js
// Public endpoint — NO auth required
// Serves tier definitions and BL coin data for the frontend pricing page
//
// Route: GET /api/pricing/tiers
// Route: GET /api/pricing/active-promo  (NEW — returns current public promo)

const express = require('express');
const router = express.Router();
const { SUBSCRIPTION_TIERS, TIER_ORDER } = require('../config/tiers');
const { BL_COIN_COSTS, BL_TOPUP_PACKS, SIGNUP_BONUS_BL } = require('../config/blCoins');
const { AI_MODELS } = require('../config/aiModels');

// Try to load PromoCode model (non-fatal if not yet deployed)
let PromoCode;
try { PromoCode = require('../models/PromoCode'); } catch (e) { PromoCode = null; }

router.get('/tiers', (req, res) => {
  // Build public-safe tier data (strips Stripe price IDs and internal config)
  const tiers = {};

  for (const [key, tier] of Object.entries(SUBSCRIPTION_TIERS)) {
    // Build model info for this tier
    const models = {};
    for (const [modelKey, modelConfig] of Object.entries(tier.ai_models)) {
      const info = AI_MODELS[modelKey];
      models[modelKey] = {
        limit: modelConfig.limit === Infinity ? 'unlimited' : modelConfig.limit,
        type: modelConfig.type,
        label: info ? info.label : modelKey,
        description: info ? info.description : '',
        bl_cost_gen: BL_COIN_COSTS.generation[modelKey] || 0,
        bl_cost_fix: BL_COIN_COSTS.code_fix[modelKey] || 0
      };
    }

    tiers[key] = {
      name: tier.name,
      price: tier.price,
      ai_models: models,
      max_characters: tier.max_characters,
      max_deployed_sites: tier.max_deployed_sites === Infinity ? 'unlimited' : tier.max_deployed_sites,
      fixes_per_month: tier.fixes_per_month === Infinity ? 'unlimited' : tier.fixes_per_month,
      fixes_type: tier.fixes_type,
      github_pushes_per_month: tier.github_pushes_per_month === Infinity ? 'unlimited' : tier.github_pushes_per_month,
      github_pushes_type: tier.github_pushes_type,
      file_upload_max_kb: tier.file_upload_max_kb,
      pro_developer: tier.pro_developer,
      badge_removable: tier.badge_removable,
      daily_bl_claim: tier.daily_bl_claim,
      // BlendLink features
      daily_photo_minting: tier.daily_photo_minting === Infinity ? 'unlimited' : tier.daily_photo_minting,
      member_pages: tier.member_pages === Infinity ? 'unlimited' : tier.member_pages,
      monthly_listing_limit: tier.monthly_listing_limit === Infinity ? 'unlimited' : tier.monthly_listing_limit,
      referral_l1_percent: tier.referral_l1_percent,
      referral_l2_percent: tier.referral_l2_percent,
      photo_game_xp_multiplier: tier.photo_game_xp_multiplier
    };
  }

  res.json({
    tiers: tiers,
    tier_order: TIER_ORDER,
    bl_costs: {
      generation: BL_COIN_COSTS.generation,
      code_fix: BL_COIN_COSTS.code_fix,
      github_push: BL_COIN_COSTS.github_push,
      badge_removal: BL_COIN_COSTS.badge_removal
    },
    topup_packs: BL_TOPUP_PACKS.map(p => ({
      id: p.id,
      price: p.price,
      coins: p.coins,
      label: p.label,
      multiplier: p.multiplier || false
    })),
    signup_bonus: SIGNUP_BONUS_BL
  });
});

// ══════════════════════════════════════════════════════════════
// GET /api/pricing/active-promo
// PUBLIC — no auth. Returns the latest active "all users" promo
// code for display on landing page and pricing page.
// Only returns promos with empty specificUsers (= available to all).
// ══════════════════════════════════════════════════════════════
router.get('/active-promo', async (req, res) => {
  try {
    if (!PromoCode) return res.json({ promo: null });

    const now = new Date();
    const promo = await PromoCode.findOne({
      isActive: true,
      startsAt: { $lte: now },
      expiresAt: { $gt: now },
      specificUsers: { $size: 0 },  // Only "for all users" promos
      $or: [
        { maxUses: 0 },                              // Unlimited uses
        { $expr: { $lt: ['$usedCount', '$maxUses'] } } // Still has uses left
      ],
    })
    .sort({ createdAt: -1 }) // Latest one wins
    .select('code description discountType discountValue tierUpgradeTo durationDays expiresAt');

    if (!promo) return res.json({ promo: null });

    // Build a user-friendly description
    let discountText = '';
    if (promo.discountType === 'percentage') discountText = `${promo.discountValue}% off`;
    else if (promo.discountType === 'fixed') discountText = `$${promo.discountValue} off`;
    else if (promo.discountType === 'bl_coins') discountText = `${promo.discountValue.toLocaleString()} free BL coins`;
    else if (promo.discountType === 'tier_upgrade') discountText = `Free upgrade to ${promo.tierUpgradeTo}`;

    res.json({
      promo: {
        code: promo.code,
        description: promo.description,
        discountText,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        durationDays: promo.durationDays,
        expiresAt: promo.expiresAt,
      },
    });
  } catch (err) {
    console.error('[Pricing] Active promo fetch failed:', err.message);
    res.json({ promo: null });
  }
});

module.exports = router;
