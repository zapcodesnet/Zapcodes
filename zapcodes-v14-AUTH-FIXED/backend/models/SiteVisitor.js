const mongoose = require('mongoose');

const siteVisitorSchema = new mongoose.Schema({
  // ══════════ Visitor Identity ══════════
  fingerprintHash: { type: String, index: true }, // Browser fingerprint hash
  ip: { type: String, index: true },
  userAgent: { type: String },

  // ══════════ Geo Location ══════════
  country: { type: String, default: 'Unknown' },
  countryCode: { type: String, default: 'XX' },
  region: { type: String, default: '' },
  city: { type: String, default: '' },
  latitude: { type: Number },
  longitude: { type: Number },

  // ══════════ Visit Context ══════════
  page: { type: String, default: '/' }, // Which page they visited
  referrer: { type: String, default: '' },
  platform: { type: String, enum: ['zapcodes', 'blendlink', 'widget'], default: 'zapcodes' },

  // ══════════ User Journey ══════════
  didRegister: { type: Boolean, default: false },
  registeredUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  registeredAt: { type: Date },

  usedGuestBuilder: { type: Boolean, default: false },
  guestBuildAt: { type: Date },
  guestSiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'GuestSite' },

  // ══════════ Referral Tracking ══════════
  referralCode: { type: String }, // If they arrived via a referral link
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // ══════════ Session Data ══════════
  visitCount: { type: Number, default: 1 },
  firstVisit: { type: Date, default: Date.now },
  lastVisit: { type: Date, default: Date.now },
  totalTimeSeconds: { type: Number, default: 0 },

}, { timestamps: true });

siteVisitorSchema.index({ createdAt: -1 });
siteVisitorSchema.index({ country: 1 });
siteVisitorSchema.index({ didRegister: 1 });
siteVisitorSchema.index({ usedGuestBuilder: 1 });
siteVisitorSchema.index({ platform: 1, createdAt: -1 });

module.exports = mongoose.model('SiteVisitor', siteVisitorSchema);
