/**
 * routes/guest.js
 * Guest (pre-registration) site generation — no JWT required.
 * Uses fingerprint hash (SHA256 of IP + deviceUUID) for 1-free-per-device limit.
 *
 * POST /api/guest/generate        — SSE streaming generation
 * GET  /api/guest/check/:hash     — check if this fingerprint already has a site
 * GET  /api/guest/site/:subdomain — serve guest site HTML (used by Cloudflare Worker)
 * POST /api/guest/claim-code      — claim a site using the 6-digit cross-device code
 * POST /api/guest/view/:subdomain — increment view counter
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');


const GuestSite = require('../models/GuestSite');
const { callAI, callAIWithImage, generateImageImagen4, generateVideoVeo, parseFilesFromResponse } = require('../services/ai');
const { auth } = require('../middleware/auth');

// ── Rate limit: 1 generate request per IP per 24 hours ───────────────────
const guestGenerateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 1,
  keyGenerator: (req) => req.ip,
  message: { error: 'You can only generate 1 free site per day. Register to unlock more.' },
  skip: () => false,
});

// ── Helpers ───────────────────────────────────────────────────────────────
function computeHash(ip, deviceId) {
  return crypto.createHash('sha256').update(`${ip}||${deviceId}`).digest('hex');
}

function generateSubdomain() {
  return 'preview-' + require('crypto').randomBytes(3).toString('hex');
}

function safeSend(res, data) {
  try {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    }
  } catch (_) {}
  return false;
}

// ── System prompt for guest builds ───────────────────────────────────────
const GUEST_SYSTEM_PROMPT = `You are ZapCodes AI — the most advanced AI website builder. You build stunning, complete, production-ready websites. You NEVER write placeholder code. You write every single line.

WHAT YOU MUST DO:
Step 1: Read what the user wants carefully. Make it outstanding.
Step 2: Write a COMPLETE index.html file — no separate CSS or JS files.
Step 3: Put ALL CSS inside a <style> tag in the <head>.
Step 4: Put ALL JavaScript inside a <script> tag before </body>.
Step 5: The file must work when opened directly in a browser.

FORMAT YOUR OUTPUT EXACTLY LIKE THIS:
\`\`\`filepath:index.html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Website Title</title>
  <style>/* ALL CSS HERE */</style>
</head>
<body>
  <!-- ALL HTML HERE -->
  <script>// ALL JS HERE</script>
</body>
</html>
\`\`\`

DESIGN RULES:
1. Dark modern aesthetic by default. Use CSS custom properties for colors.
2. Flexbox and CSS grid. Never float. Full mobile responsiveness.
3. Hover effects with transition: all 0.3s ease. Scroll animations via IntersectionObserver.
4. Google Fonts via <link>. At least 500 lines of code. Semantic HTML.
5. Images: use https://picsum.photos/WIDTH/HEIGHT as placeholders (these will be replaced by AI images).
6. Hamburger menu for mobile navigation.
7. html { scroll-behavior: smooth; }

FORM RULES — Every form MUST use this exact JavaScript submit handler:
const forms = document.querySelectorAll('form');
forms.forEach(form => {
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
    const originalText = btn.textContent;
    btn.textContent = 'Sending...'; btn.disabled = true;
    const formData = {};
    new FormData(form).forEach((value, key) => { formData[key] = value; });
    const subdomain = window.location.hostname.split('.')[0];
    try {
      const response = await fetch('https://api.zapcodes.net/api/forms/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain, formType: form.dataset.formtype || 'Contact Form', formData })
      });
      const result = await response.json();
      if (result.success) { btn.textContent = '✓ Sent!'; btn.style.background = '#22c55e'; form.reset(); setTimeout(() => { btn.textContent = originalText; btn.disabled = false; btn.style.background = ''; }, 3000); }
      else throw new Error('Failed');
    } catch { btn.textContent = '✗ Failed'; btn.style.background = '#ef4444'; setTimeout(() => { btn.textContent = originalText; btn.disabled = false; btn.style.background = ''; }, 3000); }
  });
});
Every <form> needs data-formtype. Every <input>/<textarea> needs a name attribute.

PAYMENT RULES: If user wants payments, add Stripe-ready payment buttons that show a "Connect Stripe in your dashboard to enable payments" message. Do NOT add fake payment processing.

Make the site BEAUTIFUL, COMPLETE, and FUNCTIONAL. This is a showcase — make it impressive.`;

// ── POST /api/guest/generate — SSE streaming ─────────────────────────────
router.post('/generate', guestGenerateLimiter, async (req, res) => {
  let connectionAlive = true;
  let keepaliveInterval = null;

  try {
    const { prompt, template, projectName, siteType, deviceId, referenceImages } = req.body;

    if (!prompt || prompt.trim().length < 3) {
      return res.status(400).json({ error: 'Please describe what you want to build.' });
    }

    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const dId = (deviceId || '').trim() || 'unknown';
    const hash = computeHash(ip, dId);

    // ── Check fingerprint limit ───────────────────────────────────────────
    const existing = await GuestSite.findActiveByHash(hash);
    if (existing) {
      const daysLeft = Math.max(0, Math.ceil((existing.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
      return res.status(429).json({
        error: 'You already built a free site!',
        existingSite: {
          subdomain: existing.subdomain,
          url: `https://${existing.subdomain}.zapcodes.net`,
          daysLeft,
          claimCode: existing.claimCode,
        },
      });
    }

    // ── Set up SSE ────────────────────────────────────────────────────────
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });

    res.on('close', () => {
      connectionAlive = false;
      if (keepaliveInterval) clearInterval(keepaliveInterval);
    });

    const send = (type, message, extra = {}) => safeSend(res, { type, message, ...extra });

    keepaliveInterval = setInterval(() => {
      if (!connectionAlive) { clearInterval(keepaliveInterval); return; }
      try { if (!res.writableEnded) res.write(': keepalive\n\n'); }
      catch { clearInterval(keepaliveInterval); connectionAlive = false; }
    }, 10000);

    // ── Progress messages ─────────────────────────────────────────────────
    const steps = [
      { step: 'analyzing',    msg: '🧠 Understanding what you want to build...' },
      { step: 'layout',       msg: '🎨 Choosing the perfect layout for you...' },
      { step: 'structure',    msg: '🏗️ Building your page structure...' },
      { step: 'hero',         msg: '✨ Designing your hero section...' },
      { step: 'images',       msg: '📸 Creating custom images with Imagen 4...' },
      { step: 'content',      msg: '✍️ Writing your content sections...' },
      { step: 'forms',        msg: '📬 Adding your contact form...' },
      { step: 'email',        msg: '📧 Connecting form to your email...' },
      { step: 'finalizing',   msg: '🚀 Finalizing your site...' },
    ];

    let stepIdx = 0;
    send('progress', steps[stepIdx].msg, { step: steps[stepIdx].step, pct: 5 });
    stepIdx++;

    const progressTicker = setInterval(() => {
      if (!connectionAlive || stepIdx >= steps.length - 1) { clearInterval(progressTicker); return; }
      send('progress', steps[stepIdx].msg, { step: steps[stepIdx].step, pct: Math.round((stepIdx / steps.length) * 85) });
      stepIdx++;
    }, 14000);

    // ── Build the prompt ──────────────────────────────────────────────────
    const visionImages = (referenceImages || []).filter(img => img.base64 && img.mimeType);
    const userPrompt = `Create a complete, production-ready ${siteType === 'mobile-app' ? 'mobile app UI (React Native HTML preview)' : 'website'}: ${prompt}

Project name: ${projectName || 'My Project'}
Template: ${template || 'custom'}
${visionImages.length > 0 ? 'REFERENCE IMAGES ATTACHED: Study them carefully. Recreate the design, layout, colors, and structure as closely as possible.' : ''}

IMPORTANT: 
- Self-contained index.html with ALL CSS in <style> and ALL JS in <script>
- Make it BEAUTIFUL and COMPLETE — this is a showcase of what ZapCodes AI can do
- Include at least 5-6 full sections
- Every form must use the ZapCodes form submission handler`;

    // ── Call Gemini 3.1 Pro ───────────────────────────────────────────────
    send('progress', '⚡ Gemini 3.1 Pro is building your site...', { step: 'generating', pct: 20 });

    let aiResult;
    try {
      if (visionImages.length > 0) {
        aiResult = await callAIWithImage(GUEST_SYSTEM_PROMPT, userPrompt, visionImages, 'gemini-3.1-pro', 65536, {});
      } else {
        aiResult = await callAI(GUEST_SYSTEM_PROMPT, userPrompt, 'gemini-3.1-pro', 65536, {});
      }
    } catch (err) {
      // Fallback to gemini-2.5-flash
      send('progress', '🔄 Switching models for best results...', { step: 'fallback', pct: 25 });
      try {
        aiResult = await callAI(GUEST_SYSTEM_PROMPT, userPrompt, 'gemini-2.5-flash', 65536, {});
      } catch (err2) {
        clearInterval(progressTicker);
        if (keepaliveInterval) clearInterval(keepaliveInterval);
        send('error', 'AI generation failed. Please try again.');
        safeSend(res, { type: 'error', error: 'Generation failed. Please try again.' });
        return res.end();
      }
    }

    if (!aiResult) {
      clearInterval(progressTicker);
      if (keepaliveInterval) clearInterval(keepaliveInterval);
      safeSend(res, { type: 'error', error: 'Generation returned empty. Please try again.' });
      return res.end();
    }

    // ── Parse HTML ────────────────────────────────────────────────────────
    send('progress', '🖼️ Generating custom AI images...', { step: 'images', pct: 75 });

    let htmlContent = '';
    const files = parseFilesFromResponse(aiResult);
    if (files.length > 0) {
      const htmlFile = files.find(f => f.name === 'index.html') || files.find(f => f.name.endsWith('.html'));
      htmlContent = htmlFile?.content || '';
    }
    if (!htmlContent && aiResult.includes('<!DOCTYPE')) {
      const match = aiResult.match(/(<!DOCTYPE[\s\S]*<\/html>)/i);
      if (match) htmlContent = match[1];
    }
    if (!htmlContent) {
      htmlContent = aiResult.includes('<html') ? aiResult : `<!DOCTYPE html><html><head><title>${projectName || 'My Site'}</title></head><body>${aiResult}</body></html>`;
    }

    clearInterval(progressTicker);

    // ── Generate Imagen 4 images in parallel ──────────────────────────────
    try {
      const imagePrompts = [
        `Professional hero banner for: ${prompt}. High quality, modern design, cinematic lighting.`,
        `Business section image for: ${prompt}. Clean, professional, modern aesthetic.`,
        `Feature or service illustration for: ${prompt}. Minimalist, elegant style.`,
      ];

      const imageResults = await Promise.allSettled(
        imagePrompts.slice(0, 2).map(p => generateImageImagen4(p, { aspectRatio: '16:9' }))
      );

      // Replace picsum placeholders with real AI images
      let imgIdx = 0;
      for (const result of imageResults) {
        if (result.status === 'fulfilled' && result.value?.length > 0) {
          const b64 = result.value[0].base64;
          const mime = result.value[0].mimeType || 'image/png';
          const dataUrl = `data:${mime};base64,${b64}`;
          // Replace first matching picsum URL
          const picsumRegex = /https?:\/\/picsum\.photos\/[0-9]+(?:\/[0-9]+)?/;
          if (picsumRegex.test(htmlContent)) {
            htmlContent = htmlContent.replace(picsumRegex, dataUrl);
            imgIdx++;
          }
        }
      }
    } catch (imgErr) {
      console.warn('[GuestGen] Image generation failed (non-fatal):', imgErr.message);
    }

    // ── Save to MongoDB ───────────────────────────────────────────────────
    send('progress', '💾 Saving your site...', { step: 'saving', pct: 90 });

    let subdomain;
    let attempts = 0;
    while (attempts < 5) {
      subdomain = generateSubdomain();
      const taken = await GuestSite.findOne({ subdomain });
      if (!taken) break;
      attempts++;
    }

    const claimCode = GuestSite.generateClaimCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const guestSite = await GuestSite.create({
      subdomain,
      siteType: siteType || 'website',
      projectName: projectName || prompt.split(' ').slice(0, 3).join(' '),
      description: prompt,
      templateKey: template || 'custom',
      generatedHtml: htmlContent,
      fingerprint: {
        ip,
        deviceId: dId,
        userAgent: req.headers['user-agent'] || '',
        hash,
      },
      status: 'active',
      claimCode,
      expiresAt,
    });

    if (keepaliveInterval) clearInterval(keepaliveInterval);

    send('progress', '🎉 Your site is ready!', { step: 'done', pct: 100 });
    safeSend(res, {
      type: 'complete',
      subdomain,
      url: `https://${subdomain}.zapcodes.net`,
      claimCode,
      daysLeft: 7,
      preview: htmlContent,
      siteId: guestSite._id.toString(),
    });

    res.end();
  } catch (err) {
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    console.error('[Guest/generate] Error:', err.message);
    if (connectionAlive) {
      try {
        safeSend(res, { type: 'error', error: err.message || 'Generation failed.' });
        res.end();
      } catch (_) {}
    }
  }
});

// ── GET /api/guest/check/:hash — check fingerprint ───────────────────────
router.get('/check/:hash', async (req, res) => {
  try {
    const site = await GuestSite.findActiveByHash(req.params.hash);
    if (!site) return res.json({ exists: false });
    const daysLeft = Math.max(0, Math.ceil((site.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
    res.json({
      exists: true,
      subdomain: site.subdomain,
      url: `https://${site.subdomain}.zapcodes.net`,
      daysLeft,
      claimCode: site.claimCode,
      status: site.status,
    });
  } catch (err) {
    res.status(500).json({ error: 'Check failed' });
  }
});

// ── GET /api/guest/site/:subdomain — serve HTML (used by Cloudflare Worker) ──
router.get('/site/:subdomain', async (req, res) => {
  try {
    const sub = req.params.subdomain.toLowerCase().trim();
    const site = await GuestSite.findOne({ subdomain: sub });

    if (!site) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (site.status === 'deleted' || site.status === 'expired') {
      return res.status(410).json({ error: 'This preview has expired.' });
    }

    // Increment view count
    site.viewCount = (site.viewCount || 0) + 1;
    site.save().catch(() => {});

    // Inject claim banner into HTML
    const daysLeft = Math.max(0, Math.ceil((site.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
    const claimBanner = site.status === 'active' ? `
<div id="zc-claim-banner" style="position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(90deg,#07090B,#0D1117);border-bottom:2px solid #00E5A0;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;font-family:-apple-system,sans-serif;font-size:13px">
  <div style="display:flex;align-items:center;gap:8px">
    <span style="background:#00E5A0;color:#07090B;padding:2px 8px;border-radius:100px;font-size:11px;font-weight:700">FREE PREVIEW</span>
    <span style="color:#F0F4F8">Your site is live! <strong style="color:#00E5A0">Claim it free</strong> — expires in <strong style="color:#FFBD2E">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong></span>
    <span style="color:#4A5E70;font-size:11px">Code: <strong style="color:#00E5A0;font-family:monospace">${site.claimCode}</strong></span>
  </div>
  <a href="https://zapcodes.net/register" style="background:#00E5A0;color:#07090B;padding:7px 16px;border-radius:8px;font-weight:700;text-decoration:none;font-size:12px;white-space:nowrap">⚡ Claim It Free →</a>
</div>
<style>body{padding-top:50px!important}#zc-claim-banner *{box-sizing:border-box}</style>` : '';

    let html = site.generatedHtml;
    if (claimBanner && html.includes('<body')) {
      html = html.replace(/<body[^>]*>/, match => `${match}\n${claimBanner}`);
    }

    if (req.query.raw === '1') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    res.json({
      subdomain: sub,
      html,
      status: site.status,
      daysLeft,
      claimCode: site.claimCode,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load site' });
  }
});

// ── POST /api/guest/claim-code — manual cross-device claim ───────────────
router.post('/claim-code', auth, async (req, res) => {
  try {
    const { claimCode } = req.body;
    if (!claimCode) return res.status(400).json({ error: 'Claim code required' });

    const site = await GuestSite.findOne({
      claimCode: claimCode.toUpperCase().trim(),
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    if (!site) return res.status(404).json({ error: 'Invalid or expired claim code.' });

    site.status = 'claimed';
    site.claimedBy = req.user._id;
    site.claimedAt = new Date();
    site.claimedVia = 'zapcodes';
    await site.save();

    res.json({
      success: true,
      subdomain: site.subdomain,
      url: `https://${site.subdomain}.zapcodes.net`,
      message: 'Site claimed! Now pick your permanent subdomain in your dashboard.',
    });
  } catch (err) {
    res.status(500).json({ error: 'Claim failed' });
  }
});

// ── POST /api/guest/view/:subdomain — increment view count ───────────────
router.post('/view/:subdomain', async (req, res) => {
  try {
    await GuestSite.findOneAndUpdate(
      { subdomain: req.params.subdomain.toLowerCase() },
      { $inc: { viewCount: 1 } }
    );
    res.json({ ok: true });
  } catch (_) {
    res.json({ ok: true }); // Non-critical, always succeed
  }
});

module.exports = router;
