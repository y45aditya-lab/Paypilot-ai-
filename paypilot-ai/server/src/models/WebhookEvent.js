import mongoose from 'mongoose';

// One document per PayPal event id: this is how we ignore duplicate deliveries.
const webhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    eventType: String,
    status: { type: String, enum: ['processing', 'processed', 'ignored', 'failed'], default: 'processing' },
    processingToken: { type: String, default: null },
    error: String,
  },
  { timestamps: true },
);

// Housekeeping: delete records after 90 days
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.model('WebhookEvent', webhookEventSchema);