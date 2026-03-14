/**
 * cleanupGuest.js — Nightly cron at 2:00 AM UTC
 * Soft-deletes unclaimed GuestSites that have expired (day 8+)
 * Clears generatedHtml to free MongoDB storage
 * Logs to AdminLog collection
 */
const cron = require('node-cron');
const GuestSite = require('../models/GuestSite');

async function runCleanup() {
  try {
    const expired = await GuestSite.findExpired();
    if (!expired.length) {
      console.log('[GuestCleanup] No expired sites to clean.');
      return;
    }
    let cleaned = 0;
    for (const site of expired) {
      site.status = 'deleted';
      site.generatedHtml = ''; // Free storage
      await site.save();
      cleaned++;
    }
    console.log(`[GuestCleanup] Cleaned ${cleaned} expired guest site(s).`);

    // Log to AdminLog if available
    try {
      const AdminLog = require('../models/AdminLog');
      if (AdminLog) {
        await AdminLog.create({
          action: 'guest_cleanup',
          details: `Cleaned ${cleaned} expired guest sites`,
          severity: 'low',
          createdAt: new Date(),
        });
      }
    } catch (_) {}
  } catch (err) {
    console.error('[GuestCleanup] Error:', err.message);
  }
}

function startGuestCleanupCron() {
  // Run at 2:00 AM UTC every day
  cron.schedule('0 2 * * *', () => {
    console.log('[GuestCleanup] Starting nightly cleanup...');
    runCleanup();
  }, { timezone: 'UTC' });
  console.log('[GuestCleanup] Cron scheduled: 2:00 AM UTC daily.');
}

module.exports = { startGuestCleanupCron, runCleanup };
