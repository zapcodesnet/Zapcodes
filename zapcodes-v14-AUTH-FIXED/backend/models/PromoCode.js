const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema({
  // ══════════ Code Identity ══════════
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, default: '' },

  // ══════════ Discount Configuration ══════════
  discountType: { type: String, enum: ['percentage', 'fixed', 'bl_coins', 'tier_upgrade'], required: true },
  discountValue: { type: Number, required: true }, // percentage (0-100), fixed amount ($), BL coins amount, or ignored for tier_upgrade
  tierUpgradeTo: { type: String, enum: ['bronze', 'silver', 'gold', 'diamond', null], default: null },

  // ══════════ Duration & Validity ══════════
  durationDays: { type: Number, default: 30 }, // How long the discount/benefit lasts for the user
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }, // When the promo code itself expires

  // ══════════ Usage Limits ══════════
  maxUses: { type: Number, default: 0 }, // 0 = unlimited
  usedCount: { type: Number, default: 0 },
  usedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: { type: String },
    usedAt: { type: Date, default: Date.now },
  }],

  // ══════════ Targeting ══════════
  applicableTiers: [{ type: String, enum: ['free', 'bronze', 'silver', 'gold', 'diamond'] }], // Empty = all tiers
  specificUsers: [{ type: String }], // Email list; empty = anyone can use

  // ══════════ Status ══════════
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByEmail: { type: String },

}, { timestamps: true });

promoCodeSchema.index({ code: 1 });
promoCodeSchema.index({ expiresAt: 1 });
promoCodeSchema.index({ isActive: 1 });

// Check if code is still valid
promoCodeSchema.methods.isValid = function () {
  if (!this.isActive) return { valid: false, reason: 'Code is deactivated' };
  if (new Date() < this.startsAt) return { valid: false, reason: 'Code not yet active' };
  if (new Date() > this.expiresAt) return { valid: false, reason: 'Code has expired' };
  if (this.maxUses > 0 && this.usedCount >= this.maxUses) return { valid: false, reason: 'Code usage limit reached' };
  return { valid: true };
};

// Check if a specific user can use this code
promoCodeSchema.methods.canBeUsedBy = function (user) {
  const validity = this.isValid();
  if (!validity.valid) return validity;

  // Check if already used by this user
  if (this.usedBy.some(u => u.user?.toString() === user._id.toString())) {
    return { valid: false, reason: 'You have already used this code' };
  }

  // Check tier restriction
  if (this.applicableTiers.length > 0 && !this.applicableTiers.includes(user.subscription_tier)) {
    return { valid: false, reason: 'Code not available for your subscription tier' };
  }

  // Check specific user restriction
  if (this.specificUsers.length > 0 && !this.specificUsers.includes(user.email.toLowerCase())) {
    return { valid: false, reason: 'Code not available for your account' };
  }

  return { valid: true };
};

module.exports = mongoose.model('PromoCode', promoCodeSchema);
