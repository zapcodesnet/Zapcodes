const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ================================================================
// MODEL CONFIGS — proper token limits
// ================================================================
const CLAUDE_MODEL = 'claude-opus-4-6';
const CLAUDE_MAX_OUTPUT = 16384;
const CLAUDE_LARGE_OUTPUT = 32768;
const GROQ_MAX_OUTPUT = 8192;
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'deepseek-r1-distill-llama-70b', 'mixtral-8x7b-32768'];

// ================================================================
// CORE: Analyze code files
// ================================================================
async function analyzeCode(files, engine = 'ollama') {
  if (engine === 'claude') return analyzeWithClaude(files);
  return analyzeWithGroq(files, engine);
}

async function analyzeWithClaude(files) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.warn('[AI] No ANTHROPIC_API_KEY — fallback to Groq'); return analyzeWithGroq(files, 'ollama'); }

  const filesSummary = files.slice(0, 20).map(f => `--- ${f.path} ---\n${f.content.slice(0, 4000)}`).join('\n\n');
  const sys = `You are ZapCodes code analyzer (Claude Opus 4.6). Return ONLY valid JSON array of issues: [{"type":"crash|memory_leak|anr|warning|error|security|performance","severity":"critical|high|medium|low","title":"...","description":"...","file":"...","line":N,"code":"...","fixedCode":"...","explanation":"...","impact":"...","logs":"..."}]. Return 3-8 issues.`;

  try {
    console.log('[AI] Claude Opus 4.6 analysis');
    const r = await axios.post(ANTHROPIC_API_URL, { model: CLAUDE_MODEL, max_tokens: CLAUDE_MAX_OUTPUT, system: sys, messages: [{ role: 'user', content: `Analyze:\n\n${filesSummary}` }] }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 120000 });
    const c = r.data.content?.[0]?.text || '';
    const m = c.match(/\[[\s\S]*\]/);
    if (m) { console.log('[AI] Claude analysis OK'); return JSON.parse(m[0]); }
    return generateMockAnalysis(files);
  } catch (err) {
    console.error(`[AI] Claude failed: ${err.response?.data?.error?.message || err.message}`);
    return analyzeWithGroq(files, 'ollama');
  }
}

async function analyzeWithGroq(files, engine = 'ollama') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return generateMockAnalysis(files);
  const filesSummary = files.slice(0, 20).map(f => `--- ${f.path} ---\n${f.content.slice(0, 3000)}`).join('\n\n');
  const sys = `You are ZapCodes code analyzer. Return ONLY valid JSON array of issues: [{"type":"crash|memory_leak|anr|warning|error|security|performance","severity":"critical|high|medium|low","title":"...","description":"...","file":"...","line":N,"code":"...","fixedCode":"...","explanation":"...","impact":"...","logs":"..."}]. Return 3-8 issues.`;

  for (const model of GROQ_MODELS) {
    try {
      const r = await axios.post(GROQ_API_URL, { model, messages: [{ role: 'system', content: sys }, { role: 'user', content: `Analyze:\n\n${filesSummary}` }], temperature: 0.3, max_tokens: GROQ_MAX_OUTPUT }, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 60000 });
      const c = r.data.choices[0].message.content;
      const m = c.match(/\[[\s\S]*\]/);
      if (m) { console.log(`[AI] ✓ ${model}`); return JSON.parse(m[0]); }
    } catch (err) {
      const s = err.response?.status;
      console.error(`[AI] ${model} failed (${s})`);
      if (s === 401 || s === 429) break;
    }
  }
  return generateMockAnalysis(files);
}

// ================================================================
// CORE: Call Claude for general prompts
// ================================================================
async function callClaude(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const maxTokens = options.maxTokens || CLAUDE_LARGE_OUTPUT;
  try {
    console.log(`[Claude] Opus 4.6 (max_tokens=${maxTokens})`);
    const r = await axios.post(ANTHROPIC_API_URL, { model: CLAUDE_MODEL, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userPrompt.slice(0, 180000) }] }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: options.timeout || 180000 });
    const c = r.data.content?.[0]?.text || '';
    if (c) { console.log(`[Claude] ✓ ${c.length} chars`); return c; }
  } catch (err) { console.error(`[Claude] ✗ ${err.response?.data?.error?.message || err.message}`); }
  return null;
}

// ================================================================
// CORE: Call Claude with images
// ================================================================
async function callClaudeWithImages(systemPrompt, userPrompt, images = []) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const blocks = images.map(img => ({ type: 'image', source: { type: 'base64', media_type: img.mimeType || 'image/png', data: img.base64 } }));
    blocks.push({ type: 'text', text: userPrompt });
    const r = await axios.post(ANTHROPIC_API_URL, { model: CLAUDE_MODEL, max_tokens: CLAUDE_MAX_OUTPUT, system: systemPrompt, messages: [{ role: 'user', content: blocks }] }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 120000 });
    return r.data.content?.[0]?.text || null;
  } catch (err) { console.error(`[Claude+Image] ✗ ${err.response?.data?.error?.message || err.message}`); return null; }
}

// ================================================================
// CORE: Call Groq
// ================================================================
async function callGroq(systemPrompt, userPrompt, options = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const maxTokens = options.maxTokens || GROQ_MAX_OUTPUT;
  for (const model of GROQ_MODELS) {
    try {
      console.log(`[GROQ] → ${model}`);
      const r = await axios.post(GROQ_API_URL, { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt.slice(0, 30000) }], temperature: 0.2, max_tokens: maxTokens }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 90000 });
      const c = r.data.choices?.[0]?.message?.content;
      if (c) { console.log(`[GROQ] ✓ ${model} (${c.length} chars)`); return c; }
    } catch (err) {
      const s = err.response?.status;
      console.error(`[GROQ] ✗ ${model} (${s})`);
      if (s === 401 || s === 429) break;
    }
  }
  return null;
}

// ================================================================
// MULTI-STEP PROJECT GENERATION
// ================================================================
async function generateProjectMultiStep(template, projectName, description, colorScheme, features, engine = 'ollama') {
  const allFiles = [];
  const spec = getTemplateSpec(template);

  console.log(`[Build] Generating "${template}" with ${spec.phases.length} phases via ${engine}`);

  for (let i = 0; i < spec.phases.length; i++) {
    const phase = spec.phases[i];
    console.log(`[Build] Phase ${i + 1}/${spec.phases.length}: ${phase.name}`);

    const existing = allFiles.map(f => f.name).join('\n');

    const sys = `You are ZapCodes Project Builder. Phase ${i + 1}/${spec.phases.length} for a "${spec.name}" project.

PROJECT: "${projectName}"
DESCRIPTION: ${description || spec.defaultDesc}
COLOR SCHEME: ${colorScheme || 'modern dark'}
FEATURES: ${(features || []).join(', ') || 'standard'}
TECH: ${spec.tech}

${phase.instructions}

RULES:
1. Return COMPLETE files. Every file must be complete from first line to last.
2. Format EXACTLY: \`\`\`filepath:path/to/file.ext
(entire content)
\`\`\`
3. Production-quality code. Not skeletons. Real content, proper styling, working logic.
4. Use "${projectName}" in titles, headers, meta tags.
5. Dark theme with modern aesthetic. Responsive design.
6. Include proper error handling, accessibility, and comments.
${existing ? `\nALREADY GENERATED (don't regenerate):\n${existing}` : ''}`;

    const user = `Generate these files for Phase ${i + 1} (${phase.name}):\n\n${phase.fileList}\n\nEvery file must be complete and production-ready.`;

    let response = null;
    if (engine === 'claude') {
      response = await callClaude(sys, user, { maxTokens: CLAUDE_LARGE_OUTPUT, timeout: 180000 });
    }
    if (!response) {
      response = await callGroq(sys, user, { maxTokens: GROQ_MAX_OUTPUT });
    }

    if (response) {
      const parsed = parseFilesFromResponse(response);
      if (parsed.length > 0) {
        allFiles.push(...parsed);
        console.log(`[Build] Phase ${i + 1}: ${parsed.length} files`);
      } else {
        console.warn(`[Build] Phase ${i + 1}: no files parsed`);
      }
    } else {
      console.error(`[Build] Phase ${i + 1}: AI failed`);
    }
  }

  console.log(`[Build] Done: ${allFiles.length} total files`);
  return allFiles;
}

// ================================================================
// TEMPLATE SPECS — defines phases for each template type
// ================================================================
function getTemplateSpec(template) {
  const specs = {
    portfolio: {
      name: 'Portfolio / Personal Site', tech: 'HTML + CSS + JavaScript', defaultDesc: 'A beautiful personal portfolio',
      phases: [{
        name: 'Core Site',
        instructions: 'Generate a modern portfolio site. Include: hero section, about with skills grid, projects section (3-4 cards), contact form, footer. CSS animations, dark theme, gradients, responsive. Make it visually impressive.',
        fileList: '- index.html (complete page with all sections)\n- style.css (full stylesheet: animations, responsive, dark theme)\n- script.js (smooth scroll, form handling, navbar, scroll animations)',
      }],
    },
    landing: {
      name: 'Business Landing Page', tech: 'HTML + CSS + JavaScript', defaultDesc: 'Professional business landing page',
      phases: [{
        name: 'Landing Page',
        instructions: 'High-converting landing page. Include: nav, hero with headline/CTA, features grid (6 items), testimonials (3), pricing (3 tiers), FAQ accordion, footer. Dark SaaS aesthetic, gradient CTAs, scroll animations.',
        fileList: '- index.html (complete landing page)\n- style.css (full stylesheet)\n- script.js (FAQ accordion, smooth scroll, navbar, animations)',
      }],
    },
    ecommerce: {
      name: 'E-Commerce Store', tech: 'React + Vite', defaultDesc: 'Online store with cart and checkout',
      phases: [
        {
          name: 'Config & Data',
          instructions: 'Generate Vite+React project config and product data. Modern React 18 with react-router-dom.',
          fileList: '- package.json (react, react-dom, react-router-dom, vite, @vitejs/plugin-react)\n- vite.config.js\n- index.html\n- src/main.jsx\n- src/App.jsx (router: Home, Products, ProductDetail, Cart)\n- src/data/products.js (8-10 products with id, name, price, image emoji, description, category)',
        },
        {
          name: 'Pages & Components',
          instructions: 'All pages and components. Cart uses React Context. Products page has filters. Everything styled with dark theme.',
          fileList: '- src/context/CartContext.jsx (add, remove, update qty, total)\n- src/pages/Home.jsx (hero, featured products, categories)\n- src/pages/Products.jsx (grid, category filter, search)\n- src/pages/ProductDetail.jsx (detail view, add to cart)\n- src/pages/Cart.jsx (items, quantities, total, checkout)\n- src/components/Navbar.jsx (logo, links, cart badge)\n- src/components/ProductCard.jsx (card with add button)\n- src/index.css (complete dark theme stylesheet)',
        },
      ],
    },
    blog: {
      name: 'Blog / Content Site', tech: 'HTML + CSS + JavaScript', defaultDesc: 'Clean blog with posts and search',
      phases: [{
        name: 'Blog Site',
        instructions: 'Complete blog with homepage (post grid), post page, sidebar, search, categories. 3-4 sample posts with real content. Dark theme, clean typography, responsive.',
        fileList: '- index.html (homepage with post grid, sidebar, search)\n- post.html (single post template)\n- style.css (blog stylesheet: typography, cards, sidebar, responsive)\n- script.js (search, category filter, reading progress bar)',
      }],
    },
    dashboard: {
      name: 'Admin Dashboard', tech: 'React + Vite + Recharts', defaultDesc: 'Data dashboard with charts and analytics',
      phases: [
        {
          name: 'Config & Layout',
          instructions: 'Vite+React+Recharts dashboard setup. Sidebar navigation, main content area with routes. Dark admin theme.',
          fileList: '- package.json (react, react-dom, react-router-dom, recharts, vite, @vitejs/plugin-react)\n- vite.config.js\n- index.html\n- src/main.jsx\n- src/App.jsx (sidebar layout + routes)\n- src/components/Sidebar.jsx (Dashboard, Analytics, Users, Settings links)',
        },
        {
          name: 'Dashboard Pages',
          instructions: 'Dashboard pages with recharts charts, data tables, stat cards. Realistic sample data. Dark themed cards.',
          fileList: '- src/data/sampleData.js (realistic chart/table data)\n- src/pages/Dashboard.jsx (4 stat cards, line chart, activity list)\n- src/pages/Analytics.jsx (bar chart, pie chart, data table)\n- src/pages/Users.jsx (user table, search, status badges)\n- src/pages/Settings.jsx (settings form)\n- src/index.css (complete dark dashboard stylesheet)',
        },
      ],
    },
    mobile: {
      name: 'Mobile App (React Native)', tech: 'React Native + Expo', defaultDesc: 'Cross-platform mobile app',
      phases: [{
        name: 'Mobile App',
        instructions: 'Complete React Native Expo app with bottom tab navigation (Home, Explore, Profile). Dark theme, StatusBar, safe areas. Realistic content.',
        fileList: '- package.json (expo ~51, react-native, @react-navigation/native, @react-navigation/bottom-tabs, react-native-safe-area-context, react-native-screens)\n- app.json (expo config)\n- App.js (NavigationContainer + bottom tabs)\n- src/screens/HomeScreen.js (hero, cards, buttons)\n- src/screens/ExploreScreen.js (search, category grid, items)\n- src/screens/ProfileScreen.js (avatar, stats, settings)\n- src/theme.js (colors, spacing)',
      }],
    },
    webapp: {
      name: 'Full-Stack Web App', tech: 'React + Vite + Node.js + Express', defaultDesc: 'Full-stack web app with API',
      phases: [
        {
          name: 'Backend API',
          instructions: 'Node.js+Express backend with CORS, RESTful CRUD API. In-memory data store. Error handling.',
          fileList: '- backend/package.json (express, cors, dotenv)\n- backend/server.js (Express with CORS, routes, error handling)\n- backend/routes/items.js (GET all, GET one, POST, PUT, DELETE)\n- backend/.env.example',
        },
        {
          name: 'Frontend',
          instructions: 'React+Vite frontend connecting to backend API. Pages for list, add, detail. Axios for API calls. Dark responsive theme.',
          fileList: '- frontend/package.json (react, react-dom, react-router-dom, axios, vite, @vitejs/plugin-react)\n- frontend/vite.config.js (with proxy)\n- frontend/index.html\n- frontend/src/main.jsx\n- frontend/src/App.jsx (router)\n- frontend/src/pages/Home.jsx (item list + add form)\n- frontend/src/pages/ItemDetail.jsx (view/edit)\n- frontend/src/components/Navbar.jsx\n- frontend/src/index.css (dark theme)\n- README.md (setup guide)',
        },
      ],
    },
    saas: {
      name: 'SaaS Starter', tech: 'React + Vite + Node.js + Express + JWT', defaultDesc: 'SaaS with auth, dashboard, pricing',
      phases: [
        {
          name: 'Backend & Auth',
          instructions: 'Node.js backend with JWT auth (register/login), protected routes. bcryptjs for passwords. In-memory user store.',
          fileList: '- backend/package.json (express, cors, jsonwebtoken, bcryptjs, dotenv)\n- backend/server.js (Express, CORS, routes)\n- backend/middleware/auth.js (JWT middleware)\n- backend/routes/auth.js (register, login, me)\n- backend/routes/dashboard.js (protected stats)\n- backend/.env.example',
        },
        {
          name: 'Frontend SaaS UI',
          instructions: 'React frontend with login/register, protected dashboard, pricing (3 tiers), landing page. Auth guards. JWT in localStorage. Dark SaaS aesthetic.',
          fileList: '- frontend/package.json (react, react-dom, react-router-dom, axios, vite)\n- frontend/vite.config.js\n- frontend/index.html\n- frontend/src/main.jsx\n- frontend/src/App.jsx (public + protected routes)\n- frontend/src/context/AuthContext.jsx\n- frontend/src/pages/Landing.jsx\n- frontend/src/pages/Login.jsx\n- frontend/src/pages/Register.jsx\n- frontend/src/pages/Dashboard.jsx (protected)\n- frontend/src/pages/Pricing.jsx (3 tiers)\n- frontend/src/components/Navbar.jsx\n- frontend/src/index.css (dark SaaS theme)\n- README.md',
        },
      ],
    },
    'fullstack-mobile': {
      name: 'Full-Stack + Mobile Companion', tech: 'React + Node.js + Express + Socket.IO + React Native', defaultDesc: 'Web + synced mobile companion',
      phases: [
        {
          name: 'Backend',
          instructions: 'Node.js+Express+Socket.IO backend. CRUD API with real-time events. Both web and mobile connect here.',
          fileList: '- backend/package.json (express, cors, socket.io, dotenv)\n- backend/server.js (Express + Socket.IO, CRUD, real-time)',
        },
        {
          name: 'Web Frontend',
          instructions: 'React+Vite frontend with Socket.IO real-time updates. Sync badge. Dark theme.',
          fileList: '- web/package.json (react, react-dom, socket.io-client, axios, vite)\n- web/vite.config.js\n- web/index.html\n- web/src/main.jsx\n- web/src/App.jsx (API + Socket.IO, CRUD UI)\n- web/src/index.css',
        },
        {
          name: 'Mobile',
          instructions: 'React Native Expo app connecting to same backend. Real-time sync badge. Same CRUD. Mobile-optimized UX.',
          fileList: '- mobile/package.json (expo, react-native, socket.io-client)\n- mobile/app.json\n- mobile/App.js (API + Socket.IO, CRUD)\n- README.md (setup for all 3 parts)',
        },
      ],
    },
  };
  return specs[template] || specs.portfolio;
}

// ================================================================
// Parse files from AI response
// ================================================================
function parseFilesFromResponse(response) {
  const files = [];
  let m;

  const p1 = /```filepath:([^\n]+)\n([\s\S]*?)```/g;
  while ((m = p1.exec(response))) {
    if (m[1].trim() && m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() });
  }
  if (files.length) return dedup(files);

  const p2 = /```(?:javascript|jsx|tsx|typescript|json|html|css|js|ts|bash|sh|text|markdown|md)?\s+([^\n`]+\.[a-z]{1,6})\n([\s\S]*?)```/g;
  while ((m = p2.exec(response))) {
    if (m[1].trim() && m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() });
  }
  if (files.length) return dedup(files);

  const p3 = /(?:\*\*|###?\s*)(?:File:?\s*)?`?([^\n`*]+\.[a-z]{1,6})`?\*{0,2}\s*\n+```[^\n]*\n([\s\S]*?)```/g;
  while ((m = p3.exec(response))) {
    if (m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() });
  }
  if (files.length) return dedup(files);

  const p4 = /===\s*(?:FILE:\s*)?([^\n=]+?)\s*===\n([\s\S]*?)(?=\n===|$)/g;
  while ((m = p4.exec(response))) {
    if (m[1].trim() && m[2].trim().length > 10) files.push({ name: m[1].trim(), content: m[2].trim() });
  }
  return dedup(files);
}

function dedup(files) {
  const seen = new Map();
  for (const f of files) { if (!seen.has(f.name) || f.content.length > seen.get(f.name).content.length) seen.set(f.name, f); }
  return Array.from(seen.values());
}

// ================================================================
// VERIFY AI STATUS
// ================================================================
async function verifyAIStatus() {
  const result = { claude: { available: false, model: CLAUDE_MODEL, error: null }, groq: { available: false, models: [], error: null } };

  const aKey = process.env.ANTHROPIC_API_KEY;
  if (aKey) {
    try {
      const r = await axios.post(ANTHROPIC_API_URL, { model: CLAUDE_MODEL, max_tokens: 10, messages: [{ role: 'user', content: 'Say OK' }] }, { headers: { 'x-api-key': aKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 15000 });
      if (r.data.content?.[0]?.text) result.claude.available = true;
    } catch (err) { result.claude.error = err.response?.data?.error?.message || err.message; }
  } else { result.claude.error = 'ANTHROPIC_API_KEY not set'; }

  const gKey = process.env.GROQ_API_KEY;
  if (gKey) {
    for (const model of GROQ_MODELS.slice(0, 2)) {
      try {
        await axios.post(GROQ_API_URL, { model, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 }, { headers: { 'Authorization': `Bearer ${gKey}` }, timeout: 10000 });
        result.groq.available = true;
        result.groq.models.push(model);
      } catch {}
    }
    if (!result.groq.available) result.groq.error = 'All Groq models failed';
  } else { result.groq.error = 'GROQ_API_KEY not set'; }

  return result;
}

// ================================================================
// Tutorial & Mock
// ================================================================
async function generateTutorial(question) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return fallbackTutorial(question);
  for (const model of ['llama-3.1-8b-instant', 'gemma2-9b-it']) {
    try {
      const r = await axios.post(GROQ_API_URL, { model, messages: [{ role: 'system', content: 'You are ZapCodes Tutorial Assistant. Be helpful and concise. Format in markdown.' }, { role: 'user', content: question }], temperature: 0.7, max_tokens: 1500 }, { headers: { 'Authorization': `Bearer ${key}` }, timeout: 15000 });
      return r.data.choices[0].message.content;
    } catch {}
  }
  return fallbackTutorial(question);
}

function fallbackTutorial(q) {
  q = q.toLowerCase();
  if (q.includes('scan')) return '## Scan a Repo\n1. Dashboard → paste URL → pick engine → Scan';
  if (q.includes('build')) return '## Build a Project\n1. Build Project → pick template → name it → Generate → Download ZIP';
  return '## ZapCodes Help\nScan repos for bugs or build projects with AI. Start at the Dashboard or Build page.';
}

function generateMockAnalysis(files) {
  const tpls = [
    { type: 'crash', severity: 'critical', title: 'Null pointer in async handler', description: 'Unhandled null ref', explanation: 'Added null check', impact: 'App crashes' },
    { type: 'memory_leak', severity: 'high', title: 'Event listener not cleaned up', description: 'Missing removeEventListener', explanation: 'Added cleanup', impact: 'Memory grows' },
    { type: 'security', severity: 'critical', title: 'Injection vulnerability', description: 'Unsanitized input', explanation: 'Use parameterized queries', impact: 'Data breach' },
  ];
  return tpls.slice(0, Math.min(files.length, 3)).map((t, i) => {
    const f = files[i] || files[0];
    return { ...t, file: f.path || f.name, line: 10 + i * 15, code: (f.content || '').split('\n').slice(0, 3).join('\n'), fixedCode: '// Fixed\n' + (f.content || '').split('\n').slice(0, 3).join('\n'), logs: `Error at ${f.path || f.name}` };
  });
}

module.exports = { analyzeCode, generateTutorial, callClaude, callClaudeWithImages, callGroq, generateProjectMultiStep, parseFilesFromResponse, verifyAIStatus, CLAUDE_MAX_OUTPUT, CLAUDE_LARGE_OUTPUT, GROQ_MAX_OUTPUT };
