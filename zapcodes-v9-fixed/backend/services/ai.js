const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Analyze code files using selected AI engine
 * - 'ollama' → Groq (free Ollama-compatible layer)
 * - 'claude' → Anthropic Claude Opus 4.6
 * Falls back to mock analysis if no API key
 */
async function analyzeCode(files, engine = 'ollama') {
  if (engine === 'claude') {
    return analyzeWithClaude(files);
  }
  return analyzeWithGroq(files, engine);
}

/**
 * Analyze code using Claude Opus 4.6 via Anthropic API
 */
async function analyzeWithClaude(files) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('No ANTHROPIC_API_KEY — falling back to Groq');
    return analyzeWithGroq(files, 'ollama');
  }

  const filesSummary = files.slice(0, 20).map(f =>
    `--- ${f.path} ---\n${f.content.slice(0, 3000)}`
  ).join('\n\n');

  const systemContent = `You are ZapCodes, an expert code analyzer powered by Claude Opus 4.6. Analyze the given code files and identify bugs, crashes, memory leaks, ANRs, security issues, and performance problems. Return ONLY valid JSON array of issues with this structure:
[{
  "type": "crash|memory_leak|anr|warning|error|security|performance",
  "severity": "critical|high|medium|low",
  "title": "Brief issue title",
  "description": "Detailed explanation",
  "file": "file path",
  "line": line_number,
  "code": "problematic code snippet",
  "fixedCode": "corrected code snippet",
  "explanation": "Why this fix works",
  "impact": "What happens if unfixed",
  "logs": "Expected error log output"
}]
Return between 3-8 issues. Be specific with real line numbers and code.`;

  try {
    console.log('[AI] Using Claude Opus 4.6');
    const response = await axios.post(ANTHROPIC_API_URL, {
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: systemContent,
      messages: [
        { role: 'user', content: `Analyze these files for bugs and issues:\n\n${filesSummary}` }
      ],
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });

    const content = response.data.content?.[0]?.text || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      console.log('[AI] Claude analysis successful');
      return JSON.parse(jsonMatch[0]);
    }
    console.warn('[AI] Claude returned non-JSON response');
    return generateMockAnalysis(files);
  } catch (err) {
    console.error(`[AI] Claude failed: ${err.response?.data?.error?.message || err.message}`);
    // Fallback to Groq
    return analyzeWithGroq(files, 'ollama');
  }
}

/**
 * Analyze code using Groq (Ollama-compatible)
 */
async function analyzeWithGroq(files, engine = 'ollama') {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.warn('No GROQ_API_KEY — returning mock analysis');
    return generateMockAnalysis(files);
  }

  const filesSummary = files.slice(0, 20).map(f =>
    `--- ${f.path} ---\n${f.content.slice(0, 2000)}`
  ).join('\n\n');

  const systemContent = `You are ZapCodes, an expert code analyzer. Analyze the given code files and identify bugs, crashes, memory leaks, ANRs, security issues, and performance problems. Return ONLY valid JSON array of issues with this structure:
[{
  "type": "crash|memory_leak|anr|warning|error|security|performance",
  "severity": "critical|high|medium|low",
  "title": "Brief issue title",
  "description": "Detailed explanation",
  "file": "file path",
  "line": line_number,
  "code": "problematic code snippet",
  "fixedCode": "corrected code snippet",
  "explanation": "Why this fix works",
  "impact": "What happens if unfixed",
  "logs": "Expected error log output"
}]
Return between 3-8 issues. Be specific with real line numbers and code.`;

  // Try multiple models (Groq deprecates frequently)
  const models = engine === 'claude-pro'
    ? ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'mixtral-8x7b-32768']
    : ['llama-3.1-8b-instant', 'gemma2-9b-it', 'mixtral-8x7b-32768'];

  for (const model of models) {
    try {
      console.log(`[AI] Trying model: ${model}`);
      const response = await axios.post(GROQ_API_URL, {
        model,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: `Analyze these files for bugs and issues:\n\n${filesSummary}` }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        console.log(`[AI] Success with model: ${model}`);
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      const status = err.response?.status;
      console.error(`[AI] Model ${model} failed (${status}): ${err.response?.data?.error?.message || err.message}`);
      if (status === 401 || status === 429) break;
    }
  }

  console.warn('[AI] All models failed — returning mock');
  return generateMockAnalysis(files);
}

function generateMockAnalysis(files) {
  const issues = [];

  const templates = [
    {
      type: 'crash', severity: 'critical',
      title: 'Null Pointer Exception in async handler',
      description: 'Unhandled null reference when API response is empty',
      explanation: 'Added null check before accessing response data',
      impact: 'App crashes when server returns empty response',
    },
    {
      type: 'memory_leak', severity: 'high',
      title: 'Event listener not cleaned up',
      description: 'addEventListener called without corresponding removeEventListener in cleanup',
      explanation: 'Added cleanup function to remove listener on unmount',
      impact: 'Memory usage grows over time, eventually causing OOM crash',
    },
    {
      type: 'security', severity: 'critical',
      title: 'SQL Injection vulnerability',
      description: 'User input directly interpolated into database query string',
      explanation: 'Use parameterized queries to prevent injection',
      impact: 'Attacker can read/modify/delete database contents',
    },
    {
      type: 'performance', severity: 'medium',
      title: 'Unnecessary re-renders in list component',
      description: 'Component re-renders entire list on every state change',
      explanation: 'Wrap component with React.memo and use useCallback for handlers',
      impact: 'UI jank and slow scrolling with large datasets',
    },
    {
      type: 'error', severity: 'high',
      title: 'Unhandled Promise rejection',
      description: 'Async function missing try/catch block',
      explanation: 'Added error handling with user-friendly error message',
      impact: 'Silent failures that are hard to debug in production',
    },
    {
      type: 'warning', severity: 'low',
      title: 'Deprecated API usage',
      description: 'Using componentWillMount which is deprecated',
      explanation: 'Migrate to useEffect hook or componentDidMount',
      impact: 'Will break in future React versions',
    },
  ];

  const usedFiles = files.slice(0, 6);
  templates.slice(0, Math.min(usedFiles.length, 5)).forEach((template, i) => {
    const file = usedFiles[i] || usedFiles[0];
    issues.push({
      ...template,
      file: file.path,
      line: Math.floor(Math.random() * 100) + 1,
      code: file.content.split('\n').slice(0, 5).join('\n'),
      fixedCode: '// Fixed version\n' + file.content.split('\n').slice(0, 5).join('\n'),
      logs: `Error at ${file.path}:${Math.floor(Math.random() * 100) + 1}`,
    });
  });

  return issues;
}

/**
 * Call Claude Opus 4.6 for general prompts (file analysis, generation, etc.)
 */
async function callClaude(systemPrompt, userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    console.log('[Claude] Calling Claude Opus 4.6');
    const response = await axios.post(ANTHROPIC_API_URL, {
      model: 'claude-opus-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt.slice(0, 100000) }
      ],
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });

    const content = response.data.content?.[0]?.text || '';
    if (content) {
      console.log('[Claude] Success');
      return content;
    }
  } catch (err) {
    console.error(`[Claude] Failed: ${err.response?.data?.error?.message || err.message}`);
  }
  return null;
}

/**
 * Call Claude with image support for image-based issue reporting
 */
async function callClaudeWithImages(systemPrompt, userPrompt, images = []) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    console.log(`[Claude] Calling with ${images.length} image(s)`);

    const contentBlocks = [];
    for (const img of images) {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType || 'image/png',
          data: img.base64,
        },
      });
    }
    contentBlocks.push({ type: 'text', text: userPrompt });

    const response = await axios.post(ANTHROPIC_API_URL, {
      model: 'claude-opus-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: 'user', content: contentBlocks }
      ],
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });

    return response.data.content?.[0]?.text || null;
  } catch (err) {
    console.error(`[Claude+Image] Failed: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
}

/**
 * Generate AI tutorial content
 */
async function generateTutorial(question) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return getFallbackTutorial(question);
  }

  try {
    const models = ['llama-3.1-8b-instant', 'gemma2-9b-it', 'mixtral-8x7b-32768'];
    for (const model of models) {
      try {
        const response = await axios.post(GROQ_API_URL, {
          model,
          messages: [
            {
              role: 'system',
              content: `You are the ZapCodes Tutorial Assistant. Answer questions about how to use ZapCodes — an AI-powered code repair tool. Be helpful, concise, and provide step-by-step instructions. Format responses in markdown. ZapCodes features:
- Scan GitHub repos for bugs by pasting URL
- Upload files for AI analysis on the Build page
- AI analyzes code (free Ollama engine or Claude Opus 4.6)
- Moltbot applies fixes via GitHub PRs
- Supports React Native, Flutter, Swift/iOS, Kotlin/Android, Java/Android, Web Apps
- Dashboard shows issues, stats, severity levels
- Free tier: 5 scans/month, Starter: $9/mo, Pro: $29/mo`
            },
            { role: 'user', content: question }
          ],
          temperature: 0.7,
          max_tokens: 1500,
        }, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 15000,
        });
        return response.data.choices[0].message.content;
      } catch (err) {
        console.error(`[Tutorial] Model ${model} failed:`, err.response?.data?.error?.message || err.message);
        if (err.response?.status === 401) break;
      }
    }
    return getFallbackTutorial(question);
  } catch (err) {
    console.error('Tutorial generation error:', err.message);
    return getFallbackTutorial(question);
  }
}

function getFallbackTutorial(question) {
  const q = question.toLowerCase();
  if (q.includes('scan') || q.includes('repo')) {
    return `## How to Scan a Repository\n\n1. **Go to Dashboard** — Click "Dashboard" in the sidebar\n2. **Paste GitHub URL** — Enter your repo URL (e.g., \`https://github.com/user/repo\`)\n3. **Choose Engine** — Select "Ollama (Free)" or "Claude Opus 4.6"\n4. **Click Scan** — ZapCodes's AI will analyze your code\n5. **Review Issues** — View detected bugs sorted by severity\n\n> **Tip:** Public repos work instantly. For private repos, connect your GitHub account first.`;
  }
  if (q.includes('moltbot') || q.includes('fix') || q.includes('apply')) {
    return `## How Moltbot Applies Fixes\n\n1. **Select an Issue** — Click on any detected bug\n2. **Review the Fix** — See the code diff and explanation\n3. **Click "Apply Fix via Moltbot"** — This creates a GitHub PR\n4. **Review PR** — Check the PR on GitHub\n5. **Merge** — If happy, merge the PR!\n\n> Moltbot uses AI agents to edit files, commit changes, and push a pull request to your repo.`;
  }
  if (q.includes('price') || q.includes('plan') || q.includes('cost')) {
    return `## ZapCodes Plans\n\n| Feature | Free | Starter ($9/mo) | Pro ($29/mo) |\n|---------|------|------------------|--------------|\n| Scans/month | 5 | 50 | Unlimited |\n| Engine | Ollama | Ollama + Claude | All engines |\n| Moltbot fixes | 3/mo | 20/mo | Unlimited |\n| Priority support | ❌ | ✅ | ✅ |\n\nUpgrade anytime from Settings > Billing.`;
  }
  return `## ZapCodes Help\n\nZapCodes is an AI-powered code repair tool that scans your GitHub repos for bugs and fixes them automatically.\n\n**Quick Start:**\n1. Sign up or log in\n2. Paste a GitHub repo URL\n3. AI scans and finds issues\n4. Click to apply fixes via Moltbot\n\nAsk me about specific features like scanning, fixing, pricing, or supported platforms!`;
}

module.exports = { analyzeCode, generateTutorial, callClaude, callClaudeWithImages };
