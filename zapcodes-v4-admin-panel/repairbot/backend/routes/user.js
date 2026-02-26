const express = require('express');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const Repo = require('../models/Repo');

const router = express.Router();

// GET /api/user/stats — Dashboard stats
router.get('/stats', auth, async (req, res) => {
  try {
    const repos = await Repo.find({ userId: req.userId });
    const totalIssues = repos.reduce((sum, r) => sum + r.issues.length, 0);
    const fixedIssues = repos.reduce(
      (sum, r) => sum + r.issues.filter(i => i.status === 'fixed').length, 0
    );
    const criticalBugs = repos.reduce((sum, r) => sum + (r.stats?.critical || 0), 0);

    res.json({
      stats: {
        totalRepos: repos.length,
        totalIssues,
        fixedIssues,
        criticalBugs,
        scansUsed: req.user.scansUsed,
        scansLimit: req.user.scansLimit,
        plan: req.user.plan,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// PUT /api/user/profile — Update profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.userId);

    if (name) user.name = name;
    if (email) user.email = email;
    await user.save();

    res.json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT /api/user/github-token — Store GitHub token
router.put('/github-token', auth, async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.userId);
    user.githubToken = token;
    await user.save();
    res.json({ message: 'GitHub token saved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save token' });
  }
});

module.exports = router;
