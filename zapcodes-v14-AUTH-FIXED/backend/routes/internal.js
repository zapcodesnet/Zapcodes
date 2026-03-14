/**
 * routes/internal.js
 * Internal API for cross-platform operations between ZapCodes and BlendLink.
 * Protected by INTERNAL_API_SECRET header — never exposed to frontend.
 *
 * POST /api/internal/claim-guest — BlendLink calls this to claim a guest site
 */

const express = require('express');
const router = express.Router();
const GuestSite = require('../models/GuestSite');
const User = require('../models/User');

// ── Internal auth middleware ───────────────────────────────────────────────
const internalAuth = (req, res, next) => {
  const secret = req.headers['x-internal-secret'];
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) {
    console.warn('[Internal] INTERNAL_API_SECRET not set — blocking request');
    return res.status(403).json({ error: 'Internal API not configured' });
  }
  if (!secret || secret !== expected) {
    return res.status(403).json({ error: 'Invalid internal secret' });
  }
  next();
};

// ── POST /api/internal/claim-guest ─────────────────────────────────────────
// Called by BlendLink backend when a user registers and has a guest site
router.post('/claim-guest', internalAuth, async (req, res) => {
  try {
    const { userId, platform, hash, email } = req.body;

    if (!userId || !hash) {
      return res.status(400).json({ error: 'userId and hash are required' });
    }

    // Find the active guest site by fingerprint hash
    const site = await GuestSite.findActiveByHash(hash);
    if (!site) {
      return res.json({ success: false, message: 'No active guest site found for this fingerprint' });
    }

    // Find user in shared MongoDB
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Claim the site
    site.status = 'claimed';
    site.claimedBy = user._id;
    site.claimedAt = new Date();
    site.claimedVia = platform || 'blendlink';
    await site.save();

    // Award +50 BL Coins for cross-platform claim
    try {
      user.creditCoins(50000, 'referral_bonus', 'Cross-platform claim bonus: 50,000 BL via BlendLink');
      await user.save();
    } catch (coinErr) {
      console.warn('[Internal] Could not credit BL coins:', coinErr.message);
    }

    res.json({
      success: true,
      subdomain: site.subdomain,
      url: `https://${site.subdomain}.zapcodes.net`,
      blCoinsAwarded: 50000,
      message: `Site claimed via ${platform || 'blendlink'}. 50,000 BL Coins awarded.`,
    });
  } catch (err) {
    console.error('[Internal/claim-guest]', err.message);
    res.status(500).json({ error: 'Claim failed', details: err.message });
  }
});

// ── POST /api/internal/check-guest ─────────────────────────────────────────
// BlendLink can check if a user's fingerprint has an unclaimed site
router.post('/check-guest', internalAuth, async (req, res) => {
  try {
    const { hash } = req.body;
    if (!hash) return res.status(400).json({ error: 'hash required' });

    const site = await GuestSite.findActiveByHash(hash);
    if (!site) return res.json({ exists: false });

    const daysLeft = Math.max(0, Math.ceil((site.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
    res.json({
      exists: true,
      subdomain: site.subdomain,
      url: `https://${site.subdomain}.zapcodes.net`,
      daysLeft,
      claimCode: site.claimCode,
    });
  } catch (err) {
    res.status(500).json({ error: 'Check failed' });
  }
});

module.exports = router;
