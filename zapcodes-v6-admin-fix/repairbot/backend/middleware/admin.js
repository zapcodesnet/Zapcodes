const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');

const SUPER_ADMIN_EMAIL = 'zapcodesnet@gmail.com';

// In-memory store for email verification codes
const verificationCodes = new Map();
const resendTracking = new Map();

// Middleware: require admin role + verified session
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required', needsAuth: true });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = await User.findById(decoded.userId).select('+twoFactorSecret');
    if (!user) return res.status(401).json({ error: 'User not found', needsAuth: true });
    if (user.status !== 'active') return res.status(403).json({ error: 'Account not active' });

    if (!['super-admin', 'co-admin', 'moderator'].includes(user.role)) {
      return res.status(403).json({ error: 'Unauthorized', needsVerification: true });
    }

    // Check admin session token (from email verification)
    const adminToken = req.headers['x-admin-session'];
    if (adminToken) {
      try {
        const ad = jwt.verify(adminToken, process.env.JWT_SECRET + '-admin-session');
        if (ad.userId === user._id.toString() && ad.verified) {
          req.user = user;
          req.userId = user._id;
          return next();
        }
      } catch (e) { /* expired */ }
    }

    return res.status(403).json({ error: 'Admin verification required', needsVerification: true, email: maskEmail(user.email) });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', needsAuth: true });
  }
};

// Check admin access status (public endpoint)
const checkAdminAccess = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.json({ status: 'not_logged_in', needsAuth: true });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = await User.findById(decoded.userId);
    if (!user) return res.json({ status: 'not_logged_in', needsAuth: true });

    if (!['super-admin', 'co-admin', 'moderator'].includes(user.role)) {
      return res.json({ status: 'not_authorized', needsVerification: true });
    }

    const adminToken = req.headers['x-admin-session'];
    if (adminToken) {
      try {
        const ad = jwt.verify(adminToken, process.env.JWT_SECRET + '-admin-session');
        if (ad.userId === user._id.toString() && ad.verified) {
          return res.json({ status: 'verified', role: user.role });
        }
      } catch (e) { /* expired */ }
    }

    return res.json({ status: 'needs_verification', email: maskEmail(user.email), role: user.role });
  } catch (err) {
    return res.json({ status: 'not_logged_in', needsAuth: true });
  }
};

// Send verification code
const sendVerificationCode = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Login required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Rate limit: 5/hour
    const trackKey = user.email;
    const t = resendTracking.get(trackKey) || { count: 0, windowStart: Date.now() };
    if (Date.now() - t.windowStart > 3600000) { t.count = 0; t.windowStart = Date.now(); }
    if (t.count >= 5) return res.status(429).json({ error: 'Too many requests. Try again in 1 hour.' });
    t.count += 1;
    resendTracking.set(trackKey, t);

    if (!['super-admin', 'co-admin', 'moderator'].includes(user.role)) {
      await logAdminAction({ actor: user, action: 'admin_login', description: `Non-admin ${user.email} attempted admin verification`, ip: req.ip, userAgent: req.headers['user-agent'], severity: 'warning' });
      return res.json({ message: 'If your email is authorized, a code has been sent.' });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    verificationCodes.set(user.email, { code, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });

    console.log(`[ADMIN VERIFY] Code for ${user.email}: ${code}`);
    // TODO: Send via SendGrid/SES in production

    await logAdminAction({ actor: user, action: 'admin_login', description: `Verification code sent to ${maskEmail(user.email)}`, ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({
      message: 'If your email is authorized, a code has been sent.',
      ...(process.env.NODE_ENV !== 'production' ? { devCode: code } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send code' });
  }
};

// Verify the code
const verifyAdminCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Login required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (!['super-admin', 'co-admin', 'moderator'].includes(user.role)) {
      await logAdminAction({ actor: user, action: 'admin_login', description: `Failed admin code attempt by ${user.email}`, ip: req.ip, userAgent: req.headers['user-agent'], severity: 'warning' });
      return res.status(401).json({ error: 'Invalid code' });
    }

    const stored = verificationCodes.get(user.email);
    if (!stored) return res.status(401).json({ error: 'No code found. Request a new one.' });
    if (Date.now() > stored.expiresAt) { verificationCodes.delete(user.email); return res.status(401).json({ error: 'Code expired. Request a new one.' }); }

    stored.attempts += 1;
    if (stored.attempts > 5) { verificationCodes.delete(user.email); return res.status(429).json({ error: 'Too many attempts. Request a new code.' }); }
    if (stored.code !== code.toString()) return res.status(401).json({ error: 'Invalid code', attemptsLeft: 5 - stored.attempts });

    verificationCodes.delete(user.email);

    const adminSessionToken = jwt.sign(
      { userId: user._id.toString(), email: user.email, role: user.role, verified: true },
      process.env.JWT_SECRET + '-admin-session',
      { expiresIn: '4h' }
    );

    await logAdminAction({ actor: user, action: 'admin_login', description: `Admin ${user.email} verified and accessed admin panel`, ip: req.ip, userAgent: req.headers['user-agent'] });

    res.json({ adminSessionToken, role: user.role, message: 'Admin access granted' });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
};

const requireSuperAdmin = (req, res, next) => { if (!req.user?.isSuperAdmin()) return res.status(403).json({ error: 'Super admin required' }); next(); };
const requirePermission = (perm) => (req, res, next) => { if (!req.user?.hasPermission(perm)) return res.status(403).json({ error: 'Insufficient permissions' }); next(); };

const require2FA = (req, res, next) => {
  const t = req.headers['x-2fa-token'];
  if (!t) return res.status(403).json({ error: '2FA required', requires2FA: true });
  try {
    const d = jwt.verify(t, process.env.JWT_SECRET + '-2fa');
    if (d.userId !== req.user._id.toString()) return res.status(403).json({ error: 'Invalid 2FA' });
    if (Date.now() - d.lastActivity > 300000) return res.status(403).json({ error: '2FA expired', requires2FA: true });
    req.twoFASession = d; next();
  } catch (e) { return res.status(403).json({ error: '2FA expired', requires2FA: true }); }
};

function maskEmail(email) { const [n, d] = email.split('@'); return n.slice(0, 2) + '***@' + d; }

async function logAdminAction(p) {
  try { await AdminLog.create({ actor: p.actor._id || p.actor, actorEmail: p.actorEmail || p.actor.email, actorRole: p.actorRole || p.actor.role, action: p.action, targetUser: p.targetUser, targetEmail: p.targetEmail, description: p.description, beforeState: p.beforeState, afterState: p.afterState, metadata: p.metadata, ip: p.ip, userAgent: p.userAgent, severity: p.severity || 'info' }); }
  catch (e) { console.error('Log failed:', e); }
}

async function ensureSuperAdmin() {
  try {
    const u = await User.findOne({ email: SUPER_ADMIN_EMAIL });
    if (u) {
      if (u.role !== 'super-admin') u.role = 'super-admin';
      u.permissions = { viewAnalytics: true, moderateUsers: true, viewFinancials: true, adjustPricing: true, viewSecurityLogs: true, manageAI: true, manageRoles: true, deleteUsers: true, globalSettings: true };
      await u.save();
      if (u.role !== 'super-admin') console.log(`Promoted ${SUPER_ADMIN_EMAIL} to super-admin`);
    }
  } catch (e) { console.error('ensureSuperAdmin error:', e); }
}

module.exports = { requireAdmin, requireSuperAdmin, requirePermission, require2FA, checkAdminAccess, sendVerificationCode, verifyAdminCode, logAdminAction, ensureSuperAdmin, SUPER_ADMIN_EMAIL };
