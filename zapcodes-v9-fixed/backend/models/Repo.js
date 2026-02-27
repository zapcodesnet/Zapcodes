const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['crash', 'memory_leak', 'anr', 'warning', 'error', 'security', 'performance'], required: true },
  severity: { type: String, enum: ['critical', 'high', 'medium', 'low'], required: true },
  title: { type: String, required: true },
  description: { type: String },
  file: { type: String },
  line: { type: Number },
  code: { type: String },
  fixedCode: { type: String },
  explanation: { type: String },
  impact: { type: String },
  logs: { type: String },
  status: { type: String, enum: ['open', 'fixing', 'fixed', 'dismissed'], default: 'open' },
  prUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const repoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url: { type: String, required: true },
  name: { type: String, required: true },
  owner: { type: String, required: true },
  platform: { type: String, enum: ['react-native', 'flutter', 'swift', 'kotlin', 'java-android', 'web', 'other'], default: 'other' },
  branch: { type: String, default: 'main' },
  engine: { type: String, enum: ['ollama', 'claude-pro'], default: 'ollama' },
  status: { type: String, enum: ['pending', 'scanning', 'scanned', 'error'], default: 'pending' },
  issues: [issueSchema],
  stats: {
    critical: { type: Number, default: 0 },
    high: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    low: { type: Number, default: 0 },
    totalFiles: { type: Number, default: 0 },
    totalLines: { type: Number, default: 0 },
  },
  lastScanned: { type: Date },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Repo', repoSchema);
