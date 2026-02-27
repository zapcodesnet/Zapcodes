const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = '/tmp/zapcodes-uploads';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.js', '.jsx', '.ts', '.tsx', '.py', '.html', '.css', '.json', '.md', '.txt', '.zip', '.java', '.rb', '.go', '.php', '.vue', '.svelte'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed') {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported`));
    }
  },
});

// POST /api/files/upload — Upload files for analysis
router.post('/upload', optionalAuth, upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const processedFiles = [];

    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();

      if (ext === '.zip') {
        // Unzip and read contents
        try {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(file.path);
          const entries = zip.getEntries();
          for (const entry of entries) {
            if (!entry.isDirectory && entry.entryName.length < 200) {
              const content = entry.getData().toString('utf8');
              if (content.length < 500000) { // Skip huge files
                processedFiles.push({
                  name: entry.entryName,
                  content: content,
                  size: content.length,
                  language: detectLanguage(entry.entryName),
                });
              }
            }
          }
        } catch (e) {
          // If adm-zip not available, treat as regular file
          processedFiles.push({
            name: file.originalname,
            content: '(ZIP file — install adm-zip to auto-extract)',
            size: file.size,
            language: 'zip',
          });
        }
      } else {
        const content = fs.readFileSync(file.path, 'utf8');
        processedFiles.push({
          name: file.originalname,
          content: content,
          size: content.length,
          language: detectLanguage(file.originalname),
        });
      }

      // Cleanup uploaded file
      fs.unlink(file.path, () => {});
    }

    res.json({
      files: processedFiles,
      totalFiles: processedFiles.length,
      message: `${processedFiles.length} file(s) processed successfully`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// POST /api/files/analyze — AI analysis of uploaded file content
router.post('/analyze', optionalAuth, async (req, res) => {
  try {
    const { files, prompt, mode } = req.body; // mode: 'scan' | 'build' | 'improve'
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files to analyze' });

    // Build context from files
    const fileContext = files.map(f => `--- ${f.name} (${f.language}) ---\n${f.content}`).join('\n\n');
    const tokenEstimate = Math.ceil(fileContext.length / 4);

    // Build AI prompt based on mode
    let systemPrompt, userPrompt;

    if (mode === 'scan') {
      systemPrompt = `You are Moltbot, ZapCodes' AI code analyzer. Analyze the code files provided and return a JSON array of issues found. Each issue should have: { "id": number, "severity": "critical"|"high"|"medium"|"low", "type": "bug"|"security"|"performance"|"style"|"best-practice", "file": "filename", "line": number_or_null, "title": "short title", "description": "detailed explanation", "fix": "suggested code fix or approach", "fixCode": "actual fixed code snippet if applicable" }. Be thorough — check for bugs, security vulnerabilities, performance issues, missing error handling, deprecated APIs, code smells, and best practices. Return ONLY valid JSON array.`;
      userPrompt = `Scan these files for issues:\n\n${fileContext}`;
    } else if (mode === 'build' || mode === 'improve') {
      systemPrompt = `You are Moltbot, ZapCodes' AI code assistant. You help users improve their code by adding features, fixing bugs, optimizing performance, and enhancing security. When asked to modify code, return the complete updated file(s) with clear explanations of what changed and why. Format your response as markdown with code blocks.`;
      userPrompt = prompt
        ? `User request: ${prompt}\n\nFiles to work with:\n\n${fileContext}`
        : `Analyze these files and suggest improvements:\n\n${fileContext}`;
    }

    // Call AI (Groq API with llama model, or fallback)
    const axios = require('axios');
    let aiResponse;

    try {
      const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.1-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt.slice(0, 120000) }, // Groq context limit
        ],
        temperature: 0.3,
        max_tokens: 8000,
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      });

      aiResponse = groqRes.data.choices?.[0]?.message?.content || 'Analysis completed but no response generated.';
    } catch (err) {
      console.error('AI analysis error:', err.message);
      // Fallback: basic static analysis
      aiResponse = generateFallbackAnalysis(files, mode);
    }

    // Parse scan results if mode is scan
    let issues = [];
    if (mode === 'scan') {
      try {
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) issues = JSON.parse(jsonMatch[0]);
      } catch (e) {
        // If JSON parse fails, return raw text
      }
    }

    res.json({
      analysis: aiResponse,
      issues: issues.length > 0 ? issues : undefined,
      tokenEstimate,
      mode,
    });
  } catch (err) {
    res.status(500).json({ error: 'Analysis failed', details: err.message });
  }
});

// POST /api/files/generate — Generate new file with fixes applied
router.post('/generate', optionalAuth, async (req, res) => {
  try {
    const { files, selectedFixes, prompt } = req.body;
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files provided' });

    const fileContext = files.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n');

    let fixDescription = '';
    if (selectedFixes && selectedFixes.length > 0) {
      fixDescription = `Apply these specific fixes:\n${selectedFixes.map((f, i) => `${i + 1}. [${f.severity}] ${f.title}: ${f.fix}`).join('\n')}`;
    }

    const systemPrompt = `You are Moltbot, ZapCodes' AI code generator. Generate the complete updated file(s) incorporating all requested changes. Return the complete file content for each file that needs changes. Format: For each file, output a header "=== FILENAME ===" followed by the complete file content. After the files, provide a brief summary of changes.`;

    const userPrompt = `${fixDescription}\n${prompt ? `Additional request: ${prompt}` : ''}\n\nOriginal files:\n${fileContext}`;

    const axios = require('axios');
    let aiResponse;

    try {
      const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.1-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt.slice(0, 120000) },
        ],
        temperature: 0.2,
        max_tokens: 8000,
      }, {
        headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 60000,
      });
      aiResponse = groqRes.data.choices?.[0]?.message?.content || '';
    } catch (err) {
      return res.status(502).json({ error: 'AI generation failed', details: err.message });
    }

    // Parse generated files from response
    const generatedFiles = [];
    const fileSections = aiResponse.split(/===\s*([^\n=]+)\s*===/);
    for (let i = 1; i < fileSections.length; i += 2) {
      const filename = fileSections[i].trim();
      const content = (fileSections[i + 1] || '').trim();
      if (filename && content) {
        generatedFiles.push({ name: filename, content });
      }
    }

    // If parsing failed, return raw response
    if (generatedFiles.length === 0) {
      generatedFiles.push({ name: 'generated-output.txt', content: aiResponse });
    }

    const instructions = {
      github: [
        'Log in to GitHub and navigate to your repository',
        'For each file: Click the file → Click the pencil (Edit) icon',
        'Replace the content with the new generated code',
        'Scroll down → Write a commit message (e.g., "Apply ZapCodes fixes")',
        'Click "Commit changes" → Select "Commit directly to main"',
      ],
      deploy: {
        frontend: [
          'If using Vercel: Push to GitHub → Vercel auto-deploys',
          'If using Netlify: Push to GitHub → Go to Netlify dashboard → Trigger deploy',
          'If manual: Run `npm run build` → Upload the dist/ folder to your host',
        ],
        backend: [
          'If using Render: Push to GitHub → Render auto-deploys',
          'If using Heroku: `git push heroku main`',
          'Update environment variables if any new ones are needed',
          'Test the live URL to confirm everything works',
        ],
      },
    };

    res.json({
      generatedFiles,
      summary: aiResponse.split('\n').filter(l => !l.startsWith('===')).slice(-5).join('\n'),
      instructions,
    });
  } catch (err) {
    res.status(500).json({ error: 'Generation failed', details: err.message });
  }
});

// POST /api/files/push-to-github — Push generated files to user's GitHub repo
router.post('/push-to-github', auth, async (req, res) => {
  try {
    const { repoUrl, files, commitMessage, branch } = req.body;
    if (!repoUrl || !files?.length) return res.status(400).json({ error: 'Repository URL and files required' });

    const User = require('../models/User');
    const user = await User.findById(req.user._id).select('+githubToken');
    if (!user?.githubToken) return res.status(403).json({ error: 'No GitHub token connected. Go to Settings to add one.' });

    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
    if (!match) return res.status(400).json({ error: 'Invalid GitHub URL' });
    const [, owner, repoName] = match;
    const repo = repoName.replace(/\.git$/, '');
    const targetBranch = branch || 'main';

    const axios = require('axios');
    const headers = { Authorization: `token ${user.githubToken}`, 'Content-Type': 'application/json' };
    const results = [];

    for (const file of files) {
      try {
        // Check if file exists (get SHA for update)
        let sha;
        try {
          const existing = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/${file.name}`, { headers, params: { ref: targetBranch } });
          sha = existing.data.sha;
        } catch (e) { /* File doesn't exist yet — create new */ }

        const payload = {
          message: commitMessage || `Update ${file.name} via ZapCodes Moltbot`,
          content: Buffer.from(file.content).toString('base64'),
          branch: targetBranch,
          ...(sha ? { sha } : {}),
        };

        await axios.put(`https://api.github.com/repos/${owner}/${repo}/contents/${file.name}`, payload, { headers });
        results.push({ name: file.name, status: 'success', action: sha ? 'updated' : 'created' });
      } catch (err) {
        results.push({ name: file.name, status: 'failed', error: err.response?.data?.message || err.message });
      }
    }

    res.json({
      message: `Pushed ${results.filter(r => r.status === 'success').length}/${files.length} files to ${owner}/${repo}`,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: 'Push failed', details: err.message });
  }
});

// Helpers
function detectLanguage(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = { '.js': 'javascript', '.jsx': 'react', '.ts': 'typescript', '.tsx': 'react-ts', '.py': 'python', '.html': 'html', '.css': 'css', '.json': 'json', '.md': 'markdown', '.java': 'java', '.rb': 'ruby', '.go': 'go', '.php': 'php', '.vue': 'vue', '.svelte': 'svelte' };
  return map[ext] || 'text';
}

function generateFallbackAnalysis(files, mode) {
  if (mode === 'scan') {
    const issues = [];
    let id = 1;
    for (const f of files) {
      if (f.content.includes('console.log')) issues.push({ id: id++, severity: 'low', type: 'style', file: f.name, title: 'Console.log statements found', description: 'Remove console.log statements before production', fix: 'Remove or replace with proper logging library' });
      if (f.content.includes('eval(')) issues.push({ id: id++, severity: 'critical', type: 'security', file: f.name, title: 'eval() usage detected', description: 'eval() is a security risk — can execute arbitrary code', fix: 'Replace eval() with safer alternatives like JSON.parse()' });
      if (!f.content.includes('try') && f.language === 'javascript') issues.push({ id: id++, severity: 'medium', type: 'best-practice', file: f.name, title: 'Missing error handling', description: 'No try/catch blocks found', fix: 'Wrap async operations in try/catch blocks' });
      if (f.content.includes('password') && !f.content.includes('hash') && !f.content.includes('bcrypt')) issues.push({ id: id++, severity: 'critical', type: 'security', file: f.name, title: 'Potential plaintext password handling', description: 'Passwords should always be hashed', fix: 'Use bcrypt or argon2 for password hashing' });
    }
    return JSON.stringify(issues);
  }
  return 'AI analysis unavailable. Please configure GROQ_API_KEY for full analysis capabilities.';
}

module.exports = router;
