const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, select: false },
  name: { type: String, required: true, trim: true },
  avatar: { type: String, default: '' },
  provider: { type: String, enum: ['local', 'google', 'github', 'apple'], default: 'local' },
  providerId: { type: String },
  emailVerified: { type: Boolean, default: false },
  githubToken: { type: String, select: false },
  githubTokenPermanent: { type: Boolean, default: false },
  githubTokenSetAt: { type: Date },

  // Role system
  role: { type: String, enum: ['user', 'moderator', 'co-admin', 'super-admin'], default: 'user' },
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

  // 2FA
  twoFactorSecret: { type: String, select: false },
  twoFactorEnabled: { type: Boolean, default: false },

  // ══════════ Subscription & billing (NEW TIERS) ══════════
  plan: { type: String, enum: ['free', 'bronze', 'silver', 'gold', 'diamond'], default: 'free' },
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
  xenditCustomerId: { type: String },
  paymentProvider: { type: String, enum: ['stripe', 'xendit', null], default: null },

  // ══════════ BL Coin Economy ══════════
  blCoins: { type: Number, default: 0 },
  signupBonusClaimed: { type: Boolean, default: false },
  lastDailyClaim: { type: Date, default: null },
  blTransactions: [{
    type: { type: String, enum: ['claim', 'signup_bonus', 'referral_bonus', 'generation', 'code_fix', 'github_push', 'pwa_build', 'badge_removal', 'topup', 'admin_adjustment'] },
    amount: { type: Number },
    balance: { type: Number },
    description: { type: String },
    aiModel: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],

  // ══════════ Daily Usage Tracking ══════════
  dailyUsage: {
    date: { type: String },
    generations: { type: Number, default: 0 },
    codeFixes: { type: Number, default: 0 },
    githubPushes: { type: Number, default: 0 },
  },

  // ══════════ Referral System ══════════
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  referralCount: { type: Number, default: 0 },
  referralBonusesPaid: { type: Number, default: 0 },

  // ══════════ Deployed Sites ══════════
  deployedSites: [{
    subdomain: { type: String, required: true },
    title: { type: String },
    createdAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now },
    hasBadge: { type: Boolean, default: true },
    isPWA: { type: Boolean, default: false },
    fileSize: { type: Number, default: 0 },
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
  lastLoginAt: { type: Date },
  lastLoginIP: { type: String },
  lastLoginDevice: { type: String },
  loginCount: { type: Number, default: 0 },

  repos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Repo' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Password hashing
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.githubToken;
  delete obj.twoFactorSecret;
  return obj;
};

// Role checks
userSchema.methods.isAdmin = function () { return ['super-admin', 'co-admin'].includes(this.role); };
userSchema.methods.isSuperAdmin = function () { return this.role === 'super-admin'; };
userSchema.methods.hasPermission = function (perm) {
  if (this.role === 'super-admin') return true;
  return this.permissions?.[perm] === true;
};

// ══════════ TIER CONFIG — Single source of truth ══════════
userSchema.methods.getTierConfig = function () {
  const tiers = {
    free:    { dailyClaim: 2000,   dailyGenCap: 1,        dailyFixCap: 0,        dailyPushCap: 0,        maxSites: 1,        maxChars: 1500,     maxFileSize: 0,            aiModels: ['groq'],           canPWA: false, canRemoveBadge: false, canProDev: false },
    bronze:  { dailyClaim: 20000,  dailyGenCap: 5,        dailyFixCap: 3,        dailyPushCap: 3,        maxSites: 3,        maxChars: 3000,     maxFileSize: 200 * 1024,   aiModels: ['groq'],           canPWA: false, canRemoveBadge: false, canProDev: false },
    silver:  { dailyClaim: 80000,  dailyGenCap: 7,        dailyFixCap: 10,       dailyPushCap: 10,       maxSites: 5,        maxChars: 4000,     maxFileSize: 500 * 1024,   aiModels: ['haiku'],          canPWA: false, canRemoveBadge: false, canProDev: false },
    gold:    { dailyClaim: 250000, dailyGenCap: 15,       dailyFixCap: 50,       dailyPushCap: 50,       maxSites: 15,       maxChars: 5000,     maxFileSize: 1024 * 1024,  aiModels: ['haiku'],          canPWA: true,  canRemoveBadge: true,  canProDev: true },
    diamond: { dailyClaim: 500000, dailyGenCap: Infinity, dailyFixCap: Infinity, dailyPushCap: Infinity, maxSites: Infinity, maxChars: Infinity, maxFileSize: Infinity,     aiModels: ['haiku', 'opus'],  canPWA: true,  canRemoveBadge: true,  canProDev: true },
  };
  return tiers[this.plan] || tiers.free;
};

// Daily usage check + auto-reset
userSchema.methods.canPerformAction = function (actionType) {
  if (this.role === 'super-admin') return true;
  const config = this.getTierConfig();
  const today = new Date().toISOString().split('T')[0];
  if (!this.dailyUsage || this.dailyUsage.date !== today) {
    this.dailyUsage = { date: today, generations: 0, codeFixes: 0, githubPushes: 0 };
  }
  switch (actionType) {
    case 'generation': return this.dailyUsage.generations < config.dailyGenCap;
    case 'codeFix':    return this.dailyUsage.codeFixes < config.dailyFixCap;
    case 'githubPush': return this.dailyUsage.githubPushes < config.dailyPushCap;
    default: return false;
  }
};

// BL Coin operations
userSchema.methods.spendCoins = function (amount, type, description, aiModel) {
  if (this.role === 'super-admin') return;
  if (this.blCoins < amount) throw new Error('Insufficient BL coins');
  this.blCoins -= amount;
  this.blTransactions.push({ type, amount: -amount, balance: this.blCoins, description, aiModel });
  if (this.blTransactions.length > 100) this.blTransactions = this.blTransactions.slice(-100);
};

userSchema.methods.creditCoins = function (amount, type, description) {
  this.blCoins += amount;
  this.blTransactions.push({ type, amount, balance: this.blCoins, description });
  if (this.blTransactions.length > 100) this.blTransactions = this.blTransactions.slice(-100);
};

userSchema.methods.canClaimDaily = function () {
  if (!this.lastDailyClaim) return true;
  return (Date.now() - this.lastDailyClaim.getTime()) >= 24 * 60 * 60 * 1000;
};

userSchema.methods.getClaimCountdown = function () {
  if (!this.lastDailyClaim) return 0;
  const next = this.lastDailyClaim.getTime() + 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((next - Date.now()) / 1000));
};

// Get effective AI model for tier
userSchema.methods.getEffectiveAI = function (requestedModel) {
  const config = this.getTierConfig();
  if (requestedModel && config.aiModels.includes(requestedModel)) return requestedModel;
  return config.aiModels[0];
};

module.exports = mongoose.model('User', userSchema);
