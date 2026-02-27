const express = require('express');
const { optionalAuth, auth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const { generateProjectMultiStep, verifyAIStatus } = require('../services/ai');

const router = express.Router();

// ================================================================
// PROJECT TEMPLATES
// ================================================================
const templates = {
  portfolio: { name: 'Portfolio / Personal Site', icon: '🎨', description: 'A beautiful personal portfolio to showcase your work', tech: 'HTML + CSS + JavaScript' },
  landing: { name: 'Business Landing Page', icon: '🚀', description: 'Professional landing page for your business or product', tech: 'HTML + CSS + JavaScript' },
  ecommerce: { name: 'E-Commerce Store', icon: '🛒', description: 'Online store with product listings, cart, and checkout', tech: 'React + Vite' },
  blog: { name: 'Blog / Content Site', icon: '📝', description: 'Clean blog with posts, categories, and search', tech: 'HTML + CSS + JavaScript' },
  dashboard: { name: 'Admin Dashboard', icon: '📊', description: 'Data dashboard with charts, tables, and analytics', tech: 'React + Vite + Recharts' },
  mobile: { name: 'Mobile App (React Native)', icon: '📱', description: 'Cross-platform mobile app for iOS and Android', tech: 'React Native + Expo' },
  webapp: { name: 'Full-Stack Web App', icon: '⚡', description: 'Web app with frontend, backend API, and database', tech: 'React + Node.js + Express' },
  saas: { name: 'SaaS Starter', icon: '💎', description: 'SaaS template with auth, payments, and dashboard', tech: 'React + Node.js + Stripe' },
  'fullstack-mobile': { name: 'Full-Stack + Mobile Companion', icon: '🚀📱', description: 'Complete web app + synced React Native iOS/Android companion', tech: 'React + Node.js + React Native + Socket.IO', proOnly: true },
};

// GET /api/build/templates
router.get('/templates', (req, res) => {
  res.json({ templates });
});

// ================================================================
// POST /api/build/generate — AI-POWERED project generation
// ================================================================
router.post('/generate', optionalAuth, async (req, res) => {
  try {
    const { template, projectName, description, colorScheme, features, engine } = req.body;

    if (!template || !projectName) {
      return res.status(400).json({ error: 'Template and project name are required' });
    }

    const templateInfo = templates[template];
    if (!templateInfo) {
      return res.status(400).json({ error: 'Invalid template' });
    }

    // Enforce build limits
    if (req.user) {
      const plan = req.user.plan || 'free';
      const limits = { free: 3, starter: 25, pro: 999999 };
      const limit = limits[plan] || 3;

      if (req.user.buildsUsed >= limit) {
        return res.status(403).json({ error: 'Build limit reached', message: `Your ${plan} plan allows ${limit} builds/month. Upgrade for more.`, currentPlan: plan, buildsUsed: req.user.buildsUsed, buildsLimit: limit });
      }

      const freeTemplates = ['portfolio', 'landing', 'blog'];
      if (plan === 'free' && !freeTemplates.includes(template)) {
        return res.status(403).json({ error: 'Template requires upgrade', message: `The ${templateInfo.name} template requires a Starter or Pro plan.`, currentPlan: plan });
      }
      if (templateInfo.proOnly && plan !== 'pro') {
        return res.status(403).json({ error: 'Pro subscription required', message: `The ${templateInfo.name} template requires a Pro plan.`, currentPlan: plan });
      }

      req.user.buildsUsed += 1;
      await req.user.save();
    }

    const projectId = uuidv4().slice(0, 8);
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const useEngine = engine || 'ollama';

    console.log(`[Build] Generating "${template}" project "${safeName}" with engine: ${useEngine}`);

    // ===== TRY AI-POWERED GENERATION FIRST =====
    let files = [];
    let generatedBy = 'static';

    try {
      console.log(`[Build] Attempting AI multi-step generation...`);
      const aiFiles = await generateProjectMultiStep(template, projectName, description, colorScheme, features, useEngine);

      if (aiFiles && aiFiles.length >= 2) {
        // AI generation succeeded — normalize file paths
        files = aiFiles.map(f => ({
          path: f.name || f.path,
          content: f.content,
        }));
        generatedBy = useEngine === 'claude' ? 'claude-opus-4.6' : 'groq-ai';
        console.log(`[Build] AI generated ${files.length} files via ${generatedBy}`);
      } else {
        console.warn(`[Build] AI returned ${aiFiles?.length || 0} files — falling back to static`);
      }
    } catch (aiErr) {
      console.error(`[Build] AI generation failed: ${aiErr.message} — falling back to static`);
    }

    // ===== FALLBACK TO STATIC TEMPLATES =====
    if (files.length < 2) {
      console.log(`[Build] Using static template for "${template}"`);
      files = getStaticTemplate(template, safeName, projectName, description, colorScheme, features);
      generatedBy = 'static-template';
    }

    const deployGuide = getDeploymentGuide(template, safeName);

    // Validate minimum size (>10KB for real projects)
    const totalSize = files.reduce((sum, f) => sum + (f.content?.length || 0), 0);
    const sizeWarning = totalSize < 10000 ? 'Warning: Generated project is smaller than expected. Consider re-generating with Claude for better results.' : null;

    res.json({
      projectId,
      projectName: safeName,
      template: templateInfo,
      files,
      deployGuide,
      totalFiles: files.length,
      totalSize,
      generatedBy,
      engine: useEngine,
      ...(sizeWarning ? { sizeWarning } : {}),
    });
  } catch (err) {
    console.error('Build generation error:', err);
    res.status(500).json({ error: 'Failed to generate project', details: err.message });
  }
});

// ================================================================
// GET /api/build/ai-status — verify AI engines
// ================================================================
router.get('/ai-status', async (req, res) => {
  try {
    const status = await verifyAIStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Status check failed' });
  }
});

// ================================================================
// POST /api/build/import-repo
// ================================================================
router.post('/import-repo', optionalAuth, async (req, res) => {
  try {
    const { repoUrl } = req.body;
    if (!repoUrl) return res.status(400).json({ error: 'Repository URL required' });

    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
    if (!match) return res.status(400).json({ error: 'Invalid GitHub URL' });

    const [, owner, repoName] = match;
    const cleanRepo = repoName.replace(/\.git$/, '');
    const axios = require('axios');
    const headers = {};

    if (req.user) {
      const User = require('../models/User');
      const user = await User.findById(req.user._id).select('+githubToken');
      if (user?.githubToken) headers.Authorization = `token ${user.githubToken}`;
    }

    const [repoRes, contentsRes, langRes] = await Promise.all([
      axios.get(`https://api.github.com/repos/${owner}/${cleanRepo}`, { headers }),
      axios.get(`https://api.github.com/repos/${owner}/${cleanRepo}/contents`, { headers }).catch(() => ({ data: [] })),
      axios.get(`https://api.github.com/repos/${owner}/${cleanRepo}/languages`, { headers }).catch(() => ({ data: {} })),
    ]);

    const repoInfo = repoRes.data;
    const contents = contentsRes.data;
    const languages = langRes.data;

    const detection = {
      hasPackageJson: contents.some(f => f.name === 'package.json'),
      hasIndexHtml: contents.some(f => f.name === 'index.html'),
      hasSrcDir: contents.some(f => f.name === 'src' && f.type === 'dir'),
      hasBackendDir: contents.some(f => ['backend', 'server', 'api'].includes(f.name) && f.type === 'dir'),
      hasMobileDir: contents.some(f => ['mobile', 'app', 'ios', 'android'].includes(f.name) && f.type === 'dir'),
      hasDockerfile: contents.some(f => f.name === 'Dockerfile' || f.name === 'docker-compose.yml'),
      languages: Object.keys(languages),
      primaryLanguage: repoInfo.language,
    };

    // Fetch key files
    const keyFiles = [];
    const keyNames = ['package.json', 'README.md', 'vercel.json', '.env.example', 'app.json', 'next.config.js', 'vite.config.js'];
    for (const name of keyNames) {
      const f = contents.find(c => c.name === name);
      if (f?.download_url) {
        try {
          const r = await axios.get(f.download_url, { headers });
          keyFiles.push({ name, content: typeof r.data === 'object' ? JSON.stringify(r.data, null, 2) : r.data, size: f.size });
        } catch {}
      }
    }

    const instructions = generateHostingInstructions(detection, owner, cleanRepo, repoInfo);

    res.json({
      repo: { name: cleanRepo, owner, fullName: repoInfo.full_name, description: repoInfo.description, stars: repoInfo.stargazers_count, language: repoInfo.language, defaultBranch: repoInfo.default_branch, url: repoInfo.html_url, private: repoInfo.private },
      detection,
      files: contents.filter(f => f.type === 'file').map(f => ({ name: f.name, size: f.size, type: f.type })),
      directories: contents.filter(f => f.type === 'dir').map(f => f.name),
      keyFiles,
      hostingInstructions: instructions,
      languages,
    });
  } catch (err) {
    if (err.response?.status === 404) return res.status(404).json({ error: 'Repository not found. Make sure it exists and is public (or connect GitHub).' });
    res.status(500).json({ error: 'Failed to import repository', details: err.message });
  }
});

// GET /api/build/deploy-guide/:template
router.get('/deploy-guide/:template', (req, res) => {
  res.json({ guide: getDeploymentGuide(req.params.template, 'my-project') });
});

// ================================================================
// STATIC TEMPLATE FALLBACKS (when AI fails or key missing)
// ================================================================
function getStaticTemplate(template, safeName, name, desc, colorScheme, features) {
  const c = getColors(colorScheme || 'modern');
  switch (template) {
    case 'portfolio': return generatePortfolio(safeName, name, desc, c, features);
    case 'landing': return generateLanding(safeName, name, desc, c, features);
    case 'blog': return generateBlog(safeName, name, desc, c, features);
    case 'ecommerce': return generateEcommerceStatic(safeName, name, desc, c);
    case 'dashboard': return generateDashboardStatic(safeName, name, desc, c);
    case 'mobile': return generateMobileApp(safeName, name, desc, c);
    case 'webapp': return generateWebAppStatic(safeName, name, desc, c);
    case 'saas': return generateSaaSStatic(safeName, name, desc, c);
    case 'fullstack-mobile': return generateFullStackMobile(safeName, name, desc, c);
    default: return generatePortfolio(safeName, name, desc, c, features);
  }
}

function getColors(scheme) {
  const schemes = {
    modern: { primary: '#6366f1', bg: '#0f172a', text: '#e2e8f0', accent: '#818cf8', card: '#1e293b' },
    green: { primary: '#00e5a0', bg: '#06060b', text: '#e8e8f0', accent: '#00b87d', card: '#11111b' },
    blue: { primary: '#3b82f6', bg: '#0c1222', text: '#e2e8f0', accent: '#60a5fa', card: '#1a2332' },
    red: { primary: '#ef4444', bg: '#0f0a0a', text: '#fce4ec', accent: '#f87171', card: '#1a1010' },
    purple: { primary: '#a855f7', bg: '#0f0720', text: '#e8def8', accent: '#c084fc', card: '#1a1030' },
    orange: { primary: '#f97316', bg: '#120c05', text: '#fed7aa', accent: '#fb923c', card: '#1a1208' },
    clean: { primary: '#2563eb', bg: '#ffffff', text: '#1e293b', accent: '#3b82f6', card: '#f8fafc' },
  };
  return schemes[scheme] || schemes.modern;
}

// ---- Portfolio ----
function generatePortfolio(safeName, name, desc, c) {
  const description = desc || 'Welcome to my portfolio. I build amazing digital experiences.';
  return [
    { path: 'index.html', content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${name}</title><link rel="stylesheet" href="style.css"></head><body><nav class="nav"><div class="container nav-inner"><a href="#" class="logo">${name}</a><div class="nav-links"><a href="#about">About</a><a href="#projects">Projects</a><a href="#contact" class="btn btn-primary">Contact</a></div></div></nav><section class="hero"><div class="container"><p class="hero-label">👋 Hello, I'm</p><h1 class="hero-title">${name}</h1><p class="hero-sub">${description}</p><div class="hero-actions"><a href="#projects" class="btn btn-primary">View My Work →</a><a href="#contact" class="btn btn-secondary">Get In Touch</a></div></div></section><section id="about" class="section"><div class="container"><h2 class="section-title">About Me</h2><p class="section-text">I'm a passionate developer who loves creating beautiful, functional digital experiences.</p><div class="skills-grid"><div class="skill-card">🎨 UI/UX Design</div><div class="skill-card">⚛️ React</div><div class="skill-card">🟢 Node.js</div><div class="skill-card">📱 Mobile Apps</div><div class="skill-card">🗄️ Databases</div><div class="skill-card">☁️ Cloud/DevOps</div></div></div></section><section id="projects" class="section section-alt"><div class="container"><h2 class="section-title">My Projects</h2><div class="projects-grid"><div class="project-card"><div class="project-img">🖥️</div><h3>Project One</h3><p>A modern web application built with React and Node.js</p><a href="#" class="btn btn-small">View Project →</a></div><div class="project-card"><div class="project-img">📱</div><h3>Project Two</h3><p>Cross-platform mobile app with 10,000+ downloads</p><a href="#" class="btn btn-small">View Project →</a></div><div class="project-card"><div class="project-img">🎯</div><h3>Project Three</h3><p>E-commerce platform with AI-powered recommendations</p><a href="#" class="btn btn-small">View Project →</a></div></div></div></section><section id="contact" class="section"><div class="container" style="text-align:center"><h2 class="section-title">Get In Touch</h2><p class="section-text">Have a project in mind? Let's work together!</p><form class="contact-form" onsubmit="handleSubmit(event)"><input type="text" placeholder="Your Name" required><input type="email" placeholder="Your Email" required><textarea placeholder="Your Message" rows="5" required></textarea><button type="submit" class="btn btn-primary" style="width:100%">Send Message →</button></form></div></section><footer class="footer"><div class="container"><p>© 2026 ${name}. Built with ⚡ ZapCodes.</p></div></footer><script src="script.js"></script></body></html>` },
    { path: 'style.css', content: `*{margin:0;padding:0;box-sizing:border-box}:root{--primary:${c.primary};--bg:${c.bg};--text:${c.text};--accent:${c.accent};--card:${c.card}}body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}.container{max-width:1100px;margin:0 auto;padding:0 24px}.nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(15,23,42,0.9);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.06)}.nav-inner{display:flex;align-items:center;justify-content:space-between;height:64px}.logo{font-weight:800;font-size:1.2rem;color:var(--primary);text-decoration:none}.nav-links{display:flex;align-items:center;gap:24px}.nav-links a{color:var(--text);text-decoration:none;font-size:0.9rem;opacity:0.7;transition:0.2s}.nav-links a:hover{opacity:1}.btn{display:inline-block;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.9rem;transition:0.2s;border:none;cursor:pointer}.btn-primary{background:var(--primary);color:#fff}.btn-secondary{border:1px solid var(--primary);color:var(--primary);background:transparent}.btn-small{padding:8px 16px;font-size:0.8rem;background:var(--primary);color:#fff;border-radius:6px}.hero{padding:160px 0 80px;text-align:center}.hero-label{font-size:1rem;color:var(--accent);margin-bottom:12px}.hero-title{font-size:3.5rem;font-weight:900;background:linear-gradient(135deg,var(--primary),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:16px}.hero-sub{font-size:1.1rem;max-width:600px;margin:0 auto 32px;opacity:0.8}.hero-actions{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}.section{padding:80px 0}.section-alt{background:rgba(255,255,255,0.02)}.section-title{font-size:2rem;font-weight:800;text-align:center;margin-bottom:16px}.section-text{text-align:center;max-width:600px;margin:0 auto 40px;opacity:0.8}.skills-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-top:32px}.skill-card{background:var(--card);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;text-align:center;font-weight:600;font-size:0.95rem;transition:0.2s}.skill-card:hover{border-color:var(--primary);transform:translateY(-2px)}.projects-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}.project-card{background:var(--card);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:28px;transition:0.2s}.project-card:hover{border-color:var(--primary);transform:translateY(-4px)}.project-img{font-size:2.5rem;margin-bottom:16px}.project-card h3{font-size:1.2rem;margin-bottom:8px}.project-card p{font-size:0.9rem;opacity:0.7;margin-bottom:16px}.contact-form{max-width:500px;margin:0 auto;display:flex;flex-direction:column;gap:12px}.contact-form input,.contact-form textarea{background:var(--card);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:14px;color:var(--text);font-size:0.95rem}.footer{padding:40px 0;text-align:center;opacity:0.5;font-size:0.85rem;border-top:1px solid rgba(255,255,255,0.06)}@media(max-width:768px){.hero-title{font-size:2.2rem}.nav-links a:not(.btn){display:none}.skills-grid{grid-template-columns:repeat(2,1fr)}.projects-grid{grid-template-columns:1fr}}` },
    { path: 'script.js', content: `document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('a[href^="#"]').forEach(a=>{a.addEventListener('click',e=>{e.preventDefault();const t=document.querySelector(a.getAttribute('href'));if(t)t.scrollIntoView({behavior:'smooth',block:'start'})})});const nav=document.querySelector('.nav');window.addEventListener('scroll',()=>{nav.style.background=window.scrollY>50?'rgba(15,23,42,0.95)':'rgba(15,23,42,0.9)'});const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.style.opacity='1';e.target.style.transform='translateY(0)'}})},{threshold:0.1});document.querySelectorAll('.skill-card,.project-card,.section-title,.section-text').forEach(el=>{el.style.opacity='0';el.style.transform='translateY(20px)';el.style.transition='opacity 0.6s ease, transform 0.6s ease';observer.observe(el)})});function handleSubmit(e){e.preventDefault();alert('Message sent! Thank you for reaching out.');e.target.reset()}` },
  ];
}

// ---- Landing ----
function generateLanding(safeName, name, desc, c) {
  return [
    { path: 'index.html', content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${name}</title><style>*{margin:0;padding:0;box-sizing:border-box}:root{--p:${c.primary};--bg:${c.bg};--t:${c.text};--c:${c.card}}body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--t);line-height:1.6}.c{max-width:1100px;margin:0 auto;padding:0 24px}nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(15,23,42,0.9);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.06)}nav .c{display:flex;align-items:center;justify-content:space-between;height:64px}.logo{font-weight:800;font-size:1.2rem;color:var(--p);text-decoration:none}nav a{color:var(--t);text-decoration:none;margin-left:24px;opacity:0.7}.btn{display:inline-block;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;background:var(--p);color:#fff;border:none;cursor:pointer;font-size:1rem}.hero{padding:160px 0 80px;text-align:center}.hero h1{font-size:3rem;font-weight:900;margin-bottom:16px}.hero p{font-size:1.1rem;opacity:0.7;max-width:600px;margin:0 auto 32px}.features{padding:80px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}.feat{background:var(--c);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:28px}.feat h3{margin:12px 0 8px}.feat p{opacity:0.7;font-size:0.9rem}.pricing{padding:80px 0;text-align:center}.pricing h2{font-size:2rem;font-weight:800;margin-bottom:40px}.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;max-width:900px;margin:0 auto}.tier{background:var(--c);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:32px;text-align:center}.tier.pop{border-color:var(--p);transform:scale(1.05)}.tier h3{font-size:1.3rem;margin-bottom:8px}.price{font-size:2.5rem;font-weight:900;color:var(--p);margin:12px 0}.tier ul{list-style:none;text-align:left;margin:20px 0}.tier li{padding:6px 0;font-size:0.9rem;opacity:0.8}.tier li::before{content:'✓ ';color:var(--p)}footer{padding:40px 0;text-align:center;opacity:0.5;font-size:0.85rem;border-top:1px solid rgba(255,255,255,0.06)}@media(max-width:768px){.hero h1{font-size:2rem}.tier.pop{transform:none}}</style></head><body><nav><div class="c"><a href="#" class="logo">${name}</a><div><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#" class="btn" style="margin-left:24px">Get Started</a></div></div></nav><section class="hero"><div class="c"><h1>${desc || name + ' — The Future of Productivity'}</h1><p>Everything you need to build, launch, and grow your digital product. Start free, scale infinitely.</p><a href="#" class="btn">Start Free Trial →</a></div></section><section id="features" class="c"><h2 style="text-align:center;font-size:2rem;font-weight:800;margin-bottom:40px">Features</h2><div class="features"><div class="feat"><div style="font-size:2rem">⚡</div><h3>Lightning Fast</h3><p>Optimized for speed. Your users will love the instant response times.</p></div><div class="feat"><div style="font-size:2rem">🔒</div><h3>Bank-Level Security</h3><p>Enterprise-grade encryption and compliance built in from day one.</p></div><div class="feat"><div style="font-size:2rem">📊</div><h3>Analytics Dashboard</h3><p>Real-time insights into user behavior, conversions, and growth metrics.</p></div><div class="feat"><div style="font-size:2rem">🔗</div><h3>API Integrations</h3><p>Connect with 100+ tools. Zapier, Slack, GitHub, Stripe, and more.</p></div><div class="feat"><div style="font-size:2rem">📱</div><h3>Mobile Ready</h3><p>Responsive design that works beautifully on every device and screen size.</p></div><div class="feat"><div style="font-size:2rem">🤖</div><h3>AI-Powered</h3><p>Smart automation that learns from your data and optimizes workflows.</p></div></div></section><section id="pricing" class="pricing"><h2>Simple Pricing</h2><div class="tiers"><div class="tier"><h3>Starter</h3><div class="price">$0</div><p>Perfect for getting started</p><ul><li>5 projects</li><li>1GB storage</li><li>Basic analytics</li><li>Email support</li></ul><a href="#" class="btn" style="width:100%;background:transparent;border:1px solid var(--p);color:var(--p)">Get Started</a></div><div class="tier pop"><h3>Pro</h3><div class="price">$29</div><p>For growing teams</p><ul><li>Unlimited projects</li><li>100GB storage</li><li>Advanced analytics</li><li>Priority support</li><li>Custom domain</li></ul><a href="#" class="btn" style="width:100%">Start Free Trial</a></div><div class="tier"><h3>Enterprise</h3><div class="price">Custom</div><p>For large organizations</p><ul><li>Everything in Pro</li><li>Unlimited storage</li><li>SSO & SAML</li><li>Dedicated support</li><li>SLA guarantee</li></ul><a href="#" class="btn" style="width:100%;background:transparent;border:1px solid var(--p);color:var(--p)">Contact Sales</a></div></div></section><footer><div class="c"><p>© 2026 ${name}. Built with ⚡ ZapCodes.</p></div></footer></body></html>` },
  ];
}

// ---- Blog ----
function generateBlog(safeName, name, desc, c) {
  return [
    { path: 'index.html', content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${name}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Georgia,serif;background:${c.bg};color:${c.text};line-height:1.8}.c{max-width:800px;margin:0 auto;padding:0 24px}header{padding:40px 0;border-bottom:1px solid rgba(255,255,255,0.06)}header h1{font-size:2rem;color:${c.primary}}header p{opacity:0.6;margin-top:4px}.posts{padding:40px 0}.post-card{padding:32px 0;border-bottom:1px solid rgba(255,255,255,0.06)}.post-card h2{font-size:1.4rem;margin-bottom:8px}.post-card h2 a{color:${c.text};text-decoration:none}.post-card h2 a:hover{color:${c.primary}}.meta{font-size:0.85rem;opacity:0.5;margin-bottom:12px}.excerpt{opacity:0.8}footer{padding:32px 0;text-align:center;opacity:0.4;font-size:0.85rem}</style></head><body><div class="c"><header><h1>${name}</h1><p>${desc || 'Thoughts, stories, and ideas.'}</p></header><div class="posts"><div class="post-card"><h2><a href="#">Getting Started with Web Development in 2026</a></h2><div class="meta">January 15, 2026 · 5 min read</div><p class="excerpt">The web development landscape has evolved dramatically. Here's everything you need to know to get started building modern websites and applications this year...</p></div><div class="post-card"><h2><a href="#">Why Every Developer Needs AI Tools</a></h2><div class="meta">January 8, 2026 · 4 min read</div><p class="excerpt">AI-powered development tools are transforming how we write, debug, and deploy code. Let's explore the tools that are making the biggest impact...</p></div><div class="post-card"><h2><a href="#">Building Your First Mobile App</a></h2><div class="meta">December 28, 2025 · 6 min read</div><p class="excerpt">Cross-platform frameworks like React Native and Flutter make it easier than ever to build mobile apps. Here's a beginner-friendly guide to get started...</p></div></div><footer><p>© 2026 ${name}. Built with ⚡ ZapCodes.</p></footer></div></body></html>` },
  ];
}

// ---- E-Commerce (static) ----
function generateEcommerceStatic(safeName, name, desc, c) {
  return [
    { path: 'package.json', content: JSON.stringify({ name: safeName, version: '1.0.0', type: 'module', scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' }, dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', 'react-router-dom': '^6.20.1' }, devDependencies: { vite: '^5.0.0', '@vitejs/plugin-react': '^4.2.0' } }, null, 2) },
    { path: 'vite.config.js', content: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });` },
    { path: 'index.html', content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${name}</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>` },
    { path: 'src/main.jsx', content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\nReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);` },
    { path: 'src/App.jsx', content: `import React, { useState } from 'react';\n\nconst products = [\n  { id: 1, name: 'Wireless Headphones', price: 79.99, emoji: '🎧', cat: 'Electronics' },\n  { id: 2, name: 'Smart Watch', price: 199.99, emoji: '⌚', cat: 'Electronics' },\n  { id: 3, name: 'Running Shoes', price: 129.99, emoji: '👟', cat: 'Sports' },\n  { id: 4, name: 'Backpack', price: 59.99, emoji: '🎒', cat: 'Accessories' },\n  { id: 5, name: 'Desk Lamp', price: 39.99, emoji: '💡', cat: 'Home' },\n  { id: 6, name: 'Coffee Maker', price: 89.99, emoji: '☕', cat: 'Home' },\n];\n\nexport default function App() {\n  const [cart, setCart] = useState([]);\n  const [view, setView] = useState('shop');\n  const addToCart = (p) => { const e = cart.find(i => i.id === p.id); if (e) setCart(cart.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i)); else setCart([...cart, { ...p, qty: 1 }]); };\n  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);\n  return (\n    <div style={{ minHeight: '100vh', background: '${c.bg}', color: '${c.text}', fontFamily: 'system-ui,sans-serif' }}>\n      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>\n        <span style={{ fontWeight: 800, fontSize: '1.2rem', color: '${c.primary}' }}>${name}</span>\n        <button onClick={() => setView(view === 'cart' ? 'shop' : 'cart')} style={{ background: '${c.primary}', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>\n          {view === 'cart' ? '← Shop' : \`🛒 Cart (\${cart.reduce((s,i)=>s+i.qty,0)})\`}\n        </button>\n      </nav>\n      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>\n        {view === 'shop' ? (\n          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20 }}>\n            {products.map(p => (\n              <div key={p.id} style={{ background: '${c.card}', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>\n                <div style={{ fontSize: '3rem', textAlign: 'center', margin: '16px 0' }}>{p.emoji}</div>\n                <h3 style={{ marginBottom: 4 }}>{p.name}</h3>\n                <p style={{ color: '${c.primary}', fontWeight: 800, fontSize: '1.2rem', marginBottom: 12 }}>\${p.price.toFixed(2)}</p>\n                <button onClick={() => addToCart(p)} style={{ width: '100%', background: '${c.primary}', color: '#fff', border: 'none', padding: '10px 0', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Add to Cart</button>\n              </div>\n            ))}\n          </div>\n        ) : (\n          <div>\n            <h2 style={{ marginBottom: 20 }}>Your Cart</h2>\n            {cart.length === 0 ? <p style={{opacity:0.5}}>Cart is empty</p> : cart.map(i => (\n              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>\n                <span>{i.emoji} {i.name} × {i.qty}</span>\n                <span style={{ fontWeight: 700 }}>\${(i.price * i.qty).toFixed(2)}</span>\n              </div>\n            ))}\n            {cart.length > 0 && <div style={{ marginTop: 20, textAlign: 'right', fontSize: '1.3rem', fontWeight: 800, color: '${c.primary}' }}>Total: \${total.toFixed(2)}</div>}\n          </div>\n        )}\n      </div>\n    </div>\n  );\n}` },
    { path: 'src/index.css', content: `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { background: ${c.bg}; color: ${c.text}; }` },
  ];
}

// ---- Dashboard (static) ----
function generateDashboardStatic(safeName, name, desc, c) {
  return [
    { path: 'package.json', content: JSON.stringify({ name: safeName, version: '1.0.0', type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', recharts: '^2.10.0' }, devDependencies: { vite: '^5.0.0', '@vitejs/plugin-react': '^4.2.0' } }, null, 2) },
    { path: 'vite.config.js', content: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });` },
    { path: 'index.html', content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${name}</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>` },
    { path: 'src/main.jsx', content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\nReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);` },
    { path: 'src/App.jsx', content: `import React from 'react';\nimport { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';\n\nconst data = [\n  { month: 'Jan', users: 400, revenue: 2400 },\n  { month: 'Feb', users: 600, revenue: 3600 },\n  { month: 'Mar', users: 900, revenue: 5400 },\n  { month: 'Apr', users: 1200, revenue: 7200 },\n  { month: 'May', users: 1800, revenue: 10800 },\n  { month: 'Jun', users: 2400, revenue: 14400 },\n];\n\nconst stats = [\n  { label: 'Total Users', value: '2,400', change: '+18%', icon: '👥' },\n  { label: 'Revenue', value: '$14,400', change: '+33%', icon: '💰' },\n  { label: 'Orders', value: '842', change: '+12%', icon: '📦' },\n  { label: 'Conversion', value: '3.2%', change: '+0.5%', icon: '📈' },\n];\n\nexport default function App() {\n  return (\n    <div style={{ minHeight: '100vh', background: '${c.bg}', color: '${c.text}', fontFamily: 'system-ui,sans-serif' }}>\n      <nav style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>\n        <span style={{ fontWeight: 800, fontSize: '1.2rem', color: '${c.primary}' }}>📊 ${name}</span>\n      </nav>\n      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>\n        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 32 }}>\n          {stats.map(s => (\n            <div key={s.label} style={{ background: '${c.card}', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 }}>\n              <div style={{ fontSize: '1.5rem' }}>{s.icon}</div>\n              <div style={{ fontSize: '1.5rem', fontWeight: 800, margin: '8px 0 4px' }}>{s.value}</div>\n              <div style={{ fontSize: '0.85rem', opacity: 0.6 }}>{s.label}</div>\n              <div style={{ fontSize: '0.8rem', color: '#00e5a0', marginTop: 4 }}>{s.change}</div>\n            </div>\n          ))}\n        </div>\n        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(400px,1fr))', gap: 24 }}>\n          <div style={{ background: '${c.card}', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 }}>\n            <h3 style={{ marginBottom: 16 }}>User Growth</h3>\n            <ResponsiveContainer width="100%" height={250}>\n              <LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="month" stroke="#888" /><YAxis stroke="#888" /><Tooltip /><Line type="monotone" dataKey="users" stroke="${c.primary}" strokeWidth={2} /></LineChart>\n            </ResponsiveContainer>\n          </div>\n          <div style={{ background: '${c.card}', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 }}>\n            <h3 style={{ marginBottom: 16 }}>Revenue</h3>\n            <ResponsiveContainer width="100%" height={250}>\n              <BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="month" stroke="#888" /><YAxis stroke="#888" /><Tooltip /><Bar dataKey="revenue" fill="${c.primary}" radius={[4,4,0,0]} /></BarChart>\n            </ResponsiveContainer>\n          </div>\n        </div>\n      </div>\n    </div>\n  );\n}` },
    { path: 'src/index.css', content: `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { background: ${c.bg}; color: ${c.text}; }` },
  ];
}

// ---- Mobile App ----
function generateMobileApp(safeName, name, desc, c) {
  return [
    { path: 'App.js', content: `import React from 'react';\nimport { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';\n\nexport default function App() {\n  return (\n    <ScrollView style={s.container}>\n      <StatusBar barStyle="light-content" />\n      <View style={s.header}><Text style={s.logo}>${name}</Text></View>\n      <View style={s.hero}>\n        <Text style={s.title}>Welcome to ${name}</Text>\n        <Text style={s.subtitle}>${desc || 'Your new mobile app'}</Text>\n        <TouchableOpacity style={s.btn}><Text style={s.btnText}>Get Started</Text></TouchableOpacity>\n      </View>\n      <View style={s.features}>\n        {[{ icon: '⚡', title: 'Fast', desc: 'Blazing fast performance' }, { icon: '🔒', title: 'Secure', desc: 'Bank-level encryption' }, { icon: '📱', title: 'Native', desc: 'True native experience' }].map((f, i) => (\n          <View key={i} style={s.feat}><Text style={{ fontSize: 28 }}>{f.icon}</Text><Text style={s.featTitle}>{f.title}</Text><Text style={s.featDesc}>{f.desc}</Text></View>\n        ))}\n      </View>\n    </ScrollView>\n  );\n}\n\nconst s = StyleSheet.create({\n  container: { flex: 1, backgroundColor: '#06060b' },\n  header: { padding: 20, paddingTop: 60 },\n  logo: { color: '${c.primary}', fontSize: 24, fontWeight: '800' },\n  hero: { padding: 20, alignItems: 'center', marginTop: 40 },\n  title: { color: '#e2e8f0', fontSize: 28, fontWeight: '800', textAlign: 'center' },\n  subtitle: { color: '#94a3b8', fontSize: 16, marginTop: 12, textAlign: 'center' },\n  btn: { backgroundColor: '${c.primary}', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10, marginTop: 32 },\n  btnText: { color: 'white', fontWeight: '700', fontSize: 16 },\n  features: { padding: 20, gap: 12, marginTop: 40 },\n  feat: { backgroundColor: '#11111b', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },\n  featTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 16, marginTop: 8 },\n  featDesc: { color: '#94a3b8', fontSize: 14, marginTop: 4 },\n});` },
    { path: 'app.json', content: JSON.stringify({ expo: { name, slug: safeName, version: '1.0.0', orientation: 'portrait', platforms: ['ios', 'android'], ios: { supportsTablet: true }, android: { adaptiveIcon: { backgroundColor: '#06060b' } } } }, null, 2) },
    { path: 'package.json', content: JSON.stringify({ name: safeName, version: '1.0.0', main: 'node_modules/expo/AppEntry.js', scripts: { start: 'expo start', android: 'expo start --android', ios: 'expo start --ios' }, dependencies: { expo: '~51.0.0', react: '18.2.0', 'react-native': '0.74.5' } }, null, 2) },
  ];
}

// ---- WebApp (static) ----
function generateWebAppStatic(safeName, name, desc, c) {
  return [
    { path: 'backend/package.json', content: JSON.stringify({ name: safeName + '-api', version: '1.0.0', scripts: { start: 'node server.js' }, dependencies: { express: '^4.18.2', cors: '^2.8.5' } }, null, 2) },
    { path: 'backend/server.js', content: `const express = require('express');\nconst cors = require('cors');\nconst app = express();\napp.use(cors());\napp.use(express.json());\n\nlet items = [{ id: 1, title: 'Welcome to ${name}', done: false }];\n\napp.get('/api/items', (req, res) => res.json(items));\napp.post('/api/items', (req, res) => { const item = { id: Date.now(), ...req.body, done: false }; items.push(item); res.status(201).json(item); });\napp.put('/api/items/:id', (req, res) => { items = items.map(i => i.id === +req.params.id ? { ...i, ...req.body } : i); res.json({ success: true }); });\napp.delete('/api/items/:id', (req, res) => { items = items.filter(i => i.id !== +req.params.id); res.json({ success: true }); });\n\nconst PORT = process.env.PORT || 4000;\napp.listen(PORT, () => console.log(\`${name} API on port \${PORT}\`));` },
    { path: 'frontend/package.json', content: JSON.stringify({ name: safeName + '-web', version: '1.0.0', type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', axios: '^1.6.2' }, devDependencies: { vite: '^5.0.0', '@vitejs/plugin-react': '^4.2.0' } }, null, 2) },
    { path: 'frontend/vite.config.js', content: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()], server: { proxy: { '/api': 'http://localhost:4000' } } });` },
    { path: 'frontend/index.html', content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${name}</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>` },
    { path: 'frontend/src/main.jsx', content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);` },
    { path: 'frontend/src/App.jsx', content: `import React, { useState, useEffect } from 'react';\nimport axios from 'axios';\n\nexport default function App() {\n  const [items, setItems] = useState([]);\n  const [input, setInput] = useState('');\n  useEffect(() => { axios.get('/api/items').then(r => setItems(r.data)); }, []);\n  const add = async () => { if (!input.trim()) return; const { data } = await axios.post('/api/items', { title: input }); setItems([...items, data]); setInput(''); };\n  const del = async (id) => { await axios.delete('/api/items/' + id); setItems(items.filter(i => i.id !== id)); };\n  return (\n    <div style={{ minHeight: '100vh', background: '${c.bg}', color: '${c.text}', fontFamily: 'system-ui,sans-serif', padding: 24 }}>\n      <h1 style={{ color: '${c.primary}', marginBottom: 24 }}>${name}</h1>\n      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>\n        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Add item..." style={{ flex: 1, padding: '10px 14px', background: '${c.card}', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '${c.text}' }} />\n        <button onClick={add} style={{ background: '${c.primary}', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Add</button>\n      </div>\n      {items.map(i => (\n        <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>\n          <span>{i.title}</span>\n          <button onClick={() => del(i.id)} style={{ background: 'none', border: 'none', color: '#ff4466', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>\n        </div>\n      ))}\n    </div>\n  );\n}` },
    { path: 'README.md', content: `# ${name}\n\nFull-Stack Web App — Generated by ZapCodes\n\n## Quick Start\n\n### Backend\n\`\`\`bash\ncd backend && npm install && npm start\n\`\`\`\n\n### Frontend\n\`\`\`bash\ncd frontend && npm install && npm run dev\n\`\`\`\n\nBackend runs on :4000, frontend on :5173 with proxy.` },
  ];
}

// ---- SaaS (static) ----
function generateSaaSStatic(safeName, name, desc, c) {
  // Produces same structure as webapp + auth placeholder
  const base = generateWebAppStatic(safeName, name, desc, c);
  base.push({ path: 'frontend/src/pages/Pricing.jsx', content: `import React from 'react';\nexport default function Pricing() {\n  const tiers = [\n    { name: 'Free', price: '$0', features: ['5 projects', 'Basic analytics', 'Email support'] },\n    { name: 'Pro', price: '$29/mo', features: ['Unlimited projects', 'Advanced analytics', 'Priority support', 'Custom domain'], popular: true },\n    { name: 'Enterprise', price: 'Custom', features: ['Everything in Pro', 'SSO', 'SLA', 'Dedicated support'] },\n  ];\n  return (\n    <div style={{ padding: 40 }}>\n      <h2 style={{ textAlign: 'center', marginBottom: 32 }}>Pricing</h2>\n      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20, maxWidth: 900, margin: '0 auto' }}>\n        {tiers.map(t => (\n          <div key={t.name} style={{ background: '${c.card}', border: t.popular ? '2px solid ${c.primary}' : '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28, textAlign: 'center' }}>\n            <h3>{t.name}</h3>\n            <div style={{ fontSize: '2rem', fontWeight: 900, color: '${c.primary}', margin: '12px 0' }}>{t.price}</div>\n            {t.features.map(f => <p key={f} style={{ padding: '4px 0', opacity: 0.8, fontSize: '0.9rem' }}>✓ {f}</p>)}\n            <button style={{ marginTop: 20, width: '100%', padding: '10px 0', background: t.popular ? '${c.primary}' : 'transparent', color: t.popular ? '#fff' : '${c.primary}', border: t.popular ? 'none' : '1px solid ${c.primary}', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>{t.popular ? 'Start Free Trial' : 'Get Started'}</button>\n          </div>\n        ))}\n      </div>\n    </div>\n  );\n}` });
  return base;
}

// ---- Full-Stack + Mobile ----
function generateFullStackMobile(safeName, name, desc, c) {
  return [
    { path: 'backend/package.json', content: JSON.stringify({ name: safeName + '-backend', version: '1.0.0', scripts: { start: 'node server.js' }, dependencies: { express: '^4.18.2', cors: '^2.8.5', 'socket.io': '^4.7.2' } }, null, 2) },
    { path: 'backend/server.js', content: `const express = require('express');\nconst cors = require('cors');\nconst { createServer } = require('http');\nconst { Server } = require('socket.io');\nconst app = express();\nconst http = createServer(app);\nconst io = new Server(http, { cors: { origin: '*' } });\napp.use(cors()); app.use(express.json());\nlet items = [{ id: 1, title: 'Welcome to ${name}', done: false }];\napp.get('/api/items', (req, res) => res.json(items));\napp.post('/api/items', (req, res) => { const item = { id: Date.now(), ...req.body }; items.push(item); io.emit('item-added', item); res.status(201).json(item); });\napp.delete('/api/items/:id', (req, res) => { items = items.filter(i => i.id !== +req.params.id); io.emit('item-deleted', { id: +req.params.id }); res.json({ ok: true }); });\nio.on('connection', s => console.log('Connected:', s.id));\nconst PORT = process.env.PORT || 4000;\nhttp.listen(PORT, () => console.log('${name} API on port ' + PORT));` },
    { path: 'web/index.html', content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${name}</title><script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.2/socket.io.min.js"></script><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:${c.bg};color:${c.text}}.c{max-width:600px;margin:0 auto;padding:40px 20px}h1{color:${c.primary};margin-bottom:8px}.sub{color:#888;margin-bottom:32px}input{width:100%;padding:12px 16px;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:#11111b;color:#e8e8f0;font-size:1rem;margin-bottom:12px}button{padding:12px 24px;border:none;border-radius:8px;background:${c.primary};color:#fff;font-weight:700;cursor:pointer;width:100%;font-size:1rem}.item{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin-bottom:8px}.del{background:none;border:none;color:#ff4466;cursor:pointer;font-size:1.2rem;width:auto;padding:4px 8px}.badge{display:inline-block;padding:4px 12px;border-radius:100px;font-size:0.75rem;font-weight:600;background:rgba(0,229,160,0.1);color:#00e5a0;margin-bottom:16px}</style></head><body><div class="c"><span class="badge">🟢 Real-time synced</span><h1>${name}</h1><p class="sub">${desc || 'Full-stack + mobile companion'}</p><input id="input" placeholder="Add item..."><button onclick="addItem()">Add Item</button><div id="list" style="margin-top:24px"></div></div><script>const API='http://localhost:4000';const socket=io(API);async function load(){const r=await fetch(API+'/api/items');const items=await r.json();document.getElementById('list').innerHTML=items.map(i=>'<div class="item"><span>'+i.title+'</span><button class="del" onclick="del('+i.id+')">×</button></div>').join('')}async function addItem(){const inp=document.getElementById('input');if(!inp.value.trim())return;await fetch(API+'/api/items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:inp.value})});inp.value='';load()}async function del(id){await fetch(API+'/api/items/'+id,{method:'DELETE'});load()}socket.on('item-added',load);socket.on('item-deleted',load);load()</script></body></html>` },
    { path: 'mobile/App.js', content: `import React,{useState,useEffect} from 'react';import{View,Text,TextInput,TouchableOpacity,FlatList,StyleSheet,StatusBar} from 'react-native';import io from 'socket.io-client';\nconst API='http://localhost:4000';const socket=io(API);\nexport default function App(){const[items,setItems]=useState([]);const[input,setInput]=useState('');\nuseEffect(()=>{load();socket.on('item-added',load);socket.on('item-deleted',load);return()=>{socket.off('item-added');socket.off('item-deleted')}},[]);\nconst load=async()=>{try{const r=await fetch(API+'/api/items');setItems(await r.json())}catch(e){console.error(e)}};\nconst add=async()=>{if(!input.trim())return;await fetch(API+'/api/items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:input})});setInput('')};\nconst del=async(id)=>{await fetch(API+'/api/items/'+id,{method:'DELETE'})};\nreturn(<View style={s.c}><StatusBar barStyle="light-content"/><View style={s.badge}><View style={s.dot}/><Text style={s.badgeText}>Synced with web</Text></View><Text style={s.title}>${name}</Text><Text style={s.sub}>${desc||'Mobile companion'}</Text><TextInput style={s.input} value={input} onChangeText={setInput} placeholder="Add item..." placeholderTextColor="#666" onSubmitEditing={add}/><TouchableOpacity style={s.btn} onPress={add}><Text style={s.btnText}>Add Item</Text></TouchableOpacity><FlatList data={items} keyExtractor={i=>i.id.toString()} renderItem={({item})=>(<View style={s.item}><Text style={s.itemText}>{item.title}</Text><TouchableOpacity onPress={()=>del(item.id)}><Text style={s.delBtn}>×</Text></TouchableOpacity></View>)} style={{marginTop:20}}/></View>)}\nconst s=StyleSheet.create({c:{flex:1,backgroundColor:'#06060b',padding:20,paddingTop:60},badge:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'rgba(0,229,160,0.1)',paddingHorizontal:12,paddingVertical:6,borderRadius:100,alignSelf:'flex-start',marginBottom:20},dot:{width:8,height:8,borderRadius:4,backgroundColor:'#00e5a0'},badgeText:{color:'#00e5a0',fontSize:12,fontWeight:'600'},title:{fontSize:28,fontWeight:'800',color:'${c.primary}',marginBottom:4},sub:{color:'#888',marginBottom:24},input:{backgroundColor:'#11111b',borderWidth:1,borderColor:'rgba(255,255,255,0.1)',borderRadius:8,padding:14,color:'#e8e8f0',fontSize:16,marginBottom:12},btn:{backgroundColor:'${c.primary}',padding:14,borderRadius:8,alignItems:'center'},btnText:{color:'#fff',fontWeight:'700',fontSize:16},item:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:14,borderWidth:1,borderColor:'rgba(255,255,255,0.06)',borderRadius:8,marginBottom:8},itemText:{color:'#e8e8f0'},delBtn:{color:'#ff4466',fontSize:24,paddingHorizontal:8}});` },
    { path: 'mobile/package.json', content: JSON.stringify({ name: safeName + '-mobile', version: '1.0.0', main: 'App.js', scripts: { start: 'npx expo start' }, dependencies: { expo: '~51.0.0', react: '18.2.0', 'react-native': '0.74.5', 'socket.io-client': '^4.7.2' } }, null, 2) },
    { path: 'mobile/app.json', content: JSON.stringify({ expo: { name, slug: safeName, version: '1.0.0', platforms: ['ios', 'android'] } }, null, 2) },
    { path: 'README.md', content: `# ${name}\n\nFull-Stack + Mobile — Generated by ZapCodes\n\n## Setup\n\n### Backend\n\`\`\`\ncd backend && npm install && npm start\n\`\`\`\n\n### Web\nOpen web/index.html or deploy to Vercel\n\n### Mobile\n\`\`\`\ncd mobile && npm install && npx expo start\n\`\`\`\n\nAll platforms sync in real-time via Socket.IO.` },
  ];
}

// ================================================================
// DEPLOYMENT GUIDES & HOSTING INSTRUCTIONS
// ================================================================
function getDeploymentGuide(template, projectName) {
  if (template === 'mobile') {
    return { title: 'Deploy Your Mobile App', steps: [
      { step: 1, title: 'Install Expo', detail: 'Go to expo.dev, create account. Install Expo Go on your phone.' },
      { step: 2, title: 'Upload to GitHub', detail: 'Create a new repo and upload all files.' },
      { step: 3, title: 'Install Dependencies', detail: 'npm install' },
      { step: 4, title: 'Start', detail: 'npx expo start — scan QR with Expo Go.' },
      { step: 5, title: 'Build for Stores', detail: 'eas build --platform all for .apk/.ipa' },
    ] };
  }
  return { title: 'Deploy Your Website (Free)', steps: [
    { step: 1, title: 'Create GitHub Account', detail: 'Go to github.com and sign up.' },
    { step: 2, title: 'Create Repository', detail: `Click "New" → name it "${projectName}" → Create.` },
    { step: 3, title: 'Upload Files', detail: '"Add file" → "Upload files" → drag all files → Commit.' },
    { step: 4, title: 'Connect to Vercel', detail: `Go to vercel.com → sign up with GitHub → "Add New Project" → select "${projectName}" → Deploy.` },
    { step: 5, title: 'Live!', detail: `Vercel gives you ${projectName}.vercel.app. Add custom domain in Settings.` },
  ], tips: ['Free hosting on Vercel', 'Auto-deploys on git push', 'Custom domains in Settings → Domains'] };
}

function generateHostingInstructions(detection, owner, repo, repoInfo) {
  const instructions = { platforms: [], envVars: [], commands: {} };
  if (detection.hasPackageJson) {
    instructions.platforms.push({ name: 'Vercel', steps: ['Import from GitHub', 'Framework auto-detected', 'Deploy'] });
    instructions.commands.install = 'npm install';
    instructions.commands.build = 'npm run build';
    instructions.commands.start = 'npm start';
  }
  if (detection.hasBackendDir) {
    instructions.platforms.push({ name: 'Render', steps: ['New Web Service from GitHub', `Root Directory: backend/`, 'Build: npm install', 'Start: node server.js'] });
  }
  return instructions;
}

module.exports = router;
