import mongoose from 'mongoose';

const purchaseOrderSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseRequest', required: true, unique: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  category: { type: String, required: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  department: { type: String, required: true },
  unitPriceCents: { type: Number, required: true, validate: Number.isSafeInteger },
  productName: { type: String, required: true },
  seats: { type: Number, required: true },
  amountCents: { type: Number, required: true, validate: Number.isSafeInteger },
  currency: { type: String, required: true },
  poNumber: { type: String, required: true, unique: true },
  status: { type: String, enum: ['approved', 'payment_created', 'paid', 'cancelled'], default: 'approved', index: true },
}, { timestamps: true });

purchaseOrderSchema.index({ organization: 1, createdAt: -1 });

export default mongoose.model('PurchaseOrder', purchaseOrderSchema);
