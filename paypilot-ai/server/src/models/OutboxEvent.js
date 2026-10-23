import mongoose from 'mongoose';

const outboxEventSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true },
  eventType: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'processing', 'processed', 'failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  availableAt: { type: Date, default: Date.now, index: true },
  processingToken: { type: String, default: null },
  lastError: { type: String, maxlength: 300 },
  processedAt: Date,
}, { timestamps: true });

outboxEventSchema.index({ status: 1, availableAt: 1, createdAt: 1 });

export default mongoose.model('OutboxEvent', outboxEventSchema);
