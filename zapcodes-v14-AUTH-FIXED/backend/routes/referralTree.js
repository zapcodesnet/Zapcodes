// backend/routes/referralTree.js
// Lazy-loading referral tree endpoints for admin + user dashboards
// Handles millions of downlines by paginating children on demand

const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const { SUBSCRIPTION_TIERS } = require('../config/tiers');

// ══════════════════════════════════════════════════════════════
// GET /api/referrals/my-tree
// Returns the current user's L1 + L2 downlines (paginated)
// ══════════════════════════════════════════════════════════════
router.get('/my-tree', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('referral_code subscription_tier referral_count direct_referrals indirect_referrals level1_referrals level2_referrals referral_bonuses_paid');
    if (!user || !user.referral_code) return res.json({ tree: [], stats: {}, commissions: {} });

    const tier = SUBSCRIPTION_TIERS[user.subscription_tier || 'free'] || SUBSCRIPTION_TIERS.free;

    // Get L1 (direct) referrals
    const l1Users = await User.find({ referred_by: user.referral_code })
      .select('name email subscription_tier bl_coins referral_code referral_count direct_referrals createdAt avatar')
      .sort({ createdAt: -1 })
      .limit(200);

    // For each L1, get count of their L2s (but not full data — lazy load)
    const l1WithCounts = await Promise.all(l1Users.map(async (l1) => {
      const l2Count = l1.referral_code
        ? await User.countDocuments({ referred_by: l1.referral_code })
        : 0;
      return {
        _id: l1._id,
        name: l1.name,
        email: l1.email,
        subscription_tier: l1.subscription_tier,
        bl_coins: l1.bl_coins,
        referral_code: l1.referral_code,
        referral_count: l1.referral_count,
        createdAt: l1.createdAt,
        avatar: l1.avatar,
        level: 1,
        l2Count,
        hasChildren: l2Count > 0,
      };
    }));

    // Total L2 count
    const totalL2 = l1WithCounts.reduce((sum, u) => sum + u.l2Count, 0);

    res.json({
      tree: l1WithCounts,
      stats: {
        totalL1: l1Users.length,
        totalL2,
        totalReferrals: l1Users.length + totalL2,
        referral_count: user.referral_count,
        referral_bonuses_paid: user.referral_bonuses_paid,
      },
      commissions: {
        l1_percent: tier.referral_l1_percent,
        l2_percent: tier.referral_l2_percent,
        tier: user.subscription_tier,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load referral tree', details: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/referrals/children/:referralCode
// Lazy-load L2 children for a given referral code
// ══════════════════════════════════════════════════════════════
router.get('/children/:referralCode', auth, async (req, res) => {
  try {
    const { referralCode } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const children = await User.find({ referred_by: referralCode })
      .select('name email subscription_tier bl_coins referral_code referral_count createdAt avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments({ referred_by: referralCode });

    const childrenWithCounts = await Promise.all(children.map(async (child) => {
      const subCount = child.referral_code
        ? await User.countDocuments({ referred_by: child.referral_code })
        : 0;
      return {
        _id: child._id,
        name: child.name,
        email: child.email,
        subscription_tier: child.subscription_tier,
        bl_coins: child.bl_coins,
        referral_code: child.referral_code,
        referral_count: child.referral_count,
        createdAt: child.createdAt,
        avatar: child.avatar,
        level: 2,
        l2Count: subCount,
        hasChildren: subCount > 0,
      };
    }));

    res.json({ children: childrenWithCounts, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load children' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/referrals/admin-tree/:userId
// Admin: get any user's referral tree
// ══════════════════════════════════════════════════════════════
router.get('/admin-tree/:userId', auth, async (req, res) => {
  try {
    // Verify admin
    const adminUser = await User.findById(req.userId);
    if (!adminUser || !['super-admin', 'co-admin', 'moderator'].includes(adminUser.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const targetUser = await User.findById(req.params.userId)
      .select('name email referral_code subscription_tier referral_count direct_referrals indirect_referrals referral_bonuses_paid');
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const tier = SUBSCRIPTION_TIERS[targetUser.subscription_tier || 'free'] || SUBSCRIPTION_TIERS.free;

    // Get L1
    const l1Users = targetUser.referral_code
      ? await User.find({ referred_by: targetUser.referral_code })
          .select('name email subscription_tier bl_coins referral_code referral_count createdAt')
          .sort({ createdAt: -1 }).limit(500)
      : [];

    const l1WithL2 = await Promise.all(l1Users.map(async (l1) => {
      const l2Count = l1.referral_code ? await User.countDocuments({ referred_by: l1.referral_code }) : 0;
      return {
        _id: l1._id, name: l1.name, email: l1.email, subscription_tier: l1.subscription_tier,
        bl_coins: l1.bl_coins, referral_code: l1.referral_code, referral_count: l1.referral_count,
        createdAt: l1.createdAt, level: 1, l2Count, hasChildren: l2Count > 0,
      };
    }));

    const totalL2 = l1WithL2.reduce((sum, u) => sum + u.l2Count, 0);

    res.json({
      user: { name: targetUser.name, email: targetUser.email, referral_code: targetUser.referral_code, subscription_tier: targetUser.subscription_tier },
      tree: l1WithL2,
      stats: { totalL1: l1Users.length, totalL2, totalReferrals: l1Users.length + totalL2, referral_bonuses_paid: targetUser.referral_bonuses_paid },
      commissions: { l1_percent: tier.referral_l1_percent, l2_percent: tier.referral_l2_percent },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load admin referral tree' });
  }
});

module.exports = router;
