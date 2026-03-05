const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// ══════════════════════════════════════════════════════════════════
// UNIFIED USER MODEL — Field names match BlendLink's database
// Both blendlink.net and zapcodes.net share the same users collection
// ══════════════════════════════════════════════════════════════════

const userSchema = new mongoose.Schema({
  // ══════════ Core Identity (matches BlendLink) ══════════
  user_id: { type: String, unique: true, default: () => `user_${uuidv4().replace(/-/g, '').slice(0, 12)}` },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, select: false },           // Zapcodes auth uses this
  password_hash: { type: String, select: false },       // BlendLink auth uses this
  name: { type: String, required: true, trim: true },
  username: { type: String, default: '' },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '' },

  // ══════════ OAuth Providers ══════════
  provider: { type: String, enum: ['local', 'google', 'github', 'apple'], default: 'local' },
  providerId: { type: String },
  emailVerified: { type: Boolean, default: false },
  githubToken: { type: String, select: false },
  githubTokenPermanent: { type: Boolean, default: false },
  githubTokenSetAt: { type: Date },

  // ══════════ Role System ══════════
  // BlendLink uses: is_admin (boolean)
  // Zapcodes uses: role (string) — keep BOTH so both platforms work
  role: { type: String, enum: ['user', 'moderator', 'co-admin', 'super-admin'], default: 'user' },
  is_admin: { type: Boolean, default: false },
  permissions: {
    viewAnalytics: { type: Boolean, default: false },
    moderateUsers: { type: Boolean, default: false },
    viewFinancials: { type: Boolean, default: false },
    adjustPricing: { type: Boolean, default: false },
    viewSecurityLogs: { type: Boolean, default: false },
    manageAI: { type: Boolean, default: false },
    manageRoles: { type: Boolean, default: false },
    deleteUsers: { type: Boolean, default: false },
    globalSettings: { type: Boolean, default: false },
  },

  // ══════════ 2FA ══════════
  twoFactorSecret: { type: String, select: false },
  twoFactorEnabled: { type: Boolean, default: false },

  // ══════════ UNIFIED Subscription (matches BlendLink) ══════════
  // CHANGED: "plan" → "subscription_tier" to match BlendLink
  subscription_tier: { type: String, enum: ['free', 'bronze', 'silver', 'gold', 'diamond'], default: 'free' },
  customPrice: { type: Number, default: null },
  billingInterval: { type: String, enum: ['monthly', 'yearly', 'one-time', null], default: null },
  subscriptionStart: { type: Date },
  subscriptionEnd: { type: Date },
  freeForever: { type: Boolean, default: false },
  discount: {
    percent: { type: Number, default: 0 },
    expiresAt: { type: Date },
    reason: { type: String },
  },
  customFeatures: [{ type: String }],
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  stripe_customer_id: { type: String },      // BlendLink uses this name
  xenditCustomerId: { type: String },
  paymentProvider: { type: String, enum: ['stripe', 'xendit', null], default: null },

  // ══════════ UNIFIED BL Coin Economy (matches BlendLink) ══════════
  // CHANGED: "blCoins" → "bl_coins" to match BlendLink
  bl_coins: { type: Number, default: 0 },
  signup_bonus_claimed: { type: Boolean, default: false },
  last_daily_claim: { type: Date, default: null },
  bl_transactions: [{
    type: { type: String, enum: ['claim', 'signup_bonus', 'referral_bonus', 'generation', 'code_fix', 'github_push', 'pwa_build', 'badge_removal', 'topup', 'admin_adjustment', 'game_bet', 'game_win', 'listing_fee', 'sale_commission'] },
    amount: { type: Number },
    balance: { type: Number },
    description: { type: String },
    aiModel: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],

  // ══════════ BlendLink-specific fields (shared database) ══════════
  usd_balance: { type: Number, default: 0.0 },
  total_earnings: { type: Number, default: 0.0 },
  pending_earnings: { type: Number, default: 0.0 },
  available_balance: { type: Number, default: 0.0 },
  total_earnings_bl: { type: Number, default: 0 },
  total_earnings_usd: { type: Number, default: 0.0 },
  rank: { type: String, default: 'regular' },
  is_diamond: { type: Boolean, default: false },
  kyc_status: { type: String, default: 'not_started' },
  has_violations: { type: Boolean, default: false },
  id_verified: { type: Boolean, default: false },
  followers_count: { type: Number, default: 0 },
  following_count: { type: Number, default: 0 },
  diamond_qualification_progress: { type: mongoose.Schema.Types.Mixed, default: {} },
  disclaimer_accepted: { type: Boolean, default: false },
  disclaimer_accepted_at: { type: String },

  // ══════════ Zapcodes Daily Usage Tracking ══════════
  daily_usage: {
    date: { type: String },
    generations: { type: Number, default: 0 },
    codeFixes: { type: Number, default: 0 },
    githubPushes: { type: Number, default: 0 },
  },

  // ══════════ UNIFIED Referral System (matches BlendLink) ══════════
  // CHANGED: "referralCode" → "referral_code" to match BlendLink
  // CHANGED: "referredBy" → "referred_by" to match BlendLink
  referral_code: { type: String, unique: true, sparse: true },
  referred_by: { type: String },  // stores user_id string (BlendLink style)
  referral_count: { type: Number, default: 0 },
  referral_bonuses_paid: { type: Number, default: 0 },
  direct_referrals: { type: Number, default: 0 },
  indirect_referrals: { type: Number, default: 0 },
  level1_referrals: { type: Number, default: 0 },
  level2_referrals: { type: Number, default: 0 },

  // ══════════ Zapcodes: Deployed Sites ══════════
  deployed_sites: [{
    subdomain: { type: String, required: true },
    title: { type: String },
    files: { type: mongoose.Schema.Types.Mixed, default: [] },
    createdAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now },
    hasBadge: { type: Boolean, default: true },
    isPWA: { type: Boolean, default: false },
    fileSize: { type: Number, default: 0 },
  }],

  // ══════════ Zapcodes: Saved Projects ══════════
  saved_projects: [{
    projectId: { type: String, required: true },
    name: { type: String, default: 'Untitled Project' },
    files: { type: mongoose.Schema.Types.Mixed, default: [] },
    preview: { type: String, default: '' },
    template: { type: String, default: 'custom' },
    description: { type: String, default: '' },
    version: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }],

  // Legacy usage (kept for migration)
  scansUsed: { type: Number, default: 0 },
  scansLimit: { type: Number, default: 5 },
  buildsUsed: { type: Number, default: 0 },
  buildsLimit: { type: Number, default: 3 },
  fixesApplied: { type: Number, default: 0 },

  // AI Preferences
  preferredAI: { type: String, enum: ['groq', 'haiku', 'opus'], default: 'groq' },
  deployPlatform: { type: String, enum: ['cloudflare', 'vercel', 'render', 'netlify', 'railway', 'other', null], default: null },

  // Status
  status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
  suspendedUntil: { type: Date },
  suspendReason: { type: String },
  banReason: { type: String },

  // Tracking
  last_activity: { type: String },
  lastLoginAt: { type: Date },
  lastLoginIP: { type: String },
  lastLoginDevice: { type: String },
  loginCount: { type: Number, default: 0 },

  repos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Repo' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true, strict: false });
// NOTE: strict:false allows BlendLink's extra fields to exist without errors

// Password hashing — writes BOTH "password" and "password_hash" for cross-platform compatibility
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const hashed = await bcrypt.hash(this.password, 12);
  this.password = hashed;
  this.password_hash = hashed;  // BlendLink reads this field
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  // Try both field names for cross-platform login
  const hash = this.password || this.password_hash;
  if (!hash) return false;
  return bcrypt.compare(candidatePassword, hash);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.password_hash;
  delete obj.githubToken;
  delete obj.twoFactorSecret;
  return obj;
};

// Role checks
userSchema.methods.isAdmin = function () { return ['super-admin', 'co-admin'].includes(this.role) || this.is_admin === true; };
userSchema.methods.isSuperAdmin = function () { return this.role === 'super-admin'; };
userSchema.methods.hasPermission = function (perm) {
  if (this.role === 'super-admin') return true;
  return this.permissions?.[perm] === true;
};

// ══════════ TIER CONFIG — Uses subscription_tier field ══════════
userSchema.methods.getTierConfig = function () {
  const tiers = {
    free:    { dailyClaim: 2000,   dailyGenCap: 1,        dailyFixCap: 0,        dailyPushCap: 0,        maxSites: 1,        maxChars: 2000,     maxFileSize: 0,            aiModels: ['groq'],                   canPWA: false, canRemoveBadge: false, canProDev: false },
    bronze:  { dailyClaim: 20000,  dailyGenCap: 5,        dailyFixCap: 3,        dailyPushCap: 3,        maxSites: 3,        maxChars: 3000,     maxFileSize: 200 * 1024,   aiModels: ['groq'],                   canPWA: false, canRemoveBadge: false, canProDev: false },
    silver:  { dailyClaim: 80000,  dailyGenCap: 7,        dailyFixCap: 10,       dailyPushCap: 10,       maxSites: 5,        maxChars: 4000,     maxFileSize: 500 * 1024,   aiModels: ['haiku', 'groq'],          canPWA: false, canRemoveBadge: false, canProDev: false },
    gold:    { dailyClaim: 250000, dailyGenCap: 15,       dailyFixCap: 50,       dailyPushCap: 50,       maxSites: 15,       maxChars: 5000,     maxFileSize: 1024 * 1024,  aiModels: ['haiku', 'groq'],          canPWA: true,  canRemoveBadge: true,  canProDev: true },
    diamond: { dailyClaim: 500000, dailyGenCap: Infinity, dailyFixCap: Infinity, dailyPushCap: Infinity, maxSites: Infinity, maxChars: Infinity, maxFileSize: Infinity,     aiModels: ['opus', 'haiku', 'groq'],  canPWA: true,  canRemoveBadge: true,  canProDev: true },
  };
  // CHANGED: reads "subscription_tier" instead of "plan"
  return tiers[this.subscription_tier] || tiers.free;
};

// Daily usage check + auto-reset
userSchema.methods.canPerformAction = function (actionType) {
  if (this.role === 'super-admin') return true;
  const config = this.getTierConfig();
  const today = new Date().toISOString().split('T')[0];
  // CHANGED: "dailyUsage" → "daily_usage"
  if (!this.daily_usage || this.daily_usage.date !== today) {
    this.daily_usage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
  }
  switch (actionType) {
    case 'generation': return this.daily_usage.generations < config.dailyGenCap;
    case 'codeFix':    return this.daily_usage.codeFixes < config.dailyFixCap;
    case 'githubPush': return this.daily_usage.githubPushes < config.dailyPushCap;
    default: return false;
  }
};

// BL Coin operations — CHANGED: "blCoins" → "bl_coins", "blTransactions" → "bl_transactions"
userSchema.methods.spendCoins = function (amount, type, description, aiModel) {
  if (this.role === 'super-admin') return;
  if (this.bl_coins < amount) throw new Error('Insufficient BL coins');
  this.bl_coins -= amount;
  this.bl_transactions.push({ type, amount: -amount, balance: this.bl_coins, description, aiModel });
  if (this.bl_transactions.length > 100) this.bl_transactions = this.bl_transactions.slice(-100);
};

userSchema.methods.creditCoins = function (amount, type, description) {
  this.bl_coins += amount;
  this.bl_transactions.push({ type, amount, balance: this.bl_coins, description });
  if (this.bl_transactions.length > 100) this.bl_transactions = this.bl_transactions.slice(-100);
};

// CHANGED: "lastDailyClaim" → "last_daily_claim"
userSchema.methods.canClaimDaily = function () {
  if (!this.last_daily_claim) return true;
  return (Date.now() - this.last_daily_claim.getTime()) >= 24 * 60 * 60 * 1000;
};

userSchema.methods.getClaimCountdown = function () {
  if (!this.last_daily_claim) return 0;
  const next = this.last_daily_claim.getTime() + 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((next - Date.now()) / 1000));
};

// Get effective AI model for tier
userSchema.methods.getEffectiveAI = function (requestedModel) {
  const config = this.getTierConfig();
  if (requestedModel && config.aiModels.includes(requestedModel)) return requestedModel;
  return config.aiModels[0];
};

module.exports = mongoose.model('User', userSchema);
