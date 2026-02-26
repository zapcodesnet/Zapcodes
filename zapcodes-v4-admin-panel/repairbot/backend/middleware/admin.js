const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');

const SUPER_ADMIN_EMAIL = 'zapcodesnet@gmail.com';

// Middleware: require admin role
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(404).json({ error: 'Not found' }); // Hide admin existence

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = await User.findById(decoded.userId).select('+twoFactorSecret');

    if (!user || !['super-admin', 'co-admin', 'moderator'].includes(user.role)) {
      return res.status(404).json({ error: 'Not found' }); // 404 not 403 — hide admin panel
    }

    if (user.status !== 'active') {
      return res.status(404).json({ error: 'Not found' });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    return res.status(404).json({ error: 'Not found' });
  }
};

// Middleware: require super admin
const requireSuperAdmin = async (req, res, next) => {
  if (!req.user?.isSuperAdmin()) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
};

// Middleware: require specific permission
const requirePermission = (perm) => {
  return (req, res, next) => {
    if (!req.user?.hasPermission(perm)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Middleware: require 2FA verified session for AI commands
const require2FA = (req, res, next) => {
  const twoFAToken = req.headers['x-2fa-token'];
  if (!twoFAToken) {
    return res.status(403).json({ error: '2FA verification required', requires2FA: true });
  }

  try {
    const decoded = jwt.verify(twoFAToken, process.env.JWT_SECRET + '-2fa');
    if (decoded.userId !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Invalid 2FA session' });
    }
    // Check expiry (5 min inactivity)
    if (Date.now() - decoded.lastActivity > 5 * 60 * 1000) {
      return res.status(403).json({ error: '2FA session expired', requires2FA: true });
    }
    req.twoFASession = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: '2FA session expired', requires2FA: true });
  }
};

// Helper: log admin action
async function logAdminAction(params) {
  try {
    await AdminLog.create({
      actor: params.actor._id || params.actor,
      actorEmail: params.actorEmail || params.actor.email,
      actorRole: params.actorRole || params.actor.role,
      action: params.action,
      targetUser: params.targetUser,
      targetEmail: params.targetEmail,
      description: params.description,
      beforeState: params.beforeState,
      afterState: params.afterState,
      metadata: params.metadata,
      ip: params.ip,
      userAgent: params.userAgent,
      severity: params.severity || 'info',
    });
  } catch (err) {
    console.error('Failed to log admin action:', err);
  }
}

// Helper: ensure super admin exists on startup
async function ensureSuperAdmin() {
  try {
    const existing = await User.findOne({ email: SUPER_ADMIN_EMAIL });
    if (existing && existing.role !== 'super-admin') {
      existing.role = 'super-admin';
      existing.permissions = {
        viewAnalytics: true, moderateUsers: true, viewFinancials: true,
        adjustPricing: true, viewSecurityLogs: true, manageAI: true,
        manageRoles: true, deleteUsers: true, globalSettings: true,
      };
      await existing.save();
      console.log(`Promoted ${SUPER_ADMIN_EMAIL} to super-admin`);
    } else if (existing) {
      // Ensure all permissions are true
      existing.permissions = {
        viewAnalytics: true, moderateUsers: true, viewFinancials: true,
        adjustPricing: true, viewSecurityLogs: true, manageAI: true,
        manageRoles: true, deleteUsers: true, globalSettings: true,
      };
      await existing.save();
    }
  } catch (err) {
    console.error('Error ensuring super admin:', err);
  }
}

module.exports = {
  requireAdmin, requireSuperAdmin, requirePermission, require2FA,
  logAdminAction, ensureSuperAdmin, SUPER_ADMIN_EMAIL,
};
