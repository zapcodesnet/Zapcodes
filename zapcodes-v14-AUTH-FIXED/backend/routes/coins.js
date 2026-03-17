const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ── Top-up packages ──
const TOPUP_PACKAGES = {
  '50k':      { coins: 50000,    price: 499,   label: '50,000 BL' },
  '150k':     { coins: 150000,   price: 999,   label: '150,000 BL' },
  '400k':     { coins: 400000,   price: 1499,  label: '400,000 BL' },
  '1m':       { coins: 1000000,  price: 2999,  label: '1,000,000 BL' },
};

// Flexible ID lookup — accepts many formats from the frontend
function findPackage(id) {
  if (!id) return null;
  const key = String(id).toLowerCase().trim();
  // Direct match
  if (TOPUP_PACKAGES[key]) return { pkgId: key, pkg: TOPUP_PACKAGES[key] };
  // Legacy IDs
  const legacyMap = { '30k': '50k', '80k': '150k' };
  if (legacyMap[key]) return { pkgId: legacyMap[key], pkg: TOPUP_PACKAGES[legacyMap[key]] };
  // Match by coin amount (frontend might send "50000" or "1000000")
  const num = parseInt(key.replace(/[^0-9]/g, ''));
  if (num) {
    for (const [k, v] of Object.entries(TOPUP_PACKAGES)) {
      if (v.coins === num) return { pkgId: k, pkg: v };
    }
  }
  // Match by price in cents ("499", "2999")
  for (const [k, v] of Object.entries(TOPUP_PACKAGES)) {
    if (v.price === num) return { pkgId: k, pkg: v };
  }
  // Match by dollar price string ("4.99", "$29.99")
  const dollars = parseFloat(key.replace(/[^0-9.]/g, ''));
  if (dollars) {
    for (const [k, v] of Object.entries(TOPUP_PACKAGES)) {
      if (v.price === Math.round(dollars * 100)) return { pkgId: k, pkg: v };
    }
  }
  // Index-based ("0", "1", "2", "3" or "tier1", "tier2")
  const idx = parseInt(key.replace(/[^0-9]/g, ''));
  const keys = Object.keys(TOPUP_PACKAGES);
  if (idx >= 0 && idx < keys.length) return { pkgId: keys[idx], pkg: TOPUP_PACKAGES[keys[idx]] };
  return null;
}

// ═══════════════════════════════════════════════
// POST /api/coins/claim — Daily BL coin claim
// ═══════════════════════════════════════════════
router.post('/claim', auth, async (req, res) => {
  try {
    const user = req.user;
    const config = user.getTierConfig();

    let bonus = 0;
    if (!user.signup_bonus_claimed) {
      bonus = 50000;
      user.creditCoins(bonus, 'signup_bonus', 'Welcome to ZapCodes! 🎉');
      user.signup_bonus_claimed = true;
    }

    if (!user.canClaimDaily()) {
      const countdown = user.getClaimCountdown();
      return res.status(403).json({ error: 'Daily claim not ready', nextClaimIn: countdown, canClaim: false, balance: user.bl_coins });
    }

    const claimed = config.dailyClaim;
    user.creditCoins(claimed, 'claim', `Daily ${user.subscription_tier} claim: ${claimed.toLocaleString()} BL`);
    user.last_daily_claim = new Date();
    user.daily_claim_last = new Date().toISOString();
    await user.save();

    res.json({ balance: user.bl_coins, claimed, bonus, plan: user.subscription_tier, subscription_tier: user.subscription_tier, nextClaimIn: 24 * 60 * 60, canClaim: false });
  } catch (err) {
    console.error('[Coins] Claim error:', err);
    res.status(500).json({ error: 'Failed to claim coins' });
  }
});

// ═══════════════════════════════════════════════
// GET /api/coins/balance
// ═══════════════════════════════════════════════
router.get('/balance', auth, async (req, res) => {
  try {
    const user = req.user;
    const config = user.getTierConfig();
    const today = new Date().toISOString().split('T')[0];

    if (!user.daily_usage || user.daily_usage.date !== today) {
      user.daily_usage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    }

    const safeConfig = {};
    for (const [key, val] of Object.entries(config)) {
      safeConfig[key] = (val === Infinity) ? 999999999 : val;
    }

    res.json({
      balance: user.bl_coins, plan: user.subscription_tier, subscription_tier: user.subscription_tier,
      tierConfig: safeConfig, dailyUsage: user.daily_usage, nextClaimIn: user.getClaimCountdown(),
      canClaim: user.canClaimDaily(), signupBonusClaimed: user.signup_bonus_claimed,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// ═══════════════════════════════════════════════
// GET /api/coins/transactions
// ═══════════════════════════════════════════════
router.get('/transactions', auth, async (req, res) => {
  try {
    const txns = (req.user.bl_transactions || []).slice(-50).reverse();
    res.json({ transactions: txns });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// ═══════════════════════════════════════════════
// GET /api/coins/packages
// ═══════════════════════════════════════════════
router.get('/packages', auth, (req, res) => {
  const packages = Object.entries(TOPUP_PACKAGES).map(([id, pkg]) => ({
    id, coins: pkg.coins, price: (pkg.price / 100).toFixed(2), label: pkg.label,
  }));
  res.json({ packages });
});

// ═══════════════════════════════════════════════
// POST /api/coins/topup — Create Stripe checkout for BL top-up
// Accepts: { package, packageId, quantity, qty }
// Package can be: "50k", "150k", "400k", "1m", or coin amounts, or prices
// ═══════════════════════════════════════════════
router.post('/topup', auth, async (req, res) => {
  try {
    const rawId = req.body.package || req.body.packageId || req.body.pkg || req.body.id || '';
    const quantity = Math.max(1, Math.min(10, parseInt(req.body.quantity || req.body.qty || 1) || 1));

    console.log(`[Topup] User ${req.user.email} — raw body:`, JSON.stringify(req.body).slice(0, 300));

    const match = findPackage(rawId);
    if (!match) {
      console.warn(`[Topup] No match for package="${rawId}". Valid: 50k, 150k, 400k, 1m`);
      return res.status(400).json({ error: `Invalid package "${rawId}". Valid: 50k, 150k, 400k, 1m` });
    }

    const { pkgId, pkg } = match;
    const user = req.user;
    const totalCoins = pkg.coins * quantity;
    const totalPrice = pkg.price * quantity;

    if (req.body.provider === 'xendit') {
      return res.status(501).json({ error: 'Xendit not yet implemented' });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    if (!user.stripeCustomerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user._id.toString() } });
      user.stripeCustomerId = customer.id;
      await user.save();
    }

    const session = await stripe.checkout.sessions.create({
      customer: user.stripeCustomerId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `ZapCodes BL Top-Up: ${pkg.label}${quantity > 1 ? ` x${quantity}` : ''}` },
          unit_amount: pkg.price,
        },
        quantity,
      }],
      metadata: {
        type: 'topup', userId: user._id.toString(), user_id: user.user_id,
        package: pkgId, coins: totalCoins.toString(), quantity: quantity.toString(),
      },
      success_url: `${process.env.WEB_URL || 'https://zapcodes.net'}/dashboard?topup=success&coins=${totalCoins}`,
      cancel_url: `${process.env.WEB_URL || 'https://zapcodes.net'}/pricing?topup=cancelled`,
    });

    console.log(`[Topup] Checkout: ${totalCoins.toLocaleString()} BL ($${(totalPrice / 100).toFixed(2)}) for ${user.email}`);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[Coins] Top-up error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout: ' + (err.message || '').slice(0, 100) });
  }
});

module.exports = router;
