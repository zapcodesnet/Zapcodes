const SecurityFlag = require('../models/SecurityFlag');
const User = require('../models/User');

// Track failed login attempts per IP
const failedLogins = new Map(); // ip -> { count, firstAttempt }

function trackFailedLogin(ip, email, userAgent) {
  const entry = failedLogins.get(ip) || { count: 0, firstAttempt: Date.now(), emails: new Set() };
  entry.count += 1;
  entry.emails.add(email);
  failedLogins.set(ip, entry);

  // Check thresholds
  const elapsed = (Date.now() - entry.firstAttempt) / 1000;

  if (entry.count >= 10 && elapsed < 120) {
    // 10+ failed logins in 2 minutes = brute force
    createSecurityFlag({
      type: 'brute_force',
      severity: entry.count >= 50 ? 'critical' : 'high',
      description: `IP ${ip} attempted ${entry.count} failed logins in ${Math.round(elapsed)}s — probable credential stuffing. Targeted emails: ${Array.from(entry.emails).join(', ')}`,
      ip,
      userAgent,
    });
    failedLogins.delete(ip); // Reset after flagging
  }
}

function trackSuspiciousRequest(ip, path, userAgent, reason) {
  createSecurityFlag({
    type: 'suspicious_pattern',
    severity: 'medium',
    description: `Suspicious request from ${ip}: ${reason} (path: ${path})`,
    ip,
    userAgent,
  });
}

async function createSecurityFlag(data) {
  try {
    // Check if similar flag exists in last hour to avoid spam
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existing = await SecurityFlag.findOne({
      ip: data.ip,
      type: data.type,
      timestamp: { $gte: oneHourAgo },
    });
    if (existing) {
      // Update existing flag count
      existing.description = data.description;
      existing.severity = data.severity;
      await existing.save();
      return;
    }

    await SecurityFlag.create({
      ...data,
      status: 'new',
      timestamp: new Date(),
    });
    console.log(`[SECURITY] ${data.severity.toUpperCase()}: ${data.description}`);
  } catch (err) {
    console.error('Failed to create security flag:', err);
  }
}

// Clean up old tracking data every 10 minutes
setInterval(() => {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  for (const [ip, entry] of failedLogins) {
    if (entry.firstAttempt < fiveMinAgo) {
      failedLogins.delete(ip);
    }
  }
}, 10 * 60 * 1000);

module.exports = {
  trackFailedLogin,
  trackSuspiciousRequest,
  createSecurityFlag,
};
