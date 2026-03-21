const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');
const SecurityFlag = require('../models/SecurityFlag');
const Repo = require('../models/Repo');
const PromoCode = require('../models/PromoCode');

// Stripe — used to sync promo codes as Stripe Promotion Codes
let stripe;
try { stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); } catch (e) { stripe = null; }
const {
  requireAdmin, requireSuperAdmin, requirePermission, require2FA,
  checkAdminAccess, sendVerificationCode, verifyAdminCode,
  logAdminAction, SUPER_ADMIN_EMAIL,
} = require('../middleware/admin');

// Try to load SiteVisitor model (non-fatal if not present yet)
let SiteVisitor;
try { SiteVisitor = require('../models/SiteVisitor'); } catch (e) { SiteVisitor = null; }

const router = express.Router();

// === PUBLIC admin endpoints (before auth wall) ===
router.get('/check-access', checkAdminAccess);
router.post('/send-code', sendVerificationCode);
router.post('/verify-code', verifyAdminCode);

// All remaining admin routes require verified admin session
router.use(requireAdmin);

// =============================================
// DASHBOARD
// =============================================
router.get('/dashboard', async (req, res) => {
  try {
    const [totalUsers, activeUsers, bannedUsers, suspendedUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ status: 'banned' }),
      User.countDocuments({ status: 'suspended' }),
    ]);

    const [freeUsers, bronzeUsers, silverUsers, goldUsers, diamondUsers] = await Promise.all([
      User.countDocuments({ subscription_tier: 'free' }),
      User.countDocuments({ subscription_tier: 'bronze' }),
      User.countDocuments({ subscription_tier: 'silver' }),
      User.countDocuments({ subscription_tier: 'gold' }),
      User.countDocuments({ subscription_tier: 'diamond' }),
    ]);

    const totalRepos = await Repo.countDocuments();
    const recentFlags = await SecurityFlag.countDocuments({ status: 'new' });
    const recentLogs = await AdminLog.find().sort({ timestamp: -1 }).limit(10)
      .populate('actor', 'name email').populate('targetUser', 'name email');

    // Revenue estimate
    const monthlyRevenue = (bronzeUsers * 4.99) + (silverUsers * 14.99) + (goldUsers * 39.99) + (diamondUsers * 99.99);

    // Users registered in last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: weekAgo } });

    // Users registered per day (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dailySignups = await User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Total referrals
    const referralStats = await User.aggregate([
      { $group: { _id: null, totalReferrals: { $sum: '$referral_count' }, totalBonuses: { $sum: '$referral_bonuses_paid' } } },
    ]);

    // Active promo codes
    let activePromos = 0;
    try { activePromos = await PromoCode.countDocuments({ isActive: true, expiresAt: { $gt: new Date() } }); } catch (e) {}

    // BL Coins economy
    const blStats = await User.aggregate([
      { $group: { _id: null, totalBL: { $sum: '$bl_coins' }, avgBL: { $avg: '$bl_coins' }, usersWithCoins: { $sum: { $cond: [{ $gt: ['$bl_coins', 0] }, 1, 0] } } } },
    ]);

    // Visitor stats
    let visitorStats = { total: 0, registered: 0, guests: 0, guestBuilders: 0 };
    if (SiteVisitor) {
      try {
        const [totalVisitors, registeredVisitors, guestBuilders] = await Promise.all([
          SiteVisitor.countDocuments(),
          SiteVisitor.countDocuments({ didRegister: true }),
          SiteVisitor.countDocuments({ usedGuestBuilder: true }),
        ]);
        visitorStats = { total: totalVisitors, registered: registeredVisitors, guests: totalVisitors - registeredVisitors, guestBuilders };
      } catch (e) {}
    }

    res.json({
      users: { total: totalUsers, active: activeUsers, banned: bannedUsers, suspended: suspendedUsers, newThisWeek: newUsersThisWeek },
      plans: { free: freeUsers, bronze: bronzeUsers, silver: silverUsers, gold: goldUsers, diamond: diamondUsers },
      repos: totalRepos,
      revenue: {
        monthly: parseFloat(monthlyRevenue.toFixed(2)),
        bronze: (bronzeUsers * 4.99).toFixed(2),
        silver: (silverUsers * 14.99).toFixed(2),
        gold: (goldUsers * 39.99).toFixed(2),
        diamond: (diamondUsers * 99.99).toFixed(2),
      },
      securityFlags: recentFlags,
      recentLogs,
      dailySignups,
      referralStats: referralStats[0] || { totalReferrals: 0, totalBonuses: 0 },
      activePromos,
      blEconomy: blStats[0] || { totalBL: 0, avgBL: 0, usersWithCoins: 0 },
      visitorStats,
    });
  } catch (err) {
    res.status(500).json({ error: 'Dashboard fetch failed', details: err.message });
  }
});

// =============================================
// 2FA SETUP & VERIFICATION
// =============================================
router.post('/2fa/setup', async (req, res) => {
  try {
    if (!req.user.isAdmin()) return res.status(403).json({ error: 'Admin only' });

    const secret = crypto.randomBytes(20).toString('hex');
    const base32Secret = Buffer.from(secret).toString('base64').replace(/=/g, '').slice(0, 16);

    req.user.twoFactorSecret = base32Secret;
    await req.user.save();

    const otpauthUrl = `otpauth://totp/ZapCodes:${req.user.email}?secret=${base32Secret}&issuer=ZapCodes&algorithm=SHA1&digits=6&period=30`;

    await logAdminAction({
      actor: req.user, action: '2fa_setup',
      description: `2FA setup initiated for ${req.user.email}`,
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ secret: base32Secret, otpauthUrl, message: 'Scan QR code with Google Authenticator' });
  } catch (err) {
    res.status(500).json({ error: '2FA setup failed', details: err.message });
  }
});

router.post('/2fa/verify', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });

    const user = await User.findById(req.user._id).select('+twoFactorSecret');
    if (!user?.twoFactorSecret) return res.status(400).json({ error: '2FA not set up' });

    const verified = verifyTOTP(user.twoFactorSecret, code);
    if (!verified) {
      await logAdminAction({
        actor: req.user, action: '2fa_verify',
        description: `Failed 2FA verification attempt for ${req.user.email}`,
        ip: req.ip, userAgent: req.headers['user-agent'], severity: 'warning',
      });
      return res.status(401).json({ error: 'Invalid code' });
    }

    if (!user.twoFactorEnabled) {
      user.twoFactorEnabled = true;
      await user.save();
    }

    const twoFAToken = jwt.sign(
      { userId: user._id.toString(), type: '2fa', lastActivity: Date.now() },
      process.env.JWT_SECRET + '-2fa',
      { expiresIn: '5m' }
    );

    await logAdminAction({
      actor: req.user, action: '2fa_verify',
      description: `2FA verified successfully for ${req.user.email}`,
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ twoFAToken, message: '2FA verified — AI access unlocked' });
  } catch (err) {
    res.status(500).json({ error: '2FA verification failed', details: err.message });
  }
});

// Simple TOTP implementation
function verifyTOTP(secret, code) {
  const time = Math.floor(Date.now() / 30000);
  for (let i = -1; i <= 1; i++) {
    const generated = generateTOTP(secret, time + i);
    if (generated === code.toString().padStart(6, '0')) return true;
  }
  return false;
}

function generateTOTP(secret, time) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(time));
  const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base64'));
  hmac.update(buffer);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0xf;
  const code = ((hash[offset] & 0x7f) << 24 | (hash[offset + 1] & 0xff) << 16 |
    (hash[offset + 2] & 0xff) << 8 | (hash[offset + 3] & 0xff)) % 1000000;
  return code.toString().padStart(6, '0');
}

// =============================================
// USER MANAGEMENT
// =============================================
router.get('/users', requirePermission('moderateUsers'), async (req, res) => {
  try {
    const { search, status, plan, role, page = 1, limit = 50, sort = '-createdAt' } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }
    if (status) query.status = status;
    if (plan) query.subscription_tier = plan;
    if (role) query.role = role;

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-githubToken -twoFactorSecret')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'User fetch failed', details: err.message });
  }
});

router.get('/users/:id', requirePermission('moderateUsers'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-githubToken -twoFactorSecret');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const logs = await AdminLog.find({ targetUser: user._id })
      .sort({ timestamp: -1 }).limit(20).populate('actor', 'name email');

    // Get referral downlines
    const directDownlines = await User.find({ referred_by: user.referral_code })
      .select('name email subscription_tier createdAt bl_coins')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ user, logs, directDownlines });
  } catch (err) {
    res.status(500).json({ error: 'User fetch failed' });
  }
});

// Ban user
router.post('/users/:id/ban', requirePermission('moderateUsers'), async (req, res) => {
  try {
    const { reason } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.email === SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Cannot ban the primary admin' });
    }
    if (target.isAdmin() && !req.user.isSuperAdmin()) {
      return res.status(403).json({ error: 'Only super admin can ban other admins' });
    }

    const before = { status: target.status };
    target.status = 'banned';
    target.banReason = reason || 'Banned by admin';
    await target.save();

    await logAdminAction({
      actor: req.user, action: 'user_ban', targetUser: target._id, targetEmail: target.email,
      description: `Banned user ${target.email}: ${reason || 'No reason given'}`,
      beforeState: before, afterState: { status: 'banned' },
      ip: req.ip, userAgent: req.headers['user-agent'], severity: 'warning',
    });

    const io = req.app.get('io');
    if (io) io.to(`user-${target._id}`).emit('force-logout', { reason: 'Your account has been banned' });

    res.json({ message: `User ${target.email} has been banned`, user: target.toSafeObject() });
  } catch (err) {
    res.status(500).json({ error: 'Ban failed', details: err.message });
  }
});

// Suspend user
router.post('/users/:id/suspend', requirePermission('moderateUsers'), async (req, res) => {
  try {
    const { reason, days = 7 } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.email === SUPER_ADMIN_EMAIL) return res.status(403).json({ error: 'Cannot suspend primary admin' });

    const before = { status: target.status };
    target.status = 'suspended';
    target.suspendReason = reason || 'Suspended by admin';
    target.suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await target.save();

    await logAdminAction({
      actor: req.user, action: 'user_suspend', targetUser: target._id, targetEmail: target.email,
      description: `Suspended user ${target.email} for ${days} days: ${reason || 'No reason'}`,
      beforeState: before, afterState: { status: 'suspended', until: target.suspendedUntil },
      ip: req.ip, userAgent: req.headers['user-agent'], severity: 'warning',
    });

    const io = req.app.get('io');
    if (io) io.to(`user-${target._id}`).emit('force-logout', { reason: `Suspended for ${days} days` });

    res.json({ message: `User suspended for ${days} days`, user: target.toSafeObject() });
  } catch (err) {
    res.status(500).json({ error: 'Suspend failed' });
  }
});

// Unban/unsuspend user
router.post('/users/:id/unban', requirePermission('moderateUsers'), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const before = { status: target.status };
    target.status = 'active';
    target.banReason = null;
    target.suspendReason = null;
    target.suspendedUntil = null;
    await target.save();

    await logAdminAction({
      actor: req.user, action: 'user_unban', targetUser: target._id, targetEmail: target.email,
      description: `Unbanned/unsuspended user ${target.email}`,
      beforeState: before, afterState: { status: 'active' },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ message: `User ${target.email} is now active`, user: target.toSafeObject() });
  } catch (err) {
    res.status(500).json({ error: 'Unban failed' });
  }
});

// Permanently delete user (cascade)
router.delete('/users/:id', requirePermission('deleteUsers'), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.email === SUPER_ADMIN_EMAIL) return res.status(403).json({ error: 'Cannot delete primary admin' });
    if (target.isAdmin() && !req.user.isSuperAdmin()) return res.status(403).json({ error: 'Only super admin can delete admins' });

    const email = target.email;

    await Repo.deleteMany({ user: target._id });

    const io = req.app.get('io');
    if (io) io.to(`user-${target._id}`).emit('force-logout', { reason: 'Account permanently deleted' });

    await User.findByIdAndDelete(target._id);

    await logAdminAction({
      actor: req.user, action: 'user_delete', targetEmail: email,
      description: `Permanently deleted user ${email} and all associated data`,
      ip: req.ip, userAgent: req.headers['user-agent'], severity: 'critical',
    });

    res.json({ message: `User ${email} permanently deleted` });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Force logout
router.post('/users/:id/force-logout', requirePermission('moderateUsers'), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const io = req.app.get('io');
    if (io) io.to(`user-${target._id}`).emit('force-logout', { reason: 'Session terminated by admin' });

    await logAdminAction({
      actor: req.user, action: 'user_force_logout', targetUser: target._id, targetEmail: target.email,
      description: `Forced logout for ${target.email}`,
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ message: `Force logout sent to ${target.email}` });
  } catch (err) {
    res.status(500).json({ error: 'Force logout failed' });
  }
});

// =============================================
// ROLE & PERMISSION MANAGEMENT
// =============================================
router.post('/users/:id/role', requirePermission('manageRoles'), async (req, res) => {
  try {
    const { role, permissions } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (role === 'co-admin' && !req.user.isSuperAdmin()) {
      return res.status(403).json({ error: 'Only super admin can create co-admins' });
    }
    if (target.email === SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Cannot change primary admin role' });
    }

    const before = { role: target.role, permissions: { ...target.permissions?.toObject?.() || target.permissions } };

    target.role = role || target.role;
    if (permissions) {
      Object.keys(permissions).forEach(key => {
        if (target.permissions[key] !== undefined) {
          target.permissions[key] = permissions[key];
        }
      });
    }
    target.markModified('permissions');
    await target.save();

    await logAdminAction({
      actor: req.user, action: 'role_change', targetUser: target._id, targetEmail: target.email,
      description: `Changed role for ${target.email}: ${before.role} → ${target.role}`,
      beforeState: before, afterState: { role: target.role, permissions: target.permissions },
      ip: req.ip, userAgent: req.headers['user-agent'], severity: 'warning',
    });

    res.json({ message: `Role updated for ${target.email}`, user: target.toSafeObject() });
  } catch (err) {
    res.status(500).json({ error: 'Role update failed', details: err.message });
  }
});

// =============================================
// ADVANCED SUBSCRIPTION MANAGEMENT
// =============================================
router.post('/users/:id/subscription', requirePermission('adjustPricing'), async (req, res) => {
  try {
    const {
      plan, customPrice, billingInterval, freeForever,
      subscriptionDays,
      discountPercent, discountExpiry, discountReason,
      customFeatures,
      reason,
    } = req.body;

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const before = {
      subscription_tier: target.subscription_tier, customPrice: target.customPrice, freeForever: target.freeForever,
      billingInterval: target.billingInterval, subscriptionEnd: target.subscriptionEnd,
      discount: target.discount, customFeatures: target.customFeatures,
    };

    // Update plan
    if (plan) target.subscription_tier = plan;

    // Custom pricing
    if (customPrice !== undefined) target.customPrice = customPrice;
    if (billingInterval !== undefined) target.billingInterval = billingInterval;

    // Free forever toggle
    if (freeForever !== undefined) {
      target.freeForever = freeForever;
      if (freeForever) {
        target.customPrice = 0;
        target.subscriptionEnd = null;
      }
    }

    // Subscription duration
    if (subscriptionDays !== undefined) {
      target.subscriptionStart = new Date();
      target.subscriptionEnd = subscriptionDays ? new Date(Date.now() + subscriptionDays * 86400000) : null;
    }

    // Discount
    if (discountPercent !== undefined) {
      target.discount = {
        percent: discountPercent,
        expiresAt: discountExpiry ? new Date(discountExpiry) : null,
        reason: discountReason || '',
      };
    }

    // Custom features
    if (customFeatures !== undefined) {
      target.customFeatures = customFeatures;
    }

    // Update limits based on plan
    const limits = { free: { gens: 1 }, bronze: { gens: 5 }, silver: { gens: 7 }, gold: { gens: 15 }, diamond: { gens: Infinity } };
    const l = limits[target.subscription_tier] || limits.free;
    target.scansLimit = l.scans;
    target.buildsLimit = l.builds;

    await target.save();

    // Real-time notification to user
    const io = req.app.get('io');
    if (io) io.to(`user-${target._id}`).emit('subscription-updated', {
      subscription_tier: target.subscription_tier, customPrice: target.customPrice, freeForever: target.freeForever,
    });

    await logAdminAction({
      actor: req.user, action: 'price_override', targetUser: target._id, targetEmail: target.email,
      description: `Subscription changed for ${target.email}: ${reason || `tier=${target.subscription_tier}, price=${target.customPrice}, freeForever=${target.freeForever}`}`,
      beforeState: before,
      afterState: { subscription_tier: target.subscription_tier, customPrice: target.customPrice, freeForever: target.freeForever, discount: target.discount, subscriptionEnd: target.subscriptionEnd, customFeatures: target.customFeatures },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ message: `Subscription updated for ${target.email}`, user: target.toSafeObject() });
  } catch (err) {
    res.status(500).json({ error: 'Subscription update failed', details: err.message });
  }
});

// =============================================
// BL COIN MANAGEMENT
// =============================================
router.put('/users/:id/bl', requireSuperAdmin, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (amount === undefined || !reason) return res.status(400).json({ error: 'Amount and reason required' });
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount === 0) return res.status(400).json({ error: 'Invalid amount' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const oldBalance = user.bl_coins;

    if (numAmount > 0) {
      user.creditCoins(numAmount, 'admin_adjustment', `Admin: ${reason}`);
    } else {
      user.bl_coins = Math.max(0, user.bl_coins + numAmount);
      user.bl_transactions.push({ type: 'admin_adjustment', amount: numAmount, balance: user.bl_coins, description: `Admin: ${reason}` });
    }
    await user.save();

    await logAdminAction({
      actor: req.user, action: 'bl_adjustment', targetUser: user._id, targetEmail: user.email,
      description: `BL adjustment: ${numAmount > 0 ? '+' : ''}${numAmount} for ${user.email} — ${reason}`,
      beforeState: { bl_coins: oldBalance },
      afterState: { bl_coins: user.bl_coins },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, oldBalance, newBalance: user.bl_coins, adjustment: numAmount });
  } catch (err) {
    res.status(500).json({ error: 'BL adjustment failed', details: err.message });
  }
});

router.put('/users/:id/tier', requireSuperAdmin, async (req, res) => {
  try {
    const { plan, reason } = req.body;
    if (!['free', 'bronze', 'silver', 'gold', 'diamond'].includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const oldPlan = user.subscription_tier;
    user.subscription_tier = plan;
    await user.save();

    await logAdminAction({
      actor: req.user, action: 'tier_change', targetUser: user._id, targetEmail: user.email,
      description: `Tier: ${oldPlan} → ${plan} for ${user.email}${reason ? ` — ${reason}` : ''}`,
      beforeState: { subscription_tier: oldPlan },
      afterState: { subscription_tier: plan },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, oldPlan, newPlan: plan });
  } catch (err) {
    res.status(500).json({ error: 'Tier change failed' });
  }
});

// =============================================
// SECURITY FLAGS
// =============================================
router.get('/security', requirePermission('viewSecurityLogs'), async (req, res) => {
  try {
    const { status, severity, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (severity) query.severity = severity;

    const total = await SecurityFlag.countDocuments(query);
    const flags = await SecurityFlag.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('affectedUser', 'name email')
      .populate('acknowledgedBy', 'name email');

    res.json({ flags, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Security flags fetch failed' });
  }
});

router.post('/security/:id/acknowledge', requirePermission('viewSecurityLogs'), async (req, res) => {
  try {
    const { resolution } = req.body;
    const flag = await SecurityFlag.findById(req.params.id);
    if (!flag) return res.status(404).json({ error: 'Flag not found' });

    flag.status = resolution === 'false_positive' ? 'false_positive' : 'acknowledged';
    flag.acknowledgedBy = req.user._id;
    flag.acknowledgedAt = new Date();
    flag.resolution = resolution || 'Acknowledged by admin';
    await flag.save();

    await logAdminAction({
      actor: req.user, action: 'security_flag_ack',
      description: `Acknowledged security flag ${flag._id}: ${flag.description}`,
      metadata: { flagId: flag._id, severity: flag.severity },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Flag acknowledged', flag });
  } catch (err) {
    res.status(500).json({ error: 'Acknowledge failed' });
  }
});

// =============================================
// AUDIT LOGS
// =============================================
router.get('/logs', requirePermission('viewSecurityLogs'), async (req, res) => {
  try {
    const { action, actor, page = 1, limit = 50 } = req.query;
    const query = {};
    if (action) query.action = action;
    if (actor) query.actorEmail = { $regex: actor, $options: 'i' };

    const total = await AdminLog.countDocuments(query);
    const logs = await AdminLog.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('actor', 'name email')
      .populate('targetUser', 'name email');

    res.json({ logs, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Logs fetch failed' });
  }
});

// =============================================
// AI COMMAND CHATBOX (requires 2FA)
// =============================================
router.post('/ai/command', requirePermission('manageAI'), require2FA, async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Command required' });

    await logAdminAction({
      actor: req.user, action: 'ai_command',
      description: `AI command: ${command.slice(0, 200)}`,
      metadata: { fullCommand: command },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    const response = await processAICommand(command, req.user, req.app);

    await logAdminAction({
      actor: req.user, action: 'ai_response',
      description: `AI response for: ${command.slice(0, 100)}`,
      metadata: { command: command.slice(0, 200), response: response.message?.slice(0, 500) },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    const newTwoFAToken = jwt.sign(
      { userId: req.user._id.toString(), type: '2fa', lastActivity: Date.now() },
      process.env.JWT_SECRET + '-2fa',
      { expiresIn: '5m' }
    );

    res.json({ ...response, twoFAToken: newTwoFAToken });
  } catch (err) {
    res.status(500).json({ error: 'AI command failed', details: err.message });
  }
});

// AI command processor
async function processAICommand(command, admin, app) {
  const cmd = command.toLowerCase();

  if (cmd.includes('ban user') || cmd.includes('ban email')) {
    const emailMatch = command.match(/[\w.-]+@[\w.-]+/);
    if (emailMatch) {
      const target = await User.findOne({ email: emailMatch[0].toLowerCase() });
      if (!target) return { message: `User ${emailMatch[0]} not found`, action: 'none' };
      if (target.email === SUPER_ADMIN_EMAIL) return { message: 'Cannot ban the primary admin', action: 'blocked' };

      target.status = 'banned';
      target.banReason = `Banned via AI command by ${admin.email}`;
      await target.save();

      const io = app.get('io');
      if (io) io.to(`user-${target._id}`).emit('force-logout', { reason: 'Account banned' });

      await logAdminAction({
        actor: admin, action: 'ai_action', targetUser: target._id, targetEmail: target.email,
        description: `ZapCodes AI banned ${target.email} via AI command`,
        afterState: { status: 'banned' }, severity: 'warning',
      });

      return { message: `✅ ZapCodes AI executed: Banned user ${target.email} and forced logout.`, action: 'user_banned', target: target.email };
    }
  }

  if (cmd.includes('unban') || cmd.includes('unsuspend') || cmd.includes('restore')) {
    const emailMatch = command.match(/[\w.-]+@[\w.-]+/);
    if (emailMatch) {
      const target = await User.findOne({ email: emailMatch[0].toLowerCase() });
      if (!target) return { message: `User ${emailMatch[0]} not found`, action: 'none' };

      target.status = 'active';
      target.banReason = null;
      target.suspendReason = null;
      await target.save();

      return { message: `✅ ZapCodes AI executed: Restored user ${target.email} to active status.`, action: 'user_restored', target: target.email };
    }
  }

  if (cmd.includes('user count') || cmd.includes('how many users') || cmd.includes('total users')) {
    const total = await User.countDocuments();
    const active = await User.countDocuments({ status: 'active' });
    const paying = await User.countDocuments({ subscription_tier: { $ne: 'free' } });
    return { message: `📊 User Stats:\n• Total: ${total}\n• Active: ${active}\n• Paying: ${paying}\n• Free: ${total - paying}`, action: 'stats' };
  }

  if (cmd.includes('revenue') || cmd.includes('income') || cmd.includes('money')) {
    const bronze = await User.countDocuments({ subscription_tier: 'bronze' });
    const silver = await User.countDocuments({ subscription_tier: 'silver' });
    const gold = await User.countDocuments({ subscription_tier: 'gold' });
    const diamond = await User.countDocuments({ subscription_tier: 'diamond' });
    const monthly = (bronze * 4.99) + (silver * 14.99) + (gold * 39.99) + (diamond * 99.99);
    return { message: `💰 Revenue:\n• Bronze: ${bronze} × $4.99 = $${(bronze * 4.99).toFixed(2)}\n• Silver: ${silver} × $14.99 = $${(silver * 14.99).toFixed(2)}\n• Gold: ${gold} × $39.99 = $${(gold * 39.99).toFixed(2)}\n• Diamond: ${diamond} × $99.99 = $${(diamond * 99.99).toFixed(2)}\n• Monthly: $${monthly.toFixed(2)}\n• Annual: $${(monthly * 12).toFixed(2)}`, action: 'revenue' };
  }

  if (cmd.includes('security') || cmd.includes('threats') || cmd.includes('flags')) {
    const flags = await SecurityFlag.find({ status: 'new' }).sort({ timestamp: -1 }).limit(5);
    if (flags.length === 0) return { message: '🛡️ No active security flags. All clear!', action: 'security' };
    const list = flags.map(f => `• [${f.severity.toUpperCase()}] ${f.description}`).join('\n');
    return { message: `🚨 Active Security Flags (${flags.length}):\n${list}`, action: 'security' };
  }

  if (cmd.includes('set plan') || cmd.includes('change plan') || cmd.includes('upgrade user')) {
    const emailMatch = command.match(/[\w.-]+@[\w.-]+/);
    const planMatch = command.match(/\b(free|bronze|silver|gold|diamond)\b/i);
    if (emailMatch && planMatch) {
      const target = await User.findOne({ email: emailMatch[0].toLowerCase() });
      if (!target) return { message: `User ${emailMatch[0]} not found`, action: 'none' };

      const oldPlan = target.subscription_tier;
      target.subscription_tier = planMatch[1].toLowerCase();
      await target.save();

      await logAdminAction({
        actor: admin, action: 'ai_action', targetUser: target._id, targetEmail: target.email,
        description: `ZapCodes AI changed plan for ${target.email}: ${oldPlan} → ${target.subscription_tier}`,
        beforeState: { subscription_tier: oldPlan }, afterState: { subscription_tier: target.subscription_tier }, severity: 'info',
      });

      return { message: `✅ ZapCodes AI executed: Changed ${target.email} from ${oldPlan} to ${target.subscription_tier} plan.`, action: 'plan_changed', target: target.email };
    }
  }

  return {
    message: `🤖 I understood your command: "${command}"\n\nAvailable ZapCodes AI commands:\n• "ban user email@example.com" — Ban a user\n• "unban user email@example.com" — Restore a user\n• "set plan email@example.com to gold" — Change user plan\n• "user count" — Get user statistics\n• "revenue" — Get revenue report\n• "security flags" — Check active security flags\n\nFor complex tasks, be specific about what action to take and which user to target.`,
    action: 'help',
  };
}

// =============================================
// ANALYTICS (ENHANCED)
// =============================================
router.get('/analytics', requirePermission('viewAnalytics'), async (req, res) => {
  try {
    const thirtyDays = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [dailySignups, planDistribution, topUsers] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: thirtyDays } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([
        { $group: { _id: '$subscription_tier', count: { $sum: 1 } } },
      ]),
      User.find().sort({ bl_coins: -1 }).limit(10).select('name email subscription_tier bl_coins referral_count'),
    ]);

    // Registration details with location approximation (from lastLoginIP)
    const recentRegistrations = await User.find({ createdAt: { $gte: thirtyDays } })
      .select('name email subscription_tier createdAt lastLoginIP referred_by referral_code')
      .sort({ createdAt: -1 })
      .limit(100);

    // Referral stats
    const referralLeaderboard = await User.find({ referral_count: { $gt: 0 } })
      .sort({ referral_count: -1 }).limit(20)
      .select('name email referral_code referral_count referral_bonuses_paid subscription_tier direct_referrals indirect_referrals');

    const totalReferrals = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$referral_count' }, totalBonuses: { $sum: '$referral_bonuses_paid' } } },
    ]);

    // Users referred (who was referred by whom)
    const referredUsers = await User.find({ referred_by: { $exists: true, $ne: null, $ne: '' } })
      .select('name email referred_by subscription_tier createdAt')
      .sort({ createdAt: -1 })
      .limit(100);

    // Visitor stats (if model exists)
    let visitorData = { byCountry: [], dailyVisitors: [], guestBuilderCount: 0, unregisteredCount: 0 };
    if (SiteVisitor) {
      try {
        const [byCountry, dailyVisitors, guestBuilderCount, unregisteredCount] = await Promise.all([
          SiteVisitor.aggregate([
            { $group: { _id: { country: '$country', countryCode: '$countryCode', latitude: { $first: '$latitude' }, longitude: { $first: '$longitude' } }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 50 },
          ]),
          SiteVisitor.aggregate([
            { $match: { createdAt: { $gte: thirtyDays } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, registered: { $sum: { $cond: ['$didRegister', 1, 0] } } } },
            { $sort: { _id: 1 } },
          ]),
          SiteVisitor.countDocuments({ usedGuestBuilder: true }),
          SiteVisitor.countDocuments({ didRegister: false }),
        ]);
        visitorData = { byCountry, dailyVisitors, guestBuilderCount, unregisteredCount };
      } catch (e) {}
    }

    res.json({
      dailySignups,
      planDistribution,
      topUsers,
      recentRegistrations,
      referralLeaderboard,
      referralStats: totalReferrals[0] || { total: 0, totalBonuses: 0 },
      referredUsers,
      visitorData,
    });
  } catch (err) {
    res.status(500).json({ error: 'Analytics fetch failed', details: err.message });
  }
});

// =============================================
// PROMO CODE MANAGEMENT
// =============================================
router.get('/promos', requirePermission('adjustPricing'), async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status === 'active') { query.isActive = true; query.expiresAt = { $gt: new Date() }; }
    else if (status === 'expired') { query.expiresAt = { $lte: new Date() }; }
    else if (status === 'inactive') { query.isActive = false; }

    const total = await PromoCode.countDocuments(query);
    const promos = await PromoCode.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('createdBy', 'name email');

    res.json({ promos, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch promo codes', details: err.message });
  }
});

router.post('/promos', requireSuperAdmin, async (req, res) => {
  try {
    const {
      code, description, discountType, discountValue,
      tierUpgradeTo, durationDays, startsAt, expiresAt,
      maxUses, applicableTiers, specificUsers,
    } = req.body;

    if (!code || !discountType || discountValue === undefined || !expiresAt) {
      return res.status(400).json({ error: 'Code, discountType, discountValue, and expiresAt are required' });
    }

    // Check for duplicate
    const existing = await PromoCode.findOne({ code: code.toUpperCase() });
    if (existing) return res.status(409).json({ error: 'Promo code already exists' });

    const promo = await PromoCode.create({
      code: code.toUpperCase(),
      description: description || '',
      discountType,
      discountValue: Number(discountValue),
      tierUpgradeTo: tierUpgradeTo || null,
      durationDays: durationDays || 30,
      startsAt: startsAt ? new Date(startsAt) : new Date(),
      expiresAt: new Date(expiresAt),
      maxUses: maxUses || 0,
      applicableTiers: applicableTiers || [],
      specificUsers: (specificUsers || []).map(e => e.toLowerCase().trim()).filter(Boolean),
      createdBy: req.user._id,
      createdByEmail: req.user.email,
    });

    // ══════════ STRIPE SYNC ══════════
    // For percentage and fixed discount types, create a matching
    // Stripe Coupon + Promotion Code so the code works at checkout.
    let stripeSynced = false;
    if (stripe && (discountType === 'percentage' || discountType === 'fixed')) {
      try {
        // Build coupon params
        const couponParams = {
          id: `promo_${code.toUpperCase()}_${Date.now()}`,
          name: `${code.toUpperCase()} — ${description || (discountType === 'percentage' ? `${discountValue}% off` : `$${discountValue} off`)}`,
          duration: 'repeating',
          duration_in_months: Math.max(1, Math.ceil((durationDays || 30) / 30)),
          max_redemptions: maxUses > 0 ? maxUses : undefined,
          redeem_by: Math.floor(new Date(expiresAt).getTime() / 1000),
        };

        if (discountType === 'percentage') {
          couponParams.percent_off = Number(discountValue);
        } else if (discountType === 'fixed') {
          couponParams.amount_off = Math.round(Number(discountValue) * 100); // cents
          couponParams.currency = 'usd';
        }

        const stripeCoupon = await stripe.coupons.create(couponParams);

        // Create a Promotion Code with the exact code string so users can type it at checkout
        await stripe.promotionCodes.create({
          coupon: stripeCoupon.id,
          code: code.toUpperCase(),
          max_redemptions: maxUses > 0 ? maxUses : undefined,
          expires_at: Math.floor(new Date(expiresAt).getTime() / 1000),
        });

        stripeSynced = true;
        console.log(`[Promo] Stripe synced: ${code.toUpperCase()} → coupon ${stripeCoupon.id}`);
      } catch (stripeErr) {
        // Don't fail the whole operation if Stripe sync fails
        console.error(`[Promo] Stripe sync failed for ${code}:`, stripeErr.message);
      }
    }

    await logAdminAction({
      actor: req.user, action: 'promo_create',
      description: `Created promo code ${promo.code}: ${discountType} ${discountValue}${discountType === 'percentage' ? '%' : ''}, expires ${promo.expiresAt.toISOString().split('T')[0]}${stripeSynced ? ' (Stripe synced)' : ''}`,
      metadata: { promoId: promo._id, code: promo.code, stripeSynced },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, promo, stripeSynced });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create promo code', details: err.message });
  }
});

router.put('/promos/:id', requireSuperAdmin, async (req, res) => {
  try {
    const promo = await PromoCode.findById(req.params.id);
    if (!promo) return res.status(404).json({ error: 'Promo not found' });

    const updates = req.body;
    const allowed = ['description', 'discountValue', 'durationDays', 'expiresAt', 'maxUses', 'isActive', 'applicableTiers', 'specificUsers'];
    allowed.forEach(field => {
      if (updates[field] !== undefined) {
        if (field === 'expiresAt') promo[field] = new Date(updates[field]);
        else promo[field] = updates[field];
      }
    });
    await promo.save();

    await logAdminAction({
      actor: req.user, action: 'promo_update',
      description: `Updated promo code ${promo.code}`,
      metadata: { promoId: promo._id, updates },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, promo });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update promo code', details: err.message });
  }
});

router.delete('/promos/:id', requireSuperAdmin, async (req, res) => {
  try {
    const promo = await PromoCode.findById(req.params.id);
    if (!promo) return res.status(404).json({ error: 'Promo not found' });

    const code = promo.code;
    await PromoCode.findByIdAndDelete(req.params.id);

    await logAdminAction({
      actor: req.user, action: 'promo_delete',
      description: `Deleted promo code ${code}`,
      ip: req.ip, userAgent: req.headers['user-agent'], severity: 'warning',
    });

    res.json({ success: true, message: `Promo ${code} deleted` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete promo code' });
  }
});

// =============================================
// SETTINGS
// =============================================
router.get('/me', (req, res) => {
  res.json({
    user: req.user.toSafeObject(),
    twoFactorEnabled: req.user.twoFactorEnabled,
    isSuperAdmin: req.user.isSuperAdmin(),
  });
});

// =============================================
// DEPLOYED SITES MANAGEMENT
// =============================================
router.get('/sites', requireAdmin, async (req, res) => {
  try {
    const usersWithSites = await User.find({ 'deployed_sites.0': { $exists: true } }).select('name email subscription_tier deployed_sites');
    const allSites = [];
    for (const u of usersWithSites) {
      for (const site of u.deployed_sites) {
        allSites.push({ subdomain: site.subdomain, title: site.title, url: `https://${site.subdomain}.zapcodes.net`, owner: { name: u.name, email: u.email, plan: u.subscription_tier }, createdAt: site.createdAt, lastUpdated: site.lastUpdated, hasBadge: site.hasBadge, isPWA: site.isPWA });
      }
    }
    res.json({ sites: allSites, total: allSites.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

router.delete('/sites/:subdomain', requireSuperAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ 'deployed_sites.subdomain': req.params.subdomain });
    if (!user) return res.status(404).json({ error: 'Site not found' });
    user.deployed_sites = user.deployed_sites.filter(s => s.subdomain !== req.params.subdomain);
    await user.save();
    await logAdminAction({ actor: req.user, action: 'site_takedown', targetUser: user, description: `Removed site: ${req.params.subdomain}.zapcodes.net`, ip: req.ip, userAgent: req.headers['user-agent'], severity: 'warning' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Site takedown failed' });
  }
});

// =============================================
// REFERRAL MANAGEMENT
// =============================================
router.get('/referrals', requireAdmin, async (req, res) => {
  try {
    const topReferrers = await User.find({ referral_count: { $gt: 0 } }).sort({ referral_count: -1 }).limit(50).select('name email subscription_tier referral_code referral_count referral_bonuses_paid bl_coins direct_referrals indirect_referrals level1_referrals level2_referrals');
    const totalReferrals = await User.aggregate([{ $group: { _id: null, total: { $sum: '$referral_count' }, totalBonuses: { $sum: '$referral_bonuses_paid' } } }]);

    // Get who referred whom
    const referredUsers = await User.find({ referred_by: { $exists: true, $ne: null, $ne: '' } })
      .select('name email referred_by subscription_tier createdAt bl_coins')
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ topReferrers, stats: totalReferrals[0] || { total: 0, totalBonuses: 0 }, referredUsers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch referrals' });
  }
});

// =============================================
// BL COIN STATS
// =============================================
router.get('/bl-stats', requireAdmin, async (req, res) => {
  try {
    const stats = await User.aggregate([
      { $group: { _id: null, totalBL: { $sum: '$bl_coins' }, avgBL: { $avg: '$bl_coins' }, maxBL: { $max: '$bl_coins' }, usersWithCoins: { $sum: { $cond: [{ $gt: ['$bl_coins', 0] }, 1, 0] } } } },
    ]);
    const deployedSitesCount = await User.aggregate([
      { $project: { count: { $size: { $ifNull: ['$deployed_sites', []] } } } },
      { $group: { _id: null, total: { $sum: '$count' } } },
    ]);
    res.json({ blStats: stats[0] || {}, deployedSites: deployedSitesCount[0]?.total || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch BL stats' });
  }
});

// =============================================
// VISITOR TRACKING ENDPOINT (called from frontend)
// =============================================
router.get('/visitors', requirePermission('viewAnalytics'), async (req, res) => {
  try {
    if (!SiteVisitor) return res.json({ visitors: [], total: 0, byCountry: [], message: 'SiteVisitor model not loaded' });

    const thirtyDays = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { page = 1, limit = 50 } = req.query;

    const [total, visitors, byCountry, dailyStats] = await Promise.all([
      SiteVisitor.countDocuments(),
      SiteVisitor.find().sort({ lastVisit: -1 }).skip((page - 1) * limit).limit(parseInt(limit)),
      SiteVisitor.aggregate([
        { $group: { _id: { country: '$country', countryCode: '$countryCode' }, count: { $sum: 1 }, lat: { $first: '$latitude' }, lng: { $first: '$longitude' } } },
        { $sort: { count: -1 } },
      ]),
      SiteVisitor.aggregate([
        { $match: { createdAt: { $gte: thirtyDays } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: 1 }, registered: { $sum: { $cond: ['$didRegister', 1, 0] } }, guestBuilds: { $sum: { $cond: ['$usedGuestBuilder', 1, 0] } } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({ visitors, total, byCountry, dailyStats, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch visitors', details: err.message });
  }
});

module.exports = router;
