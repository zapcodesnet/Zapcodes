const express = require('express');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const Repo = require('../models/Repo');
const ChatHistory = require('../models/ChatHistory');

const router = express.Router();

// GET /api/user/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const repos = await Repo.find({ userId: req.userId });
    const totalScans = repos.reduce((sum, r) => sum + (r.scanResults?.length || 0), 0);
    const totalFixes = repos.reduce((sum, r) => sum + (r.fixesApplied || 0), 0);
    const user = await User.findById(req.userId);

    res.json({
      repos: repos.length,
      scans: totalScans,
      fixes: totalFixes,
      builds: user?.buildsUsed || 0,
      plan: user?.plan || 'free',
      buildsLimit: user?.buildsLimit || 3,
      scansLimit: user?.scansLimit || 5,
      scansUsed: user?.scansUsed || 0,
      buildsUsed: user?.buildsUsed || 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /api/user/profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.toSafeObject());
  } catch (err) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// PUT /api/user/profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, deployPlatform, preferredAI } = req.body;
    const update = {};
    if (name) update.name = name;
    if (deployPlatform) update.deployPlatform = deployPlatform;
    if (preferredAI) update.preferredAI = preferredAI;

    const user = await User.findByIdAndUpdate(req.userId, update, { new: true });
    res.json(user.toSafeObject());
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ===== GITHUB TOKEN MANAGEMENT =====

// GET /api/user/github-token/status — Check if user has a GitHub token saved
router.get('/github-token/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+githubToken');
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      connected: !!user.githubToken,
      permanent: user.githubTokenPermanent || false,
      setAt: user.githubTokenSetAt || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check token status' });
  }
});

// PUT /api/user/github-token — Save GitHub token
router.put('/github-token', auth, async (req, res) => {
  try {
    const { token, keepPermanent } = req.body;
    if (!token || !token.trim()) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Basic validation: GitHub tokens start with ghp_ or github_pat_
    const trimmed = token.trim();
    if (!trimmed.startsWith('ghp_') && !trimmed.startsWith('github_pat_')) {
      return res.status(400).json({ error: 'Invalid token format. GitHub tokens start with ghp_ or github_pat_' });
    }

    await User.findByIdAndUpdate(req.userId, {
      githubToken: trimmed,
      githubTokenPermanent: !!keepPermanent,
      githubTokenSetAt: new Date(),
    });

    res.json({ success: true, message: 'GitHub token saved successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save token' });
  }
});

// DELETE /api/user/github-token — Remove GitHub token
router.delete('/github-token', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      $unset: { githubToken: 1, githubTokenSetAt: 1 },
      githubTokenPermanent: false,
    });

    res.json({ success: true, message: 'GitHub token removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove token' });
  }
});

// POST /api/user/github-token/test — Test GitHub token connection
router.post('/github-token/test', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+githubToken');
    if (!user || !user.githubToken) {
      return res.status(400).json({ valid: false, error: 'No GitHub token saved' });
    }

    const axios = require('axios');
    const { data } = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `token ${user.githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    res.json({
      valid: true,
      username: data.login,
      name: data.name,
      publicRepos: data.public_repos,
      avatarUrl: data.avatar_url,
    });
  } catch (err) {
    const status = err.response?.status;
    let error = 'Connection test failed';
    if (status === 401) error = 'Token is invalid or expired';
    else if (status === 403) error = 'Token lacks required permissions';
    res.json({ valid: false, error });
  }
});

// ===== CHAT HISTORY =====

// GET /api/user/chats
router.get('/chats', auth, async (req, res) => {
  try {
    const chats = await ChatHistory.find({ userId: req.userId })
      .sort({ updatedAt: -1 })
      .limit(50)
      .select('title repoId createdAt updatedAt messageCount');
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get chats' });
  }
});

// GET /api/user/chats/:id
router.get('/chats/:id', auth, async (req, res) => {
  try {
    const chat = await ChatHistory.findOne({ _id: req.params.id, userId: req.userId });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get chat' });
  }
});

// DELETE /api/user/chats/:id
router.delete('/chats/:id', auth, async (req, res) => {
  try {
    await ChatHistory.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

// ===== ACCOUNT MANAGEMENT =====

// DELETE /api/user/account — Delete account
router.delete('/account', auth, async (req, res) => {
  try {
    await Repo.deleteMany({ userId: req.userId });
    await ChatHistory.deleteMany({ userId: req.userId });
    await User.findByIdAndDelete(req.userId);
    res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;