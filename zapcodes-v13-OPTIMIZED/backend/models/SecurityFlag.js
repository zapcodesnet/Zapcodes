const mongoose = require('mongoose');

const securityFlagSchema = new mongoose.Schema({
  type: {
    type: String, required: true,
    enum: ['brute_force', 'injection_attempt', 'rate_limit', 'suspicious_pattern',
           'unauthorized_access', 'data_exfiltration', 'anomalous_traffic', 'other'],
  },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  description: { type: String, required: true },

  // Source
  ip: { type: String },
  geoLocation: {
    country: String,
    city: String,
    region: String,
  },
  userAgent: { type: String },

  // Affected user (if any)
  affectedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  affectedEmail: { type: String },

  // Status
  status: { type: String, enum: ['new', 'acknowledged', 'resolved', 'false_positive'], default: 'new' },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acknowledgedAt: { type: Date },
  resolution: { type: String },

  // AI analysis
  aiAnalysis: { type: String },
  autoAction: { type: String }, // e.g., 'auto-banned', 'rate-limited'

  metadata: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

securityFlagSchema.index({ timestamp: -1 });
securityFlagSchema.index({ severity: 1, status: 1 });
securityFlagSchema.index({ ip: 1 });

module.exports = mongoose.model('SecurityFlag', securityFlagSchema);
