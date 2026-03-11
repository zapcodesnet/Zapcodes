const express = require('express');
const router = express.Router();
const User = require('../models/User');

// ══════════ FORM SUBMISSION HANDLER ══════════
// Receives form data from any website deployed on ZapCodes
// Emails the submission to the website owner via Resend
// No auth required — this is called by visitors on deployed sites

// Rate limiting: max 10 submissions per IP per hour (basic protection)
const submitCounts = new Map();
setInterval(() => submitCounts.clear(), 3600000); // Clear every hour

function checkRateLimit(ip) {
  const count = submitCounts.get(ip) || 0;
  if (count >= 10) return false;
  submitCounts.set(ip, count + 1);
  return true;
}

// POST /api/forms/submit
router.post('/submit', async (req, res) => {
  try {
    // CORS — allow from any .zapcodes.net subdomain
    const origin = req.headers.origin || req.headers.referer || '';
    if (origin.includes('zapcodes.net') || origin.includes('localhost')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
    }

    const { subdomain, formData, formType } = req.body;

    if (!subdomain) return res.status(400).json({ error: 'Missing subdomain' });
    if (!formData || typeof formData !== 'object') return res.status(400).json({ error: 'Missing form data' });

    // Find the site owner
    const siteOwner = await User.findOne({ 'deployed_sites.subdomain': subdomain.toLowerCase() });
    if (!siteOwner) return res.status(404).json({ error: 'Website not found' });

    const site = siteOwner.deployed_sites.find(s => s.subdomain === subdomain.toLowerCase());
    const siteName = site?.title || subdomain;
    const ownerEmail = siteOwner.email;

    if (!ownerEmail) return res.status(400).json({ error: 'Site owner has no email' });

    // Build the email
    const type = formType || 'Contact Form';
    const timestamp = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });

    // Format form fields into readable HTML
    const fieldsHtml = Object.entries(formData)
      .filter(([key]) => !['subdomain', 'formType', '_honeypot'].includes(key))
      .map(([key, value]) => {
        const label = key
          .replace(/[-_]/g, ' ')
          .replace(/([A-Z])/g, ' $1')
          .replace(/^\w/, c => c.toUpperCase())
          .trim();
        return `<tr>
          <td style="padding:10px 16px;font-weight:600;color:#374151;background:#f9fafb;border-bottom:1px solid #e5e7eb;width:140px;vertical-align:top">${label}</td>
          <td style="padding:10px 16px;color:#111827;border-bottom:1px solid #e5e7eb">${String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
        </tr>`;
      })
      .join('');

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 30px">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">📩 New ${type} Submission</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px">${siteName} · ${subdomain}.zapcodes.net</p>
    </div>

    <div style="padding:24px 30px">
      <p style="color:#6b7280;font-size:13px;margin:0 0 16px">Received on ${timestamp}</p>
      
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
        ${fieldsHtml}
      </table>

      <div style="margin-top:20px;padding:14px 16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
        <p style="margin:0;color:#166534;font-size:13px">
          💡 <strong>Tip:</strong> Reply directly to this email to respond to your customer. 
          Their email${formData.email ? ': <strong>' + formData.email + '</strong>' : ' was not provided'}.
        </p>
      </div>
    </div>

    <div style="padding:16px 30px;background:#f9fafb;border-top:1px solid #e5e7eb">
      <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center">
        Sent via <a href="https://zapcodes.net" style="color:#6366f1;text-decoration:none;font-weight:600">⚡ ZapCodes</a> · 
        Manage your sites at <a href="https://zapcodes.net/dashboard" style="color:#6366f1;text-decoration:none">zapcodes.net/dashboard</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    // Send via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('[Forms] No RESEND_API_KEY configured');
      // Still save the submission even if email fails
      await saveSubmission(siteOwner, subdomain, formData, formType, false);
      return res.json({ success: true, message: 'Form submitted successfully! The site owner will review your message.' });
    }

    try {
      const { Resend } = require('resend');
      const resend = new Resend(resendKey);

      await resend.emails.send({
        from: `ZapCodes Forms <forms@${process.env.RESEND_DOMAIN || 'zapcodes.net'}>`,
        to: ownerEmail,
        replyTo: formData.email || undefined,
        subject: `📩 New ${type}: ${siteName} (${subdomain}.zapcodes.net)`,
        html: emailHtml,
      });

      console.log(`[Forms] Email sent to ${ownerEmail} for ${subdomain} (${type})`);
      await saveSubmission(siteOwner, subdomain, formData, formType, true);
    } catch (emailErr) {
      console.error(`[Forms] Email failed for ${subdomain}: ${emailErr.message}`);
      await saveSubmission(siteOwner, subdomain, formData, formType, false);
    }

    res.json({ success: true, message: 'Thank you! Your message has been sent successfully.' });
  } catch (err) {
    console.error('[Forms] Error:', err.message);
    res.status(500).json({ error: 'Failed to process form submission' });
  }
});

// OPTIONS handler for CORS preflight
router.options('/submit', (req, res) => {
  const origin = req.headers.origin || '';
  if (origin.includes('zapcodes.net') || origin.includes('localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});

// Save submission to user's record (optional — for viewing in dashboard later)
async function saveSubmission(user, subdomain, formData, formType, emailSent) {
  try {
    if (!user.form_submissions) user.form_submissions = [];
    user.form_submissions.push({
      subdomain,
      formType: formType || 'contact',
      data: formData,
      emailSent,
      createdAt: new Date(),
    });
    // Keep only last 100 submissions per user
    if (user.form_submissions.length > 100) {
      user.form_submissions = user.form_submissions.slice(-100);
    }
    await user.save();
  } catch (err) {
    console.error(`[Forms] Failed to save submission: ${err.message}`);
  }
}

// GET /api/forms/submissions — site owner views their submissions
const { auth } = require('../middleware/auth');
router.get('/submissions', auth, (req, res) => {
  const subdomain = req.query.subdomain;
  const submissions = (req.user.form_submissions || [])
    .filter(s => !subdomain || s.subdomain === subdomain)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
  res.json({ submissions, total: submissions.length });
});

module.exports = router;
