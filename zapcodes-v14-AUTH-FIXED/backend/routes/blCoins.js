// backend/routes/blCoins.js
// BL Coin endpoints: daily claim, balance status, top-up packs, purchase
//
// Routes:
//   POST /api/bl-coins/daily-claim  — Claim daily BL coins (24hr cooldown)
//   GET  /api/bl-coins/status       — Get current balance and claim timer
//   GET  /api/bl-coins/packs        — Get top-up pack options (public)
//   POST /api/bl-coins/purchase     — Start Stripe checkout for BL top-up

const express = require('express');
const router = express.Router();
const { SUBSCRIPTION_TIERS } = require('../config/tiers');
const { BL_TOPUP_PACKS } = require('../config/blCoins');

// ─── Daily BL Coin Claim ───
router.post('/daily-claim', async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const tierName = user.subscription_tier || 'free';
    const tier = SUBSCRIPTION_TIERS[tierName];
    if (!tier) return res.status(500).json({ error: 'Invalid tier' });

    const now = new Date();
    const lastClaim = user.last_bl_claim ? new Date(user.last_bl_claim) : null;
    const msIn24h = 24 * 60 * 60 * 1000;

    // Check 24-hour cooldown
    if (lastClaim) {
      const msSince = now.getTime() - lastClaim.getTime();
      if (msSince < msIn24h) {
        const nextClaimAt = new Date(lastClaim.getTime() + msIn24h);
        return res.status(429).json({
          error: 'Daily claim already used. Come back later!',
          next_claim_at: nextClaimAt.toISOString(),
          seconds_remaining: Math.ceil((nextClaimAt.getTime() - now.getTime()) / 1000)
        });
      }
    }

    // Award daily BL
    const claimAmount = tier.daily_bl_claim;
    user.bl_coins = (user.bl_coins || 0) + claimAmount;
    user.last_bl_claim = now;
    await user.save();

    const nextClaimAt = new Date(now.getTime() + msIn24h);
    res.json({
      success: true,
      claimed: claimAmount,
      new_balance: user.bl_coins,
      tier: tier.name,
      next_claim_at: nextClaimAt.toISOString(),
      seconds_remaining: Math.ceil(msIn24h / 1000)
    });
  } catch (err) {
    console.error('Daily claim error:', err);
    res.status(500).json({ error: 'Failed to process daily claim' });
  }
});

// ─── Get BL Coin Balance & Claim Status ───
router.get('/status', async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const tierName = user.subscription_tier || 'free';
    const tier = SUBSCRIPTION_TIERS[tierName];
    const now = new Date();
    const lastClaim = user.last_bl_claim ? new Date(user.last_bl_claim) : null;
    const msIn24h = 24 * 60 * 60 * 1000;

    let canClaim = true;
    let secondsRemaining = 0;
    let nextClaimAt = null;

    if (lastClaim) {
      nextClaimAt = new Date(lastClaim.getTime() + msIn24h);
      if (now < nextClaimAt) {
        canClaim = false;
        secondsRemaining = Math.ceil((nextClaimAt.getTime() - now.getTime()) / 1000);
      }
    }

    res.json({
      bl_coins: user.bl_coins || 0,
      daily_claim_amount: tier.daily_bl_claim,
      can_claim: canClaim,
      seconds_remaining: secondsRemaining,
      next_claim_at: nextClaimAt ? nextClaimAt.toISOString() : null,
      tier: tier.name
    });
  } catch (err) {
    console.error('BL status error:', err);
    res.status(500).json({ error: 'Failed to get BL status' });
  }
});

// ─── Get Top-Up Pack Options (public — no auth required) ───
router.get('/packs', (req, res) => {
  const packs = BL_TOPUP_PACKS.map(p => ({
    id: p.id,
    price: p.price,
    coins: p.coins,
    label: p.label,
    multiplier: p.multiplier || false
  }));
  res.json({ packs, signup_bonus: 50000 });
});

// ─── Purchase BL Coins (creates Stripe checkout session) ───
router.post('/purchase', async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { packId, quantity } = req.body;
    const pack = BL_TOPUP_PACKS.find(p => p.id === packId);
    if (!pack) {
      return res.status(400).json({ error: 'Invalid pack ID. Options: starter, popular, best_value, ultimate' });
    }

    if (!pack.stripePriceId) {
      return res.status(500).json({ error: 'Stripe price not configured for this pack. Contact support.' });
    }

    // Only the ultimate pack supports quantity > 1
    let finalQuantity = 1;
    if (pack.multiplier && quantity && parseInt(quantity) > 1) {
      finalQuantity = Math.min(parseInt(quantity), 10); // cap at 10x
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const frontendUrl = process.env.FRONTEND_URL || 'https://zapcodes.net';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: pack.stripePriceId,
        quantity: finalQuantity
      }],
      mode: 'payment',
      success_url: frontendUrl + '/pricing?bl_success=true',
      cancel_url: frontendUrl + '/pricing?bl_canceled=true',
      client_reference_id: user._id.toString(),
      metadata: {
        type: 'bl_topup',
        userId: user._id.toString(),
        packId: pack.id,
        coinsToAdd: String(pack.coins * finalQuantity),
        quantity: String(finalQuantity),
        packPrice: String(pack.price * finalQuantity)
      }
    });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error('BL purchase error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

module.exports = router;
