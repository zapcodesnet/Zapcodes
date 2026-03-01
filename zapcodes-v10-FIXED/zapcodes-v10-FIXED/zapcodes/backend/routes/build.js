const express = require('express');
const { optionalAuth, auth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Project templates
const templates = {
  portfolio: {
    name: 'Portfolio / Personal Site',
    icon: '🎨',
    description: 'A beautiful personal portfolio to showcase your work',
    tech: 'HTML + CSS + JavaScript',
  },
  landing: {
    name: 'Business Landing Page',
    icon: '🚀',
    description: 'Professional landing page for your business or product',
    tech: 'HTML + CSS + JavaScript',
  },
  ecommerce: {
    name: 'E-Commerce Store',
    icon: '🛒',
    description: 'Online store with product listings, cart, and checkout',
    tech: 'React + Vite',
  },
  blog: {
    name: 'Blog / Content Site',
    icon: '📝',
    description: 'Clean blog with posts, categories, and search',
    tech: 'HTML + CSS + JavaScript',
  },
  dashboard: {
    name: 'Admin Dashboard',
    icon: '📊',
    description: 'Data dashboard with charts, tables, and analytics',
    tech: 'React + Vite',
  },
  mobile: {
    name: 'Mobile App (React Native)',
    icon: '📱',
    description: 'Cross-platform mobile app for iOS and Android',
    tech: 'React Native + Expo',
  },
  webapp: {
    name: 'Full-Stack Web App',
    icon: '⚡',
    description: 'Web app with frontend, backend API, and database',
    tech: 'React + Node.js + Express',
  },
  saas: {
    name: 'SaaS Starter',
    icon: '💎',
    description: 'SaaS template with auth, payments, and dashboard',
    tech: 'React + Node.js + Stripe',
  },
  'fullstack-mobile': {
    name: 'Full-Stack + Mobile Companion',
    icon: '🚀📱',
    description: 'Complete web app + synced React Native iOS/Android companion',
    tech: 'React + Node.js + React Native + Socket.IO',
    proOnly: true,
  },
};

// GET /api/build/templates — Available project templates
router.get('/templates', (req, res) => {
  res.json({ templates });
});

// POST /api/build/import-repo — Import & analyze a GitHub repo
router.post('/import-repo', optionalAuth, async (req, res) => {
  try {
    const { repoUrl } = req.body;
    if (!repoUrl) return res.status(400).json({ error: 'Repository URL required' });

    // Parse GitHub URL
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
    if (!match) return res.status(400).json({ error: 'Invalid GitHub URL. Use format: https://github.com/owner/repo' });

    const [, owner, repoName] = match;
    const cleanRepo = repoName.replace(/\.git$/, '');

    // Use GitHub API to fetch repo info (no auth needed for public repos)
    const axios = require('axios');
    const headers = {};

    // Use user's GitHub token for private repos
    if (req.user) {
      const User = require('../models/User');
      const user = await User.findById(req.user._id).select('+githubToken');
      if (user?.githubToken) headers.Authorization = `token ${user.githubToken}`;
    }

    let repoInfo, contents, packageJson, languages;

    try {
      const [repoRes, contentsRes, langRes] = await Promise.all([
        axios.get(`https://api.github.com/repos/${owner}/${cleanRepo}`, { headers }),
        axios.get(`https://api.github.com/repos/${owner}/${cleanRepo}/contents`, { headers }).catch(() => ({ data: [] })),
        axios.get(`https://api.github.com/repos/${owner}/${cleanRepo}/languages`, { headers }).catch(() => ({ data: {} })),
      ]);
      repoInfo = repoRes.data;
      contents = contentsRes.data;
      languages = langRes.data;
    } catch (err) {
      if (err.response?.status === 404) {
        return res.status(404).json({ error: 'Repository not found. If private, connect your GitHub token in Settings.' });
      }
      return res.status(502).json({ error: 'Failed to fetch repository', details: err.message });
    }

    // Try to read package.json
    try {
      const pkgRes = await axios.get(`https://api.github.com/repos/${owner}/${cleanRepo}/contents/package.json`, { headers });
      packageJson = JSON.parse(Buffer.from(pkgRes.data.content, 'base64').toString());
    } catch (e) { packageJson = null; }

    // Detect project type
    const fileNames = Array.isArray(contents) ? contents.map(f => f.name) : [];
    const detection = detectProjectType(fileNames, packageJson, languages);

    // Generate hosting instructions
    const instructions = generateHostingInstructions(detection, owner, cleanRepo, repoInfo);

    // Build file tree
    const fileTree = Array.isArray(contents) ? contents.map(f => ({
      name: f.name,
      type: f.type, // 'file' or 'dir'
      size: f.size,
    })) : [];

    res.json({
      repo: {
        name: repoInfo.full_name,
        description: repoInfo.description,
        stars: repoInfo.stargazers_count,
        language: repoInfo.language,
        private: repoInfo.private,
        defaultBranch: repoInfo.default_branch,
        updatedAt: repoInfo.updated_at,
        url: repoInfo.html_url,
      },
      detection,
      fileTree,
      languages,
      dependencies: packageJson?.dependencies ? Object.keys(packageJson.dependencies) : [],
      devDependencies: packageJson?.devDependencies ? Object.keys(packageJson.devDependencies) : [],
      instructions,
    });
  } catch (err) {
    res.status(500).json({ error: 'Import failed', details: err.message });
  }
});

function detectProjectType(files, pkg, languages) {
  const deps = pkg?.dependencies || {};
  const devDeps = pkg?.devDependencies || {};
  const allDeps = { ...deps, ...devDeps };
  const result = { frontend: null, backend: null, database: null, mobile: false, hasPayments: false, framework: null };

  // Frontend detection
  if (allDeps['next']) { result.frontend = 'Next.js'; result.framework = 'Next.js'; }
  else if (allDeps['react']) { result.frontend = 'React'; result.framework = allDeps['vite'] ? 'Vite + React' : 'React'; }
  else if (allDeps['vue']) { result.frontend = 'Vue'; result.framework = 'Vue'; }
  else if (allDeps['svelte'] || allDeps['@sveltejs/kit']) { result.frontend = 'Svelte'; result.framework = 'SvelteKit'; }
  else if (allDeps['angular'] || allDeps['@angular/core']) { result.frontend = 'Angular'; }
  else if (files.includes('index.html')) { result.frontend = 'Static HTML'; }

  // Backend detection
  if (allDeps['express']) result.backend = 'Express.js';
  else if (allDeps['fastify']) result.backend = 'Fastify';
  else if (allDeps['koa']) result.backend = 'Koa';
  else if (files.includes('requirements.txt') || files.includes('manage.py')) result.backend = 'Python/Django';
  else if (languages?.Python) result.backend = 'Python';

  // Database detection
  if (allDeps['mongoose'] || allDeps['mongodb']) result.database = 'MongoDB';
  else if (allDeps['pg'] || allDeps['knex'] || allDeps['prisma']) result.database = 'PostgreSQL';
  else if (allDeps['firebase'] || allDeps['firebase-admin']) result.database = 'Firebase';

  // Mobile
  if (allDeps['react-native'] || allDeps['expo']) result.mobile = true;

  // Payments
  if (allDeps['stripe']) result.hasPayments = true;

  return result;
}

function generateHostingInstructions(detection, owner, repo, repoInfo) {
  const steps = [];

  // Frontend hosting
  if (detection.frontend) {
    steps.push({
      category: 'Frontend Hosting',
      platform: detection.frontend === 'Next.js' ? 'Vercel (recommended for Next.js)' : 'Vercel or Netlify',
      icon: '🌐',
      steps: [
        `Go to https://vercel.com and sign up with GitHub`,
        `Click "Add New Project" → Import "${owner}/${repo}"`,
        detection.framework === 'Next.js' ? 'Vercel auto-detects Next.js — no config needed' : `Set build command to "npm run build" and output to "dist" or "build"`,
        'Click "Deploy" — your site will be live in ~60 seconds',
        'To add custom domain: Settings → Domains → Add your domain',
      ],
      tips: ['Free tier includes unlimited deployments', 'Every push to GitHub auto-deploys'],
      docsUrl: 'https://vercel.com/docs',
    });
  }

  // Backend hosting
  if (detection.backend) {
    steps.push({
      category: 'Backend Hosting',
      platform: 'Render (recommended)',
      icon: '⚙️',
      steps: [
        'Go to https://render.com and sign up with GitHub',
        `Click "New" → "Web Service" → Connect "${owner}/${repo}"`,
        `Set build command: "npm install"`,
        `Set start command: "npm start" or "node server.js"`,
        'Add environment variables (DATABASE_URL, JWT_SECRET, etc.) in Settings → Environment',
        'Click "Create Web Service" — deploys automatically',
      ],
      tips: ['Free tier available (spins down after inactivity)', 'Paid tier ($7/mo) for always-on'],
      docsUrl: 'https://render.com/docs',
    });
  }

  // Database
  if (detection.database) {
    const isPostgres = detection.database === 'PostgreSQL';
    steps.push({
      category: 'Database',
      platform: isPostgres ? 'Supabase or Neon (PostgreSQL)' : detection.database === 'Firebase' ? 'Firebase' : 'MongoDB Atlas',
      icon: '🗄️',
      steps: isPostgres ? [
        'Go to https://supabase.com and create a project',
        'Copy the connection string from Settings → Database',
        'Add it as DATABASE_URL in your backend environment variables',
        'Run migrations if needed: npx prisma migrate deploy (or knex migrate:latest)',
      ] : detection.database === 'Firebase' ? [
        'Go to https://console.firebase.google.com',
        'Create a project and enable Firestore',
        'Download service account key → add to environment variables',
      ] : [
        'Go to https://cloud.mongodb.com and create a free cluster',
        'Create a database user with a strong password',
        'Click "Connect" → "Connect your application" → Copy connection string',
        'Add as MONGODB_URI in your backend environment variables',
        'Network Access → Allow 0.0.0.0/0 (or restrict to your backend IP)',
      ],
      tips: ['Always enable authentication on your database', 'Set up automated backups'],
      docsUrl: isPostgres ? 'https://supabase.com/docs' : 'https://www.mongodb.com/docs/atlas/',
    });
  }

  // Payments
  if (detection.hasPayments) {
    steps.push({
      category: 'Payment Integration',
      platform: 'Stripe',
      icon: '💳',
      steps: [
        'Go to https://dashboard.stripe.com/register and create an account',
        'Get API keys from Developers → API keys',
        'Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY to your backend env',
        'Create products/prices in the Stripe Dashboard → Products',
        'Set up webhook endpoint: Developers → Webhooks → Add endpoint (your-backend/api/stripe/webhook)',
        'Test in sandbox mode before going live — toggle "Test mode" in dashboard',
      ],
      tips: ['Always test with Stripe test cards (4242 4242 4242 4242)', 'Set up Stripe CLI for local webhook testing'],
      docsUrl: 'https://stripe.com/docs',
    });
  }

  // Mobile
  if (detection.mobile) {
    steps.push({
      category: 'Mobile App',
      platform: 'Expo / EAS Build',
      icon: '📱',
      steps: [
        'Install: npm install -g eas-cli',
        'Login: eas login (or create account at expo.dev)',
        'Configure: eas build:configure',
        'Build for both platforms: eas build --platform all',
        'Submit to stores: eas submit --platform ios (and android)',
      ],
      tips: ['Expo Go app lets you test on real devices instantly', 'Internal distribution lets you share builds without app store review'],
      docsUrl: 'https://docs.expo.dev/build/introduction/',
    });
  }

  return steps;
}

// POST /api/build/generate — Generate a project
router.post('/generate', optionalAuth, async (req, res) => {
  try {
    const { template, projectName, description, colorScheme, features } = req.body;

    if (!template || !projectName) {
      return res.status(400).json({ error: 'Template and project name are required' });
    }

    const templateInfo = templates[template];
    if (!templateInfo) {
      return res.status(400).json({ error: 'Invalid template' });
    }

    // Enforce build limits for authenticated users
    if (req.user) {
      const plan = req.user.plan || 'free';
      const limits = { free: 3, starter: 25, pro: 999999, diamond: 999999 };
      const limit = limits[plan] || 3;

      if (req.user.buildsUsed >= limit) {
        return res.status(403).json({
          error: 'Build limit reached',
          message: `Your ${plan} plan allows ${limit} builds/month. Upgrade for more.`,
          currentPlan: plan,
          buildsUsed: req.user.buildsUsed,
          buildsLimit: limit,
        });
      }

      // Check template access (free plan = basic templates only)
      const freeTemplates = ['portfolio', 'landing', 'blog'];
      if (plan === 'free' && !freeTemplates.includes(template)) {
        return res.status(403).json({
          error: 'Template requires upgrade',
          message: `The ${templateInfo.name} template requires a Starter or Pro plan.`,
          currentPlan: plan,
        });
      }

      // Pro-only templates (also allowed for diamond)
      if (templateInfo.proOnly && plan !== 'pro' && plan !== 'diamond') {
        return res.status(403).json({
          error: 'Pro subscription required',
          message: `The ${templateInfo.name} template requires a Pro or Diamond plan.`,
          currentPlan: plan,
        });
      }

      // Increment build counter AND generation counter
      req.user.buildsUsed += 1;
      req.user.generationsUsed = (req.user.generationsUsed || 0) + 1;
      await req.user.save();
    }

    const projectId = uuidv4().slice(0, 8);
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

    // Generate the project files based on template
    let files;
    switch (template) {
      case 'portfolio':
        files = generatePortfolio(safeName, projectName, description, colorScheme, features);
        break;
      case 'landing':
        files = generateLanding(safeName, projectName, description, colorScheme, features);
        break;
      case 'blog':
        files = generateBlog(safeName, projectName, description, colorScheme, features);
        break;
      case 'ecommerce':
        files = generateEcommerce(safeName, projectName, description, colorScheme, features);
        break;
      case 'dashboard':
        files = generateDashboard(safeName, projectName, description, colorScheme, features);
        break;
      case 'mobile':
        files = generateMobileApp(safeName, projectName, description, colorScheme, features);
        break;
      case 'webapp':
        files = generateWebApp(safeName, projectName, description, colorScheme, features);
        break;
      case 'saas':
        files = generateSaaS(safeName, projectName, description, colorScheme, features);
        break;
      case 'fullstack-mobile':
        files = generateFullStackMobile(safeName, projectName, description, colorScheme, features);
        break;
      default:
        files = generatePortfolio(safeName, projectName, description, colorScheme, features);
    }

    // Generate deployment guide
    const deployGuide = getDeploymentGuide(template, safeName);

    res.json({
      projectId,
      projectName: safeName,
      template: templateInfo,
      files,
      deployGuide,
      totalFiles: files.length,
    });
  } catch (err) {
    console.error('Build generation error:', err);
    res.status(500).json({ error: 'Failed to generate project', details: err.message });
  }
});

// GET /api/build/deploy-guide/:template — Get deployment steps
router.get('/deploy-guide/:template', (req, res) => {
  const guide = getDeploymentGuide(req.params.template, 'my-project');
  res.json({ guide });
});

// ============ PROJECT GENERATORS ============

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

function generatePortfolio(safeName, name, desc, colorScheme, features) {
  const c = getColors(colorScheme || 'modern');
  const description = desc || 'Welcome to my portfolio. I build amazing digital experiences.';

  return [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <meta name="description" content="${description}">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <nav class="nav">
    <div class="container nav-inner">
      <a href="#" class="logo">${name}</a>
      <div class="nav-links">
        <a href="#about">About</a>
        <a href="#projects">Projects</a>
        <a href="#contact" class="btn btn-primary">Contact</a>
      </div>
    </div>
  </nav>

  <section class="hero">
    <div class="container">
      <p class="hero-label">👋 Hello, I'm</p>
      <h1 class="hero-title">${name}</h1>
      <p class="hero-sub">${description}</p>
      <div class="hero-actions">
        <a href="#projects" class="btn btn-primary">View My Work →</a>
        <a href="#contact" class="btn btn-secondary">Get In Touch</a>
      </div>
    </div>
  </section>

  <section id="about" class="section">
    <div class="container">
      <h2 class="section-title">About Me</h2>
      <p class="section-text">I'm a passionate developer and designer who loves creating beautiful, functional digital experiences. With expertise in modern web technologies, I bring ideas to life.</p>
      <div class="skills-grid">
        <div class="skill-card">🎨 UI/UX Design</div>
        <div class="skill-card">⚛️ React</div>
        <div class="skill-card">🟢 Node.js</div>
        <div class="skill-card">📱 Mobile Apps</div>
        <div class="skill-card">🗄️ Databases</div>
        <div class="skill-card">☁️ Cloud/DevOps</div>
      </div>
    </div>
  </section>

  <section id="projects" class="section section-alt">
    <div class="container">
      <h2 class="section-title">My Projects</h2>
      <div class="projects-grid">
        <div class="project-card">
          <div class="project-img">🖥️</div>
          <h3>Project One</h3>
          <p>A modern web application built with React and Node.js</p>
          <a href="#" class="btn btn-small">View Project →</a>
        </div>
        <div class="project-card">
          <div class="project-img">📱</div>
          <h3>Project Two</h3>
          <p>Cross-platform mobile app with 10,000+ downloads</p>
          <a href="#" class="btn btn-small">View Project →</a>
        </div>
        <div class="project-card">
          <div class="project-img">🎯</div>
          <h3>Project Three</h3>
          <p>E-commerce platform with AI-powered recommendations</p>
          <a href="#" class="btn btn-small">View Project →</a>
        </div>
      </div>
    </div>
  </section>

  <section id="contact" class="section">
    <div class="container" style="text-align:center">
      <h2 class="section-title">Get In Touch</h2>
      <p class="section-text">Have a project in mind? Let's work together!</p>
      <form class="contact-form" onsubmit="handleSubmit(event)">
        <input type="text" placeholder="Your Name" required>
        <input type="email" placeholder="Your Email" required>
        <textarea placeholder="Your Message" rows="5" required></textarea>
        <button type="submit" class="btn btn-primary" style="width:100%">Send Message →</button>
      </form>
    </div>
  </section>

  <footer class="footer">
    <div class="container">
      <p>© 2026 ${name}. Built with ⚡ ZapCodes.</p>
    </div>
  </footer>

  <script src="script.js"></script>
</body>
</html>`
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --primary: ${c.primary};
  --bg: ${c.bg};
  --text: ${c.text};
  --accent: ${c.accent};
  --card: ${c.card};
}
body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
.container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
.nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: rgba(15,23,42,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.06); }
.nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
.logo { font-weight: 800; font-size: 1.2rem; color: var(--primary); text-decoration: none; }
.nav-links { display: flex; align-items: center; gap: 24px; }
.nav-links a { color: var(--text); text-decoration: none; font-size: 0.9rem; opacity: 0.7; transition: 0.2s; }
.nav-links a:hover { opacity: 1; }
.btn { display: inline-block; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.9rem; transition: 0.2s; border: none; cursor: pointer; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(99,102,241,0.3); }
.btn-secondary { background: var(--card); color: var(--text); border: 1px solid rgba(255,255,255,0.1); }
.btn-small { padding: 6px 16px; font-size: 0.8rem; background: var(--card); color: var(--primary); border: 1px solid rgba(255,255,255,0.1); }
.hero { padding: 160px 0 100px; text-align: center; background: radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 60%); }
.hero-label { font-size: 1rem; color: var(--accent); margin-bottom: 16px; }
.hero-title { font-size: clamp(2.5rem, 6vw, 4.5rem); font-weight: 900; letter-spacing: -2px; line-height: 1.1; margin-bottom: 20px; }
.hero-sub { font-size: 1.15rem; opacity: 0.7; max-width: 600px; margin: 0 auto 40px; }
.hero-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.section { padding: 100px 0; }
.section-alt { background: var(--card); }
.section-title { font-size: 2rem; font-weight: 800; margin-bottom: 16px; text-align: center; }
.section-text { font-size: 1.05rem; opacity: 0.7; max-width: 600px; margin: 0 auto 40px; text-align: center; }
.skills-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; max-width: 700px; margin: 0 auto; }
.skill-card { background: var(--card); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 20px; text-align: center; font-weight: 600; font-size: 0.9rem; }
.projects-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
.project-card { background: var(--bg); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 32px; transition: 0.2s; }
.project-card:hover { transform: translateY(-2px); border-color: var(--primary); }
.project-img { font-size: 3rem; margin-bottom: 16px; }
.project-card h3 { font-size: 1.2rem; margin-bottom: 8px; }
.project-card p { opacity: 0.6; font-size: 0.9rem; margin-bottom: 16px; }
.contact-form { max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
.contact-form input, .contact-form textarea { background: var(--card); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 14px; color: var(--text); font-size: 0.95rem; font-family: inherit; }
.contact-form input:focus, .contact-form textarea:focus { outline: none; border-color: var(--primary); }
.footer { padding: 32px 0; text-align: center; opacity: 0.5; font-size: 0.85rem; border-top: 1px solid rgba(255,255,255,0.06); }
@media (max-width: 768px) {
  .nav-links { display: none; }
  .hero-title { font-size: 2.2rem; }
  .projects-grid { grid-template-columns: 1fr; }
}`
    },
    {
      path: 'script.js',
      content: `// Smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(a.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});

// Form handler
function handleSubmit(e) {
  e.preventDefault();
  alert('Thanks for your message! I\\'ll get back to you soon.');
  e.target.reset();
}

// Scroll animations
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.section').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.6s, transform 0.6s';
  observer.observe(el);
});

console.log('Built with ZapCodes ⚡');`
    },
  ];
}

function generateLanding(safeName, name, desc, colorScheme, features) {
  const c = getColors(colorScheme || 'blue');
  return [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} — ${desc || 'Grow Your Business'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: ${c.bg}; color: ${c.text}; }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
    nav { padding: 20px 0; display: flex; justify-content: space-between; align-items: center; }
    .logo { font-weight: 800; font-size: 1.3rem; color: ${c.primary}; }
    .nav-btn { background: ${c.primary}; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .hero { padding: 120px 0 80px; text-align: center; }
    h1 { font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 900; letter-spacing: -1.5px; line-height: 1.1; margin-bottom: 20px; }
    .hero p { font-size: 1.2rem; opacity: 0.7; max-width: 600px; margin: 0 auto 40px; }
    .cta-row { display: flex; gap: 12px; justify-content: center; }
    .btn { padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 1rem; text-decoration: none; display: inline-block; }
    .btn-primary { background: ${c.primary}; color: white; }
    .btn-outline { border: 2px solid rgba(255,255,255,0.2); color: ${c.text}; }
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; padding: 80px 0; }
    .feature { background: ${c.card}; border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 36px; }
    .feature .icon { font-size: 2.5rem; margin-bottom: 16px; }
    .feature h3 { margin-bottom: 8px; font-size: 1.2rem; }
    .feature p { opacity: 0.6; font-size: 0.95rem; }
    .cta-section { text-align: center; padding: 80px 0; }
    footer { padding: 32px 0; text-align: center; opacity: 0.4; font-size: 0.85rem; border-top: 1px solid rgba(255,255,255,0.06); }
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <span class="logo">${name}</span>
      <a href="#cta" class="nav-btn">Get Started</a>
    </nav>
  </div>
  <section class="hero">
    <div class="container">
      <h1>${desc || 'Grow Your Business<br>With Our Solution'}</h1>
      <p>The all-in-one platform that helps you succeed. Join thousands of happy customers today.</p>
      <div class="cta-row">
        <a href="#cta" class="btn btn-primary">Start Free Trial →</a>
        <a href="#features" class="btn btn-outline">Learn More</a>
      </div>
    </div>
  </section>
  <section id="features" class="container">
    <div class="features">
      <div class="feature"><div class="icon">🚀</div><h3>Fast & Reliable</h3><p>Lightning-fast performance you can count on, 99.9% uptime guaranteed.</p></div>
      <div class="feature"><div class="icon">🔒</div><h3>Secure</h3><p>Enterprise-grade security with end-to-end encryption for all your data.</p></div>
      <div class="feature"><div class="icon">📊</div><h3>Analytics</h3><p>Powerful insights and reporting to help you make data-driven decisions.</p></div>
    </div>
  </section>
  <section id="cta" class="cta-section">
    <div class="container">
      <h2 style="font-size:2.2rem;font-weight:800;margin-bottom:16px">Ready to Get Started?</h2>
      <p style="opacity:0.6;margin-bottom:32px">Join 10,000+ businesses already using ${name}</p>
      <a href="#" class="btn btn-primary">Start Your Free Trial →</a>
    </div>
  </section>
  <footer><div class="container">© 2026 ${name}. Built with ⚡ ZapCodes.</div></footer>
</body>
</html>`
    },
  ];
}

function generateBlog(safeName, name, desc, colorScheme) {
  const c = getColors(colorScheme || 'clean');
  return [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; background: ${c.bg}; color: ${c.text}; line-height: 1.8; }
    .container { max-width: 740px; margin: 0 auto; padding: 0 24px; }
    nav { padding: 24px 0; border-bottom: 1px solid rgba(0,0,0,0.1); margin-bottom: 48px; display: flex; justify-content: space-between; align-items: center; }
    .logo { font-weight: 800; font-size: 1.5rem; color: ${c.primary}; text-decoration: none; }
    .nav-links a { margin-left: 24px; color: ${c.text}; text-decoration: none; opacity: 0.6; font-family: system-ui; font-size: 0.9rem; }
    .hero { text-align: center; padding: 40px 0 60px; }
    h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: 12px; letter-spacing: -1px; }
    .subtitle { opacity: 0.5; font-size: 1.1rem; font-family: system-ui; }
    .posts { display: flex; flex-direction: column; gap: 40px; padding-bottom: 80px; }
    .post { border-bottom: 1px solid rgba(0,0,0,0.08); padding-bottom: 40px; }
    .post-date { font-family: system-ui; font-size: 0.8rem; opacity: 0.4; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .post h2 { font-size: 1.6rem; margin-bottom: 12px; }
    .post h2 a { color: ${c.text}; text-decoration: none; }
    .post h2 a:hover { color: ${c.primary}; }
    .post p { opacity: 0.7; font-size: 1.05rem; }
    .read-more { display: inline-block; margin-top: 12px; color: ${c.primary}; font-family: system-ui; font-size: 0.9rem; font-weight: 600; text-decoration: none; }
    footer { padding: 32px 0; text-align: center; opacity: 0.4; font-size: 0.85rem; font-family: system-ui; }
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <a href="#" class="logo">${name}</a>
      <div class="nav-links"><a href="#">Home</a><a href="#">About</a><a href="#">Archive</a></div>
    </nav>
    <div class="hero">
      <h1>${name}</h1>
      <p class="subtitle">${desc || 'Thoughts, stories, and ideas'}</p>
    </div>
    <div class="posts">
      <article class="post">
        <div class="post-date">February 25, 2026</div>
        <h2><a href="#">Getting Started: My First Post</a></h2>
        <p>Welcome to my blog! This is where I'll share my thoughts, experiences, and insights about technology, design, and life in general. Stay tuned for more content coming soon.</p>
        <a href="#" class="read-more">Read More →</a>
      </article>
      <article class="post">
        <div class="post-date">February 20, 2026</div>
        <h2><a href="#">The Future of Web Development</a></h2>
        <p>Web development is evolving rapidly with AI-powered tools, new frameworks, and changing user expectations. Here's what I think the next few years will look like.</p>
        <a href="#" class="read-more">Read More →</a>
      </article>
      <article class="post">
        <div class="post-date">February 15, 2026</div>
        <h2><a href="#">5 Tips for Better Code</a></h2>
        <p>Writing clean, maintainable code is an art. Here are five practical tips that have helped me become a better developer over the years.</p>
        <a href="#" class="read-more">Read More →</a>
      </article>
    </div>
  </div>
  <footer>© 2026 ${name}. Built with ⚡ ZapCodes.</footer>
</body>
</html>`
    },
  ];
}

function generateEcommerce(safeName, name, desc, colorScheme) {
  return generateLanding(safeName, name, desc || 'Shop the latest products', colorScheme, []);
}

function generateDashboard(safeName, name, desc, colorScheme) {
  return generateLanding(safeName, name, desc || 'Your analytics dashboard', colorScheme, []);
}

function generateMobileApp(safeName, name, desc, colorScheme) {
  return [
    {
      path: 'App.js',
      content: `import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

export default function App() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>${name}</Text>
      </View>
      <View style={styles.hero}>
        <Text style={styles.title}>Welcome to ${name}</Text>
        <Text style={styles.subtitle}>${desc || 'Your new mobile app'}</Text>
        <TouchableOpacity style={styles.btn}>
          <Text style={styles.btnText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060b' },
  header: { padding: 20, paddingTop: 60 },
  logo: { color: '#6366f1', fontSize: 24, fontWeight: '800' },
  hero: { padding: 20, alignItems: 'center', marginTop: 40 },
  title: { color: '#e2e8f0', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#94a3b8', fontSize: 16, marginTop: 12, textAlign: 'center' },
  btn: { backgroundColor: '#6366f1', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10, marginTop: 32 },
  btnText: { color: 'white', fontWeight: '700', fontSize: 16 },
});`
    },
    {
      path: 'app.json',
      content: JSON.stringify({
        expo: { name, slug: safeName, version: '1.0.0', orientation: 'portrait', icon: './assets/icon.png', splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#06060b' }, ios: { supportsTablet: true }, android: { adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#06060b' } } }
      }, null, 2),
    },
    {
      path: 'package.json',
      content: JSON.stringify({ name: safeName, version: '1.0.0', main: 'node_modules/expo/AppEntry.js', scripts: { start: 'expo start', android: 'expo start --android', ios: 'expo start --ios' }, dependencies: { expo: '~50.0.0', react: '18.2.0', 'react-native': '0.73.2' } }, null, 2),
    },
  ];
}

function generateWebApp(safeName, name, desc, colorScheme) {
  return generateLanding(safeName, name, desc || 'Full-stack web application', colorScheme, []);
}

function generateSaaS(safeName, name, desc, colorScheme) {
  return generateLanding(safeName, name, desc || 'The SaaS platform for modern teams', colorScheme, []);
}

// ============ DEPLOYMENT GUIDES ============

function getDeploymentGuide(template, projectName) {
  const isMobile = template === 'mobile';

  if (isMobile) {
    return {
      title: 'Deploy Your Mobile App',
      steps: [
        { step: 1, title: 'Install Expo', detail: 'Go to https://expo.dev and create a free account. Then install Expo Go on your phone from the App Store or Play Store.' },
        { step: 2, title: 'Upload to GitHub', detail: 'Go to github.com, create a new repository, and upload all the project files.' },
        { step: 3, title: 'Install Dependencies', detail: 'Open a terminal, navigate to your project folder, and run: npm install' },
        { step: 4, title: 'Start the App', detail: 'Run: npx expo start — then scan the QR code with Expo Go on your phone.' },
        { step: 5, title: 'Build for App Stores', detail: 'When ready, run: eas build --platform all — this creates .apk (Android) and .ipa (iOS) files for store submission.' },
      ],
    };
  }

  return {
    title: 'Deploy Your Website (Free)',
    steps: [
      { step: 1, title: 'Create a GitHub Account', detail: 'Go to https://github.com and sign up for a free account if you don\'t have one.' },
      { step: 2, title: 'Create a New Repository', detail: 'Click "New" → name it "' + projectName + '" → click "Create repository".' },
      { step: 3, title: 'Upload Your Files', detail: 'Click "Add file" → "Upload files" → drag all your project files → click "Commit changes".' },
      { step: 4, title: 'Connect to Vercel', detail: 'Go to https://vercel.com → sign up with GitHub → click "Add New Project" → select your "' + projectName + '" repo → click "Deploy".' },
      { step: 5, title: 'Your Site is Live!', detail: 'Vercel gives you a free URL like ' + projectName + '.vercel.app. You can also connect a custom domain in Vercel settings.' },
    ],
    tips: [
      'Vercel hosting is 100% free for personal projects',
      'Every time you update files on GitHub, Vercel auto-deploys the changes',
      'To add a custom domain, go to Vercel → Settings → Domains',
      'Use ZapCodes Repair to scan and fix bugs in your new project!',
    ],
  };
}

// Generate Full-Stack + Mobile Companion (PRO ONLY)
function generateFullStackMobile(name, title, desc, scheme, features) {
  const c = getColorScheme(scheme);
  return [
    // Backend API
    {
      path: `${name}-backend/server.js`,
      content: `const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// In-memory data store (replace with DB)
let items = [{ id: 1, title: 'Welcome to ${title}', done: false }];

app.get('/api/items', (req, res) => res.json(items));
app.post('/api/items', (req, res) => {
  const item = { id: Date.now(), ...req.body };
  items.push(item);
  io.emit('item-added', item);
  res.status(201).json(item);
});
app.delete('/api/items/:id', (req, res) => {
  items = items.filter(i => i.id !== parseInt(req.params.id));
  io.emit('item-deleted', { id: parseInt(req.params.id) });
  res.json({ success: true });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Disconnected:', socket.id));
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => console.log(\`${title} API running on port \${PORT}\`));`,
    },
    {
      path: `${name}-backend/package.json`,
      content: JSON.stringify({ name: `${name}-backend`, version: '1.0.0', main: 'server.js', scripts: { start: 'node server.js' }, dependencies: { express: '^4.18.2', cors: '^2.8.5', 'socket.io': '^4.7.2' } }, null, 2),
    },
    // Web Frontend
    {
      path: `${name}-web/index.html`,
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.2/socket.io.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, system-ui, sans-serif; background: #06060b; color: #e8e8f0; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 2rem; font-weight: 800; color: ${c.primary}; margin-bottom: 8px; }
    .subtitle { color: #888; margin-bottom: 32px; }
    .sync-badge { display: inline-block; padding: 4px 12px; border-radius: 100px; font-size: 0.75rem; font-weight: 600; background: rgba(0,229,160,0.1); color: #00e5a0; margin-bottom: 24px; }
    input { width: 100%; padding: 12px 16px; border: 1px solid #2a2a3a; border-radius: 8px; background: #11111b; color: #e8e8f0; font-size: 1rem; margin-bottom: 12px; }
    button { padding: 12px 24px; border: none; border-radius: 8px; background: ${c.primary}; color: #06060b; font-weight: 700; cursor: pointer; width: 100%; font-size: 1rem; }
    .item { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border: 1px solid #1a1a2a; border-radius: 8px; margin-bottom: 8px; }
    .delete-btn { background: none; border: none; color: #ff4466; cursor: pointer; font-size: 1.2rem; width: auto; padding: 4px 8px; }
    .live { width: 8px; height: 8px; border-radius: 50%; background: #00e5a0; display: inline-block; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  </style>
</head>
<body>
  <div class="container">
    <span class="sync-badge"><span class="live"></span>&nbsp; Real-time synced with mobile app</span>
    <h1>${title}</h1>
    <p class="subtitle">${desc || 'Full-stack web + mobile companion'}</p>
    <input id="input" placeholder="Add a new item..." />
    <button onclick="addItem()">Add Item</button>
    <div id="list" style="margin-top: 24px;"></div>
  </div>
  <script>
    const API = 'http://localhost:4000';
    const socket = io(API);

    async function loadItems() {
      const res = await fetch(API + '/api/items');
      const items = await res.json();
      renderItems(items);
    }

    function renderItems(items) {
      document.getElementById('list').innerHTML = items.map(i =>
        \`<div class="item"><span>\${i.title}</span><button class="delete-btn" onclick="deleteItem(\${i.id})">×</button></div>\`
      ).join('');
    }

    async function addItem() {
      const input = document.getElementById('input');
      if (!input.value.trim()) return;
      await fetch(API + '/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: input.value }) });
      input.value = '';
      loadItems();
    }

    async function deleteItem(id) {
      await fetch(API + '/api/items/' + id, { method: 'DELETE' });
      loadItems();
    }

    socket.on('item-added', () => loadItems());
    socket.on('item-deleted', () => loadItems());
    loadItems();
  </script>
</body>
</html>`,
    },
    // Mobile App (React Native)
    {
      path: `${name}-mobile/App.js`,
      content: `import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, StatusBar } from 'react-native';
import io from 'socket.io-client';

const API = 'http://localhost:4000'; // Change to your deployed backend URL
const socket = io(API);

export default function App() {
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    loadItems();
    socket.on('item-added', loadItems);
    socket.on('item-deleted', loadItems);
    return () => { socket.off('item-added'); socket.off('item-deleted'); };
  }, []);

  const loadItems = async () => {
    try {
      const res = await fetch(API + '/api/items');
      const data = await res.json();
      setItems(data);
    } catch (err) { console.error(err); }
  };

  const addItem = async () => {
    if (!input.trim()) return;
    await fetch(API + '/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: input }) });
    setInput('');
  };

  const deleteItem = async (id) => {
    await fetch(API + '/api/items/' + id, { method: 'DELETE' });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.syncBadge}><View style={styles.liveDot} /><Text style={styles.syncText}>Synced with web</Text></View>
      <Text style={styles.title}>${title}</Text>
      <Text style={styles.subtitle}>${desc || 'Mobile companion'}</Text>
      <TextInput style={styles.input} value={input} onChangeText={setInput} placeholder="Add item..." placeholderTextColor="#666" onSubmitEditing={addItem} />
      <TouchableOpacity style={styles.button} onPress={addItem}><Text style={styles.buttonText}>Add Item</Text></TouchableOpacity>
      <FlatList
        data={items} keyExtractor={i => i.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.itemText}>{item.title}</Text>
            <TouchableOpacity onPress={() => deleteItem(item.id)}><Text style={styles.deleteBtn}>×</Text></TouchableOpacity>
          </View>
        )}
        style={{ marginTop: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060b', padding: 20, paddingTop: 60 },
  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,229,160,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, alignSelf: 'flex-start', marginBottom: 20 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00e5a0' },
  syncText: { color: '#00e5a0', fontSize: 12, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: '${c.primary}', marginBottom: 4 },
  subtitle: { color: '#888', marginBottom: 24, fontSize: 15 },
  input: { backgroundColor: '#11111b', borderWidth: 1, borderColor: '#2a2a3a', borderRadius: 8, padding: 14, color: '#e8e8f0', fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: '${c.primary}', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#06060b', fontWeight: '700', fontSize: 16 },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderWidth: 1, borderColor: '#1a1a2a', borderRadius: 8, marginBottom: 8 },
  itemText: { color: '#e8e8f0', fontSize: 15 },
  deleteBtn: { color: '#ff4466', fontSize: 24, paddingHorizontal: 8 },
});`,
    },
    {
      path: `${name}-mobile/package.json`,
      content: JSON.stringify({ name: `${name}-mobile`, version: '1.0.0', main: 'App.js', scripts: { start: 'npx expo start' }, dependencies: { expo: '~50.0.0', react: '18.2.0', 'react-native': '0.73.4', 'socket.io-client': '^4.7.2' } }, null, 2),
    },
    {
      path: `${name}-mobile/app.json`,
      content: JSON.stringify({ expo: { name: title, slug: name, version: '1.0.0', platforms: ['ios', 'android'], ios: { bundleIdentifier: `com.zapcodes.${name.replace(/-/g, '')}` }, android: { package: `com.zapcodes.${name.replace(/-/g, '')}` } } }, null, 2),
    },
    // README
    {
      path: 'README.md',
      content: `# ${title}\n\nFull-Stack Web App + Mobile Companion — Generated by ZapCodes Pro\n\n## Architecture\n- **Backend:** Node.js + Express + Socket.IO (real-time sync)\n- **Web:** HTML/CSS/JS (replace with React/Next.js as needed)\n- **Mobile:** React Native + Expo (iOS + Android)\n\n## Quick Start\n\n### Backend\n\`\`\`bash\ncd ${name}-backend && npm install && npm start\n\`\`\`\n\n### Web\nOpen \`${name}-web/index.html\` in your browser (or deploy to Vercel)\n\n### Mobile\n\`\`\`bash\ncd ${name}-mobile && npm install && npx expo start\n\`\`\`\nScan the QR code with Expo Go on your phone.\n\n## Sync\nAll platforms share the same backend API. Changes on web appear instantly on mobile and vice versa via Socket.IO.\n\n## Deploy\n- Backend: Render.com or Railway\n- Web: Vercel or Netlify\n- Mobile: \`eas build\` for app stores\n\n---\nGenerated by [ZapCodes](https://zapcodes.net) — You own 100% of this code.`,
    },
  ];
}

module.exports = router;
