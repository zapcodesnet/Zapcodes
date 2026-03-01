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
    const totalIssues = repos.reduce((sum, r) => sum + r.issues.length, 0);
    const fixedIssues = repos.reduce((sum, r) => sum + r.issues.filter(i => i.status === 'fixed').length, 0);
    const criticalBugs = repos.reduce((sum, r) => sum + (r.stats?.critical || 0), 0);

    // Get proper limits from tier
    const tierLimits = req.user.getTierLimits();

    res.json({
      stats: {
        totalRepos: repos.length, totalIssues, fixedIssues, criticalBugs,
        scansUsed: req.user.scansUsed, scansLimit: tierLimits.scans,
        buildsUsed: req.user.buildsUsed, buildsLimit: tierLimits.builds,
        generationsUsed: req.user.generationsUsed || 0, generationsLimit: tierLimits.generations,
        fixesApplied: req.user.fixesApplied || 0, fixesLimit: tierLimits.fixes,
        githubPushes: req.user.githubPushes || 0, pushesLimit: tierLimits.pushes,
        plan: req.user.plan,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// PUT /api/user/profile
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

// =============================================
// GITHUB TOKEN MANAGEMENT
// =============================================

// GET /api/user/github-token/status
router.get('/github-token/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+githubToken');
    res.json({
      connected: !!user.githubToken,
      permanent: user.githubTokenPermanent || false,
      setAt: user.githubTokenSetAt || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check token status' });
  }
});

// POST /api/user/github-token/test — Test GitHub connection
router.post('/github-token/test', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+githubToken');
    if (!user?.githubToken) return res.status(400).json({ error: 'No GitHub token saved' });

    const axios = require('axios');
    const { data } = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${user.githubToken}` },
      timeout: 10000,
    });

    // Get repos count
    const reposRes = await axios.get('https://api.github.com/user/repos?per_page=1', {
      headers: { Authorization: `token ${user.githubToken}` },
    });

    res.json({
      valid: true,
      username: data.login,
      name: data.name,
      avatar: data.avatar_url,
      publicRepos: data.public_repos,
      scopes: 'Token is valid and working',
    });
  } catch (err) {
    if (err.response?.status === 401) {
      return res.json({ valid: false, error: 'Token is invalid or expired. Please generate a new one.' });
    }
    res.json({ valid: false, error: 'Could not connect to GitHub: ' + err.message });
  }
});

// PUT /api/user/github-token — Save token
router.put('/github-token', auth, async (req, res) => {
  try {
    const { token, keepPermanent } = req.body;
    if (!token || !token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      return res.status(400).json({ error: 'Invalid GitHub token format. Must start with ghp_ or github_pat_' });
    }

    const user = await User.findById(req.userId);
    user.githubToken = token;
    user.githubTokenPermanent = !!keepPermanent;
    user.githubTokenSetAt = new Date();
    await user.save();

    // Notify via Socket.IO
    const io = req.app.get('io');
    if (io) io.to(`user-${user._id}`).emit('github-token-updated', { connected: true });

    res.json({ message: 'GitHub token saved', connected: true, permanent: !!keepPermanent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save token' });
  }
});

// DELETE /api/user/github-token — Delete token
router.delete('/github-token', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    user.githubToken = null;
    user.githubTokenPermanent = false;
    user.githubTokenSetAt = null;
    await user.save();

    const io = req.app.get('io');
    if (io) io.to(`user-${user._id}`).emit('github-token-updated', { connected: false });

    res.json({ message: 'GitHub token removed', connected: false });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove token' });
  }
});

// =============================================
// CHAT HISTORY (Build iterations)
// =============================================

// GET /api/user/chats — List all chats for user
router.get('/chats', auth, async (req, res) => {
  try {
    const chats = await ChatHistory.find({ user: req.userId })
      .select('projectId projectName template buildCount status updatedAt')
      .sort({ updatedAt: -1 }).limit(50);
    res.json({ chats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load chats' });
  }
});

// GET /api/user/chats/:projectId — Get full chat history
router.get('/chats/:projectId', auth, async (req, res) => {
  try {
    let chat = await ChatHistory.findOne({ user: req.userId, projectId: req.params.projectId, status: 'active' });
    if (!chat) return res.json({ chat: null });
    res.json({ chat });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load chat' });
  }
});

// POST /api/user/chats/:projectId/message — Send message (counts as build)
router.post('/chats/:projectId/message', auth, async (req, res) => {
  try {
    const { content, projectName, template } = req.body;
    if (!content) return res.status(400).json({ error: 'Message required' });

    const user = await User.findById(req.userId);
    const plan = user.plan || 'free';
    const limits = { free: 3, starter: 25, pro: 99999, diamond: 99999 };
    const limit = limits[plan] || 3;

    if (user.buildsUsed >= limit) {
      return res.status(403).json({
        error: 'Build limit reached',
        message: `Your ${plan} plan allows ${limit} builds/month. Upgrade for more.`,
        buildsUsed: user.buildsUsed, buildsLimit: limit,
      });
    }

    // Estimate tokens (~4 chars per token)
    const tokenEstimate = Math.ceil(content.length / 4);

    // Find or create chat
    let chat = await ChatHistory.findOne({ user: req.userId, projectId: req.params.projectId, status: 'active' });
    if (!chat) {
      chat = await ChatHistory.create({
        user: req.userId, projectId: req.params.projectId,
        projectName: projectName || 'Untitled', template: template || 'custom',
        messages: [{ role: 'system', content: CHAT_INSTRUCTIONS, tokenEstimate: 500 }],
      });
    }

    // Check context size
    const totalContext = chat.totalTokens + tokenEstimate;
    const MAX_TOKENS = 200000;
    const WARNING_THRESHOLD = MAX_TOKENS * 0.8;

    // Add user message
    chat.messages.push({ role: 'user', content, tokenEstimate });
    chat.totalTokens = totalContext;
    chat.buildCount += 1;

    // Increment user's build counter
    user.buildsUsed += 1;
    await user.save();

    // Generate AI response (simplified — in production use Groq/Claude)
    const aiResponse = `I've received your request to improve the project. Here's what I'll implement:\n\n${content.slice(0, 100)}...\n\n✅ Changes applied. Builds used: ${user.buildsUsed}/${limit}`;
    const aiTokens = Math.ceil(aiResponse.length / 4);

    chat.messages.push({ role: 'assistant', content: aiResponse, tokenEstimate: aiTokens });
    chat.totalTokens += aiTokens;
    await chat.save();

    // Sync via Socket.IO
    const io = req.app.get('io');
    if (io) io.to(`user-${user._id}`).emit('build-count-updated', { buildsUsed: user.buildsUsed, buildsLimit: limit });

    res.json({
      message: aiResponse,
      buildsUsed: user.buildsUsed,
      buildsLimit: limit,
      totalTokens: chat.totalTokens,
      contextWarning: totalContext > WARNING_THRESHOLD,
      contextFull: totalContext > MAX_TOKENS * 0.95,
    });
  } catch (err) {
    res.status(500).json({ error: 'Message failed', details: err.message });
  }
});

// POST /api/user/chats/:projectId/fork — Fork to new chat
router.post('/chats/:projectId/fork', auth, async (req, res) => {
  try {
    const oldChat = await ChatHistory.findOne({ user: req.userId, projectId: req.params.projectId, status: 'active' });
    if (!oldChat) return res.status(404).json({ error: 'Chat not found' });

    // Condense summary
    const lastMessages = oldChat.messages.slice(-10);
    const summary = `Previous build: ${oldChat.projectName}. ${oldChat.buildCount} iterations. Key features from last messages: ${lastMessages.filter(m => m.role === 'assistant').map(m => m.content.slice(0, 100)).join('; ')}`;

    // Mark old chat as forked
    oldChat.status = 'forked';
    await oldChat.save();

    // Create new chat with summary
    const newProjectId = req.params.projectId + '-fork-' + Date.now();
    const newChat = await ChatHistory.create({
      user: req.userId, projectId: newProjectId,
      projectName: oldChat.projectName + ' (continued)', template: oldChat.template,
      forkedFrom: oldChat._id, summary,
      messages: [
        { role: 'system', content: CHAT_INSTRUCTIONS },
        { role: 'system', content: `Continuing from previous conversation:\n${summary}` },
      ],
      totalTokens: 1000,
    });

    res.json({ chat: newChat, message: 'Chat forked with context preserved' });
  } catch (err) {
    res.status(500).json({ error: 'Fork failed' });
  }
});

const CHAT_INSTRUCTIONS = `Welcome to ZapCodes Build Chat! 🏗️

This chat is for follow-up prompts only: improve features, fix bugs, add functionality to your current website/mobile app build.

📌 Rules:
• Each message (short or long) counts as 1 build toward your monthly limit.
• Max context: ~200,000 tokens (~150,000 words) per conversation.
• If context gets too large, you'll see a warning — use "fork new chat" to continue with a summary.
• For general questions → use ZapCodes Help instead.

💡 Tip: Reply "fork new chat" to start fresh while keeping your build history.`;

module.exports = router;
