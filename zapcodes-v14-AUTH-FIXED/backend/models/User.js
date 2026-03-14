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

  // ══════════ NEW: Guest Site Claim ══════════
  claimedGuestSiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'GuestSite', default: null },
  subdomain: { type: String, default: null, lowercase: true, trim: true },
  stripeConnectId: { type: String, default: null },
  stripeConnectedAt: { type: Date, default: null },

  // ══════════ Zapcodes Daily Usage Tracking ══════════
  daily_usage: {
    date: { type: String },
    generations: { type: Number, default: 0 },
    codeFixes: { type: Number, default: 0 },
    githubPushes: { type: Number, default: 0 },
  },

  // ══════════ Monthly Usage Tracking ══════════
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

  // ══════════ One-Time Trial Tracking (never resets) ══════════
  trials_used: {
    'gemini-2.5-flash': { type: Number, default: 0 },
    'gemini-3.1-pro': { type: Number, default: 0 },
    fixes: { type: Number, default: 0 },
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
    linkedSubdomain: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }],

  // ══════════ Zapcodes: Form Submissions ══════════
  form_submissions: [{
    subdomain: { type: String },
    formType: { type: String },
    data: { type: mongoose.Schema.Types.Mixed },
    emailSent: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  }],

  // ══════════ ZapCodes Help AI — Rolling Memory System ══════════
  help_chat_history: [{
    role: { type: String },
    content: { type: String },
    model: { type: String },
    msgId: { type: String },
    usedModel: { type: String },
    imageCount: { type: Number, default: 0 },
    fileCount: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now },
  }],

  help_chat_histories: { type: mongoose.Schema.Types.Mixed, default: {} },
  help_chat_summaries: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Legacy usage
  scansUsed: { type: Number, default: 0 },
  scansLimit: { type: Number, default: 5 },
  buildsUsed: { type: Number, default: 0 },
  buildsLimit: { type: Number, default: 3 },
  fixesApplied: { type: Number, default: 0 },

  preferredAI: { type: String, enum: ['groq', 'gemini-flash', 'gemini-pro', 'haiku', 'sonnet', 'gemini-2.5-flash', 'gemini-3.1-pro', 'haiku-4.5', 'sonnet-4.6'], default: 'gemini-2.5-flash' },
  deployPlatform: { type: String, enum: ['cloudflare', 'vercel', 'render', 'netlify', 'railway', 'other', null], default: null },

  status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
  suspendedUntil: { type: Date },
  suspendReason: { type: String },
  banReason: { type: String },

  last_activity: { type: String },
  lastLoginAt: { type: Date },
  lastLoginIP: { type: String },
  lastLoginDevice: { type: String },
  loginCount: { type: Number, default: 0 },

  repos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Repo' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true, strict: false });

// Password hashing
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
  obj.plan = obj.subscription_tier;
  obj.blCoins = obj.bl_coins;
  obj.referralCode = obj.referral_code;
  obj.referredBy = obj.referred_by;
  obj.signupBonusClaimed = obj.signup_bonus_claimed;
  obj.lastDailyClaim = obj.last_daily_claim;
  obj.blTransactions = obj.bl_transactions;
  obj.dailyUsage = obj.daily_usage;
  obj.monthlyUsage = obj.monthly_usage;
  obj.trialsUsed = obj.trials_used;
  obj.deployedSites = obj.deployed_sites;
  obj.savedProjects = obj.saved_projects;
  obj.referralCount = obj.referral_count;
  obj.referralBonusesPaid = obj.referral_bonuses_paid;
  return obj;
};

userSchema.methods.isAdmin = function () { return ['super-admin', 'co-admin'].includes(this.role) || this.is_admin === true; };
userSchema.methods.isSuperAdmin = function () { return this.role === 'super-admin'; };
userSchema.methods.hasPermission = function (perm) {
  if (this.role === 'super-admin') return true;
  return this.permissions?.[perm] === true;
};

// ══════════ TIER CONFIG — 5-tier pricing ══════════
userSchema.methods.getTierConfig = function () {
  const tiers = {
    free: {
      price: 0,
      dailyClaim: 2000, maxChars: 2000, maxSites: 1, maxFileSize: 0,
      canPWA: false, canRemoveBadge: false, canProDev: false,
      monthlyFixCap: 1, monthlyFixType: 'one_time_trial',
      monthlyPushCap: 1, monthlyPushType: 'one_time_trial',
      modelChain: ['gemini-2.5-flash', 'groq'],
      monthlyLimits: { 'gemini-2.5-flash': 3, 'groq': 20 },
      trialModels: ['gemini-2.5-flash'],
      blCosts: { 'gemini-2.5-flash': 10000, 'groq': 5000 },
      dailyPhotoMinting: 5, memberPages: 1, monthlyListingLimit: 300,
      referralL1: 2, referralL2: 1, xpMultiplier: 1,
    },
    bronze: {
      price: 4.99,
      dailyClaim: 20000, maxChars: 3000, maxSites: 3, maxFileSize: 200 * 1024,
      canPWA: false, canRemoveBadge: false, canProDev: false,
      monthlyFixCap: 90, monthlyFixType: 'monthly',
      monthlyPushCap: 90, monthlyPushType: 'monthly',
      modelChain: ['gemini-3.1-pro', 'gemini-2.5-flash', 'groq'],
      monthlyLimits: { 'gemini-3.1-pro': 3, 'gemini-2.5-flash': 200, 'groq': 500 },
      trialModels: ['gemini-3.1-pro'],
      blCosts: { 'gemini-3.1-pro': 50000, 'gemini-2.5-flash': 10000, 'groq': 5000 },
      dailyPhotoMinting: 20, memberPages: 3, monthlyListingLimit: 2000,
      referralL1: 3, referralL2: 2, xpMultiplier: 2,
    },
    silver: {
      price: 14.99,
      dailyClaim: 80000, maxChars: 4000, maxSites: 5, maxFileSize: 500 * 1024,
      canPWA: false, canRemoveBadge: true, canProDev: false,
      monthlyFixCap: 300, monthlyFixType: 'monthly',
      monthlyPushCap: 300, monthlyPushType: 'monthly',
      modelChain: ['gemini-3.1-pro', 'gemini-2.5-flash', 'haiku-4.5', 'groq'],
      monthlyLimits: { 'gemini-3.1-pro': 50, 'gemini-2.5-flash': 500, 'haiku-4.5': 400, 'groq': 1000 },
      trialModels: [],
      blCosts: { 'gemini-3.1-pro': 50000, 'gemini-2.5-flash': 10000, 'haiku-4.5': 20000, 'groq': 5000 },
      dailyPhotoMinting: 50, memberPages: 10, monthlyListingLimit: 10000,
      referralL1: 3, referralL2: 2, xpMultiplier: 3,
    },
    gold: {
      price: 39.99,
      dailyClaim: 200000, maxChars: 5000, maxSites: 15, maxFileSize: 1024 * 1024,
      canPWA: true, canRemoveBadge: true, canProDev: true,
      monthlyFixCap: 1500, monthlyFixType: 'monthly',
      monthlyPushCap: 1500, monthlyPushType: 'monthly',
      modelChain: ['sonnet-4.6', 'gemini-3.1-pro', 'gemini-2.5-flash', 'haiku-4.5', 'groq'],
      monthlyLimits: { 'gemini-3.1-pro': 120, 'sonnet-4.6': 100, 'gemini-2.5-flash': 1000, 'haiku-4.5': 800, 'groq': 2000 },
      trialModels: [],
      blCosts: { 'sonnet-4.6': 60000, 'gemini-3.1-pro': 50000, 'gemini-2.5-flash': 10000, 'haiku-4.5': 20000, 'groq': 5000 },
      dailyPhotoMinting: 150, memberPages: 25, monthlyListingLimit: 25000,
      referralL1: 3, referralL2: 2, xpMultiplier: 4,
    },
    diamond: {
      price: 99.99,
      dailyClaim: 500000, maxChars: Infinity, maxSites: Infinity, maxFileSize: Infinity,
      canPWA: true, canRemoveBadge: true, canProDev: true,
      monthlyFixCap: Infinity, monthlyFixType: 'unlimited',
      monthlyPushCap: Infinity, monthlyPushType: 'unlimited',
      modelChain: ['sonnet-4.6', 'gemini-3.1-pro', 'gemini-2.5-flash', 'haiku-4.5', 'groq'],
      monthlyLimits: { 'gemini-3.1-pro': Infinity, 'sonnet-4.6': Infinity, 'gemini-2.5-flash': Infinity, 'haiku-4.5': Infinity, 'groq': Infinity },
      trialModels: [],
      blCosts: { 'sonnet-4.6': 60000, 'gemini-3.1-pro': 50000, 'gemini-2.5-flash': 10000, 'haiku-4.5': 20000, 'groq': 5000 },
      dailyPhotoMinting: Infinity, memberPages: Infinity, monthlyListingLimit: Infinity,
      referralL1: 4, referralL2: 3, xpMultiplier: 5,
    },
  };
  return tiers[this.subscription_tier] || tiers.free;
};

// ══════════ MONTHLY USAGE ══════════
userSchema.methods.getMonthlyUsage = function () {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (!this.monthly_usage || this.monthly_usage.month !== currentMonth) {
    this.monthly_usage = { month: currentMonth, gemini_pro_gens: 0, gemini_flash_gens: 0, haiku_gens: 0, sonnet_gens: 0, groq_gens: 0, code_fixes: 0, github_pushes: 0 };
  }
  return this.monthly_usage;
};

const MODEL_TO_USAGE_FIELD = {
  'gemini-3.1-pro': 'gemini_pro_gens', 'gemini-pro': 'gemini_pro_gens',
  'gemini-2.5-flash': 'gemini_flash_gens', 'gemini-flash': 'gemini_flash_gens',
  'haiku-4.5': 'haiku_gens', 'haiku': 'haiku_gens',
  'sonnet-4.6': 'sonnet_gens', 'sonnet': 'sonnet_gens',
  'groq': 'groq_gens',
};

userSchema.methods.incrementMonthlyUsage = function (model, actionType) {
  const mu = this.getMonthlyUsage();
  if (actionType === 'generation' || actionType === 'gen') { const field = MODEL_TO_USAGE_FIELD[model]; if (field && mu[field] !== undefined) mu[field] += 1; }
  else if (actionType === 'code_fix') { mu.code_fixes += 1; }
  else if (actionType === 'push') { mu.github_pushes += 1; }
  this.monthly_usage = mu;
  this.markModified('monthly_usage');
};

userSchema.methods.decrementMonthlyUsage = function (model, actionType) {
  const mu = this.getMonthlyUsage();
  if (actionType === 'generation' || actionType === 'gen') { const field = MODEL_TO_USAGE_FIELD[model]; if (field && mu[field] !== undefined) mu[field] = Math.max(0, mu[field] - 1); }
  else if (actionType === 'code_fix') { mu.code_fixes = Math.max(0, mu.code_fixes - 1); }
  else if (actionType === 'push') { mu.github_pushes = Math.max(0, mu.github_pushes - 1); }
  this.monthly_usage = mu;
  this.markModified('monthly_usage');
};

userSchema.methods.getModelUsageCount = function (modelKey) {
  const mu = this.getMonthlyUsage();
  const field = MODEL_TO_USAGE_FIELD[modelKey];
  if (field && mu[field] !== undefined) return mu[field];
  return 0;
};

userSchema.methods.isTrialExhausted = function (modelKey, limit) {
  if (!this.trials_used) return false;
  const used = this.trials_used[modelKey] || 0;
  return used >= limit;
};

userSchema.methods.incrementTrial = function (modelKey) {
  if (!this.trials_used) this.trials_used = {};
  this.trials_used[modelKey] = (this.trials_used[modelKey] || 0) + 1;
  this.markModified('trials_used');
};

userSchema.methods.canPerformAction = function (actionType) {
  if (this.role === 'super-admin') return true;
  return true;
};

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
