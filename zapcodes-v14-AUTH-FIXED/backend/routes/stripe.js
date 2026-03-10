const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const { SUBSCRIPTION_TIERS } = require('../config/tiers');

// ══════════ PLAN CONFIG — UPDATED: Gold = $39.99 ══════════
const PLANS = {
  bronze:  { monthly: process.env.STRIPE_PRICE_BRONZE_MONTHLY,  yearly: process.env.STRIPE_PRICE_BRONZE_YEARLY,  amount: 499 },
  silver:  { monthly: process.env.STRIPE_PRICE_SILVER_MONTHLY,  yearly: process.env.STRIPE_PRICE_SILVER_YEARLY,  amount: 1499 },
  gold:    { monthly: process.env.STRIPE_PRICE_GOLD_MONTHLY,    yearly: process.env.STRIPE_PRICE_GOLD_YEARLY,    amount: 3999 },
  diamond: { monthly: process.env.STRIPE_PRICE_DIAMOND_MONTHLY, yearly: process.env.STRIPE_PRICE_DIAMOND_YEARLY, amount: 9999 },
};

// ══════════ POST /api/stripe/create-checkout ══════════
router.post('/create-checkout', auth, async (req, res) => {
  try {
    const { plan, interval = 'monthly' } = req.body;
    const planConfig = PLANS[plan];
    if (!planConfig) return res.status(400).json({ error: 'Invalid plan' });

    // Create/get Stripe customer
    let customerId = req.user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name,
        metadata: { userId: req.user._id.toString(), user_id: req.user.user_id },
      });
      customerId = customer.id;
      req.user.stripeCustomerId = customerId;
      await req.user.save();
    }

    // Build line items
    const priceId = planConfig[interval];
    const lineItems = priceId
      ? [{ price: priceId, quantity: 1 }]
      : [{
          price_data: {
            currency: 'usd',
            recurring: { interval: interval === 'yearly' ? 'year' : 'month' },
            unit_amount: interval === 'yearly' ? Math.round(planConfig.amount * 12) : planConfig.amount,
            product_data: {
              name: `ZapCodes ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
              description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan — ${interval}`,
            },
          },
          quantity: 1,
        }];

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'subscription',
      success_url: `${process.env.WEB_URL || 'https://zapcodes.net'}/dashboard?upgrade=success&plan=${plan}`,
      cancel_url: `${process.env.WEB_URL || 'https://zapcodes.net'}/pricing?upgrade=cancelled`,
      metadata: { userId: req.user._id.toString(), user_id: req.user.user_id, plan, interval },
      subscription_data: { metadata: { userId: req.user._id.toString(), user_id: req.user.user_id, plan, interval } },
      allow_promotion_codes: true,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[Stripe] Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ══════════ REFERRAL COMMISSION HELPER ══════════
// Pays L1 + L2 commissions on subscription and BL top-up purchases
async function processReferralCommission(user, amountUSD, sourceType) {
  try {
    if (!user.referred_by) return;

    // Find Level 1 referrer
    const l1Referrer = await User.findOne({
      $or: [
        { user_id: user.referred_by },
        { _id: user.referred_by },
        { referral_code: user.referred_by }
      ]
    });
    if (!l1Referrer) return;

    const l1Tier = SUBSCRIPTION_TIERS[l1Referrer.subscription_tier || 'free'];
    const l1Percent = l1Tier.referral_l1_percent || 2;
    const l1Commission = Math.round(amountUSD * (l1Percent / 100) * 100) / 100; // in USD

    if (l1Commission > 0) {
      l1Referrer.total_earnings_usd = (l1Referrer.total_earnings_usd || 0) + l1Commission;
      l1Referrer.usd_balance = (l1Referrer.usd_balance || 0) + l1Commission;
      l1Referrer.total_earnings = (l1Referrer.total_earnings || 0) + l1Commission;
      await l1Referrer.save();
      console.log(`[Referral] L1 ${l1Percent}%: ${l1Referrer.email} +$${l1Commission} from ${user.email} (${sourceType})`);
    }

    // Find Level 2 referrer (the person who referred the L1 referrer)
    if (l1Referrer.referred_by) {
      const l2Referrer = await User.findOne({
        $or: [
          { user_id: l1Referrer.referred_by },
          { _id: l1Referrer.referred_by },
          { referral_code: l1Referrer.referred_by }
        ]
      });
      if (l2Referrer) {
        const l2Tier = SUBSCRIPTION_TIERS[l2Referrer.subscription_tier || 'free'];
        const l2Percent = l2Tier.referral_l2_percent || 1;
        const l2Commission = Math.round(amountUSD * (l2Percent / 100) * 100) / 100;

        if (l2Commission > 0) {
          l2Referrer.total_earnings_usd = (l2Referrer.total_earnings_usd || 0) + l2Commission;
          l2Referrer.usd_balance = (l2Referrer.usd_balance || 0) + l2Commission;
          l2Referrer.total_earnings = (l2Referrer.total_earnings || 0) + l2Commission;
          await l2Referrer.save();
          console.log(`[Referral] L2 ${l2Percent}%: ${l2Referrer.email} +$${l2Commission} from ${user.email} (${sourceType})`);
        }
      }
    }
  } catch (err) {
    console.error('[Referral] Commission error:', err.message);
  }
}

// ══════════ POST /api/stripe/webhook ══════════
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Stripe] Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId || session.client_reference_id;
        if (!userId) break;
        const user = await User.findById(userId);
        if (!user) break;

        // ── BL Coin Top-Up Purchase (from /api/bl-coins/purchase route) ──
        if (session.metadata?.type === 'bl_topup') {
          const coins = parseInt(session.metadata.coinsToAdd || session.metadata.coins) || 0;
          if (coins > 0) {
            const packPrice = parseFloat(session.metadata.packPrice) || (session.amount_total / 100) || 0;
            user.creditCoins(coins, 'topup', `Top-up: ${coins.toLocaleString()} BL ($${packPrice.toFixed(2)})`);
            await user.save();
            console.log(`[Stripe] BL Top-up: ${user.email} +${coins.toLocaleString()} BL ($${packPrice.toFixed(2)})`);

            // Pay referral commissions on BL top-up (ongoing, no time limit)
            if (packPrice > 0) {
              await processReferralCommission(user, packPrice, 'bl_topup');
            }
          }
          break;
        }

        // ── Legacy top-up format (from old coins route) ──
        if (session.metadata?.type === 'topup') {
          const coins = parseInt(session.metadata.coins) || 0;
          if (coins > 0) {
            user.creditCoins(coins, 'topup', `Top-up: ${coins.toLocaleString()} BL`);
            await user.save();
            console.log(`[Stripe] Top-up (legacy): ${user.email} +${coins} BL`);
          }
          break;
        }

        // ── Subscription Upgrade ──
        const plan = session.metadata?.plan;
        const interval = session.metadata?.interval || 'monthly';
        if (plan && PLANS[plan]) {
          const oldTier = user.subscription_tier;
          user.subscription_tier = plan;
          user.stripeSubscriptionId = session.subscription;
          user.paymentProvider = 'stripe';
          user.subscriptionStart = new Date();
          user.billingInterval = interval;

          // Set is_diamond flag for BlendLink compatibility
          user.is_diamond = (plan === 'diamond');

          await user.save();
          console.log(`[Stripe] Upgrade: ${user.email} ${oldTier} → ${plan} (${interval})`);

          // Pay referral commissions on subscription (capped at 6 months per referral)
          const amountUSD = PLANS[plan].amount / 100;
          await processReferralCommission(user, amountUSD, 'subscription');
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (user) {
          console.log(`[Stripe] Cancel: ${user.email} ${user.subscription_tier} → free`);
          user.subscription_tier = 'free';
          user.stripeSubscriptionId = null;
          user.billingInterval = null;
          user.is_diamond = false;
          await user.save();
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        if (subscription.cancel_at_period_end) {
          const user = await User.findOne({ stripeSubscriptionId: subscription.id });
          if (user) console.log(`[Stripe] Cancellation scheduled: ${user.email} (${user.subscription_tier} ends at period)`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        // Recurring subscription payment — pay referral commission
        const invoice = event.data.object;
        if (invoice.subscription && invoice.amount_paid > 0) {
          const user = await User.findOne({ stripeCustomerId: invoice.customer });
          if (user && user.referred_by) {
            const amountUSD = invoice.amount_paid / 100;
            await processReferralCommission(user, amountUSD, 'subscription_renewal');
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) console.log(`[Stripe] Payment failed: ${user.email}`);
        break;
      }
    }
  } catch (err) {
    console.error('[Stripe] Webhook handler error:', err);
  }

  res.json({ received: true });
});

// ══════════ POST /api/stripe/portal ══════════
router.post('/portal', auth, async (req, res) => {
  try {
    if (!req.user.stripeCustomerId) return res.status(400).json({ error: 'No billing account' });
    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripeCustomerId,
      return_url: `${process.env.WEB_URL || 'https://zapcodes.net'}/dashboard`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// ══════════ GET /api/stripe/plans ══════════
router.get('/plans', (req, res) => {
  res.json({
    plans: Object.entries(PLANS).map(([id, p]) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      monthly: `$${(p.amount / 100).toFixed(2)}`,
      yearly: `$${((p.amount * 12) / 100).toFixed(2)}`,
      amount_cents: p.amount,
    })),
  });
});

module.exports = router;
