const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');
const Repo = require('../models/Repo');
const User = require('../models/User');
const { parseGitHubUrl, getRepoTree, getFileContent, detectPlatform } = require('../services/github');
const { analyzeCode } = require('../services/ai');

const router = express.Router();

// POST /api/scan — Analyze a GitHub repo
router.post('/', auth, async (req, res) => {
  try {
    const { url, engine = 'groq' } = req.body;
    const user = req.user;

    // Check scan limits
    if (user.plan === 'free' && user.scansUsed >= user.scansLimit) {
      return res.status(403).json({
        error: 'Scan limit reached',
        message: 'Upgrade to Starter or Pro for more scans',
        scansUsed: user.scansUsed,
        scansLimit: user.scansLimit,
      });
    }

    // Check engine access
    if (engine === 'opus' && !['gold', 'diamond'].includes(user.plan)) {
      return res.status(403).json({
        error: 'Claude Pro requires Pro plan',
        message: 'Upgrade to Pro ($29/mo) for Claude Pro engine',
      });
    }

    // Parse GitHub URL
    const { owner, repo: repoName } = parseGitHubUrl(url);

    // Create repo record
    const repoDoc = await Repo.create({
      userId: user._id,
      url,
      name: repoName,
      owner,
      engine,
      status: 'scanning',
    });

    // Emit scanning status via Socket.IO
    const io = req.app.get('io');
    io.to(`user-${user._id}`).emit('scan-status', {
      repoId: repoDoc._id,
      status: 'scanning',
      message: 'Fetching repository files...',
    });

    // Fetch repo tree
    const token = user.githubToken || null;
    const tree = await getRepoTree(owner, repoName, 'main', token);

    // Detect platform
    const platform = detectPlatform(tree);
    repoDoc.platform = platform;

    // Fetch file contents (limit to 20 files for speed)
    const filesToAnalyze = tree.slice(0, 20);
    const files = [];

    for (const file of filesToAnalyze) {
      const content = await getFileContent(owner, repoName, file.path, token);
      if (content) {
        files.push({ path: file.path, content });
      }
    }

    io.to(`user-${user._id}`).emit('scan-status', {
      repoId: repoDoc._id,
      status: 'analyzing',
      message: `Analyzing ${files.length} files with AI...`,
    });

    // AI analysis
    const issues = await analyzeCode(files, engine);

    // Process issues
    const processedIssues = issues.map(issue => ({
      id: uuidv4(),
      ...issue,
      status: 'open',
    }));

    // Calculate stats
    const stats = {
      critical: processedIssues.filter(i => i.severity === 'critical').length,
      high: processedIssues.filter(i => i.severity === 'high').length,
      medium: processedIssues.filter(i => i.severity === 'medium').length,
      low: processedIssues.filter(i => i.severity === 'low').length,
      totalFiles: files.length,
      totalLines: files.reduce((sum, f) => sum + f.content.split('\n').length, 0),
    };

    // Update repo
    repoDoc.issues = processedIssues;
    repoDoc.stats = stats;
    repoDoc.status = 'scanned';
    repoDoc.lastScanned = new Date();
    await repoDoc.save();

    // Update user
    user.scansUsed += 1;
    if (!user.repos.includes(repoDoc._id)) {
      user.repos.push(repoDoc._id);
    }
    await user.save();

    // Emit completion
    io.to(`user-${user._id}`).emit('scan-complete', {
      repoId: repoDoc._id,
      repo: repoDoc,
    });

    res.json({
      repo: repoDoc,
      message: `Found ${processedIssues.length} issues in ${repoName}`,
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Scan failed', details: err.message });
  }
});

// GET /api/scan/repos — Get user's scanned repos
router.get('/repos', auth, async (req, res) => {
  try {
    const repos = await Repo.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json({ repos });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch repos' });
  }
});

// GET /api/scan/:repoId — Get repo details
router.get('/:repoId', auth, async (req, res) => {
  try {
    const repo = await Repo.findOne({ _id: req.params.repoId, userId: req.userId });
    if (!repo) return res.status(404).json({ error: 'Repo not found' });
    res.json({ repo });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch repo' });
  }
});

module.exports = router;
