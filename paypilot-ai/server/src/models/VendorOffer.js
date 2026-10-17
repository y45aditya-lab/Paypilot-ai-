import mongoose from 'mongoose';

const vendorOfferSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    priceCents: { type: Number, required: true, min: 0, validate: Number.isInteger },
    currency: { type: String, required: true, default: 'INR' },
    stockQuantity: { type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

vendorOfferSchema.index({ organization: 1, product: 1, vendor: 1 }, { unique: true });

export default mongoose.model('VendorOffer', vendorOfferSchema);
