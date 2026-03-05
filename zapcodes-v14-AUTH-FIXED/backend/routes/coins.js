const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const TOPUP_PACKAGES = {
  '30k':  { coins: 30000,    price: 499,   label: '30,000 BL' },
  '80k':  { coins: 80000,    price: 999,   label: '80,000 BL' },
  '400k': { coins: 400000,   price: 1499,  label: '400,000 BL' },
  '1m':   { coins: 1000000,  price: 2999,  label: '1,000,000 BL' },
};

// ═══════════════════════════════════════════════
// POST /api/coins/claim — Daily BL coin claim
// ═══════════════════════════════════════════════
router.post('/claim', auth, async (req, res) => {
  try {
    const user = req.user;
    const config = user.getTierConfig();

    // Signup bonus (one-time 50K)
    let bonus = 0;
    if (!user.signup_bonus_claimed) {
      bonus = 50000;
      user.creditCoins(bonus, 'signup_bonus', 'Welcome to ZapCodes! 🎉');
      user.signup_bonus_claimed = true;
    }

    // Check 24h cooldown
    if (!user.canClaimDaily()) {
      const countdown = user.getClaimCountdown();
      return res.status(403).json({
        error: 'Daily claim not ready',
        nextClaimIn: countdown,
        canClaim: false,
        balance: user.bl_coins,
      });
    }

    // Credit daily claim
    const claimed = config.dailyClaim;
    user.creditCoins(claimed, 'claim', `Daily ${user.subscription_tier} claim: ${claimed.toLocaleString()} BL`);
    user.last_daily_claim = new Date();
    await user.save();

    res.json({
      balance: user.bl_coins,
      claimed,
      bonus,
      plan: user.subscription_tier,
      subscription_tier: user.subscription_tier,
      nextClaimIn: 24 * 60 * 60,
      canClaim: false,
    });
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

    // Auto-reset daily usage
    if (!user.daily_usage || user.daily_usage.date !== today) {
      user.daily_usage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
    }

    // Sanitize Infinity values — JSON.stringify turns Infinity into null,
    // which breaks frontend fallback defaults. Use 999999999 as sentinel for "unlimited".
    const safeConfig = {};
    for (const [key, val] of Object.entries(config)) {
      safeConfig[key] = (val === Infinity) ? 999999999 : val;
    }

    res.json({
      balance: user.bl_coins,
      plan: user.subscription_tier,
      subscription_tier: user.subscription_tier,
      tierConfig: safeConfig,
      dailyUsage: user.daily_usage,
      nextClaimIn: user.getClaimCountdown(),
      canClaim: user.canClaimDaily(),
      signupBonusClaimed: user.signup_bonus_claimed,
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
// ═══════════════════════════════════════════════
router.post('/topup', auth, async (req, res) => {
  try {
    const { package: pkgId, provider } = req.body;
    const pkg = TOPUP_PACKAGES[pkgId];
    if (!pkg) return res.status(400).json({ error: 'Invalid package' });

    const user = req.user;

    if (provider === 'xendit') {
      // TODO: Xendit integration
      return res.status(501).json({ error: 'Xendit not yet implemented' });
    }

    // Stripe checkout
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
          product_data: { name: `ZapCodes BL Top-Up: ${pkg.label}` },
          unit_amount: pkg.price,
        },
        quantity: 1,
      }],
      metadata: { type: 'topup', userId: user._id.toString(), user_id: user.user_id, package: pkgId, coins: pkg.coins.toString() },
      success_url: `${process.env.WEB_URL || 'https://zapcodes.net'}/dashboard?topup=success`,
      cancel_url: `${process.env.WEB_URL || 'https://zapcodes.net'}/pricing?topup=cancelled`,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[Coins] Top-up error:', err);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

module.exports = router;
