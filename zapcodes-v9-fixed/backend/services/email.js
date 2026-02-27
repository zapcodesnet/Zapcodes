const crypto = require('crypto');

// In-memory verification code store (use Redis in production)
const verificationCodes = new Map(); // email -> { code, expiresAt, attempts, type }
const rateLimits = new Map(); // email -> { count, windowStart }

let resendClient = null;

function getResend() {
  if (!resendClient) {
    try {
      const { Resend } = require('resend');
      resendClient = new Resend(process.env.RESEND_API_KEY || 're_P7cmSb9A_9EGRJPdiE5L6xudJricMMDVX');
    } catch (e) {
      console.error('Resend not available:', e.message);
    }
  }
  return resendClient;
}

// Generate and send verification code
async function sendVerificationCode(email, type = 'registration') {
  // Rate limit: 5 per hour per email
  const rl = rateLimits.get(email) || { count: 0, windowStart: Date.now() };
  if (Date.now() - rl.windowStart > 3600000) { rl.count = 0; rl.windowStart = Date.now(); }
  if (rl.count >= 5) throw new Error('Too many verification requests. Try again in 1 hour.');
  rl.count++;
  rateLimits.set(email, rl);

  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  verificationCodes.set(email, { code, expiresAt, attempts: 0, type });

  const subjects = {
    registration: 'Welcome to ZapCodes — Verify Your Email',
    admin: 'ZapCodes Admin Verification Code',
    login: 'ZapCodes Login Verification',
  };

  const resend = getResend();
  if (resend) {
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM || 'ZapCodes <onboarding@resend.dev>',
        to: email,
        subject: subjects[type] || 'ZapCodes Verification Code',
        html: `
          <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; background: #06060b; color: #e8e8f0; border-radius: 16px; overflow: hidden;">
            <div style="padding: 32px 28px; text-align: center;">
              <div style="font-size: 28px; margin-bottom: 8px;">⚡</div>
              <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 8px; color: #00e5a0;">ZapCodes</h1>
              <p style="color: #888; font-size: 14px; margin: 0 0 28px;">Your verification code</p>
              <div style="background: #11111b; border: 1px solid #2a2a3a; border-radius: 12px; padding: 24px; margin: 0 0 24px;">
                <div style="font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #00e5a0; font-family: monospace;">${code}</div>
              </div>
              <p style="color: #888; font-size: 13px; margin: 0;">This code expires in <strong>10 minutes</strong>.</p>
              <p style="color: #666; font-size: 12px; margin: 16px 0 0;">If you didn't request this, you can safely ignore this email.</p>
            </div>
            <div style="background: #0a0a14; padding: 16px 28px; text-align: center;">
              <p style="color: #555; font-size: 11px; margin: 0;">© ZapCodes · <a href="https://zapcodes.net" style="color: #00e5a0; text-decoration: none;">zapcodes.net</a></p>
            </div>
          </div>
        `,
      });
      console.log(`[EMAIL] Verification code sent to ${email}`);
    } catch (err) {
      console.error('[EMAIL] Failed to send:', err.message);
      // Still store the code — fallback to console
    }
  }

  // Always log to console as backup
  console.log(`[VERIFY] Code for ${email}: ${code} (type: ${type})`);

  return { sent: true, devCode: process.env.NODE_ENV !== 'production' ? code : undefined };
}

// Verify a submitted code
function verifyCode(email, inputCode) {
  const stored = verificationCodes.get(email);
  if (!stored) return { valid: false, error: 'No verification code found. Request a new one.' };
  if (Date.now() > stored.expiresAt) {
    verificationCodes.delete(email);
    return { valid: false, error: 'Code expired. Request a new one.' };
  }

  stored.attempts++;
  if (stored.attempts > 5) {
    verificationCodes.delete(email);
    return { valid: false, error: 'Too many failed attempts. Request a new code.' };
  }

  if (stored.code !== inputCode.toString()) {
    return { valid: false, error: 'Invalid code', attemptsLeft: 5 - stored.attempts };
  }

  verificationCodes.delete(email);
  return { valid: true, type: stored.type };
}

module.exports = { sendVerificationCode, verifyCode };
