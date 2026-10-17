import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    severity: { type: String, enum: ['info', 'medium', 'high'], default: 'info' },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 500 },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    dedupeKey: { type: String, required: true, unique: true },
    readAt: Date,
    emailSentAt: Date,
    emailError: { type: String, maxlength: 200 },
  },
  { timestamps: true },
);

notificationSchema.index({ user:  1, createdAt: -1 });
notificationSchema.index({ organization: 1, user: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
