import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purchaseRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseRequest', unique: true, sparse: true },

    // SNAPSHOT of what was bought, not just a reference. If the catalog price
    // changes next month, this order must still show what the buyer agreed to.
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    category: { type: String, required: true, maxlength: 80 },
    seats: { type: Number, required: true, min: 1 },
    department: { type: String, trim: true, maxlength: 80 },
    unitPriceCents: { type: Number, required: true, validate: Number.isInteger },
    totalCents: { type: Number, required: true, validate: Number.isInteger },
    currency: { type: String, required: true, default: 'INR' },
    captureAttempts: { type: Number, required: true, default: 0, min: 0 },
    reconciliationAttempts: { type: Number, required: true, default: 0, min: 0 },
    reconciliationLeaseUntil: { type: Date, index: true },
    reconciliationLeaseToken: { type: String },

    status: {
  type: String,
  enum: ['pending_approval', 'payment_created', 'capturing', 'paid', 'failed', 'cancelled'],
  default: 'pending_approval',
  index: true,
},

    paypalOrderId: { type: String, index: true, sparse: true }, // filled on Day 4
  },
  { timestamps: true },
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ organization: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, updatedAt: 1 });

export default mongoose.model('Order', orderSchema);