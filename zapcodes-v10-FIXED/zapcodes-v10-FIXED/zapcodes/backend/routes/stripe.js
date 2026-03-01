const express = require('express');
const { auth } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

let stripe;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch (e) {
  console.warn('Stripe not configured');
}

// POST /api/stripe/create-checkout — Create Stripe Checkout session
router.post('/create-checkout', auth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

  try {
    const { plan } = req.body; // 'starter', 'pro', or 'diamond'
    const user = req.user;

    const priceIds = {
      starter: process.env.STRIPE_STARTER_PRICE_ID,
      pro: process.env.STRIPE_PRO_PRICE_ID,
      diamond: process.env.STRIPE_DIAMOND_PRICE_ID,
    };

    if (!priceIds[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user._id.toString() },
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceIds[plan], quantity: 1 }],
      success_url: `${process.env.WEB_URL}/dashboard?upgraded=${plan}`,
      cancel_url: `${process.env.WEB_URL}/pricing?cancelled=true`,
      metadata: { userId: user._id.toString(), plan },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create checkout', details: err.message });
  }
});

// POST /api/stripe/portal — Customer billing portal
router.post('/portal', auth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

  try {
    if (!req.user.stripeCustomerId) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripeCustomerId,
      return_url: `${process.env.WEB_URL}/dashboard`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to open billing portal', details: err.message });
  }
});

// POST /api/stripe/webhook — Stripe webhook handler
router.post('/webhook', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata.userId;
      const plan = session.metadata.plan;

      const user = await User.findById(userId);
      if (user) {
        user.plan = plan;
        user.stripeSubscriptionId = session.subscription;
        // Sync limits with plan using tier system
        const TIER_LIMITS = {
          free:    { scans: 5,    builds: 3,   generations: 1   },
          starter: { scans: 50,   builds: 25,  generations: 15  },
          pro:     { scans: 99999, builds: 99999, generations: 100 },
          diamond: { scans: 99999, builds: 99999, generations: 99999 },
        };
        const limits = TIER_LIMITS[plan] || TIER_LIMITS.free;
        user.scansLimit = limits.scans;
        user.buildsLimit = limits.builds;
        await user.save();
        console.log(`User ${userId} upgraded to ${plan}`);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const user = await User.findOne({ stripeSubscriptionId: subscription.id });
      if (user) {
        user.plan = 'free';
        user.scansLimit = 5;
        user.stripeSubscriptionId = null;
        await user.save();
        console.log(`User ${user._id} downgraded to free`);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.warn('Payment failed for customer:', invoice.customer);
      break;
    }
  }

  res.json({ received: true });
});

module.exports = router;
