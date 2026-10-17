import mongoose from 'mongoose';

const invoiceDocumentSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true, maxlength: 120 },
  mimeType: { type: String, required: true },
  sha256: { type: String, required: true },
  extractedText: { type: String, required: true, maxlength: 30_000 },
  vendor: { type: String, maxlength: 200, default: '' },
  invoiceNumber: { type: String, maxlength: 100, default: '' },
  amountCents: { type: Number, min: 0, validate: Number.isSafeInteger },
  currency: { type: String, maxlength: 3, default: 'INR' },
  dueDate: Date,
  status: { type: String, enum: ['needs_review', 'matched', 'ignored'], default: 'needs_review', index: true },
}, { timestamps: true });

invoiceDocumentSchema.index({ organization: 1, createdAt: -1 });
invoiceDocumentSchema.index({ organization: 1, sha256: 1 });

export default mongoose.model('InvoiceDocument', invoiceDocumentSchema);
