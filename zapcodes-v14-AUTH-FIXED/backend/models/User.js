const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
  // ══════════ Core Identity (matches BlendLink) ══════════
  user_id: { type: String, unique: true, default: () => `user_${uuidv4().replace(/-/g, '').slice(0, 12)}` },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, select: false },
  password_hash: { type: String, select: false },
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
  stripe_customer_id: { type: String },
  xenditCustomerId: { type: String },
  paymentProvider: { type: String, enum: ['stripe', 'xendit', null], default: null },

  // ══════════ UNIFIED BL Coin Economy (matches BlendLink) ══════════
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

  // ══════════ Monthly Usage Tracking (NEW) ══════════
  monthly_usage: {
    month: { type: String },
    gemini_pro_gens: { type: Number, default: 0 },
    gemini_flash_gens: { type: Number, default: 0 },
    haiku_gens: { type: Number, default: 0 },
    sonnet_gens: { type: Number, default: 0 },
    groq_gens: { type: Number, default: 0 },
    code_fixes: { type: Number, default: 0 },
    github_pushes: { type: Number, default: 0 },
  },

  // ══════════ UNIFIED Referral System (matches BlendLink) ══════════
  referral_code: { type: String, unique: true, sparse: true },
  referred_by: { type: String },
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

  // Legacy usage
  scansUsed: { type: Number, default: 0 },
  scansLimit: { type: Number, default: 5 },
  buildsUsed: { type: Number, default: 0 },
  buildsLimit: { type: Number, default: 3 },
  fixesApplied: { type: Number, default: 0 },

  // AI Preferences
  preferredAI: { type: String, enum: ['groq', 'gemini-flash', 'gemini-pro', 'haiku', 'sonnet'], default: 'gemini-flash' },
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

// Password hashing — writes BOTH fields for cross-platform compatibility
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const hashed = await bcrypt.hash(this.password, 12);
  this.password = hashed;
  this.password_hash = hashed;
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
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
  // Backward-compatible aliases for frontend
  obj.plan = obj.subscription_tier;
  obj.blCoins = obj.bl_coins;
  obj.referralCode = obj.referral_code;
  obj.referredBy = obj.referred_by;
  obj.signupBonusClaimed = obj.signup_bonus_claimed;
  obj.lastDailyClaim = obj.last_daily_claim;
  obj.blTransactions = obj.bl_transactions;
  obj.dailyUsage = obj.daily_usage;
  obj.monthlyUsage = obj.monthly_usage;
  obj.deployedSites = obj.deployed_sites;
  obj.savedProjects = obj.saved_projects;
  obj.referralCount = obj.referral_count;
  obj.referralBonusesPaid = obj.referral_bonuses_paid;
  return obj;
};

// Role checks
userSchema.methods.isAdmin = function () { return ['super-admin', 'co-admin'].includes(this.role) || this.is_admin === true; };
userSchema.methods.isSuperAdmin = function () { return this.role === 'super-admin'; };
userSchema.methods.hasPermission = function (perm) {
  if (this.role === 'super-admin') return true;
  return this.permissions?.[perm] === true;
};

// ══════════ TIER CONFIG — NEW: Monthly limits + model chains ══════════
userSchema.methods.getTierConfig = function () {
  const tiers = {
    free: {
      dailyClaim: 2000, maxChars: 2000, maxSites: 1, maxFileSize: 0,
      canPWA: false, canRemoveBadge: false, canProDev: false,
      monthlyFixCap: 0, monthlyPushCap: 0,
      modelChain: ['gemini-flash', 'groq'],
      monthlyLimits: { 'gemini-flash': 1, groq: 30 },
    },
    bronze: {
      dailyClaim: 20000, maxChars: 3000, maxSites: 3, maxFileSize: 200 * 1024,
      canPWA: false, canRemoveBadge: false, canProDev: false,
      monthlyFixCap: 90, monthlyPushCap: 90,
      modelChain: ['gemini-flash', 'groq'],
      monthlyLimits: { 'gemini-flash': 30, groq: 90 },
    },
    silver: {
      dailyClaim: 80000, maxChars: 4000, maxSites: 5, maxFileSize: 500 * 1024,
      canPWA: false, canRemoveBadge: true, canProDev: false,
      monthlyFixCap: 300, monthlyPushCap: 300,
      modelChain: ['gemini-flash', 'groq'],
      monthlyLimits: { 'gemini-flash': 210, groq: 630 },
    },
    gold: {
      dailyClaim: 250000, maxChars: 5000, maxSites: 15, maxFileSize: 1024 * 1024,
      canPWA: true, canRemoveBadge: true, canProDev: true,
      monthlyFixCap: 1500, monthlyPushCap: 1500,
      modelChain: ['gemini-pro', 'gemini-flash', 'groq'],
      monthlyLimits: { 'gemini-pro': 450, 'gemini-flash': 450, groq: 1350 },
    },
    diamond: {
      dailyClaim: 500000, maxChars: Infinity, maxSites: Infinity, maxFileSize: Infinity,
      canPWA: true, canRemoveBadge: true, canProDev: true,
      monthlyFixCap: Infinity, monthlyPushCap: Infinity,
      modelChain: ['gemini-pro', 'gemini-flash', 'haiku', 'groq'],
      monthlyLimits: { 'gemini-pro': Infinity, 'gemini-flash': Infinity, haiku: Infinity, groq: Infinity },
    },
  };
  return tiers[this.subscription_tier] || tiers.free;
};

// ══════════ MONTHLY USAGE — auto-resets each month ══════════
userSchema.methods.getMonthlyUsage = function () {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (!this.monthly_usage || this.monthly_usage.month !== currentMonth) {
    this.monthly_usage = {
      month: currentMonth,
      gemini_pro_gens: 0,
      gemini_flash_gens: 0,
      haiku_gens: 0,
      sonnet_gens: 0,
      groq_gens: 0,
      code_fixes: 0,
      github_pushes: 0,
    };
  }
  return this.monthly_usage;
};

userSchema.methods.incrementMonthlyUsage = function (model, actionType) {
  const mu = this.getMonthlyUsage();
  if (actionType === 'generation' || actionType === 'gen') {
    const field = `${model.replace(/-/g, '_')}_gens`;
    if (mu[field] !== undefined) mu[field] += 1;
  } else if (actionType === 'code_fix') {
    mu.code_fixes += 1;
  } else if (actionType === 'push') {
    mu.github_pushes += 1;
  }
  this.monthly_usage = mu;
};

userSchema.methods.decrementMonthlyUsage = function (model, actionType) {
  const mu = this.getMonthlyUsage();
  if (actionType === 'generation' || actionType === 'gen') {
    const field = `${model.replace(/-/g, '_')}_gens`;
    if (mu[field] !== undefined) mu[field] = Math.max(0, mu[field] - 1);
  } else if (actionType === 'code_fix') {
    mu.code_fixes = Math.max(0, mu.code_fixes - 1);
  } else if (actionType === 'push') {
    mu.github_pushes = Math.max(0, mu.github_pushes - 1);
  }
  this.monthly_usage = mu;
};

// Daily usage check (kept for backward compatibility)
userSchema.methods.canPerformAction = function (actionType) {
  if (this.role === 'super-admin') return true;
  const config = this.getTierConfig();
  const today = new Date().toISOString().split('T')[0];
  if (!this.daily_usage || this.daily_usage.date !== today) {
    this.daily_usage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
  }
  switch (actionType) {
    case 'generation': return true; // Now handled by monthly limits
    case 'codeFix': return true;    // Now handled by monthly limits
    case 'githubPush': return true;  // Now handled by monthly limits
    default: return false;
  }
};

// BL Coin operations
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

userSchema.methods.canClaimDaily = function () {
  const lastClaim = this.last_daily_claim || this.daily_claim_last;
  if (!lastClaim) return true;
  const claimTime = lastClaim instanceof Date ? lastClaim.getTime() : new Date(lastClaim).getTime();
  return (Date.now() - claimTime) >= 24 * 60 * 60 * 1000;
};

userSchema.methods.getClaimCountdown = function () {
  const lastClaim = this.last_daily_claim || this.daily_claim_last;
  if (!lastClaim) return 0;
  const claimTime = lastClaim instanceof Date ? lastClaim.getTime() : new Date(lastClaim).getTime();
  const next = claimTime + 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((next - Date.now()) / 1000));
};

userSchema.methods.getEffectiveAI = function (requestedModel) {
  const config = this.getTierConfig();
  if (requestedModel && config.modelChain.includes(requestedModel)) return requestedModel;
  return config.modelChain[0];
};

module.exports = mongoose.model('User', userSchema);
