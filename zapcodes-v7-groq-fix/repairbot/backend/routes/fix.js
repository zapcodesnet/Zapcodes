const express = require('express');
const { auth } = require('../middleware/auth');
const Repo = require('../models/Repo');
const User = require('../models/User');
const { parseGitHubUrl, createPullRequest } = require('../services/github');

const router = express.Router();

// POST /api/fix — Apply a fix via Moltbot (creates GitHub PR)
router.post('/', auth, async (req, res) => {
  try {
    const { repoId, issueId } = req.body;
    const user = await User.findById(req.userId).select('+githubToken');

    if (!user.githubToken) {
      return res.status(400).json({
        error: 'GitHub token required',
        message: 'Connect your GitHub account to apply fixes. Go to Settings > Connect GitHub.',
      });
    }

    const repo = await Repo.findOne({ _id: repoId, userId: req.userId });
    if (!repo) return res.status(404).json({ error: 'Repo not found' });

    const issue = repo.issues.find(i => i.id === issueId);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    // Check fix limits
    const fixLimits = { free: 3, starter: 20, pro: Infinity };
    if (user.fixesApplied >= (fixLimits[user.plan] || 3)) {
      return res.status(403).json({
        error: 'Fix limit reached',
        message: 'Upgrade your plan for more fixes',
      });
    }

    const io = req.app.get('io');
    io.to(`user-${user._id}`).emit('fix-status', {
      repoId, issueId, status: 'applying', message: 'Moltbot is creating your fix...',
    });

    // Update issue status
    issue.status = 'fixing';
    await repo.save();

    // Create GitHub PR
    const { owner, repo: repoName } = parseGitHubUrl(repo.url);

    try {
      const pr = await createPullRequest(owner, repoName, user.githubToken, {
        branch: `fix-${issue.type}-${Date.now()}`,
        title: issue.title,
        body: `### Issue\n${issue.description}\n\n### Impact\n${issue.impact}\n\n### Fix Applied\n${issue.explanation}\n\n### File\n\`${issue.file}\` (line ${issue.line})`,
        files: [{
          path: issue.file,
          content: issue.fixedCode || issue.code,
        }],
      });

      issue.status = 'fixed';
      issue.prUrl = pr.html_url;
      await repo.save();

      user.fixesApplied += 1;
      await user.save();

      io.to(`user-${user._id}`).emit('fix-complete', {
        repoId, issueId, prUrl: pr.html_url,
      });

      res.json({
        message: 'Fix applied! PR created.',
        prUrl: pr.html_url,
        prNumber: pr.number,
      });
    } catch (prErr) {
      issue.status = 'open';
      await repo.save();

      io.to(`user-${user._id}`).emit('fix-error', {
        repoId, issueId, error: prErr.message,
      });

      res.status(500).json({
        error: 'Failed to create PR',
        details: prErr.response?.data?.message || prErr.message,
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Fix failed', details: err.message });
  }
});

// POST /api/fix/dismiss — Dismiss an issue
router.post('/dismiss', auth, async (req, res) => {
  try {
    const { repoId, issueId } = req.body;
    const repo = await Repo.findOne({ _id: repoId, userId: req.userId });
    if (!repo) return res.status(404).json({ error: 'Repo not found' });

    const issue = repo.issues.find(i => i.id === issueId);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    issue.status = 'dismissed';
    await repo.save();

    res.json({ message: 'Issue dismissed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to dismiss issue' });
  }
});

module.exports = router;
