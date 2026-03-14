const mongoose = require('mongoose');
const crypto = require('crypto');

const GuestSiteSchema = new mongoose.Schema(
  {
    subdomain:   { type: String, required: true, unique: true, lowercase: true, trim: true },
    siteType:    { type: String, enum: ['website', 'mobile-app'], default: 'website' },
    industry:    { type: String, default: 'general' },
    projectName: { type: String, default: 'My Project' },
    description: { type: String, default: '' },
    templateKey: { type: String, default: 'custom' },
    generatedHtml: { type: String, required: true },
    fingerprint: {
      ip:        { type: String, default: '' },
      deviceId:  { type: String, default: '' },
      userAgent: { type: String, default: '' },
      hash:      { type: String, required: true, index: true },
    },
    status:     { type: String, enum: ['active', 'claimed', 'expired', 'deleted'], default: 'active', index: true },
    claimedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    claimedAt:  { type: Date, default: null },
    claimedVia: { type: String, enum: ['zapcodes', 'blendlink', null], default: null },
    claimCode:  { type: String, index: true },
    expiresAt:  { type: Date, required: true, index: true },
    viewCount:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

GuestSiteSchema.statics.findActiveByHash = function (hash) {
  return this.findOne({ 'fingerprint.hash': hash, status: 'active', expiresAt: { $gt: new Date() } });
};
GuestSiteSchema.statics.hasGenerated = async function (hash) {
  const count = await this.countDocuments({ 'fingerprint.hash': hash, status: { $in: ['active', 'claimed'] } });
  return count > 0;
};
GuestSiteSchema.statics.findExpired = function (date = new Date()) {
  return this.find({ status: 'active', expiresAt: { $lte: date } });
};
GuestSiteSchema.statics.generateClaimCode = function () {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
};

GuestSiteSchema.index({ 'fingerprint.hash': 1, status: 1 });
GuestSiteSchema.index({ subdomain: 1 });
GuestSiteSchema.index({ claimedBy: 1 });
GuestSiteSchema.index({ expiresAt: 1, status: 1 });
GuestSiteSchema.index({ claimCode: 1 });

module.exports = mongoose.model('GuestSite', GuestSiteSchema);
