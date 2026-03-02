const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, required: true },
  tokenEstimate: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now },
});

const chatHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: String, required: true }, // links to a build/project
  projectName: { type: String },
  template: { type: String },
  messages: [messageSchema],
  totalTokens: { type: Number, default: 0 },
  buildCount: { type: Number, default: 0 }, // messages that counted as builds
  forkedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatHistory' },
  summary: { type: String }, // condensed summary when forking
  status: { type: String, enum: ['active', 'completed', 'forked'], default: 'active' },
}, { timestamps: true });

chatHistorySchema.index({ user: 1, projectId: 1 });
chatHistorySchema.index({ user: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model('ChatHistory', chatHistorySchema);
