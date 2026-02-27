const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => { const dir = '/tmp/zapcodes-uploads'; fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.js','.jsx','.ts','.tsx','.py','.html','.css','.json','.md','.txt','.zip','.java','.rb','.go','.php','.vue','.svelte','.env','.yml','.yaml','.sh'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext) || file.mimetype?.includes('zip'));
  },
});

// ========== UPLOAD ==========
router.post('/upload', optionalAuth, upload.array('files', 100), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
    const processedFiles = [];
    const skippedFiles = [];

    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.zip') {
        try {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(file.path);
          for (const entry of zip.getEntries()) {
            if (entry.isDirectory) continue;
            const ep = entry.entryName;
            if (ep.includes('node_modules/') || ep.includes('.git/') || ep.includes('dist/') || ep.includes('.next/') || ep.includes('.DS_Store')) continue;
            const binExts = ['.png','.jpg','.jpeg','.gif','.ico','.woff','.woff2','.ttf','.eot','.mp3','.mp4','.pdf','.exe','.lock'];
            if (binExts.some(b => ep.endsWith(b))) { skippedFiles.push(ep); continue; }
            if (entry.header.size > 300000) { skippedFiles.push(ep + ' (too large)'); continue; }
            try {
              const content = entry.getData().toString('utf8');
              processedFiles.push({ name: ep, content, size: content.length, language: detectLanguage(ep) });
            } catch { skippedFiles.push(ep); }
          }
        } catch (e) {
          processedFiles.push({ name: file.originalname, content: '(ZIP error: ' + e.message + ')', size: 0, language: 'text' });
        }
      } else {
        const content = fs.readFileSync(file.path, 'utf8');
        processedFiles.push({ name: file.originalname, content, size: content.length, language: detectLanguage(file.originalname) });
      }
      fs.unlink(file.path, () => {});
    }

    res.json({
      files: processedFiles,
      totalFiles: processedFiles.length,
      skippedFiles,
      tree: processedFiles.map(f => f.name).sort(),
      message: `${processedFiles.length} file(s) processed${skippedFiles.length ? `, ${skippedFiles.length} skipped` : ''}`,
    });
  } catch (err) { res.status(500).json({ error: 'Upload failed', details: err.message }); }
});

// ========== ANALYZE (scan or fix) ==========
router.post('/analyze', optionalAuth, async (req, res) => {
  try {
    const { files, prompt, mode } = req.body;
    if (!files?.length) return res.status(400).json({ error: 'No files to analyze' });

    const fileContext = buildSmartContext(files, prompt, mode);
    const tokenEstimate = Math.ceil(fileContext.length / 4);

    let systemPrompt, userPrompt;
    if (mode === 'scan') {
      systemPrompt = SCAN_PROMPT;
      userPrompt = `Scan these files for issues:\n\n${fileContext}`;
    } else {
      systemPrompt = FIX_PROMPT;
      userPrompt = `USER REQUEST: ${prompt || 'Analyze and suggest improvements'}\n\nFULL REPOSITORY:\n\n${fileContext}`;
    }

    const aiResponse = await callGroq(systemPrompt, userPrompt);
    if (!aiResponse) {
      return res.json({ analysis: fallback(files, mode), generatedFiles: [], tokenEstimate, mode, warning: 'AI unavailable' });
    }

    if (mode === 'scan') {
      let issues = [];
      try { const m = aiResponse.match(/\[[\s\S]*\]/); if (m) issues = JSON.parse(m[0]); } catch {}
      return res.json({ analysis: aiResponse, issues: issues.length ? issues : undefined, tokenEstimate, mode });
    }

    // Fix/improve mode — parse COMPLETE files from AI response
    const generatedFiles = parseFiles(aiResponse);
    const summary = extractSummary(aiResponse);

    res.json({ analysis: aiResponse, generatedFiles, summary, fileCount: generatedFiles.length, tokenEstimate, mode, instructions: DEPLOY_INSTRUCTIONS });
  } catch (err) { res.status(500).json({ error: 'Analysis failed', details: err.message }); }
});

// ========== GENERATE ==========
router.post('/generate', optionalAuth, async (req, res) => {
  try {
    const { files, selectedFixes, prompt } = req.body;
    if (!files?.length) return res.status(400).json({ error: 'No files' });

    const fileContext = buildSmartContext(files, prompt, 'fix');
    let fixDesc = '';
    if (selectedFixes?.length) fixDesc = `FIXES TO APPLY:\n${selectedFixes.map((f, i) => `${i+1}. [${f.severity}] ${f.title}: ${f.fix}`).join('\n')}\n\n`;

    const userPrompt = `${fixDesc}${prompt ? `REQUEST: ${prompt}\n\n` : ''}FULL REPOSITORY:\n\n${fileContext}`;
    const aiResponse = await callGroq(GENERATE_PROMPT, userPrompt);
    if (!aiResponse) return res.status(502).json({ error: 'AI unavailable. Check GROQ_API_KEY.' });

    const generatedFiles = parseFiles(aiResponse);
    if (!generatedFiles.length) generatedFiles.push({ name: 'ai-response.md', content: aiResponse });

    res.json({ generatedFiles, summary: extractSummary(aiResponse), fileCount: generatedFiles.length, instructions: DEPLOY_INSTRUCTIONS });
  } catch (err) { res.status(500).json({ error: 'Generation failed', details: err.message }); }
});

// ========== PUSH TO GITHUB ==========
router.post('/push-to-github', auth, async (req, res) => {
  try {
    const { repoUrl, files, commitMessage, branch } = req.body;
    if (!repoUrl || !files?.length) return res.status(400).json({ error: 'Repo URL and files required' });

    const User = require('../models/User');
    const user = await User.findById(req.user._id).select('+githubToken');
    if (!user?.githubToken) return res.status(403).json({ error: 'No GitHub token. Go to Settings.' });

    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
    if (!match) return res.status(400).json({ error: 'Invalid GitHub URL' });
    const [, owner, repo] = match;
    const targetBranch = branch || 'main';

    const axios = require('axios');
    const headers = { Authorization: `token ${user.githubToken}`, 'Content-Type': 'application/json' };
    const results = [];

    for (const file of files) {
      try {
        let sha;
        try { const e = await axios.get(`https://api.github.com/repos/${owner}/${repo.replace(/\.git$/,'')}/contents/${file.name}`, { headers, params: { ref: targetBranch } }); sha = e.data.sha; } catch {}
        await axios.put(`https://api.github.com/repos/${owner}/${repo.replace(/\.git$/,'')}/contents/${file.name}`, {
          message: commitMessage || `Update ${file.name} via ZapCodes Moltbot`,
          content: Buffer.from(file.content).toString('base64'),
          branch: targetBranch, ...(sha ? { sha } : {}),
        }, { headers });
        results.push({ name: file.name, status: 'success', action: sha ? 'updated' : 'created' });
      } catch (err) {
        results.push({ name: file.name, status: 'failed', error: err.response?.data?.message || err.message });
      }
    }
    res.json({ message: `Pushed ${results.filter(r=>r.status==='success').length}/${files.length} files`, results });
  } catch (err) { res.status(500).json({ error: 'Push failed' }); }
});

// ========== GROQ STATUS ==========
router.get('/groq-status', async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ status: 'error', message: 'GROQ_API_KEY not set' });
  const axios = require('axios');
  const results = [];
  for (const model of GROQ_MODELS) {
    try {
      const s = Date.now();
      await axios.post('https://api.groq.com/openai/v1/chat/completions', { model, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 10000 });
      results.push({ model, status: 'ok', ms: Date.now() - s });
    } catch (err) { results.push({ model, status: 'fail', error: err.response?.data?.error?.message || err.message, code: err.response?.status }); }
  }
  res.json({ status: results.some(r=>r.status==='ok') ? 'ok' : 'error', keyPrefix: key.slice(0,8)+'...', workingModels: results.filter(r=>r.status==='ok').map(r=>r.model), allResults: results });
});


// ================================================================
// SYSTEM PROMPTS — the core of the "return complete files" behavior
// ================================================================

const SCAN_PROMPT = `You are Moltbot, ZapCodes' AI code analyzer. Analyze the code files and return a JSON array of issues. Each issue: { "id": number, "severity": "critical"|"high"|"medium"|"low", "type": "bug"|"security"|"performance"|"style"|"best-practice", "file": "filename", "line": number_or_null, "title": "short title", "description": "explanation", "fix": "approach", "fixCode": "code snippet" }. Return ONLY valid JSON array.`;

const FIX_PROMPT = `You are Moltbot, ZapCodes' expert full-stack developer. The user uploaded their ENTIRE repository and wants you to fix or improve something.

ABSOLUTE RULES:

1. COMPLETE FILES ONLY. For every file you change, return the ENTIRE file — first line to last line. NEVER return snippets, diffs, "// rest unchanged", or partial code. The user will REPLACE entire files with your output.

2. FORMAT each file EXACTLY like this:
\`\`\`filepath:path/to/file.ext
(entire file content from line 1 to last line)
\`\`\`

3. INCLUDE ALL AFFECTED FILES. If a fix touches a component, also include any routes, API endpoints, styles, mobile screens, configs, or shared logic that need coordinated changes. Think about imports, exports, types, state, navigation.

4. PRESERVE everything — existing functionality, style, comments, architecture. Only change what the user asked.

5. WEB + MOBILE: If the feature exists on both platforms, include BOTH the web file and the mobile file.

6. End your response with:
---SUMMARY---
- What changed and why
- List of modified files
- New dependencies (if any): npm install xyz
- Deploy: git push triggers auto-deploy on Vercel/Render
- Commit message: "fix: description of change"`;

const GENERATE_PROMPT = FIX_PROMPT; // Same rules for generation

const DEPLOY_INSTRUCTIONS = {
  github: ['Replace files at their exact paths in your repo', 'git add . && git commit -m "Apply ZapCodes fixes" && git push', 'Or use "Apply via Moltbot" to push directly'],
  deploy: {
    frontend: ['Vercel auto-deploys on push (~60s)', 'Or: npm run build → upload dist/'],
    backend: ['Render auto-deploys on push (~2-3min)', 'Check env vars are set', 'Test live URL'],
  },
};


// ================================================================
// GROQ CALLER — model fallback chain
// ================================================================
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'];

async function callGroq(systemPrompt, userPrompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const axios = require('axios');

  for (const model of GROQ_MODELS) {
    try {
      console.log(`[GROQ] → ${model}`);
      const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt.slice(0, 28000) }],
        temperature: 0.2,
        max_tokens: 8000,
      }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 60000 });
      const c = r.data.choices?.[0]?.message?.content;
      if (c) { console.log(`[GROQ] ✓ ${model}`); return c; }
    } catch (err) {
      const s = err.response?.status;
      console.error(`[GROQ] ✗ ${model} (${s}): ${err.response?.data?.error?.message || err.message}`);
      if (s === 401 || s === 429) break;
    }
  }
  return null;
}


// ================================================================
// SMART CONTEXT — prioritizes relevant files within token budget
// ================================================================
function buildSmartContext(files, prompt, mode) {
  const q = (prompt || '').toLowerCase();

  const scored = files.map(f => {
    let score = 1;
    const n = f.name.toLowerCase();
    const base = path.basename(n, path.extname(n));

    if (q.includes(base) || q.includes(n)) score += 100;
    if (n.endsWith('.jsx') || n.endsWith('.tsx')) score += 10;
    if (n.endsWith('.js') || n.endsWith('.ts')) score += 8;
    if (n.includes('package.json')) score += 15;
    if (n.includes('route') || n.includes('api')) score += 7;

    const kws = q.split(/\s+/).filter(k => k.length > 2);
    for (const k of kws) { if (n.includes(k)) score += 20; }

    ['setting','dashboard','admin','build','login','auth','config','style','mobile','screen','nav','header','sidebar'].forEach(kw => {
      if (q.includes(kw) && n.includes(kw)) score += 50;
    });

    return { ...f, score };
  }).sort((a, b) => b.score - a.score);

  let ctx = `=== REPO TREE ===\n${files.map(f=>f.name).sort().join('\n')}\n\n`;
  const MAX = 26000;

  for (const f of scored) {
    const block = `=== FILE: ${f.name} ===\n${f.content}\n\n`;
    if (ctx.length + block.length > MAX) {
      const trunc = `=== FILE: ${f.name} (TRUNCATED ${f.size} chars) ===\n${f.content.slice(0, 400)}\n...\n\n`;
      if (ctx.length + trunc.length < MAX + 1500) ctx += trunc;
      continue;
    }
    ctx += block;
  }
  return ctx;
}


// ================================================================
// FILE PARSER — extracts complete files from AI markdown response
// ================================================================
function parseFiles(response) {
  const files = [];

  // Pattern 1: ```filepath:path/to/file\n...\n```
  let m;
  const p1 = /```filepath:([^\n]+)\n([\s\S]*?)```/g;
  while ((m = p1.exec(response))) {
    if (m[1].trim() && m[2].trim().length > 5) files.push({ name: m[1].trim(), content: m[2].trim() });
  }
  if (files.length) return files;

  // Pattern 2: ```lang path/to/file\n...\n```
  const p2 = /```\w*\s+([^\n`]+\.[a-z]{1,5})\n([\s\S]*?)```/g;
  while ((m = p2.exec(response))) {
    if (m[1].trim().includes('/') && m[2].trim().length > 5) files.push({ name: m[1].trim(), content: m[2].trim() });
  }
  if (files.length) return files;

  // Pattern 3: === FILE: path === or === path ===
  const p3 = /===\s*(?:FILE:\s*)?([^\n=]+?)\s*===\n([\s\S]*?)(?=\n===|---SUMMARY---|$)/g;
  while ((m = p3.exec(response))) {
    if (m[1].trim() && m[2].trim().length > 5) files.push({ name: m[1].trim(), content: m[2].trim() });
  }
  if (files.length) return files;

  // Pattern 4: Look for **File: `path`** or ### path followed by code block
  const p4 = /(?:\*\*|###?\s*)(?:File:?\s*)?`?([^\n`*]+\.[a-z]{1,5})`?\*{0,2}\s*\n+```[^\n]*\n([\s\S]*?)```/g;
  while ((m = p4.exec(response))) {
    if (m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() });
  }

  return files;
}

function extractSummary(response) {
  const m = response.match(/---SUMMARY---\s*([\s\S]*?)$/i);
  return m ? m[1].trim() : '';
}


// ================================================================
// HELPERS
// ================================================================
function detectLanguage(filename) {
  const ext = path.extname(filename).toLowerCase();
  return { '.js':'javascript','.jsx':'react','.ts':'typescript','.tsx':'react-ts','.py':'python','.html':'html','.css':'css','.json':'json','.md':'markdown','.java':'java','.rb':'ruby','.go':'go','.php':'php','.vue':'vue','.svelte':'svelte','.yml':'yaml','.sh':'bash' }[ext] || 'text';
}

function fallback(files, mode) {
  if (mode === 'scan') {
    const issues = []; let id = 1;
    for (const f of files) {
      if (f.content.includes('console.log')) issues.push({ id: id++, severity: 'low', type: 'style', file: f.name, title: 'Console.log found', description: 'Remove before production', fix: 'Use a logger' });
      if (f.content.includes('eval(')) issues.push({ id: id++, severity: 'critical', type: 'security', file: f.name, title: 'eval() detected', description: 'Security risk', fix: 'Use JSON.parse()' });
    }
    return JSON.stringify(issues);
  }
  return 'AI unavailable. Check GROQ_API_KEY in Render environment variables.';
}

module.exports = router;
