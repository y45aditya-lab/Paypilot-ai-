import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true, unique: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  category: { type: String, required: true, index: true },
  productName: { type: String, required: true },
  department: { type: String, required: true },
  amountCents: { type: Number, required: true, validate: Number.isSafeInteger },
  currency: { type: String, required: true },
  renewalDate: { type: Date, required: true, index: true },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
}, { timestamps: true });

subscriptionSchema.index({ organization: 1, renewalDate: 1 });

export default mongoose.model('Subscription', subscriptionSchema);
