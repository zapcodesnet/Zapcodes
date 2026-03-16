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
  const safe = user.toSafeObject();
  // Remove massive arrays that can be 10-50MB+ for active users
  delete safe.saved_projects;
  delete safe.deployed_sites;
  // Add lightweight counts instead
  safe.projectCount = (user.saved_projects || []).length;
  safe.siteCount = (user.deployed_sites || []).length;
  return safe;
}

// ── Helper: attempt to claim a guest site by fingerprint hash ─────────────
async function attemptGuestClaim(userId, ip, deviceId) {
  try {
    if (!deviceId || !ip) return null;
    const GuestSite = require('../models/GuestSite');
    const hash = crypto.createHash('sha256').update(`${ip}||${deviceId}`).digest('hex');
    const site = await GuestSite.findActiveByHash(hash);
    if (!site) return null;
    site.status = 'claimed';
    site.claimedBy = userId;
    site.claimedAt = new Date();
    site.claimedVia = 'zapcodes';
    await site.save();
    console.log(`[GuestClaim] Site ${site.subdomain} auto-claimed by user ${userId}`);
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
    if (isSuperAdmin) {
      const adminResult = await sendVerificationCode(email.toLowerCase(), 'admin');
      return res.status(200).json({ needsAdminVerification: true, email: email.toLowerCase(), message: 'Admin verification code sent to your email.', ...(adminResult.devCode ? { devCode: adminResult.devCode } : {}) });
    }
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

// ── Auth providers info ────────────────────────────────────────────────────
router.get('/providers', (req, res) => {
  res.json({
    github: !!process.env.GITHUB_CLIENT_ID,
    google: !!process.env.GOOGLE_CLIENT_ID,
  });
});

module.exports = router;
