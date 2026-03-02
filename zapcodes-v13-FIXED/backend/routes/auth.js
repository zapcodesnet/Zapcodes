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
    { userId: user._id, email: user.email, plan: user.plan },
    process.env.JWT_SECRET || 'dev-secret-change-me',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Register — sends verification code
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, referralCode: refCode } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password, and name are required' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    // Generate unique referral code
    const userReferralCode = crypto.randomBytes(4).toString('hex');

    // Create user as unverified
    const user = await User.create({ email, password, name, provider: 'local', emailVerified: false, referralCode: userReferralCode });

    // Handle referral bonus
    if (refCode) {
      const referrer = await User.findOne({ referralCode: refCode });
      if (referrer && referrer._id.toString() !== user._id.toString()) {
        user.referredBy = referrer._id;
        user.creditCoins(50000, 'referral_bonus', `Referred by ${referrer.name}`);
        await user.save();
        referrer.creditCoins(50000, 'referral_bonus', `Referred ${user.name}`);
        referrer.referralCount += 1;
        referrer.referralBonusesPaid = (referrer.referralBonusesPaid || 0) + 1;
        await referrer.save();
        console.log(`[Referral] ${referrer.email} → ${user.email} (50K BL each)`);
      }
    }

    // Send verification code
    const result = await sendVerificationCode(email.toLowerCase(), 'registration');

    res.status(201).json({
      message: 'Account created! Please verify your email.',
      needsVerification: true,
      email: email.toLowerCase(),
      ...(result.devCode ? { devCode: result.devCode } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// Verify email code (registration or login)
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code required' });

    const result = verifyCode(email.toLowerCase(), code);
    if (!result.valid) return res.status(401).json({ error: result.error, attemptsLeft: result.attemptsLeft });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Mark email as verified
    user.emailVerified = true;
    await user.save();

    const token = generateToken(user);
    res.json({ token, user: user.toSafeObject(), message: 'Email verified successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Resend verification code
router.post('/resend-code', async (req, res) => {
  try {
    const { email, type } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    // Verify user exists
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'No account found with this email' });

    // Only allow resend for unverified users (registration/login) or admin 2FA
    const codeType = type || 'registration';
    if (codeType !== 'admin' && user.emailVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    const result = await sendVerificationCode(email.toLowerCase(), codeType);
    res.json({ message: 'Verification code sent! Check your email.', ...(result.devCode ? { devCode: result.devCode } : {}) });
  } catch (err) {
    res.status(429).json({ error: err.message });
  }
});

// Admin verify login — complete login after admin 2FA code
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
    res.json({ token, user: user.toSafeObject(), message: 'Admin login verified' });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user || !user.password) {
      trackFailedLogin(req.ip, email, req.headers['user-agent']);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check account status
    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Account banned', reason: user.banReason || 'Contact support' });
    }
    if (user.status === 'suspended') {
      if (user.suspendedUntil && user.suspendedUntil > new Date()) {
        return res.status(403).json({
          error: 'Account suspended',
          reason: user.suspendReason,
          until: user.suspendedUntil,
        });
      } else {
        // Suspension expired, reactivate
        user.status = 'active';
        user.suspendReason = null;
        user.suspendedUntil = null;
      }
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      trackFailedLogin(req.ip, email, req.headers['user-agent']);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check email verification — do NOT resend code on every login attempt
    // Verification code is only sent once during registration.
    // User can manually request a resend via the "Resend code" button.
    if (!user.emailVerified && user.provider === 'local') {
      return res.status(403).json({
        error: 'Email not verified',
        needsVerification: true,
        email: email.toLowerCase(),
        message: 'Please verify your email. Check your inbox for the verification code sent during registration, or click "Resend code" to get a new one.',
      });
    }

    // Admin/moderator extra verification
    if (['super-admin', 'co-admin', 'moderator'].includes(user.role)) {
      const adminResult = await sendVerificationCode(email.toLowerCase(), 'admin');
      return res.status(200).json({
        needsAdminVerification: true,
        email: email.toLowerCase(),
        message: 'Admin verification code sent to your email.',
        ...(adminResult.devCode ? { devCode: adminResult.devCode } : {}),
      });
    }

    // Track login metadata
    user.lastLoginAt = new Date();
    user.lastLoginIP = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    user.lastLoginDevice = req.headers['user-agent'] || 'unknown';
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    const token = generateToken(user);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});

// GitHub OAuth
router.get('/github', (req, res, next) => {
  if (!process.env.GITHUB_CLIENT_ID) {
    return res.status(503).json({ error: 'GitHub login is not configured yet. Please use email/password.' });
  }
  passport.authenticate('github', { scope: ['user:email', 'repo'] })(req, res, next);
});

router.get('/github/callback',
  (req, res, next) => {
    if (!process.env.GITHUB_CLIENT_ID) {
      return res.redirect(`${process.env.WEB_URL || 'http://localhost:5173'}/login?error=github_not_configured`);
    }
    passport.authenticate('github', { session: false, failureRedirect: `${process.env.WEB_URL || 'http://localhost:5173'}/login?error=github` })(req, res, next);
  },
  (req, res) => {
    const token = generateToken(req.user);
    const webUrl = process.env.WEB_URL || 'http://localhost:5173';
    res.redirect(`${webUrl}/auth/callback?token=${token}`);
  }
);

// Google OAuth
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google login is not configured yet. Please use email/password.' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback',
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.redirect(`${process.env.WEB_URL || 'http://localhost:5173'}/login?error=google_not_configured`);
    }
    passport.authenticate('google', { session: false, failureRedirect: `${process.env.WEB_URL || 'http://localhost:5173'}/login?error=google` })(req, res, next);
  },
  (req, res) => {
    const token = generateToken(req.user);
    const webUrl = process.env.WEB_URL || 'http://localhost:5173';
    res.redirect(`${webUrl}/auth/callback?token=${token}`);
  }
);

// POST /api/auth/logout — Server-side logout (auto-delete ephemeral tokens)
router.post('/logout', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+githubToken');
    if (user) {
      // Auto-delete GitHub token if not permanent
      if (user.githubToken && !user.githubTokenPermanent) {
        user.githubToken = null;
        user.githubTokenSetAt = null;
        await user.save();
      }
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.json({ message: 'Logged out' });
  }
});

module.exports = router;
