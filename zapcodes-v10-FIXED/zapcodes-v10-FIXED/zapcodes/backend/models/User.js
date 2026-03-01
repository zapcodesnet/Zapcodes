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
  githubTokenPermanent: { type: Boolean, default: false }, // user opted to keep token permanently
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

  // Subscription & billing
  plan: { type: String, enum: ['free', 'starter', 'pro', 'diamond'], default: 'free' },
  customPrice: { type: Number, default: null },
  billingInterval: { type: String, enum: ['monthly', 'yearly', 'one-time', null], default: null },
  subscriptionStart: { type: Date },
  subscriptionEnd: { type: Date }, // null = indefinite
  freeForever: { type: Boolean, default: false },
  discount: {
    percent: { type: Number, default: 0 },
    expiresAt: { type: Date },
    reason: { type: String },
  },
  customFeatures: [{ type: String }], // extra features granted by admin
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },

  // Usage tracking
  scansUsed: { type: Number, default: 0 },
  scansLimit: { type: Number, default: 5 },
  buildsUsed: { type: Number, default: 0 },
  buildsLimit: { type: Number, default: 3 },
  fixesApplied: { type: Number, default: 0 },
  generationsUsed: { type: Number, default: 0 },
  githubPushes: { type: Number, default: 0 },
  usageResetAt: { type: Date, default: Date.now },

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

userSchema.methods.isAdmin = function () {
  return ['super-admin', 'co-admin'].includes(this.role);
};

userSchema.methods.isSuperAdmin = function () {
  return this.role === 'super-admin';
};

userSchema.methods.hasPermission = function (perm) {
  if (this.role === 'super-admin') return true;
  return this.permissions?.[perm] === true;
};

// Get limits based on subscription tier
userSchema.methods.getTierLimits = function () {
  const TIER_LIMITS = {
    free:    { scans: 5,    builds: 3,   generations: 1,   fixes: 3,   pushes: 1   },
    starter: { scans: 50,   builds: 25,  generations: 15,  fixes: 20,  pushes: 10  },
    pro:     { scans: 9999, builds: 9999, generations: 100, fixes: 999, pushes: 100 },
    diamond: { scans: 9999, builds: 9999, generations: 9999, fixes: 9999, pushes: 9999 },
  };
  return TIER_LIMITS[this.plan] || TIER_LIMITS.free;
};

// Check and reset usage if a new month has started
userSchema.methods.checkAndResetUsage = async function () {
  const now = new Date();
  const resetAt = this.usageResetAt ? new Date(this.usageResetAt) : new Date(0);
  
  // Reset if different month or different year
  if (now.getMonth() !== resetAt.getMonth() || now.getFullYear() !== resetAt.getFullYear()) {
    this.scansUsed = 0;
    this.buildsUsed = 0;
    this.fixesApplied = 0;
    this.generationsUsed = 0;
    this.githubPushes = 0;
    this.usageResetAt = now;
    
    // Sync limits with plan
    const limits = this.getTierLimits();
    this.scansLimit = limits.scans;
    this.buildsLimit = limits.builds;
    
    await this.save();
    return true; // was reset
  }
  return false;
};

module.exports = mongoose.model('User', userSchema);
