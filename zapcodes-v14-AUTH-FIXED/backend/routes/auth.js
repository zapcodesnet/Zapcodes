const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const passport = require('passport');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { trackFailedLogin } = require('../services/security');
const { sendVerificationCode, verifyCode } = require('../services/email');

const router = express.Router();

const generateToken = (user) => {
  return jwt.sign(
    { userId: user._id, user_id: user.user_id, email: user.email, plan: user.subscription_tier, subscription_tier: user.subscription_tier },
    process.env.JWT_SECRET || 'dev-secret-change-me',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// ── Helper: strip heavy fields from user object for auth responses ────────
function lightweightUser(user) {
  // Manually build a small object — do NOT use toSafeObject() which serializes everything (11MB+)
  const u = user.toObject ? user.toObject() : user;
  return {
    _id: u._id,
    user_id: u.user_id,
    email: u.email,
    name: u.name,
    role: u.role,
    provider: u.provider,
    subscription_tier: u.subscription_tier,
    emailVerified: u.emailVerified,
    bl_balance: u.bl_balance,
    referral_code: u.referral_code,
    referred_by: u.referred_by,
    referral_count: u.referral_count,
    loginCount: u.loginCount,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    status: u.status,
    // Lightweight counts instead of full arrays
    projectCount: (u.saved_projects || []).length,
    siteCount: (u.deployed_sites || []).length,
  };
}

// ── Helper: attempt to claim a guest site by fingerprint hash ─────────────
// Also copies the site files into the user's saved_projects and deployed_sites
async function attemptGuestClaim(userId, ip, deviceId) {
  try {
    if (!deviceId && !ip) return null;
    const GuestSite = require('../models/GuestSite');
    const hash = crypto.createHash('sha256').update(`${ip}||${deviceId}`).digest('hex');
    const site = await GuestSite.findActiveByHash(hash);
    if (!site) return null;
    site.status = 'claimed';
    site.claimedBy = userId;
    site.claimedAt = new Date();
    site.claimedVia = 'zapcodes';
    await site.save();

    // ── Import files into user's account ──
    const user = await User.findById(userId);
    if (user && site.files?.length) {
      const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Add to saved_projects
      if (!user.saved_projects) user.saved_projects = [];
      user.saved_projects.push({
        projectId,
        name: site.title || site.subdomain || 'Guest Build',
        files: site.files,
        preview: '',
        template: 'custom',
        description: `Claimed from guest build (${site.subdomain}.zapcodes.net)`,
        linkedSubdomain: site.subdomain,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Add to deployed_sites so it stays live
      user.deployed_sites.push({
        subdomain: site.subdomain,
        title: site.title || site.subdomain,
        files: site.files,
        hasBadge: true,
        fileSize: JSON.stringify(site.files).length,
        lastUpdated: new Date(),
      });
      user.markModified('saved_projects');
      user.markModified('deployed_sites');
      await user.save();
      console.log(`[GuestClaim] Site ${site.subdomain} claimed + imported for user ${userId} (${site.files.length} files)`);
    }

    return { subdomain: site.subdomain, url: `https://${site.subdomain}.zapcodes.net`, claimCode: site.claimCode };
  } catch (err) {
    console.warn('[GuestClaim] Auto-claim failed (non-fatal):', err.message);
    return null;
  }
}

// ── Register ──────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, referralCode: refCode, deviceId } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password, and name are required' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const userReferralCode = crypto.randomBytes(4).toString('hex');
    const SUPER_ADMIN_EMAIL = 'zapcodesnet@gmail.com';
    const isSuperAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL;

    const user = await User.create({
      email, password, name, provider: 'local',
      emailVerified: !isSuperAdmin,
      referral_code: userReferralCode,
    });

    // Handle referral bonus
    if (refCode) {
      const referrer = await User.findOne({ referral_code: refCode });
      if (referrer && referrer._id.toString() !== user._id.toString()) {
        user.referred_by = referrer.user_id || referrer._id.toString();
        user.creditCoins(50000, 'referral_bonus', `Referred by ${referrer.name}`);
        user.signup_bonus_claimed = true;
        await user.save();
        referrer.creditCoins(50000, 'referral_bonus', `Referred ${user.name}`);
        referrer.referral_count += 1;
        referrer.referral_bonuses_paid = (referrer.referral_bonuses_paid || 0) + 1;
        referrer.direct_referrals = (referrer.direct_referrals || 0) + 1;
        await referrer.save();
        console.log(`[Referral] ${referrer.email} → ${user.email} (50K BL each)`);
      } else {
        user.creditCoins(50000, 'signup_bonus', 'Welcome bonus: 50,000 BL');
        user.signup_bonus_claimed = true;
        await user.save();
      }
    } else {
      user.creditCoins(50000, 'signup_bonus', 'Welcome bonus: 50,000 BL');
      user.signup_bonus_claimed = true;
      await user.save();
    }

    // Super admin: requires email verification
    if (isSuperAdmin) {
      const result = await sendVerificationCode(email.toLowerCase(), 'registration');
      return res.status(201).json({
        message: 'Account created! Please verify your email.',
        needsVerification: true,
        email: email.toLowerCase(),
        ...(result.devCode ? { devCode: result.devCode } : {}),
      });
    }

    // ── NEW: Auto-claim any guest site by fingerprint ─────────────────────
    const clientIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const claimedSite = await attemptGuestClaim(user._id, clientIp, deviceId);

    const token = generateToken(user);
    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: lightweightUser(user),
      claimedGuestSite: claimedSite || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// ── Verify email code ──────────────────────────────────────────────────────
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code required' });
    const result = verifyCode(email.toLowerCase(), code);
    if (!result.valid) return res.status(401).json({ error: result.error, attemptsLeft: result.attemptsLeft });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.emailVerified = true;
    await user.save();
    const token = generateToken(user);
    res.json({ token, user: lightweightUser(user), message: 'Email verified successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── Resend verification code ───────────────────────────────────────────────
router.post('/resend-code', async (req, res) => {
  try {
    const { email, type } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'No account found with this email' });
    const codeType = type || 'registration';
    const SUPER_ADMIN_EMAIL = 'zapcodesnet@gmail.com';
    const isSuperAdmin = user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
    if (codeType !== 'admin' && !isSuperAdmin && user.emailVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }
    const result = await sendVerificationCode(email.toLowerCase(), codeType);
    res.json({ message: 'Verification code sent! Check your email.', ...(result.devCode ? { devCode: result.devCode } : {}) });
  } catch (err) {
    res.status(429).json({ error: err.message });
  }
});

// ── Admin verify login ──────────────────────────────────────────────────────
router.post('/verify-admin-login', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code required' });
    const result = verifyCode(email.toLowerCase(), code);
    if (!result.valid) return res.status(401).json({ error: result.error, attemptsLeft: result.attemptsLeft });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.lastLoginAt = new Date();
    user.lastLoginIP = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    user.lastLoginDevice = req.headers['user-agent'] || 'unknown';
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();
    const token = generateToken(user);
    let adminSessionToken = null;
    if (['super-admin', 'co-admin', 'moderator'].includes(user.role)) {
      adminSessionToken = jwt.sign(
        { userId: user._id.toString(), email: user.email, role: user.role, verified: true },
        (process.env.JWT_SECRET || 'dev-secret-change-me') + '-admin-session',
        { expiresIn: '4h' }
      );
    }
    // ── FIX: Send lightweight user — NOT 22MB of saved_projects file content ──
    res.json({ token, user: lightweightUser(user), message: 'Admin login verified', ...(adminSessionToken ? { adminSessionToken } : {}) });
  } catch (err) {
    console.error('[Auth] verify-admin-login error:', err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── Login ──────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password +password_hash');
    if (!user || (!user.password && !user.password_hash)) {
      trackFailedLogin(req.ip, email, req.headers['user-agent']);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.status === 'banned') return res.status(403).json({ error: 'Account banned', reason: user.banReason || 'Contact support' });
    if (user.status === 'suspended') {
      if (user.suspendedUntil && user.suspendedUntil > new Date()) return res.status(403).json({ error: 'Account suspended', reason: user.suspendReason, until: user.suspendedUntil });
      else { user.status = 'active'; user.suspendReason = null; user.suspendedUntil = null; }
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) { trackFailedLogin(req.ip, email, req.headers['user-agent']); return res.status(401).json({ error: 'Invalid credentials' }); }
    const SUPER_ADMIN_EMAIL = 'zapcodesnet@gmail.com';
    const isSuperAdmin = user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
    if (isSuperAdmin && !user.emailVerified && user.provider === 'local') {
      return res.status(403).json({ error: 'Email not verified', needsVerification: true, email: email.toLowerCase(), message: 'Please verify your email.' });
    }
    if (!isSuperAdmin && !user.emailVerified && user.provider === 'local') user.emailVerified = true;

    // ── OTP BYPASSED for now — super admin logs in directly ──
    // TODO: Re-enable OTP once the verification system is debugged
    user.lastLoginAt = new Date();
    user.lastLoginIP = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    user.lastLoginDevice = req.headers['user-agent'] || 'unknown';
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();
    const token = generateToken(user);
    // ── FIX: Send lightweight user for regular login too ──
    res.json({ token, user: lightweightUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// ── Get current user ──────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => res.json({ user: lightweightUser(req.user) }));

// ── GitHub OAuth ──────────────────────────────────────────────────────────
router.get('/github', (req, res, next) => {
  if (!process.env.GITHUB_CLIENT_ID) return res.status(503).json({ error: 'GitHub login is not configured yet.' });
  passport.authenticate('github', { scope: ['user:email', 'repo'] })(req, res, next);
});
router.get('/github/callback', (req, res, next) => {
  if (!process.env.GITHUB_CLIENT_ID) return res.redirect(`${process.env.WEB_URL || 'http://localhost:5173'}/login?error=github_not_configured`);
  passport.authenticate('github', { session: false, failureRedirect: `${process.env.WEB_URL || 'http://localhost:5173'}/login?error=github` })(req, res, next);
}, (req, res) => {
  const token = generateToken(req.user);
  res.redirect(`${process.env.WEB_URL || 'http://localhost:5173'}/auth/callback?token=${token}`);
});

// ── Google OAuth ──────────────────────────────────────────────────────────
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google login is not configured yet.' });
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});
router.get('/google/callback', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.redirect(`${process.env.WEB_URL || 'http://localhost:5173'}/login?error=google_not_configured`);
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.WEB_URL || 'http://localhost:5173'}/login?error=google` })(req, res, next);
}, (req, res) => {
  const token = generateToken(req.user);
  res.redirect(`${process.env.WEB_URL || 'http://localhost:5173'}/auth/callback?token=${token}`);
});

// ── Logout ─────────────────────────────────────────────────────────────────
router.post('/logout', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+githubToken');
    if (user && user.githubToken && !user.githubTokenPermanent) {
      user.githubToken = null; user.githubTokenSetAt = null; await user.save();
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) { res.json({ message: 'Logged out' }); }
});

// ══════════════════════════════════════════════════════════════════
// FORGOT PASSWORD — Math puzzle challenge + reset via email
// ══════════════════════════════════════════════════════════════════

// In-memory rate limiter for reset requests
const resetRateLimit = new Map(); // email → { count, firstRequest }
function checkResetRateLimit(email) {
  const key = email.toLowerCase();
  const now = Date.now();
  const entry = resetRateLimit.get(key);
  if (!entry || (now - entry.firstRequest) > 3600000) {
    // Reset after 1 hour
    resetRateLimit.set(key, { count: 1, firstRequest: now });
    return true;
  }
  if (entry.count >= 3) return false; // Max 3 per hour
  entry.count++;
  return true;
}

// In-memory store for reset tokens (valid 15 min)
const resetTokens = new Map(); // token → { email, expiresAt }

// GET /api/auth/reset-challenge — generate a math puzzle
router.get('/reset-challenge', (req, res) => {
  // Generate random math question
  const ops = [
    () => { const a = Math.floor(Math.random() * 20) + 5; const b = Math.floor(Math.random() * 15) + 2; return { question: `What is ${a} + ${b}?`, answer: a + b }; },
    () => { const a = Math.floor(Math.random() * 30) + 15; const b = Math.floor(Math.random() * 10) + 1; return { question: `What is ${a} - ${b}?`, answer: a - b }; },
    () => { const a = Math.floor(Math.random() * 10) + 2; const b = Math.floor(Math.random() * 8) + 2; return { question: `What is ${a} × ${b}?`, answer: a * b }; },
    () => { const words = ['seven', 'eight', 'nine', 'twelve', 'fifteen', 'twenty']; const nums = [7, 8, 9, 12, 15, 20]; const i = Math.floor(Math.random() * words.length); const b = Math.floor(Math.random() * 5) + 1; return { question: `What is ${words[i]} plus ${b}?`, answer: nums[i] + b }; },
  ];
  const puzzle = ops[Math.floor(Math.random() * ops.length)]();

  // Sign the answer into a JWT so we can verify without storing server-side
  const challengeToken = jwt.sign(
    { answer: puzzle.answer, type: 'reset-challenge', iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_SECRET || 'dev-secret-change-me',
    { expiresIn: '5m' }
  );

  res.json({ question: puzzle.question, challengeToken });
});

// POST /api/auth/forgot-password — verify challenge + send reset link
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, challengeAnswer, challengeToken } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!challengeAnswer || !challengeToken) return res.status(400).json({ error: 'Please solve the security question' });

    // Verify the math challenge
    try {
      const decoded = jwt.verify(challengeToken, process.env.JWT_SECRET || 'dev-secret-change-me');
      if (decoded.type !== 'reset-challenge') return res.status(400).json({ error: 'Invalid challenge' });
      if (parseInt(challengeAnswer) !== decoded.answer) {
        return res.status(400).json({ error: 'Wrong answer to security question. Please try again.' });
      }
    } catch (err) {
      if (err.name === 'TokenExpiredError') return res.status(400).json({ error: 'Security question expired. Please refresh and try again.' });
      return res.status(400).json({ error: 'Invalid security challenge' });
    }

    // Rate limit
    if (!checkResetRateLimit(email)) {
      return res.status(429).json({ error: 'Too many reset requests. Please try again in 1 hour.' });
    }

    // Find user (don't reveal if email exists or not — always return success)
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't tell the user the email doesn't exist (security)
      return res.json({ message: 'If an account with that email exists, a reset code has been sent.' });
    }

    // Generate a 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Store reset token (valid 15 minutes)
    resetTokens.set(resetToken, {
      email: email.toLowerCase(),
      code: resetCode,
      expiresAt: Date.now() + 15 * 60 * 1000,
      attempts: 0,
    });

    // Clean up expired tokens periodically
    for (const [key, val] of resetTokens) {
      if (val.expiresAt < Date.now()) resetTokens.delete(key);
    }

    // Send reset code via existing email service
    try {
      await sendVerificationCode(email.toLowerCase(), 'password_reset');
      // The sendVerificationCode generates its own code — we'll use that system
      console.log(`[Auth] Password reset requested for ${email.toLowerCase()}`);
    } catch (emailErr) {
      console.warn('[Auth] Reset email send failed:', emailErr.message);
    }

    res.json({
      message: 'If an account with that email exists, a reset code has been sent.',
      resetToken, // Frontend needs this to submit the reset
    });
  } catch (err) {
    console.error('[Auth] forgot-password error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/reset-password — verify code + update password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword, resetToken } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Verify the reset code using existing verification system
    const result = verifyCode(email.toLowerCase(), code);
    if (!result.valid) {
      return res.status(401).json({ error: result.error || 'Invalid or expired code', attemptsLeft: result.attemptsLeft });
    }

    // Find and update user
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password +password_hash');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Update password (mongoose pre-save hook will hash it)
    user.password = newPassword;
    // Also update password_hash if used for BlendLink cross-compatibility
    if (user.password_hash !== undefined) {
      const bcrypt = require('bcryptjs');
      user.password_hash = await bcrypt.hash(newPassword, 12);
    }
    await user.save();

    // Clean up reset token
    if (resetToken) resetTokens.delete(resetToken);

    console.log(`[Auth] Password reset successful for ${email.toLowerCase()}`);
    res.json({ message: 'Password updated successfully! You can now log in with your new password.' });
  } catch (err) {
    console.error('[Auth] reset-password error:', err.message);
    res.status(500).json({ error: 'Password reset failed. Please try again.' });
  }
});

// ── Auth providers info ────────────────────────────────────────────────────
router.get('/providers', (req, res) => {
  res.json({
    github: !!process.env.GITHUB_CLIENT_ID,
    google: !!process.env.GOOGLE_CLIENT_ID,
  });
});

module.exports = router;
