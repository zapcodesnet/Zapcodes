const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { auth } = require('../middleware/auth');
const User = require('../models/User');

// ══════════ PLAN CONFIG ══════════
const PLANS = {
  bronze:  { monthly: process.env.STRIPE_PRICE_BRONZE_MONTHLY,  yearly: process.env.STRIPE_PRICE_BRONZE_YEARLY,  amount: 499 },
  silver:  { monthly: process.env.STRIPE_PRICE_SILVER_MONTHLY,  yearly: process.env.STRIPE_PRICE_SILVER_YEARLY,  amount: 1499 },
  gold:    { monthly: process.env.STRIPE_PRICE_GOLD_MONTHLY,    yearly: process.env.STRIPE_PRICE_GOLD_YEARLY,    amount: 2999 },
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
        metadata: { userId: req.user._id.toString() },
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
            unit_amount: interval === 'yearly' ? Math.round(planConfig.amount * 10) : planConfig.amount,
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
      metadata: { userId: req.user._id.toString(), plan, interval },
      subscription_data: { metadata: { userId: req.user._id.toString(), plan, interval } },
      allow_promotion_codes: true,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[Stripe] Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

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
        const userId = session.metadata?.userId;
        if (!userId) break;
        const user = await User.findById(userId);
        if (!user) break;

        if (session.metadata?.type === 'topup') {
          // BL coin top-up
          const coins = parseInt(session.metadata.coins) || 0;
          if (coins > 0) {
            user.creditCoins(coins, 'topup', `Top-up: ${coins.toLocaleString()} BL`);
            await user.save();
            console.log(`[Stripe] Top-up: ${user.email} +${coins} BL`);
          }
        } else {
          // Subscription upgrade
          const plan = session.metadata?.plan;
          const interval = session.metadata?.interval || 'monthly';
          if (plan && PLANS[plan]) {
            user.plan = plan;
            user.stripeSubscriptionId = session.subscription;
            user.paymentProvider = 'stripe';
            user.subscriptionStart = new Date();
            user.billingInterval = interval;
            await user.save();
            console.log(`[Stripe] Upgrade: ${user.email} → ${plan} (${interval})`);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (user) {
          console.log(`[Stripe] Cancel: ${user.email} ${user.plan} → free`);
          user.plan = 'free';
          user.stripeSubscriptionId = null;
          user.billingInterval = null;
          await user.save();
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        if (subscription.cancel_at_period_end) {
          const user = await User.findOne({ stripeSubscriptionId: subscription.id });
          if (user) console.log(`[Stripe] Cancellation scheduled: ${user.email}`);
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
      id, monthly: `$${(p.amount / 100).toFixed(2)}`,
      yearly: `$${((p.amount * 10) / 100).toFixed(2)}`,
      yearlySavings: `$${((p.amount * 2) / 100).toFixed(2)}`,
    })),
  });
});

module.exports = router;
