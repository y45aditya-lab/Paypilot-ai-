import mongoose from 'mongoose';

// One document per VERIFIED money movement. Orders can be retried or cancelled;
// transactions are the permanent record of what PayPal actually confirmed.
const transactionSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    provider: { type: String, default: 'paypal' },
    paypalOrderId: { type: String, required: true },

    // unique + sparse: the DATABASE refuses to record the same capture twice,
    // even if a duplicate request slips past your code (a replay or double-click).
    paypalCaptureId: { type: String, unique: true, sparse: true },
    productName: { type: String, required: true },   // add inside the schema fields
    amountCents: { type: Number, required: true, validate: Number.isInteger },
    currency: { type: String, required: true },
    status: { type: String, enum: ['completed', 'pending', 'failed', 'refunded'], required: true },
    refundStatus: {
      type: String,
      enum: ['not_requested', 'processing', 'pending', 'completed', 'failed', 'review_required'],
      default: 'not_requested',
    },
    refundId: { type: String, sparse: true },
    refundedAt: Date,
    refundReconciliationAttempts: { type: Number, required: true, default: 0, min: 0 },
    refundReconciliationLeaseUntil: { type: Date, index: true },
    refundReconciliationLeaseToken: { type: String },
  },
  { timestamps: true },
);

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ organization: 1, createdAt: -1, status: 1 });
transactionSchema.index({ status: 1, refundStatus: 1, updatedAt: 1 });

export default mongoose.model('Transaction', transactionSchema);