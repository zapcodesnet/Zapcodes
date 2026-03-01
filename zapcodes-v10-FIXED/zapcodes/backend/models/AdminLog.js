const mongoose = require('mongoose');

const adminLogSchema = new mongoose.Schema({
  // Who performed the action
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorEmail: { type: String, required: true },
  actorRole: { type: String, required: true },

  // What action
  action: {
    type: String, required: true,
    enum: [
      'role_change', 'permission_change', 'user_ban', 'user_suspend', 'user_unban',
      'user_delete', 'user_force_logout', 'password_reset', 'price_override',
      'ai_command', 'ai_response', 'ai_action', '2fa_setup', '2fa_verify',
      'admin_login', 'admin_logout', 'security_flag_ack', 'setting_change',
    ],
  },

  // Target (if applicable)
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  targetEmail: { type: String },

  // Details
  description: { type: String, required: true },
  beforeState: { type: mongoose.Schema.Types.Mixed },
  afterState: { type: mongoose.Schema.Types.Mixed },
  metadata: { type: mongoose.Schema.Types.Mixed },

  // Context
  ip: { type: String },
  userAgent: { type: String },
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },

  timestamp: { type: Date, default: Date.now },
}, {
  timestamps: false,
  // Make immutable — no updates or deletes
  strict: true,
});

// Index for fast queries
adminLogSchema.index({ timestamp: -1 });
adminLogSchema.index({ actor: 1, timestamp: -1 });
adminLogSchema.index({ action: 1, timestamp: -1 });
adminLogSchema.index({ targetUser: 1, timestamp: -1 });

module.exports = mongoose.model('AdminLog', adminLogSchema);
