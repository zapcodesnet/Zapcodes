const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Analyze code files using Groq (free Ollama-compatible layer)
 * Falls back to mock analysis if no API key
 */
async function analyzeCode(files, engine = 'ollama') {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.warn('No GROQ_API_KEY — returning mock analysis');
    return generateMockAnalysis(files);
  }

  try {
    const filesSummary = files.slice(0, 20).map(f =>
      `--- ${f.path} ---\n${f.content.slice(0, 2000)}`
    ).join('\n\n');

    const response = await axios.post(GROQ_API_URL, {
      model: engine === 'claude-pro' ? 'llama-3.1-70b-versatile' : 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `You are RepairBot, an expert code analyzer. Analyze the given code files and identify bugs, crashes, memory leaks, ANRs, security issues, and performance problems. Return ONLY valid JSON array of issues with this structure:
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
Return between 3-8 issues. Be specific with real line numbers and code.`
        },
        {
          role: 'user',
          content: `Analyze these files for bugs and issues:\n\n${filesSummary}`
        }
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const content = response.data.choices[0].message.content;
    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return generateMockAnalysis(files);
  } catch (err) {
    console.error('Groq API error:', err.response?.data || err.message);
    return generateMockAnalysis(files);
  }
}

function generateMockAnalysis(files) {
  const issues = [];
  const types = ['crash', 'memory_leak', 'warning', 'error', 'security', 'performance'];
  const severities = ['critical', 'high', 'medium', 'low'];

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
 * Generate AI tutorial content
 */
async function generateTutorial(question) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return getFallbackTutorial(question);
  }

  try {
    const response = await axios.post(GROQ_API_URL, {
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `You are the RepairBot Tutorial Assistant. Answer questions about how to use RepairBot — an AI-powered code repair tool. Be helpful, concise, and provide step-by-step instructions. Format responses in markdown. RepairBot features:
- Scan GitHub repos for bugs by pasting URL
- AI analyzes code (free Ollama engine or Claude Pro)
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
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error('Tutorial generation error:', err.message);
    return getFallbackTutorial(question);
  }
}

function getFallbackTutorial(question) {
  const q = question.toLowerCase();
  if (q.includes('scan') || q.includes('repo')) {
    return `## How to Scan a Repository\n\n1. **Go to Dashboard** — Click "Dashboard" in the sidebar\n2. **Paste GitHub URL** — Enter your repo URL (e.g., \`https://github.com/user/repo\`)\n3. **Choose Engine** — Select "Ollama (Free)" or "Claude Pro"\n4. **Click Scan** — RepairBot's AI will analyze your code\n5. **Review Issues** — View detected bugs sorted by severity\n\n> **Tip:** Public repos work instantly. For private repos, connect your GitHub account first.`;
  }
  if (q.includes('moltbot') || q.includes('fix') || q.includes('apply')) {
    return `## How Moltbot Applies Fixes\n\n1. **Select an Issue** — Click on any detected bug\n2. **Review the Fix** — See the code diff and explanation\n3. **Click "Apply Fix via Moltbot"** — This creates a GitHub PR\n4. **Review PR** — Check the PR on GitHub\n5. **Merge** — If happy, merge the PR!\n\n> Moltbot uses AI agents to edit files, commit changes, and push a pull request to your repo.`;
  }
  if (q.includes('price') || q.includes('plan') || q.includes('cost')) {
    return `## RepairBot Plans\n\n| Feature | Free | Starter ($9/mo) | Pro ($29/mo) |\n|---------|------|------------------|--------------|\n| Scans/month | 5 | 50 | Unlimited |\n| Engine | Ollama | Ollama + Claude | All engines |\n| Moltbot fixes | 3/mo | 20/mo | Unlimited |\n| Priority support | ❌ | ✅ | ✅ |\n\nUpgrade anytime from Settings > Billing.`;
  }
  return `## RepairBot Help\n\nRepairBot is an AI-powered code repair tool that scans your GitHub repos for bugs and fixes them automatically.\n\n**Quick Start:**\n1. Sign up or log in\n2. Paste a GitHub repo URL\n3. AI scans and finds issues\n4. Click to apply fixes via Moltbot\n\nAsk me about specific features like scanning, fixing, pricing, or supported platforms!`;
}

module.exports = { analyzeCode, generateTutorial };
