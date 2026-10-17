import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  comment: { type: String, maxlength: 1000, default: '' },
  fromStatus: String,
  toStatus: String,
}, { timestamps: true });

const purchaseRequestSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  department: { type: String, required: true, trim: true, maxlength: 80 },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  category: { type: String, required: true, maxlength: 80 },
  productName: { type: String, required: true },
  seats: { type: Number, required: true, min: 1 },
  unitPriceCents: { type: Number, required: true, validate: Number.isSafeInteger },
  justification: { type: String, required: true, maxlength: 1000 },
  estimatedAmountCents: { type: Number, required: true, validate: Number.isSafeInteger },
  currency: { type: String, required: true },
  duplicateWarning: { type: Boolean, default: false },
  duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseRequest' },
  status: {
    type: String,
    enum: ['awaiting_manager', 'awaiting_finance', 'approved', 'rejected', 'changes_requested', 'cancelled', 'paid'],
    required: true,
    default: 'awaiting_manager',
    index: true,
  },
  approvalHistory: { type: [eventSchema], default: [] },
  comments: { type: [eventSchema], default: [] },
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  budgetReservationBudget: { type: mongoose.Schema.Types.ObjectId, ref: 'DepartmentBudget' },
  budgetReservationCents: { type: Number, min: 0, validate: Number.isSafeInteger },
}, { timestamps: true });

purchaseRequestSchema.index({ organization: 1, status: 1, createdAt: -1 });
purchaseRequestSchema.index({ organization: 1, requester: 1, createdAt: -1 });

export default mongoose.model('PurchaseRequest', purchaseRequestSchema);
