const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Block banned/suspended users on every request
    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Account banned', reason: user.banReason });
    }
    if (user.status === 'suspended' && user.suspendedUntil && user.suspendedUntil > new Date()) {
      return res.status(403).json({ error: 'Account suspended', until: user.suspendedUntil });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
      req.user = await User.findById(decoded.userId);
      req.userId = req.user?._id;
    }
  } catch (err) {
    // Not authenticated, continue anyway
  }
  next();
};

const requirePlan = (...plans) => {
  return (req, res, next) => {
    if (!plans.includes(req.user.plan)) {
      return res.status(403).json({
        error: 'Upgrade required',
        message: `This feature requires one of: ${plans.join(', ')}`,
        currentPlan: req.user.plan,
      });
    }
    next();
  };
};

module.exports = { auth, optionalAuth, requirePlan };
