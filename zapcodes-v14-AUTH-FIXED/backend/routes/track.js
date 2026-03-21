// backend/routes/track.js
// Public visitor tracking endpoint — NO auth required
// Called by frontend on every page load to record visits
// Uses free ip-api.com for geolocation (no API key needed)

const express = require('express');
const router = express.Router();
const SiteVisitor = require('../models/SiteVisitor');

// Simple in-memory rate limiter to avoid duplicate tracking per IP+page within 30 min
const recentVisits = new Map();
const DEDUP_WINDOW = 30 * 60 * 1000; // 30 minutes

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of recentVisits) {
    if (now - ts > DEDUP_WINDOW) recentVisits.delete(key);
  }
}, 10 * 60 * 1000);

// Lookup geo from IP using free ip-api.com (no key needed, 45 req/min)
async function getGeoFromIP(ip) {
  try {
    // Skip localhost / private IPs
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168') || ip.startsWith('10.') || ip === '::ffff:127.0.0.1') {
      return { country: 'Local', countryCode: 'XX', city: 'localhost', region: '', latitude: 0, longitude: 0 };
    }

    const cleanIP = ip.replace('::ffff:', '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`http://ip-api.com/json/${cleanIP}?fields=status,country,countryCode,regionName,city,lat,lon`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();
    if (data.status === 'success') {
      return {
        country: data.country || 'Unknown',
        countryCode: data.countryCode || 'XX',
        city: data.city || '',
        region: data.regionName || '',
        latitude: data.lat || 0,
        longitude: data.lon || 0,
      };
    }
    return { country: 'Unknown', countryCode: 'XX', city: '', region: '', latitude: 0, longitude: 0 };
  } catch (e) {
    return { country: 'Unknown', countryCode: 'XX', city: '', region: '', latitude: 0, longitude: 0 };
  }
}

// ══════════════════════════════════════════════════════════════
// POST /api/track/visit
// Public — no auth. Records a page visit with geolocation.
// ══════════════════════════════════════════════════════════════
router.post('/visit', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
             || req.headers['cf-connecting-ip']
             || req.ip
             || 'unknown';

    const { page, referrer, fingerprint, platform, referralCode, usedGuestBuilder } = req.body;

    // Deduplicate: same IP + same page within 30 min = skip
    const dedupKey = `${ip}:${page || '/'}`;
    if (recentVisits.has(dedupKey)) {
      return res.json({ ok: true, deduped: true });
    }
    recentVisits.set(dedupKey, Date.now());

    // Get geolocation from IP
    const geo = await getGeoFromIP(ip);

    // Check if this fingerprint/IP already has a record
    const existing = fingerprint
      ? await SiteVisitor.findOne({ fingerprintHash: fingerprint })
      : await SiteVisitor.findOne({ ip, page: page || '/' });

    if (existing) {
      // Update existing visitor — increment visit count
      existing.visitCount = (existing.visitCount || 1) + 1;
      existing.lastVisit = new Date();
      if (usedGuestBuilder && !existing.usedGuestBuilder) {
        existing.usedGuestBuilder = true;
        existing.guestBuildAt = new Date();
      }
      // Update geo if it was unknown before
      if (existing.country === 'Unknown' && geo.country !== 'Unknown') {
        existing.country = geo.country;
        existing.countryCode = geo.countryCode;
        existing.city = geo.city;
        existing.region = geo.region;
        existing.latitude = geo.latitude;
        existing.longitude = geo.longitude;
      }
      await existing.save();
      return res.json({ ok: true, returning: true });
    }

    // Create new visitor record
    await SiteVisitor.create({
      fingerprintHash: fingerprint || null,
      ip,
      userAgent: req.headers['user-agent'] || '',
      country: geo.country,
      countryCode: geo.countryCode,
      city: geo.city,
      region: geo.region,
      latitude: geo.latitude,
      longitude: geo.longitude,
      page: page || '/',
      referrer: referrer || '',
      platform: platform || 'zapcodes',
      referralCode: referralCode || null,
      usedGuestBuilder: usedGuestBuilder || false,
      guestBuildAt: usedGuestBuilder ? new Date() : null,
      didRegister: false,
      visitCount: 1,
      firstVisit: new Date(),
      lastVisit: new Date(),
    });

    res.json({ ok: true, new: true });
  } catch (err) {
    // Never fail the user experience over tracking
    console.error('[Track] Visit tracking error:', err.message);
    res.json({ ok: true, error: true });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/track/register
// Called by auth route after successful registration to mark
// a visitor as "registered" (links visitor to user)
// ══════════════════════════════════════════════════════════════
router.post('/register', async (req, res) => {
  try {
    const { fingerprint, userId, ip } = req.body;
    if (!fingerprint && !ip) return res.json({ ok: true });

    const query = fingerprint ? { fingerprintHash: fingerprint } : { ip };
    const visitor = await SiteVisitor.findOne(query).sort({ lastVisit: -1 });

    if (visitor && !visitor.didRegister) {
      visitor.didRegister = true;
      visitor.registeredUserId = userId;
      visitor.registeredAt = new Date();
      await visitor.save();
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[Track] Register tracking error:', err.message);
    res.json({ ok: true });
  }
});

module.exports = router;
