const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { generateTutorial } = require('../services/ai');

const router = express.Router();

// POST /api/tutorial — Generate AI tutorial
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const response = await generateTutorial(question);
    res.json({ response, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Tutorial generation failed', details: err.message });
  }
});

// GET /api/tutorial/topics — Get suggested tutorial topics
router.get('/topics', (req, res) => {
  res.json({
    topics: [
      { id: 'getting-started', title: 'Getting Started with ZapCodes', question: 'How do I get started with ZapCodes?' },
      { id: 'scan-repo', title: 'How to Scan a Repository', question: 'How to scan a GitHub repo?' },
      { id: 'zapcodes-ai', title: 'What is ZapCodes AI?', question: 'What does ZapCodes AI do and how does it work?' },
      { id: 'apply-fix', title: 'Applying Fixes', question: 'How to apply a fix to my code?' },
      { id: 'engines', title: 'AI Engines Explained', question: 'What is the difference between Groq AI and Claude Haiku/Opus?' },
      { id: 'platforms', title: 'Supported Platforms', question: 'What platforms does ZapCodes support?' },
      { id: 'pricing', title: 'Plans & Pricing', question: 'What are the pricing plans?' },
      { id: 'github-connect', title: 'Connecting GitHub', question: 'How to connect my GitHub account?' },
    ],
  });
});

module.exports = router;
