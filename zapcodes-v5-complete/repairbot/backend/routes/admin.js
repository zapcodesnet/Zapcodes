const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');
const SecurityFlag = require('../models/SecurityFlag');
const Repo = require('../models/Repo');
const {
  requireAdmin, requireSuperAdmin, requirePermission, require2FA,
  checkAdminAccess, sendVerificationCode, verifyAdminCode,
  logAdminAction, SUPER_ADMIN_EMAIL,
} = require('../middleware/admin');

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

    const [freeUsers, starterUsers, proUsers] = await Promise.all([
      User.countDocuments({ plan: 'free' }),
      User.countDocuments({ plan: 'starter' }),
      User.countDocuments({ plan: 'pro' }),
    ]);

    const totalRepos = await Repo.countDocuments();
    const recentFlags = await SecurityFlag.countDocuments({ status: 'new' });
    const recentLogs = await AdminLog.find().sort({ timestamp: -1 }).limit(10)
      .populate('actor', 'name email').populate('targetUser', 'name email');

    // Revenue estimate
    const monthlyRevenue = (starterUsers * 9) + (proUsers * 29);

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

    res.json({
      users: { total: totalUsers, active: activeUsers, banned: bannedUsers, suspended: suspendedUsers, newThisWeek: newUsersThisWeek },
      plans: { free: freeUsers, starter: starterUsers, pro: proUsers },
      repos: totalRepos,
      revenue: { monthly: monthlyRevenue, starter: starterUsers * 9, pro: proUsers * 29 },
      securityFlags: recentFlags,
      recentLogs,
      dailySignups,
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

    // Generate a secret
    const secret = crypto.randomBytes(20).toString('hex');
    const base32Secret = Buffer.from(secret).toString('base64').replace(/=/g, '').slice(0, 16);

    req.user.twoFactorSecret = base32Secret;
    await req.user.save();

    // Generate otpauth URL for Google Authenticator
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

    // Simple TOTP verification (30-second window)
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

    // Generate 2FA session token (5 min TTL)
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
  // Check current and previous window
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
    if (plan) query.plan = plan;
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

    res.json({ user, logs });
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

    // Cannot ban super admin
    if (target.email === SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Cannot ban the primary admin' });
    }
    // Co-admins can't ban other admins
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

    // Force disconnect via Socket.IO
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

    // Cascade delete: repos, logs referencing this user
    await Repo.deleteMany({ user: target._id });

    // Force logout
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

    // Only super admin can promote to co-admin
    if (role === 'co-admin' && !req.user.isSuperAdmin()) {
      return res.status(403).json({ error: 'Only super admin can create co-admins' });
    }
    // Can't change super admin's role
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
// PER-USER SUBSCRIPTION CUSTOMIZATION
// =============================================
router.post('/users/:id/subscription', requirePermission('adjustPricing'), async (req, res) => {
  try {
    const { plan, customPrice } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const before = { plan: target.plan, customPrice: target.customPrice };

    if (plan) target.plan = plan;
    if (customPrice !== undefined) target.customPrice = customPrice;

    // Update limits based on plan
    const limits = { free: { scans: 5, builds: 3 }, starter: { scans: 50, builds: 25 }, pro: { scans: 99999, builds: 99999 } };
    const l = limits[target.plan] || limits.free;
    target.scansLimit = l.scans;
    target.buildsLimit = l.builds;

    await target.save();

    await logAdminAction({
      actor: req.user, action: 'price_override', targetUser: target._id, targetEmail: target.email,
      description: `Changed subscription for ${target.email}: plan=${target.plan}, customPrice=${customPrice}`,
      beforeState: before, afterState: { plan: target.plan, customPrice: target.customPrice },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ message: `Subscription updated for ${target.email}`, user: target.toSafeObject() });
  } catch (err) {
    res.status(500).json({ error: 'Subscription update failed' });
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

    // Log the command
    await logAdminAction({
      actor: req.user, action: 'ai_command',
      description: `AI command: ${command.slice(0, 200)}`,
      metadata: { fullCommand: command },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    // Process with AI (Groq or local fallback)
    const response = await processAICommand(command, req.user, req.app);

    // Log the response
    await logAdminAction({
      actor: req.user, action: 'ai_response',
      description: `AI response for: ${command.slice(0, 100)}`,
      metadata: { command: command.slice(0, 200), response: response.message?.slice(0, 500) },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    // Refresh 2FA token (reset 5-min timer)
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

  // Parse common commands
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
        actor: admin, action: 'moltbot_action', targetUser: target._id, targetEmail: target.email,
        description: `Moltbot banned ${target.email} via AI command`,
        afterState: { status: 'banned' }, severity: 'warning',
      });

      return { message: `✅ Moltbot executed: Banned user ${target.email} and forced logout.`, action: 'user_banned', target: target.email };
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

      return { message: `✅ Moltbot executed: Restored user ${target.email} to active status.`, action: 'user_restored', target: target.email };
    }
  }

  if (cmd.includes('user count') || cmd.includes('how many users') || cmd.includes('total users')) {
    const total = await User.countDocuments();
    const active = await User.countDocuments({ status: 'active' });
    const paying = await User.countDocuments({ plan: { $ne: 'free' } });
    return { message: `📊 User Stats:\n• Total: ${total}\n• Active: ${active}\n• Paying: ${paying}\n• Free: ${total - paying}`, action: 'stats' };
  }

  if (cmd.includes('revenue') || cmd.includes('income') || cmd.includes('money')) {
    const starter = await User.countDocuments({ plan: 'starter' });
    const pro = await User.countDocuments({ plan: 'pro' });
    const monthly = (starter * 9) + (pro * 29);
    return { message: `💰 Revenue:\n• Starter users: ${starter} × $9 = $${starter * 9}\n• Pro users: ${pro} × $29 = $${pro * 29}\n• Monthly total: $${monthly}\n• Annual projection: $${monthly * 12}`, action: 'revenue' };
  }

  if (cmd.includes('security') || cmd.includes('threats') || cmd.includes('flags')) {
    const flags = await SecurityFlag.find({ status: 'new' }).sort({ timestamp: -1 }).limit(5);
    if (flags.length === 0) return { message: '🛡️ No active security flags. All clear!', action: 'security' };
    const list = flags.map(f => `• [${f.severity.toUpperCase()}] ${f.description}`).join('\n');
    return { message: `🚨 Active Security Flags (${flags.length}):\n${list}`, action: 'security' };
  }

  if (cmd.includes('set plan') || cmd.includes('change plan') || cmd.includes('upgrade user')) {
    const emailMatch = command.match(/[\w.-]+@[\w.-]+/);
    const planMatch = command.match(/\b(free|starter|pro)\b/i);
    if (emailMatch && planMatch) {
      const target = await User.findOne({ email: emailMatch[0].toLowerCase() });
      if (!target) return { message: `User ${emailMatch[0]} not found`, action: 'none' };

      const oldPlan = target.plan;
      target.plan = planMatch[1].toLowerCase();
      const limits = { free: { scans: 5, builds: 3 }, starter: { scans: 50, builds: 25 }, pro: { scans: 99999, builds: 99999 } };
      const l = limits[target.plan];
      target.scansLimit = l.scans;
      target.buildsLimit = l.builds;
      await target.save();

      await logAdminAction({
        actor: admin, action: 'moltbot_action', targetUser: target._id, targetEmail: target.email,
        description: `Moltbot changed plan for ${target.email}: ${oldPlan} → ${target.plan}`,
        beforeState: { plan: oldPlan }, afterState: { plan: target.plan }, severity: 'info',
      });

      return { message: `✅ Moltbot executed: Changed ${target.email} from ${oldPlan} to ${target.plan} plan.`, action: 'plan_changed', target: target.email };
    }
  }

  // Default: AI analysis response
  return {
    message: `🤖 I understood your command: "${command}"\n\nAvailable Moltbot commands:\n• "ban user email@example.com" — Ban a user\n• "unban user email@example.com" — Restore a user\n• "set plan email@example.com to pro" — Change user plan\n• "user count" — Get user statistics\n• "revenue" — Get revenue report\n• "security flags" — Check active security flags\n\nFor complex tasks, be specific about what action to take and which user to target.`,
    action: 'help',
  };
}

// =============================================
// ANALYTICS
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
        { $group: { _id: '$plan', count: { $sum: 1 } } },
      ]),
      User.find().sort({ scansUsed: -1 }).limit(10).select('name email plan scansUsed buildsUsed'),
    ]);

    res.json({ dailySignups, planDistribution, topUsers });
  } catch (err) {
    res.status(500).json({ error: 'Analytics fetch failed' });
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

module.exports = router;
